import { Link } from "wouter";
import { CalendarRange, FlaskConical, Map } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Public landing page. Keep it to what CampusVal reliably does, state the pilot
 * status plainly, and keep the wording in step with landing-prerender.html (the
 * no-JavaScript copy). No sign-up call to action: CampusVal is not open for
 * general use (docs/PILOT_STATUS.md); invited participants who have no account
 * yet use the quiet link under Sign in.
 */
const CAPABILITIES = [
  {
    icon: Map,
    title: "Degree Planning",
    desc: "Build and organize a long-term academic plan from published requirements.",
  },
  {
    icon: CalendarRange,
    title: "Quarter Planning",
    desc: "Arrange a quarter schedule and review it before registering in Workday.",
  },
  {
    icon: FlaskConical,
    title: "Explore Options with Tentative Degree Planning",
    desc: "Explore different majors, minors, and academic pathways without changing your declared SCU program.",
  },
];

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={28} />
            <span className="text-base font-semibold">CampusVal</span>
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pilot
            </span>
          </Link>
          <Link href="/sign-in">
            <Button variant="outline" size="sm">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 pt-14 sm:pt-20">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          Pre-pilot · Santa Clara University planning
        </p>
        <h1 className="mt-3 max-w-xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Plan your degree and each quarter in one place.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">
          CampusVal helps organize and compare planning information from SCU sources.
          Workday and SCU remain authoritative for official academic records and decisions.
        </p>
        <p className="mt-6 text-sm text-foreground/80" data-testid="landing-pilot-status">
          Available only to invited pilot participants while SCU reviews hosting, security,
          and rollout.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Invited and new to CampusVal?{" "}
          <Link href="/sign-up" className="font-medium text-foreground underline underline-offset-2">
            Create your account
          </Link>{" "}
          with the address your invitation was sent to.
        </p>

        <ul className="mt-10 divide-y divide-border border-y border-border" aria-label="What CampusVal does">
          {CAPABILITIES.map((c) => (
            <li key={c.title} className="flex gap-3 py-4">
              <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <div className="font-semibold">{c.title}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">{c.desc}</div>
              </div>
            </li>
          ))}
        </ul>
      </main>

      <footer className="border-t border-border px-4 py-5 text-center text-xs text-muted-foreground">
        CampusVal is a pre-pilot planning tool under review. It is not an official SCU system
        and does not register, declare, or certify anything.
      </footer>
    </div>
  );
}

export { basePath };
