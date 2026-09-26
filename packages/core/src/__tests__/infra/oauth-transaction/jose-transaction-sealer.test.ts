import { describe, it, expect } from "vitest";
import { EncryptJWT, SignJWT, base64url, decodeProtectedHeader } from "jose";
import { JoseOAuthTransactionSealer } from "../../../infra/oauth-transaction/jose-transaction-sealer";
import { HmacTokenSigner, HmacTokenVerifier } from "../../../infra/jwt/hmac-signer";
import type { OAuthTransaction } from "../../../application/ports/oauth-transaction-port";

const SECRET = "a-test-secret-that-is-at-least-32-bytes-long";
const OTHER_SECRET = "another-test-secret-at-least-32-bytes-long!!";

const T0 = Date.parse("2026-01-01T00:00:00Z");
const at = (secondsAfterT0: number) => new Date(T0 + secondsAfterT0 * 1000);

const transaction = (overrides: Partial<OAuthTransaction> = {}): OAuthTransaction => ({
	state: "s".repeat(43),
	providerId: "github",
	redirectUri: "https://app.example/api/thia/redirect/github",
	codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
	issuedAt: T0 / 1000,
	expiresAt: T0 / 1000 + 600,
	...overrides,
});

const sealer = () => new JoseOAuthTransactionSealer(SECRET);

