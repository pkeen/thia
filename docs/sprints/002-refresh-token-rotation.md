# Sprint 002: Refresh-token rotation and stored sessions

Status: Completed
Created: 2026-09-27
Completed: 2026-09-27

Delivery, verification and remaining limits are recorded in
[Delivery record](#delivery-record) at the end of this brief. The original brief
below is unchanged.

## Outcome

Let integrating applications enable long-lived sign-in with short-lived access
tokens. Enabling it is an opt-in developer setting on the existing session
policy. A rotating refresh token, backed by a stored session record, renews
the access token. Deliver per-device sessions, an inactivity timeout, per-device
sign-out and refresh-token reuse detection. Also deliver a working, tested demo.

With refresh disabled, behavior must be exactly as delivered in Sprint 001.

## Starting context

Inspect repository instructions and current code before implementation. Read
[ADR-003](../decisions/003-selectable-session-policy.md) first: it requires a
stored-session capability to be a new decision, not a silent third mode.
Preserve the OAuth cookie/PKCE, account-linking, persisted-role and Sprint 001
session behavior.

Relevant starting points (as of `a3f5c0b`):

- `packages/core/src/application/session/session-policy.ts`: `SessionPolicy`,
  `defineSessionPolicy`, TTL range 60–86400 s.
- `packages/core/src/application/session/validate-session.ts`: the shared
  validator and its typed results.
- `packages/core/src/application/claims/auth-claims.ts`: claim schema `ver` 1,
  `parseAuthClaims`.
- `packages/core/src/application/use-cases/sign-out-everywhere.ts` and
  `issue-access-token.ts`.
- `packages/adapters/drizzle-adapter/src/schema.ts` and `user-repository.ts`:
  Postgres schema and the atomic `incrementTokenVersion`.
- `apps/thia-clean-builder-app/thia.ts`: composition and `sessionPolicyFromEnv`.
- `apps/thia-clean-builder-app/session.ts` and `current-session.ts`: session
  cookie and per-request validation.
- `apps/thia-clean-builder-app/app/api/thia/{logout,sign-out-everywhere,redirect/[provider]}/route.ts`.
- `apps/thia-clean-builder-app/same-origin.ts`: the established CSRF check.
- [Session policies guide](../guides/session-policies.md).

These pointers describe the sprint's starting snapshot, not guaranteed APIs.

## Terminology

"Refresh token" in this sprint means **Thia's own** refresh credential for its
session. It is unrelated to GitHub or Google refresh tokens, which are out of
scope and must not be requested, stored or used here.

## Scope and policy contract

Extend the existing typed policy. Refine the naming to fit the code without
changing the intended semantics:

```ts
type SessionPolicy = {
  mode: "jwt-stateless" | "jwt-user-validated";
  ttlSec: number; // access-token lifetime
  refresh?: {
    idleTtlSec: number;     // session ends if not refreshed for this long
    absoluteTtlSec: number; // session ends this long after sign-in, regardless
  };
};
```

- `refresh` omitted means no refresh tokens and no session records, with
  Sprint 001 behavior unchanged. Existing configurations must keep working
  unmodified.
- With `refresh`, `ttlSec` is the access-token lifetime. Define and document
  supported ranges. Proposed: access 60–3600 s when refresh is enabled,
  `idleTtlSec` 1 h–30 d, `absoluteTtlSec` from `idleTtlSec` up to 90 d. Reject
  invalid or inconsistent values at startup with `SessionPolicyError`.
- Refresh combines with either mode. It requires session storage in both
  modes, including stateless. Refuse to start when refresh is configured
  without a session repository.
- Proposed demo default: `jwt-user-validated`, access 600 s, idle 7 d, absolute
  30 d. Add environment overrides alongside `THIA_SESSION_MODE` /
  `THIA_SESSION_TTL_SEC`, following the same digits-only, fail-at-startup
  rules, with an explicit way to disable refresh.
- The policy comes from trusted application configuration only. Keep
  framework HTTP handling outside the core.

## Decision record

Before or alongside implementation, add ADR-004 (the next unused number) as an
accepted decision covering: refresh as an opt-in policy capability, the
session record, rotation and reuse-detection rules, revocation latency per
mode, and the relationship to `token_version`. Link it from ADR-003's
"Revisit when" context without rewriting ADR-003's history.

## Stored sessions

Add a session record and repository port, with Postgres (Drizzle) and
in-memory implementations. The proposed fields:

- a random session id and the user id (cascade on user delete)
- the current refresh-token hash and the previous hash (for reuse detection)
- `created_at`, `last_used_at`, `idle_expires_at`, `absolute_expires_at`
- `revoked_at` and a revocation reason
- a short, non-identifying device label derived from the User-Agent

Requirements:

- Refresh tokens carry at least 256 bits of CSPRNG randomness. Store only a
  hash, never the token. Never log tokens, hashes or cookie values.
- Provide a migration for the demo schema. Document the table for integrators
  who manage their own schema.
- Provide an operation that deletes expired and revoked records past a
  retention period. Document how to schedule it. Do not add a scheduler.

## Access tokens

- Access tokens issued with refresh enabled carry a session id claim (`sid`).
  Bump the claim schema version, or otherwise make the change explicit.
  Existing `ver` 1 tokens are either accepted until expiry or deliberately
  rejected. Document which, and test it.
- All Sprint 001 mandatory checks still apply. Validate `sid` at runtime as a
  required claim when the token is from a refresh-enabled session.
- `jwt-user-validated` with refresh: also require the referenced session to be
  active (not revoked or expired, and owned by the token's user), so
  per-device sign-out applies on the next request. Load the session together
  with the user where practical, avoiding an extra round trip.
- `jwt-stateless` with refresh: requests do not read the session. Revocation
  takes effect at the next refresh, within one access TTL. Document this
  clearly.

## Refresh and rotation

Add a core use case and a demo route that exchanges a valid refresh token for
a new access token **and** a new refresh token.

- Rotate on every successful refresh. Update the stored hash atomically
  (compare-and-swap on the current hash), so two refreshes cannot both
  succeed with the same token.
- **Reuse detection:** presenting a superseded refresh token revokes that
  session. Define and test the benign race in which two tabs refresh at once
  with the same cookie. Either allow a short, documented grace window for the
  immediately previous token that does not issue a second valid chain, or have
  the losing request fail without revoking, and have the demo retry. Record
  the choice in ADR-004.
- Refuse to refresh expired (idle or absolute), revoked, deleted-user and
  version-mismatched sessions (`uvn` behind the stored `token_version`).
  Update `last_used_at` and `idle_expires_at` on success. Never extend past
  `absolute_expires_at`.
- Distinguish invalid credentials (401, clear both cookies) from unavailable
  infrastructure (503, keep cookies). Never fall back to accepting an expired
  access token.
- Protect the refresh endpoint: POST only, with the same-origin check.

## Cookies and renewal in the demo

- Keep the access token in the existing session cookie. Add a separate refresh
  cookie: HttpOnly, Secure outside local HTTP, and scoped as narrowly as
  practical (restricted path and SameSite=Strict, if compatible with the
  renewal design). Note that the `__Host-` prefix requires `Path=/`, and choose
  deliberately. Cookie expiry follows the session's expiry.
- Renew in a place that can set cookies. React Server Components cannot. Use
  Next.js request interception (verify its runtime and API in the installed
  Next.js 16), a route handler, or a client-initiated refresh, and document
  the choice. A page must not show a signed-out state while a valid refresh
  token exists. Renewal must not loop on failure.
- After an OAuth login with refresh enabled, create the session and set both
  cookies. Login without refresh enabled is unchanged.

## Sign-out and devices

- **Ordinary sign-out** revokes the current session server-side when refresh
  is enabled (an improvement on cookie-only removal) and clears both cookies.
  Without refresh, it behaves exactly as before.
- **Sign out everywhere** revokes every session of the user and increments
  `token_version`. Define its behavior in stateless mode with refresh:
  sessions can be revoked, but outstanding access tokens remain valid until
  expiry. Report that honestly; do not imply immediate effect.
- **Devices page:** list the user's active sessions (device label, created,
  last used, current marker). Offer a protected POST to revoke a single
  session. The target must belong to the validated user, and the same-origin
  check applies. Explain in the UI what each action does and that none of them
  signs the user out of GitHub or Google.

## Configuration changes

These are developer settings, not runtime admin controls. Document:

- Enabling refresh: existing access tokens without `sid` behave as decided
  above, and users sign in once to get a session.
- Disabling refresh: refresh cookies are ignored and cleared, sessions stop
  renewing, and access tokens expire normally.
- Changing TTLs: affects new tokens and sessions. Decide whether existing
  sessions keep their stored expiry or are capped at the new limits, and
  document it.
- Signing-key rotation still invalidates every access token. Stored refresh
  tokens are not signed, so define what rotation does to them, and provide a
  way to revoke all sessions if required.
- All instances must share the policy, the keys and the session store.

## Tests and acceptance criteria

Use existing test conventions, including the end-to-end harness in
`apps/thia-clean-builder-app/__tests__/support/app-harness.ts`.

1. Without `refresh`, all Sprint 001 tests pass unchanged and no session
   records are written.
2. Invalid, inconsistent or refresh-without-storage configuration fails at
   startup.
3. Login with refresh sets both cookies with the documented attributes and
   expiry, and creates exactly one session.
4. A refresh returns a new access token and a new refresh token. The old
   refresh token no longer works, and the chain continues across several
   rotations.
5. Reusing a superseded refresh token revokes the session, so subsequent
   refreshes and (in user-validated mode) access tokens for that session fail.
   The benign-race behavior matches ADR-004.
6. Idle and absolute expiry end the session. `last_used_at` never pushes past
   the absolute limit. Use fake timers or an injected clock, not sleeps.
7. Per-device sign-out ends only that device: immediately in user-validated
   mode, and at the next refresh in stateless mode. Other devices keep working.
8. Sign out everywhere revokes all sessions and old access tokens as specified
   per mode. A new login works afterwards.
9. A caller cannot list or revoke another user's sessions. Cross-origin and
   unauthenticated refresh or revocation requests change nothing.
10. Database outages during refresh or validation fail closed (503, cookies
    kept, no stateless fallback, no role grants).
11. PostgreSQL integration tests show that concurrent refreshes of one token
    produce at most one successful rotation, and that concurrent revocation
    and refresh cannot resurrect a revoked session.
12. Pages and APIs agree on session state, including across a renewal.
    Renewal does not loop when the refresh fails.
13. No token, hash or cookie value appears in logs or error responses.
14. The existing OAuth cookie/PKCE, account-linking and role tests still pass.

Run the relevant unit and integration suites, typechecks, package builds and
the demo build. Report the commands and outcomes, including checks blocked by
missing infrastructure. Record any live local verification separately from
mocked tests.

## Documentation and delivery

- ADR-004 (accepted), and an update to the session policies guide covering
  configuration examples, a behavior comparison with and without refresh per
  mode, revocation latency, cookies, the devices page and migration.
- The demo README (environment variables, sessions section, manual smoke
  steps) and the docs index.
- On completion, record the delivered scope, verification and remaining
  limits in this brief, following Sprint 001's format.

## Explicitly deferred

OAuth provider refresh tokens, "remember me" toggles, device fingerprinting or
geolocation, new-device notifications, admin session management across users,
bearer-token (non-cookie) clients and mobile SDKs, runtime policy switching,
and a background cleanup scheduler.

## Delivery record

Completed 2026-09-27 (not yet committed). Decision:
[ADR-004](../decisions/004-refresh-token-rotation.md). Guide:
[Session policies](../guides/session-policies.md).

### Decisions taken (confirmed with the developer, recorded in ADR-004)

- Concurrent refresh: a 30-second grace window in which the just-replaced
  secret gets an access token only, never a new refresh token, and nothing is
  revoked. Reuse after the window revokes the session.
- Tokens without `sid` (`ver` 1) stay valid until they expire after refresh is
  enabled.
- Lowering the refresh limits caps existing sessions (applied at validation,
  persisted at the next refresh); raising them never extends sessions.
- Refresh secrets are stored as HMAC-SHA256 under a key HKDF-derived from
  `AUTH_SECRET`, so rotating the secret invalidates refresh tokens as well.
- Renewal runs in Next.js 16 `proxy.ts` (Node.js runtime), with
  `POST /api/thia/refresh` for client code. The refresh cookie is `Path=/`
  and `SameSite=Lax` (`__Host-` in production), so it reaches page requests.

### Delivered

- **Policy.** `SessionPolicy.refresh?: { idleTtlSec, absoluteTtlSec }`.
  Access tokens are 60–3600 s with refresh, idle 1 h–30 d, absolute from idle
  to 90 d. Unknown keys, inconsistent values and non-objects are rejected.
  Without `refresh`, behavior is unchanged. Demo default: user-validated,
  600 s, 7 d idle / 30 d total, with `THIA_SESSION_REFRESH`,
  `THIA_SESSION_REFRESH_IDLE_SEC` and `THIA_SESSION_REFRESH_ABSOLUTE_SEC`
  overrides (refresh lifetimes set while it's off is an error).
- **Core.** `SessionRepository` and `RefreshTokenCrypto` ports;
  `HmacRefreshTokenCrypto`; `InMemorySessionRepo`; `startSession`,
  `refreshSession` (compare-and-swap rotation, grace, reuse detection,
  idle/absolute/capped expiry, user and version checks), `signOutSession`,
  `listUserSessions`, `revokeUserSession`, `deleteEndedSessions`. Claim schema
  `ver` 2 with `sid` (runtime-validated; `ver` 1 still accepted).
  User-validated validation also checks the `sid` session, loading it in
  parallel with the user. `signOutEverywhere` revokes all sessions and reports
  `sessions.immediate`; it is now supported in stateless mode with refresh.
  `completeOAuth` gained an `issueKeycards` hook.
- **Postgres.** `thia.session` table and migration `0002_sessions`, in both
  the adapter and the demo app. `PostgresSessionRepository` uses
  single-statement operations: rotation is a compare-and-swap that ignores
  revoked rows.
- **Demo.** Login sets both cookies and records a coarse device label;
  `proxy.ts` handles renewal (grace, invalid tokens cleared once, 503 on an
  outage unless the access token is still valid); `/api/thia/refresh`;
  `/thia/devices` with per-device sign-out (`/api/thia/sessions/revoke`, same
  origin, own sessions only); logout revokes the current session;
  sign out everywhere clears both cookies; the home page explains every
  control and its latency in each mode.

### Verification (run 2026-09-27)

| Command | Outcome |
| --- | --- |
| Package builds (core, authz, adapters-drizzle) | Pass |
| `tsc --noEmit` in core, authz, adapters-drizzle, demo app | Pass (no errors) |
| `pnpm --filter @thia/core test` | 13 files, 256 tests pass (54 new) |
| `pnpm --filter @thia/authz test` | 45 tests pass, no type errors |
| `pnpm --filter @thia/adapters-drizzle test` (Docker Postgres 16) | 3 files, 35 tests pass (10 new) |
| `pnpm --filter thia-clean-builder-app test` | 7 files, 171 tests pass (36 new in `refresh.test.ts`) |
| Demo build with CI placeholder env | Pass; lists `ƒ Proxy (Middleware)`, `/thia/devices`, `/api/thia/refresh`, `/api/thia/sessions/revoke` |
| `eslint` in the demo | Not run: pre-existing ESLint plugin-resolution crash (see Sprint 001) |

Mutation check: removing the compare-and-swap conditions from
`PostgresSessionRepository.rotate` made four concurrency tests fail; the code
was restored.

Criterion 1: the Sprint 001 suites run with refresh off and pass. Two test
files changed only in setup: the harness defaults to
`THIA_SESSION_REFRESH=off` and its logout helper now sets the request
cookies. One test that calls `sessionPolicyFromEnv` directly now passes
`THIA_SESSION_REFRESH: "off"`, because the demo default intentionally
changed. No Sprint 001 assertion changed.

These tests use in-process fake providers and do not verify live providers.

**Live local check** (developer's `next dev` with `THIA_SESSION_TTL_SEC=120`,
Neon database, real GitHub login by the developer):

- Applied `0002_sessions` to Neon with `drizzle-kit migrate` (only that
  migration ran; it adds a table).
- Login created one session ("Chrome on macOS") and the home page showed the
  refresh policy.
- Loading a page inside the renewal window rotated the stored hash
  (`rotated_at` set), and the page rendered signed in.
- The devices page listed this browser (marked) and a second test session
  created with `startSession` against Neon. Revoking the test session through
  the revoke form's POST gave a 303, and its access token then returned 401
  on its next request.
- Refresh route: rotation returned 204 with both cookies. A replay of the old
  token within 30 s returned 204 with only an access cookie. A replay after
  58 s returned 401, cleared both cookies, and marked the session
  `reuse_detected`. The developer's own session was unaffected.
- Not established: the first automated click on a devices-page button did
  not submit the form (the database was unchanged). Submitting the same form
  from the page worked. The unstyled buttons (Tailwind reset) may explain it;
  a manual click by a person was not tested.

### Remaining limits

- Only one generation of refresh history is kept, so reuse of older tokens is
  refused but not detected.
- Stateless mode with refresh: revocation takes effect at the next renewal,
  within one access TTL.
- Sessions revoked or expired accumulate until the application schedules
  `deleteEndedSessions`.
- A login that loaded the user before a concurrent sign out everywhere gets a
  session that fails its first refresh (fail-closed, as in Sprint 001).
- Deferred as briefed: provider refresh tokens, "remember me", device
  fingerprinting, notifications, cross-user admin, bearer clients, runtime
  switching and a cleanup scheduler.
