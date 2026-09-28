# ADR-004: Opt-in refresh-token rotation with stored sessions

- Date: 2026-09-27
- Status: Accepted
- Implementation: Delivered by
  [Sprint 002](../sprints/002-refresh-token-rotation.md) (see its delivery
  record).
- Related: extends [ADR-003](003-selectable-session-policy.md). ADR-003's
  "Revisit when" anticipated this decision; its modes are unchanged.

### Context

Under ADR-003 the access token's lifetime is the whole session: users either
re-authenticate often or carry long-lived tokens. That makes per-device
sign-out, inactivity timeouts and renewal impossible. ADR-003 requires stored
sessions to be their own decision rather than a silent third mode.

### Decision

Refresh is an **optional capability of the existing session policy**, not a
new mode:

```ts
{ mode, ttlSec, refresh?: { idleTtlSec, absoluteTtlSec } }
```

Without `refresh`, behavior is exactly ADR-003's and no session records exist.
With it, `ttlSec` is the access-token lifetime (60–3600 s). `idleTtlSec` may be
1 h–30 d, and `absoluteTtlSec` from `idleTtlSec` up to 90 d. Invalid values
fail at startup. Refresh works with both modes and always requires a session
store.

**Session record.** One row per sign-in (per device): a random id, the user,
an HMAC of the current refresh secret and of the previous one, when it was
last rotated, the user's token version at creation, creation and last-use
times, idle and absolute expiry, revocation time and reason, and a coarse
device label.

**Refresh token.** `<session id>.<256-bit random secret>` in an HttpOnly
cookie. Only `HMAC-SHA256(k, secret)` is stored, where `k` is HKDF-derived from
`AUTH_SECRET` under a dedicated label. Rotating `AUTH_SECRET` therefore
invalidates refresh tokens as well as access tokens, and a leaked database
alone is not enough to test candidate tokens. Hashes are compared in constant
time.

**Rotation and reuse.**

- Every successful refresh rotates the secret with a compare-and-swap on the
  current hash, so a token can succeed at most once.
- Presenting the *previous* secret within a 30-second grace window of its
  rotation (a benign race: two tabs, or a page and its prefetch) returns a new
  short-lived access token only. It issues no refresh token, so the chain
  never forks, and nothing is revoked.
- Presenting the previous secret after the grace window is treated as reuse
  and revokes the session.
- A secret matching neither is refused without revocation, because it could
  be a forgery. Reuse of tokens older than the previous one is therefore not
  detected; only one generation of history is kept.

**Expiry.** A refresh fails once the session is idle-expired or past its
absolute expiry. On success the idle expiry slides forward but never past the
absolute expiry. If the configured limits are lowered, the effective absolute
expiry becomes the earlier of the stored value and `created_at` plus the new
limit, applied at validation and persisted at the next refresh. Lowering
therefore affects existing sessions; raising never extends them.

**Version link.** A refresh also fails if the user no longer exists or their
`token_version` differs from the one recorded on the session. Sign out
everywhere increments the version and revokes all of the user's sessions, so
a session created concurrently with it cannot survive.

**Access tokens.** Tokens from a refresh-enabled session carry `sid` under
claim schema `ver` 2. `ver` 1 tokens (no `sid`) remain valid until they expire,
checked as under ADR-003, so enabling refresh signs nobody out. When refresh
is disabled, `sid` is ignored and tokens expire normally.

**Revocation latency.**

- `jwt-user-validated`: validation also requires the `sid` session to be
  active and owned by the user, so per-device sign-out and sign out everywhere
  apply on the next request.
- `jwt-stateless`: requests never read sessions, so revocation takes effect at
  the next refresh, within one access TTL. With refresh enabled, sign out
  everywhere is supported in stateless mode but reported as not immediate.

**Failures.** An invalid refresh returns 401 and clears the session cookies.
An infrastructure failure returns 503 or the error page, keeps the cookies,
and never falls back to trusting an expired access token.

### Consequences

- Short access tokens can be combined with long sign-ins, and users get a
  device list, per-device sign-out and an inactivity timeout.
- Refresh needs a database in both modes, including stateless, and one write
  per refresh.
- The refresh cookie must reach page requests so renewal can happen during
  navigation. It is therefore `Path=/` and `SameSite=Lax`; `SameSite=Strict`
  would sign users out on arrival from another site. Over HTTPS it uses the
  `__Host-` prefix. Renewal runs where cookies can be set (in the demo,
  Next.js `proxy.ts`), never in server components.
- Keeping one generation of history limits reuse detection, as described
  above.
- Expired and revoked rows accumulate until an application-scheduled cleanup
  deletes them.

### Revisit when

Consider revisiting if integrators need bearer-token (non-cookie) clients,
full token-family history, "remember me" choices, or cross-user admin
session management.
