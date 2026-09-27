import { SignJWT, jwtVerify, errors } from "jose";
import {
	AUTH_CLAIMS_CLOCK_TOLERANCE_SEC,
	AuthClaims,
	parseAuthClaims,
} from "../../application/claims/auth-claims";
import { InvalidSessionTokenError } from "../../application/session/errors";
import { Clock } from "../../application/ports/clock.port";
import {
	TokenSigner,
	TokenVerifier,
} from "../../application/ports/token-signer.port";

const MIN_SECRET_BYTES = 32;

function encodeSecret(secret: string): Uint8Array {
	const key = new TextEncoder().encode(secret);
	if (key.byteLength < MIN_SECRET_BYTES) {
		throw new Error(
			`HMAC signer secret is too short (${key.byteLength} bytes) - need at least ${MIN_SECRET_BYTES} bytes. Generate one with e.g. \`openssl rand -base64 32\`.`
		);
	}
	return key;
}

/**
 * Real HS256-signed/verified JWTs, in contrast to DevTokenSigner/
 * DevTokenVerifier (base64-only, no signature - dev/test fixtures only).
 */
export class HmacTokenSigner implements TokenSigner {
	private key: Uint8Array;

	constructor(secret: string) {
		this.key = encodeSecret(secret);
	}

	async sign(claims: AuthClaims): Promise<string> {
		return new SignJWT({
			jti: claims.jti,
			ver: claims.ver,
			uvn: claims.uvn,
			pvn: claims.pvn,
			usr: claims.usr,
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuer(claims.iss)
			.setAudience(claims.aud)
			.setSubject(claims.sub)
			.setIssuedAt(claims.iat)
			.setExpirationTime(claims.exp)
			.sign(this.key);
	}
}

/** Longer than any token we issue; anything bigger isn't worth parsing. */
const MAX_TOKEN_LENGTH = 8192;

export type HmacTokenVerifierOptions = {
	/** Both are required: a verifier that skipped them would accept tokens minted for another app. */
	issuer: string;
	audience: string;
	/** Defaults to the system clock; injectable for tests. */
	clock?: Clock;
};

/**
 * Verifies HS256 only (no algorithm negotiation), the configured issuer and
 * audience, expiry with AUTH_CLAIMS_CLOCK_TOLERANCE_SEC of skew, then
 * validates the payload at runtime with parseAuthClaims. Every rejection is
 * an InvalidSessionTokenError carrying a reason code, never token content.
 */
export class HmacTokenVerifier implements TokenVerifier {
	private key: Uint8Array;

	constructor(
		secret: string,
		private expected: HmacTokenVerifierOptions
	) {
		this.key = encodeSecret(secret);
		if (!expected?.issuer || !expected?.audience) {
			throw new Error("HmacTokenVerifier requires an issuer and an audience");
		}
	}

	async verify(token: string): Promise<AuthClaims> {
		if (
			typeof token !== "string" ||
			token.length === 0 ||
			token.length > MAX_TOKEN_LENGTH
		) {
			throw new InvalidSessionTokenError("malformed");
		}
		const now = this.expected.clock?.now() ?? new Date();

		let payload: unknown;
		try {
			({ payload } = await jwtVerify(token, this.key, {
				algorithms: ["HS256"],
				issuer: this.expected.issuer,
				audience: this.expected.audience,
				requiredClaims: ["iss", "aud", "sub", "iat", "exp"],
				clockTolerance: AUTH_CLAIMS_CLOCK_TOLERANCE_SEC,
				currentDate: now,
			}));
		} catch (e) {
			if (e instanceof errors.JWTExpired) {
				throw new InvalidSessionTokenError("expired");
			}
			if (e instanceof errors.JOSEError) {
				throw new InvalidSessionTokenError("verification_failed");
			}
			throw e;
		}

		return parseAuthClaims(payload, now);
	}
}
