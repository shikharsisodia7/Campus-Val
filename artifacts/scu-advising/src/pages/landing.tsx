import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  useInView,
} from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  GraduationCap,
  ShieldCheck,
  MessageSquareText,
  CalendarRange,
  Mic,
  ArrowRight,
  Sparkles,
  Users,
  Scale,
  CheckSquare,
  Lightbulb,
  BookOpen,
  Calendar,
  Route,
} from "lucide-react";
import { Logo } from "@/components/Logo";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#fbf7f0] text-foreground overflow-x-hidden">
      <Header />
      <Hero />
      <Marquee />
      <FeatureGrid />
      <Stats />
      <BigQuote />
      <Footer />
    </div>
  );
}

/* ---------- Header ---------- */

function Header() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/70 border-b border-black/5">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Logo size={40} />
          <div>
            <div className="font-serif font-bold text-lg leading-none tracking-tight">
              CampusVal
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#8C1515] mt-0.5">
              SCU Advising
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href="/sign-up">
            <Button
              size="sm"
              className="bg-[#8C1515] hover:bg-[#7a1212] gap-2"
            >
              Get started <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ---------- Hero with mouse-follow spotlight ---------- */

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const smx = useSpring(mx, { stiffness: 80, damping: 20 });
  const smy = useSpring(my, { stiffness: 80, damping: 20 });

  function onMove(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set((e.clientX - rect.left) / rect.width);
    my.set((e.clientY - rect.top) / rect.height);
  }

  const bgX = useTransform(smx, (v) => `${v * 100}%`);
  const bgY = useTransform(smy, (v) => `${v * 100}%`);

  const words = ["Your", "AI", "academic", "advisor", "for", "SCU"];

  return (
    <section
      ref={ref}
      onMouseMove={onMove}
      className="relative overflow-hidden"
    >
      {/* Animated gradient orbs */}
      <motion.div
        aria-hidden
        className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, #8C1515 0%, transparent 70%)",
        }}
        animate={{ x: [0, 40, 0], y: [0, 60, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute top-20 -right-40 h-[480px] w-[480px] rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, #B08850 0%, transparent 70%)",
        }}
        animate={{ x: [0, -50, 0], y: [0, 30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Mouse-follow spotlight */}
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at ${bgX as unknown as string} ${bgY as unknown as string}, rgba(140,21,21,0.10), transparent 60%)`,
        }}
      />
      {/* Subtle grid */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.7) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6 pt-24 pb-32 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#8C1515]/10 text-[#8C1515] text-xs font-medium mb-8"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Restricted to @scu.edu accounts
        </motion.div>

        <h1 className="font-serif text-6xl md:text-7xl font-bold leading-[1.05] tracking-tight">
          {words.map((w, i) => (
            <motion.span
              key={`${w}-${i}`}
              initial={{ opacity: 0, y: 40, rotateX: -45 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{
                duration: 0.7,
                delay: 0.1 + i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={`inline-block mr-3 ${
                w === "SCU" ? "text-[#8C1515]" : ""
              }`}
              style={{ transformOrigin: "50% 100%" }}
            >
              {w}
            </motion.span>
          ))}
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="mt-8 text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto"
        >
          Plan your quarters, check prereqs, track Core requirements,
          simulate your GPA, and ask an AI advisor grounded in real SCU
          policy — built by Broncos, for Broncos.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.6 }}
          className="mt-10 flex items-center justify-center gap-3 flex-wrap"
        >
          <Link href="/sign-up">
            <MagneticButton>
              <Button
                size="lg"
                className="bg-[#8C1515] hover:bg-[#7a1212] gap-2 h-12 px-6 shadow-lg shadow-[#8C1515]/20"
              >
                Sign up with your SCU email
                <ArrowRight className="h-4 w-4" />
              </Button>
            </MagneticButton>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="outline" className="h-12">
              I already have an account
            </Button>
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="mt-4 text-xs text-muted-foreground"
        >
          Sign in with your{" "}
          <span className="font-mono text-[#8C1515]">@scu.edu</span> Google
          account.
        </motion.p>

        {/* Floating Bronco logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, type: "spring", stiffness: 100 }}
          className="mt-16 inline-block"
        >
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Logo size={140} animated={false} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------- Magnetic button hover ---------- */

function MagneticButton({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 15 });
  const sy = useSpring(y, { stiffness: 200, damping: 15 });

  function onMove(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * 0.25);
    y.set((e.clientY - cy) * 0.25);
  }
  function onLeave() {
    x.set(0);
    y.set(0);
  }
  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ x: sx, y: sy }}
      className="inline-block"
    >
      {children}
    </motion.div>
  );
}

/* ---------- Marquee strip ---------- */

function Marquee() {
  const items = [
    "✦ 2,308 SCU Courses",
    "✦ All 58 Departments",
    "✦ 46 Majors",
    "✦ Core Curriculum Tracker",
    "✦ Live Workday Sections",
    "✦ Live RateMyProfessor",
    "✦ AI Advisor",
    "✦ Voice Advisor",
    "✦ Transfer Credit",
    "✦ Quarter Planner",
    "✦ Graduation Paths",
    "✦ GPA Simulator",
  ];
  const repeated = [...items, ...items];
  return (
    <section className="relative py-6 bg-[#8C1515] text-white overflow-hidden border-y border-[#6B0F0F]">
      <motion.div
        className="flex gap-12 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
      >
        {repeated.map((item, i) => (
          <span
            key={i}
            className="font-serif text-xl tracking-wide opacity-90 shrink-0"
          >
            {item}
          </span>
        ))}
      </motion.div>
    </section>
  );
}

/* ---------- Feature grid with whileInView reveals ---------- */

function FeatureGrid() {
  const features = [
    {
      icon: CheckSquare,
      title: "Core Curriculum",
      desc: "Tick off every SCU Core requirement as you finish it — saved to your browser.",
    },
    {
      icon: CalendarRange,
      title: "Quarter Planner",
      desc: "Class-standing-aware unit caps + prereq checks before you register.",
    },
    {
      icon: BookOpen,
      title: "Course Catalog",
      desc: "2,308 courses across all 58 SCU departments, fully searchable.",
    },
    {
      icon: Scale,
      title: "Compare Courses",
      desc: "Three courses side-by-side — units, prereqs, Core tags.",
    },
    {
      icon: Route,
      title: "Graduation Paths",
      desc: "3-year and 4-year plans for every SCU undergrad major.",
    },
    {
      icon: Calendar,
      title: "Weekly Schedule",
      desc: "Visual M–F grid with real-time time-conflict detection.",
    },
    {
      icon: Users,
      title: "Professors",
      desc: "Aggregated from your synced Workday sections, with live RMP ratings.",
    },
    {
      icon: Lightbulb,
      title: "Advice Board",
      desc: "Curated tips on registration, professors, wellness, and campus life.",
    },
    {
      icon: MessageSquareText,
      title: "AI Advisor",
      desc: "Streaming answers grounded in SCU's bulletin and policies.",
    },
    {
      icon: Mic,
      title: "Voice Advisor",
      desc: "Tap the mic, ask a question, hear a spoken answer back.",
    },
    {
      icon: GraduationCap,
      title: "Transfer Credit",
      desc: "ASSIST.org articulation for 116 California Community Colleges.",
    },
    {
      icon: Sparkles,
      title: "GPA Simulator",
      desc: "What happens to your GPA after this quarter's grades.",
    },
  ];

  return (
    <section className="relative max-w-6xl mx-auto px-6 py-28">
      <RevealHeader
        eyebrow="Everything you need"
        title="Built for the SCU Bronco grind"
        subtitle="Twelve focused tools, one cardinal-and-gold home."
      />
      <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {features.map((f, i) => (
          <FeatureCard key={f.title} feature={f} index={i} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({
  feature,
  index,
}: {
  feature: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    desc: string;
  };
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const Icon = feature.icon;
  const [hover, setHover] = useState(false);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay: (index % 6) * 0.05, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="relative group"
    >
      <motion.div
        className="relative h-full rounded-2xl border border-black/10 bg-white p-6 overflow-hidden"
        whileHover={{ y: -4 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {/* Hover gradient sheen */}
        <motion.div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, rgba(140,21,21,0.08) 0%, transparent 50%, rgba(176,136,80,0.08) 100%)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: hover ? 1 : 0 }}
        />
        {/* Corner accent */}
        <motion.div
          aria-hidden
          className="absolute -top-10 -right-10 h-24 w-24 rounded-full bg-[#8C1515]/10 blur-xl"
          animate={{ scale: hover ? 1.6 : 1 }}
          transition={{ duration: 0.5 }}
        />
        <div className="relative">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#8C1515] to-[#6B0F0F] text-white shadow-md shadow-[#8C1515]/20">
            <Icon className="h-5 w-5" />
          </div>
          <div className="mt-4 font-serif text-lg font-bold tracking-tight">
            {feature.title}
          </div>
          <div className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            {feature.desc}
          </div>
          <motion.div
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#8C1515]"
            animate={{ x: hover ? 4 : 0 }}
          >
            Learn more <ArrowRight className="h-3 w-3" />
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------- Stats with count-up animation ---------- */

function Stats() {
  const stats = [
    { value: 2308, label: "SCU Courses indexed", suffix: "" },
    { value: 58, label: "Departments covered", suffix: "" },
    { value: 46, label: "Undergrad majors", suffix: "" },
    { value: 116, label: "Community colleges (transfer)", suffix: "" },
  ];
  return (
    <section className="relative bg-gradient-to-br from-[#8C1515] via-[#7a1212] to-[#6B0F0F] text-white py-20 overflow-hidden">
      {/* Animated gold sweep */}
      <motion.div
        aria-hidden
        className="absolute inset-0 opacity-10"
        style={{
          background:
            "linear-gradient(120deg, transparent 30%, #B08850 50%, transparent 70%)",
          backgroundSize: "200% 200%",
        }}
        animate={{ backgroundPosition: ["0% 0%", "100% 100%"] }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
      />
      <div className="relative max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {stats.map((s, i) => (
          <StatItem key={s.label} {...s} index={i} />
        ))}
      </div>
    </section>
  );
}

function StatItem({
  value,
  label,
  suffix,
  index,
}: {
  value: number;
  label: string;
  suffix: string;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const start = performance.now();
    const duration = 1400;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.1, duration: 0.6 }}
    >
      <div className="font-serif text-5xl md:text-6xl font-bold text-[#E2BE7E]">
        {shown.toLocaleString()}
        {suffix}
      </div>
      <div className="mt-2 text-sm uppercase tracking-widest text-white/70">
        {label}
      </div>
    </motion.div>
  );
}

/* ---------- Big scroll-reveal quote ---------- */

function BigQuote() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.2, 1, 1, 0.2]);
  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);

  return (
    <section ref={ref} className="relative max-w-5xl mx-auto px-6 py-32">
      <motion.div style={{ opacity, y }} className="text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-[#8C1515] mb-6">
          For Broncos, by Broncos
        </div>
        <h2 className="font-serif text-4xl md:text-5xl font-bold leading-tight tracking-tight">
          Covers the full{" "}
          <span className="text-[#8C1515]">2025-2026 SCU bulletin</span>.
          Knows the unit caps, the 87.5-unit transfer ceiling, the residency
          rules, and the overload math.
        </h2>
        <p className="mt-6 text-muted-foreground max-w-2xl mx-auto">
          Everything refreshes on its own as data comes in — you'll never see
          stale registration windows or outdated section info.
        </p>
      </motion.div>
    </section>
  );
}

/* ---------- Reveal header helper ---------- */

function RevealHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <div ref={ref} className="text-center max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
        className="text-xs uppercase tracking-[0.3em] text-[#8C1515] mb-3"
      >
        {eyebrow}
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="font-serif text-4xl md:text-5xl font-bold tracking-tight"
      >
        {title}
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mt-4 text-muted-foreground"
      >
        {subtitle}
      </motion.p>
    </div>
  );
}

/* ---------- Footer ---------- */

function Footer() {
  return (
    <footer className="border-t border-black/5 py-8 text-center text-xs text-muted-foreground">
      CampusVal is an independent student tool and is not affiliated with or
      endorsed by Santa Clara University. Always confirm decisions with an
      official SCU advisor.
    </footer>
  );
}

export { basePath };
