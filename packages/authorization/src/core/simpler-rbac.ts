import { DBRole, RBACAdapter } from "adapters";
import { Policy } from "./policy";
import {
	ModuleConfig,
	AttributeBase,
	AttributeData,
	createModule,
	HierachicalModule,
	User,
} from "./simpler-module";

export interface Role extends AttributeBase {
	level: number;
}

export interface RBACConfig<T extends ReadonlyArray<Role>>
	extends ModuleConfig<
		T,
		| { name: T[number]["name"]; level?: never; key?: never }
		| { level: T[number]["level"]; name?: never; key?: never }
		| { key: T[number]["key"]; name?: never; level?: never }
	> {
	// For the defaultItem, we now use the same pattern of
	// generating a union from T[number]['name'] or T[number]['level']:
	// defaultRole:
	// 	| { name: T[number]["name"]; level?: never; key?: never }
	// 	| { level: T[number]["level"]; name?: never; key?: never }
	// 	| { key: T[number]["key"]; name?: never; level?: never };
}

export interface RBACEnrichedData extends AttributeData {
	role: Role;
}

type UserOptionalRBAC = User & Partial<RBACEnrichedData>;

type RbacPolicies<T extends ReadonlyArray<Role>> = {
	exact: Policy<UserOptionalRBAC, ExtendedSelectRole<T>>;
	min: Policy<UserOptionalRBAC, ExtendedSelectRole<T>>;
	max: Policy<UserOptionalRBAC, ExtendedSelectRole<T>>;
};

export interface RBACModule<T extends ReadonlyArray<Role>>
	extends HierachicalModule<RbacPolicies<T>, RBACEnrichedData> {
	updateUserRole: (
		userId: string,
		select: ExtendedSelectRole<T>
	) => Promise<void>;
	updateUserRoleById: (userId: string, roleId: string) => Promise<void>;
	assignRole: (
		userId: string,
		select: ExtendedSelectRole<T>
	) => Promise<void>;
	enrichUser: (user: User) => Promise<User & RBACEnrichedData>;
	getUserRole: (user: User) => Promise<RBACEnrichedData>;
	getRoles: () => Promise<DBRole[]>;
}

/**
 * This is generic. We only finalize it when we pass a specific T extends ReadonlyArray<Role>
 */
export type ExtendedSelectRole<T extends ReadonlyArray<Role>> =
	| { name: T[number]["name"]; level?: never; key?: never }
	| { level: T[number]["level"]; name?: never; key?: never }
	| { key: T[number]["key"]; name?: never; level?: never };

// export interface RBACModule extends HierachicalModule<AttributeData> {
// 	updateUserRole: (userId: string, select) => Promise<void>;
// 	createUserRole: (userId: string, select) => Promise<void>;
// 	enrichUser: (user: User) => Promise<User & RBACEnrichedData>;
// }

export const rbacModule = <T extends ReadonlyArray<Role>>(
	db: RBACAdapter,
	config: RBACConfig<T>
): RBACModule<T> => {
	// ❸ Derive *dynamic* unions for name & level from T
	type RoleNameUnion = T[number]["name"]; // e.g. "Guest" | "User" | ...
	type RoleLevelUnion = T[number]["level"]; // e.g. 0 | 1 | 2 | 3 | ...
	type RoleKeyUnion = T[number]["key"]; // e.g. "guest" | "user" | ...

	// // ❹ Create a specialized "SelectRole" type *just for this config*
	// type ExtendedSelectRole =
	// 	| { name: RoleNameUnion; level?: never; key?: never }
	// 	| { level: RoleLevelUnion; name?: never; key?: never }
	// 	| { key: RoleKeyUnion; name?: never; level?: never };

	const getUserRole = async (user: User) => {
		const role = await db.getUserRole(user.id);
		console.log("ROLES IN GETITEMS FOR USER", role);
		return { role };
	};

	const findItemInConfig = (select: ExtendedSelectRole<T>): Role | null => {
		if ("name" in select) {
			// Look up by name
			return config.items.find((r) => r.name === select.name) ?? null;
		} else if ("level" in select) {
			// Look up by level
			return config.items.find((r) => r.level === select.level) ?? null;
		} else {
			// Look up by key
			return config.items.find((r) => r.key === select.key) ?? null;
		}
	};

	const exact: RbacPolicies<T>["exact"] = (
		user: { id: string } & RBACEnrichedData,
		role: ExtendedSelectRole<T>
	) => {
		const foundRole = findItemInConfig(role);
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

		// // TODO: decide if we want this fallback or not
		// return user.roles?.some((r) => r.name === foundRole.name) ?? false;
		return user.role.key === foundRole.key;
	};

	const min: RbacPolicies<T>["min"] = (user, role) => {
		const foundRole = findItemInConfig(role);
		if (!foundRole) {
			throw new Error(`Invalid role: ${JSON.stringify(role)}`);
		}

		// return user.roles.some((r) => r.level >= foundRole.level);
		return user.role.level >= foundRole.level;
	};

	const max: RbacPolicies<T>["max"] = (user, role) => {
		const foundRole = findItemInConfig(role);
		if (!foundRole) {
			throw new Error(`Invalid role: ${JSON.stringify(role)}`);
		}

		// return user.roles.some((r) => r.level <= foundRole.level);
		return user.role.level <= foundRole.level;
	};

	const assignRole = async (
		userId: string,
		select: ExtendedSelectRole<T> = config.defaultAssignment
	) => {
		// check select is in role config
		const foundRole = findItemInConfig(select);
		if (!foundRole) {
			throw new Error(`Invalid role: ${JSON.stringify(select)}`);
		}

		return await db.assignRole(userId, foundRole);
	};

	const policies = { exact, min, max };

	return {
		name: "rbac",
		hierarchical: true,
		policies,
		enrichUser: async (user: User) => {
			// console.log("GETTING INTO ENRICH USER");
			const role = await getUserRole(user);
			return { ...user, ...role };
		},
		getAuthzData: async (userId: string) => {
			const role = await getUserRole({ id: userId });
			return { ...role };
		},
		init: async () => {
			await db.seed([...config.items]);
		},
		getUserRole,
		getRoles: db.getRoles,
		updateUserRole: async (
			userId: string,
			select?: ExtendedSelectRole<T>
		): Promise<void> => {
			if (!select) {
				select = config.defaultAssignment;
			}
			// check select is in role config
			const foundRole = findItemInConfig(select);
			if (!foundRole) {
				throw new Error(`Invalid role: ${JSON.stringify(select)}`);
			}

			const role = await db.getRole(foundRole.name);
			if (!role) {
				throw new Error(`Role ${foundRole.name} does not exist`);
			}

			return db.updateUserRole(userId, role);
		},
		updateUserRoleById: async (userId: string, roleId: string) => {
			const role = await db.getRoleById(roleId);
			if (!role) {
				throw new Error(`Role ${roleId} does not exist`);
			}

			return db.updateUserRoleById(userId, roleId);
		},
		assignRole,
		onUserCreated: async (user: User) => {
			await assignRole(user.id, config.defaultAssignment);
		},
		onUserDeleted: async (user: User) => {
			await db.deleteUserRoles(user.id);
		},
	};
};

/**
 * These types are for if we decide to add optional multiple roles per user
 */
type EnrichedUserSingleRole = User & { role: Role };
type EnrichedUserMultiRole = User & { roles: Role[] };

type EnrichedUser<Config extends { multipleRoles: boolean }> =
	Config["multipleRoles"] extends true
		? EnrichedUserMultiRole
		: EnrichedUserSingleRole;
