export * from "./credentials/index.types";
export * from "./oauth/index.types";
// export * from "./email/index.types";
// export * from "./oidc/index.types";

export type ProviderType = "oidc" | "oauth" | "email" | "credentials";
// | WebAuthnProviderType;

// export interface CommonProviderOptions {
// 	/**
// 	 * Uniquely identifies the provider in {@link AuthConfig.providers}
// 	 * It's also part of the URL
// 	 */
// 	id: string;
// 	/**
// 	 * The provider name used on the default sign-in page's sign-in button.
// 	 * For example if it's "Google", the corresponding button will say:
// 	 * "Sign in with Google"
// 	 */
// 	name: string;
// 	/** See {@link ProviderType} */
// 	type: ProviderType;
// }

// export interface OAuthProviderOptions extends CommonProviderOptions {
// 	clientId: string;
// 	clientSecret?: string;
// 	/** The URL to the provider's sign-in page */
// 	signinUrl: string;
// 	/** The URL to the provider's sign-out page */
// 	signoutUrl: string;
// 	authorizationOptions?: {
// 		state: string;
// 		codeVerifier: string;
// 		scope: string;
// 		prompt: string;
// 		access_type: string;
// 	};
// 	// all OAuth Providers have an authorizationUrl - this might be the same as the signinUrl we said above but authorizationUrl is a better name
// 	authorizationEndpoint: string;
// 	tokenEndpoint: string;
// 	redirectUri: string;
// 	createAuthorizationUrl: (authorizationOptions: {
// 		state: string;
// 		codeVerifier: string;
// 		scope: string;
// 		prompt: string;
// 		access_type: string;
// 	}) => URL;
// }

// export type CredentialsProviderOptions = CommonProviderOptions & {
// 	id: "credentials";
// 	name: "credentials";
// 	type: "credentials";
// 	signinCredentials: {
// 		email: string;
// 		password: string;
// 	};
// 	signupCredentials: {
// 		email: string;
// 		password: string;
// 		name?: string;
// 	};
// };

// export interface Provider {
// 	type: ProviderType;
// 	options: ProviderOptions;
// 	login: () => Promise<void>;
// }

// export type ProviderOptions = OAuthProviderOptions | CredentialsProviderOptions;
