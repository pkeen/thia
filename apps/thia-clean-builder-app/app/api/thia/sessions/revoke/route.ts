import { NextResponse } from "next/server";
import { thia } from "@/thia";
import { clearAuthCookies } from "@/session";
import { describeAuthError } from "@/auth-errors";
import { isSameOriginRequest } from "@/same-origin";
import { AuthUnavailableError, getCurrentSession } from "@/current-session";

const refuse = (error: string, status: number) =>
	NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Signs one of the caller's own devices out (form POST, field `session`).
 * A session that isn't the caller's is answered exactly like a missing one.
 * Revoking the current session also clears this browser's cookies.
 */
export async function POST(req: Request) {
	if (!thia.sessionPolicy.refresh) return refuse("refresh_disabled", 404);
	if (!isSameOriginRequest(req)) return refuse("cross_origin_request", 403);

	let session;
	try {
		session = await getCurrentSession();
	} catch (e) {
		if (e instanceof AuthUnavailableError) return refuse("service_unavailable", 503);
		throw e;
	}
	if (!session) return refuse("unauthenticated", 401);

	let target: unknown;
	try {
		target = (await req.formData()).get("session");
	} catch {
		target = null;
	}
	if (typeof target !== "string") return refuse("session_not_found", 404);

	let result;
	try {
		result = await thia.revokeSession(session, target);
	} catch (e) {
		console.error("Device sign-out failed:", describeAuthError(e));
		return refuse("service_unavailable", 503);
	}
	if (result.status === "not_found") return refuse("session_not_found", 404);

	if (result.current) {
		const response = NextResponse.redirect(new URL("/", req.url), 303);
		clearAuthCookies(response);
		return response;
	}
	return NextResponse.redirect(new URL("/thia/devices?signed_out=1", req.url), 303);
}
