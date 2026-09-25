/**
 * The multi-millisecond (MMS) packet of IEEE P802.15.4ab: the PHY model behind `mode: 'mms'`.
 *
 * A 4z frame spends one burst of energy and is heard as far as that burst reaches. An MMS
 * device instead splits its ranging signal into short *fragments* sent a slot or more apart —
 * a *train* — and the receiver adds them up.
 *
 * How far apart is a model choice, and this engine's is its own. The pairwise round spaces
 * fragments one millisecond apart, which is 15-23/0100r2 §2.3.2's figure at the draft's 600 RSTU
 * slot. A one-to-many round spaces them (responders + 1) slots, so three responders make it 2 ms
 * and no legal slot length brings it back to one — see `mmsRoundPlan`. The draft additionally has
 * an interleaved mode whose offset is 500 µs (quoted in 15-25/0388r1), which this engine does not
 * model at all. `MmsRoundPlan.fragGapNs` is what a round actually uses, and it is the ruler the
 * receiver is handed, so nothing downstream assumes the nominal millisecond.
 *
 * Two things follow, and they are the whole point of
 * the slice: each fragment may spend a full millisecond's regulatory energy budget in its own
 * (much shorter) length, and N fragments combine for another 10·log10(N) dB. The same train also
 * hands the receiver a ruler as long as the whole train to measure the transmitter's clock
 * rate against.
 *
 * Two fragment kinds: an **RSF** (ranging sequence fragment) is N_MSR repetitions of one MMRS
 * symbol and carries the ranging timestamp; an **RIF** (ranging integrity fragment) is one STS
 * segment and verifies that the range was not spoofed. A train is X RSFs then Y RIFs.
 *
 * Everything here is chips at 499.2 Mchip/s (standard §16.2.4) turned into nanoseconds by
 * `chipsToNs`, the same rounding every other PPDU in this engine is measured with. The draft
 * text is members-only: every number below is paraphrased from the TG4ab contributions named in
 * its tag, never copied. As of the September 2026 meeting the draft is in SA ballot
 * recirculation, and the balloted text may differ from the contributions modelled here — see
 * docs/superpowers/specs/2026-09-26-uwb-standard-basis.md for what was checked and what drifted.
 *
 * Everything this module needs of the engine's units comes from the leaf `units.ts`, never
 * from `phy.ts`: `phy.ts` imports *this* module to size an MMS slot, and an import the other
 * way would be a cycle whose constants are undefined half the time.
 */
import type { Ns } from '../model/types'
import { chipsToNs, COUNTER_MOD, RCTU_PER_CHIP, UWB_RX_SENS_DBM } from './units'

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
/**
 * Repetitions of the MMRS symbol in one RSF. Named N_MSR after 15-23/0100r2 §2.3.2, which is
 * what the course and the editor call it; the draft has since renamed the field carrying it to
 * **RSF Fragment Length**, in the Ranging PHY Configuration field (15-24/0506 + 15-25/0066r1).
 * The values are unchanged.
 */
export const N_MSR_SET = [32, 40, 48, 64, 128, 256] as const
/** X, the RSFs in a train. */
export const RSF_COUNT_SET = [0, 1, 2, 4, 8, 16] as const // 4ab draft 15-22/0381r5 Table 1.6.3.2
/** Y, the RIFs in a train. */
export const RIF_COUNT_SET = [0, 1, 2, 4, 8] as const // 4ab draft 15-22/0381r5 Table 1.6.3.2
/** An RIF's STS segment length, in 512-chip units. */
/**
 * An RIF's length in 512-chip STS units. 15-23/0100r2 §2.3.2; the draft now carries it in the
 * **RIF Fragment Length** field, beside RSF Fragment Length (15-24/0506 + 15-25/0066r1).
 */
export const STS_LEN_SET = [32, 64, 128, 256] as const

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

