// infra/oauth-transaction/jose-transaction-sealer.ts
import { EncryptJWT, jwtDecrypt } from "jose";
import {
	OAuthTransaction,
	OAuthTransactionSealer,
} from "../../application/ports/oauth-transaction-port";
import {
	DEFAULT_OAUTH_TRANSACTION_TTL_SEC,
	parseOAuthTransaction,
} from "../../application/oauth/transaction";

const MIN_SECRET_BYTES = 32;

/**
 * Key-derivation context. The AES key used here is HKDF-derived from the
 * secret with this label, so it is never the same key that signs session
 * tokens (which use the raw secret for HS256), even when both are configured
 * from one AUTH_SECRET. Bump the version to invalidate all in-flight logins.
 */
const HKDF_SALT = "thia:oauth-transaction:salt:v1";
const HKDF_INFO = "thia:oauth-transaction:A256GCM:v1";
/** Header `typ` and `aud` claim: a sealed transaction is not a session token and vice versa. */
const TOKEN_TYPE = "thia-oauth-txn+jwt";
const AUDIENCE = "thia:oauth-transaction";
/** Well above a real sealed transaction (~700 bytes); rejects junk early. */
const MAX_SEALED_LENGTH = 4096;
/** How far ahead of this server's clock another instance's may be. */
const MAX_CLOCK_SKEW_SEC = 60;

async function deriveKey(secret: string): Promise<Uint8Array> {
	const ikm = new TextEncoder().encode(secret);
	if (ikm.byteLength < MIN_SECRET_BYTES) {
		throw new Error(
			`OAuth transaction secret is too short (${ikm.byteLength} bytes) - need at least ${MIN_SECRET_BYTES} bytes. Generate one with e.g. \`openssl rand -base64 32\`.`
		);
	}
	const subtle = globalThis.crypto.subtle;
	const base = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
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

/**
 * Seals OAuth transactions as compact JWEs (`dir` + `A256GCM`): encrypted so
 * the PKCE verifier and nonce stay secret, and authenticated so any change is
 * rejected. Every instance configured with the same secret can unseal what
 * another sealed - there is no server-side state.
 */
export class JoseOAuthTransactionSealer implements OAuthTransactionSealer {
	private key: Promise<Uint8Array>;
	private maxAgeSec: number;

	constructor(secret: string, options: { maxAgeSec?: number } = {}) {
		// Validate synchronously so misconfiguration fails at startup.
		if (typeof secret !== "string" || new TextEncoder().encode(secret).byteLength < MIN_SECRET_BYTES) {
			throw new Error(
				`OAuth transaction secret is missing or too short - need at least ${MIN_SECRET_BYTES} bytes.`
			);
		}
		this.key = deriveKey(secret);
		this.maxAgeSec = options.maxAgeSec ?? DEFAULT_OAUTH_TRANSACTION_TTL_SEC;
	}

	async seal(transaction: OAuthTransaction): Promise<string> {
		const tx = parseOAuthTransaction(transaction);
		if (!tx) throw new Error("INVALID_TRANSACTION");
		if (tx.expiresAt - tx.issuedAt > this.maxAgeSec) {
			throw new Error("INVALID_TRANSACTION");
		}
		const { issuedAt, expiresAt, ...claims } = tx;
		return new EncryptJWT({ txn: claims })
			.setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: TOKEN_TYPE })
			.setAudience(AUDIENCE)
			.setIssuedAt(issuedAt)
			.setExpirationTime(expiresAt)
			.encrypt(await this.key);
	}

	async unseal(sealed: string, now: Date = new Date()): Promise<OAuthTransaction | undefined> {
		if (typeof sealed !== "string" || sealed.length === 0 || sealed.length > MAX_SEALED_LENGTH) {
			return undefined;
		}
		try {
			const { payload } = await jwtDecrypt(sealed, await this.key, {
				keyManagementAlgorithms: ["dir"],
				contentEncryptionAlgorithms: ["A256GCM"],
				typ: TOKEN_TYPE,
				audience: AUDIENCE,
				requiredClaims: ["iat", "exp"],
				// Server-side expiry: exp is checked strictly here...
				currentDate: now,
			});
			// ...and the age against the configured lifetime, whatever exp says.
			// A little future iat is tolerated for clock skew between instances.
			const nowSec = Math.floor(now.getTime() / 1000);
			const iat = payload.iat as number;
			if (nowSec - iat >= this.maxAgeSec || iat - nowSec > MAX_CLOCK_SKEW_SEC) {
				return undefined;
			}
			const txn = payload.txn;
			if (!txn || typeof txn !== "object" || Array.isArray(txn)) return undefined;
			return parseOAuthTransaction({
				...txn,
				issuedAt: payload.iat,
				expiresAt: payload.exp,
			});
		} catch {
			// Malformed, tampered, wrong key, wrong type or expired: all the same
			// to the caller, and nothing about the value is logged.
			return undefined;
		}
	}
}
