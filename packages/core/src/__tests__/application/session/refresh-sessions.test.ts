import { describe, it, expect, vi } from "vitest";
import {
	REFRESH_GRACE_ACCESS_TTL_SEC,
	REFRESH_REUSE_GRACE_SEC,
	deleteEndedSessions,
	listUserSessions,
	parseRefreshToken,
	refreshSession,
	revokeUserSession,
	signOutSession,
	startSession,
	type RefreshSessionDeps,
} from "../../../application/session/refresh-sessions";
import { createSessionValidator } from "../../../application/session/validate-session";
import { defineSessionPolicy, type SessionMode } from "../../../application/session/session-policy";
import { signOutEverywhere } from "../../../application/use-cases/sign-out-everywhere";
import { HmacTokenSigner, HmacTokenVerifier } from "../../../infra/jwt/hmac-signer";
import { HmacRefreshTokenCrypto } from "../../../infra/session/hmac-refresh-token-crypto";
import { InMemorySessionRepo } from "../../../infra/memory/in-memory-session-repo";
import { InMemoryUserRepo } from "../../../infra/memory/in-memory-user-repo";
import { User } from "../../../domain/entities/user";
import { EmailAddress } from "../../../domain/value-objects/email-address";
import { asUserId } from "../../../domain/primitives";

const SECRET = "refresh-session-test-secret-of-32-bytes!";
const ISS = "thia-test";
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const REFRESH = { idleTtlSec: 7 * 86400, absoluteTtlSec: 30 * 86400 };

/** A controllable clock plus everything the use cases need. */
async function setup(
	mode: SessionMode = "jwt-user-validated",
	refresh: { idleTtlSec: number; absoluteTtlSec: number } = REFRESH
) {
	let now = new Date("2030-01-01T00:00:00Z");
	const clock = { now: () => new Date(now) };
	const users = new InMemoryUserRepo();
	const sessions = new InMemorySessionRepo();
	const crypto = new HmacRefreshTokenCrypto(SECRET);
	const policy = defineSessionPolicy({ mode, ttlSec: 600, refresh });
	let n = 0;
	const deps: RefreshSessionDeps = {
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
	const user = User.create({
		id: asUserId("01USER0000000000000000000"),
		email: EmailAddress.create("a@example.com"),
	});
	await users.save(user);
	return {
		deps,
		users,
		sessions,
		crypto,
		validator,
		user,
		advance: (ms: number) => {
			now = new Date(now.getTime() + ms);
		},
		clock,
	};
}

async function signedIn(ctx: Awaited<ReturnType<typeof setup>>) {
	const user = (await ctx.users.getById(ctx.user.id))!;
	return startSession(ctx.deps, user, { deviceLabel: "Chrome on macOS" });
}

async function authenticated(ctx: Awaited<ReturnType<typeof setup>>, access: string) {
	const r = await ctx.validator.validate(access);
	if (r.status !== "authenticated") throw new Error(`not authenticated: ${JSON.stringify(r)}`);
	return r.session;
}

const claims = (jwt: string) =>
	JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());

describe("startSession", () => {
	it("stores one session with only a hash and returns bound tokens", async () => {
		const ctx = await setup();
		const issued = await signedIn(ctx);

		const stored = (await ctx.sessions.getById(issued.sessionId))!;
		const [id, secret] = issued.refresh.value.split(".");
		expect(id).toBe(issued.sessionId);
		expect(stored.tokenHash).not.toContain(secret);
		expect(stored.tokenHash).not.toBe(secret);
		await expect(ctx.crypto.matches(secret, stored.tokenHash)).resolves.toBe(true);
		expect(stored).toMatchObject({
			userId: ctx.user.id,
			userTokenVersion: 0,
			deviceLabel: "Chrome on macOS",
			revokedAt: null,
		});
		expect(stored.absoluteExpiresAt.getTime() - stored.createdAt.getTime()).toBe(30 * DAY);
		expect(issued.refresh.expiresAt).toEqual(stored.idleExpiresAt);

		const c = claims(issued.access.value);
		expect(c).toMatchObject({ ver: 2, sid: issued.sessionId });
		expect(c.exp - c.iat).toBe(600);
	});

	it("sanitizes the device label", async () => {
		const ctx = await setup();
		const user = (await ctx.users.getById(ctx.user.id))!;
		const { sessionId } = await startSession(ctx.deps, user, {
			deviceLabel: `  evil\u0000\nlabel${"x".repeat(100)}`,
		});
		const label = (await ctx.sessions.getById(sessionId))!.deviceLabel!;
		expect(label).toMatch(/^evillabel/);
		expect(label.length).toBe(64);
	});

	it("refuses to run without a refresh policy", async () => {
		const ctx = await setup();
		const deps = { ...ctx.deps, policy: defineSessionPolicy({ mode: "jwt-stateless", ttlSec: 600 }) };
		await expect(startSession(deps, ctx.user)).rejects.toThrow(/not enabled/);
	});
});

