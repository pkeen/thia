import { RoleHierarchy } from "./index.types";
import {
	RBACConfig,
	Role,
	RoleConfigEntry,
	RolesAndPermissions,
	SelectRole,
} from "./index.types";
// import type { Authz } from "./index.types";
import type { Policy } from "../policy";
import type { RolesDBAdapter } from "./db/drizzle-pg";

// // These shouldnt be needed soon
// type DefaultSchema = typeof defaultSchema;

// type DrizzleDatabase =
// 	// | NodePgDatabase
// 	PgDatabase<PgQueryResultHKT, any> | NeonHttpDatabase;

// const toDBId = (id: string): number => parseInt(id, 10);

interface User {
	id: string;
}

interface UserWithRoles {
	id: string;
	/** An array of roles associated with the user */
	roles: Role[];
}

export const RBAC = <T extends ReadonlyArray<RoleConfigEntry>>(
	db: RolesDBAdapter,
	config: RBACConfig<T>
) => {
	// ❸ Derive *dynamic* unions for name & level from T
	type RoleNameUnion = T[number]["name"]; // e.g. "Guest" | "User" | ...
	type RoleLevelUnion = T[number]["level"]; // e.g. 0 | 1 | 2 | 3 | ...

	// ❹ Create a specialized "SelectRole" type *just for this config*
	type ExtendedSelectRole =
		| { name: RoleNameUnion; level?: never }
		| { level: RoleLevelUnion; name?: never };

	const getRoles = async (userId: string) => {
		return await db.getUserRoles(userId);
	};

	const findRoleInConfig = (select: ExtendedSelectRole): Role | null => {
		if ("name" in select) {
			// Look up by name
			return config.roles.find((r) => r.name === select.name) ?? null;
		} else {
			// Look up by level
			return config.roles.find((r) => r.level === select.level) ?? null;
		}
	};

	const exactRole: Policy = (
		user: { id: string; roles: Role[] },
		role: ExtendedSelectRole
	) => {
		const foundRole = findRoleInConfig(role);
		if (!foundRole) {
			throw new Error(`Invalid role: ${JSON.stringify(role)}`);
		}
		// ISSUE: in a jwt strategy yes the user object contains roles, but in a session strategy no
		// but also perhaps by providing that callback for getUserRoles() etc we could achieve the same
		// OR we could have a db check fall back
		// if (!user.roles) {
		//     user.roles = await getRoles(user.id);
		// }
		// perhaps this useDB? option should be handled in the config?

		// TODO: decide if we want this fallback or not
		return user.roles.some((r) => r.name === foundRole.name);
	};

	const minRole: Policy<{ id: string; roles: Role[] }, ExtendedSelectRole> = (
		user: { id: string; roles: Role[] },
		role: ExtendedSelectRole
	) => {
		const foundRole = findRoleInConfig(role);
		if (!foundRole) {
			throw new Error(`Invalid role: ${JSON.stringify(role)}`);
		}

		return user.roles.some((r) => r.level >= foundRole.level);
	};

	const maxRole: Policy = (
		user: { id: string; roles: Role[] },
		role: ExtendedSelectRole
	) => {
		const foundRole = findRoleInConfig(role);
		if (!foundRole) {
			throw new Error(`Invalid role: ${JSON.stringify(role)}`);
		}

		return user.roles.some((r) => r.level <= foundRole.level);
	};

	return {
		name: "rbac",
		seed: async () => {
			await db.seed([...config.roles]);
			// The array spreading is because it is a readonly type made mutable
		},
		policies: {
			exactRole,
			minRole,
			maxRole,
		},
		getRoles,
		// addRolesToUser: async (user: User): Promise<UserWithRoles> => {
		// 	const roles = await getRoles(user.id);
		// 	console.log("roles: ", roles);
		// 	return {
		// 		...user,
		// 		roles,
		// 	};
		// },
		// ISSUE: should perhaps be called enrichUser to make more sense in the db session strategy
		enrichToken: async (userId: string): Promise<{ roles: Role[] }> => {
			const roles = await getRoles(userId);
			console.log("roles: ", roles);
			return {
				roles,
			};
		},
		updateUserRole: async (
			userId: string,
			select?: ExtendedSelectRole
		): Promise<void> => {
			if (!select) {
				select = config.defaultRole;
			}
			// check select is in role config
			const foundRole = findRoleInConfig(select);
			if (!foundRole) {
				throw new Error(`Invalid role: ${JSON.stringify(select)}`);
			}

			return db.updateUserRoles(userId, [foundRole]);

			// update user's role

			// if (select.name) {
			// 	const [role] = await db
			// 		.select({ id: schema.rolesTable.id })
			// 		.from(schema.rolesTable)
			// 		.where(eq(schema.rolesTable.name, select.name));

			// 	if (!role) {
			// 		throw new Error(`Role ${select.name} does not exist`);
			// 	}

			// 	//update user's role
			// 	await db
			// 		.update(schema.userRolesTable)
			// 		.set({ roleId: role.id })
			// 		.where(eq(schema.userRolesTable.userId, userId));
			// } else if (select.level) {
			// 	const [role] = await db
			// 		.select({ id: schema.rolesTable.id })
			// 		.from(schema.rolesTable)
			// 		.where(eq(schema.rolesTable.level, select.level));

			// 	if (!role) {
			// 		throw new Error(
			// 			`Role with level ${select.level} does not exist`
			// 		);
			// 	}

			// 	//update user's role
			// 	await db
			// 		.update(schema.userRolesTable)
			// 		.set({ roleId: role.id })
			// 		.where(eq(schema.userRolesTable.userId, userId));
			// } else {
			// 	throw new Error(`Invalid role: ${select}`);
			// }
		},
		createUserRole: async (userId: string, select: ExtendedSelectRole) => {
			if (!select) {
				select = config.defaultRole;
			}
			// check select is in role config
			const foundRole = findRoleInConfig(select);
			if (!foundRole) {
				throw new Error(`Invalid role: ${JSON.stringify(select)}`);
			}

			return await db.createUserRoles(userId, [foundRole]);
		},
		// createUserRole: async (
		// 	userId: string,
		// 	select?: ExtendedSelectRole
		// ): Promise<void> => {
		// 	console.log("creating user role");
		// 	if (!select) {
		// 		select = config.defaultRole;
		// 	}

		// 	console.log(select);

		// 	if (select.name) {
		// 		const [role] = await db
		// 			.select({ id: schema.rolesTable.id })
		// 			.from(schema.rolesTable)
		// 			.where(eq(schema.rolesTable.name, select.name));

		// 		if (!role) {
		// 			throw new Error(`Role ${select.name} does not exist`);
		// 		}

		// 		// add user's role
		// 		await db
		// 			.insert(schema.userRolesTable)
		// 			.values({ userId, roleId: role.id });
		// 	} else if (select.level) {
		// 		const [roleId] = await db
		// 			.select({ id: schema.rolesTable.id })
		// 			.from(schema.rolesTable)
		// 			.where(eq(schema.rolesTable.level, select.level));

		// 		if (!roleId) {
		// 			throw new Error(
		// 				`Role with level ${select.level} does not exist`
		// 			);
		// 		}

		// 		// add user's role
		// 		await db
		// 			.insert(schema.userRolesTable)
		// 			.values({ userId, roleId: roleId.id });
		// 	} else {
		// 		throw new Error(`Invalid role: ${select}`);
		// 	}
		// },
		/**
		 * Check if a user has (at least) the required role
		 * based on numeric "level".
		 * If you want an exact match on name, adjust accordingly.
		 */
		// async dbUserHasRequiredRole(
		// 	userId: string,
		// 	required: ExtendedSelectRole
		// ): Promise<boolean> {
		// 	// 1. Find the required role in the config
		// 	const requiredRoleDef = findRoleInConfig(required);
		// 	if (!requiredRoleDef) {
		// 		throw new Error(
		// 			`Invalid required role: ${JSON.stringify(required)}`
		// 		);
		// 	}

		// 	// 2. Lookup the user’s current role in DB (including level)
		// 	// For example, if "userRolesTable" -> "rolesTable" is a simple pivot
		// 	const row = await db
		// 		.select({
		// 			roleId: schema.rolesTable.id,
		// 			roleName: schema.rolesTable.name,
		// 			roleLevel: schema.rolesTable.level, // if your table has "level"
		// 		})
		// 		.from(schema.rolesTable)
		// 		.innerJoin(
		// 			schema.userRolesTable,
		// 			eq(schema.userRolesTable.roleId, schema.rolesTable.id)
		// 		)
		// 		.where(eq(schema.userRolesTable.userId, userId))
		// 		.limit(1);

		// 	// If user has no role record, block
		// 	if (!row[0]) return false;

		// 	const userRoleLevel = row[0].roleLevel;

		// 	// 3. Compare levels (assuming a linear approach)
		// 	return userRoleLevel >= requiredRoleDef.level;
		// },
		/**
		 * Check if a user has (at least) the required role jwt
		 * based on numeric "level".
		 */
		// async jwtUserHasRequiredRole(
		// 	user: UserWithRoles,
		// 	required: ExtendedSelectRole
		// ): Promise<boolean> {
		// 	// 1. Find the required role in the config
		// 	const requiredRoleDef = findRoleInConfig(required);
		// 	if (!requiredRoleDef) {
		// 		throw new Error(
		// 			`Invalid required role: ${JSON.stringify(required)}`
		// 		);
		// 	}
		// 	// 3. Compare levels (assuming a linear approach)
		// 	return user.roles.some(
		// 		(role) => role.level >= requiredRoleDef.level
		// 	);
		// },
	};
};

