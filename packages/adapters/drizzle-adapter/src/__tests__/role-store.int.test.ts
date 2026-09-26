import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { startTestDb } from "./_helpers/start-db";
import { PostgresRoleStore } from "../role-store";
import { PostgresUserRepository } from "../user-repository";
import { createSchema } from "../schema";
import { User, EmailAddress, asUserId } from "@thia/core";

let ctx: Awaited<ReturnType<typeof startTestDb>> | undefined;

beforeAll(async () => {
	ctx = await startTestDb();
}, 120_000);

afterAll(async () => {
	if (ctx) await ctx.stop();
});

/** Role rows reference a user, so one has to exist first. */
async function seedUser(id: string, email: string) {
	if (!ctx) throw new Error("DB not started");
	const schema = createSchema();
	await PostgresUserRepository(ctx.db as any, schema).save(
		User.create({
			id: asUserId(id),
			email: EmailAddress.create(email),
			now: new Date(),
		})
	);
}

const store = () => {
	if (!ctx) throw new Error("DB not started");
	return PostgresRoleStore(ctx.db as any, createSchema());
};

describe("PostgresRoleStore", () => {
	it("returns no roles for a user with none", async () => {
		await seedUser("01ROLEUSERNONE0000000000", "none@b.com");

		await expect(store().getRoles("01ROLEUSERNONE0000000000")).resolves.toEqual(
			[]
		);
	});

	it("assigns and reads back roles", async () => {
		const id = "01ROLEUSERASSIGN00000000";
		await seedUser(id, "assign@b.com");

		await store().assign(id, "admin");
		await store().assign(id, "editor");

		await expect(store().getRoles(id)).resolves.toEqual(
			expect.arrayContaining(["admin", "editor"])
		);
		await expect(store().getRoles(id)).resolves.toHaveLength(2);
	});

	it("treats assigning the same role twice as a no-op", async () => {
		const id = "01ROLEUSERTWICE000000000";
		await seedUser(id, "twice@b.com");

		await store().assign(id, "admin");
		await store().assign(id, "admin");

		await expect(store().getRoles(id)).resolves.toEqual(["admin"]);
	});

	it("revokes a role without touching the others", async () => {
		const id = "01ROLEUSERREVOKE00000000";
		await seedUser(id, "revoke@b.com");
		await store().assign(id, "admin");
		await store().assign(id, "viewer");

		await store().revoke(id, "admin");

		await expect(store().getRoles(id)).resolves.toEqual(["viewer"]);
	});

	it("ignores revoking a role the user doesn't have", async () => {
		const id = "01ROLEUSERNOREVOKE000000";
		await seedUser(id, "norevoke@b.com");
		await store().assign(id, "viewer");

		await store().revoke(id, "admin");

		await expect(store().getRoles(id)).resolves.toEqual(["viewer"]);
	});

	it("keeps each user's roles separate", async () => {
		await seedUser("01ROLEUSERA00000000000000", "a-roles@b.com");
		await seedUser("01ROLEUSERB00000000000000", "b-roles@b.com");

		await store().assign("01ROLEUSERA00000000000000", "admin");

		await expect(
			store().getRoles("01ROLEUSERB00000000000000")
		).resolves.toEqual([]);
	});

	it("rejects a role for a user that doesn't exist", async () => {
		// The foreign key stops assignments outliving or preceding their user.
		await expect(store().assign("01NOSUCHUSER000000000000", "admin")).rejects.toThrow();
	});

	it("drops a user's roles when the user is deleted", async () => {
		if (!ctx) throw new Error("DB not started");
		const id = "01ROLEUSERCASCADE0000000";
		await seedUser(id, "cascade@b.com");
		await store().assign(id, "admin");

		await ctx.pool.query(`delete from thia."user" where id = $1`, [id]);

		await expect(store().getRoles(id)).resolves.toEqual([]);
	});
});
