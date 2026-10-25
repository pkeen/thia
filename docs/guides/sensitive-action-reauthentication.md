# Sensitive-action re-authentication

Lets an app require a **recent confirmation with the user's linked provider
account** before selected server actions ([ADR-005](../decisions/005-sensitive-action-provider-confirmation.md),
[Sprint 003](../sprints/003-sensitive-action-reauthentication.md)).

> Status: delivered. Tested with mocked providers, plus a partial manual check
> by the developer with the provider already signed in: Google showed its usual
> account chooser, GitHub returned with no visible screen, and a different
> account was refused. Not checked live: a signed-out provider (password or
> other prompts are unknown), cancelling, expiry, sign-out and proof copying.
> The provider decides what appears; Thia can promise neither a chooser nor a
> password prompt.

## What it is and isn't

- It is a new OAuth authorization-code visit that must return the provider
  account **already linked to the signed-in user**, in the same stored device
  session. It then issues a signed proof valid for at most 10 minutes.
- It is not a new password, passkey or MFA check, and Thia does not claim the
  provider authenticated the person at that moment (no `auth_time`).
- It stops someone holding an older copy of a Thia session credential from
  immediately doing a marked action. It does not protect unmarked actions and
  cannot tell apart an attacker who has the provider's browser session and the
  new proof cookie. The proof is reusable inside its window.

## Supported configuration

Only `jwt-user-validated` sessions with refresh on. Enabling the guard with
`jwt-stateless` or refresh off throws `ReauthConfigurationError` when the app
is set up (in the demo: at startup and in `next build`). A guarded request that
somehow runs under an unsupported setup returns `unavailable` and the action
does not run. Apps that never create the guard keep any session policy.

## Using it

Core (`@thia/core`), framework-free:

```ts
const proofs = new JoseReauthProofCodec(AUTH_SECRET, { maxLifetimeSec: REAUTH_MAX_AGE_SEC });
const recentAuth = createRecentAuthentication({ policy, sessions, proofs, clock });

// Start: bound to the validated session's user and sid.
const { authorizationUrl, transaction } =
  await beginReauthentication({ registry, clock }, { provider, redirectUri, returnTo, session });

// Callback (never completeOAuth):
const result = await completeReauthentication(
  { registry, users, clock, validator, recentAuth },
  { provider, code, state, transaction, sessionToken });
// confirmed (set the proof cookie) | refused (session_changed | account_not_linked) | unavailable

// At the sensitive action:
const check = await recentAuth.check(session, proofCookieValue);
// valid | missing | expired | session_changed | unavailable
```

The app owns cookies, redirects and where the sensitive action lives. In the
demo (`require-auth.ts`):

```ts
const session = await requireSession(request);
await requireRecentAuthentication(session, request, { redirectTo: "/thia/profile" });
// change things for session.identity.userId
```

Neither helper runs automatically on any route. Client-side navigation and UI
visibility are not the security boundary.

## Proof rules

- Cookie `thia_reauth` (`__Host-thia_reauth` in production), HttpOnly,
  SameSite=Lax, Secure in production. Expires with the proof.
- Signed with a key HKDF-derived from `AUTH_SECRET` with a purpose of its own,
  `typ` `thia-reauth-proof+jwt`, audience `thia:reauth-proof`; claims are user
  id, `sid`, token version, issued-at and expiry. An access or refresh token or
  an OAuth transaction is never accepted as a proof.
- Created only by a completed re-authentication callback. Login, access-token
  issuance, refresh and rotation never create or extend it.
- Never outlives the stored session's absolute (or idle) expiry. Rejected after
  the session is revoked or the user's token version changes. Cleared on
  sign-out, sign out everywhere, a failed refresh and a new login.
- It lives in the browser, not on the stored session, so an older copy of the
  access token (same `sid`) does not gain freshness when the real browser
  re-authenticates.

## Callback safety

The transaction carries `intent: "reauth"` plus the user id and `sid`. The
shared callback route chooses the flow from it, and each core use case rejects
the other intent. At the callback the current session is validated again
(before and after the code exchange) and must be the same user and `sid`. The
account is matched by provider and stable account id only; an email match is
not enough. No user is created or linked, no login session is started, no
provider tokens are stored. State, S256 PKCE, nonce and the configured callback
URI checks are unchanged (Google's ID-token issuer, audience and nonce checks
too). The transaction cookie is cleared after a terminal callback but, as in
[ADR-001](../decisions/001-oauth-cookie-transactions.md), not atomically
consumed.

## Demo behaviour

`/thia/profile` shows the display name and a form. Submitting without a proof
changes nothing and returns with a prompt. After confirming at the provider
the page says nothing was changed yet; the user submits again. Cancelling,
provider failure, a different or unlinked account, or an ended session leave
the name unchanged (`?reauth=cancelled|failed|account_mismatch|unavailable`).
Display-name change is a demonstration choice, not a claim that names are
always sensitive. `THIA_REAUTH=off` removes it.

## Not supported yet

OIDC `auth_time`/stronger assurance (an app needing it must not accept this
proof), Thia-owned 2FA, stateless and refresh-off sessions, one-time proof
consumption, per-action windows, automatic replay of the original POST.
