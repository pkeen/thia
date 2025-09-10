import * as jose from "jose";
import { z } from "zod";
import {
	TokenServicePort,
	SignOptions,
	VerifyOptions,
	Verified,
} from "../token-service-port";

export function makeJoseTokenService(): TokenServicePort {
	return {
		async sign<C extends object>(
			claims: C,
			opts: SignOptions
		): Promise<string> {
			const jwt = await new jose.SignJWT(claims as jose.JWTPayload)
				.setProtectedHeader({ alg: opts.alg })
				.setIssuedAt()
				.setExpirationTime(opts.expiresIn ?? "15m")
				.setIssuer(opts.issuer)
				.setAudience(opts.audience ?? undefined)
				.setSubject(opts.subject)
				.sign(opts.key);
			return jwt;
		},

		async verify<C extends object>(
			token: string,
			opts: VerifyOptions,
			guard?: (p: unknown) => p is C // optional runtime check
		): Promise<Verified<C>> {
			const { payload, protectedHeader } = await jose.jwtVerify(
				token,
				opts.key,
				{
					issuer: opts.issuer,
					audience: opts.audience,
				}
			);
			// const claims = schema.parse(payload); // <- typed + validated
			// Optional runtime check
			if (guard && !guard(payload)) {
				throw new Error("JWT payload did not match expected shape");
			}
			const exp =
				typeof payload.exp === "number"
					? payload.exp * 1000
					: undefined;
			return {
				claims: payload as unknown as C,
				header: protectedHeader,
				expiresAt: exp,
			};
		},
	};
}
