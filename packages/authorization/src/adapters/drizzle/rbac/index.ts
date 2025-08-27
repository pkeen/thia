export * from "./rbac";
export * as rbacSchema from "./schema";
export { createSchema } from "./schema";
// import { PgDatabase, PgQueryResultHKT }   from "drizzle-orm/pg-core";
// import { RBACAdapter } from "./rbac";
// import * as rbacSchema from "./schema";
// import { NeonHttpDatabase } from "drizzle-orm/neon-http";

// type DrizzleDatabase = PgDatabase<PgQueryResultHKT, any> | NeonHttpDatabase;

// export const createRBACAdapter = (
// 	db: DrizzleDatabase,
// 	schema: typeof rbacSchema = rbacSchema
// ) => {
// 	return {
// 		RBACAdapter: RBACAdapter(db, schema),
// 		rbacSchema,
// 	};
// };
