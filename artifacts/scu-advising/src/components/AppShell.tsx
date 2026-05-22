import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  BookOpen,
  CalendarRange,
  Calculator,
  ArrowLeftRight,
  MessageSquareText,
  Library,
  GraduationCap,
  UserCog,
  Route,
  Gauge,
  ClipboardPaste,
  Calendar,
  Mic,
  Users,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser, useClerk } from "@clerk/react";

const NAV = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/courses", label: "Course Catalog", icon: BookOpen },
  { path: "/planner", label: "Quarter Planner", icon: CalendarRange },
  { path: "/schedule", label: "Weekly Schedule", icon: Calendar },
  { path: "/graduation-paths", label: "Graduation Paths", icon: Route },
  { path: "/gpa", label: "GPA Calculator", icon: Calculator },
  { path: "/transfer", label: "Transfer Credit", icon: ArrowLeftRight },
  { path: "/sync-workday", label: "Sync Workday", icon: ClipboardPaste },
  { path: "/professors", label: "Professors", icon: Users },
  { path: "/advisor", label: "AI Advisor", icon: MessageSquareText },
  { path: "/voice", label: "Voice Advisor", icon: Mic },
  { path: "/policies", label: "SCU Policies", icon: Library },
  { path: "/evaluation", label: "AI Evaluation", icon: Gauge },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border sticky top-0 h-screen overflow-hidden">
        <div className="px-6 py-6 border-b border-sidebar-border shrink-0">
          <Link
            href="/"
            className="flex items-center gap-3 group"
            data-testid="link-home"
          >
            <div className="h-10 w-10 rounded-md bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-serif font-bold text-lg shadow-sm">
              CV
            </div>
            <div>
              <div className="font-serif font-bold text-lg leading-none">
                CampusVal
              </div>
              <div className="text-[11px] uppercase tracking-widest text-sidebar-primary mt-1">
                SCU Advising
              </div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active =
              item.path === "/"
                ? location === "/"
                : location.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                href={item.path}
                data-testid={`nav-${item.label.toLowerCase().replace(/ /g, "-")}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground border-l-2 border-sidebar-primary"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground border-l-2 border-transparent",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-3 border-t border-sidebar-border">
          <UserMenu />
          <Link
            href="/onboarding"
            data-testid="nav-profile"
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
          >
            <UserCog className="h-4 w-4" />
            <span>Edit profile</span>
          </Link>
          <div className="px-3 pt-3 pb-1 flex items-center gap-2 text-xs text-sidebar-foreground/50">
            <GraduationCap className="h-3.5 w-3.5" />
            <span>Santa Clara University</span>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}

function UserMenu() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  if (!isLoaded || !user) return null;
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const displayName =
    user.fullName ||
    user.firstName ||
    (email.includes("@") ? email.split("@")[0] : "Student");
  return (
    <div className="px-2 pb-2 mb-2 border-b border-sidebar-border/40">
      <div className="px-2 py-1.5">
        <div className="text-sm font-medium text-sidebar-foreground truncate">
          {displayName}
        </div>
        <div className="text-[11px] text-sidebar-foreground/50 truncate font-mono">
          {email}
        </div>
      </div>
      <button
        type="button"
        onClick={() => signOut({ redirectUrl: "/" })}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
        data-testid="button-sign-out"
      >
        <LogOut className="h-4 w-4" />
        <span>Sign out</span>
      </button>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border bg-card relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.08] pointer-events-none cv-gradient-sweep"
        style={{
          background:
            "linear-gradient(120deg, hsl(var(--primary)) 0%, transparent 40%, hsl(var(--accent)) 80%)",
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="max-w-7xl mx-auto px-8 py-6 flex items-start justify-between gap-6 relative"
      >
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>
        {right}
      </motion.div>
    </div>
  );
}

export function PageContent({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
      className="max-w-7xl mx-auto px-8 py-8 space-y-6"
    >
      {children}
    </motion.div>
  );
}
