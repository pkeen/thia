import { commitSession, getSession } from "@/session";
import { thia } from "@/thia";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

function absoluteUrl(path: string, request: NextRequest) {
	return `${request.nextUrl.origin}${path}`;
}

export const GET = async (
	request: NextRequest,
	{ params }: { params: { provider: string } }
) => {
	const provider = params.provider;
	console.log("PROVIDER:", provider);

	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const returnedState = url.searchParams.get("state");
	console.log("RETURNED URL:", url);

	// Retrieve the stored state from cookie
	const cookieStore = await cookies();
	const storedState = cookieStore.get("state")?.value;
	console.log("STORED STATE:", storedState);

	const headers = new Headers();

	// validate state
	if (
		!code ||
		!returnedState ||
		!storedState ||
		returnedState !== storedState
	) {
		// bad request
		return new NextResponse(null, {
			status: 400,
		});
	}

	try {
		const authResult = await thia.login({ provider, code });

		if (authResult.type === "success") {
			console.log("SUCCESS");
			const session = await getSession();
			if (!session) {
				return new NextResponse("Session not found", { status: 500 });
			}
			session.set("authState", authResult.authState);
			const response = NextResponse.redirect(absoluteUrl("/", request));
			response.headers.set("Set-Cookie", commitSession(session.data));
			return response;
		} else if (authResult.type === "redirect") {
			console.log("REDIRECT");
			return new NextResponse("Internal error", { status: 500 });
		} else {
			console.error("Unknown auth result type", authResult);
			return new NextResponse("Internal error", { status: 500 });
		}
	} catch (e) {
		console.error("Auth callback error:", e);
		return new NextResponse("Authentication failed", { status: 500 });
	}
};
