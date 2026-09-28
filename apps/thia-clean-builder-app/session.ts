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

/**
 * The refresh cookie (ADR-004). It must reach page requests so proxy.ts can
 * renew during navigation, hence Path=/ and SameSite=Lax (Strict would drop
 * it on arrival from another site). Over HTTPS the `__Host-` prefix makes
 * the browser insist on Secure, Path=/ and no Domain.
 */
export const REFRESH_COOKIE_NAME =
	process.env.NODE_ENV === "production" ? "__Host-thia_refresh" : "thia_refresh";

const refreshCookieAttributes = () => ({
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax" as const,
	path: "/",
});

export function setRefreshCookie(response: NextResponse, keycard: Keycard) {
	response.cookies.set(REFRESH_COOKIE_NAME, keycard.value, {
		...refreshCookieAttributes(),
		expires: keycard.expiresAt,
	});
}

/** Same attributes as when set - browsers ignore a `__Host-` cookie without them. */
export function clearRefreshCookie(response: NextResponse) {
	response.cookies.set(REFRESH_COOKIE_NAME, "", { ...refreshCookieAttributes(), maxAge: 0 });
}

/** Clears the access (session) cookie and, if present, the refresh cookie. */
export function clearAuthCookies(response: NextResponse) {
	clearSessionCookie(response);
	clearRefreshCookie(response);
}

export async function getRefreshToken(): Promise<string | undefined> {
	const store = await cookies();
	return store.get(REFRESH_COOKIE_NAME)?.value;
}
