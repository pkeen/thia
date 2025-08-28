import { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
	Adapter,
	AdapterUser,
	CreateUser,
	AdapterAccount,
} from "../../../core/adapter";
import { DefaultPostgresSchema, defineTables } from "./schema";
import { getTableColumns } from "drizzle-orm";
import { eq, sql, and } from "drizzle-orm";
import { SignupCredentials } from "../../../core/providers/credentials/index.types";

export function PostgresDrizzleAdapter(
	client: PgDatabase<PgQueryResultHKT, any>,
	schema?: DefaultPostgresSchema
): Adapter {
	const {
		usersTable,
		accountsTable,
		// rolesTable,
		// userRoles,
		// simplified for now
		// sessionsTable,
		// verificationTokensTable,
		// authenticatorsTable,
	} = defineTables(schema);

	return {
		name: "drizzle-pg",
		async createUser(user: CreateUser): Promise<AdapterUser> {
			return client
				.insert(usersTable)
				.values(user)
				.returning()
				.then((res) => res[0]) as Promise<AdapterUser>;
		},
		/*
		 * This is the method that NextAuth uses to create a user
		 * It takes an AdapterUser which requires an id field
		 */
		async createUserWithId(user: AdapterUser) {
			const { id, ...insertData } = user;
			const hasDefaultId =
				getTableColumns(usersTable)["id"]["hasDefault"];

			return client
				.insert(usersTable)
				.values(hasDefaultId ? insertData : { ...insertData, id })
				.returning()
				.then((res) => res[0]) as Promise<AdapterUser>;
		},
		async getUser(userId: string) {
			return client
				.select()
				.from(usersTable)
				.where(eq(usersTable.id, userId))
				.then((res) =>
					res.length > 0 ? res[0] : null
				) as Promise<AdapterUser | null>;
		},
		async getUserByEmail(email: string) {
			try {
				const result = await client
					.select()
					.from(usersTable)
					.where(sql`lower(${usersTable.email}) = lower(${email})`);

				const user = result.length > 0 ? result[0] : null;

				return user as AdapterUser;
			} catch (error) {
				console.error("Error in getUserByEmail:", error);
				return null;
			}
		},
		async createUserFromAccount(user: CreateUser) {
			return client
				.insert(usersTable)
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
		// 			user: usersTable,
		// 		})
		// 		.from(sessionsTable)
		// 		.where(eq(sessionsTable.sessionToken, sessionToken))
		// 		.innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
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
				.update(usersTable)
				.set(data)
				.where(eq(usersTable.id, data.id))
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
				.insert(accountsTable)
				.values({ ...account, userId: user.id });
		},

		async updateAccount(account: AdapterAccount) {
			await client
				.update(accountsTable)
				.set(account)
				.where(
					and(
						eq(accountsTable.provider, account.provider),
						eq(
							accountsTable.providerAccountId,
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
				.from(accountsTable)
				.where(
					and(
						eq(accountsTable.provider, provider),
						eq(accountsTable.providerAccountId, providerAccountId)
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
		// 			user: usersTable,
		// 		})
		// 		.from(accountsTable)
		// 		.innerJoin(usersTable, eq(accountsTable.userId, usersTable.id))
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
		// 	await client.delete(usersTable).where(eq(usersTable.id, id));
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

export * from "./schema";
