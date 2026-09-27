import { describe, it, expect, vi } from "vitest";
import { SignJWT } from "jose";
import {
	createSessionValidator,
	type SessionValidation,
} from "../../../application/session/validate-session";
import { defineSessionPolicy, type SessionMode } from "../../../application/session/session-policy";
import { makeAuthClaims } from "../../../application/claims/auth-claims";
import { signOutEverywhere } from "../../../application/use-cases/sign-out-everywhere";
import { HmacTokenSigner, HmacTokenVerifier } from "../../../infra/jwt/hmac-signer";
import { InMemoryUserRepo } from "../../../infra/memory/in-memory-user-repo";
import { User } from "../../../domain/entities/user";
import { EmailAddress } from "../../../domain/value-objects/email-address";
import { asUserId } from "../../../domain/primitives";

const SECRET = "session-validator-test-secret-32-bytes!";
const ISSUER = "thia-test";
const AUDIENCE = "thia-test";
const USER_ID = "01USER0000000000000000000";
const NOW = new Date("2030-01-01T12:00:00Z");
const NOW_SEC = NOW.getTime() / 1000;
const clock = { now: () => NOW };

const signer = new HmacTokenSigner(SECRET);
const verifier = new HmacTokenVerifier(SECRET, { issuer: ISSUER, audience: AUDIENCE, clock });

/** A token exactly as the app issues it. */
function issue(overrides: { uvn?: number; sub?: string; now?: Date; ttlSec?: number } = {}) {
	return signer.sign(
		makeAuthClaims({
			iss: ISSUER,
			aud: AUDIENCE,
			sub: overrides.sub ?? USER_ID,
			emailVerified: true,
			uvn: overrides.uvn ?? 0,
			pvn: 1,
			now: overrides.now ?? NOW,
			ttlSec: overrides.ttlSec ?? 1800,
		})
	);
}

/** A correctly signed token with an arbitrary payload, to probe claim checks. */
function signRaw(
	payload: Record<string, unknown>,
	opts: { alg?: string; secret?: string } = {}
) {
	return new SignJWT(payload)
		.setProtectedHeader({ alg: opts.alg ?? "HS256" })
		.sign(new TextEncoder().encode(opts.secret ?? SECRET));
}

const validPayload = () => ({
	iss: ISSUER,
	aud: AUDIENCE,
	sub: USER_ID,
	iat: NOW_SEC,
	exp: NOW_SEC + 1800,
	ver: 1,
	uvn: 0,
	pvn: 1,
	usr: { id: USER_ID, emailVerified: true },
});

const without = (key: string) => {
	const p: Record<string, unknown> = validPayload();
	delete p[key];
	return p;
};

async function storedUser(repo: InMemoryUserRepo, id = USER_ID) {
	await repo.save(
		User.create({ id: asUserId(id), email: EmailAddress.create(`${id}@example.com`) })
	);
}

function validatorFor(mode: SessionMode, users = new InMemoryUserRepo()) {
	return createSessionValidator({
		policy: defineSessionPolicy({ mode, ttlSec: 1800 }),
		verifier,
		clock,
		users,
	});
}

const rejected = (reason: string): SessionValidation =>
	({ status: "unauthenticated", reason }) as SessionValidation;

