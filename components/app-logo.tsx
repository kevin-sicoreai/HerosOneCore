"use client"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function AppLogo() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          tooltip="Sicore"
          className="hover:bg-transparent active:bg-transparent"
          render={<a href="/" />}
        >
          {/* Collapsed-state icon: rainbow "S" */}
          <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 via-yellow-400 to-blue-600 text-base font-extrabold text-white">
            S
          </div>
          {/* Full wordmark */}
          <span className="text-2xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-br from-red-500 via-yellow-400 to-blue-600 bg-clip-text text-transparent">
              S
            </span>
            <span className="text-zinc-400">i</span>
            <span className="text-yellow-400">c</span>
            <span className="text-blue-600">o</span>
            <span className="text-green-600">r</span>
            <span className="text-red-500">e</span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
