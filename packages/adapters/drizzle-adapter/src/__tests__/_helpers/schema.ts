import { createSchema } from "../../schema";
import type { PgSchema } from "drizzle-orm/pg-core";
import type { UserTable, AccountTable, UserRoleTable, SessionTable } from "../../schema";

const {
	ns,
	userTable,
	accountTable,
	userRoleTable,
	sessionTable,
}: {
	ns: PgSchema;
	userTable: UserTable;
	accountTable: AccountTable;
	userRoleTable: UserRoleTable;
	sessionTable: SessionTable;
} = createSchema();

export { ns, userTable, accountTable, userRoleTable, sessionTable };
