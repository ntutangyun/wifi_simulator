import { describe, it, expect } from 'vitest'
import { STATION_PRESETS, applyPreset, presetNode, type StationPreset } from '../../src/model/presets'
import { defaultScenario } from '../../src/model/scenario'
import { scenarioFromJson, scenarioToJson, spawnRandomStas } from '../../src/editor/planOps'
import { hasFeature, nodeLinks } from '../../src/model/caps'

const byId = (id: string): StationPreset => {
  const p = STATION_PRESETS.find((x) => x.id === id)
  if (!p) throw new Error(`no preset ${id}`)
  return p
}

describe('station presets', () => {
  it('cover the four brands with unique ids and models', () => {
    expect(STATION_PRESETS.length).toBeGreaterThanOrEqual(15)
    expect(new Set(STATION_PRESETS.map((p) => p.id)).size).toBe(STATION_PRESETS.length)
    expect(new Set(STATION_PRESETS.map((p) => p.brand))).toEqual(new Set(['huawei', 'xiaomi', 'honor', 'apple']))
  })

  it('every preset yields a node that survives the scenario schema round trip', () => {
    const sc = defaultScenario()
    sc.nodes = [sc.nodes[0], ...STATION_PRESETS.map((p, i) => presetNode(p, `sta-${i + 1}`, { x: 1 + i * 0.3, y: 2, z: 1 }))]
    const back = scenarioFromJson(scenarioToJson(sc))
    expect(back.nodes.length).toBe(STATION_PRESETS.length + 1)
  })

  it('Wi-Fi 7 phones are EHT with MLO off (no 6 GHz on the Chinese market), Wi-Fi 6 phones are HE', () => {
    const ap = defaultScenario().nodes[0]
    const ultra = presetNode(byId('xiaomi-17-ultra'), 'sta-1', { x: 1, y: 1, z: 1 })
    expect(ultra.caps.generation).toBe('eht')
    expect(hasFeature(ultra, 'mlo')).toBe(false)
    expect(hasFeature(ultra, 'ofdma')).toBe(true)
    expect(nodeLinks(ultra, hasFeature(ap, 'mlo'))).toEqual(['5g'])
    expect(byId('xiaomi-17-ultra').mloCapable).toBe(true)
    expect(presetNode(byId('honor-x9d'), 'sta-2', { x: 1, y: 1, z: 1 }).caps.generation).toBe('he')
    expect(presetNode(byId('apple-iphone-16e'), 'sta-3', { x: 1, y: 1, z: 1 }).caps.generation).toBe('he')
  })

  it('applyPreset keeps the node’s id and position and replaces name, caps and streams', () => {
    const n = presetNode(byId('honor-x9d'), 'sta-9', { x: 3, y: 4, z: 1 })
    const m = applyPreset(n, byId('apple-iphone-17-pro'))
    expect(m.id).toBe('sta-9')
    expect(m.pos).toEqual({ x: 3, y: 4, z: 1 })
    expect(m.name).toContain('iPhone 17 Pro')
    expect(m.caps.generation).toBe('eht')
    expect(m.profiles).toEqual(byId('apple-iphone-17-pro').profiles)
  })

  it('random spawn draws phones from the presets, not legacy 802.11a radios', () => {
    let s = 1
    const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
    const sc = spawnRandomStas(defaultScenario(), 6, rng)
    const added = sc.nodes.slice(-6)
    for (const n of added) {
      expect(n.caps.generation).not.toBe('nonht')
      expect(STATION_PRESETS.some((p) => n.name.startsWith(p.model))).toBe(true)
    }
    expect(new Set(added.map((n) => n.name)).size).toBe(6)
  })
})
