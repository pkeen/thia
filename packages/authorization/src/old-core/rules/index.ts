import { User, Resource, Role, Rule, Policy } from "../types";

export const createRule = <Context>(rule: Rule<Context>): Rule<Context> => rule;

// Utility for creating policies
export const createPolicy = <Context>(
	rules: Rule<Context>[]
): Policy<Context> => ({
	rules,
	evaluate: (context: Context) => rules.every((rule) => rule(context)),
});

// Some rule defaults
export const isOwner = createRule<{ user: User; resource: Resource }>(
	({ user, resource }) => user.id === resource.ownerId
);

export const hasRole = (role: string) =>
	createRule<{ user: User }>(({ user }) => user.roles.includes(role));

// Example Policy
export const canEditPost = createPolicy<{ user: User; resource: Resource }>([
	isOwner,
	hasRole("editor"),
]);

export const isAdmin = createRule<{ user: User }>(({ user }) =>
	user.roles.includes("admin")
);

export const isPublished = createRule<{ resource: Resource }>(
	({ resource }) => resource.status === "published"
);

// Example Rules
// export const isOwner: Rule<{ user: User; resource: Resource }> = {
//   eval: ({ user, resource }) => user.id === resource.ownerId,
// };

// const hasRole = (user: User, role: Role): boolean => {
// 	return role in user.role;
// };

// export class Rule implements Rule {
// 	constructor(evaluator: () => boolean) {
// 		this.eval = evaluator;
// 	}

// 	eval(user: User, resource: Resource, context: {}) {
// 		return this.eval(user, resource, context);
// 	}
// }

// export class Policy implements Policy {
