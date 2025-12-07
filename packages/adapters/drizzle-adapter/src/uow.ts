import { Pool, PoolClient } from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { createSchema } from "./schema";
import type { UnitOfWork, UserRepository } from "@thia/core";
import { PostgresUserRepository } from "./user-repository";

type DBSchema = ReturnType<typeof createSchema>;
export type DrizzleDb = NodePgDatabase<DBSchema>;
export type RepoSet = { users: UserRepository };
export type RepoFactory = (db: DrizzleDb, s: DBSchema) => RepoSet;

export class DrizzlePgUoW implements UnitOfWork {
	public users!: UserRepository;
	private client!: PoolClient;
	private disposed = false;

	constructor(
		private readonly pool: Pool,
		private readonly buildRepos: RepoFactory,
		private readonly namespace: string = "thia" // optional
	) {}

	async start(): Promise<void> {
		this.client = await this.pool.connect();
		try {
			await this.client.query("BEGIN");
			const s: DBSchema = createSchema(this.namespace); // ✅ instance
			const db: DrizzleDb = drizzle(this.client, { schema: s }); // ✅ use instance
			const repos = this.buildRepos(db, s); // pass schema to repos if needed
			this.users = repos.users;
		} catch (e) {
			this.client.release();
			// @ts-expect-error
			this.client = undefined;
			throw e;
		}
	}

	async commit() {
		await this.client.query("COMMIT");
		this.dispose();
	}
	async rollback() {
		try {
			await this.client.query("ROLLBACK");
		} finally {
			this.dispose();
		}
	}
	private dispose() {
		if (!this.disposed) {
			this.client.release();
			this.disposed = true;
			/* @ts-expect-error */ this.client = undefined;
		}
	}
}
