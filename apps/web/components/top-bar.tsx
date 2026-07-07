"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MoonIcon,
  SearchIcon,
  SparklesIcon,
  SunIcon,
  UserIcon,
} from "lucide-react"

import { authApi, clearToken, type Me } from "@/lib/auth-api"
import { WORKSPACES } from "@/lib/mock"
import { findApp } from "@/lib/apps"
import { useWorkspace } from "@/components/workspace-context"
import { AppLauncher } from "@/components/app-launcher"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { workspace, setWorkspace } = useWorkspace()
  const app = findApp(pathname)
  const title = pathname === "/" ? "工作区" : (app?.title ?? "工作区")

  const [query, setQuery] = React.useState("")

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push(query.trim() ? `/assist?q=${encodeURIComponent(query.trim())}` : "/assist")
    setQuery("")
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
      <SidebarTrigger className="-ml-0.5" />
      <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-auto" />

      {/* Workspace switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" className="gap-1.5" />}
        >
          <span className={workspace.kind === "gotham" ? "text-violet-500" : "text-emerald-500"}>
            ●
          </span>
          <span className="font-medium">{workspace.name}</span>
          <ChevronsUpDownIcon className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>切换工作区</DropdownMenuLabel>
          {WORKSPACES.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => setWorkspace(w)}>
              <span className={w.kind === "gotham" ? "text-violet-500" : "text-emerald-500"}>
                ●
              </span>
              <div className="flex flex-col">
                <span>{w.name}</span>
                <span className="text-xs text-muted-foreground">{w.desc}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-1 data-vertical:h-4 data-vertical:self-auto" />
      <span className="text-sm font-medium text-muted-foreground">{title}</span>

      {/* Global search = AIP Assist entry */}
      <form onSubmit={submitSearch} className="mx-auto hidden w-full max-w-md md:block">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索对象 / 数据，或用自然语言提问…"
            className="h-8 w-full rounded-lg border border-input bg-muted/40 pr-16 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
          <Badge
            variant="brand"
            className="absolute top-1/2 right-1.5 -translate-y-1/2 gap-1"
          >
            <SparklesIcon /> AIP
          </Badge>
        </div>
      </form>

      <div className="flex items-center gap-0.5">
        <AppLauncher />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="切换主题"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {mounted && resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

function UserMenu() {
  const router = useRouter()
  const [me, setMe] = React.useState<Me | null>(null)

  React.useEffect(() => {
    authApi.me().then(setMe).catch(() => setMe(null))
  }, [])

  function logout() {
    clearToken()
    router.replace("/login")
  }

  const name = me?.username ?? "用户"
  const roles = me?.roles?.join(" · ") ?? "未登录"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="rounded-full" />}
      >
        <Avatar size="sm">
          <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{name}</span>
            <span className="text-xs">{roles}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/profile" />}>
          <UserIcon /> 个人中心
        </DropdownMenuItem>
        <DropdownMenuItem onClick={logout}>
          <LogOutIcon /> 退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