describe("refreshSession: rotation", () => {
	it("returns new tokens, retires the old refresh token, and chains", async () => {
		const ctx = await setup();
		let { refresh } = await signedIn(ctx);
		const seen = new Set([refresh.value]);

		for (let i = 0; i < 5; i++) {
			ctx.advance(10 * MIN);
			const r = await refreshSession(ctx.deps, refresh.value);
			if (r.status !== "refreshed") throw new Error(JSON.stringify(r));
			expect(seen.has(r.refresh.value)).toBe(false);
			seen.add(r.refresh.value);
			await expect(authenticated(ctx, r.access.value)).resolves.toBeTruthy();
			refresh = r.refresh;
		}
	});

	it("slides the idle expiry but never past the absolute expiry", async () => {
		const ctx = await setup("jwt-user-validated", { idleTtlSec: 7 * 86400, absoluteTtlSec: 8 * 86400 });
		const issued = await signedIn(ctx);
		ctx.advance(6 * DAY);
		const r = await refreshSession(ctx.deps, issued.refresh.value);
		if (r.status !== "refreshed") throw new Error(JSON.stringify(r));

		const stored = (await ctx.sessions.getById(issued.sessionId))!;
		expect(stored.idleExpiresAt).toEqual(stored.absoluteExpiresAt);
		expect(r.refresh.expiresAt).toEqual(stored.absoluteExpiresAt);
		expect(stored.lastUsedAt).toEqual(ctx.clock.now());
		// The access token can't outlive the session either.
		ctx.advance(2 * DAY - 5 * MIN);
		const late = await refreshSession(ctx.deps, r.refresh.value);
		if (late.status !== "refreshed") throw new Error(JSON.stringify(late));
		const c = claims(late.access.value);
		expect(c.exp * 1000).toBeLessThanOrEqual(stored.absoluteExpiresAt.getTime());
	});

	it("rejects malformed tokens without touching storage", async () => {
		const ctx = await setup();
		const getById = vi.spyOn(ctx.sessions, "getById");
		for (const bad of [undefined, "", "x", "a.b", `${"A".repeat(22)}.${"B".repeat(42)}`, `${"A".repeat(22)}.${"B".repeat(43)}.c`]) {
			await expect(refreshSession(ctx.deps, bad)).resolves.toEqual({ status: "invalid", reason: "malformed" });
		}
		expect(getById).not.toHaveBeenCalled();
	});

	it("rejects an unknown session and an unrecognized secret without revoking", async () => {
		const ctx = await setup();
		const { sessionId } = await signedIn(ctx);
		await expect(refreshSession(ctx.deps, `${"Z".repeat(22)}.${"B".repeat(43)}`)).resolves.toEqual({
			status: "invalid",
			reason: "unknown_session",
		});
		await expect(refreshSession(ctx.deps, `${sessionId}.${"B".repeat(43)}`)).resolves.toEqual({
			status: "invalid",
			reason: "unrecognized_secret",
		});
		expect((await ctx.sessions.getById(sessionId))!.revokedAt).toBeNull();
	});
});

