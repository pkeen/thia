/**
 * Test harness for the demo app end to end: real route handlers and pages,
 * real @thia/core (PKCE, encrypted transaction cookies, ID token and session
 * verification), a simulated browser cookie jar, and in-process GitHub and
 * Google authorization servers that enforce PKCE, redirect URI matching,
 * single-use codes and (Google) the nonce, as the real ones document. Only
 * the network and storage are faked. Passing tests say nothing about live
 * provider compatibility - see the manual smoke test in the README.
 */
import { vi, expect, beforeAll, beforeEach, afterEach, type Mock } from "vitest";
import { NextRequest, type NextResponse } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { createHash } from "node:crypto";
import {
	SignJWT,
	createLocalJWKSet,
	exportJWK,
	generateKeyPair,
	type KeyLike,
} from "jose";
import { InMemoryUserRepo } from "@thia/core";

// ---------------------------------------------------------------------------
// Persistent state shared by all app instances: the "database" and the
// provider's signing keys. Nothing else survives an instance restart.

export const shared = {
	users: undefined as unknown as InMemoryUserRepo,
	roles: new Map<string, string[]>(),
	googleJwks: undefined as unknown,
	instancesCreated: 0,
};

type CookieStore = { get: Mock };
let cookieStore: CookieStore | undefined;

/**
 * Connects the harness to the test file's mocked `next/headers` cookie
 * store. Each test file must also mock "@/db" and "next/headers"
 * (vi.mock is hoisted per file, so it can't live here), then call this.
 */
export function useHarness(store: CookieStore) {
	cookieStore = store;
	installHooks();
}

/** Makes `cookies()` in server code return this browser's cookies. */
export function actAs(browser: Browser) {
	if (!cookieStore) throw new Error("call useHarness() first");
	cookieStore.get.mockImplementation((name: string) => {
		const value = browser.jar.get(name);
		return value === undefined ? undefined : { name, value };
	});
}

export const ENV = {
	AUTH_SECRET: "integration-test-secret-of-at-least-32-bytes",
	GITHUB_CLIENT_ID: "gh-client",
	GITHUB_CLIENT_SECRET: "gh-client-secret",
	GITHUB_REDIRECT_URI: "http://localhost:3000/api/thia/redirect/github",
	GOOGLE_CLIENT_ID: "go-client.apps.googleusercontent.com",
	GOOGLE_CLIENT_SECRET: "go-client-secret",
	GOOGLE_REDIRECT_URI: "http://localhost:3000/api/thia/redirect/google",
};
export const APP = "http://localhost:3000";

/**
 * A fresh app instance: a new module graph (routes, @/thia and everything
 * they import re-evaluated) built from config, sharing no memory with any
 * earlier instance except the database and the provider's keys.
 */
export async function bootApp(env: Record<string, string> = {}) {
	vi.resetModules();
	// Optional settings from an earlier boot mustn't leak into this one.
	delete process.env.THIA_SESSION_MODE;
	delete process.env.THIA_SESSION_TTL_SEC;
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
	const me = await import("@/app/api/thia/me/route");
	const logout = await import("@/app/api/thia/logout/route");
	const everywhere = await import("@/app/api/thia/sign-out-everywhere/route");
	const home = await import("@/app/page");
	const admin = await import("@/app/thia/admin/page");
	const authz = await import("@/authz");
	expect(shared.instancesCreated).toBe(before + 1);
	const params = (provider: string) => ({ params: Promise.resolve({ provider }) });
	return {
		thia: thiaModule.thia,
		authz,
		login: (provider: string, browser: Browser, query = "") =>
			login.GET(browser.request(`${APP}/api/thia/login/${provider}${query}`), params(provider)),
		callback: (provider: string, browser: Browser, query: string) =>
			callback.GET(browser.request(`${APP}/api/thia/redirect/${provider}?${query}`), params(provider)),
		me: (browser: Browser) => {
			actAs(browser);
			return me.GET();
		},
		logout: (browser: Browser) =>
			logout.POST(browser.request(`${APP}/api/thia/logout`, { method: "POST", headers: { origin: APP } })),
		signOutEverywhere: (
			browser: Browser,
			init: { headers?: Record<string, string>; body?: string; query?: string } = {}
		) => {
			actAs(browser);
			return everywhere.POST(
				browser.request(`${APP}/api/thia/sign-out-everywhere${init.query ?? ""}`, {
					method: "POST",
					headers: init.headers ?? { origin: APP },
					body: init.body,
				})
			);
		},
		/** Server-rendered HTML of the home page, as this browser. */
		home: async (browser: Browser, searchParams: Record<string, string> = {}) => {
			actAs(browser);
			return renderToStaticMarkup(await home.default({ searchParams: Promise.resolve(searchParams) }));
		},
		/** The admin page's HTML, or the 401/403 status it interrupted with. */
		admin: async (browser: Browser): Promise<string | 401 | 403> => {
			actAs(browser);
			try {
				return renderToStaticMarkup(await admin.default());
			} catch (e) {
				const digest = (e as { digest?: string }).digest;
				if (digest === "NEXT_HTTP_ERROR_FALLBACK;401") return 401;
				if (digest === "NEXT_HTTP_ERROR_FALLBACK;403") return 403;
				throw e;
			}
		},
	};
}
export type App = Awaited<ReturnType<typeof bootApp>>;

/** Minimal cookie jar: what a browser would store and send back. */
export class Browser {
	jar = new Map<string, string>();
	request(
		url: string,
		init: { method?: string; headers?: Record<string, string>; body?: string } = {}
	) {
		const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
		return new NextRequest(url, {
			method: init.method,
			headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
			body: init.body,
		});
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

export type Grant = {
	clientId: string;
	redirectUri: string;
	challenge: string;
	nonce?: string;
	used: boolean;
	identity: Identity;
};
export type Identity = { id: string; email: string; verified: boolean; name: string };

export const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export class FakeProvider {
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

export const json = (body: unknown, status = 200) =>
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

export let github: FakeProvider;
export let google: FakeProvider;
export let fetchMock: ReturnType<typeof vi.fn>;

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

export const tokenExchanges = () => github.tokenRequests.length + google.tokenRequests.length;

function installHooks() {
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
}

export const alice: Identity = { id: "1001", email: "alice@example.com", verified: true, name: "alice" };

/** Starts a login; returns the provider's authorization URL. */
export async function startLogin(app: App, browser: Browser, provider: string, query = "") {
	const res = browser.receive(await app.login(provider, browser, query));
	expect(res.status).toBe(307);
	return res.headers.get("location")!;
}

