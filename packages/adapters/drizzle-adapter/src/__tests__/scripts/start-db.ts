import { startTestDb } from "../_helpers/start-db";

const { stop } = await startTestDb();

setTimeout(() => stop(), 10000);
