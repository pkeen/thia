import { NextResponse } from "next/server";
import {
	AuthUnavailableError,
	getCurrentSession,
	loadProfile,
} from "@/current-session";

export async function GET() {
	try {
		const session = await getCurrentSession();
		if (!session) return NextResponse.json({ user: null }, { status: 401 });

		// A valid stateless session can outlive its user (see the session
		// policy guide): the caller is authenticated, but there's no profile.
		const profile = await loadProfile(session);
		if (!profile) {
			return NextResponse.json(
				{ user: null, error: "profile_not_found" },
				{ status: 404 }
			);
		}
		return NextResponse.json({ user: profile });
	} catch (e) {
		if (!(e instanceof AuthUnavailableError)) throw e;
		return NextResponse.json(
			{ error: "service_unavailable" },
			{ status: 503, headers: { "Retry-After": "5" } }
		);
	}
}
