import {
	AbstractOIDCProvider,
	OAuthProviderConfig,
	OIDCBaseTokenSchema,
	BaseTokenSchema,
	OAuthProviderResponse,
} from "./base";
import { z } from "zod";
import { UserAccountProfile } from "core/types";

type ScopeType = "profile" | "email" | "openid";

const LinkedInTokenSchema = BaseTokenSchema.extend({
	// id_token: z.string(),
	expires_in: z.number(),
	scope: z.string(),

	// refresh_token_expires_in: z.number(),
});

type LinkedInTokens = z.infer<typeof LinkedInTokenSchema>;

const LinkedInOIDCTokenSchema = OIDCBaseTokenSchema.extend({
	sub: z.string(),
	name: z.string(),
	given_name: z.string(),
	family_name: z.string(),
	picture: z.string().url(),
	locale: z.string(),
	email: z.string().email(),
	email_verified: z.string(),
});

type LinkedInOIDCTokens = z.infer<typeof LinkedInOIDCTokenSchema>;

export class LinkedIn extends AbstractOIDCProvider<
	ScopeType,
	LinkedInTokens,
	LinkedInOIDCTokens
> {
	// readonly type = "oidc";
	readonly name = "LinkedIn";
	readonly key = "linkedin";
	protected authorizeEndpoint =
		"https://www.linkedin.com/oauth/v2/authorization";
	protected tokenEndpoint = "https://www.linkedin.com/oauth/v2/accessToken";
	protected scopeMap = {
		profile: "profile",
		email: "email",
		openid: "openid",
	};
	protected defaultScopes: ScopeType[] = ["profile", "email", "openid"];
	protected tokenSchema = LinkedInTokenSchema;
	protected profileSchema = LinkedInOIDCTokenSchema;

	constructor(config: OAuthProviderConfig) {
		super(config);
	}

	readonly style = { bg: "#069", text: "#fff" };

	async exchangeCodeForTokens(code: string): Promise<LinkedInTokens> {
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
		profile: LinkedInOIDCTokens
	): UserAccountProfile {
		return {
			accountId: profile.sub,
			name: profile.name,
			email: profile.email,
			image: profile.picture,
		};
	}

	// convertToUserAccountProfile(profile: OIDCBaseTokenSchema): UserAccountProfile {
	//     return {
	//         id: profile.sub,
	//         name: profile.name,
	//         email: profile.email,
	//         picture: profile.picture,
	//     };
	// }
}
