# Task 4 report — UWB side of the 6 GHz coupling

## What was built

**`src/uwb/channel.ts`** — `UwbChannel` gained a last constructor parameter
`private spectrum: Spectrum | null = null`. Default `null`, so every existing call site
(and every existing test) keeps the exact behaviour it had.

- *Emission.* `transmit` builds one `Emission`
  `{ txId: from, eirpDbm: node.txPowerDbm, bandLoMhz/HiMhz: UWB_BAND_MHZ[cfg.channel], pos }`
  and puts it on the air immediately **before** the `TX_START` record; the scheduled TX-end
  callback retires that same object (by identity) immediately **before** the `TX_END` record.
  The PPDU is therefore live over exactly its own air time, which is what the Wi-Fi side's
  max-over-lock needs. One fresh object per PPDU — nothing is mutated while live.
- *Reception.* `Reception` gained `maxForeignMw`, initialised at arrival in `startRx` with
  `spectrum.foreignMw('uwb', rxPos, band.lo, band.hi)` (0 without a spectrum). The constructor
  registers **one** `onChange('uwb')` listener, which walks every radio that has an open
  reception, takes one `foreignMw` reading per receiver and raises each open reception's max.
- *Decision.* `endRx` now computes `foreignDbm = maxForeignMw > 0 ? 10·log10(maxForeignMw) : −Infinity`,
  stores it on `rx.info`, and — only after the existing collision decision has let the frame
  through — tests `sirDb = rssiDbm − foreignDbm` against `UWB_SIR_MIN_DB`. Below it:
  `RX_FAIL { reason: 'lowSinr' }`, then `UWB_INTERFERED { node, from, foreignDbm, sirDb }`,
  then `onRxFail`. With nothing foreign on the air the ratio is `+Infinity`, so the branch is
  unreachable without a spectrum — the "no behaviour change" guarantee falls out of the arithmetic
  rather than out of an `if (spectrum)` guard.
- `UwbRxInfo.foreignDbm: number` is required and is `−Infinity` when nothing foreign was heard.
- Small refactor: `posOf`/`rssiDbm` now share a `nodeOf(id)` lookup that throws on an unknown id,
  so the emission's `eirpDbm` is read from the same checked place (no `?? 0` fallback).

**`src/uwb/network.ts`** — `UwbNetwork` gained a trailing `spectrum: Spectrum | null = null`
parameter, passed straight through to `UwbChannel`.

**`src/engine/simulation.ts`** — the UWB block now hands `this.spectrum` to `UwbNetwork`. The
6 GHz link block runs earlier in the constructor, so the mediator (or `null`) is already decided
when the ranging session is built; both engines end up holding the same object.

**Record, view, log, inspector**

- `UwbRecord` gained `{ type: 'UWB_INTERFERED'; node; from; foreignDbm; sirDb }` (`node` is the
  *receiver*).
- `UwbNodeView.interfered: number`, initialised 0, `+1` per record on the receiving node's lane;
  `applyUwbRecord`'s switch stays exhaustive.
- `fmtUwbRecord`: `anc-1 UWB frame from tag-1 lost to Wi-Fi: SIR -34.5 dB (foreign -42.2 dBm)`;
  `src/ui/format.ts` delegates the new type with the other seven.
- `UwbInspector` gained a row under "silent slots", with i18n `uwb.interfered`:
  EN "lost to Wi-Fi", ZH "被 Wi-Fi 干扰丢失".

## Measured numbers — the mixed scenario

Scenario (`tests/uwb/network.test.ts`, `coexistScenario`): a 10 × 8 m lab, four corner anchors at
z = 2.4 m, one tag at (5, 4, 1) on UWB channel 5, DS-TWR, `nlos: false`; plus an eht AP at
(5, 1, 2) and a laptop at (6, 4, 1) on `linkId: '6g'` with `caps.widthMhz: 80` running `saturated`.
UWB nodes are listed last. 1 s of simulated time.

| | `sixGhzCenterMhz: 6305` | `sixGhzCenterMhz: 5985` |
|---|---|---|
| `Simulation.spectrum` | a `Spectrum` | `null` |
| `UWB_INTERFERED` in 1 s | **33** | 0 |
| UWB `RX_OK` in 1 s | 19 | 80 |
| `UWB_RANGE` / `UWB_POSITION` | 0 / 0 | 40 / 5 |
| foreign power seen | −57.6 … −32.9 dBm | — |
| SIR at the failing receptions | −45.2 … −20.5 dB | — |