describe("JoseOAuthTransactionSealer", () => {
	it("round-trips a transaction on any instance with the same secret", async () => {
		const tx = transaction({ nonce: "n".repeat(43), returnTo: "/thia/admin" });
		const sealed = await sealer().seal(tx);

		// A separate instance: nothing shared but the secret.
		await expect(sealer().unseal(sealed, at(1))).resolves.toEqual(tx);
	});

	it("encrypts: no transaction field is readable in the sealed value", async () => {
		const tx = transaction();
		const sealed = await sealer().seal(tx);

		expect(decodeProtectedHeader(sealed)).toEqual({
			alg: "dir",
			enc: "A256GCM",
			typ: "thia-oauth-txn+jwt",
		});
		const decoded = sealed
			.split(".")
			.map((part) => {
				try {
					return new TextDecoder().decode(base64url.decode(part));
				} catch {
					return "";
				}
			})
			.join("|");
		for (const secret of [tx.codeVerifier, tx.state, tx.redirectUri]) {
			expect(sealed).not.toContain(secret);
			expect(decoded).not.toContain(secret);
		}
	});

	it("produces a different ciphertext each time", async () => {
		const tx = transaction();
		expect(await sealer().seal(tx)).not.toBe(await sealer().seal(tx));
	});

	it("enforces expiry itself, independent of any cookie lifetime", async () => {
		const sealed = await sealer().seal(transaction());

		await expect(sealer().unseal(sealed, at(599))).resolves.toBeDefined();
		await expect(sealer().unseal(sealed, at(600))).resolves.toBeUndefined();
		await expect(sealer().unseal(sealed, at(86_400))).resolves.toBeUndefined();
	});

	it("tolerates small clock skew between instances, but not a far-future issue time", async () => {
		const sealed = await sealer().seal(transaction());
		await expect(sealer().unseal(sealed, at(-30))).resolves.toBeDefined();
		await expect(sealer().unseal(sealed, at(-120))).resolves.toBeUndefined();
	});

	it("honours a shorter configured lifetime even if exp is later", async () => {
		const sealed = await sealer().seal(transaction());
		const strict = new JoseOAuthTransactionSealer(SECRET, { maxAgeSec: 60 });

		await expect(strict.unseal(sealed, at(59))).resolves.toBeDefined();
		await expect(strict.unseal(sealed, at(61))).resolves.toBeUndefined();
	});

	it("refuses to seal a transaction that outlives the configured lifetime", async () => {
		await expect(
			sealer().seal(transaction({ expiresAt: T0 / 1000 + 3600 }))
		).rejects.toThrow("INVALID_TRANSACTION");
	});

	it("rejects a value sealed under a different secret", async () => {
		const sealed = await new JoseOAuthTransactionSealer(OTHER_SECRET).seal(transaction());
		await expect(sealer().unseal(sealed, at(1))).resolves.toBeUndefined();
	});

	it.each([0, 1, 2, 3, 4])("rejects tampering with segment %i", async (segment) => {
		const sealed = await sealer().seal(transaction());
		const parts = sealed.split(".");
		const bytes = base64url.decode(parts[segment] || "AA");
		bytes[0] ^= 0x01;
		parts[segment] = base64url.encode(bytes);

		await expect(sealer().unseal(parts.join("."), at(1))).resolves.toBeUndefined();
	});

	it.each([
		["empty", ""],
		["garbage", "not-a-jwe"],
		["oversized", "a".repeat(5000)],
		["five dots", "...."],
	])("rejects a %s value without throwing", async (_label, value) => {
		await expect(sealer().unseal(value, at(1))).resolves.toBeUndefined();
	});

	it("rejects a session token (JWS) signed with the same secret", async () => {
		const sessionToken = await new HmacTokenSigner(SECRET).sign({
			iss: "thia",
			aud: "web",
			sub: "user",
			iat: T0 / 1000,
			exp: T0 / 1000 + 600,
			ver: 1,
			uvn: 1,
			pvn: 1,
		} as never);
		await expect(sealer().unseal(sessionToken, at(1))).resolves.toBeUndefined();
	});

	it("cannot be used as a session token", async () => {
		const sealed = await sealer().seal(transaction());
		await expect(new HmacTokenVerifier(SECRET).verify(sealed)).rejects.toThrow();
	});

	it("does not use the raw secret as its encryption key", async () => {
		// A JWE made with the raw secret bytes (as the session HMAC key) must
		// not open: the transaction key is derived for this purpose only.
		const raw = new TextEncoder().encode(SECRET).slice(0, 32);
		const forged = await new EncryptJWT({ txn: {} })
			.setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "thia-oauth-txn+jwt" })
			.setAudience("thia:oauth-transaction")
			.setIssuedAt(T0 / 1000)
			.setExpirationTime(T0 / 1000 + 600)
			.encrypt(raw);
		await expect(sealer().unseal(forged, at(1))).resolves.toBeUndefined();
	});

	describe("with a correctly keyed but invalid payload", () => {
		// seal() validates its input, so invalid payloads are encrypted
		// directly with the key the sealer derived - as if an attacker held it.
		async function sealRaw(payload: Record<string, unknown>, header = {}) {
			const s = sealer() as unknown as { key: Promise<Uint8Array> };
			return new EncryptJWT(payload)
				.setProtectedHeader({ alg: "dir", enc: "A256GCM", typ: "thia-oauth-txn+jwt", ...header })
				.setAudience("thia:oauth-transaction")
				.setIssuedAt(T0 / 1000)
				.setExpirationTime(T0 / 1000 + 600)
				.encrypt(await s.key);
		}
		const { issuedAt, expiresAt, ...fields } = transaction();

		it("accepts the well-formed control", async () => {
			const sealed = await sealRaw({ txn: fields });
			await expect(sealer().unseal(sealed, at(1))).resolves.toMatchObject(fields);
		});

		it.each([
			["no txn claim", {}],
			["txn is a string", { txn: "x" }],
			["missing verifier", { txn: { ...fields, codeVerifier: undefined } }],
			["short verifier", { txn: { ...fields, codeVerifier: "abc" } }],
			["missing state", { txn: { ...fields, state: undefined } }],
			["non-URL callback", { txn: { ...fields, redirectUri: "not a url" } }],
			["unknown field", { txn: { ...fields, admin: true } }],
		])("rejects %s", async (_label, payload) => {
			const sealed = await sealRaw(payload as Record<string, unknown>);
			await expect(sealer().unseal(sealed, at(1))).resolves.toBeUndefined();
		});

		it("rejects the wrong typ header", async () => {
			const sealed = await sealRaw({ txn: fields }, { typ: "JWT" });
			await expect(sealer().unseal(sealed, at(1))).resolves.toBeUndefined();
		});
	});

	it.each([
		["missing", undefined],
		["too short", "short-secret"],
	])("refuses to start with a %s secret", (_label, secret) => {
		expect(() => new JoseOAuthTransactionSealer(secret as string)).toThrow(
			/secret is missing or too short/
		);
	});

	it("is not confused by a signed (unencrypted) JWT", async () => {
		const jws = await new SignJWT({ txn: transaction() })
			.setProtectedHeader({ alg: "HS256", typ: "thia-oauth-txn+jwt" })
			.sign(new TextEncoder().encode(SECRET));
		await expect(sealer().unseal(jws, at(1))).resolves.toBeUndefined();
	});
});
