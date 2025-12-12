import { startTestDb } from "../_helpers/start-db";

try {
	console.log("🔌 Starting DB...");
	const { stop, db } = await startTestDb();

	console.log("⏳ Waiting for DB...");
	setTimeout(() => stop(), 3000);
} catch (error) {
	console.error("Failed to start test database:", error);
	process.exit(1);
} finally {
	console.log("🛑 Stopping DB...");
}