Per-node share of the 33: tag-1 9, each anchor 6.

Distances: tag → AP **3.16 m**, tag → laptop **1.00 m**. The laptop is the strongest interferer —
its uplink at 15 dBm from 1 m gives the −32.9 dBm worst case; the AP at 20 dBm from 3.16 m gives
about −43 dBm. Anchor–tag ranges are 5.6–5.9 m, so the wanted signal is around −78 dBm: every
overlap is 20–45 dB the wrong side of the −12 dB the correlation gain is good for, and the
session loses every round it tries (0 positions). That is the lesson's headline, and it is what
`uwbBandOverlap` predicts: 6305 ± 40 MHz sits wholly inside UWB channel 5's 6240–6739.2 MHz.

## Tests

- **`tests/uwb/channel-coexist.test.ts`** (new, 6 tests). A tag 5 m from an anchor (rssi
  −76.67 dBm, derived from `uwbPl0Db`) against a hand-registered Wi-Fi emission 3 m from the
  anchor: +20 dBm EIRP → foreign −42.21 dBm, **sirDb −34.46**, `RX_FAIL lowSinr` immediately
  followed (same `t`, `seq + 1`) by `UWB_INTERFERED`, and `onRxFail('lowSinr')` at the radio;
  an emission 20 dB below the wanted signal → `RX_OK` with `info.foreignDbm = rssi − 20`;
  the turnover pinned at `UWB_SIR_MIN_DB ± 0.1 dB`; an emission registered 100 µs into the
  reception (after `RX_START`) still loses the frame; no-spectrum and empty-spectrum runs
  produce identical record arrays with `info.foreignDbm === −Infinity`; and the UWB PPDU is
  readable on the Wi-Fi side of the mediator for exactly its air time (−76.66 dBm at 2 m over
  80 MHz) and gone after `TX_END`.
- **`tests/uwb/network.test.ts`** (+2). The `Simulation`-level pair in the table above, plus the
  assertion that the 5985 run builds no mediator and that its UWB record subsequence (seq
  stripped) is byte-identical to the same UWB session with no Wi-Fi nodes at all.
- **`tests/uwb/view.test.ts`** (+1) counts two `UWB_INTERFERED` on the receiver's lane and checks
  the transmitter's stays 0; **`tests/ui/uwb-format.test.ts`** (+1) pins the log line and adds
  the record to the `fmtRecord` delegation table.
- Touched for the new field: `tests/uwb/inspector-rows.test.ts` and two `toEqual` literals in
  `tests/uwb/view.test.ts` (`interfered: 0`).

`npx tsc -b`, `npx vite build` and `npx vitest run` (102 files, 1163 tests) all green;
`tests/fixtures/lesson-hashes.json` untouched and `lesson-hashes.test.ts` passes.

## Deviations

1. **`src/uwb/ui/rows.ts` was not modified.** The brief lists it alongside `UwbInspector.tsx` for
   the new row, but `interfered` is a bare count with no formatting, exactly like `timeouts`,
   which the inspector already renders straight from the view state. Adding a formatter for an
   integer would have been an untested indirection; the row reads `u.interfered` directly.
2. **The "identical with or without the (null) spectrum" test** is expressed at the `Simulation`
   level as *UWB-only vs UWB + a non-overlapping 6 GHz BSS*, rather than as a direct
   `new UwbNetwork(..., null)` vs `new UwbNetwork(...)` comparison, which would have had to
   reproduce `Simulation`'s RNG forking by hand. The `UwbChannel`-level version of the same
   claim (no spectrum vs an empty spectrum, records compared with `toEqual`) is in
   `channel-coexist.test.ts`.
3. The brief's illustrative `sirDb ≈ −34.7` is **−34.46** with the engine's own constants
   (`uwbPl0Db(5) = 48.694`, `PL0_DB 46.7 + 30·log10 3 + 1.2 = 62.214`); the test derives it from
   those functions and pins the number to 2 decimals.
