import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { MySqlDatabase } from "drizzle-orm/mysql2";
import { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
	MySqlQueryResultHKT,
	PreparedQueryHKTBase,
} from "drizzle-orm/mysql-core";
import {
	DatabaseUser,
	User,
	UserRepository,
	CreateUserDTO,
} from "../../core/types";
import { Adapter, AdapterUser } from "../../core/adapter";
import { eq } from "drizzle-orm";

type AnyPostgresDatabase = PgDatabase<PgQueryResultHKT, any>;
type AnyMySqlDatabase = MySqlDatabase<
	MySqlQueryResultHKT,
	PreparedQueryHKTBase,
	any
>;
type AnySQLiteDatabase = BaseSQLiteDatabase<"sync" | "async", any, any>;

// Type that represents any valid Drizzle database instance
// export type DrizzleDatabase =
// 	| AnyPostgresDatabase
// 	| AnyMySqlDatabase
// 	| AnySQLiteDatabase;

export type DrizzleDatabase = AnyPostgresDatabase;

// Interface representing your user schema structure

// Main repository class with constrained generic type
export class DrizzleUserRepository<
	TDb extends DrizzleDatabase,
	TUserTable extends DatabaseUser
> implements UserRepository
{
	constructor(
		private db: TDb,
		private userTable: TUserTable,
		private schema: { users: TUserTable }
	) {}

	async findByEmail(email: string): Promise<DatabaseUser | null> {
		const [user] = await this.db
			.select()
			.from(this.schema.users)
			.where(eq(this.schema.users.email, email));
		// return this.db
		// 	.select()
		// 	.from(this.userTable)
		// 	.where(eq(this.userTable.email, email))
		// 	.then((res) =>
		// 		res.length > 0 ? res[0] : null
		// 	) as Awaitable<DatabaseUser | null>;
	}

	async findById(id: string): Promise<User | null> {
		const result = await this.db.query[this.schema.users].findFirst({
			where: (users, { eq }) => eq(users.id, id),
		});

		return result ? this.mapToUser(result) : null;
	}

	async create(userData: CreateUserDTO): Promise<User> {
		const result = await this.db
			.insert(this.schema.users)
			.values({
				id: crypto.randomUUID(),
				email: userData.email,
				name: userData.name,
				// ... map other fields
			})
			.returning();

		return this.mapToUser(result[0]);
	}

	// Helper method to map database entity to domain User type
	private mapToUser(entity: TUserTable): DatabaseUser {
		return {
			id: entity.id.toString(),
			email: entity.email,
			name: entity.name,

			// ... map other fields
		};
	}
}
