"use client"

import Link from "next/link"
import { LayoutGridIcon } from "lucide-react"

import { APP_LAYERS } from "@/lib/apps"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function AppLauncher() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="应用启动器" />
        }
      >
        <LayoutGridIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-3">
        <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">
          应用启动器
        </div>
        <div className="space-y-3">
          {APP_LAYERS.map((layer) => (
            <div key={layer.key}>
              <div className="mb-1.5 px-1 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                {layer.label}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {layer.apps.map((app) => {
                  const Icon = app.icon
                  return (
                    <Link
                      key={app.key}
                      href={app.href}
                      className="flex flex-col items-center gap-1.5 rounded-lg border border-transparent p-2 text-center transition-colors hover:border-border hover:bg-muted"
                    >
                      <span className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                        <Icon className="size-4.5" />
                      </span>
                      <span className="text-[11px] leading-tight">{app.title}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
