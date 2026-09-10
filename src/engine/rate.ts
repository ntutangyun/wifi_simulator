/**
 * Rate adaptation with loss feedback.
 *
 * Signal strength sets a ceiling (the MCS the propagation model says this link
 * can carry). Consecutive failures push the working rate below it; runs of
 * success climb back. The controller never exceeds the ceiling, so it cannot
 * drift away from the physics, and it holds no randomness, so runs stay
 * reproducible.
 *
 * The working rate is stored as an absolute MCS, clamped to [0, ceiling] on
 * every write (fix for a death-spiral bug: an earlier version stored how far
 * *below* the ceiling to run and clamped only when reading it back, so a long
 * failure run at a temporarily low ceiling could push that offset arbitrarily
 * far past what MCS 0 needs — leaving a debt that a later, much higher
 * ceiling then took dozens of successes to pay off, even though the working
 * rate could never actually have gone below 0). Clamping at write time means
 * a failure run can never do worse than pin the rate at 0, and a ceiling that
 * recovers is reachable again after exactly the ordinary ten-success climb.
 *
 * The loop this closes is the point: a collision costs an attempt, two lost
 * attempts lower the rate, and a lower rate makes every frame longer — so the
 * station holds the channel longer for the same payload, delivers less in the
 * same time, and everyone queued behind it waits longer. That airtime tax is
 * the cost, and lesson 6's rate anomaly is what it looks like.
 *
 * What a lower rate does NOT do here is make collisions more likely. Backoff
 * is suspended while the medium is busy (IEEE 802.11-2024 §10.23.2.4; see
 * `onCcaBusy` in mac.ts, which cancels the tick and re-arms at the same
 * value), so a longer frame gives no other station's counter extra time to
 * expire — it gives them none. Per-attempt collision probability follows the
 * contention window an attempt was drawn from, not the airtime of the frame
 * that follows; measured over lesson 18's scenario, the far station's long
 * MCS-0 frames collide slightly *less* often per attempt than its MCS-1 ones.
 *
 * Note also that only single-user exchanges call `onSuccess`/`onFailure` (see
 * the two `onTxOutcome` call sites in mac.ts). A downlink MU PPDU reports no
 * outcome, so a rate used only inside multi-user PPDUs never adapts.
 */
const FAILURES_TO_STEP_DOWN = 2
const SUCCESSES_TO_STEP_UP = 10

interface PeerState {
  /**
   * Absolute working MCS. Starts at `Infinity` so the first `mcsFor` call
   * (which always clamps down to the ceiling) establishes it there.
   */
  mcs: number
  /** Most recent ceiling handed to `mcsFor`, used to cap a success climb. */
  ceiling: number
  failures: number
  successes: number
}

export class RateControl {
  private peers = new Map<string, PeerState>()

  private state(peer: string): PeerState {
    let s = this.peers.get(peer)
    if (!s) {
      s = { mcs: Infinity, ceiling: 0, failures: 0, successes: 0 }
      this.peers.set(peer, s)
    }
    return s
  }

  /** The MCS to use with this peer now, given what signal strength allows. */
  mcsFor(peer: string, ceiling: number): number {
    const s = this.state(peer)
    s.ceiling = ceiling
    if (s.mcs > ceiling) s.mcs = ceiling
    return s.mcs
  }

  onFailure(peer: string): void {
    const s = this.state(peer)
    s.successes = 0
    s.failures++
    if (s.failures >= FAILURES_TO_STEP_DOWN) {
      s.failures = 0
      s.mcs = Math.max(0, s.mcs - 1)
    }
  }

  onSuccess(peer: string): void {
    const s = this.state(peer)
    s.failures = 0
    s.successes++
    if (s.successes >= SUCCESSES_TO_STEP_UP) {
      s.successes = 0
      s.mcs = Math.min(s.ceiling, s.mcs + 1)
    }
  }
}
