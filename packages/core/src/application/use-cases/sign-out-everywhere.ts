// application/use-cases/sign-out-everywhere.ts
import type { UserRepository } from "../ports/user-repo.port";
import type { SessionPolicy } from "../session/session-policy";
import type { AuthenticatedSession } from "../session/validate-session";

export type SignOutEverywhereResult =
	/** Every token issued before now fails its next validation. */
	| { status: "revoked"; tokenVersion: number }
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
 * This ends Thia sessions only. It does not sign the user out of their
 * OAuth provider (GitHub, Google, ...). Infrastructure errors propagate.
 */
export async function signOutEverywhere(
	deps: {
		policy: SessionPolicy;
		users: Pick<UserRepository, "incrementTokenVersion">;
	},
	session: AuthenticatedSession
): Promise<SignOutEverywhereResult> {
	if (deps.policy.mode !== "jwt-user-validated") {
		return { status: "unsupported", mode: deps.policy.mode };
	}
	if (session.mode !== deps.policy.mode) {
		throw new Error("Session was not validated under the configured policy");
	}
	const tokenVersion = await deps.users.incrementTokenVersion(session.identity.userId);
	if (tokenVersion === null) return { status: "user_not_found" };
	return { status: "revoked", tokenVersion };
}