/** One millisecond in nanoseconds: the spacing of two neighbouring fragments in the PAIRWISE
 * round, on the transmitter's own clock, and the unit the draft's timings are written in. Every
 * other round spaces them `MmsRoundPlan.fragGapNs`. 4ab draft 15-23/0100r2 §2.3.2 */
export const MS_NS: Ns = 1_000_000

/** The same millisecond in ranging counter units — what a measured span is divided by to get a
 * clock ratio. derived (63 897 600 RCTU) */
export const MS_RCTU = MS_CHIPS * RCTU_PER_CHIP

/**
 * Where a train's RMARKER fell on the receiver's own ranging counter, given the first fragment
 * of the train it actually heard: the fragments are `gapRctu` apart — one millisecond only in
 * the pairwise round, (responders + 1) slots in every other, see below — and the receiver knows
 * the train's shape from the narrowband control exchange, so fragment `index`, stamped at
 * `firstCounter`, puts fragment 0 — the RMARKER — `index` gaps earlier. A train whose
 * first fragment was lost is therefore still timed, from whichever fragment did arrive. model
 *
 * Those gaps are the *transmitter's*, and this counter is the receiver's, so the walk-back is
 * scaled by `ratio` — the receiver's counter per the peer's, which the very same train
 * measured. Walking back `index` undrifted gaps instead would leave `index` × the gap × the
 * clock offset between the two crystals: 20 ns per lost leading fragment at 20 ppm on a
 * one-millisecond gap, and so 3.0 m of range.
 *
 * `gapRctu` is how far apart this round actually spaces the fragments, in the receiver's counter
 * units — `MS_RCTU`, a true millisecond, in the pairwise round at the draft's 600 RSTU slot, and
 * longer in every other round the schema allows (see `MmsRoundPlan.fragGapNs`).
 *
 * `ratio` is null when fewer than two fragments were heard and there was no span to measure it
 * over. The receiver's own nominal millisecond is then all it has, and that residual stands —
 * there is nothing better to use. With fragment 0 in hand (`index` 0) nothing is walked back at
 * all and the ratio never enters.
 */
export function rmarkerFromFragment(
  firstCounter: number, index: number, ratio: number | null, gapRctu: number = MS_RCTU,
): number {
  if (index === 0) return firstCounter
  const back = Math.round(index * gapRctu * (ratio ?? 1))
  return (((firstCounter - back) % COUNTER_MOD) + COUNTER_MOD) % COUNTER_MOD
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
  /** Z, the RSF-to-RIF gap, in milliseconds — the draft's RpRifOffset. See `rifStartMs`. */
  gapMs: 1 | 2
}

/**
 * Which millisecond of the ranging phase RIF number `index` (counted from 0) starts in, for a
 * train of `rsfs` RSFs and an RSF-to-RIF gap of `gapMs`: the first RIF starts RpRifOffset after
 * the **start of the last RSF**, and the last RSF started at millisecond X − 1, so the first RIF
 * is at X − 1 + Z and every further one a millisecond later. With no RSF at all (X = 0) the
 * offset is zero and the RIFs open the phase.
 *
 * P802.15.4ab §10.39.5, the UWB MMS ranging phase, paraphrased: without RSFs the first RIF may
 * go out RpRifOffset into the phase; with RSFs it may go out RpRifOffset after the last RSF
 * started. RpRifOffset is 2 ms when RSFs were sent and 0 ms otherwise.
 *
 * The clause keeps moving — §10.35.5, then §10.36.5, then §10.38.5, and §10.39.5 in every 2026
 * document — so a bare clause number here has a shelf life. The rule itself is the editor's
 * instruction carried by comment resolution 15-24/0235r2 (from the proposed clause text of
 * 15-23/0371r1 and 15-23/0412r0). No draft text is in the corpus this repository is checked
 * against, only the comment resolutions that quote it, so the balloted draft may differ.
 */
