import type { RoleStore } from "@thia/authz";
import { and, eq } from "drizzle-orm";
import { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { DefaultPostgresSchema, createSchema } from "./schema";

/**
 * Postgres-backed role assignments. Reads are not cached, so granting or
 * revoking a role takes effect on the user's next request.
 */
export function PostgresRoleStore(
	client: PgDatabase<PgQueryResultHKT, any> | NeonHttpDatabase,
	schema: DefaultPostgresSchema = createSchema()
): RoleStore {
	const { userRoleTable } = schema;

	return {
		async getRoles(userId: string): Promise<string[]> {
			const rows = await client
				.select({ role: userRoleTable.role })
				.from(userRoleTable)
				.where(eq(userRoleTable.userId, userId));
			return rows.map((r) => r.role);
		},

		async assign(userId: string, role: string): Promise<void> {
			await client
				.insert(userRoleTable)
				.values({ userId, role })
				// Already assigned is success, not a conflict.
				.onConflictDoNothing();
		},

		async revoke(userId: string, role: string): Promise<void> {
			await client
				.delete(userRoleTable)
				.where(
					and(
						eq(userRoleTable.userId, userId),
						eq(userRoleTable.role, role)
					)
				);
		},
	};
}
