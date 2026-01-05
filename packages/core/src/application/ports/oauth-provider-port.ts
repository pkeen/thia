// application/ports/oauth-provider.port.ts
export type OAuthScope = string;

export interface OAuthBeginParams {
	redirectUri: string; // your callback
	state: string; // CSRF binding
	nonce?: string; // OIDC
	codeChallenge?: string; // PKCE
	extraAuthParams?: Record<string, string>;
}

export interface OAuthBeginResult {
	authorizationUrl: string;
}

export interface OAuthCompleteParams {
	redirectUri: string;
	code: string;
	state: string;
	codeVerifier?: string; // PKCE
}

export interface OAuthTokenSet {
	accessToken: string;
	refreshToken?: string;
	idToken?: string;
	expiresAt?: number; // epoch seconds
	tokenType?: string;
	scope?: string;
	sessionState?: string;
	claims?: Record<string, unknown>; // parsed ID token claims if present
}

export interface OAuthUserInfo {
	provider: string; // e.g. "github" | "google"
	providerAccountId: string; // stable sub / id
	email?: string;
	emailVerified?: boolean;
	name?: string;
	image?: string;
}

export interface OAuthProviderPort {
	/** Provider key, e.g. "github" */
	key: string;
	/** Provider name, e.g. "GitHub" */
	name: string;
	/** Begin: build the authorization URL */
	begin(params: OAuthBeginParams): Promise<OAuthBeginResult>;
	/** Complete: exchange code->tokens, validate id_token if OIDC, fetch user info */
	complete(
		params: OAuthCompleteParams
	): Promise<{ tokens: OAuthTokenSet; user: OAuthUserInfo }>;
	/** Optional helpers */
	refresh?(refreshToken: string): Promise<OAuthTokenSet>;
	revoke?(accessToken: string): Promise<void>;
}
