import { describe, it, expect, vi, beforeEach } from "vitest";
import { SESSION_COOKIE_NAME } from "@/session";
import { isSameOriginRequest } from "@/same-origin";
import {
	USER_ID,
	aUser,
	authenticated,
	unauthenticated,
	unavailable,
} from "./support/sessions";

// The login and callback routes, and these routes against real tokens, are
// covered end to end in oauth-flow.test.ts and session-policy.test.ts.

const thia = vi.hoisted(() => ({
	validateSession: vi.fn(),
	signOutEverywhere: vi.fn(),
	uow: { users: { getById: vi.fn() } },
}));
vi.mock("@/thia", () => ({ thia }));

const cookieStore = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const { POST: logout } = await import("@/app/api/thia/logout/route");
const { GET: me } = await import("@/app/api/thia/me/route");
const { POST: signOutEverywhere } = await import(
	"@/app/api/thia/sign-out-everywhere/route"
);

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
	cookieStore.get.mockReturnValue({ value: "jwt.value" });
});

describe("POST /api/thia/logout", () => {
	it("clears the session and returns home", async () => {
		const res = await logout(new Request("http://app/api/thia/logout"));

		expect(res.headers.get("location")).toBe("http://app/");
		const cookie = res.cookies.get(SESSION_COOKIE_NAME);
		expect(cookie?.value).toBe("");
		expect(cookie?.maxAge).toBe(0);
	});

	it("revokes nothing server-side", async () => {
		await logout(new Request("http://app/api/thia/logout"));
		expect(thia.signOutEverywhere).not.toHaveBeenCalled();
	});
});

describe("GET /api/thia/me", () => {
	const profile = {
		id: USER_ID,
		email: "a@example.com",
		name: "Ada",
		image: "https://example.com/a.png",
	};

	it("returns the user loaded by user-validated authentication, without a second query", async () => {
		thia.validateSession.mockResolvedValue(authenticated("jwt-user-validated"));

		const res = await me();

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ user: profile });
		expect(thia.validateSession).toHaveBeenCalledWith("jwt.value");
		expect(thia.uow.users.getById).not.toHaveBeenCalled();
	});

	it("fetches the profile for a stateless session", async () => {
		thia.validateSession.mockResolvedValue(authenticated("jwt-stateless"));
		thia.uow.users.getById.mockResolvedValue(aUser());

		const res = await me();

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ user: profile });
		expect(thia.uow.users.getById).toHaveBeenCalledTimes(1);
	});

	it("reports a missing profile for a still-valid stateless session", async () => {
		thia.validateSession.mockResolvedValue(authenticated("jwt-stateless"));
		thia.uow.users.getById.mockResolvedValue(null);

		const res = await me();

		expect(res.status).toBe(404);
		await expect(res.json()).resolves.toEqual({ user: null, error: "profile_not_found" });
	});

	it.each(["missing_token", "invalid_token", "user_not_found", "token_revoked"] as const)(
		"rejects an unauthenticated request (%s) with 401",
		async (reason) => {
			thia.validateSession.mockResolvedValue(unauthenticated(reason));

			const res = await me();

			expect(res.status).toBe(401);
			await expect(res.json()).resolves.toEqual({ user: null });
		}
	);

	it("answers 503, not 401, when the session can't be validated", async () => {
		thia.validateSession.mockResolvedValue(unavailable());

		const res = await me();

		expect(res.status).toBe(503);
		await expect(res.json()).resolves.toEqual({ error: "service_unavailable" });
	});

	it("answers 503 when a stateless session's profile lookup fails", async () => {
		thia.validateSession.mockResolvedValue(authenticated("jwt-stateless"));
		thia.uow.users.getById.mockRejectedValue(new Error("db down"));

		expect((await me()).status).toBe(503);
	});

	it("never logs the underlying error message", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		thia.validateSession.mockResolvedValue({
			status: "unavailable",
			reason: "user_lookup_failed",
			cause: new Error("password authentication failed for secret@example.com"),
		});

		await me();

		expect(JSON.stringify(error.mock.calls)).not.toContain("secret@example.com");
	});
});

