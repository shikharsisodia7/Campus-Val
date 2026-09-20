import { useEffect, useId, useState } from "react";
import { getSearchCoursesQueryKey, useSearchCourses } from "@workspace/api-client-react";

export interface PickedCourse {
  code: string;
  title: string;
  units: number;
}

/**
 * A small, keyboard-friendly catalog search: type a code or a few words, pick
 * one result. It searches the CampusVal catalog only and returns exactly what
 * the catalog says — it never invents a course.
 */
export function CatalogCoursePicker({
  onPick,
  onCancel,
  disabled = false,
  label = "Search the CampusVal catalog",
}: {
  onPick: (course: PickedCourse) => void;
  onCancel: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const inputId = useId();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");

  // Debounce so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const params = { q: query, limit: 8 };
  const enabled = query.length >= 2;
  const { data, isFetching, isError } = useSearchCourses(params, {
    query: { enabled, queryKey: getSearchCoursesQueryKey(params) },
  });
  const courses = enabled ? (data?.courses ?? []) : [];

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-background p-2" data-testid="catalog-course-picker">
      <label htmlFor={inputId} className="block text-[11px] font-medium text-foreground">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="search"
          autoFocus
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. ENGL 1A or “critical thinking”"
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          data-testid="catalog-picker-input"
        />
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 rounded border border-border px-2 py-1 text-xs hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          data-testid="catalog-picker-cancel"
        >
          Cancel
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground" aria-live="polite" data-testid="catalog-picker-status">
        {!enabled
          ? "Type at least two characters."
          : isError
            ? "The catalog search failed. Try again."
            : isFetching && courses.length === 0
              ? "Searching…"
              : courses.length === 0
                ? "No catalog course matches that."
                : `${courses.length} match${courses.length === 1 ? "" : "es"}${data?.hasMore ? " (showing the first few)" : ""}.`}
      </p>

      {courses.length > 0 && (
        <ul className="max-h-48 space-y-1 overflow-y-auto" data-testid="catalog-picker-results">
          {courses.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick({ code: c.code, title: c.title, units: c.units })}
                className="flex w-full items-baseline gap-2 rounded border border-border/70 px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
                data-testid={`catalog-picker-result-${c.code.replace(/\s+/g, "-")}`}
              >
                <span className="font-mono font-semibold text-foreground">{c.code}</span>
                <span className="min-w-0 flex-1 text-muted-foreground">{c.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{c.units} units</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
