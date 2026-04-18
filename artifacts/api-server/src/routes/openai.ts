import { Router, type IRouter } from "express";
import { eq, asc, desc } from "drizzle-orm";
import {
  db,
  conversations,
  messages,
  studentProfilesTable,
} from "@workspace/db";
import {
  CreateOpenaiConversationBody,
  SendOpenaiMessageBody,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { buildSystemPrompt } from "../data/advisor-prompt";

const router: IRouter = Router();

router.get("/openai/conversations", async (_req, res) => {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt));
  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.post("/openai/conversations", async (req, res) => {
  const body = CreateOpenaiConversationBody.parse(req.body);
  const [created] = await db
    .insert(conversations)
    .values({ title: body.title })
    .returning();
  res.status(201).json({
    id: created!.id,
    title: created!.title,
    createdAt: created!.createdAt.toISOString(),
  });
});

router.get("/openai/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: "Not found" });
  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (conv.length === 0) return res.status(404).json({ error: "Not found" });
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  res.json({
    id: conv[0]!.id,
    title: conv[0]!.title,
    createdAt: conv[0]!.createdAt.toISOString(),
    messages: msgs.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.delete("/openai/conversations/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: "Not found" });
  await db.delete(messages).where(eq(messages.conversationId, id));
  const deleted = await db
    .delete(conversations)
    .where(eq(conversations.id, id))
    .returning();
  if (deleted.length === 0)
    return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

router.get("/openai/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: "Not found" });
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  res.json(
    msgs.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  );
});

router.post("/openai/conversations/:id/messages", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: "Not found" });
  const body = SendOpenaiMessageBody.parse(req.body);

  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (conv.length === 0) return res.status(404).json({ error: "Not found" });

  // Persist the user message
  await db
    .insert(messages)
    .values({ conversationId: id, role: "user", content: body.content });

  // Build system prompt with optional profile context
  const profileRows = await db.select().from(studentProfilesTable).limit(1);
  let profileSummary: string | undefined;
  if (profileRows.length > 0) {
    const p = profileRows[0]!;
    profileSummary = [
      `- Name: ${p.name}`,
      `- Student type: ${p.studentType}`,
      `- College: ${p.college}`,
      `- Major: ${p.major}${p.secondMajor ? ` + ${p.secondMajor}` : ""}${p.minor ? ` (minor: ${p.minor})` : ""}`,
      `- Start: ${p.startTerm} ${p.startYear}; expected graduation ${p.expectedGradTerm} ${p.expectedGradYear}`,
      `- Units completed at SCU: ${Number(p.unitsCompletedAtScu)}`,
      `- Units transferred in: ${Number(p.unitsTransferredIn)}`,
      `- Cumulative GPA: ${p.cumulativeGpa === null ? "(not provided)" : Number(p.cumulativeGpa).toFixed(3)}`,
      `- Major GPA: ${p.majorGpa === null ? "(not provided)" : Number(p.majorGpa).toFixed(3)}`,
      `- Priority registration: ${p.priorityRegistration ? "yes" : "no"}`,
      `- Currently in: ${p.currentTerm} ${p.currentYear}`,
      `- Completed courses: ${(p.completedCourseCodes ?? []).join(", ") || "(none provided)"}`,
    ].join("\n");
  }

  const allMsgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  const chatMessages = [
    { role: "system" as const, content: buildSystemPrompt(profileSummary) },
    ...allMsgs.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    if (fullResponse) {
      await db.insert(messages).values({
        conversationId: id,
        role: "assistant",
        content: fullResponse,
      });
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(
      `data: ${JSON.stringify({ error: message })}\n\n`,
    );
    res.end();
  }
});

export default router;
