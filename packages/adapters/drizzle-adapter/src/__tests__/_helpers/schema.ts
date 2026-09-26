import { createSchema } from "../../schema";
import type { PgSchema } from "drizzle-orm/pg-core";
import type { UserTable, AccountTable, UserRoleTable } from "../../schema";

const {
	ns,
	userTable,
	accountTable,
	userRoleTable,
}: {
	ns: PgSchema;
	userTable: UserTable;
	accountTable: AccountTable;
	userRoleTable: UserRoleTable;
} = createSchema();

export { ns, userTable, accountTable, userRoleTable };
