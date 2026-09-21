import {
  DEFAULT_AMP_AP, DEFAULT_AMP_BS, type AmpBackscatterCfg, type NodeCfg, type Scenario,
} from '../../src/model/scenario'
import type { TLRecord } from '../../src/model/records'

/**
 * Scenes for the mono-static backscatter tier. The reader sits at (5, 4) at the tags' own
 * height: a backscatter link is a tens-of-centimetres affair, so a metre of ceiling between
 * them would put every tag out of range before the geometry said anything.
 */
export const AP_POS = { x: 5, y: 4, z: 1 }

/** A backscatter tag `dM` metres from the reader, along +x (or +y, so two tags can share a distance). */
export function bsTag(id: string, dM: number, axis: 'x' | 'y' = 'x'): NodeCfg {
  return {
    id, kind: 'amp', name: id, linkId: '2g',
    pos: { x: AP_POS.x + (axis === 'x' ? dM : 0), y: AP_POS.y + (axis === 'y' ? dM : 0), z: AP_POS.z },
    txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} },
    ampTag: { mode: 'backscatter' },
  }
}

export type ReaderOver = Partial<AmpBackscatterCfg> & { pollIntervalMs?: number; seed?: number }

/** A 10 × 8 lab: one Wi-Fi 7 reader with the RFID inventory on, plus whatever nodes are handed in. */
export function bsScenario(over: ReaderOver = {}, tags: NodeCfg[] = [], extra: NodeCfg[] = []): Scenario {
  const { pollIntervalMs, seed, ...bs } = over
  return {
    rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }], walls: [], servers: [], seed: seed ?? 7,
    rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    nodes: [
      {
        id: 'ap', kind: 'ap', name: 'Reader', pos: { ...AP_POS }, txPowerDbm: 20, profiles: ['idle'],
        caps: { generation: 'eht', features: { edca: true, txop: true } },
        ampAp: {
          ...DEFAULT_AMP_AP,
          ...(pollIntervalMs === undefined ? {} : { pollIntervalMs }),
          backscatter: { ...DEFAULT_AMP_BS, ...bs },
        },
      },
      ...tags, ...extra,
    ],
  }
}

export const ofType = <K extends TLRecord['type']>(rs: TLRecord[], type: K, node?: string) =>
  rs.filter((r): r is Extract<TLRecord, { type: K }> => r.type === type && (node === undefined || (r as { node?: string }).node === node))
