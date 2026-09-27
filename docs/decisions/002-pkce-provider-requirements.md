# ADR-002: Require S256 PKCE for OAuth authorization-code providers

- Date: 2026-09-26
- Status: Proposed recommendation; confirmation required before treating this
  as a permanent provider compatibility policy.
- Implementation: Cookie/PKCE implementation merged in `23af2b3` (feature
  commit `55a7b21`). Implementation of PKCE does not by itself settle the proposed
  blanket compatibility policy or prove live-provider enforcement.

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
