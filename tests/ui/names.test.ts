import { describe, it, expect } from 'vitest'
import { nodeDisplayName } from '../../src/ui/names'
import { spanTooltip, type LaneSpan } from '../../src/ui/laneLayout'
import { STRINGS } from '../../src/ui/i18n'
import type { NodeCfg } from '../../src/model/scenario'
import type { FrameDesc } from '../../src/model/frames'

const nodes = [{ id: 'ap', name: 'Router' }, { id: 'sta-1', name: 'Laptop (MLO)' }] as NodeCfg[]

describe('nodeDisplayName', () => {
  it('maps engine ids to the scenario names a learner knows', () => {
    expect(nodeDisplayName(nodes, 'sta-1', 'everyone')).toBe('Laptop (MLO)')
    expect(nodeDisplayName(nodes, 'sta-1#6g', 'everyone')).toBe('Laptop (MLO) · 6G')
    expect(nodeDisplayName(nodes, '*mu', 'everyone')).toBe('everyone')
    expect(nodeDisplayName(nodes, '*', 'everyone')).toBe('everyone')
    expect(nodeDisplayName(nodes, 'ghost', 'everyone')).toBe('ghost')
  })
})

describe('spanTooltip names the peer, not its id', () => {
  const nameOf = (id: string) => nodeDisplayName(nodes, id, 'everyone')
  const cts: FrameDesc = { kind: 'cts', src: 'ap', dst: 'sta-1', bytes: 14, mbps: 24, durationFieldNs: 0, txTimeNs: 44_000 }
  const tx: LaneSpan = { kind: 'tx', nodeId: 'ap', startNs: 0, endNs: 44_000, fullStartNs: 0, fullEndNs: 44_000, frameKind: 'cts', frameSrc: 'ap', frame: cts, ifs: [], openStart: false, openEnded: false }
  const rx: LaneSpan = { kind: 'rx', nodeId: 'sta-1', startNs: 0, endNs: 44_000, fullStartNs: 0, fullEndNs: 44_000, frameKind: 'cts', frameSrc: 'ap', ifs: [], openStart: false, openEnded: false }

  it('tx: CTS → Laptop (MLO)', () => {
    const line = spanTooltip(tx, STRINGS.en.tooltips, undefined, nameOf)[0]
    expect(line).toContain('Laptop (MLO)')
    expect(line).not.toContain('sta-1')
  })
  it('rx: receiving CTS from Router', () => {
    const line = spanTooltip(rx, STRINGS.en.tooltips, undefined, nameOf)[0]
    expect(line).toContain('Router')
    expect(line).not.toMatch(/\bap\b/)
  })
  it('without a name map the id is shown unchanged', () => {
    expect(spanTooltip(tx, STRINGS.en.tooltips)[0]).toContain('sta-1')
  })
})
