// infra/session/hmac-refresh-token-crypto.ts
import type { RefreshTokenCrypto } from "../../application/session/session-repository.port";

const MIN_SECRET_BYTES = 32;
/**
 * HKDF context: the HMAC key is derived for this purpose only, never the raw
 * secret that signs access tokens. Bumping the version invalidates every
 * stored refresh token.
 */
const HKDF_SALT = "thia:refresh-token:salt:v1";
const HKDF_INFO = "thia:refresh-token:HMAC-SHA256:v1";

const toBase64Url = (bytes: ArrayBuffer | Uint8Array) =>
	Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");

function randomBase64Url(byteLength: number) {
	return toBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function deriveHmacKey(secret: string): Promise<CryptoKey> {
	const ikm = new TextEncoder().encode(secret);
	if (ikm.byteLength < MIN_SECRET_BYTES) {
		throw new Error(
			`Refresh token secret is too short (${ikm.byteLength} bytes) - need at least ${MIN_SECRET_BYTES} bytes.`
		);
	}
	const subtle = globalThis.crypto.subtle;
	const base = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
	return subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: new TextEncoder().encode(HKDF_SALT),
			info: new TextEncoder().encode(HKDF_INFO),
		},
		base,
		{ name: "HMAC", hash: "SHA-256", length: 256 },
		false,
		["sign"]
	);
}

/**
 * Refresh secrets are 256 random bits; only HMAC-SHA256(k, secret) is
 * stored, with k HKDF-derived from the app secret (AUTH_SECRET). A database
 * leak alone can't be used to test guesses, and rotating the app secret
 * invalidates every refresh token.
 */
export class HmacRefreshTokenCrypto implements RefreshTokenCrypto {
	private key: Promise<CryptoKey>;

	constructor(secret: string) {
		if (new TextEncoder().encode(secret).byteLength < MIN_SECRET_BYTES) {
			throw new Error(
				`Refresh token secret is too short - need at least ${MIN_SECRET_BYTES} bytes.`
			);
		}
		this.key = deriveHmacKey(secret);
	}

	newSessionId() {
		return randomBase64Url(16);
	}

	newSecret() {
		return randomBase64Url(32);
	}

	async hash(secret: string) {
		const mac = await globalThis.crypto.subtle.sign(
			"HMAC",
			await this.key,
			new TextEncoder().encode(secret)
		);
		return toBase64Url(mac);
	}

	async matches(secret: string, hash: string | null) {
		if (hash === null) return false;
		const actual = Buffer.from(await this.hash(secret));
		const expected = Buffer.from(hash);
		if (actual.length !== expected.length) return false;
		let diff = 0;
		for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
		return diff === 0;
	}
}
