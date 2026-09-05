import { z } from "zod";
import {
	OAuthBeginParams,
	OAuthBeginResult,
	OAuthCompleteParams,
	OAuthProviderPort,
	OAuthTokenSet,
	OAuthUserInfo,
} from "../../application/ports/oauth-provider-port";

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
		const scopeString = this.transformScopes(params.scopes || []);
		const qp = new URLSearchParams({
			client_id: this.clientId,
			redirect_uri: this.redirectUri, // provider owns this
			response_type: "code",
			scope: scopeString,
			state: params.state, // orchestrator supplies
			...(params.nonce ? { nonce: params.nonce } : {}),
			...(params.codeChallenge
				? {
						code_challenge: params.codeChallenge,
						code_challenge_method: "S256",
					}
				: {}),
			...(params.extraAuthParams ?? {}),
		});

		return {
			authorizationUrl: `${this.authorizeEndpoint}?${qp.toString()}`,
		};
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
