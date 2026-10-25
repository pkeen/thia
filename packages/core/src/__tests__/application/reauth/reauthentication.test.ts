import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import {
	REAUTH_MAX_AGE_SEC,
	ReauthConfigurationError,
	createRecentAuthentication,
} from "../../../application/reauth/recent-authentication";
import {
	beginReauthentication,
	completeReauthentication,
} from "../../../application/reauth/reauthenticate";
import { beginOAuth } from "../../../application/use-cases/begin-oauth";
import { completeOAuth } from "../../../application/use-cases/complete-oauth";
import {
	refreshSession,
	startSession,
	signOutSession,
} from "../../../application/session/refresh-sessions";
import { createSessionValidator } from "../../../application/session/validate-session";
import type { AuthenticatedSession } from "../../../application/session/validate-session";
import { defineSessionPolicy } from "../../../application/session/session-policy";
import { oauthTransactionMatches } from "../../../application/oauth/transaction";
import type { OAuthProviderPort } from "../../../application/ports/oauth-provider-port";
import type { OAuthTransaction } from "../../../application/ports/oauth-transaction-port";
import { HmacTokenSigner, HmacTokenVerifier } from "../../../infra/jwt/hmac-signer";
import { HmacRefreshTokenCrypto } from "../../../infra/session/hmac-refresh-token-crypto";
import { JoseReauthProofCodec } from "../../../infra/reauth/jose-reauth-proof-codec";
import { JoseOAuthTransactionSealer } from "../../../infra/oauth-transaction/jose-transaction-sealer";
import { InMemorySessionRepo } from "../../../infra/memory/in-memory-session-repo";
import { InMemoryUserRepo } from "../../../infra/memory/in-memory-user-repo";
import { InMemoryUoW } from "../../../infra/memory/in-memory-uow";
import { SimpleProviderRegistry } from "../../../infra/registry/simple-provider-registry";
import { User } from "../../../domain/entities/user";
import { EmailAddress } from "../../../domain/value-objects/email-address";
import { LinkedAccount } from "../../../domain/value-objects/linked-account";
import { asUserId } from "../../../domain/primitives";

const SECRET = "reauthentication-test-secret-32-bytes!";
const ISS = "thia-test";
const MIN = 60_000;
const CALLBACK = "https://app.example/callback";
const REFRESH = { idleTtlSec: 7 * 86400, absoluteTtlSec: 30 * 86400 };

/** The provider "confirms" whichever account `account.id` currently holds. */
function fakeProvider(account: { id: string; email?: string }): OAuthProviderPort {
	return {
		key: "fake",
		name: "fake",
		begin: ({ state }) => ({ authorizationUrl: `https://fake.example/authorize?state=${state}` }),
		complete: async () => ({
			tokens: { accessToken: "t" },
			user: {
				provider: "fake",
				providerAccountId: account.id,
				email: account.email,
				emailVerified: true,
				name: "Fake",
			},
		}),
	};
}

async function setup(policy = defineSessionPolicy({ mode: "jwt-user-validated", ttlSec: 600, refresh: REFRESH })) {
	let now = new Date("2030-01-01T00:00:00Z");
	const clock = { now: () => new Date(now) };
	const users = new InMemoryUserRepo();
	const sessions = new InMemorySessionRepo();
	const crypto = new HmacRefreshTokenCrypto(SECRET);
	const account = { id: "acct-1", email: "a@example.com" };
	const registry = new SimpleProviderRegistry({ fake: fakeProvider(account) });
	let n = 0;
	const deps = {
		policy,
		sessions,
		crypto,
		users,
		signer: new HmacTokenSigner(SECRET),
		clock,
		ids: { userId: () => `u${++n}`, jti: () => `j${++n}` },
		issuer: ISS,
		audience: ISS,
		policyVersion: 1,
	};
	const validator = createSessionValidator({
		policy,
		verifier: new HmacTokenVerifier(SECRET, { issuer: ISS, audience: ISS, clock }),
		clock,
		users,
		sessions,
	});
	const proofs = new JoseReauthProofCodec(SECRET, { maxLifetimeSec: REAUTH_MAX_AGE_SEC });
	const recentAuth = createRecentAuthentication({ policy, sessions, proofs, clock });

	const makeUser = async (id: string, email: string, providerAccountId?: string) => {
		const user = User.create({ id: asUserId(id), email: EmailAddress.create(email) });
		if (providerAccountId) {
			user.linkAccount(
				LinkedAccount.link({ type: "oauth", provider: "fake", providerAccountId })
			);
		}
		await users.save(user);
		return user;
	};
	const alice = await makeUser("01USER0000000000000000000", "a@example.com", "acct-1");

	const signIn = async (user: User = alice) => {
		const issued = await startSession(deps, (await users.getById(user.id))!, {});
		const r = await validator.validate(issued.access.value);
		if (r.status !== "authenticated") throw new Error("not authenticated");
		return { issued, session: r.session };
	};
	const complete = (
		tx: OAuthTransaction | undefined,
		sessionToken: string | undefined,
		over: { state?: string; code?: string } = {}
	) =>
		completeReauthentication(
			{ registry, users, clock, validator, recentAuth },
			{
				provider: "fake",
				code: over.code ?? "code",
				state: over.state ?? tx?.state ?? "x",
				transaction: tx,
				sessionToken,
			}
		);
	const begin = async (session: AuthenticatedSession) =>
		(await beginReauthentication({ registry, clock }, { provider: "fake", redirectUri: CALLBACK, session })).transaction;

	return {
		deps, users, sessions, validator, proofs, recentAuth, registry, clock, account, alice, makeUser,
		signIn, complete, begin,
		advance: (ms: number) => {
			now = new Date(now.getTime() + ms);
		},
	};
}
type Ctx = Awaited<ReturnType<typeof setup>>;

