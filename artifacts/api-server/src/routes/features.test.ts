/**
 * Feature tests for:
 * 1. Plan-scoped program selections (programs field on plans)
 * 2. Completed-area plan items (term="completed", academicYear=0, provenance)
 * 3. Progress report route + parser unit tests
 *
 * Auth is stubbed (x-test-user header → req.userId).
 * Storage-dependent progress report tests mock the storage service.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { inArray, eq } from "drizzle-orm";

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    const userId = req.header("x-test-user");
    if (!userId) return res.status(401).json({ error: "Sign in required" });
    req.userId = userId;
    next();
  },
}));

// Controllable mock storage state for progress-report tests (no real
// backend needed). `storageError: true` simulates a storage-backend failure
// during metadata lookup (the one remaining async step that can throw) —
// ownership itself is a pure path-hash check under the current
// PrivateObjectStorage abstraction, so it can no longer fail asynchronously.
const mockStorage = {
  file: null as null | {
    size: number;
    storageError?: boolean;
    content?: Buffer;
  },
};

// Mock the storage abstraction so progress-report tests don't need a real backend.
vi.mock("../lib/storage", async () => {
  const { createHash } = await import("crypto");
  const isUploadPathOwnedBy = (objectPath: string, owner: string) => {
    const segment = createHash("sha256").update(owner).digest("hex").slice(0, 16);
    return objectPath.startsWith(`/objects/uploads/${segment}/`);
  };
  class MockObjectNotFoundError extends Error {
    constructor() { super("Object not found"); this.name = "ObjectNotFoundError"; }
  }
  const provider = {
    isUploadPathOwnedBy,
    createUploadTarget: vi.fn().mockImplementation(async (owner: string) => {
      const segment = createHash("sha256").update(owner).digest("hex").slice(0, 16);
      return {
        uploadURL: `https://mock-upload.test/${segment}/${Date.now()}`,
        objectPath: `/objects/uploads/${segment}/${Date.now()}`,
      };
    }),
    finalizeUpload: vi.fn().mockImplementation(async () => {
      if (!mockStorage.file) throw new Error("no object");
    }),
    canRead: vi.fn().mockImplementation(async (objectPath: string, userId?: string) => {
      if (!userId) return false;
      return isUploadPathOwnedBy(objectPath, userId);
    }),
    getMetadata: vi.fn().mockImplementation(async () => {
      if (!mockStorage.file) throw new MockObjectNotFoundError();
      if (mockStorage.file.storageError) throw new Error("storage backend error");
      return { size: mockStorage.file.size, contentType: "application/pdf" };
    }),
    downloadObject: vi.fn().mockImplementation(async () => {
      if (!mockStorage.file) throw new MockObjectNotFoundError();
      const { Readable } = await import("stream");
      const content = mockStorage.file.content ?? Buffer.from("plain text no courses");
      return {
        stream: Readable.from([content]),
        contentType: "application/pdf",
        size: content.length,
      };
    }),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
  return {
    getPrivateObjectStorage: () => provider,
    isPrivateStorageConfigured: () => true,
    ObjectNotFoundError: MockObjectNotFoundError,
  };
});

const { db, academicPlansTable, planItemsTable, progressReportsTable } = await import("@workspace/db");
const plansRouter = (await import("./plans")).default;
const storageRouter = (await import("./storage")).default;
const { COURSES } = await import("../data/courses");
const { uploadPathOwnerSegment } = await import("../lib/uploadPath");

// Real routes call req.log.error/warn/info (populated by pino-http in the
// real app). Without a stub here, those calls throw on undefined and get
// swallowed by Express's default error handler — masking the route's actual
// intended status code behind a generic 500 for ANY subsequent error,
// whether or not it matches. Stub it so tests exercise the real code path.
const stubLogger = (req: any, _res: any, next: any) => {
  req.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
  next();
};

const plansApp = express();
plansApp.use(express.json());
plansApp.use(stubLogger);
plansApp.use("/api", plansRouter);

const storageApp = express();
storageApp.use(express.json());
storageApp.use(stubLogger);
storageApp.use("/api", storageRouter);

// Set PRIVATE_OBJECT_DIR so isStorageAvailable() returns true
process.env.PRIVATE_OBJECT_DIR = "/test-bucket/private";

const RUN = Date.now();
const USER_A = `test-features-a-${RUN}`;
const USER_B = `test-features-b-${RUN}`;
const TEST_USERS = [USER_A, USER_B];

// Real catalog courses
const [C1, C2, C3] = COURSES.slice(0, 3).map((c) => c.code);

const asA = (r: request.Test) => r.set("x-test-user", USER_A);
const asB = (r: request.Test) => r.set("x-test-user", USER_B);

async function cleanup() {
  // Cleanup plans
  const plans = await db
    .select({ id: academicPlansTable.id })
    .from(academicPlansTable)
    .where(inArray(academicPlansTable.userId, TEST_USERS));
  const ids = plans.map((p) => p.id);
  if (ids.length > 0) {
    await db.delete(planItemsTable).where(inArray(planItemsTable.planId, ids));
    await db.delete(academicPlansTable).where(inArray(academicPlansTable.id, ids));
  }
  // Cleanup progress reports
  for (const userId of TEST_USERS) {
    await db.delete(progressReportsTable).where(eq(progressReportsTable.userId, userId));
  }
}

async function degreePlanId(user: string): Promise<number> {
  const res = await request(plansApp)
    .get("/api/plans")
    .set("x-test-user", user)
    .expect(200);
  return res.body.plans.find((p: any) => p.planType === "degree").id;
}

beforeAll(async () => {
  expect(COURSES.length).toBeGreaterThanOrEqual(3);
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

// =============================================================================
// Feature 1: Plan-scoped program selections
// =============================================================================

describe("plan programs: validation", () => {
  it("accepts a PATCH with valid programs", async () => {
    const planId = await degreePlanId(USER_A);
    const res = await asA(request(plansApp).patch(`/api/plans/${planId}`))
      .send({
        name: "My Degree Plan",
        programs: {
          additionalMajors: ["MATH"],
          minors: ["philosophy"],
          professionalGoals: ["Pre-Med"],
        },
      })
      .expect(200);
    expect(res.body.programs).toBeDefined();
    expect(res.body.programs.additionalMajors).toContain("MATH");
    expect(res.body.programs.minors).toContain("philosophy");
    expect(res.body.programs.professionalGoals).toEqual([
      expect.objectContaining({
        id: "legacy-pre-med-1",
        name: "Pre-Med",
        notes: "",
        courseCodes: [],
        placeholders: [],
      }),
    ]);
  });

  it("returns the programs field on GET /plans/:id", async () => {
    const planId = await degreePlanId(USER_A);
    const res = await asA(request(plansApp).get(`/api/plans/${planId}`)).expect(200);
    expect(res.body.programs).toBeDefined();
    expect(res.body.programs.additionalMajors).toContain("MATH");
  });

  it("returns programs on GET /plans list", async () => {
    const res = await asA(request(plansApp).get("/api/plans")).expect(200);
    const plan = res.body.plans.find((p: any) => p.planType === "degree");
    expect(plan.programs).toBeDefined();
  });

  it("deduplicates entries case-insensitively", async () => {
    const planId = await degreePlanId(USER_A);
    const res = await asA(request(plansApp).patch(`/api/plans/${planId}`))
      .send({
        name: "My Degree Plan",
        programs: {
          additionalMajors: ["MATH", "math", "Math"],
          minors: [],
          professionalGoals: [],
        },
      })
      .expect(200);
    expect(res.body.programs.additionalMajors).toHaveLength(1);
  });

  it("rejects programs entries exceeding max 50 chars", async () => {
    const planId = await degreePlanId(USER_A);
    await asA(request(plansApp).patch(`/api/plans/${planId}`))
      .send({
        name: "My Plan",
        programs: {
          additionalMajors: ["A".repeat(51)],
          minors: [],
          professionalGoals: [],
        },
      })
      .expect(400);
  });

  it("rejects programs arrays with more than 8 entries", async () => {
    const planId = await degreePlanId(USER_A);
    await asA(request(plansApp).patch(`/api/plans/${planId}`))
      .send({
        name: "My Plan",
        programs: {
          additionalMajors: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
          minors: [],
          professionalGoals: [],
        },
      })
      .expect(400);
  });

  it("rejects empty string entries in programs arrays", async () => {
    const planId = await degreePlanId(USER_A);
    await asA(request(plansApp).patch(`/api/plans/${planId}`))
      .send({
        name: "My Plan",
        programs: {
          additionalMajors: [""],
          minors: [],
          professionalGoals: [],
        },
      })
      .expect(400);
  });

  it("accepts null programs (clears them)", async () => {
    const planId = await degreePlanId(USER_A);
    const res = await asA(request(plansApp).patch(`/api/plans/${planId}`))
      .send({ name: "My Plan", programs: null })
      .expect(200);
    // After setting to null, programs should be the empty default
    expect(res.body.programs).toBeDefined();
  });
});

// =============================================================================
// Feature 2: Completed-area items
// =============================================================================

describe("completed-area plan items", () => {
  it("adds a course to the completed area with academicYear=0", async () => {
    const planId = await degreePlanId(USER_A);
    const res = await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({
        itemType: "course",
        courseCode: C1,
        term: "completed",
        academicYear: 0,
      })
      .expect(201);
    expect(res.body.term).toBe("completed");
    expect(res.body.academicYear).toBe(0);
    expect(res.body.provenance).toBe("student_asserted");
    // cleanup
    await asA(request(plansApp).delete(`/api/plans/${planId}/items/${res.body.id}`)).expect(204);
  });

  it("rejects term=completed with non-zero academicYear", async () => {
    const planId = await degreePlanId(USER_A);
    await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({
        itemType: "course",
        courseCode: C1,
        term: "completed",
        academicYear: 2026,
      })
      .expect(400);
  });

  it("rejects requirement_placeholder in the completed area", async () => {
    const planId = await degreePlanId(USER_A);
    await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({
        itemType: "requirement_placeholder",
        requirementLabel: "Some requirement",
        term: "completed",
        academicYear: 0,
      })
      .expect(400);
  });

  it("defaults provenance to student_asserted when adding to completed area", async () => {
    const planId = await degreePlanId(USER_A);
    const res = await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({
        itemType: "course",
        courseCode: C2,
        term: "completed",
        academicYear: 0,
      })
      .expect(201);
    expect(res.body.provenance).toBe("student_asserted");
    await asA(request(plansApp).delete(`/api/plans/${planId}/items/${res.body.id}`)).expect(204);
  });

  it("allows explicit provenance=report_imported in the completed area", async () => {
    const planId = await degreePlanId(USER_A);
    const res = await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({
        itemType: "course",
        courseCode: C3,
        term: "completed",
        academicYear: 0,
        provenance: "report_imported",
      })
      .expect(201);
    expect(res.body.provenance).toBe("report_imported");
    await asA(request(plansApp).delete(`/api/plans/${planId}/items/${res.body.id}`)).expect(204);
  });

  it("can move an item into the completed area (academicYear=0 set automatically)", async () => {
    const planId = await degreePlanId(USER_A);
    // Add a normal course first
    const item = await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({ itemType: "course", courseCode: C1, term: "fall", academicYear: 2026 })
      .expect(201);

    // Move to completed
    const moved = await asA(request(plansApp).patch(`/api/plans/${planId}/items/${item.body.id}`))
      .send({ term: "completed", academicYear: 0 })
      .expect(200);
    expect(moved.body.term).toBe("completed");
    expect(moved.body.academicYear).toBe(0);

    await asA(request(plansApp).delete(`/api/plans/${planId}/items/${moved.body.id}`)).expect(204);
  });

  it("can move an item out of the completed area into a regular term", async () => {
    const planId = await degreePlanId(USER_A);
    // Add to completed
    const item = await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({ itemType: "course", courseCode: C1, term: "completed", academicYear: 0 })
      .expect(201);

    // Move to regular term
    const moved = await asA(request(plansApp).patch(`/api/plans/${planId}/items/${item.body.id}`))
      .send({ term: "fall", academicYear: 2027 })
      .expect(200);
    expect(moved.body.term).toBe("fall");
    expect(moved.body.academicYear).toBe(2027);

    await asA(request(plansApp).delete(`/api/plans/${planId}/items/${moved.body.id}`)).expect(204);
  });

  it("reindexes positions in completed bucket after item removal", async () => {
    const planId = await degreePlanId(USER_A);
    // Add 3 courses to completed
    const a = await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({ itemType: "course", courseCode: C1, term: "completed", academicYear: 0 })
      .expect(201);
    const b = await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({ itemType: "course", courseCode: C2, term: "completed", academicYear: 0, allowDuplicate: true })
      .expect(201);
    const c = await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({ itemType: "course", courseCode: C3, term: "completed", academicYear: 0, allowDuplicate: true })
      .expect(201);
    expect([a.body.position, b.body.position, c.body.position]).toEqual([0, 1, 2]);

    // Move middle item out to get gap reindexing in source
    await asA(request(plansApp).patch(`/api/plans/${planId}/items/${b.body.id}`))
      .send({ term: "fall", academicYear: 2028 })
      .expect(200);

    // Get remaining completed items
    const detail = await asA(request(plansApp).get(`/api/plans/${planId}`)).expect(200);
    const completed = detail.body.items
      .filter((i: any) => i.term === "completed")
      .sort((x: any, y: any) => x.position - y.position);
    // Should be contiguous 0, 1
    expect(completed.map((i: any) => i.position)).toEqual([0, 1]);

    // Cleanup
    for (const item of detail.body.items) {
      await asA(request(plansApp).delete(`/api/plans/${planId}/items/${item.id}`)).expect(204);
    }
  });

  it("rejects placeholder move to completed area via PATCH", async () => {
    const planId = await degreePlanId(USER_A);
    const ph = await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({
        itemType: "requirement_placeholder",
        requirementLabel: "Religion",
        term: "fall",
        academicYear: 2026,
      })
      .expect(201);

    await asA(request(plansApp).patch(`/api/plans/${planId}/items/${ph.body.id}`))
      .send({ term: "completed", academicYear: 0 })
      .expect(400);

    await asA(request(plansApp).delete(`/api/plans/${planId}/items/${ph.body.id}`)).expect(204);
  });
});

describe("completed area: canonical representation and round-trips", () => {
  it("term-based move to completed sets bucket + default provenance; move back to a term works", async () => {
    const planId = await degreePlanId(USER_A);
    const created = await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({ itemType: "course", courseCode: COURSES[3]!.code, term: "fall", academicYear: 2026, allowDuplicate: true })
      .expect(201);

    // Drag/mismatch-style move: term="completed", academicYear=0 only.
    const done = await asA(request(plansApp).patch(`/api/plans/${planId}/items/${created.body.id}`))
      .send({ term: "completed", academicYear: 0 })
      .expect(200);
    expect(done.body.term).toBe("completed");
    expect(done.body.academicYear).toBe(0);
    expect(done.body.bucket).toBe("completed");
    expect(done.body.completionSource).toBe("manually_marked");

    // Move back to a normal term through the standard UI payload.
    const back = await asA(request(plansApp).patch(`/api/plans/${planId}/items/${created.body.id}`))
      .send({ term: "winter", academicYear: 2027, bucket: "planned", completionSource: null })
      .expect(200);
    expect(back.body.term).toBe("winter");
    expect(back.body.academicYear).toBe(2027);
    expect(back.body.bucket).toBe("planned");
    expect(back.body.completionSource).toBeNull();

    await asA(request(plansApp).delete(`/api/plans/${planId}/items/${created.body.id}`)).expect(204);
  });

  it("bucket-based POST/PATCH normalize term to 'completed'/year 0", async () => {
    const planId = await degreePlanId(USER_A);
    const created = await asA(request(plansApp).post(`/api/plans/${planId}/items`))
      .send({ itemType: "course", courseCode: COURSES[4]!.code, term: "fall", academicYear: 2026, bucket: "completed", completionSource: "transfer_credit", allowDuplicate: true })
      .expect(201);
    expect(created.body.term).toBe("completed");
    expect(created.body.academicYear).toBe(0);
    expect(created.body.bucket).toBe("completed");

    // Moving out of completed without a destination term is rejected.
    await asA(request(plansApp).patch(`/api/plans/${planId}/items/${created.body.id}`))
      .send({ bucket: "planned", completionSource: null })
      .expect(400);

    // Term-only move back also clears the bucket and provenance.
    const back = await asA(request(plansApp).patch(`/api/plans/${planId}/items/${created.body.id}`))
      .send({ term: "spring", academicYear: 2027 })
      .expect(200);
    expect(back.body.bucket).toBe("planned");
    expect(back.body.completionSource).toBeNull();
    expect(back.body.term).toBe("spring");

    await asA(request(plansApp).delete(`/api/plans/${planId}/items/${created.body.id}`)).expect(204);
  });
});

describe("plan programs: programs-only PATCH and scenario copies", () => {
  it("accepts a PATCH body containing only programs", async () => {
    const planId = await degreePlanId(USER_A);
    const programs = { additionalMajors: ["Accounting"], minors: ["Mathematics"], professionalGoals: [] };
    const res = await asA(request(plansApp).patch(`/api/plans/${planId}`))
      .send({ programs })
      .expect(200);
    expect(res.body.programs).toEqual(programs);
    // clean up
    await asA(request(plansApp).patch(`/api/plans/${planId}`))
      .send({ programs: { additionalMajors: [], minors: [], professionalGoals: [] } })
      .expect(200);
  });

  it("normalizes legacy professional goals and keeps structured goals isolated through copy and duplicate", async () => {
    const planId = await degreePlanId(USER_A);
    const programs = {
      additionalMajors: ["Accounting"],
      minors: [],
      professionalGoals: [{
        id: "medical-school",
        name: "Medical School",
        notes: "Student planning goal",
        courseCodes: ["CHEM 11"],
        placeholders: ["Clinical experience planning"],
      }],
    };
    const updated = await asA(request(plansApp).patch(`/api/plans/${planId}`)).send({ programs }).expect(200);
    expect(updated.body.programs).toEqual(programs);

    const copied = await asA(request(plansApp).post(`/api/plans`))
      .send({ name: "Scenario copy", copyFromPlanId: planId })
      .expect(201);
    expect(copied.body.programs).toEqual(programs);

    const dup = await asA(request(plansApp).post(`/api/plans/${copied.body.id}/duplicate`))
      .send({ name: "Scenario dup" })
      .expect(201);
    expect(dup.body.programs).toEqual(programs);

    await asA(request(plansApp).patch(`/api/plans/${copied.body.id}`)).send({
      programs: {
        ...programs,
        professionalGoals: [{
          ...programs.professionalGoals[0],
          name: "CPA Preparation",
          courseCodes: [],
        }],
      },
    }).expect(200);
    const original = await asA(request(plansApp).get(`/api/plans/${planId}`)).expect(200);
    const duplicate = await asA(request(plansApp).get(`/api/plans/${dup.body.id}`)).expect(200);
    expect(original.body.programs.professionalGoals[0].name).toBe("Medical School");
    expect(duplicate.body.programs.professionalGoals[0].name).toBe("Medical School");

    await asA(request(plansApp).delete(`/api/plans/${dup.body.id}`)).expect(204);
    await asA(request(plansApp).delete(`/api/plans/${copied.body.id}`)).expect(204);
    await asA(request(plansApp).patch(`/api/plans/${planId}`))
      .send({ programs: { additionalMajors: [], minors: [], professionalGoals: [] } })
      .expect(200);
  });
});

describe("degree requirements: plan-scoped scenario programs", () => {
  it("scenarioMajors/scenarioMinors query params add requirement groups", async () => {
    const { db: reqDb, studentProfilesTable } = await import("@workspace/db");
    const requirementsRouter = (await import("./requirements")).default;
    const reqApp = express();
    reqApp.use(express.json());
    reqApp.use("/api", requirementsRouter);

    await reqDb.insert(studentProfilesTable).values({
      userId: USER_A,
      name: "Test Student",
      studentType: "first_year",
      college: "School of Engineering",
      major: "Computer Science and Engineering",
      startTerm: "fall",
      startYear: 2025,
      expectedGradTerm: "spring",
      expectedGradYear: 2029,
      currentTerm: "fall",
      currentYear: 2026,
    } as any);
    try {
      const base = await asA(request(reqApp).get("/api/requirements")).expect(200);
      const baseTitles = base.body.groups.map((g: any) => g.title);

      const withScenario = await asA(
        request(reqApp).get("/api/requirements?scenarioMajors=Accounting&scenarioMinors=Mathematics"),
      ).expect(200);
      const titles = withScenario.body.groups.map((g: any) => g.title);

      expect(withScenario.body.groups.length).toBeGreaterThan(base.body.groups.length);
      expect(titles.join(" ")).toMatch(/Accounting/);
      expect(titles.join(" ")).toMatch(/Mathematics/);
      expect(baseTitles.join(" ")).not.toMatch(/Accounting/);
    } finally {
      await reqDb.delete(studentProfilesTable).where(eq(studentProfilesTable.userId, USER_A));
    }
  });

  it("returns verified minor requirement groups with eligible course choices", async () => {
    const { db: reqDb, studentProfilesTable } = await import("@workspace/db");
    const requirementsRouter = (await import("./requirements")).default;
    const reqApp = express();
    reqApp.use(express.json());
    reqApp.use("/api", requirementsRouter);
    await reqDb.insert(studentProfilesTable).values({
      userId: USER_A,
      name: "Test Student",
      studentType: "first_year",
      college: "School of Engineering",
      major: "Computer Science and Engineering",
      startTerm: "fall",
      startYear: 2025,
      expectedGradTerm: "spring",
      expectedGradYear: 2029,
      currentTerm: "fall",
      currentYear: 2026,
    } as any);
    try {
      const result = await asA(
        request(reqApp).get("/api/requirements?scenarioMinors=MATH-MIN"),
      ).expect(200);
      const group = result.body.groups.find((candidate: any) => candidate.id === "minor-math-min");
      expect(group).toMatchObject({
        // Not yet officially declared (only present as a plan-scoped
        // scenario minor) — must be labeled proposed, never declared.
        title: "Minor Requirements — Mathematics (proposed)",
        sourceUrl: expect.stringMatching(/^https:\/\/www\.scu\.edu\//),
        academicYear: "2026-27 Undergraduate Bulletin",
      });
      expect(
        group.notes.some((n: string) =>
          n.includes("Planning only — official declaration must be completed through SCU"),
        ),
      ).toBe(true);
      expect(group.items).toContainEqual(expect.objectContaining({
        label: "Linear algebra or differential equations — choose 1",
        courses: ["MATH 52", "MATH 53"],
      }));
    } finally {
      await reqDb.delete(studentProfilesTable).where(eq(studentProfilesTable.userId, USER_A));
    }
  });

  it("shows student-selected professional goal courses only for that plan request", async () => {
    const { db: reqDb, studentProfilesTable } = await import("@workspace/db");
    const requirementsRouter = (await import("./requirements")).default;
    const reqApp = express();
    reqApp.use(express.json());
    reqApp.use("/api", requirementsRouter);
    await reqDb.insert(studentProfilesTable).values({
      userId: USER_A,
      name: "Test Student",
      studentType: "first_year",
      college: "School of Engineering",
      major: "Computer Science and Engineering",
      startTerm: "fall",
      startYear: 2025,
      expectedGradTerm: "spring",
      expectedGradYear: 2029,
      currentTerm: "fall",
      currentYear: 2026,
    } as any);
    try {
      const goal = encodeURIComponent(JSON.stringify([{
        id: "medical-school",
        name: "Medical School",
        notes: "Student planning goal",
        courseCodes: ["CHEM 11"],
        placeholders: ["Clinical experience"],
      }]));
      const withGoal = await asA(request(reqApp).get(`/api/requirements?professionalGoals=${goal}`)).expect(200);
      const withoutGoal = await asA(request(reqApp).get("/api/requirements")).expect(200);
      expect(withGoal.body.groups).toContainEqual(expect.objectContaining({
        id: "professional-medical-school",
        title: "Professional Preparation — Medical School",
      }));
      expect(withoutGoal.body.groups.map((group: any) => group.id)).not.toContain("professional-medical-school");
    } finally {
      await reqDb.delete(studentProfilesTable).where(eq(studentProfilesTable.userId, USER_A));
    }
  });
});

describe("storage: upload URL + object read routes", () => {
  const segA = uploadPathOwnerSegment(USER_A);

  beforeEach(() => {
    mockStorage.file = null;
  });

  it("rejects unauthenticated upload-url requests", async () => {
    await request(storageApp)
      .post("/api/storage/uploads/request-url")
      .send({ name: "r.pdf", size: 1000, contentType: "application/pdf" })
      .expect(401);
  });

  it("rejects a malformed upload-url request body", async () => {
    await asA(request(storageApp).post("/api/storage/uploads/request-url"))
      .send({ name: "", size: -1 })
      .expect(400);
  });

  it("mints an owner-bound objectPath and echoes metadata", async () => {
    const res = await asA(request(storageApp).post("/api/storage/uploads/request-url"))
      .send({ name: "r.pdf", size: 1000, contentType: "application/pdf" })
      .expect(200);
    expect(res.body.objectPath).toMatch(new RegExp(`^/objects/uploads/${segA}/`));
    expect(typeof res.body.uploadURL).toBe("string");
    expect(res.body.metadata).toEqual({ name: "r.pdf", size: 1000, contentType: "application/pdf" });
  });

  it("rejects unauthenticated object reads", async () => {
    await request(storageApp).get(`/api/storage/objects/uploads/${segA}/x`).expect(401);
  });

  it("404s when the object doesn't exist", async () => {
    mockStorage.file = null;
    await asA(request(storageApp).get(`/api/storage/objects/uploads/${segA}/missing`)).expect(404);
  });

  it("403s when a different user requests an object minted for someone else", async () => {
    mockStorage.file = { size: 100, content: Buffer.from("hello") };
    await asB(request(storageApp).get(`/api/storage/objects/uploads/${segA}/x`)).expect(403);
  });

  it("200s and streams content for the owning user", async () => {
    mockStorage.file = { size: 100, content: Buffer.from("hello") };
    const res = await asA(request(storageApp).get(`/api/storage/objects/uploads/${segA}/x`)).expect(200);
    expect(Buffer.isBuffer(res.body) ? res.body.toString() : res.text).toBe("hello");
  });
});
