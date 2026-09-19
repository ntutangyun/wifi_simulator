# Task 3 review — Wi-Fi side of the coupling

Reviewed: `d5334d4..7995c4f` (`src/engine/channel.ts`, `src/engine/simulation.ts`,
`tests/engine/channel-spectrum.test.ts`), against `task-3-brief.md`, `task-3-report.md`,
`src/engine/spectrum.ts` as reviewed, and Slice 3 of
`docs/superpowers/specs/2026-09-19-uwb-slices-design.md`. Task 4's uncommitted work was ignored.

## Verdict

- **Spec: APPROVED**
- **Quality: APPROVED**

Five findings, none blocking: four minor, one informational.

## Verification run

- `npx vitest run tests/engine/channel-spectrum.test.ts tests/engine/channel.test.ts
  tests/engine/lesson-hashes.test.ts tests/engine/simulation.test.ts` → **4 files, 29 tests, all
  passing**. `lesson-hashes` passes with the fixture untouched (`git show --stat 7995c4f` lists three
  files, none of them a fixture).
- `npx tsc -b` → two errors, both in Task 4's files and therefore out of scope:
  `src/ui/format.ts(27,41)` TS2366 and `tests/uwb/inspector-rows.test.ts(8,7)` TS2741
  (`UwbNodeView.interfered`). Nothing in Task 3's three files.
- No `any`, `@ts-ignore`, `@ts-expect-error` or `as unknown as` added. The only assertions in the
  diff are `byId.get(id)!` (`simulation.ts:245-246`) and `table.get(tx)!` in the test helper, both
  the established style in these files.

## Binding constraints — all met

| Constraint | Where | Verdict |
|---|---|---|
| Optional 5th ctor arg `{ s, posOf, txPowerOf, centerMhz, widthMhz }` | `channel.ts:55-65,190` | met — exactly those five fields, positional, optional |
| Emission on `startTx`, band = centre ± frame width/2, EIRP = node tx power | `channel.ts:247-255` | met — `ppduBand` = `centerMhz ± ampNoiseBwMhz(frame)/2`, `eirpDbm = sp.txPowerOf(nodeId)` |
| Retired with the same object on `endTx` | `channel.ts:349` via `ActiveTx.emission` (`:46`) | met — identity-matched, which is what the reviewed `Spectrum.retire` now requires |
| Foreign term in `interferenceMw`, `othersMw`, CCA energy sum, only with a spectrum | `channel.ts:439-443`, `:420-426`, `:479-487` | met — all three behind `if (sp)`; no `+ 0`, no call in the bare path |
| `onChange('wifi')` re-evaluates every open lock's max and CCA | `channel.ts:194,203-210` | met |
| Byte-identical without a spectrum | code + `channel.test.ts` + `lesson-hashes` + the diff's own no-spectrum test | met |
| `Simulation` builds the Spectrum only for `'6g'`, `sc.uwb?.channel === 5`, UWB nodes present, band overlaps, gate `Math.max(width, 160)` | `simulation.ts:140-158` | met (accepted ruling; see finding 1) |
| `this.spectrum` public readonly for Task 4 | `simulation.ts:66-70` | met — `readonly spectrum: Spectrum \| null = null`, assigned in the constructor body |

## Checks the brief asked me to make

1. **Per-lock band is the PPDU's width, not the link's widest.** Correct. `interferenceMw`
   (`channel.ts:441`) and `othersMw` (`:424`) both call `ppduBand(lock.frame | tx.frame, sp)`, which
   uses `ampNoiseBwMhz(frame)` = `frame.widthMhz ?? 20`. The link's `sp.widthMhz` is used *only* for
   the energy-detect band (`:485`), which is the right place for it. The foreign query band is
   therefore identical to the thermal-noise band the same sum already uses (`:433`) — no mismatch
   between the two terms of one SINR.
2. **Double-counting with a same-side emission.** Not possible. `Spectrum.foreignMw(target)` sums
   `live[OTHER[target]]` only (`spectrum.ts:119-122`), so a Wi-Fi query never sees the Wi-Fi
   emissions the same `Channel` registered. `Spectrum.emit`/`retire` likewise notify `OTHER[side]`
   only (`:99,:110`), so the Wi-Fi channel is never woken by its own PPDU and `onForeignChange`
   cannot re-enter from `startTx`. The diff's "no spectrum ⇒ no change" test exercises exactly this:
   in `'empty'` mode the Wi-Fi emissions *are* registered, and the record stream is still identical.