describe.each(["jwt-stateless", "jwt-user-validated"] as const)(
	"mandatory token checks (%s)",
	(mode) => {
		const cases: [string, () => Promise<string>][] = [
			["an invalid signature", () => signRaw(validPayload(), { secret: "x".repeat(40) })],
			["the wrong issuer", () => signRaw({ ...validPayload(), iss: "evil" })],
			["the wrong audience", () => signRaw({ ...validPayload(), aud: "evil" })],
			["an audience list", () => signRaw({ ...validPayload(), aud: [AUDIENCE] })],
			["an expired token", () => issue({ now: new Date(NOW.getTime() - 3600_000) })],
			["a token issued in the future", () => issue({ now: new Date(NOW.getTime() + 60_000) })],
			["a lifetime beyond the supported maximum", () =>
				signRaw({ ...validPayload(), exp: NOW_SEC + 86400 * 2 })],
			["exp before iat", () => signRaw({ ...validPayload(), iat: NOW_SEC + 3, exp: NOW_SEC + 2 })],
			["a missing sub", () => signRaw(without("sub"))],
			["a missing uvn", () => signRaw(without("uvn"))],
			["a missing ver", () => signRaw(without("ver"))],
			["a missing usr", () => signRaw(without("usr"))],
			["a missing exp", () => signRaw(without("exp"))],
			["a missing iat", () => signRaw(without("iat"))],
			["a negative uvn", () => signRaw({ ...validPayload(), uvn: -1 })],
			["a fractional uvn", () => signRaw({ ...validPayload(), uvn: 1.5 })],
			["a string uvn", () => signRaw({ ...validPayload(), uvn: "0" })],
			["an unsupported claim schema version", () => signRaw({ ...validPayload(), ver: 2 })],
			["usr.id differing from sub", () =>
				signRaw({ ...validPayload(), usr: { id: "01OTHER00000000000000000", emailVerified: true } })],
			["a malformed subject", () =>
				signRaw({ ...validPayload(), sub: "../etc", usr: { id: "../etc", emailVerified: true } })],
			["a non-HS256 algorithm", () => signRaw(validPayload(), { alg: "HS512" })],
			["an unsigned token", async () => {
				const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
				return `${b64({ alg: "none" })}.${b64(validPayload())}.`;
			}],
			["garbage", async () => "not-a-jwt"],
		];

		it.each(cases)("rejects %s", async (_label, makeToken) => {
			const users = new InMemoryUserRepo();
			await storedUser(users);
			const getById = vi.spyOn(users, "getById");

			const result = await validatorFor(mode, users).validate(await makeToken());

			expect(result).toEqual(rejected("invalid_token"));
			// Invalid tokens are refused before any database work.
			expect(getById).not.toHaveBeenCalled();
		});

		it("accepts a well-formed token (control case)", async () => {
			const users = new InMemoryUserRepo();
			await storedUser(users);
			const result = await validatorFor(mode, users).validate(await signRaw(validPayload()));
			expect(result.status).toBe("authenticated");
		});

		it("treats a missing token as signed out", async () => {
			const v = validatorFor(mode);
			await expect(v.validate(undefined)).resolves.toEqual(rejected("missing_token"));
			await expect(v.validate("")).resolves.toEqual(rejected("missing_token"));
		});
	}
);

describe("jwt-stateless", () => {
	it("authenticates from verified claims without touching the user repository", async () => {
		const users = {
			getById: vi.fn(async () => {
				throw new Error("must not be called");
			}),
		};
		const validator = createSessionValidator({
			policy: defineSessionPolicy({ mode: "jwt-stateless", ttlSec: 1800 }),
			verifier,
			clock,
			users,
		});

		const result = await validator.validate(await issue({ uvn: 7 }));

		expect(result).toEqual({
			status: "authenticated",
			session: {
				mode: "jwt-stateless",
				identity: {
					userId: USER_ID,
					tokenVersion: 7,
					emailVerified: true,
					issuedAt: NOW,
					expiresAt: new Date(NOW.getTime() + 1800_000),
				},
			},
		});
		expect(users.getById).not.toHaveBeenCalled();
	});

	it("needs no repository at all", async () => {
		const validator = createSessionValidator({
			policy: defineSessionPolicy({ mode: "jwt-stateless", ttlSec: 1800 }),
			verifier,
			clock,
		});
		await expect(validator.validate(await issue())).resolves.toMatchObject({
			status: "authenticated",
		});
	});

	it("still accepts a deleted user's or revoked token until expiry (documented limit)", async () => {
		const users = new InMemoryUserRepo(); // user not stored = deleted
		const result = await validatorFor("jwt-stateless", users).validate(await issue({ uvn: 0 }));
		expect(result.status).toBe("authenticated");
	});
});

