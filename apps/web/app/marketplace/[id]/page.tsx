"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeftIcon, BlocksIcon } from "lucide-react"

import { marketplaceApi, type MarketAppDetail } from "@/lib/marketplace-api"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DefinitionView } from "@/components/app-builder/widget-view"

// Read-only runtime for a published custom app: renders its definition
// snapshot with the same widget renderer the builder uses.
export default function MarketAppRunPage() {
  const { id } = useParams<{ id: string }>()
  const [app, setApp] = React.useState<MarketAppDetail | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    marketplaceApi
      .app(id)
      .then(setApp)
      .catch(() => setError("应用不存在或市场服务未启动"))
  }, [id])

  return (
    <PageContainer>
      <PageHeading
        title={app?.name ?? "应用"}
        desc={app ? `${app.category} · ${app.desc}` : "加载中…"}
        icon={<BlocksIcon />}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="brand">自建应用 · 只读运行</Badge>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/marketplace" />}>
              <ArrowLeftIcon /> 返回市场
            </Button>
          </div>
        }
      />

      {error && <div className="text-sm text-muted-foreground">{error}</div>}
      {app && app.definition && (
        <div className="rounded-xl border border-border bg-background p-5">
          <DefinitionView draft={app.definition} />
        </div>
      )}
      {app && !app.definition && (
        <div className="text-sm text-muted-foreground">该应用没有可运行的页面定义。</div>
      )}
    </PageContainer>
  )
}
