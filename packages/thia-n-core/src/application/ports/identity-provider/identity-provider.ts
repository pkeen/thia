import {
	OAuthError,
	ProviderNotFoundError,
	ProviderNotGivenError,
	SignInError,
} from "entities/error";
// import { AdapterAccount } from "./adapter";
import { Account, ProviderType } from "entities";
import { AuthProvider } from "./oauth";
import { Result } from "entities/utilities";
// import { ProviderMeta } from "application/presentation/provider-meta";

// export type ProviderKind =
// 	| "oauth"
// 	| "oidc"
// 	| "credentials"
// 	| "magic_link"
// 	| "api_token"
// 	| "passkey";

export type ProviderId = string;

export type ProviderMeta = {
	id: ProviderId;
	label: string;
	type: ProviderType;
	style: {
		text: string;
		bg: string;
	};
	brandColor?: string; // optional UI sugar
	iconUrl?: string; // optional UI sugar
};

export interface UserAccountProfile {
	accountId: string;
	name?: string | null;
	email: string;
	image?: string | null;
}

export interface AdapterAccount extends Account {}

// export type RedirectResult = {
// 	type: "redirect";
// 	url: string;
// 	state?: string;
// };

// export type SuccessResult = {
// 	type: "success";
// 	response: OAuthProviderResponse;
// };

// export type ErrorResult = {
// 	type: "error";
// 	error: SignInError;
// };

// export interface OAuthProviderResponse {
// 	userProfile: UserAccountProfile;
// 	adapterAccount: Omit<Account, "userId">;
// }

// export type SignInResult = SuccessResult | ErrorResult | RedirectResult;

// export interface SignInParams {
// 	// type: "oauth" | "credentials";
// 	provider?: string;
// 	credentials?: any;
// 	code?: string;
// }

// export const SignInSystem = (providers: Providers) => {
// 	const oAuthSignIn = async (provider?: string, code?: string) => {
// 		try {
// 			// Check for provider
// 			if (!provider)
// 				throw new ProviderNotGivenError("Provider not specified");

// 			const p = providers[provider];
// 			if (!p) {
// 				throw new ProviderNotFoundError(provider);
// 			}

// 			// If no code return authorization url
// 			if (!code) {
// 				const url = p.createAuthorizationUrl();
// 				return { type: "redirect", url, state: p.getState() };
// 			}

// 			// Step 1: OAuth callback (with code)
// 			const { userProfile, adapterAccount } =
// 				await p.handleRedirect(code);
// 			console.log("userProfile in signin", userProfile);

// 			if (!adapterAccount || !userProfile) {
// 				return {
// 					type: "error",
// 					error: new OAuthError("Failed to sign in"),
// 				};
// 			}

// 			return {
// 				type: "success",
// 				response: {
// 					userProfile,
// 					adapterAccount,
// 				},
// 			};
// 		} catch (error) {
// 			// console.log(error);
// 			return { type: "error", error };
// 		}
// 	};
// 	return {
// 		signIn: async (provider?: string, code?: string) => {
// 			if (provider) {
// 				return oAuthSignIn(provider, code);
// 			} else {
// 				return {
// 					type: "error",
// 					error: new ProviderNotGivenError("Provider not specified"),
// 				};
// 			}
// 		},
// 	};
// };

// export interface IndentityProvider {
// 	// oAuthSignIn(provider?: string, code?: string): Promise<SignInResult>;
// 	signIn(provider?: string, code?: string): Promise<SignInResult>;
// }

// stable contract the use-case depends on
export type IdentityAssertion = {
	profile: { email: string; name?: string; avatarUrl?: string };
	account?: AdapterAccount;
};

export type ProviderError =
	| "PROVIDER_NOT_GIVEN"
	| "PROVIDER_NOT_FOUND"
	| "OAUTH_ERROR"
	| "CREDENTIALS_INVALID"
	| "TOKEN_INVALID"
	| "UNKNOWN";

// export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface IdentityProviderPort {
	beginOAuth(
		provider: string
	): Promise<
		Result<
			{ url: string; state?: string; codeVerifier?: string },
			{ code: string; message?: string }
		>
	>;
	completeOAuth(
		provider: string,
		code: string
	): Promise<Result<IdentityAssertion, ProviderError>>;

	listProviders(): ProviderMeta[]; // this is for dynamic ui
	// Optional
	signInWithCredentials(creds: {
		email: string;
		password: string;
	}): Promise<Result<IdentityAssertion, ProviderError>>;
	verifyMagicLink(
		token: string
	): Promise<Result<IdentityAssertion, ProviderError>>;
	verifyApiToken(
		token: string
	): Promise<Result<IdentityAssertion, ProviderError>>;
}
