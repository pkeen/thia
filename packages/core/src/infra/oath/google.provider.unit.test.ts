import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import {
	SignJWT,
	createLocalJWKSet,
	exportJWK,
	generateKeyPair,
	type JWK,
	type KeyLike,
} from "jose";

import { Google } from "./google";
import { OAuthProviderError } from "../../application/ports/oauth-provider-port";
import { deriveCodeChallenge } from "../../application/oauth/pkce";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const CLIENT_SECRET = "test-client-secret";
const CALLBACK = "http://localhost:3000/api/thia/redirect/google";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const NONCE = "n0nce-n0nce-n0nce-n0nce-n0nce-n0nce-n0nce12";

let googleKey: KeyLike;
let otherKey: KeyLike;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
	const google = await generateKeyPair("RS256");
	const other = await generateKeyPair("RS256");
	googleKey = google.privateKey;
	otherKey = other.privateKey;
	const jwk: JWK = { ...(await exportJWK(google.publicKey)), kid: "g1", alg: "RS256", use: "sig" };
	jwks = createLocalJWKSet({ keys: [jwk] });
});

const google = () =>
	new Google({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: CALLBACK, jwks });

/** An ID token as Google would issue it, with overridable claims/keys. */
async function idToken(
	claims: Record<string, unknown> = {},
	opts: { key?: KeyLike; kid?: string; expSec?: number } = {}
) {
	const now = Math.floor(Date.now() / 1000);
	return new SignJWT({
		sub: "g-1",
		email: "a@example.com",
		email_verified: true,
		name: "Ada",
		picture: "https://example.com/a.png",
		nonce: NONCE,
		...claims,
	})
		.setProtectedHeader({ alg: "RS256", kid: opts.kid ?? "g1" })
		.setIssuer((claims.iss as string) ?? "https://accounts.google.com")
		.setAudience((claims.aud as string | string[]) ?? CLIENT_ID)
		.setIssuedAt(now)
		.setExpirationTime(now + (opts.expSec ?? 3600))
		.sign(opts.key ?? googleKey);
}

describe("begin", () => {
	it("sends the S256 PKCE challenge, state, nonce and configured callback", async () => {
		const challenge = await deriveCodeChallenge(VERIFIER);
		const url = new URL(
			google().begin({ state: "test-state", nonce: NONCE, codeChallenge: challenge, redirectUri: CALLBACK })
				.authorizationUrl,
		);

		expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
		expect(Object.fromEntries(url.searchParams)).toEqual({
			client_id: CLIENT_ID,
			redirect_uri: CALLBACK,
			response_type: "code",
			scope: "openid email profile",
			state: "test-state",
			nonce: NONCE,
			code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
			code_challenge_method: "S256",
		});
	});

	it("refuses to build a URL without a PKCE challenge", () => {
		expect(() => google().begin({ state: "s" } as never)).toThrow("PKCE_CHALLENGE_REQUIRED");
	});

	it("does not let extra params override PKCE or state", async () => {
		const url = new URL(
			google().begin({
				state: "real",
				codeChallenge: await deriveCodeChallenge(VERIFIER),
				extraAuthParams: { code_challenge_method: "plain", state: "evil", prompt: "consent" },
			}).authorizationUrl,
		);
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("state")).toBe("real");
		expect(url.searchParams.get("prompt")).toBe("consent");
	});
});

