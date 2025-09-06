// import { jest, describe, it, expect } from "@jest/globals";
// import { JwtStrategy } from "./index";
// import { User, KeyCards, JwtOptions, JwtConfig } from "../../types";

// // // Create mock for token service
// // const createMockJwtTokenService = () => {
// //   const mockService = {
// //     generate: jest.fn(),
// //     validate: jest.fn()
// // };

// describe("JwtStrategy", () => {
// 	let jwtStrategy: JwtStrategy;
// 	const mockUser: User = { id: "1", email: "test@example.com" };
// 	const mockConfig: JwtConfig = {
// 		access: {
// 			key: "access",
// 			algorithm: "HS256",
// 			expiresIn: "1h",
// 			secretKey: "secret",
// 		},
// 		refresh: {
// 			key: "refresh",
// 			algorithm: "HS256",
// 			expiresIn: "7d",
// 			secretKey: "secret",
// 		},
// 	};

// 	beforeEach(() => {
// 		jwtStrategy = new JwtStrategy(mockConfig);
// 	});

// 	it("should generate access and refresh tokens", async () => {
// 		const keyCards = await jwtStrategy.createKeyCards(mockUser);
// 		expect(keyCards).toHaveLength(2);
// 		expect(keyCards[0].name).toBe("access");
// 		expect(keyCards[1].name).toBe("refresh");
// 	});

// 	it("should validate access and refresh tokens", async () => {
// 		const keyCards = await jwtStrategy.createKeyCards(mockUser);
// 		const result = await jwtStrategy.validate(keyCards);
// 		expect(result.authenticated).toBe(true);
// 		if (result.authenticated) {
// 			expect(result.user).toEqual(mockUser);
// 		}
// 	});

// 	it("should support refresh tokens", async () => {
// 		expect(jwtStrategy.supportsRefresh()).toBe(true);
// 	});
// });
