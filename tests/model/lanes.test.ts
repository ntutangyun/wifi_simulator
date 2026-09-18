import { describe, it, expect } from 'vitest'
import { linkPlanFor, nodeLinks } from '../../src/model/caps'
import { laneIds } from '../../src/model/lanes'
import type { NodeCfg } from '../../src/model/scenario'
import type { Generation, NodeKind } from '../../src/model/types'

const mk = (id: string, kind: NodeKind, generation: Generation, extra: Partial<NodeCfg> = {}): NodeCfg => ({
  id, kind, name: id, pos: { x: 0, y: 0, z: 1 }, txPowerDbm: 15, profiles: ['idle'],
  caps: { generation, features: {} }, ...extra,
})

const anchor = (id: string) => mk(id, 'uwb', 'nonht', { uwb: { role: 'anchor' } })
const tag = (id: string) => mk(id, 'uwb', 'nonht', { uwb: { role: 'tag' } })

describe('timeline lanes', () => {
  it('puts the Wi-Fi link plan first and every UWB node after it, in scenario order', () => {
    const nodes = [mk('ap', 'ap', 'he'), mk('sta', 'sta', 'he'), anchor('anchor'), tag('tag')]
    expect(laneIds(nodes)).toEqual(['ap', 'sta', 'anchor', 'tag'])
  })

  it('a UWB-only scenario has exactly the UWB lanes', () => {
    const nodes = [anchor('anc-1'), anchor('anc-2'), tag('tag-1')]
    expect(laneIds(nodes)).toEqual(['anc-1', 'anc-2', 'tag-1'])
  })

  it('an MLO scenario keeps exactly the link plan’s virtual ids', () => {
    const nodes = [
      mk('ap', 'ap', 'eht', { caps: { generation: 'eht', features: { mlo: true } } }),
      mk('a', 'sta', 'eht', { caps: { generation: 'eht', features: { mlo: true } } }),
      mk('b', 'sta', 'he'),
    ]
    expect(laneIds(nodes)).toEqual(linkPlanFor(nodes).virtualIds)
    expect(laneIds(nodes)).toContain('ap#6g')
  })
})

describe('the Wi-Fi link plan ignores UWB nodes', () => {
  it('a UWB node operates no Wi-Fi link', () => {
    expect(nodeLinks(anchor('anc-1'), false)).toEqual([])
  })

  it('a UWB-only scenario yields an empty plan instead of throwing', () => {
    const plan = linkPlanFor([anchor('anc-1'), tag('tag-1')])
    expect(plan).toEqual({ links: [], members: { '2g': [], '5g': [], '6g': [] }, virtualIds: [] })
  })

  it('UWB nodes do not disturb the Wi-Fi lanes beside them', () => {
    const wifi = [mk('ap', 'ap', 'he'), mk('sta', 'sta', 'he', { linkId: '2g' })]
    const mixed = [...wifi, anchor('anc-1'), tag('tag-1')]
    expect(linkPlanFor(mixed)).toEqual(linkPlanFor(wifi))
  })
})
