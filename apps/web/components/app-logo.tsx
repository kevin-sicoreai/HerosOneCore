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
          tooltip="HerosOne Core"
          className="hover:bg-transparent active:bg-transparent"
          render={<a href="/" />}
        >
          {/* HerosOne Core mark (also the browser favicon) */}
          <svg
            viewBox="0 0 34 34"
            fill="none"
            className="!size-8 shrink-0"
            aria-hidden="true"
          >
            <rect x="1.5" y="1.5" width="31" height="31" rx="8" fill="#0F1115" />
            <circle cx="17" cy="10.5" r="2.6" fill="#fff" />
            <circle cx="10.5" cy="21" r="2.6" fill="#5B7BFF" />
            <circle cx="23.5" cy="21" r="2.6" fill="#5B7BFF" />
            <path
              d="M17 10.5 L10.5 21 M17 10.5 L23.5 21 M10.5 21 L23.5 21"
              stroke="#fff"
              strokeWidth="1.3"
              opacity="0.8"
            />
          </svg>
          {/* Wordmark */}
          <span className="text-[15px] font-semibold tracking-tight whitespace-nowrap">
            HerosOne Core
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
