import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config();

export default defineConfig({
	// schema: "./src/schema.ts",
    schema: "./src/__tests__/_helpers/schema.ts",
	out: "./drizzle/migrations",
	dialect: "postgresql",
	// dbCredentials: { url: process.env.DATABASE_URL! },
	dbCredentials: {
		host: "localhost",
		port: 5433,
		user: "test",
		password: "test",
		database: "thia_drizzle_test",
		ssl: false, // 🔴 Add this line to disable SSL
	},
});
