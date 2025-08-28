// import {
// 	AuthResult,
// 	AuthStrategy,
// 	Logger,
// 	AuthConfig,
// 	KeyCards,
// 	AuthState,
// 	AuthNCallbacks,
// 	DatabaseUser,
// } from "core/types";
// import { SignInSystem, type SignInParams } from "../signin-system";
// import { AuthProvider } from "core/providers";
// import { Adapter as UserRegistry, AdapterUser } from "../adapter";
// import { JwtStrategyFn } from "../session-strategy";
// import { DisplayProvider, User } from "core/auth-system";
// import { createLogger } from "@pete_keen/logger";
// import { KeyCardMissingError, UserNotFoundError } from "core/error";

// export function AuthManager<E>(
// 	userRegistry: UserRegistry,
// 	authStrategy: AuthStrategy,
// 	providers: AuthProvider[],
// 	logger: Logger,
// 	callbacks?: AuthNCallbacks<E>
// ): IAuthManager<E> {
// 	const providersMap = providers.reduce((acc, provider) => {
// 		acc[provider.key] = provider;
// 		return acc;
// 	}, {} as Record<string, AuthProvider>);
// 	const signInSystem = SignInSystem(providersMap);

// 	logger.info("Auth system initialized", {
// 		strategy: authStrategy.name,
// 		adapter: userRegistry.name,
// 	});

// 	const sanitizeUser = (dbUser: DatabaseUser): User => {
// 		return {
// 			id: dbUser.id,
// 			name: dbUser.name,
// 			email: dbUser.email,
// 			image: dbUser.image,
// 		};
// 	};

// 	return {
// 		login: async (signInParams: SignInParams) => {
// 			const { provider, code } = signInParams;
// 			try {
// 				// 1) Authenticate with external provider (OAuth, etc.)
// 				logger.info("Authenticating with provider", {
// 					provider,
// 				});
// 				const signInResult = await signInSystem.signIn(provider, code);

// 				// 2) Deal with error or redirect result types
// 				if (signInResult.type === "error") {
// 					logger.error("Sign in failed", {
// 						error: signInResult.error,
// 					});
// 					return {
// 						type: "error",
// 						error: signInResult.error,
// 					} satisfies AuthResult<E>;
// 				} else if (signInResult.type === "redirect") {
// 					logger.info("Redirecting to external provider", {
// 						provider,
// 					});
// 					return {
// 						type: "redirect",
// 						url: signInResult.url,
// 						state: signInResult.state,
// 					} satisfies AuthResult<E>;
// 				}

// 				if (signInResult.type !== "success") {
// 					throw new Error("Unknown sign in result type");
// 				}

// 				const { userProfile, adapterAccount } = signInResult.response;
// 				// 4): Check if user already exists - and deal with account user creation
// 				let user = await userRegistry.getUserByEmail(userProfile.email);
// 				// Step 2a: if not existing user create new one
// 				// TODO can this be cleaned up?
// 				if (!user) {
// 					logger.debug("User not found, creating new user", {
// 						email: userProfile.email,
// 					});
// 					user = await userRegistry.createUser({
// 						email: userProfile.email,
// 						name: userProfile.name,
// 						image: userProfile.image,
// 					});
// 					// TODO: create user account if not exists
// 					await userRegistry.createAccountForUser(
// 						user,
// 						adapterAccount
// 					);
// 					// Callback for user creation
// 					if (callbacks?.onUserCreated) {
// 						await callbacks.onUserCreated(user);
// 					}
// 				} else {
// 					// there is a user
// 					logger.debug("User found", {
// 						email: userProfile.email,
// 					});
// 					// Step 2b: Select account where user id matches and provider matches
// 					const account = await userRegistry.getAccount(
// 						adapterAccount.provider,
// 						adapterAccount.providerAccountId
// 					);

// 					// create user account if not exists
// 					if (account) {
// 						logger.debug("Account found", {
// 							provider: account.provider,
// 							providerAccountId: account.providerAccountId,
// 						});
// 						await userRegistry.updateAccount(adapterAccount);
// 					}

// 					// create user account if not exists
// 					if (!account) {
// 						logger.debug(
// 							"Account not found, creating new account",
// 							{
// 								provider: adapterAccount.provider,
// 								providerAccountId:
// 									adapterAccount.providerAccountId,
// 							}
// 						);
// 						await userRegistry.createAccountForUser(
// 							user,
// 							adapterAccount
// 						);
// 					}

