/**
 * Refresh-token rotation end to end (Sprint 002, ADR-004): real OAuth login
 * through the fake providers, real tokens, proxy.ts renewal, and the real
 * pages and routes. Time is faked (Date only). Storage is in memory; the
 * Postgres guarantees are tested in @thia/adapters-drizzle.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { SESSION_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/session";
import {
	APP,
	ENV,
	Browser,
	REFRESH_ON,
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

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const STATELESS = { ...REFRESH_ON, THIA_SESSION_MODE: "jwt-stateless" };
const bob: Identity = { id: "2002", email: "bob@example.com", verified: true, name: "bob" };

afterEach(() => {
	vi.useRealTimers();
});

function freezeTime() {
	vi.useFakeTimers({ toFake: ["Date"], now: new Date("2030-06-01T12:00:00Z") });
}
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);

async function login(app: App, browser: Browser, who: Identity = alice) {
	const url = await startLogin(app, browser, "github");
	return browser.receive(await app.callback("github", browser, github.approve(url, who)));
}

const access = (b: Browser) => b.jar.get(SESSION_COOKIE_NAME);
const refreshCookie = (b: Browser) => b.jar.get(REFRESH_COOKIE_NAME);
const sessionIdOf = (b: Browser) => refreshCookie(b)!.split(".")[0];
const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
const copyOf = (b: Browser) => {
	const c = new Browser();
	c.jar = new Map(b.jar);
	return c;
};

/** What the page sees for this browser after proxy.ts has run. */
async function homeAfterProxy(app: App, browser: Browser) {
	const visit = await app.visit(browser, "/");
	if (visit.blocked) return { status: visit.blocked.status, html: "" };
	return { status: 200, html: await app.home(visit.view) };
}
const signedIn = (html: string) => html.includes("Signed in as");

describe("configuration", () => {
	it("defaults to user-validated, 10-minute access tokens renewed for 7 idle / 30 total days", async () => {
		const app = await bootApp({ THIA_SESSION_REFRESH: "" });
		expect(app.thia.sessionPolicy).toEqual({
			mode: "jwt-user-validated",
			ttlSec: 600,
			refresh: { idleTtlSec: 604800, absoluteTtlSec: 2592000 },
		});
	});

	it("applies overrides", async () => {
		const app = await bootApp({
			...REFRESH_ON,
			THIA_SESSION_TTL_SEC: "300",
			THIA_SESSION_REFRESH_IDLE_SEC: "3600",
			THIA_SESSION_REFRESH_ABSOLUTE_SEC: "86400",
		});
		expect(app.thia.sessionPolicy).toMatchObject({
			ttlSec: 300,
			refresh: { idleTtlSec: 3600, absoluteTtlSec: 86400 },
		});
	});

	it.each([
		["an unknown switch", { THIA_SESSION_REFRESH: "yes" }],
		["an access TTL over an hour", { ...REFRESH_ON, THIA_SESSION_TTL_SEC: "3601" }],
		["an idle TTL under an hour", { ...REFRESH_ON, THIA_SESSION_REFRESH_IDLE_SEC: "3599" }],
		["absolute shorter than idle", { ...REFRESH_ON, THIA_SESSION_REFRESH_IDLE_SEC: "86400", THIA_SESSION_REFRESH_ABSOLUTE_SEC: "3600" }],
		["an exponent", { ...REFRESH_ON, THIA_SESSION_REFRESH_IDLE_SEC: "1e5" }],
		["lifetimes set while refresh is off", { THIA_SESSION_REFRESH: "off", THIA_SESSION_REFRESH_IDLE_SEC: "3600" }],
	])("refuses to start with %s", async (_label, env) => {
		const { createThia } = await vi.importActual<typeof import("@/thia")>("@/thia");
		expect(() =>
			createThia({ env: { ...ENV, ...env }, users: shared.users, sessions: shared.sessions, roleStore: {} as never })
		).toThrow(/INVALID_SESSION_POLICY/);
	});
});

