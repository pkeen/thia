import { describe, it, expect, vi, afterEach } from "vitest";

import { Google } from "./google";

it("returns an authorizationUrl String with default scopes", () => {
	const google = new Google({
		clientId: "test-client-id",
		clientSecret: "test-client-secret",
		redirectUri: "http://localhost:3000/callback",
	});
	const result = google.begin({
		state: "test-state",
	});
	expect(typeof result.authorizationUrl).toBe("string");
	expect(result.authorizationUrl).toContain(
		"https://accounts.google.com/o/oauth2/v2/auth",
	);
	expect(result.authorizationUrl).toContain("scope=openid+email+profile");
	expect(result.authorizationUrl).toContain("state=test-state");
});

describe("complete", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** Fakes Google's token and userinfo endpoints. */
	function stubGoogle(userinfo: Record<string, unknown>) {
		const json = (body: unknown) =>
			new Response(JSON.stringify(body), {
				headers: { "Content-Type": "application/json" },
			});
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request) => {
				const url = String(input);
				if (url === "https://oauth2.googleapis.com/token") {
					return json({
						access_token: "ya29.x",
						token_type: "Bearer",
						scope: "openid email profile",
						id_token: "id.token.x",
					});
				}
				if (url === "https://www.googleapis.com/oauth2/v3/userinfo") {
					return json(userinfo);
				}
				throw new Error(`unexpected fetch: ${url}`);
			}),
		);
	}

	const complete = () =>
		new Google({
			clientId: "id",
			clientSecret: "secret",
			redirectUri: "http://localhost:3000/callback",
		}).complete({
			code: "code",
			state: "state",
			redirectUri: "http://localhost:3000/callback",
		});

	it("passes Google's email verification through", async () => {
		stubGoogle({ sub: "g-1", email: "a@example.com", email_verified: true });
		const { user } = await complete();

		expect(user).toMatchObject({
			provider: "google",
			providerAccountId: "g-1",
			email: "a@example.com",
			emailVerified: true,
		});
	});

	it("reports an unverified Google email as unverified", async () => {
		stubGoogle({ sub: "g-2", email: "b@example.com", email_verified: false });
		const { user } = await complete();

		expect(user.emailVerified).toBe(false);
	});
});
