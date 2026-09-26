# thia-clean-builder-app

Demo Next.js app for `@thia/core`: GitHub and Google sign-in, a signed session
cookie, and role-based authorization with roles stored in Postgres.

## Setup

```bash
pnpm install
pnpm --filter @thia/core --filter @thia/authz --filter @thia/adapters-drizzle build
pnpm --filter thia-clean-builder-app dev   # http://localhost:3000
```

### Environment (`.env`)

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres (Neon) connection string. |
| `AUTH_SECRET` | **Required, ≥ 32 bytes**, e.g. `openssl rand -base64 32`. Signs session tokens and, via a separate HKDF-derived key, encrypts OAuth transaction cookies. The app refuses to start without it. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | From a GitHub OAuth App. |
| `GITHUB_REDIRECT_URI` | e.g. `http://localhost:3000/api/thia/redirect/github`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From a Google OAuth client of type "Web application". |
| `GOOGLE_REDIRECT_URI` | e.g. `http://localhost:3000/api/thia/redirect/google`. |

Provider callback configuration must match exactly:

- **GitHub** (Settings → Developer settings → OAuth Apps): *Authorization
  callback URL* = `GITHUB_REDIRECT_URI`.
- **Google** (Cloud Console → APIs & Services → Credentials): *Authorized
  redirect URIs* includes `GOOGLE_REDIRECT_URI`.

Callback URIs must be `https://`, except `http://localhost`, `127.0.0.1` or
`[::1]` for local development. Open the app on the same host as the callback
(`localhost` vs `127.0.0.1` are different cookie hosts, and the login would
fail with `invalid_transaction`).

### Running several instances

Nothing about a login in progress is kept in server memory or a database, so
any instance can finish a login another started, including after a restart
or deploy, **provided every instance has the same `AUTH_SECRET` and provider
configuration**. Rotating `AUTH_SECRET` signs everyone out and fails any
login started under the old secret (the user just starts again).

## How OAuth login works

1. `GET /api/thia/login/{provider}[?returnTo=/path]` creates a fresh random
   `state`, a PKCE code verifier (RFC 7636, 43 chars, 256 bits) and, for
   Google, an OIDC `nonce`. The provider gets `state`, `code_challenge` =
   BASE64URL(SHA-256(verifier)) with `code_challenge_method=S256`, and the
   configured `redirect_uri`. Both GitHub and Google receive PKCE; there is no
   fallback to `plain` or no PKCE.
2. The transaction — state, provider, callback URI, verifier, nonce,
   `returnTo`, issue time and expiry — is stored in the browser as an
   encrypted, authenticated cookie (JWE `dir`/`A256GCM` via `jose`).
3. `GET /api/thia/redirect/{provider}` requires that cookie, decrypts it,
   checks expiry on the server, and requires the returned `state` and the
   provider to match before any code exchange. The token request carries the
   `code_verifier` and the transaction's callback URI. Google's ID token is
   verified (RS256 signature against Google's JWKS, issuer, audience/`azp`,
   expiry, nonce) and supplies the user's identity; GitHub's user and
   verified emails come from its API.
4. On success the session cookie is set and the user is sent to `returnTo`
   (local paths only; anything else goes to `/`).

### Transaction cookies

- Name `thia_oauth_<id>` locally, `__Host-thia_oauth_<id>` over HTTPS (forces
  `Secure`, `Path=/`, no `Domain`). `<id>` is a hash of that attempt's state.
- `HttpOnly`, `SameSite=Lax` (the provider returns via a top-level GET),
  host-only, `Max-Age` 10 minutes. The 10-minute limit is also enforced
  server-side from the encrypted issue time, regardless of the cookie.
- **Concurrent logins:** each attempt has its own cookie, so logins started in
  several tabs don't interfere. At most **3** are kept; starting a fourth
  first drops unreadable or expired ones, then the oldest, whose tab then gets
  `invalid_transaction` and must start again.
- **Cleanup:** the attempt's cookie is cleared on success, on any failure once
  the transaction is identified (token exchange failure, refused account
  link, missing code), on provider cancellation (`error=access_denied` →
  `/thia/login?error=cancelled`), and when it is unreadable or expired. A
  valid transaction for a *different* provider is never cleared by a callback.

Callback failures return `400` with a fixed code: `invalid_callback`
(missing/malformed parameters or unknown provider), `invalid_transaction`
(missing, expired, tampered, wrong-key or mismatched transaction) or
`authentication_failed` (the provider refused the exchange, or verification
failed). Logs contain only an error class, provider and OAuth error name —
never codes, tokens, verifiers, cookies or provider responses.

### Replay: what is and isn't guaranteed

Clearing a cookie tells the browser to drop it; it does not make the
transaction single-use. Someone who copied a transaction cookie *and* the
callback URL could present them again until the transaction expires (≤ 10
minutes). What stops that from producing a second session is the provider:
authorization codes are single-use, and PKCE binds the code to this
transaction's verifier. There is no server-side, atomic one-time consumption;
adding it would need shared storage (e.g. a database or Redis), which this
design intentionally avoids.

## Manual smoke test (real providers)

Automated tests use mocked provider HTTP and do **not** prove compatibility
with the live services. Before relying on a deployment, with real OAuth
credentials configured:

1. Start the app (`pnpm dev`, or `pnpm build && pnpm start` for
   production-like cookies behind HTTPS). Open `/thia/login` in a private
   window.
2. **GitHub:** click *Continue with GitHub*. In devtools → Network, check the
   redirect to `github.com/login/oauth/authorize` includes
   `code_challenge=…&code_challenge_method=S256`, and that a
   `thia_oauth_…` (or `__Host-thia_oauth_…`) cookie was set HttpOnly/Lax.
   Approve; you should land on `/` signed in, the `thia_oauth_…` cookie gone,
   and `GET /api/thia/me` returns your user.
3. **Google:** same, checking the `accounts.google.com` request carries
   `code_challenge`, `code_challenge_method=S256` and `nonce`. Google's web
   server guide doesn't document PKCE for confidential clients (its discovery
   document does advertise `S256`), so confirm this step succeeds; if Google
   rejects the exchange, the login fails with `authentication_failed` rather
   than silently dropping PKCE.
4. **Cancel:** start a login and click *Cancel* on the provider page → you
   return to `/thia/login?error=cancelled` and the transaction cookie is gone.
5. **Two tabs:** start GitHub in one tab and Google in another, finish them in
   the opposite order; both should sign in.
6. **Multi-instance (optional):** run two instances with the same `.env` on
   the same host/port in turn (start login on one, stop it, start the other,
   approve) — the login completes.
7. **Replay:** after a successful login, reload the callback URL from history
   → `invalid_transaction` (cookie gone); no second session is created.

## Tests

```bash
pnpm --filter @thia/core test              # PKCE, sealer, use cases, providers
pnpm --filter thia-clean-builder-app test  # routes end to end, mocked providers
```
