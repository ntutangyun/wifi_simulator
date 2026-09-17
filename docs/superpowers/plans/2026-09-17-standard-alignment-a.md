# Standard Alignment A: Correctness Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing MAC/PHY behaviour correct against IEEE 802.11-2024 wherever it is wrong today without new subsystems (spec items A1–A19).

**Architecture:** Fix in place, test first, one commit per task. `src/engine/mac.ts` keeps its structure; per-MSDU state (sequence number, retry count) moves onto `Msdu`, and a per-EDCAF QSRC replaces SRC/LRC/SSRC/SLRC. The view's receive accounting moves from "last seqNo" to per-MSDU identity so duplicates and bytes are exact.

**Tech Stack:** TypeScript, Vitest (`npx vitest run <file>`), `npx tsc -b`, Vite dev server for the browser check.

**Spec:** `docs/superpowers/specs/2026-09-17-standard-alignment-a-correctness-design.md`

## Global Constraints

- Standard over ns-3; where the standard leaves a choice, keep today's behaviour unless the spec says otherwise.
- Time is integer ns (`Ns`). 1 µs = 1 000.
- Every user-visible string exists in EN and ZH in `src/ui/i18n.ts`.
- Lessons that quote engine numbers must match engine output; `tests/course/*.test.ts` enforces this.
- Baseline before starting: `npx vitest run` → 46 files, 330 tests, all passing.
- Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File map

| File | Change |
|---|---|
| `src/engine/phy.ts` | `MAX_PPDU_NS` 5.484 ms; remove `LONG_RETRY_LIMIT`; `NONHT_REF_MBPS`; `ctrlRespRateForMode`; throwing lookups |
| `src/engine/traffic.ts` | `Msdu.seqNo?`, `Msdu.retries?` |
| `src/engine/mac.ts` | all MAC fixes |
| `src/model/frames.ts` | last A-MPDU subframe unpadded; `msduBytes` on data frames and MU parts |
| `src/model/records.ts` | `RETRY` record shape |
| `src/model/view.ts` | per-MSDU dedup and byte accounting; `qsrc` |
| `src/ui/format.ts`, `src/ui/Inspector.tsx`, `src/ui/i18n.ts` | QSRC display, MLO note |
| `src/model/presets.ts` | MLO / 2.4 GHz notes |
| `src/course/lessons.ts` | corrections + re-baselined numbers |
| `scripts/tamper-report.ts` → `docs/reports/*` | regenerated |
| tests | new tests per task; re-baselined expectations |

---

### Task 1: PHY constants, reference-rate control responses, throwing lookups (A1 guard, A11, A16)

**Files:**
- Modify: `src/engine/phy.ts`
- Modify: `src/engine/mac.ts` (call sites of `ctrlRespRateFor(mbps)` for HT-class frames)
- Test: `tests/engine/phy.test.ts`, `tests/engine/phy-modes.test.ts`

**Interfaces — Produces:**
- `MAX_PPDU_NS = 5_484_000`
- `NONHT_REF_MBPS: number[]` (index = VHT/HE/EHT MCS)
- `ctrlRespRateForMode(mode: PhyMode, mcs: number, mbps: number): number`
- `mcsRateMbps` and `sinrThreshModeDb` throw `Error('invalid MCS <mcs> for <mode>')` on an undefined entry.

- [ ] **Step 1: Failing tests** (append to `tests/engine/phy-modes.test.ts`)

```ts
import { MAX_PPDU_NS, ctrlRespRateForMode, mcsRateMbps, sinrThreshModeDb } from '../../src/engine/phy'

describe('standard alignment A — PHY', () => {
  it('aPPDUMaxTime is 5.484 ms for HT/VHT/HE/EHT', () => {
    expect(MAX_PPDU_NS).toBe(5_484_000)
  })
  it('control responses use the non-HT reference rate of the eliciting MCS', () => {
    // MCS 2 is QPSK 3/4 → reference 18 Mbps → highest mandatory ≤ 18 is 12
    expect(ctrlRespRateForMode('he', 2, mcsRateMbps('he', 2))).toBe(12)
    expect(ctrlRespRateForMode('vht', 3, mcsRateMbps('vht', 3))).toBe(24)
    expect(ctrlRespRateForMode('eht', 13, mcsRateMbps('eht', 13))).toBe(24)
    expect(ctrlRespRateForMode('he', 0, mcsRateMbps('he', 0))).toBe(6)
    expect(ctrlRespRateForMode('nonht', 7, 54)).toBe(24)
  })
  it('an MCS the mode does not define throws instead of yielding NaN', () => {
    expect(() => sinrThreshModeDb('he', 12)).toThrow(/invalid MCS 12 for he/)
    expect(() => mcsRateMbps('vht', 9)).toThrow(/invalid MCS 9 for vht/)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/engine/phy-modes.test.ts` — expect FAIL (missing exports, 4 000 000).

- [ ] **Step 3: Implement** in `src/engine/phy.ts`:

```ts
export const MAX_PPDU_NS = 5_484_000 // aPPDUMaxTime (HT-MF/VHT/HE/EHT)

/**
 * Non-HT reference rate per VHT/HE/EHT MCS (modulation + coding → the clause-17
 * rate with the same constellation and code rate; 256/1024/4096-QAM map to 54).
 * Same mapping as ns-3 HtPhy/VhtPhy/HePhy::CalculateNonHtReferenceRate.
 */
export const NONHT_REF_MBPS = [6, 12, 18, 24, 36, 48, 54, 54, 54, 54, 54, 54, 54, 54]

/** Control response rate: highest mandatory rate ≤ the eliciting PPDU's non-HT reference rate. */
export function ctrlRespRateForMode(mode: PhyMode, mcs: number, mbps: number): number {
  return ctrlRespRateFor(mode === 'nonht' ? mbps : NONHT_REF_MBPS[mcs])
}
```

Replace `mcsRateMbps` and `sinrThreshModeDb`:

```ts
function modeEntry(arr: number[], mode: PhyMode, mcs: number): number {
  const v = arr[mcs]
  if (v === undefined) throw new Error(`invalid MCS ${mcs} for ${mode}`)
  return v
}
export function mcsRateMbps(mode: PhyMode, mcs: number): number {
  return modeEntry(PHY_MODES[mode].mbps, mode, mcs)
}
export function sinrThreshModeDb(mode: PhyMode, mcs: number, widthMhz = 20): number {
  return modeEntry(PHY_MODES[mode].sensDbm, mode, mcs) - NOISE_DBM + widthPenaltyDb(widthMhz)
}
```

- [ ] **Step 4: Switch MAC call sites** in `src/engine/mac.ts`: every `ctrlRespRateFor(mbps)` where `mode`/`mcs` are in scope becomes `ctrlRespRateForMode(mode, mcs, mbps)` (transmitFor `respTime`, `rtsRate`; planBurstNs `resp`; CTS path `respTime`). In `handleOwnFrame` data case use `ctrlRespRateForMode(frame.mode ?? 'nonht', frame.mcs ?? 0, frame.mbps)`. RTS/CTS frames stay non-HT, so `ctrlRespRateFor(frame.mbps)` for the CTS rate is unchanged.

- [ ] **Step 5: Run full suite** `npx vitest run`. Expect failures only where a quoted HE MCS 2 or MAX_PPDU number changed; record each failing test name in the commit message and fix its expectation only if the new value is the standard one (do not touch lesson timestamp tests yet — Task 11 re-baselines them; mark them with `it.skip` is NOT allowed; instead leave them failing and continue, Task 11 must end green).

