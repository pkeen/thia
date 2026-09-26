// application/oauth/transaction.ts
import { z } from "zod";
import { OAuthTransaction } from "../ports/oauth-transaction-port";
import { CODE_VERIFIER_PATTERN, timingSafeEqual } from "./pkce";

/** Transactions live 10 minutes unless configured otherwise. */
export const DEFAULT_OAUTH_TRANSACTION_TTL_SEC = 10 * 60;

const token = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);

export const OAuthTransactionSchema = z
	.object({
		state: token,
		providerId: z.string().regex(/^[a-z0-9_-]{1,32}$/),
		redirectUri: z.string().url().max(2048),
		codeVerifier: z.string().regex(CODE_VERIFIER_PATTERN),
		nonce: token.optional(),
		returnTo: z.string().max(2048).optional(),
		issuedAt: z.number().int().nonnegative(),
		expiresAt: z.number().int().positive(),
	})
	.strict()
	.refine((t) => t.expiresAt > t.issuedAt, "expiresAt must follow issuedAt");

/** A structurally valid transaction, or undefined. */
export function parseOAuthTransaction(value: unknown): OAuthTransaction | undefined {
	const result = OAuthTransactionSchema.safeParse(value);
	return result.success ? (result.data as OAuthTransaction) : undefined;
}

/**
 * Whether `transaction` may complete the callback for `provider` with the
 * returned `state` at `now`: well-formed, unexpired, same provider, same
 * state. The expiry check is the server's own and doesn't rely on the
 * browser having expired the cookie.
 */
export function oauthTransactionMatches(
	transaction: OAuthTransaction | undefined,
	callback: { provider: string; state: string },
	now: Date
): transaction is OAuthTransaction {
	if (!parseOAuthTransaction(transaction)) return false;
	const nowSec = Math.floor(now.getTime() / 1000);
	if (nowSec >= transaction.expiresAt) return false;
	if (nowSec < transaction.issuedAt - 60) return false; // issued "in the future"
	if (transaction.providerId !== callback.provider) return false;
	return timingSafeEqual(transaction.state, callback.state);
}
