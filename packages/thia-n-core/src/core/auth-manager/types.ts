import { Adapter } from "core/adapter";
import { AuthProvider } from "core/providers";
import { Logger, LoggerOptions } from "@pete_keen/logger";
import {
	AuthResult,
	AuthState,
	KeyCards,
	UserPublic as User,
} from "core/types";
import { JwtConfig } from "core/session-strategy/jwt-strategy/index.types";
import { SessionConfig } from "core/session-strategy/db-strategy/index.types";
import { SignInParams } from "core/signin-system";

// --- Calbacks Type ---
// export interface AuthNCallbacks<Extra = {}> {
// 	enrichUser: (user: User) => Promise<User & Extra>;
// 	onUserCreated?: (user: User) => Promise<void> | void;
// 	onUserUpdated?: (user: User) => Promise<void>;
// 	onUserDeleted?: (user: User) => Promise<void>;
// }

export type AugmentUserData<Extra> = (userId: string) => Promise<Extra>;

export interface AuthNCallbacks<Extra = {}> {
	augmentUserData: AugmentUserData<Extra>;
	onUserCreated?: (user: User) => Promise<void>;
	onUserUpdated?: (user: User) => Promise<void>;
	onUserDeleted?: (user: User) => Promise<void>;
}

// --- AuthN Config Types ----
export interface AuthConfigBase<Extra = {}> {
	adapter: Adapter;
	logger?: Logger;
	loggerOptions?: LoggerOptions;
	providers?: AuthProvider[];
	callbacks?: AuthNCallbacks<Extra>;
}

export type AuthConfig<Extra = {}> =
	| (AuthConfigBase<Extra> & { strategy: "jwt"; jwtConfig: JwtConfig })
	| (AuthConfigBase<Extra> & {
			strategy: "session";
			sessionConfig: SessionConfig;
	  });

// --- Auth Manager Interface ---
export interface IAuthManager<Extra = {}> {
	login: (params: SignInParams) => Promise<AuthResult<Extra>>;
	validate: (keyCards: KeyCards) => Promise<AuthResult<Extra>>;
	signOut: (
		keyCards: KeyCards | null | undefined
	) => Promise<AuthState<Extra>>;
	listProviders: () => DisplayProvider[];
	callbacks: AuthNCallbacks<Extra>; // ✅ expose it here
}

// --- Utility ---
export type InferUserType<T extends IAuthManager<any>> = T extends IAuthManager<
	infer U
>
	? User & U
	: User;

export type DisplayProvider = {
	name: string;
	key: string;
	style: {
		text: string;
		bg: string;
	};
};
