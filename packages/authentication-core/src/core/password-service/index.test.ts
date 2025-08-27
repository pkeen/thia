import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { DefaultPasswordService, PasswordService } from "./index";

describe("DefaultPasswordService", () => {
	let passwordService: PasswordService;
	beforeEach(() => {
		passwordService = DefaultPasswordService();
	});
	it("should hash and verify a password", async () => {
		const password = "secret";
		const hashedPassword = await passwordService.hash(password);
		const isValid = await passwordService.verify(password, hashedPassword);
		expect(isValid).toBe(true);
	});
	it("should return false for an invalid password", async () => {
		const password = "secret";
		const hashedPassword = await passwordService.hash(password);
		const isValid = await passwordService.verify("wrong", hashedPassword);
		expect(isValid).toBe(false);
	});
});
