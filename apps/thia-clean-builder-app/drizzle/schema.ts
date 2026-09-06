// Re-exports @thia/adapters-drizzle's table definitions at module scope so
// drizzle-kit (which needs static exports, not a factory call) can introspect
// them to generate migrations for this app's database.
import { createSchema } from "@thia/adapters-drizzle";

export const { userTable, accountTable } = createSchema();
