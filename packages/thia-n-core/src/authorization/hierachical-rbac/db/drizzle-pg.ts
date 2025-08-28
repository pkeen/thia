import * as defaultSchema from "./schema";
import { PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { Role, RoleConfigEntry } from "../index.types";

type DefaultSchema = typeof defaultSchema;
type DrizzleDatabase = PgDatabase<PgQueryResultHKT, any> | NeonHttpDatabase;

export const DrizzlePGAdapter = (
	db: DrizzleDatabase,
	schema: DefaultSchema = defaultSchema
) => {
	return {
		seed: async (roles: RoleConfigEntry[]) => {
			await db
				.insert(schema.rolesTable)
				// The key is this: wrap in [... ] to create a new (mutable) array.
				.values([...roles])
				.onConflictDoNothing();
		},
		getUserRoles: async (userId: string) => {
			// Drizzle returns an array of joined rows.
			// We'll select specific columns from `rolesTable` so it's typed more cleanly.
			const rows = await db
				.select({
					// roleId: schema.rolesTable.id,
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
			const roles: Omit<Role, "id">[] = rows.map((row) => ({
				name: row.roleName,
				level: row.roleLevel,
			}));

			return roles;
		},
		updateUserRoles: async (userId: string, roles: Role[]) => {
			//update user's role
			// TODO: check if works
			await db
				.update(schema.userRolesTable)
				.set({ roleId: roles[0].id })
				.where(eq(schema.userRolesTable.userId, userId));
		},
		createUserRoles: async (userId: string, roles: Role[]) => {
			await db.insert(schema.userRolesTable).values(
				roles.map((role) => ({
					userId,
					roleId: role.id,
				}))
			);
		},
		deleteUserRoles: async (userId: string) => {
			await db
				.delete(schema.userRolesTable)
				.where(eq(schema.userRolesTable.userId, userId));
		},
	};
};

export interface RolesDBAdapter {
	seed: (roles: RoleConfigEntry[]) => Promise<void>;
	getUserRoles: (userId: string) => Promise<Omit<Role, "id">[]>;
	createUserRoles: (userId: string, roles: Role[]) => Promise<void>;
	updateUserRoles: (userId: string, roles: Role[]) => Promise<void>;
	deleteUserRoles: (userId: string) => Promise<void>;
}
