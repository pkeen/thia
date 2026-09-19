import { describe, it, expect, vi, afterEach } from "vitest";

import { GitHub } from "./github";

const github = () =>
	new GitHub({
		clientId: "test-client-id",
		clientSecret: "test-client-secret",
		redirectUri: "http://localhost:3000/callback",
	});

it("returns an authorizationUrl String", () => {
	const result = github().begin({ state: "test-state" });
	expect(typeof result.authorizationUrl).toBe("string");
});

it("requests the user:email scope so email verification can be read", () => {
	const url = new URL(github().begin({ state: "s" }).authorizationUrl);
	expect(url.searchParams.get("scope")).toBe("user:email");
});

const profile = {
	login: "octocat",
	id: 42,
	avatar_url: "https://avatars.example/42",
	name: "Octo Cat",
	email: "public@example.com",
};

/** Fakes GitHub's token, profile and emails endpoints. */
function stubGitHub(emails: unknown, emailsStatus = 200) {
	const json = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	const fetchMock = vi.fn(async (input: string | URL | Request) => {
		const url = String(input);
		if (url.startsWith("https://github.com/login/oauth/access_token")) {
			return json({ access_token: "gho_x", token_type: "bearer", scope: "user:email" });
		}
		if (url === "https://api.github.com/user") return json(profile);
		if (url === "https://api.github.com/user/emails") return json(emails, emailsStatus);
		throw new Error(`unexpected fetch: ${url}`);
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const complete = () =>
	github().complete({
		code: "code",
		state: "state",
		redirectUri: "http://localhost:3000/callback",
	});

describe("complete", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
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
