// application/session/refresh-sessions.ts
import type { User } from "../../domain/entities/user";
import { Keycard } from "../../domain/value-objects/keycard";
import { SESSION_ID_PATTERN } from "../claims/auth-claims";
import type { Clock } from "../ports/clock.port";
import type { IdGenerator } from "../ports/id-generator.port";
import type { TokenSigner } from "../ports/token-signer.port";
import type { UserRepository } from "../ports/user-repo.port";
import { issueAccessToken } from "../use-cases/issue-access-token";
import type {
	RefreshTokenCrypto,
	SessionRepository,
	StoredSession,
} from "./session-repository.port";
import type { RefreshPolicy, SessionPolicy } from "./session-policy";
import type { AuthenticatedSession } from "./validate-session";

/**
 * How long a just-replaced refresh secret may still obtain an access token
 * (never a refresh token), so concurrent requests from one browser don't
 * trip reuse detection. After this, presenting it revokes the session.
 */
export const REFRESH_REUSE_GRACE_SEC = 30;

const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_DEVICE_LABEL = 64;

export type RefreshSessionDeps = {
	policy: SessionPolicy;
	sessions: SessionRepository;
	crypto: RefreshTokenCrypto;
	users: Pick<UserRepository, "getById">;
	signer: TokenSigner;
	clock: Clock;
	ids: IdGenerator;
	issuer: string;
	audience: string;
	policyVersion: number;
};

export type IssuedSession = {
	sessionId: string;
	/** Access token bound to the session (`sid`). */
	access: Keycard;
	/** `<session id>.<secret>`; expires with the session's idle expiry. */
	refresh: Keycard;
};

export type RefreshResult =
	| ({ status: "refreshed" } & IssuedSession)
	/** Benign race: a new access token only; keep the refresh cookie the winner set. */
	| { status: "grace"; sessionId: string; access: Keycard }
	| {
			status: "invalid";
			reason:
				| "malformed"
				| "unknown_session"
				| "unrecognized_secret"
				| "revoked"
				| "expired"
				| "reuse_detected"
				| "user_not_found"
				| "user_version_changed";
	  };

function requireRefresh(policy: SessionPolicy): RefreshPolicy {
	if (!policy.refresh) throw new Error("Refresh tokens are not enabled in the session policy");
	return policy.refresh;
}

/**
 * The absolute expiry in force: the stored one, or sign-in time plus the
 * configured limit if that has since been lowered (ADR-004). Raising the
 * limit never extends an existing session.
 */
export function effectiveAbsoluteExpiry(session: StoredSession, refresh: RefreshPolicy): Date {
	const capped = session.createdAt.getTime() + refresh.absoluteTtlSec * 1000;
	return new Date(Math.min(session.absoluteExpiresAt.getTime(), capped));
}

/** Unrevoked and within both its idle and (effective) absolute expiry. */
export function isSessionActive(session: StoredSession, refresh: RefreshPolicy, now: Date) {
	return (
		session.revokedAt === null &&
		now < session.idleExpiresAt &&
		now < effectiveAbsoluteExpiry(session, refresh)
	);
}

/** `<session id>.<secret>`, or null if the value doesn't have that shape. */
export function parseRefreshToken(value: string | null | undefined) {
	if (typeof value !== "string" || value.length > 100) return null;
	const [sessionId, secret, ...rest] = value.split(".");
	if (rest.length > 0 || !SESSION_ID_PATTERN.test(sessionId ?? "") || !SECRET_PATTERN.test(secret ?? "")) {
		return null;
	}
	return { sessionId, secret };
}

/** A short printable label; never used for security decisions. */
export function sanitizeDeviceLabel(label: string | null | undefined): string | null {
	if (typeof label !== "string") return null;
	const clean = label.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_DEVICE_LABEL);
	return clean.length > 0 ? clean : null;
}

async function accessFor(
	deps: RefreshSessionDeps,
	user: User,
	sessionId: string,
	absoluteExpiry: Date
): Promise<Keycard> {
	// Never outlive the session itself.
	const remainingSec = Math.floor((absoluteExpiry.getTime() - deps.clock.now().getTime()) / 1000);
	return issueAccessToken(
		{
			signer: deps.signer,
			clock: deps.clock,
			ids: deps.ids,
			policyVersion: deps.policyVersion,
			issuer: deps.issuer,
			audience: deps.audience,
			ttlSec: Math.max(1, Math.min(deps.policy.ttlSec, remainingSec)),
		},
		user,
		{ sessionId }
	);
}

