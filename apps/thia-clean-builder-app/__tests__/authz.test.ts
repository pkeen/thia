import { describe, it, expect, vi, beforeEach } from "vitest";
import { asUserId, EmailAddress, User } from "@thia/core";

const thia = vi.hoisted(() => ({
	verifySession: vi.fn(),
	uow: { users: { getById: vi.fn() } },
}));
vi.mock("@/thia", () => ({ thia }));

const cookieStore = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

/** Roles are read from ADMIN_EMAILS when the module loads. */
async function loadAuthz(adminEmails?: string) {
	vi.resetModules();
	if (adminEmails === undefined) delete process.env.ADMIN_EMAILS;
	else process.env.ADMIN_EMAILS = adminEmails;
	return import("@/authz");
}

function signedInAs(email: string) {
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
	it("gives listed emails the admin role", async () => {
		const { getSubject } = await loadAuthz("boss@example.com");
		signedInAs("boss@example.com");

		await expect(getSubject()).resolves.toMatchObject({
			email: "boss@example.com",
			roles: ["admin"],
		});
	});

	it("gives everyone else the viewer role", async () => {
		const { getSubject } = await loadAuthz("boss@example.com");
		signedInAs("someone@example.com");

		await expect(getSubject()).resolves.toMatchObject({
			roles: ["viewer"],
		});
	});

	it("matches admin emails regardless of case or spacing", async () => {
		const { getSubject } = await loadAuthz(" Boss@Example.com , other@x.com ");
		signedInAs("boss@example.com");

		await expect(getSubject()).resolves.toMatchObject({ roles: ["admin"] });
	});

	it("makes nobody an admin when ADMIN_EMAILS is unset", async () => {
		const { getSubject } = await loadAuthz(undefined);
		signedInAs("boss@example.com");

		await expect(getSubject()).resolves.toMatchObject({ roles: ["viewer"] });
	});

	it("returns null when signed out", async () => {
		const { getSubject } = await loadAuthz("boss@example.com");
		cookieStore.get.mockReturnValue(undefined);

		await expect(getSubject()).resolves.toBeNull();
		expect(thia.verifySession).not.toHaveBeenCalled();
	});

	it("returns null for a forged or expired token", async () => {
		const { getSubject } = await loadAuthz("boss@example.com");
		cookieStore.get.mockReturnValue({ value: "tampered" });
		thia.verifySession.mockRejectedValue(new Error("signature mismatch"));

		await expect(getSubject()).resolves.toBeNull();
	});

	it("returns null when the token's user no longer exists", async () => {
		const { getSubject } = await loadAuthz("boss@example.com");
		cookieStore.get.mockReturnValue({ value: "jwt.value" });
		thia.verifySession.mockResolvedValue({ sub: "01GONE000000000000000000" });
		thia.uow.users.getById.mockResolvedValue(null);

		await expect(getSubject()).resolves.toBeNull();
	});
});

describe("authorizer", () => {
	it("allows admin.view only for admins", async () => {
		const { authorizer } = await loadAuthz("boss@example.com");
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
