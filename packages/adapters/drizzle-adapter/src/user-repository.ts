import {
	UserRepository,
	User,
	EmailAddress,
	// AdapterUser,
	// CreateUser,
	// AdapterAccount,
} from "@thia/core";
import { DefaultPostgresSchema, createSchema } from "./schema";
import { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { rowToSnapshot } from "./snapshots-mappers";
import { asUserId } from "@thia/core";

export function PostgresUserRepository(
	client: PgDatabase<PgQueryResultHKT, any> | NeonHttpDatabase,
	schema: DefaultPostgresSchema = createSchema()
): UserRepository {
	const { userTable, accountTable } = schema;

	const getById: UserRepository["getById"] = async (id) => {
		const rows = await client
			.select()
			.from(schema.userTable)
			.where(eq(schema.userTable.id, id))
			.limit(1);

		if (rows.length === 0) return null;

		// base user snapshot
		const snapshot = rowToSnapshot(rows[0]);

		// hydrate
		const user = User.rehydrate(snapshot);

		// // if your User needs passwordHash/tokenVersion set via methods:
		// if (rows[0].passwordHash && (user as any).setPasswordHash) {
		// 	(user as any).setPasswordHash(rows[0].passwordHash);
		// }
		// if (
		// 	typeof rows[0].tokenVersion === "number" &&
		// 	(user as any).setTokenVersion
		// ) {
		// 	(user as any).setTokenVersion(rows[0].tokenVersion);
		// }

		return user;
	};

	// ------- writer -------
	const save: UserRepository["save"] = async (user: User): Promise<void> => {
		const s = user.toSnapshot() as any;

		// upsert user row
		await client
			.insert(userTable)
			.values({
				id: s.id,
				email: s.email,
				emailVerified: s.emailVerified
					? new Date(s.emailVerified)
					: null,
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

		// Replace accounts (simple & safe for now)
		if (Array.isArray(s.accounts)) {
			await client
				.delete(accountTable)
				.where(eq(accountTable.userId, s.id));
			if (s.accounts.length) {
				await client.insert(accountTable).values(
					s.accounts.map((a: any) => ({
						userId: s.id,
						type: a.type,
						provider: a.provider,
						providerAccountId: a.providerAccountId,
						accessToken: a.accessToken ?? null,
						refreshToken: a.refreshToken ?? null,
						expiresAt: a.expiresAt ?? null,
						scope: a.scope ?? null,
						tokenType: a.tokenType ?? null,
						idToken: a.idToken ?? null,
						sessionState: a.sessionState ?? null,
					}))
				);
			}
		}
	};

	const getByEmail: UserRepository["getByEmail"] = async (
		email: EmailAddress
	): Promise<User | null> => {
		const base = await client
			.select()
			.from(userTable)
			.where(eq(userTable.email, email.value))
			.limit(1);

		if (base.length === 0) return null;
		return getById(asUserId(base[0].id));
	};

	const getByProviderAccount = async ({
		provider,
		providerAccountId,
	}: {
		provider: string;
		providerAccountId: string;
	}): Promise<User | null> => {
		const a = await client
			.select()
			.from(accountTable)
			.where(
				and(
					eq(accountTable.provider, provider),
					eq(accountTable.providerAccountId, providerAccountId)
				)
			)
			.limit(1);

		console.log("getByProviderAccount", a);
		if (a.length === 0) return null;
		return getById(asUserId(a[0].userId)); // reuse hydration path
	};

	return {
		getById,
		name: "drizzle-pg",
		save,
		getByEmail,
		getByProviderAccount,
	};
}
