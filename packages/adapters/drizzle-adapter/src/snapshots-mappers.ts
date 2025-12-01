import type { UserSnapshot } from "@thia/core";
import type { UserRow } from "../schema";

export function rowToSnapshot(row: UserRow): UserSnapshot {
	return {
		id: row.id,
		email: row.email,
		emailVerified: row.emailVerified
			? row.emailVerified.toISOString()
			: null,
		name: row.name ?? undefined,
		image: row.image ?? undefined,
		createdAt: row.createdAt.toISOString(),
		passwordHash: row.passwordHash ?? null,
		tokenVersion: row.tokenVersion ?? 0,
	};
}

// function accountsToSnapshot(rows: AccountRow[]): UserSnapshot["accounts"] {
// 	if (!rows.length) return [];
// 	return rows.map((a) => ({
// 		provider: a.provider,
// 		providerAccountId: a.providerAccountId,
// 		// map any other fields you expose in snapshot if needed
// 	}));
// }

// function keycardsToSnapshot(rows: KeycardRow[]): UserSnapshot["keycards"] {
// 	if (!rows.length) return [];
// 	return rows.map((k) => ({
// 		type: k.type as "access" | "refresh" | "session",
// 		value: k.value,
// 		expiresAt: k.expiresAt ? k.expiresAt.toISOString() : undefined,
// 	}));
// }
