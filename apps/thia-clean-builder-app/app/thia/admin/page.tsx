import { forbidden, unauthorized } from "next/navigation";
import { ForbiddenError } from "@thia/authz";
import { authorizer, getSubject } from "@/authz";

export default async function AdminPage() {
	const subject = await getSubject();

	// These render app/unauthorized.tsx and app/forbidden.tsx with real 401/403
	// statuses, rather than a page that merely says 403 while returning 200.
	if (!subject) unauthorized();

	try {
		await authorizer.assert(subject, "admin.view");
	} catch (e) {
		if (!(e instanceof ForbiddenError)) throw e;
		// The denied action is logged rather than shown: the visitor can't act on
		// it, and it hints at what exists.
		console.warn(`Denied ${e.action} for ${subject.email}`);
		forbidden();
	}

	return (
		<main style={{ padding: 32 }}>
			<h1>Admin</h1>
			<p>Only subjects with the admin.view permission see this.</p>
			<a href="/">Back</a>
		</main>
	);
}
