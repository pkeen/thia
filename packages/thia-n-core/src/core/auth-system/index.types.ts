// import { LogLevel } from "@pete_keen/logger";
import { Adapter, AdapterUser } from "../adapter";
import { JwtConfig } from "../session-strategy/jwt-strategy/index.types";
import { SessionConfig } from "../session-strategy/db-strategy/index.types";
// import { ProviderOptions } from "../providers/index.types";
import {
	Credentials,
	SignupCredentials,
} from "../providers/credentials/index.types";
import { AuthState, KeyCards, Logger } from "../types";
import { AuthProvider } from "../providers/oauth/oauth-provider";
import { Role } from "../roles/index.types";

/*
Base User interface
*/
export interface User {
	id: string;
	name?: string | null;
	email?: string;
	image?: string | null;
}

// export interface IAuthSystem {
// 	// authenticate: (credentials: Credentials) => Promise<ImprovedAuthState>;
// 	authenticate: (credentials: Credentials) => Promise<AuthState>;
// 	// can: (user: User, action: string, resource: Resource) => boolean;
// 	// storageAdapter: WebStorageAdapter;
// 	signin: (provider: string) => Promise<AuthState>;

// 	signup: (credentials: SignupCredentials) => Promise<AuthState>;
// 	validate: (keyCards: KeyCards) => Promise<AuthState>;
// 	// refreshToken: (refreshToken: string) => Promise<AuthResult>;
// 	logout: (keyCards: KeyCards) => Promise<AuthState>;
// 	// refresh: (keyCards: KeyCards) => Promise<ImprovedAuthState>;
// }
