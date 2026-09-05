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
		console.error("OAuth callback failed:", e);
		return NextResponse.json(
			{ error: "authentication_failed" },
			{ status: 400 }
		);
	}
}
