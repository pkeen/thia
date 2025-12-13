// uow.drizzle.ts
import { Pool, PoolClient } from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { createSchema } from "./schema";
import type { UnitOfWork, UserRepository } from "@thia/core";

type DBSchema = ReturnType<typeof createSchema>;
type DrizzleDb = NodePgDatabase<DBSchema>;
type RepoSet = { users: UserRepository };
type RepoFactory = (db: DrizzleDb, s: DBSchema) => RepoSet;

export class DrizzlePgUoW implements UnitOfWork {
	private client!: PoolClient;
	private started = false;
	private disposed = false;

	// keep repos private; expose them via guarded getters
	private _users?: UserRepository;

	constructor(
		private readonly pool: Pool,
		private readonly buildRepos: RepoFactory,
		private readonly namespace: string = "thia"
	) {}

	/** Guarded accessors */
	public get users(): UserRepository {
		this.ensureUsable();
		return this._users!;
	}

	async start(): Promise<void> {
		if (this.started) throw new Error("UoW already started");
		this.client = await this.pool.connect();
		try {
			await this.client.query("BEGIN");
			const s = createSchema(this.namespace);
			const db = drizzle(this.client, { schema: s }) as DrizzleDb;
			const repos = this.buildRepos(db, s);
			this._users = repos.users;
			this.started = true;
			this.disposed = false;
		} catch (e) {
			this.client.release();
			// @ts-expect-error
			this.client = undefined;
			throw e;
		}
	}

	async commit(): Promise<void> {
		this.ensureUsable();
		try {
			await this.client.query("COMMIT");
		} finally {
			this.dispose();
		}
	}

	async rollback(): Promise<void> {
		// allow rollback even if ensureUsable would fail
		if (this.client) {
			try {
				await this.client.query("ROLLBACK");
			} finally {
				this.dispose();
			}
		}
	}

	async runInTx<T>(fn: (uow: this) => Promise<T>): Promise<T> {
		await this.start();
		try {
			const out = await fn(this);
			await this.commit();
			return out;
		} catch (e) {
			await this.rollback();
			throw e;
		}
	}

	// --- internals ---
	private ensureUsable() {
		if (!this.started)
			throw new Error("UoW not started. Call start() first.");
		if (this.disposed) throw new Error("UoW already disposed.");
	}

	private dispose() {
		if (!this.disposed) {
			this.client.release();
			this.disposed = true;
			this.started = false;
			// clear repos so later access throws via getter
			this._users = undefined;
			// @ts-expect-error
			this.client = undefined;
		}
	}
}
