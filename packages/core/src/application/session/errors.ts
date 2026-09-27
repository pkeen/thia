/**
 * Why a session token was refused. Codes only: never the token, its claims
 * or the underlying library message, so these are safe to log.
 */
export type InvalidSessionTokenReason =
	| "malformed"
	| "verification_failed"
	| "invalid_claims"
	| "unsupported_claims_version"
	| "issued_in_future"
	| "expired"
	| "lifetime_too_long";

/**
 * The token is not an acceptable credential (bad signature, wrong issuer or
 * audience, expired, malformed claims...). Distinct from infrastructure
 * failures, which surface as ordinary errors.
 */
export class InvalidSessionTokenError extends Error {
	constructor(public readonly reason: InvalidSessionTokenReason) {
		super(`INVALID_SESSION_TOKEN: ${reason}`);
		this.name = "InvalidSessionTokenError";
	}
}
