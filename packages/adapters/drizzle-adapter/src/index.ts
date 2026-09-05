/**
 * Drizzle adapter for @thia/core - Postgres implementation of the
 * UnitOfWork / UserRepository ports.
 *
 * @module @thia/adapters-drizzle
 */

export { PostgresUserRepository } from "./user-repository";
export { DrizzlePgUoW } from "./uow";
export { createSchema } from "./schema";
export type {
	DefaultPostgresSchema,
	UserTable,
	UserRow,
	AccountTable,
	AccountRow,
} from "./schema";
export type { SqlFlavorOptions, DefaultSchema } from "./utils";
