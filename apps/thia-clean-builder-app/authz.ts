import { createAuthorizer, createRbac } from "@thia/authz";
import { asUserId } from "@thia/core";
import { thia } from "@/thia";
import { getSessionToken } from "@/session";

export type Subject = {
	id: string;
	email: string;
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

/** The signed-in user as an authorization subject, or null if signed out. */
export async function getSubject(): Promise<Subject | null> {
	const token = await getSessionToken();
	if (!token) return null;

	try {
		const claims = await thia.verifySession(token);
		const user = await thia.uow.users.getById(asUserId(claims.sub));
		if (!user) return null;

		const assigned = await thia.roleStore.getRoles(user.id);
		return {
			id: user.id,
			email: user.email.value,
			roles: assigned.length > 0 ? assigned : DEFAULT_ROLES,
		};
	} catch {
		// invalid/expired session token — treat as signed out
		return null;
	}
}
