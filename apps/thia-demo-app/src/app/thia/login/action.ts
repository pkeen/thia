// app/login/actions.ts
"use server";

import { thia } from "@/thia";
// the identity provider needs to be here to call originally
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export async function loginAction(formData: FormData) {
	const provider = formData.get("provider");
	if (!provider) {
		throw redirect("/thia/login"); // fallback
	}

	const authResult = await thia.login({
		provider: provider.toString(),
	});

	if (authResult.type === "redirect") {
		const cookieStore = await cookies();
		cookieStore.set("state", authResult.state, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: "/",
			maxAge: 60 * 10, // 10 minutes
		});

		// This works best if you return a Response, or redirect + set cookie at edge
		// Next.js can't currently set headers directly in `redirect()`
		// So you may want to redirect via client instead after setting the cookie manually

		// TODO: You can also store this state in a session cookie
		throw redirect(authResult.url);
	}
}
