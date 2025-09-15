// import { JWTPayload } from "jose";
// import { User } from "entities";

// export interface RefreshUser {
// 	id: string;
// }

// export interface AccessUser {
// 	id: string;
// 	email: string;
// 	name?: string;
// 	image?: string;
// 	// roles?: object;
// }

// export interface AuthPayload<A = {}> extends JWTPayload {
// 	user: (AccessUser & A) | RefreshUser;
// }

// export interface JwtOptions {
// 	name: string;
// 	secretKey: string;
// 	algorithm: string;
// 	expiresIn: string;
// 	fields?: string[];
// }

// export interface VerifiedToken<A = {}> {
// 	user: User & A;
// 	expiresAt: number;
// }
// /*
//     Token service interface
// */
// export interface TokenServicePort<A = {}> {
// 	generate: (payload: AuthPayload<A>, options: JwtOptions) => Promise<string>;
// 	validate: (token: string, options: JwtOptions) => Promise<VerifiedToken<A>>;
// 	// verify: (token: string, options: JwtOptions) => Promise<User>; // return user now
// 	// revoke: (token: string) => Promise<void>;
// 	// refresh: (refreshToken: string) => Promise<TokenResponse>;
// }

import type { JWTPayload, JWSHeaderParameters } from "jose";

// Minimal, stable claims your app understands
export type AccessClaims = JWTPayload & {
	typ: "access";
	sub: string; // user id
	email?: string; // optional, if you choose to embed
	// roles?: string[]; // or scopes
};

export type RefreshClaims = JWTPayload & {
	typ: "refresh";
	sub: string; // user id
	jti: string; // token id (revocation)
};

// Verification result is generic over the claims you expect
export type Verified<C> = {
	claims: C;
	expiresAt?: number; // ms since epoch if exp exists
	header: JWSHeaderParameters;
};

export type SignOptions = {
	key: Uint8Array | CryptoKey; // secret or private key
	alg: "HS256" | "RS256" | string;
	issuer?: string;
	audience?: string | string[];
	subject?: string;
	expiresIn?: string | number; // "15m", 900, etc.
	// name: string;
};

// export interface JwtConfig {
//     access: JwtOptions;
//     refresh: JwtOptions;
// }

export interface JwtOptions {
	secretKey: string;
	algorithm: string;
	expiresIn: string;
	fields?: string[];
}

export type VerifyOptions = Omit<SignOptions, "expiresIn"> & {
	key: Uint8Array | CryptoKey; // public key for RS*, same secret for HS*
};

import { z } from "zod";

export interface TokenServicePort {
	sign<C extends object>(claims: C, opts: SignOptions): Promise<string>;

	verify<C extends object>(
		token: string,
		opts: VerifyOptions,
		guard?: (p: unknown) => p is C // optional runtime check
	): Promise<Verified<C>>;
}
