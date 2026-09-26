/**
 * The OAuth login flow end to end through the real route handlers, real
 * @thia/core (PKCE, encrypted transaction cookies, ID token verification)
 * and a simulated browser cookie jar. Only the network is faked: GitHub and
 * Google are in-process authorization servers that enforce PKCE, redirect
 * URI matching, single-use codes and (Google) the nonce, as the real ones
 * document. Passing here says nothing about live provider compatibility -
 * see the manual smoke test in the README.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
	SignJWT,
	createLocalJWKSet,
	exportJWK,
	generateKeyPair,
	type KeyLike,
} from "jose";
import { EmailAddress, InMemoryUserRepo, asUserId } from "@thia/core";
import { SESSION_COOKIE_NAME } from "@/session";
import { MAX_PENDING_OAUTH_TRANSACTIONS } from "@/oauth-cookies";

// ---------------------------------------------------------------------------
// Persistent state shared by all app instances: the "database" and the
// provider's signing keys. Nothing else survives an instance restart.

const shared = vi.hoisted(() => ({
	users: undefined as unknown as InstanceType<typeof import("@thia/core").InMemoryUserRepo>,
	roles: new Map<string, string[]>(),
	googleJwks: undefined as unknown,
	instancesCreated: 0,
}));

vi.mock("@/db", () => ({ default: {} }));
const cookieStore = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const ENV = {
	AUTH_SECRET: "integration-test-secret-of-at-least-32-bytes",
	GITHUB_CLIENT_ID: "gh-client",
	GITHUB_CLIENT_SECRET: "gh-client-secret",
	GITHUB_REDIRECT_URI: "http://localhost:3000/api/thia/redirect/github",
	GOOGLE_CLIENT_ID: "go-client.apps.googleusercontent.com",
	GOOGLE_CLIENT_SECRET: "go-client-secret",
	GOOGLE_REDIRECT_URI: "http://localhost:3000/api/thia/redirect/google",
};
const APP = "http://localhost:3000";

/**
 * A fresh app instance: a new module graph (routes, @/thia and everything
 * they import re-evaluated) built from config, sharing no memory with any
 * earlier instance except the database and the provider's keys.
 */
async function bootApp(env: Partial<typeof ENV> = {}) {
	vi.resetModules();
	Object.assign(process.env, ENV, env);
	// Re-registered per boot so the real @/thia module is evaluated afresh;
	// only its storage and Google's key source are substituted.
	vi.doMock("@/thia", async (importOriginal) => {
		const actual = await importOriginal<typeof import("@/thia")>();
		shared.instancesCreated++;
		return {
			...actual,
			thia: actual.createThia({
				users: shared.users,
				roleStore: {
					getRoles: async (id: string) => shared.roles.get(id) ?? [],
					assign: async () => {},
					revoke: async () => {},
				} as never,
				googleJwks: shared.googleJwks as never,
			}),
		};
	});
	// Sequential: concurrent first imports would run the factory twice and
	// hand the routes a different instance than the test inspects.
	const before = shared.instancesCreated;
	const thiaModule = await import("@/thia");
	const login = await import("@/app/api/thia/login/[provider]/route");
	const callback = await import("@/app/api/thia/redirect/[provider]/route");
	expect(shared.instancesCreated).toBe(before + 1);
	const params = (provider: string) => ({ params: Promise.resolve({ provider }) });
	return {
		thia: thiaModule.thia,
		login: (provider: string, browser: Browser, query = "") =>
			login.GET(browser.request(`${APP}/api/thia/login/${provider}${query}`), params(provider)),
		callback: (provider: string, browser: Browser, query: string) =>
			callback.GET(browser.request(`${APP}/api/thia/redirect/${provider}?${query}`), params(provider)),
	};
}
type App = Awaited<ReturnType<typeof bootApp>>;

