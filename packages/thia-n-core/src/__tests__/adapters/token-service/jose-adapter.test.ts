import { makeJoseTokenService } from "../../../adapters/session-strategy/jwt-strategy/token-service/jose-adapter";
import { describe, test, expect } from "vitest";

describe("Jose adapter", () => {
	test("Signs and verifies same token", async () => {
		// const claims = {
		// 	id: 66,
		// 	value: "secret token",
		// };

		type AccessClaims = {
			typ: "access";
			sub: string;
			email: string;
		};

		const claims: AccessClaims = {
			typ: "access",
			sub: "user_66",
			email: "u66@example.com",
		};

		// HS256 uses a shared secret as Uint8Array
		const secret = new TextEncoder().encode("test-secret");

		const tokenService = makeJoseTokenService();

		const jwt = await tokenService.sign<AccessClaims>(claims, {
			key: secret,
			alg: "HS256",
			issuer: "thia",
			audience: "test-suite",
			subject: claims.sub,
			expiresIn: "15m",
			// name: "access", // this is your own option; jose ignores it
		});

		const { claims: verified, expiresAt } =
			await tokenService.verify<AccessClaims>(jwt, {
				key: secret,
				alg: "HS256",
				issuer: "thia",
				audience: "test-suite",
				subject: claims.sub,
			});

		expect(verified.typ).toBe("access");
		expect(verified.sub).toBe("user_66");
		expect(verified.email).toBe("u66@example.com");
		expect(typeof expiresAt === "number" || expiresAt === undefined).toBe(
			true
		);
	});
});
