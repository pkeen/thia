import type {
	GoogleConfig,
	OAuthTransaction,
	UnitOfWork,
	UserRepository,
} from "@thia/core";
import {
	GitHub,
	Google,
	SimpleProviderRegistry,
	JoseOAuthTransactionSealer,
	SystemClock,
	UlidIdGenerator,
	HmacTokenSigner,
	HmacTokenVerifier,
	beginOAuth,
	completeOAuth,
} from "@thia/core";
import type { RoleStore } from "@thia/authz";
import {
	PostgresRoleStore,
	PostgresUserRepository,
} from "@thia/adapters-drizzle";
import db from "@/db";
import { OAUTH_TRANSACTION_TTL_SEC } from "@/oauth-cookies";

export type ThiaOptions = {
	env?: Record<string, string | undefined>;
	/** Test seams; production uses Postgres and Google's published keys. */
	users?: UserRepository;
	roleStore?: RoleStore;
	googleJwks?: GoogleConfig["jwks"];
};

/**
 * Builds the auth wiring from configuration alone. Nothing about a login in
 * progress is held in memory: the OAuth transaction travels in an encrypted
 * cookie, so any instance built from the same AUTH_SECRET and provider config
 * can finish a login another instance started (and survives restarts).
 */
export function createThia(options: ThiaOptions = {}) {
	const env = options.env ?? process.env;

	// User storage is Postgres via the drizzle adapter; commit/rollback are
	// no-ops since each repo call is already a single statement (no
	// multi-step transaction to wrap yet).
	const clock = new SystemClock();
	const ids = new UlidIdGenerator(clock);
	const uow: UnitOfWork = {
		users: options.users ?? PostgresUserRepository(db),
		async commit() {},
		async rollback() {},
	};

	const tokenConfig = {
		issuer: "thia-clean-builder-app",
		audience: "thia-clean-builder-app",
		ttlSec: 60 * 30,
		policyVersion: 1,
	};

	// AUTH_SECRET must be a real random secret (>= 32 bytes), e.g.
	// `openssl rand -base64 32`, and the same on every instance. It signs
	// session tokens directly and, through a separate HKDF-derived key,
	// encrypts OAuth transaction cookies. These constructors throw if it's
	// missing or too short, so a misconfigured deploy fails at startup.
	const authSecret = env.AUTH_SECRET!;
	const signer = new HmacTokenSigner(authSecret);
	const verifier = new HmacTokenVerifier(authSecret, {
		issuer: tokenConfig.issuer,
		audience: tokenConfig.audience,
	});
	const sealer = new JoseOAuthTransactionSealer(authSecret, {
		maxAgeSec: OAUTH_TRANSACTION_TTL_SEC,
	});

	const redirectUris: Record<string, string | undefined> = {
		github: env.GITHUB_REDIRECT_URI,
		google: env.GOOGLE_REDIRECT_URI,
	};

	const registry = new SimpleProviderRegistry({
		github: new GitHub({
			clientId: env.GITHUB_CLIENT_ID!,
			clientSecret: env.GITHUB_CLIENT_SECRET!,
			redirectUri: redirectUris.github!,
		}),
		google: new Google({
			clientId: env.GOOGLE_CLIENT_ID!,
			clientSecret: env.GOOGLE_CLIENT_SECRET!,
			redirectUri: redirectUris.google!,
			jwks: options.googleJwks,
		}),
	});

	// Role assignments live in Postgres; reads aren't cached, so granting or
	// revoking a role takes effect on the user's next request.
	const roleStore = options.roleStore ?? PostgresRoleStore(db);

	/** The configured callback URI for a provider; undefined if unknown. */
	const redirectUriFor = (provider: string): string | undefined =>
		Object.hasOwn(redirectUris, provider) ? redirectUris[provider] : undefined;

	return {
		uow,
		roleStore,
		redirectUriFor,

		/**
		 * Starts a login: returns the provider URL and the transaction sealed
		 * for a cookie. The callback URI is always the configured one.
		 */
		async beginLogin(provider: string, returnTo?: string) {
			const redirectUri = redirectUriFor(provider);
			if (!redirectUri) throw new Error("PROVIDER_NOT_FOUND");
			const { authorizationUrl, transaction } = await beginOAuth(
				{ registry, clock, ttlSec: OAUTH_TRANSACTION_TTL_SEC },
				{ provider, redirectUri, returnTo }
			);
			return {
				authorizationUrl,
				transaction,
				sealedTransaction: await sealer.seal(transaction),
			};
		},

		/** Decrypts and validates a transaction cookie; undefined if unusable. */
		async openTransaction(sealed: string): Promise<OAuthTransaction | undefined> {
			return sealer.unseal(sealed, clock.now());
		},

		async completeLogin(
			provider: string,
			code: string,
			state: string,
			transaction: OAuthTransaction | undefined
		) {
			return completeOAuth(
				{ registry, uow, ids, clock, signer, ...tokenConfig },
				{ provider, code, state, transaction }
			);
		},

		async verifySession(token: string) {
			return verifier.verify(token);
		},
	};
}

export type Thia = ReturnType<typeof createThia>;

export const thia: Thia = createThia();
