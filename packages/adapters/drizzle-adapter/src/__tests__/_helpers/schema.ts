import { createSchema } from "../../schema";
import type { PgSchema } from "drizzle-orm/pg-core";
import type { UserTable } from "../../schema";
import type { AccountTable } from "../../schema";

const {
	ns,
	userTable,
	accountTable,
}: { ns: PgSchema; userTable: UserTable; accountTable: AccountTable } =
	createSchema();

export { ns, userTable, accountTable };
