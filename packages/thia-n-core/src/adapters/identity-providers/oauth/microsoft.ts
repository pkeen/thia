import {
	AbstractOIDCProvider,
	OAuthProviderConfig,
	OIDCBaseTokenSchema,
	BaseTokenSchema,
	OAuthProviderResponse,
} from "./base";
import { z } from "zod";
import { UserAccountProfile } from "core/types";
import { AdapterAccount } from "core/adapter";

type ScopeType = "user.read" | "profile" | "openid" | "email";

// interface MicrosoftTokens {
// 	token_type: string;
// 	scope: string;
// 	expires_in: number;
// 	ext_expires_in: number;
// 	access_token: string;
// 	id_token: string;
// }

const MicrosftTokenSchema = BaseTokenSchema.extend({
	id_token: z.string(),
	ext_expires_in: z.number(),
	expires_in: z.number(),
});

// Infer the TypeScript type from the schema
type MicrosftToken = z.infer<typeof MicrosftTokenSchema>;

const MicrosoftOIDCTokenSchema = OIDCBaseTokenSchema.extend({
	oid: z.string(),
	tid: z.string(),
	aio: z.string(),
	preferred_username: z.string(),
	nbf: z.number(),
});

// Infer the TypeScript type from the schema
type MicrosoftOIDCToken = z.infer<typeof MicrosoftOIDCTokenSchema>;

// type MicrosoftUserProfile = {
// 	id: string;
// 	preferred_username: string;
// 	name: string;
// 	email: string;
// 	oid: string;
// 	tid: string;
// 	aio: string;
// };

// const MicrosoftOIDCTokenSchema = z.object({
// 	sub: z.string(),
// 	ver: z.string(),
// 	iss: z.string(),
// 	aud: z.string(),
// 	exp: z.number(),
// 	iat: z.number(),
// 	nbf: z.number(),
// 	name: z.string(),
// 	preferred_username: z.string(),
// 	oid: z.string(),
// 	email: z.string().email(),
// 	tid: z.string(),
// 	aio: z.string(),
// });

export class Microsoft extends AbstractOIDCProvider<
	ScopeType,
	MicrosftToken,
	MicrosoftOIDCToken
> {
	readonly key = "microsoft";
	readonly name = "Microsoft";

	protected authorizeEndpoint =
		"https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
	protected tokenEndpoint =
		"https://login.microsoftonline.com/common/oauth2/v2.0/token";
	protected scopeMap = {
		"user.read": "User.Read",
		profile: "profile",
		openid: "openid",
		email: "email",
	};
	protected defaultScopes: ScopeType[] = [
		"user.read",
		"profile",
		"openid",
		"email",
	];
	protected tokenSchema = MicrosftTokenSchema;
	protected profileSchema = MicrosoftOIDCTokenSchema;

	readonly style = { text: "#fff", bg: "#0072c6" };

	constructor(config: OAuthProviderConfig) {
		super(config);
	}

	public async exchangeCodeForTokens(code: string): Promise<MicrosftToken> {
		const tokenUrl = new URL(this.tokenEndpoint);
		const body = new URLSearchParams();
		body.append("client_id", this.clientId);
		body.append("client_secret", this.clientSecret); // **Only include if on backend**
		body.append("code", code);
		body.append("redirect_uri", this.redirectUri);
		body.append("grant_type", "authorization_code");

		// tokenUrl.searchParams.set("response_type", "code id_token");
		const headers = new Headers();
		headers.append("Content-Type", "application/x-www-form-urlencoded");

		const response = await fetch(tokenUrl.toString(), {
			method: "POST",
			headers,
			body: body.toString(),
		});

		return response.json();
	}

	protected convertToUserAccountProfile(
		profile: MicrosoftOIDCToken
	): UserAccountProfile {
		return {
			accountId: profile.sub.toString(),
			name: profile.name,
			email: profile.email,
			// image: profile.picture,
		};
	}
}

// export class Microsoft extends AbstractOAuthProvider<
// 	ScopeType,
// 	MicrosoftOAuthToken,
// 	MicrosoftOIDCToken
// > {
// 	readonly type = "oauth";
// 	readonly key = "microsoft";
// 	readonly name = "Microsoft";
// 	protected authorizeEndpoint =
// 		"https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
// 	protected tokenEndpoint =
// 		"https://login.microsoftonline.com/common/oauth2/v2.0/token";
// 	protected scopeMap = {
// 		"user.read": "User.Read",
// 		profile: "profile",
// 		openid: "openid",
// 		email: "email",
// 	};
// 	protected defaultScopes: ScopeType[] = [
// 		"user.read",
// 		"profile",
// 		"openid",
// 		"email",
// 	];