describe("refreshSession: reuse detection and the grace window", () => {
	it("gives a just-replaced token an access token only, within the grace window", async () => {
		const ctx = await setup();
		const issued = await signedIn(ctx);
		const winner = await refreshSession(ctx.deps, issued.refresh.value);
		expect(winner.status).toBe("refreshed");

		ctx.advance((REFRESH_REUSE_GRACE_SEC - 1) * 1000);
		const loser = await refreshSession(ctx.deps, issued.refresh.value);

		expect(loser.status).toBe("grace");
		expect("refresh" in loser).toBe(false);
		if (loser.status === "grace") await expect(authenticated(ctx, loser.access.value)).resolves.toBeTruthy();
		expect((await ctx.sessions.getById(issued.sessionId))!.revokedAt).toBeNull();
	});

	it("caps the lifetime of an access token issued inside the grace window", async () => {
		const ctx = await setup();
		const issued = await signedIn(ctx);
		const winner = await refreshSession(ctx.deps, issued.refresh.value);
		if (winner.status !== "refreshed") throw new Error();
		const loser = await refreshSession(ctx.deps, issued.refresh.value);
		if (loser.status !== "grace") throw new Error();

		const lifetimeSec = (k: { expiresAt?: Date }) => (k.expiresAt!.getTime() - ctx.deps.clock.now().getTime()) / 1000;
		expect(ctx.deps.policy.ttlSec).toBeGreaterThan(REFRESH_GRACE_ACCESS_TTL_SEC);
		expect(lifetimeSec(loser.access)).toBeLessThanOrEqual(REFRESH_GRACE_ACCESS_TTL_SEC);
		expect(lifetimeSec(winner.access)).toBeGreaterThan(REFRESH_GRACE_ACCESS_TTL_SEC);
	});

	it("revokes the session when a replaced token is reused after the grace window", async () => {
		const ctx = await setup();
		const issued = await signedIn(ctx);
		const winner = await refreshSession(ctx.deps, issued.refresh.value);
		if (winner.status !== "refreshed") throw new Error();

		ctx.advance((REFRESH_REUSE_GRACE_SEC + 1) * 1000);
		await expect(refreshSession(ctx.deps, issued.refresh.value)).resolves.toEqual({
			status: "invalid",
			reason: "reuse_detected",
		});

		const stored = (await ctx.sessions.getById(issued.sessionId))!;
		expect(stored.revokedReason).toBe("reuse_detected");
		// The legitimate holder's newer token is dead too, and so is its access token.
		await expect(refreshSession(ctx.deps, winner.refresh.value)).resolves.toMatchObject({ reason: "revoked" });
		await expect(ctx.validator.validate(winner.access.value)).resolves.toEqual({
			status: "unauthenticated",
			reason: "session_ended",
		});
	});

	it("lets exactly one of several concurrent refreshes rotate; the rest get grace", async () => {
		const ctx = await setup();
		const issued = await signedIn(ctx);

		const results = await Promise.all(
			Array.from({ length: 5 }, () => refreshSession(ctx.deps, issued.refresh.value))
		);

		expect(results.filter((r) => r.status === "refreshed")).toHaveLength(1);
		expect(results.filter((r) => r.status === "grace")).toHaveLength(4);
	});
});

