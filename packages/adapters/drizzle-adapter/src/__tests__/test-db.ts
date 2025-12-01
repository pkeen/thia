import { GenericContainer } from "testcontainers";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

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
	const connectionString = `postgres://test:test@${host}:${port}/testdb`;

	const pool = new Pool({ connectionString });
	const db = drizzle(pool);
	await migrate(db, { migrationsFolder: "./drizzle" });

	return {
		pool,
		stop: async () => {
			await pool.end();
			await container.stop();
		},
	};
}
