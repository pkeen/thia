/**
 * Sensitive-action re-authentication (ADR-005, Sprint 003) through the real
 * route handlers, with the simulated browser and providers from
 * support/app-harness.ts. Passing here says nothing about what Google or
 * GitHub actually show in a browser - see the manual checks in the README.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { SESSION_COOKIE_NAME, REFRESH_COOKIE_NAME, REAUTH_COOKIE_NAME } from "@/session";
import {
	APP,
	REFRESH_ON,
	Browser,
	alice,
	bootApp,
	github,
	google,
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
const stranger: Identity = { id: "9009", email: "alice@example.com", verified: true, name: "imposter" };

afterEach(() => vi.useRealTimers());
function freezeTime() {
	vi.useFakeTimers({ toFake: ["Date"], now: new Date("2030-06-01T12:00:00Z") });
}
const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);

async function login(app: App, browser: Browser, who: Identity = alice) {
	const url = await startLogin(app, browser, "github");
	return browser.receive(await app.callback("github", browser, github.approve(url, who)));
}
const nameOf = async (app: App, browser: Browser) =>
	(await app.thia.uow.users.getById((await userId(app, browser))!))!.name.value;
async function userId(app: App, browser: Browser) {
	const r = await app.thia.validateSession(browser.jar.get(SESSION_COOKIE_NAME));
	return r.status === "authenticated" ? r.session.identity.userId : undefined;
}

/** Starts a re-authentication; returns the provider's authorization URL. */
async function startReauth(app: App, browser: Browser, provider = "github") {
	const res = browser.receive(await app.reauth(provider, browser));
	expect(res.status).toBe(303);
	return res.headers.get("location")!;
}
/** Full successful confirmation with the linked account. */
async function reauthenticate(app: App, browser: Browser, who: Identity = alice) {
	const url = await startReauth(app, browser);
	return browser.receive(await app.callback("github", browser, github.approve(url, who)));
}

async function signedIn(env: Record<string, string> = REFRESH_ON) {
	freezeTime();
	const app = await bootApp(env);
	const browser = new Browser();
	await login(app, browser);
	return { app, browser };
}

describe("the display-name action", () => {
	it("rejects cross-origin and unauthenticated requests", async () => {
		const { app, browser } = await signedIn();
		await reauthenticate(app, browser);
		const before = await nameOf(app, browser);

		const cross = await app.changeName(browser, "Mallory", { origin: "https://evil.example" });
		expect(cross.status).toBe(403);
		const noOrigin = await app.changeName(browser, "Mallory", {});
		expect(noOrigin.status).toBe(403);
		expect((await app.changeName(new Browser(), "Mallory")).status).toBe(401);
		expect(await nameOf(app, browser)).toBe(before);
	});

	it("without a proof stops before changing anything", async () => {
		const { app, browser } = await signedIn();
		const before = await nameOf(app, browser);

		const form = await app.changeName(browser, "New Name");
		expect(form.status).toBe(303);
		expect(form.headers.get("location")).toBe(`${APP}/thia/profile?reauth=required`);

		const api = await app.changeName(browser, "New Name", { origin: APP });
		expect(api.status).toBe(403);
		expect(await api.json()).toEqual({ error: "reauthentication_required", reason: "missing" });
		expect(await nameOf(app, browser)).toBe(before);
	});

	it("validates input before asking for anything", async () => {
		const { app, browser } = await signedIn();
		expect((await app.changeName(browser, "   ")).status).toBe(400);
		expect((await app.changeName(browser, "x".repeat(101))).status).toBe(400);
	});

	it("requires a deliberate second POST after a successful re-authentication", async () => {
		const { app, browser } = await signedIn();
		const before = await nameOf(app, browser);

		expect((await app.changeName(browser, "Grace")).headers.get("location")).toContain("reauth=required");

		const url = await startReauth(app, browser);
		const back = browser.receive(await app.callback("github", browser, github.approve(url, alice)));
		expect(back.status).toBe(307);
		expect(back.headers.get("location")).toBe(`${APP}/thia/profile?reauth=done`);
		// Confirming never performs the action by itself.
		expect(await nameOf(app, browser)).toBe(before);
		expect(browser.oauthCookies()).toEqual([]);

		const saved = browser.receive(await app.changeName(browser, "Grace"));
		expect(saved.status).toBe(303);
		expect(saved.headers.get("location")).toBe(`${APP}/thia/profile?saved=1`);
		expect(await nameOf(app, browser)).toBe("Grace");
	});

	it("keeps an ordinary private action free of any re-authentication requirement", async () => {
		const { app, browser } = await signedIn();
		const res = await app.me(browser);
		expect(res.status).toBe(200);
	});
});

