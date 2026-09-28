import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { startTestDb } from "./_helpers/start-db";
import { PostgresUserRepository } from "../user-repository";
import { PostgresSessionRepository } from "../session-repository";
import {
	EmailAddress,
	HmacRefreshTokenCrypto,
	HmacTokenSigner,
	User,
	asUserId,
	defineSessionPolicy,
	refreshSession,
	startSession,
	type RefreshSessionDeps,
} from "@thia/core";

let ctx: Awaited<ReturnType<typeof startTestDb>> | undefined;

beforeAll(async () => {
	ctx = await startTestDb();
}, 120_000);

afterAll(async () => {
	if (ctx) await ctx.stop();
});

const users = () => PostgresUserRepository(ctx!.db);
const sessions = () => PostgresSessionRepository(ctx!.db);
const DAY = 86_400_000;
let seq = 0;

async function createUser() {
	const id = asUserId(`01SESSUSER${String(++seq).padStart(15, "0")}`);
	await users().save(User.create({ id, email: EmailAddress.create(`s${seq}@sess.test`) }));
	return id;
}

async function createSession(userId: ReturnType<typeof asUserId>, id = `S${String(++seq).padStart(21, "0")}`) {
	const now = new Date();
	await sessions().create({
		id,
		userId,
		tokenHash: "hash-0",
		userTokenVersion: 0,
		createdAt: now,
		lastUsedAt: now,
		idleExpiresAt: new Date(now.getTime() + 7 * DAY),
		absoluteExpiresAt: new Date(now.getTime() + 30 * DAY),
		deviceLabel: "Firefox on Linux",
	});
	return id;
}

const rotation = (id: string, expectedHash: string, newHash: string) => {
	const now = new Date();
	return sessions().rotate({
		id,
		expectedHash,
		newHash,
		now,
		idleExpiresAt: new Date(now.getTime() + 7 * DAY),
		absoluteExpiresAt: new Date(now.getTime() + 30 * DAY),
	});
};

describe("PostgresSessionRepository", () => {
	it("creates and reads a session", async () => {
		const userId = await createUser();
		const id = await createSession(userId);
		await expect(sessions().getById(id)).resolves.toMatchObject({
			id,
			userId,
			tokenHash: "hash-0",
			previousTokenHash: null,
			rotatedAt: null,
			revokedAt: null,
			deviceLabel: "Firefox on Linux",
		});
		await expect(sessions().getById("S-missing")).resolves.toBeNull();
	});

	it("rotates as a compare-and-swap, keeping the previous hash", async () => {
		const id = await createSession(await createUser());
		await expect(rotation(id, "hash-0", "hash-1")).resolves.toBe(true);
		await expect(rotation(id, "hash-0", "hash-x")).resolves.toBe(false);
		const s = (await sessions().getById(id))!;
		expect(s.tokenHash).toBe("hash-1");
		expect(s.previousTokenHash).toBe("hash-0");
		expect(s.rotatedAt).toBeInstanceOf(Date);
	});

	it("lets exactly one of many concurrent rotations with the same hash succeed", async () => {
		const id = await createSession(await createUser());
		const results = await Promise.all(
			Array.from({ length: 25 }, (_, i) => rotation(id, "hash-0", `hash-r${i}`))
		);
		expect(results.filter(Boolean)).toHaveLength(1);
		const winner = results.indexOf(true);
		expect((await sessions().getById(id))!.tokenHash).toBe(`hash-r${winner}`);
	});

	it("never resurrects a revoked session, however revocation and rotation race", async () => {
		for (let round = 0; round < 10; round++) {
			const id = await createSession(await createUser());
			const [rotated, revoked] = await Promise.all([
				rotation(id, "hash-0", "hash-1"),
				sessions().revoke(id, "device_sign_out", new Date()),
			]);
			expect(revoked).toBe(true);
			const s = (await sessions().getById(id))!;
			expect(s.revokedAt).not.toBeNull();
			// Whichever ran first, no further rotation can succeed.
			await expect(rotation(id, rotated ? "hash-1" : "hash-0", "hash-2")).resolves.toBe(false);
		}
	});

	it("revokes once, and revokes all of one user's sessions only", async () => {
		const alice = await createUser();
		const bob = await createUser();
		const a1 = await createSession(alice);
		await createSession(alice);
		const b1 = await createSession(bob);

		await expect(sessions().revoke(a1, "sign_out", new Date())).resolves.toBe(true);
		await expect(sessions().revoke(a1, "sign_out", new Date())).resolves.toBe(false);
		await expect(sessions().revokeAllForUser(alice, "sign_out_everywhere", new Date())).resolves.toBe(1);
		expect((await sessions().getById(a1))!.revokedReason).toBe("sign_out");
		expect((await sessions().getById(b1))!.revokedAt).toBeNull();
	});

	it("lists active sessions newest first", async () => {
		const userId = await createUser();
		const older = await createSession(userId);
		await new Promise((r) => setTimeout(r, 5));
		const newer = await createSession(userId);
		const revoked = await createSession(userId);
		await sessions().revoke(revoked, "sign_out", new Date());

		const list = await sessions().listActiveForUser(userId, new Date());
		expect(list.map((s) => s.id)).toEqual([newer, older]);
	});

	it("deletes only sessions that ended before the cut-off", async () => {
		const userId = await createUser();
		const revokedLongAgo = await createSession(userId);
		const live = await createSession(userId);
		await sessions().revoke(revokedLongAgo, "sign_out", new Date(Date.now() - 10 * DAY));

		const deleted = await sessions().deleteEndedBefore(new Date(Date.now() - DAY));
		expect(deleted).toBeGreaterThanOrEqual(1);
		await expect(sessions().getById(revokedLongAgo)).resolves.toBeNull();
		await expect(sessions().getById(live)).resolves.not.toBeNull();
	});

	it("disappears with its user", async () => {
		const userId = await createUser();
		const id = await createSession(userId);
		await ctx!.pool.query(`delete from thia."user" where id = $1`, [userId]);
		await expect(sessions().getById(id)).resolves.toBeNull();
	});
});