describe("refreshSession: expiry and user checks", () => {
	it("ends an idle session", async () => {
		const ctx = await setup();
		const issued = await signedIn(ctx);
		ctx.advance(7 * DAY);
		await expect(refreshSession(ctx.deps, issued.refresh.value)).resolves.toEqual({
			status: "invalid",
			reason: "expired",
		});
	});

	it("ends a session at its absolute expiry however active", async () => {
		const ctx = await setup("jwt-user-validated", { idleTtlSec: 7 * 86400, absoluteTtlSec: 10 * 86400 });
		let { refresh } = await signedIn(ctx);
		for (let day = 0; day < 9; day++) {
			ctx.advance(DAY);
			const r = await refreshSession(ctx.deps, refresh.value);
			if (r.status !== "refreshed") throw new Error(`day ${day}: ${JSON.stringify(r)}`);
			refresh = r.refresh;
		}
		ctx.advance(DAY);
		await expect(refreshSession(ctx.deps, refresh.value)).resolves.toMatchObject({ reason: "expired" });
	});

	it("caps existing sessions when the absolute limit is lowered, and persists the cap", async () => {
		const ctx = await setup();
		const issued = await signedIn(ctx);
		const tightened = defineSessionPolicy({
			mode: "jwt-user-validated",
			ttlSec: 600,
			refresh: { idleTtlSec: 86400, absoluteTtlSec: 2 * 86400 },
		});
		const deps = { ...ctx.deps, policy: tightened };

		ctx.advance(DAY);
		const r = await refreshSession(deps, issued.refresh.value);
		if (r.status !== "refreshed") throw new Error();
		const stored = (await ctx.sessions.getById(issued.sessionId))!;
		expect(stored.absoluteExpiresAt.getTime() - stored.createdAt.getTime()).toBe(2 * DAY);

		ctx.advance(DAY);
		await expect(refreshSession(deps, r.refresh.value)).resolves.toMatchObject({ reason: "expired" });
	});

	it("never extends existing sessions when limits are raised", async () => {
		const ctx = await setup("jwt-user-validated", { idleTtlSec: 86400, absoluteTtlSec: 2 * 86400 });
		const issued = await signedIn(ctx);
		const deps = { ...ctx.deps, policy: defineSessionPolicy({ mode: "jwt-user-validated", ttlSec: 600, refresh: REFRESH }) };
		ctx.advance(DAY - MIN);
		const r = await refreshSession(deps, issued.refresh.value);
		if (r.status !== "refreshed") throw new Error();
		ctx.advance(DAY + MIN);
		await expect(refreshSession(deps, r.refresh.value)).resolves.toMatchObject({ reason: "expired" });
	});

	it("revokes the session of a deleted user", async () => {
		const ctx = await setup();
		const issued = await signedIn(ctx);
		const emptyUsers = new InMemoryUserRepo();
		await expect(refreshSession({ ...ctx.deps, users: emptyUsers }, issued.refresh.value)).resolves.toEqual({
			status: "invalid",
			reason: "user_not_found",
		});
		expect((await ctx.sessions.getById(issued.sessionId))!.revokedAt).not.toBeNull();
	});

	it("refuses a session issued before the user's token version changed", async () => {
		const ctx = await setup();
		const issued = await signedIn(ctx);
		await ctx.users.incrementTokenVersion(ctx.user.id);
		await expect(refreshSession(ctx.deps, issued.refresh.value)).resolves.toMatchObject({
			reason: "user_version_changed",
		});
	});

	it("propagates storage failures", async () => {
		const ctx = await setup();
		const issued = await signedIn(ctx);
		vi.spyOn(ctx.sessions, "getById").mockRejectedValue(new Error("db down"));
		await expect(refreshSession(ctx.deps, issued.refresh.value)).rejects.toThrow("db down");
	});
});

