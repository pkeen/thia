import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/session";

export async function POST(req: Request) {
	const response = NextResponse.redirect(new URL("/", req.url));
	clearSessionCookie(response);
	return response;
}