- [ ] **Step 6: Commit** `fix(phy): aPPDUMaxTime 5.484 ms, non-HT reference rate for control responses, throw on undefined MCS`

---

### Task 2: Sequence numbers and 802.11-2020 retry counting (A2, A3)

**Files:**
- Modify: `src/engine/traffic.ts` (Msdu), `src/engine/phy.ts` (remove `LONG_RETRY_LIMIT`), `src/engine/mac.ts`, `src/model/records.ts`, `src/model/view.ts`, `src/ui/format.ts`, `src/ui/Inspector.tsx`, `src/ui/i18n.ts`
- Test: create `tests/engine/retry-2020.test.ts`; modify `tests/engine/mac.test.ts:62-90`

**Interfaces — Produces:**
- `Msdu.seqNo?: number` (assigned on first transmission, modulo 4096) and `Msdu.retries?: number`
- `Edcaf.qsrc: number` (replaces `src`, `lrc`); station `ssrc`/`slrc` removed
- Record `{ type: 'RETRY'; node; msduId; retries: number; qsrc: number; ac? }`
- `NodeView.qsrc: number` (replaces `ssrc`, `slrc`)
- `private failMsdus(e: Edcaf, ei: number, msdus: Msdu[]): void` — increments `retries` on exactly these MSDUs, drops those at `SHORT_RETRY_LIMIT` (DROP + DEQUEUE + `onDequeue`), restores the rest to the queue head
- `private bumpQsrc(e: Edcaf): void` — `qsrc++`, CW doubles; at `qsrc >= SHORT_RETRY_LIMIT` CW resets to CWmin and `qsrc = 0`; emits `CW_CHANGE`
- `private resetQsrc(e: Edcaf): void` — `qsrc = 0`, CW = CWmin, emits `CW_CHANGE`

- [ ] **Step 1: Failing tests** — create `tests/engine/retry-2020.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeBss, msdu } from './helpers'

const NODES = ['ap', 'sta-1', 'sta-2']
const STRONG = { 'sta-1>ap': -55, 'ap>sta-1': -55, 'sta-2>ap': -56, 'ap>sta-2': -56, 'sta-1>sta-2': -58, 'sta-2>sta-1': -58 }

describe('802.11-2020 retry model', () => {
  it('a retransmission keeps its sequence number (§10.3.2.14)', () => {
    const b = makeBss(NODES, { ...STRONG, 'sta-1>ap': -90 })
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(100_000_000)
    const seqs = b.recs('TX_START', 'sta-1').filter((r) => r.frame.kind === 'data').map((r) => r.frame.seqNo)
    expect(seqs).toHaveLength(7)
    expect(new Set(seqs).size).toBe(1)
  })

  it('a frame above the RTS threshold gets 7 attempts, not 4', () => {
    const b = makeBss(NODES, { ...STRONG, 'sta-1>ap': -90 }, { rtsThresholdBytes: 500 })
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(200_000_000)
    expect(b.recs('TX_START', 'sta-1').filter((r) => r.frame.kind === 'rts')).toHaveLength(7)
    expect(b.recs('DROP', 'sta-1')).toHaveLength(1)
    expect(b.recs('RETRY', 'sta-1').map((r) => r.retries)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('at the limit only the frames of the failed attempt are dropped', () => {
    const b = makeBss(NODES, { ...STRONG, 'sta-1>ap': -90 })
    for (let i = 0; i < 5; i++) b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(30_000_000)
    const firstDrop = b.recs('DROP', 'sta-1')
    expect(firstDrop.length).toBeGreaterThan(0)
    const t0 = firstDrop[0].t
    expect(firstDrop.filter((r) => r.t === t0)).toHaveLength(1) // single-frame DCF attempt → 1 drop
  })
})
```

Also add to `tests/engine/features.test.ts` (A-MPDU identity drop):

```ts
describe('retry-limit drop is by identity (A3)', () => {
  it('a failed A-MPDU drops only its own MPDUs', () => {
    const sc = mkScenario([{ gen: 'he', profile: 'saturated', features: { edca: true, ampdu: true, txop: false } }])
    sc.nodes[1].pos = { x: 60, y: 60, z: 1 } // unreachable: every attempt fails
    const { records } = run(sc, 400)
    const drops = records.filter((r) => r.type === 'DROP' && r.node === 'ap')
    const tx = records.filter((r) => r.type === 'TX_START' && r.node === 'ap' && r.frame.kind === 'data')
    const sent = new Set(tx.flatMap((r) => r.type === 'TX_START' ? (r.frame.ampdu?.msduIds ?? [r.frame.msduId!]) : []))
    expect(drops.length).toBeGreaterThan(0)
    for (const d of drops) if (d.type === 'DROP') expect(sent.has(d.msduId)).toBe(true)
  })
})
```

- [ ] **Step 2: Run** `npx vitest run tests/engine/retry-2020.test.ts tests/engine/features.test.ts` — expect FAIL (seq increments; RTS drop after 4; field `retries` undefined).

- [ ] **Step 3: Msdu fields** in `src/engine/traffic.ts` inside `interface Msdu`:

```ts
  /** 802.11 sequence number, assigned on the first transmission and kept on retries (§10.3.2.14). */
  seqNo?: number
  /** Retry count of this MSDU (802.11-2020: one counter per MSDU, limit dot11ShortRetryLimit). */
  retries?: number
```

- [ ] **Step 4: MAC state.** In `Edcaf` replace `src: number; lrc: number` with `qsrc: number`; constructor initialiser `qsrc: 0`. Delete `private ssrc`/`private slrc`. Remove `LONG_RETRY_LIMIT` from `phy.ts` and from the mac.ts import.

- [ ] **Step 5: Sequence numbers.** In `buildDataFrame`:

```ts
    for (const m of msdus) {
      if (m.seqNo === undefined) {
        m.seqNo = e.seqCounter
        e.seqCounter = (e.seqCounter + 1) % 4096
      }
    }
    const seqNo = msdus[0].seqNo!
```

and `retryFlag: msdus.some((m) => (m.retries ?? 0) > 0)`. Apply the same assignment loop in `respondToTrigger` (replace `seqNo: e.seqCounter` / `e.seqCounter += …`).

- [ ] **Step 6: Retry helpers** (add to `WifiMac`, replacing `failAttemptCore`):

```ts
  private bumpQsrc(e: Edcaf): void {
    const t = this.now()
    e.qsrc++
    if (e.qsrc >= SHORT_RETRY_LIMIT) {
      e.qsrc = 0
      e.cw = e.params.cwMin // §10.23.2.2: CW reset when QSRC reaches the retry limit
    } else {
      e.cw = Math.min(2 * e.cw + 1, e.params.cwMax)
    }
    this.emit({ t, type: 'CW_CHANGE', node: this.nodeId, cw: e.cw, ac: this.acTag(e) })
  }

  private resetQsrc(e: Edcaf): void {
    e.qsrc = 0
    e.cw = e.params.cwMin
    this.emit({ t: this.now(), type: 'CW_CHANGE', node: this.nodeId, cw: e.cw, ac: this.acTag(e) })
  }

  /** 802.11-2020: each MSDU of the failed attempt counts one retry; those at the limit are discarded. */
  private failMsdus(e: Edcaf, ei: number, msdus: Msdu[]): void {
    const t = this.now()
    const keep: Msdu[] = []
    for (const m of msdus) {
      m.retries = (m.retries ?? 0) + 1
      if (m.retries >= SHORT_RETRY_LIMIT) {
        this.emit({ t, type: 'DROP', node: this.nodeId, msduId: m.id, reason: 'retryLimit', ac: this.acTag(e) })
        this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(ei), ac: this.acTag(e) })
        this.hooks.onDequeue?.(m.id)
      } else {
        keep.push(m)
      }
    }
    if (keep.length) this.queues.restore(ei, keep)
  }

  /** Close a failed SU attempt: RETRY record, MSDU accounting, QSRC/CW, end TXOP, backoff. */
  private failAttemptCore(e: Edcaf, ei: number, msdus: Msdu[]): void {
    const t = this.now()
    const worst = msdus.reduce((mx, m) => Math.max(mx, (m.retries ?? 0) + 1), 0)
    this.emit({ t, type: 'RETRY', node: this.nodeId, msduId: msdus[0]?.id ?? 0, retries: worst, qsrc: e.qsrc + 1, ac: this.acTag(e) })
    this.failMsdus(e, ei, msdus)
    this.bumpQsrc(e)
    this.endTxop()
    e.backoff = null
    e.needDraw = true
    this.resumeAll()
  }
```

