import { unauthorized } from "next/navigation";
import { getCurrentSession, loadProfile } from "@/current-session";
import { thia } from "@/thia";

const PROVIDER_NAMES: Record<string, string> = { github: "GitHub", google: "Google" };

const MESSAGES: Record<string, string> = {
	required: "Confirm your account below, then submit the change again.",
	done: "Confirmed. Submit the change again to save it - nothing was changed yet.",
	cancelled: "The confirmation was cancelled. Your name is unchanged.",
	account_mismatch:
		"That wasn't the account you signed in with, so it wasn't accepted. Your name is unchanged.",
	unavailable: "We couldn't complete the confirmation right now. Your name is unchanged.",
	failed: "The confirmation didn't complete. Your name is unchanged.",
};

/**
 * The demo's sensitive action (ADR-005): changing the display name needs a
 * recent confirmation with a linked provider on top of the normal session.
 * That's a demo policy choice, not a claim that names are always sensitive.
 */
export default async function ProfilePage({
	searchParams,
}: {
	searchParams?: Promise<{ reauth?: string; saved?: string }>;
} = {}) {
	const { reauth, saved } = (await searchParams) ?? {};
	const session = await getCurrentSession();
	if (!session) unauthorized();
	const profile = await loadProfile(session);
	const linked =
		session.mode === "jwt-user-validated"
			? [...new Set(session.user.accounts.map((a) => a.provider as string))]
			: [];
	const message = reauth ? MESSAGES[reauth] : undefined;

	return (
		<main style={{ padding: 32, maxWidth: 640 }}>
			<h1>Your profile</h1>
			<p>
				Display name: <strong>{profile?.name || "(none)"}</strong>
			</p>
			{saved === "1" && <p>Your name was updated.</p>}
			{message && <p role="status">{message}</p>}

			<form action="/api/thia/profile/name" method="post">
				<label>
					New display name <input name="name" maxLength={100} required />
				</label>{" "}
				<button type="submit">Change name</button>
			</form>

			{thia.reauthEnabled ? (
				<>
					<p style={{ fontSize: 14 }}>
						Changing your name asks you to confirm your account again first. We&apos;ll
						send you to the provider you signed in with. It may show an account
						chooser or return you straight away - that&apos;s up to the provider.
						Confirmation lasts up to 10 minutes, after which you&apos;ll be asked again.
					</p>
					{linked.map((provider) => (
						<form key={provider} action={`/api/thia/reauth/${provider}`} method="post">
							<input type="hidden" name="returnTo" value="/thia/profile" />
							<button type="submit">
								Confirm with {PROVIDER_NAMES[provider] ?? provider}
							</button>
						</form>
					))}
				</>
			) : (
				<p style={{ fontSize: 14 }}>
					Re-authentication is turned off in this app (THIA_REAUTH=off), so the name
					change is unavailable.
				</p>
			)}
			<p>
				<a href="/">Back</a>
			</p>
		</main>
	);
}
