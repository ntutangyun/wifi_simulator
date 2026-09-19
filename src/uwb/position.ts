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
}

/** c · σ_ts / √2: a TWR range carries two noisy receive counters (rxResp at the initiator,
 * rxPoll at the responder), which add in quadrature (σ_ts·√2) and are then halved by the
 * `tof = (Tround − Treply)/2` form — so σ_tof = σ_ts/√2. Exact for SS-TWR; the DS-TWR figure
 * is slightly smaller (0.62–0.65·c·σ_ts), and the SS value is the documented conservative
 * model for the error ellipse. tsNoisePs → metres. */
export function rangeSigmaM(tsNoisePs: number): number {
  const sigmaTsNs = tsNoisePs / 1000
  return (C_M_PER_NS * sigmaTsNs) / Math.SQRT2
}

const MAX_ITERATIONS = 20
const STEP_TOL_M = 1e-3
// Below this, JtJ (rows are unit vectors, so O(1)-scaled) is treated as singular:
// collinear/degenerate anchor geometry cannot fix a 2-D point.
const MIN_DET = 1e-9

interface NormalEquations {
  jtjXX: number
  jtjXY: number
  jtjYY: number
  jtrX: number
  jtrY: number
  sumSq: number
}

/** Accumulate JtJ, Jtr and the sum of squared residuals at (x, y) for the horizontal
 * Gauss–Newton normal equations. Residual r_i = ‖p − a_i‖ − d_i (3-D distance, tag z fixed);
 * J rows are the horizontal (x, y) components of the 3-D unit vector (p − a_i)/‖p − a_i‖. */
function accumulateNormal(
  usable: { anchor: AnchorPos; distM: number }[],
  x: number,
  y: number,
  zTag: number,
): NormalEquations {
  let jtjXX = 0
  let jtjXY = 0
  let jtjYY = 0
  let jtrX = 0
  let jtrY = 0
  let sumSq = 0

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
    sumSq += resid * resid
  }

  return { jtjXX, jtjXY, jtjYY, jtrX, jtrY, sumSq }
}

/**
 * Gauss–Newton on (x, y) with the tag's z known. Residual r_i = ‖p − a_i‖ − d_i.
 * Start at the anchors' centroid; stop after 20 iterations or a step under 1 mm.
 * null when fewer than 3 ranges match an anchor, or when JtJ is singular/near-singular
 * (collinear/degenerate anchor geometry) at any iteration or at the final covariance step.
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

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const { jtjXX, jtjXY, jtjYY, jtrX, jtrY } = accumulateNormal(usable, x, y, zTag)

    // Solve the 2x2 normal equations (JtJ) * delta = -Jtr
    const det = jtjXX * jtjYY - jtjXY * jtjXY
    if (Math.abs(det) < MIN_DET) return null

    const deltaX = -(jtjYY * jtrX - jtjXY * jtrY) / det
    const deltaY = -(-jtjXY * jtrX + jtjXX * jtrY) / det

    x += deltaX
    y += deltaY

    const step = Math.hypot(deltaX, deltaY)
    if (step < STEP_TOL_M) break
  }

  // Final JtJ at the converged point (recompute to be exact at the solution).
  const n = accumulateNormal(usable, x, y, zTag)
  return fixFrom(x, y, n, usable.length, sigmaRangeM)
}

/**
 * The fix a converged Gauss–Newton point carries: its GDOP and 1-σ error ellipse from the
 * inverse of JtJ, and the RMS residual. Shared by the spherical solver above and the hyperbolic
 * one below, which differ only in what a row of J and a residual mean.
 * null when JtJ is singular/near-singular — a geometry that cannot fix a 2-D point.
 */
function fixFrom(x: number, y: number, n: NormalEquations, rows: number, sigmaRangeM: number): Fix | null {
  const residualM = Math.sqrt(n.sumSq / rows)

  const det = n.jtjXX * n.jtjYY - n.jtjXY * n.jtjXY
  if (Math.abs(det) < MIN_DET) return null

  // Inverse of JtJ (2x2): [[jtjYY, -jtjXY], [-jtjXY, jtjXX]] / det
  const invXX = n.jtjYY / det
  const invXY = -n.jtjXY / det
  const invYY = n.jtjXX / det

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
  }
}