describe("jwt-user-validated", () => {
	it("loads the user once and returns it with the session", async () => {
		const users = new InMemoryUserRepo();
		await storedUser(users);
		const getById = vi.spyOn(users, "getById");

		const result = await validatorFor("jwt-user-validated", users).validate(await issue());

		expect(getById).toHaveBeenCalledTimes(1);
		expect(getById).toHaveBeenCalledWith(USER_ID);
		expect(result.status).toBe("authenticated");
		if (result.status !== "authenticated" || result.session.mode !== "jwt-user-validated") {
			throw new Error("unreachable");
		}
		expect(result.session.user.id).toBe(USER_ID);
		expect(result.session.identity.tokenVersion).toBe(0);
	});

	it("rejects a token whose user was deleted", async () => {
		const result = await validatorFor("jwt-user-validated").validate(await issue());
		expect(result).toEqual(rejected("user_not_found"));
	});

	it("rejects a token whose version differs from the stored one", async () => {
		const users = new InMemoryUserRepo();
		await storedUser(users);
		await users.incrementTokenVersion(asUserId(USER_ID)); // stored: 1

		const v = validatorFor("jwt-user-validated", users);
		await expect(v.validate(await issue({ uvn: 0 }))).resolves.toEqual(rejected("token_revoked"));
		await expect(v.validate(await issue({ uvn: 2 }))).resolves.toEqual(rejected("token_revoked"));
		await expect(v.validate(await issue({ uvn: 1 }))).resolves.toMatchObject({
			status: "authenticated",
		});
	});

	it("fails closed when the user lookup fails, with no stateless fallback", async () => {
		const outage = new Error("connection refused");
		const validator = createSessionValidator({
			policy: defineSessionPolicy({ mode: "jwt-user-validated", ttlSec: 1800 }),
			verifier,
			clock,
			users: { getById: async () => Promise.reject(outage) },
		});

		await expect(validator.validate(await issue())).resolves.toEqual({
			status: "unavailable",
			reason: "user_lookup_failed",
			cause: outage,
		});
	});

	it("reports a verifier infrastructure failure as unavailable, not as a bad token", async () => {
		const failure = new Error("key source unreachable");
		const validator = createSessionValidator({
			policy: defineSessionPolicy({ mode: "jwt-stateless", ttlSec: 1800 }),
			verifier: { verify: async () => Promise.reject(failure) },
			clock,
		});
		await expect(validator.validate("a.b.c")).resolves.toMatchObject({
			status: "unavailable",
			reason: "token_verification_failed",
		});
	});

	it("re-validates claims even from a lax verifier", async () => {
		const validator = createSessionValidator({
			policy: defineSessionPolicy({ mode: "jwt-stateless", ttlSec: 1800 }),
			verifier: { verify: async () => ({ sub: USER_ID }) as never },
			clock,
		});
		await expect(validator.validate("a.b.c")).resolves.toEqual(rejected("invalid_token"));
	});

	it("refuses to start without a user repository", () => {
		expect(() =>
			createSessionValidator({
				policy: defineSessionPolicy({ mode: "jwt-user-validated", ttlSec: 1800 }),
				verifier,
				clock,
			})
		).toThrow(/user repository/);
	});

	it("refuses a hand-built invalid policy", () => {
		expect(() =>
			createSessionValidator({
				policy: { mode: "database" as never, ttlSec: 1800 },
				verifier,
				clock,
				users: new InMemoryUserRepo(),
			})
		).toThrow(/INVALID_SESSION_POLICY/);
	});
});