// 					// TODO: should we also add a authz role if not exists?
// 					// I'm leaning towards probably yes
// 					// if not we should at least always assume the lowest level of access when role data not found
// 					// TODO: create default user authorization roles/permissions
// 					// const userRoles = await authz.getRolesForUser(user.id);
// 				}
// 				const sanitizedUser = sanitizeUser(user);
// 				// 3) Enrich token or session data with roles/permissions (if authz is provided)
// 				// This is pointless in a db session strategy though
// 				// adding the if statment makes it only for jwt
// 				// this should perhaps be moved into the JWT Strategy as is only relevant there
// 				const enrichedUser = await callbacks.enrichUser(sanitizedUser);
// 				// TODO fix type mismathc

// 				// 4) Create the session (JWT or server-session) with user + extra data
// 				const keyCards = await authStrategy.createKeyCards(user);

// 				return {
// 					type: "success",
// 					authState: {
// 						authenticated: true,
// 						keyCards,
// 						user: enrichedUser,
// 					},
// 				} satisfies AuthResult<E>;
// 			} catch (error) {
// 				logger.error("Error while signing in: ", {
// 					error,
// 				});
// 				return { type: "error", error };
// 			}
// 		},
// 		listProviders: () => {
// 			return providers.map((provider) => ({
// 				name: provider.name,
// 				key: provider.key,
// 				style: provider.style,
// 			}));
// 		},
// 		validate: async (keyCards: KeyCards): Promise<AuthResult<E>> => {
// 			// TODO decide what works best for session strategy
// 			// TO-DO decide how to deal with missing keycards
// 			// its probably early on the game
// 			if (!keyCards) {
// 				return {
// 					type: "error",
// 					error: new KeyCardMissingError("No keycards found"),
// 				} satisfies AuthResult<E>;
// 			}

// 			const result = await authStrategy.validate(keyCards);

// 			if (result.type === "success") {
// 				logger.info("Keycards validated", {
// 					userId: result.authState.user.id,
// 					email: result.authState.user.email,
// 				});
// 				// return result as AuthResult<E>;
// 				return {
// 					type: "success",
// 					authState: {
// 						authenticated: true,
// 						user: result.authState.user as User & E,
// 						keyCards: result.authState.keyCards,
// 					},
// 				} satisfies AuthResult<E>;
// 			} else if (result.type === "refresh") {
// 				let user = await userRegistry.getUser(result.authState.user.id);
// 				if (!user) {
// 					return {
// 						type: "error",
// 						error: new UserNotFoundError("User not found"),
// 					} satisfies AuthResult<E>;
// 				}

// 				const sanitizedUser = sanitizeUser(user);

// 				// 3) Enrich token or session data with roles/permissions (if authz is provided)
// 				// This is pointless in a db session strategy though - this is not actually pointless in a db session strategy we should STILL enrich the USER object
// 				// no need for if
// 				const enrichedUser = await callbacks.enrichUser(sanitizedUser);
// 				// console.log("ENRICH USER CALLBACK RESULT:", user);
// 				// does this syntax work fine?
// 				// TODO: fix type issue adapter user vs User

// 				const keyCards = await authStrategy.createKeyCards(user);
// 				return {
// 					type: "refresh",
// 					authState: {
// 						user: enrichedUser,
// 						authenticated: true,
// 						keyCards,
// 					},
// 				} satisfies AuthResult<E>;
// 				// pull user info from DB
// 				// create new keycards
// 			}

// 			// console.log("AUTH.VALIDATE RESULT: ", result);
// 			if (result.type === "error") {
// 				// log the error
// 				this.logger.error("Failed to validate keycards", {
// 					message: result.error?.message,
// 				});
// 			}
// 			return result;
// 		},
// 		signOut: async (
// 			keyCards: KeyCards | undefined | null
// 		): Promise<AuthState<E>> => {
// 			if (!keyCards) {
// 				return {
// 					authenticated: false,
// 					user: null,
// 					keyCards: null,
// 					error: null,
// 				}; // all ready logged out
// 			}
// 			return await authStrategy.logout(keyCards);
// 		},
// 		// authorize: async (keyCards: KeyCards, role?: string) => {
// 		// 	if (!keyCards) {
// 		// 		throw new KeyCardMissingError("No keycards found");
// 		// 	}

// 		// 	const validation = await authStrategy.validate(keyCards);

// 		// 	if (!role) {
// 		// 		return true;
// 		// 	}

// 		// 	if (validation.type === "error" || validation.type ===) {
// 		// 		return false;
// 		// 	}

// 		// 	return true;
// 		// },

// 		// Possibly other methods like signOut, refresh, etc.
// 	};
// }

