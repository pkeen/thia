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

	it("loads linked accounts, with their tokens, when hydrating a user", async () => {
		if (!ctx) throw new Error("DB not started");
		const buildRepos = (db: any, s: any) => ({
			users: PostgresUserRepository(db, s),
		});

		const id = asUserId("01HYDRATEACCOUNTS000000000");
		const u = User.create({
			id,
			email: EmailAddress.create("hydrate@b.com"),
			now: new Date(),
		});
		u.linkAccount(
			LinkedAccount.link({
				type: "oauth",
				provider: "github",
				providerAccountId: "gh-1",
				accessToken: "abc",
				refreshToken: "def",
				expiresAt: 1700000000,
				scope: "user",
				tokenType: "Bearer",
				idToken: "ghi",
				sessionState: "jkl",
			})
		);
		const write = new DrizzlePgUoW(ctx.pool, buildRepos);
		await write.runInTx((tx) => tx.users.save(u));

		const read = new DrizzlePgUoW(ctx.pool, buildRepos);
		const loaded = await read.runInTx((tx) => tx.users.getById(id));

		expect(loaded?.accounts).toHaveLength(1);
		const [acc] = loaded!.accounts;
		expect(acc.provider).toBe("github");
		expect(acc.providerAccountId).toBe("gh-1");
		expect(acc.accessToken).toBe("abc");
		expect(acc.refreshToken).toBe("def");
		expect(acc.expiresAt).toBe(1700000000);
		expect(acc.tokenType).toBe("Bearer");
		expect(acc.idToken).toBe("ghi");
		expect(acc.sessionState).toBe("jkl");
	});

	it("keeps existing linked accounts when a second provider is linked", async () => {
		if (!ctx) throw new Error("DB not started");
		const buildRepos = (db: any, s: any) => ({
			users: PostgresUserRepository(db, s),
		});

		const id = asUserId("01SECONDPROVIDER000000000");
		const email = EmailAddress.create("two@b.com");

		// first sign-in: GitHub
		const first = User.create({ id, email, now: new Date() });
		first.linkAccount(
			LinkedAccount.link({
				type: "oauth",
				provider: "github",
				providerAccountId: "gh-2",
			})
		);
		await new DrizzlePgUoW(ctx.pool, buildRepos).runInTx((tx) =>
			tx.users.save(first)
		);

		// second sign-in: Google, found by email - mirrors completeOAuth
		await new DrizzlePgUoW(ctx.pool, buildRepos).runInTx(async (tx) => {
			const existing = await tx.users.getByEmail(email);
			existing!.linkAccount(
				LinkedAccount.link({
					type: "oauth",
					provider: "google",
					providerAccountId: "go-2",
				})
			);
			await tx.users.save(existing!);
		});

		const lookups = await new DrizzlePgUoW(ctx.pool, buildRepos).runInTx(
			async (tx) => ({
				byGithub: await tx.users.getByProviderAccount({
					provider: "github",
					providerAccountId: "gh-2",
				}),
				byGoogle: await tx.users.getByProviderAccount({
					provider: "google",
					providerAccountId: "go-2",
				}),
			})
		);

		expect(lookups.byGithub?.id).toEqual(id);
		expect(lookups.byGoogle?.id).toEqual(id);
		expect(lookups.byGoogle?.accounts.map((a) => a.provider).sort()).toEqual(
			["github", "google"]
		);
	});

	it("removes an unlinked account on save", async () => {
		if (!ctx) throw new Error("DB not started");
		const buildRepos = (db: any, s: any) => ({
			users: PostgresUserRepository(db, s),
		});

		const id = asUserId("01UNLINKACCOUNT0000000000");
		const u = User.create({
			id,
			email: EmailAddress.create("unlink@b.com"),
			now: new Date(),
		});
		u.linkAccount(
			LinkedAccount.link({ type: "oauth", provider: "github", providerAccountId: "gh-3" })
		);
		u.linkAccount(
			LinkedAccount.link({ type: "oauth", provider: "google", providerAccountId: "go-3" })
		);
		await new DrizzlePgUoW(ctx.pool, buildRepos).runInTx((tx) => tx.users.save(u));

		await new DrizzlePgUoW(ctx.pool, buildRepos).runInTx(async (tx) => {
			const loaded = await tx.users.getById(id);
			loaded!.unlinkAccount("github", "gh-3");
			await tx.users.save(loaded!);
		});

		const after = await new DrizzlePgUoW(ctx.pool, buildRepos).runInTx((tx) =>
			tx.users.getById(id)
		);
		expect(after?.accounts.map((a) => a.provider)).toEqual(["google"]);
	});

	it("refuses to link a provider account that belongs to another user", async () => {
		if (!ctx) throw new Error("DB not started");
		const buildRepos = (db: any, s: any) => ({
			users: PostgresUserRepository(db, s),
		});
		const gh = () =>
			LinkedAccount.link({ type: "oauth", provider: "github", providerAccountId: "gh-owned" });

		const owner = User.create({
			id: asUserId("01OWNERUSER00000000000000"),
			email: EmailAddress.create("owner@b.com"),
			now: new Date(),
		});
		owner.linkAccount(gh());
		await new DrizzlePgUoW(ctx.pool, buildRepos).runInTx((tx) => tx.users.save(owner));

		const intruder = User.create({
			id: asUserId("01INTRUDERUSER00000000000"),
			email: EmailAddress.create("intruder@b.com"),
			now: new Date(),
		});
		intruder.linkAccount(gh());
		await expect(
			new DrizzlePgUoW(ctx.pool, buildRepos).runInTx((tx) => tx.users.save(intruder))
		).rejects.toThrow();

		const stillOwner = await new DrizzlePgUoW(ctx.pool, buildRepos).runInTx((tx) =>
			tx.users.getByProviderAccount({ provider: "github", providerAccountId: "gh-owned" })
		);
		expect(stillOwner?.id).toEqual(owner.id);
	});
});
