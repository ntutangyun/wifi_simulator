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

  it('Wi-Fi 6 phones are modelled at 80 MHz, Wi-Fi 7 phones stay at 160 MHz', () => {
    // Apple's own deployment docs (support.apple.com "Wi-Fi and Ethernet
    // specifications for Apple devices") give Wi-Fi 6 iPhones as
    // ax@5 GHz | 1200 Mbps | 80 MHz | 2/MIMO and Wi-Fi 7 iPhones as
    // be@5 GHz | 2400 Mbps | 160 MHz | 2/MIMO.
    const he = ['huawei-mate-60-pro', 'xiaomi-redmi-note-15-pro-plus', 'honor-x9d', 'apple-iphone-16e']
    for (const id of he) {
      expect(byId(id).generation, id).toBe('he')
      expect(byId(id).widthMhz, id).toBe(80)
    }
    const eht = ['huawei-mate-80-pro', 'huawei-pura-80-ultra', 'xiaomi-17-ultra', 'xiaomi-17-pro-max',
      'xiaomi-redmi-k90-pro-max', 'honor-magic8-pro', 'honor-magic-v6', 'honor-500',
      'apple-iphone-17-pro', 'apple-iphone-air', 'apple-iphone-17']
    for (const id of eht) {
      expect(byId(id).generation, id).toBe('eht')
      expect(byId(id).widthMhz, id).toBe(160)
    }
  })

  it('Apple’s eht phones run without 4096-QAM; non-Apple eht phones and Apple’s he phone are unaffected', () => {
    // Apple publishes 2400 Mbps for Wi-Fi 7 at 160 MHz / 2 streams — the
    // 1024-QAM (MCS 11) rate, not the 2882 Mbps 4096-QAM (MCS 13) would
    // allow (see tests/engine/width.test.ts). Modelled by turning qam4k off
    // for Apple's eht presets only.
    const apple = ['apple-iphone-17-pro', 'apple-iphone-air', 'apple-iphone-17']
    for (const id of apple) {
      const n = presetNode(byId(id), 'sta-1', { x: 1, y: 1, z: 1 })
      expect(n.caps.generation, id).toBe('eht')
      expect(hasFeature(n, 'qam4k'), id).toBe(false)
    }
    const nonAppleEht = ['huawei-mate-80-pro', 'huawei-pura-80-ultra', 'xiaomi-17-ultra', 'xiaomi-17-pro-max',
      'xiaomi-redmi-k90-pro-max', 'honor-magic8-pro', 'honor-magic-v6', 'honor-500']
    for (const id of nonAppleEht) {
      const n = presetNode(byId(id), 'sta-1', { x: 1, y: 1, z: 1 })
      expect(hasFeature(n, 'qam4k'), id).toBe(true)
    }
    // apple-iphone-16e is he, which does not have qam4k in its feature set at
    // all (GEN_FEATURES.he excludes it) — nothing to turn off.
    const iphone16e = presetNode(byId('apple-iphone-16e'), 'sta-1', { x: 1, y: 1, z: 1 })
    expect(hasFeature(iphone16e, 'qam4k')).toBe(false)
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
