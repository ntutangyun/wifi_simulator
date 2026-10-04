/**
 * What a disposed player is holding.
 *
 * `dispose` used to stop the worker and keep the recording, and one thing on
 * screen read it anyway: `EventLog` goes to `player.store` directly rather
 * than through `ViewState`, and it sits in the side panel in every mode but
 * the editor — including a course panel that is offering `▶ 载入并观察`.
 *
 * What kept that out of sight was arithmetic. The log's window is
 * `[playhead − 3 ms, playhead + 0.5 ms]`, every path that disposes parks the
 * playhead at 0, and the editor's default document records nothing until the
 * `WAN_TX` at 894 045 ns — 394 µs past the end of it. Lesson scenes do not
 * have that gap, so these tests use one.
 */
import { describe, it, expect } from 'vitest'
import { Player } from '../../src/player/player'
import { TimelineStore } from '../../src/player/timelineStore'
import { Simulation } from '../../src/engine/simulation'
import { LESSONS } from '../../src/course/lessons'

/** EventLog's window at a parked playhead, which is the only one that ever shows a disposed store. */
const WINDOW_AT_ZERO: [number, number] = [0, 500_000]

/** A player holding a lesson's first 2 ms, without a Worker: the store is ingested directly. */
function loadedPlayer(lessonId: string) {
  const lesson = LESSONS.find((l) => l.id === lessonId)!
  const p = new Player(() => {})
  p.store.ingest(new Simulation(lesson.scenario()).runUntil(2_000_000))
  return p
}

const logWouldShow = (p: Player) =>
  p.store.recordsIn(Math.max(p.store.windowStartNs, WINDOW_AT_ZERO[0]), WINDOW_AT_ZERO[1])
    .filter((r) => r.type !== 'MAC_STATE')

describe('a disposed player holds nothing', () => {
  it('the lesson scene these tests use really does record inside the window', () => {
    // Otherwise the next test would pass against an empty store and prove nothing.
    expect(logWouldShow(loadedPlayer('hidden')).length).toBeGreaterThan(0)
  })

  it('dispose drops the recording', () => {
    const p = loadedPlayer('hidden')
    const before = p.store
    p.dispose()
    expect(p.store).not.toBe(before)
    expect(p.store).toBeInstanceOf(TimelineStore)
    expect(p.store.frontierNs).toBe(0)
    expect(logWouldShow(p)).toEqual([])
  })

  it('disposing twice is still nothing', () => {
    const p = loadedPlayer('hidden')
    p.dispose()
    p.dispose()
    expect(logWouldShow(p)).toEqual([])
  })
})
