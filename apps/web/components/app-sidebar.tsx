"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ChevronsUpDownIcon,
  HouseIcon,
  LogOutIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react"

import { authApi, clearToken, type Me } from "@/lib/auth-api"
import { APP_LAYERS } from "@/lib/apps"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [me, setMe] = React.useState<Me | null>(null)
  const [collapsed, setCollapsed] = React.useState(false)

  React.useEffect(() => {
    authApi.me().then(setMe).catch(() => setMe(null))
  }, [])

  React.useEffect(() => {
    const v = localStorage.getItem("ho_sidebar_collapsed")
    if (v) setCollapsed(v === "1")
  }, [])

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem("ho_sidebar_collapsed", next ? "1" : "0")
      return next
    })

  const name = me?.username ?? "用户"
  const role = me?.roles?.[0] ?? "已登录"

  const logout = () => {
    clearToken()
    router.replace("/login")
  }

  return (
    <aside
      className={
        "relative flex h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 " +
        (collapsed ? "w-16" : "w-[264px]")
      }
    >
      {/* brand + collapse toggle */}
      <div className={"flex h-14 shrink-0 items-center border-b border-border px-3 " + (collapsed ? "justify-center" : "gap-[11px]")}>
        {!collapsed && (
          <>
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
              style={{
                background: "linear-gradient(155deg,#1B1D22 0%,#0B0C0F 100%)",
                boxShadow: "0 2px 6px rgba(15,17,21,.22), inset 0 1px 0 rgba(255,255,255,.08)",
              }}
            >
              <BrandGlyph />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15.5px] font-bold leading-[1.15] tracking-tight text-foreground">
                HerosOne <span className="text-primary">Core</span>
              </div>
              <div className="mt-px text-[11px] tracking-wide text-muted-foreground">数据智能平台</div>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
          title={collapsed ? "展开侧栏" : "折叠侧栏"}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
        >
          {collapsed ? <PanelLeftOpenIcon className="size-[18px]" /> : <PanelLeftCloseIcon className="size-[18px]" />}
        </button>
      </div>

      {/* nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-0.5">
        <NavItem href="/" label="工作区" Icon={HouseIcon} active={pathname === "/"} collapsed={collapsed} />

        {APP_LAYERS.map((layer) => (
          <div key={layer.key}>
            {collapsed ? (
              <div className="mx-2 my-2 h-px bg-border" />
            ) : (
              <div className="mx-1 mt-[18px] mb-1.5 text-[11px] font-semibold tracking-[.07em] text-muted-foreground">
                {layer.label}
              </div>
            )}
            {layer.apps.map((app) => (
              <NavItem
                key={app.key}
                href={app.href}
                label={app.title}
                Icon={app.icon}
                active={pathname === app.href}
                collapsed={collapsed}
                beta={app.key === "assist"}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* user footer (bottom-left) — click to open the user menu */}
      <div className="border-t border-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button type="button" title={collapsed ? `${name} · ${role}` : undefined} />}
            className={
              "flex w-full items-center rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted " +
              (collapsed ? "justify-center" : "gap-2.5")
            }
          >
            <UserAvatar />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">{name}</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground">{role}</span>
                </span>
                <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{name}</span>
                <span className="text-xs text-muted-foreground">{role}</span>
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
      </div>
    </aside>
  )
}

function UserAvatar() {
  return (
    <span
      className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px]"
      style={{ background: "linear-gradient(150deg,#2952E3,#1B3AAE)" }}
    >
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="9" r="3.4" fill="#ffffff" />
        <path d="M5.5 19.5c0-3.4 2.9-5.6 6.5-5.6s6.5 2.2 6.5 5.6" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function BrandGlyph() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="6.5" r="2.4" fill="#fff" />
      <circle cx="6" cy="17" r="2.4" fill="#6E8BFF" />
      <circle cx="18" cy="17" r="2.4" fill="#6E8BFF" />
      <path d="M12 6.5 6 17M12 6.5 18 17M6 17h12" stroke="#fff" strokeWidth="1.3" opacity="0.55" strokeLinecap="round" />
    </svg>
  )
}

function NavItem({
  href,
  label,
  Icon,
  active,
  collapsed,
  beta,
}: {
  href: string
  label: string
  Icon: LucideIcon
  active: boolean
  collapsed: boolean
  beta?: boolean
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={
        "relative mb-0.5 flex items-center rounded-[9px] py-[9px] text-[13.5px] transition-colors " +
        (collapsed ? "justify-center px-0" : "gap-[11px] px-3") +
        " " +
        (active
          ? "bg-accent font-semibold text-primary"
          : "font-medium text-foreground/70 hover:bg-muted hover:text-foreground")
      }
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.6} />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && beta && (
        <span className="ml-auto rounded-md bg-[#ECFDF3] px-[7px] py-px text-[10px] font-semibold tracking-wide text-[#067A57]">
          Beta
        </span>
      )}
    </Link>
  )
}
