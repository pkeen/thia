import type {
	AuthenticatedSession,
	GoogleConfig,
	OAuthTransaction,
	SessionPolicy,
	SessionRepository,
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
	createSessionValidator,
	defineSessionPolicy,
	SessionPolicyError,
	signOutEverywhere,
	HmacRefreshTokenCrypto,
	startSession,
	refreshSession,
	signOutSession,
	listUserSessions,
	revokeUserSession,
	deleteEndedSessions,
} from "@thia/core";
import type { RoleStore } from "@thia/authz";
import {
	PostgresRoleStore,
	PostgresSessionRepository,
	PostgresUserRepository,
} from "@thia/adapters-drizzle";
import db from "@/db";
import { OAUTH_TRANSACTION_TTL_SEC } from "@/oauth-cookies";

/**
 * The demo's session policy: user-validated JWTs (so sign-outs apply on the
 * next request) lasting 10 minutes, renewed by rotating refresh tokens for
 * up to 7 idle / 30 total days. Every value can be overridden with the
 * THIA_SESSION_* variables; see docs/guides/session-policies.md.
 */
export const DEFAULT_SESSION_POLICY: SessionPolicy = {
	mode: "jwt-user-validated",
	ttlSec: 10 * 60,
	refresh: { idleTtlSec: 7 * 24 * 60 * 60, absoluteTtlSec: 30 * 24 * 60 * 60 },
};
/** Access-token lifetime when refresh is turned off (Sprint 001 default). */
export const DEFAULT_TTL_WITHOUT_REFRESH_SEC = 30 * 60;

/** Digits only: Number() would also accept "1e3", " 60" or "0x3c". */
function seconds(value: string | undefined, fallback: number) {
	if (!value) return fallback;
	return /^[0-9]{1,8}$/.test(value) ? Number(value) : Number.NaN;
}

/**
 * The session policy from trusted server configuration (never a request or
 * token). Blank variables mean "use the default"; anything else must be
 * valid or this throws, so a bad deploy fails at startup.
 */
export function sessionPolicyFromEnv(
	env: Record<string, string | undefined>
): SessionPolicy {
	const mode = env.THIA_SESSION_MODE || DEFAULT_SESSION_POLICY.mode;
	const switchValue = env.THIA_SESSION_REFRESH || "on";
	if (switchValue !== "on" && switchValue !== "off") {
		throw new SessionPolicyError('THIA_SESSION_REFRESH must be "on" or "off"');
	}

	if (switchValue === "off") {
		if (env.THIA_SESSION_REFRESH_IDLE_SEC || env.THIA_SESSION_REFRESH_ABSOLUTE_SEC) {
			throw new SessionPolicyError(
				"THIA_SESSION_REFRESH_* lifetimes are set but THIA_SESSION_REFRESH is off"
			);
		}
		return defineSessionPolicy({
			mode,
			ttlSec: seconds(env.THIA_SESSION_TTL_SEC, DEFAULT_TTL_WITHOUT_REFRESH_SEC),
		});
	}
	const defaults = DEFAULT_SESSION_POLICY.refresh!;
	return defineSessionPolicy({
		mode,
		ttlSec: seconds(env.THIA_SESSION_TTL_SEC, DEFAULT_SESSION_POLICY.ttlSec),
		refresh: {
			idleTtlSec: seconds(env.THIA_SESSION_REFRESH_IDLE_SEC, defaults.idleTtlSec),
			absoluteTtlSec: seconds(env.THIA_SESSION_REFRESH_ABSOLUTE_SEC, defaults.absoluteTtlSec),
		},
	});
}

