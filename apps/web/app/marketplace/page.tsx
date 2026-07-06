"use client"

import * as React from "react"
import { DownloadIcon, SearchIcon, StoreIcon } from "lucide-react"

import { MARKET_APPS } from "@/lib/mock"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function MarketplacePage() {
  const [tab, setTab] = React.useState("all")
  const [q, setQ] = React.useState("")

  const apps = MARKET_APPS.filter(
    (a) =>
      (tab === "all" || a.tag === tab) &&
      (a.name.includes(q) || a.desc.includes(q))
  )

  return (
    <PageContainer>
      <PageHeading
        title="应用市场"
        desc="预置 AI 应用一键部署，或使用本组织自建应用"
        icon={<StoreIcon />}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="prebuilt">预置应用</TabsTrigger>
            <TabsTrigger value="custom">自建应用</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索应用…"
            className="h-8 w-full rounded-lg border border-input bg-transparent pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {apps.map((a) => (
          <Card key={a.id} className="justify-between transition-colors hover:border-emerald-500/40">
            <CardHeader>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-lg text-emerald-500">
                  {a.name.slice(0, 1)}
                </span>
                <Badge variant={a.tag === "prebuilt" ? "info" : "brand"}>
                  {a.tag === "prebuilt" ? "预置" : "自建"}
                </Badge>
              </div>
              <CardTitle>{a.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{a.desc}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {a.category} · {a.installs}
                </span>
                <Button size="sm" variant={a.tag === "prebuilt" ? "default" : "outline"}>
                  {a.tag === "prebuilt" ? (
                    <>
                      <DownloadIcon /> 部署
                    </>
                  ) : (
                    "打开"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageContainer>
  )
}
