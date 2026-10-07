/**
 * Column widths of the planning workspaces, in ONE place so Degree Plan,
 * Tentative Degree Plan, Degree Checksheets and the Academic Progress Report page
 * cannot drift apart.
 *
 *   RAIL_LEFT    the Planning Requirements sidebar (wide enough for Department
 *                Notes and My Notes)
 *   RAIL_RIGHT   the compact APR sidebar (the width that keeps Workday text readable)
 *
 * They are written out in full, as literals, so Tailwind sees every class.
 */
export const PLANNING_THREE_COLUMNS =
  "xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(330px,380px)] 2xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)_minmax(400px,460px)]";
export const PLANNING_LEFT_ONLY_COLUMNS = "xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]";
export const PLANNING_RIGHT_ONLY_COLUMNS = "xl:grid-cols-[minmax(0,1fr)_minmax(330px,380px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(400px,460px)]";
/**
 * Height of the comparison regions on wide screens: the viewport below the app
 * header, the compact page header and the "Compare against" bar, so the three
 * regions fill the screen and each scrolls on its own. Below `xl` the page
 * scrolls normally instead.
 */
export const COMPARISON_HEIGHT = "xl:h-[calc(100dvh-14.5rem)] xl:min-h-[26rem]";
/** Width of the drawer the Planning Requirements open in below `xl`. */
export const REQUIREMENTS_DRAWER_WIDTH = "w-[min(24rem,92vw)]";
