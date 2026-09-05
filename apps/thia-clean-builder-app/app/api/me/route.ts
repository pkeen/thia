import { NextResponse } from "next/server";
import { asUserId } from "@thia/core";
import { thia } from "@/thia";
import { getSessionToken } from "@/session";

export async function GET() {
	const token = await getSessionToken();
	if (!token) return NextResponse.json({ user: null }, { status: 401 });

	try {
		const claims = await thia.verifySession(token);
		const user = await thia.uow.users.getById(asUserId(claims.sub));
		if (!user) return NextResponse.json({ user: null }, { status: 401 });

		return NextResponse.json({
			user: {
				id: user.id,
				email: user.email.value,
				name: user.name.value,
				image: user.image.value,
			},
		});
	} catch {
		return NextResponse.json({ user: null }, { status: 401 });
	}
}
