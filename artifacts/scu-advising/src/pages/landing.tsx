import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Map,
  CalendarRange,
  FlaskConical,
  ArrowRight,
} from "lucide-react";
import { Logo } from "@/components/Logo";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
};

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <Features />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={36} />
          <span className="font-serif font-bold text-lg tracking-tight">
            CampusVal
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm" className="bg-[#8C1515] hover:bg-[#7a1212]">
              Get started
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex justify-center mb-8"
      >
        <Logo size={88} />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="font-serif text-4xl md:text-5xl font-bold leading-tight tracking-tight max-w-2xl mx-auto"
      >
        Academic planning for{" "}
        <span className="text-[#8C1515]">Santa Clara</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
        className="mt-5 text-lg text-muted-foreground max-w-xl mx-auto"
      >
        Build an academic plan, map each quarter, and explore options before
        discussing decisions with your advisor.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="mt-8 flex items-center justify-center gap-3"
      >
        <Link href="/sign-up">
          <Button
            size="lg"
            className="bg-[#8C1515] hover:bg-[#7a1212] gap-2"
          >
            Sign up <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link href="/sign-in">
          <Button size="lg" variant="outline">
            Sign in
          </Button>
        </Link>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-4 text-xs text-muted-foreground"
      >
        An independent prototype, not an official SCU system.
      </motion.p>
    </section>
  );
}

function Features() {
  const features = [
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

  return (
    <section className="max-w-5xl mx-auto px-6 pb-24">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((f, i) => (
          <motion.div
            key={f.title}
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: (i % 3) * 0.05 }}
            className="rounded-xl border bg-card p-5"
          >
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#8C1515]/10 text-[#8C1515] mb-3">
              <f.icon className="h-5 w-5" />
            </div>
            <div className="font-semibold">{f.title}</div>
            <div className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {f.desc}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t py-6 text-center text-xs text-muted-foreground">
      An independent student tool, not affiliated with Santa Clara University.
      Always confirm decisions with an official SCU advisor.
    </footer>
  );
}

export { basePath };