describe("validation of session-bound access tokens", () => {
	it("user-validated: a revoked session's access token fails on the next request", async () => {
		const ctx = await setup("jwt-user-validated");
		const laptop = await signedIn(ctx);
		const phone = await signedIn(ctx);

		await ctx.sessions.revoke(laptop.sessionId, "device_sign_out", ctx.clock.now());

		await expect(ctx.validator.validate(laptop.access.value)).resolves.toMatchObject({ reason: "session_ended" });
		await expect(authenticated(ctx, phone.access.value)).resolves.toMatchObject({
			identity: { sessionId: phone.sessionId },
		});
	});

	it("user-validated: loads user and session together, once each", async () => {
		const ctx = await setup("jwt-user-validated");
		const issued = await signedIn(ctx);
		const userGet = vi.spyOn(ctx.users, "getById");
		const sessionGet = vi.spyOn(ctx.sessions, "getById");
		await authenticated(ctx, issued.access.value);
		expect(userGet).toHaveBeenCalledTimes(1);
		expect(sessionGet).toHaveBeenCalledTimes(1);
	});

	it("user-validated: a session outage fails closed", async () => {
		const ctx = await setup("jwt-user-validated");
		const issued = await signedIn(ctx);
		vi.spyOn(ctx.sessions, "getById").mockRejectedValue(new Error("db down"));
		await expect(ctx.validator.validate(issued.access.value)).resolves.toMatchObject({ status: "unavailable" });
	});

	it("stateless: requests don't read sessions; revocation applies at the next refresh", async () => {
		const ctx = await setup("jwt-stateless");
		const issued = await signedIn(ctx);
		const sessionGet = vi.spyOn(ctx.sessions, "getById");

		await ctx.sessions.revoke(issued.sessionId, "device_sign_out", ctx.clock.now());
		await expect(authenticated(ctx, issued.access.value)).resolves.toBeTruthy();
		expect(sessionGet).not.toHaveBeenCalled();

		await expect(refreshSession(ctx.deps, issued.refresh.value)).resolves.toMatchObject({ reason: "revoked" });
	});

	it("accepts ver 1 tokens (issued before refresh) until they expire", async () => {
		const ctx = await setup("jwt-user-validated");
		const { issueAccessToken } = await import("../../../application/use-cases/issue-access-token");
		const legacy = await issueAccessToken({ ...ctx.deps, ttlSec: 1800 }, ctx.user);
		expect(claims(legacy.value)).toMatchObject({ ver: 1 });
		expect(claims(legacy.value).sid).toBeUndefined();
		await expect(authenticated(ctx, legacy.value)).resolves.toBeTruthy();
	});

	it("requires a session repository in user-validated mode with refresh", async () => {
		const ctx = await setup();
		expect(() =>
			createSessionValidator({
				policy: ctx.deps.policy,
				verifier: new HmacTokenVerifier(SECRET, { issuer: ISS, audience: ISS }),
				clock: ctx.clock,
				users: ctx.users,
			})
		).toThrow(/session repository/);
	});
});

describe("signing out", () => {
	it("ordinary sign-out revokes only this session", async () => {
		const ctx = await setup();
		const laptop = await signedIn(ctx);
		const phone = await signedIn(ctx);

		await expect(
			signOutSession(ctx.deps, { session: await authenticated(ctx, laptop.access.value), refreshToken: laptop.refresh.value })
		).resolves.toEqual({ revoked: true });

		await expect(refreshSession(ctx.deps, laptop.refresh.value)).resolves.toMatchObject({ reason: "revoked" });
		await expect(refreshSession(ctx.deps, phone.refresh.value)).resolves.toMatchObject({ status: "refreshed" });
	});

	it("sign-out by refresh token alone requires a matching secret", async () => {
		const ctx = await setup();
		const issued = await signedIn(ctx);
		await expect(
			signOutSession(ctx.deps, { refreshToken: `${issued.sessionId}.${"B".repeat(43)}` })
		).resolves.toEqual({ revoked: false });
		await expect(signOutSession(ctx.deps, { refreshToken: issued.refresh.value })).resolves.toEqual({
			revoked: true,
		});
	});

	it("sign out everywhere revokes every session and reports latency per mode", async () => {
		for (const mode of ["jwt-user-validated", "jwt-stateless"] as const) {
			const ctx = await setup(mode);
			const a = await signedIn(ctx);
			const b = await signedIn(ctx);
			const result = await signOutEverywhere(
				{ policy: ctx.deps.policy, users: ctx.users, sessions: ctx.sessions, clock: ctx.clock },
				await authenticated(ctx, a.access.value)
			);
			expect(result).toEqual({
				status: "revoked",
				tokenVersion: 1,
				sessions: { revoked: 2, immediate: mode === "jwt-user-validated" },
			});
			for (const s of [a, b]) {
				await expect(refreshSession(ctx.deps, s.refresh.value)).resolves.toMatchObject({ reason: "revoked" });
			}
			// A new sign-in works.
			await expect(signedIn(ctx).then((s) => refreshSession(ctx.deps, s.refresh.value))).resolves.toMatchObject({
				status: "refreshed",
			});
		}
	});

	it("a session created concurrently with sign out everywhere can't refresh", async () => {
		const ctx = await setup();
		const stale = (await ctx.users.getById(ctx.user.id))!; // loaded before the revocation
		await ctx.users.incrementTokenVersion(ctx.user.id);
		const issued = await startSession(ctx.deps, stale);
		await expect(refreshSession(ctx.deps, issued.refresh.value)).resolves.toMatchObject({
			reason: "user_version_changed",
		});
	});
});

