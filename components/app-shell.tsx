"use client"

import * as React from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { TopBar } from "@/components/top-bar"
import { WorkspaceProvider } from "@/components/workspace-context"
import { ResourceDrawerProvider } from "@/components/resource-detail-drawer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

export function AppShell({ children }: { children: React.ReactNode }) {
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
