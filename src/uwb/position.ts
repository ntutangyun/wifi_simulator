import { C_M_PER_NS } from './phy'

export interface AnchorPos {
  id: string
  x: number
  y: number
  z: number
}

/** 1-σ error ellipse semi-axes (a ≥ b), major-axis angle from +x. */
export interface Ellipse {
  a: number
  b: number
  thetaRad: number
}

export interface Fix {
  x: number
  y: number
  gdop: number
  ellipse: Ellipse
  residualM: number
  iterations: number
}

/** √2 · c · σ_ts: two noisy receive counters per range. tsNoisePs → metres. */
export function rangeSigmaM(tsNoisePs: number): number {
  const sigmaTsNs = tsNoisePs / 1000
  return Math.SQRT2 * C_M_PER_NS * sigmaTsNs
}

const MAX_ITERATIONS = 20
const STEP_TOL_M = 1e-3

/**
 * Gauss–Newton on (x, y) with the tag's z known. Residual r_i = ‖p − a_i‖ − d_i.
 * Start at the anchors' centroid; stop after 20 iterations or a step under 1 mm.
 * null when fewer than 3 ranges match an anchor.
 */
export function solvePosition(
  anchors: AnchorPos[],
  ranges: { id: string; distM: number }[],
  zTag: number,
  sigmaRangeM: number,
): Fix | null {
  const byId = new Map(anchors.map((a) => [a.id, a]))
  const usable: { anchor: AnchorPos; distM: number }[] = []
  for (const r of ranges) {
    const a = byId.get(r.id)
    if (a) usable.push({ anchor: a, distM: r.distM })
  }
  if (usable.length < 3) return null

  let x = 0
  let y = 0
  for (const { anchor } of usable) {
    x += anchor.x
    y += anchor.y
  }
  x /= usable.length
  y /= usable.length

  let iterations = 0

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    iterations = iter + 1
    let jtjXX = 0
    let jtjXY = 0
    let jtjYY = 0
    let jtrX = 0
    let jtrY = 0

    for (const { anchor, distM } of usable) {
      const dx = x - anchor.x
      const dy = y - anchor.y
      const dz = zTag - anchor.z
      const dist3 = Math.hypot(dx, dy, dz)
      const ux = dist3 > 0 ? dx / dist3 : 0
      const uy = dist3 > 0 ? dy / dist3 : 0
      const resid = dist3 - distM

      jtjXX += ux * ux
      jtjXY += ux * uy
      jtjYY += uy * uy
      jtrX += ux * resid
      jtrY += uy * resid
    }

    // Solve the 2x2 normal equations (JtJ) * delta = -Jtr
    const det = jtjXX * jtjYY - jtjXY * jtjXY
    if (Math.abs(det) < 1e-15) break

    const deltaX = -(jtjYY * jtrX - jtjXY * jtrY) / det
    const deltaY = -(-jtjXY * jtrX + jtjXX * jtrY) / det

    x += deltaX
    y += deltaY

    const step = Math.hypot(deltaX, deltaY)
    if (step < STEP_TOL_M) break
  }

  // Final JtJ at the converged point (recompute to be exact at the solution).
  let jtjXX = 0
  let jtjXY = 0
  let jtjYY = 0
  let sumSq = 0
  for (const { anchor, distM } of usable) {
    const dx = x - anchor.x
    const dy = y - anchor.y
    const dz = zTag - anchor.z
    const dist3 = Math.hypot(dx, dy, dz)
    const ux = dist3 > 0 ? dx / dist3 : 0
    const uy = dist3 > 0 ? dy / dist3 : 0
    const resid = dist3 - distM
    sumSq += resid * resid
    jtjXX += ux * ux
    jtjXY += ux * uy
    jtjYY += uy * uy
  }
  const residualM = Math.sqrt(sumSq / usable.length)

  const det = jtjXX * jtjYY - jtjXY * jtjXY
  // Inverse of JtJ (2x2): [[jtjYY, -jtjXY], [-jtjXY, jtjXX]] / det
  const invXX = jtjYY / det
  const invXY = -jtjXY / det
  const invYY = jtjXX / det

  const gdop = Math.sqrt(invXX + invYY)

  const sigma2 = sigmaRangeM * sigmaRangeM
  const sxx = sigma2 * invXX
  const sxy = sigma2 * invXY
  const syy = sigma2 * invYY

  const tr = sxx + syy
  const det2 = sxx * syy - sxy * sxy
  const discriminant = Math.max(tr * tr / 4 - det2, 0)
  const sq = Math.sqrt(discriminant)
  const lambda1 = tr / 2 + sq
  const lambda2 = tr / 2 - sq
  const a = Math.sqrt(Math.max(lambda1, 0))
  const b = Math.sqrt(Math.max(lambda2, 0))
  const thetaRad = 0.5 * Math.atan2(2 * sxy, sxx - syy)

  return {
    x,
    y,
    gdop,
    ellipse: { a, b, thetaRad },
    residualM,
    iterations,
  }
}
