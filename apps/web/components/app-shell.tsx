"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { getToken } from "@/lib/auth-api"
import { AppSidebar } from "@/components/app-sidebar"
import { TopBar } from "@/components/top-bar"
import { WorkspaceProvider } from "@/components/workspace-context"
import { ResourceDrawerProvider } from "@/components/resource-detail-drawer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [authed, setAuthed] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    if (pathname === "/login") return
    if (getToken()) setAuthed(true)
    else router.replace("/login")
  }, [pathname, router])

  // Login page renders standalone (no sidebar/topbar).
  if (pathname === "/login") return <>{children}</>

  // Gate protected routes until a token is confirmed on the client.
  if (!authed)
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        跳转到登录…
      </div>
    )

  return (
    <WorkspaceProvider>
      <ResourceDrawerProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="min-w-0 overflow-hidden">
            <TopBar />
            <div className="min-h-0 flex-1 overflow-auto">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </ResourceDrawerProvider>
    </WorkspaceProvider>
  )
}
