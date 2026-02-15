import { it, expect } from "vitest";

import { GitHub } from "./github";

it("returns an authorizationUrl String", () => {
	const github = new GitHub({
		clientId: "test-client-id",
		clientSecret: "test-client-secret",
		redirectUri: "http://localhost:3000/callback",
	});
	const result = github.begin({
		// scopes: ["user:email"],
		state: "test-state",
	});
	expect(typeof result.authorizationUrl).toBe("string");
});
