# ADR-001: Browser cookies for temporary OAuth transactions

- Date: 2026-09-26
- Status: Accepted
- Implementation: Cookie/PKCE implementation merged in `23af2b3` (feature
  commit `55a7b21`). This record is not a live-provider verification report.

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

Authenticated encryption using the jose library is the implemented cookie
encoding, so the verifier and other transaction details are confidential as
well as protected against modification. A signed JWT alone is not encrypted.
See the active demo configuration and cookie helpers for key configuration,
lifetime, and bounded handling of concurrent attempts.

### Consequences

Benefits include no transaction database dependency and no reliance on a
particular running server process. Costs include cookie size limits, key
management, and deliberate handling of multiple tabs or overlapping logins.

Deleting a cookie does not provide atomic one-time consumption. Concurrent
requests or a copied cookie may pass cookie validation more than once. Provider
authorization codes are single-use, and PKCE protects their exchange, but Thia
must not describe its cookie transaction as an atomically consumed server record.
The former `AuthStateStore.consume()` contract must not be reintroduced for
a cookie-only implementation as a promise of atomic consumption.

A shared database record could add atomic consumption or server-side
cancellation, but would still require browser binding. Neither storage approach
alone prevents an attacker holding all required credentials from using them
first.

### Revisit when

We need server-side cancellation of pending logins, strict atomic consumption,
or transaction data that is unsuitable for cookies.

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