describe("the proof", () => {
	it("is set only by the callback, as a short-lived HttpOnly cookie", async () => {
		const { app, browser } = await signedIn();
		expect(browser.jar.has(REAUTH_COOKIE_NAME)).toBe(false); // login mints nothing
		const res = await reauthenticate(app, browser);
		const cookie = res.cookies.get(REAUTH_COOKIE_NAME)!;
		expect(cookie.httpOnly).toBe(true);
		expect(cookie.sameSite).toBe("lax");
		expect(cookie.path).toBe("/");
		const lifetimeMs = cookie.expires!.valueOf() - Date.now();
		expect(lifetimeMs).toBeGreaterThan(0);
		expect(lifetimeMs).toBeLessThanOrEqual(10 * MIN);
	});

	it("is not extended by refresh and ends after 10 minutes", async () => {
		const { app, browser } = await signedIn();
		await reauthenticate(app, browser);
		const proof = browser.jar.get(REAUTH_COOKIE_NAME);

		advance(6 * MIN);
		const visit = await app.visit(browser);
		expect(visit.blocked).toBeUndefined();
		expect(browser.jar.get(REAUTH_COOKIE_NAME)).toBe(proof); // refresh didn't touch it
		advance(5 * MIN); // 11 minutes since confirmation
		await app.visit(browser); // renews the access token
		expect(browser.jar.get(SESSION_COOKIE_NAME)).toBeTruthy();

		const res = await app.changeName(browser, "Late", { origin: APP });
		expect(res.status).toBe(403);
		expect((await res.json()).reason).toBe("expired");
		expect(await nameOf(app, browser)).not.toBe("Late");
	});

	it("does not carry to another device or an older copy of the session", async () => {
		const { app, browser } = await signedIn();
		const stolen = new Browser();
		stolen.jar = new Map(browser.jar); // copied before re-authentication
		stolen.jar.delete(REAUTH_COOKIE_NAME);
		await reauthenticate(app, browser);

		expect((await app.changeName(stolen, "Stolen", { origin: APP })).status).toBe(403);
		expect(await nameOf(app, browser)).not.toBe("Stolen");

		// Another sign-in of the same user has its own session and no proof.
		const other = new Browser();
		await login(app, other);
		other.jar.set(REAUTH_COOKIE_NAME, browser.jar.get(REAUTH_COOKIE_NAME)!);
		expect((await app.changeName(other, "Other", { origin: APP })).status).toBe(403);
	});

	it("is cleared by sign-out and rejected after the session is revoked", async () => {
		const { app, browser } = await signedIn();
		await reauthenticate(app, browser);
		const copy = new Browser();
		copy.jar = new Map(browser.jar);

		browser.receive(await app.logout(browser));
		expect(browser.jar.has(REAUTH_COOKIE_NAME)).toBe(false);
		// A copy of the cookies from before sign-out no longer works.
		expect((await app.changeName(copy, "After", { origin: APP })).status).toBe(401);
	});

	it("is cleared by sign out everywhere", async () => {
		const { app, browser } = await signedIn();
		await reauthenticate(app, browser);
		browser.receive(await app.signOutEverywhere(browser));
		expect(browser.jar.has(REAUTH_COOKIE_NAME)).toBe(false);
	});
});

