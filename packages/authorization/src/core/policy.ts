export type Policy<User = any, Context = any> = (
	user: User,
	context?: Context
) => boolean | Promise<boolean>;

// Simple composition
export function and<U, C>(...policies: Policy<U, C>[]): Policy<U, C> {
	return async (user, context) => {
		for (const p of policies) {
			if (!(await p(user, context))) return false;
		}
		return true;
	};
}

export function or<U, C>(...policies: Policy<U, C>[]): Policy<U, C> {
	return async (user, context) => {
		for (const p of policies) {
			if (await p(user, context)) return true;
		}
		return false;
	};
}

export function not<U, C>(policy: Policy<U, C>): Policy<U, C> {
	return async (user, context) => {
		return !(await policy(user, context));
	};
}

const isOwner: Policy = (
	user: { id: string },
	resource: { ownerId: string }
) => {
	return user.id === resource.ownerId;
};
