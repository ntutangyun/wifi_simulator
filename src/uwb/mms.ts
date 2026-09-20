/**
 * The multi-millisecond (MMS) packet of IEEE P802.15.4ab: the PHY model behind `mode: 'mms'`.
 *
 * A 4z frame spends one burst of energy and is heard as far as that burst reaches. An MMS
 * device instead splits its ranging signal into short *fragments* sent one millisecond apart —
 * a *train* — and the receiver adds them up. Two things follow, and they are the whole point of
 * the slice: each fragment may spend a full millisecond's regulatory energy budget in its own
 * (much shorter) length, and N fragments combine for another 10·log10(N) dB. The same train also
 * hands the receiver a millisecond-long ruler to measure the transmitter's clock rate against.
 *
 * Two fragment kinds: an **RSF** (ranging sequence fragment) is N_MSR repetitions of one MMRS
 * symbol and carries the ranging timestamp; an **RIF** (ranging integrity fragment) is one STS
 * segment and verifies that the range was not spoofed. A train is X RSFs then Y RIFs.
 *
 * Everything here is chips at 499.2 Mchip/s (standard §16.2.4) turned into nanoseconds by
 * `chipsToNs`, the same rounding every other PPDU in this engine is measured with. The draft
 * text is members-only: every number below is paraphrased from the TG4ab contributions named in
 * its tag, never copied, and the balloted D5.0 may differ.
 *
 * This module and `phy.ts` import each other (it needs `chipsToNs`; `phy.ts` needs the layout to
 * size an MMS slot). Neither touches the other's bindings while the modules are evaluating —
 * only inside functions — so the cycle resolves whichever one is loaded first.
 */
import type { Ns } from '../model/types'
import { chipsToNs, UWB_RX_SENS_DBM } from './phy'

// --- The fragment ------------------------------------------------------------

export const MS_CHIPS = 499_200 // 4ab draft 15-23/0100r2 §2.3.2: one millisecond of chips
export const MS_RSTU = 1200 // 4ab draft 15-22/0381r5 §1.1.3: the same millisecond in RSTU
/** Length of the complementary-set sequence an MMRS symbol is built from. */
export const MMRS_LEN = 128 // 4ab draft 15-23/0100r2 §2.3.2
/** Spreading factor L applied to the MMRS symbol. */
export const MMS_SPREAD = 4 // 4ab draft 15-23/0100r2 §2.3.2
/** An STS segment's length is counted in units of this many chips. */
export const STS_UNIT_CHIPS = 512 // standard §16.2.9

/** MMRS repetitions in one RSF. */
export const N_MSR_SET = [32, 40, 48, 64, 128, 256] as const // 4ab draft 15-23/0100r2 §2.3.2
/** X, the RSFs in a train. */
export const RSF_COUNT_SET = [0, 1, 2, 4, 8, 16] as const // 4ab draft 15-22/0381r5 Table 1.6.3.2
/** Y, the RIFs in a train. */
export const RIF_COUNT_SET = [0, 1, 2, 4, 8] as const // 4ab draft 15-22/0381r5 Table 1.6.3.2
/** An RIF's STS segment length, in 512-chip units. */
export const STS_LEN_SET = [32, 64, 128, 256] as const // 4ab draft 15-23/0100r2 §2.3.2

export type NMsr = (typeof N_MSR_SET)[number]
export type RsfCount = (typeof RSF_COUNT_SET)[number]
export type RifCount = (typeof RIF_COUNT_SET)[number]
export type StsLen = (typeof STS_LEN_SET)[number]

/** One MMRS symbol: the length-128 set split [A, G, B, G] with a gap of `gap` zeros on each
 * side of B, the whole thing spread by L = 4. 4ab draft 15-23/0100r2 §2.3.2 */
export function mmrsSymbolChips(gap: number): number {
  return MMS_SPREAD * (MMRS_LEN + 2 * gap)
}

/** An RSF: `nMsr` repetitions of one MMRS symbol. 4ab draft 15-23/0100r2 §2.3.2 */
export function rsfChips(nMsr: number, gap: number): number {
  return nMsr * mmrsSymbolChips(gap)
}