/** Sign in, run the re-auth flow, return the confirmed proof. */
async function confirmed(ctx: Ctx) {
	const { issued, session } = await ctx.signIn();
	const tx = await ctx.begin(session);
	const result = await ctx.complete(tx, issued.access.value);
	if (result.status !== "confirmed") throw new Error(`not confirmed: ${JSON.stringify(result)}`);
	return { issued, session, proof: result.proof };
}

describe("enabling the guard", () => {
	it.each([
		["jwt-stateless with refresh", { mode: "jwt-stateless", ttlSec: 600, refresh: REFRESH }],
		["jwt-stateless without refresh", { mode: "jwt-stateless", ttlSec: 600 }],
		["jwt-user-validated without refresh", { mode: "jwt-user-validated", ttlSec: 600 }],
	])("refuses %s at setup", (_name, input) => {
		const policy = defineSessionPolicy(input);
		expect(() =>
			createRecentAuthentication({
				policy,
				sessions: new InMemorySessionRepo(),
				proofs: new JoseReauthProofCodec(SECRET, { maxLifetimeSec: 600 }),
				clock: { now: () => new Date() },
			})
		).toThrow(ReauthConfigurationError);
	});

	it("refuses a missing session repository and an over-long window", async () => {
		const policy = defineSessionPolicy({ mode: "jwt-user-validated", ttlSec: 600, refresh: REFRESH });
		const base = {
			policy,
			proofs: new JoseReauthProofCodec(SECRET, { maxLifetimeSec: 600 }),
			clock: { now: () => new Date() },
		};
		expect(() => createRecentAuthentication({ ...base, sessions: undefined })).toThrow(ReauthConfigurationError);
		expect(() =>
			createRecentAuthentication({ ...base, sessions: new InMemorySessionRepo(), maxAgeSec: 601 })
		).toThrow(ReauthConfigurationError);
	});

	it("fails closed for a stateless session reaching a valid guard", async () => {
		const ctx = await setup();
		const { session } = await ctx.signIn();
		const stateless = { mode: "jwt-stateless", identity: session.identity } as AuthenticatedSession;
		expect(await ctx.recentAuth.check(stateless, "anything")).toMatchObject({
			status: "unavailable",
			reason: "unsupported_configuration",
		});
	});
});

