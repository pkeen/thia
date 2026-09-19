import type { Policy } from "./policy";

/** A permission string, e.g. `"post.read"`. May contain `*` wildcards. */
export type Permission = string;

export type RoleDefinition = {
	permissions?: Permission[];
	/** Roles whose permissions this role also gets. */
	inherits?: string[];
};

/**
 * Roles mapped to what they may do. A bare array is shorthand for
 * `{ permissions: [...] }`:
 *
 *   {
 *     viewer: ["post.read"],
 *     editor: { inherits: ["viewer"], permissions: ["post.write"] },
 *     admin:  { inherits: ["editor"], permissions: ["post.delete", "user.*"] },
 *   }
 */
export type RoleMap = Record<string, Permission[] | RoleDefinition>;

export interface RbacOptions<S> {
	/** How to read roles off a subject. Defaults to `subject.roles`. */
	getRoles?: (subject: S) => string[];
}

export interface Rbac<S> {
	/** Every permission these roles grant, with inheritance resolved. */
	permissionsFor(roleNames: string[]): Set<Permission>;
	/** Whether these roles grant `permission`, honouring wildcards. */
	hasPermission(roleNames: string[], permission: Permission): boolean;
	/** A policy requiring `permission` - plugs into `createAuthorizer`. */
	can(permission: Permission): Policy<S>;
	/** Every configured role name. */
	roles(): string[];
}

const toDefinition = (
	value: Permission[] | RoleDefinition
): RoleDefinition => (Array.isArray(value) ? { permissions: value } : value);

/**
 * Whether a granted permission covers a requested one.
 *
 * `*` matches exactly one segment, except as the final segment where it matches
 * all remaining ones: `user.*` grants `user.ban` but not bare `user`, and `*`
 * grants everything.
 */
export function permissionMatches(
	granted: Permission,
	requested: Permission
): boolean {
	if (granted === requested) return true;

	const g = granted.split(".");
	const r = requested.split(".");

	for (let i = 0; i < g.length; i++) {
		if (g[i] === "*") {
			if (i === g.length - 1) return r.length > i;
			if (i >= r.length) return false;
			continue;
		}
		if (g[i] !== r[i]) return false;
	}

	return g.length === r.length;
}

/**
 * Flattens inheritance once, up front, so lookups are plain set reads.
 *
 * Cycles and references to undefined roles throw here rather than at request
 * time - a broken role map is a configuration bug and should fail on startup.
 */
function resolvePermissions(roleMap: RoleMap): Map<string, Set<Permission>> {
	const definitions = new Map<string, RoleDefinition>();
	for (const [name, value] of Object.entries(roleMap)) {
		definitions.set(name, toDefinition(value));
	}

	const resolved = new Map<string, Set<Permission>>();
	const visiting = new Set<string>();

	const visit = (name: string, trail: string[]): Set<Permission> => {
		const cached = resolved.get(name);
		if (cached) return cached;

		if (visiting.has(name)) {
			throw new Error(
				`Role inheritance cycle: ${[...trail, name].join(" -> ")}`
			);
		}

		const definition = definitions.get(name);
		if (!definition) {
			throw new Error(
				`Role "${name}" is inherited by "${trail[trail.length - 1]}" but is not defined`
			);
		}

		visiting.add(name);
		const permissions = new Set<Permission>(definition.permissions ?? []);
		for (const parent of definition.inherits ?? []) {
			for (const permission of visit(parent, [...trail, name])) {
				permissions.add(permission);
			}
		}
		visiting.delete(name);

		resolved.set(name, permissions);
		return permissions;
	};

	for (const name of definitions.keys()) visit(name, []);
	return resolved;
}

/**
 * The built-in role-based policy provider. RBAC is deliberately just one way to
 * produce a `Policy` - anything else (ownership, attributes, custom logic) is
 * written as a plain policy function and composed the same way.
 */
export function createRbac<S = { roles: string[] }>(
	roleMap: RoleMap,
	options: RbacOptions<S> = {}
): Rbac<S> {
	const resolved = resolvePermissions(roleMap);

	const getRoles =
		options.getRoles ??
		((subject: S) => (subject as { roles?: string[] })?.roles ?? []);

	const permissionsFor = (roleNames: string[]): Set<Permission> => {
		const permissions = new Set<Permission>();
		for (const name of roleNames) {
			const granted = resolved.get(name);
			// A role on a subject that isn't in the map is ignored rather than
			// fatal: subject roles come from data (a token or DB row) that can
			// outlive a config change, and ignoring one fails closed.
			if (!granted) continue;
			for (const permission of granted) permissions.add(permission);
		}
		return permissions;
	};

	const hasPermission = (
		roleNames: string[],
		permission: Permission
	): boolean => {
		for (const granted of permissionsFor(roleNames)) {
			if (permissionMatches(granted, permission)) return true;
		}
		return false;
	};

	return {
		permissionsFor,
		hasPermission,
		can:
			(permission: Permission): Policy<S> =>
			(subject) =>
				hasPermission(getRoles(subject), permission),
		roles: () => [...resolved.keys()],
	};
}
