import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * One notice style for the whole app: a quiet bordered surface whose colour
 * means something (index.css status tokens). Use it for guidance, cautions and
 * results; say uncertainty plainly ("Live section availability is not
 * connected.") rather than as a failure. Not for page-level errors that stop
 * the page — those keep their own layout.
 */
const noticeVariants = cva("rounded-md border text-foreground", {
  variants: {
    tone: {
      neutral: "border-border bg-muted/60",
      info: "border-info-border bg-info-surface",
      success: "border-success-border bg-success-surface",
      warning: "border-warning-border bg-warning-surface",
      danger: "border-danger-border bg-danger-surface",
    },
    size: {
      default: "px-3 py-2 text-sm",
      compact: "px-2.5 py-1.5 text-xs",
    },
  },
  defaultVariants: { tone: "neutral", size: "default" },
});

const ICON_TONE: Record<NonNullable<VariantProps<typeof noticeVariants>["tone"]>, string> = {
  neutral: "text-muted-foreground",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

export interface NoticeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof noticeVariants> {
  icon?: React.ComponentType<{ className?: string }>;
}

export const Notice = React.forwardRef<HTMLDivElement, NoticeProps>(
  ({ tone, size, icon: Icon, className, children, ...props }, ref) => (
    <div ref={ref} className={cn(noticeVariants({ tone, size }), className)} {...props}>
      {Icon ? (
        <div className="flex items-start gap-2">
          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_TONE[tone ?? "neutral"])} aria-hidden="true" />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  ),
);
Notice.displayName = "Notice";
