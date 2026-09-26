/** Error codes thrown by @thia/core that carry no user or request data. */
const SAFE_CODES = new Set([
	"INVALID_STATE",
	"PROVIDER_NOT_FOUND",
	"ACCOUNT_LINK_CONFLICT",
	"PKCE_CHALLENGE_REQUIRED",
	"PKCE_VERIFIER_REQUIRED",
	"INVALID_TRANSACTION",
]);

/**
 * A log-safe description of a login failure. Provider errors are built to
 * hold only a code, HTTP status and OAuth error name; anything else (e.g. a
 * database error, whose message may echo emails or tokens) is reduced to its
 * class name. Codes, tokens, cookies and verifiers never reach the log.
 */
export function describeAuthError(error: unknown): string {
	if (!(error instanceof Error)) return "non-error thrown";
	if (error.name === "OAuthProviderError") return error.message;
	if (SAFE_CODES.has(error.message)) return error.message;
	return error.name || "Error";
}