// // export const createAuthManager = <ExtraData = {}>(
// // 	config: AuthConfig
// // ): IAuthManager<ExtraData> => {
// // 	let strategy: AuthStrategy;
// // 	if (config.strategy === "jwt") {
// // 		strategy = JwtStrategyFn(config.jwtConfig);
// // 	} else if (config.strategy === "session") {
// // 		throw new Error("Session strategy not implemented yet");
// // 	} else {
// // 		throw new Error("Invalid strategy");
// // 	}

// // 	if (!config.logger) {
// // 		if (!config.loggerOptions) {
// // 			config.loggerOptions = { level: "info", prefix: "Auth" };
// // 		}
// // 		config.logger = createLogger(config.loggerOptions);
// // 	}

// // 	const safeCallbacks = createAuthCallbacks<ExtraData>(config.callbacks);

// // 	return AuthManager<ExtraData>(
// // 		config.adapter,
// // 		strategy,
// // 		config.providers,
// // 		config.logger,
// // 		safeCallbacks
// // 	);
// // };

// // export const createAuthManager = <Callbacks extends AuthNCallbacks<any>>(
// // 	config: Omit<AuthConfig, "callbacks"> & { callbacks: Callbacks }
// // ): IAuthManager<
// // 	Callbacks extends AuthNCallbacks<infer Extra> ? Extra : never
// // > => {
// // 	let strategy: AuthStrategy;

// // 	if (config.strategy === "jwt") {
// // 		if (!config.jwtConfig) {
// // 			throw new Error("Missing jwtConfig for JWT strategy");
// // 		}
// // 		strategy = JwtStrategyFn(config.jwtConfig);
// // 	} else if (config.strategy === "session") {
// // 		throw new Error("Session strategy not implemented yet");
// // 	} else {
// // 		throw new Error("Invalid strategy");
// // 	}

// // 	if (!config.logger) {
// // 		config.logger = createLogger(
// // 			config.loggerOptions ?? { level: "info", prefix: "Auth" }
// // 		);
// // 	}

// // 	return AuthManager(
// // 		config.adapter,
// // 		strategy,
// // 		config.providers,
// // 		config.logger,
// // 		config.callbacks
// // 	);
// // };

// export function createAuthManager<Extra = {}>(
// 	config: AuthConfig & { callbacks: AuthNCallbacks<Extra> }
// ): IAuthManager<Extra> {
// 	let strategy: AuthStrategy;

// 	if (config.strategy === "jwt") {
// 		if (!config.jwtConfig) {
// 			throw new Error("Missing jwtConfig for JWT strategy");
// 		}
// 		strategy = JwtStrategyFn(config.jwtConfig);
// 	} else if (config.strategy === "session") {
// 		throw new Error("Session strategy not implemented yet");
// 	} else {
// 		throw new Error("Invalid strategy");
// 	}

// 	if (!config.logger) {
// 		config.logger = createLogger(
// 			config.loggerOptions ?? { level: "info", prefix: "Auth" }
// 		);
// 	}

// 	const safeCallbacks = createAuthCallbacks(config.callbacks);

// 	return AuthManager(
// 		config.adapter,
// 		strategy,
// 		config.providers,
// 		config.logger,
// 		safeCallbacks
// 	);
// }

// // export function createAuthCallbacks<ExtraData = {}>(
// // 	callbacks: AuthNCallbacks<ExtraData>
// // ): AuthNCallbacks<ExtraData> {
// // 	const safeCallbacks = {
// // 		onUserCreated: async () => {}, // No-op function
// // 		onUserUpdated: async () => {}, // No-op function
// // 		onUserDeleted: async () => {}, // No-op function
// // 		enrichUser: async (user: User) => user as User & ExtraData, // Return user unchanged
// // 		...callbacks, // Merge with user-defined callbacks (if any)
// // 	};
// // 	return safeCallbacks;
// // }

// export interface IAuthManager<ExtraData = {}> {
// 	login: (signInParams: SignInParams) => Promise<AuthResult<ExtraData>>;
// 	listProviders: () => DisplayProvider[];
// 	validate: (keyCards: KeyCards) => Promise<AuthResult<ExtraData>>;
// 	signOut: (keyCards: KeyCards) => Promise<AuthState<ExtraData>>;
// }

// // ✅ FUNCTION OVERLOADS

// // type AuthZLike<MergedData> = {
// // 	enrichUser: (user: User) => Promise<User & MergedData>;
// // 	onUserCreated?: (user: User) => Promise<void>;
// // 	onUserDeleted?: (user: User) => Promise<void>;
// // };

