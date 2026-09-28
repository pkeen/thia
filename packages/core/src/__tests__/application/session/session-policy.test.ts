import { describe, it, expect } from "vitest";
import {
	defineSessionPolicy,
	SessionPolicyError,
	SESSION_TTL_MAX_SEC,
	SESSION_TTL_MIN_SEC,
} from "../../../application/session/session-policy";

describe("defineSessionPolicy", () => {
	it("accepts both modes with a supported lifetime", () => {
		expect(defineSessionPolicy({ mode: "jwt-stateless", ttlSec: 1800 })).toEqual({
			mode: "jwt-stateless",
			ttlSec: 1800,
		});
		expect(
			defineSessionPolicy({ mode: "jwt-user-validated", ttlSec: 1800 })
		).toEqual({ mode: "jwt-user-validated", ttlSec: 1800 });
	});

	it("accepts the ends of the supported range", () => {
		expect(
			defineSessionPolicy({ mode: "jwt-stateless", ttlSec: SESSION_TTL_MIN_SEC }).ttlSec
		).toBe(60);
		expect(
			defineSessionPolicy({ mode: "jwt-stateless", ttlSec: SESSION_TTL_MAX_SEC }).ttlSec
		).toBe(86400);
	});

	it("returns a frozen policy", () => {
		const policy = defineSessionPolicy({ mode: "jwt-stateless", ttlSec: 600 });
		expect(Object.isFrozen(policy)).toBe(true);
	});

	it.each([
		["database"],
		["stateless"],
		["JWT-STATELESS"],
		[""],
		[undefined],
		[null],
	])("rejects unknown mode %j", (mode) => {
		expect(() => defineSessionPolicy({ mode, ttlSec: 1800 })).toThrow(
			SessionPolicyError
		);
	});

	it.each([
		[0],
		[-1],
		[59],
		[86401],
		[1.5],
		[Number.NaN],
		[Number.POSITIVE_INFINITY],
		["1800"],
		[undefined],
	])("rejects lifetime %j", (ttlSec) => {
		expect(() =>
			defineSessionPolicy({ mode: "jwt-user-validated", ttlSec })
		).toThrow(SessionPolicyError);
	});

	describe("with refresh", () => {
		const refresh = { idleTtlSec: 7 * 86400, absoluteTtlSec: 30 * 86400 };

		it("accepts and freezes a refresh policy", () => {
			const policy = defineSessionPolicy({ mode: "jwt-user-validated", ttlSec: 600, refresh });
			expect(policy).toEqual({ mode: "jwt-user-validated", ttlSec: 600, refresh });
			expect(Object.isFrozen(policy.refresh)).toBe(true);
		});

		it("works with stateless mode too", () => {
			expect(defineSessionPolicy({ mode: "jwt-stateless", ttlSec: 600, refresh }).refresh).toEqual(refresh);
		});

		it("leaves refresh out when not configured", () => {
			expect("refresh" in defineSessionPolicy({ mode: "jwt-stateless", ttlSec: 600 })).toBe(false);
		});

		it.each([
			["an access TTL over an hour", { ttlSec: 3601, refresh }],
			["a non-object refresh", { ttlSec: 600, refresh: true }],
			["a null refresh", { ttlSec: 600, refresh: null }],
			["an array refresh", { ttlSec: 600, refresh: [] }],
			["an unknown setting", { ttlSec: 600, refresh: { ...refresh, rotate: false } }],
			["an idle TTL under an hour", { ttlSec: 600, refresh: { ...refresh, idleTtlSec: 3599 } }],
			["an idle TTL over 30 days", { ttlSec: 600, refresh: { idleTtlSec: 31 * 86400, absoluteTtlSec: 60 * 86400 } }],
			["an absolute TTL over 90 days", { ttlSec: 600, refresh: { ...refresh, absoluteTtlSec: 91 * 86400 } }],
			["absolute shorter than idle", { ttlSec: 600, refresh: { idleTtlSec: 86400 * 2, absoluteTtlSec: 86400 } }],
			["a fractional idle TTL", { ttlSec: 600, refresh: { ...refresh, idleTtlSec: 3600.5 } }],
			["a missing absolute TTL", { ttlSec: 600, refresh: { idleTtlSec: 3600 } }],
		])("rejects %s", (_label, input) => {
			expect(() => defineSessionPolicy({ mode: "jwt-user-validated", ...input })).toThrow(
				SessionPolicyError
			);
		});
	});
});
