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
  /**
   * `pointer: coarse` — a touchscreen, not a mouse. `layout.ts` needs this
   * alongside the size: the unfolded foldable's transport only needs to scroll
   * on a real touch pointer, not when a desktop window happens to be resized to
   * the same width with a mouse. See `layoutFor`'s `transportScroll`.
   */
  coarsePointer: boolean
}

/** What a non-browser caller sees: a desktop with a mouse, so nothing renders compact by accident. */
const SERVER: ViewportSize = { w: 1920, h: 1080, coarsePointer: false }

function read(): ViewportSize {
  if (typeof window === 'undefined') return SERVER
  return {
    w: window.innerWidth,
    h: window.innerHeight,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
  }
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
      setSize((prev) => (
        prev.w === next.w && prev.h === next.h && prev.coarsePointer === next.coarsePointer ? prev : next
      ))
    }
    window.addEventListener('resize', onResize)
    // The pointer type can change with no resize at all — a foldable's own
    // pointer does not, but a dev tool's device emulation does, which is how
    // this was tested — so it gets its own listener rather than relying on
    // `resize` to happen to fire alongside it.
    const pointerQuery = window.matchMedia?.('(pointer: coarse)')
    pointerQuery?.addEventListener('change', onResize)
    onResize()
    return () => {
      window.removeEventListener('resize', onResize)
      pointerQuery?.removeEventListener('change', onResize)
    }
  }, [])
  return size
}
