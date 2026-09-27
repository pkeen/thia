import { cache } from "react";
import type { AuthenticatedSession, SessionValidation } from "@thia/core";
import { thia } from "@/thia";
import { getSessionToken } from "@/session";
import { describeAuthError } from "@/auth-errors";

/**
 * Whether someone is signed in could not be determined - typically the
 * database is unreachable. Never treated as signed out (no 401) and never
 * as signed in: pages render the error boundary (500), API routes answer 503.
 */
export class AuthUnavailableError extends Error {
	constructor() {
		super("AUTH_UNAVAILABLE");
		this.name = "AuthUnavailableError";
	}
}

/**
 * This request's session validation, via the core validator. Memoized per
 * server render, so a page and the subject loader it calls share one token
 * check and (in user-validated mode) one user query.
 */
export const validateCurrentSession = cache(
	async (): Promise<SessionValidation> =>
		thia.validateSession(await getSessionToken())
);

/**
 * The authenticated session, or null when signed out (no, invalid, expired
 * or revoked token, or a deleted user in user-validated mode). Throws
 * AuthUnavailableError when validity can't be determined.
 */
export async function getCurrentSession(): Promise<AuthenticatedSession | null> {
	const result = await validateCurrentSession();
	if (result.status === "authenticated") return result.session;
	if (result.status === "unauthenticated") return null;
	console.error(
		`Session validation unavailable (${result.reason}):`,
		describeAuthError(result.cause)
	);
	throw new AuthUnavailableError();
}

export type Profile = { id: string; email: string; name?: string; image?: string };

/**
 * Display details for the session's user. User-validated sessions already
 * carry the freshly loaded user; stateless sessions fetch it - so the demo
 * still reads the database in stateless mode, for display, not for
 * authentication. Null if a stateless session's user no longer exists.
 */
export async function loadProfile(session: AuthenticatedSession): Promise<Profile | null> {
	let user;
	if (session.mode === "jwt-user-validated") {
		user = session.user;
	} else {
		try {
			user = await thia.uow.users.getById(session.identity.userId);
		} catch (e) {
			console.error("Profile lookup failed:", describeAuthError(e));
			throw new AuthUnavailableError();
		}
	}
	if (!user) return null;
	return {
		id: user.id,
		email: user.email.value,
		name: user.name.value,
		image: user.image.value,
	};
}
