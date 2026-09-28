# Session policies

Thia session tokens are HS256 JWTs. How each request checks them is set by a
**session policy**, chosen by the application developer. Optionally, the
policy also enables stored per-device sessions renewed by rotating refresh
tokens. The decision records are
[ADR-003](../decisions/003-selectable-session-policy.md) (modes) and
[ADR-004](../decisions/004-refresh-token-rotation.md) (refresh).

## Configuration

```ts
import { defineSessionPolicy, createSessionValidator } from "@thia/core";

const policy = defineSessionPolicy({
	mode: "jwt-user-validated", // or "jwt-stateless"
	ttlSec: 30 * 60,            // whole seconds, 60 – 86400
});

const sessions = createSessionValidator({
	policy,
	verifier, // HmacTokenVerifier(secret, { issuer, audience })
	clock,
	users,    // required for jwt-user-validated; never called when stateless
});

const result = await sessions.validate(tokenFromCookie);
// { status: "authenticated", session }        -> signed in
// { status: "unauthenticated", reason }        -> treat as signed out (401)
// { status: "unavailable", reason, cause }     -> infrastructure failure (503 / error page)
```

`defineSessionPolicy` throws `SessionPolicyError` for an unknown mode or an
unsupported lifetime, so a misconfigured app fails at startup. Pass the same
`ttlSec` to token issuance (`completeOAuth`'s `ttlSec`). The demo sets the
session cookie's expiry from the token's expiry, so both lifetimes match.

Read the policy from trusted configuration only, never from request data or a
token claim.

### The demo app

`apps/thia-clean-builder-app` defaults to `jwt-user-validated` with refresh
on: 10-minute access tokens, renewed for up to 7 idle days and 30 days in
total. You can override any of it in `.env`:

```sh
THIA_SESSION_MODE=jwt-stateless          # or jwt-user-validated (default)
THIA_SESSION_REFRESH=off                 # or on (default)
THIA_SESSION_TTL_SEC=300                 # access token; 60–3600 with refresh (default 600),
                                         # 60–86400 without (default 1800)
THIA_SESSION_REFRESH_IDLE_SEC=86400      # 3600–2592000 (default 604800)
THIA_SESSION_REFRESH_ABSOLUTE_SEC=604800 # idle–7776000 (default 2592000)
```

Setting the refresh lifetimes while `THIA_SESSION_REFRESH=off` is an error,
not a silent no-op. With refresh on, the demo needs the `thia.session` table:
apply the app's migrations (`drizzle/migrations/0002_sessions.sql`).

Blank values mean "use the default". Anything else invalid stops the app, and
`next build`, with `INVALID_SESSION_POLICY`. Every instance of an app must use
the same policy and the same `AUTH_SECRET`.

## Behavior comparison

| | `jwt-stateless` | `jwt-user-validated` |
| --- | --- | --- |
| Signature (HS256 only), issuer, audience, expiry (5 s clock tolerance) | Checked | Checked |
| Runtime claim validation (`ver` = 1, `sub`, `uvn`, `usr.id` = `sub`, timestamps) | Checked | Checked |
| User query to authenticate | None | One per request, reused downstream |
| Deleted user | Still authenticated until expiry | Rejected on next request |
| "Sign out everywhere" | Unsupported; the demo hides it | Invalidates every existing token on the next request |
| Ordinary sign-out | Clears this browser's cookie only | Clears this browser's cookie only |
| Copied token after ordinary sign-out | Valid until expiry | Valid until expiry, or until "sign out everywhere" |
| Database down | Authentication works; role or profile reads fail (503 / error page) | Authentication fails closed (503 / error page), no stateless fallback |
| Role changes | Next check (roles are always read from storage) | Next check |

Authentication and authorization are separate. Even in stateless mode, the
demo reads current roles from the database on every authorization check, and
it loads the user's profile for display. Stateless mode removes the database
from authentication, not necessarily from the whole request. Roles inside the
token are never trusted. A failed role lookup is an error and never grants the
default `viewer` role.

In the demo, a valid stateless session whose user has been deleted is still
authenticated: `/api/thia/me` returns 404 `profile_not_found`, and the home
page shows "no profile found".

## Ordinary sign-out vs sign out everywhere

- **Sign out of this browser** (`POST /api/thia/logout`) deletes the session
  cookie in this browser. No server state changes. Other devices, and any
  copy of the token, stay valid until they expire.
- **Sign out everywhere** (`POST /api/thia/sign-out-everywhere`, user-validated
  mode only) atomically increments the user's stored token version. Every
  token issued before that carries the old `uvn` and is rejected the next
  time it is validated, on any device or instance. The browser's cookie is
  cleared only after the increment is stored. Signing in again issues a token
  with the new version.
  - The target user always comes from the validated session. The route
    ignores any user id in the request.
  - CSRF: the cookie is `SameSite=Lax`, and the route also requires `Origin`
    to equal the request's own origin, or, without `Origin`,
    `Sec-Fetch-Site: same-origin`. GET is not accepted. Behind a proxy that
    rewrites `Host`, this check fails closed (403) until forwarding is
    configured correctly.
  - Responses: 303 to `/?signed_out=everywhere` on success, 403
    `cross_origin_request`, 401 `unauthenticated`, 409
    `global_sign_out_unsupported` (stateless mode), 503
    `service_unavailable` (cookie kept).
  - It does **not** sign the user out of GitHub, Google or any other provider.

**Concurrency boundary.** Requests that were already authenticated before the
increment committed may finish. Any old-version token validated after the
increment is rejected. Concurrent revocations each count. A login that read
the user before a revocation committed may issue a token with the old
version; that token is rejected on first use, and the user signs in again.

**Storage requirement.** `UserRepository.save` must never write the token
version of an existing user, and `incrementTokenVersion` must be atomic. The
Postgres adapter uses a single `UPDATE … SET token_version = token_version + 1
RETURNING`, and its upsert leaves `token_version` alone. Both are covered by
integration tests against a real Postgres instance. Custom repositories must
meet the same contract.

## Refresh tokens and stored sessions

Add `refresh` to the policy to combine short access tokens with long
sign-ins:

```ts
const policy = defineSessionPolicy({
	mode: "jwt-user-validated",
	ttlSec: 10 * 60, // access token: 60–3600 s when refresh is on
	refresh: {
		idleTtlSec: 7 * 24 * 3600,      // ends if unused this long: 1 h–30 d
		absoluteTtlSec: 30 * 24 * 3600, // ends this long after sign-in: idle–90 d
	},
});
```

Without `refresh`, everything above applies unchanged and no session records
are written. With it:

- Each sign-in creates one **stored session** (a device) and sets two HttpOnly
  cookies: the access token, and a refresh token `<session id>.<secret>`. Only
  an HMAC of the secret is stored, keyed from `AUTH_SECRET`.
- **Renewal.** When the access token is missing or within 60 s of expiring,
  the demo's `proxy.ts` exchanges the refresh token before the page or route
  runs. Server components can't set cookies, so renewal can't happen there.
  Every renewal **rotates** the refresh token; each one works once. Client
  code can also call `POST /api/thia/refresh` (same-origin only).
- **Concurrent requests.** If two requests renew with the same refresh token,
  one rotates. For 10 seconds, the replaced token still gets a new access
  token (valid for at most 120 seconds), but not a new refresh token, so
  nobody is signed out by a race.
- **Reuse detection.** Presenting a replaced refresh token after those 10
  seconds is treated as theft and revokes that session. Only one generation
  of history is kept: an older token is refused, but doesn't revoke.
- **Expiry.** Each renewal slides the idle expiry forward, but never past the
  absolute expiry. The refresh cookie expires with the session.
- Integrators use `startSession` (or `completeOAuth`'s `issueKeycards`),
  `refreshSession`, `signOutSession`, `listUserSessions`, `revokeUserSession`
  and `deleteEndedSessions` from `@thia/core`, plus a `SessionRepository`:
  `PostgresSessionRepository` from `@thia/adapters-drizzle`, or
  `InMemorySessionRepo` for tests.

### Behavior with refresh

| | `jwt-stateless` + refresh | `jwt-user-validated` + refresh |
| --- | --- | --- |
| Database reads per request (authentication) | None | User and session, in parallel |
| Database write | One per renewal | One per renewal |
| Sign out of this browser | Revokes this session; a copied access token works until it expires (≤ access TTL) | Revokes this session; applies on the next request |
| Sign out one device (devices page) | Applies at that device's next renewal (≤ access TTL) | Applies on its next request |
| Sign out everywhere | Supported: all sessions revoked, other devices end within one access TTL | All sessions revoked, applies on the next request |
| Deleted user or version change | Next renewal fails | Next request fails |
| Database down | Requests with a valid access token work; renewal gives 503 | 503 / error page |

A failed renewal because the token is invalid, expired, revoked or reused
clears both cookies once, so there's no retry loop. An infrastructure failure
keeps the cookies and answers 503, unless the current access token is still
valid, in which case the request proceeds.

### Devices page

`/thia/devices` lists the user's active sessions (device label, sign-in time,
last activity, "this device") with a sign-out button for each one.
`POST /api/thia/sessions/revoke` (form field `session`) only accepts the
caller's own sessions. Anyone else's is answered exactly like a missing one
(404). It requires the same-origin check. Device labels come from the
User-Agent and are display-only.

### Cookies

The refresh cookie is `thia_refresh` over HTTP and `__Host-thia_refresh` in
production. It is HttpOnly, `Path=/` and `SameSite=Lax`. It has to reach page
requests so `proxy.ts` can renew during navigation; `SameSite=Strict` would
sign users out when they arrive from another site.

### Housekeeping

Revoked and expired sessions stay in the table until you delete them. Call
`deleteEndedSessions` (or `thia.deleteEndedSessions()` in the demo)
periodically, for example daily. It removes sessions that ended more than
7 days ago, which you can change with `retentionSec`. Thia doesn't schedule
it for you.

## Changing policy

These settings take effect when instances restart with the new values.

- **TTL change**: affects newly issued tokens only. Existing tokens keep their
  signed expiry, which is always capped at 24 hours.
- **Stateless → user-validated**: existing tokens are held to the version
  check straight away. Tokens whose `uvn` no longer matches the stored version
  are rejected, as are tokens for deleted users. Tokens that fail claim
  validation are rejected in both modes.
- **User-validated → stateless**: stored revocations stop being enforced. A
  token revoked by "sign out everywhere" that has not yet expired **becomes
  usable again**, as do tokens of deleted users.
- **Invalidating every existing token** (for example, before switching to
  stateless, or after a suspected leak): rotate `AUTH_SECRET` on every instance
  at the same time. Every old token fails signature verification. Pending OAuth
  logins also fail, because their cookies are encrypted with a key derived
  from the same secret, and every user must sign in again. Stored refresh
  tokens are keyed from the same secret, so they stop working too. Otherwise,
  wait one maximum TTL after the change.
- **Enabling refresh**: apply the session migration first. Existing tokens
  (claim `ver` 1, no session id) keep working, checked as before, until they
  expire. Users then sign in once and get a stored session.
- **Disabling refresh**: the refresh cookie is no longer used, sessions stop
  renewing, and session-bound access tokens (`ver` 2) are accepted until they
  expire, without checking their session. Session rows remain until you delete
  them.
- **Lowering refresh lifetimes**: existing sessions are capped straight away
  (their effective absolute expiry becomes sign-in time plus the new limit,
  and it is persisted at the next renewal). **Raising** them never extends
  existing sessions.
- **Revoking every session without rotating the key**: sign out everywhere
  does this for one user. For all users, delete or revoke the rows in
  `thia.session`.

## Limits and deferred work

- Without refresh, the access-token lifetime is the whole session.
- Reuse detection keeps one generation of history (see above).
- Thia doesn't use, store or refresh OAuth provider tokens (GitHub, Google).
- Deferred: "remember me" choices, device fingerprinting or geolocation,
  new-device notifications, admin management of other users' sessions,
  bearer-token (non-cookie) clients, runtime policy switching and a built-in
  cleanup scheduler.
