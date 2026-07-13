"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type TabsContextValue = {
  value: string
  setValue: (v: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabs() {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error("Tabs components must be used within <Tabs>")
  return ctx
}

function Tabs({
  value: controlled,
  defaultValue,
  onValueChange,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "")
  const value = controlled ?? uncontrolled
  const setValue = React.useCallback(
    (v: string) => {
      if (controlled === undefined) setUncontrolled(v)
      onValueChange?.(v)
    },
    [controlled, onValueChange]
  )

  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div data-slot="tabs" className={cn("flex flex-col gap-2", className)} {...props} />
    </TabsContext.Provider>
  )
}

function TabsList({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center gap-1 rounded-[10px] bg-muted p-1 text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  value,
  className,
  ...props
}: React.ComponentProps<"button"> & { value: string }) {
  const ctx = useTabs()
  const active = ctx.value === value
  return (
    <button
      type="button"
      data-slot="tabs-trigger"
      data-state={active ? "active" : "inactive"}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors outline-none [&_svg]:size-3.5",
        active
          ? "bg-card text-foreground shadow-sm ring-1 ring-black/[0.04]"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  value,
  className,
  ...props
}: React.ComponentProps<"div"> & { value: string }) {
  const ctx = useTabs()
  if (ctx.value !== value) return null
  return (
    <div
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
