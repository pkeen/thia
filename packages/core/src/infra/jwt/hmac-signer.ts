import { SignJWT, jwtVerify } from "jose";
import { AuthClaims } from "application/claims/auth-claims";
import {
	TokenSigner,
	TokenVerifier,
} from "application/ports/token-signer.port";

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

export class HmacTokenVerifier implements TokenVerifier {
	private key: Uint8Array;

	constructor(
		secret: string,
		private expected?: { issuer?: string; audience?: string }
	) {
		this.key = encodeSecret(secret);
	}

	async verify(token: string): Promise<AuthClaims> {
		const { payload } = await jwtVerify(token, this.key, {
			algorithms: ["HS256"],
			issuer: this.expected?.issuer,
			audience: this.expected?.audience,
		});

		return {
			iss: payload.iss!,
			aud: payload.aud as string,
			sub: payload.sub!,
			iat: payload.iat!,
			exp: payload.exp!,
			jti: payload.jti as string | undefined,
			ver: payload.ver as number,
			uvn: payload.uvn as number,
			pvn: payload.pvn as number,
			usr: payload.usr as AuthClaims["usr"],
		};
	}
}
