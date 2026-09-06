import { asUserId } from "@thia/core";
import { thia } from "@/thia";
import { getSessionToken } from "@/session";

export default async function Home() {
	const token = await getSessionToken();
	let user = null;

	if (token) {
		try {
			const claims = await thia.verifySession(token);
			user = await thia.uow.users.getById(asUserId(claims.sub));
		} catch {
			// invalid/expired session token — treat as signed out
		}
	}

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
			{user ? (
				<>
					<p>Signed in as {user.email.value}</p>
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
