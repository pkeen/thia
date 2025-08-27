// packages/auth-core/src/services/AuthenticationService.ts
import { AuthState, AuthStrategy, KeyCards, AuthResult } from "../types";
import { AuthConfig, IAuthSystem } from "./index.types";
import {
	Credentials,
	// SignupCredentials,
} from "../providers/credentials/index.types";

// import { WebStorageAdapter } from "../types";
import { Adapter, AdapterUser } from "../adapter";
import { DefaultPasswordService, PasswordService } from "../password-service";
import { createLogger, Logger, createLogContext } from "@pete_keen/logger";
import {
	safeExecute,
	UserNotFoundError,
	KeyCardMissingError,
	InvalidCredentialsError,
	KeyCardCreationError,
	CsrfError,
	AuthError,
	UnknownAuthError,
	AccountAlreadyExistsError,
	ProviderNotGivenError,
	ProviderNotFoundError,
} from "../error";
import {
	AbstractOAuthProvider,
	AuthProvider,
} from "../providers/oauth/oauth-provider";
import { JwtStrategyFn } from "../session-strategy";
import type { RBAC } from "../../authorization";

export type Providers = {
	[key: string]: AuthProvider;
};

export type DisplayProvider = {
	name: string;
	key: string;
	style: {
		text: string;
		bg: string;
	};
};

export class AuthSystem {
	public logger?: Logger;
	public strategy: AuthStrategy;
	public adapter: Adapter;
	// public passwordService: PasswordService;
	/* this is currently OAuth only */
	public providers: Providers = {};
	// add roles manaer
	public authorizationManager: RBAC;

	// storageAdapter: WebStorageAdapter; // Declare the storageAdapter property

	constructor(
		strategy: AuthStrategy,
		// userRepository: UserRepository
		adapter: Adapter,
		authorizationManager: RBAC,
		logger: Logger
		// passwordService: PasswordService = DefaultPasswordService() // not needed atm no password system implemented
		// rolesManager: typeof RolesManager
	) {
		this.strategy = strategy;
		// this.userRepository = userRepository;
		this.adapter = adapter;

		this.authorizationManager = authorizationManager;
		// this.rolesManager = rolesManager;
		this.logger = logger;

		this.authorizationManager.seed();

		// Log initialization with structured metadata
		this.logger.info("Auth system initialized", {
			strategy: strategy.constructor.name,
			adapter: adapter.constructor.name,
			// passwordService: passwordService.constructor.name,
			authorizationManager: this.authorizationManager,
		});
	}

	async login(provider?: string, code?: string): Promise<AuthResult> {
		try {
			// Check for provider
			if (!provider)
				throw new ProviderNotGivenError("Provider not specified");
			const p = this.providers[provider];
			console.log("p:", p);
			if (!p) {
				throw new ProviderNotFoundError(provider);
			}

			// If no code return authorization url
			if (!code) {
				this.logger.info(
					"No code provided, returning authorization url",
					{
						provider,
					}
				);
				const url = p.createAuthorizationUrl();
				return { type: "redirect", url, state: p.getState() };
			}

			// Step 1: OAuth callback (with code)
			const { userProfile, adapterAccount } = await p.handleRedirect(
				code
			);
			// Step 2: Check if user already exists
			let user = await this.adapter.getUserByEmail(userProfile.email);
			// Step 2a: if not existing user create new one
			if (!user) {
				this.logger.info("User not found, creating new user", {
					email: userProfile.email,
				});
				user = await this.adapter.createUser({
					email: userProfile.email,
					name: userProfile.name,
					image: userProfile.image,
				});
				// TODO: create user account if not exists
				await this.adapter.createAccountForUser(user, adapterAccount);

				// TODO: create default user authorization roles/permissions
				console.log("creating user role");
				await this.authorizationManager.createUserRole(user.id);
			} else {
				this.logger.info("User found", {
					email: userProfile.email,
				});
				// Step 2b: Select account where user id matches and provider matches
				const account = await this.adapter.getAccount(
					adapterAccount.provider,
					adapterAccount.providerAccountId
				);

				// update user account if exists
				if (account) {
					this.logger.info("Account found", {
						provider: account.provider,
						providerAccountId: account.providerAccountId,
					});
					// Has token changed check - temporary
					if (account.access_token === adapterAccount.access_token) {
						console.log("SAME TOKEN");
					} else {
						console.log("DIFFERENT TOKEN");
					}
					await this.adapter.updateAccount(adapterAccount);
				}

				// create user account if not exists
				if (!account) {
					await this.adapter.createAccountForUser(
						user,
						adapterAccount
					);
				}
			}

			// Step 3: Create auth state
			this.logger.info("Creating keycards ");
			const keyCards = await this.createKeyCardsForUser(user);
			return {
				type: "success",
				authState: { authenticated: true, keyCards, user },
			};
		} catch (error) {
			// console.log(error);
			this.logger.error("Error while signing in: ", {
				error,
			});
			return { type: "error", error };
		}
	}