3. **`onChange` touching transmitting radios.** Safe. `startTx` clears `me.locks` before anything
   else (`channel.ts:243`), and no path adds a lock to a transmitting radio — `applyOneTx` gates both
   the capture branch and the fresh-lock branch on `!r.transmitting` (`:290,:311`), and the
   interference-only branch can only be reached with a non-empty `locks`. So `onForeignChange`'s
   inner loop is empty for a transmitter, and `updateAllCca` short-circuits it to `busy = true`
   (`:464`) exactly as before.
4. **Emission identity across start/end; abort paths.** There is no abort path. `this.active` is
   mutated in exactly two places — the push in `startTx` (`:246`) and the identity filter in `endTx`
   (`:348`) — `endTx(tx)` is unconditionally scheduled at `tx.endNs` in the same statement group
   (`:267`), and `startTx` throws on a second concurrent transmission from the same node (`:236`).
   Every emission is therefore retired exactly once with the object that was emitted. Capture, RX
   failure and `txDuringRx` all drop *locks*, never an `ActiveTx`. The `if (this.spectrum &&
   tx.emission)` guard is belt-and-braces (the two are set together) and harmless.
5. **Ordering vs the UWB side's view of a PPDU's extent.** Sound. The emission goes live at the
   instant `startTx` runs, before the `TX_START` record and before `applyPendingStarts` is scheduled,
   so the UWB-side phase-1 wake-up queued by `Spectrum.notify` is ahead of the Wi-Fi channel's own
   phase-1 propagation event; it is retired at the top of `endTx`, i.e. at `t_start + txTimeNs`. The
   emission is thus live over exactly `[t_start, t_end]` — the whole PPDU and nothing more — and the
   UWB side is woken at both edges. The foreign *max* covers the whole PPDU provided Task 4 follows
   the same max-over-time contract this side uses: sample `foreignMw` at lock time **and** on every
   `onChange`. A UWB reception that resolves at the same instant as `endTx` may see the retire land
   first, so it must not take a single reading at reception end. That is the contract
   `spectrum.ts:145-148` already documents; worth confirming explicitly in Task 4's review.

## Findings

### 1. The 160 MHz floor makes `Simulation.spectrum` non-null for links that cannot overlap — minor

`src/engine/simulation.ts:147` (`uwbBandOverlap(centerMhz, Math.max(widthMhz, 160), 5) > 0`).

The deviation from the brief is right and the ruling stands: `MAX_WIDTH.eht` is 320 and `widthOf`
caps a 6 GHz link at 320, so a flat 160 would have been a false negative. The residue is the floor
itself. With `sixGhzCenterMhz: 6185` and a 20 MHz negotiated width, the real band is 6175–6195 —
nowhere near 6240 — but `max(20, 160)` gives 6105–6265, so a `Spectrum` is constructed. It is inert
(every `foreignMw` on both sides returns 0, because both the PPDU band and the ED band use the real
`widthMhz`), but `spectrum !== null` is precisely the signal Task 4 reads to decide whether to couple
`UwbNetwork`, and it is the obvious thing for a UI or a lesson to read as "these two share spectrum".
The floor also buys nothing here: the width cannot widen at runtime. `negotiatedWidth` is a static
`min` over caps; `widthForPeer` returns it unchanged; a DL MU PPDU uses `built.width` and a TB PPDU
`trigger.ulWidthMhz`, both a `Math.min` over the invited users (`mac.ts:853`), so no PPDU is ever
wider than the `Math.max(...peers.map(negotiatedWidth))` already computed at line 145.

*What to do:* either drop the floor and gate on `widthMhz` itself — which is the physical condition
and still a superset of every configuration the brief named — or keep it and document on
`readonly spectrum` (`simulation.ts:66-70`) that non-null means "the bands *may* meet", so Task 4 and
the UI do not present it as "coupled". Not blocking: no record changes either way today.

### 2. `ppduBand` uses the receiver's noise bandwidth as the transmitter's occupied bandwidth — minor

`src/engine/channel.ts:197-201`, used for the emission at `:250`.

For the two receive-side queries (`interferenceMw:441`, `othersMw:424`) `ampNoiseBwMhz` is exactly
right, and the report's justification holds: the foreign term is integrated over the same bandwidth
as the thermal-noise term it is added to. For the *emission* at `startTx` it is a different physical
quantity. A control or management frame carries no `widthMhz` — ACK/BA (`mac.ts:1242`), RTS/CTS, and
the Trigger (`mac.ts:877`, non-HT by construction) — so `ampNoiseBwMhz` returns 20 and the frame goes
on the air as a 20 MHz emission at the channel centre rather than as a non-HT duplicate across the
operating channel. Total EIRP is preserved, and for the lesson's configuration (80 MHz at 6305, wholly
inside 6240–6739.2) the in-band power is identical, so nothing is wrong today. It bites only where
the Wi-Fi channel straddles a UWB band edge: at 320 MHz on 6305 the band is 6145–6465 and a data PPDU
delivers 70% of its EIRP into UWB channel 5, while the 20 MHz ACK that answers it delivers 100% — the
acknowledgement would interfere more than the frame it acknowledges.

