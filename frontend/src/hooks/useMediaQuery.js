// Responsive breakpoint hooks (PIPE-024).
// Inline styles can't be overridden by CSS media queries (specificity), so layout
// switches that live in inline styles read these hooks instead. Pure-CSS concerns
// (padding, type scale, scroll) stay in index.css @media blocks.

import { useEffect, useState } from 'react'

// Keep these in sync with the @media breakpoints in index.css.
export const MOBILE_BP = 768
export const NARROW_BP = 480

/**
 * Subscribe to a media query. SSR-safe (returns false until mounted).
 * @param {string} query e.g. '(max-width: 768px)'
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = e => setMatches(e.matches)
    // Sync once in case it changed between render and effect.
    setMatches(mql.matches)
    // addEventListener is the modern API; addListener is the Safari <14 fallback.
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }, [query])

  return matches
}

/** True on phone-sized viewports (≤768px). */
export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BP}px)`)
}

/** True on the narrowest viewports (≤480px) — for extra-tight stacking. */
export function useIsNarrow() {
  return useMediaQuery(`(max-width: ${NARROW_BP}px)`)
}
