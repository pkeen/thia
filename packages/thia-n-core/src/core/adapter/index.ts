import { UserPublic } from "../types";
import { SignupCredentials } from "../providers/credentials/index.types";
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
export interface AdapterUser extends UserPublic {
	/** A unique identifier for the user. */
	id: string;
	/** The user's email address. */
	email: string;
	/**
	 * Whether the user has verified their email address via an [Email provider](https://authjs.dev/getting-started/authentication/email).
	 * It is `null` if the user has not signed in with the Email provider yet, or the date of the first successful signin.
	 */
	emailVerified: Date | null;

	/*
	 * TBD if image is required
	 */
	// image?: string | null;
	// /**
	//  * Password - this may be used for credential based sign in only - for now thats the only way
	//  * Should be optional
	//  * Or COMPLETELY UNUSED
	//  */
	// password?: string;
}

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

// From next auth
/**
 * An adapter is an object with function properties (methods) that read and write data from a data source.
 * Think of these methods as a way to normalize the data layer to common interfaces that Auth.js can understand.
 *
 * This is what makes Auth.js very flexible and allows it to be used with any data layer.
 *
 * The adapter methods are used to perform the following operations:
 * - Create/update/delete a user
 * - Link/unlink an account to/from a user
 * - Handle active sessions
 * - Support passwordless authentication across multiple devices
 *
 * :::note
 * If any of the methods are not implemented, but are called by Auth.js,
 * an error will be shown to the user and the operation will fail.
 * :::
 */
export interface Adapter {
	/*
	 * indentifier
	 */
	name: string;
	/**
	 * Creates a user in the database and returns it.
	 *
	 * See also [User management](https://authjs.dev/guides/creating-a-database-adapter#user-management)
	 */
	createUserWithId(user: AdapterUser): Promise<AdapterUser>;
	/**
	 * My createUser method
	 * The trouble with NextAuths createUser is that it takes an AdapterUser which requires an id field
	 * When signing up a user with email and password, the id field is not required
	 * So I need to create a createUser method that takes a user without an id field
	 *
	 */
	createUser(user: CreateUser): Promise<AdapterUser>;

	/**
	 *
	 * @param user: UserProfile
	 * This method creates a user from an account that has been authenticated with an identity provider
	 */
	createUserFromAccount(user: CreateUser): Promise<AdapterUser>;
	/**
	 * Returns a user from the database via the user id.
	 *
	 * See also [User management](https://authjs.dev/guides/creating-a-database-adapter#user-management)
	 */
	getUser(id: string): Promise<AdapterUser | null>;
	/**
	 * Returns a user from the database via the user's email address.
	 *
	 * See also [Verification tokens](https://authjs.dev/guides/creating-a-database-adapter#verification-tokens)
	 */
	getUserByEmail(email: string): Promise<AdapterUser | null>;
	/**
	 * Using the provider id and the id of the user for a specific account, get the user.
	 *
	 * See also [User management](https://authjs.dev/guides/creating-a-database-adapter#user-management)
	 */

	createAccountForUser(
		user: AdapterUser,
		account: AdapterAccount
	): Promise<void>;

	getAccount(
		providerAccountId: string,
		provider: string
	): Promise<AdapterAccount | null>;

	updateAccount(account: AdapterAccount): Promise<void>;