/** An RIF: one STS segment of `stsLen` 512-chip units. 4ab draft 15-23/0100r2 §2.3.2 */
export function rifChips(stsLen: number): number {
  return stsLen * STS_UNIT_CHIPS
}

export function rsfNs(nMsr: number, gap: number): Ns {
  return chipsToNs(rsfChips(nMsr, gap))
}

export function rifNs(stsLen: number): Ns {
  return chipsToNs(rifChips(stsLen))
}

// --- Energy and reach ---------------------------------------------------------

/** The energy one millisecond of a 500 MHz UWB transmitter may hold: −41.3 dBm/MHz over
 * 499.2 MHz is −14.3 dBm, and −14.3 dBm for 1 ms is 37 nJ. regulation (FCC Part 15.519 /
 * ETSI EN 302 065, quoted through 4ab draft 15-22/0205r0) */
export const UWB_MS_BUDGET_NJ = 37

/** A fragment spends the whole millisecond's budget inside its own length, so the shorter it
 * is the louder it is: 37 nJ in `fragNs` is `10·log10(37 / fragNs µs)` dBm. model
 *
 * The engine's 4z transmitter does not do this — it holds `UWB_TX_POWER_DBM` whatever the frame
 * length — so part of the gain a train shows is burst power and only `10·log10(X)` is the
 * multi-millisecond idea. The lesson says so. */
export function mmsFragmentDbm(fragNs: Ns): number {
  return 10 * Math.log10(UWB_MS_BUDGET_NJ / (fragNs / 1000))
}

/** The largest train's combining gain, and so the channel's delivery floor: a fragment quieter
 * than `UWB_RX_SENS_DBM − MMS_COMBINE_MAX_DB` cannot be rescued by any train this model
 * allows, and the channel need not carry it. model */
export const MMS_COMBINE_MAX_DB = 10 * Math.log10(16)

/** What `heard` equal-power fragments add up to, combined coherently. model */
export function combineGainDb(heard: number): number {
  return heard > 0 ? 10 * Math.log10(heard) : 0
}

/** Whether a train of `heard` fragments, each arriving at `rxDbm`, clears the receiver's
 * sensitivity once combined. The receiver is primed by the narrowband exchange and accumulates
 * blind, so no single fragment has to be audible on its own. model */
export function trainDetected(rxDbm: number, heard: number): boolean {
  return heard > 0 && rxDbm + combineGainDb(heard) >= UWB_RX_SENS_DBM
}

/** One millisecond in nanoseconds: the spacing of two neighbouring fragments of a train, on the
 * transmitter's own clock. 4ab draft 15-23/0100r2 §2.3.2 */
export const MS_NS: Ns = 1_000_000

/** Ranging counter units in one chip (standard §10.29.1.4: the RCTU is 2^-7 of a chip). It is
 * written here rather than taken from `RCTU_NS`, because `phy.ts` and this module import each
 * other and a constant of one evaluated inside the other would be undefined half the time. */
const RCTU_PER_CHIP = 128

/** The same millisecond in ranging counter units — what a measured span is divided by to get a
 * clock ratio. derived (63 897 600 RCTU) */
export const MS_RCTU = MS_CHIPS * RCTU_PER_CHIP

/**
 * Where a train's RMARKER fell, in true time, given any one fragment of it that was heard: the
 * fragments are one millisecond apart and the receiver knows the train's shape from the
 * narrowband control exchange, so fragment `index` arriving at `arrivalNs` puts fragment 0 —
 * the RMARKER — `index` milliseconds earlier. A train whose first fragment was lost is
 * therefore still timed, from whichever fragment did arrive. model
 */
export function rmarkerFromFragment(arrivalNs: Ns, index: number): Ns {
  return arrivalNs - index * MS_NS
}

/** 1-σ of the train-derived clock ratio for a span of `spanMs` between the first and last heard
 * fragment: two timestamps of 1-σ `tsNoisePs` each, divided by the span they measure. The
 * result is a fraction (multiply by 1e6 for ppm). model */
export function ratioSigma(tsNoisePs: number, spanMs: number): number {
  return (Math.SQRT2 * tsNoisePs * 1e-12) / (spanMs * 1e-3)
}

