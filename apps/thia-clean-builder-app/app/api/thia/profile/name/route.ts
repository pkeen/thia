import { NextResponse } from "next/server";
import { thia } from "@/thia";
import { describeAuthError } from "@/auth-errors";
import { requireRecentAuthentication, requireSession, stopResponse } from "@/require-auth";

const PROFILE_PAGE = "/thia/profile";
const MAX_NAME_LENGTH = 100;

const refuse = (error: string, status: number) =>
	NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Changes the signed-in user's display name (form POST, field `name`). The
 * demo's example of a sensitive action (ADR-005): a valid session is not
 * enough, the browser must also hold a recent re-authentication proof. The
 * target is always the session's own user, and a saved request is never
 * replayed after re-authentication - the user submits the form again.
 */
export async function POST(req: Request) {
	try {
		const session = await requireSession(req);

		let name: unknown;
		try {
			name = (await req.formData()).get("name");
		} catch {
			name = null;
		}
		const trimmed = typeof name === "string" ? name.trim() : "";
		if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
			return refuse("invalid_name", 400);
		}

		// Nothing is changed before this check passes.
		await requireRecentAuthentication(session, req, { redirectTo: PROFILE_PAGE });

		const user = await thia.uow.users.getById(session.identity.userId);
		if (!user) return refuse("unauthenticated", 401);
		try {
			user.updateProfile({ name: trimmed });
		} catch {
			return refuse("invalid_name", 400);
		}
		await thia.uow.users.save(user);

		const response = NextResponse.redirect(new URL(`${PROFILE_PAGE}?saved=1`, req.url), 303);
		response.headers.set("Cache-Control", "no-store");
		return response;
	} catch (e) {
		const stop = stopResponse(e);
		if (stop) return stop;
		console.error("Display name change failed:", describeAuthError(e));
		return refuse("service_unavailable", 503);
	}
}