/** Minimal cookie jar: what a browser would store and send back. */
class Browser {
	jar = new Map<string, string>();
	request(url: string) {
		const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
		return new NextRequest(url, { headers: cookie ? { cookie } : {} });
	}
	receive(res: NextResponse) {
		for (const c of res.cookies.getAll()) {
			if (c.maxAge === 0 || c.value === "") this.jar.delete(c.name);
			else this.jar.set(c.name, c.value);
		}
		return res;
	}
	oauthCookies() {
		return [...this.jar.keys()].filter((k) => k.includes("thia_oauth_"));
	}
}

// ---------------------------------------------------------------------------
// Fake authorization servers.

type Grant = {
	clientId: string;
	redirectUri: string;
	challenge: string;
	nonce?: string;
	used: boolean;
	identity: Identity;
};
type Identity = { id: string; email: string; verified: boolean; name: string };

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

class FakeProvider {
	grants = new Map<string, Grant>();
	tokenRequests: Record<string, string>[] = [];
	private n = 0;

	constructor(
		readonly name: "github" | "google",
		readonly authorizeUrl: string,
		readonly tokenUrl: string,
		readonly clientId: string,
		readonly clientSecret: string
	) {}

	/** The user approves; returns the callback query the provider would send. */
	approve(authorizationUrl: string, identity: Identity) {
		const url = new URL(authorizationUrl);
		expect(url.origin + url.pathname).toBe(this.authorizeUrl);
		const q = url.searchParams;
		// Providers must receive PKCE S256 on every authorization request.
		expect(q.get("code_challenge_method")).toBe("S256");
		expect(q.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(q.get("client_id")).toBe(this.clientId);
		const code = `${this.name}-code-${++this.n}`;
		this.grants.set(code, {
			clientId: q.get("client_id")!,
			redirectUri: q.get("redirect_uri")!,
			challenge: q.get("code_challenge")!,
			nonce: q.get("nonce") ?? undefined,
			used: false,
			identity,
		});
		return new URLSearchParams({ code, state: q.get("state")! }).toString();
	}

	/** Token endpoint: enforces client auth, redirect URI, single use and PKCE. */
	async token(body: URLSearchParams): Promise<Response> {
		const form = Object.fromEntries(body);
		this.tokenRequests.push(form);
		const grant = this.grants.get(form.code);
		const ok =
			grant &&
			!grant.used &&
			form.grant_type === "authorization_code" &&
			form.client_id === this.clientId &&
			form.client_secret === this.clientSecret &&
			form.redirect_uri === grant.redirectUri &&
			typeof form.code_verifier === "string" &&
			s256(form.code_verifier) === grant.challenge;
		if (grant) grant.used = true;
		if (!ok) {
			return this.name === "github"
				? json({ error: "bad_verification_code", error_description: "The code passed is incorrect or expired." })
				: json({ error: "invalid_grant", error_description: "Bad Request" }, 400);
		}
		if (this.name === "github") {
			return json({ access_token: `gho_${grant.identity.id}`, token_type: "bearer", scope: "user:email" });
		}
		return json({
			access_token: `ya29_${grant.identity.id}`,
			token_type: "Bearer",
			expires_in: 3599,
			scope: "openid email profile",
			id_token: await googleIdToken(grant),
		});
	}
}

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let googleKey: KeyLike;
async function googleIdToken(grant: Grant) {
	const now = Math.floor(Date.now() / 1000);
	return new SignJWT({
		email: grant.identity.email,
		email_verified: grant.identity.verified,
		name: grant.identity.name,
		nonce: grant.nonce,
	})
		.setProtectedHeader({ alg: "RS256", kid: "test-key" })
		.setIssuer("https://accounts.google.com")
		.setAudience(grant.clientId)
		.setSubject(grant.identity.id)
		.setIssuedAt(now)
		.setExpirationTime(now + 3600)
		.sign(googleKey);
}

let github: FakeProvider;
let google: FakeProvider;
let fetchMock: ReturnType<typeof vi.fn>;

function installNetwork() {
	github = new FakeProvider(
		"github",
		"https://github.com/login/oauth/authorize",
		"https://github.com/login/oauth/access_token",
		ENV.GITHUB_CLIENT_ID,
		ENV.GITHUB_CLIENT_SECRET
	);
	google = new FakeProvider(
		"google",
		"https://accounts.google.com/o/oauth2/v2/auth",
		"https://oauth2.googleapis.com/token",
		ENV.GOOGLE_CLIENT_ID,
		ENV.GOOGLE_CLIENT_SECRET
	);
	fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		const auth = new Headers(init?.headers).get("authorization") ?? "";
		const identity = [...github.grants.values()].find(
			(g) => auth === `Bearer gho_${g.identity.id}`
		)?.identity;
		if (url === github.tokenUrl) return github.token(new URLSearchParams(String(init?.body)));
		if (url === google.tokenUrl) return google.token(new URLSearchParams(String(init?.body)));
		if (url === "https://api.github.com/user" && identity) {
			return json({ login: identity.name, id: Number(identity.id), avatar_url: "https://a.example/x", name: identity.name, email: null });
		}
		if (url === "https://api.github.com/user/emails" && identity) {
			return json([{ email: identity.email, primary: true, verified: identity.verified }]);
		}
		return json({ message: "Bad credentials" }, 401);
	});
	vi.stubGlobal("fetch", fetchMock);
}

