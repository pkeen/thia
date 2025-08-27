// import { LogLevel, LogTransport } from "../interfaces";
// import * as fs from "fs/promises";
// import * as path from "path";

// export class FileTransport implements LogTransport {
// 	constructor(
// 		private logDir: string,
// 		private maxFileSize: number = 10 * 1024 * 1024, // 10MB
// 		private retentionDays: number = 30
// 	) {
// 		fs.mkdir(logDir, { recursive: true });
// 	}

// 	async log(
// 		level: LogLevel,
// 		message: string,
// 		meta?: Record<string, unknown>
// 	): Promise<void> {
// 		const today = new Date().toISOString().split("T")[0];
// 		const logFile = path.join(this.logDir, `${level}-${today}.log`);

// 		const logEntry =
// 			JSON.stringify({
// 				timestamp: new Date().toISOString(),
// 				level,
// 				message,
// 				meta,
// 			}) + "\n";

// 		await this.writeLog(logFile, logEntry);
// 	}

// 	private async writeLog(logFile: string, logEntry: string): Promise<void> {
// 		try {
// 			const stats = await fs.stat(logFile).catch(() => ({ size: 0 }));

// 			if (stats.size > this.maxFileSize) {
// 				await fs.rename(logFile, `${logFile}.${Date.now()}.old`);
// 			}

// 			await fs.appendFile(logFile, logEntry, "utf8");
// 		} catch (error) {
// 			console.error("Failed to write to log file:", error);
// 		}
// 	}
// }