export function rifStartMs(rsfs: number, gapMs: number, index: number): number {
  return rsfs > 0 ? rsfs + gapMs - 1 + index : index
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

/** Where every fragment and every report of one MMS round sits, in slots counted from the start
 * of the round. The round is control + ranging (`rpSlots`) + report, and a pair round — one
 * initiator, one responder — is the R = 1 case of all of it: control 4, report 4. */
export interface MmsLayout {
  /** How many responders this round holds: 1 in a pair round, N in a one-to-many one. */
  responders: number
  /** Slots 0–1 the initiator's narrowband POLL, then two slots per responder's RESP.
   * 4ab draft 0381r5 §1.1 (RcpPollSlot 2 + RcpResponseSlot 2 per responder) */
  controlSlots: number
  /** The ranging phase: the draft's RpDuration default of 20 slots, grown to fit the train. */
  rpSlots: number
  /** Two narrowband report windows per responder: the responder's own, then the initiator's
   * answer to it. A pair round is the R = 1 case — the draft's MrpFirstSlot + MrpSecondSlot.
   * 4ab draft 0381r5 §1.1; 15-22/0381r5 Table 1.6.3.1 gives one-to-many ranging a REPORT from
   * each end (0x12, 0x13), each carrying the one time its sender measured. */
  reportSlots: number
  slots: number
  /** Slot index, within the round, of the narrowband RESP window responder `responder` owns. */
  respSlot(responder: number): number
  /** Slot index, within the round, of fragment `index` of `kind` for `side`. Each millisecond of
   * the ranging phase is R + 1 slots: the initiator's first, then one per responder in responder
   * order, so every train of the round interleaves inside the same millisecond (model; the
   * draft's one-to-many POLL allots `SlotsPerResponder` slots to each responder address it
   * lists — 4ab draft 15-22/0381r5 Table 1.6.3.1, message 0x10 — but does not fix the
   * interleave, so the order here is this engine's). */
  fragmentSlot(side: 'initiator' | 'responder', kind: 'rsf' | 'rif', index: number, responder?: number): number
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
  slotFragment(slot: number): {
    side: 'initiator' | 'responder'; kind: 'rsf' | 'rif'; index: number; responder: number
  } | null
  /** Slot index of the narrowband REPORT: responder `responder`'s own window, or the
   * initiator's answer to that responder two slots later. */
  reportSlot(side: 'initiator' | 'responder', responder?: number): number
}

/** The two slots one narrowband window is: the draft's RcpPollSlot, RcpResponseSlot,
 * MrpFirstSlot and MrpSecondSlot are all 2. 4ab draft 15-22/0381r5 §1.1 */
const NB_WINDOW_SLOTS = 2
/**
 * A floor under the ranging phase, in slots (model).
 *
 * 15-22/0381r5 Table 1.2.3.3 gave RpDuration as a default of 20, and that is where this number
 * came from. The draft has since changed its nature rather than its value: macMmsRpDuration
 * "shall be set at minimum to the required duration for all RSF and RIF fragments to be
 * transmitted and received but may be longer" (quoted in comment resolution 15-25/0282r1), so
 * it is derived, not defaulted. `mmsRoundPlan` already computes that derived length and takes
 * the larger of the two, which is the draft's rule; the 20 is this simulator's floor under it,
 * and no longer a number the draft states.
 */
export const MMS_RP_MIN_SLOTS = 20

/**
 * The fixed shape of one round (the table of the spec's "The ranging cycle"), for an initiator
 * and `responders` responders. A pair round is `responders = 1`, and every number below reduces
 * to the pairwise one there — control 4, two slots to a millisecond, report 4 — which is what
 * keeps the pairwise cycle byte-identical to the one that shipped before one-to-many existed.
 *
 * Every device in the round sends a fragment per millisecond, and a millisecond is therefore
 * R + 1 slots — the initiator's, then one per responder — so the ranging phase needs
 * `(R + 1)·(X + Y)` slots, plus `(R + 1)·(Z − 1)` for the idle milliseconds before the RIFs.
 * The draft's RpDuration default of 20 slots is a floor under that, not a cap: a short train
 * still pays for the phase the draft sizes (model).
 *
 * The control phase is the initiator's POLL window and one RESP window per responder, and the
 * report phase a pair of windows per responder — its own REPORT, then the initiator's answer to
 * it. That is the shape the draft's one-to-many POLL describes when it carries `Number of
 * Responders`, `SlotsPerResponder` and a responder address list, together with its one-to-many
 * REPORTs from each end, each carrying the single time its sender measured (4ab draft
 * 15-22/0381r5 Table 1.6.3.1, messages 0x10/0x11/0x12/0x13).
 *
 * One narrowband window is two slots whatever the round, so the **POLL has to fit two of them**:
 * it grows by three octets per responder, and `uwbNbSlotFitNs` is where that rule is checked.
 */
export function mmsLayout(phy: MmsPhy, responders = 1): MmsLayout {
  if (!Number.isInteger(responders) || responders < 1) {
    throw new Error(`mmsLayout: a round needs at least one responder, asked for ${responders}`)
  }
  const x = phy.rsfs
  const y = phy.rifs
  const z = phy.gapMs
  const perMs = responders + 1
  const control = NB_WINDOW_SLOTS * (1 + responders)
  const report = 2 * NB_WINDOW_SLOTS * responders
  // The phase has to hold every fragment: the RSFs' X milliseconds, and — when the train has
  // RIFs — up to the last one, which `rifStartMs` puts at X + Z − 1 + (Y − 1).
  const rp = Math.max(MMS_RP_MIN_SLOTS, perMs * (y > 0 ? rifStartMs(x, z, y - 1) + 1 : x))
  const count = (kind: 'rsf' | 'rif'): number => (kind === 'rsf' ? x : y)
  const checkResponder = (r: number): void => {
    if (!Number.isInteger(r) || r < 0 || r >= responders) {
      throw new Error(`mmsLayout: this round has ${responders} responders, asked for ${r}`)
    }
  }
  return {
    responders,
    controlSlots: control,
    rpSlots: rp,
    reportSlots: report,
    slots: control + rp + report,
    respSlot(responder) {
      checkResponder(responder)
      return NB_WINDOW_SLOTS * (1 + responder)
    },
    fragmentSlot(side, kind, index, responder = 0) {
      if (!Number.isInteger(index) || index < 0 || index >= count(kind)) {
        throw new Error(`mmsLayout: this train has ${count(kind)} ${kind.toUpperCase()} fragments, asked for ${index}`)
      }
      checkResponder(responder)
      // RSF-m starts m ms into the ranging phase; the RIFs follow `rifStartMs` (§10.39.5).
      const ms = kind === 'rsf' ? index : rifStartMs(x, z, index)
      return control + perMs * ms + (side === 'responder' ? 1 + responder : 0)
    },
    slotFragment(slot) {
      if (!Number.isInteger(slot) || slot < control || slot >= control + rp) return null
      const off = slot - control
      // R + 1 slots to a millisecond: the initiator's, then the responders' in order — the same
      // offset `fragmentSlot` adds, read the other way round.
      const within = off % perMs
      const side = within === 0 ? 'initiator' : 'responder'
      const responder = within === 0 ? 0 : within - 1
      const ms = (off - within) / perMs
      if (ms < x) return { side, kind: 'rsf', index: ms, responder }
      const firstRif = rifStartMs(x, z, 0)
      if (y > 0 && ms >= firstRif && ms < firstRif + y) {
        return { side, kind: 'rif', index: ms - firstRif, responder }
      }
      return null
    },
    reportSlot(side, responder = 0) {
      checkResponder(responder)
      return control + rp + 2 * NB_WINDOW_SLOTS * responder + (side === 'initiator' ? NB_WINDOW_SLOTS : 0)
    },
  }
}
