import {
	AuthStrategy,
	UserPublic as User,
	AuthState,
	KeyCards,
	KeyCard,
	AuthResult,
    Logger,
} from "../../types";
import { JwtConfig } from "./index.types";
// import { User } from "../../../auth-system/index.types";
// import { JwtTokenService } from "../../token-service";
import { JwtTokenService, TokenService } from "./token-service";
import { expiresInToSeconds } from "../../utils";
import {
	ExpiredKeyCardError,
	InvalidKeyCardError,
	KeyCardCreationError,
	KeyCardMissingError,
	AuthError,
	UnknownAuthError,
} from "../../error";
// import { createLogger } from "@pete_keen/logger";
import type { RBAC } from "../../../authorization";

// const logger = createLogger({});

// export class JwtStrategy implements AuthStrategy {
// 	private tokenService: TokenService;
// 	private authorizationManager: RBAC;
// 	constructor(private config: JwtConfig, authorizationManager: RBAC) {
// 		this.config = config;
// 		this.tokenService = JwtTokenService(); // for now lets get away from classes and into functions
// 		this.authorizationManager = authorizationManager;
// 	}

// 	async createKeyCards(user: User): Promise<KeyCards> {
// 		try {
// 			const keyCards: KeyCards = [];

// 			const accessToken = await this.tokenService.generate(
// 				{ user },
// 				this.config.access
// 			);
// 			const refreshToken = await this.tokenService.generate(
// 				{ user },
// 				this.config.refresh
// 			);
// 			const accessKeyCard: KeyCard = {
// 				name: this.config.access.name,
// 				value: accessToken,
// 				type: "access",
// 				storageOptions: {
// 					httpOnly: true,
// 					secure: process.env.NODE_ENV === "production",
// 					path: "/",
// 					maxAge: expiresInToSeconds(this.config.access.expiresIn),
// 					sameSite: "lax",
// 				},
// 			};
// 			const refreshKeyCard: KeyCard = {
// 				name: this.config.refresh.name,
// 				value: refreshToken,
// 				type: "refresh",
// 				storageOptions: {
// 					httpOnly: true,
// 					secure: process.env.NODE_ENV === "production",
// 					path: "/",
// 					maxAge: expiresInToSeconds(this.config.refresh.expiresIn),
// 					sameSite: "lax",
// 				},
// 			};
// 			keyCards.push(accessKeyCard);
// 			keyCards.push(refreshKeyCard);
// 			return keyCards;
// 		} catch (error) {
// 			throw new KeyCardCreationError("Key Card Creation Failed");
// 		}
// 	}

// 	async logout(keyCards: KeyCards): Promise<AuthState> {
// 		return Promise.resolve({
// 			authenticated: false,
// 			user: null,
// 			keyCards: null,
// 			error: null,
// 		});
// 	}

// 	async validate(keyCards: KeyCards): Promise<AuthResult> {
// 		try {
// 			// console.log("keyCards: ", keyCards);
// 			const accessState = await this.validateCard(keyCards, "access");
// 			if (accessState.authenticated) {
// 				logger.info("Keycards validated", {
// 					userId: accessState.user.id,
// 					email: accessState.user.email,
// 				});
// 				return {
// 					type: "success",
// 					authState: accessState,
// 				};
// 			}
// 			const refreshState = await this.validateCard(keyCards, "refresh");
// 			if (refreshState.authenticated) {
// 				logger.info("Refresh keycard validated", {
// 					userId: refreshState.user.id,
// 					email: refreshState.user.email,
// 				});
// 				// TO-DO - Add DB check here, dont just refresh the cards
// 				const newKeyCards = await this.createKeyCards(
// 					refreshState.user
// 				);
// 				return {
// 					type: "refresh",
// 					authState: {
// 						...refreshState,
// 						keyCards: newKeyCards,
// 					},
// 				};
// 			}
// 		} catch (error) {
// 			return {
// 				type: "error",
// 				error,
// 			};
// 		}
// 	}

