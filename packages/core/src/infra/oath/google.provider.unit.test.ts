import { it, expect } from "vitest";

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
