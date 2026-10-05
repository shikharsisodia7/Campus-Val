# Replacing Clerk with SCU SSO (OIDC) — CampusVal

> **Terms**
> - **SSO (single sign-on)** — students sign in with their existing SCU account instead of a separate CampusVal password.
> - **OIDC (OpenID Connect)** — the standard web protocol most university identity providers use for SSO. The app redirects the browser to SCU's login page; SCU (with Duo, if SCU requires it) verifies the person and sends back a signed **ID token** naming them.
> - **IdP (identity provider)** — SCU's sign-in service.
> - **Claim** — one field inside the ID token (e.g. `sub` = permanent user ID, `email`).
> - **Clerk** — the third-party sign-in service CampusVal uses today, *temporarily*.
> - **Session** — how the app remembers you are signed in between page loads (a cookie).

**Status:** the server now depends on an internal auth interface, with Clerk behind it. The SCU OIDC adapter is **not built yet** on purpose: building it needs SCU's issuer, client registration and claim names, which we do not have and must not guess. `AUTH_PROVIDER=oidc` currently refuses to start the server with a message pointing to [SSO_INFORMATION_NEEDED.md](SSO_INFORMATION_NEEDED.md). No second username/password store exists or will be added.

```
            Application routes (req.userId / req.userEmail only)
                              |
      lib/auth: getCurrentUser · requireUser · getUserId · requireRole
                              |
                 +------------+-------------+
                 |                          |
        Clerk adapter (today)       SCU OIDC adapter (to build
        lib/auth/clerk.ts           when SCU supplies details)
```

## 1. Every place Clerk is used

### Server (`artifacts/api-server`)
| File | Use |
|---|---|
| `src/lib/auth/clerk.ts` | **The only** server identity code: `clerkMiddleware`, `getAuth`, `clerkClient.users.getUser` (email lookup) |
| `src/lib/auth/index.ts` | Internal interface (`getCurrentUser`, `requireUser`, `getUserId`, `requireRole`, `AUTH_PROVIDER`) — provider-neutral |
| `src/lib/auth/policy.ts` | Who may use the app (`@scu.edu` + `GUEST_REVIEWER_EMAILS`) and admin role (`ADMIN_EMAILS`) — provider-neutral |
| `src/middlewares/requireAuth.ts` | Stable import used by every route; re-exports `requireUser` |
| `src/middlewares/clerkProxyMiddleware.ts` | Proxies `/api/__clerk/*` to Clerk's Frontend API for a custom production domain — **delete with Clerk** |
| `src/app.ts` | Mounts `authSessionMiddleware()` and the Clerk proxy |
| `src/lib/config.ts` | Requires `CLERK_SECRET_KEY` / `CLERK_PUBLISHABLE_KEY` in production while `AUTH_PROVIDER=clerk` |

No route module imports `@clerk/*`: all 27 files in `src/routes/` read `req.userId` / `req.userEmail` only.

### Web app (`artifacts/scu-advising`)
| File | Use |
|---|---|
| `src/App.tsx` | `<ClerkProvider>` wrapping the app; Clerk `<Show when="signed-in">` gates (`Protected`, `HomeRedirect`) |
| `src/pages/auth.tsx` | Clerk `<SignIn>` / `<SignUp>` components |
| `src/components/AppShell.tsx` | `useUser()` (name/email in header), `useClerk().signOut()` |
| `src/pages/onboarding.tsx` | `signOut()` after "Delete account" |
| Build env | `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PROXY_URL` |

The web app calls the API **same-origin with the session cookie** — it never attaches tokens itself — so API calls need no change when the cookie's issuer changes.

### Mobile app (`artifacts/campusval-mobile`, Expo)
`app/_layout.tsx` (`ClerkProvider`, `tokenCache`), `app/(auth)/sign-in.tsx`, `sign-up.tsx` (`useSignIn`, `useSignUp`), `app/(home)/*` and `components/checksheets/DocumentCard.tsx` (`useAuth().getToken()` → `Authorization: Bearer`). The mobile app is not part of the SCU web deployment; it would need a native OIDC flow (e.g. `expo-auth-session` with PKCE) if SCU wants it.

### Tests
`artifacts/e2e` signs synthetic users in with Clerk testing tickets (`tests/auth.setup.ts`, `scripts/ensure-test-users.ts`). Unit tests mock `@clerk/express` or `middlewares/requireAuth`.

## 2. Login flow (today)
1. Student opens CampusVal → web app (Clerk JS) sees no session → shows Clerk `<SignIn>`.
2. Student signs in with email code/password or Google through **Clerk** (Clerk-hosted UI; no SCU login, no Duo).
3. Clerk sets the `__session` cookie (a short-lived signed JWT, refreshed by Clerk JS) on the CampusVal domain.
4. On every `/api/*` call, `clerkMiddleware` verifies that cookie; `requireUser` resolves the email (session claim, else Clerk API) and admits only `@scu.edu` or allowlisted reviewers.

## 3. Session flow
Clerk JS refreshes the short-lived session token in the browser; the server verifies it statelessly on each request. CampusVal stores no sessions itself.

## 4. User ID mapping
CampusVal's internal user ID **is the Clerk user ID** (`user_…`). It is stored as plain text in:

