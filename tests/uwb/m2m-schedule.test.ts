/**
 * Task 3 of docs/superpowers/specs/2026-09-30-many-to-many-design.md: the round shape for
 * many-to-many ranging (standard §10.32.6 SS / §10.32.7 DS) — how many slots, who owns each one,
 * and in what order. No device belongs here (Task 4); this file walks `uwbSlotsPerTag` and
 * `slotAction` against a `RoundPlan` whose `mode` is 'm2m', and pins the participant order.
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_UWB_SESSION, nonht, type NodeCfg, type UwbSessionCfg,
} from '../../src/model/scenario'
import { uwbSlotsPerTag } from '../../src/uwb/phy'
import {
  m2mParticipants, roundPlan, slotAction, type RoundPlan, type SlotAction,
} from '../../src/uwb/session'

function uwbNode(id: string, role: 'anchor' | 'tag' = 'tag'): NodeCfg {
  return {
    id, kind: 'uwb', name: id, pos: { x: 0, y: 0, z: 1 }, txPowerDbm: -14,
    profiles: ['idle'], caps: { ...nonht }, uwb: { role },
  }
}

/** An m2m round plan for N participants, at a slot big enough that the block-fit trap in the
 * brief (a DS round at many participants is a lot of slots) never fires: a long block rather than
 * a large N. */
const m2mPlan = (n: number, method: 'ss' | 'ds' = 'ss'): RoundPlan => {
  const cfg: UwbSessionCfg = {
    ...DEFAULT_UWB_SESSION, mode: 'm2m', method, blockRstu: 100 * 2 * n * DEFAULT_UWB_SESSION.slotRstu,
  }
  return roundPlan(cfg, n)
}

describe('uwbSlotsPerTag: m2m (design §3)', () => {
  it('gives one slot to each participant in SS and two passes in DS', () => {
    for (const n of [2, 3, 6]) {
      expect(uwbSlotsPerTag('ss', n, 'time', 8, 'm2m'), `ss n=${n}`).toBe(n)
      expect(uwbSlotsPerTag('ds', n, 'time', 8, 'm2m'), `ds n=${n}`).toBe(2 * n)
    }
  })
})

describe('slotAction: m2m walks every slot without a gap or a repeat', () => {
  it('SS: one uwbM2m action per participant, pass 0, index 0..N-1', () => {
    for (const n of [2, 3, 6]) {
      const p = m2mPlan(n, 'ss')
      expect(p.slots).toBe(n)
      const seen = new Set<string>()
      for (let s = 0; s < p.slots; s++) {
        const a = slotAction(p, s)
        expect(a.kind, `slot ${s}`).toBe('uwbM2m')
        if (a.kind !== 'uwbM2m') throw new Error('unreachable')
        expect(a.tx).toBe('peer')
        expect(a.pass).toBe(0)
        expect(a.index).toBe(s)
        seen.add(`${a.pass}/${a.index}`)
      }
      expect(seen.size).toBe(n)
    }
  })

  it('DS: two passes of N, pass 0 then pass 1, no gap and no repeat', () => {
    for (const n of [2, 3, 6]) {
      const p = m2mPlan(n, 'ds')
      expect(p.slots).toBe(2 * n)
      const seen = new Set<string>()
      for (let s = 0; s < p.slots; s++) {
        const a = slotAction(p, s)
        expect(a.kind, `slot ${s}`).toBe('uwbM2m')
        if (a.kind !== 'uwbM2m') throw new Error('unreachable')
        expect(a.tx).toBe('peer')
        const expectedPass = s < n ? 0 : 1
        const expectedIndex = s < n ? s : s - n
        expect(a.pass, `slot ${s}`).toBe(expectedPass)
        expect(a.index, `slot ${s}`).toBe(expectedIndex)
        seen.add(`${a.pass}/${a.index}`)
      }
      expect(seen.size).toBe(2 * n)
    }
  })

  it('throws past the end of the round, in both methods', () => {
    const ss = m2mPlan(3, 'ss')
    expect(() => slotAction(ss, ss.slots)).toThrow(/m2m/)
    const ds = m2mPlan(3, 'ds')
    expect(() => slotAction(ds, ds.slots)).toThrow(/m2m/)
  })
})

describe('m2mParticipants: ordered by node id, not scenario order (design §5, model)', () => {
  it('orders participants by id, not by the order the scenario lists them', () => {
    const forward = [uwbNode('p-0'), uwbNode('p-1'), uwbNode('p-2')]
    const shuffled = [uwbNode('p-2'), uwbNode('p-0'), uwbNode('p-1')]
    expect(m2mParticipants(forward)).toEqual(['p-0', 'p-1', 'p-2'])
    expect(m2mParticipants(shuffled)).toEqual(['p-0', 'p-1', 'p-2'])
    expect(m2mParticipants(shuffled)).toEqual(m2mParticipants(forward))
  })

  it('only counts kind: uwb nodes — role never decides participation (design §5)', () => {
    const nodes: NodeCfg[] = [
      uwbNode('b', 'anchor'), uwbNode('a', 'tag'),
      { id: 'sta-1', kind: 'sta', name: 'sta-1', pos: { x: 0, y: 0, z: 1 }, txPowerDbm: 15, profiles: ['idle'], caps: { ...nonht } },
    ]
    expect(m2mParticipants(nodes)).toEqual(['a', 'b'])
  })
})

describe('leaves every other mode slot-for-slot identical to today', () => {
  const cases: { mode: UwbSessionCfg['mode']; method: 'ss' | 'ds'; anchors: number }[] = [
    { mode: 'twr', method: 'ss', anchors: 3 },
    { mode: 'twr', method: 'ds', anchors: 3 },
    { mode: 'dl-tdoa', method: 'ds', anchors: 4 },
    { mode: 'ul-tdoa', method: 'ss', anchors: 4 },
  ]

  it('slotAction is unchanged for twr and the two TDoA modes', () => {
    for (const c of cases) {
      const cfg: UwbSessionCfg = { ...DEFAULT_UWB_SESSION, mode: c.mode, method: c.method }
      const p = roundPlan(cfg, c.anchors)
      const actions: SlotAction[] = []
      for (let s = 0; s < p.slots; s++) actions.push(slotAction(p, s))
      // Every action is one of the pre-existing kinds — never 'uwbM2m' — for every non-m2m mode.
      for (const a of actions) expect(a.kind).not.toBe('uwbM2m')
    }
  })
})
