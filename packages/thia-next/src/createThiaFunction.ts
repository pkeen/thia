import type { NextApiRequest, NextApiResponse } from "next";
import type { GetServerSidePropsContext } from "next";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { thiaSessionCookie, returnToCookie } from "./cookies";
import {
	IAuthManager,
	UserPublic as User,
} from "@pete_keen/authentication-core";
import { setCsrfCookieIfNotExists } from "./csrf";

// Replace with your enriched user type
// type User = { id: string; email: string };

// Return type for most auth calls
type ThiaReturn<Extra> = Promise<(User & Extra) | null>;

// Minimal compatible context for middleware
type MiddlewareContext = {
	params: Record<string, string | string[]>;
};

// Middleware-style handler function
type MiddlewareHandler = (
	req: NextRequest,
	ctx: MiddlewareContext
) => NextResponse | Promise<NextResponse>;

// Core unified type
type ThiaFunction<Extra> = {
    (...args: [NextApiRequest, NextApiResponse]): ThiaReturn<Extra>; // API Route (Pages Router)
	(...args: [GetServerSidePropsContext]): ThiaReturn<Extra>; // GSSP (Pages Router)
	(...args: [MiddlewareHandler]): MiddlewareHandler; // Middleware wrapper
	(...args: [NextRequest, NextFetchEvent]): Promise<NextResponse>;
	(...args: []): ThiaReturn<Extra>; // RSC
};

function isNextRequest(arg: any): arg is NextRequest {
	return (
		arg instanceof Request && // web standard base
		typeof (arg as NextRequest).cookies?.get === "function"
	);
}

// function isMiddlewareContext(arg: any): arg is MiddlewareContext {
// 	return arg && typeof arg === "object" && "params" in arg;
// }

function isNextFetchEvent(arg: any): arg is NextFetchEvent {
	return typeof arg?.waitUntil === "function";
}

function isApiRequest(arg1: any, arg2: any): arg1 is NextApiRequest {
	return arg1?.method && typeof arg2?.statusCode === "number";
}

function isGSSPContext(arg: any): arg is GetServerSidePropsContext {
	return arg?.req && arg?.res;
}

export type PublicRoutes = {
	pattern: string;
	match: "exact" | "prefix" | "wildcard";
};

export interface MiddlewareConfig {
	publicRoutes: PublicRoutes[];
}

export const THIA_ROUTES: PublicRoutes[] = [
	{ pattern: "/api/thia/signin", match: "exact" },
	{ pattern: "/api/thia/signup", match: "exact" },
	{ pattern: "/api/thia/redirect/*", match: "prefix" },
];

export function isPublicRoute(path: string, routes: PublicRoutes[]): boolean {
	// merge added routes with thia routes
	const mergedRoutes = [...routes, ...THIA_ROUTES];

	return mergedRoutes.some(({ pattern, match }) => {
		if (match === "exact") return path === pattern;

		if (match === "prefix")
			return path.startsWith(pattern.replace(/\*$/, ""));

		if (match === "wildcard") {
			// turn /api/** into regex ^/api/.*$
			const regex = new RegExp(
				"^" +
					pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]+") +
					"$"
			);
			return regex.test(path);
		}

		return false;
	});
}

