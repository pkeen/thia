import type { UnitOfWork } from "@thia/core";
import {
	GitHub,
	Google,
	SimpleProviderRegistry,
	InMemoryStateStore,
	SystemClock,
	UlidIdGenerator,
	HmacTokenSigner,
	HmacTokenVerifier,
	beginOAuth,
	completeOAuth,
} from "@thia/core";
import { PostgresUserRepository } from "@thia/adapters-drizzle";
import db from "@/db";

// NOTE (MVP): state store is still in-memory (fine - it's a short-lived CSRF
// token, single dev process). User storage is real Postgres via the drizzle
// adapter; commit/rollback are no-ops since each repo call is already a
// single statement (no multi-step transaction to wrap yet).
const clock = new SystemClock();
const ids = new UlidIdGenerator(clock);
const uow: UnitOfWork = {
	users: PostgresUserRepository(db),
	async commit() {},
	async rollback() {},
};
const stateStore = new InMemoryStateStore();

const tokenConfig = {
	issuer: "thia-clean-builder-app",
	audience: "thia-clean-builder-app",
	ttlSec: 60 * 30,
	policyVersion: 1,
};

// AUTH_SECRET must be a real random secret (>= 32 bytes), e.g.
// `openssl rand -base64 32` - HmacTokenSigner/Verifier throw immediately if
// it's missing or too short, so a misconfigured deploy fails at startup.
const authSecret = process.env.AUTH_SECRET!;
const signer = new HmacTokenSigner(authSecret);
const verifier = new HmacTokenVerifier(authSecret, {
	issuer: tokenConfig.issuer,
	audience: tokenConfig.audience,
});

const redirectUris: Record<string, string> = {
	github: process.env.GITHUB_REDIRECT_URI!,
	google: process.env.GOOGLE_REDIRECT_URI!,
};

const registry = new SimpleProviderRegistry({
	github: new GitHub({
		clientId: process.env.GITHUB_CLIENT_ID!,
		clientSecret: process.env.GITHUB_CLIENT_SECRET!,
		redirectUri: redirectUris.github,
	}),
	google: new Google({
		clientId: process.env.GOOGLE_CLIENT_ID!,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
		redirectUri: redirectUris.google,
	}),
});

export const thia = {
	uow,

	redirectUriFor(provider: string): string | undefined {
		return redirectUris[provider];
	},

	async beginLogin(provider: string, redirectUri: string) {
		return beginOAuth({ registry, stateStore }, { provider, redirectUri });
	},

	async completeLogin(provider: string, code: string, state: string) {
		return completeOAuth(
			{ registry, stateStore, uow, ids, clock, signer, ...tokenConfig },
			{ provider, code, state }
		);
	},

	async verifySession(token: string) {
		return verifier.verify(token);
	},
};