// 	private async validateCard(
// 		keyCards: KeyCards,
// 		name: string
// 	): Promise<AuthState> {
// 		try {
// 			const card = keyCards.find((keyCard) => keyCard.name === name);
// 			if (!card) {
// 				throw new KeyCardMissingError(`${name} Key Card Missing`);
// 			}
// 			const result = await this.tokenService.validate(
// 				card.value,
// 				this.config[name]
// 			);
// 			return {
// 				authenticated: true,
// 				user: result.user,
// 				keyCards,
// 			};
// 		} catch (error) {
// 			if (error instanceof AuthError) {
// 				logger.warn(`${name} keycard not validated`, {
// 					error,
// 				});
// 				return {
// 					authenticated: false,
// 					error,
// 					user: null,
// 					keyCards: null,
// 				};
// 			} else {
// 				logger.warn(`${name} keycard not validated - unknown error`, {
// 					error,
// 				});
// 				return {
// 					authenticated: false,
// 					user: null,
// 					keyCards: null,
// 					error: new UnknownAuthError("Unknown error"),
// 				};
// 			}
// 		}
// 	}

// 	supportsRefresh(): boolean {
// 		// TO-DO decide if this is needed
// 		return true;
// 	}
// }

export const JwtStrategyFn = (config: JwtConfig, logger: Logger): AuthStrategy => {
	const tokenService = JwtTokenService(); // for now lets get away from classes and into functions

	const validateCard = async (
		keyCards: KeyCards,
		name: string
	): Promise<AuthState> => {
		try {
			const card = keyCards.find((keyCard) => keyCard.name === name);
			if (!card) {
				throw new KeyCardMissingError(`${name} Key Card Missing`);
			}
			const result = await tokenService.validate(
				card.value,
				config[name]
			);
			// console.log("VAIDATION RESULT: ", result);
			return {
				authenticated: true,
				user: result.user,
				keyCards,
			};
		} catch (error) {
			if (error instanceof AuthError) {
				logger.warn(`${name} keycard not validated`, {
					error,
				});
				return {
					authenticated: false,
					error,
					user: null,
					keyCards: null,
				};
			} else {
				logger.warn(`${name} keycard not validated - unknown error`, {
					error,
				});
				return {
					authenticated: false,
					user: null,
					keyCards: null,
					error: new UnknownAuthError("Unknown error"),
				};
			}
		}
	};

	return {
		name: "jwt",
		createKeyCards: async (user: User): Promise<KeyCards> => {
			try {
				const keyCards: KeyCards = [];

				const accessToken = await tokenService.generate(
					{ user },
					config.access
				);
				const refreshToken = await tokenService.generate(
					{ user: { id: user.id } },
					config.refresh
				);
				const accessKeyCard: KeyCard = {
					name: config.access.name,
					value: accessToken,
					type: "access",
				};
				const refreshKeyCard: KeyCard = {
					name: config.refresh.name,
					value: refreshToken,
					type: "refresh",
				};
				keyCards.push(accessKeyCard);
				keyCards.push(refreshKeyCard);
				return keyCards;
			} catch (error) {
				throw new KeyCardCreationError("Key Card Creation Failed");
			}
		},
		validate: async (keyCards: KeyCards): Promise<AuthResult> => {
			try {
				// console.log("JWT CONFIG: ", config);
				// console.log("JWT VALIDATE");
				const accessState = await validateCard(keyCards, "access");
				// console.log("accessState: ", accessState);
				if (accessState.authenticated) {
					logger.info("Keycards validated", {
						userId: accessState.user.id,
						email: accessState.user.email,
					});
					return {
						type: "success",
						authState: accessState,
					};
				}
				const refreshState = await validateCard(keyCards, "refresh");
				if (refreshState.authenticated) {
					logger.info("Refresh keycard validated", {
						userId: refreshState.user.id,
						// email: refreshState.user.email,
					});
					return {
						type: "refresh",
						authState: refreshState, // This is still an old state so keycards must be remade in auth system
					};
				} else {
					return {
						type: "error",
						error: new InvalidKeyCardError("Invalid Key Card"),
					};
				}
			} catch (error) {
				return {
					type: "error",
					error,
				};
			}
		},
		// TODO add sign out
		logout: async (keyCards: KeyCards): Promise<AuthState> => {
			return Promise.resolve({
				authenticated: false,
				user: null,
				keyCards: null,
				error: null,
			});
		},
		supportsRefresh: () => {
			// TO-DO decide if this is needed
			return true;
		},
	};
};
