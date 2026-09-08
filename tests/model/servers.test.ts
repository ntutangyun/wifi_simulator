import { describe, it, expect } from 'vitest'
import { DEFAULT_SERVERS, defaultScenario, serverFor, serverKindFor, type NodeCfg } from '../../src/model/scenario'
import { scenarioFromJson, scenarioToJson } from '../../src/editor/planOps'

describe('cloud servers in the scenario', () => {
  it('the default scenario carries one server of each kind, each with jitter and processing time', () => {
    const sc = defaultScenario()
    expect(sc.servers.map((s) => s.kind).sort()).toEqual(['call', 'game', 'video', 'web'])
    expect(sc.servers).toEqual(DEFAULT_SERVERS)
    for (const s of sc.servers) {
      expect(s.jitterMs).toBeGreaterThan(0)
      expect(s.processMs).toBeGreaterThanOrEqual(0)
    }
  })

  it('a saved server without jitter or processing fields gets zero for both', () => {
    const raw = JSON.parse(scenarioToJson(defaultScenario())) as { servers: Record<string, unknown>[] }
    raw.servers = [{ id: 'srv-game', kind: 'game', name: 'Old', rttMs: 25 }]
    const sc = scenarioFromJson(JSON.stringify(raw))
    expect(sc.servers[0]).toEqual({ id: 'srv-game', kind: 'game', name: 'Old', rttMs: 25, jitterMs: 0, processMs: 0 })
  })

  it('a saved scenario without servers is backfilled with the defaults', () => {
    const raw = JSON.parse(scenarioToJson(defaultScenario())) as Record<string, unknown>
    delete raw.servers
    const sc = scenarioFromJson(JSON.stringify(raw))
    expect(sc.servers).toEqual(DEFAULT_SERVERS)
  })

  it('custom servers and per-stream bindings round-trip', () => {
    const sc = defaultScenario()
    sc.servers = [...sc.servers, { id: 'srv-game-eu', kind: 'game', name: 'EU game server', rttMs: 80, jitterMs: 20, processMs: 2 }]
    sc.nodes[1].profiles = ['gaming']
    sc.nodes[1].servers = { gaming: 'srv-game-eu' }
    const back = scenarioFromJson(scenarioToJson(sc))
    expect(back.servers).toHaveLength(5)
    expect(back.nodes[1].servers).toEqual({ gaming: 'srv-game-eu' })
  })

  it('rejects a binding to a server that does not exist, and duplicate server ids', () => {
    const sc = defaultScenario()
    sc.nodes[1].servers = { video: 'nope' }
    expect(() => scenarioFromJson(scenarioToJson(sc))).toThrow(/nope/)
    const dup = defaultScenario()
    dup.servers = [...dup.servers, { ...dup.servers[0] }]
    expect(() => scenarioFromJson(scenarioToJson(dup))).toThrow(/duplicate/)
  })

  it('serverFor: explicit binding, else the first server of the stream’s kind, else none', () => {
    const sc = defaultScenario()
    sc.servers = [...sc.servers, { id: 'srv-game-eu', kind: 'game', name: 'EU', rttMs: 80, jitterMs: 0, processMs: 0 }]
    const n: NodeCfg = { ...sc.nodes[1], profiles: ['gaming', 'saturated'] }
    expect(serverFor(sc, n, 'gaming')?.id).toBe('srv-game')
    expect(serverFor(sc, { ...n, servers: { gaming: 'srv-game-eu' } }, 'gaming')?.id).toBe('srv-game-eu')
    expect(serverFor(sc, n, 'saturated')).toBeNull()
    expect(serverFor({ ...sc, servers: [] }, n, 'gaming')).toBeNull()
    expect(serverKindFor('backup')).toBe('web')
    expect(serverKindFor('voice')).toBe('call')
  })
})