describe("proof issuance", () => {
	it("is minted only by a completed re-authentication", async () => {
		const ctx = await setup();
		const { issued, session } = await ctx.signIn();
		// Login, refresh, and further sign-ins carry no proof.
		expect(await ctx.recentAuth.check(session, undefined)).toEqual({ status: "missing" });
		ctx.advance(9 * MIN);
		const refreshed = await refreshSession(ctx.deps, issued.refresh.value);
		expect(refreshed.status).toBe("refreshed");
		if (refreshed.status !== "refreshed") return;
		const after = await ctx.validator.validate(refreshed.access.value);
		if (after.status !== "authenticated") throw new Error("not authenticated");
		expect(await ctx.recentAuth.check(after.session, issued.access.value)).toEqual({ status: "missing" });
		expect(await ctx.recentAuth.check(after.session, refreshed.refresh.value)).toEqual({ status: "missing" });
	});

	it("is valid for 10 minutes from confirmation, then expires", async () => {
		const ctx = await setup();
		const { session, proof } = await confirmed(ctx);
		expect(proof.expiresAt.getTime() - ctx.clock.now().getTime()).toBe(REAUTH_MAX_AGE_SEC * 1000);
		expect(await ctx.recentAuth.check(session, proof.value)).toMatchObject({ status: "valid" });
		ctx.advance(9 * MIN + 59_000);
		expect(await ctx.recentAuth.check(session, proof.value)).toMatchObject({ status: "valid" });
		ctx.advance(2_000);
		expect(await ctx.recentAuth.check(session, proof.value)).toEqual({ status: "expired" });
	});

	it("never outlives the stored session's absolute expiry", async () => {
		const ctx = await setup(
			defineSessionPolicy({
				mode: "jwt-user-validated",
				ttlSec: 600,
				refresh: { idleTtlSec: 3600, absoluteTtlSec: 3600 },
			})
		);
		const { issued, session } = await ctx.signIn();
		ctx.advance(55 * MIN); // 5 minutes of session left
		const fresh = await ctx.validator.validate(issued.access.value);
		// The access token (10 min) has expired by now; rebuild a session view.
		expect(fresh.status).toBe("unauthenticated");
		const r = await refreshSession(ctx.deps, issued.refresh.value);
		if (r.status !== "refreshed") throw new Error("refresh failed");
		const v = await ctx.validator.validate(r.access.value);
		if (v.status !== "authenticated") throw new Error("not authenticated");
		const tx = await ctx.begin(v.session);
		const result = await ctx.complete(tx, r.access.value);
		if (result.status !== "confirmed") throw new Error("not confirmed");
		expect(result.proof.expiresAt.getTime() - ctx.clock.now().getTime()).toBeLessThanOrEqual(5 * MIN);
		expect(session.identity.sessionId).toBe(v.session.identity.sessionId);
		ctx.advance(5 * MIN + 1000);
		expect(await ctx.recentAuth.check(v.session, result.proof.value)).not.toMatchObject({ status: "valid" });
	});
});

describe("the guard", () => {
	it("rejects a proof from another session of the same user", async () => {
		const ctx = await setup();
		const { proof } = await confirmed(ctx);
		const other = await ctx.signIn(); // second device, no proof of its own
		expect(await ctx.recentAuth.check(other.session, proof.value)).toEqual({ status: "session_changed" });
		expect(await ctx.recentAuth.check(other.session, undefined)).toEqual({ status: "missing" });
	});

	it("rejects a proof for another user", async () => {
		const ctx = await setup();
		const { proof } = await confirmed(ctx);
		const bob = await ctx.makeUser("01USER0000000000000000001", "b@example.com", "acct-2");
		const bobs = await ctx.signIn(bob);
		expect(await ctx.recentAuth.check(bobs.session, proof.value)).toEqual({ status: "session_changed" });
	});

	it("rejects an old token version", async () => {
		const ctx = await setup();
		const { session, proof } = await confirmed(ctx);
		const older = {
			...session,
			identity: { ...session.identity, tokenVersion: session.identity.tokenVersion + 1 },
		} as AuthenticatedSession;
		expect(await ctx.recentAuth.check(older, proof.value)).toEqual({ status: "session_changed" });
	});

	it("rejects proof once the stored session is signed out or revoked", async () => {
		const ctx = await setup();
		const { issued, session, proof } = await confirmed(ctx);
		await signOutSession(
			{ sessions: ctx.sessions, crypto: ctx.deps.crypto, clock: ctx.clock },
			{ session, refreshToken: issued.refresh.value }
		);
		expect(await ctx.recentAuth.check(session, proof.value)).toEqual({ status: "session_changed" });
	});

	it("treats tampered, foreign-purpose and garbage values as no proof", async () => {
		const ctx = await setup();
		const { issued, session, proof } = await confirmed(ctx);
		expect(await ctx.recentAuth.check(session, proof.value.slice(0, -2) + "xx")).toEqual({ status: "missing" });
		expect(await ctx.recentAuth.check(session, issued.access.value)).toEqual({ status: "missing" });
		expect(await ctx.recentAuth.check(session, "not-a-token")).toEqual({ status: "missing" });
		// Signed with the raw secret (as access tokens are) rather than the derived key.
		const forged = await new SignJWT({ sid: session.identity.sessionId, uvn: 0 })
			.setProtectedHeader({ alg: "HS256", typ: "thia-reauth-proof+jwt" })
			.setAudience("thia:reauth-proof")
			.setSubject(session.identity.userId)
			.setIssuedAt(Math.floor(ctx.clock.now().getTime() / 1000))
			.setExpirationTime(Math.floor(ctx.clock.now().getTime() / 1000) + 300)
			.sign(new TextEncoder().encode(SECRET));
		expect(await ctx.recentAuth.check(session, forged)).toEqual({ status: "missing" });
	});

	it("refuses to seal or open a proof lifetime over the cap", async () => {
		const ctx = await setup();
		const claims = { userId: "u", sessionId: "A".repeat(22), tokenVersion: 0, issuedAt: 1000, expiresAt: 1000 + 601 };
		await expect(ctx.proofs.seal(claims)).rejects.toThrow("INVALID_REAUTH_PROOF");
		const lax = new JoseReauthProofCodec(SECRET, { maxLifetimeSec: 3600 });
		const token = await lax.seal(claims);
		expect(await ctx.proofs.open(token, new Date(1100 * 1000))).toEqual({ status: "invalid" });
	});

	it("fails closed when storage is unavailable", async () => {
		const ctx = await setup();
		const { session, proof } = await confirmed(ctx);
		ctx.sessions.getById = async () => {
			throw new Error("connect ECONNREFUSED");
		};
		expect(await ctx.recentAuth.check(session, proof.value)).toMatchObject({
			status: "unavailable",
			reason: "session_lookup_failed",
		});
	});
});

