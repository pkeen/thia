/**
 * Session policies end to end: real login through the fake providers, real
 * signed tokens and cookies, and the real pages and API routes validating
 * them (see support/app-harness.ts). Storage is in memory; the Postgres
 * concurrency guarantees are tested in @thia/adapters-drizzle.
 */
import { describe, it, expect, vi } from "vitest";
import type { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/session";
import {
	APP,
	ENV,
	Browser,
	actAs,
	alice,
	bootApp,
	github,
	shared,
	startLogin,
	useHarness,
	type App,
	type Identity,
} from "./support/app-harness";

vi.mock("@/db", () => ({ default: {} }));
const cookieStore = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
useHarness(cookieStore);

const STATELESS = { THIA_SESSION_MODE: "jwt-stateless" };
const bob: Identity = { id: "2002", email: "bob@example.com", verified: true, name: "bob" };

/** Signs `browser` in through GitHub; returns the callback response. */
async function login(app: App, browser: Browser, who: Identity = alice) {
	const url = await startLogin(app, browser, "github");
	return browser.receive(await app.callback("github", browser, github.approve(url, who)));
}

const token = (browser: Browser) => browser.jar.get(SESSION_COOKIE_NAME);
const claimsOf = (jwt: string) =>
	JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()) as {
		sub: string;
		iat: number;
		exp: number;
		uvn: number;
	};
async function userId(browser: Browser) {
	return claimsOf(token(browser)!).sub;
}
async function storedVersion(browser: Browser) {
	const { asUserId } = await import("@thia/core");
	return (await shared.users.getById(asUserId(await userId(browser))))!.tokenVersion();
}
/** A browser that has somehow obtained a copy of another's session cookie. */
function copyOf(browser: Browser) {
	const thief = new Browser();
	thief.jar.set(SESSION_COOKIE_NAME, token(browser)!);
	return thief;
}
function deleteUser(id: string) {
	// The in-memory repository has no delete; drop the row like a DELETE would.
	(shared.users as unknown as { byId: Map<string, unknown> }).byId.delete(id);
}
const cookieOf = (res: NextResponse) => res.cookies.get(SESSION_COOKIE_NAME);
/** Each boot has its own module graph, so match the error by name, not class. */
const unavailable = { name: "AuthUnavailableError" };

describe("configuration", () => {
	it("defaults to user-validated sessions lasting 30 minutes", async () => {
		const app = await bootApp();
		expect(app.thia.sessionPolicy).toEqual({ mode: "jwt-user-validated", ttlSec: 1800 });
	});

	it.each([
		[{}, 1800],
		[{ THIA_SESSION_TTL_SEC: "600" }, 600],
		[{ THIA_SESSION_TTL_SEC: "86400", ...STATELESS }, 86400],
	])("applies the configured lifetime (%j) to both token and cookie expiry", async (env, ttl) => {
		const app = await bootApp(env);
		const browser = new Browser();
		const res = await login(app, browser);

		const claims = claimsOf(token(browser)!);
		expect(claims.exp - claims.iat).toBe(ttl);
		expect(cookieOf(res)?.expires).toEqual(new Date(claims.exp * 1000));
	});

	it.each([
		["an unknown mode", { THIA_SESSION_MODE: "database" }],
		["a mode in the wrong case", { THIA_SESSION_MODE: "JWT-STATELESS" }],
		["a zero lifetime", { THIA_SESSION_TTL_SEC: "0" }],
		["a lifetime below the minimum", { THIA_SESSION_TTL_SEC: "59" }],
		["a lifetime above the maximum", { THIA_SESSION_TTL_SEC: "86401" }],
		["a negative lifetime", { THIA_SESSION_TTL_SEC: "-60" }],
		["a fractional lifetime", { THIA_SESSION_TTL_SEC: "60.5" }],
		["an exponent", { THIA_SESSION_TTL_SEC: "1e3" }],
		["hex", { THIA_SESSION_TTL_SEC: "0x3c" }],
		["padding", { THIA_SESSION_TTL_SEC: " 600" }],
	])("refuses to start with %s", async (_label, env) => {
		const { createThia } = await vi.importActual<typeof import("@/thia")>("@/thia");
		expect(() =>
			createThia({ env: { ...ENV, ...env }, users: shared.users, roleStore: {} as never })
		).toThrow(/INVALID_SESSION_POLICY/);
	});

	it("treats blank settings as unset", async () => {
		const { sessionPolicyFromEnv } = await vi.importActual<typeof import("@/thia")>("@/thia");
		// Refresh off: the Sprint 001 defaults (refresh defaults are covered in refresh.test.ts).
		expect(
			sessionPolicyFromEnv({ THIA_SESSION_MODE: "", THIA_SESSION_TTL_SEC: "", THIA_SESSION_REFRESH: "off" })
		).toEqual({
			mode: "jwt-user-validated",
			ttlSec: 1800,
		});
	});
});

