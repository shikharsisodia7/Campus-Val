# AI Provider Migration — OpenAI → Gemini / Claude (CampusVal)

> **Terms**
> - **AI provider** — the company whose large language model (LLM) writes the AI advisor's answers.
> - **Gemini API** — Google's model service reached with an API key. **Vertex AI** — the same Gemini models inside a Google Cloud project, reached with the project's service account (no API key).
> - **Claude** — Anthropic's model, reached with an API key.
> - **Streaming** — sending the answer to the browser word-by-word as it is generated.
> - **System prompt** — the instructions and reference material sent with every question.

## Summary

| | Before | After |
|---|---|---|
| Provider | OpenAI (`gpt-5.2`) via a Replit-only proxy (`AI_INTEGRATIONS_OPENAI_*`) | **Gemini** (Gemini API or **Vertex AI**) or **Claude** — chosen by `AI_PROVIDER` |
| In production today? | **No.** Production has no OpenAI variables, so every AI request failed, and the error text (naming env vars) was streamed to the browser | Off until SCU sets `AI_PROVIDER`; then the chosen approved provider |
| OpenAI still called? | — | **No.** No OpenAI code, package or option remains. `AI_PROVIDER=openai` refuses to start the server. There is no fallback chain. |
| Student data sent | Name, cumulative GPA, major GPA, units, completed courses, profile | Program, timeline, units, completed course codes. **No name, no IDs, no GPA, no grades, no APR, no schedules.** |
| Errors shown to the browser | Raw provider/env error message | Fixed generic message; detail stays in server logs (category + status only) |
| Selected provider (recommended) | — | **`vertex`** — Gemini on Vertex AI in SCU's GCP project: no API key to store, requests stay under SCU's Google Cloud agreement, and it supports all three features (chat, speech-to-text, text-to-speech) |

## Where AI is used

| Feature | Route | Provider call |
|---|---|---|
| AI advisor chat (streamed) | `POST /api/openai/conversations/:id/messages` (`routes/openai.ts`) | `streamText` |
| Voice advisor | `POST /api/voice/ask`, `/voice/transcribe`, `/voice/speak` (`routes/voice.ts`) | `transcribeAudio`, `generateText`, `synthesizeSpeech` |
| Evaluation bench (fixed test questions, no student data) | `POST /api/evaluation/run` (`routes/evaluation.ts`) | `generateText` |

The URL path still says `/openai/` for API compatibility with the generated web client; it no longer has anything to do with OpenAI.

## Previous implementation
- `lib/integrations-openai-ai-server` (OpenAI SDK client behind a lazy proxy, image/batch/audio helpers) — **deleted**.
- `lib/integrations-openai-ai-react`, `lib/integrations/openai_ai_integrations` (unused scaffolding) — **deleted**.
- `openai` npm dependency in `artifacts/api-server/package.json` — **removed**; `pnpm-lock.yaml` lost 152 lines and nothing was added.
- Voice speech-to-text used OpenAI audio models and converted Safari/OGG audio with **ffmpeg via temporary files in `/tmp`**; text-to-speech fell back to OpenAI when ElevenLabs failed. Both removed.

## New implementation

```
artifacts/api-server/src/lib/ai/
  types.ts            AIProvider interface, AIUnavailableError, AIProviderError, safe public messages
  index.ts            getAIProvider() — reads AI_PROVIDER; no OpenAI option; no fallback
  gemini.ts           Gemini over REST: API-key transport (Gemini API) or Vertex AI transport (service account)
  anthropic.ts        Claude Messages API over REST (text only)
  sse.ts              tiny streaming reader shared by both
  student-context.ts  the ONLY student data ever sent to a model
  ai.test.ts          mocked-network tests
```

```ts
interface AIProvider {
  name: "gemini" | "vertex" | "anthropic"; model: string;
  generateText(opts): Promise<string>;
  streamText(opts): AsyncIterable<string>;
  transcribeAudio?(audio, mimeType): Promise<string>;   // Gemini only
  synthesizeSpeech?(text): Promise<{ audio, mimeType }>; // Gemini only (WAV)
}
```
- No vendor SDK is added — plain `fetch`. Vertex auth uses `google-auth-library` (already a dependency).
- Structured/JSON output: CampusVal's AI features do not use it, so the interface does not include it (kept deliberately small).
- Timeouts: 60 s per request, 180 s per stream. No automatic retries (a failed answer shows the generic message; the student can resend).
- Token limit: 8,192 output tokens (chat), 1,200 (voice), 800 (evaluation) — unchanged from before.
- Voice with Claude: Claude has no audio input/output, so `/voice/*` returns 503 "Voice questions are not enabled".
- ElevenLabs (optional extra voice) still works only if `ELEVENLABS_API_KEY` is set — it is not set in production; leave it unset unless SCU approves that vendor.

