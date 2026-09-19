import { NextResponse } from "next/server";
import { thia } from "@/thia";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ provider: string }> }
) {
	const { provider } = await params;

	const redirectUri = thia.redirectUriFor(provider);
	if (!redirectUri) {
		return NextResponse.json({ error: "unknown_provider" }, { status: 400 });
	}

	try {
		const { authorizationUrl } = await thia.beginLogin(provider, redirectUri);
		return NextResponse.redirect(authorizationUrl);
	} catch (e) {
		console.error("Failed to begin OAuth login:", e);
		return NextResponse.json({ error: "unknown_provider" }, { status: 400 });
	}
}
