// application/reauth/recent-authentication.ts
import type { Clock } from "../ports/clock.port";
import type { ReauthProofCodec } from "../ports/reauth-proof-port";
import { effectiveAbsoluteExpiry, isSessionActive } from "../session/refresh-sessions";
import type { SessionRepository } from "../session/session-repository.port";
import type { SessionPolicy } from "../session/session-policy";
import type { AuthenticatedSession } from "../session/validate-session";

/** The longest a proof may live (ADR-005): 10 minutes from the provider confirmation. */
export const REAUTH_MAX_AGE_SEC = 10 * 60;

/** The guard was enabled under a session policy it does not support. */
export class ReauthConfigurationError extends Error {
	constructor(message: string) {
		super(`INVALID_REAUTH_CONFIGURATION: ${message}`);
		this.name = "ReauthConfigurationError";
	}
}

export type RecentAuthenticationCheck =
	| { status: "valid"; expiresAt: Date }
	/** No proof was presented (or it was not a proof Thia issued): re-authenticate. */
	| { status: "missing" }
	/** A genuine proof whose 10 minutes (or whose session) ran out: re-authenticate. */
	| { status: "expired" }
	/** A genuine proof for another user, session or token version: re-authenticate. */
	| { status: "session_changed" }
	/**
	 * Could not decide - storage failed, or the configuration or session can't
	 * carry a proof. The action must not run. `cause` is for server logs only.
	 */
	| {
			status: "unavailable";
			reason: "session_lookup_failed" | "unsupported_configuration" | "session_not_bound";
			cause?: unknown;
	  };

export type IssuedReauthProof = { value: string; expiresAt: Date };

export type ReauthProofIssue =
	| { status: "issued"; proof: IssuedReauthProof }
	| { status: "session_ended" }
	| { status: "unavailable"; reason: "session_lookup_failed" | "session_not_bound"; cause?: unknown };

export type RecentAuthentication = {
	readonly maxAgeSec: number;
	/**
	 * Issues a proof for an already validated session, measured from now.
	 * Only the re-authentication callback should call this.
	 */
	issueProof(session: AuthenticatedSession): Promise<ReauthProofIssue>;
	/** The sensitive-action check. Never throws; failures are `unavailable`. */
	check(
		session: AuthenticatedSession,
		proof: string | null | undefined
	): Promise<RecentAuthenticationCheck>;
};

export type RecentAuthenticationDeps = {
	policy: SessionPolicy;
	sessions: Pick<SessionRepository, "getById"> | undefined;
	proofs: ReauthProofCodec;
	clock: Clock;
	/** Defaults to, and may not exceed, REAUTH_MAX_AGE_SEC. */
	maxAgeSec?: number;
};

/**
 * The recent-authentication guard (ADR-005). Throws ReauthConfigurationError
 * at setup unless the policy is jwt-user-validated with refresh, so an
 * unsupported app fails to start instead of getting a guard that does
 * nothing. A guard is never created implicitly: apps that don't call this
 * keep whatever session policy they have.
 *
 * The proof travels in its own cookie, not in the stored session, so an older
 * copy of the access token (same `sid`) doesn't gain freshness when the real
 * browser re-authenticates: it lacks the proof.
 */
export function createRecentAuthentication(deps: RecentAuthenticationDeps): RecentAuthentication {
	const { policy, proofs, clock } = deps;
	const refresh = policy?.refresh;
	if (policy?.mode !== "jwt-user-validated" || !refresh) {
		throw new ReauthConfigurationError(
			"recent authentication requires the jwt-user-validated session mode with refresh enabled"
		);
	}
	const sessions = deps.sessions;
	if (!sessions) {
		throw new ReauthConfigurationError("a session repository is required");
	}
	const maxAgeSec = deps.maxAgeSec ?? REAUTH_MAX_AGE_SEC;
	if (!Number.isInteger(maxAgeSec) || maxAgeSec < 1 || maxAgeSec > REAUTH_MAX_AGE_SEC) {
		throw new ReauthConfigurationError(
			`maxAgeSec must be an integer from 1 to ${REAUTH_MAX_AGE_SEC}`
		);
	}

	/** The session's `sid`, when it is the kind a proof can be bound to. */
	const boundSessionId = (session: AuthenticatedSession) =>
		session.mode === "jwt-user-validated" ? session.identity.sessionId : undefined;

	async function issueProof(session: AuthenticatedSession): Promise<ReauthProofIssue> {
		const sessionId = boundSessionId(session);
		if (sessionId === undefined) return { status: "unavailable", reason: "session_not_bound" };
		let stored;
		try {
			stored = await sessions!.getById(sessionId);
		} catch (cause) {
			return { status: "unavailable", reason: "session_lookup_failed", cause };
		}
		const now = clock.now();
		if (
			!stored ||
			stored.userId !== session.identity.userId ||
			!isSessionActive(stored, refresh!, now)
		) {
			return { status: "session_ended" };
		}
		const issuedAt = Math.floor(now.getTime() / 1000);
		// Never outlive the stored session's absolute lifetime.
		const expiresAt = Math.min(
			issuedAt + maxAgeSec,
			Math.floor(effectiveAbsoluteExpiry(stored, refresh!).getTime() / 1000),
			Math.floor(stored.idleExpiresAt.getTime() / 1000)
		);
		if (expiresAt <= issuedAt) return { status: "session_ended" };
		const value = await proofs.seal({
			userId: session.identity.userId,
			sessionId,
			tokenVersion: session.identity.tokenVersion,
			issuedAt,
			expiresAt,
		});
		return { status: "issued", proof: { value, expiresAt: new Date(expiresAt * 1000) } };
	}

	async function check(
		session: AuthenticatedSession,
		proof: string | null | undefined
	): Promise<RecentAuthenticationCheck> {
		// Fail closed whatever the caller passed in.
		if (session?.mode !== "jwt-user-validated") {
			return { status: "unavailable", reason: "unsupported_configuration" };
		}
		const sessionId = boundSessionId(session);
		if (sessionId === undefined) return { status: "unavailable", reason: "session_not_bound" };
		if (typeof proof !== "string" || proof.length === 0) return { status: "missing" };

		const now = clock.now();
		const opened = await proofs.open(proof, now);
		if (opened.status === "invalid") return { status: "missing" };
		if (opened.status === "expired") return { status: "expired" };
		const claims = opened.claims;
		if (
			claims.userId !== session.identity.userId ||
			claims.sessionId !== sessionId ||
			claims.tokenVersion !== session.identity.tokenVersion
		) {
			return { status: "session_changed" };
		}
		// Belt and braces: `open` already rejected an expired proof.
		if (Math.floor(now.getTime() / 1000) >= claims.expiresAt) return { status: "expired" };

		let stored;
		try {
			stored = await sessions!.getById(sessionId);
		} catch (cause) {
			return { status: "unavailable", reason: "session_lookup_failed", cause };
		}
		if (
			!stored ||
			stored.userId !== claims.userId ||
			!isSessionActive(stored, refresh!, now)
		) {
			return { status: "session_changed" };
		}
		return { status: "valid", expiresAt: new Date(claims.expiresAt * 1000) };
	}

	return { maxAgeSec, issueProof, check };
}
