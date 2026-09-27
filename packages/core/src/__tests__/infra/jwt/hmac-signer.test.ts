import { it, expect } from "vitest";
import {
	HmacTokenSigner,
	HmacTokenVerifier,
} from "../../../infra/jwt/hmac-signer";
import { makeAuthClaims } from "../../../application/claims/auth-claims";
import { InvalidSessionTokenError } from "../../../application/session/errors";

const SECRET = "a".repeat(32);
const EXPECTED = { issuer: "thia-test", audience: "thia-test" };

function claims(overrides: Partial<Parameters<typeof makeAuthClaims>[0]> = {}) {
	return makeAuthClaims({
		iss: "thia-test",
		aud: "thia-test",
		sub: "user-1",
		emailVerified: true,
		uvn: 0,
		pvn: 1,
		now: new Date(),
		ttlSec: 900,
		...overrides,
	});
}

it("signs and verifies a round trip", async () => {
	const signer = new HmacTokenSigner(SECRET);
	const verifier = new HmacTokenVerifier(SECRET, EXPECTED);

	const c = claims();
	const token = await signer.sign(c);
	const verified = await verifier.verify(token);

	expect(verified.sub).toBe(c.sub);
	expect(verified.usr.id).toBe(c.usr.id);
	expect(verified.uvn).toBe(c.uvn);
});

it("rejects a tampered token", async () => {
	const signer = new HmacTokenSigner(SECRET);
	const verifier = new HmacTokenVerifier(SECRET, EXPECTED);

	const token = await signer.sign(claims());
	const [header, payload, sig] = token.split(".");
	const tampered = `${header}.${payload.slice(0, -1)}x.${sig}`;

	await expect(verifier.verify(tampered)).rejects.toThrow(InvalidSessionTokenError);
});

it("rejects an expired token", async () => {
	const signer = new HmacTokenSigner(SECRET);
	const verifier = new HmacTokenVerifier(SECRET, EXPECTED);

	const expired = claims({
		now: new Date(Date.now() - 60_000),
		ttlSec: 1,
	});
	const token = await signer.sign(expired);

	await expect(verifier.verify(token)).rejects.toMatchObject({ reason: "expired" });
});

it("rejects a token with the wrong audience", async () => {
	const signer = new HmacTokenSigner(SECRET);
	const verifier = new HmacTokenVerifier(SECRET, { ...EXPECTED, audience: "other-app" });

	const token = await signer.sign(claims());

	await expect(verifier.verify(token)).rejects.toThrow(InvalidSessionTokenError);
});

it("rejects a token with the wrong issuer", async () => {
	const signer = new HmacTokenSigner(SECRET);
	const verifier = new HmacTokenVerifier(SECRET, { ...EXPECTED, issuer: "other-app" });

	await expect(verifier.verify(await signer.sign(claims()))).rejects.toThrow(
		InvalidSessionTokenError
	);
});

it("cannot be built without an issuer and audience to check", () => {
	expect(() => new HmacTokenVerifier(SECRET, undefined as never)).toThrow();
	expect(() => new HmacTokenVerifier(SECRET, { issuer: "x" } as never)).toThrow();
	expect(() => new HmacTokenVerifier(SECRET, { audience: "x" } as never)).toThrow();
});

it("throws immediately when constructed with too short a secret", () => {
	expect(() => new HmacTokenSigner("too-short")).toThrow();
	expect(() => new HmacTokenVerifier("too-short", EXPECTED)).toThrow();
});
