/**
 * Generator script for the committed xlsx fixture file.
 * Run via: npx tsx src/__fixtures__/progress-report/generate-xlsx-fixture.ts
 *
 * The output file (workday-apr-anonymized.xlsx) mimics the column structure
 * of a real Workday Academic Progress Report xlsx export, including:
 *   - Student metadata header rows
 *   - Multiple term sections with course rows
 *   - GPA/credit summary rows that could false-positive as code patterns
 *   - Transfer credit entries
 *   - In-progress entries (no grade)
 *   - A letter-suffix course code (BIOE 158L)
 */

import * as XLSX from "xlsx";
import { writeFileSync } from "fs";
import { join } from "path";

const rows: (string | number | null)[][] = [
  // ── Student header ──────────────────────────────────────────────────────────
  ["Academic Progress Report"],
  ["Santa Clara University"],
  ["Student:", "Anonymized Student", "", "Student ID:", "00000000"],
  ["Advisor:", "Advisor Name", "", "Report Date:", "2026-01-15"],
  ["Program:", "Computer Science and Engineering", "", "Expected Grad:", "Spring 2026"],
  [],

  // ── FALL 2022-2023 ───────────────────────────────────────────────────────────
  ["FALL 2022-2023"],
  ["Course Code", "Course Title", "Units", "Grade", "Status"],
  ["CSCI 10", "Introduction to Computer Science", 5, "A", "Completed"],
  ["MATH 11", "Calculus and Analytic Geometry I", 4, "B+", "Completed"],
  ["ENGL 1A", "Critical Thinking and Writing I and II", 4, "A-", "Completed"],
  ["", "", "", "", "Term Earned:", 13, "Term GPA:", 3.73],
  [],

  // ── WINTER 2022-2023 ─────────────────────────────────────────────────────────
  ["WINTER 2022-2023"],
  ["Course Code", "Course Title", "Units", "Grade", "Status"],
  ["CSCI 60", "Introduction to C++ and Object-Oriented Programming", 5, "A", "Completed"],
  ["MATH 12", "Calculus and Analytic Geometry II", 4, "B", "Completed"],
  ["", "", "", "", "Term Earned:", 9, "Term GPA:", 3.50],
  [],

  // ── SPRING 2022-2023 ─────────────────────────────────────────────────────────
  ["SPRING 2022-2023"],
  ["Course Code", "Course Title", "Units", "Grade", "Status"],
  ["CSCI 61", "Data Structures", 4, "A-", "Completed"],
  ["MATH 13", "Calculus and Analytic Geometry III", 4, "B+", "Completed"],
  ["BIOE 158L", "Soft Biomaterials Characterization Laboratory", 1, "A", "Completed"],
  ["", "", "", "", "Term Earned:", 9, "Term GPA:", 3.67],
  [],

  // ── Transfer Credit ──────────────────────────────────────────────────────────
  ["Transfer Credit"],
  ["Course Code", "Course Title", "Units", "Grade", "Status"],
  ["XFER 101", "Transferred General Education Credit", 3, "CR", "Transfer"],
  ["XFER 102", "Transferred Math Credit", 4, "CR", "Transfer"],
  ["", "", "", "", "Transfer Credits:", 7],
  [],

  // ── In Progress ───────────────────────────────────────────────────────────────
  ["In Progress - FALL 2025-2026"],
  ["Course Code", "Course Title", "Units", "Grade", "Status"],
  ["CSEN 12", "Abstract Data Types and Data Structures", 4, null, "In Progress"],
  ["PHYS 31", "Physics for Scientists and Engineers I", 5, null, "In Progress"],
  [],

  // ── Cumulative summary ────────────────────────────────────────────────────────
  ["Cumulative Credits Attempted:", 38, "Cumulative Credits Earned:", 31, "Cumulative GPA:", 3.64],
];

const XLSXmod = (XLSX as any).default ?? XLSX;
const ws = XLSXmod.utils.aoa_to_sheet(rows);
const wb = XLSXmod.utils.book_new();
XLSXmod.utils.book_append_sheet(wb, ws, "Progress Report");

const outPath = join(import.meta.dirname, "workday-apr-anonymized.xlsx");
XLSXmod.writeFile(wb, outPath);
console.log(`Written: ${outPath}`);
