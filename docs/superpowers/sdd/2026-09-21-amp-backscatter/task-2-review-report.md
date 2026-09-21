# Task 2 review — Channel physics for excitation PPDUs and backscattered replies

**Diff reviewed:** `4299134..f5d36e8` (review package `.superpowers/sdd/2026-09-21-amp-backscatter/task-2-review.md`)
**Files:** `src/engine/channel.ts` (+345 −46), `tests/engine/amp-bs-channel.test.ts` (new, 307 lines)
**Reviewer gates run in this worktree (tree clean at review time — no Task-3 files present):**

| Gate | Result |
|---|---|
| `npx vitest run tests/engine/amp-bs-channel.test.ts tests/engine/channel.test.ts tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts` | 4 files, **65 passed, 0 failed**, output pristine (no warnings) |
| `npx tsc -b --noEmit` | clean, exit 0 |
| `git status --porcelain` | empty — the committed diff is the whole change |

---

## Spec Compliance

**✅ Spec compliant.** Every bullet of the brief's behaviour list and every box of its test checklist is
implemented and asserted. Checked item by item:

| Brief requirement | Where | Verdict |
|---|---|---|
| `txDbmAt(frame, offsetNs)`: chargeDbm through AMP-Data, bsDbm during BST | `src/engine/channel.ts:132-136` | ✅ |
| Consumer (a) reply path uses it | `src/engine/channel.ts:417-423` (`bsFloorDbm`), `:505-511` (`fillIncidentDbm`) | ✅ |
| Consumer (b) Wi-Fi ED = max over PPDU (brief allows) | unchanged link-table path via `rxDbmOf` fall-through, `src/engine/channel.ts:400` | ✅ (see ⚠️ 1) |
| Consumer (c) Spectrum emission unchanged (2.4 GHz has none) | `src/engine/channel.ts:475-479` untouched | ✅ (see ⚠️ 2) |
| Wi-Fi radios receive an `ampRfid` exactly as a slice-1 DL AMP PPDU — *assert it* | test `tests/engine/amp-bs-channel.test.ts:102`; `decodeThreshDb` DL branch `src/engine/channel.ts:256` keeps `sinrThreshDb(6)` for `kind === 'wifi'` | ✅ |
| `'bsTag'` added to `RadioOpts.kind` / `RadioState.kind` | `src/engine/channel.ts:175`, `:186-190` | ✅ |
| bsTag RSSI via `bsPathLossDb(2440, d, walls)` at `chargeDbm` | `rxDbmOf` `src/engine/channel.ts:394-401` + `bsLossDb` `:371-383` | ✅ |
| bsTag floor `AMP_BS_ACTIVATION_DBM` | `register` `src/engine/channel.ts:324` | ✅ |
| bsTag required SINR `AMP_DL_REQ_SINR_DB` vs Wi-Fi interference | `decodeThreshDb` `src/engine/channel.ts:256` (`r.kind !== 'wifi'`) | ✅ |
| bsTag emits no CCA, can receive nothing else | `detectFloorDbm` `src/engine/channel.ts:437`; test `tests/engine/amp-bs-channel.test.ts:147` | ✅ |
| Reply `rxDbm = incidentDbm − AMP_BS_LOSS_DB − bsPathLossDb(tag→AP)` | `rxDbmOf` `src/engine/channel.ts:396-400` | ✅ |
| `incidentDbm` fallback to "the last DL PPDU's bsDbm" | `fillIncidentDbm` `src/engine/channel.ts:505-511` — reads the excitation actually in flight, a strict improvement on the brief's `??` | ✅ |
| Only `ampCapable` receives the reply | `detectFloorDbm` `src/engine/channel.ts:438` | ✅ |
| Reply floor `readerFloorDbm(monoLeakDbm(bsDbm))`; required SINR `AMP_BS_REQ_SNR_DB[kbps]` against that floor **plus Wi-Fi interference** | `bsFloorDbm` `:417-423`, `noiseFloorMw` `:427-431`, `interferenceMw` `:697-712`, `decodeThreshDb` `:254` | ✅ implemented (see Minor 6 — untested) |
| Other Wi-Fi radios see the reply as energy only, never above −62 dBm | test `tests/engine/amp-bs-channel.test.ts:263` | ✅ |
| Capture between two replies: the existing 5 dB rule | `CAPTURE_MARGIN_DB` untouched; `captureWindowNs` `src/engine/channel.ts:222-224` states the reply's sync explicitly at the same numeric value | ✅ |
| Receive window gated on `kind === 'ampBsReply'` ∧ the AP's own `ampRfid` BST window | `listening` `src/engine/channel.ts:450-453`, `bstOpenAt` `:350-357` | ✅ (see Important 2) |
| `phy.ts` untouched | not in the diff | ✅ |
| Commit message verbatim | `f5d36e8` | ✅ |

