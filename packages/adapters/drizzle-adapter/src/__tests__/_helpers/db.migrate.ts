import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

export async function runMigrations(databaseUrl: string) {
	const pool = new Pool({ connectionString: databaseUrl });
	const db = drizzle(pool);
	try {
		await migrate(db, { migrationsFolder: "./drizzle/migrations" });
	} finally {
		await pool.end();
	}
}
