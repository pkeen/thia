import { sql } from "drizzle-orm";
import {
	text,
	timestamp,
	integer,
	uniqueIndex,
	pgSchema,
	uuid,
} from "drizzle-orm/pg-core";

// export const rbacSchema = pgSchema("authorization");

// export const rolesTable = rbacSchema.table(
// 	"roles",
// 	{
// 		id: uuid("id").defaultRandom().primaryKey(),
// 		key: text("key").notNull().unique(),
// 		name: text("name").notNull().unique(),
// 		level: integer("level").notNull().unique(),
// 		description: text("description"),
// 	},
// 	(table) => [
// 		uniqueIndex("key_idx").on(table.key),
// 		// Ensure name and level combination is unique
// 		uniqueIndex("name_level_idx").on(table.name, table.level),
// 		// // Ensure level alone is unique to prevent confusion
// 		// uniqueIndex("level_idx").on(table.level),
// 		// // Ensure name alone is unique for easier lookups
// 		// uniqueIndex("name_idx").on(table.name),
// 	]
// );

// export const userRolesTable = rbacSchema.table(
// 	"user_roles",
// 	{
// 		id: uuid("id").defaultRandom().primaryKey(),
// 		userId: uuid("user_id").notNull().unique(), // the unique means only one role per user
// 		roleId: uuid("role_id").notNull(),
// 		assignedAt: timestamp("assigned_at").defaultNow(),
// 	},
// 	(table) => [
// 		// Ensure user_id and role_id combination is unique
// 		uniqueIndex("user_role_idx").on(table.userId, table.roleId),
// 	]
// );

// export type RBACSchema = typeof rbacSchema;

// interface schemaConfig {
// 	name?: string;
// 	roles: Array<{ key: string; name: string; level: number }>;
// }

// What if we created a function to return the schema and the tables?
export const createSchema = (name?: string) => {
	const rbacSchema = name ? pgSchema(name) : pgSchema("rbac_schema");

	const rolesTable = rbacSchema.table(
		"roles",
		{
			id: uuid("id").defaultRandom().primaryKey(),
			key: text("key").notNull().unique(),
			name: text("name").notNull().unique(),
			level: integer("level").notNull().unique(),
			description: text("description"),
		},
		(table) => [
			uniqueIndex("key_idx").on(table.key),
			// Ensure name and level combination is unique
			uniqueIndex("name_level_idx").on(table.name, table.level),
			// // Ensure level alone is unique to prevent confusion
			// uniqueIndex("level_idx").on(table.level),
			// // Ensure name alone is unique for easier lookups
			// uniqueIndex("name_idx").on(table.name),
		]
	);

	const userRolesTable = rbacSchema.table(
		"user_roles",
		{
			id: uuid("id").defaultRandom().primaryKey(),
			userId: uuid("user_id").notNull(), // the unique means only one role per user
			roleId: uuid("role_id").notNull(),
			assignedAt: timestamp("assigned_at").defaultNow(),
		},
		(table) => [
			// Ensure user_id and role_id combination is unique
			// uniqueIndex("user_role_idx").on(table.userId, table.roleId),
			uniqueIndex("user_id_unique").on(table.userId),
		]
	);

	// // Migration function that seeds roles
	// const seedRolesMigration = (db: any) => {
	// 	db.execute(sql`
	//   INSERT INTO ${rolesTable} (key, name, level)
	//   VALUES ${sql.join(
	// 		config.roles.map((r) => sql`(${r.key}, ${r.name}, ${r.level})`),
	// 		sql`,`
	// 	)}
	//   ON CONFLICT (key) DO NOTHING;
	// `);
	// };

	return {
		rbacSchema,
		rolesTable,
		userRolesTable,
		// seedRoles: seedRolesMigration,
	};
};

// Define a type that describes what `createSchema` returns
export type RBACSchema = ReturnType<typeof createSchema>;
