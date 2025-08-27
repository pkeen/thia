// transports/console.ts
import type { LogLevel, LogTransport } from "../interfaces";

export class ConsoleTransport implements LogTransport {
	private colors = {
		error: "\x1b[31m", // red
		warn: "\x1b[33m", // yellow
		info: "\x1b[36m", // cyan
		debug: "\x1b[90m", // gray
		reset: "\x1b[0m",
	};

	log(
		level: LogLevel,
		message: string,
		meta?: Record<string, unknown>,
		prefix?: string
	): Promise<void> {
		const color = this.colors[level] || this.colors.reset;
		const timestamp = new Date().toISOString();
		const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";

		const formattedMessage = `${color}[${timestamp}] ${
			prefix ? `${prefix}: ` : ""
		}${level.toUpperCase()}: ${message}${metaStr}${this.colors.reset}`;

		switch (level) {
			case "error":
				console.error(formattedMessage);
				break;
			case "warn":
				console.warn(formattedMessage);
				break;
			case "info":
				console.info(formattedMessage);
				break;
			case "debug":
				console.debug(formattedMessage);
				break;
		}
		return Promise.resolve();
	}
}
