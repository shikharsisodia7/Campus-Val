/**
 * Layout of the planning workspaces, in ONE place so Degree Plan, Tentative
 * Degree Plan, Degree Checksheets and the Academic Progress Report page cannot
 * drift apart.
 *
 *   RAIL_LEFT    the Planning Requirements sidebar (wide enough for Department
 *                Notes and My Notes)
 *   RAIL_RIGHT   the compact APR sidebar (the width that keeps Workday text readable)
 *
 * Degree Plan / Tentative Degree Plan use fixed columns (below). The two
 * comparison pages use CampusVal's resizable panels, whose starting sizes are
 * the same proportions (COMPARISON_PANEL_SIZES).
 *
 * They are written out in full, as literals, so Tailwind sees every class.
 */
export const PLANNING_THREE_COLUMNS =
  "xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(330px,380px)] 2xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)_minmax(400px,460px)]";
/** The `xl` breakpoint: from here the workspaces show their side regions beside the main one. */
export const WIDE_LAYOUT_MIN_WIDTH = 1280;
/**
 * Starting sizes and limits of the comparison pages' resizable regions, in percent of
 * the workspace width. At 1440px the defaults equal the fixed Degree Plan columns
 * (left ≈320px, compact APR ≈370px); the limits keep the Workday text and the
 * checksheet readable however the student drags.
 */
export const COMPARISON_PANEL_SIZES = {
  left: 24,
  /** The APR page has no right panel: the requirements take a little more. */
  leftAlone: 26,
  right: 27,
  leftMin: 17,
  rightMin: 21,
  sideMax: 40,
  mainMin: 30,
} as const;
/**
 * Height of the comparison regions on wide screens: the viewport below the app
 * header, the compact page header and the "Compare against" bar, so the three
 * regions fill the screen and each scrolls on its own. Below `xl` the page
 * scrolls normally instead.
 */
export const COMPARISON_HEIGHT = "xl:h-[calc(100dvh-14.5rem)] xl:min-h-[26rem]";
/** Width of the drawer the Planning Requirements open in below `xl`. */
export const REQUIREMENTS_DRAWER_WIDTH = "w-[min(24rem,92vw)]";
