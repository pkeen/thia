import { it, expect, vi } from "vitest";
import { completeOAuth } from "../../../application/use-cases/complete-oauth";
import { beginOAuth } from "../../../application/use-cases/begin-oauth";
import { InMemoryUoW } from "../../../infra/memory/in-memory-uow";
import { InMemoryStateStore } from "../../../infra/state/in-memory-state-store";
import { SimpleProviderRegistry } from "../../../infra/registry/simple-provider-registry";
import { SystemClock } from "../../../infra/clock/system-clock";
import { UlidIdGenerator } from "../../../infra/id/ulid-id-generator";
import { DevTokenSigner } from "../../../infra/jwt/dev-signer";
import type { OAuthProviderPort } from "../../../application/ports/oauth-provider-port";

function makeFakeProvider(providerAccountId: string, email?: string): OAuthProviderPort {
	return {
		key: "fake",
		name: "Fake",
		begin: ({ state }) => ({
			authorizationUrl: `https://fake.example/authorize?state=${state}`,
		}),
		complete: async () => ({
			tokens: { accessToken: "fake-token" },
			user: {
				provider: "fake",
				providerAccountId,
				email,
				name: "Fake User",
				image: "https://example.com/avatar.png",
			},
		}),
	};
}

function makeDeps(provider: OAuthProviderPort) {
	const clock = new SystemClock();
	const ids = new UlidIdGenerator(clock);
	const uow = new InMemoryUoW();
	const stateStore = new InMemoryStateStore();
	const registry = new SimpleProviderRegistry({ fake: provider });
	const signer = new DevTokenSigner();

	return {
		registry,
		stateStore,
		uow,
		ids,
		clock,
		signer,
		issuer: "thia",
		audience: "web",
		ttlSec: 900,
		policyVersion: 1,
	};
}

it("logs in a brand-new user via OAuth", async () => {
	const provider = makeFakeProvider("acct-1", "a@example.com");
	const deps = makeDeps(provider);

	const { state } = await beginOAuth(
		{ registry: deps.registry, stateStore: deps.stateStore },
		{ provider: "fake", redirectUri: "https://app.example/callback" }
	);

	const result = await completeOAuth(deps, {
		provider: "fake",
		code: "some-code",
		state,
	});

	expect(result.user.email).toBe("a@example.com");
	expect(result.keycards).toHaveLength(1);
});

it("recognizes a returning user by provider account", async () => {
	const provider = makeFakeProvider("acct-2", "b@example.com");
	const deps = makeDeps(provider);

	const first = await beginOAuth(
		{ registry: deps.registry, stateStore: deps.stateStore },
		{ provider: "fake", redirectUri: "https://app.example/callback" }
	);
	const login1 = await completeOAuth(deps, {
		provider: "fake",
		code: "code-1",
		state: first.state,
	});

	const second = await beginOAuth(
		{ registry: deps.registry, stateStore: deps.stateStore },
		{ provider: "fake", redirectUri: "https://app.example/callback" }
	);
	const login2 = await completeOAuth(deps, {
		provider: "fake",
		code: "code-2",
		state: second.state,
	});

	expect(login2.user.id).toBe(login1.user.id);
});

it("falls back to a synthetic email when the provider gives none", async () => {
	const provider = makeFakeProvider("acct-3", undefined);
	const deps = makeDeps(provider);

	const { state } = await beginOAuth(
		{ registry: deps.registry, stateStore: deps.stateStore },
		{ provider: "fake", redirectUri: "https://app.example/callback" }
	);

	const result = await completeOAuth(deps, {
		provider: "fake",
		code: "some-code",
		state,
	});

	expect(result.user.email).toBe("fake-acct-3@users.noreply.thia.local");
});

it("rejects a reused or unknown state", async () => {
	const provider = makeFakeProvider("acct-4", "c@example.com");
	const deps = makeDeps(provider);

	await expect(
		completeOAuth(deps, {
			provider: "fake",
			code: "some-code",
			state: "never-issued",
		})
	).rejects.toThrow("INVALID_STATE");
});