	/**
	 * Im working my way through this slowly so this will be implemented later
	 */
	// getUserByAccount?(
	// 	providerAccountId: Pick<
	// 		AdapterAccount,
	// 		"provider" | "providerAccountId"
	// 	>
	// ): Awaitable<AdapterUser | null>;
	// /**
	//  * Updates a user in the database and returns it.
	//  *
	//  * See also [User management](https://authjs.dev/guides/creating-a-database-adapter#user-management)
	//  */
	updateUser(
		user: Partial<AdapterUser> & Pick<AdapterUser, "id">
	): Promise<AdapterUser>;
	/**
	 * @todo This method is currently not invoked yet.
	 *
	 * See also [User management](https://authjs.dev/guides/creating-a-database-adapter#user-management)
	 */
	// deleteUser?(
	// 	userId: string
	// ): Promise<void> | Awaitable<AdapterUser | null | undefined>;
	// /**
	//  * This method is invoked internally (but optionally can be used for manual linking).
	//  * It creates an [Account](https://authjs.dev/reference/core/adapters#models) in the database.
	//  *
	//  * See also [User management](https://authjs.dev/guides/creating-a-database-adapter#user-management)
	//  */
	// linkAccount?(
	// 	account: AdapterAccount
	// ): Promise<void> | Awaitable<AdapterAccount | null | undefined>;
	// /** @todo This method is currently not invoked yet. */
	// unlinkAccount?(
	// 	providerAccountId: Pick<
	// 		AdapterAccount,
	// 		"provider" | "providerAccountId"
	// 	>
	// ): Promise<void> | Awaitable<AdapterAccount | undefined>;
	// /**
	//  * Creates a session for the user and returns it.
	//  *
	//  * See also [Database Session management](https://authjs.dev/guides/creating-a-database-adapter#database-session-management)
	//  */
	// createSession?(session: {
	// 	sessionToken: string;
	// 	userId: string;
	// 	expires: Date;
	// }): Awaitable<AdapterSession>;
	// /**
	//  * Returns a session and a userfrom the database in one go.
	//  *
	//  * :::tip
	//  * If the database supports joins, it's recommended to reduce the number of database queries.
	//  * :::
	//  *
	//  * See also [Database Session management](https://authjs.dev/guides/creating-a-database-adapter#database-session-management)
	//  */
	// getSessionAndUser?(
	// 	sessionToken: string
	// ): Awaitable<{ session: AdapterSession; user: AdapterUser } | null>;
	// /**
	//  * Updates a session in the database and returns it.
	//  *
	//  * See also [Database Session management](https://authjs.dev/guides/creating-a-database-adapter#database-session-management)
	//  */
	// updateSession?(
	// 	session: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">
	// ): Awaitable<AdapterSession | null | undefined>;
	// /**
	//  * Deletes a session from the database. It is preferred that this method also
	//  * returns the session that is being deleted for logging purposes.
	//  *
	//  * See also [Database Session management](https://authjs.dev/guides/creating-a-database-adapter#database-session-management)
	//  */
	// deleteSession?(
	// 	sessionToken: string
	// ): Promise<void> | Awaitable<AdapterSession | null | undefined>;
	// /**
	//  * Creates a verification token and returns it.
	//  *
	//  * See also [Verification tokens](https://authjs.dev/guides/creating-a-database-adapter#verification-tokens)
	//  */
	// createVerificationToken?(
	// 	verificationToken: VerificationToken
	// ): Awaitable<VerificationToken | null | undefined>;
	// /**
	//  * Return verification token from the database and deletes it
	//  * so it can only be used once.
	//  *
	//  * See also [Verification tokens](https://authjs.dev/guides/creating-a-database-adapter#verification-tokens)
	//  */
	// useVerificationToken?(params: {
	// 	identifier: string;
	// 	token: string;
	// }): Awaitable<VerificationToken | null>;
	// /**
	//  * Get account by provider account id and provider.
	//  *
	//  * If an account is not found, the adapter must return `null`.
	//  */
	// getAccount?(
	// 	providerAccountId: AdapterAccount["providerAccountId"],
	// 	provider: AdapterAccount["provider"]
	// ): Awaitable<AdapterAccount | null>;
	// /**
	//  * Returns an authenticator from its credentialID.
	//  *
	//  * If an authenticator is not found, the adapter must return `null`.
	//  */
	// getAuthenticator?(
	// 	credentialID: AdapterAuthenticator["credentialID"]
	// ): Awaitable<AdapterAuthenticator | null>;
	// /**
	//  * Create a new authenticator.
	//  *
	//  * If the creation fails, the adapter must throw an error.
	//  */
	// createAuthenticator?(
	// 	authenticator: AdapterAuthenticator
	// ): Awaitable<AdapterAuthenticator>;
	// /**
	//  * Returns all authenticators from a user.
	//  *
	//  * If a user is not found, the adapter should still return an empty array.
	//  * If the retrieval fails for some other reason, the adapter must throw an error.
	//  */
	// listAuthenticatorsByUserId?(
	// 	userId: AdapterAuthenticator["userId"]
	// ): Awaitable<AdapterAuthenticator[]>;
	// /**
	//  * Updates an authenticator's counter.
	//  *
	//  * If the update fails, the adapter must throw an error.
	//  */
	// updateAuthenticatorCounter?(
	// 	credentialID: AdapterAuthenticator["credentialID"],
	// 	newCounter: AdapterAuthenticator["counter"]
	// ): Awaitable<AdapterAuthenticator>;
}
