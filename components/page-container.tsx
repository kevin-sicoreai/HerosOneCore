import * as React from "react"

import { cn } from "@/lib/utils"

export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-4 p-4", className)} {...props} />
}

export function PageHeading({
  title,
  desc,
  icon,
  actions,
}: {
  title: string
  desc?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-2.5">
        {icon && (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 [&_svg]:size-4.5">
            {icon}
          </span>
        )}
        <div>
          <h1 className="font-heading text-lg font-semibold tracking-tight">{title}</h1>
          {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