**Test checklist — all eight boxes present and non-vacuous:** per-instant power
(`tests/engine/amp-bs-channel.test.ts:87`); activation at 0.30 / 0.35 m against
`activationReachM(10) = 0.3092` (`:117`); RN16 heard at 0.30 and not 0.35 m, with the exact 0.327 / 0.328 m
boundary at 250 kb/s (`:188`, `:193`); 0.231 / 0.233 m at 1 Mb/s (`:199`); both boundaries unchanged over
`bsDbm ∈ {0, 10, 20}` (`:206`); two tags colliding and a 6 dB-louder one surviving (`:240`); a Wi-Fi station
busy from 0 to `txTimeNs` with cause `preamble` (`:102`); a reply inaudible at 1 m and *audible* at 3 cm
(`:263`); an Active Tx scene unchanged (`:290`).

**Controller rulings — all three implemented cleanly:**

1. **Early resolution at the end of AMP-Data.** `startTx` schedules `endAmpData` only when
   `bsDataEndNs(frame) !== null` (`src/engine/channel.ts:494`), and `endAmpData`
   (`src/engine/channel.ts:621-627`) resolves `r.kind === 'bsTag'` locks only, with no CCA re-evaluation
   (correct — nothing joined or left the air). The `resolveLock` extraction (`:631-646`) is
   behaviour-identical to the block it replaced in `endTx`: the old `if (lockIdx < 0) continue` becomes
   `return`, and the call is the last statement of the `endTx` loop body, so control flow matches exactly.
   The `if (!this.active.includes(tx)) return` guard is sound because `endTx` filters `active` before
   resolving and `dataEnd < txTimeNs` always.
2. **Reply acquired at `AMP_BS_REQ_SNR_DB`, not the 4 dB preamble gate.** `detectThreshDb`
   (`src/engine/channel.ts:247-250`) is per-frame and returns `PREAMBLE_DETECT_SINR_DB` for everything else.
3. **The reader floor replaces thermal noise for a reply.** `noiseFloorMw` (`:427-431`) branches on
   `frame.kind === 'ampBsReply'` only; every other frame keeps `noiseDbm(ampNoiseBwMhz(frame))` verbatim,
   and `acquireLock` (`:583`) seeds `maxInterfMw` from `interferenceMw`, so a reply's lock starts against
   the reader floor rather than thermal.

**Boundary arithmetic against `ampBs.ts`'s helpers (constraint 4), checked by hand:**
`ampRfidBytes('query') = 5 + 3 + 2 = 10`; `ampBitsNs(80, 250) = 320 000 ns`; so
`bsDataEndNs = 32 000 + 1 000 000 + 16 000 + 320 000 = 1 368 000 ns`.
`bstNs('rn16', 250) = max(16 000, round(1.2·16 000 + 1.1·112 000)) = 142 400 ns`, and
`1 368 000 + 142 400 + 6 000 = 1 516 400 = txTimeNs` — the spec's pinned Query airtime. `txDbmAt` flips at
exactly `bsDataEndNs` (`< dataEnd` → charge), which the test brackets at `DATA_END_NS − 1` / `DATA_END_NS`
(`tests/engine/amp-bs-channel.test.ts:91-93`). The signal extension radiates `bsDbm`; the spec is silent on
it and the doc comment tags the choice `(model)`.

**Byte-identical existing behaviour (constraint 3) — verified by reading, not only by the fixtures:**

- `rxDbmOf` (`src/engine/channel.ts:394-401`) falls through to `linkDbm` unless the frame is an
  `ampBsReply`, or an `ampRfid` at a `bsTag` receiver. Both are new-in-this-slice constructs, so all five
  converted call sites (`applyPendingStarts:519`, `othersMw:682`, `interferenceMw:705`, `overlappersOf:722`,
  `updateAllCca:738`) return exactly what they returned before for every pre-existing frame.
- `detectFloorDbm`'s three original lines are unchanged and still last (`:439-441`); the two new branches key
  on `r.kind === 'bsTag'` and `frame.kind === 'ampBsReply'`.
