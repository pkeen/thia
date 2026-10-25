// application/reauth/reauthenticate.ts
import type { Clock } from "../ports/clock.port";
import type { OAuthTransaction } from "../ports/oauth-transaction-port";
import type { ProviderRegistryPort } from "../ports/provider-registry-port";
import type { UserRepository } from "../ports/user-repo.port";
import { oauthTransactionMatches } from "../oauth/transaction";
import type { SessionValidator, AuthenticatedSession } from "../session/validate-session";
import { beginOAuth, type BeginOAuthOutput } from "../use-cases/begin-oauth";
import type { IssuedReauthProof, RecentAuthentication } from "./recent-authentication";

export type BeginReauthenticationInput = {
	provider: string;
	/** The provider's configured callback URI - never one taken from the request. */
	redirectUri: string;
	returnTo?: string;
	/** The caller's validated session; the transaction is bound to its user and `sid`. */
	session: AuthenticatedSession;
};

/**
 * Starts a re-authentication: a separate authorization-code flow (fresh state,
 * S256 PKCE, nonce for OIDC) whose transaction is bound to the current user
 * and stored session. Throws `REAUTH_SESSION_UNSUPPORTED` for a session with
 * no stored-session id. Stores nothing; the caller seals the transaction.
 */
export async function beginReauthentication(
	deps: { registry: ProviderRegistryPort; clock: Clock; ttlSec?: number },
	input: BeginReauthenticationInput
): Promise<BeginOAuthOutput> {
	const sessionId = input.session.identity.sessionId;
	if (input.session.mode !== "jwt-user-validated" || sessionId === undefined) {
		throw new Error("REAUTH_SESSION_UNSUPPORTED");
	}
	return beginOAuth(deps, {
		provider: input.provider,
		redirectUri: input.redirectUri,
		returnTo: input.returnTo,
		reauth: { userId: input.session.identity.userId, sessionId },
	});
}

export type CompleteReauthenticationInput = {
	provider: string;
	/** `code` and `state` exactly as returned on the callback (untrusted). */
	code: string;
	state: string;
	/** The unsealed transaction for this browser; undefined when none was found. */
	transaction: OAuthTransaction | undefined;
	/** The access token the callback request carries - validated again here. */
	sessionToken: string | null | undefined;
};

export type CompleteReauthenticationResult =
	| { status: "confirmed"; proof: IssuedReauthProof; userId: string; sessionId: string }
	| {
			status: "refused";
			/**
			 * session_changed: no valid session, or not the user and `sid` the
			 * transaction was started from. account_not_linked: the provider
			 * account is not linked to the current user.
			 */
			reason: "session_changed" | "account_not_linked";
	  }
	| { status: "unavailable"; cause?: unknown };

export type CompleteReauthenticationDeps = {
	registry: ProviderRegistryPort;
	users: Pick<UserRepository, "getByProviderAccount">;
	clock: Clock;
	validator: SessionValidator;
	recentAuth: RecentAuthentication;
};

/**
 * Finishes a re-authentication. Unlike `completeOAuth` it never creates or
 * links a user, never starts a session and never stores provider tokens: it
 * only checks that the provider account is the one already linked to the
 * signed-in user, in the same session the flow started from, and then issues
 * a proof. Throws INVALID_STATE for a missing, expired, mismatched or
 * login-intent transaction, and provider errors propagate.
 */
export async function completeReauthentication(
	deps: CompleteReauthenticationDeps,
	input: CompleteReauthenticationInput
): Promise<CompleteReauthenticationResult> {
	const transaction = input.transaction;
	if (
		!oauthTransactionMatches(
			transaction,
			{ provider: input.provider, state: input.state, intent: "reauth" },
			deps.clock.now()
		) ||
		!transaction.reauth
	) {
		throw new Error("INVALID_STATE");
	}
	if (typeof input.code !== "string" || input.code.length === 0) {
		throw new Error("INVALID_STATE");
	}
	const provider = deps.registry.get(input.provider);
	if (!provider) throw new Error("PROVIDER_NOT_FOUND");
	const bound = transaction.reauth;

	// The same user and stored session, still active, before and after the
	// provider visit (it may have taken minutes, and the session can end meanwhile).
	const sameSession = async (): Promise<
		{ session: AuthenticatedSession } | CompleteReauthenticationResult
	> => {
		const validation = await deps.validator.validate(input.sessionToken);
		if (validation.status === "unavailable") {
			return { status: "unavailable", cause: validation.cause };
		}
		if (
			validation.status !== "authenticated" ||
			validation.session.identity.userId !== bound.userId ||
			validation.session.identity.sessionId !== bound.sessionId
		) {
			return { status: "refused", reason: "session_changed" };
		}
		return { session: validation.session };
	};

	const before = await sameSession();
	if (!("session" in before)) return before;

	// Redirect URI, verifier and nonce come from the trusted transaction.
	const { user: oauthUser } = await provider.complete({
		redirectUri: transaction.redirectUri,
		code: input.code,
		state: transaction.state,
		codeVerifier: transaction.codeVerifier,
		nonce: transaction.nonce,
	});

	// By stable provider account id only; an email match proves nothing here.
	const linked = await deps.users.getByProviderAccount({
		provider: oauthUser.provider,
		providerAccountId: oauthUser.providerAccountId,
	});
	if (!linked || linked.id !== bound.userId) {
		return { status: "refused", reason: "account_not_linked" };
	}

	const after = await sameSession();
	if (!("session" in after)) return after;

	const issued = await deps.recentAuth.issueProof(after.session);
	if (issued.status === "issued") {
		return {
			status: "confirmed",
			proof: issued.proof,
			userId: bound.userId,
			sessionId: bound.sessionId,
		};
	}
	if (issued.status === "session_ended") return { status: "refused", reason: "session_changed" };
	return { status: "unavailable", cause: issued.cause };
}
