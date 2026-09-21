# Task 3 review — the inventory round, the backscatter tag, records, view, log, inspector, decoder

**Diff under review:** `500c4e1..70f44de` (one commit, 19 files, +1638 / −30), read in full from
`.superpowers/sdd/2026-09-21-amp-backscatter/task-3-review.md` in seven passes.
**Brief:** `task-3-brief.md` · **Report:** `task-3-report.md` · **Spec:** `docs/superpowers/specs/2026-09-21-amp-backscatter-energy-design.md`
("The inventory round", "Tag behaviour", "Coexistence").

## Gates I ran

| Gate | Result |
|---|---|
| `npx vitest run tests/engine/amp-reader.test.ts tests/engine/amp-bs-sta.test.ts tests/model tests/ui tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts` | **27 files, 398 tests, 0 failed**, output pristine — no warnings, no stderr noise |
| `npx tsc -b --noEmit` | exit 0, no output |
| `git show --stat 70f44de \| grep fixtures` | no match: `tests/fixtures/lesson-hashes.json` and `tests/fixtures/uwb-record-hashes.json` are not in the commit (constraint 3 ✅) |

Nothing failed in `src/course/**`, `tests/course/**` or `src/ui/CoursePanel.tsx`, so the concurrent
course implementer's work did not enter this run either way.

## Spec Compliance

### ✅ Spec compliant, with two documented deviations the controller has already ruled on

Brief file list, checked hunk by hunk:

| Brief file | Diff | Note |
|---|---|---|
| `src/engine/ampReader.ts` (new) | ✅ 297 lines | `AmpInventoryRound`, deps shape = `AmpApDeps` + `bstEnergy()` |
| `src/engine/ampBsSta.ts` (new) | ✅ 241 lines | `AmpBsStaMac implements PhyListener` |
| `src/engine/mac.ts` | ✅ | `ampTiers`, `ampBsTagIds`, `pickAmpRound()`, `ampActive`, routing, resumption |
| `src/engine/simulation.ts` | ✅ | `isBsTag`, `bsGeometry`, `AmpBsStaMac`, `bsTags`, `ampTiers`/`ampBsTagIds` |
| `src/model/records.ts` | ✅ | five records + `MacStateName 'bsWait'` |
| `src/model/view.ts` | ✅ | `AmpBsTagView`, `AmpInventoryView`, five reducer cases |
| `src/ui/format.ts` | ✅ | five log lines + `decodeFrame` rows for both kinds |
| `src/ui/Inspector.tsx` | ✅ | tag rows, reader row, `bsWait` badge |
| `src/ui/FrameDetail.tsx` + `src/model/frameFields.ts` | **not touched** — justified and verified | Task 1 already built both: field rows at `src/model/frameFields.ts:318` (`case 'ampRfid'`) / `:343` (`case 'ampBsReply'`), and exactly **one** PPDU strip at `src/model/frameFields.ts:430` (`if (a.rfid)`). Constraint 7 (restyled, not duplicated — one layout) ✅ |
| `src/ui/laneLayout.ts` | ✅ | `bsWait → 'slot'` at `:79`, three-way tooltip at `:380` |
| `src/scene/effects.ts` | **not touched** — justified and verified | already `ampRfid: 0x2dd4bf` / `ampBsReply: 0xa78bfa` at `src/scene/effects.ts:45-46`; the new colour this task owed (`bsWait` halo) went to `src/scene/nodes.ts:31-34` instead, which is the correct file for a MAC-state halo |
| `src/ui/i18n.ts` | ✅ | 11 inspector keys + 2 tooltip keys, EN **and** ZH (`:551`ff / `:1082`ff) |
| tests: amp-reader, amp-bs-sta, view +1, format +1, frameFields +1, lanes +1 | ✅ (view +2, format +2) | plus `tests/engine/amp-bs-helpers.ts`, a shared scene builder |

Controller rulings, all four implemented **and** documented in code:

- **(a) strict alternation** — `src/engine/mac.ts:264-268` (`pickAmpRound`, four lines), documented
  at `:255-263`; pinned by `tests/engine/amp-reader.test.ts` "alternates strictly…", which asserts
  `polls[i] === (i % 2 === 0 ? 'active' : 'inventory')` over ≥ 4 polls.
