import { User } from "../../../auth-system/index.types";
import { type JWTPayload } from "jose";

export interface JwtOptions {
	name: string;
	secretKey: string;
	algorithm: string;
	expiresIn: string;
	fields?: string[];
}

export interface VerifiedToken {
	user: User;
	expiresAt: number;
}

export interface RefreshUser {
	id: string;
}

export interface AccessUser {
	id: string;
	email: string;
	name?: string;
	image?: string;
	roles?: object;
}

/*
 * Payload interface
 */
export interface AccessTokenPayload extends JWTPayload {
	id: string; // User ID
	email: string; // User email
	name: string; // User name
	image: string; // User image
	roles: object; // User role
}

export interface RefreshTokenPayload extends JWTPayload {
	id: string; // User ID
}

export interface AuthPayload extends JWTPayload {
	user: AccessUser | RefreshUser;
}

/*
    Token service interface 
*/
export interface TokenService {
	generate: (payload: AuthPayload, options: JwtOptions) => Promise<string>;
	validate: (token: string, options: JwtOptions) => Promise<VerifiedToken>;
	// verify: (token: string, options: JwtOptions) => Promise<User>; // return user now
	// revoke: (token: string) => Promise<void>;
	// refresh: (refreshToken: string) => Promise<TokenResponse>;
}
