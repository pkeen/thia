// lib/auth/cookies.ts
import { serialize } from "cookie";
import { cookies } from "next/headers";

export const THEA_COOKIE_NAME = "thia_session";
const SESSION_COOKIE_OPTIONS = {
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax" as const,
	path: "/",
	maxAge: 60 * 60 * 24 * 7, // 1 week
};

export interface ICookie<T = string> {
	get: () => Promise<T | null>;
	set: (value: T) => string;
	destroy: () => string;
}

export interface IThiaSessionCookie extends ICookie<Record<string, any>> {
	name: string;
}

export const thiaSessionCookie: IThiaSessionCookie = {
	get: async () => {
		const raw = (await cookies()).get(THEA_COOKIE_NAME)?.value ?? "";
		return raw ? JSON.parse(raw) : null;
	},
	set: (value: Record<string, any>) =>
		serialize(
			THEA_COOKIE_NAME,
			JSON.stringify(value),
			SESSION_COOKIE_OPTIONS
		),
	destroy: () =>
		serialize(THEA_COOKIE_NAME, "", {
			...SESSION_COOKIE_OPTIONS,
			maxAge: 0,
		}),
	name: THEA_COOKIE_NAME,
};

export const oauthStateCookie: ICookie<string> = {
	set: (state: any) =>
		serialize("oauth_state", JSON.stringify(state), {
			path: "/",
			httpOnly: true,
			maxAge: 60 * 3, // 3 minutes
		}),
	get: async () => {
		const raw = (await cookies()).get("oauth_state")?.value ?? "";
		return raw ? JSON.parse(raw) : null;
	},
	destroy: () =>
		serialize("oauth_state", "", {
			...SESSION_COOKIE_OPTIONS,
			maxAge: 0,
		}),
};

export const codeVerifierCookie: ICookie<string> = {
	set: (codeVerifier: string) =>
		serialize("code_verifier", codeVerifier, {
			path: "/",
			httpOnly: true,
			maxAge: 60 * 60, // 1 hour
		}),
	get: async () => {
		const raw = (await cookies()).get("code_verifier")?.value ?? "";
		return raw ? JSON.parse(raw) : null;
	},
	destroy: () =>
		serialize("code_verifier", "", {
			...SESSION_COOKIE_OPTIONS,
			maxAge: 0,
		}),
};

export const returnToCookie: ICookie<string> = {
	set: (returnTo: string) =>
		serialize("return_to", JSON.stringify(returnTo), {
			path: "/",
			httpOnly: true,
			maxAge: 60 * 5, // 5 minutes
		}),
	get: async () => {
		const raw = (await cookies()).get("return_to")?.value ?? "";
		return raw ? JSON.parse(raw) : null;
	},
	destroy: () =>
		serialize("return_to", "", {
			...SESSION_COOKIE_OPTIONS,
			maxAge: 0,
		}),
};
