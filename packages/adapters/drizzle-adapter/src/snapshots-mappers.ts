import type { UserSnapshot } from "@thia/core";
import type { AccountRow, UserRow } from "./schema";

type AccountSnapshot = NonNullable<UserSnapshot["accounts"]>[number];

export function accountRowToSnapshot(row: AccountRow): AccountSnapshot {
	return {
		type: row.type,
		provider: row.provider as AccountSnapshot["provider"],
		providerAccountId:
			row.providerAccountId as AccountSnapshot["providerAccountId"],
		accessToken: row.access_token ?? undefined,
		refreshToken: row.refresh_token ?? undefined,
		expiresAt: row.expires_at ?? undefined,
		scope: row.scope ?? undefined,
		tokenType: row.token_type ?? undefined,
		idToken: row.id_token ?? undefined,
		sessionState: row.session_state ?? undefined,
	};
}

/** Column values for an account row; the inverse of accountRowToSnapshot. */
export function accountSnapshotToColumns(account: AccountSnapshot) {
	return {
		type: account.type,
		access_token: account.accessToken ?? null,
		refresh_token: account.refreshToken ?? null,
		expires_at: account.expiresAt ?? null,
		scope: account.scope ?? null,
		token_type: account.tokenType ?? null,
		id_token: account.idToken ?? null,
		session_state: account.sessionState ?? null,
	};
}

export function rowToSnapshot(
	row: UserRow,
	accounts: AccountRow[] = []
): UserSnapshot {
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
		accounts: accounts.map(accountRowToSnapshot),
	};
}
