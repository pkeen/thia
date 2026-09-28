// application/identity/claims/AuthClaims.ts
import { z } from "zod";
import { InvalidSessionTokenError } from "../session/errors";
import { SESSION_TTL_MAX_SEC } from "../session/session-policy";

/** Claim schema version (`ver`) of tokens without a stored session. */
export const AUTH_CLAIMS_VERSION = 1;
/** Claim schema version of tokens bound to a stored session: adds `sid` (ADR-004). */
export const AUTH_CLAIMS_VERSION_WITH_SESSION = 2;
const SUPPORTED_CLAIMS_VERSIONS: readonly number[] = [
	AUTH_CLAIMS_VERSION,
	AUTH_CLAIMS_VERSION_WITH_SESSION,
];

/** Stored-session ids: 22 base64url characters (128 random bits). */
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** Allowed clock skew between issuer and verifier, in seconds. */
export const AUTH_CLAIMS_CLOCK_TOLERANCE_SEC = 5;

export type AuthClaims = {
	iss: string;
	aud: string;
	sub: string;
	iat: number;
	exp: number;
	jti?: string;
	/** Stored session id; present exactly when ver = 2. */
	sid?: string;
	ver: number; // schema version of claims
	uvn: number; // user version (tokenVersion)
	pvn: number; // policy version
	usr: {
		id: string;
		emailVerified: boolean;
		roles?: string[];
		orgId?: string;
		scopes?: string[];
	};
};

export function makeAuthClaims(args: {
	iss: string;
	aud: string;
	sub: string;
	roles?: string[];
	emailVerified: boolean;
	uvn: number;
	pvn: number;
	now: Date;
	ttlSec: number;
	jti?: string;
	/** Binds the token to a stored session (refresh enabled). */
	sid?: string;
}): AuthClaims {
	const iat = Math.floor(args.now.getTime() / 1000);
	return {
		iss: args.iss,
		aud: args.aud,
		sub: args.sub,
		iat,
		exp: iat + args.ttlSec,
		jti: args.jti,
		...(args.sid !== undefined ? { sid: args.sid } : {}),
		ver: args.sid !== undefined ? AUTH_CLAIMS_VERSION_WITH_SESSION : AUTH_CLAIMS_VERSION,
		uvn: args.uvn,
		pvn: args.pvn,
		usr: {
			id: args.sub,
			emailVerified: args.emailVerified,
			roles: args.roles,
		},
	};
}

/** User ids as issued (ULIDs) or common alternatives (UUIDs); nothing else. */
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const counter = z.number().int().nonnegative().safe();
const timestamp = z.number().int().positive().safe();

const AuthClaimsSchema = z
	.object({
		iss: z.string().min(1),
		aud: z.string().min(1),
		sub: z.string().regex(USER_ID_PATTERN),
		iat: timestamp,
		exp: timestamp,
		jti: z.string().min(1).max(128).optional(),
		sid: z.string().regex(SESSION_ID_PATTERN).optional(),
		ver: z.number(),
		uvn: counter,
		pvn: counter,
		usr: z.object({
			id: z.string(),
			emailVerified: z.boolean(),
			roles: z.array(z.string()).optional(),
			orgId: z.string().optional(),
			scopes: z.array(z.string()).optional(),
		}),
	})
	.refine((c) => c.usr.id === c.sub, "usr.id must equal sub")
	.refine(
		(c) => (c.ver === AUTH_CLAIMS_VERSION_WITH_SESSION) === (c.sid !== undefined),
		"sid is required in ver 2 and not allowed in ver 1"
	);

/**
 * Runtime validation of an already signature-checked JWT payload. Throws
 * InvalidSessionTokenError unless every required claim is present with the
 * right type, the schema version is supported (1, or 2 with `sid`), `usr.id`
 * matches `sub`, and
 * the timestamps are sane at `now` (with AUTH_CLAIMS_CLOCK_TOLERANCE_SEC):
 * issued no later than now, unexpired, and living no longer than the
 * longest supported session.
 *
 * `usr.roles` is carried for compatibility only; authorization must read
 * current roles from storage rather than trusting it.
 */
export function parseAuthClaims(payload: unknown, now: Date): AuthClaims {
	if (
		typeof payload === "object" &&
		payload !== null &&
		"ver" in payload &&
		!SUPPORTED_CLAIMS_VERSIONS.includes(payload.ver as number)
	) {
		throw new InvalidSessionTokenError("unsupported_claims_version");
	}
	const result = AuthClaimsSchema.safeParse(payload);
	if (!result.success) throw new InvalidSessionTokenError("invalid_claims");
	const c = result.data;
	if (!SUPPORTED_CLAIMS_VERSIONS.includes(c.ver)) {
		throw new InvalidSessionTokenError("unsupported_claims_version");
	}

	const nowSec = Math.floor(now.getTime() / 1000);
	const tolerance = AUTH_CLAIMS_CLOCK_TOLERANCE_SEC;
	if (c.iat > nowSec + tolerance) {
		throw new InvalidSessionTokenError("issued_in_future");
	}
	if (c.exp <= nowSec - tolerance) throw new InvalidSessionTokenError("expired");
	if (c.exp <= c.iat) throw new InvalidSessionTokenError("invalid_claims");
	if (c.exp - c.iat > SESSION_TTL_MAX_SEC) {
		throw new InvalidSessionTokenError("lifetime_too_long");
	}

	return {
		iss: c.iss,
		aud: c.aud,
		sub: c.sub,
		iat: c.iat,
		exp: c.exp,
		jti: c.jti,
		...(c.sid !== undefined ? { sid: c.sid } : {}),
		ver: c.ver,
		uvn: c.uvn,
		pvn: c.pvn,
		// Non-strict compilation widens zod's output; the schema guarantees these.
		usr: c.usr as AuthClaims["usr"],
	};
}
