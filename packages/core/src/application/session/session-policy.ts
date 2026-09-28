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
 * Supported access-token lifetimes. Without refresh the lifetime is the whole
 * session, and in stateless mode also the revocation delay.
 */
export const SESSION_TTL_MIN_SEC = 60;
export const SESSION_TTL_MAX_SEC = 24 * 60 * 60;
/** With refresh enabled access tokens are renewed, so they stay short. */
export const REFRESH_ACCESS_TTL_MAX_SEC = 60 * 60;
export const REFRESH_IDLE_TTL_MIN_SEC = 60 * 60;
export const REFRESH_IDLE_TTL_MAX_SEC = 30 * 24 * 60 * 60;
export const REFRESH_ABSOLUTE_TTL_MAX_SEC = 90 * 24 * 60 * 60;

/**
 * Stored, per-device sessions renewed with rotating refresh tokens (ADR-004).
 * Requires a session repository in both modes.
 */
export type RefreshPolicy = Readonly<{
	/** A session ends if not refreshed for this long. */
	idleTtlSec: number;
	/** A session ends this long after sign-in, however active. */
	absoluteTtlSec: number;
}>;

export type SessionPolicy = Readonly<{
	mode: SessionMode;
	/** Lifetime of newly issued access tokens and their cookies, in seconds. */
	ttlSec: number;
	/** Omitted: no refresh tokens or session records (ADR-003 behavior). */
	refresh?: RefreshPolicy;
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
	refresh?: unknown;
}): SessionPolicy {
	const { mode, ttlSec, refresh } = input;
	if (!SESSION_MODES.includes(mode as SessionMode)) {
		throw new SessionPolicyError(
			`unknown mode ${JSON.stringify(mode)}; expected one of ${SESSION_MODES.join(", ")}`
		);
	}
	if (refresh === undefined) {
		requireSeconds("ttlSec", ttlSec, SESSION_TTL_MIN_SEC, SESSION_TTL_MAX_SEC);
		return Object.freeze({ mode: mode as SessionMode, ttlSec: ttlSec as number });
	}

	if (typeof refresh !== "object" || refresh === null || Array.isArray(refresh)) {
		throw new SessionPolicyError("refresh must be an object or omitted");
	}
	const { idleTtlSec, absoluteTtlSec, ...unknown } = refresh as Record<string, unknown>;
	const extra = Object.keys(unknown);
	if (extra.length > 0) {
		throw new SessionPolicyError(`unknown refresh setting ${JSON.stringify(extra[0])}`);
	}
	requireSeconds("ttlSec", ttlSec, SESSION_TTL_MIN_SEC, REFRESH_ACCESS_TTL_MAX_SEC);
	requireSeconds("refresh.idleTtlSec", idleTtlSec, REFRESH_IDLE_TTL_MIN_SEC, REFRESH_IDLE_TTL_MAX_SEC);
	requireSeconds(
		"refresh.absoluteTtlSec",
		absoluteTtlSec,
		REFRESH_IDLE_TTL_MIN_SEC,
		REFRESH_ABSOLUTE_TTL_MAX_SEC
	);
	if ((absoluteTtlSec as number) < (idleTtlSec as number)) {
		throw new SessionPolicyError("refresh.absoluteTtlSec must be at least refresh.idleTtlSec");
	}
	return Object.freeze({
		mode: mode as SessionMode,
		ttlSec: ttlSec as number,
		refresh: Object.freeze({
			idleTtlSec: idleTtlSec as number,
			absoluteTtlSec: absoluteTtlSec as number,
		}),
	});
}

function requireSeconds(name: string, value: unknown, min: number, max: number) {
	if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
		throw new SessionPolicyError(`${name} must be an integer from ${min} to ${max} seconds`);
	}
}
