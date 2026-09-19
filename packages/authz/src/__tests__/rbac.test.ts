import { describe, it, expect } from "vitest";
import { createRbac, permissionMatches } from "../rbac";

const roleMap = {
	viewer: ["post.read"],
	editor: { inherits: ["viewer"], permissions: ["post.write"] },
	admin: { inherits: ["editor"], permissions: ["post.delete", "user.*"] },
};

describe("permissionMatches", () => {
	it("matches exact permissions", () => {
		expect(permissionMatches("post.read", "post.read")).toBe(true);
		expect(permissionMatches("post.read", "post.write")).toBe(false);
	});

	it("treats a trailing * as covering remaining segments", () => {
		expect(permissionMatches("user.*", "user.ban")).toBe(true);
		expect(permissionMatches("user.*", "user.ban.hard")).toBe(true);
		expect(permissionMatches("*", "anything.at.all")).toBe(true);
	});

	it("does not let a trailing * match the bare parent segment", () => {
		expect(permissionMatches("user.*", "user")).toBe(false);
	});

	it("does not match across differing prefixes", () => {
		expect(permissionMatches("user.*", "post.read")).toBe(false);
	});

	it("requires equal depth without a wildcard", () => {
		expect(permissionMatches("post.read", "post.read.meta")).toBe(false);
	});
});

describe("createRbac", () => {
	const rbac = createRbac(roleMap);

	it("resolves inherited permissions transitively", () => {
		expect([...rbac.permissionsFor(["admin"])].sort()).toEqual([
			"post.delete",
			"post.read",
			"post.write",
			"user.*",
		]);
	});

	it("grants only a role's own chain", () => {
		expect(rbac.hasPermission(["viewer"], "post.read")).toBe(true);
		expect(rbac.hasPermission(["viewer"], "post.write")).toBe(false);
		expect(rbac.hasPermission(["editor"], "post.write")).toBe(true);
		expect(rbac.hasPermission(["editor"], "post.delete")).toBe(false);
	});

	it("honours wildcards when checking", () => {
		expect(rbac.hasPermission(["admin"], "user.ban")).toBe(true);
		expect(rbac.hasPermission(["editor"], "user.ban")).toBe(false);
	});

	it("unions permissions across multiple roles", () => {
		expect(rbac.hasPermission(["viewer", "editor"], "post.write")).toBe(true);
	});

	it("ignores unknown roles on a subject instead of throwing", () => {
		expect(rbac.hasPermission(["ghost"], "post.read")).toBe(false);
		expect(rbac.hasPermission(["ghost", "viewer"], "post.read")).toBe(true);
	});

	it("lists configured roles", () => {
		expect(rbac.roles().sort()).toEqual(["admin", "editor", "viewer"]);
	});

	it("produces a policy usable on a subject", async () => {
		const canDelete = rbac.can("post.delete");
		expect(await canDelete({ roles: ["admin"] }, undefined)).toBe(true);
		expect(await canDelete({ roles: ["editor"] }, undefined)).toBe(false);
	});

	it("supports a custom getRoles", async () => {
		type Session = { user: { grants: string[] } };
		const custom = createRbac<Session>(roleMap, {
			getRoles: (s) => s.user.grants,
		});
		const canWrite = custom.can("post.write");

		expect(await canWrite({ user: { grants: ["editor"] } }, undefined)).toBe(true);
		expect(await canWrite({ user: { grants: ["viewer"] } }, undefined)).toBe(false);
	});

	it("treats a subject with no roles as unprivileged", async () => {
		expect(rbac.hasPermission([], "post.read")).toBe(false);
		const canRead = rbac.can("post.read");
		expect(await canRead({ roles: [] }, undefined)).toBe(false);
	});
});

describe("role map validation", () => {
	it("throws on an inheritance cycle", () => {
		expect(() =>
			createRbac({
				a: { inherits: ["b"] },
				b: { inherits: ["a"] },
			})
		).toThrow(/cycle/i);
	});

	it("throws when inheriting an undefined role", () => {
		expect(() =>
			createRbac({
				editor: { inherits: ["nope"], permissions: ["post.write"] },
			})
		).toThrow(/not defined/i);
	});
});