- **(b) unpowered at every DL PPDU end unless the next arrives within T2 + 8 µs** —
  `src/engine/ampBsSta.ts:52` (`AMP_BS_POWER_HOLD_NS`, tagged `model`, with the reasoning and the
  explicit "deliberately *not* the CTS Duration"); armed at `:86-90`, pinned by two tests
  ("falls unpowered when the carrier stops…", "stays powered across a whole TXOP").
- **(c) an out-of-range tag emits no `AMP_BS_BOOT`** — implemented by the channel's floor
  (`src/engine/channel.ts:460` returns `r.floorDbm` for a bsTag only on `ampRfid`, and
  `:347` defaults that floor to `AMP_BS_ACTIVATION_DBM`), documented at length on the record type
  in `src/model/records.ts` (`AMP_BS_BOOT`), pinned at both levels (bench + `Simulation`).
- **(d) `bstEnergy()` in mac.ts from the public channel API** — `src/engine/mac.ts:243`, one
  expression inside the deps literal, documented at `:86-92` (`ampBsTagIds`) and on
  `AmpReaderDeps` in `src/engine/ampReader.ts:36-44`. **Readable — but see Important #1 for its
  correctness, which the ruling asked me to judge.**

Constraint 2, the pinned numbers — every one asserted non-vacuously:

| Pin | Where | Verdict |
|---|---|---|
| RN16 at AMP-Data end + 16 µs = PPDU start + 1 368 000 + 16 000 | `amp-reader.test.ts` "runs Query → RN16 → ACK → EPC → Read": `expect(rn16.t - query.t).toBe(1_368_000 + AMP_BS_T1_NS)` | ✅ exact |
| 3 commands / 3 697 200 ns per 4 ms TXOP, next TXOP resumes with QueryRep + same session | same file, "a 4 ms TXOP stops before the command that would overrun": `['query','ack','read']`, `txopNs === 3_697_200`, `second.cmd === 'queryRep'`, `second.session === first.session`, `second.slot === 2`, and the resumed PPDU carries the WUP again | ✅ exact |
| Q = 0 with two tags: every round collides | "Q = 0 with two tags": over > 4 inventories, `read === []`, `collisions === 1`, `slotsOffered === 1`, `complete === true`, both tags draw 0, both reply, no `ack` is ever sent | ✅ exact |
| Write's 2 ms T3 | "Write answers after its 2 ms T3": PPDU 2 963 800 ns, `bstNs` 2 429 800, reply at `dataEnd + AMP_BS_WRITE_T3_NS`, and the reader really decodes it | ✅ exact |
| Sessions clear inventoried flags every `pollIntervalMs` | "a new session every pollIntervalMs…": ≥ 3 distinct sessions, and a counter drawn at `q.t + 1_368_000` in each of the first three | ✅ |
| A Wi-Fi station on 2.4 GHz defers for every RFID PPDU | "a Wi-Fi station on 2.4 GHz defers…": for each non-straddled PPDU the camera has an `RX_START` **and** starts nothing inside the PPDU; `acquired > ppdus.length / 2` guards against a vacuous loop | ✅ non-vacuous |
| Counters replayed from the tags' RNG streams | "Q = 2 with four tags": each tag draws exactly once, and the counter histogram is cross-checked against the reader's `read`/`collisions`/`empties` (`read + collisions + empties === 4`) | ⚠️ **partial** — see Minor #4: the drawn values are read out of the records, never predicted from an independently constructed `Rng` stream |

Constraint 4 — every record and `bsWait` reaches the reducer (`src/model/view.ts:597-632`), the log
formatter (`src/ui/format.ts:64-74`), the inspector (`src/ui/Inspector.tsx:57-70`, `:95-97`), the
lane layout (`src/ui/laneLayout.ts:79`, `:380-387`) and the scene colours
(`src/scene/nodes.ts:31-34`, `src/ui/TimelineStrip.tsx:BS_SLOT_COLOR`), EN + ZH for every new
string. The reducer stays derivable from records alone — I read all five cases; none reads a clock,
a config or engine state, and `tests/model/view.test.ts` "live and replayed views agree over a whole
backscatter inventory" pins snapshot/replay equivalence over a real multi-TXOP inventory. ✅

