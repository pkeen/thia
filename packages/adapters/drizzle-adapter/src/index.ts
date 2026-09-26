/**
 * Drizzle adapter for @thia/core - Postgres implementation of the
 * UnitOfWork / UserRepository ports, and of @thia/authz's RoleStore.
 *
 * @module @thia/adapters-drizzle
 */

export { PostgresUserRepository } from "./user-repository";
export { DrizzlePgUoW } from "./uow";
export { PostgresRoleStore } from "./role-store";
export { createSchema } from "./schema";
export type {
	DefaultPostgresSchema,
	UserTable,
	UserRow,
	AccountTable,
	AccountRow,
	UserRoleTable,
	UserRoleRow,
} from "./schema";
export type { SqlFlavorOptions, DefaultSchema } from "./utils";
