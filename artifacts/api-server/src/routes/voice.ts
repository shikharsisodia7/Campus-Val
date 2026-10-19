import { Router, type IRouter } from "express";
import express from "express";
import { db, studentProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildSystemPrompt } from "../data/advisor-prompt";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../lib/auth";

/**
 * AI features are PILOT_HIDDEN (artifacts/scu-advising/src/lib/pilot-features.ts):
 * administrators/developers only, enforced here as well as in the web app, so a
 * pilot user cannot reach them by calling the API directly.
 */
const requireAIAccess = requireRole("admin");
import {
  AIUnavailableError,
  getAIProvider,
  publicAIErrorMessage,
  type AIProvider,
  type SynthesizedSpeech,
} from "../lib/ai";
import { buildAIStudentContext } from "../lib/ai/student-context";

const router: IRouter = Router();

/**
 * Voice advisor: speech-to-text → advisor answer → text-to-speech, all through
 * the configured SCU-approved AI provider (lib/ai). Audio is held in memory for
 * the one request and never written to disk or stored.
 *
 * Optional: if ELEVENLABS_API_KEY is set, ElevenLabs voices the answer instead
 * of the AI provider. It is an additional external service — leave it unset
 * unless SCU has approved it. With it unset nothing is sent to ElevenLabs.
 */
const ELEVENLABS_VOICE_ID = process.env["VOICE_TTS_VOICE_ID"] || "hpp4J3VqNfWAUOO0d1Us";
const ELEVENLABS_MODEL = "eleven_turbo_v2_5";

class VoiceUnavailableError extends Error {}

async function elevenLabsTts(text: string, apiKey: string): Promise<SynthesizedSpeech> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!resp.ok) {
    await resp.body?.cancel().catch(() => undefined);
    throw new Error(`ElevenLabs request failed (${resp.status})`);
  }
  return { audio: Buffer.from(await resp.arrayBuffer()), mimeType: "audio/mpeg" };
}

async function synthesizeSpeech(
  ai: AIProvider,
  text: string,
): Promise<SynthesizedSpeech & { provider: string }> {
  const elevenLabsKey = process.env["ELEVENLABS_API_KEY"];
  if (elevenLabsKey) return { ...(await elevenLabsTts(text, elevenLabsKey)), provider: "elevenlabs" };
  if (!ai.synthesizeSpeech) throw new VoiceUnavailableError();
  return { ...(await ai.synthesizeSpeech(text)), provider: ai.name };
}

const RAW_AUDIO = express.raw({
  type: ["audio/*", "application/octet-stream"],
  limit: "25mb",
});

/**
 * MIME type from magic bytes — the browser's declared type is not trusted.
 * Chrome/Firefox record WebM, Safari records MP4/AAC.
 */
export function sniffAudioMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WAVE") return "audio/wav";
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "audio/webm";
  if (buf.subarray(0, 4).toString("latin1") === "OggS") return "audio/ogg";
  if (buf.subarray(0, 4).toString("latin1") === "fLaC") return "audio/flac";
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") return "audio/mp4";
  if (buf.subarray(0, 3).toString("latin1") === "ID3" || (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0)) return "audio/mp3";
  return null;
}

async function transcribe(ai: AIProvider, buf: Buffer): Promise<string> {
  if (!ai.transcribeAudio) throw new VoiceUnavailableError();
  const mime = sniffAudioMime(buf);
  if (!mime) throw new UnsupportedAudioError();
  return (await ai.transcribeAudio(buf, mime)).trim();
}

class UnsupportedAudioError extends Error {}

async function buildProfileSummary(userId: string): Promise<string | undefined> {
  const rows = await db
    .select()
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, userId))
    .limit(1);
  // Same minimized context as the text advisor: no name, IDs or GPA.
  return rows[0] ? buildAIStudentContext(rows[0], { includeTransferUnits: false }) : undefined;
}

/** One place that turns any failure into a status + a message safe for the browser. */
function sendVoiceError(req: express.Request, res: express.Response, err: unknown, route: string) {
  if (err instanceof UnsupportedAudioError) {
    return res.status(415).json({ error: "Unsupported audio format. Please try recording again." });
  }
  if (err instanceof VoiceUnavailableError || err instanceof AIUnavailableError) {
    return res.status(503).json({ error: "Voice questions are not enabled on this server." });
  }
  req.log.error(
    { event: "voice_request_failed", route, errorName: err instanceof Error ? err.name : "unknown" },
    "Voice request failed",
  );
  return res.status(502).json({ error: publicAIErrorMessage(err) });
}

// POST /voice/transcribe — raw audio in body, returns { text }
router.post("/voice/transcribe", requireAuth, requireAIAccess, RAW_AUDIO, async (req, res) => {
  try {
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: "Empty audio body" });
    }
    const text = await transcribe(getAIProvider(), buf);
    return res.json({ text });
  } catch (err) {
    return sendVoiceError(req, res, err, "transcribe");
  }
});

// POST /voice/speak — { text } in JSON, returns audio bytes
router.post("/voice/speak", requireAuth, requireAIAccess, express.json({ limit: "1mb" }), async (req, res) => {
  try {
    const text = String((req.body ?? {}).text ?? "").trim();
    if (!text) return res.status(400).json({ error: "text required" });
    if (text.length > 4000) return res.status(400).json({ error: "text too long (max 4000 chars)" });
    const speech = await synthesizeSpeech(getAIProvider(), text);
    // Binary audio with a fixed audio/* type and nosniff: never rendered as HTML.
    res.setHeader("Content-Type", speech.mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Voice-Provider", speech.provider);
    return res.send(speech.audio);
  } catch (err) {
    return sendVoiceError(req, res, err, "speak");
  }
});

// POST /voice/ask — raw audio → { transcript, answer, audioBase64, audioMime }
// One-shot: transcribe → ask advisor → synthesize answer.
router.post("/voice/ask", requireAuth, requireAIAccess, RAW_AUDIO, async (req, res) => {
  try {
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: "Empty audio body" });
    }
    const ai = getAIProvider();
    const transcript = await transcribe(ai, buf);
    if (!transcript) {
      return res.status(422).json({ error: "Could not transcribe audio. Try speaking more clearly." });
    }

    const profileSummary = await buildProfileSummary(req.userId!);
    const answer =
      (
        await ai.generateText({
          system:
            buildSystemPrompt(profileSummary) +
            "\n\nThe student is asking by VOICE. Keep answers concise (under 120 words) and conversational. Avoid lists, headings, and markdown — speak as if on the phone. If a precise rule must be cited, say it briefly.",
          messages: [{ role: "user", content: transcript }],
          maxOutputTokens: 1200,
        })
      ).trim() || "Sorry, I couldn't generate an answer.";

    const speech = await synthesizeSpeech(ai, answer);
    return res.json({
      transcript,
      answer,
      audioBase64: speech.audio.toString("base64"),
      audioMime: speech.mimeType,
      voiceProvider: speech.provider,
    });
  } catch (err) {
    return sendVoiceError(req, res, err, "ask");
  }
});

export default router;
