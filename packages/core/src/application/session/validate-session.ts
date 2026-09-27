// application/session/validate-session.ts
import type { User } from "../../domain/entities/user";
import { asUserId, type UserId } from "../../domain/primitives";
import { parseAuthClaims } from "../claims/auth-claims";
import type { Clock } from "../ports/clock.port";
import type { TokenVerifier } from "../ports/token-signer.port";
import type { UserRepository } from "../ports/user-repo.port";
import { InvalidSessionTokenError } from "./errors";
import { defineSessionPolicy, type SessionPolicy } from "./session-policy";

/**
 * Who a verified token says the caller is. Derived from signed claims only:
 * in stateless mode nothing here has been checked against storage.
 */
export type SessionIdentity = Readonly<{
	userId: UserId;
	/** The token's `uvn`. */
	tokenVersion: number;
	/** Whether the user's email was verified when the token was issued. */
	emailVerified: boolean;
	issuedAt: Date;
	expiresAt: Date;
}>;

export type AuthenticatedSession =
	| Readonly<{ mode: "jwt-stateless"; identity: SessionIdentity }>
	| Readonly<{
			mode: "jwt-user-validated";
			identity: SessionIdentity;
			/** The current user record, loaded once during validation - reuse it. */
			user: User;
	  }>;

export type SessionValidation =
	| { status: "authenticated"; session: AuthenticatedSession }
	| {
			status: "unauthenticated";
			reason: "missing_token" | "invalid_token" | "user_not_found" | "token_revoked";
	  }
	| {
			/**
			 * Validity could not be determined (e.g. the database is down). Never
			 * treated as signed in, and never retried in stateless mode. `cause` is
			 * for server logs only.
			 */
			status: "unavailable";
			reason: "token_verification_failed" | "user_lookup_failed";
			cause: unknown;
	  };

export type SessionValidatorDeps = {
	policy: SessionPolicy;
	verifier: TokenVerifier;
	clock: Clock;
	/** Required in jwt-user-validated mode; never called in jwt-stateless mode. */
	users?: Pick<UserRepository, "getById">;
};

export type SessionValidator = {
	readonly mode: SessionPolicy["mode"];
	validate(token: string | null | undefined): Promise<SessionValidation>;
};

/**
 * The single, framework-independent session check. Both modes verify the
 * token (algorithm, signature, issuer, audience, expiry) and validate its
 * claims at runtime; jwt-user-validated additionally loads the user and
 * requires the token's `uvn` to equal the stored token version.
 *
 * Authentication only: callers still look up roles (or anything else that
 * must be current) separately.
 */
export function createSessionValidator(deps: SessionValidatorDeps): SessionValidator {
	// Re-validated so a hand-built policy object can't bypass the checks.
	const policy = defineSessionPolicy(deps.policy);
	const { verifier, clock } = deps;
	const users = deps.users;
	if (policy.mode === "jwt-user-validated" && !users) {
		throw new Error("jwt-user-validated sessions require a user repository");
	}

	async function validate(token: string | null | undefined): Promise<SessionValidation> {
		if (typeof token !== "string" || token.length === 0) {
			return { status: "unauthenticated", reason: "missing_token" };
		}

		let identity: SessionIdentity;
		try {
			// Claims are re-parsed here whatever the verifier did, so a lax
			// verifier implementation can't hand through unchecked payloads.
			const claims = parseAuthClaims(await verifier.verify(token), clock.now());
			identity = Object.freeze({
				userId: asUserId(claims.sub),
				tokenVersion: claims.uvn,
				emailVerified: claims.usr.emailVerified,
				issuedAt: new Date(claims.iat * 1000),
				expiresAt: new Date(claims.exp * 1000),
			});
		} catch (e) {
			if (e instanceof InvalidSessionTokenError) {
				return { status: "unauthenticated", reason: "invalid_token" };
			}
			return { status: "unavailable", reason: "token_verification_failed", cause: e };
		}

		if (policy.mode === "jwt-stateless") {
			return {
				status: "authenticated",
				session: Object.freeze({ mode: policy.mode, identity }),
			};
		}

		let user: User | null;
		try {
			user = await users!.getById(identity.userId);
		} catch (e) {
			// Fail closed: an outage is neither "signed out" nor a reason to fall
			// back to trusting the token alone.
			return { status: "unavailable", reason: "user_lookup_failed", cause: e };
		}
		if (!user || user.id !== identity.userId) {
			return { status: "unauthenticated", reason: "user_not_found" };
		}
		if (user.tokenVersion() !== identity.tokenVersion) {
			return { status: "unauthenticated", reason: "token_revoked" };
		}
		return {
			status: "authenticated",
			session: Object.freeze({ mode: policy.mode, identity, user }),
		};
	}

	return { mode: policy.mode, validate };
}
