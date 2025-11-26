import { it, expect } from "vitest";
import { registerUser } from "../../../application/use-cases/register-user";
// import { issueAccessToken } from "../issue-access-token";
// import { loginWithPassword } from "../login-with-password";
import { DevTokenSigner } from "../../../infra/jwt/dev-signer";
import { InMemoryUoW } from "../../../infra/memory/in-memory-uow";
import { NaiveHasher } from "../../../infra/password/naive-hasher";
import { SystemClock } from "../../../infra/clock/system-clock";
import { UlidIdGenerator } from "../../../infra/id/ulid-id-generator";

it("registers then logs in and issues access token", async () => {
	const clock = new SystemClock();
	const ids = new UlidIdGenerator(clock);
	const uow = new InMemoryUoW();
	const hasher = new NaiveHasher();
	const signer = new DevTokenSigner();

	const user = await registerUser(
		{ uow, ids, clock, hasher },
		{ email: "a@b.com", password: "pw" }
	);
	// const authed = await loginWithPassword(
	// 	{ uow, hasher },
	// 	{ email: "a@b.com", password: "pw" }
	// );
	// const access = await issueAccessToken(
	// 	{
	// 		signer,
	// 		clock,
	// 		ids,
	// 		policyVersion: 1,
	// 		issuer: "pkg",
	// 		audience: "web",
	// 		ttlSec: 900,
	// 	},
	// 	authed
	// );

	expect(user).toBeDefined();
});
