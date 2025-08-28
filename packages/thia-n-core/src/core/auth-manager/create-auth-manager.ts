import { UserPublic as User } from "core/types";
import { AuthConfig, AuthNCallbacks, IAuthManager } from "./types";
import { JwtConfig } from "core/session-strategy/jwt-strategy/index.types";
import { SessionConfig } from "core/session-strategy/db-strategy/index.types";
import { JwtStrategyFn } from "core/session-strategy";
import { createLogger } from "@pete_keen/logger";
import { AuthManager } from ".";
// --- Level 1 the enrich function

// export function createEnrichUser<
// 	Fn extends (user: User) => Promise<User & Record<string, any>>
// >(fn: Fn): Fn {
// 	return fn;
// }

// --- Level 2 the Callbacks Level

// export function createAuthCallbacks<
// 	Fn extends (user: User) => Promise<User & Record<string, any>>,
// 	Extra = Fn extends (user: User) => Promise<infer R>
// 		? Omit<R, keyof User>
// 		: never
// >(callbacks: {
// 	enrichUser: Fn;
// 	onUserCreated?: (user: User) => Promise<void>;
// 	onUserUpdated?: (user: User) => Promise<void>;
// 	onUserDeleted?: (user: User) => Promise<void>;
// }): AuthNCallbacks<Extra> {
// 	return callbacks as AuthNCallbacks<Extra>;
// }
// export function createAuthCallbacks<
// 	Enrich extends (user: User) => Promise<User & Record<string, any>>,
// 	Extra = Enrich extends (user: User) => Promise<infer R>
// 		? Omit<R, keyof User>
// 		: never
// >(callbacks: {
// 	enrichUser: Enrich;
// 	onUserCreated?: (user: User) => Promise<void>;
// 	onUserUpdated?: (user: User) => Promise<void>;
// 	onUserDeleted?: (user: User) => Promise<void>;
// }): AuthNCallbacks<Extra> {
// 	return callbacks as AuthNCallbacks<Extra>;
// }

// export function createAuthCallbacks<
// 	Fn extends (user: User) => Promise<User & Record<string, any>>,
// 	Enriched = Awaited<ReturnType<Fn>>,
// 	Extra = Omit<Enriched, keyof User>
// >(callbacks: {
// 	enrichUser: Fn;
// 	onUserCreated?: (user: User) => Promise<void>;
// 	onUserUpdated?: (user: User) => Promise<void>;
// 	onUserDeleted?: (user: User) => Promise<void>;
// }): AuthNCallbacks<Extra> {
// 	return callbacks as AuthNCallbacks<Extra>;
// }

// export function createAuthCallbacks<
// 	Fn extends (user: User) => Promise<User & Record<string, any>>,
// 	Enriched = Awaited<ReturnType<Fn>>,
// 	Extra = Omit<Enriched, keyof User>
// >(callbacks: {
// 	enrichUser: Fn;
// 	onUserCreated?: (user: User) => Promise<void>;
// 	onUserUpdated?: (user: User) => Promise<void>;
// 	onUserDeleted?: (user: User) => Promise<void>;
// }): AuthNCallbacks<Extra> {
// 	return callbacks as AuthNCallbacks<Extra>;
// }
// export function createAuthCallbacks<
// 	Fn extends (user: User) => Promise<User & Record<string, any>>,
// 	Extra = Fn extends (user: User) => Promise<infer R>
// 		? Omit<R, keyof User>
// 		: never
// >(callbacks: {
// 	enrichUser: Fn;
// 	onUserCreated?: (user: User) => Promise<void>;
// 	onUserUpdated?: (user: User) => Promise<void>;
// 	onUserDeleted?: (user: User) => Promise<void>;
// }): AuthNCallbacks<Extra> {
// 	return callbacks as AuthNCallbacks<Extra>;
// }

export function createAuthCallbacks<Extra>(callbacks: AuthNCallbacks<Extra>) {
	return {
		augmentUserData: async (user: User) => {
			return {} as Extra;
		},
		onUserCreated: async () => {},
		onUserUpdated: async () => {},
		onUserDeleted: async () => {},
		...callbacks,
	};
}

// --- Level 3 the AuthManager Level

export function createAuthManager<Extra = {}>(
	config: AuthConfig<Extra>
): IAuthManager<Extra> {
	const logger =
		config.logger ??
		createLogger(config.loggerOptions ?? { level: "info", prefix: "Auth" });

	const strategy =
		config.strategy === "jwt"
			? JwtStrategyFn(config.jwtConfig, logger)
			: (() => {
					throw new Error("Session strategy not implemented, yet");
			  })();

	const callbacks = createAuthCallbacks(config.callbacks);

	return AuthManager(
		config.adapter,
		strategy,
		config.providers ?? [],
		logger,
		callbacks
	);
}
