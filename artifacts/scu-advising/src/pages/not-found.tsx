import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This address does not match a page in CampusVal.
        </p>
        <div className="mt-5">
          <Link href="/">
            <Button size="sm" variant="outline">Go to CampusVal</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
