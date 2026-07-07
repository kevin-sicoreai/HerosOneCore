"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { LockIcon, UserIcon } from "lucide-react"

import { authApi, getToken, setToken } from "@/lib/auth-api"
import { Button } from "@/components/ui/button"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  // already logged in -> go home
  React.useEffect(() => {
    if (getToken()) router.replace("/")
  }, [router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Blank fields default to the bootstrap admin account.
      const token = await authApi.login(username.trim() || "admin", password || "admin")
      setToken(token)
      router.replace("/")
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-emerald-500 text-lg font-bold text-white">
            S
          </div>
          <div className="text-lg font-semibold">登录 AskDelphi</div>
          <div className="text-xs text-muted-foreground">数据智能平台</div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">用户名</span>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                className="h-9 w-full rounded-lg border border-input bg-background pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">密码</span>
            <div className="relative">
              <LockIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </div>
          </label>

          {error && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "登录中…" : "登录"}
          </Button>
        </form>
      </div>
    </div>
  )
}
