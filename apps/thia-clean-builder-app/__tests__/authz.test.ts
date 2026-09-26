import { describe, it, expect, vi, beforeEach } from "vitest";
import { asUserId, EmailAddress, User } from "@thia/core";

const thia = vi.hoisted(() => ({
	verifySession: vi.fn(),
	uow: { users: { getById: vi.fn() } },
	roleStore: { getRoles: vi.fn() },
}));
vi.mock("@/thia", () => ({ thia }));

const cookieStore = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

async function loadAuthz() {
	vi.resetModules();
	return import("@/authz");
}

function signedInAs(email: string, assignedRoles: string[] = []) {
	thia.roleStore.getRoles.mockResolvedValue(assignedRoles);
	cookieStore.get.mockReturnValue({ value: "jwt.value" });
	thia.verifySession.mockResolvedValue({ sub: "01USER0000000000000000000" });
	thia.uow.users.getById.mockResolvedValue(
		User.create({
			id: asUserId("01USER0000000000000000000"),
			email: EmailAddress.create(email),
		})
	);
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("getSubject", () => {
	it("uses the roles assigned in the database", async () => {
		const { getSubject } = await loadAuthz();
		signedInAs("boss@example.com", ["admin"]);

		await expect(getSubject()).resolves.toMatchObject({
			email: "boss@example.com",
			roles: ["admin"],
		});
		expect(thia.roleStore.getRoles).toHaveBeenCalledWith(
			"01USER0000000000000000000"
		);
	});

	it("passes through several assigned roles", async () => {
		const { getSubject } = await loadAuthz();
		signedInAs("multi@example.com", ["editor", "admin"]);

		await expect(getSubject()).resolves.toMatchObject({
			roles: ["editor", "admin"],
		});
	});

	it("falls back to viewer when nothing is assigned", async () => {
		const { getSubject } = await loadAuthz();
		signedInAs("someone@example.com", []);

		await expect(getSubject()).resolves.toMatchObject({ roles: ["viewer"] });
	});

	it("returns null when signed out, without querying roles", async () => {
		const { getSubject } = await loadAuthz();
		cookieStore.get.mockReturnValue(undefined);

		await expect(getSubject()).resolves.toBeNull();
		expect(thia.verifySession).not.toHaveBeenCalled();
		expect(thia.roleStore.getRoles).not.toHaveBeenCalled();
	});

	it("returns null for a forged or expired token", async () => {
		const { getSubject } = await loadAuthz();
		cookieStore.get.mockReturnValue({ value: "tampered" });
		thia.verifySession.mockRejectedValue(new Error("signature mismatch"));

		await expect(getSubject()).resolves.toBeNull();
	});

	it("returns null when the token's user no longer exists", async () => {
		const { getSubject } = await loadAuthz();
		cookieStore.get.mockReturnValue({ value: "jwt.value" });
		thia.verifySession.mockResolvedValue({ sub: "01GONE000000000000000000" });
		thia.uow.users.getById.mockResolvedValue(null);

		await expect(getSubject()).resolves.toBeNull();
	});

	it("returns null when the role lookup fails", async () => {
		const { getSubject } = await loadAuthz();
		signedInAs("boss@example.com");
		thia.roleStore.getRoles.mockRejectedValue(new Error("db down"));

		await expect(getSubject()).resolves.toBeNull();
	});
});

describe("authorizer", () => {
	it("allows admin.view only for admins", async () => {
		const { authorizer } = await loadAuthz();
		const subject = (roles: string[]) => ({
			id: "u1",
			email: "e@example.com",
			roles,
		});

		await expect(
			authorizer.can(subject(["admin"]), "admin.view")
		).resolves.toBe(true);
		await expect(
			authorizer.can(subject(["viewer"]), "admin.view")
		).resolves.toBe(false);
		await expect(authorizer.can(subject([]), "admin.view")).resolves.toBe(
			false
		);
	});
});
