# Session policies

Thia session tokens are HS256 JWTs. How each request checks them is set by a
**session policy**, chosen by the application developer. The decision record
is [ADR-003](../decisions/003-selectable-session-policy.md).

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

`apps/thia-clean-builder-app` defaults to `jwt-user-validated` with 30
minutes. You can override it in `.env`:

```sh
THIA_SESSION_MODE=jwt-stateless   # or jwt-user-validated (default)
THIA_SESSION_TTL_SEC=900          # digits only, 60–86400 (default 1800)
```

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
  from the same secret, and every user must sign in again. Otherwise, wait one
  maximum TTL after the change.

## Limits and deferred work

Thia has no stored per-session records, device list, per-device revocation,
refresh tokens, automatic renewal, inactivity timeout or runtime policy
switching. The token lifetime is the whole session.
