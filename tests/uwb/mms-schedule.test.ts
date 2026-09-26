/**
 * Who owns a slot of an MMS round — `slotAction` on a `roundPlan` whose mode is 'mms' — now that
 * the layout has two shapes.
 *
 * The interleaved round gathers its narrowband windows into a prefix at the top, and the schedule
 * was written to read the round that way: slot 0 is the POLL, and anything below `controlSlots`
 * is the control phase. Non-interleaved sub-rounds break both readings. There `controlSlots` is a
 * **total**, one window scattered to the head of each sub-round, so slots below it are ranging
 * slots of the first sub-round; and slot 0 belongs to whichever device owns the first sub-round,
 * which under `reversedOrder` is a responder. The schema already accepts `nonInterleaved`, so
 * both wrong answers are reachable from a scenario that parses.
 *
 * What is pinned here: the schedule asks the layout where each window is rather than assuming a
 * prefix; the round plan takes its fragment spacing from the layout, so the span the receiver
 * walks its RMARKER back over is the span the schedule really produced; and the interleaved
 * answers are unchanged slot for slot against tables taken before any of this moved.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_UWB_SESSION, type UwbSessionCfg } from '../../src/model/scenario'
import { MS_NS } from '../../src/uwb/mms'
import { roundPlan, rstuNs, slotAction, type RoundPlan } from '../../src/uwb/session'

/** An MMS session at the draft's 600 RSTU slot, which is what makes a millisecond two slots. */
const plan = (over: Partial<UwbSessionCfg['mms']> = {}, anchors = 1): RoundPlan => {
  const cfg: UwbSessionCfg = {
    ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu: 600,
    mms: { ...DEFAULT_UWB_SESSION.mms, ...over },
  }
  return roundPlan(cfg, anchors)
}

/** One slot's action as a short string, so a whole round fits in a table a human can read:
 * `kind/tx/anchor/index`, with the fields an action does not carry left out. */
const at = (p: RoundPlan, slot: number): string => {
  const a = slotAction(p, slot) as Record<string, unknown>
  return [a.kind, a.tx, a.anchor, a.index].filter((v) => v !== undefined).join('/')
}

const wholeRound = (p: RoundPlan): string[] =>
  Array.from({ length: p.slots }, (_, s) => at(p, s))

describe('the schedule asks the layout where the narrowband windows are', () => {
  it('opens every sub-round with that sub-round’s own window', () => {
    const p = plan({ nonInterleaved: true, oneToMany: true }, 3)
    const l = p.mms!.layout
    expect(l.subRounds).toBe(4)
    expect(at(p, l.pollSlot())).toBe('nbPoll/tag')
    for (let k = 0; k < 3; k++) expect(at(p, l.respSlot(k)), `resp ${k}`).toBe(`nbResp/anchor/${k}`)
    // and each of those is the head of a sub-round, not a slot of a shared prefix
    expect(l.pollSlot()).toBe(l.subRoundStart(0))
    expect(l.respSlot(2)).toBe(l.subRoundStart(3))
  })

  it('does not put the POLL in slot 0 when the responders transmit first', () => {
    const p = plan({ nonInterleaved: true, reversedOrder: true }, 1)
    const l = p.mms!.layout
    expect(at(p, 0)).toBe('nbResp/anchor/0')
    expect(l.pollSlot()).toBeGreaterThan(0)
    expect(at(p, l.pollSlot())).toBe('nbPoll/tag')
  })

  it('schedules the slots the old control prefix swallowed', () => {
    // R = 1 non-interleaved: `controlSlots` is 4 — two windows, one per sub-round — but the
    // initiator's own ranging phase starts at slot 2, so slots 2–3 are inside the prefix the
    // schedule used to treat as control and answered idle for. The responder's RESP window sits
    // the other side of the prefix, at the head of sub-round 1, and was answered idle too: the
    // responder was never told the round had opened.
    const p = plan({ nonInterleaved: true }, 1)
    const l = p.mms!.layout
    expect(l.controlSlots).toBe(4)
    expect(at(p, 2)).toBe('uwbRsf/tag/0/0')
    expect(l.respSlot(0)).toBeGreaterThan(l.controlSlots)
    expect(at(p, l.respSlot(0))).toBe('nbResp/anchor/0')
  })

  it('keeps the second slot of each window idle, whichever shape the round has', () => {
    for (const nonInterleaved of [false, true]) {
      const p = plan({ nonInterleaved }, 1)
      const l = p.mms!.layout
      expect(at(p, l.pollSlot() + 1), `ni=${nonInterleaved}`).toBe('idle')
      expect(at(p, l.respSlot(0) + 1), `ni=${nonInterleaved}`).toBe('idle')
    }
  })

  it('reaches every fragment of every non-interleaved train, exactly once', () => {
    const p = plan({ nonInterleaved: true, oneToMany: true, rifs: 4 }, 3)
    const l = p.mms!.layout
    const seen = new Set<string>()
    for (let s = 0; s < p.slots; s++) {
      const a = slotAction(p, s)
      if (a.kind === 'uwbRsf' || a.kind === 'uwbRif') {
        const key = `${a.kind}/${a.tx}/${a.anchor}/${a.index}`
        expect(seen.has(key), `${key} twice`).toBe(false)
        seen.add(key)
      }
    }
    // four devices, 8 RSFs and 4 RIFs each
    expect(seen.size).toBe(4 * 12)
    expect(at(p, l.fragmentSlot('responder', 'rif', 3, 2))).toBe('uwbRif/anchor/2/3')
  })

  it('still reports each end of a non-interleaved round', () => {
    const p = plan({ nonInterleaved: true }, 1)
    const l = p.mms!.layout
    expect(at(p, l.reportSlot('responder', 0))).toBe('nbReport/anchor/0')
    expect(at(p, l.reportSlot('initiator', 0))).toBe('nbReport/tag/0')
  })
})