	// async authenticate(credentials: Credentials): Promise<AuthState> {
	// 	// Now this is just the credentials based signin method
	// 	try {
	// 		// Step 1: Validate input
	// 		if (!this.validateCredentials(credentials))
	// 			throw new InvalidCredentialsError();

	// 		// Step 2: Find user
	// 		const user = await this.findUser(credentials.email);
	// 		if (!user) {
	// 			throw new UserNotFoundError(credentials.email);
	// 		}

	// 		// Step 3: Verify password
	// 		const isAuthenticated = await this.verifyPassword(
	// 			credentials.password,
	// 			user
	// 		);
	// 		if (!isAuthenticated) {
	// 			throw new InvalidCredentialsError();
	// 		}
	// 		// Step 4: Create auth state
	// 		const keyCards = await this.createKeyCardsForUser(user);

	// 		this.logger.info(
	// 			"Authentication successful",
	// 			createLogContext({
	// 				userId: user.id,
	// 				email: user.email,
	// 			})
	// 		);
	// 		return { authenticated: true, keyCards, user };
	// 	} catch (error) {
	// 		this.logger.error("Error while signing in: ", {
	// 			error,
	// 		});
	// 		if (error instanceof AuthError) {
	// 			return {
	// 				authenticated: false,
	// 				error,
	// 				user: null,
	// 				keyCards: null,
	// 			};
	// 		} else {
	// 			return {
	// 				authenticated: false,
	// 				user: null,
	// 				keyCards: null,
	// 				error: new UnknownAuthError(
	// 					"An unknown error occurred while signing in"
	// 				),
	// 			};
	// 		}
	// 	}
	// }
	// // async signin(provider: string): Promise<AuthState> {
	// // 	// Authenticate with different providers

	// // 	try {
	// // 		// Step 1: Validate input
	// // 		if (!this.validateCredentials(credentials))
	// // 			throw new InvalidCredentialsError();

	// // 		// Step 2: Find user
	// // 		const user = await this.findUser(credentials.email);
	// // 		if (!user) {
	// // 			throw new UserNotFoundError(credentials.email);
	// // 		}

	// // 		// Step 3: Verify password
	// // 		const isAuthenticated = await this.verifyPassword(
	// // 			credentials.password,
	// // 			user
	// // 		);
	// // 		if (!isAuthenticated) {
	// // 			throw new InvalidCredentialsError();
	// // 		}
	// // 		// Step 4: Create auth state
	// // 		const keyCards = await this.createKeyCardsForUser(user);

	// // 		this.logger.info(
	// // 			"Authentication successful",
	// // 			createLogContext({
	// // 				userId: user.id,
	// // 				email: user.email,
	// // 			})
	// // 		);
	// // 		return { authenticated: true, keyCards, user };
	// // 	} catch (error) {
	// // 		this.logger.error("Error while signing in: ", {
	// // 			error,
	// // 		});
	// // 		if (error instanceof AuthError) {
	// // 			return {
	// // 				authenticated: false,
	// // 				error,
	// // 				user: null,
	// // 				keyCards: null,
	// // 			};
	// // 		} else {
	// // 			return {
	// // 				authenticated: false,
	// // 				user: null,
	// // 				keyCards: null,
	// // 				error: new UnknownAuthError(
	// // 					"An unknown error occurred while signing in"
	// // 				),
	// // 			};
	// // 		}
	// // 	}
	// // }
	// private validateCredentials(credentials: Credentials): boolean {
	// 	if (!credentials.email || !credentials.password) {
	// 		this.logger.warn("Invalid credentials provided", {
	// 			missingFields: {
	// 				email: !credentials.email,
	// 				password: !credentials.password,
	// 			},
	// 		});
	// 		return false;
	// 	}
	// 	return true;
	// }

