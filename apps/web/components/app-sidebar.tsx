"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { HouseIcon } from "lucide-react"

import { AppLogo } from "@/components/app-logo"
import { NavMyApps } from "@/components/nav-my-apps"
import { APP_LAYERS } from "@/lib/apps"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <AppLogo />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="工作区"
                isActive={pathname === "/"}
                render={<Link href="/" />}
              >
                <HouseIcon />
                <span>工作区</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {APP_LAYERS.map((layer) => (
          <React.Fragment key={layer.key}>
            <SidebarGroup>
              <SidebarGroupLabel>{layer.label}</SidebarGroupLabel>
              <SidebarMenu>
                {layer.apps.map((app) => {
                  const Icon = app.icon
                  const active = pathname === app.href
                  return (
                    <SidebarMenuItem key={app.key}>
                      <SidebarMenuButton
                        tooltip={app.title}
                        isActive={active}
                        render={<Link href={app.href} />}
                      >
                        <Icon />
                        <span>{app.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroup>
            {/* Deployed apps live right below the analysis layer. */}
            {layer.key === "analysis" && <NavMyApps />}
          </React.Fragment>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
