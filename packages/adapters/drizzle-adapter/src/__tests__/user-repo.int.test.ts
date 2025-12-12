// src/__tests__/user-repo.int.test.ts
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { startTestDb } from "./_helpers/start-db";

// your adapter classes
import { DrizzlePgUoW } from "../uow";
import { PostgresUserRepository } from "../user-repository";

// domain bits
import { User, EmailAddress } from "@thia/core";
import { asUserId } from "@thia/core";

let ctx: Awaited<ReturnType<typeof startTestDb>> | undefined;

beforeAll(async () => {
	ctx = await startTestDb();
}, 120_000);

afterAll(async () => {
	if (ctx) await ctx.stop();
});

describe("Pg Drizzle UserRepository", () => {
	it("saves and loads a user by id & email", async () => {
		if (!ctx) throw new Error("DB not started");

		// DI: app decides how repos are built from tx-bound db+schema
		const buildRepos = (db: any, schema: any) => ({
			users: PostgresUserRepository(db, schema),
		});

		// tx 1: save
		const uow1 = new DrizzlePgUoW(ctx.pool, buildRepos);
		await uow1.start();

		const id = asUserId("01TESTULID0000000000000000");
		const user = User.create({
			id,
			email: EmailAddress.create("a@b.com"),
			name: "Alice",
			now: new Date(),
		});
		(user as any).setPasswordHash?.("hash:pw"); // if your domain uses it

		await uow1.users.save(user);
		await uow1.commit();

		// tx 2: load
		const uow2 = new DrizzlePgUoW(ctx.pool, buildRepos);
		await uow2.start();
		const byId = await uow2.users.getById(id);
		const byEmail = await uow2.users.getByEmail(
			EmailAddress.create("a@b.com")
		);
		await uow2.rollback();

		expect(byId).not.toBeNull();
		expect(byId!.id).toEqual(id);
		expect(byEmail?.id).toEqual(id);
	});
});
