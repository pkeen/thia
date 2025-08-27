// test-logger.ts
import { MultiTransportLogger, ConsoleTransport } from "@pete_keen/logger";

const logger = new MultiTransportLogger({
	level: "debug",
});

logger.addTransport(new ConsoleTransport());

// Test each log level
logger.debug("This is a debug message");
logger.info("This is an info message");
logger.warn("This is a warning message");
logger.error("This is an error message");
