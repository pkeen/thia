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

// MVP role source: roles are assigned in config rather than stored with the
// user. Everyone signed in is a viewer; ADMIN_EMAILS (comma-separated) are
// admins. Persisting role assignments is the next step.
const adminEmails = new Set(
	(process.env.ADMIN_EMAILS ?? "")
		.split(",")
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean)
);

function rolesFor(email: string): string[] {
	return adminEmails.has(email.toLowerCase()) ? ["admin"] : ["viewer"];
}

/** The signed-in user as an authorization subject, or null if signed out. */
export async function getSubject(): Promise<Subject | null> {
	const token = await getSessionToken();
	if (!token) return null;

	try {
		const claims = await thia.verifySession(token);
		const user = await thia.uow.users.getById(asUserId(claims.sub));
		if (!user) return null;

		const email = user.email.value;
		return { id: user.id, email, roles: rolesFor(email) };
	} catch {
		// invalid/expired session token — treat as signed out
		return null;
	}
}