describe('the fragment spacing has one source, and it is the layout', () => {
  it('is a true millisecond in the pairwise interleaved round', () => {
    expect(plan().mms!.fragGapNs).toBe(MS_NS)
  })

  it('is two milliseconds in a three-responder interleaved round, and says so', () => {
    // (R + 1) slots to a millisecond is what interleaving costs, and no legal slot length
    // brings it back — the answer is to report it, not to hide it
    expect(plan({ oneToMany: true }, 3).mms!.fragGapNs).toBe(2 * MS_NS)
  })

  it('is a millisecond non-interleaved however many responders are in the round', () => {
    for (const r of [1, 2, 3]) {
      expect(plan({ nonInterleaved: true, oneToMany: true }, r).mms!.fragGapNs, `${r}`).toBe(MS_NS)
    }
  })

  it('is the layout’s own count of slots times the slot, in every shape', () => {
    for (const nonInterleaved of [false, true]) {
      for (const oneToMany of [false, true]) {
        for (const slotRstu of [600, 1200, 2400]) {
          const cfg: UwbSessionCfg = {
            ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu,
            mms: { ...DEFAULT_UWB_SESSION.mms, nonInterleaved, oneToMany },
          }
          const p = roundPlan(cfg, 3)
          const tag = `ni=${nonInterleaved} o2m=${oneToMany} ${slotRstu}`
          expect(p.mms!.fragGapNs, tag).toBe(p.mms!.layout.fragGapSlots * rstuNs(slotRstu))
          // and never under a millisecond: that gap is the regulatory energy budget one
          // fragment is allowed to spend, and half of it would be twice the mean power
          expect(p.mms!.fragGapNs, tag).toBeGreaterThanOrEqual(MS_NS)
        }
      }
    }
  })

  it('lays the round out in the slots the plan says it has', () => {
    // `uwbSlotsPerTag` sizes the round for the schema's block-fit rule and `roundPlan` lays it
    // out: a coarse slot makes a millisecond fewer slots, and if only one of the two knew that,
    // the last fragments of the round would fall past `p.slots` and never be scheduled.
    for (const nonInterleaved of [false, true]) {
      for (const slotRstu of [300, 600, 1200, 2400]) {
        const cfg: UwbSessionCfg = {
          ...DEFAULT_UWB_SESSION, mode: 'mms', method: 'ss', slotRstu,
          mms: { ...DEFAULT_UWB_SESSION.mms, nonInterleaved, oneToMany: true },
        }
        const p = roundPlan(cfg, 3)
        expect(p.slots, `ni=${nonInterleaved} ${slotRstu}`).toBe(p.mms!.layout.slots)
      }
    }
  })
})

/**
 * The interleaved round, slot for slot, against tables read off the schedule before the
 * non-interleaved shape touched any of it. Nothing in the interleaved path may move by one entry:
 * every stored plan in `tests/fixtures/` replays off these answers.
 */
