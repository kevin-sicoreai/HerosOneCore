import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:pointer-events-none [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        brand:
          "border-emerald-500/25 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        success:
          "border-emerald-500/25 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        warning:
          "border-amber-500/25 bg-amber-500/15 text-amber-600 dark:text-amber-400",
        danger:
          "border-red-500/25 bg-red-500/15 text-red-600 dark:text-red-400",
        info: "border-sky-500/25 bg-sky-500/15 text-sky-600 dark:text-sky-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
