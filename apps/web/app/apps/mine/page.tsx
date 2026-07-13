// This route moved to /apps/builder; redirect stale bookmarks/recents there.
import { redirect } from "next/navigation"

export default function Page() {
  redirect("/apps/builder")
}
