import {
  GraduationCap,
  Landmark,
  BookOpenCheck,
  BookMarked,
  Briefcase,
  CircleDashed,
  type LucideIcon,
} from "lucide-react";

/**
 * One shared category identity used by BOTH the left "Planning Requirements"
 * sidebar (Palette.tsx) and the plan's course/requirement cards (CourseCard),
 * so a student/advisor can visually scan the composition of a term. Color is
 * always additive — every category also carries a distinct icon and a text
 * label, never color alone (accessibility).
 *
 * Requirement group titles are free text set server-side (see
 * routes/requirements.ts / data/degree-requirements.ts), not a fixed enum on
 * the plan item itself, so this classifies by the well-known title patterns
 * those routes actually emit rather than inventing a new stored field.
 */
export type RequirementCategoryKind =
  | "university_core"
  | "college"
  | "major"
  | "minor"
  | "professional_prep"
  | "other";

export interface RequirementCategoryStyle {
  label: string;
  icon: LucideIcon;
  /** Badge classes — background + text + border, deliberately low-saturation. */
  badgeClass: string;
  /** Whether this category counts toward the degree, or is supplemental/professional prep. */
  isSupplemental: boolean;
}

export const REQUIREMENT_CATEGORY_STYLE: Record<
  RequirementCategoryKind,
  RequirementCategoryStyle
> = {
  university_core: {
    label: "University Core",
    icon: GraduationCap,
    badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200",
    isSupplemental: false,
  },
  college: {
    label: "College/School",
    icon: Landmark,
    badgeClass: "bg-violet-50 text-violet-800 border-violet-200",
    isSupplemental: false,
  },
  major: {
    label: "Major",
    icon: BookOpenCheck,
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
    isSupplemental: false,
  },
  minor: {
    label: "Minor",
    icon: BookMarked,
    badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
    isSupplemental: false,
  },
  professional_prep: {
    label: "Supplemental",
    icon: Briefcase,
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    isSupplemental: true,
  },
  other: {
    label: "Requirement",
    icon: CircleDashed,
    badgeClass: "bg-muted text-muted-foreground border-border",
    isSupplemental: false,
  },
};

/** Classify a requirement group's free-text title into a shared category kind. */
export function requirementCategoryKindFor(
  title: string | null | undefined,
): RequirementCategoryKind {
  if (!title) return "other";
  if (title.startsWith("Major Requirements")) return "major";
  if (title.startsWith("Minor Requirements")) return "minor";
  if (title.startsWith("Professional Preparation")) return "professional_prep";
  if (title === "University Core Curriculum") return "university_core";
  if (title.endsWith("Requirements")) return "college";
  return "other";
}
