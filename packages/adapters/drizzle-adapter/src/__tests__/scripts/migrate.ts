// import { runMigrations } from "../_helpers/db.migrate";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "../db";

await migrate(db, { migrationsFolder: "./drizzle/migrations" });
