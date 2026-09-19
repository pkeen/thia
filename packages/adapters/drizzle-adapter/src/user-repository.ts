import { UserRepository, User, EmailAddress, asUserId } from "@thia/core";
import { DefaultPostgresSchema, createSchema } from "./schema";
import { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { accountSnapshotToColumns, rowToSnapshot } from "./snapshots-mappers";

export function PostgresUserRepository(
	client: PgDatabase<PgQueryResultHKT, any> | NeonHttpDatabase,
	schema: DefaultPostgresSchema = createSchema()
): UserRepository {
	const { userTable, accountTable } = schema;

	const getById: UserRepository["getById"] = async (id) => {
		const rows = await client
			.select()
			.from(userTable)
			.where(eq(userTable.id, id))
			.limit(1);

		if (rows.length === 0) return null;

		// The user aggregate owns its linked accounts, so they must be loaded
		// with it - save() writes back exactly what the aggregate holds.
		const accounts = await client
			.select()
			.from(accountTable)
			.where(eq(accountTable.userId, id));

		return User.rehydrate(rowToSnapshot(rows[0], accounts));
	};

	const save: UserRepository["save"] = async (user: User): Promise<void> => {
		const s = user.toSnapshot();

		await client
			.insert(userTable)
			.values({
				id: s.id,
				email: s.email,
				emailVerified: s.emailVerified ? new Date(s.emailVerified) : null,
				name: s.name ?? null,
				image: s.image ?? null,
				createdAt: new Date(s.createdAt),
				passwordHash: s.passwordHash ?? null,
				tokenVersion: s.tokenVersion ?? 0,
			})
			.onConflictDoUpdate({
				target: userTable.id,
				set: {
					email: s.email,
					emailVerified: s.emailVerified
						? new Date(s.emailVerified)
						: null,
					name: s.name ?? null,
					image: s.image ?? null,
					passwordHash: s.passwordHash ?? null,
					tokenVersion: s.tokenVersion ?? 0,
				},
			});

		// Sync accounts to match the aggregate. Writes happen before deletes so
		// that, without a surrounding transaction (e.g. the neon-http driver),
		// a failure partway through can leave a stale link behind but can never
		// drop one the user still has.
		const accounts = s.accounts ?? [];
		const existing = await client
			.select({
				provider: accountTable.provider,
				providerAccountId: accountTable.providerAccountId,
			})
			.from(accountTable)
			.where(eq(accountTable.userId, s.id));

		const key = (a: { provider: string; providerAccountId: string }) =>
			`${a.provider}\u0000${a.providerAccountId}`;
		const existingKeys = new Set(existing.map(key));
		const desiredKeys = new Set(accounts.map(key));

		for (const account of accounts) {
			const columns = accountSnapshotToColumns(account);
			if (existingKeys.has(key(account))) {
				await client
					.update(accountTable)
					.set(columns)
					.where(
						and(
							eq(accountTable.userId, s.id),
							eq(accountTable.provider, account.provider),
							eq(accountTable.providerAccountId, account.providerAccountId)
						)
					);
			} else {
				// No upsert on purpose: if this provider account already belongs
				// to a different user, the unique index rejects it rather than
				// silently reassigning someone else's login.
				await client.insert(accountTable).values({
					userId: s.id,
					provider: account.provider,
					providerAccountId: account.providerAccountId,
					...columns,
				});
			}
		}

		for (const stale of existing) {
			if (desiredKeys.has(key(stale))) continue;
			await client
				.delete(accountTable)
				.where(
					and(
						eq(accountTable.userId, s.id),
						eq(accountTable.provider, stale.provider),
						eq(accountTable.providerAccountId, stale.providerAccountId)
					)
				);
		}
	};

	const getByEmail: UserRepository["getByEmail"] = async (
		email: EmailAddress
	): Promise<User | null> => {
		const base = await client
			.select({ id: userTable.id })
			.from(userTable)
			.where(eq(userTable.email, email.value))
			.limit(1);

		if (base.length === 0) return null;
		return getById(asUserId(base[0].id));
	};

	const getByProviderAccount: UserRepository["getByProviderAccount"] = async ({
		provider,
		providerAccountId,
	}) => {
		const rows = await client
			.select({ userId: accountTable.userId })
			.from(accountTable)
			.where(
				and(
					eq(accountTable.provider, provider),
					eq(accountTable.providerAccountId, providerAccountId)
				)
			)
			.limit(1);

		if (rows.length === 0) return null;
		return getById(asUserId(rows[0].userId));
	};

	return {
		getById,
		name: "drizzle-pg",
		save,
		getByEmail,
		getByProviderAccount,
	};
}