describe("complete", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const json = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

	/** Fakes Google's token endpoint; returns the mock to inspect requests. */
	function stubToken(response: () => Response | Promise<Response>) {
		const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
			const url = String(input);
			if (url === "https://oauth2.googleapis.com/token") return response();
			throw new Error(`unexpected fetch: ${url}`);
		});
		vi.stubGlobal("fetch", fetchMock);
		return fetchMock;
	}

	const tokenResponse = async (claims?: Record<string, unknown>, opts?: Parameters<typeof idToken>[1]) =>
		json({
			access_token: "ya29.x",
			token_type: "Bearer",
			expires_in: 3599,
			scope: "openid email profile",
			id_token: await idToken(claims, opts),
		});

	const complete = (overrides: Record<string, unknown> = {}) =>
		google().complete({
			code: "4/auth-code",
			state: "state",
			redirectUri: CALLBACK,
			codeVerifier: VERIFIER,
			nonce: NONCE,
			...overrides,
		});

	it("exchanges the code with the PKCE verifier in a form-encoded POST", async () => {
		const body = await tokenResponse();
		const fetchMock = stubToken(() => body);
		await complete();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://oauth2.googleapis.com/token");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("content-type")).toBe("application/x-www-form-urlencoded");
		expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
			grant_type: "authorization_code",
			code: "4/auth-code",
			redirect_uri: CALLBACK,
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			code_verifier: VERIFIER,
		});
	});

	it("refuses to exchange without a valid verifier, before any request", async () => {
		const fetchMock = stubToken(() => json({}));
		await expect(complete({ codeVerifier: undefined })).rejects.toThrow("PKCE_VERIFIER_REQUIRED");
		await expect(complete({ codeVerifier: "short" })).rejects.toThrow("PKCE_VERIFIER_REQUIRED");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("takes identity and email verification from the verified ID token", async () => {
		const body = await tokenResponse();
		stubToken(() => body);
		const { user, tokens } = await complete();

		expect(user).toEqual({
			provider: "google",
			providerAccountId: "g-1",
			email: "a@example.com",
			emailVerified: true,
			name: "Ada",
			image: "https://example.com/a.png",
		});
		expect(tokens.claims).toMatchObject({ sub: "g-1", nonce: NONCE });
	});

	it("reports an unverified Google email as unverified", async () => {
		const body = await tokenResponse({ sub: "g-2", email: "b@example.com", email_verified: false });
		stubToken(() => body);
		const { user } = await complete();

		expect(user.emailVerified).toBe(false);
	});

	it("accepts the scheme-less issuer Google also documents", async () => {
		const body = await tokenResponse({ iss: "accounts.google.com" });
		stubToken(() => body);
		await expect(complete()).resolves.toBeDefined();
	});

	describe("rejects an ID token that fails OIDC validation", () => {
		it.each<[string, Record<string, unknown>, Parameters<typeof idToken>[1]?, Record<string, unknown>?]>([
			["with a different nonce", { nonce: "someone-elses-nonce" }],
			["with no nonce", { nonce: undefined }],
			["when this login expected a nonce but none was sent", {}, undefined, { nonce: undefined }],
			["from another issuer", { iss: "https://evil.example" }],
			["for another client", { aud: "someone-else" }],
			["with several audiences and no azp for us", { aud: [CLIENT_ID, "other"], azp: "other" }],
			["that has expired", {}, { expSec: -60 }],
			["signed by an unknown key", {}, { key: undefined, kid: "unknown" }],
		])("%s", async (_label, claims, opts, completeOverrides) => {
			const body = await tokenResponse(claims, opts);
			stubToken(() => body);
			const err = await complete(completeOverrides).catch((e) => e);
			expect(err).toBeInstanceOf(OAuthProviderError);
			expect(err.code).toBe("id_token_invalid");
		});

		it("signed with a key that isn't Google's", async () => {
			const body = await tokenResponse({}, { key: otherKey });
			stubToken(() => body);
			await expect(complete()).rejects.toMatchObject({ code: "id_token_invalid" });
		});

		it("that is unsigned (alg none), i.e. merely decodable", async () => {
			const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
			const now = Math.floor(Date.now() / 1000);
			const unsigned = `${b64({ alg: "none" })}.${b64({
				iss: "https://accounts.google.com",
				aud: CLIENT_ID,
				sub: "attacker",
				nonce: NONCE,
				iat: now,
				exp: now + 60,
			})}.`;
			stubToken(() =>
				json({ access_token: "x", token_type: "Bearer", scope: "openid", id_token: unsigned }),
			);
			await expect(complete()).rejects.toMatchObject({ code: "id_token_invalid" });
		});
	});

	it("turns a token endpoint error into a sanitized failure", async () => {
		stubToken(() =>
			json({ error: "invalid_grant", error_description: "Bad Request for code 4/auth-code" }, 400),
		);
		const err = await complete().catch((e) => e);

		expect(err).toBeInstanceOf(OAuthProviderError);
		expect(err).toMatchObject({
			code: "token_exchange_failed",
			details: { provider: "google", status: 400, oauthError: "invalid_grant" },
		});
		for (const secret of ["4/auth-code", VERIFIER, CLIENT_SECRET]) {
			expect(err.message).not.toContain(secret);
		}
	});

	it("rejects a token response without an ID token", async () => {
		stubToken(() => json({ access_token: "x", token_type: "Bearer", scope: "openid" }));
		await expect(complete()).rejects.toMatchObject({ code: "invalid_token_response" });
	});

	it("reports a network failure without details", async () => {
		stubToken(() => {
			throw new TypeError("fetch failed");
		});
		await expect(complete()).rejects.toMatchObject({ code: "token_exchange_failed" });
	});
});