const tokenExchanges = () => github.tokenRequests.length + google.tokenRequests.length;

beforeAll(async () => {
	const { publicKey, privateKey } = await generateKeyPair("RS256");
	googleKey = privateKey;
	shared.googleJwks = createLocalJWKSet({
		keys: [{ ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" }],
	});
});

beforeEach(() => {
	shared.users = new InMemoryUserRepo();
	shared.roles.clear();
	installNetwork();
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const alice: Identity = { id: "1001", email: "alice@example.com", verified: true, name: "alice" };

/** Starts a login; returns the provider's authorization URL. */
async function startLogin(app: App, browser: Browser, provider: string, query = "") {
	const res = browser.receive(await app.login(provider, browser, query));
	expect(res.status).toBe(307);
	return res.headers.get("location")!;
}

// ---------------------------------------------------------------------------

describe("successful login", () => {
	it("GitHub: completes on a fresh instance with the same keys and cleans up", async () => {
		const browser = new Browser();
		const instanceA = await bootApp();
		const authUrl = await startLogin(instanceA, browser, "github");

		// Transaction cookie: one, encrypted, HttpOnly, Lax, host-only, 10 min.
		const [name] = browser.oauthCookies();
		expect(browser.oauthCookies()).toHaveLength(1);
		expect(name).toMatch(/^thia_oauth_[A-Za-z0-9_-]{22}$/);
		const value = browser.jar.get(name)!;
		const state = new URL(authUrl).searchParams.get("state")!;
		expect(value).not.toContain(state);

		const callbackQuery = github.approve(authUrl, alice);

		// Restart: nothing in memory survives, only config and the database.
		const instanceB = await bootApp();
		expect(instanceB.thia).not.toBe(instanceA.thia);

		const res = browser.receive(await instanceB.callback("github", browser, callbackQuery));

		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toBe(`${APP}/`);
		expect(browser.jar.get(SESSION_COOKIE_NAME)).toBeTruthy();
		expect(browser.oauthCookies()).toEqual([]);

		// The fake server only issues a token when S256(verifier) == challenge.
		expect(github.tokenRequests).toHaveLength(1);
		const exchange = github.tokenRequests[0];
		expect(s256(exchange.code_verifier)).toBe(new URL(authUrl).searchParams.get("code_challenge"));
		expect(exchange.redirect_uri).toBe(ENV.GITHUB_REDIRECT_URI);
		expect(exchange.code_verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);

		const session = await instanceB.thia.verifySession(browser.jar.get(SESSION_COOKIE_NAME)!);
		const user = await shared.users.getById(asUserId(session.sub));
		expect(user?.email.value).toBe("alice@example.com");
		expect(user?.emailVerified).toBeInstanceOf(Date);
	});

	it("Google: sends a nonce and completes only with a verified ID token", async () => {
		const browser = new Browser();
		const authUrl = await startLogin(await bootApp(), browser, "google");
		const nonce = new URL(authUrl).searchParams.get("nonce");
		expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);

		const query = google.approve(authUrl, { id: "g-42", email: "gina@example.com", verified: true, name: "Gina" });
		const res = browser.receive(await (await bootApp()).callback("google", browser, query));

		expect(res.headers.get("location")).toBe(`${APP}/`);
		expect(browser.jar.get(SESSION_COOKIE_NAME)).toBeTruthy();
		expect(browser.oauthCookies()).toEqual([]);
		expect(s256(google.tokenRequests[0].code_verifier)).toBe(
			new URL(authUrl).searchParams.get("code_challenge")
		);
	});

	it("returns to a validated local returnTo, and ignores an external one", async () => {
		const app = await bootApp();

		const local = new Browser();
		const q1 = github.approve(await startLogin(app, local, "github", "?returnTo=%2Fthia%2Fadmin%3Ftab%3D1"), alice);
		const r1 = await app.callback("github", local, q1);
		expect(r1.headers.get("location")).toBe(`${APP}/thia/admin?tab=1`);

		for (const evil of ["//evil.example", "https://evil.example/", "/\\evil.example", "javascript:alert(1)"]) {
			const browser = new Browser();
			const q = github.approve(
				await startLogin(app, browser, "github", `?returnTo=${encodeURIComponent(evil)}`),
				alice
			);
			const res = await app.callback("github", browser, q);
			expect(res.headers.get("location")).toBe(`${APP}/`);
		}
	});

	it("over HTTPS uses a Secure __Host- cookie", async () => {
		const app = await bootApp({ GITHUB_REDIRECT_URI: "https://app.example/api/thia/redirect/github" });
		const res = await app.login("github", new Browser());

		const [cookie] = res.cookies.getAll();
		expect(cookie.name).toMatch(/^__Host-thia_oauth_/);
		expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
		expect(cookie.domain).toBeUndefined();
	});

	it("over local HTTP uses a non-Secure, HttpOnly, Lax cookie without the prefix", async () => {
		const res = await (await bootApp()).login("github", new Browser());
		const [cookie] = res.cookies.getAll();
		expect(cookie).toMatchObject({ secure: false, httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
		expect(cookie.name).not.toMatch(/^__Host-/);
		expect(cookie.domain).toBeUndefined();
	});

	it("refuses to start a login with a plain-HTTP non-local callback", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const app = await bootApp({ GITHUB_REDIRECT_URI: "http://app.example/api/thia/redirect/github" });
		const res = await app.login("github", new Browser());
		expect(res.status).toBe(500);
		expect(res.cookies.getAll()).toEqual([]);
	});
});

describe("rejected callbacks never reach the token endpoint or start a session", () => {
	let app: App;
	let browser: Browser;
	let authUrl: string;
	let query: URLSearchParams;

	beforeEach(async () => {
		app = await bootApp();
		browser = new Browser();
		authUrl = await startLogin(app, browser, "github");
		query = new URLSearchParams(github.approve(authUrl, alice));
	});

	async function expectRejected(res: Response, error: string) {
		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error });
		expect(tokenExchanges()).toBe(0);
		expect(browser.jar.has(SESSION_COOKIE_NAME)).toBe(false);
	}

	it("with no transaction cookie", async () => {
		browser.jar.clear();
		await expectRejected(await app.callback("github", browser, query.toString()), "invalid_transaction");
	});

	it("with a different (well-formed) state, leaving the real attempt's cookie alone", async () => {
		const res = browser.receive(
			await app.callback("github", browser, `code=${query.get("code")}&state=${"x".repeat(43)}`)
		);
		await expectRejected(res, "invalid_transaction");
		expect(browser.oauthCookies()).toHaveLength(1);
	});

	it.each([
		["missing state", (q: URLSearchParams) => `code=${q.get("code")}`],
		["empty state", (q: URLSearchParams) => `code=${q.get("code")}&state=`],
		["malformed state", (q: URLSearchParams) => `code=${q.get("code")}&state=${q.get("state")}!`],
		["oversized state", (q: URLSearchParams) => `code=${q.get("code")}&state=${"a".repeat(5000)}`],
	])("with a %s, clearing nothing", async (_label, build) => {
		const res = browser.receive(await app.callback("github", browser, build(query)));
		await expectRejected(res, "invalid_callback");
		expect(browser.oauthCookies()).toHaveLength(1);
	});

	it("with a missing code, ending that attempt", async () => {
		const res = browser.receive(await app.callback("github", browser, `state=${query.get("state")}`));
		await expectRejected(res, "invalid_callback");
		expect(browser.oauthCookies()).toEqual([]);
	});

	it("for an unknown provider", async () => {
		await expectRejected(await app.callback("myspace", browser, query.toString()), "invalid_callback");
	});

	it("for a different provider than the transaction's, keeping that transaction", async () => {
		// GitHub's state replayed against Google's callback.
		const res = browser.receive(await app.callback("google", browser, query.toString()));
		await expectRejected(res, "invalid_transaction");
		// The cookie lookup is per provider, and a readable transaction for
		// another provider is never cleared from a callback.
		expect(browser.oauthCookies()).toHaveLength(1);
		const ok = await app.callback("github", browser, query.toString());
		expect(ok.headers.get("location")).toBe(`${APP}/`);
	});

	it("with a tampered cookie, which is then cleared", async () => {
		const [name] = browser.oauthCookies();
		const value = browser.jar.get(name)!;
		const i = value.length - 5;
		browser.jar.set(name, value.slice(0, i) + (value[i] === "A" ? "B" : "A") + value.slice(i + 1));

		const res = browser.receive(await app.callback("github", browser, query.toString()));
		await expectRejected(res, "invalid_transaction");
		expect(browser.oauthCookies()).toEqual([]);
	});

	it("with a cookie sealed under a different AUTH_SECRET", async () => {
		const other = await bootApp({ AUTH_SECRET: "a-completely-different-secret-of-32-bytes!" });
		const otherBrowser = new Browser();
		const otherQuery = github.approve(await startLogin(other, otherBrowser, "github"), alice);

		const res = otherBrowser.receive(await app.callback("github", otherBrowser, otherQuery));
		expect(res.status).toBe(400);
		expect(tokenExchanges()).toBe(0);
		expect(otherBrowser.jar.has(SESSION_COOKIE_NAME)).toBe(false);
	});

	it("after the transaction has expired, even if the browser still sends the cookie", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(Date.now() + 10 * 60 * 1000 + 1000);

		const res = browser.receive(await app.callback("github", browser, query.toString()));
		await expectRejected(res, "invalid_transaction");
		expect(browser.oauthCookies()).toEqual([]);
	});
});

describe("terminal failures clear the attempt's cookie", () => {
	it("provider cancellation", async () => {
		const app = await bootApp();
		const browser = new Browser();
		const state = new URL(await startLogin(app, browser, "github")).searchParams.get("state")!;

		const res = browser.receive(
			await app.callback("github", browser, `error=access_denied&error_description=The+user+denied&state=${state}`)
		);

		expect(res.headers.get("location")).toBe(`${APP}/thia/login?error=cancelled`);
		expect(browser.oauthCookies()).toEqual([]);
		expect(browser.jar.has(SESSION_COOKIE_NAME)).toBe(false);
		expect(tokenExchanges()).toBe(0);
	});

	it("cancellation carrying another provider's state doesn't clear that attempt", async () => {
		const app = await bootApp();
		const browser = new Browser();
		const state = new URL(await startLogin(app, browser, "github")).searchParams.get("state")!;

		browser.receive(await app.callback("google", browser, `error=access_denied&state=${state}`));
		expect(browser.oauthCookies()).toHaveLength(1);
	});

	it("token exchange failure, logged without secrets", async () => {
		const log = vi.spyOn(console, "error").mockImplementation(() => {});
		const app = await bootApp();
		const browser = new Browser();
		const authUrl = await startLogin(app, browser, "github");
		const query = new URLSearchParams(github.approve(authUrl, alice));
		// The code was already redeemed elsewhere: the provider refuses it.
		github.grants.get(query.get("code")!)!.used = true;
		const cookieValue = browser.jar.get(browser.oauthCookies()[0])!;

		const res = browser.receive(await app.callback("github", browser, query.toString()));

		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "authentication_failed" });
		expect(browser.oauthCookies()).toEqual([]);
		expect(browser.jar.has(SESSION_COOKIE_NAME)).toBe(false);

		const logged = JSON.stringify(log.mock.calls);
		expect(logged).toContain("token_exchange_failed");
		expect(logged).toContain("bad_verification_code");
		for (const secret of [
			query.get("code")!,
			query.get("state")!,
			github.tokenRequests[0].code_verifier,
			ENV.GITHUB_CLIENT_SECRET,
			cookieValue,
		]) {
			expect(logged).not.toContain(secret);
		}
	});

	it("a replayed callback with a captured cookie is stopped by the provider's single-use code", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const app = await bootApp();
		const browser = new Browser();
		const query = github.approve(await startLogin(app, browser, "github"), alice);
		const captured = new Browser();
		captured.jar = new Map(browser.jar);

		browser.receive(await app.callback("github", browser, query));
		expect(browser.jar.has(SESSION_COOKIE_NAME)).toBe(true);

		// Clearing the cookie can't stop a copy of it; the second exchange
		// is refused by the provider, so no second session is issued.
		const replay = captured.receive(await app.callback("github", captured, query));
		expect(replay.status).toBe(400);
		expect(captured.jar.has(SESSION_COOKIE_NAME)).toBe(false);
		expect(github.tokenRequests).toHaveLength(2);
	});
});

