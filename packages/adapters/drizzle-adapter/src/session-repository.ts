import type {
	SessionRepository,
	SessionRevocationReason,
	StoredSession,
} from "@thia/core";
import { asUserId } from "@thia/core";
import { and, desc, eq, gt, isNull, isNotNull, lt, or } from "drizzle-orm";
import { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { DefaultPostgresSchema, SessionRow, createSchema } from "./schema";

const toSession = (row: SessionRow): StoredSession => ({
	id: row.id,
	userId: asUserId(row.userId),
	tokenHash: row.tokenHash,
	previousTokenHash: row.previousTokenHash,
	rotatedAt: row.rotatedAt,
	userTokenVersion: row.userTokenVersion,
	createdAt: row.createdAt,
	lastUsedAt: row.lastUsedAt,
	idleExpiresAt: row.idleExpiresAt,
	absoluteExpiresAt: row.absoluteExpiresAt,
	revokedAt: row.revokedAt,
	revokedReason: row.revokedReason as SessionRevocationReason | null,
	deviceLabel: row.deviceLabel,
});

/**
 * Postgres session storage for refresh-token rotation (ADR-004). Every
 * method is one statement: rotation is a compare-and-swap on the current
 * hash and ignores revoked rows, so concurrent refreshes can't both succeed
 * and a revocation can't be undone by a refresh - with or without a
 * surrounding transaction (e.g. the neon-http driver).
 */
export function PostgresSessionRepository(
	client: PgDatabase<PgQueryResultHKT, any> | NeonHttpDatabase,
	schema: DefaultPostgresSchema = createSchema()
): SessionRepository {
	const { sessionTable: t } = schema;

	return {
		async create(session) {
			await client.insert(t).values({
				id: session.id,
				userId: session.userId,
				tokenHash: session.tokenHash,
				userTokenVersion: session.userTokenVersion,
				createdAt: session.createdAt,
				lastUsedAt: session.lastUsedAt,
				idleExpiresAt: session.idleExpiresAt,
				absoluteExpiresAt: session.absoluteExpiresAt,
				deviceLabel: session.deviceLabel,
			});
		},

		async getById(id) {
			const rows = await client.select().from(t).where(eq(t.id, id)).limit(1);
			return rows.length === 0 ? null : toSession(rows[0]);
		},

		async rotate({ id, expectedHash, newHash, now, idleExpiresAt, absoluteExpiresAt }) {
			const rows = await client
				.update(t)
				.set({
					previousTokenHash: expectedHash,
					tokenHash: newHash,
					rotatedAt: now,
					lastUsedAt: now,
					idleExpiresAt,
					absoluteExpiresAt,
				})
				.where(and(eq(t.id, id), eq(t.tokenHash, expectedHash), isNull(t.revokedAt)))
				.returning({ id: t.id });
			return rows.length === 1;
		},

		async revoke(id, reason, now) {
			const rows = await client
				.update(t)
				.set({ revokedAt: now, revokedReason: reason })
				.where(and(eq(t.id, id), isNull(t.revokedAt)))
				.returning({ id: t.id });
			return rows.length === 1;
		},

		async revokeAllForUser(userId, reason, now) {
			const rows = await client
				.update(t)
				.set({ revokedAt: now, revokedReason: reason })
				.where(and(eq(t.userId, userId), isNull(t.revokedAt)))
				.returning({ id: t.id });
			return rows.length;
		},

		async listActiveForUser(userId, now) {
			const rows = await client
				.select()
				.from(t)
				.where(
					and(
						eq(t.userId, userId),
						isNull(t.revokedAt),
						gt(t.idleExpiresAt, now),
						gt(t.absoluteExpiresAt, now)
					)
				)
				.orderBy(desc(t.createdAt));
			return rows.map(toSession);
		},

		async deleteEndedBefore(before) {
			const rows = await client
				.delete(t)
				.where(
					or(
						and(isNotNull(t.revokedAt), lt(t.revokedAt, before)),
						lt(t.idleExpiresAt, before),
						lt(t.absoluteExpiresAt, before)
					)
				)
				.returning({ id: t.id });
			return rows.length;
		},
	};
}
