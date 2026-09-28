import { unauthorized } from "next/navigation";
import { getCurrentSession } from "@/current-session";
import { thia } from "@/thia";

const formatDate = (d: Date) =>
	d.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

/** The signed-in user's active sessions, each with its own sign-out. */
export default async function DevicesPage({
	searchParams,
}: {
	searchParams?: Promise<{ signed_out?: string }>;
} = {}) {
	const { signed_out } = (await searchParams) ?? {};
	const { refresh, mode } = thia.sessionPolicy;
	if (!refresh) {
		return (
			<main style={{ padding: 32 }}>
				<h1>Your devices</h1>
				<p>This app doesn&apos;t keep per-device sessions (refresh is turned off).</p>
				<a href="/">Back</a>
			</main>
		);
	}

	const session = await getCurrentSession();
	if (!session) unauthorized();
	const devices = await thia.listSessions(session);
	const minutes = Math.round(thia.sessionPolicy.ttlSec / 60);

	return (
		<main style={{ padding: 32, maxWidth: 640 }}>
			<h1>Your devices</h1>
			{signed_out === "1" && <p>That device has been signed out.</p>}
			<p style={{ fontSize: 14 }}>
				Signing a device out ends its session in this app
				{mode === "jwt-user-validated"
					? " on its next request"
					: ` within ${minutes} min, when its access token next needs renewing`}
				. It does not sign that device out of GitHub or Google.
			</p>
			<ul style={{ listStyle: "none", padding: 0 }}>
				{devices.map((d) => (
					<li key={d.id} style={{ borderTop: "1px solid #ddd", padding: "12px 0" }}>
						<strong>{d.deviceLabel ?? "Unknown device"}</strong>
						{d.current && " (this device)"}
						<br />
						<small>
							Signed in {formatDate(d.createdAt)} · last active {formatDate(d.lastUsedAt)}
						</small>
						<form action="/api/thia/sessions/revoke" method="post">
							<input type="hidden" name="session" value={d.id} />
							<button type="submit">
								{d.current ? "Sign out this device" : "Sign out"}
							</button>
						</form>
					</li>
				))}
			</ul>
			<a href="/">Back</a>
		</main>
	);
}
