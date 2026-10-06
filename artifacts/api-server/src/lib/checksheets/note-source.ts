/**
 * The ONLY place outside routes/degree-checksheets.ts that touches the checksheet
 * tables, and only for provenance on a student's My Note ("From: Finance Checksheet").
 *
 * It can read exactly two columns (id, title) and every query is scoped to the
 * signed-in student's own documents, so a note can never name, or learn about, a
 * document that is not theirs. No file content, no annotations. A guard test in
 * routes/degree-checksheets.access-control.test.ts pins all of this.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, degreeChecksheetDocumentsTable } from "@workspace/db";

/** The student's own document, by id; null when it is not theirs or does not exist. */
export async function findOwnDocumentTitle(userId: string, documentId: number): Promise<{ id: number; title: string } | null> {
  const [doc] = await db
    .select({ id: degreeChecksheetDocumentsTable.id, title: degreeChecksheetDocumentsTable.title })
    .from(degreeChecksheetDocumentsTable)
    .where(and(eq(degreeChecksheetDocumentsTable.id, documentId), eq(degreeChecksheetDocumentsTable.userId, userId)))
    .limit(1);
  return doc ?? null;
}

/** Which of these document ids still exist for this student (so a note can say its source is gone). */
export async function existingOwnDocumentIds(userId: string, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const found = await db
    .select({ id: degreeChecksheetDocumentsTable.id })
    .from(degreeChecksheetDocumentsTable)
    .where(and(eq(degreeChecksheetDocumentsTable.userId, userId), inArray(degreeChecksheetDocumentsTable.id, ids)));
  return new Set(found.map((r) => r.id));
}
