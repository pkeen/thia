import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	USER_ID,
	aUser,
	authenticated,
	unauthenticated,
	unavailable,
} from "./support/sessions";

const thia = vi.hoisted(() => ({
	validateSession: vi.fn(),
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

function signedInAs(assignedRoles: string[] = [], mode?: "jwt-stateless" | "jwt-user-validated") {
	thia.roleStore.getRoles.mockResolvedValue(assignedRoles);
	cookieStore.get.mockReturnValue({ value: "jwt.value" });
	thia.validateSession.mockResolvedValue(authenticated(mode, aUser("boss@example.com")));
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getSubject", () => {
	it("uses the roles assigned in the database", async () => {
		const { getSubject } = await loadAuthz();
		signedInAs(["admin"]);

		await expect(getSubject()).resolves.toEqual({ id: USER_ID, roles: ["admin"] });
		expect(thia.roleStore.getRoles).toHaveBeenCalledWith(USER_ID);
	});

	it("passes through several assigned roles", async () => {
		const { getSubject } = await loadAuthz();
		signedInAs(["editor", "admin"]);

		await expect(getSubject()).resolves.toMatchObject({
			roles: ["editor", "admin"],
		});
	});

	it("falls back to viewer when nothing is assigned", async () => {
		const { getSubject } = await loadAuthz();
		signedInAs([]);

		await expect(getSubject()).resolves.toMatchObject({ roles: ["viewer"] });
	});

	it("validates the session cookie with the core validator", async () => {
		const { getSubject } = await loadAuthz();
		signedInAs();

		await getSubject();
		expect(thia.validateSession).toHaveBeenCalledWith("jwt.value");
		// Authentication loaded the user already; authz doesn't query it again.
		expect(thia.uow.users.getById).not.toHaveBeenCalled();
	});

	it("reads current roles from the database in stateless mode too", async () => {
		const { getSubject } = await loadAuthz();
		signedInAs(["admin"], "jwt-stateless");

		await expect(getSubject()).resolves.toEqual({ id: USER_ID, roles: ["admin"] });
		expect(thia.roleStore.getRoles).toHaveBeenCalledWith(USER_ID);
		expect(thia.uow.users.getById).not.toHaveBeenCalled();
	});

	it("returns null when signed out, without querying roles", async () => {
		const { getSubject } = await loadAuthz();
		cookieStore.get.mockReturnValue(undefined);
		thia.validateSession.mockResolvedValue(unauthenticated("missing_token"));

		await expect(getSubject()).resolves.toBeNull();
		expect(thia.validateSession).toHaveBeenCalledWith(undefined);
		expect(thia.roleStore.getRoles).not.toHaveBeenCalled();
	});

	it.each(["invalid_token", "user_not_found", "token_revoked"] as const)(
		"returns null for an unauthenticated session (%s)",
		async (reason) => {
			const { getSubject } = await loadAuthz();
			cookieStore.get.mockReturnValue({ value: "jwt.value" });
			thia.validateSession.mockResolvedValue(unauthenticated(reason));

			await expect(getSubject()).resolves.toBeNull();
			expect(thia.roleStore.getRoles).not.toHaveBeenCalled();
		}
	);

	it("throws, rather than signing out, when the session can't be validated", async () => {
		const { getSubject } = await loadAuthz();
		const { AuthUnavailableError } = await import("@/current-session");
		cookieStore.get.mockReturnValue({ value: "jwt.value" });
		thia.validateSession.mockResolvedValue(unavailable());

		await expect(getSubject()).rejects.toBeInstanceOf(AuthUnavailableError);
		expect(thia.roleStore.getRoles).not.toHaveBeenCalled();
	});

	it("throws, rather than granting the default role, when the role lookup fails", async () => {
		const { getSubject } = await loadAuthz();
		const { AuthUnavailableError } = await import("@/current-session");
		signedInAs();
		thia.roleStore.getRoles.mockRejectedValue(new Error("db down"));

		await expect(getSubject()).rejects.toBeInstanceOf(AuthUnavailableError);
	});
});

describe("authorizer", () => {
	it("allows admin.view only for admins", async () => {
		const { authorizer } = await loadAuthz();
		const subject = (roles: string[]) => ({ id: "u1", roles });

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
