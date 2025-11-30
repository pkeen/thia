/**
 * <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16}}>
 *  <h1>Drizzle Adapter</h1>
 * <p> Unnoficial adapter for Pete's Auth Library - Heavily inspired by Auth.js.</p>
 * <p> Auth.js helped me navigate typing issues with Drizzle ORM.</p>
 *
 *
 * ## Installation
 *
 *
 * @module @pete_keen/auth/drizzle-adapter
 */

import { is } from "drizzle-orm";
import { MySqlDatabase } from "drizzle-orm/mysql-core";
import { PgDatabase } from "drizzle-orm/pg-core";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
// import { DefaultMySqlSchema, MySqlDrizzleAdapter } from "./lib/mysql.js"
import { DefaultPostgresSchema } from "./schema";
import { PostgresDrizzleAdapter } from "./adapter";
// import { DefaultSQLiteSchema, SQLiteDrizzleAdapter } from "./lib/sqlite.js"
import { DefaultSchema, SqlFlavorOptions } from "./utils";
// import { defineTables } from "./pg/schema";
import type { UserRepository } from "@thia/core";
// import type { Adapter } from "../../core/adapter/index.js";

export function DrizzleAdapter<SqlFlavor extends SqlFlavorOptions>(
	db: SqlFlavor,
	schema?: DefaultSchema<SqlFlavor>
): Adapter {
	// if (is(db, MySqlDatabase)) {
	// 	return MySqlDrizzleAdapter(db, schema as DefaultMySqlSchema);
	// } else if (is(db, PgDatabase)) {
	// 	return PostgresDrizzleAdapter(db, schema as DefaultPostgresSchema);
	// } else if (is(db, BaseSQLiteDatabase)) {
	// 	return SQLiteDrizzleAdapter(db, schema as DefaultSQLiteSchema);
	// }
	if (is(db, PgDatabase)) {
		return PostgresDrizzleAdapter(db, schema as DefaultPostgresSchema);
	}

	throw new Error(
		`Unsupported database type (${typeof db}) in Drizzle adapter.`
	);
}

export { DefaultPostgresSchema };

// export { defineTables } from "./pg/schema";
