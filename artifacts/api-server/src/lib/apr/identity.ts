const STUDENT_ID_RE = /\bSTUDENT\s*ID\b\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,19})\b/;

/**
 * A student identifier, ONLY when the file states it in an unambiguous
 * "Student ID: <value>" form. Undefined otherwise — never guessed from loose
 * digits. Used to refuse a file that names a different student; it has nothing
 * to do with academic content.
 */
export function extractStudentId(text: string): string | undefined {
  const m = STUDENT_ID_RE.exec(text.toUpperCase());
  return m ? m[1] : undefined;
}
