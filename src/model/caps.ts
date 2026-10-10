/**
 * Wi-Fi generation / feature capability model and STA↔AP negotiation.
 * Generations: nonht (802.11a baseline), vht (Wi-Fi 5), he (Wi-Fi 6), eht (Wi-Fi 7),
 * uhr (Wi-Fi 8 / P802.11bn — a DRAFT; see `PHY_MODES.uhr` in src/engine/phy.ts).
 */
import type { Generation } from './types'
import type { NodeCfg } from './scenario'

export type FeatureFlag = 'edca' | 'ampdu' | 'txop' | 'ofdma' | 'mumimo' | 'mlo' | 'qam4k'
export type LinkId = '2g' | '5g' | '6g'
/** Lane order: 5 and 6 GHz first so scenarios that predate the 2.4 GHz link keep their lanes. */
export const LINK_ORDER: LinkId[] = ['5g', '6g', '2g']
export const BAND_LABEL: Record<LinkId, string> = { '2g': '2.4G', '5g': '5G', '6g': '6G' }
export type ChannelWidth = 20 | 40 | 80 | 160 | 320
export type Nss = 1 | 2 | 3 | 4

/**
 * Widest channel each generation can operate. Non-HT is 20 MHz only.
 *
 * `uhr`'s 320 comes from the draft rather than from EHT by analogy: TGbn SFD r19's own receiver
 * minimum-sensitivity table (Motion #417) publishes a 320 MHz PPDU column, and its RU allocation
 * list names the 320 MHz PPDU explicitly.
 */
export const MAX_WIDTH: Record<Generation, ChannelWidth> = {
  nonht: 20, vht: 160, he: 160, eht: 320, uhr: 320,
}

/** Operating width, defaulted to 20 MHz and clamped to the generation's maximum; 2.4 GHz caps everything at 40 MHz. */
export function widthOf(n: NodeCfg, link?: LinkId): ChannelWidth {
  const want = n.caps.widthMhz ?? 20
  const max = Math.min(MAX_WIDTH[n.caps.generation], link === '2g' ? 40 : 320)
  return (want > max ? max : want) as ChannelWidth
}

/** Spatial streams, defaulted to 1. */
export function nssOf(n: NodeCfg): Nss {
  return (n.caps.nss ?? 1) as Nss
}

/** A link runs at the narrower of the two ends. */
export function negotiatedWidth(a: NodeCfg, b: NodeCfg, link?: LinkId): ChannelWidth {
  return Math.min(widthOf(a, link), widthOf(b, link)) as ChannelWidth
}

/** A link runs at the smaller stream count of the two ends. */
export function negotiatedNss(a: NodeCfg, b: NodeCfg): Nss {
  return Math.min(nssOf(a), nssOf(b)) as Nss
}

export const GEN_RANK: Record<Generation, number> = { nonht: 0, vht: 1, he: 2, eht: 3, uhr: 4 }

/**
 * Every generation, lowest first.
 *
 * **It exists because the compiler cannot see a test's own list.** `Generation` gained a fifth
 * member and `tsc -b` named seven `Record<Generation, …>` literals — and NOT ONE of the six
 * generation matrices in `tests/`, because `['nonht', 'vht', 'he', 'eht']` stays a perfectly
 * well-typed `Generation[]` when a fifth member appears. Those matrices would simply have gone
 * on measuring four generations under a title claiming they walk every pair. So the lists live
 * here, derived from `GEN_RANK` and welded to it by `tests/model/caps.test.ts`, and a seventh
 * generation grows every matrix with nothing to edit.
 */
export const GENERATIONS: readonly Generation[] =
  (Object.keys(GEN_RANK) as Generation[]).sort((a, b) => GEN_RANK[a] - GEN_RANK[b])

export const GEN_LABEL: Record<Generation, string> = {
  nonht: '802.11a (legacy)',
  vht: 'Wi-Fi 5 (VHT)',
  he: 'Wi-Fi 6 (HE)',
  eht: 'Wi-Fi 7 (EHT)',
  uhr: 'Wi-Fi 8 (UHR, draft)',
}