describe("login", () => {
	it("with refresh: sets both cookies and creates exactly one session", async () => {
		freezeTime();
		const app = await bootApp(REFRESH_ON);
		const browser = new Browser();
		const res = await login(app, browser);

		const a = res.cookies.get(SESSION_COOKIE_NAME)!;
		const r = res.cookies.get(REFRESH_COOKIE_NAME)!;
		expect(r).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
		expect(r.expires).toEqual(new Date(Date.now() + 7 * DAY));
		const c = claims(a.value);
		expect(c).toMatchObject({ ver: 2, sid: sessionIdOf(browser) });
		expect(c.exp - c.iat).toBe(600);
		expect(a.expires).toEqual(new Date(c.exp * 1000));

		const sessions = await shared.sessions.listActiveForUser(c.sub, new Date());
		expect(sessions).toHaveLength(1);
		expect(sessions[0].tokenHash).not.toContain(refreshCookie(browser)!.split(".")[1]);
	});

	it("without refresh: one access cookie, no refresh cookie, no session rows", async () => {
		const app = await bootApp();
		const browser = new Browser();
		const res = await login(app, browser);
		const create = vi.spyOn(shared.sessions, "create");

		expect(res.cookies.get(REFRESH_COOKIE_NAME)).toBeUndefined();
		expect(claims(access(browser)!)).toMatchObject({ ver: 1 });
		expect(claims(access(browser)!).sid).toBeUndefined();
		expect(await shared.sessions.listActiveForUser(claims(access(browser)!).sub, new Date())).toEqual([]);
		expect(create).not.toHaveBeenCalled();
	});
});

