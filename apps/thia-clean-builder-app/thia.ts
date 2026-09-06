import type { UnitOfWork } from "@thia/core";
import {
	GitHub,
	SimpleProviderRegistry,
	InMemoryStateStore,
	SystemClock,
	UlidIdGenerator,
	DevTokenSigner,
	DevTokenVerifier,
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
const signer = new DevTokenSigner();
const verifier = new DevTokenVerifier();

const registry = new SimpleProviderRegistry({
	github: new GitHub({
		clientId: process.env.GITHUB_CLIENT_ID!,
		clientSecret: process.env.GITHUB_CLIENT_SECRET!,
		redirectUri: process.env.GITHUB_REDIRECT_URI!,
	}),
});

const tokenConfig = {
	issuer: "thia-clean-builder-app",
	audience: "thia-clean-builder-app",
	ttlSec: 60 * 30,
	policyVersion: 1,
};

export const thia = {
	uow,

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
