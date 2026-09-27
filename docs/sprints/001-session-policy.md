# Sprint 001: Configurable JWT session policies

Status: Completed
Created: 2026-09-26
Completed: 2026-09-27

Delivery, verification and remaining limits are recorded in
[Delivery record](#delivery-record) at the end of this brief. The original brief
below is unchanged.

## Outcome

Let integrating applications choose between stateless JWT validation and JWT
validation against the current user. Default the active demo to user validation,
and provide a working, tested "sign out everywhere" operation in that mode.

Treat these as different session behaviors, not security levels. Mandatory token
and OAuth protections remain enabled in every mode.

## Starting context

Inspect repository instructions and current code before implementation. Preserve
unrelated changes and existing cookie/PKCE, account-linking, and persisted-role
behavior. Work in the current packages, not deprecated implementations.

Relevant starting points:

- `packages/core/src/application/claims/auth-claims.ts`: `uvn` already carries
  the user's token version.
- `packages/core/src/domain/entities/user.ts`: stored token version and its
  increment operation.
- `packages/core/src/infra/jwt/hmac-signer.ts`: JWT signing and verification.
- `packages/adapters/drizzle-adapter/src/user-repository.ts`: user persistence.
- `apps/thia-clean-builder-app/thia.ts`: application composition and token TTL.
- `apps/thia-clean-builder-app/authz.ts`: current user and role lookup.
- `apps/thia-clean-builder-app/app/api/thia/me/route.ts`: duplicated session checks.
- `apps/thia-clean-builder-app/app/api/thia/logout/route.ts`: local cookie removal.

These pointers describe the sprint's starting snapshot, not guaranteed future
APIs. Confirm them before making changes.

## Scope and policy contract

Introduce typed developer configuration. Suggested shape; refine naming to fit
the existing API without changing the intended semantics:

```ts
type SessionPolicy = {
  mode: "jwt-stateless" | "jwt-user-validated";
  ttlSec: number;
};
```

- Default the demo to `jwt-user-validated` and preserve its current 30-minute TTL.
- Require a positive, finite integer lifetime within a documented supported
  range. Reject invalid configuration at startup.
- Apply the configured lifetime consistently to issued tokens and session cookies.
- Select policy from trusted application configuration, never request parameters
  or an untrusted token claim.
- Keep framework HTTP handling outside the core.
- Reject unknown modes. Do not advertise unimplemented stored-session support.

### Stateless JWT mode

Verify the token cryptographically and validate required claims without a user
or session database lookup. Return a clearly typed authenticated identity derived
from verified claims, without pretending it is a freshly loaded user record.

Document that deleted users and globally revoked tokens may remain authenticated
until token expiry in this mode. Local sign-out removes the browser cookie; it
does not invalidate copied tokens. Do not expose a successful global-sign-out
operation where the selected mode cannot enforce it.

### JWT with user validation

Perform the same token verification, load the current user, and require the
token's `uvn` to equal the stored token version. Reject missing users and version
mismatches. Reuse that loaded user downstream to avoid redundant user queries.

Database failure must never trigger fallback to stateless validation. Distinguish
invalid credentials from unavailable infrastructure internally, and map failures
to appropriate sanitized HTTP responses rather than treating every error as 401.

## Mandatory validation in both modes

- Verify the signature using the configured algorithm allowlist, issuer, and
  audience, and enforce expiry.
- Validate required claim presence, types, and supported claim schema version
  at runtime. TypeScript casts are not payload validation.
- Require a valid subject and a valid nonnegative integer user token version.
  Validate any identity fields consumed downstream and reject inconsistent IDs.
- Define reasonable timestamp validation and clock tolerance explicitly.
- Do not accidentally introduce configurable switches that disable these checks.
- Preserve OAuth cookie validation, S256 PKCE, provider validation, and the
  existing verified-email linking policy.

## Shared session validation

Create one framework-independent validation entry point with explicit dependencies
and typed results. Have the demo's protected pages, authorization subject loader,
and API routes use it consistently.

Keep authentication separate from authorization. Stateless session verification
can still be followed by a current database role lookup or profile fetch. Document
that the demo may therefore still use the database in stateless mode; do not claim
the entire request becomes database-free.

Preserve persisted-role behavior and next-request visibility of role changes.
Do not start trusting stale token roles merely because session mode is stateless.
Do not automatically grant default roles when a role lookup fails.

## Sign out everywhere

Add a core operation and a protected demo POST action/route that invalidates all
previous tokens for the authenticated user in user-validated mode.

- Derive the target user from the validated session, not a submitted user ID.
- Increment the persisted version atomically and clear the current browser's
  session cookie only after successful revocation.
- Protect the mutation against CSRF using the application's established
  approach; add an explicit same-origin check or suitable CSRF mechanism if
  none exists. Do not use GET for mutations.
- Ensure version increments cannot be lost or overwritten by concurrent logins
  or ordinary user saves. Inspect the existing repository upsert, which may write
  tokenVersion from a stale user snapshot. An atomic increment alone is not
  sufficient if a later save can reset it. Add an appropriate repository operation
  and concurrency protection, with corresponding in-memory/test implementations.
- Define the concurrency boundary: requests already authenticated may finish;
  subsequently validated old-version tokens fail. A login using the new version
  can succeed normally.
- Return a clear unsupported result in stateless mode; hide or disable the demo
  control there. Do not imply this signs the user out of Google or GitHub.
- Keep ordinary sign-out as this-browser cookie removal and explain the difference
  in the demo UI.

## Configuration changes

These are developer settings, not runtime admin controls in this sprint.
Document how changes affect existing tokens:

- A TTL change affects newly issued tokens, not existing signed expiry values.
- Switching to user validation subjects existing compatible JWTs to the version
  check; incompatible tokens must be rejected deliberately.
- Switching to stateless mode stops enforcing stored revocation versions and can
  make an otherwise-valid, previously revoked token usable again. Document this
  clearly and provide a migration procedure that invalidates old tokens when
  required, such as coordinated signing-key rotation.
- All instances of the same application should use consistent policy and keys.

## Tests and acceptance criteria

Use existing test conventions and test actual observable behavior:

1. Both modes reject invalid signatures, wrong issuer/audience, expired tokens,
   missing required claims, malformed versions, and unsupported schema versions.
2. Stateless validation succeeds without calling a user/session repository.
3. User validation rejects deleted users and mismatched versions; a valid request
   loads the user once and reuses it where appropriate.
4. Database outages fail closed without stateless fallback or accidental role grants.
5. Global sign-out invalidates multiple existing tokens on their next validation;
   a new login after revocation works. Stateless mode reports the operation as
   unsupported instead of silently claiming success.
6. Ordinary sign-out clears the local cookie without changing other sessions.
7. Unauthorized and cross-origin revocation requests cannot mutate another user's
   version. An authenticated caller cannot select an arbitrary target user.
8. PostgreSQL integration tests demonstrate that concurrent revocations and stale
   user saves cannot undo a revocation or lose increments.
9. Pages and APIs agree on session validity and preserve correct 401/403 behavior.
10. Role changes remain effective on the next authorization check in both modes.
11. Configured TTL reaches both token expiry and cookie expiry; invalid policy
    configuration fails early.
12. Existing OAuth cookie/PKCE and verified-email account-linking tests still pass.

Run relevant unit and integration suites, type checks, package builds, and the
demo build. Report commands and outcomes, including checks blocked by missing
infrastructure. Do not represent mocked tests as live-provider verification.

## Documentation and delivery

- Add configuration examples and a behavior comparison to the active documentation.
- Add the next numbered accepted decision under `docs/decisions/` for selectable developer
  session policy, the demo default, and separation from authorization freshness.
- Explain revocation limits, ordinary versus global sign-out, infrastructure
  requirements, and policy migration behavior.
- Deliver a usable demo control and verified end-to-end local behavior, not only
  library interfaces. Summarize implementation, validation, and remaining limits.

## Explicitly deferred

Individual stored sessions, device lists, per-device revocation, refresh tokens,
automatic renewal, inactivity timeouts, runtime admin policy switches, and broad
account-management features. Do not add speculative infrastructure for these.

## Delivery record

Completed 2026-09-27 in `54b70a4`. Decision:
[ADR-003](../decisions/003-selectable-session-policy.md). Usage guide:
[Session policies](../guides/session-policies.md).

### Delivered

- **Policy.** `SessionPolicy`, `defineSessionPolicy` and `SessionPolicyError`
  in `@thia/core` (`application/session/session-policy.ts`). The lifetime
  must be a whole number of seconds from 60 to 86400. Unknown modes are
  rejected. The demo defaults to `jwt-user-validated` for 1800 s, with
  optional `THIA_SESSION_MODE` / `THIA_SESSION_TTL_SEC` overrides in
  `thia.ts`. Invalid values stop both startup and `next build`.
- **Mandatory validation.** `HmacTokenVerifier` now requires an issuer and an
  audience, allows only HS256, and applies a 5 s clock tolerance. Library
  errors become `InvalidSessionTokenError` with a reason code. Runtime claim
  validation (`parseAuthClaims`, zod) checks `ver` = 1, a well-formed `sub`,
  non-negative integer `uvn`/`pvn`, `usr.id` = `sub`, `iat` not in the future,
  and a lifetime of at most 24 h.
- **Shared validator.** `createSessionValidator` returns typed
  `authenticated` / `unauthenticated(reason)` / `unavailable(reason, cause)`
  results. Stateless mode never calls the repository. User-validated mode loads
  the user once and returns it with the session. The demo's pages, `getSubject`,
  `/api/thia/me` and the new route all use it through `current-session.ts`
  (memoized per render). Infrastructure failures give 503 or the error page,
  not 401.
- **Authorization kept separate.** `Subject` is now `{ id, roles }`. Roles are
  read from storage in both modes, and a failed role lookup throws
  (`AuthUnavailableError`) instead of returning null or the default role. The
  admin page logs the user id instead of the email.
- **Sign out everywhere.** `signOutEverywhere` use case, plus
  `UserRepository.incrementTokenVersion` (atomic `UPDATE … + 1 RETURNING` in
  Postgres, and in the in-memory repo). The Postgres and in-memory `save` no
  longer write the token version of an existing user.
  `User.bumpTokenVersion()` was removed. The in-memory repository now stores
  snapshots, like a database. New `POST /api/thia/sign-out-everywhere` route:
  same-origin check (`Origin`, or `Sec-Fetch-Site: same-origin`), the target
  comes from the session, and the cookie is cleared only after a successful
  revocation. Responses: 303 / 401 / 403 / 409 (stateless) / 503.
- **Demo UI.** The home page shows the active policy and explains "Sign out of
  this browser" and "Sign out everywhere", including that the latter does not
  sign the user out of GitHub or Google. In stateless mode the control is
  hidden with an explanation, and a confirmation banner is shown after
  revocation.
- **Tests.** The demo's end-to-end harness moved to
  `apps/thia-clean-builder-app/__tests__/support/app-harness.ts`. New
  `session-policy.test.ts` (real tokens, routes and pages), plus updated
  route, page and authz tests. Core has new policy and validator tests.
  Postgres token-version concurrency tests were added to
  `user-repo.int.test.ts`.

### Verification (run 2026-09-26/27)

| Command | Outcome |
| --- | --- |
| `pnpm --filter @thia/core --filter @thia/authz --filter @thia/adapters-drizzle build` | Pass |
| `tsc --noEmit` in core, authz, adapters-drizzle, demo app | Pass (no errors) |
| `pnpm --filter @thia/core test` | 12 files, 202 tests pass |
| `pnpm --filter @thia/authz test` | 5 files, 45 tests pass, no type errors |
| `pnpm --filter @thia/adapters-drizzle test` (Docker Postgres 16 via testcontainers) | 2 files, 25 tests pass |
| `pnpm --filter thia-clean-builder-app test` | 6 files, 135 tests pass |
| `pnpm --filter thia-clean-builder-app build` with CI placeholder env | Pass; the new route is listed |
| Same build with `THIA_SESSION_MODE=database` | Fails early with `INVALID_SESSION_POLICY` (intended) |
| `eslint` in the demo app | Not run successfully: ESLint crashes resolving `@typescript-eslint/eslint-plugin` (pre-existing environment issue, not run in CI) |

Mutation check: when `save()` was changed back to writing `token_version`,
the stale-save and interleaving Postgres tests failed as expected, and the fix
was restored.

Acceptance criteria coverage: (1) core `validate-session.test.ts` runs every
rejection case in both modes. (2)–(5) core validator and use-case tests, plus
the demo `session-policy.test.ts`. (6) Ordinary sign-out in both modes. (7) The
route rejects cross-origin, `Origin: null`, header-less and unauthenticated
requests, and ignores a user id in the query or body. (8) Postgres integration
tests: 25 concurrent increments with distinct results, a stale save after
revocation, a revocation blocked on an open save transaction, and interleaved
saves and revocations. (9) Pages and APIs agree across valid, missing, forged
and wrong-key tokens in both modes. (10) Role grants and revocations apply on
the next check in both modes. (11) The TTL reaches token and cookie expiry for
several values; invalid configuration fails at startup and build. (12) All
existing OAuth cookie, PKCE and account-linking tests still pass.

These tests use in-process fake providers and do not verify live providers.

**Live local check** (developer's `next dev` on localhost:3000, Neon database,
real GitHub login by the developer):

- The home page showed "Session policy: user-validated JWT, 30 min" and both
  sign-out controls with their explanations.
- A browser session left idle for more than 30 minutes was treated as signed
  out by both the home page and `/api/thia/me`, with `token_version` still 0.
  The cookie had expired as configured.
- A second-device token (signed locally with the app's `AUTH_SECRET` at the
  stored version) returned 200 from `/api/thia/me`. Revocation POSTs with
  `Origin: https://evil.example` and with no origin headers returned 403. A
  GET returned 405, and the token still worked afterwards.
- After the developer signed in again and clicked **Sign out everywhere**, the
  stored `token_version` was 1 and the second-device token returned 401. A
  token at the new version returned 200, and the home page offered the
  control again.
- Not observed directly by the agent: the browser's redirect banner and a
  real re-login after revocation. The browser tab had been closed. Both are
  covered by automated tests.

### Remaining limits

- Stateless mode cannot revoke tokens before they expire or reject deleted
  users. Switching to it re-enables revoked, unexpired tokens; rotate
  `AUTH_SECRET` to prevent that.
- A login that read the user before a concurrent revocation committed may
  issue an old-version token, which is rejected on first use.
- The same-origin check relies on `request.url` matching the public origin.
  Behind a Host-rewriting proxy it fails closed.
- Deferred as briefed: stored sessions, device lists, per-device revocation,
  refresh tokens, renewal, inactivity timeouts and runtime policy switching.