// --- The train ----------------------------------------------------------------

/** The shape of one device's train: X RSFs then Y RIFs, the fragment parameters both are cut
 * from, and Z — the idle milliseconds between the last RSF and the first RIF, which give the
 * receiver time to process. */
export interface MmsPhy {
  rsfs: RsfCount
  rifs: RifCount
  nMsr: NMsr
  gap: number
  stsLen: StsLen
  gapMs: 1 | 2
}

export type MmsSetId =
  | 'rsf-1' | 'rsf-2' | 'rsf-3' | 'rsf-4' | 'rsf-5'
  | 'rsf-6' | 'rsf-7' | 'rsf-8' | 'rsf-9' | 'rsf-10'
  | 'mixed-1' | 'mixed-2' | 'mixed-3' | 'mixed-4' | 'mixed-5' | 'mixed-6' | 'mixed-7'

const rsfOnly = (nMsr: NMsr, gap: number): MmsPhy => ({ rsfs: 16, rifs: 0, nMsr, gap, stsLen: 64, gapMs: 1 })
const mixed = (rsfs: RsfCount, rifs: RifCount): MmsPhy => ({ rsfs, rifs, nMsr: 64, gap: 25, stsLen: 64, gapMs: 1 })

/** The mandatory operating parameter sets: ten RSF-only trains (X = 16, Y = 0, at five gaps of
 * N_MSR 40 and five of N_MSR 32) and seven mixed ones (N_MSR 64, gap 25, STS 64, at seven
 * (X, Y) pairs). The UWB-only sets of the same table — an SHR and one RIF — are 4z SP3 in all
 * but name and are not modelled. 4ab draft 15-23/0502r3 (proposed 16.2.11.4) */
export const MMS_SETS: Record<MmsSetId, MmsPhy> = {
  'rsf-1': rsfOnly(40, 33),
  'rsf-2': rsfOnly(40, 37),
  'rsf-3': rsfOnly(40, 39),
  'rsf-4': rsfOnly(40, 43),
  'rsf-5': rsfOnly(40, 45),
  'rsf-6': rsfOnly(32, 49),
  'rsf-7': rsfOnly(32, 57),
  'rsf-8': rsfOnly(32, 59),
  'rsf-9': rsfOnly(32, 61),
  'rsf-10': rsfOnly(32, 64),
  'mixed-1': mixed(1, 1),
  'mixed-2': mixed(1, 2),
  'mixed-3': mixed(1, 4),
  'mixed-4': mixed(1, 8),
  'mixed-5': mixed(2, 2),
  'mixed-6': mixed(4, 4),
  'mixed-7': mixed(8, 8),
}

/** One mandatory set, as a fresh object: a caller spreading it into a session config must not
 * be able to edit the table it came from. */
export function mmsSet(id: MmsSetId): MmsPhy {
  return { ...MMS_SETS[id] }
}

/** The longest fragment the train actually carries — what a ranging slot has to hold. An empty
 * train (the schema refuses one) carries no fragment at all, and so needs no room. */
export function mmsLongestFragmentNs(phy: MmsPhy): Ns {
  return Math.max(
    phy.rsfs > 0 ? rsfNs(phy.nMsr, phy.gap) : 0,
    phy.rifs > 0 ? rifNs(phy.stsLen) : 0,
  )
}

// --- The round's slot layout ----------------------------------------------------

/** Where every fragment and every report of one MMS pair round sits, in slots counted from the
 * start of the round. The round is control (4 slots) + ranging (`rpSlots`) + report (4). */