describe("sign out everywhere (user-validated)", () => {
	it("invalidates every existing session on its next request; logging in again works", async () => {
		const app = await bootApp();
		const laptop = new Browser();
		const phone = new Browser();
		await login(app, laptop);
		await login(app, phone);
		const laptopCopy = copyOf(laptop);
		expect((await app.me(laptop)).status).toBe(200);
		expect((await app.me(phone)).status).toBe(200);

		const res = laptop.receive(await app.signOutEverywhere(laptop));

		expect(res.status).toBe(303);
		expect(res.headers.get("location")).toBe(`${APP}/?signed_out=everywhere`);
		expect(token(laptop)).toBeUndefined();
		expect(await app.home(laptop, { signed_out: "everywhere" })).toContain("signed out of this app on all devices");
		// The other device and a copied token are both refused now.
		expect((await app.me(phone)).status).toBe(401);
		expect((await app.me(laptopCopy)).status).toBe(401);
		expect(await app.admin(phone)).toBe(401);

		// A new login issues the new version and works normally.
		await login(app, laptop);
		expect(claimsOf(token(laptop)!).uvn).toBe(1);
		expect((await app.me(laptop)).status).toBe(200);
		expect((await app.me(phone)).status).toBe(401);
	});

	it("applies on other app instances sharing the database", async () => {
		const a = await bootApp();
		const laptop = new Browser();
		const phone = new Browser();
		await login(a, laptop);
		await login(a, phone);

		await a.signOutEverywhere(laptop);

		const b = await bootApp();
		expect((await b.me(phone)).status).toBe(401);
	});

	it("revokes only the caller, whatever user id the request names", async () => {
		const app = await bootApp();
		const aliceBrowser = new Browser();
		const bobBrowser = new Browser();
		await login(app, aliceBrowser, alice);
		await login(app, bobBrowser, bob);
		const bobId = await userId(bobBrowser);

		const res = await app.signOutEverywhere(aliceBrowser, {
			query: `?userId=${bobId}`,
			headers: { origin: APP, "content-type": "application/json" },
			body: JSON.stringify({ userId: bobId, sub: bobId }),
		});

		expect(res.status).toBe(303);
		expect((await app.me(bobBrowser)).status).toBe(200);
		expect(await storedVersion(bobBrowser)).toBe(0);
		expect((await app.me(copyOf(aliceBrowser))).status).toBe(401);
	});

	it.each([
		["another site", { origin: "https://evil.example" }],
		["Origin: null", { origin: "null" }],
		["no origin information", {}],
		["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
	])("refuses a request from %s and changes nothing", async (_label, headers) => {
		const app = await bootApp();
		const browser = new Browser();
		await login(app, browser);

		const res = browser.receive(await app.signOutEverywhere(browser, { headers }));

		expect(res.status).toBe(403);
		expect(token(browser)).toBeDefined();
		expect(await storedVersion(browser)).toBe(0);
		expect((await app.me(browser)).status).toBe(200);
	});

	it("refuses unauthenticated callers, changing nobody's version", async () => {
		const app = await bootApp();
		const victim = new Browser();
		await login(app, victim);

		const anonymous = new Browser();
		const forged = new Browser();
		forged.jar.set(SESSION_COOKIE_NAME, "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.");
		for (const caller of [anonymous, forged]) {
			const res = await app.signOutEverywhere(caller, {
				headers: { origin: APP },
				body: JSON.stringify({ userId: await userId(victim) }),
			});
			expect(res.status).toBe(401);
		}
		expect(await storedVersion(victim)).toBe(0);
		expect((await app.me(victim)).status).toBe(200);
	});

	it("keeps the cookie and reports 503 if the revocation can't be stored", async () => {
		const app = await bootApp();
		const browser = new Browser();
		await login(app, browser);
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(shared.users, "incrementTokenVersion").mockRejectedValue(new Error("db down"));

		const res = browser.receive(await app.signOutEverywhere(browser));

		expect(res.status).toBe(503);
		expect(token(browser)).toBeDefined();
	});
});

describe("ordinary sign-out", () => {
	it.each([{}, STATELESS])("clears only this browser's cookie (%j)", async (env) => {
		const app = await bootApp(env);
		const laptop = new Browser();
		const phone = new Browser();
		await login(app, laptop);
		await login(app, phone);
		const laptopCopy = copyOf(laptop);

		laptop.receive(await app.logout(laptop));

		expect(token(laptop)).toBeUndefined();
		expect((await app.me(laptop)).status).toBe(401);
		expect((await app.me(phone)).status).toBe(200);
		expect(await storedVersion(phone)).toBe(0);
		// Documented: local sign-out doesn't invalidate a copied token.
		expect((await app.me(laptopCopy)).status).toBe(200);
	});
});

describe("stateless mode", () => {
	it("reports sign out everywhere as unsupported and changes nothing", async () => {
		const app = await bootApp(STATELESS);
		const browser = new Browser();
		await login(app, browser);
		const increment = vi.spyOn(shared.users, "incrementTokenVersion");

		const res = browser.receive(await app.signOutEverywhere(browser));

		expect(res.status).toBe(409);
		await expect(res.json()).resolves.toEqual({ error: "global_sign_out_unsupported" });
		expect(token(browser)).toBeDefined();
		expect(increment).not.toHaveBeenCalled();
		expect(await app.home(browser)).not.toContain("/api/thia/sign-out-everywhere");
	});

	it("authenticates without reading users", async () => {
		const app = await bootApp(STATELESS);
		const browser = new Browser();
		await login(app, browser);
		const getById = vi.spyOn(shared.users, "getById");

		const result = await app.thia.validateSession(token(browser));

		expect(result).toMatchObject({ status: "authenticated", session: { mode: "jwt-stateless" } });
		expect(getById).not.toHaveBeenCalled();
		// Authorization still reads current roles from storage.
		actAs(browser);
		await expect(app.authz.getSubject()).resolves.toMatchObject({ roles: ["viewer"] });
		expect(getById).not.toHaveBeenCalled();
	});

	it("keeps a deleted user's session valid until expiry (documented limit)", async () => {
		const app = await bootApp(STATELESS);
		const browser = new Browser();
		await login(app, browser);
		deleteUser(await userId(browser));

		const me = await app.me(browser);
		expect(me.status).toBe(404);
		await expect(me.json()).resolves.toMatchObject({ error: "profile_not_found" });
		expect(await app.home(browser)).toContain("no profile found");
	});
});

describe("switching policy", () => {
	it("to user-validated subjects existing tokens to the version check", async () => {
		const stateless = await bootApp(STATELESS);
		const browser = new Browser();
		await login(stateless, browser);
		const { asUserId } = await import("@thia/core");
		await shared.users.incrementTokenVersion(asUserId(await userId(browser)));
		expect((await stateless.me(browser)).status).toBe(200);

		const validated = await bootApp();
		expect((await validated.me(browser)).status).toBe(401);
	});

	it("to stateless makes a revoked, unexpired token usable again (documented; rotate AUTH_SECRET to prevent)", async () => {
		const validated = await bootApp();
		const laptop = new Browser();
		const phone = new Browser();
		await login(validated, laptop);
		await login(validated, phone);
		await validated.signOutEverywhere(laptop);
		expect((await validated.me(phone)).status).toBe(401);

		expect((await (await bootApp(STATELESS)).me(phone)).status).toBe(200);

		// The documented migration: a new signing key rejects every old token.
		const rotated = await bootApp({
			...STATELESS,
			AUTH_SECRET: "a-rotated-secret-that-is-at-least-32-bytes",
		});
		expect((await rotated.me(phone)).status).toBe(401);
	});
});

describe("database failures fail closed", () => {
	it("user-validated: 503 from APIs, error pages, never signed-out or stateless", async () => {
		const app = await bootApp();
		const browser = new Browser();
		await login(app, browser);
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(shared.users, "getById").mockRejectedValue(new Error("connect ECONNREFUSED"));

		expect((await app.me(browser)).status).toBe(503);
		await expect(app.home(browser)).rejects.toMatchObject(unavailable);
		await expect(app.admin(browser)).rejects.toMatchObject(unavailable);
		const res = browser.receive(await app.signOutEverywhere(browser));
		expect(res.status).toBe(503);
		expect(token(browser)).toBeDefined();
	});

	it.each([{}, STATELESS])("a failed role lookup never grants the default role (%j)", async (env) => {
		const app = await bootApp(env);
		const browser = new Browser();
		await login(app, browser);
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(app.thia.roleStore, "getRoles").mockRejectedValue(new Error("db down"));

		actAs(browser);
		await expect(app.authz.getSubject()).rejects.toMatchObject(unavailable);
		await expect(app.admin(browser)).rejects.toMatchObject(unavailable);
	});
});

describe.each([
	["user-validated", {}],
	["stateless", STATELESS],
])("pages and APIs agree (%s)", (_mode, env) => {
	it("role changes take effect on the next check", async () => {
		const app = await bootApp(env);
		const browser = new Browser();
		await login(app, browser);
		const id = await userId(browser);
		expect(await app.admin(browser)).toBe(403);

		shared.roles.set(id, ["admin"]);
		expect(await app.admin(browser)).toContain("<h1>Admin</h1>");
		expect(await app.home(browser)).toContain('href="/thia/admin"');

		shared.roles.set(id, []);
		expect(await app.admin(browser)).toBe(403);
		// The same, unchanged token throughout: roles are never read from it.
	});

	const states: [string, () => Promise<Browser>, { me: number; admin: 401 | 403 }][] = [
		["a valid session", async () => {
			const b = new Browser();
			await login(await bootApp(env), b);
			return b;
		}, { me: 200, admin: 403 }],
		["no session", async () => new Browser(), { me: 401, admin: 401 }],
		["a forged token", async () => {
			const b = new Browser();
			b.jar.set(SESSION_COOKIE_NAME, "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad");
			return b;
		}, { me: 401, admin: 401 }],
		["a token signed with another key", async () => {
			const b = new Browser();
			await login(await bootApp({ ...env, AUTH_SECRET: "another-apps-secret-of-at-least-32-bytes" }), b);
			return b;
		}, { me: 401, admin: 401 }],
	];

	it.each(states)("with %s", async (_label, make, expected) => {
		const browser = await make();
		const app = await bootApp(env);

		expect((await app.me(browser)).status).toBe(expected.me);
		expect(await app.admin(browser)).toBe(expected.admin);
		const home = await app.home(browser);
		expect(home.includes("Signed in as")).toBe(expected.me === 200);
		expect(home.includes('href="/thia/login"')).toBe(expected.me !== 200);
	});
});
