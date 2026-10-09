import { useState } from "react";
import { Landmark } from "lucide-react";
import type { DepartmentNote, RequirementGroup, RequirementItem } from "@workspace/api-client-react";

/**
 * Department Notes: advising guidance a department stands behind, shown beside
 * a requirement. Deliberately a different colour, icon and label from the
 * student's own "My Note" (see CustomizationNote): a student must never mistake
 * their own note for official department guidance, or the other way round.
 * Read-only here; only a department administrator can write them (Program
 * Requirements Admin).
 */

const COLLAPSE_AFTER = 240;

function sourceText(note: DepartmentNote): string {
  const origin = note.origin === "imported" ? "from the department's published checklist" : "written by the department";
  const status = note.origin === "imported" && !note.reviewed ? " · imported, not yet reviewed by the department" : "";
  return `${note.sourceLabel ?? note.programTitle} ${origin}${status}`;
}

function NoteCard({ note, testId }: { note: DepartmentNote; testId: string }) {
  const [open, setOpen] = useState(false);
  const long = note.body.length > COLLAPSE_AFTER;
  const shown = long && !open ? `${note.body.slice(0, COLLAPSE_AFTER).trimEnd()}…` : note.body;
  return (
    <div
      className="mt-1 rounded border border-amber-200 bg-amber-50/70 px-1.5 py-1 text-[11px] leading-relaxed text-amber-950"
      data-testid={testId}
      data-note-origin={note.origin}
    >
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
        <Landmark className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Department Note</span>
        <span className="font-normal normal-case tracking-normal text-amber-800">· {note.programTitle}</span>
      </div>
      {note.title && (
        <p className="mt-0.5 font-semibold" data-testid={`${testId}-title`}>
          {note.title}
        </p>
      )}
      <p className="mt-0.5 whitespace-pre-line break-words">{shown}</p>
      {note.courseCodes && note.courseCodes.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1" aria-label="Courses this note refers to" data-testid={`${testId}-courses`}>
          {note.courseCodes.map((code) => (
            <li key={code}>
              <a
                href={`/courses?q=${encodeURIComponent(code)}`}
                className="inline-block rounded border border-amber-300 bg-white/70 px-1 font-mono text-[10px] text-amber-900 underline-offset-2 hover:underline"
                title={`Look up ${code} in the course catalog`}
              >
                {code}
              </a>
            </li>
          ))}
        </ul>
      )}
      {long && (
        <button
          type="button"
          className="mt-0.5 text-[10px] font-medium text-amber-900 underline underline-offset-2"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
      <p className="mt-0.5 text-[9px] leading-snug text-amber-800">
        {sourceText(note)}
        {note.sourceUrl && (
          <>
            {" · "}
            <a href={note.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              source
            </a>
          </>
        )}
      </p>
    </div>
  );
}

export function DepartmentNotes({ item }: { item: RequirementItem }) {
  const notes = item.departmentNotes;
  if (!notes || notes.length === 0) return null;
  return (
    <div data-testid={`department-notes-${item.id}`}>
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} testId={`department-note-${note.id}`} />
      ))}
    </div>
  );
}

export function GroupDepartmentNotes({ group }: { group: RequirementGroup }) {
  const notes = group.departmentNotes;
  if (!notes || notes.length === 0) return null;
  return (
    <div data-testid={`group-department-notes-${group.id}`}>
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} testId={`group-department-note-${note.id}`} />
      ))}
    </div>
  );
}

/** "Department edit" / "Added by department": the wording is not the Bulletin's. */
export function DepartmentMarks({ item }: { item: RequirementItem }) {
  const d = item.department;
  if (!d) return null;
  const chip = "rounded border px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide border-amber-200 bg-amber-50 text-amber-800";
  return (
    <span className="ml-1.5 inline-flex flex-wrap items-center gap-1 align-middle">
      {d.added ? (
        <span className={chip} data-testid={`mark-dept-added-${item.id}`} title={`Added to the planning view by the ${d.programTitle} department. The Bulletin does not list it.`}>
          Added by {d.programTitle}
        </span>
      ) : (
        <span className={chip} data-testid={`mark-dept-edit-${item.id}`} title={d.originalLabel ? `Bulletin wording: ${d.originalLabel}` : undefined}>
          Department edit
        </span>
      )}
    </span>
  );
}
