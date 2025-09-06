// import { safeExecute } from "./index";

// describe("safeExecute", () => {
// 	// Mock logger
// 	const mockLogger = {
// 		error: jest.fn(),
// 		warn: jest.fn(),
// 		info: jest.fn(),
// 		debug: jest.fn(),
// 		// Add other logger methods if needed
// 	};

// 	// Custom error class for testing
// 	class TestError extends Error {
// 		constructor(message: string, public code?: string) {
// 			super(message);
// 			this.name = "TestError";
// 		}
// 	}

// 	beforeEach(() => {
// 		// Clear mock calls before each test
// 		jest.clearAllMocks();
// 	});

// 	it("returns successful operation result", async () => {
// 		const operation = jest.fn().mockResolvedValue("success");
// 		const errorConfig = {
// 			message: "Test error",
// 			error: TestError,
// 		};

// 		const result = await safeExecute(operation, mockLogger, errorConfig);

// 		expect(result).toBe("success");
// 		expect(mockLogger.error).not.toHaveBeenCalled();
// 	});

// 	it("handles standard Error objects", async () => {
// 		const testError = new Error("Standard error");
// 		const operation = jest.fn().mockRejectedValue(testError);
// 		const errorConfig = {
// 			message: "Operation failed",
// 			error: TestError,
// 			code: "TEST_ERROR",
// 		};

// 		await expect(
// 			safeExecute(operation, mockLogger, errorConfig)
// 		).rejects.toThrow(TestError);

// 		expect(mockLogger.error).toHaveBeenCalledWith(
// 			"Operation failed",
// 			expect.objectContaining({
// 				originalError: expect.objectContaining({
// 					message: "Standard error",
// 					name: "Error",
// 					stack: expect.any(String),
// 				}),
// 			})
// 		);
// 	});

// 	it("handles errors with custom codes", async () => {
// 		const customError = new Error("Custom error");
// 		(customError as any).code = "CUSTOM_CODE";

// 		const operation = jest.fn().mockRejectedValue(customError);
// 		const errorConfig = {
// 			message: "Operation failed",
// 			error: TestError,
// 		};

// 		await expect(
// 			safeExecute(operation, mockLogger, errorConfig)
// 		).rejects.toThrow(TestError);

// 		expect(mockLogger.error).toHaveBeenCalledWith(
// 			"Operation failed",
// 			expect.objectContaining({
// 				originalError: expect.objectContaining({
// 					code: "CUSTOM_CODE",
// 				}),
// 			})
// 		);
// 	});

// 	it("handles string throws", async () => {
// 		const operation = jest.fn().mockRejectedValue("String error");
// 		const errorConfig = {
// 			message: "Operation failed",
// 			error: TestError,
// 			code: "STRING_ERROR",
// 		};

// 		await expect(
// 			safeExecute(operation, mockLogger, errorConfig)
// 		).rejects.toThrow("String error");

// 		expect(mockLogger.error).toHaveBeenCalledWith(
// 			"Operation failed",
// 			expect.objectContaining({
// 				originalError: "Unknown error",
// 			})
// 		);
// 	});

// 	it("preserves error context in thrown error", async () => {
// 		const operation = jest
// 			.fn()
// 			.mockRejectedValue(new Error("Original error"));
// 		const errorConfig = {
// 			message: "Operation failed",
// 			error: TestError,
// 			code: "CONTEXT_ERROR",
// 		};
// 		const context = { userId: "123", action: "test" };

// 		await expect(
// 			safeExecute(operation, mockLogger, errorConfig, context)
// 		).rejects.toThrow(TestError);

// 		expect(mockLogger.error).toHaveBeenCalledWith(
// 			"Operation failed",
// 			expect.objectContaining({
// 				userId: "123",
// 				action: "test",
// 				originalError: expect.any(Object),
// 			})
// 		);
// 	});

// 	it("uses error config code when original error has no code", async () => {
// 		const operation = jest
// 			.fn()
// 			.mockRejectedValue(new Error("Original error"));
// 		const errorConfig = {
// 			message: "Operation failed",
// 			error: TestError,
// 			code: "CONFIG_CODE",
// 		};

// 		const error = await expect(
// 			safeExecute(operation, mockLogger, errorConfig)
// 		).rejects.toThrow(TestError);

// 		// expect(error.code).toBe("CONFIG_CODE");
// 	});

// 	it("handles non-Error non-string throws", async () => {
// 		const operation = jest.fn().mockRejectedValue({ custom: "object" });
// 		const errorConfig = {
// 			message: "Operation failed",
// 			error: TestError,
// 			code: "UNKNOWN_ERROR",
// 		};

// 		await expect(
// 			safeExecute(operation, mockLogger, errorConfig)
// 		).rejects.toThrow("Operation failed");

// 		expect(mockLogger.error).toHaveBeenCalledWith(
// 			"Operation failed",
// 			expect.objectContaining({
// 				originalError: "Unknown error",
// 			})
// 		);
// 	});
// });
