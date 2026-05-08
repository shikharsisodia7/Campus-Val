import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  GraduationCap,
  ShieldCheck,
  MessageSquareText,
  CalendarRange,
  Mic,
  ArrowRight,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-[#8C1515] text-white flex items-center justify-center font-serif font-bold shadow-sm">
              CV
            </div>
            <div>
              <div className="font-serif font-bold text-lg leading-none">
                CampusVal
              </div>
              <div className="text-[11px] uppercase tracking-widest text-[#8C1515] mt-1">
                SCU Advising
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sign-in">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/sign-up">
              <Button className="bg-[#8C1515] hover:bg-[#7a1212]">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <section className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#8C1515]/10 text-[#8C1515] text-xs font-medium mb-6">
            <ShieldCheck className="h-3.5 w-3.5" />
            Restricted to @scu.edu accounts
          </div>
          <h1 className="font-serif text-5xl font-bold leading-tight tracking-tight">
            Your AI academic advisor for{" "}
            <span className="text-[#8C1515]">Santa Clara University</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            Plan your quarters, check prereqs, simulate your GPA, evaluate
            transfer credit, and ask an AI advisor grounded in real SCU policy
            — all in one place, personalized to your degree.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/sign-up">
              <Button
                size="lg"
                className="bg-[#8C1515] hover:bg-[#7a1212] gap-2"
              >
                Sign up with your SCU email
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="outline">
                I already have an account
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Sign in with your <span className="font-mono">@scu.edu</span> Google
            account. Non-SCU emails will be turned away.
          </p>
        </section>

        <section className="mt-20 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: CalendarRange,
              title: "Quarter Planner",
              desc: "Class-standing-aware unit caps + prereq checks before you register.",
            },
            {
              icon: GraduationCap,
              title: "Graduation Paths",
              desc: "3-year and 4-year CSE plans with quarter-by-quarter breakdowns.",
            },
            {
              icon: MessageSquareText,
              title: "AI Advisor",
              desc: "Streaming answers grounded in SCU's bulletin and policies.",
            },
            {
              icon: Mic,
              title: "Voice Advisor",
              desc: "Tap the mic and ask a question — get a spoken answer back.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-xl border bg-card p-5 hover:shadow-md transition"
            >
              <f.icon className="h-6 w-6 text-[#8C1515] mb-3" />
              <div className="font-semibold">{f.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{f.desc}</div>
            </div>
          ))}
        </section>

        <section className="mt-20 rounded-xl border bg-card p-8 text-center">
          <h2 className="font-serif text-2xl font-bold">
            Built specifically for SCU undergrads
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Covers the full 2025-2026 SCU undergraduate bulletin (~2,300
            courses across all departments). Knows the engineering vs. CAS unit
            cap rules, the 87.5-unit transfer cap, the residency requirement,
            and the overload-eligibility math.
          </p>
        </section>
      </main>

      <footer className="border-t mt-16 py-6 text-center text-xs text-muted-foreground">
        CampusVal is an independent student tool and is not affiliated with or
        endorsed by Santa Clara University. Always confirm decisions with an
        official SCU advisor.
      </footer>
    </div>
  );
}

export { basePath };
