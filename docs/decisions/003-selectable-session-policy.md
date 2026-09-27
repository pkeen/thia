# ADR-003: Selectable JWT session policy, separate from authorization freshness

- Date: 2026-09-27
- Status: Accepted
- Implementation: Delivered by [Sprint 001](../sprints/001-session-policy.md)
  in `54b70a4`. Usage and migration guidance:
  [Session policies guide](../guides/session-policies.md).

### Context

Thia issues signed JWT session tokens. Before this decision the demo verified
the signature and then loaded the user, but there was no revocation. The
token's `uvn` claim carried the user's token version, but nothing compared it
with the stored value. The same checks were duplicated in each consumer, and
every failure became 401, including database outages.

Integrators want different behavior. Some want tokens that authenticate
without a database round trip. Others want deleted users and "sign out
everywhere" to take effect on the next request. These are different session
behaviors, not stronger and weaker security levels: token verification is the
same either way.

### Decision

Integrating applications choose a session policy in trusted developer
configuration: `{ mode, ttlSec }`.

- `jwt-stateless`: the verified token alone authenticates the request.
- `jwt-user-validated`: the token is verified the same way, then the user is
  loaded and the token's `uvn` must equal the stored token version.

Rules:

- Unknown modes and lifetimes outside 60–86400 whole seconds are rejected at
  startup. The policy never comes from a request or a token claim, and there is
  no option to disable signature, issuer, audience, expiry or claim-schema
  checks.
- Both modes share one framework-independent validator,
  `createSessionValidator`, with typed results: `authenticated`,
  `unauthenticated` (with a reason) or `unavailable`. A storage failure is
  `unavailable`. It must never fall back to stateless validation or be
  reported as signed out.
- Revocation ("sign out everywhere") is a core operation available only in
  `jwt-user-validated` mode. It reports `unsupported` otherwise. It always
  targets the validated session's own user and increments the stored version
  atomically. Repository saves must never write the token version of an
  existing user, so a stale snapshot cannot undo a revocation.
- **Authentication and authorization freshness are separate.** The session
  mode decides how the caller is authenticated, nothing more. Roles are always
  read from storage, in both modes, so role changes apply on the next check.
  Roles in the token are never trusted. A failed role lookup is an error and
  never grants the default role. Stateless mode therefore does not make a
  request database-free when the app authorizes or displays profiles.
- The active demo defaults to `jwt-user-validated` with a 30-minute lifetime,
  so it can offer working "sign out everywhere". `THIA_SESSION_MODE` and
  `THIA_SESSION_TTL_SEC` override the default.
- Stored per-session records are not offered or advertised. They remain
  deferred.

### Consequences

- User-validated mode costs one user query per validated request. The loaded
  user is returned with the session and reused, so there is no second query.
  If the database is unavailable, authenticated requests fail with 503 or an
  error page instead of degrading.
- Stateless mode has no per-request user query for authentication. Deleted
  users and revoked tokens stay valid until they expire (at most the configured
  TTL). Ordinary sign-out only removes the cookie from that browser.
- Switching from user-validated to stateless stops enforcing revocations, so a
  previously revoked token can become usable again before it expires.
  Switching the other way enforces the version check on existing tokens. To
  invalidate every existing token, rotate the signing key (`AUTH_SECRET`) on
  every instance at the same time.
- Without refresh tokens, the lifetime is the whole session, which is why the
  24-hour maximum applies.

### Revisit when

Consider revisiting if integrators need per-device sessions or revocation,
refresh tokens, inactivity timeouts, or runtime policy switching. A
stored-session mode would be a new decision. It must not be added silently
as a third mode.
