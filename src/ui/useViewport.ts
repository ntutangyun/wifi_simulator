/**
 * The viewport size, as state, so the shell can re-arrange when it changes.
 *
 * A media query in CSS would be the usual answer, but the shell's arrangement is
 * a grid template built in TypeScript and a set of booleans other components
 * read, so the decision has to be a value rather than a stylesheet rule. Keeping
 * it here leaves `layout.ts` pure and testable without a DOM.
 *
 * A foldable is the reason this listens rather than reading once: unfolding the
 * device changes the viewport without reloading the page.
 */
import { useEffect, useState } from 'react'

export interface ViewportSize {
  w: number
  h: number
}

/** What a non-browser caller sees: a desktop, so nothing renders compact by accident. */
const SERVER: ViewportSize = { w: 1920, h: 1080 }

function read(): ViewportSize {
  if (typeof window === 'undefined') return SERVER
  return { w: window.innerWidth, h: window.innerHeight }
}

export function useViewport(): ViewportSize {
  const [size, setSize] = useState<ViewportSize>(read)
  useEffect(() => {
    if (typeof window === 'undefined') return
    // `resize` covers the fold, the rotation and the desktop drag alike. The
    // state is replaced only when a number really changed, so a resize storm
    // does not re-render the 3-D viewport for nothing.
    const onResize = (): void => {
      const next = read()
      setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next))
    }
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}