// // // Overload 1: When passed an authz-style object (e.g. buildAuthZ() output)
// // export function createAuthCallbacks<MergedData>(authz: {
// // 	enrichUser: (user: User) => Promise<User & MergedData>;
// // 	onUserCreated?: (user: User) => Promise<void>;
// // 	onUserDeleted?: (user: User) => Promise<void>;
// // }): AuthNCallbacks<MergedData>;

// // // Overload 2: When passed a regular AuthNCallbacks object
// // export function createAuthCallbacks<ExtraData>(
// // 	callbacks: AuthNCallbacks<ExtraData>
// // ): AuthNCallbacks<ExtraData>;

// // // ✅ ACTUAL IMPLEMENTATION — 🔥 KEY FIX 🔥
// // export function createAuthCallbacks<ExtraData>(
// // 	callbacks: AuthNCallbacks<ExtraData> | AuthZLike<ExtraData>
// // ): AuthNCallbacks<ExtraData> {
// // 	return {
// // 		onUserCreated: async () => {},
// // 		onUserUpdated: async () => {},
// // 		onUserDeleted: async () => {},
// // 		enrichUser: async (user: User) => user as User & ExtraData,
// // 		...callbacks,
// // 	};
// // }

// export type InferUserType<T extends IAuthManager<any>> = T extends IAuthManager<
// 	infer U
// >
// 	? User & U
// 	: User;

// // lets just try and do the enrichUser function
// export type EnrichUser<Extra> = (user: User) => Promise<User & Extra>;

// // export const createEnrichUser = <Extra = {}>(
// // 	enrichUserFn: (user: User) => Promise<User & Extra>
// // ): ((user: User) => Promise<User & Extra>) => {
// // 	return enrichUserFn;
// // };

// export function createEnrichUser<
// 	Fn extends (user: User) => Promise<User & Record<string, any>>
// >(fn: Fn): Fn {
// 	return fn;
// }

// export function createAuthCallbacks<
// 	Fn extends (user: User) => Promise<User & Record<string, any>>
// >(callbacks: {
// 	enrichUser: Fn;
// 	onUserCreated?: (user: User) => Promise<void>;
// 	onUserDeleted?: (user: User) => Promise<void>;
// }): AuthNCallbacks<InferExtraFromEnrichFn<Fn>> {
// 	return {
// 		onUserCreated: async () => {},
// 		onUserUpdated: async () => {},
// 		onUserDeleted: async () => {},
// 		...callbacks,
// 	};
// }

// export interface AuthNCallbacks<Extra = {}> {
// 	/**
// 	 * Called after a new user is created.
// 	 * Can be used to initialize default AuthZ data (e.g., roles/permissions).
// 	 */
// 	onUserCreated?: (user: User) => Promise<void> | void;

// 	/**
// 	 * Called after a user is updated.
// 	 * Can be used to update default AuthZ data (e.g., roles/permissions).
// 	 */
// 	onUserUpdated?: (user: User) => void;

// 	/**
// 	 * Called after a user is deleted.
// 	 * Can be used to clean up default AuthZ data (e.g., roles/permissions).
// 	 */
// 	onUserDeleted?: (user: User) => void;

// 	/**
// 	 * Called when a user is retrieved from the database.
// 	 * Allows enrichment with roles/permissions before being returned or added to a JWT.
// 	 */
// 	// enrichUser?: (user: User) => Promise<User & Extra>;
// 	enrichUser: EnrichUser;
// }

// export type InferExtraFromEnrichFn<T> = T extends (
// 	user: User
// ) => Promise<infer R>
// 	? Omit<R, keyof User>
// 	: never;

// import {
// 	AuthResult,
// 	AuthStrategy,
// 	Logger,
// 	AuthConfig,
// 	KeyCards,
// 	AuthState,
// 	// AuthNCallbacks,
// 	DatabaseUser,
// 	LoggerOptions,
// } from "core/types";
// import { SignInSystem, type SignInParams } from "../signin-system";
// import { AuthProvider } from "core/providers";
// import { Adapter, Adapter as UserRegistry } from "../adapter";
// import { JwtStrategyFn } from "../session-strategy";
// import { DisplayProvider, User } from "core/auth-system";
// import { createLogger } from "@pete_keen/logger";
// import { KeyCardMissingError, UserNotFoundError } from "core/error";
// import { JwtConfig } from "core/session-strategy/jwt-strategy/index.types";
// import { SessionConfig } from "core/session-strategy/db-strategy/index.types";

// // --- Utility Types ---
// export type EnrichUser<Extra = {}> = (user: User) => Promise<User & Extra>;

