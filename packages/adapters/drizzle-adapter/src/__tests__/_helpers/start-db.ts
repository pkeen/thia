import { GenericContainer } from "testcontainers";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { runMigrations } from "./db.migrate";

export async function startTestDb() {
	const container = await new GenericContainer("postgres:16-alpine")
		.withEnvironment({
			POSTGRES_USER: "test",
			POSTGRES_PASSWORD: "test",
			POSTGRES_DB: "testdb",
		})
		.withExposedPorts(5432)
		.start();

	const host = container.getHost();
	const port = container.getMappedPort(5432);
	const url = `postgres://test:test@${host}:${port}/testdb`;

	// run this adapter's migrations
	await runMigrations(url);

	// create pooled client for tests
	const pool = new Pool({ connectionString: url });
	const db = drizzle(pool); // you can also pass schema here if you prefer

	return {
		url,
		pool,
		db,
		stop: async () => {
			await pool.end();
			await container.stop();
		},
	};
}
