import {
	asUserId,
	EmailAddress,
	User,
	type SessionMode,
	type SessionValidation,
} from "@thia/core";

export const USER_ID = "01USER0000000000000000000";

export const aUser = (email = "a@example.com") =>
	User.create({
		id: asUserId(USER_ID),
		email: EmailAddress.create(email),
		name: "Ada",
		image: "https://example.com/a.png",
	});

/** What the core validator returns for a signed-in user in either mode. */
export function authenticated(
	mode: SessionMode = "jwt-user-validated",
	user: User = aUser()
): SessionValidation {
	const identity = {
		userId: user.id,
		tokenVersion: 0,
		emailVerified: true,
		issuedAt: new Date(),
		expiresAt: new Date(Date.now() + 1800_000),
	};
	return {
		status: "authenticated",
		session:
			mode === "jwt-user-validated"
				? { mode, identity, user }
				: { mode, identity },
	};
}

export const unauthenticated = (
	reason: "missing_token" | "invalid_token" | "user_not_found" | "token_revoked" = "invalid_token"
): SessionValidation => ({ status: "unauthenticated", reason });

export const unavailable = (): SessionValidation => ({
	status: "unavailable",
	reason: "user_lookup_failed",
	cause: new Error("connect ECONNREFUSED"),
});
