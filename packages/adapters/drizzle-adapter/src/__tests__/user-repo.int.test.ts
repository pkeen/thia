import { startTestDb } from "./_helpers/start-db";
import { describe, it, beforeAll, afterAll, expect } from "vitest";

// import the adapter under test
import { DrizzlePgUoW } from "../src/uow.drizzle";

// import minimal domain bits from core
import { User, EmailAddress } from "@thia/core";
import { asUserId } from "@thia/core"; // however you brand ids
import { PersonName, ImageUrl } from "@thia/core"; // if needed

let ctx: Awaited<ReturnType<typeof startTestDb>>;

beforeAll(async () => {
	ctx = await startTestDb();
});

afterAll(async () => {
	await ctx.stop();
});

describe("Pg Drizzle UserRepository", () => {
	it("saves and loads a user by id & email", async () => {
		const uow = new DrizzlePgUoW(ctx.pool);
		await uow.start();

		// Build a domain user (no DB ids here; you generate them in domain/app)
		const userId = asUserId("01HXYZULIDTEST"); // or use your IdGenerator in tests
		const user = User.create({
			id: userId,
			email: EmailAddress.create("a@b.com"),
			name: "Alice",
			now: new Date(),
		});
		(user as any).setPasswordHash?.("hash:pw"); // if your entity requires it

		await uow.users.save(user);
		await uow.commit();

		// new UoW to ensure we really read from DB
		const uow2 = new DrizzlePgUoW(ctx.pool);
		await uow2.start();

		const byId = await uow2.users.getById(userId);
		const byEmail = await uow2.users.getByEmail(
			EmailAddress.create("a@b.com")
		);

		await uow2.rollback();

		expect(byId).not.toBeNull();
		expect(byId!.id).toEqual(userId);
		expect(byId!.email.value).toEqual("a@b.com");

		expect(byEmail).not.toBeNull();
		expect(byEmail!.id).toEqual(userId);
	});
});
