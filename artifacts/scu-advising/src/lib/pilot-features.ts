import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Map,
  CalendarRange,
  FlaskConical,
  BookOpen,
  CheckSquare,
  Calculator,
  ArrowLeftRight,
  FileUp,
  Library,
  UserCheck,
  Users,
  Scale,
  Route,
  Lightbulb,
  MessageSquareText,
  Mic,
  Gauge,
  ClipboardPaste,
  MessageSquarePlus,
} from "lucide-react";

/**
 * Single source of truth for which features are visible during the
 * professor's controlled pilot review, and to whom. Consumed by desktop nav,
 * mobile nav, and route gating in App.tsx so "what shows in the menu" and
 * "what a direct URL renders" can never drift apart. See
 * docs/PILOT_FEATURE_MATRIX.md for the professor rationale behind each
 * status and the re-enable criteria.
 *
 * - CORE: the professor's three key workflows (+ Dashboard) — always
 *   prominent, in the primary nav, for every signed-in user.
 * - PILOT_VISIBLE: lower-risk utilities the professor said can stay —
 *   shown to every pilot user under "Additional Features".
 * - PILOT_HIDDEN: features the professor asked to hide from reviewers
 *   because incorrect output could affect academic decisions, or because
 *   they'd distract from the three key workflows. Nothing is deleted —
 *   admins/developers still see and can open these, both in nav and via
 *   direct URL, for maintenance and future re-enablement.
 */
export type PilotStatus = "CORE" | "PILOT_VISIBLE" | "PILOT_HIDDEN";

export type PilotFeatureGroupId =
  | "course-requirements"
  | "planning-tools"
  | "resources-sharing"
  | "hidden-during-pilot";

export const GROUP_LABELS: Record<PilotFeatureGroupId, string> = {
  "course-requirements": "Course & requirements",
  "planning-tools": "Planning tools",
  "resources-sharing": "Resources & sharing",
  "hidden-during-pilot": "Hidden during pilot (admin/dev only)",
};

export interface PilotFeatureDef {
  id: string;
  path: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  status: PilotStatus;
  /** Only set for PILOT_VISIBLE / PILOT_HIDDEN items — which "Additional Features" group they render under. */
  group?: PilotFeatureGroupId;
  /** Why the professor's pilot review put this feature at this status — feeds docs/PILOT_FEATURE_MATRIX.md. */
  rationale: string;
  /** What would need to be true to move this out of PILOT_HIDDEN. */
  reEnableCriteria?: string;
}

