import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// Nocturne's `.tag`: 11px, generous horizontal padding, a radius three quarters
// of the medium step, and either a filled neutral/accent ground or a bare accent
// outline.
const badgeVariants = cva(
  "inline-flex items-center rounded-[0.375rem] border border-transparent px-2.5 py-0.5 text-[11px] tracking-[0.02em] transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/25 text-primary",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive/20 text-destructive",
        outline: "border-primary text-primary",
        success: "bg-success/20 text-success",
        warning: "bg-warning/20 text-warning",
        info: "bg-info/20 text-info"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