describe("failed re-authentication", () => {
	it("leaves the name unchanged when the user cancels", async () => {
		const { app, browser } = await signedIn();
		const before = await nameOf(app, browser);
		// The provider returns the attempt's state with the error.
		const url = await startReauth(app, browser);
		const st = new URL(url).searchParams.get("state")!;
		const res = browser.receive(await app.callback("github", browser, `error=access_denied&state=${st}`));
		expect(res.headers.get("location")).toBe(`${APP}/thia/profile?reauth=cancelled`);
		expect(browser.jar.has(REAUTH_COOKIE_NAME)).toBe(false);
		expect((await app.changeName(browser, "X", { origin: APP })).status).toBe(403);
		expect(await nameOf(app, browser)).toBe(before);
	});

	it("leaves the name unchanged on a provider failure", async () => {
		const { app, browser } = await signedIn();
		const url = await startReauth(app, browser);
		const st = new URL(url).searchParams.get("state")!;
		const res = browser.receive(await app.callback("github", browser, `code=bogus&state=${st}`));
		expect(res.headers.get("location")).toBe(`${APP}/thia/profile?reauth=failed`);
		expect(browser.jar.has(REAUTH_COOKIE_NAME)).toBe(false);
	});

	it("refuses an unlinked account even when its email matches, and creates nothing", async () => {
		const { app, browser } = await signedIn();
		const sessionBefore = browser.jar.get(SESSION_COOKIE_NAME);
		const url = await startReauth(app, browser);
		const res = browser.receive(await app.callback("github", browser, github.approve(url, stranger)));
		expect(res.headers.get("location")).toBe(`${APP}/thia/profile?reauth=account_mismatch`);
		expect(browser.jar.has(REAUTH_COOKIE_NAME)).toBe(false);
		expect(browser.jar.get(SESSION_COOKIE_NAME)).toBe(sessionBefore); // not switched
		expect(await app.thia.uow.users.getByProviderAccount({ provider: "github", providerAccountId: stranger.id })).toBeNull();
		expect(await shared.users.getById((await userId(app, browser))!)).not.toBeNull();
		expect((await app.changeName(browser, "X", { origin: APP })).status).toBe(403);
	});

	it("refuses when the session changed during the provider visit", async () => {
		const { app, browser } = await signedIn();
		const url = await startReauth(app, browser);
		const query = github.approve(url, alice);
		// Signed out in the meantime (another tab): the transaction can't be used.
		const copy = new Browser();
		copy.jar = new Map(browser.jar);
		browser.receive(await app.logout(browser));
		browser.jar = new Map([...copy.jar].filter(([k]) => k.includes("thia_oauth_")));
		const res = browser.receive(await app.callback("github", browser, query));
		expect(res.headers.get("location")).toBe(`${APP}/thia/profile?reauth=failed`);
		expect(browser.jar.has(REAUTH_COOKIE_NAME)).toBe(false);
	});

	it("refuses when a different session of the same user finishes it", async () => {
		const { app, browser } = await signedIn();
		const url = await startReauth(app, browser);
		const query = github.approve(url, alice);
		const other = new Browser();
		await login(app, other);
		for (const [k, v] of browser.jar) if (k.includes("thia_oauth_")) other.jar.set(k, v);
		const res = other.receive(await app.callback("github", other, query));
		expect(res.headers.get("location")).toBe(`${APP}/thia/profile?reauth=failed`);
		expect(other.jar.has(REAUTH_COOKIE_NAME)).toBe(false);
	});

	it("a login transaction cannot complete a re-authentication", async () => {
		const { app, browser } = await signedIn();
		const loginUrl = await startLogin(app, browser, "github");
		const query = github.approve(loginUrl, alice);
		const sessionBefore = browser.jar.get(SESSION_COOKIE_NAME);
		const res = browser.receive(await app.callback("github", browser, query));
		// It is an ordinary login: a new session, no proof.
		expect(res.status).toBe(307);
		expect(browser.jar.get(SESSION_COOKIE_NAME)).not.toBe(sessionBefore);
		expect(browser.jar.has(REAUTH_COOKIE_NAME)).toBe(false);
	});
});

