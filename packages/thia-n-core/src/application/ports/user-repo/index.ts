// import { UserPublic } from "../../../entities/user";
// import { SignupCredentials } from "../providers/credentials/index.types";
/**
 * WARNING: This module takes heavy influence from next auth.
 * Give credit to next auth.
 */

/**
 * A user represents a person who can sign in to the application.
 * If a user does not exist yet, it will be created when they sign in for the first time,
 * using the information (profile data) returned by the identity provider.
 * A corresponding account is also created and linked to the user.
 */
// export interface AdapterUser extends UserPublic {
// 	/** A unique identifier for the user. */
// 	id: string;
// 	/** The user's email address. */
// 	email: string;
// 	/**
// 	 * Whether the user has verified their email address via an [Email provider](https://authjs.dev/getting-started/authentication/email).
// 	 * It is `null` if the user has not signed in with the Email provider yet, or the date of the first successful signin.
// 	 */
// 	emailVerified: Date | null;

// 	/*
// 	 * TBD if image is required
// 	 */
// 	// image?: string | null;
// 	// /**
// 	//  * Password - this may be used for credential based sign in only - for now thats the only way
// 	//  * Should be optional
// 	//  * Or COMPLETELY UNUSED
// 	//  */
// 	// password?: string;
// }

export interface CreateUser {
	email: string;
	name?: string;
	image?: string;
}

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

