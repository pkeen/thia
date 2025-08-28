import {
	pgTable,
	text,
	timestamp,
	boolean,
	integer,
	PgColumn,
	PgTableWithColumns,
} from "drizzle-orm/pg-core";
import { GeneratedColumnConfig, and, eq, getTableColumns } from "drizzle-orm";

export function defineTables(
	schema: Partial<DefaultPostgresSchema> = {}
): Required<DefaultPostgresSchema> {
	const usersTable =
		schema.usersTable ??
		(pgTable("user", {
			id: text("id")
				.primaryKey()
				.$defaultFn(() => crypto.randomUUID()),
			name: text("name"),
			email: text("email").unique(),
			emailVerified: timestamp("emailVerified", { mode: "date" }),
			image: text("image"),
		}) satisfies DefaultPostgresUsersTable);

	// const accountsTable =
	// 	schema.accountsTable ??
	// 	(pgTable(
	// 		"account",
	// 		{
	// 			userId: text("userId")
	// 				.notNull()
	// 				.references(() => usersTable.id, { onDelete: "cascade" }),
	// 			type: text("type").$type<AdapterAccountType>().notNull(),
	// 			provider: text("provider").notNull(),
	// 			providerAccountId: text("providerAccountId").notNull(),
	// 			refresh_token: text("refresh_token"),
	// 			access_token: text("access_token"),
	// 			expires_at: integer("expires_at"),
	// 			token_type: text("token_type"),
	// 			scope: text("scope"),
	// 			id_token: text("id_token"),
	// 			session_state: text("session_state"),
	// 		},
	// 		(account) => ({
	// 			compositePk: primaryKey({
	// 				columns: [account.provider, account.providerAccountId],
	// 			}),
	// 		})
	// 	) satisfies DefaultPostgresAccountsTable);

	// const sessionsTable =
	// 	schema.sessionsTable ??
	// 	(pgTable("session", {
	// 		sessionToken: text("sessionToken").primaryKey(),
	// 		userId: text("userId")
	// 			.notNull()
	// 			.references(() => usersTable.id, { onDelete: "cascade" }),
	// 		expires: timestamp("expires", { mode: "date" }).notNull(),
	// 	}) satisfies DefaultPostgresSessionsTable);

	// const verificationTokensTable =
	// 	schema.verificationTokensTable ??
	// 	(pgTable(
	// 		"verificationToken",
	// 		{
	// 			identifier: text("identifier").notNull(),
	// 			token: text("token").notNull(),
	// 			expires: timestamp("expires", { mode: "date" }).notNull(),
	// 		},
	// 		(verficationToken) => ({
	// 			compositePk: primaryKey({
	// 				columns: [
	// 					verficationToken.identifier,
	// 					verficationToken.token,
	// 				],
	// 			}),
	// 		})
	// 	) satisfies DefaultPostgresVerificationTokenTable);

	// const authenticatorsTable =
	// 	schema.authenticatorsTable ??
	// 	(pgTable(
	// 		"authenticator",
	// 		{
	// 			credentialID: text("credentialID").notNull().unique(),
	// 			userId: text("userId")
	// 				.notNull()
	// 				.references(() => usersTable.id, { onDelete: "cascade" }),
	// 			providerAccountId: text("providerAccountId").notNull(),
	// 			credentialPublicKey: text("credentialPublicKey").notNull(),
	// 			counter: integer("counter").notNull(),
	// 			credentialDeviceType: text("credentialDeviceType").notNull(),
	// 			credentialBackedUp: boolean("credentialBackedUp").notNull(),
	// 			transports: text("transports"),
	// 		},
	// 		(authenticator) => ({
	// 			compositePK: primaryKey({
	// 				columns: [authenticator.userId, authenticator.credentialID],
	// 			}),
	// 		})
	// 	) satisfies DefaultPostgresAuthenticatorTable);

	return {
		usersTable,
		// accountsTable,
		// sessionsTable,
		// verificationTokensTable,
		// authenticatorsTable,
	};
}

type DefaultPostgresColumn<
	T extends {
		data: string | number | boolean | Date;
		dataType: "string" | "number" | "boolean" | "date";
		notNull: boolean;
		isPrimaryKey?: boolean;
		columnType:
			| "PgVarchar"
			| "PgText"
			| "PgBoolean"
			| "PgTimestamp"
			| "PgInteger"
			| "PgUUID";
	}
> = PgColumn<{
	name: string;
	isAutoincrement: boolean;
	isPrimaryKey: T["isPrimaryKey"] extends true ? true : false;
	hasRuntimeDefault: boolean;
	generated: GeneratedColumnConfig<T["data"]> | undefined;
	columnType: T["columnType"];
	data: T["data"];
	driverParam: string | number | boolean;
	notNull: T["notNull"];
	hasDefault: boolean;
	enumValues: any;
	dataType: T["dataType"];
	tableName: string;
}>;

export type DefaultPostgresUsersTable = PgTableWithColumns<{
	name: string;
	columns: {
		id: DefaultPostgresColumn<{
			columnType: "PgVarchar" | "PgText" | "PgUUID";
			isPrimaryKey: true;
			data: string;
			notNull: true;
			dataType: "string";
		}>;
		name: DefaultPostgresColumn<{
			columnType: "PgVarchar" | "PgText";
			data: string;
			notNull: boolean;
			dataType: "string";
		}>;
		email: DefaultPostgresColumn<{
			columnType: "PgVarchar" | "PgText";
			data: string;
			notNull: boolean;
			dataType: "string";
		}>;
		emailVerified: DefaultPostgresColumn<{
			dataType: "date";
			columnType: "PgTimestamp";
			data: Date;
			notNull: boolean;
		}>;
		image: DefaultPostgresColumn<{
			dataType: "string";
			columnType: "PgVarchar" | "PgText";
			data: string;
			notNull: boolean;
		}>;
	};
	dialect: "pg";
	schema: string | undefined;
}>;

export type DefaultPostgresSchema = {
	usersTable: DefaultPostgresUsersTable;
	// Simplified version for now
	// accountsTable: DefaultPostgresAccountsTable;
	// sessionsTable?: DefaultPostgresSessionsTable;
	// verificationTokensTable?: DefaultPostgresVerificationTokenTable;
	// authenticatorsTable?: DefaultPostgresAuthenticatorTable;
};
