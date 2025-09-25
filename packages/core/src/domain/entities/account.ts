// import { z } from "zod";

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
export type AccountTypes = (typeof ACCOUNT_TYPES)[number];

export interface Account {
	/**
	 * id of the user this account belongs to
	 */
	userId: string;
	type: AccountTypes;

	provider: string;

	providerAccountId: string;
	/** Provider's type for this account */

	access_token?: string;
	expires_at?: number;
	token_type?: string;
	scope?: string;
	refresh_token?: string;
	id_token?: string;
	session_state?: string;
}

// export type ProviderType = "oidc" | "oauth" | "email" | "credentials";
