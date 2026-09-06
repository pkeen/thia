import { NextResponse } from "next/server";
import { thia } from "@/thia";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ provider: string }> }
) {
	const { provider } = await params;

	// Single-provider MVP: redirect URI comes from provider-specific env config.
	const redirectUri = process.env.GITHUB_REDIRECT_URI!;

	try {
		const { authorizationUrl } = await thia.beginLogin(provider, redirectUri);
		return NextResponse.redirect(authorizationUrl);
	} catch (e) {
		console.error("Failed to begin OAuth login:", e);
		return NextResponse.json({ error: "unknown_provider" }, { status: 400 });
	}
}
