import { describe, it, expect } from "vitest";
import { Keycard } from "../../../domain/value-objects/keycard";

describe("Keycard", () => {
	it("expires properly", () => {
		const past = new Date(Date.now() - 1000);
		const future = new Date(Date.now() + 1000);
		const expired = Keycard.create({
			type: "access",
			value: "A",
			expiresAt: past,
		});
		const fresh = Keycard.create({
			type: "access",
			value: "B",
			expiresAt: future,
		});
		expect(expired.isExpired()).toBe(true);
		expect(fresh.isExpired()).toBe(false);
	});

	it("equality by (type,value,expiresAt)", () => {
		const a = Keycard.create({ type: "refresh", value: "X" });
		const b = Keycard.create({ type: "refresh", value: "X" });
		expect(a.equals(b)).toBe(true);
	});
});