describe("POST /api/thia/sign-out-everywhere", () => {
	const post = (headers: Record<string, string> = { origin: "http://app" }, init: RequestInit = {}) =>
		signOutEverywhere(
			new Request("http://app/api/thia/sign-out-everywhere", { method: "POST", headers, ...init })
		);

	it("revokes the validated session's user, clears this cookie and redirects home", async () => {
		const validated = authenticated("jwt-user-validated");
		thia.validateSession.mockResolvedValue(validated);
		thia.signOutEverywhere.mockResolvedValue({ status: "revoked", tokenVersion: 1 });

		const res = await post();

		expect(res.status).toBe(303);
		expect(res.headers.get("location")).toBe("http://app/?signed_out=everywhere");
		expect(res.cookies.get(SESSION_COOKIE_NAME)?.maxAge).toBe(0);
		expect(thia.signOutEverywhere).toHaveBeenCalledWith(
			validated.status === "authenticated" && validated.session
		);
	});

	it("ignores any user id in the request", async () => {
		thia.validateSession.mockResolvedValue(authenticated());
		thia.signOutEverywhere.mockResolvedValue({ status: "revoked", tokenVersion: 1 });

		await signOutEverywhere(
			new Request("http://app/api/thia/sign-out-everywhere?userId=01VICTIM", {
				method: "POST",
				headers: { origin: "http://app", "content-type": "application/x-www-form-urlencoded" },
				body: "userId=01VICTIM",
			})
		);

		const [session] = thia.signOutEverywhere.mock.calls[0];
		expect(session.identity.userId).toBe(USER_ID);
	});

	it("accepts a same-origin request without Origin when the browser says so", async () => {
		thia.validateSession.mockResolvedValue(authenticated());
		thia.signOutEverywhere.mockResolvedValue({ status: "revoked", tokenVersion: 1 });

		expect((await post({ "sec-fetch-site": "same-origin" })).status).toBe(303);
	});

	it.each([
		["another site's Origin", { origin: "https://evil.example" }],
		["a different port", { origin: "http://app:8080" }],
		["Origin: null", { origin: "null" }],
		["a cross-site fetch without Origin", { "sec-fetch-site": "cross-site" }],
		["no Origin or Sec-Fetch-Site", {}],
	])("refuses %s with 403 before touching the session", async (_label, headers) => {
		const res = await post(headers as Record<string, string>);

		expect(res.status).toBe(403);
		await expect(res.json()).resolves.toEqual({ error: "cross_origin_request" });
		expect(thia.validateSession).not.toHaveBeenCalled();
		expect(thia.signOutEverywhere).not.toHaveBeenCalled();
		expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
	});

	it("refuses an unauthenticated caller with 401", async () => {
		thia.validateSession.mockResolvedValue(unauthenticated("token_revoked"));

		const res = await post();

		expect(res.status).toBe(401);
		expect(thia.signOutEverywhere).not.toHaveBeenCalled();
	});

	it("reports unsupported in stateless mode and keeps the cookie", async () => {
		thia.validateSession.mockResolvedValue(authenticated("jwt-stateless"));
		thia.signOutEverywhere.mockResolvedValue({ status: "unsupported", mode: "jwt-stateless" });

		const res = await post();

		expect(res.status).toBe(409);
		await expect(res.json()).resolves.toEqual({ error: "global_sign_out_unsupported" });
		expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
	});

	it("keeps the cookie and answers 503 when revocation fails", async () => {
		thia.validateSession.mockResolvedValue(authenticated());
		thia.signOutEverywhere.mockRejectedValue(new Error("db down"));

		const res = await post();

		expect(res.status).toBe(503);
		expect(res.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
	});

	it("answers 503 when the session can't be validated", async () => {
		thia.validateSession.mockResolvedValue(unavailable());

		expect((await post()).status).toBe(503);
		expect(thia.signOutEverywhere).not.toHaveBeenCalled();
	});

	it("clears the cookie of a user deleted mid-request", async () => {
		thia.validateSession.mockResolvedValue(authenticated());
		thia.signOutEverywhere.mockResolvedValue({ status: "user_not_found" });

		const res = await post();

		expect(res.status).toBe(401);
		expect(res.cookies.get(SESSION_COOKIE_NAME)?.maxAge).toBe(0);
	});
});

describe("isSameOriginRequest", () => {
	const req = (headers: Record<string, string>) =>
		new Request("https://app.example/x", { method: "POST", headers });

	it("accepts a matching Origin", () => {
		expect(isSameOriginRequest(req({ origin: "https://app.example" }))).toBe(true);
	});

	it("rejects a scheme downgrade", () => {
		expect(isSameOriginRequest(req({ origin: "http://app.example" }))).toBe(false);
	});

	it("prefers Origin over Sec-Fetch-Site", () => {
		expect(
			isSameOriginRequest(req({ origin: "https://evil.example", "sec-fetch-site": "same-origin" }))
		).toBe(false);
	});

	it("does not treat same-site as same-origin", () => {
		expect(isSameOriginRequest(req({ "sec-fetch-site": "same-site" }))).toBe(false);
	});
});
