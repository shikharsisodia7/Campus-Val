# CampusVal Data Flow

Data marked **[FERPA DATA]** is a student education record.

```mermaid
flowchart LR
  classDef ferpa fill:#fce8e6,stroke:#c5221f,color:#000,stroke-width:2px
  B(["Student browser"])
  AUTH["Authentication<br/>SCU SSO (target) / Clerk (today)"]
  APP["CampusVal server<br/>(Cloud Run)"]
  DB[("PostgreSQL<br/>[FERPA DATA]")]:::ferpa
  ST[("Private object storage<br/>[FERPA DATA] APR files")]:::ferpa
  BUL["Bundled Bulletin /<br/>Registrar data"]
  AI["AI provider"]

  B <-->|"sign in → session cookie"| AUTH
  B -->|"every request + session"| APP
  APP <-->|"profile, plans, schedules,<br/>completed courses [FERPA DATA]"| DB

  B -->|"1. ask for upload link"| APP
  B -->|"2. APR Excel/PDF [FERPA DATA]<br/>(direct to Vercel Blob today;<br/>through CampusVal to GCS on GCP)"| ST
  B -->|"3. register upload"| APP
  APP -->|"4. read bytes (memory only)"| ST
  APP -->|"5. parser → structured copy incl. grades [FERPA DATA]"| DB

  B -->|"course search"| APP
  BUL -->|"catalog, prerequisites, offerings"| APP
  APP -->|"results"| B

  B -->|"AI question"| APP
  APP -->|"prompt: program, timeline, completed course codes<br/>[FERPA DATA — minimized: no name/ID/GPA/grades/APR]"| AI
  AI -->|"answer"| APP
  APP -->|"streamed answer"| B
```

### APR path (step by step)
`Browser → POST /api/storage/uploads/request-url → (PUT bytes) private storage → POST /api/progress-reports → validation + parser (memory) → progress_reports.workbook (database) + original kept in storage`

### Course search path
`Browser → GET /api/courses | /api/course-search → bundled Bulletin data → Browser` (no student data, no AI)

### AI path
`Browser → POST /api/openai/conversations/:id/messages → minimized student context + Bulletin offering data + policy text → AI provider → streamed answer → Browser (and saved in messages)`

### What never leaves CampusVal's cloud project
APR files, APR contents, grades, GPA, student ID, name, saved schedules, checksheets.
