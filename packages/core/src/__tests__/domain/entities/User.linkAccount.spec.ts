import { describe, it, expect } from "vitest";
import { User } from "../../../domain/entities/user";
import { AccountId, Provider, ProviderAccountId, UserId } from "../../../domain/primitives";
import { EmailAddress } from "../../../domain/value-objects/email-address";
import { LinkedAccount } from "../../../domain/entities/linked-account";

const mkUser = () =>
	User.create({ id: "u1" as UserId, email: EmailAddress.create("me@x.com") });

describe("User.linkAccount", () => {
	it("is idempotent for same provider+providerAccountId", () => {
		const u = mkUser();
		const acc = LinkedAccount.link({
			id: "a1" as AccountId,
			type: "oidc",
			provider: "google",
			providerAccountId: "123",
		});
		const r1 = u.linkAccount(acc);
		const r2 = u.linkAccount(acc);
		expect(r1.changed).toBe(true);
		expect(r2.changed).toBe(false);
		expect(u.accounts.length).toBe(1);
	});

	it("rejects second account for same provider (policy)", () => {
		const u = mkUser();
		u.linkAccount(
			LinkedAccount.link({
				id: "a1" as AccountId,
				type: "oidc",
				provider: "google",
				providerAccountId: "123",
			})
		);
		expect(() =>
			u.linkAccount(
				LinkedAccount.link({
					id: "a2" as AccountId,
					type: "oidc",
					provider: "google",
					providerAccountId: "456",
				})
			)
		).toThrowError();
	});
});
