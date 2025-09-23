import {
	AbstractOAuthProvider,
	AbstractOIDCProvider,
	OAuthProviderResponse,
	OAuthProviderConfig,
	BaseTokenSchema,
} from "./base";
// import { UserAccountProfile } from "../../types";
import { UserAccountProfile } from "application/ports/identity-provider";
import { AdapterAccount } from "application/ports/identity-provider";
import { decodeJwt } from "jose";
import { z } from "zod";

const GoogleTokensSchema = BaseTokenSchema.extend({
	id_token: z.string(),
	expires_in: z.number(),
	scope: z.string(),
});

// Infer the TypeScript type from the schema
type GoogleTokens = z.infer<typeof GoogleTokensSchema>;

const GoogleOIDCProfileSchema = z.object({
	iss: z.string(),
	azp: z.string(),
	aud: z.string(),
	sub: z.string(),
	email: z.string().email(),
	email_verified: z.boolean(),
	at_hash: z.string(),
	name: z.string(),
	picture: z.string().url(),
	given_name: z.string(),
	family_name: z.string(),
	iat: z.number(),
	exp: z.number(),
});

// Infer the TypeScript type from the schema
type GoogleOIDCProfile = z.infer<typeof GoogleOIDCProfileSchema>;

type ScopeType =
	| "profile"
	| "email"
	| "openid"
	| "driveMetadataReadonly"
	| "calendarReadonly";

export class Google extends AbstractOIDCProvider<
	ScopeType,
	GoogleTokens,
	GoogleOIDCProfile
> {
	readonly key = "google";
	readonly name = "Google";
	protected authorizeEndpoint =
		"https://accounts.google.com/o/oauth2/v2/auth";
	protected tokenEndpoint = "https://oauth2.googleapis.com/token";

	protected scopeMap: Record<ScopeType, string> = {
		profile: "https://www.googleapis.com/auth/userinfo.profile",
		email: "https://www.googleapis.com/auth/userinfo.email",
		openid: "openid",
		driveMetadataReadonly:
			"https://www.googleapis.com/auth/drive.metadata.readonly",
		calendarReadonly: "https://www.googleapis.com/auth/calendar.readonly",
	};

	protected defaultScopes: ScopeType[] = ["profile", "email", "openid"];

	protected tokenSchema = GoogleTokensSchema;
	protected profileSchema = GoogleOIDCProfileSchema;

	readonly style = { text: "#fff", bg: "#4285F4" };

	constructor(config: OAuthProviderConfig) {
		super(config);
	}

	protected async exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
		const tokenUrl = new URL(this.tokenEndpoint);
		tokenUrl.searchParams.set("client_id", this.clientId);
		tokenUrl.searchParams.set("client_secret", this.clientSecret);
		tokenUrl.searchParams.set("code", code);
		tokenUrl.searchParams.set("redirect_uri", this.redirectUri);
		tokenUrl.searchParams.set("grant_type", "authorization_code");
		const headers = new Headers();
		headers.append("Content-Type", "application/x-www-form-urlencoded");
		const data = await fetch(tokenUrl.toString(), {
			method: "POST",
			headers,
		});
		return data.json();
	}

	protected convertToUserAccountProfile(
		profile: GoogleOIDCProfile
	): UserAccountProfile {
		return {
			accountId: profile.sub,
			name: profile.name,
			email: profile.email,
			image: profile.picture,
		};
	}
}

// export class Google extends AbstractOAuthProvider<
// 	ScopeType,
// 	GoogleTokens,
// 	GoogleOIDCToken
// > {
// 	readonly key = "google";
// 	readonly name = "Google";
// 	readonly type = "oidc";

// 	protected authorizeEndpoint =
// 		"https://accounts.google.com/o/oauth2/v2/auth";
// 	protected tokenEndpoint = "https://oauth2.googleapis.com/token";

// 	protected scopeMap: Record<ScopeType, string> = {
// 		profile: "https://www.googleapis.com/auth/userinfo.profile",
// 		email: "https://www.googleapis.com/auth/userinfo.email",
// 		openid: "openid",
// 		driveMetadataReadonly:
// 			"https://www.googleapis.com/auth/drive.metadata.readonly",
// 		calendarReadonly: "https://www.googleapis.com/auth/calendar.readonly",
// 	};

// 	protected defaultScopes: ScopeType[] = ["profile", "email", "openid"];

// 	constructor(private config: OAuthProviderConfig) {
// 		super(config);
// 	}

