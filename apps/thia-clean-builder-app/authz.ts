import { createAuthorizer, createRbac } from "@thia/authz";
import type { AuthenticatedSession } from "@thia/core";
import { thia } from "@/thia";
import {
	AuthUnavailableError,
	getCurrentSession,
} from "@/current-session";
import { describeAuthError } from "@/auth-errors";

/** Who is acting and their current roles - no profile data. */
export type Subject = {
	id: string;
	roles: string[];
};

export const rbac = createRbac<Subject>({
	viewer: ["profile.read"],
	editor: { inherits: ["viewer"], permissions: ["post.write"] },
	admin: { inherits: ["editor"], permissions: ["admin.*"] },
});

export const authorizer = createAuthorizer({
	"admin.view": rbac.can("admin.view"),
});

/**
 * Everyone signed in is at least a viewer; anything more is granted in the
 * database (see the assign-role script). Role definitions stay in code above.
 */
const DEFAULT_ROLES = ["viewer"];

/**
 * The signed-in user as an authorization subject, or null if signed out.
 * Throws AuthUnavailableError if the session or roles can't be read.
 */
export async function getSubject(): Promise<Subject | null> {
	const session = await getCurrentSession();
	return session ? subjectFor(session) : null;
}

/**
 * Roles are always read from the database, in both session modes, so a
 * grant or revocation applies on the next check; roles in the token are
 * never trusted. A failed lookup is an error, not "no roles" - it must not
 * fall through to the default role.
 */
export async function subjectFor(session: AuthenticatedSession): Promise<Subject> {
	let assigned: string[];
	try {
		assigned = await thia.roleStore.getRoles(session.identity.userId);
	} catch (e) {
		console.error("Role lookup failed:", describeAuthError(e));
		throw new AuthUnavailableError();
	}
	return {
		id: session.identity.userId,
		roles: assigned.length > 0 ? assigned : DEFAULT_ROLES,
	};
}
