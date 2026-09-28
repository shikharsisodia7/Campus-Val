import { useId } from "react";
import {
  getGetProfileQueryKey,
  useGetProfile,
  type DegreeChecksheetCategory,
  type DegreeChecksheetProgramRole,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ChecksheetDetails } from "@/hooks/use-degree-checksheets";
import { CHECKSHEET_CATEGORY_OPTIONS, PROGRAM_ROLE_OPTIONS } from "./checksheet-format";

export const EMPTY_DETAILS: ChecksheetDetails = {
  title: "",
  category: "major_checksheet",
  programName: null,
  programRole: null,
  school: null,
  academicYearLabel: null,
  sourceUrl: null,
};

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/** True when the link field holds something that is not a plain web address. */
export function sourceUrlProblem(value: string | null): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol === "https:" || url.protocol === "http:") return null;
  } catch {
    /* fall through */
  }
  return "Enter a web address starting with https:// (or leave this empty).";
}

/**
 * The student's own programs, offered as suggestions for the Program field.
 * They are a convenience for typing: any program can be entered, including one
 * the student is only considering.
 */
function useProgramSuggestions(): string[] {
  const { data } = useGetProfile({
    query: { queryKey: getGetProfileQueryKey(), retry: false, refetchInterval: false, refetchOnWindowFocus: false },
  });
  const names = [data?.major, data?.secondMajor, ...(data?.additionalMajors ?? []), data?.minor, ...(data?.additionalMinors ?? [])]
    .map((name) => name?.trim())
    .filter((name): name is string => !!name && name.toLowerCase() !== "undeclared");
  return [...new Set(names)];
}

/**
 * Title plus the optional, descriptive details of a document. Everything here
 * is what the student says about the file. None of it is checked against
 * anything, and none of it changes a plan or a requirement.
 */
export function ChecksheetDetailsFields({
  value,
  onChange,
  disabled,
}: {
  value: ChecksheetDetails;
  onChange: (next: ChecksheetDetails) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const suggestions = useProgramSuggestions();
  const set = <K extends keyof ChecksheetDetails>(key: K, next: ChecksheetDetails[K]) => onChange({ ...value, [key]: next });
  const text = (next: string) => (next.trim() ? next : null);
  const urlProblem = sourceUrlProblem(value.sourceUrl);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor={`${id}-title`}>
          Title <span className="text-destructive">*</span>
        </Label>
        <Input
          id={`${id}-title`}
          value={value.title}
          maxLength={120}
          required
          disabled={disabled}
          placeholder="e.g. Finance Major Checksheet"
          onChange={(e) => set("title", e.target.value)}
          data-testid="checksheet-field-title"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-category`}>Type of document</Label>
        <select
          id={`${id}-category`}
          value={value.category}
          disabled={disabled}
          onChange={(e) => set("category", e.target.value as DegreeChecksheetCategory)}
          className={SELECT}
          data-testid="checksheet-field-category"
        >
          {CHECKSHEET_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-year`}>Academic year / version</Label>
        <Input
          id={`${id}-year`}
          value={value.academicYearLabel ?? ""}
          maxLength={120}
          disabled={disabled}
          placeholder="e.g. 2025-26, or Fall 2025 and Later"
          onChange={(e) => set("academicYearLabel", text(e.target.value))}
          data-testid="checksheet-field-year"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-program`}>Program</Label>
        <Input
          id={`${id}-program`}
          value={value.programName ?? ""}
          maxLength={120}
          disabled={disabled}
          list={suggestions.length > 0 ? `${id}-programs` : undefined}
          placeholder="e.g. Finance"
          onChange={(e) => set("programName", text(e.target.value))}
          data-testid="checksheet-field-program"
        />
        {suggestions.length > 0 && (
          <datalist id={`${id}-programs`} data-testid="checksheet-program-suggestions">
            {suggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-role`}>This document is for my</Label>
        <select
          id={`${id}-role`}
          value={value.programRole ?? ""}
          disabled={disabled}
          onChange={(e) => set("programRole", (e.target.value || null) as DegreeChecksheetProgramRole | null)}
          className={SELECT}
          data-testid="checksheet-field-role"
        >
          <option value="">Not specified</option>
          {PROGRAM_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-school`}>College or school</Label>
        <Input
          id={`${id}-school`}
          value={value.school ?? ""}
          maxLength={120}
          disabled={disabled}
          placeholder="e.g. Leavey School of Business"
          onChange={(e) => set("school", text(e.target.value))}
          data-testid="checksheet-field-school"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-url`}>Where you found it (link)</Label>
        <Input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          value={value.sourceUrl ?? ""}
          maxLength={2000}
          disabled={disabled}
          placeholder="https://www.scu.edu/…"
          aria-invalid={urlProblem ? true : undefined}
          aria-describedby={urlProblem ? `${id}-url-problem` : undefined}
          onChange={(e) => set("sourceUrl", text(e.target.value))}
          data-testid="checksheet-field-url"
        />
        {urlProblem && (
          <p id={`${id}-url-problem`} className="text-xs text-destructive" data-testid="checksheet-field-url-problem">
            {urlProblem}
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground sm:col-span-2" data-testid="checksheet-details-help">
        Only the title is required. These details are your own description of the document, to help you tell
        your documents apart. CampusVal does not use them to decide which requirements apply to you.
      </p>
    </div>
  );
}
