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
});