Constraint 5 — determinism: `grep` for `Math.random` / `Date.now` / `new Date` over
`ampReader.ts`, `ampBsSta.ts`, `view.ts` is empty; the RN16 stream is `rng.fork(0x524e)` and
`Rng.fork` provably does not advance its parent (`src/engine/rng.ts:33-37`), so the slot-counter
stream replays independently. The round holds no module-level mutable state (only `BROADCAST` and
`RN16_STREAM`, both `const`), and `session`/`remaining`/`slot` live on the instance, which is what
makes it re-entrant across TXOPs.

Constraint 3 — the Active Tx path: I read the mac.ts hook diff line by line for ordering changes.
The only substantive rewrite is `this.ampRound` → `this.ampNext` in `transmitFor`
(`src/engine/mac.ts:552-558`); `ampNext` and `ampPending` are set and cleared in the same two
places (`:274-280`, `:552-556`), so for an Active-Tx-only AP the predicate is identical. Every other
change is `this.ampRound?.active` → `this.ampActive`, which for that AP is the same boolean. The
constructor's guard widened from `if (this.ampRound)` to `if (this.ampRound || this.ampInventory)`,
and `ampTiers ?? { active: true, backscatter: false }` keeps every pre-existing scenario on the old
path. `tests/engine/amp-reader.test.ts` "replays byte-for-byte with the backscatter tier in the
build" plus the untouched fixtures back this up. ✅

### ⚠️ Cannot verify from the diff — for the controller