- `decodeThreshDb`'s `r.kind === 'tag'` → `r.kind !== 'wifi'` (`:256`) is a no-op while only `'wifi'` and
  `'tag'` exist.
- `captureWindowNs`'s two new branches (`:219-224`) key on `frame.kind`, so `ampTrigger`/`ampResp` still take
  the old `amp.dir` branches; the `ampBsReply` value is numerically what the `dir === 'ul'` branch produced.
- `listening()` is `!r.transmitting` for every frame that is not an `ampBsReply`.
- **Event-queue ordering:** the only new `q.schedule` (`:494`) is guarded by `bsDataEndNs(frame) !== null`,
  so no pre-existing scene gains an event or shifts an insertion sequence number. That is what makes the hash
  fixtures a real check here rather than a lucky one.
- `tests/fixtures/lesson-hashes.json` and `tests/fixtures/uwb-record-hashes.json` are absent from the diff,
  and both suites pass in this worktree.
- **Named risk checked outside the diff — memoised path loss vs. node mobility.** `bsLossDb` caches per
  ordered pair on the comment "nodes do not move during a run". I grepped `src/engine` and `src/model` for
  mobility (`mobility|speedMps|moveTo|walkM|.pos =`): no hits, positions are static scenario data. The memo
  is safe.
- **Named risk checked outside the diff — the new 6th constructor argument at call sites.** The only
  production construction is `src/engine/simulation.ts:177` with five arguments; the rest are tests. Nothing
  existing can reach `bsLossDb`'s throw (see ⚠️ 3).

### ⚠️ Cannot verify from this diff

1. **Wi-Fi energy detection reads the link table — the AP's *Wi-Fi* EIRP, which has no relation to
   `chargeDbm`/`bsDbm`.** The brief explicitly allows "max over the PPDU as today", and slice 1 has the same
   decoupling, so this is compliant. But the controller should decide in Task 3 whether the AP's configured
   `txDbm` tracks `chargeDbm` or whether the two powers stay permanently independent: a lesson that says "the
   reader turns up to 20 dBm" while Wi-Fi neighbours keep deferring at the old level is a stated-vs-simulated
   drift waiting to happen.
2. **`tx.emission.eirpDbm = sp.txPowerOf(nodeId)`** (`src/engine/channel.ts:477`) would be the wrong power
   for an `ampRfid` if a 2.4 GHz link ever carried a `ChannelSpectrum` hook. Unreachable today (the spectrum
   hook is the UWB coexistence path at 6–8 GHz) and the brief says "no change" — noted only because it is the
   one place the two-power model is not applied.
3. **`bsGeometry` is unwired:** `src/engine/simulation.ts:177` still constructs `new Channel(...)` with five
   arguments, so the API shape cannot be validated against real wiring until Task 3. The "throws loudly" path
   (`src/engine/channel.ts:376`) **cannot fire in an existing scenario**: I traced every route into
   `bsLossDb` — `rxDbmOf`'s two new branches and the public `bsRxDbm` — and all three require an
   `ampBsReply` frame, an `ampRfid` frame at a `bsTag` radio, or an explicit call, none of which any
   pre-slice scenario can produce.

---

## Strengths

- **The boundaries are pinned against `ampBs.ts`'s closed forms, not against recorded output.** Every reach
  test asserts `monoReachM`/`activationReachM` first and then puts the channel either side of it to the
  millimetre (`tests/engine/amp-bs-channel.test.ts:193-204`). The `bsDbm ∈ {0, 10, 20}` loop (`:206-213`)
  turns the spec's headline teaching point — the floor rises with the excitation, so reach is independent of
  it — into an executable claim instead of a comment.
- **Negative assertions are made to bite.** The −62 dBm test re-runs the identical reply at 3 cm and asserts
  it *does* hold CCA busy (`:298-301`); the window test brackets both sides and `dataEnd − 1` (`:223-238`);
  the Active Tx regression asserts the DL lock still resolves at `trigger.txTimeNs` (`:305`), which is
  precisely what `endAmpData` could have broken.
- **The link table is deliberately poisoned where the backscatter law must win:** `'tag>sta': -20`
  (`:269`) proves the reply's power is not being read out of the link table.
- **`rxDbmOf` as the single answer to "what does this PPDU deliver here"** is the right refactor: it collapses
  five duplicated `linkDbm` sites into one policy point, and it is what turns the existing-behaviour argument
  above into a one-line proof instead of a five-way audit.
