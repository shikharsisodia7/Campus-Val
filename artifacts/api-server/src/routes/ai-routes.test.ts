/**
 * AI-backed routes (advisor chat, voice, evaluation) driven through a FAKE
 * provider injected with setAIProviderForTests — no network, no paid API.
 * Uses the real test database for conversations and the student profile.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { conversations, db, messages, studentProfilesTable } from "@workspace/db";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    // AI features are admin-only during the pilot; these tests act as an admin
    // unless a request says otherwise.
    req.userEmail = req.header("x-test-email") ?? "ai-admin@scu.edu";
    next();
  },
}));
const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;
process.env.ADMIN_EMAILS = "ai-admin@scu.edu";
afterAll(() => {
  if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
});

import openaiRouter from "./openai";
import voiceRouter from "./voice";
import evaluationRouter from "./evaluation";
import {
  AIProviderError,
  AIUnavailableError,
  AI_PUBLIC_ERROR_MESSAGE,
  AI_UNAVAILABLE_PUBLIC_MESSAGE,
  setAIProviderForTests,
  type AIProvider,
  type GenerateTextOptions,
} from "../lib/ai";

const USER = "test_ai_routes_user";
const logged: unknown[] = [];

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  const log = (...args: unknown[]) => logged.push(args);
  req.log = { error: log, warn: log, info: log, debug: log };
  next();
});
app.use("/api", openaiRouter, voiceRouter, evaluationRouter);

function fakeProvider(overrides: Partial<AIProvider> = {}): AIProvider & { calls: GenerateTextOptions[] } {
  const calls: GenerateTextOptions[] = [];
  return {
    name: "gemini",
    model: "fake-model",
    calls,
    async generateText(opts) {
      calls.push(opts);
      return "Take MATH 12 next.";
    },
    async *streamText(opts) {
      calls.push(opts);
      yield "Take ";
      yield "MATH 12 next.";
    },
    async transcribeAudio() {
      return "what should I take next";
    },
    async synthesizeSpeech() {
      return { audio: Buffer.from("RIFFfakeWAVE"), mimeType: "audio/wav" };
    },
    ...overrides,
  };
}

async function cleanup() {
  const convs = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.userId, USER));
  if (convs.length) await db.delete(messages).where(inArray(messages.conversationId, convs.map((c) => c.id)));
  await db.delete(conversations).where(eq(conversations.userId, USER));
  await db.delete(studentProfilesTable).where(eq(studentProfilesTable.userId, USER));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(studentProfilesTable).values({
    userId: USER,
    name: "Jordan Privacy",
    studentId: "W7654321",
    studentType: "first_year",
    college: "School of Engineering",
    major: "Computer Science and Engineering",
    startTerm: "fall",
    startYear: 2025,
    expectedGradTerm: "spring",
    expectedGradYear: 2029,
    cumulativeGpa: "3.412",
    majorGpa: "3.875",
    completedCourseCodes: ["MATH 11"],
    currentTerm: "fall",
    currentYear: 2026,
  });
});
afterAll(async () => {
  setAIProviderForTests(null);
  await cleanup();
});
afterEach(() => {
  setAIProviderForTests(null);
  logged.length = 0;
});

async function newConversation(): Promise<number> {
  const res = await request(app).post("/api/openai/conversations").set("x-test-user", USER).send({ title: "New conversation" }).expect(201);
  return res.body.id;
}

function sseEvents(text: string): Record<string, unknown>[] {
  return text
    .split("\n\n")
    .filter((e) => e.startsWith("data: "))
    .map((e) => JSON.parse(e.slice(6)));
}

describe("advisor chat", () => {
  it("streams the provider's answer and stores it", async () => {
    const ai = fakeProvider();
    setAIProviderForTests(ai);
    const id = await newConversation();
    const res = await request(app)
      .post(`/api/openai/conversations/${id}/messages`)
      .set("x-test-user", USER)
      .send({ content: "What should I take after MATH 11?" })
      .expect(200);
    const events = sseEvents(res.text);
    expect(events.filter((e) => e.content).map((e) => e.content).join("")).toBe("Take MATH 12 next.");
    expect(events.at(-1)).toEqual({ done: true });
    const stored = await db.select().from(messages).where(eq(messages.conversationId, id));
    expect(stored.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("sends the student's program but never their name, student ID or GPA", async () => {
    const ai = fakeProvider();
    setAIProviderForTests(ai);
    const id = await newConversation();
    await request(app).post(`/api/openai/conversations/${id}/messages`).set("x-test-user", USER).send({ content: "hi" }).expect(200);
    const sent = JSON.stringify(ai.calls[0]);
    expect(sent).toContain("Computer Science and Engineering");
    expect(sent).toContain("MATH 11");
    for (const forbidden of ["Jordan Privacy", "W7654321", "3.412", "3.875", USER]) expect(sent).not.toContain(forbidden);
  });

  it("returns a generic message — not the provider's error text — when the provider fails", async () => {
    setAIProviderForTests(
      fakeProvider({
        // eslint-disable-next-line require-yield
        async *streamText() {
          throw new AIProviderError("gemini", 500);
        },
      }),
    );
    const id = await newConversation();
    const res = await request(app).post(`/api/openai/conversations/${id}/messages`).set("x-test-user", USER).send({ content: "hi" });
    expect(sseEvents(res.text).at(-1)).toEqual({ error: AI_PUBLIC_ERROR_MESSAGE });
    expect(res.text).not.toContain("gemini request failed");
  });

  it("says AI is not enabled (and does not leak variable names) when no provider is configured", async () => {
    setAIProviderForTests(
      fakeProvider({
        // eslint-disable-next-line require-yield
        async *streamText() {
          throw new AIUnavailableError();
        },
      }),
    );
    const id = await newConversation();
    const res = await request(app).post(`/api/openai/conversations/${id}/messages`).set("x-test-user", USER).send({ content: "hi" });
    expect(sseEvents(res.text).at(-1)).toEqual({ error: AI_UNAVAILABLE_PUBLIC_MESSAGE });
    expect(res.text).not.toMatch(/API_KEY|AI_PROVIDER|BASE_URL/);
  });
});

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(32)]);

describe("voice", () => {
  it("transcribes, answers and voices a question", async () => {
    const ai = fakeProvider();
    setAIProviderForTests(ai);
    const res = await request(app).post("/api/voice/ask").set("x-test-user", USER).set("Content-Type", "audio/webm").send(WEBM).expect(200);
    expect(res.body).toMatchObject({ transcript: "what should I take next", answer: "Take MATH 12 next.", audioMime: "audio/wav" });
    expect(JSON.stringify(ai.calls)).not.toContain("3.412");
  });

  it("is 503 when the provider has no audio (Anthropic)", async () => {
    setAIProviderForTests(fakeProvider({ name: "anthropic", transcribeAudio: undefined, synthesizeSpeech: undefined }));
    const res = await request(app).post("/api/voice/ask").set("x-test-user", USER).set("Content-Type", "audio/webm").send(WEBM).expect(503);
    expect(res.body.error).toMatch(/not enabled/);
  });

  it("refuses bytes that are not a recognised audio format", async () => {
    setAIProviderForTests(fakeProvider());
    await request(app)
      .post("/api/voice/transcribe")
      .set("x-test-user", USER)
      .set("Content-Type", "audio/webm")
      .send(Buffer.from("<html><script>alert(1)</script></html>"))
      .expect(415);
  });

  it("requires sign-in", async () => {
    await request(app).post("/api/voice/ask").set("Content-Type", "audio/webm").send(WEBM).expect(401);
  });
});

describe("evaluation", () => {
  it("is 503 when AI is not configured", async () => {
    setAIProviderForTests(null);
    const prev = process.env["AI_PROVIDER"];
    delete process.env["AI_PROVIDER"];
    try {
      const res = await request(app).post("/api/evaluation/run").set("x-test-user", USER).send({}).expect(503);
      expect(res.body.error).toBe(AI_UNAVAILABLE_PUBLIC_MESSAGE);
    } finally {
      if (prev !== undefined) process.env["AI_PROVIDER"] = prev;
    }
  });

  it("reports the provider and model it ran against", async () => {
    setAIProviderForTests(fakeProvider());
    const res = await request(app).post("/api/evaluation/run").set("x-test-user", USER).send({}).expect(200);
    expect(res.body.model).toBe("gemini:fake-model");
  });
});

describe("AI features during the pilot", () => {
  it("refuse an ordinary pilot user on every AI route (admins only, as in the web app)", async () => {
    const asPilotUser = (r: request.Test) => r.set("x-test-user", USER).set("x-test-email", "pilot-student@scu.edu");
    const calls: request.Test[] = [
      asPilotUser(request(app).get("/api/openai/conversations")),
      asPilotUser(request(app).post("/api/openai/conversations")).send({ title: "x" }),
      asPilotUser(request(app).get("/api/openai/conversations/1")),
      asPilotUser(request(app).delete("/api/openai/conversations/1")),
      asPilotUser(request(app).get("/api/openai/conversations/1/messages")),
      asPilotUser(request(app).post("/api/openai/conversations/1/messages")).send({ content: "hi" }),
      asPilotUser(request(app).post("/api/voice/transcribe")),
      asPilotUser(request(app).post("/api/voice/speak")).send({ text: "hi" }),
      asPilotUser(request(app).post("/api/voice/ask")),
      asPilotUser(request(app).post("/api/evaluation/run")).send({}),
    ];
    for (const call of calls) {
      const res = await call;
      expect(res.status).toBe(403);
    }
  });
});

