import {
	OAuthProviderConfig,
	BaseTokenSchema,
	convertTokenToCamelCase,
	NewAbstractOAuthProviderBase,
} from "./oauth-kit";
import { z } from "zod";
import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from "jose";
import {
	OAuthCompleteParams,
	OAuthProviderError,
	OAuthProviderPort,
	OAuthTokenSet,
	OAuthUserInfo,
} from "../../application/ports/oauth-provider-port";
import { timingSafeEqual } from "../../application/oauth/pkce";

type ScopeType = "openid" | "email" | "profile";

const GoogleTokensSchema = BaseTokenSchema.extend({
	scope: z.string(),
	id_token: z.string(),
});

/** Claims read from a verified Google ID token. */
const GoogleIdTokenClaimsSchema = z.object({
	sub: z.string().min(1),
	email: z.string().email().optional(),
	email_verified: z.boolean().optional(),
	name: z.string().optional(),
	picture: z.string().optional(),
	nonce: z.string().optional(),
	azp: z.string().optional(),
});

type GoogleIdTokenClaims = z.infer<typeof GoogleIdTokenClaimsSchema>;
type GoogleTokens = z.infer<typeof GoogleTokensSchema>;

/** From https://accounts.google.com/.well-known/openid-configuration */
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

export interface GoogleConfig extends OAuthProviderConfig {
	/**
	 * Key source for ID token signatures. Defaults to Google's published JWKS
	 * (fetched and cached by jose); tests inject a local key set.
	 */
	jwks?: JWTVerifyGetKey;
}

export class Google
	extends NewAbstractOAuthProviderBase<ScopeType, GoogleTokens, GoogleIdTokenClaims>
	implements OAuthProviderPort
{
	readonly key = "google";
	readonly name = "Google";
	readonly oidc = true;

	protected authorizeEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
	protected tokenEndpoint = "https://oauth2.googleapis.com/token";

	protected scopeMap = {
		openid: "openid",
		email: "email",
		profile: "profile",
	};
	protected defaultScopes: ScopeType[] = ["openid", "email", "profile"];

	readonly style = { text: "#3c4043", bg: "#fff" };

	private jwks: JWTVerifyGetKey;

	constructor(config: GoogleConfig) {
		super(config);
		this.jwks = config.jwks ?? createRemoteJWKSet(new URL(GOOGLE_JWKS_URI));
	}

	public async complete(
		params: OAuthCompleteParams,
	): Promise<{ tokens: OAuthTokenSet; user: OAuthUserInfo }> {
		const raw = this.parseTokens(
			GoogleTokensSchema,
			await this.exchangeAuthorizationCode(params),
		);
		const claims = await this.verifyIdToken(raw.id_token, params.nonce);
		const tokens: OAuthTokenSet = {
			...convertTokenToCamelCase(raw),
			idToken: raw.id_token,
			claims,
		};
		return { tokens, user: this.convertToOAuthUserInfo(claims) };
	}

	/**
	 * OIDC Core §3.1.3.7 validation of the ID token: RS256 signature against
	 * Google's keys, issuer, audience (and azp when there are several
	 * audiences), expiry, and the nonce this login sent.
	 */
	protected async verifyIdToken(
		idToken: string,
		expectedNonce: string | undefined,
	): Promise<GoogleIdTokenClaims> {
		const fail = () =>
			new OAuthProviderError("id_token_invalid", { provider: this.key });
		// begin() always sends a nonce for Google, so one must come back.
		if (!expectedNonce) throw fail();

		let payload: Record<string, unknown>;
		try {
			({ payload } = await jwtVerify(idToken, this.jwks, {
				algorithms: ["RS256"],
				issuer: GOOGLE_ISSUERS,
				audience: this.clientId,
				requiredClaims: ["sub", "iat", "exp"],
			}));
		} catch {
			throw fail();
		}

		const parsed = GoogleIdTokenClaimsSchema.safeParse(payload);
		if (!parsed.success) throw fail();
		const claims = parsed.data;

		if (!claims.nonce || !timingSafeEqual(claims.nonce, expectedNonce)) throw fail();
		if (Array.isArray(payload.aud) && payload.aud.length > 1 && claims.azp !== this.clientId) {
			throw fail();
		}
		return claims;
	}

	protected convertToOAuthUserInfo(claims: GoogleIdTokenClaims): OAuthUserInfo {
		return {
			provider: "google",
			providerAccountId: claims.sub,
			name: claims.name,
			email: claims.email,
			emailVerified: claims.email_verified,
			image: claims.picture,
		};
	}
}