/**
 * Which features a generation may implement.
 *
 * `uhr` carries EHT's list and nothing more. The draft's basis for each: SFD r19 names the UHR
 * MU PPDU and the UHR TB PPDU (so `ofdma` / `mumimo`), and the PAR requires backward
 * compatibility with EHT MAC/PHY operation (so the EDCA/A-MPDU/TXOP/MLO set carries over).
 * `qam4k` rides on that same compatibility and on Motion #419, which keeps the UHR TB PPDU's
 * constellation-error requirement for MCS0-15 at EHT's definitions: the 4096-QAM pair is EHT's
 * MCS 12 and 13 and it keeps those two draft numbers, which is why `UHR_SFD_MCS` ends `12, 13`
 * while the four MCSs 11bn actually adds are 17 / 19 / 20 / 23.
 *
 * **Motion #200 is NOT that basis, and this comment cited it as one until 2026-10-10.** The
 * motion's whole text is `Include 4096-QAM in UHR UEQM` (tables/sfd_full.md:569), and it sits in
 * the unequal-modulation subsection between #199 `Exclude BPSK from UHR UEQM` and #216's
 * mandatory-MCS list. So it rules on which constellations UEQM may mix ACROSS SPATIAL STREAMS
 * — a feature this engine does not model at all, since every mode here is one stream and equal
 * modulation. It presupposes the rung rather than granting it, and quoting it for the general
 * proposition read more into it than it says.
 *
 * **Nothing NEW of 11bn's is switched on here** — MAPC, NPCA, co-BF and the rest are a
 * different slice's problem and most of their SFD sections are still `TBD`.
 */
export const GEN_FEATURES: Record<Generation, FeatureFlag[]> = {
  nonht: [],
  vht: ['edca', 'ampdu', 'txop'],
  he: ['edca', 'ampdu', 'txop', 'ofdma', 'mumimo'],
  eht: ['edca', 'ampdu', 'txop', 'ofdma', 'mumimo', 'mlo', 'qam4k'],
  uhr: ['edca', 'ampdu', 'txop', 'ofdma', 'mumimo', 'mlo', 'qam4k'],
}

/**
 * **Beware: nothing renders this.** The labels a reader actually sees are `features` in
 * `src/ui/i18n.ts`, which the editor's checkbox list reads (`FloorPlanEditor.tsx`); this table
 * has had no consumer since it was written. It is kept because it is the English-side wording of
 * the same seven switches, and `tests/model/caps.test.ts` now welds the two together so that an
 * edit to one cannot leave the other saying something else — which is exactly what happened to
 * `qam4k` below.
 *
 * `qam4k` used to read 「4096-QAM (MCS 12/13)」 in both places. Those two rung numbers are EHT's:
 * `uhr` interleaves four new rungs underneath, so its 4096-QAM pair is index 16/17 and the
 * sentence became false the moment the generation dropdown gained Wi-Fi 8 — a label printed
 * beside a checkbox a `uhr` node can tick today. What is true of BOTH, and is asserted rather
 * than narrated, is the position: `PHY_MODES[m].qam4kFromMcs === PHY_MODES[m].ndbps.length - 2`
 * for every mode that has a 4096-QAM rung at all, so the pair is the top two rungs of whichever
 * ladder the node is on. One wording for both generations was the cheaper of the two fixes the
 * ruling allowed: the alternative — a label per generation — would have turned this `Record` and
 * i18n's into functions of `Generation` and touched the editor's render as well.
 */
