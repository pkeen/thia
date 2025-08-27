import {
	text,
	timestamp,
	integer,
	uniqueIndex,
	pgSchema,
	uuid,
	serial,
} from "drizzle-orm/pg-core";

export const schema = pgSchema("authorization");

export const rolesTable = schema.table(
	"roles",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		name: text("name").notNull().unique(),
		level: integer("level").notNull().unique(),
		description: text("description"),
	},
	(table) => [
		// Ensure name and level combination is unique
		uniqueIndex("name_level_idx").on(table.name, table.level),
		// Ensure level alone is unique to prevent confusion
		uniqueIndex("level_idx").on(table.level),
		// Ensure name alone is unique for easier lookups
		uniqueIndex("name_idx").on(table.name),
	]
);

export const userRolesTable = schema.table(
	"user_roles",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		userId: uuid("user_id").notNull().unique(), // the unique means only one role per user
		roleId: uuid("role_id").notNull(),
		assignedAt: timestamp("assigned_at").defaultNow(),
	},
	(table) => [
		// Ensure user_id and role_id combination is unique
		uniqueIndex("user_role_idx").on(table.userId, table.roleId),
	]
);
