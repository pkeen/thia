import { ProviderRegistryPort } from "../ports/provider-registry-port";
import { Clock } from "../ports/clock.port";
import { OAuthTransaction } from "../ports/oauth-transaction-port";
import {
	createCodeVerifier,
	deriveCodeChallenge,
	randomUrlSafeToken,
} from "../oauth/pkce";
import { DEFAULT_OAUTH_TRANSACTION_TTL_SEC } from "../oauth/transaction";

export type BeginOAuthInput = {
	provider: string;
	/** The provider's configured callback URI - never one taken from the request. */
	redirectUri: string;
	returnTo?: string;
};

export type BeginOAuthOutput = {
	authorizationUrl: string;
	/**
	 * Holds the PKCE verifier and nonce, so the caller must persist it only in
	 * encrypted form (see OAuthTransactionSealer) and pass it back to
	 * `completeOAuth`.
	 */
	transaction: OAuthTransaction;
};

/**
 * Starts a login attempt: a fresh random state, PKCE verifier (sent as its
 * S256 challenge) and, for OIDC providers, nonce. Stores nothing - the caller
 * owns persistence of the returned transaction.
 */
export async function beginOAuth(
	deps: {
		registry: ProviderRegistryPort;
		clock: Clock;
		ttlSec?: number;
	},
	input: BeginOAuthInput
): Promise<BeginOAuthOutput> {
	const provider = deps.registry.get(input.provider);
	if (!provider) throw new Error("PROVIDER_NOT_FOUND");

	const issuedAt = Math.floor(deps.clock.now().getTime() / 1000);
	const ttlSec = deps.ttlSec ?? DEFAULT_OAUTH_TRANSACTION_TTL_SEC;

	const state = randomUrlSafeToken();
	const codeVerifier = createCodeVerifier();
	const nonce = provider.oidc ? randomUrlSafeToken() : undefined;

	const transaction: OAuthTransaction = {
		state,
		providerId: input.provider,
		redirectUri: input.redirectUri,
		codeVerifier,
		...(nonce ? { nonce } : {}),
		...(input.returnTo ? { returnTo: input.returnTo } : {}),
		issuedAt,
		expiresAt: issuedAt + ttlSec,
	};

	const { authorizationUrl } = provider.begin({
		redirectUri: input.redirectUri,
		state,
		nonce,
		codeChallenge: await deriveCodeChallenge(codeVerifier),
	});

	return { authorizationUrl, transaction };
}