Update callers:
- `failAttempt`: remove `this.queues.restore(aw.ac, aw.msdus)` and `isShort`; call `this.failAttemptCore(e, aw.ac, aw.msdus)` after `onTxOutcome`.
- `succeedAttempt`: replace the ssrc/slrc/src/lrc/cw lines with `this.resetQsrc(e)`.
- CTS received: replace `this.ssrc = 0; this.edcafs[aw.ac].src = 0` with `this.edcafs[aw.ac].qsrc = 0` (QSRC resets on a CTS response; the MSDU retry counts are not reset).
- `onTriggerRespTimeout`: replace the src/ssrc block with `this.bumpQsrc(e)`.
- DL MU / UL MU callers are rewritten in Tasks 7 and 8; for now make them compile: `resolveDlMu` failure branch → `for (const c of mu.parts) if (!mu.successes.has(c.peer)) {...}` keep existing restore then `this.failAttemptCore(e, mu.ac, [])`; success branch → `this.resetQsrc(e)`. STA M-BA/timeout paths → `this.failAttemptCore(e, st.ac, st.msdus)` without the preceding `restore`, and the listed branch → `this.resetQsrc(e)`.

- [ ] **Step 7: Record + view + UI.**
  - `src/model/records.ts:37` → `| { type: 'RETRY'; node: string; msduId: number; retries: number; qsrc: number; ac?: number }`
  - `src/model/view.ts`: field `qsrc: number` replaces `ssrc`/`slrc` (interface line 87 area and initialiser line 148 `qsrc: 0`); RETRY case sets `n.qsrc = r.qsrc`.
  - `src/ui/format.ts:64` → ``case 'RETRY': return `${r.node} retry #${r.msduId} (retries=${r.retries} QSRC=${r.qsrc})` ``
  - `src/ui/Inspector.tsx:68` → `<Lbl hint={L.ssrcHint}>{L.ssrcSlrc}</Lbl><span>{nv.qsrc}</span>`
  - `src/ui/i18n.ts`: EN `ssrcSlrc: 'QSRC'`, ZH `ssrcSlrc: 'QSRC'`; rewrite both `ssrcHint` strings:
    - EN: `'Retry counter of the access category that last failed (802.11-2020). It doubles CW on each failure and resets on success; separately, each frame counts its own retries and is dropped after 7.'`
    - ZH: `'最近一次失败的接入类别的重传计数器（802.11-2020）。每次失败使 CW 翻倍，成功后清零；另外每个帧单独计数，重传 7 次后丢弃。'`
  - `grep -rn "ssrc\|slrc\|\.src\b\|lrc" src tests` must return no MAC-retry hits afterwards.

- [ ] **Step 8: Re-baseline `tests/engine/mac.test.ts`** — line 73 becomes `expect(retries[0]).toMatchObject({ retries: 1, qsrc: 1 })`; line 86 becomes `expect(retries.map((r) => r.retries)).toEqual([1, 2, 3, 4, 5, 6, 7])`. The CW ladder expectation `[31, 63, 127, 255, 511, 1023, 1023, 15]` must still hold.

- [ ] **Step 9: Run** `npx tsc -b && npx vitest run tests/engine` — new tests pass; note any other engine test that changed and why.

- [ ] **Step 10: Commit** `fix(mac): 802.11-2020 retry model — per-MSDU retries, QSRC, sequence number kept on retry, drop by identity`

---

### Task 3: Exact receive accounting and A-MPDU padding (A2 view side, A17)

**Files:**
- Modify: `src/model/frames.ts`, `src/engine/mac.ts` (populate `msduBytes`), `src/model/view.ts:365-380`
- Test: `tests/engine/phy-modes.test.ts:62`, `tests/model/view.test.ts`

**Interfaces — Produces:**
- `ampduPsduBytes(list)` = Σ subframes, last one unpadded
- `FrameDesc.msduBytes?: number[]` (data frames, same order as `ampdu.msduIds` or `[msduId]`), `MuPart.msduBytes?: number[]`
- `NodeView.rxSeen: Record<string, number[]>` (last 512 MSDU ids per sender) replacing `rxSeq`

- [ ] **Step 1: Failing tests.** In `tests/engine/phy-modes.test.ts` next to line 62:

```ts
    expect(ampduPsduBytes([1400, 1400])).toBe(1436 + 1434) // last subframe not padded
```

