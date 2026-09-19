import { it, expect, vi, afterEach } from "vitest";
import { completeOAuth } from "../../../application/use-cases/complete-oauth";
import { beginOAuth } from "../../../application/use-cases/begin-oauth";
import { InMemoryUoW } from "../../../infra/memory/in-memory-uow";
import { InMemoryStateStore } from "../../../infra/state/in-memory-state-store";
import { SimpleProviderRegistry } from "../../../infra/registry/simple-provider-registry";
import { SystemClock } from "../../../infra/clock/system-clock";
import { UlidIdGenerator } from "../../../infra/id/ulid-id-generator";
import { DevTokenSigner } from "../../../infra/jwt/dev-signer";
import type { OAuthProviderPort } from "../../../application/ports/oauth-provider-port";
import { EmailAddress } from "../../../domain/value-objects/email-address";

function makeFakeProvider(
	providerAccountId: string,
	email?: string,
	key = "fake"
): OAuthProviderPort {
	return {
		key,
		name: key,
		begin: ({ state }) => ({
			authorizationUrl: `https://fake.example/authorize?state=${state}`,
		}),
		complete: async () => ({
			tokens: { accessToken: "fake-token" },
			user: {
				provider: key,
				providerAccountId,
				email,
				name: "Fake User",
				image: "https://example.com/avatar.png",
			},
		}),
	};
}

function makeDeps(...providers: OAuthProviderPort[]) {
	const clock = new SystemClock();
	const ids = new UlidIdGenerator(clock);
	const uow = new InMemoryUoW();
	const stateStore = new InMemoryStateStore();
	const registry = new SimpleProviderRegistry(
		Object.fromEntries(providers.map((p) => [p.key, p]))
	);
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

/** Runs begin -> complete for one provider, as the redirect routes do. */
async function signIn(
	deps: ReturnType<typeof makeDeps>,
	provider: string,
	code = "code"
) {
	const { state } = await beginOAuth(
		{ registry: deps.registry, stateStore: deps.stateStore },
		{ provider, redirectUri: "https://app.example/callback" }
	);
	return completeOAuth(deps, { provider, code, state });
}

afterEach(() => {
	vi.useRealTimers();
});

it("links a second provider to the existing user with the same email", async () => {
	const deps = makeDeps(
		makeFakeProvider("gh-1", "same@example.com", "github"),
		makeFakeProvider("go-1", "same@example.com", "google")
	);

	const viaGithub = await signIn(deps, "github");
	const viaGoogle = await signIn(deps, "google");
	const viaGithubAgain = await signIn(deps, "github");

	expect(viaGoogle.user.id).toBe(viaGithub.user.id);
	expect(viaGithubAgain.user.id).toBe(viaGithub.user.id);

	const stored = await deps.uow.users.getByEmail(
		EmailAddress.create("same@example.com")
	);
	expect(stored?.accounts.map((a) => a.provider).sort()).toEqual([
		"github",
		"google",
	]);
});

it("rejects a state issued for a different provider, without calling either", async () => {
	const github = makeFakeProvider("gh-2", "x@example.com", "github");
	const google = makeFakeProvider("go-2", "x@example.com", "google");
	const githubComplete = vi.spyOn(github, "complete");
	const googleComplete = vi.spyOn(google, "complete");
	const deps = makeDeps(github, google);

	const { state } = await beginOAuth(
		{ registry: deps.registry, stateStore: deps.stateStore },
		{ provider: "github", redirectUri: "https://app.example/callback" }
	);

	await expect(
		completeOAuth(deps, { provider: "google", code: "code", state })
	).rejects.toThrow("INVALID_STATE");
	expect(githubComplete).not.toHaveBeenCalled();
	expect(googleComplete).not.toHaveBeenCalled();
});

it("rejects a state that has already been used", async () => {
	const deps = makeDeps(makeFakeProvider("acct-5", "d@example.com"));

	const { state } = await beginOAuth(
		{ registry: deps.registry, stateStore: deps.stateStore },
		{ provider: "fake", redirectUri: "https://app.example/callback" }
	);
	await completeOAuth(deps, { provider: "fake", code: "code", state });

	await expect(
		completeOAuth(deps, { provider: "fake", code: "code", state })
	).rejects.toThrow("INVALID_STATE");
});

it("rejects a state older than the state store's lifetime", async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
	const deps = makeDeps(makeFakeProvider("acct-6", "e@example.com"));

	const { state } = await beginOAuth(
		{ registry: deps.registry, stateStore: deps.stateStore },
		{ provider: "fake", redirectUri: "https://app.example/callback" }
	);

	// default lifetime is 10 minutes
	vi.setSystemTime(new Date("2026-01-01T00:11:00Z"));

	await expect(
		completeOAuth(deps, { provider: "fake", code: "code", state })
	).rejects.toThrow("INVALID_STATE");
});

it("rejects an unknown provider when beginning and completing", async () => {
	const deps = makeDeps(makeFakeProvider("acct-7", "f@example.com"));

	await expect(
		beginOAuth(
			{ registry: deps.registry, stateStore: deps.stateStore },
			{ provider: "ghost", redirectUri: "https://app.example/callback" }
		)
	).rejects.toThrow("PROVIDER_NOT_FOUND");

	// a state for a provider that is no longer registered
	const state = await deps.stateStore.issue({
		providerId: "ghost",
		redirectUri: "https://app.example/callback",
	});
	await expect(
		completeOAuth(deps, { provider: "ghost", code: "code", state })
	).rejects.toThrow("PROVIDER_NOT_FOUND");
});

it("creates no user when the provider exchange fails", async () => {
	const provider = makeFakeProvider("acct-8", "g@example.com");
	vi.spyOn(provider, "complete").mockRejectedValue(new Error("bad code"));
	const deps = makeDeps(provider);

	await expect(signIn(deps, "fake")).rejects.toThrow("bad code");
	expect(
		await deps.uow.users.getByEmail(EmailAddress.create("g@example.com"))
	).toBeNull();
});