/**
 * Creates a stored session for a user who just signed in and returns its
 * access and refresh tokens.
 */
export async function startSession(
	deps: RefreshSessionDeps,
	user: User,
	options: { deviceLabel?: string | null } = {}
): Promise<IssuedSession> {
	const refresh = requireRefresh(deps.policy);
	const now = deps.clock.now();
	const sessionId = deps.crypto.newSessionId();
	const secret = deps.crypto.newSecret();
	const absoluteExpiresAt = new Date(now.getTime() + refresh.absoluteTtlSec * 1000);
	const idleExpiresAt = new Date(
		Math.min(now.getTime() + refresh.idleTtlSec * 1000, absoluteExpiresAt.getTime())
	);

	await deps.sessions.create({
		id: sessionId,
		userId: user.id,
		tokenHash: await deps.crypto.hash(secret),
		userTokenVersion: user.tokenVersion(),
		createdAt: now,
		lastUsedAt: now,
		idleExpiresAt,
		absoluteExpiresAt,
		deviceLabel: sanitizeDeviceLabel(options.deviceLabel),
	});

	return {
		sessionId,
		access: await accessFor(deps, user, sessionId, absoluteExpiresAt),
		refresh: Keycard.create({
			type: "refresh",
			value: `${sessionId}.${secret}`,
			expiresAt: idleExpiresAt,
		}),
	};
}

/**
 * Exchanges a refresh token for a new access token and a new refresh token,
 * rotating the stored secret atomically. See ADR-004 for the grace window
 * and reuse detection. Infrastructure errors propagate (callers answer 503
 * and keep cookies).
 */
export async function refreshSession(
	deps: RefreshSessionDeps,
	token: string | null | undefined
): Promise<RefreshResult> {
	const refresh = requireRefresh(deps.policy);
	const parsed = parseRefreshToken(token);
	if (!parsed) return { status: "invalid", reason: "malformed" };
	const now = deps.clock.now();

	let session = await deps.sessions.getById(parsed.sessionId);
	// At most one retry: after losing a rotation race, re-evaluate once.
	for (let attempt = 0; attempt < 2; attempt++) {
		if (!session) return { status: "invalid", reason: "unknown_session" };
		if (session.revokedAt) return { status: "invalid", reason: "revoked" };
		const absoluteExpiresAt = effectiveAbsoluteExpiry(session, refresh);
		if (now >= session.idleExpiresAt || now >= absoluteExpiresAt) {
			return { status: "invalid", reason: "expired" };
		}

		const isCurrent = await deps.crypto.matches(parsed.secret, session.tokenHash);
		if (!isCurrent) {
			const isPrevious = await deps.crypto.matches(parsed.secret, session.previousTokenHash);
			// Could be forged; nothing to revoke on the strength of it.
			if (!isPrevious) return { status: "invalid", reason: "unrecognized_secret" };
			const sinceRotation = now.getTime() - (session.rotatedAt?.getTime() ?? 0);
			if (sinceRotation > REFRESH_REUSE_GRACE_SEC * 1000) {
				await deps.sessions.revoke(session.id, "reuse_detected", now);
				return { status: "invalid", reason: "reuse_detected" };
			}
			const checked = await currentUser(deps, session, now);
			if ("status" in checked) return checked;
			return {
				status: "grace",
				sessionId: session.id,
				access: await accessFor(deps, checked, session.id, absoluteExpiresAt),
			};
		}

		const checked = await currentUser(deps, session, now);
		if ("status" in checked) return checked;

		const secret = deps.crypto.newSecret();
		const idleExpiresAt = new Date(
			Math.min(now.getTime() + refresh.idleTtlSec * 1000, absoluteExpiresAt.getTime())
		);
		const rotated = await deps.sessions.rotate({
			id: session.id,
			expectedHash: session.tokenHash,
			newHash: await deps.crypto.hash(secret),
			now,
			idleExpiresAt,
			absoluteExpiresAt,
		});
		if (!rotated) {
			// Another request rotated (or revoked) it first.
			session = await deps.sessions.getById(parsed.sessionId);
			continue;
		}
		return {
			status: "refreshed",
			sessionId: session.id,
			access: await accessFor(deps, checked, session.id, absoluteExpiresAt),
			refresh: Keycard.create({
				type: "refresh",
				value: `${session.id}.${secret}`,
				expiresAt: idleExpiresAt,
			}),
		};
	}
	return { status: "invalid", reason: "unrecognized_secret" };
}

