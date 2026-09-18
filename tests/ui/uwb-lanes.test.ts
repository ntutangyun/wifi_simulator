import { describe, it, expect } from 'vitest'
import { laneIds } from '../../src/model/lanes'
import { makeEmitter, type EmitFn, type TLRecord } from '../../src/model/records'
import { DEFAULT_UWB_SESSION, type NodeCfg, type Scenario } from '../../src/model/scenario'
import type { FrameDesc } from '../../src/model/frames'
import { recordsToSpans, spanTooltip, type LaneSpan } from '../../src/ui/laneLayout'
import { STRINGS } from '../../src/ui/i18n'
import { nodeDisplayName } from '../../src/ui/names'
import { frameColor } from '../../src/scene/effects'
import { haloColor, statusText } from '../../src/scene/nodes'
import { makePoll, makeResp } from '../../src/uwb/frames'
import { initViewState, type NodeView } from '../../src/model/view'

const uwbNode = (id: string, role: 'anchor' | 'tag'): NodeCfg => ({
  id, kind: 'uwb', name: role === 'tag' ? 'Badge' : `Anchor ${id}`, pos: { x: 0, y: 0, z: 1 },
  txPowerDbm: -14, profiles: ['idle'], caps: { generation: 'nonht', features: {} }, uwb: { role },
})

const wifiNode = (id: string, kind: 'ap' | 'sta'): NodeCfg => ({
  id, kind, name: id, pos: { x: 0, y: 0, z: 1 }, txPowerDbm: 15, profiles: ['idle'],
  caps: { generation: 'he', features: {} },
})

function recs(rs: Parameters<EmitFn>[0][]): TLRecord[] {
  const out: TLRecord[] = []
  const emit = makeEmitter((r) => out.push(r))
  rs.forEach(emit)
  return out
}

describe('laneIds feeds the strip one lane per radio', () => {
  it('puts the Wi-Fi lanes first and one plain-id lane per UWB node after them', () => {
    const nodes = [wifiNode('ap', 'ap'), wifiNode('sta-1', 'sta'), uwbNode('anc-1', 'anchor'), uwbNode('tag-1', 'tag')]
    expect(laneIds(nodes)).toEqual(['ap', 'sta-1', 'anc-1', 'tag-1'])
  })

  it('a UWB-only scenario still has lanes, though the Wi-Fi plan is empty', () => {
    const nodes = [uwbNode('anc-1', 'anchor'), uwbNode('tag-1', 'tag')]
    expect(laneIds(nodes)).toEqual(['anc-1', 'tag-1'])
  })
})

describe('a UWB lane label is the node name, with no band suffix', () => {
  const nodes = [wifiNode('ap', 'ap'), uwbNode('tag-1', 'tag')]
  it('names the node plainly', () => {
    expect(nodeDisplayName(nodes, 'tag-1', 'everyone')).toBe('Badge')
  })
  it('still bands a Wi-Fi lane', () => {
    expect(nodeDisplayName(nodes, 'ap#6g', 'everyone')).toBe('ap · 6G')
  })
})

describe('a uwbWait state draws a slot span', () => {
  const spans = recordsToSpans(recs([
    { t: 100_000, type: 'MAC_STATE', node: 'tag-1', state: 'uwbWait' },
    { t: 600_000, type: 'MAC_STATE', node: 'tag-1', state: 'idle' },
  ]), ['tag-1'], 0, 1_000_000)

  it('yields exactly one slot span over the wait', () => {
    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({ kind: 'slot', startNs: 100_000, endNs: 600_000, state: 'uwbWait' })
  })

  it('tells the learner it is a ranging slot, not an AMP one', () => {
    const uwb = spanTooltip(spans[0], STRINGS.en.tooltips)
    const amp: LaneSpan = { ...spans[0], state: 'ampWait' }
    expect(uwb[0]).toBe(`${STRINGS.en.tooltips.uwbWait} · 500.0 µs`)
    expect(uwb[1]).toBe(STRINGS.en.tooltips.uwbWaitNote)
    expect(spanTooltip(amp, STRINGS.en.tooltips)[0]).not.toBe(uwb[0])
  })

  it('has Chinese text of its own', () => {
    const zh = spanTooltip(spans[0], STRINGS.zh.tooltips)
    expect(zh[0]).not.toBe(spanTooltip(spans[0], STRINGS.en.tooltips)[0])
    expect(zh[1]).toBe(STRINGS.zh.tooltips.uwbWaitNote)
  })
})

describe('UWB frames on a lane', () => {
  const poll: FrameDesc = makePoll('tag-1', ['anc-1'], 'ds', 0, 0)
  const resp: FrameDesc = makeResp('anc-1', 'tag-1', 'ds', 0, 0, 1)
  const txSpan = (f: FrameDesc): LaneSpan => ({
    kind: 'tx', nodeId: f.src, startNs: 0, endNs: f.txTimeNs, fullStartNs: 0, fullEndNs: f.txTimeNs,
    frameKind: f.kind, frameSrc: f.src, frame: f, ifs: [], openStart: false, openEnded: false,
  })

  it.each(['en', 'zh'] as const)('%s tooltips name each UWB frame', (lang) => {
    for (const f of [poll, resp]) {
      const lines = spanTooltip(txSpan(f), STRINGS[lang].tooltips)
      expect(lines[0]).toBeTruthy()
      expect(lines[0]).not.toContain('undefined')
      expect(lines[1]).toContain('6.81 Mbps')
    }
  })

  it('paints tag frames and anchor frames in two shades of amber', () => {
    expect(frameColor(poll, '')).toBe(0xf59e0b)
    expect(frameColor(resp, '')).toBe(0xfbbf24)
  })
})

describe('a UWB node in the 3-D scene', () => {
  const scenario: Scenario = {
    rooms: [{ x: 0, y: 0, w: 12, h: 10, name: 'lab' }],
    walls: [],
    nodes: [uwbNode('anc-1', 'anchor'), uwbNode('tag-1', 'tag')],
    servers: [], seed: 1, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    uwb: DEFAULT_UWB_SESSION,
  }
  /** The real reducer's node view, so the fixture cannot drift from what the app holds. */
  const nv = (slot: number | null): NodeView => {
    const v = initViewState(scenario).nodes['tag-1']
    v.state = 'uwbWait'
    v.uwb!.slot = slot
    return v
  }

  it('halos a ranging slot in amber', () => {
    expect(haloColor('uwbWait', false)).toBe(0xd97706)
  })

  it('annotates the node with the slot it is in', () => {
    expect(statusText(nv(3), 0)).toBe('slot 3')
    expect(statusText(nv(null), 0)).toBe('')
  })
})
