"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { clearToken, getToken } from "@/lib/auth-api"
import { findApp } from "@/lib/apps"
import { pushRecent } from "@/lib/recent"
import { AppSidebar } from "@/components/app-sidebar"
import { CurrentUserProvider, useCurrentUser } from "@/components/current-user"
import { TopBar } from "@/components/top-bar"
import { ResourceDrawerProvider } from "@/components/resource-detail-drawer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
  // Provider fetches /me once; the gate and menus below read it from context.
  return (
    <CurrentUserProvider>
      <AppShellInner>{children}</AppShellInner>
    </CurrentUserProvider>
  )
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { me, loading } = useCurrentUser()

  React.useEffect(() => {
    if (pathname === "/login") return
    if (!getToken()) {
      router.replace("/login")
      return
    }
    // Token present but /me came back empty (expired/invalid) — drop the stale
    // token and redirect instead of leaving the user on a failing page.
    if (!loading && !me) {
      clearToken()
      router.replace("/login")
    }
  }, [pathname, loading, me, router])

  // Record the visited page for the home "最近访问" card. Only exact registry
  // matches are tracked (findApp), so run/builder detail routes like /apps/[id]
  // are skipped rather than mapped — keeps the list to known menu destinations.
  // The home page itself and the login page are never recorded.
  React.useEffect(() => {
    if (pathname === "/" || pathname === "/login") return
    const app = findApp(pathname)
    if (app) pushRecent({ href: app.href, title: app.title, ts: Date.now() })
  }, [pathname])

  // Login page renders standalone (no sidebar/topbar).
  if (pathname === "/login") return <>{children}</>

  // Gate protected routes until /me resolves on the client.
  if (loading || !me)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        跳转到登录…
      </div>
    )

  return (
    <ResourceDrawerProvider>
      <SidebarProvider>
        <AppSidebar />
        {/* h-svh caps the inset at the viewport so the content area scrolls
            internally — pages with a pinned footer (e.g. the assist input) stay
            visible instead of being pushed below the fold as content grows. */}
        <SidebarInset className="h-svh min-w-0 overflow-hidden">
          <TopBar />
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </ResourceDrawerProvider>
  )
}
