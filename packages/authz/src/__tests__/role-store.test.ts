import { describe, it, expect } from "vitest";
import { InMemoryRoleStore } from "../role-store";

describe("InMemoryRoleStore", () => {
	it("starts empty for an unknown user", async () => {
		await expect(new InMemoryRoleStore().getRoles("u1")).resolves.toEqual([]);
	});

	it("can be seeded", async () => {
		const store = new InMemoryRoleStore({ u1: ["admin"], u2: ["viewer"] });

		await expect(store.getRoles("u1")).resolves.toEqual(["admin"]);
		await expect(store.getRoles("u2")).resolves.toEqual(["viewer"]);
	});

	it("assigns and revokes roles", async () => {
		const store = new InMemoryRoleStore();

		await store.assign("u1", "admin");
		await store.assign("u1", "editor");
		await expect(store.getRoles("u1")).resolves.toEqual(["admin", "editor"]);

		await store.revoke("u1", "admin");
		await expect(store.getRoles("u1")).resolves.toEqual(["editor"]);
	});

	it("ignores assigning a role twice", async () => {
		const store = new InMemoryRoleStore();

		await store.assign("u1", "admin");
		await store.assign("u1", "admin");

		await expect(store.getRoles("u1")).resolves.toEqual(["admin"]);
	});

	it("ignores revoking a role the user doesn't have", async () => {
		const store = new InMemoryRoleStore({ u1: ["viewer"] });

		await store.revoke("u1", "admin");
		await store.revoke("nobody", "admin");

		await expect(store.getRoles("u1")).resolves.toEqual(["viewer"]);
	});

	it("keeps users separate", async () => {
		const store = new InMemoryRoleStore();

		await store.assign("u1", "admin");

		await expect(store.getRoles("u2")).resolves.toEqual([]);
	});
});