// export type InferExtraFromEnrichFn<T> = T extends (
// 	user: User
// ) => Promise<infer R>
// 	? Omit<R, keyof User>
// 	: never;

// // --- AuthN Callback Interfaces ---
// export interface AuthNCallbacks<Extra = {}> {
// 	enrichUser: EnrichUser<Extra>;
// 	onUserCreated?: (user: User) => Promise<void> | void;
// 	onUserUpdated?: (user: User) => Promise<void>;
// 	onUserDeleted?: (user: User) => Promise<void>;
// }

// // --- AuthN Config Types ----
// export interface AuthConfigBase<Extra = {}> {
// 	adapter: Adapter;
// 	logger?: Logger;
// 	loggerOptions?: LoggerOptions;
// 	providers: AuthProvider[];
// 	callbacks: AuthNCallbacks<Extra>;
// }

// export type AuthConfig =
// 	| (AuthConfigBase & { strategy: "jwt"; jwtConfig: JwtConfig })
// 	| (AuthConfigBase & { strategy: "session"; sessionConfig: SessionConfig });

// // --- Auth Manager Interface ---
// export interface IAuthManager<Extra = {}> {
// 	login: (params: SignInParams) => Promise<AuthResult<Extra>>;
// 	validate: (keyCards: KeyCards) => Promise<AuthResult<Extra>>;
// 	signOut: (
// 		keyCards: KeyCards | null | undefined
// 	) => Promise<AuthState<Extra>>;
// 	listProviders: () => DisplayProvider[];
// }

// // --- AuthManager Factory ---
// export function AuthManager<Extra>(
// 	userRegistry: UserRegistry,
// 	authStrategy: AuthStrategy,
// 	providers: AuthProvider[],
// 	logger: Logger,
// 	callbacks: AuthNCallbacks<Extra>
// ): IAuthManager<Extra> {
// 	const providersMap = Object.fromEntries(
// 		providers.map((p) => [p.key, p])
// 	) as Record<string, AuthProvider>;
// 	const signInSystem = SignInSystem(providersMap);

// 	const sanitizeUser = (dbUser: DatabaseUser): User => ({
// 		id: dbUser.id,
// 		name: dbUser.name,
// 		email: dbUser.email,
// 		image: dbUser.image,
// 	});

// 	const enrich = callbacks.enrichUser;

// 	return {
// 		login: async ({ provider, code }) => {
// 			try {
// 				const signInResult = await signInSystem.signIn(provider, code);

// 				if (signInResult.type !== "success") return signInResult;

// 				const { userProfile, adapterAccount } = signInResult.response;
// 				let user = await userRegistry.getUserByEmail(userProfile.email);

// 				if (!user) {
// 					user = await userRegistry.createUser(userProfile);
// 					await userRegistry.createAccountForUser(
// 						user,
// 						adapterAccount
// 					);
// 					await callbacks.onUserCreated?.(user);
// 				} else {
// 					const account = await userRegistry.getAccount(
// 						adapterAccount.provider,
// 						adapterAccount.providerAccountId
// 					);
// 					if (account)
// 						await userRegistry.updateAccount(adapterAccount);
// 					else
// 						await userRegistry.createAccountForUser(
// 							user,
// 							adapterAccount
// 						);
// 				}

// 				const enrichedUser = await enrich(sanitizeUser(user));
// 				const keyCards = await authStrategy.createKeyCards(user);

// 				return {
// 					type: "success",
// 					authState: {
// 						authenticated: true,
// 						keyCards,
// 						user: enrichedUser,
// 					},
// 				} satisfies AuthResult<Extra>;
// 			} catch (error) {
// 				logger.error("Error during login", { error });
// 				return { type: "error", error } satisfies AuthResult<Extra>;
// 			}
// 		},

// 		validate: async (keyCards): Promise<AuthResult<Extra>> => {
// 			if (!keyCards)
// 				return {
// 					type: "error",
// 					error: new KeyCardMissingError("No keycards found"),
// 				};

// 			const result = await authStrategy.validate(keyCards);

// 			if (result.type === "success") {
// 				return {
// 					type: "success",
// 					authState: {
// 						authenticated: true,
// 						keyCards: result.authState.keyCards,
// 						user: result.authState.user as User & Extra,
// 					},
// 				};
// 			}

// 			if (result.type === "refresh") {
// 				const dbUser = await userRegistry.getUser(
// 					result.authState.user.id
// 				);
// 				if (!dbUser)
// 					return {
// 						type: "error",
// 						error: new UserNotFoundError("User not found"),
// 					};

