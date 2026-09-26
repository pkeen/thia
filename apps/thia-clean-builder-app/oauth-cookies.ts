import type { NextRequest, NextResponse } from "next/server";

/**
 * OAuth transaction cookies: one short-lived, encrypted cookie per login
 * attempt, so logins started in several tabs don't overwrite each other.
 *
 * - Name: `thia_oauth_<id>`, where <id> is derived from the attempt's `state`
 *   (a hash, so the state itself isn't repeated in the name). The callback
 *   finds its cookie from the returned state; nothing else is looked up.
 * - Over HTTPS the name gets the `__Host-` prefix, which makes the browser
 *   insist on Secure, Path=/ and no Domain (host-only).
 * - HttpOnly, SameSite=Lax (the provider returns with a top-level GET), and
 *   Max-Age equal to the transaction lifetime. The server enforces that
 *   lifetime itself too; the cookie expiry is just cleanup.
 * - At most MAX_PENDING_OAUTH_TRANSACTIONS at once. Starting another login
 *   first drops unreadable/expired ones, then the oldest, so the oldest tab's
 *   login fails with `invalid_transaction` rather than cookies piling up.
 */
export const OAUTH_TRANSACTION_TTL_SEC = 10 * 60;
export const MAX_PENDING_OAUTH_TRANSACTIONS = 3;

const BASE_NAME = "thia_oauth_";
/** Our states are 32 random bytes, base64url: exactly 43 characters. */
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type OAuthCookiePolicy = {
	secure: boolean;
	/** Every transaction cookie name starts with this. */
	prefix: string;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Cookie attributes follow the configured callback URI's scheme: HTTPS gets
 * Secure + `__Host-`. Plain HTTP is allowed only for a local callback, so a
 * deployment can't accidentally send transactions over an insecure origin.
 */
export function oauthCookiePolicy(callbackUri: string): OAuthCookiePolicy {
	const url = new URL(callbackUri);
	if (url.protocol === "https:") {
		return { secure: true, prefix: `__Host-${BASE_NAME}` };
	}
	if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) {
		return { secure: false, prefix: BASE_NAME };
	}
	throw new Error(
		"OAuth callback URIs must use https (plain http is only allowed for localhost)"
	);
}

/** Whether a callback `state` has the shape we issue; anything else is rejected unread. */
export function isWellFormedState(state: string | null): state is string {
	return state !== null && STATE_PATTERN.test(state);
}

export async function oauthCookieName(
	state: string,
	policy: OAuthCookiePolicy
): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(state)
	);
	const id = Buffer.from(digest).toString("base64url").slice(0, 22);
	return policy.prefix + id;
}

/** Transaction cookies this browser sent, by name. */
export function pendingOAuthCookies(
	req: NextRequest,
	policy: OAuthCookiePolicy
): { name: string; value: string }[] {
	return req.cookies
		.getAll()
		.filter((c) => c.name.startsWith(policy.prefix))
		.map(({ name, value }) => ({ name, value }));
}

function baseAttributes(policy: OAuthCookiePolicy) {
	return {
		httpOnly: true,
		secure: policy.secure,
		sameSite: "lax" as const,
		path: "/",
	};
}

export function setOAuthCookie(
	response: NextResponse,
	name: string,
	sealedTransaction: string,
	policy: OAuthCookiePolicy
) {
	response.cookies.set(name, sealedTransaction, {
		...baseAttributes(policy),
		maxAge: OAUTH_TRANSACTION_TTL_SEC,
	});
}

/** Same attributes as when set - browsers ignore a `__Host-` cookie without them. */
export function clearOAuthCookie(
	response: NextResponse,
	name: string,
	policy: OAuthCookiePolicy
) {
	response.cookies.set(name, "", { ...baseAttributes(policy), maxAge: 0 });
}

/**
 * Which existing transaction cookies to drop so that, with the new one, at
 * most MAX_PENDING_OAUTH_TRANSACTIONS remain: unreadable or expired ones
 * first (`issuedAt` undefined), then the oldest.
 */
export function cookiesToEvict(
	existing: { name: string; issuedAt: number | undefined }[]
): string[] {
	const dead = existing.filter((c) => c.issuedAt === undefined);
	const live = existing
		.filter((c) => c.issuedAt !== undefined)
		.sort((a, b) => b.issuedAt! - a.issuedAt!); // newest first
	const keep = Math.max(0, MAX_PENDING_OAUTH_TRANSACTIONS - 1);
	return [...dead, ...live.slice(keep)].map((c) => c.name);
}
