import { useClerk, useUser } from "@clerk/react";
import { LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useAppAccess } from "@/hooks/use-app-access";

/**
 * Renders the signed-in app only for an account the server admits under its
 * current access mode (GET /api/me/access). The server already refuses every
 * data request from anyone else; this keeps such an account from landing on a
 * dashboard full of errors and tells it plainly why. Fails closed: while the
 * check is loading, or if it fails, nothing of the app renders.
 */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError, refetch, isFetching } = useAppAccess();

  if (isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background" role="status" aria-live="polite">
        <span className="text-sm text-muted-foreground">Checking access…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <AccessMessage
        title="We couldn't confirm your access"
        body="CampusVal could not reach its server to check your account. Try again in a moment."
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Try again
          </Button>
        }
      />
    );
  }

  if (!data.allowed) {
    return (
      <AccessMessage
        testId="pilot-access-denied"
        title={data.accessMode === "pilot" ? "CampusVal is in a controlled pilot" : "Access not available"}
        body={data.message ?? "This account does not have access to CampusVal."}
        detail={
          data.accessMode === "pilot"
            ? "If you were invited, sign in with the address your invitation was sent to. Workday and your SCU advisor remain the place for official academic records and decisions."
            : undefined
        }
      />
    );
  }

  return <>{children}</>;
}

function AccessMessage({
  title,
  body,
  detail,
  action,
  testId,
}: {
  title: string;
  body: string;
  detail?: string;
  action?: React.ReactNode;
  testId?: string;
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress;
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-10" data-testid={testId}>
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-sm font-semibold">CampusVal</span>
          <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pilot
          </span>
        </div>
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 space-y-2">
            <h1 className="text-lg font-semibold leading-snug text-foreground">{title}</h1>
            <p className="text-sm text-foreground/90">{body}</p>
            {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
            {email && (
              <p className="text-xs text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{email}</span>
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {action}
          <Button
            size="sm"
            variant="default"
            className="gap-1.5"
            data-testid="button-access-sign-out"
            onClick={() => signOut({ redirectUrl: "/" })}
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