describe("refreshSession against Postgres", () => {
	const SECRET = "postgres-refresh-test-secret-of-32-bytes";

	function deps(): RefreshSessionDeps {
		let n = 0;
		return {
			policy: defineSessionPolicy({
				mode: "jwt-user-validated",
				ttlSec: 600,
				refresh: { idleTtlSec: 7 * 86400, absoluteTtlSec: 30 * 86400 },
			}),
			sessions: sessions(),
			crypto: new HmacRefreshTokenCrypto(SECRET),
			users: users(),
			signer: new HmacTokenSigner(SECRET),
			clock: { now: () => new Date() },
			ids: { userId: () => `u${++n}`, jti: () => `j${++n}` },
			issuer: "t",
			audience: "t",
			policyVersion: 1,
		};
	}

	it("concurrent refreshes of one token: one rotation, the rest grace, no revocation", async () => {
		const d = deps();
		const user = (await users().getById(await createUser()))!;
		const issued = await startSession(d, user);

		const results = await Promise.all(
			Array.from({ length: 10 }, () => refreshSession(deps(), issued.refresh.value))
		);

		expect(results.filter((r) => r.status === "refreshed")).toHaveLength(1);
		expect(results.filter((r) => r.status === "grace")).toHaveLength(9);
		expect((await sessions().getById(issued.sessionId))!.revokedAt).toBeNull();
	});

	it("a refresh racing sign-out can't leave the session usable", async () => {
		for (let round = 0; round < 5; round++) {
			const d = deps();
			const user = (await users().getById(await createUser()))!;
			const issued = await startSession(d, user);

			const [refreshed] = await Promise.all([
				refreshSession(deps(), issued.refresh.value),
				sessions().revoke(issued.sessionId, "sign_out", new Date()),
			]);

			const next =
				refreshed.status === "refreshed" ? refreshed.refresh.value : issued.refresh.value;
			await expect(refreshSession(deps(), next)).resolves.toMatchObject({ status: "invalid" });
		}
	});
});
