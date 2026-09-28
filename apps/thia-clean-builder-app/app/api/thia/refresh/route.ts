import { NextResponse } from "next/server";
import { thia } from "@/thia";
import {
	clearAuthCookies,
	getRefreshToken,
	setRefreshCookie,
	setSessionCookie,
} from "@/session";
import { describeAuthError } from "@/auth-errors";
import { isSameOriginRequest } from "@/same-origin";

const json = (body: unknown, status: number) =>
	NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Explicit renewal for client code (pages are renewed by proxy.ts). POST
 * only, same-origin only. 204 with new cookies; 401 clears them; 503 keeps
 * them; 404 when refresh is disabled.
 */
export async function POST(req: Request) {
	if (!thia.sessionPolicy.refresh) return json({ error: "refresh_disabled" }, 404);
	if (!isSameOriginRequest(req)) return json({ error: "cross_origin_request" }, 403);

	let result;
	try {
		result = await thia.refreshSession(await getRefreshToken());
	} catch (e) {
		console.error("Session refresh failed:", describeAuthError(e));
		return json({ error: "service_unavailable" }, 503);
	}

	if (result.status === "invalid") {
		const response = json({ error: "invalid_refresh_token" }, 401);
		clearAuthCookies(response);
		return response;
	}
	const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
	setSessionCookie(response, result.access);
	if (result.status === "refreshed") setRefreshCookie(response, result.refresh);
	return response;
}
