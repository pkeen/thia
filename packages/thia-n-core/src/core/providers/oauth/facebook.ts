import {
	AbstractOAuthProvider,
	OAuthProviderConfig,
	OIDCBaseTokenSchema,
	BaseTokenSchema,
	OAuthProviderResponse,
} from "./oauth-provider";
import { decodeJwt } from "jose";
import { z } from "zod";
import { UserAccountProfile } from "core/types";
import { AdapterAccount } from "core/adapter";

type ScopeType = "profile" | "openid" | "email";

const FacebookTokenSchema = BaseTokenSchema.extend({
	expires_in: z.number(),
	id_token: z.string(),
});

const FacebookProfileSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string().email(),
	picture: z.object({
		data: z.object({
			height: z.number(),
			is_silhouette: z.boolean(),
			url: z.string().url(),
			width: z.number(),
		}),
	}),
});

// Infer the TypeScript type from the schema
type FacebookTokens = z.infer<typeof FacebookTokenSchema>;
type FacebookProfile = z.infer<typeof FacebookProfileSchema>;

export class Facebook extends AbstractOAuthProvider<
	ScopeType,
	FacebookTokens,
	FacebookProfile
> {
	readonly type = "oauth";
	readonly key = "facebook";
	readonly name = "Facebook";
	protected authorizeEndpoint = "https://www.facebook.com/v22.0/dialog/oauth";
	protected tokenEndpoint =
		"https://graph.facebook.com/v22.0/oauth/access_token";
	protected scopeMap = {
		profile: "public_profile",
		openid: "openid",
		email: "email",
	};
	protected defaultScopes: ScopeType[] = ["profile", "openid", "email"];

	protected tokenSchema = FacebookTokenSchema;
	protected profileSchema = FacebookProfileSchema;

	readonly style = { bg: "#006aff", text: "#fff" };

	constructor(config: OAuthProviderConfig) {
		super(config);
	}

	async exchangeCodeForTokens(code: string): Promise<FacebookTokens> {
		const tokenUrl = new URL(this.tokenEndpoint);
		tokenUrl.searchParams.set("client_id", this.clientId);
		tokenUrl.searchParams.set("client_secret", this.clientSecret);
		tokenUrl.searchParams.set("redirect_uri", this.redirectUri);
		tokenUrl.searchParams.set("code", code);
		const headers = new Headers();
		headers.append("Accept", "application/json");
		// headers.append("Content-Type", "application/json");
		const data = await fetch(tokenUrl.toString(), {
			method: "POST",
			headers,
		});
		const res = await data.json();
		// console.log("FACEBOOK TOKENS:", res);
		return res;
	}

	async fetchPublicProfile(accessToken: string): Promise<FacebookProfile> {
		const url = new URL(
			`https://graph.facebook.com/v22.0/me?fields=id,name,email,picture&access_token=${accessToken}`
		);
		const headers = new Headers();
		headers.append("Authorization", `Bearer ${accessToken}`);
		const response = await fetch(url.toString(), {
			headers,
		});

		const data = await response.json();
		console.log("FACEBOOK PROFILE:", data);
		return data;
	}

	convertToUserAccountProfile(profile: FacebookProfile): UserAccountProfile {
		return {
			accountId: profile.id,
			name: profile.name,
			email: profile.email,
			image: profile.picture.data.url,
		};
	}
}

// export class Facebook extends AbstractOAuthProvider<
// 	ScopeType,
// 	FacebookTokens,
// 	FacebookProfile
// > {
// 	readonly type = "oauth";
// 	readonly key = "facebook";
// 	readonly name = "Facebook";
// 	protected authorizeEndpoint = "https://www.facebook.com/v22.0/dialog/oauth";
// 	protected tokenEndpoint =
// 		"https://graph.facebook.com/v22.0/oauth/access_token";
// 	protected scopeMap = {
// 		profile: "public_profile",
// 		openid: "openid",
// 		email: "email",
// 	};

// 	protected defaultScopes: ScopeType[] = ["profile", "openid", "email"];

// 	constructor(config: OAuthProviderConfig) {
// 		super(config);
// 	}

// 	async handleRedirect(code: string): Promise<OAuthProviderResponse> {
// 		const tokens = await this.exchangeCodeForTokens(code);
// 		console.log("TOKENS:", tokens);
// 		const userProfile = await this.getUserProfile(tokens);
// 		console.log("PROFILE:", userProfile);
// 		const adapterAccount = this.convertToAdapterAccount(
// 			userProfile.id,
// 			tokens
// 		);
// 		console.log("ADAPTER ACCOUNT:", adapterAccount);
// 		return { userProfile, adapterAccount };
// 	}

// 	async exchangeCodeForTokens(code: string): Promise<FacebookTokens> {
// 		const tokenUrl = new URL(this.tokenEndpoint);
// 		tokenUrl.searchParams.set("client_id", this.clientId);
// 		tokenUrl.searchParams.set("client_secret", this.clientSecret);
// 		tokenUrl.searchParams.set("redirect_uri", this.redirectUri);
// 		tokenUrl.searchParams.set("code", code);
// 		const headers = new Headers();
// 		headers.append("Accept", "application/json");
// 		// headers.append("Content-Type", "application/json");
// 		const data = await fetch(tokenUrl.toString(), {
// 			method: "POST",
// 			headers,
// 		});
// 		const res = await data.json();
// 		// console.log("FACEBOOK TOKENS:", res);
// 		return res;
// 	}

// 	async getUserProfile(tokens: FacebookTokens): Promise<UserProfile> {
// 		const profile = this.convertToUserProfile(
// 			await this.fetchPublicProfile(tokens.access_token)
// 		);
// 		return profile;
// 	}

// 	async fetchPublicProfile(accessToken: string): Promise<FacebookProfile> {
// 		const url = new URL(
// 			`https://graph.facebook.com/v22.0/me?fields=id,name,email,picture&access_token=${accessToken}`
// 		);
// 		const headers = new Headers();
// 		headers.append("Authorization", `Bearer ${accessToken}`);
// 		const response = await fetch(url.toString(), {
// 			headers,
// 		});

// 		const data = await response.json();
// 		console.log("FACEBOOK PROFILE:", data);
// 		return data;
// 	}

// 	private convertToUserProfile(profile: FacebookProfile): UserProfile {
// 		return {
// 			id: profile.id,
// 			name: profile.name,
// 			email: profile.email,
// 			image: profile.picture.data.url,
// 		};
// 	}

// 	convertToAdapterAccount(
// 		providerAccountId: string,
// 		tokens: FacebookTokens
// 	): AdapterAccount {
// 		const adapterAccount: Omit<AdapterAccount, "userId"> = {
// 			providerAccountId,
// 			provider: this.key,
// 			type: this.type,
// 			refresh_token: tokens.refresh_token,
// 			access_token: tokens.access_token,
// 			expires_at: this.convertExpiresInToExpiresAt(tokens.expires_in),
// 			token_type: tokens.token_type,
// 			scope: tokens.scope,
// 			id_token: tokens.id_token,
// 			// session_state: tokens.session_state,
// 		};
// 		return adapterAccount;
// 	}
// }
