/**
 * Google Gemini, reached one of two ways with the SAME request format:
 *
 *  - "gemini": the Gemini API (generativelanguage.googleapis.com) with an API
 *    key (GEMINI_API_KEY). Simplest; works anywhere.
 *  - "vertex": Vertex AI (aiplatform.googleapis.com) inside SCU's own GCP
 *    project, authenticated as the Cloud Run service account through
 *    Application Default Credentials. No API key exists to store or leak, and
 *    requests stay under SCU's Google Cloud agreement. Recommended for SCU
 *    production.
 *
 * Plain REST via fetch — no vendor SDK.
 */
import { readSseData } from "./sse";
import {
  AIProviderError,
  type AIProvider,
  type AIProviderName,
  type GenerateTextOptions,
  type SynthesizedSpeech,
} from "./types";

export interface GeminiTransport {
  name: Extract<AIProviderName, "gemini" | "vertex">;
  /** Full URL for `model:method`, e.g. models/gemini-2.5-flash:generateContent. */
  url(model: string, method: "generateContent" | "streamGenerateContent"): string;
  headers(): Promise<Record<string, string>>;
}

export function apiKeyTransport(apiKey: string): GeminiTransport {
  return {
    name: "gemini",
    url: (model, method) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${method}`,
    headers: async () => ({ "x-goog-api-key": apiKey }),
  };
}

export function vertexTransport(project: string, location: string): GeminiTransport {
  // "global" uses the location-less host; regional endpoints are prefixed.
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  let auth: { getAccessToken(): Promise<string | null | undefined> } | null = null;
  return {
    name: "vertex",
    url: (model, method) =>
      `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:${method}`,
    headers: async () => {
      if (!auth) {
        const { GoogleAuth } = await import("google-auth-library");
        auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
      }
      const token = await auth.getAccessToken();
      if (!token) throw new AIProviderError("vertex");
      return { Authorization: `Bearer ${token}` };
    },
  };
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

const REQUEST_TIMEOUT_MS = 60_000;
const STREAM_TIMEOUT_MS = 180_000;

function textOf(res: GeminiResponse): string {
  return (res.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}

/** Gemini TTS returns raw 16-bit little-endian mono PCM; browsers need a WAV container. */
export function pcm16ToWav(pcm: Buffer, sampleRate = 24_000): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format: PCM
  header.writeUInt16LE(1, 22); // channels
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export class GeminiProvider implements AIProvider {
  readonly name: AIProviderName;

  constructor(
    private readonly transport: GeminiTransport,
    readonly model: string,
    private readonly ttsModel: string,
    private readonly ttsVoice: string,
  ) {
    this.name = transport.name;
  }

  private body(opts: GenerateTextOptions) {
    return {
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: opts.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: opts.maxOutputTokens },
    };
  }

  private async post(url: string, body: unknown, timeoutMs: number): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await this.transport.headers()) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      throw new AIProviderError(this.name);
    }
    if (!res.ok) {
      // Drain without reading into an error: the body can quote the prompt.
      await res.body?.cancel().catch(() => undefined);
      throw new AIProviderError(this.name, res.status);
    }
    return res;
  }

  async generateText(opts: GenerateTextOptions): Promise<string> {
    const res = await this.post(this.transport.url(this.model, "generateContent"), this.body(opts), REQUEST_TIMEOUT_MS);
    return textOf((await res.json()) as GeminiResponse);
  }

  async *streamText(opts: GenerateTextOptions): AsyncIterable<string> {
    const res = await this.post(
      `${this.transport.url(this.model, "streamGenerateContent")}?alt=sse`,
      this.body(opts),
      STREAM_TIMEOUT_MS,
    );
    if (!res.body) throw new AIProviderError(this.name);
    for await (const data of readSseData(res.body)) {
      let chunk: GeminiResponse;
      try {
        chunk = JSON.parse(data) as GeminiResponse;
      } catch {
        continue;
      }
      const text = textOf(chunk);
      if (text) yield text;
    }
  }

  async transcribeAudio(audio: Buffer, mimeType: string): Promise<string> {
    const res = await this.post(
      this.transport.url(this.model, "generateContent"),
      {
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: audio.toString("base64") } },
              {
                text: "Transcribe this audio recording word for word. Reply with only the transcript, no commentary. If there is no intelligible speech, reply with nothing.",
              },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 1024, temperature: 0 },
      },
      REQUEST_TIMEOUT_MS,
    );
    return textOf((await res.json()) as GeminiResponse).trim();
  }

  async synthesizeSpeech(text: string): Promise<SynthesizedSpeech> {
    const res = await this.post(
      this.transport.url(this.ttsModel, "generateContent"),
      {
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: this.ttsVoice } } },
        },
      },
      REQUEST_TIMEOUT_MS,
    );
    const json = (await res.json()) as GeminiResponse;
    const inline = (json.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData)?.inlineData;
    if (!inline?.data) throw new AIProviderError(this.name);
    const rate = Number(/rate=(\d+)/.exec(inline.mimeType)?.[1]) || 24_000;
    return { audio: pcm16ToWav(Buffer.from(inline.data, "base64"), rate), mimeType: "audio/wav" };
  }
}