describe("starting a re-authentication", () => {
	it("is a same-origin, authenticated POST only", async () => {
		const { app, browser } = await signedIn();
		expect((await app.reauth("github", browser, { headers: { origin: "https://evil.example" } })).status).toBe(403);
		expect((await app.reauth("github", new Browser())).status).toBe(401);
	});

	it("offers only a provider linked to the user, and only configured ones", async () => {
		const { app, browser } = await signedIn();
		expect((await app.reauth("google", browser)).status).toBe(409);
		expect((await app.reauth("nope", browser)).status).toBe(400);
	});

	it("uses the configured callback URI and S256 PKCE", async () => {
		const { app, browser } = await signedIn();
		const url = new URL(await startReauth(app, browser));
		expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/thia/redirect/github");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
	});

	it("only returns to a local path", async () => {
		const { app, browser } = await signedIn();
		const url = browser.receive(await app.reauth("github", browser, { returnTo: "https://evil.example/" }));
		const q = github.approve(url.headers.get("location")!, alice);
		const res = browser.receive(await app.callback("github", browser, q));
		expect(res.headers.get("location")).toBe(`${APP}/?reauth=done`);
	});
});

describe("configuration", () => {
	it.each([
		["stateless with refresh", { ...REFRESH_ON, THIA_SESSION_MODE: "jwt-stateless" }],
		["refresh off", { THIA_SESSION_REFRESH: "off", THIA_REAUTH: "on" }],
		["stateless without refresh", { THIA_SESSION_REFRESH: "off", THIA_SESSION_MODE: "jwt-stateless", THIA_REAUTH: "on" }],
	])("enabling the guard with %s fails at setup", async (_n, env) => {
		await expect(bootApp(env)).rejects.toThrow();
	});

	it("an invalid THIA_REAUTH value fails at setup", async () => {
		await expect(bootApp({ ...REFRESH_ON, THIA_REAUTH: "maybe" })).rejects.toThrow();
	});

	it("apps that leave the guard off keep their session policies, and cannot reach the action", async () => {
		for (const env of [
			{ THIA_SESSION_REFRESH: "off", THIA_REAUTH: "off" },
			{ ...REFRESH_ON, THIA_REAUTH: "off", THIA_SESSION_MODE: "jwt-stateless" },
		]) {
			const app = await bootApp(env);
			const browser = new Browser();
			await login(app, browser);
			// Fails closed: the sensitive action never runs unchecked.
			expect((await app.changeName(browser, "Nope", { origin: APP })).status).toBe(503);
			expect((await app.reauth("github", browser)).status).toBe(404);
		}
	});
});

describe("the profile page", () => {
	it("shows the name and a confirm button per linked provider, and explains the provider visit", async () => {
		const { app, browser } = await signedIn();
		const html = (await app.profilePage(browser, { reauth: "required" })) as string;
		expect(html).toContain("alice");
		expect(html).toContain('action="/api/thia/reauth/github"');
		expect(html).not.toContain("/api/thia/reauth/google");
		expect(html).toContain("Confirm with GitHub");
		expect(html).toMatch(/up to the provider/);
		expect(html).toContain("submit the change again");
	});

	it("is linked from the home page only when the guard is enabled", async () => {
		const { app, browser } = await signedIn();
		expect(await app.home(browser)).toContain('href="/thia/profile"');
		const off = await bootApp({ ...REFRESH_ON, THIA_REAUTH: "off" });
		const other = new Browser();
		await login(off, other);
		expect(await off.home(other)).not.toContain("/thia/profile");
	});

	it("requires a session", async () => {
		const { app } = await signedIn();
		expect(await app.profilePage(new Browser())).toBe(401);
	});
});
