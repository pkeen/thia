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

type ScopeType = "repo" | "repo_status" | "public_repo" | "repo_deployment";

const GitHubTokensSchema = BaseTokenSchema.extend({
	scope: z.string(),
});

const GitHubProfileSchema = z.object({
	login: z.string(),
	id: z.number(),
	avatar_url: z.string(),
	name: z.string().nullable(),
	email: z.string().email().nullable(),
});

type GitHubUserProfile = z.infer<typeof GitHubProfileSchema>;
type GitHubTokens = z.infer<typeof GitHubTokensSchema>;

export class GitHub
	extends NewAbstractOAuthProvider<ScopeType, GitHubTokens, GitHubUserProfile>
	implements OAuthProviderPort
{
	readonly key = "github";
	readonly name = "GitHub";

	private apiBaseUrl = "https://api.github.com";

	protected authorizeEndpoint = "https://github.com/login/oauth/authorize";
	protected tokenEndpoint = "https://github.com/login/oauth/access_token";

	protected scopeMap = {
		repo: "repo",
		repo_status: "repo:status",
		repo_deployment: "repo_deployment",
		public_repo: "public_repo",
	};
	protected defaultScopes = [];

	readonly style = { text: "#fff", bg: "#24292f" };

	constructor(config: OAuthProviderConfig) {
		super(config);
	}

	async exchangeCodeForTokens(code: string): Promise<GitHubTokens> {
		const tokenUrl = new URL(this.tokenEndpoint);
		tokenUrl.searchParams.set("client_id", this.clientId);
		tokenUrl.searchParams.set("client_secret", this.clientSecret);
		tokenUrl.searchParams.set("redirect_uri", this.redirectUri);
		tokenUrl.searchParams.set("grant_type", "authorization_code");
		tokenUrl.searchParams.set("code", code);
		const headers = new Headers();
		headers.append("Accept", "application/json");
		const data = await fetch(tokenUrl.toString(), {
			method: "POST",
			headers,
		});

		return await data.json();
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
		userProfile: GitHubUserProfile,
	): OAuthUserInfo {
		return {
			provider: "github",
			providerAccountId: userProfile.id.toString(),
			name: userProfile.name ?? userProfile.login,
			email: userProfile.email ?? undefined,
			image: userProfile.avatar_url,
		};
	}

	protected async fetchPublicProfile(
		accessToken: string,
	): Promise<GitHubUserProfile> {
		const url = new URL(`${this.apiBaseUrl}/user`);
		const headers = new Headers();
		headers.append("Authorization", `Bearer ${accessToken}`);
		const response = await fetch(url.toString(), {
			headers,
		});
		return await response.json();
	}
}
