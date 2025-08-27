// interfaces.ts
export interface LogTransport {
	log(
		level: string,
		message: string,
		meta?: Record<string, unknown>,
		prefix?: string
	): Promise<void>;
}

export type LogLevel = "error" | "warn" | "info" | "debug";

// Core logging interface
export interface Logger {
    level: LogLevel;
	error(message: string, meta?: Record<string, unknown>): Promise<void>;
	warn(message: string, meta?: Record<string, unknown>): Promise<void>;
	info(message: string, meta?: Record<string, unknown>): Promise<void>;
	debug(message: string, meta?: Record<string, unknown>): Promise<void>;
}

export type LogFormat = "json" | "text" | "pretty";

export interface ConsoleLoggerOptions {
	enabled: boolean;
	colors?: boolean; // enable/disable colors
	format?: LogFormat;
	includeTimestamp?: boolean;
}

export interface LoggerOptions {
	level?: LogLevel;
	filepath?: string; // If they want file logging
	silent?: boolean; // Disable console logging
	format?: LogFormat; // Log format
	prefix?: string;
}