describe("signOutEverywhere", () => {
	const userValidated = defineSessionPolicy({ mode: "jwt-user-validated", ttlSec: 1800 });

	async function authenticated(v: ReturnType<typeof validatorFor>, token: string) {
		const r = await v.validate(token);
		if (r.status !== "authenticated") throw new Error(`expected a session, got ${JSON.stringify(r)}`);
		return r.session;
	}

	it("invalidates every existing token on its next validation; a new login works", async () => {
		const users = new InMemoryUserRepo();
		await storedUser(users);
		const v = validatorFor("jwt-user-validated", users);
		const laptop = await issue();
		const phone = await issue();

		const result = await signOutEverywhere(
			{ policy: userValidated, users },
			await authenticated(v, laptop)
		);

		expect(result).toEqual({ status: "revoked", tokenVersion: 1 });
		await expect(v.validate(laptop)).resolves.toEqual(rejected("token_revoked"));
		await expect(v.validate(phone)).resolves.toEqual(rejected("token_revoked"));

		// Logging in again issues the stored (new) version.
		const fresh = await issue({ uvn: (await users.getById(asUserId(USER_ID)))!.tokenVersion() });
		await expect(v.validate(fresh)).resolves.toMatchObject({ status: "authenticated" });
	});

	it("only ever targets the session's own user", async () => {
		const users = new InMemoryUserRepo();
		await storedUser(users);
		await storedUser(users, "01OTHER00000000000000000");
		const increment = vi.spyOn(users, "incrementTokenVersion");
		const v = validatorFor("jwt-user-validated", users);

		await signOutEverywhere({ policy: userValidated, users }, await authenticated(v, await issue()));

		expect(increment).toHaveBeenCalledTimes(1);
		expect(increment).toHaveBeenCalledWith(USER_ID);
		expect((await users.getById(asUserId("01OTHER00000000000000000")))!.tokenVersion()).toBe(0);
	});

	it("reports unsupported in stateless mode and changes nothing", async () => {
		const users = new InMemoryUserRepo();
		await storedUser(users);
		const increment = vi.spyOn(users, "incrementTokenVersion");
		const stateless = defineSessionPolicy({ mode: "jwt-stateless", ttlSec: 1800 });
		const session = await authenticated(validatorFor("jwt-stateless", users), await issue());

		await expect(signOutEverywhere({ policy: stateless, users }, session)).resolves.toEqual({
			status: "unsupported",
			mode: "jwt-stateless",
		});
		expect(increment).not.toHaveBeenCalled();
	});

	it("reports a user deleted since validation", async () => {
		const users = new InMemoryUserRepo();
		await storedUser(users);
		const session = await authenticated(validatorFor("jwt-user-validated", users), await issue());
		const empty = new InMemoryUserRepo();

		await expect(signOutEverywhere({ policy: userValidated, users: empty }, session)).resolves.toEqual({
			status: "user_not_found",
		});
	});

	it("propagates storage failures rather than claiming success", async () => {
		const users = new InMemoryUserRepo();
		await storedUser(users);
		const session = await authenticated(validatorFor("jwt-user-validated", users), await issue());

		await expect(
			signOutEverywhere(
				{ policy: userValidated, users: { incrementTokenVersion: () => Promise.reject(new Error("down")) } },
				session
			)
		).rejects.toThrow("down");
	});
});

describe("InMemoryUserRepo token versions", () => {
	it("a stale snapshot saved after a revocation does not undo it", async () => {
		const users = new InMemoryUserRepo();
		await storedUser(users);
		const stale = (await users.getById(asUserId(USER_ID)))!;

		await users.incrementTokenVersion(asUserId(USER_ID));
		stale.updateProfile({ name: "Renamed" });
		await users.save(stale);

		const stored = (await users.getById(asUserId(USER_ID)))!;
		expect(stored.tokenVersion()).toBe(1);
		expect(stored.name.value).toBe("Renamed");
	});

	it("counts concurrent increments", async () => {
		const users = new InMemoryUserRepo();
		await storedUser(users);
		await Promise.all(
			Array.from({ length: 10 }, () => users.incrementTokenVersion(asUserId(USER_ID)))
		);
		expect((await users.getById(asUserId(USER_ID)))!.tokenVersion()).toBe(10);
	});

	it("returns null for an unknown user", async () => {
		await expect(new InMemoryUserRepo().incrementTokenVersion(asUserId("01NOPE"))).resolves.toBeNull();
	});
});
