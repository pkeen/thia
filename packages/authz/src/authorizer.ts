import type { Policy } from "./policy";
import { ForbiddenError } from "./errors";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A set of named actions, each guarded by one policy. */
export type PolicyMap = Record<string, Policy<any, any>>;

/**
 * The subject type an authorizer accepts, inferred from its policies. Inferring
 * across the union of policies yields the intersection of their subject types:
 * a subject has to satisfy every policy it might be checked against.
 */
export type SubjectOf<P extends PolicyMap> =
	P[keyof P] extends Policy<infer S, any> ? S : never;

/** The resource type a given policy expects. */
type ResourceOf<P> = P extends Policy<any, infer R> ? R : never;

/**
 * `[]` for policies that take no resource, `[resource]` for those that do - so
 * `can(user, "post.read")` and `can(user, "post.delete", post)` are each only
 * valid with the right arguments for that action.
 */
type ResourceArgs<P> = ResourceOf<P> extends undefined
	? []
	: [resource: ResourceOf<P>];

export interface Authorizer<P extends PolicyMap> {
	/** Whether the subject may perform the action. Use for UI conditionals. */
	can<K extends keyof P & string>(
		subject: SubjectOf<P>,
		action: K,
		...resource: ResourceArgs<P[K]>
	): Promise<boolean>;

	/** Throws {@link ForbiddenError} if denied. Use for route/handler guards. */
	assert<K extends keyof P & string>(
		subject: SubjectOf<P>,
		action: K,
		...resource: ResourceArgs<P[K]>
	): Promise<void>;

	/** Every registered action name. */
	actions(): (keyof P & string)[];
}

/**
 * Binds action names to policies.
 *
 * An unregistered action throws rather than denying: a typo is a programming
 * error, and silently returning `false` would hide it behind what looks like a
 * legitimate permission denial.
 */
export function createAuthorizer<P extends PolicyMap>(
	policies: P
): Authorizer<P> {
	async function can<K extends keyof P & string>(
		subject: SubjectOf<P>,
		action: K,
		...resource: ResourceArgs<P[K]>
	): Promise<boolean> {
		const policy = policies[action];
		if (!policy) throw new Error(`Unknown action: ${action}`);
		return Boolean(await policy(subject, resource[0]));
	}

	return {
		can,
		async assert<K extends keyof P & string>(
			subject: SubjectOf<P>,
			action: K,
			...resource: ResourceArgs<P[K]>
		): Promise<void> {
			if (!(await can(subject, action, ...resource))) {
				throw new ForbiddenError(action);
			}
		},
		actions: () => Object.keys(policies) as (keyof P & string)[],
	};
}
