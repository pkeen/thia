import { NextResponse } from "next/server";
import { thia } from "@/thia";
import { setSessionCookie } from "@/session";

export async function GET(
	req: Request,
	{ params }: { params: Promise<{ provider: string }> }
) {
	const { provider } = await params;
	const url = new URL(req.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");

	if (!code || !state) {
		return NextResponse.json(
			{ error: "missing code or state" },
			{ status: 400 }
		);
	}

	try {
		const { keycards } = await thia.completeLogin(provider, code, state);
		const response = NextResponse.redirect(new URL("/", req.url));
		setSessionCookie(response, keycards[0]);
		return response;
	} catch (e) {
		if (e instanceof Error && e.message === "ACCOUNT_LINK_CONFLICT") {
			// Not a failure to log: the email belongs to an existing account
			// that we won't link automatically. Send them back to choose the
			// provider they originally signed up with.
			return NextResponse.redirect(
				new URL("/thia/login?error=account_exists", req.url)
			);
		}
		console.error("OAuth callback failed:", e);
		return NextResponse.json(
			{ error: "authentication_failed" },
			{ status: 400 }
		);
	}
}
