export default {
	preset: "ts-jest",
	testEnvironment: "node",
	roots: ["<rootDir>/src"],
	testMatch: [
		"**/__tests__/**/*.ts",
		"**/?(*.)+(spec|test).ts",
		"**/*.test.ts", // Matches tests next to source
		"**/integration-tests/**/*.test.ts", // Matches integration tests
	],
	transform: {
		"^.+\\.ts$": "ts-jest",
	},
	moduleDirectories: ["node_modules", "<rootDir>/src"],
	moduleNameMapper: {
		"@pete_keen/logger": "<rootDir>/../logger/src",
	},
	transform: {
		"^.+\\.ts$": "ts-jest",
	},
	moduleFileExtensions: ["ts", "js", "json"],
	collectCoverage: true,
	coverageDirectory: "coverage",
	coverageReporters: ["text", "lcov"],
	// Collect coverage from all .ts files under src
	collectCoverageFrom: [
		"src/**/*.ts",
		"!src/**/*.d.ts",
		"!src/**/*.test.ts",
		"!src/**/__tests__/**",
	],
};
