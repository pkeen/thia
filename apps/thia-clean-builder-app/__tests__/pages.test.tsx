import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { asUserId, EmailAddress, User } from "@thia/core";

const thia = vi.hoisted(() => ({
	verifySession: vi.fn(),
	uow: { users: { getById: vi.fn() } },
}));
vi.mock("@/thia", () => ({ thia }));

const cookieStore = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

process.env.ADMIN_EMAILS = "boss@example.com";

const { default: Home } = await import("@/app/page");
const { default: AdminPage } = await import("@/app/thia/admin/page");
const { default: LoginPage } = await import("@/app/thia/login/page");

/** Server components here are async and hook-free, so rendering is enough. */
const render = async (page: Promise<React.ReactElement>) =>
	renderToStaticMarkup(await page);

function signedInAs(email: string) {
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
		signedInAs("boss@example.com");
		expect(await render(Home())).toContain('href="/thia/admin"');

		signedInAs("someone@example.com");
		expect(await render(Home())).not.toContain('href="/thia/admin"');
	});
});

describe("admin page", () => {
	it("shows the admin content to an admin", async () => {
		signedInAs("boss@example.com");
		const html = await render(AdminPage());

		expect(html).toContain("<h1>Admin</h1>");
		expect(html).not.toContain("Forbidden");
	});

	it("refuses a signed-in non-admin, naming the action", async () => {
		signedInAs("someone@example.com");
		const html = await render(AdminPage());

		expect(html).toContain("403");
		expect(html).toContain("admin.view");
		expect(html).not.toContain("<h1>Admin</h1>");
	});

	it("asks a signed-out visitor to sign in", async () => {
		signedOut();
		const html = await render(AdminPage());

		expect(html).toContain('href="/thia/login"');
		expect(html).not.toContain("<h1>Admin</h1>");
	});

	it("treats a forged session as signed out", async () => {
		cookieStore.get.mockReturnValue({ value: "tampered" });
		thia.verifySession.mockRejectedValue(new Error("signature mismatch"));

		const html = await render(AdminPage());

		expect(html).toContain('href="/thia/login"');
		expect(html).not.toContain("<h1>Admin</h1>");
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