describe("concurrent attempts", () => {
	it("keeps separate tabs' logins independent", async () => {
		const app = await bootApp();
		const browser = new Browser();
		const tab1 = await startLogin(app, browser, "github");
		const tab2 = await startLogin(app, browser, "google");
		const tab3 = await startLogin(app, browser, "github");
		expect(browser.oauthCookies()).toHaveLength(3);

		const q3 = github.approve(tab3, alice);
		const q1 = github.approve(tab1, alice);
		const q2 = google.approve(tab2, { id: "g-1", email: "alice@example.com", verified: true, name: "A" });

		// Finishing one attempt clears only its own cookie.
		browser.receive(await app.callback("github", browser, q3));
		expect(browser.oauthCookies()).toHaveLength(2);
		const r1 = browser.receive(await app.callback("github", browser, q1));
		expect(r1.headers.get("location")).toBe(`${APP}/`);
		const r2 = browser.receive(await app.callback("google", browser, q2));
		expect(r2.headers.get("location")).toBe(`${APP}/`);
		expect(browser.oauthCookies()).toEqual([]);
	});

	it(`keeps at most ${MAX_PENDING_OAUTH_TRANSACTIONS}, evicting the oldest`, async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const app = await bootApp();
		const browser = new Browser();
		const urls: string[] = [];
		for (let i = 0; i < MAX_PENDING_OAUTH_TRANSACTIONS + 2; i++) {
			vi.setSystemTime(Date.parse("2026-03-01T00:00:00Z") + i * 1000);
			urls.push(await startLogin(app, browser, "github"));
			expect(browser.oauthCookies().length).toBeLessThanOrEqual(MAX_PENDING_OAUTH_TRANSACTIONS);
		}
		expect(browser.oauthCookies()).toHaveLength(MAX_PENDING_OAUTH_TRANSACTIONS);

		// The two oldest attempts were evicted...
		for (const url of urls.slice(0, 2)) {
			const res = await app.callback("github", browser, github.approve(url, alice));
			expect(res.status).toBe(400);
		}
		expect(tokenExchanges()).toBe(0);
		// ...the newest still complete.
		const res = browser.receive(await app.callback("github", browser, github.approve(urls[4], alice)));
		expect(res.headers.get("location")).toBe(`${APP}/`);
	});

	it("evicts unreadable cookies before live ones", async () => {
		const app = await bootApp();
		const browser = new Browser();
		const live = await startLogin(app, browser, "github");
		browser.jar.set("thia_oauth_AAAAAAAAAAAAAAAAAAAAAA", "garbage");
		browser.jar.set("thia_oauth_BBBBBBBBBBBBBBBBBBBBBB", "garbage");
		await startLogin(app, browser, "github");

		expect(browser.oauthCookies()).toHaveLength(2);
		expect(browser.jar.has("thia_oauth_AAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
		const res = await app.callback("github", browser, github.approve(live, alice));
		expect(res.headers.get("location")).toBe(`${APP}/`);
	});
});

describe("account linking and roles are unchanged", () => {
	it("links Google into an account whose email GitHub verified", async () => {
		const app = await bootApp();
		const gh = new Browser();
		gh.receive(await app.callback("github", gh, github.approve(await startLogin(app, gh, "github"), alice)));
		const go = new Browser();
		go.receive(
			await app.callback(
				"google",
				go,
				google.approve(await startLogin(app, go, "google"), { id: "g-9", email: alice.email, verified: true, name: "A" })
			)
		);

		const a = await app.thia.verifySession(gh.jar.get(SESSION_COOKIE_NAME)!);
		const b = await app.thia.verifySession(go.jar.get(SESSION_COOKIE_NAME)!);
		expect(b.sub).toBe(a.sub);
		const stored = await shared.users.getByEmail(EmailAddress.create(alice.email));
		expect(stored?.accounts.map((x: { provider: string }) => x.provider).sort()).toEqual([
			"github",
			"google",
		]);
	});

	it("refuses to link an unverified email and clears the attempt", async () => {
		const app = await bootApp();
		const first = new Browser();
		first.receive(await app.callback("github", first, github.approve(await startLogin(app, first, "github"), alice)));

		const attacker = new Browser();
		const res = attacker.receive(
			await app.callback(
				"google",
				attacker,
				google.approve(await startLogin(app, attacker, "google"), { id: "g-evil", email: alice.email, verified: false, name: "M" })
			)
		);
		expect(res.headers.get("location")).toBe(`${APP}/thia/login?error=account_exists`);
		expect(attacker.jar.has(SESSION_COOKIE_NAME)).toBe(false);
		expect(attacker.oauthCookies()).toEqual([]);
	});

	it("reads persisted roles for the signed-in user", async () => {
		const app = await bootApp();
		const browser = new Browser();
		browser.receive(await app.callback("github", browser, github.approve(await startLogin(app, browser, "github"), alice)));
		const { sub } = await app.thia.verifySession(browser.jar.get(SESSION_COOKIE_NAME)!);
		shared.roles.set(sub, ["admin"]);

		cookieStore.get.mockReturnValue({ value: browser.jar.get(SESSION_COOKIE_NAME) });
		const { getSubject, authorizer } = await import("@/authz");
		const subject = await getSubject();
		expect(subject).toMatchObject({ email: alice.email, roles: ["admin"] });
		await expect(authorizer.can(subject!, "admin.view")).resolves.toBe(true);
	});
});

it("builds each app instance independently", () => {
	expect(shared.instancesCreated).toBeGreaterThan(1);
});
