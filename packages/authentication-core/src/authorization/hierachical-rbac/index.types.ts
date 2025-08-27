/**
 * Call back for roles and permissions to be stored in session
 * should return the roles and/or permissions to be stored in session
 */
export type SessionCallback = (userId: string) => RolesAndPermissions;

export type RolesAndPermissions = {
	roles?: Role[]; // lets keep it simple as roles for now
	// permissions?: string[];
};

export interface Role {
	id: string;
	name: string;
	level: number;
	// inherits?: string[];
	// permissions?: string[];
}

export interface RoleConfigEntry {
	name: string;
	level: number;
	// any other fields you want config-based roles to have
}

export type RoleHierarchy = RoleConfigEntry[];

export type SelectRole =
	| { name: string; level?: never }
	| { level: number; name?: never };

// SOme typscript stuff that allows the type to be inferred from RolesConfig
// ❶ Make RBACConfig generic in T, a *readonly* array of RoleConfigEntry
export type RBACConfig<T extends ReadonlyArray<RoleConfigEntry>> = {
	roles: T;

	// For the defaultRole, we now use the same pattern of
	// generating a union from T[number]['name'] or T[number]['level']:
	defaultRole:
		| { name: T[number]["name"]; level?: never }
		| { level: T[number]["level"]; name?: never };
};

// Define the type for the extra authz data
export interface AuthzData {
	roles?: string[]; // Could be an array of role names
	permissions?: string[]; // Optional permissions array
}
