import {
	GitHub,
	SimpleProviderRegistry,
	InMemoryStateStore,
	InMemoryUoW,
	SystemClock,
	UlidIdGenerator,
	DevTokenSigner,
	DevTokenVerifier,
	beginOAuth,
	completeOAuth,
} from "@thia/core";

// NOTE (MVP): in-memory UoW + state store. Swap for @thia/adapters-drizzle's
// PostgresUserRepository once a migration exists for this app's database.
const clock = new SystemClock();
const ids = new UlidIdGenerator(clock);
const uow = new InMemoryUoW();
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