- **`bstOpenAt` as a question the MAC asks the medium** (rather than the MAC telling the medium when its own
  excitation is open) is the correct direction of dependency, and the reader's floor is computed from the
  same object, so the window and the floor cannot disagree.
- The self-review section of the report is accurate: the two corrected comments
  (`src/engine/channel.ts:241-246`, `:651-655`) and the `v3` module-header paragraph (`:9-12`) are all real.
- The RED evidence is specific (11 of 14 failing, with the three vacuous passes named and explained) and the
  single corrected expectation is disclosed with its magnitude and its direction of causation. That is the
  disclosure a reviewer wants.

---

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

**1. `bsDataEndNs` re-derives `ampBsDlPpduNs`'s internal composition, and `captureWindowNs` copies its prefix
a third time — three places that must silently stay in lockstep.**

- `src/engine/channel.ts:119-120` — `AMP_LEGACY_PREAMBLE_NS + r.wupNs + AMP_BS_DL_SYNC_NS + ampBitsNs(ampRfidBytes(r.cmd) * 8, AMP_BS_DL_KBPS)`
- `src/engine/ampBs.ts:195-196` — `ampBsDlPpduNs` builds the same four terms and adds `bstNs + signalExtNs`
- `src/engine/channel.ts:220-221` — `captureWindowNs` builds the first three terms again

Verbatim duplication of a logic block across two modules with nothing tying them together. If the DL PPDU
ever gains a field (an AMP-SIG for a future mode, a padding field, a second DL rate), `ampBsDlPpduNs` grows
and `bsDataEndNs` silently points into the middle of the command instead of at its end — and the failure mode
is not a type error but a tag decoding a truncated command, or a BST window offset by a field width. The
`txTimeNs` the frame carries and the `bsDataEndNs` the channel computes are two independent derivations of
one timeline.

*Fix:* export the prefix once from `ampBs.ts`, e.g. `export function ampBsDataEndNs(cmd: Gen2Cmd, wupNs: Ns): Ns`
returning the four terms; then `ampBsDlPpduNs = ampBsDataEndNs(cmd, wupNs) + bstNs + signalExtNs`, and
`channel.ts`'s `bsDataEndNs(frame)` becomes `ampBsDataEndNs(r.cmd, r.wupNs)`. Give `captureWindowNs` a
`ampBsSyncEndNs(wupNs)` from the same place. The existing assertion
`expect(f.txTimeNs - SIGNAL_EXT_NS - DATA_END_NS).toBe(142_400)`
(`tests/engine/amp-bs-channel.test.ts:96`) then becomes structural rather than merely asserted. This also
resolves most of the file-growth question (see Minor 10).

**2. An `ampCapable` AP that is *not* transmitting will decode an `ampBsReply` against thermal noise — the
BST window is enforced only as a side effect of half-duplex.**

`src/engine/channel.ts:450-453` (`listening`) closes the window *only while the radio is transmitting*; when
the AP is idle it returns `true` unconditionally. `detectFloorDbm` (`:438`) then returns
`bsFloorDbm(rid, frame)`, which with no excitation in flight falls through to `noiseDbm(ampNoiseBwMhz(frame))`
≈ −111 dBm (`:417-423`), and `detectThreshDb` asks for only 3 dB against it. A reply arriving while the reader
is idle is therefore received with roughly 40 dB more link budget than physics allows — a reflection of a
carrier that is not on the air.

Today the hole is closed only by an unrelated mechanism: `fillIncidentDbm` leaves `incidentDbm` undefined
when no reader PPDU is in flight, and `rxDbmOf` then returns −200 dBm (`:396-399`), below the thermal floor.
That is a residual guard, not a gate — and Task 3 is being handed `bsRxDbm()` expressly so it can pre-set
`incidentDbm` itself (report, hand-off 2), at which point `fillIncidentDbm`'s "keep what the frame states"
rule (`:507`) lets a mistimed reply straight through. The exception the brief asked to be narrowly scoped is
narrow in the transmitting case and absent in the idle case.

*Fix (one line, making the gate positive rather than residual):* in `detectFloorDbm`,
`if (frame.kind === 'ampBsReply') return r.ampCapable && this.bstOpenAt(rid, this.now()) ? this.bsFloorDbm(rid, frame) : null`
— or equivalently stop `listening` short-circuiting on `!r.transmitting` for `ampBsReply` frames, so the BST
test always decides. Extend the existing window test (`tests/engine/amp-bs-channel.test.ts:223`) with a reply
starting after `f.txTimeNs` and carrying a pre-set `incidentDbm`: that is the case that slips through today.

