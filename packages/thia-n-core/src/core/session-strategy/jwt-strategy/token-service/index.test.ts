// import { jest, describe, it, expect } from "@jest/globals";
// import { JwtTokenService } from "./index";
// import {
// 	TokenTamperedError,
// 	TokenExpiredError,
// 	AuthError,
// 	TokenError,
// 	AuthErrorCode,
// } from "../../../error";
// import { UserPublic as User, DatabaseUser } from "../../../types";
// import { JwtOptions } from "./index.types";

// describe("JwtTokenService", () => {
// 	let tokenService: JwtTokenService;
// 	const options: JwtOptions = {
// 		key: "your-key",
// 		secretKey: "your-secret-key",
// 		algorithm: "HS256",
// 		expiresIn: "1h",
// 	};
// 	const mockUser: User = {
// 		id: "fdfcec84-8bd0-4442-9132-400ac39b9bfc",
// 		email: "pkeen7@gmail.com",
// 	};
// 	const mockDatabaseUser: DatabaseUser = {
// 		id: "fdfcec84-8bd0-4442-9132-400ac39b9bfc",
// 		name: null,
// 		email: "pkeen7@gmail.com",
// 		emailVerified: null,
// 		image: null,
// 		password:
// 			"$2a$10$YrKnYObyoAl5XhyFHAZev.n4w5Y7LmkQM2vAXrCNg7sX/lioNjkry",
// 	};

// 	beforeEach(() => {
// 		tokenService = new JwtTokenService();
// 	});

// 	it("should convert user to payload", () => {
// 		const payload = tokenService.createPayload(mockDatabaseUser);
// 		expect(payload.id).toStrictEqual(mockUser.id);
// 		expect(payload.email).toStrictEqual(mockUser.email);
// 		expect(payload.password).toBeUndefined();
// 	});

// 	it("should generate a JWT token", async () => {
// 		const token = await tokenService.generate(mockUser, options);
// 		expect(token).toBeDefined();
// 	});

// 	it("validates legitimate token", async () => {
// 		// Generate a valid token first
// 		const token = await tokenService.generate(mockUser, options);
// 		const result = await tokenService.validate(token, options);
// 		expect(result.user).toStrictEqual(mockUser);
// 	});

// 	it("throws TokenTamperedError for modified payload", async () => {
// 		const token = await tokenService.generate(mockUser, options);
// 		const [header, payload, signature] = token.split(".");
// 		const tamperedPayload = Buffer.from(
// 			JSON.stringify({ ...JSON.parse(atob(payload)), id: "hacked" })
// 		).toString("base64url");
// 		const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

// 		await expect(
// 			tokenService.validate(tamperedToken, options)
// 		).rejects.toThrow(TokenTamperedError);
// 	});

// 	it("throws TokenExpiredError for expired token", async () => {
// 		const token = await tokenService.generate(mockUser, {
// 			...options,
// 			expiresIn: "0s",
// 		});
// 		try {
// 			await tokenService.validate(token, options);
// 		} catch (error) {
// 			expect(error).toBeInstanceOf(TokenExpiredError);
// 			expect(error.code).toBe(AuthErrorCode.TOKEN_EXPIRED);
// 		}
// 	});

// 	// it("throws InvalidSignatureError for invalid signature", async () => {
// 	// 	const token = await tokenService.generate(mockUser, options);
// 	// 	const [header, payload, signature] = token.split(".");
// 	// 	const tamperedSignature = "invalid-signature";
// 	// 	const tamperedToken = `${header}.${payload}.${tamperedSignature}`;

// 	// 	await expect(
// 	// 		tokenService.validate(tamperedToken, options)
// 	// 	).rejects.toThrow(InvalidSignatureError);
// 	// });
// });
