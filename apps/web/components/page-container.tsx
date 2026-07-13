import * as React from "react"

import { cn } from "@/lib/utils"

export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-6 p-6", className)} {...props} />
}

// A labelled content block. Gives pages a consistent second-level hierarchy
// beneath the top-bar title: a small overline heading (with optional
// description / right-aligned actions) above its children.
export function Section({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="font-heading text-sm font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

// The page title/description are shown by the top-bar breadcrumb, so the heading
// only renders the page's action controls (right-aligned). `title`/`desc`/`icon`
// are accepted for call-site compatibility but intentionally not rendered.
export function PageHeading({
  actions,
}: {
  title: string
  desc?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
}) {
  if (!actions) return null
  return <div className="flex items-center justify-end gap-2">{actions}</div>
}