*What to do:* use `frame.widthMhz ?? sp.widthMhz` for the emission band only, leaving both receive-side
queries on `ampNoiseBwMhz`; or, if the conflation is deliberate, say so in the `ppduBand` doc comment
so the next reader does not have to derive the straddling case. Minor — no behaviour changes in any
configuration the spec's Slice 3 lesson uses.

### 3. The UWB-session comment now overstates the isolation — minor

`src/engine/simulation.ts:300-304`: "A scheduled session runs beside the BSS without touching it: its
own medium, its own devices, its own event stream. Forking from `root` does not advance it, so adding
UWB nodes to a scenario leaves the Wi-Fi timeline bit-for-bit identical."

That was true before this commit and is still true whenever no mediator is built, but it is now false
for the case this whole slice exists to create: with a `Spectrum`, UWB frames raise every open Wi-Fi
lock's `maxInterfMw`, can flip an `RX_OK` to `RX_FAIL lowSinr`, and add a phase-1 notify event per UWB
emission and retire. The invariant the comment protects (the RNG fork order) is unchanged and still
worth stating; the bit-for-bit claim needs the "unless the bands meet" qualifier. The same paragraph is
the natural place to point at `this.spectrum`.

*What to do:* one sentence on the comment. Documentation only.

### 4. Energy detect integrates over the *link's* widest width, not the radio's — minor

`src/engine/channel.ts:479-487` with `ChannelSpectrum.widthMhz` (`:63-64`) set from
`Math.max(...peers.map(negotiatedWidth))` (`simulation.ts:145-147`).

Every radio on the link uses the same ED bandwidth. In a mixed-width BSS (an EHT laptop at 320 MHz and
a legacy-capped station at 80 MHz on the same 6 GHz link) the narrow station's energy sum is taken over
the wide station's channel, overstating the foreign energy it can see. The 802.11 ED rule is per 20 MHz
subchannel anyway, so this is a simplification on top of a simplification, and with a −14 dBm UWB
emitter the sum is ~20 dB under `CCA_ED_DBM` in every realistic geometry — the lesson's "CCA never sees
UWB" claim is safe either way. The choice is documented on the field.

*What to do:* nothing now. If a lesson ever mixes widths on 6 GHz, make `widthMhz` per radio (it is
already available as `negotiatedWidth(n, ap, link)` inside the `for (const n of members)` loop).

### 5. The editor's overlap readout is hard-coded to 80 MHz — informational, not this task's file

`src/editor/planOps.ts:331` (`uwbBandOverlap(centerMhz, 80, 5)`), pre-existing from Slice 3's earlier
task. The engine now gates and computes on the negotiated width; the editor reports a percentage that
assumes 80 MHz. For the lesson scenario the two agree, but a 20 MHz or 320 MHz 6 GHz link would show a
percentage the engine does not act on.

*What to do:* out of scope for Task 3 — noted so the two do not drift once a lesson shows both numbers.

## Tests

`tests/engine/channel-spectrum.test.ts` covers all four items the brief lists, plus preamble detection
(beyond the list) and the `Simulation` gate. Two things worth recording in its favour:

- Every level is derived from `uwbInBandDbm`, `uwbToWifiPathLossDb`, `noiseDbm`, `sinrThreshDb` and
  `CCA_ED_DBM` rather than written out, and the first test pins the boundary at ±0.05 dB from *both*
  sides while showing the same reception surviving against thermal noise alone. That isolates the
  foreign term to a fraction of a dB instead of asserting that a threshold was crossed.
- The `'none'` vs `'empty'` comparison is the strongest form of the byte-identical requirement: it
  compares full record streams from a run with a collision and CCA transitions, and in `'empty'` mode
  the Wi-Fi emissions are genuinely on the mediator, so it also proves the no-self-counting property.

One gap worth a line, not a change request: nothing asserts that a foreign kill is reported as
`lowSinr` *and* draws no `COLLISION` record — test 2 asserts the reason but not the absence of the
record. The comment claims it; the code supports it (`overlappersOf`/`othersMw` never add a foreign
name); an `expect(records.some(r => r.type === 'COLLISION')).toBe(false)` would pin it.