// 	constructor(config: OAuthProviderConfig) {
// 		super(config);
// 	}

// 	public async exchangeCodeForTokens(
// 		code: string
// 	): Promise<MicrosoftOAuthToken> {
// 		const tokenUrl = new URL(this.tokenEndpoint);
// 		const body = new URLSearchParams();
// 		body.append("client_id", this.clientId);
// 		body.append("client_secret", this.clientSecret); // **Only include if on backend**
// 		body.append("code", code);
// 		body.append("redirect_uri", this.redirectUri);
// 		body.append("grant_type", "authorization_code");

// 		// tokenUrl.searchParams.set("response_type", "code id_token");
// 		const headers = new Headers();
// 		headers.append("Content-Type", "application/x-www-form-urlencoded");
// 		// console.log("exchange code for TOKEN URL:", tokenUrl.toString());

// 		console.log("Request body:", body.toString());

// 		const response = await fetch(tokenUrl.toString(), {
// 			method: "POST",
// 			headers,
// 			body: body.toString(),
// 		});

// 		if (!response.ok) {
// 			const errorResponse = await response.json();
// 			console.error("Token exchange failed:", errorResponse);
// 			throw new Error(
// 				`Token request failed: ${errorResponse.error_description}`
// 			);
// 		}

// 		const result = MicrosoftOauthTokenSchema.safeParse(
// 			await response.json()
// 		);

// 		if (result.success) {
// 			return result.data;
// 		} else {
// 			// Handle validation errors
// 			throw new Error("Invalid OIDC Token: " + result.error.message);
// 		}
// 	}

// 	async handleRedirect(code: string): Promise<OAuthProviderResponse> {
// 		const tokens = await this.exchangeCodeForTokens(code);
// 		console.log("TOKENS:", tokens);

// 		const profile = await this.getUserProfile(tokens);
// 		console.log("PROFILE:", profile);
// 		const adapterAccount = this.convertToAdapterAccount(profile.id, tokens);
// 		console.log("ADAPTER ACCOUNT:", adapterAccount);
// 		return { userProfile: profile, adapterAccount };
// 	}

// 	async getUserProfile(tokens: MicrosoftOAuthToken): Promise<UserProfile> {
// 		const profile = this.convertToUserProfile(
// 			this.decodeOIDCToken(tokens.id_token)
// 		);
// 		return profile;

// 		// There is always going to be slightly different ways to get this depending on provider
// 	}

// 	private decodeOIDCToken(oidcToken: string): MicrosoftOIDCToken {
// 		const claims = decodeJwt(oidcToken);
// 		const result = MicrosoftOIDCTokenSchema.safeParse(claims);

// 		if (result.success) {
// 			return result.data;
// 		} else {
// 			// Handle validation errors
// 			throw new Error("Invalid OIDC Token: " + result.error.message);
// 		}
// 	}

// 	// private async getOAuthProfile(
// 	// 	accessToken: string
// 	// ): Promise<MicrosoftUserProfile> {
// 	// 	const graphEndpoint = "https://graph.microsoft.com/v1.0/me";

// 	// 	const response = await fetch(graphEndpoint, {
// 	// 		method: "GET",
// 	// 		headers: {
// 	// 			Authorization: `Bearer ${accessToken}`,
// 	// 			Accept: "application/json",
// 	// 		},
// 	// 	});

// 	// 	if (!response.ok) {
// 	// 		const errorResponse = await response.json();
// 	// 		console.error("Failed to fetch user profile:", errorResponse);
// 	// 		throw new Error(
// 	// 			`Failed to fetch user profile: ${errorResponse.error.message}`
// 	// 		);
// 	// 	}

// 	// 	return await response.json();
// 	// }

// 	private convertToUserProfile(profile: MicrosoftOIDCToken): UserProfile {
// 		return {
// 			id: profile.sub.toString(),
// 			name: profile.name,
// 			email: profile.email,
// 			// image: profile.picture,
// 		};
// 	}

// 	public convertToAdapterAccount(
// 		providerAccountId: string,
// 		tokens: MicrosoftOAuthToken
// 	): Omit<AdapterAccount, "userId"> {
// 		// TODO: maybe this should be a generalized function
// 		// TODO: WHY AM I OMITTING USER ID AGAIN?

