// import { JwtConfig, TokenService, VerifiedToken } from "../types";
import { User } from "../../../auth-system/index.types";
import {
	JwtOptions,
	TokenService,
	VerifiedToken,
	AuthPayload,
	AccessTokenPayload,
	RefreshTokenPayload,
	RefreshUser,
	AccessUser,
} from "./index.types";
import { TokenTamperedError, TokenExpiredError } from "../../../error";
// import jose from "jose";
import { JWTPayload, SignJWT, jwtVerify } from "jose";
import { createLogger } from "@pete_keen/logger";
import { Role } from "core/roles/index.types";

const logger = createLogger({});

// export class JwtTokenServiceClass implements TokenService {
// 	createPayload(user: User): AuthPayload {
// 		return {
// 			id: user.id.toString(),
// 			email: user.email,
// 			name: user.name,
// 			image: user.image,
// 			role: user.role,
// 		};
// 	}

// 	async generate(user: User, options: JwtOptions): Promise<string> {
// 		return new SignJWT(this.createPayload(user))
// 			.setProtectedHeader({ alg: options.algorithm || "HS256" })
// 			.setIssuedAt()
// 			.setExpirationTime(options.expiresIn || "1h")
// 			.sign(new TextEncoder().encode(options.secretKey));
// 	}

// 	// async revoke(token: string): Promise<void> {
// 	// 	return Promise.resolve();
// 	// }

// 	async validate(token: string, options: JwtOptions): Promise<VerifiedToken> {
// 		try {
// 			const { payload, protectedHeader } = await jwtVerify(
// 				token,
// 				new TextEncoder().encode(options.secretKey)
// 				// {
// 				// 	// Optional: Specify required claims
// 				// 	requiredClaims: ["id", "email"],
// 				// 	// // Optional: Validate issuer
// 				// 	// issuer: options.issuer,
// 				// 	// // Optional: Validate audience
// 				// 	// audience: options.audience,
// 				// }
// 			);

// 			// // Verify required claims exist and are valid
// 			// if (!payload.id || !payload.email) {
// 			// 	throw new TokenTamperedError("Missing required claims");
// 			// }

// 			// // Additional custom claim validation if needed
// 			// if (payload.aud && payload.aud !== options.audience) {
// 			// 	throw new TokenTamperedError("Invalid audience");
// 			// }

// 			const user: User = {
// 				id: payload.id as string,
// 				email: payload.email as string,
// 				name: payload.name as string,
// 				image: payload.image as string,
// 				role: payload.role as Role,
// 			};

// 			return {
// 				user: user,
// 				expiresAt: payload.exp as number,
// 				// roles: payload.roles as string[] | undefined,
// 				// scope: payload.scope as string[] | undefined,
// 			};
// 		} catch (error: any) {
// 			// Token expiration is an expected error - don't throw
// 			if (error.code === "ERR_JWT_EXPIRED") {
// 				throw new TokenExpiredError(
// 					"Token has expired " + (error.message || "Invalid token")
// 				);
// 			}
// 			logger.warn(
// 				"Token validation failed: " + (error.message || "Invalid token")
// 			);

// 			// All other JWT errors indicate tampering - throw security error
// 			if (
// 				error.code.startsWith("ERR_JWT_") ||
// 				error.code.startsWith("ERR_JWS_")
// 			) {
// 				throw new TokenTamperedError(
// 					"Token validation failed: " +
// 						(error.message || "Invalid token")
// 				);
// 			}

// 			// Re-throw unexpected errors
// 			throw error;
// 		}
// 	}

// 	// async verify<T>(token: string, options: JwtOptions): Promise<T> {
// 	// 	try {
// 	// 		const { payload } = await jwtVerify(
// 	// 			token,
// 	// 			new TextEncoder().encode(options.secretKey)
// 	// 		);
// 	// 		return payload as T;
// 	// 	} catch (error: any) {
// 	// 		logger.warn(
// 	// 			"Token validation failed: " + (error.message || "Invalid token")
// 	// 		);
// 	// 		throw error;
// 	// 	}
// 	// }
// }

export const JwtTokenService = (): TokenService => {
	return {
		generate: async (
			payload: AuthPayload,
			options: JwtOptions
		): Promise<string> => {
			return new SignJWT(payload)
				.setProtectedHeader({ alg: options.algorithm || "HS256" })
				.setIssuedAt()
				.setExpirationTime(options.expiresIn || "1h")
				.sign(new TextEncoder().encode(options.secretKey));
		},
		validate: async (
			token: string,
			options: JwtOptions
		): Promise<AuthPayload> => {
			try {
				const { payload, protectedHeader } = await jwtVerify(
					token,
					new TextEncoder().encode(options.secretKey)
				);
				console.log("PAYLOAD: ", payload);
				return payload;
			} catch (error: any) {
				if (error.code === "ERR_JWT_EXPIRED") {
					throw new TokenExpiredError(
						"Token has expired " +
							(error.message || "Invalid token")
					);
				}
				logger.warn(
					"Token validation failed: " +
						(error.message || "Invalid token")
				);

				// All other JWT errors indicate tampering - throw security error
				if (
					error.code.startsWith("ERR_JWT_") ||
					error.code.startsWith("ERR_JWS_")
				) {
					throw new TokenTamperedError(
						"Token validation failed: " +
							(error.message || "Invalid token")
					);
				}

				// Re-throw unexpected errors
				throw error;
			}
		},
	};
};

export * from "./index.types";
