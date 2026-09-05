import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Keycard } from "@thia/core";

export const SESSION_COOKIE_NAME = "thia_session";

export function setSessionCookie(response: NextResponse, keycard: Keycard) {
	response.cookies.set(SESSION_COOKIE_NAME, keycard.value, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		expires: keycard.expiresAt,
	});
}

export function clearSessionCookie(response: NextResponse) {
	response.cookies.set(SESSION_COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

export async function getSessionToken(): Promise<string | undefined> {
	const store = await cookies();
	return store.get(SESSION_COOKIE_NAME)?.value;
}
