import { NextResponse, type NextRequest } from "next/server";
import { thia } from "@/thia";
import { describeAuthError } from "@/auth-errors";
import { safeReturnTo } from "@/return-to";
import {
	clearOAuthCookie,
	cookiesToEvict,
	oauthCookieName,
	oauthCookiePolicy,
	pendingOAuthCookies,
	setOAuthCookie,
} from "@/oauth-cookies";

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ provider: string }> }
) {
	const { provider } = await params;

	const redirectUri = thia.redirectUriFor(provider);
	if (!redirectUri) {
		return NextResponse.json({ error: "unknown_provider" }, { status: 400 });
	}

	try {
		const policy = oauthCookiePolicy(redirectUri);
		const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));
		const { authorizationUrl, transaction, sealedTransaction } =
			await thia.beginLogin(provider, returnTo);

		const response = NextResponse.redirect(authorizationUrl);
		response.headers.set("Cache-Control", "no-store");

		// Keep logins in other tabs working, up to the limit.
		const existing = await Promise.all(
			pendingOAuthCookies(req, policy).map(async ({ name, value }) => ({
				name,
				issuedAt: (await thia.openTransaction(value))?.issuedAt,
			}))
		);
		for (const name of cookiesToEvict(existing)) {
			clearOAuthCookie(response, name, policy);
		}

		setOAuthCookie(
			response,
			await oauthCookieName(transaction.state, policy),
			sealedTransaction,
			policy
		);
		return response;
	} catch (e) {
		console.error("Failed to begin OAuth login:", describeAuthError(e));
		return NextResponse.json({ error: "login_unavailable" }, { status: 500 });
	}
}
