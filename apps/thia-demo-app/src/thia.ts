import { createAuthManager } from "@pete_keen/thia-n-core";
import {
	Google,
	Zoom,
	Microsoft,
	Facebook,
	LinkedIn,
} from "@pete_keen/thia-n-core/providers";
import { DrizzleAdapter } from "@pete_keen/thia-n-core/adapters";
import db from "@/db";
// import { authz } from "./authz";
import Thia from "@pete_keen/thia-next";

export const userRegistry = DrizzleAdapter(db);

export const { thia, handlers } = Thia({
	strategy: "jwt",
	jwtConfig: {
		access: {
			name: "access", // for now the names NEED to be access and refresh
			secretKey: "asfjsdkfj",
			algorithm: "HS256",
			expiresIn: "30 minutes",
			fields: ["id", "email"], // TODO: this currently does nothing
		},
		refresh: {
			name: "refresh",
			secretKey: "jldmff",
			algorithm: "HS256",
			expiresIn: "30 days",
			fields: ["id"],
		},
	},
	secret: "adafdsfsd",
	adapter: userRegistry,
	providers: [
		new Zoom({
			clientId: process.env.ZOOM_CLIENT_ID!,
			clientSecret: process.env.ZOOM_CLIENT_SECRET!,
			redirectUri: process.env.ZOOM_REDIRECT_URI!,
		}),
		new Google({
			clientId: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
			redirectUri: process.env.GOOGLE_REDIRECT_URI!,
		}),
		new Microsoft({
			clientId: process.env.MICROSOFT_CLIENT_ID!,
			clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
			redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
		}),
		new Facebook({
			clientId: process.env.FACEBOOK_CLIENT_ID!,
			clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
			redirectUri: process.env.FACEBOOK_REDIRECT_URI!,
		}),
		// new LinkedIn({
		// 	clientId: process.env.LINKEDIN_CLIENT_ID!,
		// 	clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
		// 	redirectUri: process.env.LINKEDIN_REDIRECT_URI!,
		// }),
		// Will leave this for now until creating a B27 linkedIn Page
	],
	loggerOptions: {
		level: "debug",
		prefix: "Thia",
	},
	// callbacks: {
	// 	augmentUserData: authz.getAuthzData,
	// 	onUserCreated: authz.onUserCreated,
	// 	onUserUpdated: authz.onUserDeleted,
	// 	onUserDeleted: authz.onUserDeleted,
	// },
	middleware: {
		publicRoutes: [
			{ pattern: "/", match: "exact" },
			{ pattern: "/about", match: "exact" },
			{ pattern: "/api/thia/signin", match: "exact" },
			{ pattern: "/api/thia/signup", match: "exact" },
			{ pattern: "/api/public/*", match: "prefix" },
			{ pattern: "/static/**", match: "wildcard" },
		],
	},
});

export type ThiaUser = Awaited<ReturnType<typeof thia>>;

// // Now extract the user from thia
// export type AuthUser = NoArgsReturnType<typeof thia>;

// // Helper type: Extract return type of no-args overload
// type NoArgsReturnType<T> = T extends {
// 	(): Promise<infer R>;
// }
// 	? R
// 	: never;
