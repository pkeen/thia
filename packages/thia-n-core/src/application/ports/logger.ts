export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerPort {
	// The current threshold (anything below this won’t log)
	level: LogLevel;

	debug: (message: string, meta?: Record<string, unknown>) => void;
	info: (message: string, meta?: Record<string, unknown>) => void;
	warn: (message: string, meta?: Record<string, unknown>) => void;
	error: (message: string, meta?: Record<string, unknown>) => void;
}
