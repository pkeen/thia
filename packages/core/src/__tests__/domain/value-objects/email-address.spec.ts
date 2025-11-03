import { describe, it, expect } from "vitest";
import { EmailAddress } from "../../../domain/value-objects/email-address";

describe("EmailAddress", () => {
	it("normalizes and validates", () => {
		const e = EmailAddress.create("  Foo@Example.com ");
		expect(e.toString()).toBe("foo@example.com");
	});

	it("rejects invalid", () => {
		expect(() => EmailAddress.create("nope")).toThrowError();
	});

	it("equality by value", () => {
		const a = EmailAddress.create("me@x.com");
		const b = EmailAddress.create("ME@x.com");
		expect(a.equals(b)).toBe(true);
	});
});
