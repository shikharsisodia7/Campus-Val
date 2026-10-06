/**
 * Audit of the department layer and sample plans against the Bulletin tree.
 * Counts and keys only: it reads no student's plan, grades or note text.
 *
 * Finds notes and overrides that point at a requirement the Bulletin no longer
 * has, rows filed under a program or edition that does not exist, duplicate
 * overrides, student customizations whose target exists in no program's tree,
 * and sample-plan courses that are not in the catalog.
 */
import { db, departmentRequirementNotesTable, departmentRequirementOverridesTable, requirementCustomizationsTable, samplePlanItemsTable, samplePlansTable } from "@workspace/db";
import { findCourse } from "../../data/courses";
import { findBulletinEdition } from "../requirements-source/editions";
import { findProgram, groupKeyOf, listPrograms, programTree } from "./programs";

export interface LayerFinding {
  code: string;
  severity: "error" | "warning" | "info";
  entity: "note" | "override" | "student_customization" | "sample_plan";
  id: string;
  message: string;
}

export interface LayerAudit {
  counts: {
    notes: Record<string, number>;
    overrides: number;
    studentCustomizationRows: number;
    samplePlans: number;
    samplePlanItems: number;
    findings: number;
  };
  findings: LayerFinding[];
}

export async function auditDepartmentLayer(): Promise<LayerAudit> {
  const findings: LayerFinding[] = [];
  const add = (f: LayerFinding) => findings.push(f);

  // Every key a requirement can have in any program's tree.
  const groupKeys = new Set<string>();
  const itemKeys = new Set<string>();
  for (const program of listPrograms()) {
    for (const g of programTree(program.programKey)!.tree) {
      groupKeys.add(g.stableKey);
      for (const i of g.items) itemKeys.add(i.stableKey);
    }
  }

  const notes = await db.select().from(departmentRequirementNotesTable);
  const byStatus: Record<string, number> = {};
  for (const n of notes) {
    byStatus[n.status] = (byStatus[n.status] ?? 0) + 1;
    const id = String(n.id);
    if (!findBulletinEdition(n.bulletinEdition)) add({ code: "note_edition_not_loaded", severity: "error", entity: "note", id, message: `Edition ${n.bulletinEdition} is not loaded.` });
    if (!findProgram(n.programKey)) {
      add({ code: "note_program_missing", severity: "error", entity: "note", id, message: `Program ${n.programKey} does not exist.` });
      continue;
    }
    if (n.status === "unmapped") {
      add({ code: "note_unmapped", severity: "info", entity: "note", id, message: `Waiting to be placed on a requirement of ${n.programKey}.` });
      continue;
    }
    if (n.targetKey && !itemKeys.has(n.targetKey) && !groupKeys.has(n.targetKey)) {
      add({ code: "note_target_missing", severity: "error", entity: "note", id, message: `Mapped to ${n.targetKey}, which is not in the Bulletin data.` });
    } else if (n.targetKey && !programTree(n.programKey)!.tree.some((g) => g.stableKey === groupKeyOf(n.targetKey!))) {
      add({ code: "note_target_outside_program", severity: "error", entity: "note", id, message: `Mapped to ${n.targetKey}, which this program's students do not see.` });
    }
    if (n.status === "published" && n.origin === "imported" && !n.reviewedBy) {
      add({ code: "note_published_unreviewed", severity: "info", entity: "note", id, message: "Imported and published without a person's review; students see it labelled as such." });
    }
  }

  const overrides = await db.select().from(departmentRequirementOverridesTable);
  const seen = new Set<string>();
  for (const o of overrides) {
    const id = String(o.id);
    if (!findBulletinEdition(o.bulletinEdition)) add({ code: "override_edition_not_loaded", severity: "error", entity: "override", id, message: `Edition ${o.bulletinEdition} is not loaded.` });
    const dup = `${o.bulletinEdition}|${o.targetKey}`;
    if (seen.has(dup)) add({ code: "override_duplicate", severity: "error", entity: "override", id, message: `Two overrides for ${o.targetKey}.` });
    seen.add(dup);
    if (o.entryType === "edit" && !itemKeys.has(o.targetKey)) {
      add({ code: "override_target_missing", severity: "error", entity: "override", id, message: `${o.targetKey} is not in the Bulletin data.` });
    }
    if (o.entryType === "added" && (!o.groupKey || !groupKeys.has(o.groupKey))) {
      add({ code: "override_group_missing", severity: "error", entity: "override", id, message: `Added to ${o.groupKey}, which is not a Bulletin group.` });
    }
    for (const code of o.courseCodes) {
      if (!findCourse(code)) add({ code: "override_course_not_in_catalog", severity: "warning", entity: "override", id, message: `${code} is not in the catalog.` });
    }
  }

  // Student rows: keys only. A row for a program that is simply not in that plan is normal.
  const students = await db
    .select({ id: requirementCustomizationsTable.id, entryType: requirementCustomizationsTable.entryType, targetKey: requirementCustomizationsTable.targetKey, groupKey: requirementCustomizationsTable.groupKey })
    .from(requirementCustomizationsTable);
  for (const r of students) {
    const known = r.entryType === "source_edit" ? itemKeys.has(r.targetKey) || r.targetKey.includes("#dept:") : !!r.groupKey && groupKeys.has(r.groupKey);
    if (!known) add({ code: "student_customization_target_missing", severity: "warning", entity: "student_customization", id: String(r.id), message: "Points at a requirement that is in no program's Bulletin data." });
  }

  const plans = await db.select().from(samplePlansTable);
  const items = await db.select().from(samplePlanItemsTable);
  for (const p of plans) {
    for (const i of items.filter((x) => x.samplePlanId === p.id)) {
      if (i.itemType === "course" && i.courseCode && !findCourse(i.courseCode)) {
        add({ code: "sample_plan_course_not_in_catalog", severity: "warning", entity: "sample_plan", id: p.slug, message: `${i.courseCode} (year ${i.year}, ${i.term}) is not in the catalog; it loads as a placeholder.` });
      }
    }
    if (p.programKey && !findProgram(p.programKey)) add({ code: "sample_plan_program_missing", severity: "error", entity: "sample_plan", id: p.slug, message: `Program ${p.programKey} does not exist.` });
  }

  return {
    counts: { notes: byStatus, overrides: overrides.length, studentCustomizationRows: students.length, samplePlans: plans.length, samplePlanItems: items.length, findings: findings.length },
    findings,
  };
}