export interface MmsLayout {
  /** Slots 0–1 the initiator's narrowband POLL, 2–3 the responder's RESP. 4ab draft 0381r5 §1.1 */
  controlSlots: 4
  /** The ranging phase: the draft's RpDuration default of 20 slots, grown to fit the train. */
  rpSlots: number
  /** Two narrowband reports of two slots each. 4ab draft 0381r5 §1.1 */
  reportSlots: 4
  slots: number
  /** Slot index, within the round, of fragment `index` of `kind` for `side`. The initiator's
   * fragments sit on even offsets from the start of the ranging phase and the responder's one
   * slot later, so the two trains interleave inside each millisecond (model). */
  fragmentSlot(side: 'initiator' | 'responder', kind: 'rsf' | 'rif', index: number): number
  /**
   * The inverse of `fragmentSlot`: which fragment, if any, sits in slot `slot` of the round.
   * Null for every slot no fragment owns — the control and report windows, the idle
   * milliseconds between the two trains, and the tail of a ranging phase the draft sizes at
   * 20 slots whatever the train is.
   *
   * It exists so that the schedule (`slotAction`) and the devices read **one** map rather than
   * two: a second copy of this arithmetic is a second chance for the two ends of a round to
   * disagree about where a fragment is.
   */
  slotFragment(slot: number): { side: 'initiator' | 'responder'; kind: 'rsf' | 'rif'; index: number } | null
  /** Slot index of the narrowband REPORT: the responder's first, the initiator's two later. */
  reportSlot(side: 'initiator' | 'responder'): number
}

const MMS_CONTROL_SLOTS = 4 // 4ab draft 15-22/0381r5 §1.1: RcpPollSlot 2 + RcpResponseSlot 2
const MMS_REPORT_SLOTS = 4 // 4ab draft 15-22/0381r5 §1.1: MrpFirstSlot 2 + MrpSecondSlot 2
/** RpDuration, the ranging phase's default length in slots. 4ab draft 15-22/0381r5 Table 1.2.3.3 */
export const MMS_RP_MIN_SLOTS = 20

/**
 * The fixed shape of one pairwise round (the table of the spec's "The ranging cycle").
 *
 * Both devices send a fragment per millisecond, and a millisecond is two slots — the initiator's
 * and the responder's — so the ranging phase needs `2·(X + Y)` slots, plus `2·(Z − 1)` for the
 * idle milliseconds before the RIFs. The draft's RpDuration default of 20 slots is a floor under
 * that, not a cap: a short train still pays for the phase the draft sizes (model).
 */
export function mmsLayout(phy: MmsPhy): MmsLayout {
  const x = phy.rsfs
  const y = phy.rifs
  const z = phy.gapMs
  const rp = Math.max(MMS_RP_MIN_SLOTS, 2 * (x + (y > 0 ? z - 1 + y : 0)))
  const count = (kind: 'rsf' | 'rif'): number => (kind === 'rsf' ? x : y)
  return {
    controlSlots: MMS_CONTROL_SLOTS,
    rpSlots: rp,
    reportSlots: MMS_REPORT_SLOTS,
    slots: MMS_CONTROL_SLOTS + rp + MMS_REPORT_SLOTS,
    fragmentSlot(side, kind, index) {
      if (!Number.isInteger(index) || index < 0 || index >= count(kind)) {
        throw new Error(`mmsLayout: this train has ${count(kind)} ${kind.toUpperCase()} fragments, asked for ${index}`)
      }
      // RSF-m starts m ms into the ranging phase; RIF-y starts (X + Z − 1 + y) ms into it.
      const ms = kind === 'rsf' ? index : x + z - 1 + index
      return MMS_CONTROL_SLOTS + 2 * ms + (side === 'responder' ? 1 : 0)
    },
    slotFragment(slot) {
      if (!Number.isInteger(slot) || slot < MMS_CONTROL_SLOTS || slot >= MMS_CONTROL_SLOTS + rp) return null
      const off = slot - MMS_CONTROL_SLOTS
      // Two slots to a millisecond: the initiator's, then the responder's one slot later — the
      // same offset `fragmentSlot` adds, read the other way round.
      const side = off % 2 === 0 ? 'initiator' : 'responder'
      const ms = (off - (side === 'responder' ? 1 : 0)) / 2
      if (ms < x) return { side, kind: 'rsf', index: ms }
      const firstRif = x + z - 1
      if (y > 0 && ms >= firstRif && ms < firstRif + y) return { side, kind: 'rif', index: ms - firstRif }
      return null
    },
    reportSlot(side) {
      return MMS_CONTROL_SLOTS + rp + (side === 'initiator' ? 2 : 0)
    },
  }
}
