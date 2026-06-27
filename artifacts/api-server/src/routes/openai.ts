import { Router, type IRouter } from "express";
import { and, eq, asc, desc, sql } from "drizzle-orm";
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
import { requireAuth } from "../middlewares/requireAuth";
import { getMajorRequirements } from "../data/graduation-paths";
import { findCourse } from "../data/courses";
import { offeredSectionsFor, OFFERED_TERMS } from "../data/offered-sections";

const catalogLookup = (code: string) => {
  const c = findCourse(code);
  if (!c) return undefined;
  return { code: c.code, title: c.title, units: c.units, description: c.description };
};

function termLabel(term: string, year: number): string {
  const t = term.charAt(0).toUpperCase() + term.slice(1);
  const tentative = (term === "winter" || term === "spring") && year === 2027;
  return `${t} ${year}${tentative ? " (tentative)" : ""}`;
}

/**
 * For the student's declared majors, list every still-incomplete required
 * course mapped to the term(s) it's offered in the published 2026-2027
 * schedule. Bounded to the major requirement list (~40-70 courses), so it's
 * safe to inject into the system prompt for acceleration advice.
 */
function buildOfferedScheduleBlock(
  majors: string[],
  completedCodes: string[],
): string | undefined {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const major of majors) {
    const reqs = getMajorRequirements(major, completedCodes, catalogLookup);
    if (!reqs) continue;
    for (const group of reqs.groups) {
      if (group.label.startsWith("University Core")) continue;
      for (const c of group.courses) {
        if (c.completed) continue;
        const key = c.code.toUpperCase().replace(/\s+/g, " ");
        if (seen.has(key)) continue;
        seen.add(key);
        const terms = OFFERED_TERMS.filter(
          (t) => offeredSectionsFor(c.code, t.term, t.year).length > 0,
        ).map((t) => termLabel(t.term, t.year));
        const offered =
          terms.length > 0
            ? terms.join("; ")
            : "not in the published 2026-2027 schedule (confirm with the department)";
        lines.push(`- ${c.code} — ${c.title} (${c.units} units): ${offered}`);
      }
    }
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
}

const router: IRouter = Router();


function summarizeForTitle(text: string): string {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/[`*_~#>]/g, "")
    .trim();
  if (!cleaned) return "";
  const max = 60;
  if (cleaned.length <= max) return cleaned.replace(/[.?!,;:]+$/, "");
  const slice = cleaned.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 20 ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[.?!,;:]+$/, "") + "…";
}

async function ownsConversation(
  id: number,
  userId: string,
): Promise<typeof conversations.$inferSelect | null> {
  const conv = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);
  return conv[0] ?? null;
}

router.get("/openai/conversations", requireAuth, async (req, res) => {
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, req.userId!))
    .orderBy(desc(conversations.createdAt));
  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

router.post("/openai/conversations", requireAuth, async (req, res) => {
  const body = CreateOpenaiConversationBody.parse(req.body);
  const [created] = await db
    .insert(conversations)
    .values({ userId: req.userId!, title: body.title })
    .returning();
  res.status(201).json({
    id: created!.id,
    title: created!.title,
    createdAt: created!.createdAt.toISOString(),
  });
});

router.get("/openai/conversations/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: "Not found" });
  const conv = await ownsConversation(id, req.userId!);
  if (!conv) return res.status(404).json({ error: "Not found" });
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  res.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt.toISOString(),
    messages: msgs.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.delete("/openai/conversations/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: "Not found" });
  const conv = await ownsConversation(id, req.userId!);
  if (!conv) return res.status(404).json({ error: "Not found" });
  await db.delete(messages).where(eq(messages.conversationId, id));
  await db.delete(conversations).where(eq(conversations.id, id));
  res.status(204).end();
});

router.get("/openai/conversations/:id/messages", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: "Not found" });
  const conv = await ownsConversation(id, req.userId!);
  if (!conv) return res.status(404).json({ error: "Not found" });
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

router.post("/openai/conversations/:id/messages", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(404).json({ error: "Not found" });
  const body = SendOpenaiMessageBody.parse(req.body);

  const conv = await ownsConversation(id, req.userId!);
  if (!conv) return res.status(404).json({ error: "Not found" });

  await db
    .insert(messages)
    .values({ conversationId: id, role: "user", content: body.content });

  // Auto-summarize the conversation title from the user's first message so
  // sidebar entries aren't all "New conversation". We only rewrite the title
  // when it's still the default placeholder, so a user-set title is never
  // clobbered. The summary is derived locally (no extra LLM call) to keep
  // this fast and free: trim, collapse whitespace, drop trailing punctuation,
  // and cap at ~60 chars on a word boundary.
  const placeholderTitles = new Set([
    "new conversation",
    "new chat",
    "untitled",
    "",
  ]);
  if (placeholderTitles.has((conv.title ?? "").trim().toLowerCase())) {
    const prevCount = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.conversationId, id));
    const isFirstUserMessage = (prevCount[0]?.c ?? 0) === 1; // just inserted
    if (isFirstUserMessage) {
      const summary = summarizeForTitle(body.content);
      if (summary) {
        await db
          .update(conversations)
          .set({ title: summary })
          .where(eq(conversations.id, id));
      }
    }
  }

  const profileRows = await db
    .select()
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, req.userId!))
    .limit(1);
  let profileSummary: string | undefined;
  let offeredScheduleBlock: string | undefined;
  if (profileRows.length > 0) {
    const p = profileRows[0]!;
    const majors = [p.major, p.secondMajor, ...(p.additionalMajors ?? [])].filter(
      (m): m is string => !!m,
    );
    offeredScheduleBlock = buildOfferedScheduleBlock(
      majors,
      p.completedCourseCodes ?? [],
    );
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
    {
      role: "system" as const,
      content: buildSystemPrompt(profileSummary, offeredScheduleBlock),
    },
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
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

export default router;