### Minor (Nice to Have)

**3. `src/engine/channel.ts:280-287` — the constructor now takes six positional parameters, two of them
optional hooks.** `tests/engine/amp-bs-channel.test.ts:40` already has to write
`new Channel(q, () => now, table, emit, undefined, geo)`. A seventh will be worse: the same spec queues an
energizer (A3) and a bistatic geometry (A4). Consider folding `spectrum` and `bsGeometry` into one optional
`opts: { spectrum?: ChannelSpectrum; bsGeometry?: BsGeometry }` before Task 3 wires
`src/engine/simulation.ts:177`, while there is exactly one production call site to change. The shape of
`BsGeometry` itself (`{ posOf, walls }`, mirroring `ChannelSpectrum`) is right for Task 3.

**4. `tests/engine/amp-bs-channel.test.ts:173-186` — the `round()` helper drives replies from tags that
could not have been powered.** At the default `chargeDbm` 10, `activationReachM(10) = 0.309 m`, so the tags
at 0.327 / 0.328 / 0.35 m in the reply-boundary tests are outside activation: the helper schedules the reply
unconditionally rather than letting the tag decide. That is the right isolation for a channel unit test (the
channel does not gate replies on activation and should not), but nothing says so, and a later reader can
conclude that 0.327 m is an achievable reply distance in a real scene when activation is in fact the binding
constraint at 10 dBm. One comment line in `round()` fixes it — and it is worth saying explicitly in the
lesson later, since it is a genuinely interesting result.

**5. `tests/engine/amp-bs-channel.test.ts:240` — the test name "a 6 dB louder one is captured" describes the
opposite of what happens.** No capture occurs: the louder reply is detected first (same-instant batch sorted
by power, `src/engine/channel.ts:519-521`), and the quieter one *fails* the 5 dB capture test and becomes
interference. Rename to e.g. "a 6 dB louder one survives the other", so the record of what the capture model
did stays accurate.

**6. No test pins the brief's "required SINR … against that floor **plus Wi-Fi interference in band**".**
The code is right — `interferenceMw` (`src/engine/channel.ts:697-712`) seeds the sum with `noiseFloorMw` and
adds every other active transmission through `rxDbmOf` — but the spec's Coexistence paragraph makes this the
entire point of the `none` CTS variant, and it is the assertion that would catch a future refactor making the
reader floor *replace* the interference sum rather than seed it. One test: a Wi-Fi STA transmitting across
the BST window kills an otherwise-decodable reply at 0.3 m and is named in the `COLLISION` record. This is
the highest-value gap in an otherwise thorough file.

**7. `src/engine/channel.ts:234-236` — `ampNoiseBwMhz` gives an `ampBsReply` the *Active Tx* UL bandwidth**
(`AMP_UL_BW_MHZ`, 2 MHz at 250 kb/s), although the backscatter chip rate is half the Active Tx one
(`AMP_BS_UL_CHIP_NS` 2000 ns vs `AMP_UL_CHIP_NS` 1000 ns at the same 250 kb/s). Harmless in this slice — the
reader's leakage floor replaces thermal noise for every reply a mono-static reader hears — but it goes live
for the bistatic receiver of A4, which `bsFloorDbm`'s own comment says will fall back to thermal. Either give
`ampNoiseBwMhz` an `ampBsReply` branch or tag the reuse, so A4 does not inherit a 3 dB error silently.

**8. `src/engine/channel.ts:249` and `:223` — `AMP_BS_REQ_SNR_DB[… as AmpBsUlKbps]` and
`AMP_BS_UL_CHIP_NS[… as AmpBsUlKbps]` fail silently off the typed path.** `frame.amp.kbps` is `number` and
`AmpUlKbps` admits 4000; a 4000 kb/s reply would yield `undefined` (SINR comparison false — never detected,
no error) and `NaN` (capture window). `ampBsReplyFrame`'s signature closes this today, so it is defensive
only, but these two casts are the file's only unchecked narrowings.

**9. `src/engine/channel.ts:505-511` — `fillIncidentDbm` mutates the caller's frame inside `startTx`, and the
side effect is documented on the helper but not on `startTx`.** It is correct as written: the mutation
precedes the `TX_START` emit at `:482`, so the record and the frame agree (I checked the order explicitly).
Worth one line in `startTx`'s comment, because "the medium writes on the frame you hand it" is surprising,
and because a frame object reused across two rounds would keep a stale `incidentDbm` under the
"keep what the frame states" rule.

