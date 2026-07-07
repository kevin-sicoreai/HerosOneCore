"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AppWindowIcon } from "lucide-react"

import { APPS_CHANGED_EVENT, marketplaceApi, type MarketApp } from "@/lib/marketplace-api"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// Deployed apps, straight from the marketplace: deploy = it appears here,
// undeploy = it disappears. Hidden entirely when nothing is deployed.
export function NavMyApps() {
  const pathname = usePathname()
  const [apps, setApps] = React.useState<MarketApp[]>([])

  const load = React.useCallback(() => {
    marketplaceApi
      .apps()
      .then((all) => setApps(all.filter((a) => a.deployed)))
      .catch(() => setApps([]))
  }, [])

  React.useEffect(() => {
    load()
    window.addEventListener(APPS_CHANGED_EVENT, load)
    return () => window.removeEventListener(APPS_CHANGED_EVENT, load)
  }, [load])

  if (apps.length === 0) return null

  return (
    <SidebarGroup>
      <SidebarGroupLabel>我的应用</SidebarGroupLabel>
      <SidebarMenu>
        {apps.map((a) => (
          <SidebarMenuItem key={a.id}>
            <SidebarMenuButton
              tooltip={a.name}
              isActive={pathname === `/marketplace/${a.id}`}
              render={<Link href={`/marketplace/${a.id}`} />}
            >
              <AppWindowIcon />
              <span>{a.name}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
