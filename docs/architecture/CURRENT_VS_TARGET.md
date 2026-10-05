# Current vs. Target Architecture

Covers **CampusVal** and **PeerHeld Educator** (PreHealth Advisor). Kept identical in both repositories.

## In one sentence
Both apps keep their code and features; what changes is **where they run** (Vercel → SCU's Google Cloud), **where data lives** (Neon/Vercel Blob → Cloud SQL/Cloud Storage in SCU's project), **how people sign in** (Clerk → SCU SSO), **who can reach them** (public internet → SCU network/VPN only) and, for CampusVal, **which AI** answers questions (OpenAI → Gemini/Claude).

## CampusVal

```
CURRENT                                   TARGET
-------                                   ------
Anyone on the internet                    SCU campus network / VPN only
        |                                         |
Clerk sign-in (third party)               SCU SSO (+ Duo)
        |                                         |
React web app + Node/Express API          React web app + Node/Express API (same code)
on Vercel (serverless functions)          on Google Cloud Run (container)
        |                                         |
Neon PostgreSQL                           Cloud SQL for PostgreSQL (private IP)
Vercel Blob (APR files, private)          Cloud Storage bucket (APR files, private)
Vercel env vars (secrets)                 Secret Manager
AI: OpenAI via Replit proxy —             AI: Gemini on Vertex AI (recommended)
    NOT configured in production              or Claude; off until SCU enables it
GitHub → Vercel auto-deploy               GitHub → Cloud Build → Artifact Registry → Cloud Run
```

## PeerHeld Educator (PreHealth Advisor)

```
CURRENT                                   TARGET
-------                                   ------
Anyone on the internet                    SCU campus network / VPN only
        |                                         |
Clerk sign-in (its own Clerk app)         SCU SSO (+ Duo)
        |                                         |
React web app + Node/Express API          Same code, one container
on Vercel                                 on Google Cloud Run
        |                                         |
Neon PostgreSQL                           Cloud SQL for PostgreSQL (private IP)
Vercel env vars                           Secret Manager
No AI in the web app                      No AI in the web app (unchanged)
No file storage                           No file storage (unchanged)
GitHub → Vercel auto-deploy               GitHub → Cloud Build → Artifact Registry → Cloud Run
```

## What changes, by part

| Part | CampusVal now → target | PeerHeld Educator now → target | Status |
|---|---|---|---|
| Hosting | Vercel → Cloud Run | Vercel → Cloud Run | **Code ready** (Dockerfile, `cloudbuild.yaml`, both images built and smoke-tested); needs SCU GCP project |
| Database | Neon → Cloud SQL | Neon → Cloud SQL | **Code ready** (no code change needed); needs instance + data move |
| File storage | Vercel Blob → private GCS bucket | none | **Code ready** (`gcs` provider); needs bucket |
| Sign-in | Clerk → SCU SSO | Clerk → SCU SSO | **Prepared** (internal auth interface); OIDC adapter needs SCU's IdP details |
| Network | public → SCU network/VPN | public → SCU network/VPN | **Defaults set** (ingress internal + LB); needs SCU load balancer/VPN design |
| AI | OpenAI → Gemini/Claude | none | **Done in code**; needs SCU to choose provider + credentials |
| Secrets | Vercel → Secret Manager | Vercel → Secret Manager | **Names defined**; SCU creates them |
| Deploys | Vercel Git integration → Cloud Build | same | **Pipeline written**; needs trigger |

Diagrams: [CAMPUSVAL_ARCHITECTURE.md](CAMPUSVAL_ARCHITECTURE.md) (this repository) and PEERHELD_EDUCATOR_ARCHITECTURE.md (in the prehealth-Advisor repository).
