import ms from "ms";

// Converts `expiresIn` string (e.g., '1 hour') to numeric seconds for cookies
export function expiresInToSeconds(expiresIn: string): number {
	const msValue = ms(expiresIn);
	if (msValue === undefined) {
		throw new Error(`Invalid expiresIn format: ${expiresIn}`);
	}
	return msValue / 1000; // Convert milliseconds to seconds
}

// Converts numeric seconds to `expiresIn` string (e.g., '3600' to '1h')
export function secondsToExpiresIn(seconds: number): string {
	return ms(seconds * 1000); // Convert seconds to milliseconds and back to string
}
