import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Onboarding from "@/pages/onboarding";
import Dashboard from "@/pages/dashboard";
import Courses from "@/pages/courses";
import Planner from "@/pages/planner";
import GpaPage from "@/pages/gpa";
import TransferPage from "@/pages/transfer";
import SyncWorkdayPage from "@/pages/sync-workday";
import SchedulePage from "@/pages/schedule";
import Policies from "@/pages/policies";
import Advisor from "@/pages/advisor";
import VoiceAdvisor from "@/pages/voice";
import GraduationPaths from "@/pages/graduation-paths";
import Evaluation from "@/pages/evaluation";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/courses" component={Courses} />
      <Route path="/planner" component={Planner} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/gpa" component={GpaPage} />
      <Route path="/transfer" component={TransferPage} />
      <Route path="/sync-workday" component={SyncWorkdayPage} />
      <Route path="/policies" component={Policies} />
      <Route path="/advisor" component={Advisor} />
      <Route path="/voice" component={VoiceAdvisor} />
      <Route path="/graduation-paths" component={GraduationPaths} />
      <Route path="/evaluation" component={Evaluation} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