describe("devices", () => {
	it("lists active sessions with the current one marked", async () => {
		const ctx = await setup();
		const laptop = await signedIn(ctx);
		ctx.advance(MIN);
		const phone = await signedIn(ctx);
		const revoked = await signedIn(ctx);
		await ctx.sessions.revoke(revoked.sessionId, "sign_out", ctx.clock.now());

		const list = await listUserSessions(ctx.deps, await authenticated(ctx, phone.access.value));

		expect(list.map((s) => [s.id, s.current])).toEqual([
			[phone.sessionId, true],
			[laptop.sessionId, false],
		]);
	});

	it("revokes one of the caller's own devices", async () => {
		const ctx = await setup();
		const laptop = await signedIn(ctx);
		const phone = await signedIn(ctx);
		const me = await authenticated(ctx, phone.access.value);

		await expect(revokeUserSession(ctx.deps, me, laptop.sessionId)).resolves.toEqual({
			status: "revoked",
			current: false,
		});
		await expect(revokeUserSession(ctx.deps, me, laptop.sessionId)).resolves.toEqual({ status: "not_found" });
		await expect(ctx.validator.validate(laptop.access.value)).resolves.toMatchObject({ reason: "session_ended" });
	});

	it("can't revoke another user's session, which looks exactly like a missing one", async () => {
		const ctx = await setup();
		const mine = await signedIn(ctx);
		const other = User.create({ id: asUserId("01OTHER00000000000000000"), email: EmailAddress.create("o@example.com") });
		await ctx.users.save(other);
		const theirs = await startSession(ctx.deps, other);

		const result = await revokeUserSession(ctx.deps, await authenticated(ctx, mine.access.value), theirs.sessionId);

		expect(result).toEqual({ status: "not_found" });
		expect((await ctx.sessions.getById(theirs.sessionId))!.revokedAt).toBeNull();
	});

	it("cleanup deletes only sessions ended before the retention cut-off", async () => {
		const ctx = await setup();
		const old = await signedIn(ctx);
		const live = await signedIn(ctx);
		await ctx.sessions.revoke(old.sessionId, "sign_out", ctx.clock.now());
		ctx.advance(8 * DAY);
		const fresh = await signedIn(ctx);

		// `live` idle-expired 1 day ago, `old` was revoked 8 days ago.
		await expect(deleteEndedSessions(ctx.deps, { retentionSec: 2 * 86400 })).resolves.toBe(1);
		expect(await ctx.sessions.getById(old.sessionId)).toBeNull();
		expect(await ctx.sessions.getById(live.sessionId)).not.toBeNull();
		expect(await ctx.sessions.getById(fresh.sessionId)).not.toBeNull();
	});
});

describe("parseRefreshToken", () => {
	it("splits a well-formed token", () => {
		const t = `${"A".repeat(22)}.${"b".repeat(43)}`;
		expect(parseRefreshToken(t)).toEqual({ sessionId: "A".repeat(22), secret: "b".repeat(43) });
	});
});

describe("HmacRefreshTokenCrypto", () => {
	it("keys hashes with the secret, so rotating it invalidates tokens", async () => {
		const a = new HmacRefreshTokenCrypto(SECRET);
		const b = new HmacRefreshTokenCrypto("a-completely-different-secret-32-bytes!!");
		const secret = a.newSecret();
		expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(a.newSessionId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
		await expect(a.matches(secret, await a.hash(secret))).resolves.toBe(true);
		await expect(b.matches(secret, await a.hash(secret))).resolves.toBe(false);
		await expect(a.matches(secret, null)).resolves.toBe(false);
	});

	it("rejects a short secret", () => {
		expect(() => new HmacRefreshTokenCrypto("short")).toThrow();
	});
});
