import { z } from "zod";

export const accountProviderType = z.enum([
	"oidc",
	"oauth",
	"email",
	"credentials",
]);
export type AccountProviderType = z.infer<typeof accountProviderType>;

export const account = z.object({
	userId: z.string(),
	type: accountProviderType,
	/**
	 * This value depends on the type of the provider being used to create the account.
	 * - oauth/oidc: The OAuth account's id, returned from the `profile()` callback.
	 * - email: The user's email address.
	 * - credentials: `id` returned from the `authorize()` callback
	 */
	providerAccountId: z.string(),
	/** Provider's id for this account. - should be an enum - TODO -- E.g. "google". See the full list at https://authjs.dev/reference/core/providers */
	provider: z.string(),
	access_token: z.string().optional(),
	expires_at: z.number().optional(),
	token_type: z.string().optional(),
	scope: z.string().optional(),
	refresh_token: z.string().optional(),
	id_token: z.string().optional(),
	session_state: z.string().optional(),
});

export interface AdapterAccount {
	/**
	 * id of the user this account belongs to
	 *
	 * @see https://authjs.dev/reference/core/adapters#adapteruser
	 */
	userId?: string;

	/** Provider's id for this account. E.g. "google". See the full list at https://authjs.dev/reference/core/providers */
	provider: string;
	/**
	 * This value depends on the type of the provider being used to create the account.
	 * - oauth/oidc: The OAuth account's id, returned from the `profile()` callback.
	 * - email: The user's email address.
	 * - credentials: `id` returned from the `authorize()` callback
	 */
	providerAccountId: string;
	/** Provider's type for this account */
	type: ProviderType;

	access_token?: string;
	expires_at?: number;
	token_type?: string;
	scope?: string;
	refresh_token?: string;
	id_token?: string;
	session_state?: string;
}

export type ProviderType = "oidc" | "oauth" | "email" | "credentials";