	// In your auth system
	// private async findUser(email: string): Promise<AdapterUser | null> {
	// 	const user = await safeExecute(
	// 		async () => {
	// 			const user = await this.adapter.getUserByEmail(email);
	// 			// console.log("DEBUG - Found user:", user); // Temporary debug log
	// 			return user;
	// 		},
	// 		this.logger,
	// 		{
	// 			message: "Failed to fetch user",
	// 			error: UserNotFoundError,
	// 		},
	// 		createLogContext({ email })
	// 	);

	// 	if (!user) {
	// 		this.logger.warn("User not found", createLogContext({ email }));
	// 	}
	// 	return user;
	// }

	// private async verifyPassword(
	// 	password: string,
	// 	user: AdapterUser
	// ): Promise<boolean> {
	// 	if (!user.password) {
	// 		this.logger.error(
	// 			"User has no password",
	// 			createLogContext({ email: user.email, id: user.id })
	// 		);
	// 		return false;
	// 	}

	// 	const isAuthenticated = await safeExecute(
	// 		async () => {
	// 			return await this.passwordService.verify(
	// 				password,
	// 				user.password
	// 			);
	// 		},
	// 		this.logger,
	// 		{
	// 			message: "Failed to verify password",
	// 			error: UserNotFoundError,
	// 		},
	// 		createLogContext({ email: user.email, id: user.id })
	// 	);
	// 	return isAuthenticated;
	// }

	private async createKeyCardsForUser(user: AdapterUser): Promise<KeyCards> {
		return safeExecute(
			() => this.strategy.createKeyCards(user),
			this.logger,
			{
				message: "Failed to create keycards",
				error: KeyCardCreationError,
			},
			createLogContext({ email: user.email, id: user.id })
		);
	}

	async logout(keyCards: KeyCards | undefined | null): Promise<AuthState> {
		if (!keyCards) {
			return {
				authenticated: false,
				user: null,
				keyCards: null,
				error: null,
			}; // all ready logged out
		}
		return await this.strategy.logout(keyCards);
	}

	/**
	 * Registers a new OAuth provider.
	 * @param name Unique name/key for the provider.
	 * @param provider Instance of a class extending AbstractOAuthProvider.
	 */
	public registerProvider(key: string, provider: AuthProvider): void {
		if (this.providers[key]) {
			throw new Error(
				`Provider with key "${key}" is already registered.`
			);
		}
		this.providers[key] = provider;
	}

	// async refresh(keyCards: KeyCards): Promise<ImprovedAuthState> {
	// 	// // optional supports refresh?
	// 	// if (!this.strategy.supportsRefresh())
	// 	// 	return Promise.resolve({ isLoggedIn: false });

	// 	if (!keyCards) throw new Error("No key cards found");

	// 	const validateResult = await this.strategy.validateRefresh(keyCards);
	// 	console.log("validateResult: ", validateResult);

	// 	if (validateResult.valid) {
	// 		const user = await this.adapter.getUser(validateResult.user.id);
	// 		console.log("user: ", user);
	// 		const keyCards = await this.strategy.createKeyCards(user);
	// 		return { isLoggedIn: true, keyCards, user };
	// 	} else {
	// 		return { isLoggedIn: false };
	// 	}
	// }

