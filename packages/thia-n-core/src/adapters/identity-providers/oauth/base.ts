// import crypto from "crypto";
import { UserAccountProfile } from "core/types";
import { AdapterAccount } from "core/adapter";
import { Account } from "entities";
import { decodeJwt } from "jose";
import { z } from "zod";

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

export abstract class AbstractBaseOAuthProvider<
	ScopeType extends string,
	TokenType extends BaseToken,
	ProfileType,
> {
	public abstract readonly key: string;
	public abstract readonly name: string;
	public abstract readonly type: "oauth" | "oidc";

	protected clientId: string;
	protected clientSecret: string;
	protected redirectUri: string;

	// Minimum scopes required by the application
	protected abstract authorizeEndpoint: string;
	protected abstract tokenEndpoint: string;
	// protected abstract scopes: ScopeType[];
	protected abstract scopeMap: Record<ScopeType, string>;
	protected state = [...crypto.getRandomValues(new Uint8Array(32))]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

	// Minimum scopes required by the application
	protected abstract defaultScopes: ScopeType[];

	// defining zod schemas to use for validation
	protected abstract tokenSchema: z.ZodSchema<TokenType>;
	protected abstract profileSchema: z.ZodSchema<ProfileType>;

	public abstract style: { text: string; bg: string };

	protected constructor(config: OAuthProviderConfig) {
		this.clientId = config.clientId;
		this.clientSecret = config.clientSecret;
		this.redirectUri = config.redirectUri;
	}

	public getState(): string {
		return this.state;
	}

	/**
	 * Transforms and validates scopes using the provider-specific scope map.
	 * @param scopes Additional scopes provided by the user.
	 * @returns A space-separated string of mapped scopes.
	 */
	protected transformScopes(scopes: ScopeType[]): string {
		// Combine minimum and additional scopes
		const combinedScopes = [...this.defaultScopes, ...scopes];
		// Remove duplicates
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

	/**
	 * Creates the authorization URL with combined scopes.
	 * @param additionalScopes Additional scopes provided by the user.
	 * @returns The complete authorization URL.
	 */
	public createAuthorizationUrl(additionalScopes: ScopeType[] = []): string {
		const scopeString = this.transformScopes(additionalScopes);
		const params = new URLSearchParams({
			client_id: this.clientId,
			redirect_uri: this.redirectUri,
			response_type: "code",
			scope: scopeString,
			state: this.state,
			// Add other common parameters as needed
		});
		return `${this.authorizeEndpoint}?${params.toString()}`;
	}

	/**
	 * Creates the authorization URL with combined scopes.
	 *  @param additionalScopes Additional scopes provided by the user.
	 *  @returns {url, state, codeVerifier}.
	 */
	public createAuthorizationRequest(additionalScopes: ScopeType[] = []): {
		url: string;
		state: string;
		codeVerifier?: string;
	} {
		const scopeString = this.transformScopes(additionalScopes);
		const params = new URLSearchParams({
			client_id: this.clientId,
			redirect_uri: this.redirectUri,
			response_type: "code",
			scope: scopeString,
			state: this.state,
			// Add other common parameters as needed
		});
		const url = `${this.authorizeEndpoint}?${params.toString()}`;
		const state = this.getState();

		return { url, state };
	}

	// Handle callback - to be implemented by subclasses
	protected abstract exchangeCodeForTokens(code: string): Promise<TokenType>;

	/**
	 * Handle callback - main authorization flow after redirect from provider
	 * @param code
	 * @returns
	 */
	public async handleRedirect(code: string): Promise<OAuthProviderResponse> {
		const tokens = this.tokenSchema.parse(
			await this.exchangeCodeForTokens(code)
		);
		console.log("TOKENS:", tokens);

		const userProfile = await this.getUserProfile(tokens);
		const adapterAccount = this.convertToAdapterAccount(
			userProfile.accountId,
			tokens
		);
		console.log(
			"HANDLE REDIRECT USER PROFILE:",
			userProfile,
			"ADAPTER ACCOUNT:",
			adapterAccount
		);
		return { userProfile, adapterAccount };
	}

	abstract getUserProfile(tokens: TokenType): Promise<UserAccountProfile>;

	protected convertExpiresInToExpiresAt(expiresIn: number): number {
		return Math.floor(Date.now() / 1000) + expiresIn; // If given as seconds remaining - I also want to store as seconds not miliseconds
	}
	// TODO: Implement refresh tokens

	// protected abstract convertToAdapterAccount(
	// 	providerAccountId: string,
	// 	tokens: Record<string, any>
	// ): Omit<AdapterAccount, "userId">;

	// Standardized converToAdapterAccount function
	protected convertToAdapterAccount(
		providerAccountId: string,
		tokens: TokenType
	): Omit<AdapterAccount, "userId"> {
		const adapterAccount: Omit<AdapterAccount, "userId"> = {
			providerAccountId,
			provider: this.key,
			type: this.type,
			access_token: tokens.access_token,
			token_type: tokens.token_type,
			scope: tokens.scope && tokens.scope,
			expires_at:
				tokens.expires_in &&
				this.convertExpiresInToExpiresAt(tokens.expires_in),
			refresh_token: tokens.refresh_token,
			id_token: tokens.id_token,
			session_state: tokens.session_state,
		};
		return adapterAccount;
	}

	protected abstract convertToUserAccountProfile(
		profile: ProfileType
	): UserAccountProfile;
}

export abstract class AbstractOAuthProvider<
	ScopeType extends string,
	TokenType extends BaseToken,
	ProfileType,
> extends AbstractBaseOAuthProvider<ScopeType, TokenType, ProfileType> {
	readonly type = "oauth";
	/**
	 * How to get user profile
	 * This will vary depending on the provider
	 * @param tokens
	 * @returns
	 */
	async getUserProfile(tokens: TokenType): Promise<UserAccountProfile> {
		// return this.convertToUserProfile(
		// 	await this.fetchPublicProfile(tokens.access_token)
		// );
		// const rawProfile = await this.fetchPublicProfile(tokens.access_token);
		// const profile = this.profileSchema.parse(rawProfile);
		// return this.convertToUserProfile(profile);
		// TODO: this works??
		return this.convertToUserAccountProfile(
			this.profileSchema.parse(
				await this.fetchPublicProfile(tokens.access_token)
			)
		);
	}

	protected abstract fetchPublicProfile(
		accessToken: string
	): Promise<ProfileType>;
}

export abstract class AbstractOIDCProvider<
	ScopeType extends string,
	TokenType extends BaseToken,
	ProfileType,
> extends AbstractBaseOAuthProvider<ScopeType, TokenType, ProfileType> {
	readonly type = "oidc";
	/**
	 * How to get user profile
	 * This will vary depending on the provider
	 * @param tokens
	 * @returns
	 */
	async getUserProfile(tokens: TokenType): Promise<UserAccountProfile> {
		// console.log("OIDC GET USER PROFILE FUNCTION");
		const rawProfile = this.decodeOIDCToken(tokens.id_token);
		// console.log("PROFILE:", rawProfile);
		const profile = this.profileSchema.parse(rawProfile);
		// console.log("PROFILE PARSED:", profile);

		return this.convertToUserAccountProfile(profile);
		// return this.convertToUserAccountProfile(
		// 	this.profileSchema.parse(
		// 		await this.decodeOIDCToken(tokens.id_token)
		// 	)
		// );
	}

	protected decodeOIDCToken(oidcToken: string): ProfileType {
		console.log("OIDCTOKEN:", oidcToken);
		const claims = decodeJwt(oidcToken);
		console.log("CLAIMS:", claims);
		const result = this.profileSchema.parse(claims);
		return result;
	}

	// // This is might be standardized
	// protected abstract decodeOIDCToken(token: string): Promise<ProfileType>;
}

export interface OAuthProviderConfig {
	// name: string; // Unique identifier for the provider
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}

export interface OAuthProviderResponse {
	userProfile: UserAccountProfile;
	adapterAccount: Omit<AdapterAccount, "userId">;
}

export const OIDCBaseTokenSchema = z.object({
	sub: z.string(),
	iss: z.string(),
	aud: z.string(),
	exp: z.number(),
	iat: z.number(),
	email: z.string().email(),
	name: z.string(),
});

// Here we assume that both tokens conform to BaseToken and profiles can be anything.
export type AuthProvider = AbstractBaseOAuthProvider<
	string,
	BaseToken,
	unknown
>;
