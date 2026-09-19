import { ForbiddenError } from "@thia/authz";
import { authorizer, getSubject } from "@/authz";

export default async function AdminPage() {
	const subject = await getSubject();

	if (!subject) {
		return (
			<main style={{ padding: 32 }}>
				<p>
					You need to <a href="/thia/login">sign in</a> first.
				</p>
			</main>
		);
	}

	try {
		await authorizer.assert(subject, "admin.view");
	} catch (e) {
		if (!(e instanceof ForbiddenError)) throw e;
		return (
			<main style={{ padding: 32 }}>
				<h1>403 — Forbidden</h1>
				<p>
					{subject.email} ({subject.roles.join(", ")}) may not{" "}
					<code>{e.action}</code>.
				</p>
				<a href="/">Back</a>
			</main>
		);
	}

	return (
		<main style={{ padding: 32 }}>
			<h1>Admin</h1>
			<p>Only subjects with the admin.view permission see this.</p>
			<a href="/">Back</a>
		</main>
	);
}
