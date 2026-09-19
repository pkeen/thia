/**
 * Compile-time guarantees of the public API. These run through the TypeScript
 * compiler (`vitest --typecheck`), not at runtime: each `@ts-expect-error`
 * fails the suite if the line it guards ever starts compiling.
 */
import { describe, it, expectTypeOf } from "vitest";
import { createAuthorizer, type SubjectOf } from "../authorizer";
import { createRbac } from "../rbac";
import { or, type Policy } from "../policy";

type User = { id: string; roles: string[] };
type Post = { authorId: string };

const ownsPost: Policy<User, Post> = (u, post) => post.authorId === u.id;
const rbac = createRbac({ admin: ["post.*"] });

const authorizer = createAuthorizer({
	"post.read": rbac.can("post.read"),
	"post.delete": or<User, Post>(ownsPost),
});

const user: User = { id: "u1", roles: [] };
const post: Post = { authorId: "u1" };

describe("action names", () => {
	it("accepts registered actions only", () => {
		authorizer.can(user, "post.read");
		// @ts-expect-error - not a registered action
		authorizer.can(user, "post.nope");
		// @ts-expect-error - not a registered action
		authorizer.assert(user, "post.nope");
	});

	it("lists actions as their literal names", () => {
		expectTypeOf(authorizer.actions()).toEqualTypeOf<
			("post.read" | "post.delete")[]
		>();
	});
});

describe("resources", () => {
	it("takes no resource for an action whose policy has none", () => {
		authorizer.can(user, "post.read");
		// @ts-expect-error - post.read takes no resource
		authorizer.can(user, "post.read", post);
	});

	it("requires the policy's resource type", () => {
		authorizer.can(user, "post.delete", post);
		// @ts-expect-error - post.delete needs a Post
		authorizer.can(user, "post.delete");
		// @ts-expect-error - wrong resource shape
		authorizer.can(user, "post.delete", { nope: 1 });
		// @ts-expect-error - assert is typed the same way
		authorizer.assert(user, "post.delete");
	});
});

describe("subjects", () => {
	it("infers a subject that satisfies every policy", () => {
		type Inferred = SubjectOf<{
			a: Policy<{ id: string }>;
			b: Policy<{ roles: string[] }>;
		}>;
		expectTypeOf<{ id: string; roles: string[] }>().toMatchTypeOf<Inferred>();
		expectTypeOf<{ id: string }>().not.toMatchTypeOf<Inferred>();
	});

	it("rejects a subject missing what a policy reads", () => {
		// @ts-expect-error - rbac.can needs roles
		authorizer.can({ id: "u1" }, "post.read");
	});

	it("types a custom RBAC subject through getRoles", () => {
		type Session = { user: { grants: string[] } };
		const custom = createRbac<Session>(
			{ admin: ["*"] },
			{ getRoles: (s) => s.user.grants }
		);
		expectTypeOf(custom.can("x")).toEqualTypeOf<Policy<Session>>();
		// @ts-expect-error - getRoles must read from the declared subject type
		createRbac<Session>({ admin: ["*"] }, { getRoles: (s) => s.roles });
	});
});

describe("results", () => {
	it("resolves can to a boolean and assert to void", () => {
		expectTypeOf(authorizer.can(user, "post.read")).toEqualTypeOf<
			Promise<boolean>
		>();
		expectTypeOf(authorizer.assert(user, "post.read")).toEqualTypeOf<
			Promise<void>
		>();
	});
});
