import { describe, it, expect, vi, afterEach } from "vitest";

import { GitHub } from "./github";
import {
	OAuthProviderError,
	type OAuthProviderPort,
} from "../../application/ports/oauth-provider-port";
import { deriveCodeChallenge } from "../../application/oauth/pkce";

const CALLBACK = "http://localhost:3000/api/thia/redirect/github";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

const github = () =>
	new GitHub({
		clientId: "test-client-id",
		clientSecret: "test-client-secret",
		redirectUri: CALLBACK,
	});

const begin = async (state = "test-state") =>
	new URL(
		github().begin({ state, codeChallenge: await deriveCodeChallenge(VERIFIER) })
			.authorizationUrl,
	);

it("returns an authorizationUrl with state, callback and the S256 PKCE challenge", async () => {
	const url = await begin();

	expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
	expect(Object.fromEntries(url.searchParams)).toEqual({
		client_id: "test-client-id",
		redirect_uri: CALLBACK,
		response_type: "code",
		scope: "user:email",
		state: "test-state",
		code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
		code_challenge_method: "S256",
	});
});

it("requests the user:email scope so email verification can be read", async () => {
	const url = await begin("s");
	expect(url.searchParams.get("scope")).toBe("user:email");
});

it("is not an OIDC provider, so no nonce is expected", () => {
	const port: OAuthProviderPort = github();
	expect(port.oidc).toBeFalsy();
});

it("refuses to build a URL without a PKCE challenge", () => {
	expect(() => github().begin({ state: "s" } as never)).toThrow("PKCE_CHALLENGE_REQUIRED");
});

const profile = {
	login: "octocat",
	id: 42,
	avatar_url: "https://avatars.example/42",
	name: "Octo Cat",
	email: "public@example.com",
};

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

/** Fakes GitHub's token, profile and emails endpoints. */
function stubGitHub(
	emails: unknown,
	emailsStatus = 200,
	token: () => Response = () =>
		json({ access_token: "gho_x", token_type: "bearer", scope: "user:email" }),
	profileResponse: () => Response = () => json(profile),
) {
	const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
		const url = String(input);
		if (url === "https://github.com/login/oauth/access_token") return token();
		if (url === "https://api.github.com/user") return profileResponse();
		if (url === "https://api.github.com/user/emails") return json(emails, emailsStatus);
		throw new Error(`unexpected fetch: ${url}`);
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const complete = (overrides: Record<string, unknown> = {}) =>
	github().complete({
		code: "gh-code",
		state: "state",
		redirectUri: CALLBACK,
		codeVerifier: VERIFIER,
		...overrides,
	});

describe("complete", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("exchanges the code with the PKCE verifier in the POST body, not the URL", async () => {
		const fetchMock = stubGitHub([]);
		await complete();

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://github.com/login/oauth/access_token");
		expect(init?.method).toBe("POST");
		const headers = new Headers(init?.headers);
		expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
		expect(headers.get("accept")).toBe("application/json");
		expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
			grant_type: "authorization_code",
			code: "gh-code",
			redirect_uri: CALLBACK,
			client_id: "test-client-id",
			client_secret: "test-client-secret",
			code_verifier: VERIFIER,
		});

		// The access token (not the code) authenticates the API calls.
		const apiAuth = fetchMock.mock.calls
			.slice(1)
			.map(([, i]) => new Headers(i?.headers).get("authorization"));
		expect(apiAuth).toEqual(["Bearer gho_x", "Bearer gho_x"]);
	});

	it("refuses to exchange without a valid verifier, before any request", async () => {
		const fetchMock = stubGitHub([]);
		await expect(complete({ codeVerifier: undefined })).rejects.toThrow("PKCE_VERIFIER_REQUIRED");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("treats GitHub's HTTP-200 error response as a sanitized failure", async () => {
		// e.g. a wrong code_verifier or reused code
		const fetchMock = stubGitHub([], 200, () =>
			json({
				error: "bad_verification_code",
				error_description: "The code passed is incorrect or expired.",
			}),
		);
		const err = await complete().catch((e) => e);

		expect(err).toBeInstanceOf(OAuthProviderError);
		expect(err).toMatchObject({
			code: "token_exchange_failed",
			details: { provider: "github", status: 200, oauthError: "bad_verification_code" },
		});
		for (const secret of ["gh-code", VERIFIER, "test-client-secret"]) {
			expect(err.message).not.toContain(secret);
		}
		// No profile lookups without a token.
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("drops a non-standard error value rather than echoing it", async () => {
		stubGitHub([], 200, () => json({ error: "<script>gh-code</script>" }));
		const err = await complete().catch((e) => e);
		expect(err.details.oauthError).toBeUndefined();
	});

	it("rejects a token response without an access token", async () => {
		stubGitHub([], 200, () => json({ token_type: "bearer", scope: "user:email" }));
		await expect(complete()).rejects.toMatchObject({ code: "invalid_token_response" });
	});

	it("fails when the profile can't be fetched", async () => {
		stubGitHub([], 200, undefined, () => json({ message: "Bad credentials" }, 401));
		await expect(complete()).rejects.toMatchObject({
			code: "profile_fetch_failed",
			details: { status: 401 },
		});
	});

	it("uses the primary email when GitHub has verified it", async () => {
		stubGitHub([
			{ email: "other@example.com", primary: false, verified: true },
			{ email: "primary@example.com", primary: true, verified: true },
		]);
		const { user } = await complete();

		expect(user).toMatchObject({
			provider: "github",
			providerAccountId: "42",
			email: "primary@example.com",
			emailVerified: true,
		});
	});

	it("falls back to another verified email when the primary isn't verified", async () => {
		stubGitHub([
			{ email: "primary@example.com", primary: true, verified: false },
			{ email: "backup@example.com", primary: false, verified: true },
		]);
		const { user } = await complete();

		expect(user.email).toBe("backup@example.com");
		expect(user.emailVerified).toBe(true);
	});

	it("reports the public email as unverified when none is verified", async () => {
		stubGitHub([
			{ email: "primary@example.com", primary: true, verified: false },
		]);
		const { user } = await complete();

		expect(user.email).toBe("public@example.com");
		expect(user.emailVerified).toBe(false);
	});

	it("treats a failed emails request as nothing verified", async () => {
		stubGitHub({ message: "Requires authentication" }, 403);
		const { user } = await complete();

		expect(user.email).toBe("public@example.com");
		expect(user.emailVerified).toBe(false);
	});
});
