/**
 * Bianchi's saturation model of the DCF (G. Bianchi, "Performance Analysis of
 * the IEEE 802.11 Distributed Coordination Function", IEEE JSAC 18(3), 2000),
 * plus the finite-retry variant (Wu et al., INFOCOM 2002) that matches a MAC
 * which discards a frame after a fixed number of attempts.
 *
 * Pure functions, no engine state. The Bianchi lesson quotes numbers computed
 * here; tests/course/tier1-bianchi.test.ts recomputes them and pins the prose.
 */
import { ACK_BYTES, ACK_TIMEOUT_NS, DIFS_NS, FCS_BYTES, MAC_HDR_BYTES, SIFS_NS, ctrlRespRateFor, txTimeNs } from '../../engine/phy'

export interface BianchiParams {
  /** Contending saturated stations. */
  n: number
  /** Minimum window W = CWmin + 1 (backoff drawn from [0, W − 1]). */
  W: number
  /** Maximum backoff stage: CWmax + 1 = 2^m · W. */
  m: number
  /**
   * Attempts per frame before it is discarded (802.11 dot11ShortRetryLimit = 7).
   * Omitted: Bianchi's original chain, which retries forever.
   */
  attempts?: number
}

/** Window of backoff stage i: 2^min(i, m) · W. */
const stageWindow = (i: number, W: number, m: number): number => 2 ** Math.min(i, m) * W

/**
 * Per-slot transmission probability of a station whose attempts collide with
 * constant probability p.
 * Infinite retries: τ = 2(1−2p) / ((1−2p)(W+1) + pW(1−(2p)^m)), written in the
 * equivalent form 2 / (W + 1 + pW·Σ_{k<m}(2p)^k), which has no 0/0 at p = ½.
 * Finite: τ = Σ_{i<L} p^i / Σ_{i<L} p^i (W_i + 1)/2.
 */
export function tauOf(p: number, { W, m, attempts }: Omit<BianchiParams, 'n'>): number {
  if (attempts === undefined) {
    let geo = 0
    for (let k = 0; k < m; k++) geo += (2 * p) ** k
    return 2 / (W + 1 + p * W * geo)
  }
  let num = 0
  let den = 0
  for (let i = 0; i < attempts; i++) {
    num += p ** i
    den += (p ** i * (stageWindow(i, W, m) + 1)) / 2
  }
  return num / den
}

/**
 * The fixed point τ = τ(p), p = 1 − (1 − τ)^(n−1). τ(p) falls and p(τ) rises,
 * so g(p) = 1 − (1 − τ(p))^(n−1) − p is strictly decreasing on [0, 1] with
 * g(0) ≥ 0 > g(1): bisection always converges to the unique root.
 */
export function solveBianchi(params: BianchiParams): { tau: number; p: number } {
  const { n } = params
  if (n < 1 || !Number.isInteger(n)) throw new Error(`n must be a positive integer, got ${n}`)
  const g = (p: number) => 1 - (1 - tauOf(p, params)) ** (n - 1) - p
  let lo = 0
  let hi = 1
  for (let i = 0; i < 200 && hi - lo > 1e-15; i++) {
    const mid = (lo + hi) / 2
    if (g(mid) > 0) lo = mid
    else hi = mid
  }
  const p = (lo + hi) / 2
  return { tau: tauOf(p, params), p }
}

export interface ThroughputInput {
  n: number
  tau: number
  /** Idle slot σ (ns). */
  slotNs: number
  /** Channel time of a successful exchange, T_s (ns). */
  tsNs: number
  /** Channel time of a collision, T_c (ns). */
  tcNs: number
  /** MSDU payload delivered per success (bits). */
  payloadBits: number
}

export interface ThroughputResult {
  /** P_tr: at least one station transmits in a slot. */
  ptr: number
  /** P_s: exactly one does, given that at least one does. */
  ps: number
  /** Mean length of a generic slot (ns). */
  slotMeanNs: number
  /** Saturation throughput (Mb/s). */
  mbps: number
}

/** S = P_s·P_tr·E[P] / ((1−P_tr)σ + P_tr·P_s·T_s + P_tr(1−P_s)·T_c). */
export function saturationThroughput({ n, tau, slotNs, tsNs, tcNs, payloadBits }: ThroughputInput): ThroughputResult {
  const ptr = 1 - (1 - tau) ** n
  const ps = ptr === 0 ? 0 : (n * tau * (1 - tau) ** (n - 1)) / ptr
  const slotMeanNs = (1 - ptr) * slotNs + ptr * ps * tsNs + ptr * (1 - ps) * tcNs
  const mbps = (ps * ptr * payloadBits) / (slotMeanNs * 1e-9) / 1e6
  return { ptr, ps, slotMeanNs, mbps }
}

/**
 * The engine's basic-access (no RTS/CTS) exchange times for one MSDU size and
 * a non-HT data rate:
 *  - T_s = data PPDU + SIFS + ACK PPDU (at the control-response rate) + DIFS;
 *  - T_c = data PPDU + ACK timeout + DIFS: a colliding sender cannot count the
 *    idle time before its ACK timeout expires, so its retry's DIFS starts there.
 */
export function dcfTimes(msduBytes: number, mbps: number): { dataNs: number; ackNs: number; tsNs: number; tcNs: number } {
  const dataNs = txTimeNs(msduBytes + MAC_HDR_BYTES + FCS_BYTES, mbps)
  const ackNs = txTimeNs(ACK_BYTES, ctrlRespRateFor(mbps))
  return {
    dataNs, ackNs,
    tsNs: dataNs + SIFS_NS + ackNs + DIFS_NS,
    tcNs: dataNs + ACK_TIMEOUT_NS + DIFS_NS,
  }
}
