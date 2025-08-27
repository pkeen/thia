import type {
	Logger,
	LogTransport,
	LogLevel,
	LoggerOptions,
} from "./interfaces";
import { ConsoleTransport } from "./transports/console";
// import { FileTransport } from "./transports/file";
// logger.ts
export class MultiTransportLogger implements Logger {
	private transports: LogTransport[] = [];
	public level: LogLevel;
	private options: LoggerOptions;

	constructor(options: LoggerOptions = {}, transports: LogTransport[] = []) {
		this.level = options.level || "debug";
		this.transports = transports;
		this.options = options;
	}

	addTransport(transport: LogTransport): void {
		this.transports.push(transport);
	}

	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ["error", "warn", "info", "debug"];
		return levels.indexOf(level) <= levels.indexOf(this.level);
	}

	private async logToTransports(
		level: LogLevel,
		message: string,
		meta?: Record<string, unknown>
	): Promise<void> {
		if (!this.shouldLog(level)) return;

		// // prefix Message with domain
		// if (this.options.prefix) {
		// 	message = `${this.options.prefix}: ${message}`;
		// }

		// Using Promise.all maintains order within each transport
		await Promise.all(
			this.transports.map((transport) =>
				transport
					.log(level, message, meta, this.options.prefix)
					.catch((error) => {
						console.error("Transport failed:", error);
					})
			)
		);
	}

	async error(
		message: string,
		meta?: Record<string, unknown>
	): Promise<void> {
		await this.logToTransports("error", message, meta);
	}

	async warn(message: string, meta?: Record<string, unknown>): Promise<void> {
		await this.logToTransports("warn", message, meta);
	}

	async info(message: string, meta?: Record<string, unknown>): Promise<void> {
		await this.logToTransports("info", message, meta);
	}

	async debug(
		message: string,
		meta?: Record<string, unknown>
	): Promise<void> {
		await this.logToTransports("debug", message, meta);
	}
}

export function createLogger(options?: LoggerOptions): Logger {
	const logger = new MultiTransportLogger(options);

	// Add console transport unless silent mode is enabled
	if (!options?.silent) {
		logger.addTransport(new ConsoleTransport());
	}

	// only console now
	// // Add file transport if filepath is provided
	// if (options?.filepath) {
	// 	logger.addTransport(new FileTransport(options.filepath));
	// }

	return logger;
}

export function createLogContext<T extends Object>(context: T): T {
	return context;
}

export * from "./interfaces";
export * from "./transports/console";
// export * from "./transports/file";

// // Example usage
// const logger = new Logger("debug");

// // Add console transport for development
// logger.addTransport(new ConsoleTransport());

// // Add file transport for persistence
// logger.addTransport(new FileTransport("/var/log/myapp"));
