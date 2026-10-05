# Cloud Storage — CampusVal APR and checksheet files

> **Terms**
> - **Cloud Storage (GCS)** — Google's object storage: private "buckets" holding files.
> - **Uniform bucket-level access** — permissions are set only on the bucket with IAM, never per file, so no single file can be accidentally made public.
> - **Public access prevention** — a bucket setting that blocks any public grant outright.
> - **CMEK** — customer-managed encryption keys (SCU controls the key in Cloud KMS).

## Does CampusVal need persistent file storage? — Yes (option B)

| Option | Meaning | Fits CampusVal? |
|---|---|---|
| A. Discard the original after parsing | Keep only the parsed copy | **No, not without removing features.** Students can reopen/download their original APR (`GET /api/progress-reports/:id/file`); a PDF whose table cannot be read is kept as "original only" (its only form); older documents are re-imported lazily from the original; Degree Checksheets are displayed from the original file. |
| **B. Keep the original privately** | Store the file in a private bucket | **Yes — current behavior, preserved.** |

Cloud Run's local disk is in-memory and disappears when an instance stops, so the `local` provider is not suitable there. The new **`gcs` provider** (`artifacts/api-server/src/lib/storage/gcsProvider.ts`) stores files in a private bucket.

*If SCU's policy prefers option A, it is a product decision (it removes the download/original-only features); the code change would be to delete the object right after a successful parse and drop the file routes.*

## How the `gcs` provider works
- **Upload:** browser → `PUT /api/storage/local-upload/<token>` on CampusVal → CampusVal writes to the bucket with the service account. The token is an HMAC-signed, 15-minute, single-object, size- and type-limited permission (`lib/storage/uploadToken.ts`). So: **no signed GCS URLs, no bucket CORS, no `iam.serviceAccounts.signBlob` permission** are needed.
- **Read:** only through the owner-checked API routes; the server streams the object. No object URL ever reaches a browser.
- **Names:** `progress-reports/<16-hex owner fingerprint>/<random UUID>` — the same names Vercel Blob uses today, so a straight copy migrates existing files and the database's stored paths stay valid. Paths are validated against an exact pattern before use, so nothing else in the bucket is addressable.
- **Auth:** Application Default Credentials (the Cloud Run service account) via the JSON API; no key file, no `@google-cloud/storage` SDK at runtime.
- **Limits:** APR 10 MB (`APR_MAX_UPLOAD_MB`, max 50), checksheet 20 MB (`CHECKSHEET_MAX_UPLOAD_MB`). Cloud Run's request limit is 32 MB, so keep both ≤ 30.

Configuration:
```
PRIVATE_STORAGE_PROVIDER=gcs
GCS_BUCKET=<bucket name>            # plain env var
STORAGE_SIGNING_SECRET=<secret>     # Secret Manager: campusval-storage-signing-secret
```

Tests: `lib/storage/gcsProvider.test.ts` (round trip, owner-only reads, path traversal refused, forged/expired token, wrong type, oversize, empty).

## Bucket design (SCU creates it)

```bash
gcloud storage buckets create gs://<bucket> \
  --location=<same region as Cloud Run> \
  --uniform-bucket-level-access \
  --public-access-prevention \
  --default-storage-class=STANDARD
# Optional, if SCU requires customer-managed keys:
#   --default-encryption-key=projects/.../locations/.../keyRings/.../cryptoKeys/...

gcloud storage buckets add-iam-policy-binding gs://<bucket> \
  --member="serviceAccount:<campusval-runtime-sa>" --role=roles/storage.objectUser
```

- **Private:** public access prevention enforced; no `allUsers`/`allAuthenticatedUsers` bindings; uniform bucket-level access.
- **Least privilege:** only the CampusVal runtime service account has object access, on this bucket only. Developers have none in production.
- **Encryption at rest:** always on (Google-managed); CMEK optional.
- **Signed URLs:** not used.
- **Versioning:** leave **off** (so a student's deletion really deletes), or on with a short noncurrent-version lifecycle rule if SCU wants accidental-deletion protection (e.g. delete noncurrent versions after 7 days).
- **Retention / deletion:** objects are deleted by the app when the student deletes/replaces an APR or deletes their account. SCU may add a lifecycle rule (e.g. delete objects older than N years) once a retention period is set — see [DATA_RETENTION.md](../security/DATA_RETENTION.md). Do **not** add a bucket retention *lock*: it would block student-initiated deletion.
- **Audit:** enable Data Access audit logs for Cloud Storage on this bucket.
- **Per-user ownership:** enforced in the application (owner fingerprint in the name + `WHERE user_id` in every query), not by bucket permissions — the bucket is accessible only to the app.

## Migrating existing files from Vercel Blob
1. With the old platform frozen, list objects under `progress-reports/` in the Vercel Blob store and copy each to the bucket under the **same name** (a short script using the Blob token on an SCU-controlled machine; never to a laptop's persistent disk).
2. Verify counts match `SELECT count(*) FROM progress_reports` + `degree_checksheet_documents` (counts only).
3. Delete the Vercel Blob store and revoke `BLOB_READ_WRITE_TOKEN` after sign-off.
