import { redirect } from "next/navigation";
import { authManager } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/session";
import { commitSession } from "@/session";

export const POST = async (request: NextRequest) => {
	const session = await getSession();
	const previousAuthState = await session?.get("authState");
	const headers = new Headers();

	// call the auth system method
	if (!previousAuthState) {
		return new Response(null, {
			status: 400,
		});
	}
	const authState = await authManager.signOut(previousAuthState.keyCards);

	session?.set("authState", authState);
	headers.append("Set-Cookie", await commitSession(session!));

	return NextResponse.redirect("/", {
		headers,
	});
};
