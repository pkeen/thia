import { GenericContainer, Wait } from "testcontainers";
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
		// The image's first boot runs a temporary server to initialise the
		// database, then restarts; the port can open before the real server is
		// up ("the database system is starting up"). Wait for the second
		// "ready" line instead.
		.withWaitStrategy(
			Wait.forLogMessage(/database system is ready to accept connections/, 2)
		)
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
