// import type { Providers } from "../../application/ports/identity-provider/identity-provider";
import {
	IdentityAssertion,
	IdentityProviderPort,
} from "application/ports/identity-provider";
import { AuthProvider } from "./oauth";

export type ProviderMap = {
	[key: string]: AuthProvider;
};

// TODO: perhaps we need to define a better interface, port for the providers

export const createIdentityManager = (
	providers: ProviderMap
): IdentityProviderPort => {
	const get = (id?: string) => {
		if (!id) return { err: { code: "PROVIDER_NOT_GIVEN" as const } };
		const p = providers[id];
		if (!p) return { err: { code: "PROVIDER_NOT_FOUND" as const } };
		return { p };
	};

	return {
		async beginOAuth(providerId: string) {
			const f = get(providerId);
			if ("err" in f)
				return {
					ok: false,
					error: { code: f.err.code, message: "Provider missing" },
				};
			try {
				const { url, state, codeVerifier } =
					await f.p.createAuthorizationRequest();
				// controller must persist state/codeVerifier in a server session or httpOnly cookie
				return { ok: true, value: { url, state, codeVerifier } };
			} catch (e) {
				return {
					ok: false,
					error: {
						code: "OAUTH_ERROR",
						message: (e as Error).message,
					},
				};
			}
		},

		async completeOAuth(provider, code) {
			const f = get(provider);
			if ("err" in f) return { ok: false, error: f.err.code };
			try {
				const { userProfile, adapterAccount } =
					await f.p.handleRedirect(code);
				const assertion: IdentityAssertion = {
					profile: {
						email: userProfile.email,
						name: userProfile.name,
						avatarUrl: userProfile.image,
					},
					account: {
						provider,
						providerAccountId: adapterAccount.providerAccountId,
					},
				};
				return { ok: true, value: assertion };
			} catch (e) {
				return { ok: false, error: "OAUTH_ERROR" };
			}
		},

		listProviders() {
			// Let each provider expose display meta
			return Object.entries(providers).map(([id, p]) => p.meta());
		},

		// TODO: Woah there, steady on now boy!
		// async signInWithCredentials(creds) {
		// 	const p = providers["credentials"] as any;
		// 	if (!p?.signInWithCredentials)
		// 		return { ok: false, error: "PROVIDER_NOT_FOUND" as const };
		// 	try {
		// 		const { userProfile, adapterAccount } =
		// 			await p.signInWithCredentials(creds);
		// 		return {
		// 			ok: true,
		// 			value: {
		// 				profile: {
		// 					email: userProfile.email,
		// 					name: userProfile.name,
		// 					avatarUrl: userProfile.avatarUrl,
		// 				},
		// 				account: adapterAccount && {
		// 					provider: "credentials",
		// 					providerAccountId: adapterAccount.providerAccountId,
		// 				},
		// 			},
		// 		};
		// 	} catch {
		// 		return { ok: false, error: "CREDENTIALS_INVALID" as const };
		// 	}
		// },

		// async verifyMagicLink(token) {
		// 	const p = providers["magicLink"] as any;
		// 	if (!p?.verifyMagicLink)
		// 		return { ok: false, error: "PROVIDER_NOT_FOUND" as const };
		// 	try {
		// 		const { userProfile } = await p.verifyMagicLink(token);
		// 		return {
		// 			ok: true,
		// 			value: {
		// 				profile: {
		// 					email: userProfile.email,
		// 					name: userProfile.name,
		// 				},
		// 			},
		// 		};
		// 	} catch {
		// 		return { ok: false, error: "TOKEN_INVALID" as const };
		// 	}
		// },

		// async verifyApiToken(token) {
		// 	const p = providers["apiToken"] as any;
		// 	if (!p?.verifyApiToken)
		// 		return { ok: false, error: "PROVIDER_NOT_FOUND" as const };
		// 	try {
		// 		const { userProfile } = await p.verifyApiToken(token);
		// 		return {
		// 			ok: true,
		// 			value: {
		// 				profile: {
		// 					email: userProfile.email,
		// 					name: userProfile.name,
		// 				},
		// 			},
		// 		};
		// 	} catch {
		// 		return { ok: false, error: "TOKEN_INVALID" as const };
		// 	}
		// },
	};
};

// export const SignInSystem = (providers: Providers) => {
//     const oAuthSignIn = async (provider?: string, code?: string) => {
//         try {
//             // Check for provider
//             if (!provider)
//                 throw new ProviderNotGivenError("Provider not specified");

//             const p = providers[provider];
//             if (!p) {
//                 throw new ProviderNotFoundError(provider);
//             }

//             // If no code return authorization url
//             if (!code) {
//                 const url = p.createAuthorizationUrl();
//                 return { type: "redirect", url, state: p.getState() };
//             }

//             // Step 1: OAuth callback (with code)
//             const { userProfile, adapterAccount } =
//                 await p.handleRedirect(code);
//             console.log("userProfile in signin", userProfile);

//             if (!adapterAccount || !userProfile) {
//                 return {
//                     type: "error",
//                     error: new OAuthError("Failed to sign in"),
//                 };
//             }

//             return {
//                 type: "success",
//                 response: {
//                     userProfile,
//                     adapterAccount,
//                 },
//             };
//         } catch (error) {
//             // console.log(error);
//             return { type: "error", error };
//         }
//     };
//     return {
//         signIn: async (provider?: string, code?: string) => {
//             if (provider) {
//                 return oAuthSignIn(provider, code);
//             } else {
//                 return {
//                     type: "error",
//                     error: new ProviderNotGivenError("Provider not specified"),
//                 };
//             }
//         },
//     };
// };
