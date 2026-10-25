import { NextResponse, type NextRequest } from "next/server";
import { thia } from "@/thia";
import { describeAuthError } from "@/auth-errors";
import { safeReturnTo } from "@/return-to";
import { requireSession, stopResponse } from "@/require-auth";
import {
	clearOAuthCookie,
	cookiesToEvict,
	oauthCookieName,
	oauthCookiePolicy,
	pendingOAuthCookies,
	setOAuthCookie,
} from "@/oauth-cookies";

const refuse = (error: string, status: number) =>
	NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Starts a re-authentication (ADR-005): a separate provider visit for the
 * signed-in session. State-changing and same-origin only (POST). The user and
 * session come from the validated cookie and the callback URI from
 * configuration - nothing in the request names either. Only a provider
 * already linked to this user is offered.
 */
export async function POST(
	req: NextRequest,
	{ params }: { params: Promise<{ provider: string }> }
) {
	const { provider } = await params;

	let session;
	try {
		session = await requireSession(req);
	} catch (e) {
		const stop = stopResponse(e);
		if (stop) return stop;
		throw e;
	}
	if (!thia.reauthEnabled) return refuse("reauthentication_disabled", 404);

	const redirectUri = thia.redirectUriFor(provider);
	if (!redirectUri) return refuse("unknown_provider", 400);
	if (
		session.mode !== "jwt-user-validated" ||
		!session.user.accounts.some((a) => a.provider === provider)
	) {
		return refuse("provider_not_linked", 409);
	}

	let returnTo: string | undefined;
	try {
		const field = (await req.formData()).get("returnTo");
		returnTo = typeof field === "string" ? safeReturnTo(field) : undefined;
	} catch {
		returnTo = undefined;
	}

	try {
		const policy = oauthCookiePolicy(redirectUri);
		const { authorizationUrl, transaction, sealedTransaction } = await thia.beginReauth(
			provider,
			session,
			returnTo
		);
		// 303: the provider is reached with a GET, not a repeated POST.
		const response = NextResponse.redirect(authorizationUrl, 303);
		response.headers.set("Cache-Control", "no-store");

		const existing = await Promise.all(
			pendingOAuthCookies(req, policy).map(async ({ name, value }) => ({
				name,
				issuedAt: (await thia.openTransaction(value))?.issuedAt,
			}))
		);
		for (const name of cookiesToEvict(existing)) clearOAuthCookie(response, name, policy);
		setOAuthCookie(response, await oauthCookieName(transaction.state, policy), sealedTransaction, policy);
		return response;
	} catch (e) {
		console.error("Failed to begin re-authentication:", describeAuthError(e));
		return refuse("reauthentication_unavailable", 500);
	}
}
