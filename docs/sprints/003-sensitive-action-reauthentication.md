# Sprint 003: Re-authentication for sensitive actions

Status: Draft
Created: 2026-10-25

This is a proposed brief for review, not an accepted decision or implemented
feature. Resolve the [design choices](#decisions-to-settle-before-implementation)
and record an accepted ADR-005 before changing authentication behavior. The
starting points below describe the current checkout, not promises about future
APIs.

## Outcome

Give an integrating application a way to require a recent, provider-backed
identity check before a high-impact action. A signed-in user starts a separate
re-authentication flow, returns to the same session, and then explicitly
submits the action again. A normal session or a refreshed access token alone
must not satisfy the sensitive-action check.

The demo should protect one representative action to exercise the full browser
flow. Applications mark each sensitive server action explicitly; this sprint
must not silently change every Thia operation. Do not put a new obstacle in
front of an account-recovery action merely to provide a demo example.

The first delivery targets the active demo's session setup:
`jwt-user-validated` with refresh enabled. The re-authentication proof remains
valid for at most 10 minutes in the same stored device session. Support for
other session setups is separate follow-up work. An app that does not enable
this feature may continue to use any existing session policy.

## Starting context

- [ADR-001](../decisions/001-oauth-cookie-transactions.md) uses encrypted,
  browser-bound OAuth transactions with state and S256 PKCE. Cookie validation
  is not atomic one-time consumption.
- [ADR-003](../decisions/003-selectable-session-policy.md) defines stateless
  and user-validated access-token checks. [ADR-004](../decisions/004-refresh-token-rotation.md)
  adds optional stored sessions, `sid` in `ver` 2 claims, refresh rotation and
  per-device revocation. Refresh is not evidence of a new identity check.
- `packages/core/src/application/use-cases/begin-oauth.ts` starts an ordinary
  login. `complete-oauth.ts` can create users or link an account by verified
  email. **Do not use that completion path for re-authentication.**
- `packages/core/src/application/ports/oauth-transaction-port.ts` and
  `application/oauth/transaction.ts` currently carry login state, provider,
  callback URI, PKCE verifier, nonce and return path. They do not distinguish
  login from re-authentication or bind a transaction to a current session.
- `packages/core/src/infra/oath/google.ts` verifies Google's ID token but
  does not validate `auth_time`. The GitHub adapter returns provider account
  identity without an OIDC authentication-time claim.
- The active demo's OAuth routes are under `apps/thia-clean-builder-app/app/api/thia/`.
  It has a same-origin check for mutating POSTs and, with refresh enabled, a
  stored-session repository and an access/refresh cookie pair.

## Threat and assurance boundary

The control is meant to stop someone with an older copy of a Thia session
credential from immediately performing a high-impact action. It does not make
ordinary reads unavailable to that person while their credential remains
valid. It cannot reliably distinguish the legitimate user from an attacker
who also has the provider's browser session and the newly issued proof.

The proposed default is a **new provider visit that confirms the same linked
account**. The provider may use its existing browser session, so this might
be as simple as selecting a Google account. It must not be described as a new
password, passkey or factor check. The provider controls which screens appear;
Thia cannot promise an account picker on every visit.

Some applications may need stronger evidence that the provider authenticated
the person recently. An OIDC `auth_time` could support that only when the
provider supplies and enforces it. Treat that as a separate, opt-in extension
after live-provider verification, not as the ordinary Sprint 003 experience.
An app needing that stronger check must not silently accept the simpler one.

## Proposed scope

### Separate transaction and callback

- Start only from a currently validated Thia session. Use a state-changing,
  same-origin initiation request; do not take a target user or arbitrary
  callback URI from request data.
- Give the encrypted OAuth transaction an explicit re-authentication intent,
  current user id, current stored-session id, safe return path and short
  expiry. Preserve state, S256 PKCE, nonce, provider and
  configured callback URI checks. Reject a login transaction on a re-auth
  callback and vice versa.
- At callback, validate the *current* Thia session again. Require the same
  user and session id named by the transaction, and an active stored session.
  Reject a missing, changed, revoked or expired session, even if the provider
  code exchange succeeded. Do not create or link users, change the signed-in
  user, or start another stored session.
- Look up the provider account by its stable provider id and account id.
  Accept only an account already linked to the current user. Matching email
  addresses are insufficient. Do not save provider tokens as part of this
  flow.
- Clear the re-auth transaction cookie after a terminal callback. Preserve
  unrelated concurrent login and re-auth attempts. Do not claim the cookie
  is atomically consumed; rely on the provider's one-use code and PKCE and
  assess any remaining replay path explicitly.

### Recent proof and guard

The application-facing contract should make the ordinary session check and
the additional recent-authentication check separate and visible at the action
that needs them. Proposed names below describe the intended shape; these
helpers do not exist yet:

```ts
// An ordinary private server action:
const session = await requireSession(request);
// Perform the action for session.identity.userId.

// A sensitive server action adds one check before changing anything:
const session = await requireSession(request);
await requireRecentAuthentication(session, request);
// Perform the sensitive action for session.identity.userId.
```

`requireSession` validates the normal Thia session or stops the request.
`requireRecentAuthentication` accepts that validated session, checks a proof
for the same user and session, and stops with a distinct re-authentication
required result when proof is missing. The browser then starts the provider
flow and the user submits the action again. A Next.js route handler or server
action calls these helpers inside its server function; a React Router server
action does the same. Client-side navigation and UI visibility are not the
security boundary. Neither helper is applied automatically to all routes.

Creating/enabling the recent-authentication guard must validate the configured
session policy. In this first version, reject `jwt-stateless` and refresh-off
policies with a clear configuration error during application setup (and demo
build), rather than issuing a warning or creating a no-op guard. If an
unsupported configuration somehow reaches a guarded request, fail closed:
never run the sensitive action. Other apps that do not enable this guard keep
their existing policy choices.

- After successful callback, issue a short-lived, non-renewable proof bound
  to the current user id and stored-session id. Measure its age from this
  completed provider confirmation, without claiming that the provider
  authenticated the person at that time. Use a separate cryptographic
  purpose and cookie from normal access and refresh credentials; validate
  its type, signature, audience, expiry and binding at every sensitive-action
  guard.
- The guard requires both a valid ordinary session and a matching recent
  proof. It checks the stored session is still active. An old access token
  with the same `sid` must not become fresh merely because a legitimate
  browser later re-authenticated.
- Use a 10-minute maximum proof lifetime, with a shorter per-action maximum
  where appropriate. Never extend it through normal access-token issuance or
  refresh, and never let it outlive the stored
  session's absolute expiry. Clear it on local or global sign-out and reject
  it after session revocation or a token-version change.
- Return typed results for valid, missing, expired, changed session and
  unavailable infrastructure. Database failure must not make a guarded
  action pass. Framework-specific redirects and cookies stay outside the core.

### Providers and demo

- For Google and GitHub, complete a new authorization-code flow and match
  the stable provider account id to an existing link on the current Thia
  user. Keep the existing Google ID-token verification, nonce and PKCE checks.
  Do not claim a fresh password or factor check from either redirect.
- In the demo, explain the provider visit in familiar terms without
  promising which provider screen will appear. After callback return to the
  action page; require a second click on the protected POST. Keep the
  existing same-origin check. Do not replay a
  saved POST body after a redirect.

## Decisions to settle before implementation

1. **Session coverage (settled for this sprint):** implement the first version
   for `jwt-user-validated` sessions with refresh on. Stateless sessions with
   refresh still have a device record but would need an explicit database check
   at the sensitive-action guard. Refresh-off sessions have no stored device
   record and need a different proof binding. Both are follow-up designs.
2. **Protected demo action:** choose a representative sensitive action that
   is not needed for account recovery. The initial demo accepts a fresh
   confirmation of the same linked provider account.
3. **Proof handling:** choose the exact cookie or server-side proof format,
   replay/consumption rules, expiry and key-rotation behaviour. A shared
   `authenticated_at` field on a session is insufficient by itself.
4. **Provider support:** check the actual Google and GitHub browser flows,
   including an already signed-in provider browser, before documenting what
   the user will see. A stronger OIDC `auth_time` mode is separate future work.
5. **Policy limits:** the proof lasts at most 10 minutes in the same stored
   device session. Define any shorter action-specific limit and clock
   tolerance in ADR-005.

## Acceptance criteria

1. A normal login, an access-token refresh, a session timestamp update and a
   rotated refresh token never mint or extend a re-auth proof.
2. A re-auth callback with missing, tampered, expired, wrong-intent or
   wrong-provider transaction, wrong state/nonce/PKCE, missing current
   session, different user or different `sid` cannot grant proof.
3. A provider account not already linked to the current user is refused,
   even when its email matches. The callback cannot create, link or switch
   users, or issue a new ordinary login session.
4. The guard rejects no proof, expired proof, wrong user/session, ended
   session and old token version. An older stolen access token cannot inherit
   proof created later in another browser.
5. Google tests retain ID-token issuer, audience and nonce checks; both
   providers' re-auth callbacks reject a different or unlinked account.
   Mocked flows are not presented as proof of live-provider behaviour.
6. The demo's protected POST rejects cross-origin and unauthenticated
   requests; after successful re-auth it requires a deliberate second POST.
   Cancellation and provider failure leave the original action unapplied.
   An ordinary private action remains protected by session validation without
   acquiring a re-authentication requirement.
7. Enabling the guard with `jwt-stateless` or refresh off fails during setup
   with a clear error; it never silently skips the check. Apps that do not
   enable the guard still accept their existing supported session policies.
   A guarded request also fails closed if configuration is invalid.
8. Verify the demo's `jwt-user-validated` plus refresh-on setup with unit and
   route tests, relevant Postgres integration tests, type checks, package
   builds and a demo build. Record commands, results and any unavailable
   infrastructure. Run a real provider/browser check of both linked-account
   confirmation flows before describing their user experience.
9. ADR-005, the feature guide, demo README and sprint index describe
   delivered behaviour, provider limits, configuration and verification.
   Mark this sprint Completed only after the delivery record is filled in.

## Outside this sprint

Do not add password or MFA handling to Thia, provider refresh-token storage,
cross-user admin actions, mobile or bearer-token clients, automatic replay of
protected mutations, or refresh-token reuse alerts. The last item belongs
with Sprint 002's reuse-detection work. Support for stateless or refresh-off
session policies is deferred until their sensitive-action guard and proof
binding are designed explicitly.

## References for implementation review

- [OpenID Connect Core 1.0, authentication request and `max_age`](https://openid.net/specs/openid-connect-core-1_0-18.html#AuthRequest)
- [Google OpenID Connect guidance](https://developers.google.com/identity/openid-connect/openid-connect)
- [GitHub OAuth app authorization](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/authorizing-oauth-apps)
