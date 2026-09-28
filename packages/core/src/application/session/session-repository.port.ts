// application/session/session-repository.port.ts
import type { UserId } from "../../domain/primitives";

export type SessionRevocationReason =
	| "sign_out"
	| "sign_out_everywhere"
	| "device_sign_out"
	| "reuse_detected"
	| "user_mismatch";

/**
 * One sign-in on one device (ADR-004). Holds keyed hashes of the current and
 * previous refresh secrets - never the secrets themselves.
 */
export type StoredSession = {
	id: string;
	userId: UserId;
	tokenHash: string;
	/** Hash of the secret replaced at `rotatedAt`, for reuse detection. */
	previousTokenHash: string | null;
	rotatedAt: Date | null;
	/** The user's token version when the session was created. */
	userTokenVersion: number;
	createdAt: Date;
	lastUsedAt: Date;
	idleExpiresAt: Date;
	absoluteExpiresAt: Date;
	revokedAt: Date | null;
	revokedReason: SessionRevocationReason | null;
	deviceLabel: string | null;
};

export type NewStoredSession = Omit<
	StoredSession,
	"previousTokenHash" | "rotatedAt" | "revokedAt" | "revokedReason"
>;

/**
 * Session storage. Every method is a single atomic statement in the Postgres
 * adapter, so concurrent calls need no surrounding transaction.
 */
export interface SessionRepository {
	create(session: NewStoredSession): Promise<void>;
	getById(id: string): Promise<StoredSession | null>;

	/**
	 * Replaces the refresh secret only if the stored hash still equals
	 * `expectedHash` and the session is not revoked (compare-and-swap).
	 * Returns false if another rotation or a revocation got there first.
	 */
	rotate(args: {
		id: string;
		expectedHash: string;
		newHash: string;
		now: Date;
		idleExpiresAt: Date;
		absoluteExpiresAt: Date;
	}): Promise<boolean>;

	/** Revokes one unrevoked session; false if missing or already revoked. */
	revoke(id: string, reason: SessionRevocationReason, now: Date): Promise<boolean>;

	/** Revokes every unrevoked session of the user; returns how many. */
	revokeAllForUser(
		userId: UserId,
		reason: SessionRevocationReason,
		now: Date
	): Promise<number>;

	/** Unrevoked sessions whose idle and absolute expiry are after `now`, newest first. */
	listActiveForUser(userId: UserId, now: Date): Promise<StoredSession[]>;

	/**
	 * Deletes sessions that were revoked, or expired (idle or absolute), before
	 * `before`. Returns how many.
	 */
	deleteEndedBefore(before: Date): Promise<number>;
}

/**
 * Creates and checks refresh secrets. Implementations key the hash with a
 * server secret, so rotating that secret invalidates every refresh token.
 */
export interface RefreshTokenCrypto {
	/** A new unguessable session id (128 bits, 22 base64url characters). */
	newSessionId(): string;
	/** A new refresh secret (256 bits, 43 base64url characters). */
	newSecret(): string;
	hash(secret: string): Promise<string>;
	/** Constant-time comparison of `secret`'s hash with `hash`. */
	matches(secret: string, hash: string | null): Promise<boolean>;
}