export interface RBAC {
	name: string;
	seed: (roles: RoleConfigEntry[]) => Promise<void>;
	getRoles: (userId: string) => Promise<Role[]>;
	addRolesToUser: (user: User) => Promise<UserWithRoles>;
	updateUserRole: (userId: string, role?: SelectRole) => Promise<void>;
	createUserRole: (userId: string, role?: SelectRole) => Promise<void>;
	enrichToken: (userId: string) => Promise<{ roles: Role[] }>;
}

interface authz {
	roles: Role[];
}

/**
 * Default role hierarchy
 */
// export const defaultRoleHierarchy: RoleHierarchy = [
// 	{
// 		name: "Guest",
// 		level: 0,
// 		// permissions: ["read:public"],
// 	},
// 	{
// 		name: "User",
// 		level: 1,
// 		// inherits: ["guest"],
// 		// permissions: ["read:own_profile"],
// 	},
// 	{
// 		name: "Editor",
// 		level: 2,
// 		// inherits: ["user"],
// 		// permissions: ["edit:posts", "delete:own_posts"],
// 	},
// 	{
// 		name: "Admin",
// 		level: 3,
// 		// inherits: ["editor"],
// 		// permissions: ["manage:users", "delete:any_post"],
// 	},
// 	{
// 		name: "Super Admin",
// 		level: 4,
// 		// inherits: ["admin"],
// 		// permissions: ["manage:system"],
// 	},
// ];
// 	guest: {
// 		name: "Guest",
// 		level: 0,
// 		// permissions: ["read:public"],
// 	},
// 	user: {
// 		name: "User",
// 		level: 1,
// 		// inherits: ["guest"],
// 		// permissions: ["read:own_profile"],
// 	},
// 	editor: {
// 		name: "Editor",
// 		level: 2,
// 		// inherits: ["user"],
// 		// permissions: ["edit:posts", "delete:own_posts"],
// 	},
// 	admin: {
// 		name: "Admin",
// 		level: 3,
// 		// inherits: ["editor"],
// 		// permissions: ["manage:users", "delete:any_post"],
// 	},
// 	superAdmin: {
// 		name: "Super Admin",
// 		level: 4,
// 		// inherits: ["admin"],
// 		// permissions: ["manage:system"],
// 	},
// };

export * as schema from "./db/schema";
export { DrizzlePGAdapter as RolesDrizzlePGAdapter } from "./db/drizzle-pg";
export { RoleHierarchy };
