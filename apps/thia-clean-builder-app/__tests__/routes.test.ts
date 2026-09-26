import { describe, it, expect, vi, beforeEach } from "vitest";
import { asUserId, EmailAddress, User } from "@thia/core";
import { SESSION_COOKIE_NAME } from "@/session";

// The login and callback routes are covered end to end, with real
// encryption and mocked provider HTTP, in oauth-flow.test.ts.

const thia = vi.hoisted(() => ({
	verifySession: vi.fn(),
	uow: { users: { getById: vi.fn() } },
}));
vi.mock("@/thia", () => ({ thia }));

const cookieStore = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const { POST: logout } = await import("@/app/api/thia/logout/route");
const { GET: me } = await import("@/app/api/thia/me/route");

const user = () => {
	const u = User.create({
		id: asUserId("01USER0000000000000000000"),
		email: EmailAddress.create("a@example.com"),
		name: "Ada",
		image: "https://example.com/a.png",
	});
	return u;
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("POST /api/thia/logout", () => {
	it("clears the session and returns home", async () => {
		const res = await logout(new Request("http://app/api/thia/logout"));

		expect(res.headers.get("location")).toBe("http://app/");
		const cookie = res.cookies.get(SESSION_COOKIE_NAME);
		expect(cookie?.value).toBe("");
		expect(cookie?.maxAge).toBe(0);
	});
});

describe("GET /api/thia/me", () => {
	it("returns the signed-in user", async () => {
		cookieStore.get.mockReturnValue({ value: "jwt.value" });
		thia.verifySession.mockResolvedValue({ sub: "01USER0000000000000000000" });
		thia.uow.users.getById.mockResolvedValue(user());

		const res = await me();

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			user: {
				id: "01USER0000000000000000000",
				email: "a@example.com",
				name: "Ada",
				image: "https://example.com/a.png",
			},
		});
	});

	it("rejects a request with no session", async () => {
		cookieStore.get.mockReturnValue(undefined);

		const res = await me();

		expect(res.status).toBe(401);
		await expect(res.json()).resolves.toEqual({ user: null });
		expect(thia.verifySession).not.toHaveBeenCalled();
	});

	it("rejects a forged or expired session token", async () => {
		cookieStore.get.mockReturnValue({ value: "tampered" });
		thia.verifySession.mockRejectedValue(new Error("signature mismatch"));

		const res = await me();

		expect(res.status).toBe(401);
		await expect(res.json()).resolves.toEqual({ user: null });
	});

	it("rejects a valid token whose user no longer exists", async () => {
		cookieStore.get.mockReturnValue({ value: "jwt.value" });
		thia.verifySession.mockResolvedValue({ sub: "01GONE000000000000000000" });
		thia.uow.users.getById.mockResolvedValue(null);

		const res = await me();

		expect(res.status).toBe(401);
		await expect(res.json()).resolves.toEqual({ user: null });
	});
});
