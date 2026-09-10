/**
 * Rate adaptation with loss feedback.
 *
 * Signal strength sets a ceiling (the MCS the propagation model says this link
 * can carry). Consecutive failures push the working rate below it; runs of
 * success climb back. The controller never exceeds the ceiling, so it cannot
 * drift away from the physics, and it holds no randomness, so runs stay
 * reproducible.
 *
 * The loop this closes is the point: a collision costs an attempt, two lost
 * attempts lower the rate, a lower rate makes every frame longer, and longer
 * frames collide more often. Lesson 6's rate anomaly is this loop's steady
 * state.
 */
const FAILURES_TO_STEP_DOWN = 2
const SUCCESSES_TO_STEP_UP = 10

interface PeerState {
  /** How far below the ceiling we are currently running. */
  drop: number
  failures: number
  successes: number
}

export class RateControl {
  private peers = new Map<string, PeerState>()

  private state(peer: string): PeerState {
    let s = this.peers.get(peer)
    if (!s) {
      s = { drop: 0, failures: 0, successes: 0 }
      this.peers.set(peer, s)
    }
    return s
  }

  /** The MCS to use with this peer now, given what signal strength allows. */
  mcsFor(peer: string, ceiling: number): number {
    const s = this.state(peer)
    return Math.max(0, ceiling - s.drop)
  }

  onFailure(peer: string): void {
    const s = this.state(peer)
    s.successes = 0
    s.failures++
    if (s.failures >= FAILURES_TO_STEP_DOWN) {
      s.failures = 0
      s.drop++
    }
  }

  onSuccess(peer: string): void {
    const s = this.state(peer)
    s.failures = 0
    s.successes++
    if (s.successes >= SUCCESSES_TO_STEP_UP) {
      s.successes = 0
      if (s.drop > 0) s.drop--
    }
  }
}
