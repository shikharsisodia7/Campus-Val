import { Router, type IRouter } from "express";
import express from "express";
import {
  speechToText,
  textToSpeech,
  ensureCompatibleFormat,
  openai,
} from "@workspace/integrations-openai-ai-server/audio";
import { db, studentProfilesTable } from "@workspace/db";
import { buildSystemPrompt } from "../data/advisor-prompt";

const router: IRouter = Router();

// ElevenLabs TTS — natural-sounding voices. Falls back to OpenAI on failure.
// Voice "Bella" (hpp4J3VqNfWAUOO0d1Us) — professional, bright, warm; tagged
// for "informative_educational" — fits an academic advisor.
// Override with VOICE_TTS_VOICE_ID env var to swap voices without redeploy.
const ELEVENLABS_VOICE_ID =
  process.env["VOICE_TTS_VOICE_ID"] || "hpp4J3VqNfWAUOO0d1Us";
const ELEVENLABS_MODEL = "eleven_turbo_v2_5";

async function elevenLabsTts(text: string): Promise<Buffer> {
  const apiKey = process.env["ELEVENLABS_API_KEY"];
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true,
      },
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs ${resp.status}: ${detail.slice(0, 300)}`);
  }
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

// Synthesize speech with ElevenLabs first; on any error, fall back to OpenAI's
// gpt-audio so the voice flow keeps working even if the EL key is rate-limited
// or revoked. Returns the audio buffer plus the provider name for logging.
async function synthesizeSpeech(
  text: string,
  log: { warn: (...args: unknown[]) => void },
): Promise<{ audio: Buffer; provider: "elevenlabs" | "openai" }> {
  if (process.env["ELEVENLABS_API_KEY"]) {
    try {
      const audio = await elevenLabsTts(text);
      return { audio, provider: "elevenlabs" };
    } catch (err) {
      log.warn({ err }, "elevenlabs TTS failed; falling back to openai");
    }
  }
  const audio = await textToSpeech(text, "alloy", "mp3");
  return { audio, provider: "openai" };
}

const RAW_AUDIO = express.raw({
  type: ["audio/*", "application/octet-stream"],
  limit: "25mb",
});

// Sniff actual audio format from magic bytes (handles Safari mp4/m4a, OGG, etc.).
// Returns a buffer + format that OpenAI's transcription accepts.
async function normalizeAudio(
  buf: Buffer,
): Promise<{ buffer: Buffer; format: "wav" | "mp3" | "webm" }> {
  // Fast path for native webm — Whisper accepts it directly, skip ffmpeg.
  if (
    buf.length >= 4 &&
    buf[0] === 0x1a &&
    buf[1] === 0x45 &&
    buf[2] === 0xdf &&
    buf[3] === 0xa3
  ) {
    return { buffer: buf, format: "webm" };
  }
  // ensureCompatibleFormat sniffs magic bytes and converts mp4/m4a/ogg → wav.
  const out = await ensureCompatibleFormat(buf);
  return out;
}

async function buildProfileSummary(): Promise<string | undefined> {
  const rows = await db.select().from(studentProfilesTable).limit(1);
  if (rows.length === 0) return undefined;
  const p = rows[0]!;
  return [
    `- Name: ${p.name}`,
    `- Student type: ${p.studentType}`,
    `- College: ${p.college}`,
    `- Major: ${p.major}${p.secondMajor ? ` + ${p.secondMajor}` : ""}${p.minor ? ` (minor: ${p.minor})` : ""}`,
    `- Currently in: ${p.currentTerm} ${p.currentYear}`,
    `- Cumulative GPA: ${p.cumulativeGpa === null ? "(not provided)" : Number(p.cumulativeGpa).toFixed(3)}`,
    `- Priority registration: ${p.priorityRegistration ? "yes" : "no"}`,
    `- Completed courses: ${(p.completedCourseCodes ?? []).join(", ") || "(none)"}`,
  ].join("\n");
}

// POST /voice/transcribe — raw audio in body, returns { text }
router.post("/voice/transcribe", RAW_AUDIO, async (req, res) => {
  try {
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: "Empty audio body" });
    }
    const { buffer, format } = await normalizeAudio(buf);
    const text = await speechToText(buffer, format);
    return res.json({ text, format });
  } catch (err) {
    req.log.error({ err }, "voice/transcribe failed");
    const message = err instanceof Error ? err.message : "Transcription failed";
    return res.status(500).json({ error: message });
  }
});

// POST /voice/speak — { text } in JSON, returns audio/mpeg buffer
router.post("/voice/speak", express.json({ limit: "1mb" }), async (req, res) => {
  try {
    const text = String((req.body ?? {}).text ?? "").trim();
    if (!text) return res.status(400).json({ error: "text required" });
    if (text.length > 4000)
      return res.status(400).json({ error: "text too long (max 4000 chars)" });
    const { audio, provider } = await synthesizeSpeech(text, req.log);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Voice-Provider", provider);
    return res.send(audio);
  } catch (err) {
    req.log.error({ err }, "voice/speak failed");
    const message = err instanceof Error ? err.message : "Speech synth failed";
    return res.status(500).json({ error: message });
  }
});

// POST /voice/ask — raw audio → { transcript, answer, audioBase64 }
// One-shot: transcribe → ask advisor → synthesize answer.
router.post("/voice/ask", RAW_AUDIO, async (req, res) => {
  try {
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: "Empty audio body" });
    }
    const { buffer, format } = await normalizeAudio(buf);
    const transcript = (await speechToText(buffer, format)).trim();
    if (!transcript) {
      return res.status(422).json({
        error: "Could not transcribe audio. Try speaking more clearly.",
      });
    }

    const profileSummary = await buildProfileSummary();
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            buildSystemPrompt(profileSummary) +
            "\n\nThe student is asking by VOICE. Keep answers concise (under 120 words) and conversational. Avoid lists, headings, and markdown — speak as if on the phone. If a precise rule must be cited, say it briefly.",
        },
        { role: "user", content: transcript },
      ],
    });
    const answer =
      completion.choices[0]?.message?.content?.trim() ||
      "Sorry, I couldn't generate an answer.";

    const { audio, provider } = await synthesizeSpeech(answer, req.log);
    return res.json({
      transcript,
      answer,
      audioBase64: audio.toString("base64"),
      audioMime: "audio/mpeg",
      voiceProvider: provider,
    });
  } catch (err) {
    req.log.error({ err }, "voice/ask failed");
    const message = err instanceof Error ? err.message : "Voice ask failed";
    return res.status(500).json({ error: message });
  }
});

export default router;
