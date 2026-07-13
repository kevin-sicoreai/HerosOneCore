"use client"

import { usePathname } from "next/navigation"

import { findApp } from "@/lib/apps"

export function TopBar() {
  const pathname = usePathname()
  const app = findApp(pathname)
  const title = pathname === "/" ? "工作区" : (app?.title ?? "工作区")

  return (
    <header className="flex h-14 shrink-0 items-center border-b border-border bg-card px-6">
      <span className="text-[15px] font-semibold text-foreground">{title}</span>
    </header>
  )
}