// 				const enriched = await enrich(sanitizeUser(dbUser));
// 				const keyCards = await authStrategy.createKeyCards(dbUser);

// 				return {
// 					type: "refresh",
// 					authState: {
// 						user: enriched,
// 						authenticated: true,
// 						keyCards,
// 					},
// 				};
// 			}

// 			return result as AuthResult<Extra>;
// 		},

// 		signOut: async (keyCards): Promise<AuthState<Extra>> => {
// 			if (!keyCards)
// 				return {
// 					authenticated: false,
// 					user: null,
// 					keyCards: null,
// 					error: null,
// 				};
// 			return await authStrategy.logout(keyCards);
// 		},

// 		listProviders: () =>
// 			providers.map((p) => ({
// 				name: p.name,
// 				key: p.key,
// 				style: p.style,
// 			})),
// 	};
// }

// // Infer enriched type from auth manager
// export type InferUserType<T extends IAuthManager<any>> = T extends IAuthManager<
// 	infer U
// >
// 	? User & U
// 	: User;

// // // Factory that infers Extra from enrichUser
// // export function createAuthManagerFromEnrichFn<
// // 	Fn extends (user: User) => Promise<User & Record<string, any>>
// // >(
// // 	config: Omit<AuthConfig, "callbacks"> & {
// // 		enrichUser: Fn;
// // 		onUserCreated?: (user: User) => Promise<void>;
// // 		onUserDeleted?: (user: User) => Promise<void>;
// // 	}
// // ): IAuthManager<InferExtraFromEnrichFn<Fn>> {
// // 	const strategy =
// // 		config.strategy === "jwt"
// // 			? JwtStrategyFn(config.jwtConfig!)
// // 			: (() => {
// // 					throw new Error("Only JWT strategy supported yet");
// // 			  })();

// // 	const logger =
// // 		config.logger ??
// // 		createLogger(config.loggerOptions ?? { level: "info", prefix: "Auth" });

// // 	return AuthManager(config.adapter, strategy, config.providers, logger, {
// // 		enrichUser: config.enrichUser,
// // 		onUserCreated: config.onUserCreated,
// // 		onUserDeleted: config.onUserDeleted,
// // 	});
// // }

// // Use a helper type to infer the `Extra` from the function
// export function createAuthCallbacks<
// 	Fn extends (user: User) => Promise<any>
// >(callbacks: {
// 	enrichUser: Fn;
// 	onUserCreated?: (user: User) => Promise<void>;
// 	onUserUpdated?: (user: User) => Promise<void>;
// 	onUserDeleted?: (user: User) => Promise<void>;
// }): AuthNCallbacks<InferExtraFromEnrichFn<Fn>> {
// 	return callbacks as AuthNCallbacks<InferExtraFromEnrichFn<Fn>>;
// }

// // export function createAuthManager<Extra>(
// // 	config: AuthConfigBase<Extra> & {
// // 		strategy: "jwt";
// // 		jwtConfig: JwtConfig;
// // 	}
// // ): IAuthManager<Extra>;

// // export function createAuthManager<Extra>(
// // 	config: AuthConfigBase<Extra> & {
// // 		strategy: "session";
// // 		sessionConfig: SessionConfig;
// // 	}
// // ): IAuthManager<Extra>;

// // export function createAuthManager<Extra>(
// // 	config: AuthConfig
// // ): IAuthManager<Extra> {
// // 	const strategy =
// // 		config.strategy === "jwt"
// // 			? JwtStrategyFn(config.jwtConfig)
// // 			: (() => {
// // 					throw new Error("Session strategy not implemented");
// // 			  })();

// // 	if (!config.logger) {
// // 		config.logger = createLogger(
// // 			config.loggerOptions ?? { level: "info", prefix: "Auth" }
// // 		);
// // 	}

// // 	return AuthManager(
// // 		config.adapter,
// // 		strategy,
// // 		config.providers,
// // 		config.logger,
// // 		config.callbacks
// // 	);
// // }

// // Utility type to infer extra from enrichUser function
// export type InferExtraFromCallbacks<T extends AuthNCallbacks<any>> =
// 	T extends AuthNCallbacks<infer U> ? U : never;

// // Use a generic that infers from the callbacks
// export function createAuthManager<
// 	CB extends AuthNCallbacks<any>,
// 	Extra = InferExtraFromCallbacks<CB>
// >(
// 	config: Omit<AuthConfigBase<Extra>, "callbacks"> & {
// 		callbacks: CB;
// 	} & (
// 			| { strategy: "jwt"; jwtConfig: JwtConfig }
// 			| { strategy: "session"; sessionConfig: SessionConfig }
// 		)
// ): IAuthManager<Extra> {
// 	const strategy =
// 		config.strategy === "jwt"
// 			? JwtStrategyFn(config.jwtConfig)
// 			: (() => {
// 					throw new Error("Session strategy not implemented");
// 			  })();

