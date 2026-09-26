import { NextResponse, type NextRequest } from "next/server";
import { oauthTransactionMatches } from "@thia/core";
import { thia } from "@/thia";
import { setSessionCookie } from "@/session";
import { describeAuthError } from "@/auth-errors";
import { safeReturnTo } from "@/return-to";
import {
	clearOAuthCookie,
	isWellFormedState,
	oauthCookieName,
	oauthCookiePolicy,
} from "@/oauth-cookies";

const fail = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ provider: string }> }
) {
	const { provider } = await params;
	const query = req.nextUrl.searchParams;
	const code = query.get("code");
	const state = query.get("state");
	const providerError = query.get("error");

	const redirectUri = thia.redirectUriFor(provider);
	// Without a known provider and a state of the shape we issue there is no
	// transaction to look up, and nothing is cleared.
	if (!redirectUri || !isWellFormedState(state)) {
		return fail("invalid_callback");
	}

	const policy = oauthCookiePolicy(redirectUri);
	const cookieName = await oauthCookieName(state, policy);
	const sealed = req.cookies.get(cookieName)?.value;
	const transaction = sealed ? await thia.openTransaction(sealed) : undefined;
	const matches = oauthTransactionMatches(
		transaction,
		{ provider, state },
		new Date()
	);

	/**
	 * Clears this attempt's cookie only when it is safe to: the transaction
	 * matched this callback (a terminal outcome for it), or the cookie is
	 * unreadable or expired anyway. A readable transaction for another
	 * provider is left alone - it may be a live login in another tab.
	 */
	const finish = (response: NextResponse) => {
		if (sealed !== undefined && (matches || !transaction)) {
			clearOAuthCookie(response, cookieName, policy);
		}
		response.headers.set("Cache-Control", "no-store");
		return response;
	};

	// The user cancelled or the provider refused (e.g. error=access_denied).
	if (providerError !== null) {
		return finish(
			NextResponse.redirect(new URL("/thia/login?error=cancelled", req.url))
		);
	}

	if (!matches) return finish(fail("invalid_transaction"));
	if (!code) return finish(fail("invalid_callback"));

	try {
		const { keycards } = await thia.completeLogin(
			provider,
			code,
			state,
			transaction
		);
		const destination = safeReturnTo(transaction.returnTo) ?? "/";
		const response = NextResponse.redirect(new URL(destination, req.url));
		setSessionCookie(response, keycards[0]);
		return finish(response);
	} catch (e) {
		if (e instanceof Error && e.message === "ACCOUNT_LINK_CONFLICT") {
			// Not a failure to log: the email belongs to an existing account
			// that we won't link automatically. Send them back to choose the
			// provider they originally signed up with.
			return finish(
				NextResponse.redirect(
					new URL("/thia/login?error=account_exists", req.url)
				)
			);
		}
		console.error("OAuth callback failed:", describeAuthError(e));
		return finish(fail("authentication_failed"));
	}
}
