"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, ShieldCheckIcon, UserIcon, XIcon } from "lucide-react"

import { authApi, type Me } from "@/lib/auth-api"
import { PageContainer, PageHeading } from "@/components/page-container"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ProfilePage() {
  const router = useRouter()
  const [me, setMe] = React.useState<Me | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    authApi
      .me()
      .then((m) => {
        if (!m) router.replace("/login")
        else setMe(m)
      })
      .finally(() => setLoading(false))
  }, [router])

  const perms: { key: keyof Me["permissions"]; label: string }[] = [
    { key: "can_read", label: "读取" },
    { key: "can_write", label: "写入" },
    { key: "can_admin", label: "管理" },
  ]

  return (
    <PageContainer>
      <PageHeading title="个人中心" desc="你的账户、角色与权限" icon={<UserIcon />} />

      {loading && <div className="text-sm text-muted-foreground">加载中…</div>}

      {me && (
        <>
          {/* identity */}
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-blue-500 text-xl font-bold text-white">
                {me.username.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-lg font-semibold">{me.username}</div>
                <div className="flex flex-wrap gap-1.5">
                  {me.roles.length ? (
                    me.roles.map((r) => <Badge key={r} variant="brand">{r}</Badge>)
                  ) : (
                    <span className="text-xs text-muted-foreground">未分配角色</span>
                  )}
                </div>
                <div className="font-mono text-xs text-muted-foreground">ID: {me.id}</div>
              </div>
            </CardContent>
          </Card>

          {/* permissions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheckIcon className="size-4 text-blue-500" /> 权限
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              {perms.map((p) => {
                const on = me.permissions[p.key]
                return (
                  <div key={p.key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                    <span className="text-sm">{p.label}</span>
                    {on ? (
                      <span className="flex items-center gap-1 text-sm text-blue-500"><CheckIcon className="size-4" /> 允许</span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-muted-foreground"><XIcon className="size-4" /> 禁止</span>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>

        </>
      )}
    </PageContainer>
  )
}
