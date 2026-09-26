// application/ports/oauth-provider.port.ts
export type OAuthScope = string;

export interface OAuthBeginParams<S extends string = string> {
	redirectUri?: string; // your callback
	state: string; // CSRF binding
	nonce?: string; // OIDC
	/** PKCE S256 challenge (RFC 7636). Required - there is no plain/none fallback. */
	codeChallenge: string;
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
	/** PKCE verifier matching the challenge sent at begin. */
	codeVerifier: string;
	/** OIDC nonce sent at begin; the ID token must carry the same value. */
	nonce?: string;
}

export interface OAuthTokenSet {
	accessToken: string;
	refreshToken?: string;
	idToken?: string;
	expiresAt?: number; // epoch seconds
	tokenType?: string;
	scope?: string;
	sessionState?: string;
	claims?: Record<string, unknown>; // verified ID token claims if present
}

export interface OAuthUserInfo {
	provider: string; // e.g. "github" | "google"
	providerAccountId: string; // stable sub / id
	email?: string;
	emailVerified?: boolean;
	name?: string;
	image?: string;
}

export type OAuthProviderErrorCode =
	| "token_exchange_failed"
	| "invalid_token_response"
	| "id_token_invalid"
	| "profile_fetch_failed";

/**
 * A provider-side failure, safe to log: it carries a fixed code, the HTTP
 * status and (when the provider sent a standard one) the OAuth error code -
 * never codes, tokens, secrets or response bodies.
 */
export class OAuthProviderError extends Error {
	readonly name = "OAuthProviderError";

	constructor(
		readonly code: OAuthProviderErrorCode,
		readonly details: { provider: string; status?: number; oauthError?: string }
	) {
		super(
			`${details.provider}: ${code}` +
				(details.status !== undefined ? ` (HTTP ${details.status})` : "") +
				(details.oauthError ? ` [${details.oauthError}]` : "")
		);
	}
}

export interface OAuthProviderPort<S extends string = string> {
	/** Provider key, e.g. "github" */
	key: string;
	/** Provider name, e.g. "GitHub" */
	name: string;
	/** True for OpenID Connect providers: a nonce is sent and the ID token verified. */
	readonly oidc?: boolean;
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
