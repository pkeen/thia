# ADR-005: Recent linked-provider confirmation for selected actions

- Date: 2026-10-25
- Status: Accepted
- Implementation: Delivered by [Sprint 003](../sprints/003-sensitive-action-reauthentication.md)
  (2026-10-25). Tested with mocked providers; live Google and GitHub checks
  were only partly run (main flow and account mismatch, with an
  already-signed-in provider) and the rest waived - see the delivery record.
  Usage: [guide](../guides/sensitive-action-reauthentication.md).
- Related: [ADR-001](001-oauth-cookie-transactions.md) (OAuth transactions),
  [ADR-003](003-selectable-session-policy.md) (session validation), and
  [ADR-004](004-refresh-token-rotation.md) (stored device sessions).

### Context

Thia currently validates a signed-in session but cannot ask for another
provider check before an individual action. The user wants an app developer to
mark selected server actions explicitly, without making all requests repeat
OAuth. The expected experience is a quick visit to the linked provider,
possibly just selecting a Google account. That does not necessarily mean the
person entered a password or completed another factor.

### Decision

- The app checks an ordinary session for its private actions. A sensitive
  action adds a separate recent-confirmation guard at that server action.
  The guard is never an automatic blanket requirement for every route.
- A missing recent confirmation stops the action before any mutation. The
  browser starts a separate OAuth authorization-code flow, returns to the
  action page, and the user submits the action again. Thia never replays a
  saved POST after the redirect.
- The first version works with `jwt-user-validated` and refresh enabled.
  Enabling the guard under `jwt-stateless` or with refresh off is a clear
  application-setup error, not a warning or a no-op. If an invalid setup
  reaches a request, the guarded action fails closed. Apps not enabling this
  feature keep their existing session-policy choices.
- The OAuth transaction has a distinct re-authentication intent and is bound
  to the current Thia user and stored device session. At callback, require
  that same active session and an already linked provider account with the
  same stable provider account id. Do not use ordinary login completion:
  re-authentication must never create a user, link an account by email, or
  switch the current user or session. Keep state, S256 PKCE, nonce and
  configured callback-URI checks.
- A successful callback issues a separate, short-lived proof for the current
  user id, session id and token version. Its time is the completion of this
  provider confirmation, **not** a claim that the provider authenticated the
  person at that instant. Bind its signature to a separate cryptographic
  purpose from access tokens and OAuth transactions. The browser stores it
  in an HttpOnly cookie; the guard validates signature, purpose, audience,
  expiry and session binding. A shared timestamp on the stored session is
  insufficient because an older copied access token has the same session id.
- One confirmation may cover several selected actions in the same stored
  session for at most 10 minutes. Ordinary access-token issuance and refresh
  never create or extend it. It ends sooner when the stored session ends or
  its absolute lifetime ends. Local and global sign-out clear the browser's
  proof cookie; the guard also rejects proof for a revoked session or changed
  token version.
- This level means **same linked provider account confirmed again**. The
  provider may use an existing browser session and may or may not show an
  account picker. Thia does not claim a fresh password, passkey, MFA factor or
  verified provider authentication time. A stronger requirement must not
  silently accept this proof.

### Consequences

The extra check can stop an attacker who copied only an older Thia session
credential from immediately taking a selected action. It does not protect
ordinary actions that the app did not mark, and it cannot distinguish an
attacker who also obtained the provider's browser session and recent proof.
The proof is reusable inside its short window rather than atomically
single-use; copying both credentials during that window remains a risk.

The first version is intentionally narrower than the existing session-policy
matrix. Stateless sessions with refresh have a device record but would need a
database check at the sensitive-action guard. Refresh-off sessions need a
different per-sign-in binding. Those are follow-up designs, not silent
fallbacks. Thia-owned 2FA and provider-verified recent authentication (for
example, a validated OIDC `auth_time`) are separate future capabilities.

### Revisit when

An integrating app needs support for other session policies, one-time proof
consumption, a shorter per-action window, Thia-owned 2FA, or a provider-backed
claim that the person authenticated recently. Verify the provider's actual
response and user experience before offering a stronger assurance level.