// 	const logger =
// 		config.logger ??
// 		createLogger(config.loggerOptions ?? { level: "info", prefix: "Auth" });

// 	return AuthManager(
// 		config.adapter,
// 		strategy,
// 		config.providers,
// 		logger,
// 		config.callbacks
// 	);
// }

import {
	AuthResult,
	AuthStrategy,
	Logger,
	KeyCards,
	AuthState,
	DatabaseUser,
	LoggerOptions,
} from "core/types";
import { SignInSystem, type SignInParams } from "../signin-system";
import { AuthProvider } from "core/providers";
import { Adapter as UserRegistry } from "../adapter";
import { JwtStrategyFn } from "../session-strategy";
import { DisplayProvider, User } from "core/auth-system";
import { KeyCardMissingError, UserNotFoundError } from "core/error";
import { JwtConfig } from "core/session-strategy/jwt-strategy/index.types";
import { SessionConfig } from "core/session-strategy/db-strategy/index.types";
import { AuthNCallbacks, IAuthManager } from "./types";

// // --- Utility Types ---
// export type EnrichUser<Extra = {}> = (user: User) => Promise<User & Extra>;

// export type InferExtraFromEnrichFn<T> = T extends (
// 	user: User
// ) => Promise<infer R>
// 	? Omit<R, keyof User>
// 	: never;

// export type InferExtraFromCallbacks<T extends AuthNCallbacks<any>> =
// 	T extends AuthNCallbacks<infer U> ? U : never;

// // --- AuthN Callback Interfaces ---
// export interface AuthNCallbacks<Extra = {}> {
// 	enrichUser: EnrichUser<Extra>;
// 	onUserCreated?: (user: User) => Promise<void> | void;
// 	onUserUpdated?: (user: User) => Promise<void>;
// 	onUserDeleted?: (user: User) => Promise<void>;
// }

// // --- Auth Manager Interface ---
// export interface IAuthManager<Extra = {}> {
// 	login: (params: SignInParams) => Promise<AuthResult<Extra>>;
// 	validate: (keyCards: KeyCards) => Promise<AuthResult<Extra>>;
// 	signOut: (
// 		keyCards: KeyCards | null | undefined
// 	) => Promise<AuthState<Extra>>;
// 	listProviders: () => DisplayProvider[];
// 	callbacks: AuthNCallbacks<Extra>; // ✅ expose it here
// }

// --- AuthManager Factory ---
// export function AuthManager<Extra>(
// 	userRegistry: UserRegistry,
// 	authStrategy: AuthStrategy,
// 	providers: AuthProvider[],
// 	logger: Logger,
// 	callbacks: AuthNCallbacks<Extra>
// ): IAuthManager<Extra> {
// 	const providersMap = Object.fromEntries(
// 		providers.map((p) => [p.key, p])
// 	) as Record<string, AuthProvider>;
// 	const signInSystem = SignInSystem(providersMap);

// 	const sanitizeUser = (dbUser: DatabaseUser): User => ({
// 		id: dbUser.id,
// 		name: dbUser.name,
// 		email: dbUser.email,
// 		image: dbUser.image,
// 	});

// 	const enrich = callbacks.enrichUser;

// 	return {
// 		login: async ({ provider, code }) => {
// 			try {
// 				const signInResult = await signInSystem.signIn(provider, code);

// 				if (signInResult.type !== "success") return signInResult;

// 				const { userProfile, adapterAccount } = signInResult.response;
// 				let user = await userRegistry.getUserByEmail(userProfile.email);

// 				if (!user) {
// 					user = await userRegistry.createUser(userProfile);
// 					await userRegistry.createAccountForUser(
// 						user,
// 						adapterAccount
// 					);
// 					await callbacks.onUserCreated?.(user);
// 				} else {
// 					const account = await userRegistry.getAccount(
// 						adapterAccount.provider,
// 						adapterAccount.providerAccountId
// 					);
// 					if (account)
// 						await userRegistry.updateAccount(adapterAccount);
// 					else
// 						await userRegistry.createAccountForUser(
// 							user,
// 							adapterAccount
// 						);
// 				}

// 				const enrichedUser = await enrich(sanitizeUser(user));
// 				const keyCards = await authStrategy.createKeyCards(user);