describe('the interleaved round answers exactly what it answered before', () => {
  const PAIR = [
    'nbPoll/tag', 'idle', 'nbResp/anchor/0', 'idle',
    'uwbRsf/tag/0/0', 'uwbRsf/anchor/0/0', 'uwbRsf/tag/0/1', 'uwbRsf/anchor/0/1',
    'uwbRsf/tag/0/2', 'uwbRsf/anchor/0/2', 'uwbRsf/tag/0/3', 'uwbRsf/anchor/0/3',
    'uwbRsf/tag/0/4', 'uwbRsf/anchor/0/4', 'uwbRsf/tag/0/5', 'uwbRsf/anchor/0/5',
    'uwbRsf/tag/0/6', 'uwbRsf/anchor/0/6', 'uwbRsf/tag/0/7', 'uwbRsf/anchor/0/7',
    'idle', 'idle', 'idle', 'idle',
    'nbReport/anchor/0', 'idle', 'nbReport/tag/0', 'idle',
  ]

  const O2M3 = [
    'nbPoll/tag', 'idle', 'nbResp/anchor/0', 'idle', 'nbResp/anchor/1', 'idle', 'nbResp/anchor/2', 'idle',
    'uwbRsf/tag/0/0', 'uwbRsf/anchor/0/0', 'uwbRsf/anchor/1/0', 'uwbRsf/anchor/2/0',
    'uwbRsf/tag/0/1', 'uwbRsf/anchor/0/1', 'uwbRsf/anchor/1/1', 'uwbRsf/anchor/2/1',
    'uwbRsf/tag/0/2', 'uwbRsf/anchor/0/2', 'uwbRsf/anchor/1/2', 'uwbRsf/anchor/2/2',
    'uwbRsf/tag/0/3', 'uwbRsf/anchor/0/3', 'uwbRsf/anchor/1/3', 'uwbRsf/anchor/2/3',
    'uwbRsf/tag/0/4', 'uwbRsf/anchor/0/4', 'uwbRsf/anchor/1/4', 'uwbRsf/anchor/2/4',
    'uwbRsf/tag/0/5', 'uwbRsf/anchor/0/5', 'uwbRsf/anchor/1/5', 'uwbRsf/anchor/2/5',
    'uwbRsf/tag/0/6', 'uwbRsf/anchor/0/6', 'uwbRsf/anchor/1/6', 'uwbRsf/anchor/2/6',
    'uwbRsf/tag/0/7', 'uwbRsf/anchor/0/7', 'uwbRsf/anchor/1/7', 'uwbRsf/anchor/2/7',
    'nbReport/anchor/0', 'idle', 'nbReport/tag/0', 'idle',
    'nbReport/anchor/1', 'idle', 'nbReport/tag/1', 'idle',
    'nbReport/anchor/2', 'idle', 'nbReport/tag/2', 'idle',
  ]

  /** X = 8, Y = 8, Z = 2: the two idle milliseconds between the trains are where a drift of one
   * slot in the phase arithmetic would show up first. */
  const RIF = [
    'nbPoll/tag', 'idle', 'nbResp/anchor/0', 'idle',
    'uwbRsf/tag/0/0', 'uwbRsf/anchor/0/0', 'uwbRsf/tag/0/1', 'uwbRsf/anchor/0/1',
    'uwbRsf/tag/0/2', 'uwbRsf/anchor/0/2', 'uwbRsf/tag/0/3', 'uwbRsf/anchor/0/3',
    'uwbRsf/tag/0/4', 'uwbRsf/anchor/0/4', 'uwbRsf/tag/0/5', 'uwbRsf/anchor/0/5',
    'uwbRsf/tag/0/6', 'uwbRsf/anchor/0/6', 'uwbRsf/tag/0/7', 'uwbRsf/anchor/0/7',
    'idle', 'idle',
    'uwbRif/tag/0/0', 'uwbRif/anchor/0/0', 'uwbRif/tag/0/1', 'uwbRif/anchor/0/1',
    'uwbRif/tag/0/2', 'uwbRif/anchor/0/2', 'uwbRif/tag/0/3', 'uwbRif/anchor/0/3',
    'uwbRif/tag/0/4', 'uwbRif/anchor/0/4', 'uwbRif/tag/0/5', 'uwbRif/anchor/0/5',
    'uwbRif/tag/0/6', 'uwbRif/anchor/0/6', 'uwbRif/tag/0/7', 'uwbRif/anchor/0/7',
    'nbReport/anchor/0', 'idle', 'nbReport/tag/0', 'idle',
  ]

  it('the pairwise round, every slot', () => {
    expect(wholeRound(plan())).toEqual(PAIR)
  })

  it('a three-responder one-to-many round, every slot', () => {
    expect(wholeRound(plan({ oneToMany: true }, 3))).toEqual(O2M3)
  })

  it('a train with RIFs and a two-millisecond Z, every slot', () => {
    expect(wholeRound(plan({ rifs: 8, gapMs: 2 }))).toEqual(RIF)
  })
})