export const PILOT_FEATURES: PilotFeatureDef[] = [
  // ─── CORE — the professor's three key workflows + Dashboard ─────────────
  {
    id: "dashboard",
    path: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    status: "CORE",
    rationale: "Entry point; always visible.",
  },
  {
    id: "degree-plan",
    path: "/degree-plan",
    label: "Degree Plan",
    icon: Map,
    status: "CORE",
    rationale: "The central planning workflow the professor wants reviewed first.",
  },
  {
    id: "quarter-plan",
    path: "/planner",
    label: "Quarter Plan",
    icon: CalendarRange,
    status: "CORE",
    rationale: "Turns the degree plan into an actual quarter schedule — one of the three key workflows.",
  },
  {
    id: "tentative-degree-plan",
    path: "/tentative-plans",
    label: "Tentative Degree Plan",
    icon: FlaskConical,
    status: "CORE",
    rationale: "Scenario-planning workspace — one of the three key workflows.",
  },

  // ─── PILOT_VISIBLE — conservative, lower-risk utilities ──────────────────
  {
    id: "course-catalog",
    path: "/courses",
    label: "Course Catalog",
    icon: BookOpen,
    status: "PILOT_VISIBLE",
    group: "course-requirements",
    rationale:
      "Professor identified this as useful and it reduces the need for redundant department/course-list pages.",
  },
  {
    id: "core-curriculum",
    path: "/core-reqs",
    label: "Core Curriculum",
    icon: CheckSquare,
    status: "PILOT_VISIBLE",
    group: "course-requirements",
    rationale:
      "Kept because its requirement data carries a visible source, academic-year, and last-verified date (see docs/DATA_PROVENANCE.md) — verified/current enough for pilot review.",
    reEnableCriteria: "Already visible; re-audit if source data goes stale.",
  },
  {
    id: "gpa-calculator",
    path: "/gpa",
    label: "GPA Calculator",
    icon: Calculator,
    status: "PILOT_VISIBLE",
    group: "planning-tools",
    rationale: "Professor said this can remain for now as a secondary utility.",
  },
  {
    id: "transfer-credit",
    path: "/transfer",
    label: "Transfer Credit",
    icon: ArrowLeftRight,
    status: "PILOT_VISIBLE",
    group: "planning-tools",
    rationale:
      "Kept with strong official-source/verification wording and no guarantee language — evaluate against real transfer-credit rules, not a promise of approval.",
  },
  {
    id: "progress-report",
    path: "/progress-report",
    label: "Workday APR (Progress Report)",
    icon: FileUp,
    status: "PILOT_VISIBLE",
    group: "planning-tools",
    rationale:
      "The Workday Academic Progress Report upload/read workflow the professor specifically wants reviewed. Same underlying APR data Degree Plan's read-only right-hand panel shows.",
  },
  {
    id: "scu-resources",
    path: "/resources",
    label: "SCU Resources",
    icon: Library,
    status: "PILOT_VISIBLE",
    group: "resources-sharing",
    rationale: "Emphasizes trusted official SCU resources and who students should contact.",
  },
  {
    id: "shared-with-me",
    path: "/shared-with-me",
    label: "Shared with Me (Advisors)",
    icon: UserCheck,
    status: "PILOT_VISIBLE",
    group: "resources-sharing",
    rationale: "Student-controlled, read-only, and already security-tested — kept for advisor review.",
  },

  // ─── PILOT_HIDDEN — hidden from ordinary reviewers this pilot ───────────
  {
    id: "professors",
    path: "/professors",
    label: "Professors",
    icon: Users,
    status: "PILOT_HIDDEN",
    group: "hidden-during-pilot",
    rationale:
      "Transcript was ambiguous here, but the professor repeatedly said to hide as much as possible so reviewers stay focused on the three key workflows.",
    reEnableCriteria: "Explicit product decision to bring secondary course-info tools back into pilot scope.",
  },
  {
    id: "compare-courses",
    path: "/compare",
    label: "Compare Courses",
    icon: Scale,
    status: "PILOT_HIDDEN",
    group: "hidden-during-pilot",
    rationale: "Same as Professors — defaulted to hidden to keep reviewers focused on the key workflows.",
    reEnableCriteria: "Explicit product decision to bring secondary course-info tools back into pilot scope.",
  },
  {
    id: "graduation-paths",
    path: "/graduation-paths",
    label: "Graduation Paths",
    icon: Route,
    status: "PILOT_HIDDEN",
    group: "hidden-during-pilot",
    rationale:
      "Generic prescribed/recommended/example graduation paths risk being mistaken for department-approved sequences. Only one major (CSE) is fully 'prescribed'; everything else is 'recommended' or 'example'. The professor explicitly suggested hiding this or restricting it to sanctioned departmental plans.",
    reEnableCriteria:
      "Reframe as a truthful 'Department-Recommended Academic Plans' surface showing only sequenceTrust === 'prescribed' entries with provenance, or add real official sources for more majors.",
  },
  {
    id: "advice-board",
    path: "/advice",
    label: "Advice Board",
    icon: Lightbulb,
    status: "PILOT_HIDDEN",
    group: "hidden-during-pilot",
    rationale:
      "Professor wants the concept blank/department/faculty-solicited rather than CampusVal-generated advising content during pilot review.",
    reEnableCriteria: "Replace curated tips with verified faculty/advisor/department-contributed content.",
  },
  {
    id: "planning-support",
    path: "/advisor",
    label: "Planning Support",
    icon: MessageSquareText,
    status: "PILOT_HIDDEN",
    group: "hidden-during-pilot",
    rationale: "AI-generated advising should not be marketed as safe or authoritative during the pilot.",
    reEnableCriteria: "Reliability/accuracy review of AI-generated advising output.",
  },
  {
    id: "voice-planning-support",
    path: "/voice",
    label: "Voice Planning Support",
    icon: Mic,
    status: "PILOT_HIDDEN",
    group: "hidden-during-pilot",
    rationale: "Same concern as Planning Support, voice-driven.",
    reEnableCriteria: "Reliability/accuracy review of AI-generated advising output.",
  },
  {
    id: "scu-policies",
    path: "/policies",
    label: "SCU Policies",
    icon: Library,
    status: "PILOT_HIDDEN",
    group: "hidden-during-pilot",
    rationale: "Stale scraped policy content is an explicit professor trust concern.",
    reEnableCriteria: "A reliable maintenance pipeline that keeps policy content current, with source metadata surfaced to reviewers.",
  },
  {
    id: "ai-evaluation",
    path: "/evaluation",
    label: "AI Evaluation",
    icon: Gauge,
    status: "PILOT_HIDDEN",
    group: "hidden-during-pilot",
    rationale: "Internal AI-evaluation framework — not part of the professor's pilot review scope.",
    reEnableCriteria: "Product decision to expose evaluation tooling to reviewers.",
  },
  {
    id: "sync-workday-sections",
    path: "/sync-workday",
    label: "Sync Workday Sections",
    icon: ClipboardPaste,
    status: "PILOT_HIDDEN",
    group: "hidden-during-pilot",
    rationale:
      "A separate live-seat-availability paste tool (not the same feature as the Workday APR / Progress Report). Hidden from pilot nav to reduce menu clutter; its backend data still powers the 'Live sections' panel inside course drawers, so Quarter Plan scheduling is unaffected.",
    reEnableCriteria: "Product decision to surface live-seat sync as a pilot-facing tool.",
  },
  {
    id: "legacy-feedback",
    path: "/feedback",
    label: "Feedback (legacy)",
    icon: MessageSquarePlus,
    status: "PILOT_HIDDEN",
    group: "hidden-during-pilot",
    rationale:
      "Superseded by the header 'Report Error / Suggest Changes' control (PR #44) as the one obvious feedback mechanism for pilot testers. Route and data preserved internally, not deleted.",
    reEnableCriteria: "None planned — Report Error / Suggest Changes is the permanent replacement.",
  },
];

