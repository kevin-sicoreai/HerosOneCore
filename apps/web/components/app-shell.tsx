"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { authApi, clearToken, getToken } from "@/lib/auth-api"
import { AppSidebar } from "@/components/app-sidebar"
import { TopBar } from "@/components/top-bar"
import { ResourceDrawerProvider } from "@/components/resource-detail-drawer"

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [authed, setAuthed] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    if (pathname === "/login") return
    if (!getToken()) {
      router.replace("/login")
      return
    }
    // A token is present, but it may be expired/invalid — verify it against the
    // auth service before trusting it, so stale sessions redirect to login
    // instead of leaving the user on a page where every request fails.
    let active = true
    authApi.me().then((me) => {
      if (!active) return
      if (me) {
        setAuthed(true)
      } else {
        clearToken()
        router.replace("/login")
      }
    })
    return () => {
      active = false
    }
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
    <ResourceDrawerProvider>
      <div className="flex h-svh w-full overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </div>
      </div>
    </ResourceDrawerProvider>
  )
}