/** The horizontal unit vector from an anchor to (x, y, zTag), and the 3-D distance it came from. */
function unitTo(anchor: AnchorPos, x: number, y: number, zTag: number): { ux: number; uy: number; dist3: number } {
  const dx = x - anchor.x
  const dy = y - anchor.y
  const dz = zTag - anchor.z
  const dist3 = Math.hypot(dx, dy, dz)
  return { ux: dist3 > 0 ? dx / dist3 : 0, uy: dist3 > 0 ? dy / dist3 : 0, dist3 }
}

/** Accumulate the hyperbolic normal equations at (x, y). Residual
 * r_i = (‖p − a_i‖ − ‖p − a_ref‖) − c·Δt_i, and a J row is the difference of the two unit
 * vectors, u_i − u_ref: a range difference grows only where the two directions disagree, which
 * is why a tag on the baseline between two anchors is so badly placed. */
function accumulateTdoaNormal(
  usable: { anchor: AnchorPos; rangeDiffM: number }[],
  ref: AnchorPos,
  x: number,
  y: number,
  zTag: number,
): NormalEquations {
  let jtjXX = 0
  let jtjXY = 0
  let jtjYY = 0
  let jtrX = 0
  let jtrY = 0
  let sumSq = 0

  const r0 = unitTo(ref, x, y, zTag)

  for (const { anchor, rangeDiffM } of usable) {
    const ri = unitTo(anchor, x, y, zTag)
    const ux = ri.ux - r0.ux
    const uy = ri.uy - r0.uy
    const resid = ri.dist3 - r0.dist3 - rangeDiffM

    jtjXX += ux * ux
    jtjXY += ux * uy
    jtjYY += uy * uy
    jtrX += ux * resid
    jtrY += uy * resid
    sumSq += resid * resid
  }

  return { jtjXX, jtjXY, jtjYY, jtrX, jtrY, sumSq }
}

/**
 * Hyperbolic least squares: the one-way (TDoA) counterpart of solvePosition. Each measurement is
 * the time difference of arrival Δt_i between anchor i and the reference anchor, in nanoseconds
 * and positive when anchor i is the farther one; c·Δt_i is the range difference it stands for.
 * Gauss–Newton on (x, y) with the tag's z known, starting at the centroid of the anchors used.
 *
 * Three differences are the minimum (four anchors) — one fewer unknown-free equation than
 * trilateration needs, because the tag's own clock offset has already been differenced away.
 * null when fewer than 3 deltas name a known anchor other than the reference, when the reference
 * itself is unknown, or when the difference geometry is singular (collinear anchors).
 */
export function solveTdoa(
  anchors: AnchorPos[],
  refId: string,
  deltas: { id: string; dtNs: number }[],
  zTag: number,
  sigmaRangeM: number,
): Fix | null {
  const byId = new Map(anchors.map((a) => [a.id, a]))
  const ref = byId.get(refId)
  if (!ref) return null

  const usable: { anchor: AnchorPos; rangeDiffM: number }[] = []
  for (const d of deltas) {
    const a = byId.get(d.id)
    // The reference differences with itself to nothing: it carries no information, and its
    // all-zero Jacobian row would only dilute the fit.
    if (a && a.id !== refId) usable.push({ anchor: a, rangeDiffM: C_M_PER_NS * d.dtNs })
  }
  if (usable.length < 3) return null

  let x = ref.x
  let y = ref.y
  for (const { anchor } of usable) {
    x += anchor.x
    y += anchor.y
  }
  x /= usable.length + 1
  y /= usable.length + 1

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const { jtjXX, jtjXY, jtjYY, jtrX, jtrY } = accumulateTdoaNormal(usable, ref, x, y, zTag)

    const det = jtjXX * jtjYY - jtjXY * jtjXY
    if (Math.abs(det) < MIN_DET) return null

    const deltaX = -(jtjYY * jtrX - jtjXY * jtrY) / det
    const deltaY = -(-jtjXY * jtrX + jtjXX * jtrY) / det

    x += deltaX
    y += deltaY

    if (Math.hypot(deltaX, deltaY) < STEP_TOL_M) break
  }

  const n = accumulateTdoaNormal(usable, ref, x, y, zTag)
  return fixFrom(x, y, n, usable.length, sigmaRangeM)
}