export function getFeature(path: string): PilotFeatureDef | undefined {
  return PILOT_FEATURES.find((f) => f.path === path);
}

export function getPrimaryNavItems(): PilotFeatureDef[] {
  return PILOT_FEATURES.filter((f) => f.status === "CORE");
}

/** Additional Features groups a viewer should see: PILOT_VISIBLE always, PILOT_HIDDEN only for admins. */
export function getAdditionalFeatureGroups(
  isAdmin: boolean,
): { id: PilotFeatureGroupId; label: string; items: PilotFeatureDef[] }[] {
  const visibleStatuses: PilotStatus[] = isAdmin
    ? ["PILOT_VISIBLE", "PILOT_HIDDEN"]
    : ["PILOT_VISIBLE"];
  const groupOrder: PilotFeatureGroupId[] = [
    "course-requirements",
    "planning-tools",
    "resources-sharing",
    "hidden-during-pilot",
  ];
  return groupOrder
    .map((id) => ({
      id,
      label: GROUP_LABELS[id],
      items: PILOT_FEATURES.filter(
        (f) => f.group === id && visibleStatuses.includes(f.status),
      ),
    }))
    .filter((g) => g.items.length > 0);
}

/** Whether `path` should render for this viewer — the same rule desktop nav, mobile nav, and route gating all share. */
export function isPathPilotAllowed(path: string, isAdmin: boolean): boolean {
  const feature = getFeature(path);
  if (!feature) return true; // not a tracked feature (auth pages, onboarding, admin/*, etc.) — not gated here
  if (feature.status === "PILOT_HIDDEN") return isAdmin;
  return true;
}
