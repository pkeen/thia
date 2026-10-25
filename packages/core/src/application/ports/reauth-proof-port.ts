// application/ports/reauth-proof-port.ts

/** What a re-authentication proof attests (ADR-005). Times are epoch seconds. */
export type ReauthProofClaims = {
	userId: string;
	/** The stored device session the proof is bound to. */
	sessionId: string;
	/** The user's token version when the proof was issued. */
	tokenVersion: number;
	issuedAt: number;
	expiresAt: number;
};

export type ReauthProofOpening =
	| { status: "valid"; claims: ReauthProofClaims }
	| { status: "expired" }
	/** Malformed, tampered with, wrong key, type or audience. */
	| { status: "invalid" };

/**
 * Seals and opens the short-lived proof that a linked provider account was
 * confirmed again. Distinct from access tokens and OAuth transactions: its
 * key, token type and audience are its own, so none of them can stand in for
 * a proof or the reverse.
 */
export interface ReauthProofCodec {
	seal(claims: ReauthProofClaims): Promise<string>;
	/** Never throws for a bad value; infrastructure failures are not expected here. */
	open(token: string, now: Date): Promise<ReauthProofOpening>;
}
