import {
	UserRepository,
	User,
	// AdapterUser,
	// CreateUser,
	// AdapterAccount,
} from "@thia/core";
import { DefaultPostgresSchema, createSchema } from "./schema";
import { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { eq, getTableColumns, sql } from "drizzle-orm";
import { rowToSnapshot } from "./snapshots-mappers";

export function PostgresDrizzleAdapter(
	client: PgDatabase<PgQueryResultHKT, any> | NeonHttpDatabase,
	schema: DefaultPostgresSchema = createSchema()
): UserRepository {
	// const getById = async (id: string): Promise<User | null> => {
	//     const result = await client.select().from(schema.userTable).where(eq(schema.userTable.id, id));

	//     if(result.length === 0) {
	//         return null;
	//     }

	//     const user = User.rehydrate(result[0]);
	//     return user;
	// }

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

	// const {
	// 	userTable,
	// 	accountTable,
	// 	// simplified for now
	// 	// sessionsTable,
	// 	// verificationTokensTable,
	// 	// authenticatorsTable,
	// } = createSchema();

	return {
		getById,
		name: "drizzle-pg",
		async createUser(user: CreateUser): Promise<AdapterUser> {
			return client
				.insert(userTable)
				.values(user)
				.returning()
				.then((res) => res[0]) as Promise<AdapterUser>;
		},
		// /*
		//  * This is the method that NextAuth uses to create a user
		//  * It takes an AdapterUser which requires an id field
		//  */
		// async createUserWithId(user: AdapterUser) {
		// 	const { id, ...insertData } = user;
		// 	const hasDefaultId = getTableColumns(userTable)["id"]["hasDefault"];

		// 	return client
		// 		.insert(userTable)
		// 		.values(hasDefaultId ? insertData : { ...insertData, id })
		// 		.returning()
		// 		.then((res) => res[0]) as Promise<AdapterUser>;
		// },
		async getUser(userId: string) {
			return client
				.select()
				.from(userTable)
				.where(eq(userTable.id, userId))
				.then((res) =>
					res.length > 0 ? res[0] : null
				) as Promise<AdapterUser | null>;
		},
		async getUserByEmail(email: string) {
			try {
				const result = await client
					.select()
					.from(userTable)
					.where(sql`lower(${userTable.email}) = lower(${email})`);

				const user = result.length > 0 ? result[0] : null;

				return user as AdapterUser;
			} catch (error) {
				console.error("Error in getUserByEmail:", error);
				return null;
			}
		},
		async createUserFromAccount(user: CreateUser) {
			return client
				.insert(userTable)
				.values(user)
				.returning()
				.then((res) => res[0]) as Promise<AdapterUser>;
		},
		// async createSession(data: {
		// 	sessionToken: string;
		// 	userId: string;
		// 	expires: Date;
		// }) {
		// 	return client
		// 		.insert(sessionsTable)
		// 		.values(data)
		// 		.returning()
		// 		.then((res) => res[0]);
		// },
		// async getSessionAndUser(sessionToken: string) {
		// 	return client
		// 		.select({
		// 			session: sessionsTable,
		// 			user: userTable,
		// 		})
		// 		.from(sessionsTable)
		// 		.where(eq(sessionsTable.sessionToken, sessionToken))
		// 		.innerJoin(userTable, eq(userTable.id, sessionsTable.userId))
		// 		.then((res) => (res.length > 0 ? res[0] : null)) as Awaitable<{
		// 		session: AdapterSession;
		// 		user: AdapterUser;
		// 	} | null>;
		// },
		async updateUser(data: Partial<AdapterUser> & Pick<AdapterUser, "id">) {
			if (!data.id) {
				throw new Error("No user id.");
			}

			const [result] = await client
				.update(userTable)
				.set(data)
				.where(eq(userTable.id, data.id))
				.returning();

			if (!result) {
				throw new Error("No user found.");
			}

			return result;
		},
		// async updateSession(
		// 	data: Partial<AdapterSession> & Pick<AdapterSession, "sessionToken">
		// ) {
		// 	return client
		// 		.update(sessionsTable)
		// 		.set(data)
		// 		.where(eq(sessionsTable.sessionToken, data.sessionToken))
		// 		.returning()
		// 		.then((res) => res[0]);
		// },
		// async linkAccount(data: AdapterAccount) {
		// 	await client.insert(accountsTable).values(data);
		// },

		async createAccountForUser(user: AdapterUser, account: AdapterAccount) {
			await client
				.insert(accountTable)
				.values({ ...account, userId: user.id });
		},

		async updateAccount(account: AdapterAccount) {
			await client
				.update(accountTable)
				.set(account)
				.where(
					and(
						eq(accountTable.provider, account.provider),
						eq(
							accountTable.providerAccountId,
							account.providerAccountId
						)
					)
				);
		},

		async getAccount(
			provider: string,
			providerAccountId: string
		): Promise<AdapterAccount | null> {
			const account = await client
				.select()
				.from(accountTable)
				.where(
					and(
						eq(accountTable.provider, provider),
						eq(accountTable.providerAccountId, providerAccountId)
					)
				)
				.then((res) => res[0]);

			if (!account) {
				return null;
			}

			return account as AdapterAccount;
		},

		// async getUserByAccount(
		// 	account: Pick<AdapterAccount, "provider" | "providerAccountId">
		// ) {
		// 	const result = await client
		// 		.select({
		// 			account: accountsTable,
		// 			user: userTable,
		// 		})
		// 		.from(accountsTable)
		// 		.innerJoin(userTable, eq(accountsTable.userId, userTable.id))
		// 		.where(
		// 			and(
		// 				eq(accountsTable.provider, account.provider),
		// 				eq(
		// 					accountsTable.providerAccountId,
		// 					account.providerAccountId
		// 				)
		// 			)
		// 		)
		// 		.then((res) => res[0]);

		// 	const user = result?.user ?? null;
		// 	return user as Awaitable<AdapterUser | null>;
		// },
		// async deleteSession(sessionToken: string) {
		// 	await client
		// 		.delete(sessionsTable)
		// 		.where(eq(sessionsTable.sessionToken, sessionToken));
		// },
		// async createVerificationToken(data: VerificationToken) {
		// 	return client
		// 		.insert(verificationTokensTable)
		// 		.values(data)
		// 		.returning()
		// 		.then((res) => res[0]);
		// },
		// async useVerificationToken(params: {
		// 	identifier: string;
		// 	token: string;
		// }) {
		// 	return client
		// 		.delete(verificationTokensTable)
		// 		.where(
		// 			and(
		// 				eq(
		// 					verificationTokensTable.identifier,
		// 					params.identifier
		// 				),
		// 				eq(verificationTokensTable.token, params.token)
		// 			)
		// 		)
		// 		.returning()
		// 		.then((res) => (res.length > 0 ? res[0] : null));
		// },
		// async deleteUser(id: string) {
		// 	await client.delete(userTable).where(eq(userTable.id, id));
		// },
		// async unlinkAccount(
		// 	params: Pick<AdapterAccount, "provider" | "providerAccountId">
		// ) {
		// 	await client
		// 		.delete(accountsTable)
		// 		.where(
		// 			and(
		// 				eq(accountsTable.provider, params.provider),
		// 				eq(
		// 					accountsTable.providerAccountId,
		// 					params.providerAccountId
		// 				)
		// 			)
		// 		);
		// },
		// async getAccount(providerAccountId: string, provider: string) {
		// 	return client
		// 		.select()
		// 		.from(accountsTable)
		// 		.where(
		// 			and(
		// 				eq(accountsTable.provider, provider),
		// 				eq(accountsTable.providerAccountId, providerAccountId)
		// 			)
		// 		)
		// 		.then(
		// 			(res) => res[0] ?? null
		// 		) as Promise<AdapterAccount | null>;
		// },
		// async createAuthenticator(data: AdapterAuthenticator) {
		// 	return client
		// 		.insert(authenticatorsTable)
		// 		.values(data)
		// 		.returning()
		// 		.then(
		// 			(res) => res[0] ?? null
		// 		) as Awaitable<AdapterAuthenticator>;
		// },
		// async getAuthenticator(credentialID: string) {
		// 	return client
		// 		.select()
		// 		.from(authenticatorsTable)
		// 		.where(eq(authenticatorsTable.credentialID, credentialID))
		// 		.then(
		// 			(res) => res[0] ?? null
		// 		) as Awaitable<AdapterAuthenticator | null>;
		// },
		// async listAuthenticatorsByUserId(userId: string) {
		// 	return client
		// 		.select()
		// 		.from(authenticatorsTable)
		// 		.where(eq(authenticatorsTable.userId, userId))
		// 		.then((res) => res) as Awaitable<AdapterAuthenticator[]>;
		// },
		// async updateAuthenticatorCounter(
		// 	credentialID: string,
		// 	newCounter: number
		// ) {
		// 	const authenticator = await client
		// 		.update(authenticatorsTable)
		// 		.set({ counter: newCounter })
		// 		.where(eq(authenticatorsTable.credentialID, credentialID))
		// 		.returning()
		// 		.then((res) => res[0]);

		// 	if (!authenticator) throw new Error("Authenticator not found.");

		// 	return authenticator as Awaitable<AdapterAuthenticator>;
		// },
	};
}
