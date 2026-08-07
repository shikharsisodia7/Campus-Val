// /schedule is superseded by /planner which now includes the full quarter-plan
// experience (section selection, calendar, conflicts). Old links resolve to the
// SPA via server SPA_ROUTES and then wouter redirects here.
import { Redirect } from "wouter";

export default function SchedulePage() {
  return <Redirect to="/planner" />;
}
