import { describe, it, expect } from 'vitest'
import {
  BAND_LABEL, LINK_ORDER, MAX_WIDTH, linkOfVirtual, linkPlanFor, negotiatedNss, negotiatedWidth,
  nodeLinks, nssOf, virtualId, widthOf,
} from '../../src/model/caps'
import type { NodeCfg } from '../../src/model/scenario'
import type { Generation } from '../../src/model/types'

function node(gen: Generation, widthMhz?: number, nss?: number): NodeCfg {
  return {
    id: 'n', kind: 'sta', name: 'n', pos: { x: 0, y: 0, z: 1 }, txPowerDbm: 15,
    profiles: [], caps: { generation: gen, features: {}, widthMhz, nss } as NodeCfg['caps'],
  }
}

describe('channel width and spatial streams', () => {
  it('default to 20 MHz and one stream, which is what keeps lessons 1-14 unchanged', () => {
    expect(widthOf(node('eht'))).toBe(20)
    expect(nssOf(node('eht'))).toBe(1)
  })

  it('a link runs at the narrower width and the smaller stream count of its two ends', () => {
    const ap = node('eht', 320, 4)
    const phone = node('eht', 160, 2)
    expect(negotiatedWidth(ap, phone)).toBe(160)
    expect(negotiatedNss(ap, phone)).toBe(2)
  })

  it('a declared width is clamped to what the generation can do', () => {
    expect(widthOf(node('he', 320))).toBe(MAX_WIDTH.he)
    expect(widthOf(node('nonht', 80))).toBe(20)
  })
})

const mk = (id: string, kind: 'ap' | 'sta', generation: 'nonht' | 'vht' | 'he' | 'eht', extra: Partial<NodeCfg> = {}): NodeCfg => ({
  id, kind, name: id, pos: { x: 0, y: 0, z: 1 }, txPowerDbm: 15, profiles: ['idle'],
  caps: { generation, features: {} }, ...extra,
})

describe('the 2.4 GHz link', () => {
  it('virtual ids and band labels', () => {
    expect(virtualId('sta-1', '2g')).toBe('sta-1#2g')
    expect(virtualId('sta-1', '5g')).toBe('sta-1')
    expect(linkOfVirtual('sta-1#2g')).toBe('2g')
    expect(linkOfVirtual('sta-1#6g')).toBe('6g')
    expect(linkOfVirtual('sta-1')).toBe('5g')
    expect(BAND_LABEL).toEqual({ '2g': '2.4G', '5g': '5G', '6g': '6G' })
    expect(LINK_ORDER).toEqual(['5g', '6g', '2g'])
  })

  it('a station with linkId 2g is on the 2.4 GHz link unless it is VHT', () => {
    expect(nodeLinks(mk('s', 'sta', 'nonht', { linkId: '2g' }), false)).toEqual(['2g'])
    expect(nodeLinks(mk('s', 'sta', 'he', { linkId: '2g' }), false)).toEqual(['2g'])
    expect(nodeLinks(mk('s', 'sta', 'eht', { linkId: '2g' }), false)).toEqual(['2g'])
    expect(nodeLinks(mk('s', 'sta', 'vht', { linkId: '2g' }), false)).toEqual(['5g'])
    expect(nodeLinks(mk('s', 'sta', 'he', { linkId: '6g' }), false)).toEqual(['6g'])
    expect(nodeLinks(mk('s', 'sta', 'he'), false)).toEqual(['5g'])
  })

  it('the AP joins every link a station uses; 5 GHz-only scenarios are unchanged', () => {
    const ap = mk('ap', 'ap', 'eht')
    const old = linkPlanFor([ap, mk('a', 'sta', 'he'), mk('b', 'sta', 'nonht')])
    expect(old.links).toEqual(['5g'])
    expect(old.virtualIds).toEqual(['ap', 'a', 'b'])
    const mixed = linkPlanFor([ap, mk('a', 'sta', 'he', { linkId: '2g' }), mk('b', 'sta', 'nonht')])
    expect(mixed.links).toEqual(['5g', '2g'])
    expect(mixed.members['2g']).toEqual(['ap', 'a'])
    expect(mixed.members['5g']).toEqual(['ap', 'b'])
    expect(mixed.virtualIds).toEqual(['ap', 'ap#2g', 'a#2g', 'b'])
  })

  it('an all-2.4 GHz scenario builds no phantom 5 GHz link', () => {
    const plan = linkPlanFor([mk('ap', 'ap', 'eht'), mk('sta', 'sta', 'he', { linkId: '2g' })])
    expect(plan.links).toEqual(['2g'])
    expect(plan.virtualIds).toEqual(['ap#2g', 'sta#2g'])
    expect(plan.members['5g']).toEqual([])
    expect(plan.members['2g']).toEqual(['ap', 'sta'])
  })

  it('an AP on its own still operates one 5 GHz link', () => {
    const plan = linkPlanFor([mk('ap', 'ap', 'eht')])
    expect(plan.links).toEqual(['5g'])
    expect(plan.virtualIds).toEqual(['ap'])
  })

  it('an MLO AP keeps its 5 + 6 GHz pair even when every station is on 5 GHz', () => {
    const ap = mk('ap', 'ap', 'eht', { caps: { generation: 'eht', features: { mlo: true } } })
    const plan = linkPlanFor([ap, mk('a', 'sta', 'he')])
    expect(plan.links).toEqual(['5g', '6g'])
    expect(plan.virtualIds).toEqual(['ap', 'ap#6g', 'a'])
  })

  it('an MLO AP keeps both radios even when only a 2.4 GHz station is present', () => {
    const ap = mk('ap', 'ap', 'eht', { caps: { generation: 'eht', features: { mlo: true } } })
    const plan = linkPlanFor([ap, mk('a', 'sta', 'he', { linkId: '2g' })])
    expect(plan.links).toEqual(['5g', '6g', '2g'])
  })

  it('width is clamped to 40 MHz on 2.4 GHz', () => {
    const n = mk('s', 'sta', 'eht', { caps: { generation: 'eht', features: {}, widthMhz: 160 }, linkId: '2g' })
    expect(widthOf(n)).toBe(160)
    expect(widthOf(n, '2g')).toBe(40)
  })
})
