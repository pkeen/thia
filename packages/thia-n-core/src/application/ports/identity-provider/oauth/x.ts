// import {
// 	AbstractOAuthProvider,
// 	OAuthProviderResponse,
// 	OAuthProviderConfig,
// 	BaseTokenSchema,
// } from "./oauth-provider";
// import { UserAccountProfile } from "../../types";
// import { AdapterAccount } from "core/adapter";
// import { z } from "zod";

// // interface ScopeType {
// // 	profile: string;
// // 	openid: string;
// // 	email: string;
// // }

// interface XTokenResponse {
// 	access_token: string;
// 	token_type: string;
// 	expires_in: number;
// 	refresh_token: string;
// 	scope: string;
// }

// interface InitialTokenResponse {
// 	oauth_token: string;
// 	oauth_token_secret: string;
// 	oauth_callback_confirmed: string;
// }

// type ScopeType = "users_read" | "openid" | "email";

// export class X extends AbstractOAuthProvider<
// 	ScopeType,
// 	BaseTokenSchema,
// 	BaseTokenSchema
// > {
// 	readonly type = "oauth";
// 	readonly name = "X";
// 	readonly key = "x";
// 	// protected authorizeEndpoint = "https://x.com/oauth/authorize";
// 	protected initialTokenEndpoint = "https://x.com/oauth/request_token";
// 	protected authorizeEndpoint = "https://x.com/i/oauth2/authorize";
// 	protected tokenEndpoint = "https://x.com/oauth/token";
// 	protected requestToken: InitialTokenResponse;
// 	protected scopeMap = {
// 		users_read: "users.read",
// 		openid: "openid",
// 		email: "email",
// 	};
// 	protected defaultScopes: ScopeType[] = ["users_read"];
// 	protected tokenSchema = BaseTokenSchema;
// 	protected profileSchema = BaseTokenSchema;
// 	constructor(config: OAuthProviderConfig) {
// 		super(config);
// 	}

// 	/**
// 	 * For OAuth2, you directly exchange the authorization code for tokens.
// 	 * @param code The authorization code returned from the callback.
// 	 */
// 	protected async exchangeCodeForTokens(
// 		code: string
// 	): Promise<XTokenResponse> {
// 		const params = new URLSearchParams({
// 			client_id: this.clientId,
// 			client_secret: this.clientSecret,
// 			code,
// 			grant_type: "authorization_code",
// 			redirect_uri: this.redirectUri,
// 		});

// 		const response = await fetch(this.tokenEndpoint, {
// 			method: "POST",
// 			headers: {
// 				"Content-Type": "application/x-www-form-urlencoded",
// 			},
// 			body: params.toString(),
// 		});

// 		if (!response.ok) {
// 			throw new Error("Failed to exchange code for tokens");
// 		}
// 		const data = await response.json();
// 		return this.tokenSchema.parse(data);
// 	}
// }

// TODO ADD X
// I Give up for now, its needlessly complicated and only really supports OAuth1.0
// X doesnt seem to want to let me work locally
