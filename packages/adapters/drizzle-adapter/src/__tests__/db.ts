import { drizzle } from "drizzle-orm/node-postgres";
// import pg from "pg";
// ✅ works with bundler resolution
import * as pg from "pg";
import { createSchema } from "../schema"; // Adjust if schema lives elsewhere

const schema = createSchema();

// Create a connection pool to the test database running in Docker
const pool = new pg.Pool({
	host: "localhost",
	port: 5433,
	user: "test",
	password: "test",
	database: "thia_drizzle_test",
	ssl: false, // Important! Matches drizzle.config.ts to avoid the SSL error
});

// Export the Drizzle database instance using your schema
export const db = drizzle(pool, { schema });

export type DB = typeof db;
