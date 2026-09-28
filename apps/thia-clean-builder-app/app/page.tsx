import { authorizer, subjectFor } from "@/authz";
import { getCurrentSession, loadProfile } from "@/current-session";
import { thia } from "@/thia";

const note = { maxWidth: 420, margin: 0, textAlign: "center", fontSize: 14 } as const;

export default async function Home({
	searchParams,
}: {
	searchParams?: Promise<{ signed_out?: string }>;
} = {}) {
	const { signed_out } = (await searchParams) ?? {};
	// Infrastructure failures throw here and render the error page, rather
	// than showing a signed-out page that isn't true.
	const session = await getCurrentSession();
	const subject = session ? await subjectFor(session) : null;
	const profile = session ? await loadProfile(session) : null;
	const canViewAdmin = subject
		? await authorizer.can(subject, "admin.view")
		: false;
	const { mode, ttlSec, refresh } = thia.sessionPolicy;
	const userValidated = mode === "jwt-user-validated";
	const minutes = Math.round(ttlSec / 60);
	// Global sign-out needs either the per-request user check or stored sessions.
	const canSignOutEverywhere = userValidated || refresh !== undefined;

	return (
		<div
			style={{
				minHeight: "100vh",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 16,
				padding: 16,
			}}
		>
			{subject ? (
				<>
					<p>
						Signed in as{" "}
						{profile ? profile.email : `user ${subject.id} (no profile found)`}
					</p>
					<p>Roles: {subject.roles.join(", ")}</p>
					<p style={note}>
						Session policy: {userValidated ? "user-validated JWT" : "stateless JWT"},{" "}
						{minutes} min
						{refresh &&
							`, renewed for up to ${Math.round(refresh.idleTtlSec / 86400)} days idle / ${Math.round(refresh.absoluteTtlSec / 86400)} days total`}
					</p>
					{canViewAdmin && <a href="/thia/admin">Admin</a>}
					{refresh && <a href="/thia/devices">Your devices</a>}

					<form action="/api/thia/logout" method="post">
						<button type="submit">Sign out of this browser</button>
					</form>
					<p style={note}>
						{refresh
							? "Ends this browser's session. Other devices stay signed in."
							: "Removes the session cookie from this browser only. Other devices stay signed in"}
						{refresh
							? userValidated
								? ""
								: ` A copied access token stays valid for up to ${minutes} min.`
							: userValidated
								? "."
								: ", and a copied session token stays valid until it expires."}
					</p>

					{canSignOutEverywhere ? (
						<>
							<form action="/api/thia/sign-out-everywhere" method="post">
								<button type="submit">Sign out everywhere</button>
							</form>
							<p style={note}>
								Ends every Thia session for your account, on all devices and
								browsers, including this one
								{userValidated
									? "."
									: ` (other devices within ${minutes} min, when their access token next needs renewing).`}{" "}
								It does not sign you out of GitHub or Google.
							</p>
						</>
					) : (
						<p style={note}>
							Sign out everywhere is unavailable: this app uses stateless
							sessions, which can&apos;t be revoked before they expire.
						</p>
					)}
				</>
			) : (
				<>
					{signed_out === "everywhere" && (
						<p style={note}>
							You&apos;ve been signed out of this app on all devices
							{!userValidated && refresh ? ` (others within ${minutes} min)` : ""}.
							Your GitHub or Google account itself is still signed in with that
							provider.
						</p>
					)}
					<a href="/thia/login">Sign in</a>
				</>
			)}
		</div>
	);
}
