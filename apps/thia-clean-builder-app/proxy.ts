import { NextResponse, type NextRequest } from "next/server";
import { thia } from "@/thia";
import {
	REFRESH_COOKIE_NAME,
	SESSION_COOKIE_NAME,
	clearAuthCookies,
	setRefreshCookie,
	setSessionCookie,
} from "@/session";
import { describeAuthError } from "@/auth-errors";

/** Renew this long before the access token expires. */
const RENEW_BEFORE_EXPIRY_MS = 60_000;

/**
 * The access token's `exp` in ms, read WITHOUT verification - only to decide
 * whether to renew. Every request is still fully validated downstream.
 */
function unverifiedExpiry(token: string | undefined): number | undefined {
	try {
		const payload = JSON.parse(Buffer.from(token!.split(".")[1], "base64url").toString());
		return typeof payload.exp === "number" ? payload.exp * 1000 : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Session renewal (ADR-004). Server components can't set cookies, so when
 * refresh is enabled and the access token is missing or about to expire,
 * this rotates the refresh token before the page or route runs. The new
 * cookies go to the browser and, rewritten into this request, to the page -
 * so it never renders signed-out while a valid refresh token exists.
 *
 * - refreshed: new access and refresh cookies.
 * - grace (a concurrent request rotated first): new access cookie only.
 * - invalid: both cookies cleared, so the next request doesn't retry.
 * - storage unavailable: passes through while the old access token is still
 *   valid; otherwise 503 rather than a false signed-out page.
 */
export async function proxy(req: NextRequest) {
	if (!thia.sessionPolicy.refresh) return NextResponse.next();
	const refreshToken = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
	if (!refreshToken) return NextResponse.next();

	const access = req.cookies.get(SESSION_COOKIE_NAME)?.value;
	const expiry = unverifiedExpiry(access);
	if (access && expiry !== undefined && expiry - Date.now() > RENEW_BEFORE_EXPIRY_MS) {
		return NextResponse.next();
	}

	let result;
	try {
		result = await thia.refreshSession(refreshToken);
	} catch (e) {
		console.error("Session renewal unavailable:", describeAuthError(e));
		if (access && expiry !== undefined && expiry > Date.now()) return NextResponse.next();
		return new NextResponse("Service temporarily unavailable", {
			status: 503,
			headers: { "Retry-After": "5", "Cache-Control": "no-store" },
		});
	}

	if (result.status === "invalid") {
		req.cookies.delete(SESSION_COOKIE_NAME);
		req.cookies.delete(REFRESH_COOKIE_NAME);
		const response = NextResponse.next({ request: { headers: new Headers(req.headers) } });
		clearAuthCookies(response);
		return response;
	}

	req.cookies.set(SESSION_COOKIE_NAME, result.access.value);
	if (result.status === "refreshed") req.cookies.set(REFRESH_COOKIE_NAME, result.refresh.value);
	const response = NextResponse.next({ request: { headers: new Headers(req.headers) } });
	setSessionCookie(response, result.access);
	if (result.status === "refreshed") setRefreshCookie(response, result.refresh);
	response.headers.set("Cache-Control", "no-store");
	return response;
}

export const config = {
	// Logout and the explicit refresh endpoint handle the raw cookies
	// themselves; static assets never need a session.
	matcher: ["/((?!_next/static|_next/image|favicon.ico|api/thia/logout|api/thia/refresh).*)"],
};
