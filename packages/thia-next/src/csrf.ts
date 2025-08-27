// lib/csrf.ts
// import { randomBytes, createHash } from "crypto";
import { serialize, parse } from "cookie";
import { cookies } from "next/headers";
import { ICookie } from "./cookies";
import { NextRequest, NextResponse } from "next/server";

export const CSRF_COOKIE_NAME = "thia_csrf";
const SESSION_COOKIE_OPTIONS = {
	// httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax" as const,
	path: "/",
	maxAge: 60 * 60, // 1 hour
};

export const csrfCookie: ICookie<string> = {
	get: async () => {
		const raw = (await cookies()).get(CSRF_COOKIE_NAME)?.value ?? "";
		return raw ? JSON.parse(raw) : null;
	},
	set: (value: string) =>
		serialize(CSRF_COOKIE_NAME, JSON.stringify(value), {
			path: "/",
			httpOnly: true,
			maxAge: 60 * 5, // 5 minutes
		}),
	destroy: () =>
		serialize(CSRF_COOKIE_NAME, "", {
			...SESSION_COOKIE_OPTIONS,
			maxAge: 0,
		}),
};

// export function initCsrf() {
// 	const { raw } = createCsrfToken();
// 	return csrfCookie.set(raw); // todo: add hashing
// }

export function setCsrfCookieIfNotExists(req: NextRequest, res: NextResponse) {
	// const raw = (await cookies()).get(CSRF_COOKIE_NAME)?.value ?? "";
	const csrf = req.cookies.get(CSRF_COOKIE_NAME);
	if (!csrf) {
		const { raw } = createCsrfToken();
		res.headers.append("Set-Cookie", csrfCookie.set(raw));
	}
}

export function createCsrfToken() {
	// const raw = crypto.randomBytes(32).toString("hex");
	// const token = crypto.createHash("sha256").update(`${raw}${secret}`).digest("hex");
	const rawBytes = new Uint8Array(32);
	globalThis.crypto.getRandomValues(rawBytes);
	const raw = Array.from(rawBytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	// const encoder = new TextEncoder();
	// const data = encoder.encode(`${raw}${secret}`);

	// const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);

	// const hashArray = Array.from(new Uint8Array(hashBuffer));
	// const token = hashArray
	// 	.map((b) => b.toString(16).padStart(2, "0"))
	// 	.join("");
	return { token: raw, raw };
}

// export function csrfMiddleware(req: NextRequest, ctx: MiddlewareContext) {
// 	const isGET = req.method === "GET";
// }

// export function getCsrfToken(req?: Request): string | null {
// 	// ✅ Client/browser context
// 	if (typeof window !== "undefined") {
// 		return (
// 			document.cookie
// 				.split("; ")
// 				.find((row) => row.startsWith(`${CSRF_COOKIE_NAME}=`))
// 				?.split("=")[1] ?? null
// 		);
// 	}

// 	// // ✅ Server context WITH a request object
// 	// if (req) {
// 	// 	const cookie = req.headers.get("cookie") || "";
// 	// 	const parsed = parse(cookie);
// 	// 	return parsed[CSRF_COOKIE_NAME] ?? null;
// 	// }

// 	// ✅ Server context (React Server Component)
// 	try {
// 		const cookieStore = cookies(); // from `next/headers`
// 		const cookie = cookieStore.get(CSRF_COOKIE_NAME)?.value;
// 	} catch {
// 		return null; // gracefully handle if `cookies()` throws (e.g. outside RSC)
// 	}
// }

export function getCsrfTokenClient() {
	return document.cookie
		.split("; ")
		.find((row) => row.startsWith(`${CSRF_COOKIE_NAME}="`))
		?.split("=")[1];
}

export async function getCsrfTokenServer() {
	try {
		return await csrfCookie.get();
	} catch {
		return null; // gracefully handle if `cookies()` throws (e.g. outside RSC)
	}
}

export function validateCsrfToken(raw: string, token: string, secret: string) {
	// const expected = createHash("sha256")
	// 	.update(`${raw}${secret}`)
	// 	.digest("hex");
	// return expected === token;
	return raw === token;
}

export function getCsrfFromCookies(req: Request): string | null {
	const cookie = req.headers.get("cookie") || "";
	const parsed = parse(cookie);
	return parsed[CSRF_COOKIE_NAME] || null;
}

export function setCsrfCookie(res: Response, rawToken: string) {
	const cookie = serialize(CSRF_COOKIE_NAME, rawToken, {
		path: "/",
		maxAge: 3600,
		sameSite: "lax",
	});
	res.headers.append("Set-Cookie", cookie);
}

// new approach
export async function verifyCsrfAndParseForm(
	req: Request
): Promise<{ valid: boolean; formData: FormData }> {
	const formData = await req.formData();

	// const cookie = req.headers.get("cookie") || "";
	// const csrfFromCookie = parse(cookie)[CSRF_COOKIE_NAME] || null;
	const csrfFromCookie = await csrfCookie.get();
	const csrfFromForm = formData.get("csrfToken");

	const valid =
		typeof csrfFromForm === "string" && csrfFromCookie === csrfFromForm;

	return { valid, formData };
}

// export function CsrfField({ token }: { token: string }) {
// 	return <input type="hidden" name="csrfToken" value={token} />;
// }
// export function getCsrfToken() {
// 	return document.cookie
// 		.split("; ")
// 		.find((row) => row.startsWith(`${CSRF_COOKIE_NAME}="`))
// 		?.split("=")[1];
// }

// export function renderCsrfInput() {
// 	const csrfToken = getCsrfToken();
// 	if (!csrfToken) return "";
// 	return `<input type="hidden" name="csrfToken" value="${csrfToken}" />`;
// }
