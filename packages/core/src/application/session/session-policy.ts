// application/session/session-policy.ts

/**
 * How a session token is checked on each request. These are different
 * behaviours, not security levels: signature, issuer, audience, expiry and
 * claim validation are identical in both.
 *
 * - `jwt-stateless`: the verified token alone authenticates the request. No
 *   user or session lookup, so deleted users and globally revoked tokens stay
 *   valid until they expire.
 * - `jwt-user-validated`: additionally loads the user and requires the
 *   token's `uvn` to equal the stored token version, which makes deleted users
 *   and "sign out everywhere" take effect on the next request.
 */
export const SESSION_MODES = ["jwt-stateless", "jwt-user-validated"] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

/**
 * Supported token lifetimes. There are no refresh tokens, so the lifetime is
 * the whole session, and in stateless mode also the revocation delay.
 */
export const SESSION_TTL_MIN_SEC = 60;
export const SESSION_TTL_MAX_SEC = 24 * 60 * 60;

export type SessionPolicy = Readonly<{
	mode: SessionMode;
	/** Lifetime of newly issued tokens and their cookies, in seconds. */
	ttlSec: number;
}>;

export class SessionPolicyError extends Error {
	constructor(message: string) {
		super(`INVALID_SESSION_POLICY: ${message}`);
		this.name = "SessionPolicyError";
	}
}

/**
 * Validates developer configuration and returns a frozen policy. Throws
 * SessionPolicyError for an unknown mode or an unsupported lifetime, so a
 * misconfigured app fails at startup rather than on the first request.
 *
 * The policy must come from trusted application configuration - never from
 * a request or a token claim.
 */
export function defineSessionPolicy(input: {
	mode: unknown;
	ttlSec: unknown;
}): SessionPolicy {
	const { mode, ttlSec } = input;
	if (!SESSION_MODES.includes(mode as SessionMode)) {
		throw new SessionPolicyError(
			`unknown mode ${JSON.stringify(mode)}; expected one of ${SESSION_MODES.join(", ")}`
		);
	}
	if (
		typeof ttlSec !== "number" ||
		!Number.isInteger(ttlSec) ||
		ttlSec < SESSION_TTL_MIN_SEC ||
		ttlSec > SESSION_TTL_MAX_SEC
	) {
		throw new SessionPolicyError(
			`ttlSec must be an integer from ${SESSION_TTL_MIN_SEC} to ${SESSION_TTL_MAX_SEC} seconds`
		);
	}
	return Object.freeze({ mode: mode as SessionMode, ttlSec });
}
