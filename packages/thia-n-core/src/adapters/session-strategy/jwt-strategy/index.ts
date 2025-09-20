// import {
// 	AuthStrategy,
// 	UserPublic as User,
// 	AuthState,
// 	Keycard[],
// 	KeyCard,
// 	AuthResult,
//     Logger,
// } from "../../types";
import { User, Keycard, UserPublic } from "entities";
// import { JwtConfig } from "./index.types";
// import { User } from "../../../auth-system/index.types";
// import { JwtTokenService } from "../../token-service";
import { JwtTokenService, TokenService } from "./token-service";
// import { expiresInToSeconds } from "../../utils";
import {
	ExpiredKeyCardError,
	InvalidKeyCardError,
	KeyCardCreationError,
	KeyCardMissingError,
	AuthError,
	UnknownAuthError,
} from "../../../entities/error";
// import { createLogger } from "@pete_keen/logger";
import type { RBAC } from "../../../authorization";
import { AuthStrategyPort } from "application";
import { LoggerPort } from "application/ports/logger";
import { SignOptions, TokenServicePort } from "./token-service-port";

// const logger = createLogger({});

// export class JwtStrategy implements AuthStrategy {
// 	private tokenService: TokenService;
// 	private authorizationManager: RBAC;
// 	constructor(private config: JwtConfig, authorizationManager: RBAC) {
// 		this.config = config;
// 		this.tokenService = JwtTokenService(); // for now lets get away from classes and into functions
// 		this.authorizationManager = authorizationManager;
// 	}

// 	async createKeyCards(user: User): Promise<Keycard[]> {
// 		try {
// 			const keyCards: Keycard[] = [];

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

// 	async logout(keyCards: Keycard[]): Promise<AuthState> {
// 		return Promise.resolve({
// 			authenticated: false,
// 			user: null,
// 			keyCards: null,
// 			error: null,
// 		});
// 	}

// 	async validate(keyCards: Keycard[]): Promise<AuthResult> {
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
// 		keyCards: Keycard[],
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

export interface JwtConfig {
	access: SignOptions;
	refresh: SignOptions;
}

export const JwtStrategy = (
	config: JwtConfig,
	logger: LoggerPort,
	tokenService: TokenServicePort
): AuthStrategyPort => {
	// const tokenService = JwtTokenService(); // for now lets get away from classes and into functions

	const validateCard = async (keyCards: Keycard[], name: string) => {
		try {
			const card = keyCards.find((keyCard) => keyCard.name === name);
			if (!card) {
				throw new KeyCardMissingError(`${name} Key Card Missing`);
			}
			const result = await tokenService.verify<UserPublic>(
				card.value,
				config[name]
			);
			// console.log("VAIDATION RESULT: ", result);
			return {
				// authenticated: true,
				user: result.claims,
				keyCards,
			};
		} catch (error) {
			if (error instanceof AuthError) {
				logger.warn(`${name} keycard not validated`, {
					error,
				});
				return {
					// authenticated: false,
					error,
					user: null,
					keyCards: null,
				};
			} else {
				logger.warn(`${name} keycard not validated - unknown error`, {
					error,
				});
				return {
					// authenticated: false,
					user: null,
					keyCards: null,
					error: new UnknownAuthError("Unknown error"),
				};
			}
		}
	};

	return {
		name: "jwt",
		createKeyCards: async (user: UserPublic): Promise<Keycard[]> => {
			try {
				const keyCards: Keycard[] = [];

				const accessToken = await tokenService.sign<UserPublic>(
					user,
					config.access
				);
				const refreshToken = await tokenService.sign<{ id: string }>(
					{ id: user.id },
					config.refresh
				);
				const accessKeyCard: Keycard = {
					name: "access",
					value: accessToken,
					type: "access",
				};
				const refreshKeyCard: Keycard = {
					name: "refresh",
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
		validate: async (keycards: Keycard[]) => {
			try {
				// console.log("JWT CONFIG: ", config);
				// console.log("JWT VALIDATE");
				const validateResult = await validateCard(keycards, "access");
				// console.log("accessState: ", accessState);
				if (!validateResult.error) {
					logger.info("Keycards validated", {
						userId: validateResult.user.id,
						email: validateResult.user.email,
					});
					return {
						ok: true,
						value: validateResult,
					};
				}
				const refreshState = await validateCard(keycards, "refresh");
				if (!refreshState.error) {
					logger.info("Refresh keycard validated", {
						userId: refreshState.user.id,
						// email: refreshState.user.email,
					});
					return {
						ok: true,
						value: refreshState, // This is still an old state so keycards must be remade in auth system
					};
				} else {
					return {
						ok: false,
						error: new InvalidKeyCardError("Invalid Key Card"),
					};
				}
			} catch (error) {
				return {
					ok: false,
					error,
				};
			}
		},
		// TODO add sign out
		logout: async (keycards: Keycard[]) => {
			return Promise.resolve({
				ok: true,
				value: {
					user: null,
					keyCards: null,
				},
			});
		},
		supportsRefresh: () => {
			// TO-DO decide if this is needed
			return true;
		},
	};
};