export type ThiaOptions = {
	env?: Record<string, string | undefined>;
	/** Test seams; production uses Postgres and Google's published keys. */
	users?: UserRepository;
	roleStore?: RoleStore;
	sessions?: SessionRepository;
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

	const sessionPolicy = sessionPolicyFromEnv(env);
	const tokenConfig = {
		issuer: "thia-clean-builder-app",
		audience: "thia-clean-builder-app",
		// Token expiry, and through it the session cookie's expiry.
		ttlSec: sessionPolicy.ttlSec,
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
		clock,
	});
	// Stored sessions exist only with refresh enabled (ADR-004). Refresh
	// secrets are HMAC'd with a key derived from AUTH_SECRET.
	const sessionStore: SessionRepository | undefined = sessionPolicy.refresh
		? (options.sessions ?? PostgresSessionRepository(db))
		: undefined;
	const refreshCrypto = sessionPolicy.refresh
		? new HmacRefreshTokenCrypto(authSecret)
		: undefined;
	const refreshDeps = () => {
		if (!sessionStore || !refreshCrypto) {
			throw new Error("Refresh tokens are not enabled");
		}
		return {
			policy: sessionPolicy,
			sessions: sessionStore,
			crypto: refreshCrypto,
			users: uow.users,
			signer,
			clock,
			ids,
			issuer: tokenConfig.issuer,
			audience: tokenConfig.audience,
			policyVersion: tokenConfig.policyVersion,
		};
	};

	const sessions = createSessionValidator({
		policy: sessionPolicy,
		verifier,
		clock,
		users: uow.users,
		sessions: sessionStore,
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
		sessionPolicy,

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

		/**
		 * Finishes a login. With refresh enabled this also starts a stored
		 * session: keycards are then [access, refresh].
		 */
		async completeLogin(
			provider: string,
			code: string,
			state: string,
			transaction: OAuthTransaction | undefined,
			context: { deviceLabel?: string | null } = {}
		) {
			return completeOAuth(
				{
					registry,
					uow,
					ids,
					clock,
					signer,
					...tokenConfig,
					issueKeycards: sessionPolicy.refresh
						? async (user) => {
								const issued = await startSession(refreshDeps(), user, context);
								return [issued.access, issued.refresh];
							}
						: undefined,
				},
				{ provider, code, state, transaction }
			);
		},

		/** Rotates a refresh token (ADR-004). Storage errors propagate. */
		async refreshSession(refreshToken: string | null | undefined) {
			return refreshSession(refreshDeps(), refreshToken);
		},

		/**
		 * Ordinary sign-out: revokes this browser's stored session when refresh
		 * is enabled (a no-op otherwise). Storage errors propagate.
		 */
		async signOut(input: {
			session?: AuthenticatedSession | null;
			refreshToken?: string | null;
		}) {
			if (!sessionStore || !refreshCrypto) return { revoked: false };
			return signOutSession({ sessions: sessionStore, crypto: refreshCrypto, clock }, input);
		},

		/** The caller's active sessions (devices). Requires refresh. */
		async listSessions(session: AuthenticatedSession) {
			return listUserSessions(refreshDeps(), session);
		},

		/** Signs one of the caller's own devices out. Requires refresh. */
		async revokeSession(session: AuthenticatedSession, sessionId: string) {
			return revokeUserSession(refreshDeps(), session, sessionId);
		},

		/** Housekeeping to schedule: deletes long-ended session rows. */
		async deleteEndedSessions(retentionSec?: number) {
			return deleteEndedSessions(refreshDeps(), { retentionSec });
		},

		/**
		 * The one session check used by pages, the authorization subject loader
		 * and API routes. Authentication only - roles are looked up separately.
		 */
		async validateSession(token: string | null | undefined) {
			return sessions.validate(token);
		},

		/**
		 * Invalidates every existing token of the session's user (user-validated
		 * mode only; "unsupported" otherwise). Storage errors propagate.
		 */
		async signOutEverywhere(session: AuthenticatedSession) {
			return signOutEverywhere(
				{ policy: sessionPolicy, users: uow.users, sessions: sessionStore, clock },
				session
			);
		},
	};
}

export type Thia = ReturnType<typeof createThia>;

export const thia: Thia = createThia();
