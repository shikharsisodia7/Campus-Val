import { useState, type ReactNode } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Below the `xl` breakpoint there is no room for a permanent APR column next
 * to the planning workspace, so the same reference panel opens in a
 * right-hand drawer instead. ONE component for Degree Plan, Tentative Degree
 * Plan and Quarter Plan — the drawer trigger, title, focus handling and width
 * are identical everywhere.
 *
 * Accessibility: the trigger is a real button with an explicit label and
 * `aria-haspopup="dialog"`; the drawer is a Radix dialog (focus trap, Escape
 * closes, focus returns to the trigger) with a title and description for
 * assistive tech. Content scrolls inside the drawer, so the student never
 * loses their place in the plan behind it.
 */
export function AprReferenceSheet({
  children,
  triggerClassName,
}: {
  /** The reference panel — WorkdayAprPanel, or ContextPanel which wraps it. */
  children: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={triggerClassName}
          aria-haspopup="dialog"
          data-testid="button-open-apr-reference"
        >
          <FileText className="mr-2 h-4 w-4" aria-hidden="true" />
          Academic Progress Report
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-[min(24rem,92vw)] flex-col p-0"
        data-testid="apr-reference-sheet"
      >
        <SheetTitle className="sr-only">Workday Academic Progress Report</SheetTitle>
        <SheetDescription className="sr-only">
          A read-only copy of your Workday Academic Progress Report to compare against your plan.
        </SheetDescription>
        {/* pt-9 keeps the panel heading clear of the Sheet's built-in close (X)
            button at top-4 right-4. */}
        <div className="min-h-0 flex-1 pt-9">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
