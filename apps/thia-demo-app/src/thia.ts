import { createAuthManager } from "@pete_keen/thia-n-core";
import {
	Google,
	Zoom,
	Microsoft,
	Facebook,
	GitHub,
	LinkedIn,
} from "@pete_keen/thia-n-core/adapters";
import { DrizzleAdapter } from "@pete_keen/thia-n-core/adapters";
import db from "@/db";
// import { authz } from "./authz";
// import Thia from "@pete_keen/thia-next";

export const userRegistry = DrizzleAdapter(db);

export const thia = createAuthManager({
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
	adapter: DrizzleAdapter(db),
	providers: [
		new GitHub({
			clientId: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
			redirectUri: process.env.GITHUB_REDIRECT_URI!,
		}),

		new Zoom({
			clientId: process.env.ZOOM_CLIENT_ID!,
			clientSecret: process.env.ZOOM_CLIENT_SECRET!,
			redirectUri: process.env.ZOOM_REDIRECT_URI!,
		}),

		new Google({
			clientId: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
			redirectUri: "http://localhost:5173/auth/redirect/google",
		}),

		new Microsoft({
			clientId: process.env.MICROSOFT_CLIENT_ID!,
			clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
			redirectUri: "http://localhost:5173/auth/redirect/microsoft",
		}),

		new Facebook({
			clientId: process.env.FACEBOOK_CLIENT_ID!,
			clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
			redirectUri: "http://localhost:5173/auth/redirect/facebook",
		}),
	],
	loggerOptions: {
		level: "debug",
		prefix: "Auth",
	},
	// callbacks: {
	// 	augmentUserData: authz.getAuthzData,
	// 	onUserCreated: authz.onUserCreated,
	// 	onUserUpdated: authz.onUserDeleted,
	// 	onUserDeleted: authz.onUserDeleted,
	// },
});
