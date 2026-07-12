// Recently visited pages, persisted in localStorage. Written by the shell on
// route changes and read by the home page's "最近访问" card. Deliberately tiny
// and dependency-free; failures (quota, private mode, bad JSON) degrade to a
// no-op / empty list rather than throwing.

export type RecentEntry = {
  href: string
  title: string
  ts: number
}

const KEY = "askdelphi.recent"
const MAX = 12

export function readRecent(): RecentEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as RecentEntry[]) : []
  } catch {
    return []
  }
}

export function pushRecent(entry: RecentEntry): void {
  if (typeof window === "undefined") return
  try {
    // De-dupe by href, keeping the newest first, capped at MAX.
    const next = [entry, ...readRecent().filter((e) => e.href !== entry.href)].slice(0, MAX)
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* ignore storage errors */
  }
}
