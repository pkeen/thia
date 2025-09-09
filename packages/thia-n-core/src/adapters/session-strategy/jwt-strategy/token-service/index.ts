// import { JwtConfig, TokenService, VerifiedToken } from "../types";
// import { User } from "../../../auth-system/index.types";
import { User } from "entities";
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
import {
	TokenTamperedError,
	TokenExpiredError,
} from "../../../../entities/error";
// import jose from "jose";
import { JWTPayload, SignJWT, jwtVerify } from "jose";
// import { createLogger } from "@pete_keen/logger";
import { Role } from "core/roles/index.types";

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
				// logger.warn(
				// 	"Token validation failed: " +
				// 		(error.message || "Invalid token")
				// );

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
