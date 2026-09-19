import {
	OAuthProviderConfig,
	BaseTokenSchema,
	convertTokenToCamelCase,
	NewAbstractOAuthProvider,
} from "./oauth-kit";
import { z } from "zod";
import {
	OAuthCompleteParams,
	OAuthProviderPort,
	OAuthTokenSet,
	OAuthUserInfo,
} from "application/ports/oauth-provider-port";

type ScopeType = "openid" | "email" | "profile";

const GoogleTokensSchema = BaseTokenSchema.extend({
	scope: z.string(),
	id_token: z.string(),
});

const GoogleProfileSchema = z.object({
	sub: z.string(),
	name: z.string().optional(),
	picture: z.string().optional(),
	email: z.string().email().optional(),
	email_verified: z.boolean().optional(),
});

type GoogleUserProfile = z.infer<typeof GoogleProfileSchema>;
type GoogleTokens = z.infer<typeof GoogleTokensSchema>;

export class Google
	extends NewAbstractOAuthProvider<ScopeType, GoogleTokens, GoogleUserProfile>
	implements OAuthProviderPort
{
	readonly key = "google";
	readonly name = "Google";

	private userinfoEndpoint = "https://www.googleapis.com/oauth2/v3/userinfo";

	protected authorizeEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
	protected tokenEndpoint = "https://oauth2.googleapis.com/token";

	protected scopeMap = {
		openid: "openid",
		email: "email",
		profile: "profile",
	};
	protected defaultScopes: ScopeType[] = ["openid", "email", "profile"];

	readonly style = { text: "#3c4043", bg: "#fff" };

	constructor(config: OAuthProviderConfig) {
		super(config);
	}

	async exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
		// Unlike GitHub, Google's token endpoint requires a form-encoded body,
		// not query params.
		const body = new URLSearchParams({
			client_id: this.clientId,
			client_secret: this.clientSecret,
			redirect_uri: this.redirectUri,
			grant_type: "authorization_code",
			code,
		});
		const response = await fetch(this.tokenEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: body.toString(),
		});

		return await response.json();
	}

	public async complete(
		params: OAuthCompleteParams,
	): Promise<{ tokens: OAuthTokenSet; user: OAuthUserInfo }> {
		const tokens = convertTokenToCamelCase(
			await this.exchangeCodeForTokens(params.code),
		);
		const userProfile = await this.fetchPublicProfile(tokens.accessToken);
		const user = this.convertToOAuthUserInfo(userProfile);
		return { tokens, user };
	}

	protected convertToOAuthUserInfo(
		userProfile: GoogleUserProfile,
	): OAuthUserInfo {
		return {
			provider: "google",
			providerAccountId: userProfile.sub,
			name: userProfile.name,
			email: userProfile.email,
			emailVerified: userProfile.email_verified,
			image: userProfile.picture,
		};
	}

	protected async fetchPublicProfile(
		accessToken: string,
	): Promise<GoogleUserProfile> {
		const response = await fetch(this.userinfoEndpoint, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		return await response.json();
	}
}
