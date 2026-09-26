import { describe, it, expect } from "vitest";
import { base64url } from "jose";
import {
	createCodeVerifier,
	deriveCodeChallenge,
	randomUrlSafeToken,
	timingSafeEqual,
} from "../../../application/oauth/pkce";

describe("deriveCodeChallenge (S256)", () => {
	// RFC 7636 Appendix B.
	const rfcOctets = new Uint8Array([
		116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187,
		186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141,
		121,
	]);
	const rfcVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
	const rfcChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

	it("encodes 32 random octets into the RFC's verifier", () => {
		expect(base64url.encode(rfcOctets)).toBe(rfcVerifier);
	});

	it("matches the RFC 7636 known test vector", async () => {
		await expect(deriveCodeChallenge(rfcVerifier)).resolves.toBe(rfcChallenge);
	});

	it("is unpadded base64url", async () => {
		const challenge = await deriveCodeChallenge(createCodeVerifier());
		expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it.each([
		["too short", "a".repeat(42)],
		["too long", "a".repeat(129)],
		["outside the unreserved set", "a".repeat(42) + "+"],
	])("refuses a verifier that is %s", async (_label, verifier) => {
		await expect(deriveCodeChallenge(verifier)).rejects.toThrow(
			"INVALID_CODE_VERIFIER"
		);
	});
});

describe("createCodeVerifier", () => {
	it("returns 43 unreserved characters (256 random bits), different each time", () => {
		const verifiers = Array.from({ length: 50 }, createCodeVerifier);
		for (const v of verifiers) expect(v).toMatch(/^[A-Za-z0-9\-._~]{43}$/);
		expect(new Set(verifiers).size).toBe(50);
	});
});

describe("randomUrlSafeToken", () => {
	it("encodes the requested number of bytes", () => {
		expect(base64url.decode(randomUrlSafeToken(16))).toHaveLength(16);
		expect(base64url.decode(randomUrlSafeToken())).toHaveLength(32);
	});
});

describe("timingSafeEqual", () => {
	it("compares by value", () => {
		expect(timingSafeEqual("abc", "abc")).toBe(true);
		expect(timingSafeEqual("abc", "abd")).toBe(false);
		expect(timingSafeEqual("abc", "abcd")).toBe(false);
		expect(timingSafeEqual("", "")).toBe(true);
		expect(timingSafeEqual(undefined as unknown as string, "")).toBe(false);
	});
});
