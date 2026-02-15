// application/ports/oauth-provider.port.ts
export type OAuthScope = string;

export interface OAuthBeginParams<S extends string = string> {
	redirectUri?: string; // your callback
	state: string; // CSRF binding
	nonce?: string; // OIDC
	codeChallenge?: string; // PKCE
	extraAuthParams?: Record<string, string>;
	scopes?: S[]; // optional additional scopes
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

export interface OAuthProviderPort<S extends string = string> {
	/** Provider key, e.g. "github" */
	key: string;
	/** Provider name, e.g. "GitHub" */
	name: string;
	/** Begin: build the authorization URL */
	begin(params: OAuthBeginParams<S>): OAuthBeginResult;
	/** Complete: exchange code->tokens, validate id_token if OIDC, fetch user info */
	complete(
		params: OAuthCompleteParams,
	): Promise<{ tokens: OAuthTokenSet; user: OAuthUserInfo }>;
	/** Optional helpers */
	refresh?(refreshToken: string): Promise<OAuthTokenSet>;
	revoke?(accessToken: string): Promise<void>;
}

export type OAuthProvidersPort = Record<string, OAuthProviderPort>;