// 		const adapterAccount: Omit<AdapterAccount, "userId"> = {
// 			providerAccountId,
// 			provider: this.key,
// 			type: this.type,
// 			refresh_token: tokens.refresh_token,
// 			access_token: tokens.access_token,
// 			expires_at: this.convertExpiresInToExpiresAt(tokens.expires_in),
// 			token_type: tokens.token_type,
// 			scope: tokens.scope,
// 			id_token: tokens.id_token,
// 			// session_state: tokens.session_state,
// 		};
// 		return adapterAccount;
// 	}

// 	// TODO: Support microsoft photos
// 	// /**
// 	//  * Retrieves the user's profile picture URL from Microsoft Graph API.
// 	//  * @param accessToken The access token obtained from the token exchange.
// 	//  * @returns A Promise that resolves to the profile picture URL or null if not available.
// 	//  */
// 	// private async getProfilePhotoUrl(
// 	// 	accessToken: string
// 	// ): Promise<string | null> {
// 	// 	const photoBlob = await this.getProfilePhotoBlob(accessToken);
// 	// 	if (photoBlob) {
// 	// 		const dataUrl = await this.bufferToDataURL(photoBlob, "image/jpeg");
// 	// 		return dataUrl;
// 	// 		// Store 'dataUrl' in your database
// 	// 	} else {
// 	// 		return null;
// 	// 	}

// 	// 	// const graphPhotoEndpoint = "https://graph.microsoft.com/v1.0/me/photo";

// 	// 	// const response = await fetch(graphPhotoEndpoint, {
// 	// 	// 	method: "GET",
// 	// 	// 	headers: {
// 	// 	// 		Authorization: `Bearer ${accessToken}`,
// 	// 	// 		Accept: "application/json",
// 	// 	// 	},
// 	// 	// });

// 	// 	// if (response.status === 200) {
// 	// 	// 	const photoData = await response.json();
// 	// 	// 	console.log("PHOTO DATA:", photoData);
// 	// 	// 	return photoData["@odata.mediaReadLink"] || photoData.contentUrl;
// 	// 	// } else if (response.status === 404) {
// 	// 	// 	console.warn("User does not have a profile photo.");
// 	// 	// 	return null;
// 	// 	// } else {
// 	// 	// 	const error = await response.json();
// 	// 	// 	console.error("Error fetching profile photo:", error);
// 	// 	// 	throw new Error(error.error.message);
// 	// 	// }
// 	// }

// 	// async getProfilePhotoBlob(accessToken: string): Promise<Blob | null> {
// 	// 	const graphPhotoValueEndpoint =
// 	// 		"https://graph.microsoft.com/v1.0/me/photo/$value";

// 	// 	const response = await fetch(graphPhotoValueEndpoint, {
// 	// 		method: "GET",
// 	// 		headers: {
// 	// 			Authorization: `Bearer ${accessToken}`,
// 	// 			Accept: "image/jpeg", // Adjust based on expected image format
// 	// 		},
// 	// 	});

// 	// 	if (response.status === 200) {
// 	// 		const blob = await response.blob();
// 	// 		console.log("BLOB:", blob);
// 	// 		return blob;
// 	// 	} else if (response.status === 404) {
// 	// 		console.warn("User does not have a profile photo.");
// 	// 		return null;
// 	// 	} else {
// 	// 		const error = await response.json();
// 	// 		console.error("Error fetching profile photo:", error);
// 	// 		throw new Error(error.error.message);
// 	// 	}
// 	// }

// 	// /**
// 	//  * Converts a Blob to a Data URL.
// 	//  * @param blob The Blob object to convert.
// 	//  * @returns A Promise that resolves to the Data URL string.
// 	//  */
// 	// private async blobToDataURL(blob: Blob): Promise<string> {
// 	// 	return new Promise((resolve, reject) => {
// 	// 		const reader = new FileReader();
// 	// 		reader.onloadend = () => {
// 	// 			resolve(reader.result as string);
// 	// 		};
// 	// 		reader.onerror = reject;
// 	// 		reader.readAsDataURL(blob);
// 	// 	});
// 	// }

// 	// // Convert Buffer to Data URL (Server-Side)
// 	// private bufferToDataURL(buffer: Buffer, mimeType: string): string {
// 	// 	const base64 = buffer.toString("base64");
// 	// 	return `data:${mimeType};base64,${base64}`;
// 	// }
// }
