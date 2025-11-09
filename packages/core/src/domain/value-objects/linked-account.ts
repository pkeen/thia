// import { z } from "zod";

import { AccountId, Provider, ProviderAccountId } from "../primitives";

// export const accountProviderType = z.enum([
// 	"oidc",
// 	"oauth",
// 	"email",
// 	"credentials",
// ]);
// export type AccountProviderType = z.infer<typeof accountProviderType>;

export const ACCOUNT_TYPES = [
	"oidc",
	"email",
	"oauth",
	"credentials",
] as const satisfies readonly [string, ...string[]];
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// export interface Account {
// 	/**
// 	 * id of the user this account belongs to
// 	 */
// 	userId: string;
// 	type: AccountTypes;

// 	provider: string;

// 	providerAccountId: string;
// 	/** Provider's type for this account */

// 	access_token?: string;
// 	expires_at?: number;
// 	token_type?: string;
// 	scope?: string;
// 	refresh_token?: string;
// 	id_token?: string;
// 	session_state?: string;
// }

// account.ts
// export type AccountType = "oauth" | "oidc" | "email" | "credentials"; // example

export class LinkedAccount {
	private constructor(
		// public readonly id: AccountId, // Not sure if this is needed make it VO or entity?
		public readonly type: AccountType,
		public readonly provider: Provider,
		public readonly providerAccountId: ProviderAccountId,
		public readonly accessToken?: string,
		public readonly refreshToken?: string,
		public readonly expiresAt?: number,
		public readonly scope?: string,
		public readonly tokenType?: string,
		public readonly idToken?: string,
		public readonly sessionState?: string
	) {}

	static link(input: {
		// id: AccountId;
		type: AccountType;
		provider: Provider | string;
		providerAccountId: ProviderAccountId | string;
		accessToken?: string;
		refreshToken?: string;
		expiresAt?: number;
		scope?: string;
		tokenType?: string;
		idToken?: string;
		sessionState?: string;
	}): LinkedAccount {
		const provider =
			typeof input.provider === "string"
				? Provider(input.provider)
				: input.provider;
		const providerAccountId =
			typeof input.providerAccountId === "string"
				? ProviderAccountId(input.providerAccountId)
				: input.providerAccountId;

		return new LinkedAccount(
			// input.id,
			input.type,
			provider,
			providerAccountId,
			input.accessToken,
			input.refreshToken,
			input.expiresAt,
			input.scope,
			input.tokenType,
			input.idToken,
			input.sessionState
		);
	}

	equals(other: LinkedAccount): boolean {
		// equality by provider+providerAccountId (natural key)
		return (
			this.provider === other.provider &&
			this.providerAccountId === other.providerAccountId
		);
	}
}
