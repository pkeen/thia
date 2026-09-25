import { describe, it, expect, vi, beforeEach } from "vitest";
import { asUserId, EmailAddress, Keycard, User } from "@thia/core";
import { SESSION_COOKIE_NAME } from "@/session";

const thia = vi.hoisted(() => ({
	redirectUriFor: vi.fn(),
	beginLogin: vi.fn(),
	completeLogin: vi.fn(),
	verifySession: vi.fn(),
	uow: { users: { getById: vi.fn() } },
}));
vi.mock("@/thia", () => ({ thia }));

const cookieStore = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const { GET: beginLogin } = await import("@/app/api/thia/login/[provider]/route");
const { GET: callback } = await import("@/app/api/thia/redirect/[provider]/route");
const { POST: logout } = await import("@/app/api/thia/logout/route");
const { GET: me } = await import("@/app/api/thia/me/route");

const params = (provider: string) => ({ params: Promise.resolve({ provider }) });

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

describe("GET /api/thia/login/[provider]", () => {
	it("redirects to the provider's authorization page", async () => {
		thia.redirectUriFor.mockReturnValue("http://app/api/thia/redirect/github");
		thia.beginLogin.mockResolvedValue({
			authorizationUrl: "https://github.com/login/oauth/authorize?state=s",
		});

		const res = await beginLogin(new Request("http://app"), params("github"));

		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toBe(
			"https://github.com/login/oauth/authorize?state=s"
		);
		expect(thia.beginLogin).toHaveBeenCalledWith(
			"github",
			"http://app/api/thia/redirect/github"
		);
	});

	it("rejects a provider that isn't configured, without starting a login", async () => {
		thia.redirectUriFor.mockReturnValue(undefined);

		const res = await beginLogin(new Request("http://app"), params("myspace"));

		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "unknown_provider" });
		expect(thia.beginLogin).not.toHaveBeenCalled();
	});
});

describe("GET /api/thia/redirect/[provider]", () => {
	const callbackUrl = "http://app/api/thia/redirect/github?code=c&state=s";

	it("signs the user in and stores the session", async () => {
		const keycard = Keycard.create({ type: "access", value: "jwt.value" });
		thia.completeLogin.mockResolvedValue({ keycards: [keycard] });

		const res = await callback(new Request(callbackUrl), params("github"));

		expect(thia.completeLogin).toHaveBeenCalledWith("github", "c", "s");
		expect(res.headers.get("location")).toBe("http://app/");
		expect(res.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("jwt.value");
	});

	it.each([
		["no code", "http://app/api/thia/redirect/github?state=s"],
		["no state", "http://app/api/thia/redirect/github?code=c"],
	])("rejects a callback with %s", async (_label, url) => {
		const res = await callback(new Request(url), params("github"));

		expect(res.status).toBe(400);
		expect(thia.completeLogin).not.toHaveBeenCalled();
	});

	it("sends a refused account link back to the login page", async () => {
		thia.completeLogin.mockRejectedValue(new Error("ACCOUNT_LINK_CONFLICT"));

		const res = await callback(new Request(callbackUrl), params("github"));

		expect(res.headers.get("location")).toBe(
			"http://app/thia/login?error=account_exists"
		);
		expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
	});

	it("does not start a session when sign-in fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		thia.completeLogin.mockRejectedValue(new Error("boom"));

		const res = await callback(new Request(callbackUrl), params("github"));

		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({
			error: "authentication_failed",
		});
		expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
	});
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
