# Design decisions

This document records why Thia takes a particular approach, the tradeoffs we
accept, and when to reconsider it. It describes intended design, not proof that
a feature has been implemented or security-reviewed.

Add a numbered entry for each significant decision. Record its date, status,
context, decision, consequences, implementation status, and revisit conditions.
Use Proposed, Accepted, or Superseded for decision status. Keep implementation
status separate. Preserve superseded entries and link to their replacements.

## ADR-001: Browser cookies for temporary OAuth transactions

- Date: 2026-09-26
- Status: Accepted
- Implementation: Pending. At the time of this entry, the active demo uses
  `InMemoryStateStore` in `apps/thia-clean-builder-app/thia.ts`.

### Context

An OAuth callback must be connected to the browser that started the login.
Process-local storage does not itself establish that connection and loses
transactions on restart. It also cannot serve callbacks handled by another
server instance.

A browser cookie can carry the temporary transaction across the provider
redirect. A signature proves the server created the cookie; comparing its state
with the callback state binds the callback to the browser holding that cookie.
A protected cookie is a credential, not a physical browser identity: copying
the cookie copies that credential.

### Decision

Use short-lived, protected browser cookies together with state validation and
PKCE. Do not require PostgreSQL or Redis for temporary OAuth transaction storage.
This decision does not change persistent user or role storage.

The implementation must:

- Generate fresh, cryptographically random state for every attempt.
- Protect transaction contents against tampering and enforce expiry on the
  server, independently of browser cookie expiry.
- Retain the expected provider, configured callback URI, and PKCE verifier.
- Validate the cookie, returned state, and provider before exchanging the code.
- Use HttpOnly, Secure in production, host-only scope, and SameSite=Lax for the
  current GET callback flow. Reassess SameSite if callback transport changes.
- Clear the relevant cookie when an attempt ends without disturbing unrelated
  attempts.
- Keep HTTP cookie handling outside the framework-independent core.
- Work across instances sharing the required cryptographic configuration.

Authenticated encryption using a maintained library is the proposed cookie
encoding, so the verifier and other transaction details are confidential as
well as protected against modification. A signed JWT alone is not encrypted.
The precise encoding, key configuration, lifetime, and bounded handling of
concurrent login attempts must be finalized and documented during implementation.

### Consequences

Benefits include no transaction database dependency and no reliance on a
particular running server process. Costs include cookie size limits, key
management, and deliberate handling of multiple tabs or overlapping logins.

Deleting a cookie does not provide atomic one-time consumption. Concurrent
requests or a copied cookie may pass cookie validation more than once. Provider
authorization codes are single-use, and PKCE protects their exchange, but Thia
must not describe its cookie transaction as an atomically consumed server record.
The existing `AuthStateStore.consume()` contract must therefore be reconsidered.

A shared database record could add atomic consumption or server-side
cancellation, but would still require browser binding. Neither storage approach
alone prevents an attacker holding all required credentials from using them
first.

### Revisit when

We need server-side cancellation of pending logins, strict atomic consumption,
or transaction data that is unsuitable for cookies.

## ADR-002: Require S256 PKCE for OAuth authorization-code providers

- Date: 2026-09-26
- Status: Proposed recommendation; confirmation required before treating this
  as a permanent provider compatibility policy.
- Implementation: Pending. The inspected `beginOAuth` flow does not yet wire
  a PKCE verifier and challenge through the provider exchange.

### Context

PKCE connects an authorization-code exchange to the original authorization
request. Thia creates a random verifier and sends its SHA-256-derived challenge
to the provider. At token exchange, the provider requires the matching verifier.
An intercepted code alone is insufficient to complete that exchange.

State comparison and PKCE have complementary roles. State binds the callback
to the browser's transaction; PKCE binds code redemption to the verifier from
the original request. PKCE does not replace client authentication where the
provider requires it.

### Decision

Cookie-based OAuth with PKCE is accepted. The recommended initial compatibility
policy is to require S256 PKCE for all OAuth authorization-code adapters:

- Generate the verifier and S256 challenge centrally using RFC 7636 encoding
  and randomness requirements.
- Require adapters to transmit the challenge during authorization and the
  verifier during token exchange.
- Verify support for the provider's actual endpoints and client type using
  official documentation and appropriate integration verification.
- Never silently downgrade to plain PKCE or retry without PKCE.
- Do not equate acceptance of PKCE parameters with enforcement. A provider
  compatibility check should establish rejection of a missing or wrong verifier
  for a code issued with a challenge.

This policy is scoped to authorization-code adapters, not unrelated OAuth flows
such as client credentials. A legacy exception, if ever needed, requires a new
explicit decision and assessment of alternative protections.

### Consequences

A uniform flow reduces implementation and testing combinations and provides a
clear security baseline. Providers without suitable support would be excluded.
Lack of PKCE does not prove every possible confidential-client integration is
unsafe; supporting one would introduce a separate security design.

### Revisit when

A concrete required provider cannot support S256 for the intended integration.
Do not add fallback behavior merely for hypothetical future compatibility.

## Verification expectations

Implementation of these decisions should include:

- The RFC 7636 S256 test vector and fresh values across separate attempts.
- Provider request tests for challenge and verifier propagation.
- Cookie expiry, tampering, wrong-key, and malformed-payload rejection.
- State/provider mismatch and missing-cookie rejection before token exchange.
- Success, cancellation, failure cleanup, and concurrent-attempt behavior.
- Completion in a fresh instance with shared keys and no shared process memory.
- Regression tests for verified-email account linking and persisted roles.

Mocked tests establish local behavior, not live provider enforcement. Record
manual or live verification separately, along with any unverified assumptions.
Never log codes, verifiers, tokens, secrets, or transaction cookie contents.

## References

- [RFC 7636: PKCE, including the S256 example](https://www.rfc-editor.org/rfc/rfc7636.html)
- [RFC 9700: OAuth security best current practice](https://www.rfc-editor.org/rfc/rfc9700.html)
- [GitHub OAuth app authorization](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)

Provider capabilities can change. Recheck official documentation when adding or
updating an adapter rather than treating this document as a provider support matrix.
