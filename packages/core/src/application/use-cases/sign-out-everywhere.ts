// application/use-cases/sign-out-everywhere.ts
import type { Clock } from "../ports/clock.port";
import type { UserRepository } from "../ports/user-repo.port";
import type { SessionRepository } from "../session/session-repository.port";
import type { SessionPolicy } from "../session/session-policy";
import type { AuthenticatedSession } from "../session/validate-session";

export type SignOutEverywhereResult =
	| {
			status: "revoked";
			tokenVersion: number;
			/**
			 * Present when refresh is enabled: how many stored sessions were
			 * revoked, and whether existing access tokens stop working on their
			 * next request (user-validated) or only when they next need a
			 * refresh (stateless, within one access TTL).
			 */
			sessions?: { revoked: number; immediate: boolean };
	  }
	/** The configured mode can't enforce revocation; nothing was changed. */
	| { status: "unsupported"; mode: SessionPolicy["mode"] }
	/** The user was deleted between validation and revocation. */
	| { status: "user_not_found" };

/**
 * Invalidates all of the session owner's existing tokens by atomically
 * incrementing their stored token version. The target is always the user of
 * the already validated `session` - there is deliberately no way to name
 * another user.
 *
 * Concurrency boundary: requests that were already authenticated may finish;
 * any old-version token validated after the increment commits is rejected.
 * Logging in again afterwards issues a token with the new version.
 *
 * With refresh enabled every stored session is revoked too - in stateless
 * mode as well, where existing access tokens then stay valid until they
 * expire (reported via `sessions.immediate`). Without refresh, stateless mode
 * can't enforce it and reports `unsupported`.
 *
 * This ends Thia sessions only. It does not sign the user out of their
 * OAuth provider (GitHub, Google, ...). Infrastructure errors propagate.
 */
export async function signOutEverywhere(
	deps: {
		policy: SessionPolicy;
		users: Pick<UserRepository, "incrementTokenVersion">;
		/** Required when the policy enables refresh. */
		sessions?: Pick<SessionRepository, "revokeAllForUser">;
		clock?: Clock;
	},
	session: AuthenticatedSession
): Promise<SignOutEverywhereResult> {
	const { policy } = deps;
	if (policy.mode !== "jwt-user-validated" && !policy.refresh) {
		return { status: "unsupported", mode: policy.mode };
	}
	if (session.mode !== policy.mode) {
		throw new Error("Session was not validated under the configured policy");
	}
	if (policy.refresh && (!deps.sessions || !deps.clock)) {
		throw new Error("Refresh-enabled sign out everywhere requires a session repository and clock");
	}
	// Version first: even if revoking the sessions then fails, their refreshes
	// are refused because each session records the version it was issued at.
	const tokenVersion = await deps.users.incrementTokenVersion(session.identity.userId);
	if (tokenVersion === null) return { status: "user_not_found" };
	if (!policy.refresh) return { status: "revoked", tokenVersion };

	const revoked = await deps.sessions!.revokeAllForUser(
		session.identity.userId,
		"sign_out_everywhere",
		deps.clock!.now()
	);
	return {
		status: "revoked",
		tokenVersion,
		sessions: { revoked, immediate: policy.mode === "jwt-user-validated" },
	};
}
