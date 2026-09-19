import { drizzle } from "drizzle-orm/neon-http";

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL not found in process.env");
}

const db = drizzle(process.env.DATABASE_URL, {
	// Query logging prints bound parameters - emails, OAuth tokens - so it's
	// opt-in for local debugging only.
	logger: process.env.DRIZZLE_LOG_QUERIES === "true",
	casing: "snake_case",
});

export type db = typeof db;

export default db;
