import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { asUserId, EmailAddress, User } from "@thia/core";

const thia = vi.hoisted(() => ({
	verifySession: vi.fn(),
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

function signedInAs(email: string, assignedRoles: string[] = []) {
	thia.roleStore.getRoles.mockResolvedValue(assignedRoles);
	cookieStore.get.mockReturnValue({ value: "jwt.value" });
	thia.verifySession.mockResolvedValue({ sub: "01USER0000000000000000000" });
	thia.uow.users.getById.mockResolvedValue(
		User.create({
			id: asUserId("01USER0000000000000000000"),
			email: EmailAddress.create(email),
		})
	);
}

const signedOut = () => cookieStore.get.mockReturnValue(undefined);

beforeEach(() => {
	vi.clearAllMocks();
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

	it("treats a forged session as signed out", async () => {
		thia.roleStore.getRoles.mockResolvedValue([]);
		cookieStore.get.mockReturnValue({ value: "tampered" });
		thia.verifySession.mockRejectedValue(new Error("signature mismatch"));

		await expect(accessDigest(AdminPage())).resolves.toBe(
			"NEXT_HTTP_ERROR_FALLBACK;401"
		);
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