| Table | Column |
|---|---|
| `student_profiles` | `user_id` |
| `academic_plans` | `user_id` (→ `plan_items`, `requirement_customizations` via plan) |
| `requirement_customizations` | `user_id`, `updated_by` |
| `requirement_completions` | `user_id` |
| `quarter_schedules` | `user_id` (→ `schedule_events`) |
| `progress_reports` | `user_id` |
| `progress_report_mappings` | `user_id` |
| `degree_checksheet_documents`, `degree_checksheet_annotations` | `user_id` |
| `conversations` | `user_id` (→ `messages`) |
| `plan_shares` | `student_user_id` |
| `feedback` | `user_id` |
| `usage_events` | `user_id` |

The storage owner segment in every APR file name is `sha256(user_id)[0:16]` (`lib/uploadPath.ts`), so **file ownership also depends on the user ID**.

### Recommended mapping strategy
Keep CampusVal's user IDs **stable** rather than rewriting 14 columns and every stored file name:
1. Add an `auth_identities` table: `(provider, subject) → user_id`.
2. On a student's first SCU SSO sign-in, if no identity row exists, look up an existing CampusVal account by **verified `@scu.edu` email** (`student_profiles.email`, or the Clerk export) and link the SSO subject to that existing `user_id`; otherwise create a new internal ID.
3. From then on the SSO subject resolves to the same `user_id`, so all data and APR files stay attached.
This requires SCU to confirm which claim is permanent (`sub` vs. an SCU ID) and that `email` is verified ([SSO_INFORMATION_NEEDED.md](SSO_INFORMATION_NEEDED.md)).

## 5. Authorization middleware
`requireUser` (401 signed-out / 403 not SCU) and `requireRole("admin")` in `lib/auth/index.ts`; ownership checks live in each route's queries (`WHERE user_id = req.userId`). None of this changes with SSO.

## 6. Logout flow (today)
`AppShell` → `useClerk().signOut()` clears the Clerk session cookie. With SSO: clear CampusVal's session cookie, then redirect to SCU's `end_session_endpoint` if SCU wants single logout.

## 7. Protected routes
- **API:** every user-data route uses `requireAuth` (= `requireUser`). Public (no student data): `/api/healthz`, `/api/readyz`, catalog and calculator lookups (`/api/courses*`, `/api/course-search`, `/api/policies`, `/api/core-areas`, `/api/graduation-paths/*`, `/api/articulation`, `/api/transfer/evaluate`, `/api/gpa/calculate|simulate` — pure calculators that store nothing, `/api/evaluation/scenarios`, `/api/section-availability/status`, `/api/sections/sync/status`) and `/api/storage/local-upload/:token` (authorized by its signed token).
- **Web:** `App.tsx` wraps app pages in `Protected` (Clerk `<Show when="signed-in">`); signed-out visitors are redirected to the landing page. This is a UI convenience — the API checks are what protect data.

## 8. API authentication
Cookie session (web) or `Authorization: Bearer` (mobile), both verified by the active adapter's `sessionMiddleware`.

## 9. What the SCU OIDC adapter will be (when SCU's details arrive)
A sibling of `lib/auth/clerk.ts` implementing `AuthAdapter`:
- **Login:** `GET /api/auth/login` → redirect to SCU's authorization endpoint (Authorization Code flow **with PKCE** and `state`/`nonce`).
- **Callback:** `GET /api/auth/callback` → exchange the code at the token endpoint (client secret from Secret Manager), validate the ID token signature against SCU's JWKS, `iss`, `aud`, `exp`, `nonce`.
- **Session:** an HttpOnly, Secure, SameSite=Lax cookie holding a random session ID; session rows in PostgreSQL with an idle and absolute timeout set to SCU's policy. No passwords stored, ever.
- **`resolveUser`:** read the session → `{ id, email }` via the mapping above.
- **Logout:** `POST /api/auth/logout` → delete session → optional redirect to SCU's end-session endpoint.
- **Duo/MFA:** handled entirely inside SCU's IdP; CampusVal only sees the result (optionally asserting an `acr`/`amr` value if SCU publishes one).
- **Web app:** replace `<ClerkProvider>`/`<SignIn>` with a "Sign in with SCU" link to `/api/auth/login`, `useUser()` with `GET /api/auth/me`, and `signOut()` with `POST /api/auth/logout` (4 files listed above).
- **Remove:** `@clerk/*` packages, `clerkProxyMiddleware.ts`, Clerk env vars, Clerk e2e fixtures (replace with an OIDC test IdP).

Environment placeholders already in `.env.example`: `AUTH_PROVIDER`, `SCU_OIDC_ISSUER`, `SCU_OIDC_CLIENT_ID`, `SCU_OIDC_CLIENT_SECRET`, `SCU_OIDC_REDIRECT_URI`. Additional ones will depend on SCU's answers (claim names, scopes).

## 10. Cut-over plan
1. SCU registers the app (staging callback first) and answers [SSO_INFORMATION_NEEDED.md](SSO_INFORMATION_NEEDED.md).
2. Build and test the adapter against SCU's staging/test IdP; run both providers in staging.
3. Export Clerk users (IDs + verified emails) for the mapping step; delete the export after use.
4. Switch production to `AUTH_PROVIDER=oidc`; keep Clerk read-only for a short rollback window; then delete the Clerk application and its data.
