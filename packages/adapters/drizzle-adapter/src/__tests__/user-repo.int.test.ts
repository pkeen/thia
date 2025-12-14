// src/__tests__/user-repo.int.test.ts
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { startTestDb } from "./_helpers/start-db";

// your adapter classes
import { DrizzlePgUoW } from "../uow";
import { PostgresUserRepository } from "../user-repository";

// domain bits
import { User, EmailAddress, LinkedAccount } from "@thia/core";
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

	it("rollback discards writes", async () => {
		if (!ctx) throw new Error("DB not started");
		const buildRepos = (db: any, s: any) => ({
			users: PostgresUserRepository(db, s),
		});

		// tx A: write then rollback
		const txA = new DrizzlePgUoW(ctx.pool, buildRepos);
		await txA.start();
		const id = asUserId("01ROLLBACKULID0000000000000");
		const u = User.create({
			id,
			email: EmailAddress.create("r@b.com"),
			now: new Date(),
		});
		await txA.users.save(u);
		await txA.rollback(); // <- discard

		// tx B: attempt to read
		const txB = new DrizzlePgUoW(ctx.pool, buildRepos);
		await txB.start();
		const read = await txB.users.getById(id);
		await txB.rollback();

		expect(read).toBeNull();
	});

	it("isolation: uncommitted writes are not visible in another tx", async () => {
		if (!ctx) throw new Error("DB not started");
		const buildRepos = (db: any, s: any) => ({
			users: PostgresUserRepository(db, s),
		});

		const id = asUserId("01ISOLATIONULID000000000000");

		// tx A: start, write but DO NOT commit yet
		const txA = new DrizzlePgUoW(ctx.pool, buildRepos);
		await txA.start();
		await txA.users.save(
			User.create({
				id,
				email: EmailAddress.create("iso@b.com"),
				now: new Date(),
			})
		);

		// tx B: concurrently tries to read; should not see it
		const txB = new DrizzlePgUoW(ctx.pool, buildRepos);
		await txB.start();
		const beforeCommit = await txB.users.getById(id);
		await txB.rollback();
		expect(beforeCommit).toBeNull();

		// now commit A, then verify visibility
		await txA.commit();

		const txC = new DrizzlePgUoW(ctx.pool, buildRepos);
		await txC.start();
		const afterCommit = await txC.users.getById(id);
		await txC.rollback();
		expect(afterCommit?.id).toEqual(id);
	});

	it("errors if used before start or after dispose", async () => {
		if (!ctx) throw new Error("DB not started");
		const buildRepos = (db: any, s: any) => ({
			users: PostgresUserRepository(db, s),
		});

		const uow = new DrizzlePgUoW(ctx.pool, buildRepos);

		// before start
		await expect(async () => {
			// @ts-expect-error intentional misuse
			await uow.users.getById("x");
		}).rejects.toBeTruthy();

		await uow.start();
		await uow.commit();

		// after commit (disposed)
		await expect(async () => {
			// @ts-expect-error intentional misuse
			await uow.users.getById("x");
		}).rejects.toBeTruthy();
	});

	// run in tx convenience method.
	it("runInTx commits on success and rolls back on error", async () => {
		if (!ctx) throw new Error("DB not started");
		const buildRepos = (db: any, s: any) => ({
			users: PostgresUserRepository(db, s),
		});

		const idOk = asUserId("01RUNINTXOK000000000000000");
		const idFail = asUserId("01RUNINTXFAIL000000000000");

		const uow = new DrizzlePgUoW(ctx.pool, buildRepos);

		// success -> committed
		await uow.runInTx(async (tx) => {
			await tx.users.save(
				User.create({
					id: idOk,
					email: EmailAddress.create("ok@b.com"),
					now: new Date(),
				})
			);
		});

		// failure -> rolled back
		await expect(
			uow.runInTx(async (tx) => {
				await tx.users.save(
					User.create({
						id: idFail,
						email: EmailAddress.create("boom@b.com"),
						now: new Date(),
					})
				);
				throw new Error("boom");
			})
		).rejects.toThrow("boom");

		// verify effects
		const check = new DrizzlePgUoW(ctx.pool, buildRepos);
		await check.start();
		const ok = await check.users.getById(idOk);
		const fail = await check.users.getById(idFail);
		await check.rollback();
		expect(ok).not.toBeNull();
		expect(fail).toBeNull();
	});

	it("Loads a user by getByProviderAccount", async () => {
		if (!ctx) throw new Error("DB not started");
		const buildRepos = (db: any, s: any) => ({
			users: PostgresUserRepository(db, s),
		});

		const uow = new DrizzlePgUoW(ctx.pool, buildRepos);
		await uow.start();
		const id = asUserId("01RUNINTXOK000000000000000");
		const u = User.create({
			id,
			email: EmailAddress.create("ok@b.com"),
			now: new Date(),
		});
		const account = LinkedAccount.link({
			type: "oauth", // <-- required
			provider: "github",
			providerAccountId: "123",
			accessToken: "abc",
			refreshToken: "def",
			expiresAt: Math.floor(Date.now() / 1000), // <-- epoch seconds (if your VO expects number)
			scope: "user",
			tokenType: "Bearer",
			idToken: "ghi",
			sessionState: "jkl",
		});
		u.linkAccount(account);
		await uow.users.save(u);
		await uow.commit();

		const check = new DrizzlePgUoW(ctx.pool, buildRepos);
		await check.start();
		const byProviderAccount = await check.users.getByProviderAccount({
			provider: "github",
			providerAccountId: "123",
		});
		await check.rollback();
		expect(byProviderAccount?.id).toEqual(id);
	});
});
