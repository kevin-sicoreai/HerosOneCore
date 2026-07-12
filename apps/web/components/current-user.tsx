"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { authApi, type Me } from "@/lib/auth-api"

// Shared current-user state: fetched once here (via authApi.me) and consumed by
// the shell gate, the sidebar / launcher (menu role filtering) and the user
// menu — so a single request serves everyone instead of each component
// re-fetching /me on its own.
type CurrentUserState = {
  me: Me | null
  loading: boolean
}

const CurrentUserContext = React.createContext<CurrentUserState>({
  me: null,
  loading: true,
})

// Internal provider state also tracks the pathname the current me/loading pair
// belongs to, so route changes can be detected during render (see below).
type ProviderState = CurrentUserState & { lastPathname: string | null }

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [state, setState] = React.useState<ProviderState>({
    me: null,
    loading: true,
    lastPathname: pathname,
  })

  // Adjust state during render (React's official pattern) rather than in an
  // effect: effects run child-first, so on the frame right after a client-side
  // login redirect the shell gate's effect would still observe the *previous*
  // page's {me: null, loading: false} — walk into its "invalid token" branch —
  // and clear the token that was just stored. Resetting loading synchronously
  // here makes React restart this render, so children never see the stale pair.
  if (state.lastPathname !== pathname) {
    setState((s) => ({
      me: s.me,
      // Keep an already-confirmed user (refresh in the background, no gate
      // flash between pages); otherwise gate until /me resolves.
      loading: s.me ? s.loading : true,
      lastPathname: pathname,
    }))
  }

  React.useEffect(() => {
    let active = true
    // Re-verify on navigation: a client-side login lands here without a
    // remount, so re-fetching is how the gate learns the user is now
    // authenticated. The loading flag was already raised during render above.
    authApi
      .me()
      .then((me) => active && setState((s) => ({ ...s, me, loading: false })))
      .catch(() => active && setState((s) => ({ ...s, me: null, loading: false })))
    return () => {
      active = false
    }
  }, [pathname])

  const value = React.useMemo(
    () => ({ me: state.me, loading: state.loading }),
    [state.me, state.loading],
  )

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>
}

export function useCurrentUser(): CurrentUserState {
  return React.useContext(CurrentUserContext)
}
