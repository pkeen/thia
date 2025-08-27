// lib/auth/views/signin.ts
import type { DisplayProvider } from "@pete_keen/authentication-core";
// import { getCsrfToken } from "csrf.client";
import { csrfCookie } from "../csrf";

export async function renderSignInPage(
	providers: DisplayProvider[]
): Promise<Response> {
	const buttons = providers
		.map(
			(provider) => `
        <button type="submit" name="provider" value="${provider.key}" 
        style="display:block; width: 100%; color: ${provider.style.text}; background-color: ${provider.style.bg}; 
        border-radius: 4px; padding: 12px 20px; margin-bottom: 10px; cursor: pointer; font-size: 16px; transition: all 0.2s ease;
        border: none">
        ${provider.name}
        </button>
        `
		)
		.join("");

	const csrfToken = await csrfCookie.get();

	const html = `
    <html>
      <body>
        <div style="
                    height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex: 1;
                ">
            <form method="POST" action="/api/thia/signin">
                <div style="display:block">
                <input type="hidden" name="csrfToken" value="${csrfToken}" />
                    <h1 style="textAlign: center; fontSize: 22px; marginBottom: 10px;">
                        Continue with
                    </h1>
                    ${buttons}
                </div>
            </form>
        </div>
      </body>
    </html>
  `;

	return new Response(html, {
		headers: { "Content-Type": "text/html" },
		status: 200,
	});
}
