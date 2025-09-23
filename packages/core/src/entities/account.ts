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

// export const account = z.object({
// 	userId: z.string(),
// 	type: accountProviderType,
// 	/**
// 	 * This value depends on the type of the provider being used to create the account.
// 	 * - oauth/oidc: The OAuth account's id, returned from the `profile()` callback.
// 	 * - email: The user's email address.
// 	 * - credentials: `id` returned from the `authorize()` callback
// 	 */
// 	providerAccountId: z.string(),
// 	/** Provider's id for this account. - should be an enum - TODO -- E.g. "google". See the full list at https://authjs.dev/reference/core/providers */
// 	provider: z.string(),
// 	access_token: z.string().optional(),
// 	expires_at: z.number().optional(),
// 	token_type: z.string().optional(),
// 	scope: z.string().optional(),
// 	refresh_token: z.string().optional(),
// 	id_token: z.string().optional(),
// 	session_state: z.string().optional(),
// });
// export type Account = z.infer<typeof account>

export type ProviderType = "oidc" | "oauth" | "email" | "credentials";