// 	protected async exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
// 		const tokenUrl = new URL(this.tokenEndpoint);
// 		tokenUrl.searchParams.set("client_id", this.clientId);
// 		tokenUrl.searchParams.set("client_secret", this.clientSecret);
// 		tokenUrl.searchParams.set("code", code);
// 		tokenUrl.searchParams.set("redirect_uri", this.redirectUri);
// 		tokenUrl.searchParams.set("grant_type", "authorization_code");
// 		const headers = new Headers();
// 		headers.append("Content-Type", "application/x-www-form-urlencoded");
// 		const data = await fetch(tokenUrl.toString(), {
// 			method: "POST",
// 			headers,
// 		});
// 		return data.json();
// 	}

// 	async handleRedirect(code: string): Promise<OAuthProviderResponse> {
// 		const tokens = await this.exchangeCodeForTokens(code);
// 		console.log("GOOGLETOKENS:", tokens);
// 		const googleProfile = await this.getUserProfile(tokens.id_token);
// 		console.log("GOOGLE PROFILE:", googleProfile);

// 		const userProfile = this.convertToUserProfile(
// 			this.mapOidcTokenToProfile(googleProfile)
// 		);
// 		const adapterAccount = this.convertToAdapterAccount(
// 			userProfile.id,
// 			tokens
// 		);
// 		return { userProfile, adapterAccount };
// 	}

// 	protected async getUserProfile(idToken: string): Promise<GoogleOIDCToken> {
// 		// const decoded = decodeJwt(idToken);
// 		const claims = await decodeJwt(idToken);
// 		// Parse and validate the claims
// 		const result = OIDCTokenSchema.safeParse(claims);

// 		if (result.success) {
// 			return result.data;
// 		} else {
// 			// Handle validation errors
// 			throw new Error("Invalid OIDC Token: " + result.error.message);
// 		}
// 	}

// 	private mapOidcTokenToProfile(token: GoogleOIDCToken): GoogleUserProfile {
// 		const {
// 			sub, // Will be mapped to 'id'
// 			email,
// 			email_verified,
// 			name,
// 			given_name,
// 			family_name,
// 			picture,
// 		} = token;

// 		return {
// 			id: sub,
// 			email,
// 			email_verified,
// 			name,
// 			given_name,
// 			family_name,
// 			picture,
// 		};
// 	}

// 	private convertToUserProfile(profile: GoogleUserProfile): UserProfile {
// 		return {
// 			id: profile.id.toString(),
// 			name: profile.name,
// 			email: profile.email,
// 			image: profile.picture,
// 		};
// 	}

// 	private convertToAdapterAccount(
// 		providerAccountId: string,
// 		tokens: Record<string, any>
// 	): Omit<AdapterAccount, "userId"> {
// 		// TODO: maybe this should be a generalized function
// 		// TODO: WHY AM I OMITTING USER ID AGAIN? - Because I dont have it yet

// 		const adapterAccount: Omit<AdapterAccount, "userId"> = {
// 			providerAccountId,
// 			provider: this.key,
// 			type: this.type,
// 			access_token: tokens.access_token,
// 			expires_at: this.convertExpiresInToExpiresAt(tokens.expires_in),
// 			token_type: tokens.token_type,
// 			scope: tokens.scope,
// 			refresh_token: tokens.refresh_token,
// 			id_token: tokens.id_token,
// 			session_state: tokens.session_state,
// 		};
// 		return adapterAccount;
// 	}
// }

// Custom error for handling OAuth redirects
export class AuthRedirectError extends Error {
	constructor(public redirectUrl: string) {
		super("Authentication requires redirect");
		this.name = "AuthRedirectError";
	}
}

// Usage example:
/*
const googleProvider = new GoogleOAuthProvider({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  // Optional configurations
  scopes: ['profile', 'email'],
  accessType: 'offline',
  prompt: 'consent'
});

// Step 1: Initialize sign in (will throw AuthRedirectError)
try {
  await googleProvider.signIn({ 
    redirectUrl: 'https://your-app.com/auth/callback' 
  });
} catch (error) {
  if (error instanceof AuthRedirectError) {
    // Redirect user to Google's consent page
    window.location.href = error.redirectUrl;
  }
}

// Step 2: Handle callback
const result = await googleProvider.signIn({
  code: 'received-auth-code',
  redirectUrl: 'https://your-app.com/auth/callback'
});

// Now you have the user's Google profile and tokens
console.log(result.profile.email);
*/