/** The session's user if it still exists at the version the session was issued for. */
async function currentUser(
	deps: RefreshSessionDeps,
	session: StoredSession,
	now: Date
): Promise<User | Extract<RefreshResult, { status: "invalid" }>> {
	const user = await deps.users.getById(session.userId);
	if (!user) {
		await deps.sessions.revoke(session.id, "user_mismatch", now);
		return { status: "invalid", reason: "user_not_found" };
	}
	if (user.tokenVersion() !== session.userTokenVersion) {
		await deps.sessions.revoke(session.id, "user_mismatch", now);
		return { status: "invalid", reason: "user_version_changed" };
	}
	return user;
}

/**
 * Ordinary sign-out with refresh enabled: revokes this browser's session,
 * identified by the validated access token's `sid` and/or a refresh token
 * that proves possession (its secret must match the current or previous
 * hash). Returns whether a session was revoked.
 */
export async function signOutSession(
	deps: { sessions: SessionRepository; crypto: RefreshTokenCrypto; clock: Clock },
	input: { session?: AuthenticatedSession | null; refreshToken?: string | null }
): Promise<{ revoked: boolean }> {
	const now = deps.clock.now();
	let revoked = false;
	const sid = input.session?.identity.sessionId;
	if (sid) revoked = (await deps.sessions.revoke(sid, "sign_out", now)) || revoked;

	const parsed = parseRefreshToken(input.refreshToken);
	if (parsed && parsed.sessionId !== sid) {
		const stored = await deps.sessions.getById(parsed.sessionId);
		const owns =
			stored !== null &&
			((await deps.crypto.matches(parsed.secret, stored.tokenHash)) ||
				(await deps.crypto.matches(parsed.secret, stored.previousTokenHash)));
		if (owns) revoked = (await deps.sessions.revoke(parsed.sessionId, "sign_out", now)) || revoked;
	}
	return { revoked };
}

export type SessionSummary = {
	id: string;
	deviceLabel: string | null;
	createdAt: Date;
	lastUsedAt: Date;
	expiresAt: Date;
	/** The session the caller is using. */
	current: boolean;
};

/** The caller's active sessions (devices), newest first. */
export async function listUserSessions(
	deps: { policy: SessionPolicy; sessions: SessionRepository; clock: Clock },
	session: AuthenticatedSession
): Promise<SessionSummary[]> {
	const refresh = requireRefresh(deps.policy);
	const now = deps.clock.now();
	const rows = await deps.sessions.listActiveForUser(session.identity.userId, now);
	return rows
		.filter((s) => isSessionActive(s, refresh, now))
		.map((s) => ({
			id: s.id,
			deviceLabel: s.deviceLabel,
			createdAt: s.createdAt,
			lastUsedAt: s.lastUsedAt,
			expiresAt: new Date(
				Math.min(s.idleExpiresAt.getTime(), effectiveAbsoluteExpiry(s, refresh).getTime())
			),
			current: s.id === session.identity.sessionId,
		}));
}

/**
 * Signs one of the caller's own devices out. A session belonging to anyone
 * else is reported exactly like a missing one.
 */
export async function revokeUserSession(
	deps: { sessions: SessionRepository; clock: Clock },
	session: AuthenticatedSession,
	targetSessionId: string
): Promise<{ status: "revoked"; current: boolean } | { status: "not_found" }> {
	if (!SESSION_ID_PATTERN.test(targetSessionId)) return { status: "not_found" };
	const target = await deps.sessions.getById(targetSessionId);
	if (!target || target.userId !== session.identity.userId || target.revokedAt) {
		return { status: "not_found" };
	}
	const revoked = await deps.sessions.revoke(target.id, "device_sign_out", deps.clock.now());
	if (!revoked) return { status: "not_found" };
	return { status: "revoked", current: target.id === session.identity.sessionId };
}

/**
 * Housekeeping for the application to schedule: deletes sessions that were
 * revoked or expired more than `retentionSec` ago (default 7 days).
 */
export async function deleteEndedSessions(
	deps: { sessions: SessionRepository; clock: Clock },
	options: { retentionSec?: number } = {}
): Promise<number> {
	const retentionSec = options.retentionSec ?? 7 * 24 * 60 * 60;
	return deps.sessions.deleteEndedBefore(
		new Date(deps.clock.now().getTime() - retentionSec * 1000)
	);
}
