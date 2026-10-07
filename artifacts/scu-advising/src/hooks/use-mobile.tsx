import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

/**
 * True while the window is at least `px` wide, read synchronously on the first render (no flash
 * of the narrow layout). Where there is no matchMedia (tests), the wide layout is assumed.
 */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query],
  )
  const read = () => (typeof window === "undefined" || !window.matchMedia ? true : window.matchMedia(query).matches)
  return React.useSyncExternalStore(subscribe, read, () => true)
}
