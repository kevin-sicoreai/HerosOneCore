"use client"

import * as React from "react"

import { WORKSPACES, type Workspace } from "@/lib/mock"

type Ctx = {
  workspace: Workspace
  setWorkspace: (w: Workspace) => void
}

const WorkspaceContext = React.createContext<Ctx | null>(null)

export function useWorkspace() {
  const ctx = React.useContext(WorkspaceContext)
  if (!ctx) throw new Error("useWorkspace must be used within provider")
  return ctx
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspace] = React.useState<Workspace>(WORKSPACES[0])
  const value = React.useMemo(() => ({ workspace, setWorkspace }), [workspace])
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}
