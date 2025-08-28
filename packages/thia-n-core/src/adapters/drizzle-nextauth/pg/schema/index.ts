import {
	pgTable,
	text,
	timestamp,
	boolean,
	integer,
	PgColumn,
	PgTableWithColumns,
	uniqueIndex,
	AnyPgColumn,
	pgSchema,
	primaryKey,
	pgEnum,
	uuid,
} from "drizzle-orm/pg-core";
import {
	GeneratedColumnConfig,
	and,
	eq,
	getTableColumns,
	SQL,
	sql,
	relations,
} from "drizzle-orm";

/**
 * The type of account.
 */
export type ProviderType = "oauth" | "oidc" | "email" | "webauthn";

export function lower(email: AnyPgColumn): SQL {
	return sql`lower(${email})`;
}

// We will make Role a dynamically passed type later
export function defineTables(
	schema: Partial<DefaultPostgresSchema> = {}
): Required<DefaultPostgresSchema> {
	const authSchema = pgSchema("thia");

	const usersTable =
		schema.usersTable ??
		(authSchema.table(
			"users",
			{
				id: uuid("id").defaultRandom().primaryKey(),
				name: text("name").notNull(),
				email: text("email").unique().notNull(),
				emailVerified: timestamp("emailVerified", { mode: "date" }),
				image: text("image"),
				password: text("password"),
				// role: text("role").$type<Role>().notNull().default("user"),
			},
			(table) => ({
				// emailUniqueIndex: uniqueIndex('emailUniqueIndex').on(sql`lower(${table.email})`),
				emailUniqueIndex: uniqueIndex("emailUniqueIndex").on(
					lower(table.email)
				),
			})
		) satisfies DefaultPostgresUsersTable);

	const accountsTable =
		schema.accountsTable ??
		(authSchema.table(
			"account",
			{
				userId: uuid("userId")
					.notNull()
					.references(() => usersTable.id, { onDelete: "cascade" }),
				type: text("type").$type<ProviderType>().notNull(),
				provider: text("provider").notNull(),
				providerAccountId: text("providerAccountId").notNull(),
				refresh_token: text("refresh_token"),
				access_token: text("access_token"),
				expires_at: integer("expires_at"),
				token_type: text("token_type"),
				scope: text("scope"),
				id_token: text("id_token"),
				session_state: text("session_state"),
			},
			(account) => ({
				compositePk: primaryKey({
					columns: [account.provider, account.providerAccountId],
				}),
			})
		) satisfies DefaultPostgresAccountsTable);

	// const rolesTable =
	// 	schema.rolesTable ??
	// 	(authSchema.table("roles", {
	// 		id: uuid("id").defaultRandom().primaryKey(),
	// 		name: text("name").notNull().unique(),
	// 		level: integer("level").notNull().unique(),
	// 		description: text("description"),
	// 	}) satisfies DefaultPostgresRolesTable);

	// // User roles junction table - associates users with their roles
	// const userRoles =
	// 	schema.userRolesTable ??
	// 	(authSchema.table("user_roles", {
	// 		id: uuid("id").defaultRandom().primaryKey(),
	// 		userId: uuid("user_id")
	// 			.notNull()
	// 			.references(() => usersTable.id, { onDelete: "cascade" }),
	// 		roleId: uuid("role_id")
	// 			.notNull()
	// 			.references(() => rolesTable.id, { onDelete: "cascade" }),
	// 		assignedAt: timestamp("assigned_at").defaultNow(),
	// 		assignedBy: uuid("assigned_by").references(() => usersTable.id),
	// 	}) satisfies DefaultPostgresUserRolesTable);

	// // Define relationships
	// const usersRelations = relations(usersTable, ({ many }) => ({
	// 	userRoles: many(userRoles),
	// }));

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
		authSchema,
		accountsTable,
		// rolesTable,
		// usersRelations,
		// userRoles,
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
			notNull: true;
			dataType: "string";
		}>;
		email: DefaultPostgresColumn<{
			columnType: "PgVarchar" | "PgText";
			data: string;
			notNull: true;
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
		// role: DefaultPostgresColumn<{
		// 	columnType: "PgVarchar" | "PgText";
		// 	data: string;
		// 	notNull: boolean;
		// 	dataType: "string";
		// }>;
	};
	dialect: "pg";
	schema: string | undefined;
}>;

export type DefaultPostgresAccountsTable = PgTableWithColumns<{
	name: string;
	columns: {
		userId: DefaultPostgresColumn<{
			columnType: "PgVarchar" | "PgText" | "PgUUID";
			data: string;
			notNull: true;
			dataType: "string";
		}>;
		type: DefaultPostgresColumn<{
			columnType: "PgVarchar" | "PgText";
			data: string;
			notNull: true;
			dataType: "string";
		}>;
		provider: DefaultPostgresColumn<{
			columnType: "PgVarchar" | "PgText";
			data: string;
			notNull: true;
			dataType: "string";
		}>;
		providerAccountId: DefaultPostgresColumn<{
			dataType: "string";
			columnType: "PgVarchar" | "PgText";
			data: string;
			notNull: true;
		}>;
		refresh_token: DefaultPostgresColumn<{
			dataType: "string";
			columnType: "PgVarchar" | "PgText";
			data: string;
			notNull: boolean;
		}>;
		access_token: DefaultPostgresColumn<{
			dataType: "string";
			columnType: "PgVarchar" | "PgText";
			data: string;
			notNull: boolean;
		}>;
		expires_at: DefaultPostgresColumn<{
			dataType: "number";
			columnType: "PgInteger";
			data: number;
			notNull: boolean;
		}>;
		token_type: DefaultPostgresColumn<{
			dataType: "string";
			columnType: "PgVarchar" | "PgText";
			data: string;
			notNull: boolean;
		}>;
		scope: DefaultPostgresColumn<{
			dataType: "string";
			columnType: "PgVarchar" | "PgText";
			data: string;
			notNull: boolean;
		}>;
		id_token: DefaultPostgresColumn<{
			dataType: "string";
			columnType: "PgVarchar" | "PgText";
			data: string;
			notNull: boolean;
		}>;
		session_state: DefaultPostgresColumn<{
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
	authSchema: any;
	// Simplified version for now
	accountsTable: DefaultPostgresAccountsTable;
	// sessionsTable?: DefaultPostgresSessionsTable;
	// verificationTokensTable?: DefaultPostgresVerificationTokenTable;
	// authenticatorsTable?: DefaultPostgresAuthenticatorTable;
};
