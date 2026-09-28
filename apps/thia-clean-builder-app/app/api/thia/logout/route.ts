import { NextResponse } from "next/server";
import { thia } from "@/thia";
import { clearAuthCookies, clearSessionCookie, getRefreshToken } from "@/session";
import { getCurrentSession } from "@/current-session";
import { describeAuthError } from "@/auth-errors";

/**
 * Signs this browser out. Without refresh that just clears the cookie. With
 * refresh it also revokes this browser's stored session - found from the
 * access token's `sid` or the refresh cookie (proxy.ts skips this route, so
 * both arrive unrenewed) - then clears both cookies. Other devices are
 * untouched. If revocation fails the cookies are still cleared; the stored
 * session then lives until it expires.
 */
export async function POST(req: Request) {
	const response = NextResponse.redirect(new URL("/", req.url));
	if (!thia.sessionPolicy?.refresh) {
		clearSessionCookie(response);
		return response;
	}

	try {
		const session = await getCurrentSession().catch(() => null);
		await thia.signOut({ session, refreshToken: await getRefreshToken() });
	} catch (e) {
		console.error("Session revocation on sign-out failed:", describeAuthError(e));
	}
	clearAuthCookies(response);
	return response;
}