describe("the re-authentication flow", () => {
	it("binds the transaction to the user and session and refuses a login callback", async () => {
		const ctx = await setup();
		const { issued, session } = await ctx.signIn();
		const tx = await ctx.begin(session);
		expect(tx.intent).toBe("reauth");
		expect(tx.reauth).toEqual({ userId: session.identity.userId, sessionId: session.identity.sessionId });
		const now = ctx.clock.now();
		expect(oauthTransactionMatches(tx, { provider: "fake", state: tx.state, intent: "login" }, now)).toBe(false);
		// completeOAuth must not accept it, and nothing is created or signed in.
		const uow = new InMemoryUoW();
		await expect(
			completeOAuth(
				{
					registry: ctx.registry, uow, ids: ctx.deps.ids, clock: ctx.clock, signer: ctx.deps.signer,
					issuer: ISS, audience: ISS, ttlSec: 600, policyVersion: 1,
				},
				{ provider: "fake", code: "c", state: tx.state, transaction: tx }
			)
		).rejects.toThrow("INVALID_STATE");
		expect((await ctx.complete(tx, issued.access.value)).status).toBe("confirmed");
	});

	it("refuses a login transaction on the re-auth callback", async () => {
		const ctx = await setup();
		const { issued } = await ctx.signIn();
		const { transaction } = await beginOAuth(
			{ registry: ctx.registry, clock: ctx.clock },
			{ provider: "fake", redirectUri: CALLBACK }
		);
		await expect(ctx.complete(transaction, issued.access.value)).rejects.toThrow("INVALID_STATE");
	});

	it.each([
		["missing transaction", () => undefined],
		["wrong state", (tx: OAuthTransaction) => ({ tx, state: "x".repeat(43) })],
	])("rejects %s", async (_n, make) => {
		const ctx = await setup();
		const { issued, session } = await ctx.signIn();
		const tx = await ctx.begin(session);
		const made = make(tx) as undefined | { tx: OAuthTransaction; state: string };
		await expect(
			made ? ctx.complete(made.tx, issued.access.value, { state: made.state }) : ctx.complete(undefined, issued.access.value)
		).rejects.toThrow("INVALID_STATE");
	});

	it("rejects an expired transaction", async () => {
		const ctx = await setup();
		const { issued, session } = await ctx.signIn();
		const tx = await ctx.begin(session);
		ctx.advance(11 * MIN);
		await expect(ctx.complete(tx, issued.access.value)).rejects.toThrow("INVALID_STATE");
	});

	it("rejects a transaction for another provider", async () => {
		const ctx = await setup();
		const { issued, session } = await ctx.signIn();
		const tx = { ...(await ctx.begin(session)), providerId: "other" };
		await expect(ctx.complete(tx, issued.access.value)).rejects.toThrow("INVALID_STATE");
	});

	it("refuses with no session, a different user or a different session", async () => {
		const ctx = await setup();
		const first = await ctx.signIn();
		const tx = await ctx.begin(first.session);

		expect(await ctx.complete(tx, undefined)).toEqual({ status: "refused", reason: "session_changed" });
		expect(await ctx.complete(tx, "garbage")).toEqual({ status: "refused", reason: "session_changed" });

		const sameUserOtherDevice = await ctx.signIn();
		expect(await ctx.complete(tx, sameUserOtherDevice.issued.access.value)).toEqual({
			status: "refused", reason: "session_changed",
		});

		const bob = await ctx.makeUser("01USER0000000000000000001", "b@example.com", "acct-2");
		const bobs = await ctx.signIn(bob);
		expect(await ctx.complete(tx, bobs.issued.access.value)).toEqual({
			status: "refused", reason: "session_changed",
		});
	});

	it("refuses a revoked session even though the provider exchange would succeed", async () => {
		const ctx = await setup();
		const { issued, session } = await ctx.signIn();
		const tx = await ctx.begin(session);
		await ctx.sessions.revoke(session.identity.sessionId!, "sign_out", ctx.clock.now());
		expect(await ctx.complete(tx, issued.access.value)).toEqual({ status: "refused", reason: "session_changed" });
	});

	it("refuses an account not linked to the user, even with a matching email", async () => {
		const ctx = await setup();
		const { issued, session } = await ctx.signIn();
		const tx = await ctx.begin(session);
		// Same email as alice, but a different provider account that is unlinked.
		ctx.account.id = "someone-else";
		expect(await ctx.complete(tx, issued.access.value)).toEqual({ status: "refused", reason: "account_not_linked" });
		// A provider account linked to another user.
		await ctx.makeUser("01USER0000000000000000001", "b@example.com", "acct-2");
		ctx.account.id = "acct-2";
		expect(await ctx.complete(tx, issued.access.value)).toEqual({ status: "refused", reason: "account_not_linked" });
	});

	it("creates no user, link or session", async () => {
		const ctx = await setup();
		const { issued, session } = await ctx.signIn();
		const tx = await ctx.begin(session);
		ctx.account.id = "brand-new";
		ctx.account.email = "new@example.com";
		const before = (await ctx.sessions.listActiveForUser(session.identity.userId, ctx.clock.now())).length;
		await ctx.complete(tx, issued.access.value);
		expect(await ctx.users.getByEmail(EmailAddress.create("new@example.com"))).toBeNull();
		expect(await ctx.users.getByProviderAccount({ provider: "fake", providerAccountId: "brand-new" })).toBeNull();
		expect((await ctx.sessions.listActiveForUser(session.identity.userId, ctx.clock.now())).length).toBe(before);
	});

	it("an older copy of the access token cannot inherit a proof earned elsewhere", async () => {
		const ctx = await setup();
		const stolen = await ctx.signIn(); // attacker holds this token (same sid)
		const tx = await ctx.begin(stolen.session);
		const done = await ctx.complete(tx, stolen.issued.access.value); // legitimate browser re-auths
		expect(done.status).toBe("confirmed");
		// The attacker's request has the session but not the proof cookie.
		expect(await ctx.recentAuth.check(stolen.session, undefined)).toEqual({ status: "missing" });
	});

	it("sealed transactions round-trip the binding and reject a stripped one", async () => {
		const ctx = await setup();
		const { session } = await ctx.signIn();
		const tx = await ctx.begin(session);
		const sealer = new JoseOAuthTransactionSealer(SECRET);
		const opened = await sealer.unseal(await sealer.seal(tx), ctx.clock.now());
		expect(opened?.reauth).toEqual(tx.reauth);
		expect(opened?.intent).toBe("reauth");
		const { reauth: _drop, ...stripped } = tx;
		await expect(sealer.seal(stripped as OAuthTransaction)).rejects.toThrow("INVALID_TRANSACTION");
	});

	it("refuses to begin for a session with no stored-session id", async () => {
		const ctx = await setup();
		const { session } = await ctx.signIn();
		const stateless = { mode: "jwt-stateless", identity: session.identity } as AuthenticatedSession;
		await expect(
			beginReauthentication({ registry: ctx.registry, clock: ctx.clock }, { provider: "fake", redirectUri: CALLBACK, session: stateless })
		).rejects.toThrow("REAUTH_SESSION_UNSUPPORTED");
	});
});
