// application/oauth/pkce.ts
import { base64url } from "jose";

/**
 * 32 random bytes encode to 43 base64url characters: the RFC 7636 §4.1
 * recommendation, and the minimum verifier length the RFC allows.
 */
const RANDOM_BYTES = 32;

/** RFC 7636 §4.1: 43-128 characters from the unreserved set. */
export const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

/**
 * A fresh, unpadded base64url string from the platform CSPRNG (Web Crypto,
 * available in Node >= 19 and edge runtimes). Used for `state`, `nonce` and
 * the PKCE code verifier.
 */
export function randomUrlSafeToken(bytes: number = RANDOM_BYTES): string {
	const buf = new Uint8Array(bytes);
	globalThis.crypto.getRandomValues(buf);
	return base64url.encode(buf);
}

/** A new RFC 7636 code verifier (43 characters, 256 bits of entropy). */
export function createCodeVerifier(): string {
	return randomUrlSafeToken(RANDOM_BYTES);
}

/**
 * The S256 code challenge: BASE64URL(SHA256(ASCII(code_verifier))), unpadded
 * (RFC 7636 §4.2). There is deliberately no "plain" variant.
 */
export async function deriveCodeChallenge(codeVerifier: string): Promise<string> {
	if (!CODE_VERIFIER_PATTERN.test(codeVerifier)) {
		throw new Error("INVALID_CODE_VERIFIER");
	}
	const digest = await globalThis.crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(codeVerifier)
	);
	return base64url.encode(new Uint8Array(digest));
}

/**
 * Compares two strings without an early exit on the first differing
 * character, so response timing doesn't reveal how much of a secret matched.
 */
export function timingSafeEqual(a: string, b: string): boolean {
	if (typeof a !== "string" || typeof b !== "string") return false;
	const x = new TextEncoder().encode(a);
	const y = new TextEncoder().encode(b);
	let diff = x.length ^ y.length;
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
	}
	return diff === 0;
}
