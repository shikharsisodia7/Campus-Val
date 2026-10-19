import { Link, useLocation } from "wouter";
import { UserCog, LogOut, Menu, ChevronDown, Flag, ShieldCheck, BarChart3, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsAdmin, useIsDepartmentAdmin } from "@/hooks/use-is-admin";
import { useUser, useClerk } from "@clerk/react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-[var(--cv-page-max)] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2"
            data-testid="link-home"
          >
            <Logo size={28} />
            <span className="text-[15px] font-semibold tracking-tight text-foreground">CampusVal</span>
          </Link>
          <PilotBadge />

          <nav
            className="ml-3 hidden h-full min-w-0 flex-1 items-stretch gap-0.5 lg:flex 2xl:gap-1"
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
                aria-label="Report Error / Suggest Changes"
                data-testid="button-report-error"
                className="hidden shrink-0 items-center gap-1.5 px-2 text-muted-foreground hover:text-foreground lg:flex"
              >
                <Flag className="h-4 w-4" />
                <span className="hidden whitespace-nowrap text-[13px] 2xl:inline">
                  Report Error / Suggest Changes
                </span>
                {/* Icon only from lg to xl: with its words the button ran into the navigation at tablet widths. */}
                <span className="hidden whitespace-nowrap text-[13px] xl:inline 2xl:hidden">Report Error</span>
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
                  <Logo size={28} />
                  <span className="text-[15px] font-semibold">CampusVal</span>
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Pilot
                  </span>
                </Link>
                <p className="mt-2 text-xs leading-snug text-muted-foreground">{PILOT_EXPLANATION}</p>
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
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">{children}</main>
      <footer className="border-t border-border bg-card px-4 py-2 text-center text-[11px] text-muted-foreground sm:px-6 lg:px-8">
        CampusVal pilot · a planning aid, not an official SCU system. Workday and SCU remain
        authoritative for official academic records and decisions.
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px flex shrink-0 items-center gap-1 border-b-2 px-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring 2xl:gap-1.5 2xl:px-2.5 2xl:text-sm",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
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
      title={item.description}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-sm font-medium",
        active
          ? "border-primary bg-accent text-foreground"
          : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

export const PILOT_EXPLANATION =
  "Available to invited testers while SCU reviews hosting, security, and rollout.";

/** Quiet status indicator: "CampusVal Pilot", with what that means on hover or focus. */
function PilotBadge() {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid="badge-pilot"
            aria-label={`CampusVal Pilot. ${PILOT_EXPLANATION}`}
            className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Pilot
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">
          {PILOT_EXPLANATION}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
            "-mb-px h-full shrink-0 gap-1 rounded-none border-0 border-b-2 px-2 text-[13px] font-medium hover:bg-transparent 2xl:gap-1.5 2xl:px-2.5 2xl:text-sm",
            active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
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
                    title={item.description}
                    data-testid={`feature-link-${item.id}`}
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
  // Links only. Every admin page and API re-checks authorization on the server.
  const isAdmin = useIsAdmin();
  const isDepartmentAdmin = useIsDepartmentAdmin();
  if (!isLoaded || !user) return null;
  const adminLinks = [
    ...(isDepartmentAdmin || isAdmin
      ? [{ href: "/admin/program-requirements", label: "Program Requirements Admin", icon: ShieldCheck, testId: "nav-admin-program-requirements" }]
      : []),
    ...(isAdmin
      ? [
          { href: "/admin/feedback", label: "Feedback review", icon: Inbox, testId: "nav-admin-feedback" },
          { href: "/admin/usage", label: "Usage", icon: BarChart3, testId: "nav-admin-usage" },
        ]
      : []),
  ];
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
        {adminLinks.length > 0 && (
          <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Administration
          </div>
        )}
        {adminLinks.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={onNavigate}
            data-testid={`${l.testId}-mobile`}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <l.icon className="h-4 w-4" /> {l.label}
          </Link>
        ))}
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
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted text-foreground/80">
            <UserCog className="h-4 w-4" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
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
        {adminLinks.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Administration
            </DropdownMenuLabel>
            {adminLinks.map((l) => (
              <DropdownMenuItem key={l.href} asChild>
                <Link href={l.href} data-testid={l.testId} className="flex cursor-pointer items-center gap-2">
                  <l.icon className="h-4 w-4" /> {l.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}
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
    <div className="border-b border-border bg-card">
      <div
        className={cn(
          "mx-auto flex max-w-[var(--cv-page-max)] items-start justify-between gap-6 px-4 sm:px-6 lg:px-8",
          compact ? "py-2.5" : "py-4",
        )}
      >
        <div className="min-w-0">
          <h1 className={cn("cv-page-title", compact && "text-lg")}>{title}</h1>
          {subtitle && (
            <p className={cn("max-w-3xl text-muted-foreground", compact ? "mt-0.5 text-xs" : "mt-1 text-sm")}>
              {subtitle}
            </p>
          )}
        </div>
        {right}
      </div>
    </div>
  );
}

export function PageContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[var(--cv-page-max)] space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
