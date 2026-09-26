import { z } from "zod";
import {
	OAuthBeginParams,
	OAuthBeginResult,
	OAuthCompleteParams,
	OAuthProviderError,
	OAuthProviderPort,
	OAuthTokenSet,
	OAuthUserInfo,
} from "../../application/ports/oauth-provider-port";
import { CODE_VERIFIER_PATTERN } from "../../application/oauth/pkce";

/** RFC 6749 §5.2 error codes are short snake_case words; anything else is dropped. */
const OAUTH_ERROR_CODE = /^[a-z_]{1,64}$/;

export const BaseTokenSchema = z.object({
	access_token: z.string(),
	token_type: z.string(),
	expires_in: z.number().optional(),
	refresh_token: z.string().optional(),
	scope: z.string().optional(),
	id_token: z.string().optional(),
	session_state: z.string().optional(),
});

export type BaseToken = z.infer<typeof BaseTokenSchema>;

export interface OAuthProviderConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}

export const convertTokenToCamelCase = (token: BaseToken): OAuthTokenSet => {
	return {
		accessToken: token.access_token,
		tokenType: token.token_type,
		expiresAt: token.expires_in, // We will handle this conversion later
		refreshToken: token.refresh_token,
		scope: token.scope,
	};
};

/** Base class handling the OAuth "begin" leg (authorization URL + scopes). */
export abstract class NewAbstractOAuthProviderBase<
	ScopeType extends string,
	TokenType extends BaseToken,
	ProfileType,
> implements OAuthProviderPort<ScopeType> {
	abstract key: string;
	abstract name: string;

	protected clientId: string;
	protected clientSecret: string;
	protected redirectUri: string;

	protected abstract authorizeEndpoint: string;
	protected abstract tokenEndpoint: string;
	protected abstract scopeMap: Record<ScopeType, string>;

	// Minimum scopes required by the application
	protected abstract defaultScopes: ScopeType[];

	protected constructor(config: OAuthProviderConfig) {
		this.clientId = config.clientId;
		this.clientSecret = config.clientSecret;
		this.redirectUri = config.redirectUri;
	}

	/**
	 * Transforms and validates scopes using the provider-specific scope map.
	 */
	protected transformScopes(scopes: ScopeType[]): string {
		const combinedScopes = [...this.defaultScopes, ...scopes];
		const uniqueScopes = Array.from(new Set(combinedScopes));

		return uniqueScopes
			.map((scope) => {
				const mappedScope = this.scopeMap[scope];
				if (!mappedScope) {
					throw new Error(`Invalid scope: ${scope}`);
				}
				return mappedScope;
			})
			.join(" ");
	}

	public begin(params: OAuthBeginParams<ScopeType>): OAuthBeginResult {
		// PKCE is mandatory: refuse rather than silently start a login without it.
		if (!params.codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge)) {
			throw new Error("PKCE_CHALLENGE_REQUIRED");
		}
		const scopeString = this.transformScopes(params.scopes || []);
		const qp = new URLSearchParams({
			// Extra params first, so they can never override the security-relevant ones.
			...(params.extraAuthParams ?? {}),
			client_id: this.clientId,
			redirect_uri: params.redirectUri ?? this.redirectUri,
			response_type: "code",
			scope: scopeString,
			state: params.state, // orchestrator supplies
			...(params.nonce ? { nonce: params.nonce } : {}),
			code_challenge: params.codeChallenge,
			code_challenge_method: "S256",
		});

		return {
			authorizationUrl: `${this.authorizeEndpoint}?${qp.toString()}`,
		};
	}

	/**
	 * Authorization-code exchange (RFC 6749 §4.1.3 + RFC 7636 §4.5): a
	 * form-encoded POST carrying the PKCE verifier and the same redirect URI
	 * the authorization request used. Returns the parsed JSON body; any HTTP
	 * or OAuth error becomes an OAuthProviderError that holds no secrets.
	 */
	protected async exchangeAuthorizationCode(
		params: OAuthCompleteParams,
	): Promise<Record<string, unknown>> {
		if (!params.codeVerifier || !CODE_VERIFIER_PATTERN.test(params.codeVerifier)) {
			throw new Error("PKCE_VERIFIER_REQUIRED");
		}
		const body = new URLSearchParams({
			grant_type: "authorization_code",
			code: params.code,
			redirect_uri: params.redirectUri,
			client_id: this.clientId,
			client_secret: this.clientSecret,
			code_verifier: params.codeVerifier,
		});

		let response: Response;
		try {
			response = await fetch(this.tokenEndpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Accept: "application/json",
				},
				body: body.toString(),
			});
		} catch {
			throw new OAuthProviderError("token_exchange_failed", { provider: this.key });
		}

		let json: unknown;
		try {
			json = await response.json();
		} catch {
			json = undefined;
		}
		const record =
			json && typeof json === "object" && !Array.isArray(json)
				? (json as Record<string, unknown>)
				: undefined;
		const oauthError =
			typeof record?.error === "string" && OAUTH_ERROR_CODE.test(record.error)
				? record.error
				: undefined;

		// GitHub reports failures with HTTP 200 and an `error` field.
		if (!response.ok || oauthError || !record) {
			throw new OAuthProviderError("token_exchange_failed", {
				provider: this.key,
				status: response.status,
				oauthError,
			});
		}
		return record;
	}

	/** Validates a token response against the provider's schema. */
	protected parseTokens<T>(schema: z.ZodType<T>, body: unknown): T {
		const parsed = schema.safeParse(body);
		if (!parsed.success) {
			throw new OAuthProviderError("invalid_token_response", { provider: this.key });
		}
		return parsed.data;
	}

	abstract complete(
		params: OAuthCompleteParams,
	): Promise<{ tokens: OAuthTokenSet; user: OAuthUserInfo }>;
}

/** Adds the "complete" leg contract: fetch the provider's user profile. */
export abstract class NewAbstractOAuthProvider<
	ScopeType extends string,
	TokenType extends BaseToken,
	ProfileType,
>
	extends NewAbstractOAuthProviderBase<ScopeType, TokenType, ProfileType>
	implements OAuthProviderPort
{
	readonly type = "oauth";

	protected abstract fetchPublicProfile(
		accessToken: string,
	): Promise<ProfileType>;
}
