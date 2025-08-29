import { drizzle } from "drizzle-orm/neon-http";
// import { env } from "@/utils/env";

// // for scripting
// import { config } from "dotenv";
// config();
// console.log("process.env.DATABASE_URL:", process.env.DATABASE_URL);

if (!process.env.DATABASE_URL) {
	throw new Error("DATABASE_URL not found in process.env");
}

const db = drizzle(process.env.DATABASE_URL, {
	logger: true,
	casing: "snake_case",
});

export type db = typeof db;

export default db;
