// packages/auth-core/src/errors/auth-error.ts
import { Logger } from "@pete_keen/logger";
export class AuthError extends Error {
	constructor(
		message: string,
		public code: AuthErrorCode, //
		public httpStatus: number = 400
	) {
		super(message);
		this.name = "AuthError";
	}
}

export enum AuthErrorCode {
	UNKNOWN_ERROR = "UNKNOWN_ERROR",
	// Validation Errors (400s)
	VALIDATION_ERROR = "VALIDATION_ERROR",

	// Token Errors | Security Errors (400s)
	TOKEN_TAMPERED = "TOKEN_TAMPERED",
	TOKEN_EXPIRED = "TOKEN_EXPIRED",
	INVALID_SIGNATURE = "INVALID_SIGNATURE",

	// Validation Strategy Errors
	INVALID_KEYCARD = "INVALID_KEYCARD",
	EXPIRED_KEYCARD = "EXPIRED_KEYCARD",
	KEYCARD_CREATION_FAILED = "KEYCARD_CREATION_FAILED",
	KEYCARD_ERROR = "KEYCARD_ERROR",
	KEYCARD_MISSING = "KEYCARD_MISSING",

	// Configuration/Programming Errors (500s)
	INVALID_CONFIG = "INVALID_CONFIG",
	INVALID_ARGUMENT = "INVALID_ARGUMENT",

	// Authentication Errors (400s)
	INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
	USER_NOT_FOUND = "USER_NOT_FOUND",
	ACCOUNT_LOCKED = "ACCOUNT_LOCKED",
	CSRF_ERROR = "CSRF_ERROR",

	// SignUp Errors (400s)
	ACCOUNT_ALREADY_EXISTS = "ACCOUNT_ALREADY_EXISTS",

	// Authorization Errors (403s)
	// OAUTH Errors
	OAUTH_ERROR = "OAUTH_ERROR",
	INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
	INVALID_SCOPE = "INVALID_SCOPE",

	// SignIn Errors (400s)
	PROVIDER_NOT_FOUND = "PROVIDER_NOT_FOUND",
	PROVIDER_NOT_GIVEN = "PROVIDER_NOT_GIVEN",
}

// // Specific error classes for different categories
// export class SecurityError extends AuthError {
// 	constructor(
// 		message: string,
// 		code: AuthErrorCode = AuthErrorCode.TOKEN_TAMPERED
// 	) {
// 		super(message, code, 401);
// 		this.name = "SecurityError";
// 	}
// }

export class UnknownAuthError extends AuthError {
	constructor(message: string) {
		super(message, AuthErrorCode.UNKNOWN_ERROR, 500);
		this.name = "UnknownAuthError";
	}
}

export class ConfigurationError extends AuthError {
	constructor(message: string) {
		super(message, AuthErrorCode.INVALID_CONFIG, 500);
		this.name = "ConfigurationError";
	}
}

export class ValidationError extends AuthError {
	constructor(message: string, code: AuthErrorCode) {
		super(message, code);
		this.name = "ValidationError";
	}
}

// Define specific error types
export class TokenError extends ValidationError {
	constructor(message: string, code: AuthErrorCode) {
		super(message, code);
		this.name = "TokenError";
	}
}

export class TokenExpiredError extends ValidationError {
	constructor(message: string) {
		super(message, AuthErrorCode.TOKEN_EXPIRED);
		this.name = "TokenExpiredError";
	}
}

export class TokenTamperedError extends ValidationError {
	constructor(message: string) {
		super(message, AuthErrorCode.TOKEN_TAMPERED);
		this.name = "TokenTamperedError";
	}
}

export class KeyCardError extends AuthError {
	constructor(message: string, code: AuthErrorCode) {
		super(message, code);
		this.name = "KeyCardError";
	}
}

export class InvalidKeyCardError extends KeyCardError {
	constructor(message: string) {
		super(message, AuthErrorCode.INVALID_KEYCARD);
		this.name = "InvalidKeyCardError";
	}
}

export class ExpiredKeyCardError extends KeyCardError {
	constructor(message: string) {
		super(message, AuthErrorCode.EXPIRED_KEYCARD);
		this.name = "ExpiredKeyCardError";
	}
}

export class KeyCardCreationError extends KeyCardError {
	constructor(message: string) {
		super(message, AuthErrorCode.KEYCARD_CREATION_FAILED);
		this.name = "KeyCardCreationError";
	}
}

export class KeyCardMissingError extends KeyCardError {
	constructor(message: string) {
		super(message, AuthErrorCode.KEYCARD_MISSING);
		this.name = "KeyCardMissingError";
	}
}

export class InvalidCredentialsError extends AuthError {
	constructor(message: string = "Invalid credentials") {
		super(message, AuthErrorCode.INVALID_CREDENTIALS);
		this.name = "InvalidCredentialsError";
	}
}

export class UserNotFoundError extends AuthError {
	constructor(email: string) {
		super(`User not found: ${email}`, AuthErrorCode.USER_NOT_FOUND);
		this.name = "UserNotFoundError";
	}
}

export class AccountAlreadyExistsError extends AuthError {
	constructor(email: string) {
		super(
			"User with this email already exists",
			AuthErrorCode.ACCOUNT_ALREADY_EXISTS
		);
		this.name = "AccountAlreadyExistsError";
	}
}

export class CsrfError extends AuthError {
	constructor(message: string) {
		super(message, AuthErrorCode.CSRF_ERROR);
		this.name = "CsrfError";
	}
}

export class OAuthError extends AuthError {
	constructor(message: string) {
		super(message, AuthErrorCode.OAUTH_ERROR);
		this.name = "OAuthError";
	}
}

export class SignInError extends AuthError {
	constructor(message: string, code: AuthErrorCode) {
		super(message, code);
		this.name = "SignInError";
	}
}

export class ProviderNotGivenError extends SignInError {
	constructor(message: string) {
		super(message, AuthErrorCode.PROVIDER_NOT_GIVEN);
		this.name = "ProviderNotGivenError";
	}
}

export class ProviderNotFoundError extends SignInError {
	constructor(provider: string) {
		super(
			`Provider not found: ${provider}`,
			AuthErrorCode.PROVIDER_NOT_FOUND
		);
		this.name = "ProviderNotFoundError";
	}
}

// Utility type to ensure error has required properties
type ErrorType = AuthError | Error;

export async function safeExecute<T, E extends ErrorType>(
	operation: () => Promise<T>,
	logger: Logger,
	errorConfig: {
		message: string;
		error: new (...args: any[]) => E;
		code?: string;
	},
	context: Record<string, unknown> = {}
): Promise<T> {
	try {
		return await operation();
	} catch (caught) {
		// Preserve original error details
		const errorDetails = {
			...context,
			originalError:
				caught instanceof Error
					? {
							message: caught.message,
							name: caught.name,
							stack: caught.stack,
							...((caught as any).code && {
								code: (caught as any).code,
							}),
					  }
					: "Unknown error",
		};

		// Log the error with full context
		logger.error(errorConfig.message, errorDetails);

		// Create and throw new error with preserved context
		if (caught instanceof Error) {
			throw new errorConfig.error(
				caught.message,
				errorConfig.code || (caught as any).code
			);
		}

		// Handle non-Error throws
		throw new errorConfig.error(
			typeof caught === "string" ? caught : errorConfig.message,
			errorConfig.code
		);
	}
}

// export class InvalidSignatureError extends TokenError {
// 	constructor(message: string) {
// 		super(message, AuthErrorCode.INVALID_SIGNATURE);
// 		this.name = "InvalidSignatureError";
// 	}
// }
