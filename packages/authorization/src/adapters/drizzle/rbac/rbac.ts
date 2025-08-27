// import * as defaultSchema from "./schema";
import type { RBACSchema as DefaultSchema } from "./schema";
import { createSchema } from "./schema";
import { PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { Role } from "../../../core/simpler-rbac";

/**
 * Ive got to single role per user for now
 */

export interface DBRole extends Role {
	id: string;
}

// type DefaultSchema = typeof defaultSchema;
type DrizzleDatabase = PgDatabase<PgQueryResultHKT, any> | NeonHttpDatabase;

const defaultSchema = createSchema("rbac_schema");

export const RBACAdapter = (
	db: DrizzleDatabase,
	schema: DefaultSchema = defaultSchema
): RBACAdapter => {
	const getRole = async (key: string): Promise<DBRole> => {
		const [role] = await db
			.select()
			.from(schema.rolesTable)
			.where(eq(schema.rolesTable.key, key));
		return role ?? null;
	};

	const getRoles = async () => {
		const roles = await db.select().from(schema.rolesTable);
		return roles;
	};

	return {
		getRole,
		getRoles,
		seed: async (roles: Role[]) => {
			await db
				.insert(schema.rolesTable)
				// The key is this: wrap in [... ] to create a new (mutable) array.
				.values([...roles])
				.onConflictDoNothing();
		},
		getUserRole: async (userId: string) => {
			// Drizzle returns an array of joined rows.
			// We'll select specific columns from `rolesTable` so it's typed more cleanly.
			const rows = await db
				.select({
					roleKey: schema.rolesTable.key,
					roleName: schema.rolesTable.name,
					roleLevel: schema.rolesTable.level,
				})
				.from(schema.rolesTable)
				.innerJoin(
					schema.userRolesTable,
					eq(schema.userRolesTable.roleId, schema.rolesTable.id)
				)
				.where(eq(schema.userRolesTable.userId, userId));

			// Transform to your "Role" type
			const roles: Omit<DBRole, "id">[] = rows.map((row) => ({
				key: row.roleKey,
				name: row.roleName,
				level: row.roleLevel,
			}));

			return roles[0] ?? null;
		},
		getRoleById: async (id: string) => {
			const [role] = await db
				.select()
				.from(schema.rolesTable)
				.where(eq(schema.rolesTable.id, id));
			return role ?? null;
		},
		// updateUserRoles: async (userId: string, roles: Role[]) => {
		// 	//update user's role
		// 	// TODO: check if works

		// 	await db
		// 		.update(schema.userRolesTable)
		// 		.set({ roleId: roles[0].id })
		// 		.where(eq(schema.userRolesTable.userId, userId));
		// },
		// createUserRoles: async (userId: string, roles: Role[]) => {
		// 	await db.insert(schema.userRolesTable).values(
		// 		roles.map((role) => ({
		// 			userId,
		// 			roleId: role.id,
		// 		}))
		// 	);
		// },

		assignRole: async (userId: string, role: Role) => {
			const dbRole = await getRole(role.key);

			await db
				.insert(schema.userRolesTable)
				.values({ userId, roleId: dbRole.id });
		},
		updateUserRole: async (userId: string, role: Role) => {
			const dbRole = await getRole(role.key);
			if (!dbRole) return;

			await db
				.update(schema.userRolesTable)
				.set({ roleId: dbRole.id })
				.where(eq(schema.userRolesTable.userId, userId));
		},
		updateUserRoleById: async (userId: string, roleId: string) => {
			await db
				.update(schema.userRolesTable)
				.set({ roleId })
				.where(eq(schema.userRolesTable.userId, userId));
		},
		deleteUserRoles: async (userId: string) => {
			await db
				.delete(schema.userRolesTable)
				.where(eq(schema.userRolesTable.userId, userId));
		},
	};
};

export interface RBACAdapter {
	seed: (roles: Role[]) => Promise<void>;
	getUserRole: (userId: string) => Promise<Role>;
	// createUserRoles: (userId: string, roles: Role[]) => Promise<void>;
	updateUserRole: (userId: string, role: Role) => Promise<void>;
	updateUserRoleById: (userId: string, roleId: string) => Promise<void>;
	deleteUserRoles: (userId: string) => Promise<void>;
	getRole: (key: string) => Promise<Role | null>;
	assignRole: (userId: string, role: Role) => Promise<void>;
	getRoles: () => Promise<DBRole[]>;
	getRoleById: (id: string) => Promise<Role | null>;
}