export const FEATURE_LABEL: Record<FeatureFlag, string> = {
  edca: 'EDCA (QoS access categories)',
  ampdu: 'A-MPDU aggregation + BlockAck',
  txop: 'TXOP bursting',
  ofdma: 'OFDMA (MU scheduling)',
  mumimo: 'MU-MIMO (multi-user by space)',
  mlo: 'Multi-Link Operation',
  qam4k: '4096-QAM (the top two rungs of the ladder)',
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

/** Links a node operates on. The AP's links are decided by linkPlanFor (every link a station uses). */
export function nodeLinks(n: NodeCfg, apMlo: boolean): LinkId[] {
  // A UWB node has no Wi-Fi radio at all: it holds a timeline lane of its own
  // (see model/lanes.ts) and never appears on a Wi-Fi link.
  if (n.kind === 'uwb') return []
  if (n.kind === 'amp') return ['2g']
  if (hasFeature(n, 'mlo') && (n.kind === 'ap' || apMlo)) return ['5g', '6g']
  const g = n.caps.generation
  if (n.kind !== 'ap' && n.linkId === '2g' && g !== 'vht') return ['2g']
  // 6 GHz: HE and later. `uhr` is in because the TGbn PAR puts 11bn between 1 and 7.25 GHz and
  // requires coexistence in the 2.4, 5 and 6 GHz unlicensed bands; leaving it out would make a
  // Wi-Fi 8 station the only modern radio in this engine that cannot reach 6 GHz.
  if (n.kind !== 'ap' && (g === 'he' || g === 'eht' || g === 'uhr') && n.linkId === '6g') return ['6g']
  return ['5g']
}

/** Virtual node id for a node's MAC instance on a link (primary link keeps the plain id). */
export function virtualId(nodeId: string, link: LinkId): string {
  return link === '5g' ? nodeId : `${nodeId}#${link}`
}

export function physicalId(vid: string): string {
  const i = vid.indexOf('#')
  return i < 0 ? vid : vid.slice(0, i)
}

export function linkOfVirtual(vid: string): LinkId {
  const i = vid.indexOf('#')
  return i < 0 ? '5g' : (vid.slice(i + 1) as LinkId)
}

export interface LinkPlan {
  links: LinkId[]
  /** per link: member node ids (physical). */
  members: Record<LinkId, string[]>
  /** all virtual ids in lane order (scenario node order, 5g row before 6g/2g rows). */
  virtualIds: string[]
}

/**
 * The Wi-Fi side of a scenario. UWB nodes are ignored everywhere, so a
 * UWB-only scenario yields an empty plan (no AP, no links, no lanes) rather
 * than a phantom 5 GHz link or a throw.
 */
export function linkPlanFor(nodes: NodeCfg[]): LinkPlan {
  const ap = nodes.find((n) => n.kind === 'ap')
  const apMlo = ap ? hasFeature(ap, 'mlo') : false
  const staLinks = new Map<string, LinkId[]>()
  // "The AP is a member of every link that has at least one other member": the
  // set of links comes from the stations (plus 5 + 6 GHz for an MLO AP, which
  // always runs both of its radios, even with no station on one of them),
  // never from an unconditional 5 GHz seed — an all-2.4 GHz scenario must not
  // build a phantom, empty 5 GHz link.
  const used = new Set<LinkId>()
  if (apMlo) { used.add('5g'); used.add('6g') }
  for (const n of nodes) {
    if (n.kind === 'ap' || n.kind === 'uwb') continue
    const ls = nodeLinks(n, apMlo)
    staLinks.set(n.id, ls)
    for (const l of ls) used.add(l)
  }
  if (used.size === 0) used.add('5g') // an AP on its own still operates one link
  const apLinks = LINK_ORDER.filter((l) => used.has(l))
  const members: Record<LinkId, string[]> = { '2g': [], '5g': [], '6g': [] }
  const virtualIds: string[] = []
  for (const n of nodes) {
    if (n.kind === 'uwb') continue
    for (const l of n.kind === 'ap' ? apLinks : staLinks.get(n.id)!) {
      members[l].push(n.id)
      virtualIds.push(virtualId(n.id, l))
    }
  }
  const links = LINK_ORDER.filter((l) => members[l].length > 0)
  return { links, members, virtualIds }
}
