import {
	AuthResult,
	AuthStrategy,
	Logger,
	// KeyCards,
	AuthState,
	DatabaseUser,
	UserPublic as User,
} from "../types";
import { AuthProvider } from "../providers";
import { Adapter } from "../adapter";
import { IAuthManager, AuthNCallbacks } from "./types";
import { SignInSystem, type SignInParams } from "../signin-system";
import { KeyCardMissingError, UserNotFoundError } from "core/error";

export function AuthManager<Extra>(
	userRegistry: Adapter,
	authStrategy: AuthStrategy,
	providers: AuthProvider[],
	logger: Logger,
	callbacks: AuthNCallbacks<Extra>
): IAuthManager<Extra> {
	const providersMap = Object.fromEntries(
		providers.map((p) => [p.key, p])
	) as Record<string, AuthProvider>;
	const signInSystem = SignInSystem(providersMap);

	const sanitizeUser = (dbUser: DatabaseUser): User => ({
		id: dbUser.id,
		name: dbUser.name,
		email: dbUser.email,
		image: dbUser.image,
	});

	const enrichUser = async (user: User): Promise<User & Extra> => {
		if (!callbacks.augmentUserData) return user as User & Extra;

		const authZData = await callbacks.augmentUserData(user.id);
		return { ...user, ...authZData };
	};
	// const enrich = callbacks.enrichUser;

	return {
		login: async ({ provider, code }) => {
			try {
				const signInResult = await signInSystem.signIn(provider, code);

				if (!signInResult) {
					throw new Error("Unknown sign in result type");
				}

				// 2) Deal with error or redirect result types
				if (signInResult.type === "error") {
					logger.error("Sign in failed", {
						error: signInResult.error,
					});
					return {
						type: "error",
						error: signInResult.error,
					} satisfies AuthResult<Extra>;
				} else if (signInResult.type === "redirect") {
					logger.info("Redirecting to external provider", {
						provider,
					});
					return {
						type: "redirect",
						url: signInResult.url,
						state: signInResult.state,
					} satisfies AuthResult<Extra>;
				}

				const { userProfile, adapterAccount } = signInResult.response;
				let user = await userRegistry.getUserByEmail(userProfile.email);

				if (!user) {
					user = await userRegistry.createUser(userProfile);
					await userRegistry.createAccountForUser(
						user,
						adapterAccount
					);
					await callbacks.onUserCreated?.(user);
				} else {
					const account = await userRegistry.getAccount(
						adapterAccount.provider,
						adapterAccount.providerAccountId
					);
					if (account)
						await userRegistry.updateAccount(adapterAccount);
					else
						await userRegistry.createAccountForUser(
							user,
							adapterAccount
						);
				}

				const publicUser = sanitizeUser(user);
				const enrichedUser = await enrichUser(publicUser);
				const keyCards = await authStrategy.createKeyCards(
					enrichedUser
				);

				return {
					type: "success",
					authState: {
						authenticated: true,
						keyCards,
						user: enrichedUser,
					},
				} satisfies AuthResult<Extra>;
			} catch (error) {
				logger.error("Error during login", { error });
				return { type: "error", error } satisfies AuthResult<Extra>;
			}
		},

		validate: async (keyCards): Promise<AuthResult<Extra>> => {
			if (!keyCards)
				return {
					type: "error",
					error: new KeyCardMissingError("No keycards found"),
				};

			const result = await authStrategy.validate(keyCards);

			if (result.type === "success") {
				return {
					type: "success",
					authState: {
						authenticated: true,
						keyCards: result.authState.keyCards,
						user: result.authState.user as User & Extra,
					},
				};
			}

			if (result.type === "refresh") {
				const dbUser = await userRegistry.getUser(
					result.authState.user.id
				);
				if (!dbUser)
					return {
						type: "error",
						error: new UserNotFoundError("User not found"),
					};

				const publicUser = sanitizeUser(dbUser);
				const enrichedUser = await enrichUser(publicUser);
				const keyCards = await authStrategy.createKeyCards(
					enrichedUser
				);

				return {
					type: "refresh",
					authState: {
						user: enrichedUser,
						authenticated: true,
						keyCards,
					},
				};
			}

			return result as AuthResult<Extra>;
		},

		signOut: async (keyCards): Promise<AuthState<Extra>> => {
			if (!keyCards)
				return {
					authenticated: false,
					user: null,
					keyCards: null,
					error: null,
				};
			return (await authStrategy.logout(keyCards)) as AuthState<Extra>;
		},

		listProviders: () =>
			providers.map((p) => ({
				name: p.name,
				key: p.key,
				style: p.style,
			})),

		callbacks,
	};
}
