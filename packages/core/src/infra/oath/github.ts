import {
	OAuthProviderConfig,
	BaseTokenSchema,
	convertTokenToCamelCase,
	NewAbstractOAuthProvider,
} from "./oauth-kit";
import { z } from "zod";
import {
	OAuthCompleteParams,
	OAuthProviderError,
	OAuthProviderPort,
	OAuthTokenSet,
	OAuthUserInfo,
} from "../../application/ports/oauth-provider-port";

type ScopeType =
	| "user_email"
	| "repo"
	| "repo_status"
	| "public_repo"
	| "repo_deployment";

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

/** An entry from GET /user/emails. */
type GitHubEmail = { email: string; primary: boolean; verified: boolean };
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
		user_email: "user:email",
		repo: "repo",
		repo_status: "repo:status",
		repo_deployment: "repo_deployment",
		public_repo: "public_repo",
	};
	// user:email lets us read which of the user's emails GitHub has verified;
	// the profile's public email says nothing about that.
	protected defaultScopes: ScopeType[] = ["user_email"];

	readonly style = { text: "#fff", bg: "#24292f" };

	constructor(config: OAuthProviderConfig) {
		super(config);
	}

	public async complete(
		params: OAuthCompleteParams,
	): Promise<{ tokens: OAuthTokenSet; user: OAuthUserInfo }> {
		// GitHub supports PKCE with S256 only; the verifier travels in the
		// form body alongside the client credentials, never in the URL.
		const tokens = convertTokenToCamelCase(
			this.parseTokens(
				GitHubTokensSchema,
				await this.exchangeAuthorizationCode(params),
			),
		);
		const [userProfile, emails] = await Promise.all([
			this.fetchPublicProfile(tokens.accessToken),
			this.fetchEmails(tokens.accessToken),
		]);
		const user = this.convertToOAuthUserInfo(userProfile, emails);
		return { tokens, user };
	}

	protected convertToOAuthUserInfo(
		userProfile: GitHubUserProfile,
		emails: GitHubEmail[] = [],
	): OAuthUserInfo {
		// Prefer the primary email if verified, else any verified one. With no
		// verified email, fall back to the public profile email, unverified.
		const verified =
			emails.find((e) => e.primary && e.verified) ??
			emails.find((e) => e.verified);

		return {
			provider: "github",
			providerAccountId: userProfile.id.toString(),
			name: userProfile.name ?? userProfile.login,
			email: verified?.email ?? userProfile.email ?? undefined,
			emailVerified: verified !== undefined,
			image: userProfile.avatar_url,
		};
	}

	/**
	 * The user's emails with GitHub's verification status. A failed request
	 * yields no emails, so the sign-in proceeds with nothing marked verified -
	 * failing closed rather than trusting an unconfirmed address.
	 */
	protected async fetchEmails(accessToken: string): Promise<GitHubEmail[]> {
		const response = await fetch(`${this.apiBaseUrl}/user/emails`, {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		if (!response.ok) return [];
		const body: unknown = await response.json();
		return Array.isArray(body) ? (body as GitHubEmail[]) : [];
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
		const parsed = response.ok
			? GitHubProfileSchema.safeParse(await response.json().catch(() => null))
			: undefined;
		if (!parsed?.success) {
			throw new OAuthProviderError("profile_fetch_failed", {
				provider: this.key,
				status: response.status,
			});
		}
		return parsed.data;
	}
}
