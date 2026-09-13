import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { UserCog, LogOut, Menu, ChevronDown, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useUser, useClerk } from "@clerk/react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ReportIssueDialog } from "@/components/ReportIssueDialog";
import { useState } from "react";
import {
  getPrimaryNavItems,
  getAdditionalFeatureGroups,
  type PilotFeatureDef,
} from "@/lib/pilot-features";

type NavItem = PilotFeatureDef;

const PRIMARY_NAV: NavItem[] = getPrimaryNavItems();

function isActive(location: string, path: string) {
  return path === "/" ? location === "/" : location.startsWith(path);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Reduces initial cognitive load for the controlled pilot cohort: only
  // Dashboard/Degree Plan/Quarter Plan/Tentative Degree Plan are prominent by
  // default. Secondary features live under "Additional Features", grouped by
  // pilot status in artifacts/scu-advising/src/lib/pilot-features.ts --
  // nothing is deleted, admins/developers still see PILOT_HIDDEN items in
  // the same dropdown, in a clearly separated group.
  const isAdmin = useIsAdmin();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5"
            data-testid="link-home"
          >
            <Logo size={34} />
            <div className="leading-tight">
              <div className="font-serif text-lg font-bold tracking-tight">
                CampusVal
              </div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-primary">
                SCU degree planning
              </div>
            </div>
          </Link>
          <PilotBadge />

          <nav
            className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 2xl:gap-1 lg:flex"
            aria-label="Primary navigation"
            data-testid="primary-nav"
          >
            {PRIMARY_NAV.map((item) => (
              <TopLink
                key={item.path}
                item={item}
                active={isActive(location, item.path)}
              />
            ))}
            <AdditionalFeatures location={location} isAdmin={isAdmin} />
          </nav>

          <ReportIssueDialog
            trigger={
              <Button
                variant="ghost"
                size="sm"
                title="Report Error / Suggest Changes"
                data-testid="button-report-error"
                className="hidden shrink-0 items-center gap-1.5 px-2 text-muted-foreground hover:text-foreground lg:flex"
              >
                <Flag className="h-4 w-4" />
                <span className="hidden whitespace-nowrap text-sm 2xl:inline">
                  Report Error / Suggest Changes
                </span>
                <span className="whitespace-nowrap text-sm 2xl:hidden">Report Error</span>
              </Button>
            }
          />

          <div className="ml-auto hidden lg:block">
            <AccountMenu />
          </div>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="ml-auto lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[min(22rem,90vw)] overflow-y-auto p-0"
              onEscapeKeyDown={() => setMobileOpen(false)}
              onPointerDownOutside={() => setMobileOpen(false)}
            >
              <SheetTitle className="sr-only">CampusVal navigation</SheetTitle>
              <div className="border-b border-border p-5">
                <Link
                  href="/"
                  className="flex items-center gap-2.5"
                  onClick={() => setMobileOpen(false)}
                >
                  <Logo size={34} />
                  <div>
                    <div className="font-serif font-bold">CampusVal</div>
                    <div className="text-[10px] uppercase tracking-wider text-primary">
                      SCU degree planning
                    </div>
                  </div>
                </Link>
              </div>
              <nav className="space-y-1 p-3" aria-label="Mobile navigation">
                {PRIMARY_NAV.map((item) => (
                  <MobileLink
                    key={item.path}
                    item={item}
                    active={isActive(location, item.path)}
                    onNavigate={() => setMobileOpen(false)}
                  />
                ))}
                <ReportIssueDialog
                  trigger={
                    <button
                      type="button"
                      data-testid="button-report-error-mobile"
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Flag className="h-4 w-4" /> Report Error / Suggest Changes
                    </button>
                  }
                />
                <div className="my-3 border-t border-border" />
                <details className="group" data-testid="mobile-additional-features">
                  <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Additional Features
                  </summary>
                  <FeatureGroupsList location={location} isAdmin={isAdmin} onNavigate={() => setMobileOpen(false)} />
                </details>
              </nav>
              <div className="border-t border-border p-3">
                <AccountMenu mobile onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main className="min-w-0">{children}</main>
      <footer className="border-t border-border bg-card/50 px-4 py-2 text-center text-[11px] text-muted-foreground sm:px-6 lg:px-8">
        Independent planning tool — not official SCU advising. Verify with your
        advisor.
      </footer>
    </div>
  );
}

function TopLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const testId = `nav-${item.label.toLowerCase().replace(/ /g, "-")}`;
  return (
    <Link
      href={item.path}
      data-testid={testId}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors 2xl:gap-1.5 2xl:px-2.5 2xl:text-sm",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="hidden h-4 w-4 2xl:block" aria-hidden="true" />
      <span className="whitespace-nowrap">{item.label}</span>
    </Link>
  );
}

function MobileLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.path}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

function PilotBadge() {
  return (
    <Badge
      variant="outline"
      data-testid="badge-pilot"
      title="CampusVal is in a controlled pilot evaluation. Some features are hidden while under review."
      className="shrink-0 gap-1 border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary"
    >
      Pilot
    </Badge>
  );
}

function AdditionalFeatures({ location, isAdmin }: { location: string; isAdmin: boolean }) {
  const groups = getAdditionalFeatureGroups(isAdmin);
  const active = groups.some((group) =>
    group.items.some((item) => isActive(location, item.path)),
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          data-testid="nav-additional-features"
          className={cn(
            "shrink-0 gap-1 px-2 text-[13px] 2xl:gap-1.5 2xl:px-2.5 2xl:text-sm",
            active && "bg-primary/10 text-primary",
          )}
        >
          Additional Features <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {groups.map((group, index) => (
          <DropdownMenuGroup key={group.id}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem key={item.path} asChild>
                  <Link
                    href={item.path}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <Icon className="h-4 w-4" /> {item.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FeatureGroupsList({
  location,
  isAdmin,
  onNavigate,
}: {
  location: string;
  isAdmin: boolean;
  onNavigate: () => void;
}) {
  const groups = getAdditionalFeatureGroups(isAdmin);
  return (
    <>
      {groups.map((group) => (
        <div key={group.id} className="mb-4">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </div>
          {group.items.map((item) => (
            <MobileLink
              key={item.path}
              item={item}
              active={isActive(location, item.path)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function AccountMenu({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  if (!isLoaded || !user) return null;
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const displayName =
    user.fullName ||
    user.firstName ||
    (email.includes("@") ? email.split("@")[0] : "Student");
  const signOutAction = () => {
    onNavigate?.();
    signOut({ redirectUrl: "/" });
  };

  if (mobile) {
    return (
      <div className="space-y-1">
        <div className="px-3 py-2">
          <div className="text-sm font-medium">{displayName}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {email}
          </div>
        </div>
        <Link
          href="/onboarding"
          onClick={onNavigate}
          data-testid="nav-profile"
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <UserCog className="h-4 w-4" /> Edit profile
        </Link>
        <button
          type="button"
          onClick={signOutAction}
          data-testid="button-sign-out"
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto gap-2 px-2 py-1.5"
          aria-label={`Account menu for ${displayName}`}
        >
          <div className="hidden text-right xl:block">
            <div className="max-w-32 truncate text-xs font-medium">
              {displayName}
            </div>
            <div className="max-w-32 truncate text-[10px] text-muted-foreground">
              {email}
            </div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserCog className="h-4 w-4" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>
          <div className="truncate text-sm">{displayName}</div>
          <div className="truncate text-[10px] font-normal text-muted-foreground">
            {email}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            href="/onboarding"
            data-testid="nav-profile"
            className="flex cursor-pointer items-center gap-2"
          >
            <UserCog className="h-4 w-4" /> Edit profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={signOutAction}
          data-testid="button-sign-out"
          className="gap-2"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /**
   * Planning surfaces (Degree Plan, Tentative Degree Plan, Quarter Plan) use
   * a thin header so the board, section search and APR get the vertical
   * space instead — the professor repeatedly flagged wasted room up top.
   */
  compact?: boolean;
}) {
  return (
    <div className="relative overflow-hidden border-b border-border bg-card">
      <div
        aria-hidden
        className="cv-gradient-sweep pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          background:
            "linear-gradient(120deg, hsl(var(--primary)) 0%, transparent 40%, hsl(var(--accent)) 80%)",
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className={`relative mx-auto flex max-w-[1600px] items-start justify-between gap-6 px-4 sm:px-6 lg:px-8 ${
          compact ? "py-2.5" : "py-5"
        }`}
      >
        <div className="min-w-0">
          <h1
            className={`font-serif font-bold tracking-tight text-foreground ${
              compact ? "text-xl" : "text-3xl"
            }`}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={`max-w-3xl text-muted-foreground ${
                compact ? "mt-0.5 text-xs" : "mt-1.5 text-sm"
              }`}
            >
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
      className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8"
    >
      {children}
    </motion.div>
  );
}
