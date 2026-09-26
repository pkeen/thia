// application/ports/oauth-transaction.port.ts

/**
 * Everything the callback needs to finish one login attempt, created by
 * `beginOAuth` and handed back to `completeOAuth`. It holds secrets (the PKCE
 * verifier, the nonce), so it must only ever leave the server encrypted.
 */
export type OAuthTransaction = {
	/** The `state` sent to the provider; the callback must echo it exactly. */
	state: string;
	providerId: string;
	/** The configured callback URI sent on authorization and token exchange. */
	redirectUri: string;
	/** PKCE (RFC 7636) verifier; only its S256 challenge is sent at begin. */
	codeVerifier: string;
	/** OIDC nonce, set for providers that issue ID tokens. */
	nonce?: string;
	/** Local path to return to after login; validated by the app. */
	returnTo?: string;
	issuedAt: number; // epoch seconds
	expiresAt: number; // epoch seconds
};

/**
 * Turns a transaction into an opaque, tamper-proof string (for a cookie or
 * similar client-held storage) and back.
 *
 * This replaces a server-side "issue/consume" store. Unsealing is a pure
 * check: it cannot tell whether the same sealed value was already used, so it
 * does not provide one-time consumption. Replay of a completed transaction is
 * bounded instead by its short expiry, by the provider's single-use
 * authorization codes, and by PKCE binding each code to this verifier.
 */
export interface OAuthTransactionSealer {
	seal(transaction: OAuthTransaction): Promise<string>;
	/**
	 * Decrypt and validate. Returns undefined - never throws - for anything
	 * malformed, tampered with, sealed under another key, or expired at `now`.
	 */
	unseal(sealed: string, now?: Date): Promise<OAuthTransaction | undefined>;
}