describe("renewal in proxy.ts", () => {
	it("leaves a fresh access token alone", async () => {
		freezeTime();
		const app = await bootApp(REFRESH_ON);
		const browser = new Browser();
		await login(app, browser);
		const refresh = vi.spyOn(app.thia, "refreshSession");

		expect(signedIn((await homeAfterProxy(app, browser)).html)).toBe(true);
		expect(refresh).not.toHaveBeenCalled();
	});

	it("renews an expired access token before the page renders, rotating the refresh token", async () => {
		freezeTime();
		const app = await bootApp(REFRESH_ON);
		const browser = new Browser();
		await login(app, browser);
		const [oldAccess, oldRefresh] = [access(browser), refreshCookie(browser)];

		advance(11 * MIN);
		const { html } = await homeAfterProxy(app, browser);

		expect(signedIn(html)).toBe(true);
		expect(access(browser)).not.toBe(oldAccess);
		expect(refreshCookie(browser)).not.toBe(oldRefresh);
		expect(sessionIdOf(browser)).toBe(oldRefresh!.split(".")[0]);
		// An API call made after renewal agrees.
		expect((await app.me(browser)).status).toBe(200);
	});

	it("renews shortly before expiry too", async () => {
		freezeTime();
		const app = await bootApp(REFRESH_ON);
		const browser = new Browser();
		await login(app, browser);
		const before = access(browser);
		advance(9.5 * MIN);
		await homeAfterProxy(app, browser);
		expect(access(browser)).not.toBe(before);
	});

	it("keeps a user signed in across days of activity, up to the absolute limit", async () => {
		freezeTime();
		const app = await bootApp({ ...REFRESH_ON, THIA_SESSION_REFRESH_IDLE_SEC: "172800", THIA_SESSION_REFRESH_ABSOLUTE_SEC: "432000" });
		const browser = new Browser();
		await login(app, browser);
		for (let day = 1; day <= 4; day++) {
			advance(DAY);
			expect(signedIn((await homeAfterProxy(app, browser)).html)).toBe(true);
		}
		advance(DAY + MIN);
		expect(signedIn((await homeAfterProxy(app, browser)).html)).toBe(false);
	});

	it("an idle session ends; cookies are cleared and renewal doesn't loop", async () => {
		freezeTime();
		const app = await bootApp(REFRESH_ON);
		const browser = new Browser();
		await login(app, browser);
		advance(7 * DAY + MIN);
		const refresh = vi.spyOn(app.thia, "refreshSession");

		const first = await homeAfterProxy(app, browser);
		expect(first.status).toBe(200);
		expect(signedIn(first.html)).toBe(false);
		expect(refreshCookie(browser)).toBeUndefined();
		expect(access(browser)).toBeUndefined();

		await homeAfterProxy(app, browser);
		await homeAfterProxy(app, browser);
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("concurrent requests with the same cookies: one rotates, the other gets grace, nobody is signed out", async () => {
		freezeTime();
		const app = await bootApp(REFRESH_ON);
		const tab1 = new Browser();
		await login(app, tab1);
		advance(11 * MIN);
		const tab2 = copyOf(tab1);
		const original = refreshCookie(tab1);
		const refresh = vi.spyOn(app.thia, "refreshSession");

		const [a, b] = await Promise.all([homeAfterProxy(app, tab1), homeAfterProxy(app, tab2)]);

		expect(signedIn(a.html)).toBe(true);
		expect(signedIn(b.html)).toBe(true);
		const outcomes = await Promise.all(refresh.mock.results.map((r) => r.value));
		expect(outcomes.map((o) => o.status).sort()).toEqual(["grace", "refreshed"]);
		// Only the winner received a new refresh cookie; the chain didn't fork.
		expect([refreshCookie(tab1), refreshCookie(tab2)].filter((c) => c !== original)).toHaveLength(1);
		const stored = await shared.sessions.getById(sessionIdOf(tab1));
		expect(stored!.revokedAt).toBeNull();
	});

	it("reuse of a replaced refresh token after the grace window ends the session everywhere it's used", async () => {
		freezeTime();
		const app = await bootApp(REFRESH_ON);
		const victim = new Browser();
		await login(app, victim);
		const thief = copyOf(victim); // stolen cookies

		advance(11 * MIN);
		await homeAfterProxy(app, victim); // victim rotates
		advance(MIN);
		const stolen = await homeAfterProxy(app, thief); // replay after grace

		expect(signedIn(stolen.html)).toBe(false);
		const stored = await shared.sessions.getById(sessionIdOf(victim));
		expect(stored!.revokedReason).toBe("reuse_detected");
		// User-validated: the victim's current access token dies immediately too.
		expect((await app.me(victim)).status).toBe(401);
	});

	it("storage outage: passes through while the access token is valid, else 503 (never a false signed-out)", async () => {
		freezeTime();
		const app = await bootApp(REFRESH_ON);
		const browser = new Browser();
		await login(app, browser);
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(shared.sessions, "getById").mockRejectedValue(new Error("db down"));

		advance(9.5 * MIN); // inside the renewal window, token still valid
		const visit = await app.visit(browser, "/");
		expect(visit.blocked).toBeUndefined();

		advance(MIN); // now expired
		const blocked = await app.visit(browser, "/");
		expect(blocked.blocked?.status).toBe(503);
		expect(refreshCookie(browser)).toBeDefined();
	});
});

describe("tokens issued before refresh was enabled", () => {
	it("stay valid until they expire, then the user signs in once", async () => {
		freezeTime();
		const before = await bootApp();
		const browser = new Browser();
		await login(before, browser);

		const after = await bootApp(REFRESH_ON);
		expect((await after.me(browser)).status).toBe(200);
		expect(signedIn((await homeAfterProxy(after, browser)).html)).toBe(true);

		advance(31 * MIN);
		expect((await after.me(browser)).status).toBe(401);
		await login(after, browser);
		expect(refreshCookie(browser)).toBeDefined();
	});
});

describe("devices", () => {
	it("lists sessions and signs another device out on its next request", async () => {
		freezeTime();
		const app = await bootApp(REFRESH_ON);
		const laptop = new Browser();
		const phone = new Browser();
		await login(app, laptop);
		advance(MIN);
		await login(app, phone);

		const html = await app.devices(phone);
		expect(html).toContain("(this device)");
		expect((html as string).match(/name="session"/g)).toHaveLength(2);
		expect(html).toContain("does not sign that device out of GitHub or Google");

		const res = await app.revokeDevice(phone, sessionIdOf(laptop));
		expect(res.status).toBe(303);
		expect(res.headers.get("location")).toBe(`${APP}/thia/devices?signed_out=1`);

		expect((await app.me(laptop)).status).toBe(401);
		expect(signedIn((await homeAfterProxy(app, laptop)).html)).toBe(false);
		expect((await app.me(phone)).status).toBe(200);
	});

	it("signing out the current device clears this browser's cookies", async () => {
		const app = await bootApp(REFRESH_ON);
		const browser = new Browser();
		await login(app, browser);
		const res = browser.receive(await app.revokeDevice(browser, sessionIdOf(browser)));
		expect(res.status).toBe(303);
		expect(res.headers.get("location")).toBe(`${APP}/`);
		expect(access(browser)).toBeUndefined();
		expect(refreshCookie(browser)).toBeUndefined();
	});

	it("can't touch another user's session", async () => {
		const app = await bootApp(REFRESH_ON);
		const aliceBrowser = new Browser();
		const bobBrowser = new Browser();
		await login(app, aliceBrowser, alice);
		await login(app, bobBrowser, bob);

		const res = await app.revokeDevice(aliceBrowser, sessionIdOf(bobBrowser));

		expect(res.status).toBe(404);
		expect((await app.me(bobBrowser)).status).toBe(200);
		expect(await app.devices(aliceBrowser)).not.toContain(sessionIdOf(bobBrowser));
	});

	it.each([
		["another site", { origin: "https://evil.example" }],
		["no origin information", {}],
	])("refuses a revocation from %s", async (_label, headers) => {
		const app = await bootApp(REFRESH_ON);
		const laptop = new Browser();
		const phone = new Browser();
		await login(app, laptop);
		await login(app, phone);
		expect((await app.revokeDevice(phone, sessionIdOf(laptop), headers)).status).toBe(403);
		expect((await app.me(laptop)).status).toBe(200);
	});

	it("refuses unauthenticated callers", async () => {
		const app = await bootApp(REFRESH_ON);
		const victim = new Browser();
		await login(app, victim);
		expect((await app.revokeDevice(new Browser(), sessionIdOf(victim))).status).toBe(401);
		expect((await app.me(victim)).status).toBe(200);
	});

	it("stateless: a signed-out device keeps working until its access token needs renewing", async () => {
		freezeTime();
		const app = await bootApp(STATELESS);
		const laptop = new Browser();
		const phone = new Browser();
		await login(app, laptop);
		await login(app, phone);
		expect(await app.devices(phone)).toContain("within 10 min");

		await app.revokeDevice(phone, sessionIdOf(laptop));

		expect((await app.me(laptop)).status).toBe(200);
		advance(11 * MIN);
		expect(signedIn((await homeAfterProxy(app, laptop)).html)).toBe(false);
		expect(signedIn((await homeAfterProxy(app, phone)).html)).toBe(true);
	});

	it("shows an explanation when refresh is off", async () => {
		const app = await bootApp();
		expect(await app.devices(new Browser())).toContain("refresh is turned off");
	});
});

describe("sign-out", () => {
	it("ordinary sign-out revokes only this browser's session", async () => {
		const app = await bootApp(REFRESH_ON);
		const laptop = new Browser();
		const phone = new Browser();
		await login(app, laptop);
		await login(app, phone);
		const stolen = copyOf(laptop);

		laptop.receive(await app.logout(laptop));

		expect(access(laptop)).toBeUndefined();
		expect(refreshCookie(laptop)).toBeUndefined();
		expect((await app.me(stolen)).status).toBe(401); // user-validated: session ended
		expect((await app.me(phone)).status).toBe(200);
	});

	it("revokes the session even when only the refresh cookie is left", async () => {
		freezeTime();
		const app = await bootApp(REFRESH_ON);
		const browser = new Browser();
		await login(app, browser);
		const stolen = copyOf(browser);
		advance(11 * MIN);
		browser.jar.delete(SESSION_COOKIE_NAME);

		await app.logout(browser);

		const r = await app.thia.refreshSession(refreshCookie(stolen));
		expect(r).toMatchObject({ status: "invalid", reason: "revoked" });
	});

	it("sign out everywhere (user-validated) ends every session on the next request", async () => {
		const app = await bootApp(REFRESH_ON);
		const laptop = new Browser();
		const phone = new Browser();
		await login(app, laptop);
		await login(app, phone);

		const res = laptop.receive(await app.signOutEverywhere(laptop));

		expect(res.status).toBe(303);
		expect(refreshCookie(laptop)).toBeUndefined();
		expect((await app.me(phone)).status).toBe(401);
		await expect(app.thia.refreshSession(refreshCookie(phone))).resolves.toMatchObject({ status: "invalid" });
		await login(app, laptop);
		expect((await app.me(laptop)).status).toBe(200);
	});

	it("sign out everywhere (stateless) is supported but reported as not immediate", async () => {
		freezeTime();
		const app = await bootApp(STATELESS);
		const laptop = new Browser();
		const phone = new Browser();
		await login(app, laptop);
		await login(app, phone);
		expect(await app.home(laptop)).toContain("other devices within 10 min");

		const res = laptop.receive(await app.signOutEverywhere(laptop));
		expect(res.status).toBe(303);
		expect(await app.home(laptop, { signed_out: "everywhere" })).toContain("others within 10 min");

		expect((await app.me(phone)).status).toBe(200);
		advance(11 * MIN);
		expect(signedIn((await homeAfterProxy(app, phone)).html)).toBe(false);
	});
});

describe("POST /api/thia/refresh", () => {
	it("returns new cookies", async () => {
		const app = await bootApp(REFRESH_ON);
		const browser = new Browser();
		await login(app, browser);
		const before = refreshCookie(browser);
		const res = browser.receive(await app.refresh(browser));
		expect(res.status).toBe(204);
		expect(refreshCookie(browser)).not.toBe(before);
	});

	it("refuses cross-origin requests without rotating", async () => {
		const app = await bootApp(REFRESH_ON);
		const browser = new Browser();
		await login(app, browser);
		const before = refreshCookie(browser);
		expect((await app.refresh(browser, { origin: "https://evil.example" })).status).toBe(403);
		expect((await app.thia.refreshSession(before)).status).toBe("refreshed");
	});

	it("clears cookies for an invalid token, keeps them on an outage", async () => {
		const app = await bootApp(REFRESH_ON);
		const browser = new Browser();
		await login(app, browser);
		vi.spyOn(console, "error").mockImplementation(() => {});

		const outage = vi.spyOn(shared.sessions, "getById").mockRejectedValueOnce(new Error("db down"));
		expect(browser.receive(await app.refresh(browser)).status).toBe(503);
		expect(refreshCookie(browser)).toBeDefined();
		outage.mockRestore();

		browser.jar.set(REFRESH_COOKIE_NAME, `${sessionIdOf(browser)}.${"x".repeat(43)}`);
		expect(browser.receive(await app.refresh(browser)).status).toBe(401);
		expect(refreshCookie(browser)).toBeUndefined();
		expect(access(browser)).toBeUndefined();
	});

	it("is absent when refresh is off", async () => {
		const app = await bootApp();
		expect((await app.refresh(new Browser())).status).toBe(404);
	});
});

it("never logs tokens, secrets or hashes", async () => {
	freezeTime();
	const logged: unknown[] = [];
	for (const level of ["log", "info", "warn", "error"] as const) {
		vi.spyOn(console, level).mockImplementation((...args) => void logged.push(...args));
	}
	const app = await bootApp(REFRESH_ON);
	const browser = new Browser();
	await login(app, browser);
	const secrets = [access(browser)!, refreshCookie(browser)!, refreshCookie(browser)!.split(".")[1]];
	const stored = await shared.sessions.getById(sessionIdOf(browser));
	secrets.push(stored!.tokenHash);

	// Failures that log: an outage during renewal, then reuse detection.
	const thief = copyOf(browser);
	advance(11 * MIN);
	const outage = vi.spyOn(shared.sessions, "getById").mockRejectedValueOnce(new Error("db down"));
	await app.visit(browser, "/");
	outage.mockRestore();
	await homeAfterProxy(app, browser);
	advance(MIN);
	await homeAfterProxy(app, thief);
	await app.logout(browser);

	const text = JSON.stringify(logged.map(String));
	expect(logged.length).toBeGreaterThan(0);
	for (const s of secrets) expect(text).not.toContain(s);
});
