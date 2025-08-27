// // lib/session.ts
// import { cookies } from "next/headers";
// import { serialize, parse } from "cookie";

// // make these configurable
// export const SESSION_COOKIE_NAME = "auth_session_next";

// export const SESSION_COOKIE_OPTIONS = {
// 	httpOnly: true,
// 	secure: process.env.NODE_ENV === "production",
// 	sameSite: "lax" as const,
// 	path: "/",
// 	maxAge: 60 * 60 * 24 * 7, // 1 week
// };

// export async function getSession(): Promise<Record<string, any> | null> {
// 	const raw = (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? "";
// 	const authState = raw ? parseCookieValue(raw) : {};

// 	// In production, you'd decode/decrypt or parse JWT here
// 	return createSession(authState);
// }

// export function commitSession(session: Record<string, any>) {
// 	const cookieValue = serialize(
// 		SESSION_COOKIE_NAME,
// 		JSON.stringify(session),
// 		{
// 			httpOnly: true,
// 			secure: process.env.NODE_ENV === "production",
// 			sameSite: "lax",
// 			path: "/",
// 			maxAge: 60 * 60 * 24 * 7, // 1 week
// 		}
// 	);

// 	return cookieValue;
// }

// export function destroySession() {
// 	return serialize(SESSION_COOKIE_NAME, "", {
// 		httpOnly: true,
// 		secure: process.env.NODE_ENV === "production",
// 		sameSite: "lax",
// 		path: "/",
// 		maxAge: 0,
// 	});
// }

// export function parseCookieValue(value: string): Record<string, any> {
// 	try {
// 		return JSON.parse(value);
// 	} catch {
// 		return {};
// 	}
// }

// function createSession(data: Record<string, any>) {
// 	return {
// 		data,
// 		get(key: string) {
// 			return this.data[key];
// 		},
// 		set(key: string, value: any) {
// 			this.data[key] = value;
// 		},
// 		// delete(key: string) {
// 		// 	delete this.data[key];
// 		// },
// 	};
// }