**10. Structure — `channel.ts` is now 770 lines (+345 from this task). I do not recommend a new module, but I
do recommend moving the two pure functions out.** The backscatter code splits cleanly into (a) two pure
functions of a frame — `bsDataEndNs` and `txDbmAt` (`src/engine/channel.ts:116-136`) — which touch no channel
state and belong in `ampBs.ts` beside `ampBsDlPpduNs` (this is also the fix for Important 1), and (b) the
rest — `bsLossDb`, `rxDbmOf`, `bsFloorDbm`, `noiseFloorMw`, `listening`, `bstOpenAt`, `currentTx`,
`fillIncidentDbm`, `endAmpData` — which is genuinely interwoven with `active`, `radios` and `now()` and would
only become a module at the price of a circular dependency or a wide parameter-passing surface. Readability
is not harmed as it stands: the file still has one responsibility, the new code is grouped, and every branch
is commented with why it exists. Move (a); leave (b).

**11. `src/engine/channel.ts:439-441` — an Active Tx `'tag'` radio still decodes an `ampRfid` PPDU** (the
implementer's own hand-off 3, confirmed): the `frame.amp?.dir === 'dl'` branch does not discriminate, so an
Active Tx tag takes an EPC Gen2 command at −72 dBm under the Wi-Fi law and emits a spurious
`RX_START`/`RX_OK` pair into the timeline. Not reachable in this slice's scenarios, but `AmpTagCfg.mode` is
*per tag* in the spec's node configuration, so a mixed scene is expressible the moment Task 3 lands. The
guard is one clause — `if (r.kind === 'tag' && frame.kind === 'ampRfid') return null` — and belongs either
here or in Task 3's MAC. Flagged so the controller picks one, rather than letting it fall between two tasks.

---

## Answer to the controller's open question

**Neither is a correctness problem for the scenarios this slice runs, and the start-instant gate is provably
sufficient rather than merely adequate.**

*The reply gated only at its start.* The whole reply is inside the window by construction: it begins at
`dataEnd + T1` and lasts `T4`, while `bstNs(reply, kbps) = max(16 µs, 1.2·T1 + 1.1·T4)`
(`src/engine/ampBs.ts:177-184`), so it ends at `dataEnd + T1 + T4 ≤ dataEnd + 1.2·T1 + 1.1·T4 = dataEnd + bstNs`,
with `0.2·T1 + 0.1·T4` of slack. The delayed (Write) form is the same argument with `1.1·T3 + 1 µs + 1.1·T4`
against `T3 + T4`. The implementer's stated concern — a hand-written `bstNs` too short for the reply it is
sized for — is a scenario-authoring error rather than a physics gap, and the one-line change in Important 2
would catch it as a side benefit. The real asymmetry is the opposite one: the window is not enforced **at
all** when the reader is idle (Important 2).

*An Active Tx `'tag'` radio receiving an `ampRfid`.* Not a problem for this slice (no scenario mixes tag
modes), and the leak is confined to spurious `RX_START`/`RX_OK` records at the Active Tx tag — its MAC would
see a frame kind it does not handle, and it has `cca: false` so carrier sense is unaffected. Everything else
about a mixed active/backscatter plan behaves sensibly: a `bsTag` refuses an `ampTrigger`, another tag's
reply and a CTS (asserted, `tests/engine/amp-bs-channel.test.ts:147`); an Active Tx `ampResp` arriving inside
a reader's BST window is correctly refused by `listening` because it is not an `ampBsReply`; and the two
laws stay separated — an `ampRfid` at a `'tag'` radio keeps slice 1's link-table path while the same PPDU at
a `'bsTag'` takes Friis. So: sensible in every direction except the one-clause guard in Minor 11, which
should land before any mixed scene ships.

---

## Assessment

**Spec compliance:** ✅ Spec compliant — 3 ⚠️ items for the controller, all about Task 3's wiring or
explicitly allowed by the brief.

**Task quality:** Needs changes — 0 Critical, 2 Important, 9 Minor.

**Reasoning:** The physics, the pinned boundaries and the existing-behaviour isolation are right, and the
test file checks the channel against `ampBs.ts`'s closed forms rather than against recorded output, so
nothing that ships in this slice is wrong. The two Important findings are both local and small: one timeline
formula duplicated across three places that must stay in lockstep with nothing enforcing it, and a receive
gate that is closed by a −200 dBm fallback rather than by the BST window it claims to enforce — the latter
matters now because Task 3 is being handed the API that opens it.
