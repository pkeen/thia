import { authorizer, getSubject } from "@/authz";

export default async function Home() {
	const subject = await getSubject();
	const canViewAdmin = subject
		? await authorizer.can(subject, "admin.view")
		: false;

	return (
		<div
			style={{
				height: "100vh",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 16,
			}}
		>
			{subject ? (
				<>
					<p>Signed in as {subject.email}</p>
					<p>Roles: {subject.roles.join(", ")}</p>
					{canViewAdmin && <a href="/thia/admin">Admin</a>}
					<form action="/api/thia/logout" method="post">
						<button type="submit">Sign out</button>
					</form>
				</>
			) : (
				<a href="/thia/login">Sign in</a>
			)}
		</div>
	);
}
