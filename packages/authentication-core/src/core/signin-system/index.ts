import { AuthState, UserAccountProfile } from "../types/index";
import {
	SignInError,
	ProviderNotFoundError,
	ProviderNotGivenError,
	OAuthError,
} from "../error";
import { AdapterAccount } from "core/adapter";
import { AuthProvider } from "core/providers";

export type RedirectResult = {
	type: "redirect";
	url: string;
	state?: string;
};

export type SuccessResult = {
	type: "success";
	response: OAuthProviderResponse;
};

export type ErrorResult = {
	type: "error";
	error: SignInError;
};

export interface OAuthProviderResponse {
	userProfile: UserAccountProfile;
	adapterAccount: Omit<AdapterAccount, "userId">;
}

export type SignInResult = SuccessResult | ErrorResult | RedirectResult;

export type Providers = {
	[key: string]: AuthProvider;
};

export interface SignInParams {
	// type: "oauth" | "credentials";
	provider?: string;
	credentials?: any;
	code?: string;
}

export const SignInSystem = (providers: Providers) => {
	const oAuthSignIn = async (provider?: string, code?: string) => {
		try {
			// Check for provider
			if (!provider)
				throw new ProviderNotGivenError("Provider not specified");

			const p = providers[provider];
			if (!p) {
				throw new ProviderNotFoundError(provider);
			}

			// If no code return authorization url
			if (!code) {
				const url = p.createAuthorizationUrl();
				return { type: "redirect", url, state: p.getState() };
			}

			// Step 1: OAuth callback (with code)
			const { userProfile, adapterAccount } = await p.handleRedirect(
				code
			);
			console.log("userProfile in signin", userProfile);

			if (!adapterAccount || !userProfile) {
				return {
					type: "error",
					error: new OAuthError("Failed to sign in"),
				};
			}

			return {
				type: "success",
				response: {
					userProfile,
					adapterAccount,
				},
			};
		} catch (error) {
			// console.log(error);
			return { type: "error", error };
		}
	};
	return {
		signIn: async (provider?: string, code?: string) => {
			if (provider) {
				return oAuthSignIn(provider, code);
			} else {
				return {
					type: "error",
					error: new ProviderNotGivenError("Provider not specified"),
				};
			}
		},
	};
};

export interface SignInSystem {
	// oAuthSignIn(provider?: string, code?: string): Promise<SignInResult>;
	signIn(provider?: string, code?: string): Promise<SignInResult>;
}
