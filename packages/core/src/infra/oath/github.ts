import {
	AbstractOAuthProvider,
	OAuthProviderConfig,
	BaseTokenSchema,
} from "./oauth-kit";
import { z } from "zod";
import { OAuthProviderPort } from "application/ports/oauth-provider-port";

type ScopeType = "repo" | "repo_status" | "public_repo" | "repo_deployment";

export interface UserAccountProfile {
	accountId: string;
	name?: string | null;
	email: string;
	image?: string | null;
}

// interface GitHubTokens {
// 	access_token: string;
// 	token_type: string;
// 	scope: string;
// }

const GitHubTokensSchema = BaseTokenSchema.extend({
	scope: z.string(),
});

const GitHubProfileSchema = z.object({
	login: z.string(),
	id: z.number(),
	node_id: z.string(),
	avatar_url: z.string(),
	gravatar_id: z.string(),
	url: z.string(),
	html_url: z.string(),
	followers_url: z.string(),
	following_url: z.string(),
	gists_url: z.string(),
	starred_url: z.string(),
	subscriptions_url: z.string(),
	organizations_url: z.string(),
	repos_url: z.string(),
	events_url: z.string(),
	received_events_url: z.string(),
	type: z.string(),
	user_view_type: z.string(),
	site_admin: z.boolean(),
	name: z.string(),
	company: z.null(),
	blog: z.string(),
	location: z.string(),
	email: z.string().email(),
	hireable: z.null(),
	bio: z.null(),
	twitter_username: z.null(),
	notification_email: z.string(),
	public_repos: z.number(),
	public_gists: z.number(),
	followers: z.number(),
	following: z.number(),
	created_at: z.string(),
	updated_at: z.string(),
});

// Infer the TypeScript type from the schema
type GitHubUserProfile = z.infer<typeof GitHubProfileSchema>;
type GitHubTokens = z.infer<typeof GitHubTokensSchema>;

export class GitHub
	extends AbstractOAuthProvider<ScopeType, GitHubTokens, GitHubUserProfile>
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

	protected tokenSchema = GitHubTokensSchema;
	protected profileSchema = GitHubProfileSchema;

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

		const res = await data.json();
		console.log("GITHUB TOKENS:", res);
		return res;
	}

	protected convertToUserAccountProfile(
		userProfile: GitHubUserProfile
	): UserAccountProfile {
		const userAccountProfile: UserAccountProfile = {
			accountId: userProfile.id.toString(),
			name: userProfile.name ?? userProfile.login,
			email: userProfile.email,
			image: userProfile.avatar_url,
		};
		console.log("userAccountProfile:", userAccountProfile);
		return userAccountProfile;
	}

	protected async fetchPublicProfile(
		accessToken: string
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

// export class GitHub extends AbstractOAuthProvider<ScopeType> {
// 	readonly type = "oauth";
// 	readonly key = "github";
// 	readonly name = "GitHub";

// 	private apiBaseUrl = "https://api.github.com";

// 	protected authorizeEndpoint = "https://github.com/login/oauth/authorize";
// 	protected tokenEndpoint = "https://github.com/login/oauth/access_token";
// 	// private scopes: string[];
// 	// protected redirectUri = "http://localhost:5173/auth/redirect/github";
// 	protected scopeMap = {
// 		repo: "repo",
// 		repo_status: "repo:status",
// 		repo_deployment: "repo_deployment",
// 		public_repo: "public_repo",
// 	};
// 	protected defaultScopes = [];

// 	constructor(config: OAuthProviderConfig<ScopeType>) {
// 		super(config);
// 	}

// 	getScopes(): string {
// 		return this.transformScopes(this.defaultScopes);
// 	}

// 	async exchangeCodeForTokens(code: string): Promise<GitHubTokens> {
// 		const tokenUrl = new URL(this.tokenEndpoint);
// 		tokenUrl.searchParams.set("client_id", this.clientId);
// 		tokenUrl.searchParams.set("client_secret", this.clientSecret);
// 		tokenUrl.searchParams.set("redirect_uri", this.redirectUri);
// 		tokenUrl.searchParams.set("grant_type", "authorization_code");
// 		tokenUrl.searchParams.set("code", code);
// 		const headers = new Headers();
// 		headers.append("Accept", "application/json");
// 		const data = await fetch(tokenUrl.toString(), {
// 			method: "POST",
// 			headers,
// 		});
// 		return data.json();
// 	}

// 	async handleRedirect(code: string): Promise<OAuthProviderResponse> {
// 		const tokens = await this.exchangeCodeForTokens(code);
// 		console.log("TOKENS:", tokens);
// 		const userProfile = this.convertToUserProfile(
// 			await this.getUserProfile(tokens.access_token)
// 		);
// 		const adapterAccount = this.convertToAdapterAccount(
// 			userProfile.id,
// 			tokens
// 		);
// 		return { userProfile, adapterAccount };
// 	}

// 	private async getUserProfile(
// 		accessToken: string
// 	): Promise<GitHubUserProfile> {
// 		const url = new URL(`${this.apiBaseUrl}/user`);
// 		const headers = new Headers();
// 		headers.append("Authorization", `Bearer ${accessToken}`);
// 		const response = await fetch(url.toString(), {
// 			headers,
// 		});
// 		return await response.json();
// 	}

// 	private convertToUserProfile(userProfile: GitHubUserProfile): UserProfile {
// 		return {
// 			id: userProfile.id.toString(),
// 			name: userProfile.name ?? userProfile.login,
// 			email: userProfile.email,
// 			image: userProfile.avatar_url,
// 		};
// 	}

// 	private convertToAdapterAccount(
// 		providerAccountId: string,
// 		tokens: GitHubTokens
// 	): Omit<AdapterAccount, "userId"> {
// 		const adapterAccount: Omit<AdapterAccount, "userId"> = {
// 			providerAccountId,
// 			provider: this.key,
// 			type: this.type,
// 			access_token: tokens.access_token,
// 			token_type: tokens.token_type,
// 			scope: tokens.scope,
// 		};
// 		return adapterAccount;
// 	}
// }
