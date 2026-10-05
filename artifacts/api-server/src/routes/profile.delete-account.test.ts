/**
 * "Delete account" (DELETE /api/profile) removes EVERY row and stored file the
 * student owns — including APR records whose workbook copy contains grades —
 * and nothing belonging to anyone else. Real test database; storage mocked.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  academicPlansTable,
  conversations,
  degreeChecksheetAnnotationsTable,
  degreeChecksheetDocumentsTable,
  feedbackTable,
  messages,
  planItemsTable,
  planSharesTable,
  progressReportMappingsTable,
  progressReportsTable,
  quarterSchedulesTable,
  requirementCompletionsTable,
  requirementCustomizationsTable,
  scheduleEventsTable,
  studentProfilesTable,
  usageEventsTable,
} from "@workspace/db";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    next();
  },
}));

const deleted: string[] = [];
vi.mock("../lib/storage", () => ({
  isPrivateStorageConfigured: () => true,
  getPrivateObjectStorage: async () => ({
    deleteObject: async (p: string) => {
      deleted.push(p);
    },
  }),
}));

import profileRouter from "./profile";

const A = "test_delete_account_a";
const B = "test_delete_account_b";
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
  next();
});
app.use("/api", profileRouter);

async function seed(user: string) {
  await db.insert(studentProfilesTable).values({
    userId: user,
    name: "Synthetic Student",
    studentType: "first_year",
    college: "School of Engineering",
    major: "Computer Science and Engineering",
    startTerm: "fall",
    startYear: 2025,
    expectedGradTerm: "spring",
    expectedGradYear: 2029,
    currentTerm: "fall",
    currentYear: 2026,
    cumulativeGpa: "3.100",
  });
  await db.insert(progressReportsTable).values({
    userId: user,
    fileName: "apr.xlsx",
    fileSize: 10,
    contentType: "application/pdf",
    objectPath: `/objects/uploads/${user}/apr`,
    workbook: { sheets: [{ name: "APR", rows: [["MATH 11", "A-"]] }] },
  });
  const [doc] = await db
    .insert(degreeChecksheetDocumentsTable)
    .values({
      userId: user,
      title: "Checksheet",
      originalFilename: "c.pdf",
      fileSize: 10,
      mimeType: "application/pdf",
      sourceFormat: "pdf",
      fileHash: "h",
      objectPath: `/objects/uploads/${user}/checksheet`,
    })
    .returning();
  await db.insert(degreeChecksheetAnnotationsTable).values({ documentId: doc!.id, userId: user, anchorType: "page" });
  await db.insert(progressReportMappingsTable).values({ userId: user, rawCode: "MATH 11", courseCode: "MATH 11" });
  const [plan] = await db.insert(academicPlansTable).values({ userId: user, name: "Plan", planType: "degree" }).returning();
  await db.insert(planItemsTable).values({ planId: plan!.id, itemType: "course", courseCode: "MATH 12", academicYear: 2026, term: "fall" });
  await db
    .insert(requirementCustomizationsTable)
    .values({ planId: plan!.id, userId: user, entryType: "custom", targetKey: "k", updatedBy: user });
  await db.insert(requirementCompletionsTable).values({ userId: user, collegeCode: "ENGR", groupId: "g", requirementId: "r" });
  const [sched] = await db.insert(quarterSchedulesTable).values({ userId: user, name: "S", term: "fall", year: 2026 }).returning();
  await db.insert(scheduleEventsTable).values({ scheduleId: sched!.id, kind: "commitment", startTime: "09:00", endTime: "10:00" });
  await db.insert(planSharesTable).values({ studentUserId: user, advisorEmail: "advisor@scu.edu" });
  const [conv] = await db.insert(conversations).values({ userId: user, title: "Chat" }).returning();
  await db.insert(messages).values({ conversationId: conv!.id, role: "user", content: "hi" });
  await db.insert(feedbackTable).values({ userId: user, message: "m" });
  await db.insert(usageEventsTable).values({ userId: user, userEmail: `${user}@scu.edu`, userType: "scu", feature: "dashboard" });
  return { planId: plan!.id, scheduleId: sched!.id, convId: conv!.id };
}

async function counts(user: string, ids: { planId: number; scheduleId: number; convId: number }) {
  const n = async (q: Promise<unknown[]>) => (await q).length;
  return {
    profile: await n(db.select().from(studentProfilesTable).where(eq(studentProfilesTable.userId, user))),
    reports: await n(db.select().from(progressReportsTable).where(eq(progressReportsTable.userId, user))),
    checksheets: await n(db.select().from(degreeChecksheetDocumentsTable).where(eq(degreeChecksheetDocumentsTable.userId, user))),
    annotations: await n(db.select().from(degreeChecksheetAnnotationsTable).where(eq(degreeChecksheetAnnotationsTable.userId, user))),
    mappings: await n(db.select().from(progressReportMappingsTable).where(eq(progressReportMappingsTable.userId, user))),
    plans: await n(db.select().from(academicPlansTable).where(eq(academicPlansTable.userId, user))),
    planItems: await n(db.select().from(planItemsTable).where(eq(planItemsTable.planId, ids.planId))),
    customizations: await n(db.select().from(requirementCustomizationsTable).where(eq(requirementCustomizationsTable.userId, user))),
    completions: await n(db.select().from(requirementCompletionsTable).where(eq(requirementCompletionsTable.userId, user))),
    schedules: await n(db.select().from(quarterSchedulesTable).where(eq(quarterSchedulesTable.userId, user))),
    scheduleEvents: await n(db.select().from(scheduleEventsTable).where(eq(scheduleEventsTable.scheduleId, ids.scheduleId))),
    shares: await n(db.select().from(planSharesTable).where(eq(planSharesTable.studentUserId, user))),
    conversations: await n(db.select().from(conversations).where(eq(conversations.userId, user))),
    messages: await n(db.select().from(messages).where(eq(messages.conversationId, ids.convId))),
    feedback: await n(db.select().from(feedbackTable).where(eq(feedbackTable.userId, user))),
    usage: await n(db.select().from(usageEventsTable).where(eq(usageEventsTable.userId, user))),
  };
}

async function wipe() {
  for (const user of [A, B]) {
    const plans = await db.select({ id: academicPlansTable.id }).from(academicPlansTable).where(eq(academicPlansTable.userId, user));
    if (plans.length) await db.delete(planItemsTable).where(inArray(planItemsTable.planId, plans.map((p) => p.id)));
    const scheds = await db.select({ id: quarterSchedulesTable.id }).from(quarterSchedulesTable).where(eq(quarterSchedulesTable.userId, user));
    if (scheds.length) await db.delete(scheduleEventsTable).where(inArray(scheduleEventsTable.scheduleId, scheds.map((s) => s.id)));
  }
  const users = [A, B];
  await db.delete(academicPlansTable).where(inArray(academicPlansTable.userId, users));
  await db.delete(quarterSchedulesTable).where(inArray(quarterSchedulesTable.userId, users));
  await db.delete(progressReportsTable).where(inArray(progressReportsTable.userId, users));
  await db.delete(degreeChecksheetDocumentsTable).where(inArray(degreeChecksheetDocumentsTable.userId, users));
  await db.delete(progressReportMappingsTable).where(inArray(progressReportMappingsTable.userId, users));
  await db.delete(requirementCompletionsTable).where(inArray(requirementCompletionsTable.userId, users));
  await db.delete(planSharesTable).where(inArray(planSharesTable.studentUserId, users));
  await db.delete(conversations).where(inArray(conversations.userId, users));
  await db.delete(feedbackTable).where(inArray(feedbackTable.userId, users));
  await db.delete(usageEventsTable).where(inArray(usageEventsTable.userId, users));
  await db.delete(studentProfilesTable).where(inArray(studentProfilesTable.userId, users));
}

beforeEach(async () => {
  deleted.length = 0;
  await wipe();
});
afterAll(wipe);

describe("DELETE /api/profile (delete account)", () => {
  it("removes every row and stored file the student owns", async () => {
    const ids = await seed(A);
    await request(app).delete("/api/profile").set("x-test-user", A).expect(204);
    const after = await counts(A, ids);
    for (const [table, count] of Object.entries(after)) expect([table, count]).toEqual([table, 0]);
    expect(deleted.sort()).toEqual([`/objects/uploads/${A}/apr`, `/objects/uploads/${A}/checksheet`]);
  });

  it("leaves another student's data and files untouched", async () => {
    await seed(A);
    const idsB = await seed(B);
    const before = await counts(B, idsB);
    await request(app).delete("/api/profile").set("x-test-user", A).expect(204);
    expect(await counts(B, idsB)).toEqual(before);
    expect(deleted.some((p) => p.includes(B))).toBe(false);
  });

  it("requires sign-in", async () => {
    await request(app).delete("/api/profile").expect(401);
  });
});
