// infra/reauth/jose-reauth-proof-codec.ts
import { SignJWT, jwtVerify, errors } from "jose";
import type {
	ReauthProofClaims,
	ReauthProofCodec,
	ReauthProofOpening,
} from "../../application/ports/reauth-proof-port";
import { SESSION_ID_PATTERN } from "../../application/claims/auth-claims";

const MIN_SECRET_BYTES = 32;

/**
 * The HS256 key is HKDF-derived from the secret with this label, so it is
 * never the key that signs access tokens (the raw secret) or encrypts OAuth
 * transactions, even when all are configured from one AUTH_SECRET.
 */
const HKDF_SALT = "thia:reauth-proof:salt:v1";
const HKDF_INFO = "thia:reauth-proof:HS256:v1";
const TOKEN_TYPE = "thia-reauth-proof+jwt";
const AUDIENCE = "thia:reauth-proof";
const MAX_TOKEN_LENGTH = 1024;
/** How far ahead of this server's clock another instance's may be. */
const MAX_CLOCK_SKEW_SEC = 60;

async function deriveKey(secret: string): Promise<Uint8Array> {
	const subtle = globalThis.crypto.subtle;
	const base = await subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, [
		"deriveBits",
	]);
	const bits = await subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: new TextEncoder().encode(HKDF_SALT),
			info: new TextEncoder().encode(HKDF_INFO),
		},
		base,
		256
	);
	return new Uint8Array(bits);
}

export class JoseReauthProofCodec implements ReauthProofCodec {
	private key: Promise<Uint8Array>;

	constructor(
		secret: string,
		private options: { maxLifetimeSec: number }
	) {
		if (
			typeof secret !== "string" ||
			new TextEncoder().encode(secret).byteLength < MIN_SECRET_BYTES
		) {
			throw new Error(
				`Re-authentication proof secret is missing or too short - need at least ${MIN_SECRET_BYTES} bytes.`
			);
		}
		this.key = deriveKey(secret);
	}

	async seal(claims: ReauthProofClaims): Promise<string> {
		if (
			claims.expiresAt <= claims.issuedAt ||
			claims.expiresAt - claims.issuedAt > this.options.maxLifetimeSec
		) {
			throw new Error("INVALID_REAUTH_PROOF");
		}
		return new SignJWT({ sid: claims.sessionId, uvn: claims.tokenVersion })
			.setProtectedHeader({ alg: "HS256", typ: TOKEN_TYPE })
			.setAudience(AUDIENCE)
			.setSubject(claims.userId)
			.setIssuedAt(claims.issuedAt)
			.setExpirationTime(claims.expiresAt)
			.sign(await this.key);
	}

	async open(token: string, now: Date): Promise<ReauthProofOpening> {
		if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
			return { status: "invalid" };
		}
		try {
			const { payload } = await jwtVerify(token, await this.key, {
				algorithms: ["HS256"],
				typ: TOKEN_TYPE,
				audience: AUDIENCE,
				requiredClaims: ["iat", "exp", "sub"],
				currentDate: now,
			});
			const { iat, exp, sub, sid, uvn } = payload;
			const nowSec = Math.floor(now.getTime() / 1000);
			if (
				typeof iat !== "number" ||
				typeof exp !== "number" ||
				typeof sub !== "string" ||
				typeof sid !== "string" ||
				!SESSION_ID_PATTERN.test(sid) ||
				typeof uvn !== "number" ||
				!Number.isInteger(uvn) ||
				uvn < 0 ||
				exp <= iat ||
				// The lifetime cap holds whatever the signer put in the token.
				exp - iat > this.options.maxLifetimeSec ||
				iat - nowSec > MAX_CLOCK_SKEW_SEC
			) {
				return { status: "invalid" };
			}
			return {
				status: "valid",
				claims: { userId: sub, sessionId: sid, tokenVersion: uvn, issuedAt: iat, expiresAt: exp },
			};
		} catch (e) {
			if (e instanceof errors.JWTExpired) return { status: "expired" };
			return { status: "invalid" };
		}
	}
}