In `tests/model/view.test.ts` add (use the file's existing view builder helper; if it builds from records, feed these):

```ts
it('counts a retransmitted MSDU once and delivers exact MSDU bytes', () => {
  const frame = { kind: 'data', src: 'sta-1', dst: 'ap', bytes: 1430, mbps: 54, durationFieldNs: 0, txTimeNs: 1000,
    seqNo: 5, msduId: 7, msduBytes: [1400] } as const
  const vs = buildView([
    { t: 0, type: 'RX_OK', node: 'ap', from: 'sta-1', frame },
    { t: 10, type: 'RX_OK', node: 'ap', from: 'sta-1', frame: { ...frame, retryFlag: true } },
  ])
  expect(vs.nodes['ap'].stats.bytesDelivered).toBe(1400)
  expect(vs.nodes['sta-1'].stats.txOk).toBe(1)
})
```

(`buildView` = whatever helper `tests/model/view.test.ts` already uses to fold records into a `ViewState`; reuse it, adding scenario nodes `ap` and `sta-1` exactly as its other tests do.)

- [ ] **Step 2: Run** both test files — expect FAIL.

- [ ] **Step 3: Implement padding** in `src/model/frames.ts`:

```ts
export function ampduPsduBytes(msduBytesList: number[]): number {
  return msduBytesList.reduce((s, b, i) => {
    const mpdu = QOS_HDR_BYTES + b + FCS_BYTES
    // §10.12: every subframe but the last is padded to a 4-octet boundary
    return s + AMPDU_DELIMITER_BYTES + (i === msduBytesList.length - 1 ? mpdu : Math.ceil(mpdu / 4) * 4)
  }, 0)
}
```

Add `msduBytes?: number[]` to `FrameDesc` and `MuPart` with doc comment `/** Payload octets of each MSDU carried, in msduIds order. */`.

- [ ] **Step 4: Populate** `msduBytes: msdus.map((m) => m.bytes)` in `buildDataFrame`, `respondToTrigger`'s frame, and each `parts.push({...})` in `buildOfdmaParts`/`buildMumimoParts`.

- [ ] **Step 5: View** — replace the RX_OK data block:

```ts
      if (r.frame.kind === 'data') {
        const myPart = r.frame.muParts?.find((p) => p.dst === phys)
        const src = r.frame.dst === phys ? r.frame : myPart
        if (src) {
          const ids = 'msduIds' in src ? src.msduIds : (r.frame.ampdu?.msduIds ?? (r.frame.msduId !== undefined ? [r.frame.msduId] : []))
          const sizes = src.msduBytes ?? []
          const seen = (n.rxSeen[r.from] ??= [])
          let fresh = 0
          ids.forEach((id, i) => {
            if (seen.includes(id)) return // duplicate: its ACK was lost (§10.3.2.14)
            seen.push(id)
            if (seen.length > 512) seen.shift()
            fresh++
            n.stats.bytesDelivered += sizes[i] ?? 0
          })
          const sender = vs.nodes[r.from]
          if (sender) sender.stats.txOk += fresh
        }
      }
```

(For the SU frame `src` is the `FrameDesc`, which has no `msduIds`; the ternary covers it.) Rename `rxSeq` → `rxSeen: Record<string, number[]>` in the interface and initialiser.

- [ ] **Step 6: Run** `npx tsc -b && npx vitest run tests/model tests/engine/phy-modes.test.ts` — PASS.

- [ ] **Step 7: Commit** `fix(view): count each MSDU once with exact payload bytes; unpadded last A-MPDU subframe`

---

### Task 4: EIFS lifetime and IFS after a response timeout (A4, A6)

**Files:** Modify `src/engine/mac.ts`; Test: `tests/engine/mac-nav.test.ts`

- [ ] **Step 1: Failing tests** (append inside the describe in `mac-nav.test.ts`):

```ts
  it('EIFS ends when the station transmits: its next IFS after its own failed attempt is DIFS (§10.3.2.3.7)', () => {
    // sta-2 is hidden from sta-1 and collides at the AP; sta-1 hears the AP only
    const b = makeBss(NODES, { ...STRONG, 'sta-1>sta-2': -200, 'sta-2>sta-1': -200, 'sta-1>ap': -90 })
    // corrupt reception at sta-1: a weak frame from the AP that fails SINR because of noise is
    // produced by making ap>sta-1 just above preamble detect but below 54 Mbps decode
    b.enqueue(1_000_000, 'ap', msdu('ap', 'sta-2', 1400))
    b.enqueue(5_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(60_000_000)
    const ifs = b.recs('IFS_START', 'sta-1').filter((r) => r.t > 5_000_000)
    const firstTx = b.recs('TX_START', 'sta-1')[0]
    const after = ifs.filter((r) => r.t > firstTx.t)
    expect(after.length).toBeGreaterThan(0)
    expect(after.every((r) => r.kind !== 'EIFS')).toBe(true)
  })

  it('a retry counts its IFS from the end of the ACK timeout', () => {
    const b = makeBss(NODES, { ...STRONG, 'sta-1>ap': -90 })
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(20_000_000)
    const to = b.recs('ACK_TIMEOUT', 'sta-1')[0]
    const ifs = b.recs('IFS_START', 'sta-1').find((r) => r.t >= to.t)!
    expect(ifs.untilNs).toBe(to.t + DIFS_NS)
  })
```

For the first test, set the link so the AP→sta-1 frame is corrupt at sta-1: use `'ap>sta-1': -81` with the AP data at 54 Mbps (MCS chosen from `ap>sta-2` = -56 → 54 Mbps), so sta-1 locks (≥ −82) and fails (SINR 14 dB < 30 dB). Before implementing, assert in the test that `b.recs('RX_FAIL','sta-1').length > 0` so the scenario really produces a corrupt reception.

- [ ] **Step 2: Run** — expect FAIL (EIFS persists; IFS until = TX end + DIFS).

- [ ] **Step 3: Implement.**
  - `transmitFrame`: first line `this.corruptLast = false // own TX start ends EIFS`.
  - `onRxStart`: first line `this.corruptLast = false`.
  - `onRespTimeout`: before `this.failAttempt()` add `this.lastBusyEndNs = Math.max(this.lastBusyEndNs, t) // IFS counts from the timeout's end`.
  - `onTriggerRespTimeout` and the STA TB-PPDU timeout: same `lastBusyEndNs` update at their `t`.

- [ ] **Step 4: Run** `npx vitest run tests/engine` — the two new tests pass; the existing EIFS test at `mac-nav.test.ts:28` must still pass.

- [ ] **Step 5: Commit** `fix(mac): EIFS ends on own TX/RX start; retry IFS counts from the response timeout`

---

### Task 5: EDCA slot boundary at AIFS end (A5)

**Files:** Modify `src/engine/mac.ts:285-317`; Test: create `tests/engine/edca-slot-boundary.test.ts`

- [ ] **Step 1: Failing test.** Build a 2-node EDCA MAC pair with `makeBss`-like setup but `edca: true`. Add an option to `tests/engine/helpers.ts`:

```ts
export function makeBss(nodeIds: string[], links: Record<string, number>, opts: { rtsThresholdBytes?: number; seed?: number; edca?: boolean } = {}): Bss {
```

and pass `edca: opts.edca ?? false` in the MAC cfg. Test:

```ts
import { describe, it, expect } from 'vitest'
import { SLOT_NS } from '../../src/engine/phy'
import { makeBss, msdu } from './helpers'

const NODES = ['ap', 'sta-1', 'sta-2']
const STRONG = { 'sta-1>ap': -55, 'ap>sta-1': -55, 'sta-2>ap': -56, 'ap>sta-2': -56, 'sta-1>sta-2': -58, 'sta-2>sta-1': -58 }

function freezeResume(edca: boolean) {
  const b = makeBss(NODES, STRONG, { edca, seed: 7 })
  // sta-2 transmits first so sta-1 must defer and draw a backoff
  b.enqueue(1_000_000, 'sta-2', msdu('sta-2', 'ap'))
  b.enqueue(1_000_500, 'sta-1', msdu('sta-1', 'ap'))
  for (let i = 0; i < 40; i++) b.enqueue(1_000_600 + i, 'sta-2', msdu('sta-2', 'ap'))
  b.runUntil(80_000_000)
  return b
}

describe('backoff slot boundary (§10.23.2.4)', () => {
  for (const edca of [true, false]) {
    it(`${edca ? 'EDCA' : 'DCF'}: value kept across a freeze`, () => {
      const b = freezeResume(edca)
      const recs = b.records.filter((r) => 'node' in r && r.node === 'sta-1')
      const i = recs.findIndex((r) => r.type === 'BACKOFF_FREEZE')
      expect(i).toBeGreaterThan(0)
      const freeze = recs[i] as { t: number; value: number }
      // the last IFS end before the freeze, and the value in effect then
      const ifsEnd = [...recs.slice(0, i)].reverse().find((r) => r.type === 'IFS_END')!
      const startVal = [...recs.slice(0, i)].reverse().find((r) => r.type === 'BACKOFF_DRAW' || r.type === 'BACKOFF_RESUME') as { value: number }
      const k = Math.floor((freeze.t - ifsEnd.t) / SLOT_NS) // full idle slots after IFS end
      expect(freeze.value).toBe(Math.max(0, startVal.value - k - (edca ? 1 : 0)))
    })
  }

  it('EDCA: uninterrupted transmission still starts at AIFS end + b·slot', () => {
    const b = makeBss(NODES, STRONG, { edca: true, seed: 3 })
    b.enqueue(1_000_000, 'sta-2', msdu('sta-2', 'ap'))
    b.enqueue(1_000_500, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(20_000_000)
    const draw = b.recs('BACKOFF_DRAW', 'sta-1')[0]
    const tx = b.recs('TX_START', 'sta-1')[0]
    const ifsEnd = b.recs('IFS_END', 'sta-1').find((r) => r.t === draw.t)!
    if (!b.recs('BACKOFF_FREEZE', 'sta-1').some((r) => r.t < tx.t)) {
      expect(tx.t).toBe(ifsEnd.t + draw.value * SLOT_NS)
    }
  })
})
```

If the seed yields no freeze for one of the variants, change the seed in `freezeResume` until both variants freeze (print `b.recs('BACKOFF_FREEZE','sta-1')` once), then hard-code that seed.

- [ ] **Step 2: Run** — EDCA variant FAILS (value is one higher).

- [ ] **Step 3: Implement.** Replace `onIfsEndAc`'s tail and `onSlotTick`:

```ts
    // §10.23.2.4: for EDCA the end of AIFS is itself a slot boundary at which
    // the counter may decrement; reaching 0 there still waits for the next
    // boundary to transmit. DCF decrements only after each idle slot.
    if (e.backoff === 0) this.markReady(e)
    else {
      if (this.cfg.edca) this.decrement(e)
      this.scheduleTick(e)
    }
  }

  private decrement(e: Edcaf): void {
    e.backoff = e.backoff! - 1
    this.emit({ t: this.now(), type: 'BACKOFF_DEC', node: this.nodeId, value: e.backoff, ac: this.acTag(e) })
  }

  private onSlotTick(e: Edcaf): void {
    if (this.cfg.edca) {
      if (e.backoff === 0) { this.markReady(e); return }
      this.decrement(e)
      this.scheduleTick(e)
      return
    }
    this.decrement(e)
    if (e.backoff === 0) this.markReady(e)
    else this.scheduleTick(e)
  }
```

Also: `onCcaBusy`/`updateNav` emit `BACKOFF_FREEZE` with `value: e.backoff!` — unchanged; a frozen 0 resumes via `onIfsEndAc` → `markReady` at the next IFS end, which is the standard behaviour.

- [ ] **Step 4: Run** `npx vitest run tests/engine` — new tests pass; list any EDCA timing tests that moved (expected: tests quoting EDCA freeze/resume values).

- [ ] **Step 5: Commit** `fix(mac): EDCA decrements at the AIFS slot boundary (§10.23.2.4)`

---

### Task 6: Internal collision retry accounting (A7)

**Files:** Modify `src/engine/mac.ts:333-370`; Test: `tests/engine/features.test.ts`

- [ ] **Step 1: Failing test** — force AC_BK and AC_VO ready at the same instant forever: saturate a single EDCA STA with both `'saturated'` (BE) and a VO profile is not deterministic enough; instead unit-test with the helper MAC:

```ts
import { makeBss, msdu } from './helpers'
describe('internal collision (§10.23.2.12.1)', () => {
  it("the losing AC's head frame counts a retry", () => {
    const b = makeBss(['ap', 'sta-1'], { 'sta-1>ap': -55, 'ap>sta-1': -55 }, { edca: true })
    // both ACs queue on an idle medium at the same instant → both ready at once
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap', 1400, 3))
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap', 1400, 0))
    b.runUntil(50_000_000)
    expect(b.recs('INTERNAL_COLLISION', 'sta-1')).toHaveLength(1)
    const retry = b.recs('RETRY', 'sta-1')
    expect(retry).toHaveLength(1)
    expect(retry[0]).toMatchObject({ ac: 0, retries: 1, qsrc: 1 })
    const bkTx = b.recs('TX_START', 'sta-1').find((r) => r.frame.ac === 0)!
    expect(bkTx.frame.retryFlag).toBe(true)
  })
})
```

`makeBss.enqueue` calls `macs[node].enqueue(msdu)` with the default AC; change the helper's `enqueue` to `macs[node].enqueue(msdu, msdu.ac)`.

- [ ] **Step 2: Run** — FAIL (no RETRY record).

- [ ] **Step 3: Implement** in `arbitrate`: collect losers, transmit, then penalise only if the winner started something:

```ts
    const winner = this.edcafs[contending[0]]
    winner.backoff = null
    winner.needDraw = false
    this.transmitFor(winner, false)
    const winnerSent = this.inExchange()
    for (const i of contending.slice(1)) {
      const loser = this.edcafs[i]
      if (!winnerSent) { this.startAccessAc(loser); continue }
      this.emit({ t, type: 'INTERNAL_COLLISION', node: this.nodeId, winnerAc: winner.params.ac, loserAc: loser.params.ac })
      // §10.23.2.12.1: an internal collision is a failed attempt for the lower AC.
      const head = this.queues.claim(i, this.queues.head(i, this.reach)?.dst ?? null, 1, () => true)
      if (head.length) {
        this.emit({ t, type: 'RETRY', node: this.nodeId, msduId: head[0].id, retries: (head[0].retries ?? 0) + 1, qsrc: loser.qsrc + 1, ac: this.acTag(loser) })
        this.failMsdus(loser, i, head)
      }
      this.bumpQsrc(loser)
      loser.backoff = this.rng.int(loser.cw)
      this.emit({ t, type: 'BACKOFF_DRAW', node: this.nodeId, value: loser.backoff, cw: loser.cw, ac: this.acTag(loser) })
    }
```

(`transmitFrame` has already cancelled contention; the losers resume through `resumeAll` after the winner's exchange, as today.)

- [ ] **Step 4: Run** `npx vitest run tests/engine` — PASS.

- [ ] **Step 5: Commit** `fix(mac): internal-collision losers count a retry (§10.23.2.12.1)`

---

### Task 7: DL MU format, outcome and TXOP budget (A1, A8, A13)

**Files:** Modify `src/engine/mac.ts:569-707`; Test: create `tests/engine/dl-mu-standard.test.ts`

**Interfaces — Produces:**
- `private muDurCap(e: Edcaf, inTxopBurst: boolean): Ns`
- `buildOfdmaParts(e, ei, dsts, durCap)` / `buildMumimoParts(e, ei, dsts, durCap)`

- [ ] **Step 1: Failing tests:**

```ts
import { describe, it, expect } from 'vitest'
import { Simulation } from '../../src/engine/simulation'
import { HOUSEHOLDS } from '../../src/model/households'
import type { TLRecord } from '../../src/model/records'

const MS = 1_000_000
function mixedMu() {
  const sc = HOUSEHOLDS.find((h) => h.id === 'full-house')!.scenario()
  const ap = sc.nodes.find((n) => n.kind === 'ap')!
  sc.nodes = sc.nodes.filter((n) => n.kind === 'ap' || ['sta-1', 'sta-5', 'sta-6'].includes(n.id))
  for (const n of sc.nodes) if (n.kind === 'sta') { n.pos = { ...ap.pos, x: ap.pos.x + 0.8 }; n.profiles = ['video'] }
  const sim = new Simulation(sc)
  const recs: TLRecord[] = []
  for (let t = 100 * MS; t <= 1500 * MS; t += 100 * MS) recs.push(...sim.runUntil(t).records)
  return { sc, recs }
}

describe('DL MU per 802.11ax/be', () => {
  const { sc, recs } = mixedMu()
  const gens = Object.fromEntries(sc.nodes.map((n) => [n.id, n.caps.generation]))
  const mu = recs.filter((r): r is Extract<TLRecord, { type: 'TX_START' }> => r.type === 'TX_START' && r.frame.kind === 'data' && !!r.frame.muParts)

  it('scenario really mixes HE and EHT members', () => {
    expect(mu.some((r) => r.frame.muParts!.some((p) => gens[p.dst] === 'eht') && r.frame.muParts!.some((p) => gens[p.dst] === 'he'))).toBe(true)
  })

  it('an HE MU PPDU never carries MCS > 11, and every addressed part decodes when links are strong', () => {
    for (const r of mu) if (r.frame.mode === 'he') for (const p of r.frame.muParts!) expect(p.mcs).toBeLessThanOrEqual(11)
    const fails = recs.filter((r) => r.type === 'RX_FAIL' && r.from === 'ap' && r.frame?.muParts)
    expect(fails).toHaveLength(0)
  })

  it('an MU PPDU plus its BlockAcks ends inside the TXOP', () => {
    for (const r of mu) {
      const txop = [...recs].reverse().find((x) => x.type === 'TXOP_START' && x.node === 'ap' && x.t <= r.t)
      if (!txop || txop.type !== 'TXOP_START') continue
      const lastBa = recs.filter((x) => x.type === 'TX_END' && x.frame.kind === 'ba' && x.frame.orthogonalGroup === r.frame.orthogonalGroup)
      for (const ba of lastBa) expect(ba.t).toBeLessThanOrEqual(txop.untilNs)
    }
  })
})
```

Add a unit test for A8 in the same file using the `ofdma-dl` lesson with one member moved out of range:

```ts
import { LESSONS } from '../../src/course/lessons'
it('one missing BlockAck does not double the AP CW when another member acknowledged', () => {
  const sc = LESSONS.find((x) => x.id === 'ofdma-dl')!.scenario()
  const sta = sc.nodes.filter((n) => n.kind === 'sta')
  sta[sta.length - 1].pos = { x: 200, y: 200, z: 1 }
  const sim = new Simulation(sc)
  const recs: TLRecord[] = []
  for (let t = 50 * MS; t <= 400 * MS; t += 50 * MS) recs.push(...sim.runUntil(t).records)
  let checked = 0
  for (const r of recs) {
    if (r.type !== 'TX_START' || r.node !== 'ap' || !r.frame.muParts || r.frame.kind !== 'data') continue
    const bas = recs.filter((x) => x.type === 'RX_OK' && x.node === 'ap' && x.frame.kind === 'ba' && x.frame.orthogonalGroup === r.frame.orthogonalGroup)
    if (bas.length === 0 || bas.length === r.frame.muParts.length) continue
    const cw = recs.find((x) => x.t > r.t && x.type === 'CW_CHANGE' && x.node === 'ap' && x.ac === r.frame.ac)
    expect(cw && cw.type === 'CW_CHANGE' ? cw.cw : -1).toBeLessThanOrEqual(15)
    checked++
  }
  expect(checked).toBeGreaterThan(0)
})
```

(If the out-of-range member never gets into an MU group because rate/ofdma gating drops it, move it to the edge of coverage instead — e.g. 25 m — so its BA fails intermittently; adjust until `checked > 0`.)

- [ ] **Step 2: Run** — FAIL (MCS 12/13 in `he`, failures, CW doubles).

- [ ] **Step 3: Budget helper:**

```ts
  /** Longest MU PPDU allowed now: aPPDUMaxTime, and inside the TXOP with room for SIFS + the BlockAcks. */
  private muDurCap(e: Edcaf, inTxopBurst: boolean): Ns {
    const baTime = txTimeNs(BA_BYTES, 24)
    const t = this.now()
    const end = inTxopBurst && this.txopEndNs > 0
      ? this.txopEndNs
      : this.cfg.txop && this.cfg.edca && e.params.txopLimitNs > 0 ? t + e.params.txopLimitNs : Infinity
    return Math.min(MAX_PPDU_NS, end - t - SIFS_NS - baTime)
  }
```

- [ ] **Step 4: Format + claim by time.** In both builders compute the format first and use it for every member:

```ts
    // 802.11be: an EHT MU PPDU only if every member is EHT; otherwise HE, where
    // EHT members are served at HE-MCS (≤ 11) — 4096-QAM does not exist in HE.
    const modeAll: PhyMode = dsts.every((d) => this.cfg.modeForPeer(d) === 'eht') ? 'eht' : 'he'
    for (const peer of dsts) {
      const mcs = modeAll === 'he' ? Math.min(11, this.cfg.mcsForPeer(peer)) : this.cfg.mcsForPeer(peer)
      const msdus = this.queues.claim(ei, peer, MAX_AMPDU_MPDUS, (m, claimed) =>
        txTimeModeNs(modeAll, ampduPsduBytes([...claimed.map((x) => x.bytes), m.bytes]), mcs,
          { mu: true, ruFraction: frac, widthMhz: muWidth, nss }) <= durCap)
      …
      parts.push({ …, mcs, mbps: mcsRateMbps(modeAll, mcs), … })
      ppduDur = Math.max(ppduDur, txTimeModeNs(modeAll, bytes, mcs, { mu: true, ruFraction: frac, widthMhz: muWidth, nss }))
```

(MU-MIMO builder: same, without `ruFraction`, with `nss: nssPeer`.) Delete `maxPsduBytesFor` use there. `transmitDlMu` passes `this.muDurCap(e, inTxopBurst)`; if `durCap` is below one symbol + preamble, fall back to SU (`transmitSuFallback`).

- [ ] **Step 5: Outcome** — rewrite `resolveDlMu`:

```ts
  private resolveDlMu(): void {
    const mu = this.muState
    if (!mu || mu.kind !== 'dl') return
    this.muState = null
    const e = this.edcafs[mu.ac]
    const t = this.now()
    const failed: Msdu[] = []
    for (const c of mu.parts) {
      const ok = mu.successes.has(c.peer)
      this.cfg.onTxOutcome?.(c.peer, ok)
      if (ok) {
        for (const m of c.msdus) {
          this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(mu.ac), ac: this.acTag(e) })
          this.hooks.onDequeue?.(m.id)
        }
      } else {
        failed.push(...c.msdus)
      }
    }
    if (mu.successes.size > 0) {
      // 802.11ax: the DL MU exchange succeeded if any user acknowledged; the
      // others' MPDUs are retransmitted, without penalising the whole EDCAF.
      if (failed.length) {
        this.emit({ t, type: 'RETRY', node: this.nodeId, msduId: failed[0].id, retries: Math.max(...failed.map((m) => (m.retries ?? 0) + 1)), qsrc: e.qsrc, ac: this.acTag(e) })
        this.failMsdus(e, mu.ac, failed)
      }
      this.resetQsrc(e)
      this.continueOrRelease(e)
    } else {
      this.failAttemptCore(e, mu.ac, failed)
    }
  }
```

Note: `failMsdus` restores survivors with one `unshift(...keep)`, preserving their order.

- [ ] **Step 6: Run** `npx vitest run tests/engine` — new tests pass; `dl-mu-resolve.test.ts` and `mu-rate-adapt.test.ts` must still pass (update only if a test encoded "any failure doubles CW", citing A8).

- [ ] **Step 7: Commit** `fix(mac): HE/EHT MU PPDU format rule, MU success if any BA, MU PPDU sized to the TXOP`

---

### Task 8: STA side of triggered uplink (A9, A10)

**Files:** Modify `src/engine/mac.ts` (`handleOwnFrame` trigger + mba cases, `respondToTrigger`, `updateNav`, `onNavClear`, `onCfEnd`); Test: `tests/engine/mac-trigger-timeout.test.ts`

**Interfaces — Produces:** `private navSetBy: string | null`

- [ ] **Step 1: Failing tests** (append to `mac-trigger-timeout.test.ts`, reusing its scenario builder for UL OFDMA):

```ts
it('a STA keeps CW and backoff unchanged across a triggered uplink (802.11ax §26.5.2.3)', () => {
  // use the file's UL-OFDMA scenario; collect sta-1 CW_CHANGE/BACKOFF_DRAW records
  // whose t lies between a trigger RX_OK at sta-1 and the following M-BA end (or timeout)
  for (const w of triggerWindows('sta-1')) {
    const inside = recs.filter((r) => r.node === 'sta-1' && r.t > w.start && r.t <= w.end + 1 &&
      (r.type === 'CW_CHANGE' || r.type === 'BACKOFF_DRAW'))
    expect(inside).toHaveLength(0)
  }
})
```

where `triggerWindows(id)` returns `{start: triggerRxOk.t, end: nextMbaRx?.t ?? start + 5 * MS}` for every trigger listing `id`. Write that helper in the test file from the records.

Second test with the helper MAC (third-party NAV):

```ts
it('a STA with a NAV set by another BSS stays silent and keeps its NAV', () => {
  // build via Simulation: two APs is not available; instead inject a NAV:
  // sta-1 overhears an RTS from sta-2 to sta-3 (sta-3 ∉ BSS roles) right before the AP trigger.
})
```

If no two-BSS setup exists, implement the NAV check test at unit level by exposing nothing new: construct `WifiMac` directly with `makeBss(['ap','sta-1','sta-2'], …, { edca: true })`, set `ofdmaWith: () => true` and `ulBacklog` on the AP through a new helper option `ofdma?: boolean`, have `sta-2` send an RTS (rtsThresholdBytes 500, 1400 B to `ap`… ) — **if this cannot be built in under 30 lines, test A10 through `updateNav` records only**: assert that after a Trigger RX_OK at a STA there is no `NAV_CLEAR` record at that STA at the same instant.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement A10.**
  - Field `private navSetBy: string | null = null`; in `updateNav` after `this.navUntil = until` set `this.navSetBy = from`; clear it (`= null`) wherever `navUntil = 0` is set (`onCfEnd`, `onNavClear`, RTS early release).
  - Trigger case:

```ts
      case 'trigger': {
        if (!myPart) break
        // CS Required: respond only if the NAV is idle — a NAV set by the
        // triggering AP itself does not count (intra-BSS). Never clear it.
        if (this.now() < this.navUntil && this.navSetBy !== from) break
        this.respondToTrigger(t, frame, myPart)
        break
      }
```

- [ ] **Step 4: Implement A9.** `mba` case:

```ts
        if (listed) {
          for (const m of st.msdus) {
            this.emit({ t, type: 'DEQUEUE', node: this.nodeId, msduId: m.id, depth: this.queues.depth(st.ac), ac: this.acTag(e) })
            this.hooks.onDequeue?.(m.id)
          }
        } else {
          this.emit({ t, type: 'RETRY', node: this.nodeId, msduId: st.msdus[0]?.id ?? 0, retries: Math.max(...st.msdus.map((m) => (m.retries ?? 0) + 1)), qsrc: e.qsrc, ac: this.acTag(e) })
          this.failMsdus(e, st.ac, st.msdus)
        }
        // §26.5.2.3: after a TB PPDU the EDCAF resumes without changing CW or its backoff counter.
        this.resumeAll()
```

The STA timeout closure in `respondToTrigger` gets the same `else` body followed by `this.resumeAll()` (no `failAttemptCore`).

- [ ] **Step 5: Run** `npx vitest run tests/engine` — PASS.

- [ ] **Step 6: Commit** `fix(mac): STA keeps CW/backoff after TB PPDU; trigger response honours a third-party NAV`

---

### Task 9: Aggregation budget with protection, continuation check, RTS NAV timer (A12, A14, A15)

**Files:** Modify `src/engine/mac.ts:374-514, 898-926, 1272-1288`; Test: `tests/engine/features.test.ts:76-90`, `tests/engine/mac-nav.test.ts`

**Interfaces — Produces:**
- `private protectionNs(mode: PhyMode, mcs: number, mbps: number): Ns` = RTS + SIFS + CTS + SIFS
- `private exchangeFits(startNs: Ns, endNs: Ns, mode, mcs, width, nss, psduBytes, aggregate, protectedFirst): boolean` — `start + [protection] + data + SIFS + response ≤ end`

- [ ] **Step 1: Failing tests.** Replace the body of `features.test.ts` "every PPDU (+SIFS+BA) fits inside its TXOP" with a check on the response end, and add an RTS variant:

```ts
  for (const rts of [65535, 500]) it(`every exchange incl. its BA ends inside its TXOP (§10.23.2.9), RTS threshold ${rts}`, () => {
    const sc = mkScenario([{ gen: 'vht', profile: 'saturated' }])
    for (const n of sc.nodes) n.rtsThresholdBytes = rts // if NodeCfg has no such field, set sc.rtsThresholdBytes
    const { records } = run(sc, 150)
    let checked = 0
    for (const ts of records) {
      if (ts.type !== 'TXOP_START') continue
      const next = records.find((r) => r.type === 'TXOP_END' && r.node === ts.node && r.t >= ts.t)
      const ends = records.filter((r) => r.type === 'TX_END' && r.t >= ts.t && (!next || r.t <= next.t) &&
        (r.node === ts.node || (r.frame.dst === ts.node)))
      for (const e of ends) expect(e.t, `TXOP @${ts.t}`).toBeLessThanOrEqual(ts.untilNs)
      checked++
    }
    expect(checked).toBeGreaterThan(10)
  })
```

(Check `src/model/scenario.ts:343` for where `rtsThresholdBytes` lives and set it there.)

Add to `mac-nav.test.ts`:

```ts
  it('RTS NAV reset waits 2·SIFS + CTS + aRxPHYStartDelay + 2·slot (§10.3.2.4)', () => {
    // sta-2 hears sta-1's RTS, but the CTS (ap) is hidden from sta-2 and no data follows (ap cannot hear sta-1)
    const b = makeBss(NODES, { ...STRONG, 'ap>sta-2': -200, 'sta-2>ap': -200, 'sta-1>ap': -90 }, { rtsThresholdBytes: 500 })
    b.enqueue(1_000_000, 'sta-1', msdu('sta-1', 'ap'))
    b.runUntil(3_000_000)
    const set = b.recs('NAV_SET', 'sta-2')[0]
    const clear = b.recs('NAV_CLEAR', 'sta-2')[0]
    const rtsEnd = set.t
    expect(clear.t - rtsEnd).toBe(2 * SIFS_NS + txTimeNs(CTS_BYTES, 24) + 20_000 + 2 * SLOT_NS)
  })
```

- [ ] **Step 2: Run** — RTS variant and NAV timer FAIL.

- [ ] **Step 3: Implement budget.** In `transmitFor` replace `txopCap`/`budgetNs` and the claim predicate:

```ts
    const t0 = t
    const txopEnd = inTxopBurst && this.txopEndNs > 0
      ? this.txopEndNs
      : this.cfg.txop && this.cfg.edca && e.params.txopLimitNs > 0 ? t0 + e.params.txopLimitNs : Infinity
    const prot = this.protectionNs(mode, mcs, mbps)
    const msdus = this.queues.claim(ei, peer, useAmpdu ? MAX_AMPDU_MPDUS : 1, (m, claimed) => {
      const trial = [...claimed.map((x) => x.bytes), m.bytes]
      const agg = useAmpdu && trial.length > 1
      const psduTrial = agg ? ampduPsduBytes(trial) : this.cfg.edca ? QOS_HDR_BYTES + trial[0] + FCS_BYTES : dataPsduBytes(trial[0])
      const protectedFirst = !inTxopBurst && psduTrial > this.cfg.rtsThresholdBytes
      const data = txTimeModeNs(mode, psduTrial, mcs, { widthMhz: width, nss })
      if (data > MAX_PPDU_NS) return false
      const resp = txTimeNs(agg ? BA_BYTES : ACK_BYTES, ctrlRespRateForMode(mode, mcs, mbps))
      return t0 + (protectedFirst ? prot : 0) + data + SIFS_NS + resp <= txopEnd
    })
```

with

```ts
  private protectionNs(mode: PhyMode, mcs: number, mbps: number): Ns {
    const rtsRate = ctrlRespRateForMode(mode, mcs, mbps)
    return txTimeNs(RTS_BYTES, rtsRate) + SIFS_NS + txTimeNs(CTS_BYTES, ctrlRespRateFor(rtsRate)) + SIFS_NS
  }
```

`AcQueues.claim` keeps its rule that the head frame is always claimable alone (§10.23.2.9 allows a TXOP to start with one MPDU even if it cannot complete inside the limit).

- [ ] **Step 4: Continuation + plan.** In `continueOrRelease`:

```ts
      const mbps = mcsRateMbps(mode, mcs)
      const psdu = this.cfg.edca ? QOS_HDR_BYTES + head.bytes + FCS_BYTES : dataPsduBytes(head.bytes)
      const oneFrame = txTimeModeNs(mode, psdu, mcs, { widthMhz: width, nss })
      const need = SIFS_NS + oneFrame + SIFS_NS + txTimeNs(ACK_BYTES, ctrlRespRateForMode(mode, mcs, mbps))
```

In `planBurstNs` mirror the same predicate as Step 3 (start `t + SIFS_NS`, `protectedFirst = false`) and the same `need` check; delete the `Math.max(200_000, …)` expression.

- [ ] **Step 5: RTS NAV timer** (`updateNav`): `t + 2 * SIFS_NS + ctsTime + RX_START_DELAY_NS + 2 * SLOT_NS`; import `RX_START_DELAY_NS`.

- [ ] **Step 6: Run** `npx tsc -b && npx vitest run tests/engine` — PASS; `txop-protection.test.ts` must still pass.

- [ ] **Step 7: Commit** `fix(mac): aggregation budget includes RTS/CTS and the response; exact continuation check; RTS NAV reset timer`

---

### Task 10: Content corrections (A18)

**Files:** `src/course/lessons.ts` (~1137, ~1143, ~1209, ~1251), `src/ui/i18n.ts:223` (+ ZH twin), `src/model/presets.ts:54,78,144-148`; Test: `tests/course/lessons.test.ts`, `tests/ui/i18n.test.ts`

- [ ] **Step 1: Read** each location and its ZH counterpart (`grep -n "one transmission served one receiver\|simultaneously\|no longer CSMA\|independent MACs\|no MLO\|2.4" src/course/lessons.ts src/ui/i18n.ts src/model/presets.ts`).
- [ ] **Step 2: Add a guard test** to `tests/course/lessons.test.ts`:

```ts
it('lesson text makes no claims contradicted by the standard (A18)', () => {
  const all = JSON.stringify(LESSONS)
  expect(all).not.toMatch(/Until Wi-Fi 6, one transmission served one receiver/)
  expect(all).not.toMatch(/no longer CSMA at all/)
})
```

- [ ] **Step 3: Edit text** (EN and ZH each):
  - 1137: "Wi-Fi 5 (802.11ac) already let one downlink transmission reach several receivers with MU-MIMO; Wi-Fi 6 adds OFDMA, which splits the channel in frequency, and extends MU to the uplink. This simulator models multi-user transmission for Wi-Fi 6 and 7 only."
  - 1143: add "In the standard, those simultaneous acknowledgements are solicited by the AP (a Trigger or the TRS field) and sent as trigger-based PPDUs; the simulator draws them as plain BlockAcks on each user's share."
  - 1209: "Triggered uplink replaces contention for the scheduled transmission itself — but the station still checks the medium and its NAV before answering when the Trigger asks it to."
  - 1251: add "MLO also comes as single-radio EMLSR, common in phones, and can pair 2.4 + 5 GHz; this simulator models the two-radio 5 + 6 GHz case."
  - `i18n.ts:223`: "6 GHz is off on China units, and this simulator only models MLO across 5 + 6 GHz" (ZH: "国行机型关闭 6 GHz；本模拟器仅模拟 5 + 6 GHz 的 MLO").
  - presets "dual-band 2.4/5 GHz": append " (2.4 GHz not simulated yet)" / "（暂未模拟 2.4 GHz）".
- [ ] **Step 4: Run** `npx vitest run tests/course tests/ui` — PASS.
- [ ] **Step 5: Commit** `docs(course,ui): correct MU-MIMO history, triggered-access CSMA, MLO forms, 2.4 GHz note`

---

### Task 11: Re-baseline lessons, tamper report, and verify (A19)

**Files:** `tests/course/quoted-timestamps.test.ts`, other `tests/course/*` and `tests/engine/*` expectations still failing, `src/course/lessons.ts`, `scripts/tamper-report.ts` outputs in `docs/reports/`

- [ ] **Step 1:** `npx vitest run 2>&1 | grep -E "FAIL|✗|×"` — list every failing test.
- [ ] **Step 2:** For each failing lesson-number assertion: run the lesson (as the test does), read the new value, then update BOTH the test expectation and every sentence in `lessons.ts` that quotes that number (search the old value as µs/ms text, e.g. `248 µs`, `0.248 ms`). If the narrative's claim no longer holds (not just the number), rewrite the sentence to describe what the engine now shows.
- [ ] **Step 3:** For failing non-lesson engine tests: confirm the change is caused by an A-item (cite it in the commit), then update the expectation.
- [ ] **Step 4:** Regenerate the tamper report exactly as commit `ff3f005` did (`git show --stat ff3f005` to see the command/outputs; typically `npx tsx scripts/tamper-report.ts && npx tsx scripts/tamper-report-html.ts`), then compare narrative numbers in `docs/reports/edca-tamper-report.zh.html` against the regenerated JSON and fix sentences as in `6ee693c`.
- [ ] **Step 5:** `npx tsc -b && npx vitest run` — all green.
- [ ] **Step 6:** Re-run the comparison probes with the fixed engine: `npx tsx <scratchpad>/compare/probe-mixmu2.ts`, `probe-drop.ts`, `probe-dup.ts`, `probe-access.ts`, `probe2.ts`, `probe-exchange.ts`, `probe-txop.ts` — confirm: 0 mixed-MU failures, `txOk` equals distinct MSDUs, drops only of sent MSDUs, no persistent EIFS, 0 TXOP overruns with RTS, 0 MU overruns. (Probes that reference removed fields `src/lrc/ssrc/slrc` need those reads switched to `retries/qsrc`.)
- [ ] **Step 7:** Browser check — `npm run dev`, open lessons: backoff, NAV, hidden node, OFDMA DL, MLO; confirm they play, the Inspector shows QSRC, and quoted timestamps match the timeline.
- [ ] **Step 8: Commit** `chore(course,report): re-baseline lessons and the EDCA tamper report on standard alignment A`
