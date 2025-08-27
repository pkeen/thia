// lib/auth/routeHandler.ts
import { IAuthManager } from "@pete_keen/authentication-core";
import { renderSignInPage } from "./views/signin";
import { oauthStateCookie, returnToCookie, thiaSessionCookie } from "./cookies";
import { verifyCsrfAndParseForm } from "./csrf";
import { renderErrorPage } from "./views/error";

export async function handleAuthRoute(
	request: Request,
	method: "GET" | "POST",
	authManager: IAuthManager
): Promise<Response> {
	const url = new URL(request.url);
	// console.log("URL:", url);
	const parts = url.pathname.split("/api/thia/")[1]?.split("/") ?? [];
	// console.log("Parts:", parts);
	const [action, provider] = parts;
	// console.log("Action:", action, "Provider:", provider);

	if (method === "GET") {
		// SignIn HTML Page
		if (action === "signin") {
			const providers = authManager.listProviders();
			return renderSignInPage(providers);
		}

		// SignOut
		if (action === "signout") {
			return new Response("<p>Signed out</p>", {
				headers: { "Content-Type": "text/html" },
				status: 200,
			});
		}

		// Redirect back from OAuth provider
		if (action === "redirect" && provider) {
			const storedState = await oauthStateCookie.get();
			// console.log("STORED STATE:", storedState);

			const url = new URL(request.url);
			const error = url.searchParams.get("error");
			if (error) {
				console.log("ERROR:", error);
				return Response.redirect("/api/thia/signin", 302);
			}
			const code = url.searchParams.get("code");
			const returnedState = url.searchParams.get("state");

			if (
				!code ||
				!returnedState ||
				!storedState ||
				returnedState !== storedState
			) {
				// console.log("RETURNED STATE", returnedState);
				// console.log("STORED STATE", storedState);
				// bad request
				return new Response(null, {
					status: 400,
				});
			}

			try {
				const authResult = await authManager.login({
					provider: provider?.toString()!,
					code,
				});
				if (authResult.type === "success") {
					// console.log("SUCCESS");
					const sessionCookie = thiaSessionCookie.set(
						authResult.authState
					);

					// TODO: spoof config - for now
					const config = { redirectAfterLogin: "" };

					const returnTo = await returnToCookie.get();
					const headers = new Headers({
						Location: config.redirectAfterLogin || returnTo || "/",
					});
					headers.append("Set-Cookie", sessionCookie);
					headers.append("Set-Cookie", returnToCookie.destroy());
					headers.append("Set-Cookie", oauthStateCookie.destroy());
					return new Response(null, {
						status: 302,
						headers,
					});
				} else if (authResult.type === "redirect") {
					// Add the Content-Type header here too.
					return Response.redirect(authResult.url, 302);
				} else {
					throw new Error("Unknown authResult type");
				}
			} catch (e) {
				console.log("ERROR:", e);
			}
		}

		// Error
		if (action === "error") {
			return renderErrorPage();
		}
	}

	if (method === "POST") {
		if (action === "signin") {
			const { valid, formData } = await verifyCsrfAndParseForm(request);
			if (!valid) {
				return Response.redirect("/api/thia/signin", 302);
			}
			const provider = formData.get("provider");
			if (!provider || typeof provider !== "string") {
				return Response.redirect("/api/thia/signin", 302); // or manually build a 302 if cookie is needed
			}
			const authResult = await authManager.login({
				provider: provider?.toString()!,
			});

			if (authResult.type === "redirect") {
				const cookieHeader = await oauthStateCookie.set(
					authResult.state
				);
				return new Response(null, {
					status: 302,
					headers: {
						Location: authResult.url,
						"Set-Cookie": cookieHeader,
						"Content-Type": "text/html",
					},
				});
			}
		}

		if (action === "signout") {
			const { valid, formData } = await verifyCsrfAndParseForm(request);
			if (!valid) {
				return Response.redirect("/api/thia/error", 302);
			}
			const session = await thiaSessionCookie.get();

			const authState = await authManager.signOut(session?.keyCards);

			const sessionCookie = thiaSessionCookie.set(authState);
			const headers = new Headers({
				Location: "/",
			});
			headers.append("Set-Cookie", sessionCookie);
			return new Response(null, {
				status: 302,
				headers,
			});
		}
	}

	return new Response("Not Found", { status: 404 });
}

export const createHandlers = (authManager: IAuthManager) => {
	return {
		GET: (req: Request) => handleAuthRoute(req, "GET", authManager),
		POST: (req: Request) => handleAuthRoute(req, "POST", authManager),
	};
};
