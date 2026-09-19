import { describe, it, expect, vi } from "vitest";
import { allow, deny, and, or, not, type Policy } from "../policy";

type Subject = { id: string };
const subject: Subject = { id: "u1" };

describe("combinators", () => {
	it("and permits only when every policy permits", async () => {
		expect(await and(allow<Subject>(), allow<Subject>())(subject, undefined)).toBe(true);
		expect(await and(allow<Subject>(), deny<Subject>())(subject, undefined)).toBe(false);
	});

	it("or permits when any policy permits", async () => {
		expect(await or(deny<Subject>(), allow<Subject>())(subject, undefined)).toBe(true);
		expect(await or(deny<Subject>(), deny<Subject>())(subject, undefined)).toBe(false);
	});

	it("not inverts", async () => {
		expect(await not(deny<Subject>())(subject, undefined)).toBe(true);
		expect(await not(allow<Subject>())(subject, undefined)).toBe(false);
	});

	it("and short-circuits after the first denial", async () => {
		const later = vi.fn(() => true);
		await and<Subject>(deny<Subject>(), later)(subject, undefined);
		expect(later).not.toHaveBeenCalled();
	});

	it("or short-circuits after the first approval", async () => {
		const later = vi.fn(() => true);
		await or<Subject>(allow<Subject>(), later)(subject, undefined);
		expect(later).not.toHaveBeenCalled();
	});

	it("treats empty and as permitted, empty or as denied", async () => {
		expect(await and<Subject>()(subject, undefined)).toBe(true);
		expect(await or<Subject>()(subject, undefined)).toBe(false);
	});

	it("awaits async policies", async () => {
		const asyncAllow: Policy<Subject> = async () => true;
		expect(await and(asyncAllow, asyncAllow)(subject, undefined)).toBe(true);
		expect(await not(asyncAllow)(subject, undefined)).toBe(false);
	});

	it("passes the resource through to composed policies", async () => {
		type Post = { authorId: string };
		const ownsPost: Policy<Subject, Post> = (u, post) => post.authorId === u.id;

		expect(await or(ownsPost)(subject, { authorId: "u1" })).toBe(true);
		expect(await or(ownsPost)(subject, { authorId: "someone-else" })).toBe(false);
	});
});
