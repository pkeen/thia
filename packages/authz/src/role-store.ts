/**
 * Where role *assignments* live - which user has which role.
 *
 * Role *definitions* (what each role may do) stay in code, in the map given to
 * {@link createRbac}, so they're reviewed and tested like any other logic and
 * validated at startup. Only assignments are data.
 *
 * Implementations are free to cache; the built-in Postgres one doesn't, so a
 * revoked role takes effect on the next request.
 */
export interface RoleStore {
	/** The roles assigned to a user. Empty when the user has none. */
	getRoles(userId: string): Promise<string[]>;

	/** Grants a role. Assigning a role the user already has changes nothing. */
	assign(userId: string, role: string): Promise<void>;

	/** Removes a role. Removing one the user doesn't have changes nothing. */
	revoke(userId: string, role: string): Promise<void>;
}

/** Non-persistent store for tests and local development. */
export class InMemoryRoleStore implements RoleStore {
	private roles = new Map<string, Set<string>>();

	constructor(initial: Record<string, string[]> = {}) {
		for (const [userId, roles] of Object.entries(initial)) {
			this.roles.set(userId, new Set(roles));
		}
	}

	async getRoles(userId: string): Promise<string[]> {
		return [...(this.roles.get(userId) ?? [])];
	}

	async assign(userId: string, role: string): Promise<void> {
		const existing = this.roles.get(userId);
		if (existing) existing.add(role);
		else this.roles.set(userId, new Set([role]));
	}

	async revoke(userId: string, role: string): Promise<void> {
		this.roles.get(userId)?.delete(role);
	}
}
