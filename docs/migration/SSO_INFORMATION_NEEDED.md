# SCU SSO — Information Requested from the SCU Identity (IdP) Team

**For:** SCU Identity & Access Management / IdP team
**About:** registering two student-facing web applications as OpenID Connect (OIDC) clients of SCU's identity provider, with Duo/MFA as SCU requires.

| Application | Purpose | Who signs in |
|---|---|---|
| **CampusVal** | SCU academic/degree planning (handles FERPA data: Academic Progress Reports, completed courses, plans) | SCU undergraduate students; SCU advisors; a small number of invited external reviewers (if SCU permits guest accounts) |
| **PeerHeld Educator** (PreHealth Advisor) | Health-professions prerequisite lookup and personal planner for SCU Health Professions Peer Advisors and the students they advise | SCU students and peer advisors |

Both will run on Google Cloud Run inside an SCU GCP project, reachable only from the SCU network/VPN. Neither application stores passwords, and **we are not asking for any passwords or credentials of individuals**.

Please answer for a **staging/test** registration first, then **production**.

## 1. Discovery and endpoints
1. **OIDC issuer URL** and **discovery document URL** (`…/.well-known/openid-configuration`).
2. If discovery is not available: the **authorization endpoint**, **token endpoint**, **JWKS (signing keys) URI**, and **userinfo endpoint** (if we should call it).
3. Supported **signing algorithms** for ID tokens (e.g. RS256).

## 2. Client registration
4. **Client ID** for each application and environment.
5. **Client authentication method** (client secret post/basic, or private-key JWT) and **how the client secret will be delivered** securely. We will store it only in SCU's Google Secret Manager — please do not email it.
6. Is **PKCE** supported/required? (We plan Authorization Code flow with PKCE.)
7. **Approved redirect (callback) URI format.** Our callback path will be `/api/auth/callback`. Please register, per app and environment, the HTTPS hostnames SCU assigns, e.g.
   - staging: `https://<staging-hostname>/api/auth/callback`
   - production: `https://<production-hostname>/api/auth/callback`
   (Hostnames to be agreed with SCU IT/DNS; we have not assumed any.)
8. Is `http://localhost:<port>/api/auth/callback` allowed for a **development** client, or should developers use the staging client only?

## 3. Scopes and claims
9. **Scopes** to request (e.g. `openid email profile`; any SCU-specific scopes).
10. **User identifier claim:** which claim is permanent and never reassigned (`sub`? an SCU ID claim? `eppn`)? Is it the same across both applications?
11. **Email claim:** name of the claim, and is it always a verified `@scu.edu` address?
12. **Name claims:** `name` / `given_name` / `family_name` availability.
13. **Affiliation / role / group claims**, if available (e.g. student, faculty, staff, advisor; department). CampusVal currently distinguishes students from advisors per shared plan; an advisor/staff affiliation claim would let SCU control advisor access centrally. Please tell us names and possible values; we will not assume any.
14. Can SCU restrict sign-in to particular populations at the IdP (e.g. undergraduate students + advising staff)?
15. **Guest accounts:** can non-SCU invited reviewers be issued SCU guest identities, or must they be excluded?

## 4. MFA / Duo
16. Is Duo (or other MFA) enforced inside the IdP for these clients? Is there an `acr` / `amr` claim we can check to confirm MFA happened?

## 5. Sessions and tokens
17. **ID token / access token lifetime.**
18. **Refresh tokens:** issued or not; lifetime and rotation policy. (We do not need refresh tokens if SCU prefers re-authentication.)
19. Required **application session limits** (idle timeout, absolute timeout, re-authentication frequency).
20. **Logout:** is RP-initiated logout supported (`end_session_endpoint`)? Do you want users sent there when they sign out of the app? Is back-channel/front-channel logout required?
21. Clock-skew tolerance and key-rotation notice for JWKS.

## 6. Process
22. Who approves the registrations, expected timeline, and the contact for testing issues.
23. Is there a **test IdP / test accounts** we can use in staging (so we never use a real student account for testing)?

---
*Engineering contact: the CampusVal / PeerHeld Educator developer. Technical detail: `docs/migration/SCU_SSO_MIGRATION.md` in each repository.*