export function createThiaFunction<Extra>(
	authSystem: IAuthManager<Extra>,
	publicRoutes: PublicRoutes[]
) {
	// Now authSystem is strongly typed, and Extra is inferred

	type EnrichedUser = User & Extra;

	async function getUserFromRSC(): Promise<(User & Extra) | null> {
		const session = await thiaSessionCookie.get();
		const keyCards = session?.keyCards;

		if (!keyCards) return null;

		const result = await authSystem.validate(keyCards);
		if (result.type === "error" || result.type === "redirect") return null;

		return result.authState.user;
	}

	async function handleMiddlewareRequest(
		req: NextRequest
	): Promise<NextResponse> {
		const url = req.nextUrl.clone();
		const path = url.pathname;
		console.log("PATH:", path);
		// Create shared response object
		const res = NextResponse.next();
		// Attach CSRF cookie if missing
		setCsrfCookieIfNotExists(req, res);

		// Allow public routes
		if (isPublicRoute(path, publicRoutes)) {
			console.log("PUBLIC ROUTE");
			return res;
		}

		const session = await thiaSessionCookie.get();
		// console.log("THIA SESSION COOKIE:", session);
		if (!session) {
			console.log("NO SESSION");
			// Save the attempted path in a cookie before redirecting
			const res = NextResponse.redirect(
				new URL("/api/thia/signin", req.url)
			);
			res.headers.append("Set-Cookie", returnToCookie.set(path));
			return res;
		}

		const result = await authSystem.validate(session.keyCards);
		// console.log("AUTH SYSTEM VALIDATION:", result);
		if (result.type === "error" || result.type === "redirect") {
			const res = NextResponse.redirect(
				new URL("/api/thia/signin", req.url)
			);
			// Attach CSRF cookie if missing
			setCsrfCookieIfNotExists(req, res);
			res.headers.append("Set-Cookie", returnToCookie.set(path));
			return res;
		}

		if (result.type === "refresh") {
			const cookieHeader = thiaSessionCookie.set(result.authState);
			res.headers.set("Set-Cookie", cookieHeader);
			return res;
		}

		// Valid session
		return res;
	}

	async function getUserFromApiRoute(
		req: NextApiRequest,
		res: NextApiResponse
	): Promise<(User & Extra) | null> {
		const session = await thiaSessionCookie.get();

		if (!session) return null;

		const result = await authSystem.validate(session.keyCards);
		if (result.type === "error" || result.type === "redirect") return null;

		// (Optional) Refresh cookie here too
		if (result.type === "refresh") {
			const cookie = thiaSessionCookie.set(result.authState);
			res.setHeader("Set-Cookie", cookie);
		}

		return result.authState.user;
	}

	async function getUserFromGSSP(
		ctx: GetServerSidePropsContext
	): Promise<(User & Extra) | null> {
		const raw = ctx.req.cookies?.[thiaSessionCookie.name];
		const session = raw ? JSON.parse(raw) : null;

		if (!session) return null;

		const result = await authSystem.validate(session.keyCards);
		if (result.type === "error" || result.type === "redirect") return null;

		if (result.type === "refresh") {
			const cookie = thiaSessionCookie.set(result.authState);
			ctx.res.setHeader("Set-Cookie", cookie);
		}

		return result.authState.user;
	}

	const thia: ThiaFunction<Extra> = ((...args: any[]): any => {
		// Server Component usage: auth()
		if (args.length === 0) {
			return getUserFromRSC();
		}

		// Middleware usage: auth(req) or auth(req, event)
		if (args.length === 1 && isNextRequest(args[0])) {
			return handleMiddlewareRequest(args[0]);
		}
		if (
			args.length === 2 &&
			isNextRequest(args[0]) &&
			isNextFetchEvent(args[1])
		) {
			return handleMiddlewareRequest(args[0]);
		}

		// API Route usage: auth(req, res) (Pages)
		if (args.length === 2 && isApiRequest(args[0], args[1])) {
			return getUserFromApiRoute(args[0], args[1]);
		}

		// GSSP usage: auth(ctx) (Pages)
		if (args.length === 1 && isGSSPContext(args[0])) {
			return getUserFromGSSP(args[0]);
		}

		// Middleware callback usage: auth(handler)
		if (typeof args[0] === "function") {
			const handler = args[0];
			return async (req: NextRequest, ctx: MiddlewareContext) => {
				await handleMiddlewareRequest(req); // validate user or refresh
				return handler(req, ctx); // pass control
			};
		}

		throw new Error("Invalid usage of auth()");
	}) as ThiaFunction<Extra>;

	return thia;
}
