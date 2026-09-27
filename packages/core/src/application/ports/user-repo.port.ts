import type { User } from "../../domain/entities/user";
import type { EmailAddress } from "../../domain/value-objects/email-address";
import type { UserId } from "../../domain/primitives/index";

export interface UserRepository {
	name: string; // identifier for debugging/metrics (fine)
	getById(id: UserId): Promise<User | null>;
	getByEmail(email: EmailAddress): Promise<User | null>;
	/**
	 * Inserts or updates the user. For an existing user this must NOT write
	 * the token version: a snapshot loaded before a revocation would otherwise
	 * undo it. Token versions change only through incrementTokenVersion.
	 */
	save(user: User): Promise<void>;

	/**
	 * Atomically adds one to the stored token version, invalidating every
	 * token issued with an earlier version (in user-validated session mode).
	 * Concurrent calls must each count. Returns the new version, or null if
	 * the user does not exist.
	 */
	incrementTokenVersion(id: UserId): Promise<number | null>;

	// Needed for OAuth / social login:
	getByProviderAccount(params: {
		provider: string;
		providerAccountId: string;
	}): Promise<User | null>;
}
