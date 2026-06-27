import { lazy, Suspense, useEffect, useRef } from "react";
import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";
import {
  ClerkProvider,
  Show,
  useClerk,
  useUser,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import { SignInPage, SignUpPage } from "@/pages/auth";

const Onboarding = lazy(() => import("@/pages/onboarding"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Courses = lazy(() => import("@/pages/courses"));
const Planner = lazy(() => import("@/pages/planner"));
const TentativePlans = lazy(() => import("@/pages/tentative-plans"));
const GpaPage = lazy(() => import("@/pages/gpa"));
const TransferPage = lazy(() => import("@/pages/transfer"));
const SyncWorkdayPage = lazy(() => import("@/pages/sync-workday"));
const SchedulePage = lazy(() => import("@/pages/schedule"));
const Policies = lazy(() => import("@/pages/policies"));
const Advisor = lazy(() => import("@/pages/advisor"));
const VoiceAdvisor = lazy(() => import("@/pages/voice"));
const GraduationPaths = lazy(() => import("@/pages/graduation-paths"));
const Evaluation = lazy(() => import("@/pages/evaluation"));
const ProfessorsPage = lazy(() => import("@/pages/professors"));
const CoreReqs = lazy(() => import("@/pages/core-reqs"));
const ComparePage = lazy(() => import("@/pages/compare"));
const AdvicePage = lazy(() => import("@/pages/advice"));
const FeedbackPage = lazy(() => import("@/pages/feedback"));

// Keep data feeling live without hammering the server:
// - 30s stale time so quick navigations don't re-fetch needlessly
// - 60s background refetch for any visible query
// - Refetch whenever the tab regains focus or the network reconnects
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/bronco-logo.png`,
  },
  variables: {
    colorPrimary: "#8C1515",
    colorForeground: "#1a1a1a",
    colorMutedForeground: "#6b6b6b",
    colorDanger: "#b91c1c",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#1a1a1a",
    colorNeutral: "#e5e7eb",
    fontFamily: "Inter, system-ui, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-white rounded-2xl shadow-lg w-[440px] max-w-full overflow-hidden border border-gray-200",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    // Input fields: visible border + focus ring so they don't blend in.
    formFieldInput:
      "!border !border-gray-300 !bg-white !text-gray-900 !shadow-sm focus:!border-[#8C1515] focus:!ring-2 focus:!ring-[#8C1515]/20",
    formFieldLabel: "!text-gray-800 !font-medium",
    // Social buttons (Google / etc.): full opacity, visible border, hover tint.
    // Default Clerk styling renders these almost greyed-out which reads as disabled.
    socialButtonsBlockButton:
      "!border !border-gray-300 !bg-white !text-gray-900 !opacity-100 hover:!bg-gray-50 hover:!border-[#8C1515]/40 !shadow-sm transition-colors",
    socialButtonsBlockButtonText: "!text-gray-900 !font-medium !opacity-100",
    socialButtonsBlockButtonArrow: "!text-gray-700 !opacity-100",
    socialButtonsProviderIcon: "!opacity-100",
    // Primary submit (continue / sign in) — strong cardinal.
    formButtonPrimary:
      "!bg-[#8C1515] hover:!bg-[#7a1212] !text-white !shadow-md !shadow-[#8C1515]/20 !border-0",
    // Divider that says "or" between social + email — readable, not invisible.
    dividerLine: "!bg-gray-200",
    dividerText: "!text-gray-500 !font-medium",
  },
};

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Suspense fallback={null}>
          <Dashboard />
        </Suspense>
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsub = addListener(({ user }) => {
      const uid = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== uid) {
        qc.clear();
      }
      prevUserIdRef.current = uid;
    });
    return unsub;
  }, [addListener, qc]);
  return null;
}

function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/onboarding">
          <Protected>
            <Onboarding />
          </Protected>
        </Route>
        <Route path="/courses">
          <Protected>
            <Courses />
          </Protected>
        </Route>
        <Route path="/planner">
          <Protected>
            <Planner />
          </Protected>
        </Route>
        <Route path="/tentative-plans">
          <Protected>
            <TentativePlans />
          </Protected>
        </Route>
        <Route path="/schedule">
          <Protected>
            <SchedulePage />
          </Protected>
        </Route>
        <Route path="/gpa">
          <Protected>
            <GpaPage />
          </Protected>
        </Route>
        <Route path="/transfer">
          <Protected>
            <TransferPage />
          </Protected>
        </Route>
        <Route path="/sync-workday">
          <Protected>
            <SyncWorkdayPage />
          </Protected>
        </Route>
        <Route path="/policies">
          <Protected>
            <Policies />
          </Protected>
        </Route>
        <Route path="/advisor">
          <Protected>
            <Advisor />
          </Protected>
        </Route>
        <Route path="/voice">
          <Protected>
            <VoiceAdvisor />
          </Protected>
        </Route>
        <Route path="/graduation-paths">
          <Protected>
            <GraduationPaths />
          </Protected>
        </Route>
        <Route path="/professors">
          <Protected>
            <ProfessorsPage />
          </Protected>
        </Route>
        <Route path="/core-reqs">
          <Protected>
            <CoreReqs />
          </Protected>
        </Route>
        <Route path="/compare">
          <Protected>
            <ComparePage />
          </Protected>
        </Route>
        <Route path="/advice">
          <Protected>
            <AdvicePage />
          </Protected>
        </Route>
        <Route path="/evaluation">
          <Protected>
            <Evaluation />
          </Protected>
        </Route>
        <Route path="/feedback">
          <Protected>
            <FeedbackPage />
          </Protected>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function ClerkRouterBridge() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkRouterBridge />
    </WouterRouter>
  );
}

export { useUser };
export default App;