- **The spec's `Coexistence` `none` variant is now contradicted by the engine.** Deviation 2 is
  accepted as a model result and is pinned twice (end to end in `amp-reader.test.ts` "protection
  none with a saturated station…", and at the channel in `amp-bs-sta.test.ts` "a Wi-Fi frame across
  the BST-Excitation destroys the reflection"). What the diff cannot settle is the spec text itself
  — `docs/…-energy-design.md` "Coexistence" still says "the `none` variant shows Wi-Fi landing
  inside a BST-Excitation and the reply lost". The spec line and the Task 4/5 lesson copy need the
  ruling the implementer asked for.
- **An inventory that resumes does not consume an alternation turn.** `onAmpDone`
  (`src/engine/mac.ts:291-294`) re-arms `ampPending`/`ampNext` for the inventory without going
  through `pickAmpRound()`, so with both tiers and a small `txopMs` several inventory TXOPs can run
  between two polls. This is the intended resumption rule and the alternation test still passes
  (it counts `query` records, and a resumed TXOP opens with `queryRep`), but "strict alternation"
  in the lesson should be worded as *polls* alternate, not *TXOPs*.

## Strengths

- **The prose in `ampBsSta.ts:1-14` and `ampReader.ts:1-16` is the best kind of comment**: it says
  what the class *cannot* do (no clock, no oscillator, no carrier sense) and derives the design from
  that. Every `model` choice carries a source tag, and the two files name SFD MM-10 / MM-29 / FM-44
  / PM-75 and TGbp 11-25/0061r0 / 11-26/0120r0 without reproducing a word of draft text (constraint 1).
- **The power-hold timer** (`ampBsSta.ts:86-90`, `:247-258`) is the cleanest possible reading of
  ruling (b): one timer, cancelled on the next `onRxStart`, with the counter and the session flag
  deliberately *not* cleared, and a comment saying why each survives.
- **The TXOP budget split** (`ampReader.ts:185-192`) — a command that would have opened a slot is
  put back, one owed *inside* a slot is dropped "because the tag's handle only lives as long as the
  carrier that lit it" — is exactly the right physical reading, and the `progressed` loop guard
  (`:95`, `:113-115`) stops a too-short TXOP repeating forever. That guard is the kind of thing that
  is usually found in production, not in review.
- **The tests are real end-to-end runs**, not mocks: `amp-reader.test.ts` drives `Simulation` on
  `bsScenario()`, `amp-bs-sta.test.ts` drives a bare `Channel` with hand-built PPDUs so the tag's own
  rules are isolated, and `frameFields.test.ts` decodes **every** frame a live inventory emits
  (all five commands, all four replies, asserted by set equality) and checks byte sums and PPDU
  segment sums against `frame.bytes` / `frame.txTimeNs`.
- **The two-stream RNG** (node stream for the slot counter, `fork(0x524e)` for the RN16) so a
  scene's counters replay without modelling how many RN16s were drawn in between — a small idea with
  a large payoff for the lesson's reproducibility.
- **The self-review findings are genuine**, not decoration: replacing `instanceof` with an identity
  check and correcting the `collisions` doc comment are both real quality fixes.
- **`initViewState` only creates `amp.bs` for a backscatter tag**, so an Active Tx lane's view object
  is byte-identical — the cheapest possible way to satisfy constraint 3 in the view.

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

**1. `src/engine/mac.ts:243` — `bstEnergy()` ignores the reader's own floor, so a booted-but-unheard
tag is reported as a collision. This breaks the spec's "Reader at 20 dBm" lesson variant.**

```ts
bstEnergy: () => (cfg.ampBsTagIds ?? []).some((id) => ch.currentTx(id) !== null),
```

This is true whenever *any* backscatter tag has a transmission in flight, at *any* power. A real
reader's energy detector sits on the same self-leakage floor as its demodulator: a reflection below
that floor is not energy it can measure. The arithmetic, using only constants the task's own tests
already assert:

- Reader floor = `readerFloorDbm(monoLeakDbm(0))` = 0 − 20 (`AMP_BS_ISOLATION_DB`) − 50
  (`AMP_BS_READER_DR_DB`) = **−70 dBm**, and a 250 kb/s reply must clear it by
  `AMP_BS_REQ_SNR_DB[250]` = 3 dB, so ≥ **−67 dBm**.
- At `chargeDbm = 20` (the spec's variant) activation reach is 0.978 m, so a tag at **0.5 m boots
  and answers**. Its reply at the reader is `0 − 2 × (40.196 + 20·log10 0.5) − 6` = **−74.4 dBm** —
  7 dB below the floor, undetectable.
- `bstEnergy()` nevertheless returns `true`, so `ampReader.ts:229` counts that slot as a
  **collision** rather than a slot the reader could not hear.

The spec names this exact case — *"Reader at 20 dBm charge (activation 97.8 cm but the reply floor
unchanged: the far tags boot and are not heard)"* — so the lesson variant Task 4 will build reports
the wrong outcome for every far tag. It matters beyond that variant too: `collisions` is the number
the whole Q-tuning lesson turns on.

**Fix (still inside the accepted public-API approach, no `channel.ts` change):** give the MAC the
same test the channel uses, per tag id —
`ch.bsRxDbm(id, nodeId, ch.bsRxDbm(nodeId, id, bsDbm) - AMP_BS_LOSS_DB) - readerFloorDbm(monoLeakDbm(bsDbm)) >= AMP_BS_REQ_SNR_DB[ulKbps]`
— and count only tags that both are transmitting and clear that margin. (`bsRxDbm`, `currentTx` and
the `ampBs` helpers are all already public; the `onRxMiss` carry would supersede this later.)
Then add the missing test below.

**2. `src/engine/ampReader.ts:185-192` + `:225-232` — a slot cut at the TXOP boundary after its RN16
resolves as neither read, collision nor empty, and the tag is lost for the whole session.**

When the budget check drops an owed ACK (`if (!c.opensSlot) this.queued = []`), the slot has already
been counted in `txopSlots` (`:197`), but `txopRead` / `txopCollisions` / `txopEmpties` never get it:
the `'rn16'` branch queued an ACK instead of tallying. So `read.length + collisions + empties <
slotsOffered` for that TXOP, silently, and because the tag set `counter = null` when it answered
(`ampBsSta.ts:222`) it never answers again under that session — it is simply missing from the
inventory with no record saying so.

This is not hypothetical: the implementer hit it (report, GREEN note 2) and changed the four-tag test
to `read: false` so the invariant would hold, rather than fixing or documenting the hole. The
`AMP_INVENTORY` doc comment in `records.ts` states the per-TXOP semantics carefully but says nothing
about slots that resolve into neither column — and Task 4/5 will quote these tallies.

**Fix:** either tally the abandoned slot when `queued` is flushed (a `collisions++`, or a new
`incomplete` count), or re-offer it by decrementing `this.slot` / incrementing `this.remaining` so the
next TXOP retries it. At minimum, document the hole on the `AMP_INVENTORY` type so the lesson does
not assert an invariant that does not hold.

### Minor (Nice to Have)

**3. `src/engine/mac.ts:1296` — `onRxFail()` fires on every corrupt reception during an inventory,
not only inside a BST window.** `this.ampInventory?.onRxFail()` is unconditional in `onRxCorrupt`,
and the round sets `lastAnswered = true` whenever `running` (`ampReader.ts:294-296`). A Wi-Fi frame
corrupted in one of the 16 µs T2 gaps therefore turns an empty slot into a "collision". The window is
small and Deviation 2's finding makes it rare, but the fix is one condition: gate on
`this.ch.bstOpenAt(this.nodeId, this.now())` (already public, used by the channel at `channel.ts:373`)
or on the corrupt frame's kind.

**4. `tests/engine/amp-reader.test.ts` "Q = 2 with four tags" — the counters are never checked
against an independently derived stream.** The test reads the drawn values out of `AMP_BS_COUNTER`
and cross-checks the histogram against the reader's tallies. That cross-check is strong and worth
keeping, but the brief asked for a replay "from the tags' RNG streams", which would catch a change in
how `simulation.ts` forks a tag's stream. Add one assertion:
`expect(draws[0].counter).toBe(new Rng(sc.seed).fork(hashStr('tag-1#2g')).int(3))` (matching the
`root.fork(hashStr(vid))` wiring at `simulation.ts:196-200`).

**5. No test covers "inside activation range, outside reply range".** The suite pins 0.30 m (boots and
is heard) and 0.35 m (does not boot at all), but never the middle case that exists whenever
`chargeDbm > 10` — which is exactly the case Important #1 gets wrong. Add one: `chargeDbm: 20`, a tag
at 0.5 m, assert `AMP_BS_BOOT powered: true`, `AMP_BS_REPLY` emitted, no `RX_OK` of kind
`ampBsReply` at the reader, and the slot counted as an empty (once #1 is fixed).

**6. `src/engine/ampReader.ts:130` — `this.session = (this.session % 255) + 1` carries an untagged
magic number** (constraint 1: every new constant tagged with its source). Gen2's own session numbers
are S0–S3, so 255 is clearly a model choice for a rolling inventory id; say so in a comment, or
name it `const SESSION_MODULUS = 255 // model`. Same for `BROADCAST = '*tags'` at `:62` — a sentinel,
not physics, but an untagged literal in a file where everything else is sourced.

**7. `src/engine/ampBsSta.ts:89` — an unpowered but in-range tag flickers into `rx` for every command
it cannot use.** `onRxStart` sets `rx` before `onRxOk` discovers there is no WUP to boot on, so the
lane shows a violet `rx` span for a tag that is, by the model, not thinking at all. Cosmetic, but the
lane is a teaching surface: consider staying `idle` until the PPDU resolves, or setting `rx` only
when `powered`.

**8. `src/model/view.ts:624-631` — `inventory.read/collisions/empties` only move at TXOP end.** The
`AMP_INVENTORY` record is the sole source, so the inspector's reader row reads `0 / 0 / 0` for the
whole 4 ms TXOP and then jumps. Deriving them live from `AMP_RFID` + `AMP_BS_REPLY` would keep the
row honest; it stays record-derivable either way. Worth a decision before Task 4 builds the lesson
around that row.

## Assessment

**Spec compliance: ✅ Spec compliant** (two deviations, both the controller's accepted rulings; one
⚠️ carry: the spec's `Coexistence` `none` sentence and the Task 4/5 copy now need the ruling).

**Task quality: Needs fixes** — 0 Critical, 2 Important, 6 Minor.

**Reasoning:** The round, the tag and the wiring are well-built, genuinely well-documented and
pinned by real end-to-end tests, and the byte-identical Active Tx guarantee holds under inspection
as well as under the fixtures. Two things keep it from Approved: the reader's energy detector has
no floor, which mis-reports the spec's own "Reader at 20 dBm" variant as collisions, and a slot cut
at a TXOP boundary vanishes from the tallies that the lesson is going to quote. Both are small,
local fixes inside the approach the controller already accepted.
