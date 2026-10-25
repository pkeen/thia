import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { AuthenticatedSession } from "@thia/core";
import { thia } from "@/thia";
import { REAUTH_COOKIE_NAME } from "@/session";
import { describeAuthError } from "@/auth-errors";
import { isSameOriginRequest } from "@/same-origin";
import { AuthUnavailableError, getCurrentSession } from "@/current-session";

/**
 * Thrown by the helpers below to end a request. A route handler catches it
 * and returns `response`; nothing after the helper runs.
 */
export class AuthStop extends Error {
	constructor(readonly response: NextResponse) {
		super("AUTH_STOP");
		this.name = "AuthStop";
	}
}

/** The response for an `AuthStop`, or null for any other error (rethrow it). */
export const stopResponse = (e: unknown): NextResponse | null =>
	e instanceof AuthStop ? e.response : null;

const refuse = (error: string, status: number) =>
	new AuthStop(
		NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } })
	);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * An ordinary private server action: the validated Thia session, or the
 * request ends (403 cross-origin state-changing request, 401 not signed in,
 * 503 when that can't be determined). Does NOT ask for re-authentication.
 */
export async function requireSession(request: Request): Promise<AuthenticatedSession> {
	if (!SAFE_METHODS.has(request.method) && !isSameOriginRequest(request)) {
		throw refuse("cross_origin_request", 403);
	}
	let session;
	try {
		session = await getCurrentSession();
	} catch (e) {
		if (e instanceof AuthUnavailableError) throw refuse("service_unavailable", 503);
		throw e;
	}
	if (!session) throw refuse("unauthenticated", 401);
	return session;
}

/**
 * Adds the sensitive-action check to a validated session. Call it inside the
 * server action, after `requireSession` and before changing anything. With no
 * valid proof the request ends: 403 `reauthentication_required` (or, when
 * `redirectTo` is given and the request is a browser form post, a 303 back to
 * that page with `?reauth=required`). Storage failure or unsupported
 * configuration ends it with 503 - the action never runs unchecked.
 */
export async function requireRecentAuthentication(
	session: AuthenticatedSession,
	request: Request,
	options: { redirectTo?: string } = {}
): Promise<void> {
	let check;
	try {
		const proof = (await cookies()).get(REAUTH_COOKIE_NAME)?.value;
		check = await thia.checkRecentAuthentication(session, proof);
	} catch (e) {
		console.error("Recent-authentication check failed:", describeAuthError(e));
		throw refuse("service_unavailable", 503);
	}
	if (check.status === "valid") return;
	if (check.status === "unavailable") {
		console.error(`Recent-authentication check unavailable (${check.reason})`);
		throw refuse("service_unavailable", 503);
	}
	if (options.redirectTo && (request.headers.get("accept") ?? "").includes("text/html")) {
		const url = new URL(options.redirectTo, request.url);
		url.searchParams.set("reauth", "required");
		const response = NextResponse.redirect(url, 303);
		response.headers.set("Cache-Control", "no-store");
		throw new AuthStop(response);
	}
	throw new AuthStop(
		NextResponse.json(
			{ error: "reauthentication_required", reason: check.status },
			{ status: 403, headers: { "Cache-Control": "no-store" } }
		)
	);
}