## Environment variables

| Variable | Used when | Secret? |
|---|---|---|
| `AI_PROVIDER` | always (`gemini` / `vertex` / `anthropic`; unset = AI off) | No |
| `GEMINI_API_KEY` | `gemini` | **Yes** |
| `GEMINI_MODEL` | `gemini`, `vertex` (default `gemini-2.5-flash`) | No |
| `GEMINI_TTS_MODEL`, `GEMINI_TTS_VOICE` | voice answers (defaults `gemini-2.5-flash-preview-tts`, `Kore`) | No |
| `GOOGLE_CLOUD_PROJECT`, `VERTEX_LOCATION` | `vertex` (default location `us-central1`) | No |
| `ANTHROPIC_API_KEY` | `anthropic` | **Yes** |
| `ANTHROPIC_MODEL` | `anthropic` (default `claude-sonnet-5-5`) | No |

The server validates these at startup (`lib/config.ts`) and names any missing variable.

## Request flow (chat)
1. Student sends a question → `POST /api/openai/conversations/:id/messages` (signed-in, owner of the conversation).
2. Server stores the question in `messages`.
3. Server builds the system prompt: SCU policy rules + Bulletin-derived offering list for the student's remaining major courses + the minimized student context (`buildAIStudentContext`).
4. Server calls `getAIProvider().streamText(...)` with the prompt and conversation history.
5. Chunks are streamed to the browser (Server-Sent Events) and the full answer is stored in `messages`.
6. On failure: the browser gets the generic message; the log records only `ai_request_failed`, the error class and HTTP status.

## What is sent to the model

| Sent | Not sent |
|---|---|
| Student type, college, major(s)/minor(s) | Name, email, SCU student ID, auth user ID |
| Start term, expected graduation, current term | Cumulative GPA, major GPA, any grade |
| Units completed at SCU and transferred in; priority registration flag | APR files or their contents |
| Completed course codes (needed for prerequisite answers) | Saved quarter schedules, personal commitments |
| The conversation (the student's own questions and prior answers) | Checksheets, advisor shares, other students' data |
| Voice: the audio clip of the question (for transcription) | — |

Tests enforce the "not sent" column: `lib/ai/ai.test.ts` and `routes/ai-routes.test.ts` assert that name, student ID, GPA and user ID never appear in the provider call.

## FERPA / privacy considerations
- Completed course codes and the student's own questions are education-record information. Sending them is required for the feature to answer "what should I take next". SCU should confirm the provider's terms: **Vertex AI** (data stays within SCU's Google Cloud agreement, not used for training) is the recommended choice; the consumer Gemini API and Anthropic API have their own data-use terms that SCU's privacy office should review.
- Students may type anything (including grades) into the chat; that text goes to the provider as part of the conversation. Consider a short notice on the AI page.
- Prompts and answers are never logged; conversations are stored owner-only and are deleted with the account.

## Verification
- Unit/route tests: `lib/ai/ai.test.ts` (13 tests), `routes/ai-routes.test.ts` (10 tests) — all network calls mocked; no paid API was called.
- **Not yet verified against live provider endpoints.** Before enabling in production, run one smoke test in staging with SCU's own credentials (one chat question, one voice question). Gemini's documented audio formats are WAV/MP3/AIFF/AAC/OGG/FLAC; Chrome records WebM/Opus and Safari MP4 — the voice smoke test must cover both browsers.

## Affected files
`artifacts/api-server/src/lib/ai/*` (new), `routes/openai.ts`, `routes/voice.ts`, `routes/evaluation.ts`, `data/advisor-prompt.ts`, `lib/config.ts`, `package.json`, `tsconfig.json` (root and api-server), `pnpm-lock.yaml`, `.env.example`; deleted `lib/integrations-openai-ai-server`, `lib/integrations-openai-ai-react`, `lib/integrations/openai_ai_integrations`.