// 				return {
// 					type: "success",
// 					authState: {
// 						authenticated: true,
// 						keyCards,
// 						user: enrichedUser,
// 					},
// 				} satisfies AuthResult<Extra>;
// 			} catch (error) {
// 				logger.error("Error during login", { error });
// 				return { type: "error", error } satisfies AuthResult<Extra>;
// 			}
// 		},

// 		validate: async (keyCards): Promise<AuthResult<Extra>> => {
// 			if (!keyCards)
// 				return {
// 					type: "error",
// 					error: new KeyCardMissingError("No keycards found"),
// 				};

// 			const result = await authStrategy.validate(keyCards);

// 			if (result.type === "success") {
// 				return {
// 					type: "success",
// 					authState: {
// 						authenticated: true,
// 						keyCards: result.authState.keyCards,
// 						user: result.authState.user as User & Extra,
// 					},
// 				};
// 			}

// 			if (result.type === "refresh") {
// 				const dbUser = await userRegistry.getUser(
// 					result.authState.user.id
// 				);
// 				if (!dbUser)
// 					return {
// 						type: "error",
// 						error: new UserNotFoundError("User not found"),
// 					};

// 				const enriched = await enrich(sanitizeUser(dbUser));
// 				const keyCards = await authStrategy.createKeyCards(dbUser);

// 				return {
// 					type: "refresh",
// 					authState: {
// 						user: enriched,
// 						authenticated: true,
// 						keyCards,
// 					},
// 				};
// 			}

// 			return result as AuthResult<Extra>;
// 		},

// 		signOut: async (keyCards): Promise<AuthState<Extra>> => {
// 			if (!keyCards)
// 				return {
// 					authenticated: false,
// 					user: null,
// 					keyCards: null,
// 					error: null,
// 				};
// 			return await authStrategy.logout(keyCards);
// 		},

// 		listProviders: () =>
// 			providers.map((p) => ({
// 				name: p.name,
// 				key: p.key,
// 				style: p.style,
// 			})),

// 		callbacks,
// 	};
// }

// export function createAuthCallbacks<
// 	Fn extends (user: User) => Promise<any>
// >(callbacks: {
// 	enrichUser: Fn;
// 	onUserCreated?: (user: User) => Promise<void>;
// 	onUserUpdated?: (user: User) => Promise<void>;
// 	onUserDeleted?: (user: User) => Promise<void>;
// }): AuthNCallbacks<InferExtraFromEnrichFn<Fn>> {
// 	return callbacks as AuthNCallbacks<InferExtraFromEnrichFn<Fn>>;
// }

// export type StrategyConfig =
// 	| { strategy: "jwt"; jwtConfig: JwtConfig }
// 	| { strategy: "session"; sessionConfig: SessionConfig };

// export type ConfigWithCallbacks<CB extends AuthNCallbacks<any>> = {
// 	adapter: UserRegistry;
// 	providers: AuthProvider[];
// 	callbacks: CB;
// 	logger?: Logger;
// 	loggerOptions?: LoggerOptions;
// } & StrategyConfig;

// export function createAuthManager<CB extends AuthNCallbacks<any>>(
// 	config: ConfigWithCallbacks<CB>
// ): IAuthManager<InferExtraFromCallbacks<CB>> {
// 	const strategy =
// 		config.strategy === "jwt"
// 			? JwtStrategyFn(config.jwtConfig)
// 			: (() => {
// 					throw new Error("Session strategy not implemented");
// 			  })();

// 	const logger =
// 		config.logger ??
// 		createLogger(config.loggerOptions ?? { level: "info", prefix: "Auth" });

// 	return AuthManager(
// 		config.adapter,
// 		strategy,
// 		config.providers,
// 		logger,
// 		config.callbacks
// 	);
// }



// export function createEnrichUser<
// 	Fn extends (user: User) => Promise<User & Record<string, any>>
// >(fn: Fn): Fn {
// 	return fn;
// }

// export function createAuthCallbacks<
// 	Fn extends (user: User) => Promise<User & Record<string, any>>
// >(callbacks: {
// 	enrichUser: Fn;
// 	onUserCreated?: (user: User) => Promise<void>;
// 	onUserUpdated?: (user: User) => Promise<void>;
// 	onUserDeleted?: (user: User) => Promise<void>;
// }): AuthNCallbacks<
// 	Awaited<ReturnType<Fn>> extends User & infer Extra ? Extra : never
// > {
// 	return callbacks as any;
// }

// export const createEnrichUserData = <U, E>(fn: (user: U) => Promise<U & E>) => {
// 	return fn;
// };

export * from "./create-auth-manager";
export * from "./types";
export * from "./auth-manager";
