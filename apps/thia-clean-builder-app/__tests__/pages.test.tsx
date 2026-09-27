import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
	aUser,
	authenticated,
	unauthenticated,
	unavailable,
} from "./support/sessions";

const thia = vi.hoisted(() => ({
	validateSession: vi.fn(),
	sessionPolicy: { mode: "jwt-user-validated", ttlSec: 1800 },
	uow: { users: { getById: vi.fn() } },
	roleStore: { getRoles: vi.fn() },
}));
vi.mock("@/thia", () => ({ thia }));

const cookieStore = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const { default: Home } = await import("@/app/page");
const { default: AdminPage } = await import("@/app/thia/admin/page");
const { default: LoginPage } = await import("@/app/thia/login/page");
const { default: Forbidden } = await import("@/app/forbidden");
const { default: Unauthorized } = await import("@/app/unauthorized");

/** Server components here are async and hook-free, so rendering is enough. */
const render = async (page: Promise<React.ReactElement>) =>
	renderToStaticMarkup(await page);

type Mode = "jwt-stateless" | "jwt-user-validated";

function signedInAs(email: string, assignedRoles: string[] = [], mode: Mode = "jwt-user-validated") {
	thia.sessionPolicy.mode = mode;
	thia.roleStore.getRoles.mockResolvedValue(assignedRoles);
	cookieStore.get.mockReturnValue({ value: "jwt.value" });
	thia.validateSession.mockResolvedValue(authenticated(mode, aUser(email)));
	thia.uow.users.getById.mockResolvedValue(aUser(email));
}

const signedOut = () => {
	cookieStore.get.mockReturnValue(undefined);
	thia.validateSession.mockResolvedValue(unauthenticated("missing_token"));
};

beforeEach(() => {
	vi.clearAllMocks();
	thia.sessionPolicy.mode = "jwt-user-validated";
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("home page", () => {
	it("offers sign-in when signed out", async () => {
		signedOut();
		const html = await render(Home());

		expect(html).toContain('href="/thia/login"');
		expect(html).not.toContain("Signed in as");
	});

	it("shows the signed-in user and their roles", async () => {
		signedInAs("someone@example.com");
		const html = await render(Home());

		expect(html).toContain("Signed in as someone@example.com");
		expect(html).toContain("Roles: viewer");
		expect(html).toContain('action="/api/thia/logout"');
	});

	it("offers the admin link to admins only", async () => {
		signedInAs("boss@example.com", ["admin"]);
		expect(await render(Home())).toContain('href="/thia/admin"');

		signedInAs("someone@example.com");
		expect(await render(Home())).not.toContain('href="/thia/admin"');
	});

	it("offers sign out everywhere in user-validated mode, distinct from local sign-out", async () => {
		signedInAs("someone@example.com");
		const html = await render(Home());

		expect(html).toContain('action="/api/thia/logout"');
		expect(html).toContain('action="/api/thia/sign-out-everywhere"');
		expect(html).toContain('method="post"');
		expect(html).toContain("from this browser only");
		expect(html).toContain("does not sign you out of GitHub or Google");
	});

	it("hides sign out everywhere in stateless mode and says why", async () => {
		signedInAs("someone@example.com", [], "jwt-stateless");
		const html = await render(Home());

		expect(html).toContain('action="/api/thia/logout"');
		expect(html).not.toContain("/api/thia/sign-out-everywhere");
		expect(html).toContain("Sign out everywhere is unavailable");
		expect(html).toContain("copied session token stays valid until it expires");
	});

	it("still shows a stateless session whose profile is gone", async () => {
		signedInAs("someone@example.com", [], "jwt-stateless");
		thia.uow.users.getById.mockResolvedValue(null);

		expect(await render(Home())).toContain("no profile found");
	});

	it("confirms a completed sign out everywhere", async () => {
		signedOut();
		const html = await render(Home({ searchParams: Promise.resolve({ signed_out: "everywhere" }) }));

		expect(html).toContain("signed out of this app on all devices");
		expect(html).toContain('href="/thia/login"');
	});

	it("fails with an error, not a signed-out page, when the session can't be checked", async () => {
		const { AuthUnavailableError } = await import("@/current-session");
		cookieStore.get.mockReturnValue({ value: "jwt.value" });
		thia.validateSession.mockResolvedValue(unavailable());

		await expect(render(Home())).rejects.toBeInstanceOf(AuthUnavailableError);
	});
});

/**
 * forbidden()/unauthorized() interrupt rendering by throwing, which is how Next
 * sends a real status and renders the matching boundary. The digest carries the
 * status, so asserting on it proves which one was used.
 */
const accessDigest = async (page: Promise<React.ReactElement>) => {
	try {
		await render(page);
		return undefined;
	} catch (e) {
		return (e as { digest?: string }).digest;
	}
};

describe("admin page", () => {
	it("shows the admin content to an admin", async () => {
		signedInAs("boss@example.com", ["admin"]);
		const html = await render(AdminPage());

		expect(html).toContain("<h1>Admin</h1>");
	});

	it("refuses a signed-in non-admin with a 403", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		signedInAs("someone@example.com");

		await expect(accessDigest(AdminPage())).resolves.toBe(
			"NEXT_HTTP_ERROR_FALLBACK;403"
		);
		// The action is logged for operators rather than shown to the visitor.
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("admin.view")
		);
	});

	it("gives a signed-out visitor a 401", async () => {
		signedOut();

		await expect(accessDigest(AdminPage())).resolves.toBe(
			"NEXT_HTTP_ERROR_FALLBACK;401"
		);
	});

	it("treats a forged or revoked session as signed out", async () => {
		thia.roleStore.getRoles.mockResolvedValue([]);
		cookieStore.get.mockReturnValue({ value: "tampered" });
		thia.validateSession.mockResolvedValue(unauthenticated("invalid_token"));

		await expect(accessDigest(AdminPage())).resolves.toBe(
			"NEXT_HTTP_ERROR_FALLBACK;401"
		);
	});

	it("errors (500) rather than 401 or a default role when roles can't be read", async () => {
		const { AuthUnavailableError } = await import("@/current-session");
		signedInAs("boss@example.com", ["admin"]);
		thia.roleStore.getRoles.mockRejectedValue(new Error("db down"));

		await expect(render(AdminPage())).rejects.toBeInstanceOf(AuthUnavailableError);
	});
});

describe("403 and 401 boundaries", () => {
	it("explain the refusal without naming the action", async () => {
		const forbiddenHtml = renderToStaticMarkup(Forbidden());
		expect(forbiddenHtml).toContain("403");
		expect(forbiddenHtml).not.toContain("admin.view");

		const unauthorizedHtml = renderToStaticMarkup(Unauthorized());
		expect(unauthorizedHtml).toContain("401");
		expect(unauthorizedHtml).toContain('href="/thia/login"');
	});
});

describe("login page", () => {
	const searchParams = (error?: string) => Promise.resolve({ error });

	it("offers every configured provider", async () => {
		const html = await render(LoginPage({ searchParams: searchParams() }));

		expect(html).toContain('href="/api/thia/login/github"');
		expect(html).toContain('href="/api/thia/login/google"');
		expect(html).not.toContain("already uses that email");
	});

	it("explains a refused account link", async () => {
		const html = await render(
			LoginPage({ searchParams: searchParams("account_exists") })
		);

		expect(html).toContain("An account already uses that email");
	});
});
