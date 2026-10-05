/**
 * AI provider layer. Every network call is a mocked `fetch` — no test reaches
 * a real (paid) AI API.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AIProviderError,
  AIUnavailableError,
  AI_PUBLIC_ERROR_MESSAGE,
  createAIProvider,
  missingAIConfig,
  publicAIErrorMessage,
  resolveAIProviderName,
} from "./index";
import { pcm16ToWav } from "./gemini";
import { buildAIStudentContext } from "./student-context";

function sse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider selection", () => {
  it("is off unless AI_PROVIDER names an approved provider — there is no OpenAI option", () => {
    expect(resolveAIProviderName({})).toBeNull();
    expect(resolveAIProviderName({ AI_PROVIDER: "openai" })).toBeNull();
    expect(() => createAIProvider({ AI_PROVIDER: "openai", OPENAI_API_KEY: "x" })).toThrow(AIUnavailableError);
    expect(() => createAIProvider({})).toThrow(AIUnavailableError);
  });

  it("names the missing variable, never a value", () => {
    expect(missingAIConfig({ AI_PROVIDER: "gemini" })).toEqual(["GEMINI_API_KEY"]);
    expect(missingAIConfig({ AI_PROVIDER: "vertex" })).toEqual(["GOOGLE_CLOUD_PROJECT"]);
    expect(missingAIConfig({ AI_PROVIDER: "anthropic" })).toEqual(["ANTHROPIC_API_KEY"]);
    expect(() => createAIProvider({ AI_PROVIDER: "gemini" })).toThrow(AIUnavailableError);
  });

  it("builds each provider with its model override", () => {
    expect(createAIProvider({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-x" })).toMatchObject({
      name: "gemini",
      model: "gemini-x",
    });
    expect(createAIProvider({ AI_PROVIDER: "vertex", GOOGLE_CLOUD_PROJECT: "p" }).name).toBe("vertex");
    expect(createAIProvider({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-x" })).toMatchObject({
      name: "anthropic",
      model: "claude-x",
    });
  });
});

describe("Gemini", () => {
  const ai = createAIProvider({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-test" });

  it("streams text and sends the system prompt as systemInstruction", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { candidates: [{ content: { parts: [{ text: "Hello " }] } }] },
        { candidates: [{ content: { parts: [{ text: "Bronco" }] } }] },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    let out = "";
    for await (const c of ai.streamText({
      system: "SYS",
      messages: [
        { role: "user", content: "q1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "q2" },
      ],
      maxOutputTokens: 100,
    })) {
      out += c;
    }
    expect(out).toBe("Hello Bronco");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toBe("SYS");
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("turns an HTTP error into a body-free AIProviderError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "echo: student secret prompt" } }), { status: 429 })),
    );
    const err = await ai.generateText({ system: "s", messages: [{ role: "user", content: "q" }], maxOutputTokens: 5 }).catch((e) => e);
    expect(err).toBeInstanceOf(AIProviderError);
    expect(err.status).toBe(429);
    expect(String(err.message)).not.toContain("student secret prompt");
    expect(publicAIErrorMessage(err)).toBe(AI_PUBLIC_ERROR_MESSAGE);
  });

  it("transcribes audio sent inline with its sniffed MIME type", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: " What are the prereqs for CSEN 12? " }] } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const text = await ai.transcribeAudio!(Buffer.from("audio-bytes"), "audio/webm");
    expect(text).toBe("What are the prereqs for CSEN 12?");
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.contents[0].parts[0].inlineData).toEqual({
      mimeType: "audio/webm",
      data: Buffer.from("audio-bytes").toString("base64"),
    });
  });

  it("wraps text-to-speech PCM in a playable WAV", async () => {
    const pcm = Buffer.alloc(480);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm.toString("base64") } }] } }],
        }),
      ),
    );
    const speech = await ai.synthesizeSpeech!("hi");
    expect(speech.mimeType).toBe("audio/wav");
    expect(speech.audio.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(speech.audio.readUInt32LE(24)).toBe(24_000);
    expect(speech.audio.length).toBe(44 + 480);
  });
});

describe("Vertex AI", () => {
  it("calls the regional aiplatform endpoint with a service-account bearer token", async () => {
    vi.doMock("google-auth-library", () => ({
      GoogleAuth: class {
        async getAccessToken() {
          return "adc-token";
        }
      },
    }));
    const fetchMock = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const ai = createAIProvider({ AI_PROVIDER: "vertex", GOOGLE_CLOUD_PROJECT: "scu-proj", VERTEX_LOCATION: "us-west1" });
    expect(await ai.generateText({ system: "s", messages: [{ role: "user", content: "q" }], maxOutputTokens: 5 })).toBe("ok");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://us-west1-aiplatform.googleapis.com/v1/projects/scu-proj/locations/us-west1/publishers/google/models/gemini-2.5-flash:generateContent",
    );
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer adc-token");
    vi.doUnmock("google-auth-library");
  });
});

describe("Anthropic", () => {
  const ai = createAIProvider({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "claude-test" });

  it("streams text deltas from the Messages API", async () => {
    const fetchMock = vi.fn(async () =>
      sse([
        { type: "message_start" },
        { type: "content_block_delta", delta: { type: "text_delta", text: "Take " } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "MATH 11 first." } },
        { type: "message_stop" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    let out = "";
    for await (const c of ai.streamText({ system: "SYS", messages: [{ role: "user", content: "q" }], maxOutputTokens: 50 })) out += c;
    expect(out).toBe("Take MATH 11 first.");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: "claude-test", system: "SYS", stream: true, max_tokens: 50 });
  });

  it("has no audio capabilities, so voice reports itself unavailable", () => {
    expect(ai.transcribeAudio).toBeUndefined();
    expect(ai.synthesizeSpeech).toBeUndefined();
  });
});

describe("pcm16ToWav", () => {
  it("writes a 44-byte RIFF/WAVE header", () => {
    const wav = pcm16ToWav(Buffer.alloc(10), 16_000);
    expect(wav.subarray(8, 12).toString("latin1")).toBe("WAVE");
    expect(wav.readUInt32LE(40)).toBe(10);
    expect(wav.readUInt32LE(24)).toBe(16_000);
  });
});

describe("student context sent to the AI (FERPA minimization)", () => {
  const profile = {
    id: 1,
    userId: "user_secret_clerk_id",
    email: "student@scu.edu",
    name: "Jordan Example",
    studentId: "W1234567",
    studentType: "first_year",
    college: "engineering",
    major: "Computer Science and Engineering",
    secondMajor: null,
    minor: "Mathematics",
    additionalMajors: [],
    additionalMinors: [],
    startTerm: "fall",
    startYear: 2025,
    expectedGradTerm: "spring",
    expectedGradYear: 2029,
    unitsCompletedAtScu: "45",
    unitsTransferredIn: "8",
    cumulativeGpa: "3.412",
    majorGpa: "3.875",
    completedCourseCodes: ["CSEN 10", "MATH 11"],
    priorityRegistration: false,
    currentTerm: "fall",
    currentYear: 2026,
    updatedAt: new Date(),
  } as unknown as Parameters<typeof buildAIStudentContext>[0];

  it("keeps what advising needs", () => {
    const ctx = buildAIStudentContext(profile);
    expect(ctx).toContain("Computer Science and Engineering");
    expect(ctx).toContain("CSEN 10, MATH 11");
    expect(ctx).toContain("expected graduation spring 2029");
  });

  it("never includes identity or grades", () => {
    const ctx = buildAIStudentContext(profile);
    for (const forbidden of ["Jordan", "Example", "W1234567", "student@scu.edu", "user_secret_clerk_id", "3.412", "3.875"]) {
      expect(ctx).not.toContain(forbidden);
    }
  });
});
