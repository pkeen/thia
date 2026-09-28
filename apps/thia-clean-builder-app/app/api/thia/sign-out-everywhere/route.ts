import { NextResponse } from "next/server";
import { thia } from "@/thia";
import { clearAuthCookies, clearSessionCookie } from "@/session";
import { describeAuthError } from "@/auth-errors";
import { isSameOriginRequest } from "@/same-origin";
import { AuthUnavailableError, getCurrentSession } from "@/current-session";

const refuse = (error: string, status: number) =>
	NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Signs the current user out of every Thia session (user-validated mode).
 * The target is always the user of the validated session cookie - nothing
 * in the request can name another user. The cookie is cleared only after
 * the revocation has been stored. Not a sign-out from GitHub or Google.
 */
export async function POST(req: Request) {
	if (!isSameOriginRequest(req)) return refuse("cross_origin_request", 403);

	let session;
	try {
		session = await getCurrentSession();
	} catch (e) {
		if (e instanceof AuthUnavailableError) return refuse("service_unavailable", 503);
		throw e;
	}
	if (!session) return refuse("unauthenticated", 401);

	let result;
	try {
		result = await thia.signOutEverywhere(session);
	} catch (e) {
		// Nothing is known to have changed, so the cookie stays.
		console.error("Sign out everywhere failed:", describeAuthError(e));
		return refuse("service_unavailable", 503);
	}

	switch (result.status) {
		case "unsupported":
			return refuse("global_sign_out_unsupported", 409);
		case "user_not_found": {
			const response = refuse("unauthenticated", 401);
			clearSessionCookie(response);
			return response;
		}
		case "revoked": {
			// 303: the browser follows with a GET, not a repeated POST.
			const response = NextResponse.redirect(
				new URL("/?signed_out=everywhere", req.url),
				303
			);
			response.headers.set("Cache-Control", "no-store");
			// With refresh, every stored session was revoked too.
			if (result.sessions) clearAuthCookies(response);
			else clearSessionCookie(response);
			return response;
		}
	}
}
