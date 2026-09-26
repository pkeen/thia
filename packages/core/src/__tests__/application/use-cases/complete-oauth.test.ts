import { describe, it, expect, vi, afterEach } from "vitest";
import { completeOAuth } from "../../../application/use-cases/complete-oauth";
import { beginOAuth } from "../../../application/use-cases/begin-oauth";
import { deriveCodeChallenge } from "../../../application/oauth/pkce";
import { InMemoryUoW } from "../../../infra/memory/in-memory-uow";
import { SimpleProviderRegistry } from "../../../infra/registry/simple-provider-registry";
import { SystemClock } from "../../../infra/clock/system-clock";
import { UlidIdGenerator } from "../../../infra/id/ulid-id-generator";
import { DevTokenSigner } from "../../../infra/jwt/dev-signer";
import type { OAuthProviderPort } from "../../../application/ports/oauth-provider-port";
import type { OAuthTransaction } from "../../../application/ports/oauth-transaction-port";
import { EmailAddress } from "../../../domain/value-objects/email-address";

const CALLBACK = "https://app.example/callback";

function makeFakeProvider(
	providerAccountId: string,
	email?: string,
	key = "fake",
	emailVerified = true
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
				emailVerified,
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
	const registry = new SimpleProviderRegistry(
		Object.fromEntries(providers.map((p) => [p.key, p]))
	);
	const signer = new DevTokenSigner();

	return {
		registry,
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

type Deps = ReturnType<typeof makeDeps>;

const begin = (deps: Deps, provider: string) =>
	beginOAuth(
		{ registry: deps.registry, clock: deps.clock },
		{ provider, redirectUri: CALLBACK }
	);

/** Runs begin -> complete for one provider, as the redirect routes do. */
async function signIn(deps: Deps, provider: string, code = "code") {
	const { transaction } = await begin(deps, provider);
	return completeOAuth(deps, {
		provider,
		code,
		state: transaction.state,
		transaction,
	});
}

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

it("logs in a brand-new user via OAuth", async () => {
	const deps = makeDeps(makeFakeProvider("acct-1", "a@example.com"));

	const result = await signIn(deps, "fake");

	expect(result.user.email).toBe("a@example.com");
	expect(result.keycards).toHaveLength(1);
});

it("recognizes a returning user by provider account", async () => {
	const deps = makeDeps(makeFakeProvider("acct-2", "b@example.com"));

	const login1 = await signIn(deps, "fake", "code-1");
	const login2 = await signIn(deps, "fake", "code-2");

	expect(login2.user.id).toBe(login1.user.id);
});

it("falls back to a synthetic email when the provider gives none", async () => {
	const deps = makeDeps(makeFakeProvider("acct-3", undefined));

	const result = await signIn(deps, "fake");

	expect(result.user.email).toBe("fake-acct-3@users.noreply.thia.local");
});

describe("beginOAuth", () => {
	it("sends the S256 challenge of the verifier it keeps, and a nonce only to OIDC providers", async () => {
		const plain = makeFakeProvider("p", "p@example.com", "plain");
		const oidc = { ...makeFakeProvider("o", "o@example.com", "oidc"), oidc: true };
		const plainBegin = vi.spyOn(plain, "begin");
		const oidcBegin = vi.spyOn(oidc, "begin");
		const deps = makeDeps(plain, oidc);

		const a = await begin(deps, "plain");
		const b = await begin(deps, "oidc");

		expect(plainBegin).toHaveBeenCalledWith({
			redirectUri: CALLBACK,
			state: a.transaction.state,
			nonce: undefined,
			codeChallenge: await deriveCodeChallenge(a.transaction.codeVerifier),
		});
		expect(a.transaction.nonce).toBeUndefined();
		expect(b.transaction.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(oidcBegin.mock.calls[0][0].nonce).toBe(b.transaction.nonce);
	});

	it("records provider, callback, lifetime and returnTo in the transaction", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const deps = makeDeps(makeFakeProvider("x", "x@example.com"));

		const { transaction } = await beginOAuth(
			{ registry: deps.registry, clock: deps.clock, ttlSec: 300 },
			{ provider: "fake", redirectUri: CALLBACK, returnTo: "/thia/admin" }
		);

		const issuedAt = Date.parse("2026-01-01T00:00:00Z") / 1000;
		expect(transaction).toMatchObject({
			providerId: "fake",
			redirectUri: CALLBACK,
			returnTo: "/thia/admin",
			issuedAt,
			expiresAt: issuedAt + 300,
		});
	});

	it("generates a fresh state and verifier for every attempt", async () => {
		const deps = makeDeps(makeFakeProvider("x", "x@example.com"));

		const attempts = await Promise.all(
			Array.from({ length: 20 }, () => begin(deps, "fake"))
		);

		const states = new Set(attempts.map((a) => a.transaction.state));
		const verifiers = new Set(attempts.map((a) => a.transaction.codeVerifier));
		expect(states.size).toBe(20);
		expect(verifiers.size).toBe(20);
		for (const { transaction } of attempts) {
			expect(transaction.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
			// RFC 7636 §4.1: 43-128 unreserved characters.
			expect(transaction.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
			expect(transaction.codeVerifier).not.toBe(transaction.state);
		}
	});
});

describe("transaction validation", () => {
	it("passes the transaction's verifier, nonce and callback URI to the provider", async () => {
		const provider = { ...makeFakeProvider("acct", "v@example.com"), oidc: true };
		const complete = vi.spyOn(provider, "complete");
		const deps = makeDeps(provider);

		const { transaction } = await begin(deps, "fake");
		await completeOAuth(deps, {
			provider: "fake",
			code: "the-code",
			state: transaction.state,
			transaction,
		});

		expect(complete).toHaveBeenCalledWith({
			redirectUri: CALLBACK,
			code: "the-code",
			state: transaction.state,
			codeVerifier: transaction.codeVerifier,
			nonce: transaction.nonce,
		});
	});

	/** Every rejection must happen before the provider sees the code. */
	async function expectRejectedWithoutExchange(
		mutate: (tx: OAuthTransaction) => {
			provider?: string;
			code?: string;
			state?: string;
			transaction?: OAuthTransaction | undefined;
		}
	) {
		const github = makeFakeProvider("gh", "r@example.com", "github");
		const google = makeFakeProvider("go", "r@example.com", "google");
		const calls = [vi.spyOn(github, "complete"), vi.spyOn(google, "complete")];
		const deps = makeDeps(github, google);
		const { transaction } = await begin(deps, "github");

		const input = {
			provider: "github",
			code: "code",
			state: transaction.state,
			transaction,
			...mutate(transaction),
		};
		await expect(completeOAuth(deps, input)).rejects.toThrow("INVALID_STATE");
		for (const call of calls) expect(call).not.toHaveBeenCalled();
		expect(
			await deps.uow.users.getByEmail(EmailAddress.create("r@example.com"))
		).toBeNull();
	}

	it("rejects a callback with no transaction", () =>
		expectRejectedWithoutExchange(() => ({ transaction: undefined })));

	it("rejects a state that doesn't match the transaction", () =>
		expectRejectedWithoutExchange((tx) => ({
			state: tx.state.slice(0, -1) + (tx.state.endsWith("A") ? "B" : "A"),
		})));

	it("rejects an empty state", () =>
		expectRejectedWithoutExchange(() => ({ state: "" })));

	it("rejects an empty code", () =>
		expectRejectedWithoutExchange(() => ({ code: "" })));

	it("rejects a transaction issued for a different provider, without calling either", () =>
		expectRejectedWithoutExchange(() => ({ provider: "google" })));

	it("rejects a structurally invalid transaction", () =>
		expectRejectedWithoutExchange((tx) => ({
			transaction: { ...tx, codeVerifier: "too-short" },
		})));

	it("rejects a transaction past its expiry, whatever the cookie did", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
		const provider = makeFakeProvider("acct-6", "e@example.com");
		const complete = vi.spyOn(provider, "complete");
		const deps = makeDeps(provider);

		const { transaction } = await begin(deps, "fake");

		// default lifetime is 10 minutes
		vi.setSystemTime(new Date("2026-01-01T00:10:00Z"));

		await expect(
			completeOAuth(deps, {
				provider: "fake",
				code: "code",
				state: transaction.state,
				transaction,
			})
		).rejects.toThrow("INVALID_STATE");
		expect(complete).not.toHaveBeenCalled();
	});

	it("does not itself prevent reusing a transaction - the provider's single-use code does", async () => {
		// With client-held transactions there is no server-side record to
		// consume. A second completion reaches the provider with the same
		// code and verifier, which a real provider rejects as already used.
		const provider = makeFakeProvider("acct-5", "d@example.com");
		const used = new Set<string>();
		vi.spyOn(provider, "complete").mockImplementation(async ({ code }) => {
			if (used.has(code)) throw new Error("invalid_grant");
			used.add(code);
			return {
				tokens: { accessToken: "t" },
				user: { provider: "fake", providerAccountId: "acct-5" },
			};
		});
		const deps = makeDeps(provider);
		const { transaction } = await begin(deps, "fake");
		const input = { provider: "fake", code: "code", state: transaction.state, transaction };

		await completeOAuth(deps, input);
		await expect(completeOAuth(deps, input)).rejects.toThrow("invalid_grant");
	});
});

it("rejects an unknown provider when beginning and completing", async () => {
	const deps = makeDeps(makeFakeProvider("acct-7", "f@example.com"));

	await expect(begin(deps, "ghost")).rejects.toThrow("PROVIDER_NOT_FOUND");

	// a transaction for a provider that is no longer registered
	const { transaction } = await begin(deps, "fake");
	const ghost = { ...transaction, providerId: "ghost" };
	await expect(
		completeOAuth(deps, {
			provider: "ghost",
			code: "code",
			state: ghost.state,
			transaction: ghost,
		})
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

describe("account linking by email", () => {
	it("marks a new user's email verified when the provider verified it", async () => {
		const deps = makeDeps(makeFakeProvider("acct-9", "h@example.com"));
		await signIn(deps, "fake");

		const stored = await deps.uow.users.getByEmail(
			EmailAddress.create("h@example.com")
		);
		expect(stored?.emailVerified).toBeInstanceOf(Date);
	});

	it("leaves a new user's email unverified when the provider didn't verify it", async () => {
		const deps = makeDeps(
			makeFakeProvider("acct-10", "i@example.com", "fake", false)
		);
		await signIn(deps, "fake");

		const stored = await deps.uow.users.getByEmail(
			EmailAddress.create("i@example.com")
		);
		expect(stored?.emailVerified).toBeNull();
	});

	it("refuses to link when the new provider hasn't verified the email", async () => {
		const deps = makeDeps(
			makeFakeProvider("owner", "victim@example.com", "google"),
			makeFakeProvider("attacker", "victim@example.com", "sketchy", false)
		);
		const owner = await signIn(deps, "google");

		await expect(signIn(deps, "sketchy")).rejects.toThrow(
			"ACCOUNT_LINK_CONFLICT"
		);

		const stored = await deps.uow.users.getByEmail(
			EmailAddress.create("victim@example.com")
		);
		expect(stored?.id).toBe(owner.user.id);
		expect(stored?.accounts.map((a) => a.provider)).toEqual(["google"]);
	});

	it("refuses to link the real owner into an account created with an unverified email", async () => {
		// Pre-account hijacking: the attacker signs up first with the victim's
		// email through a provider that doesn't verify it.
		const deps = makeDeps(
			makeFakeProvider("attacker", "victim@example.com", "sketchy", false),
			makeFakeProvider("owner", "victim@example.com", "google")
		);
		await signIn(deps, "sketchy");

		await expect(signIn(deps, "google")).rejects.toThrow(
			"ACCOUNT_LINK_CONFLICT"
		);

		const stored = await deps.uow.users.getByEmail(
			EmailAddress.create("victim@example.com")
		);
		expect(stored?.accounts.map((a) => a.provider)).toEqual(["sketchy"]);
	});

	it("never links automatically when accountLinking is 'never'", async () => {
		const deps = {
			...makeDeps(
				makeFakeProvider("gh-11", "j@example.com", "github"),
				makeFakeProvider("go-11", "j@example.com", "google")
			),
			accountLinking: "never" as const,
		};
		await signIn(deps, "github");

		await expect(signIn(deps, "google")).rejects.toThrow(
			"ACCOUNT_LINK_CONFLICT"
		);
	});

	it("verifies a returning user's email once a provider confirms it", async () => {
		const unverified = makeFakeProvider("acct-12", "k@example.com");
		const deps = makeDeps(unverified);

		// First sign-in reports the email unverified...
		vi.spyOn(unverified, "complete").mockResolvedValueOnce({
			tokens: { accessToken: "t" },
			user: {
				provider: "fake",
				providerAccountId: "acct-12",
				email: "k@example.com",
				emailVerified: false,
			},
		});
		await signIn(deps, "fake");
		const before = await deps.uow.users.getByEmail(
			EmailAddress.create("k@example.com")
		);
		expect(before?.emailVerified).toBeNull();

		// ...the next reports it verified.
		await signIn(deps, "fake");
		const after = await deps.uow.users.getByEmail(
			EmailAddress.create("k@example.com")
		);
		expect(after?.emailVerified).toBeInstanceOf(Date);
	});
});
