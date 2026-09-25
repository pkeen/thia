import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { Keycard } from "@thia/core";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({
	cookies: async () => cookieStore,
}));

const {
	SESSION_COOKIE_NAME,
	setSessionCookie,
	clearSessionCookie,
	getSessionToken,
} = await import("@/session");

beforeEach(() => {
	cookieStore.get.mockReset();
});

describe("setSessionCookie", () => {
	const expiresAt = new Date("2030-01-01T00:00:00Z");
	const keycard = Keycard.create({
		type: "access",
		value: "signed.jwt.value",
		expiresAt,
	});

	it("stores the keycard so the browser can't read or leak it", () => {
		const response = NextResponse.next();
		setSessionCookie(response, keycard);

		const cookie = response.cookies.get(SESSION_COOKIE_NAME);
		expect(cookie?.value).toBe("signed.jwt.value");
		// httpOnly keeps it away from scripts; sameSite=lax blocks it being sent
		// from other sites' requests.
		expect(cookie?.httpOnly).toBe(true);
		expect(cookie?.sameSite).toBe("lax");
		expect(cookie?.path).toBe("/");
	});

	it("expires the cookie when the keycard expires", () => {
		const response = NextResponse.next();
		setSessionCookie(response, keycard);

		expect(response.cookies.get(SESSION_COOKIE_NAME)?.expires).toEqual(
			expiresAt
		);
	});
});

describe("clearSessionCookie", () => {
	it("empties the cookie and expires it immediately", () => {
		const response = NextResponse.next();
		clearSessionCookie(response);

		const cookie = response.cookies.get(SESSION_COOKIE_NAME);
		expect(cookie?.value).toBe("");
		expect(cookie?.maxAge).toBe(0);
	});
});

describe("getSessionToken", () => {
	it("returns the stored token", async () => {
		cookieStore.get.mockReturnValue({ value: "signed.jwt.value" });
		await expect(getSessionToken()).resolves.toBe("signed.jwt.value");
		expect(cookieStore.get).toHaveBeenCalledWith(SESSION_COOKIE_NAME);
	});

	it("returns undefined when there is no cookie", async () => {
		cookieStore.get.mockReturnValue(undefined);
		await expect(getSessionToken()).resolves.toBeUndefined();
	});
});