	async validate(keyCards: KeyCards): Promise<AuthResult> {
		// TO-DO decide how to deal with missing keycards
		// its probably early on the game
		if (!keyCards) {
			return {
				type: "error",
				error: new KeyCardMissingError("No keycards found"),
			};
		}

		const result = await this.strategy.validate(keyCards);

		if (result.type === "success") {
			this.logger.info("Keycards validated", {
				userId: result.authState.user.id,
				email: result.authState.user.email,
			});
			return result;
		} else if (result.type === "refresh") {
			let user = await this.adapter.getUser(result.authState.user.id);
			// TODO - add roles to user object
			user = await this.authorizationManager.addRolesToUser(user);
			const keyCards = await this.strategy.createKeyCards(user);
			return {
				type: "success",
				authState: {
					user,
					authenticated: true,
					keyCards,
				},
			};
			// pull user info from DB
			// create new keycards
		}

		// console.log("AUTH.VALIDATE RESULT: ", result);
		if (result.type === "error") {
			// log the error
			this.logger.error("Failed to validate keycards", {
				message: result.error?.message,
			});
		}
		return result;
	}

	// async signup(credentials: Credentials): Promise<AuthState> {
	// 	// return this.strategy.signup(credentials);
	// 	// Step 1: Validate input
	// 	// TO-DO Zod input validation

	// 	try {
	// 		this.logger.info("Signing up user", {
	// 			email: credentials.email,
	// 		});

	// 		// Step 2: Check if user already exists
	// 		const existingUser = await this.adapter.getUserByEmail(
	// 			credentials.email
	// 		);
	// 		if (existingUser) {
	// 			this.logger.error("An account with that email already exists");
	// 			throw new AccountAlreadyExistsError(credentials.email);
	// 		}

	// 		// Step 3: Hash the password
	// 		const hashedPassword = await this.passwordService.hash(
	// 			credentials.password
	// 		);
	// 		credentials.password = hashedPassword;

	// 		// Step 4: Create the user
	// 		const user = await this.adapter.createUserWithoutId(credentials);

	// 		// Step 5: Create the auth state
	// 		const keyCards = await this.strategy.createKeyCards(user);

	// 		// Step 6: Return the auth state
	// 		return { authenticated: true, keyCards, user };
	// 		// return { accessToken: "", refreshToken: "" };
	// 	} catch (error) {
	// 		this.logger.error("Error while signing up: ", {
	// 			error,
	// 		});
	// 		return { authenticated: false, keyCards: null, user: null, error };
	// 	}
	// }

	// Assuming this is a method on your auth system
	listProviders(): DisplayProvider[] {
		return Object.values(this.providers).map((provider) => ({
			name: provider.name,
			key: provider.key,
			style: provider.style,
		}));
	}

	/**
	 * Registers a new OAuth provider.
	 * @param provider Instance of a class extending AbstractOAuthProvider.
	 */
	public addProvider(provider: AuthProvider): void {
		const name = provider.name;
		if (this.providers[name]) {
			throw new Error(
				`Provider with name "${name}" is already registered.`
			);
		}
		this.providers[name] = provider;
	}

	async generateCsrfToken(): Promise<string> {
		return crypto.randomBytes(32).toString("hex");
	}

	static generateCsrfToken(): Promise<string> | string {
		return crypto.randomBytes(32).toString("hex");
	}

	// Validate a CSRF token
	async validateCsrfToken(
		requestToken: string,
		storedToken: string
	): Promise<void> {
		if (!requestToken || requestToken !== storedToken) {
			throw new CsrfError("Invalid CSRF token");
		}
	}

	static create(config: AuthConfig): AuthSystem {
		let strategy: AuthStrategy;
		if (config.strategy === "jwt") {
			strategy = new JwtStrategy(config.jwtConfig);
		} else if (config.strategy === "session") {
			throw new Error("Session strategy not implemented yet");
		} else {
			throw new Error("Invalid strategy");
		}

		const logger = createLogger(config.logger);

		if (!config.adapter) {
			logger.warn("You will be using no persistence adapter");
		}

		const authSystem = new AuthSystem(
			strategy,
			config.adapter,
			config.authz,
			logger
		);

		authSystem.authorizationManager.seed();

		// console.log("AUTH CONFIG:", config);

		for (const provider of config.providers || []) {
			authSystem.registerProvider(provider.key, provider);
		}

		return authSystem;
	}
}

export * from "./index.types";
