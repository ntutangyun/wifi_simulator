/**
 * Wi-Fi generation / feature capability model and STA↔AP negotiation.
 * Generations: nonht (802.11a baseline), vht (Wi-Fi 5), he (Wi-Fi 6), eht (Wi-Fi 7).
 */
import type { Generation } from './types'
import type { NodeCfg } from './scenario'

export type FeatureFlag = 'edca' | 'ampdu' | 'txop' | 'ofdma' | 'mlo' | 'qam4k'
export type LinkId = '5g' | '6g'

export const GEN_RANK: Record<Generation, number> = { nonht: 0, vht: 1, he: 2, eht: 3 }

export const GEN_LABEL: Record<Generation, string> = {
  nonht: '802.11a (legacy)',
  vht: 'Wi-Fi 5 (VHT)',
  he: 'Wi-Fi 6 (HE)',
  eht: 'Wi-Fi 7 (EHT)',
}

/** Which features a generation may implement. */
export const GEN_FEATURES: Record<Generation, FeatureFlag[]> = {
  nonht: [],
  vht: ['edca', 'ampdu', 'txop'],
  he: ['edca', 'ampdu', 'txop', 'ofdma'],
  eht: ['edca', 'ampdu', 'txop', 'ofdma', 'mlo', 'qam4k'],
}

export const FEATURE_LABEL: Record<FeatureFlag, string> = {
  edca: 'EDCA (QoS access categories)',
  ampdu: 'A-MPDU aggregation + BlockAck',
  txop: 'TXOP bursting',
  ofdma: 'OFDMA (MU scheduling)',
  mlo: 'Multi-Link Operation',
  qam4k: '4096-QAM (MCS 12/13)',
}

/** Default: everything the generation allows is on. */
export function defaultFeatures(gen: Generation): Partial<Record<FeatureFlag, boolean>> {
  const f: Partial<Record<FeatureFlag, boolean>> = {}
  for (const flag of GEN_FEATURES[gen]) f[flag] = true
  return f
}

export function hasFeature(n: NodeCfg, flag: FeatureFlag): boolean {
  return GEN_FEATURES[n.caps.generation].includes(flag) && n.caps.features[flag] === true
}

/** Feature usable on a link only when both ends implement and enable it. */
export function negotiated(a: NodeCfg, b: NodeCfg, flag: FeatureFlag): boolean {
  return hasFeature(a, flag) && hasFeature(b, flag)
}

export function minGen(a: Generation, b: Generation): Generation {
  return GEN_RANK[a] <= GEN_RANK[b] ? a : b
}

/** Links a node operates on. MLO (both ends checked at Simulation level) → both. */
export function nodeLinks(n: NodeCfg, apMlo: boolean): LinkId[] {
  if (hasFeature(n, 'mlo') && (n.kind === 'ap' || apMlo)) return ['5g', '6g']
  const g = n.caps.generation
  if ((g === 'he' || g === 'eht') && n.linkId === '6g') return ['6g']
  return ['5g']
}

/** Virtual node id for a node's MAC instance on a link (primary link keeps the plain id). */
export function virtualId(nodeId: string, link: LinkId): string {
  return link === '5g' ? nodeId : `${nodeId}#6g`
}

export function physicalId(vid: string): string {
  const i = vid.indexOf('#')
  return i < 0 ? vid : vid.slice(0, i)
}

export function linkOfVirtual(vid: string): LinkId {
  return vid.includes('#6g') ? '6g' : '5g'
}

export interface LinkPlan {
  links: LinkId[]
  /** per link: member node ids (physical). */
  members: Record<LinkId, string[]>
  /** all virtual ids in lane order (scenario node order, 5g row before 6g row). */
  virtualIds: string[]
}

export function linkPlanFor(nodes: NodeCfg[]): LinkPlan {
  const ap = nodes.find((n) => n.kind === 'ap')
  const apMlo = ap ? hasFeature(ap, 'mlo') : false
  const members: Record<LinkId, string[]> = { '5g': [], '6g': [] }
  const virtualIds: string[] = []
  for (const n of nodes) {
    const links = nodeLinks(n, apMlo)
    for (const l of links) {
      members[l].push(n.id)
      virtualIds.push(virtualId(n.id, l))
    }
  }
  const links: LinkId[] = members['6g'].length > 0 ? ['5g', '6g'] : ['5g']
  return { links, members, virtualIds }
}
