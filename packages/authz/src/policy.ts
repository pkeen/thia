/**
 * The single abstraction everything else is built on: a question about whether
 * `subject` may act on `resource`.
 *
 * Implementations ignore the parameters they don't need, so a role check and an
 * ownership check have the same shape and compose with the same combinators:
 *
 *   const isAdmin:  Policy<Subject>       = (u) => u.roles.includes("admin");
 *   const ownsPost: Policy<Subject, Post> = (u, post) => post.authorId === u.id;
 */
export type Policy<S, R = undefined> = (
	subject: S,
	resource: R
) => boolean | Promise<boolean>;

/** Always permits. Useful as a default or placeholder. */
export const allow =
	<S, R = undefined>(): Policy<S, R> =>
	() =>
		true;

/** Always denies. Useful for temporarily disabling an action. */
export const deny =
	<S, R = undefined>(): Policy<S, R> =>
	() =>
		false;

/**
 * Permits only if every policy permits. Short-circuits on the first denial, so
 * expensive policies (DB lookups) can be ordered after cheap ones.
 *
 * `and()` with no policies permits — there is nothing to object.
 */
export const and =
	<S, R = undefined>(...policies: Policy<S, R>[]): Policy<S, R> =>
	async (subject, resource) => {
		for (const policy of policies) {
			if (!(await policy(subject, resource))) return false;
		}
		return true;
	};

/**
 * Permits if any policy permits. Short-circuits on the first approval.
 *
 * `or()` with no policies denies — nothing has vouched for the subject.
 */
export const or =
	<S, R = undefined>(...policies: Policy<S, R>[]): Policy<S, R> =>
	async (subject, resource) => {
		for (const policy of policies) {
			if (await policy(subject, resource)) return true;
		}
		return false;
	};

/** Inverts a policy. */
export const not =
	<S, R = undefined>(policy: Policy<S, R>): Policy<S, R> =>
	async (subject, resource) =>
		!(await policy(subject, resource));
