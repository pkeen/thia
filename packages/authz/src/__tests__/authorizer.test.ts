import { describe, it, expect } from "vitest";
import { createAuthorizer } from "../authorizer";
import { ForbiddenError } from "../errors";
import { allow, deny, or, type Policy } from "../policy";

type Subject = { id: string };
type Post = { authorId: string };

const subject: Subject = { id: "u1" };
const ownsPost: Policy<Subject, Post> = (u, post) => post.authorId === u.id;

const authorizer = createAuthorizer({
	"post.read": allow<Subject>(),
	"post.archive": deny<Subject>(),
	"post.delete": or<Subject, Post>(ownsPost),
});

describe("authorizer", () => {
	it("resolves an allowed action", async () => {
		expect(await authorizer.can(subject, "post.read")).toBe(true);
	});

	it("resolves a denied action", async () => {
		expect(await authorizer.can(subject, "post.archive")).toBe(false);
	});

	it("passes the resource to the action's policy", async () => {
		expect(
			await authorizer.can(subject, "post.delete", { authorId: "u1" })
		).toBe(true);
		expect(
			await authorizer.can(subject, "post.delete", { authorId: "other" })
		).toBe(false);
	});

	it("assert resolves when permitted", async () => {
		await expect(
			authorizer.assert(subject, "post.read")
		).resolves.toBeUndefined();
	});

	it("assert throws ForbiddenError carrying the action when denied", async () => {
		await expect(authorizer.assert(subject, "post.archive")).rejects.toThrow(
			ForbiddenError
		);

		await authorizer.assert(subject, "post.archive").catch((e: unknown) => {
			expect(e).toBeInstanceOf(ForbiddenError);
			expect((e as ForbiddenError).action).toBe("post.archive");
		});
	});

	it("throws on an unregistered action rather than denying", async () => {
		// Cast past the compile-time guard to simulate a JS caller / bad string.
		const loose = authorizer as unknown as {
			can(s: Subject, action: string): Promise<boolean>;
		};
		await expect(loose.can(subject, "does.not.exist")).rejects.toThrow(
			/Unknown action/
		);
	});

	it("lists registered actions", () => {
		expect(authorizer.actions().sort()).toEqual([
			"post.archive",
			"post.delete",
			"post.read",
		]);
	});
});
