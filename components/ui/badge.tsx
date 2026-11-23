import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Badge — Sage design system.
 * Variants: default (accent soft), neutral, success, warning, error, info.
 * Compat aliases: secondary -> neutral, destructive -> error, outline -> neutral.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 rounded-full border px-3 py-0.5",
    "text-[11px] font-black uppercase leading-5 tracking-wider",
    "transition-colors duration-fast ease-out",
    "focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "border-accent/15 bg-accent-soft text-accent",
        neutral:
          "border-border bg-surface-elevated text-text-muted",
        success:
          "border-success/25 bg-success-bg text-success-fg",
        warning:
          "border-warning/30 bg-warning-bg text-warning-fg",
        error:
          "border-error/25 bg-error-bg text-error-fg",
        info:
          "border-transparent bg-info-bg text-info-fg",
        // shadcn aliases
        secondary:
          "border-border bg-surface-elevated text-text-muted",
        destructive:
          "border-error/25 bg-error-bg text-error-fg",
        outline:
          "border-border bg-transparent text-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
