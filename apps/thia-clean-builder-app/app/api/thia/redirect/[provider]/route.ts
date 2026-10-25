import { NextResponse, type NextRequest } from "next/server";
import type { OAuthTransaction } from "@thia/core";
import { intentOf, oauthTransactionMatches } from "@thia/core";
import { thia } from "@/thia";
import {
	clearReauthCookie,
	getSessionToken,
	setReauthCookie,
	setRefreshCookie,
	setSessionCookie,
} from "@/session";
import { deviceLabel } from "@/device-label";
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

	// A re-authentication callback is a different flow: it never signs anyone
	// in. The core use cases each insist on their own intent.
	if (matches && intentOf(transaction) === "reauth") {
		return finish(await reauthCallback(req, provider, state, code, providerError, transaction));
	}

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
			transaction,
			{ deviceLabel: deviceLabel(req.headers.get("user-agent")) }
		);
		const destination = safeReturnTo(transaction.returnTo) ?? "/";
		const response = NextResponse.redirect(new URL(destination, req.url));
		// A proof belongs to the previous session; the guard would reject it anyway.
		clearReauthCookie(response);
		// [access] without refresh; [access, refresh] with it.
		setSessionCookie(response, keycards[0]);
		const refresh = keycards.find((k) => k.type === "refresh");
		if (refresh) setRefreshCookie(response, refresh);
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

/**
 * Finishes a re-authentication and returns to the page that asked for it
 * (never to the saved action - the user submits it again). The outcome is a
 * `reauth` query value: done, cancelled, account_mismatch, unavailable or
 * failed. Only `done` sets the proof cookie.
 */
async function reauthCallback(
	req: NextRequest,
	provider: string,
	state: string,
	code: string | null,
	providerError: string | null,
	transaction: OAuthTransaction
) {
	const back = (outcome: string) => {
		const url = new URL(safeReturnTo(transaction.returnTo) ?? "/", req.url);
		url.searchParams.set("reauth", outcome);
		return NextResponse.redirect(url);
	};
	if (providerError !== null) return back("cancelled");
	if (!code) return back("failed");

	try {
		const result = await thia.completeReauth(
			provider,
			code,
			state,
			transaction,
			await getSessionToken()
		);
		switch (result.status) {
			case "confirmed": {
				const response = back("done");
				setReauthCookie(response, result.proof);
				return response;
			}
			case "refused":
				return back(result.reason === "account_not_linked" ? "account_mismatch" : "failed");
			case "unavailable":
				console.error("Re-authentication unavailable:", describeAuthError(result.cause));
				return back("unavailable");
		}
	} catch (e) {
		console.error("Re-authentication callback failed:", describeAuthError(e));
		return back("failed");
	}
}
