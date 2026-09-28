// infra/memory/in-memory-session-repo.ts
import type {
	NewStoredSession,
	SessionRepository,
	SessionRevocationReason,
	StoredSession,
} from "../../application/session/session-repository.port";
import type { UserId } from "../../domain/primitives";

const copy = (s: StoredSession): StoredSession => structuredClone(s);

/**
 * Behaves like the Postgres adapter: reads return copies, and every method
 * completes synchronously between awaits, so each is atomic.
 */
export class InMemorySessionRepo implements SessionRepository {
	private rows = new Map<string, StoredSession>();

	async create(session: NewStoredSession) {
		if (this.rows.has(session.id)) throw new Error("duplicate session id");
		this.rows.set(session.id, {
			...structuredClone(session),
			previousTokenHash: null,
			rotatedAt: null,
			revokedAt: null,
			revokedReason: null,
		});
	}

	async getById(id: string) {
		const row = this.rows.get(id);
		return row ? copy(row) : null;
	}

	async rotate(args: {
		id: string;
		expectedHash: string;
		newHash: string;
		now: Date;
		idleExpiresAt: Date;
		absoluteExpiresAt: Date;
	}) {
		const row = this.rows.get(args.id);
		if (!row || row.revokedAt || row.tokenHash !== args.expectedHash) return false;
		row.previousTokenHash = row.tokenHash;
		row.tokenHash = args.newHash;
		row.rotatedAt = args.now;
		row.lastUsedAt = args.now;
		row.idleExpiresAt = args.idleExpiresAt;
		row.absoluteExpiresAt = args.absoluteExpiresAt;
		return true;
	}

	async revoke(id: string, reason: SessionRevocationReason, now: Date) {
		const row = this.rows.get(id);
		if (!row || row.revokedAt) return false;
		row.revokedAt = now;
		row.revokedReason = reason;
		return true;
	}

	async revokeAllForUser(userId: UserId, reason: SessionRevocationReason, now: Date) {
		let count = 0;
		for (const row of this.rows.values()) {
			if (row.userId === userId && !row.revokedAt) {
				row.revokedAt = now;
				row.revokedReason = reason;
				count++;
			}
		}
		return count;
	}

	async listActiveForUser(userId: UserId, now: Date) {
		return [...this.rows.values()]
			.filter(
				(r) =>
					r.userId === userId &&
					!r.revokedAt &&
					r.idleExpiresAt > now &&
					r.absoluteExpiresAt > now
			)
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
			.map(copy);
	}

	async deleteEndedBefore(before: Date) {
		let count = 0;
		for (const [id, r] of this.rows) {
			const endedAt = r.revokedAt ?? new Date(Math.min(r.idleExpiresAt.getTime(), r.absoluteExpiresAt.getTime()));
			if (endedAt < before) {
				this.rows.delete(id);
				count++;
			}
		}
		return count;
	}
}
