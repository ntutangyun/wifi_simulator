# T3 — one-to-many MMS rounds with per-receiver fragment capture

Plan: `docs/superpowers/plans/2026-09-22-uwb-completion.md`, Decision 4.
Branch `feat/uwb-ranging`, worktree `.claude/worktrees/feat-link-2g`, on top of 255f459.

## Slot order and its source

The corpus at `D:\ai_patent_experiments\.claude\skills\wifi_patent_skill\references\uwb_tg4ab`
**does** carry the one-to-many message set, in the same contribution the pairwise cycle is
already cited from: **4ab draft 15-22/0381r5, Table 1.6.3.1**. It defines

- `POLL (One-to-many)` = 0x10, whose MessageControl 0x10 content is
  `{Number of Responders[1], SlotsPerResponder[1], List of Responder Address[3]}`
  (0x20 is the same with explicit `StartSlotIndex` / `EndSlotIndex` per responder),
- `RESP (One-to-many)` = 0x11,
- `REPORT (from responder in one-to-many ranging)` = 0x12, carrying its `ReplyTime`,
- `REPORT (from initiator in one-to-many ranging)` = 0x13, carrying its `TurnAroundTime`.

So the following are **cited**: one broadcast POLL naming the responders; a slot allocation
*per responder*; and a report from each end, each carrying the single time its own sender
measured. What the draft does **not** fix (in this corpus) is the interleave of the fragments
inside one millisecond of the ranging phase — that order is tagged **model** in `mmsLayout`,
`README.md` and the editor hint: the initiator's fragment first, then the responders' in
responder order.

Resulting round, for R responders (R = 1 reproduces the pairwise round exactly):

| phase | slots |
| --- | --- |
| control | 2 (POLL) + 2 per responder (RESP) |
| ranging | `max(20, (R+1)·(X + …))` — R + 1 slots to a millisecond |
| report | 2 per responder (its own) + 2 per responder (the initiator's answer to it) |

R = 1 → 4 + 20 + 4 = 28 slots, fragment slots 4/5, report slots 24/26: byte-identical.

## Files changed

Engine / model

- `src/uwb/mms.ts` — `mmsLayout(phy, responders = 1)`; `MmsLayout` gains `responders`,
  `respSlot(k)`, `fragmentSlot(..., responder)`, `slotFragment` returns the responder, and
  `reportSlot(side, responder)`. `controlSlots` / `reportSlots` widened from the literal `4`.
  `rmarkerFromFragment` gains an optional `gapRctu` (default `MS_RCTU`).
- `src/uwb/phy.ts` — `MmsRoundShape` + `mmsResponders(mms, anchors)`, the one place the
  responder count is decided; `uwbSlotsPerTag` and `uwbSlotFitNs` take it;
  `uwbNbSlotFitNs(responders)` now sizes the *longest* narrowband message of the round.
- `src/uwb/session.ts` — `MmsRoundPlan` gains `oneToMany` and `fragGapNs`; `mmsSlotAction`
  dispatches per-responder RESP, fragment and report slots.
- `src/uwb/network.ts` — a one-to-many block runs one round per tag with the whole anchor list
  as `roundAnchors`; the block-fit rule follows.
- `src/uwb/device.mms.ts` — the round state is now per peer (`MmsPeerState`: primed, fragments,
  RMARKER, ratio, integrity) with one shared `txRmarker`, because the initiator transmits one
  train and receives N. Broadcast POLL and train for the initiator; per-responder RESP, ranging
  and report slots; `solveMmsFix` solves at the end of a one-to-many round instead of at the
  block's last pair round.
- `src/uwb/frames.ts` / `src/uwb/nb.ts` — `UWB_BROADCAST`, `makeNbPollOtm`, `makeNbResp(…, slot,
  otm)`, `makeNbReport(…, otm)`, the four one-to-many message ids, `NB_ADDR_BYTES`,
  `NB_OTM_POLL_BYTES`, `nbOtmPollBytes(R)`.
- `src/uwb/channel.ts` / `src/engine/spectrum.ts` — per-receiver, per-fragment capture (below).
- `src/uwb/records.ts` — `UWB_MMS_TRAIN.responders?: string[]`.
- `src/model/scenario.ts` — `UwbMmsCfg.oneToMany: boolean`, default `false` in
  `DEFAULT_UWB_MMS` **and** in the zod schema (`z.boolean().default(false)`), so a plan saved
  before the switch parses; block-fit and narrowband-window rules generalised.

UI / docs

- `src/uwb/view.ts` (`UwbTrainView.responders`), `src/uwb/format.ts` (` · responders a, b, c`),
  `src/uwb/frameFields.ts` + `src/model/frameFields.ts` + `src/ui/i18n.ts` (a `nbResponders`
  row decoding the POLL's responder list, and the four one-to-many message names).
- `src/uwb/ui/UwbSessionFields.tsx` — the checkbox, and the derived round line now measures the
  round this scenario would really run (`mmsResponders(mms, anchors)`).
- `src/ui/i18n.ts` — `uwbOneToMany` / `uwbOneToManyHint`, EN + ZH.
- `src/editor/EditorGuide.tsx` — one entry each in the EN and ZH MMS sections.
- `README.md` — two rows in the 4ab table (the round, and per-receiver fragment capture) and the
  "pairwise only" known-simplification bullet rewritten.

Tests

- `tests/uwb/mms-one-to-many.test.ts` (new, 15 cases).
- `tests/uwb/nb.test.ts`, `tests/course/uwb-nba.test.ts`, `tests/model/uwb-scenario.test.ts` —
  three assertions that pinned an exact literal set (`NB_MSG_ID`, the default `mms` object, the
  narrowband-fit message) widened to admit the new members. No fixture file touched.

## How capture scoping works

`rxScopeOf(frame)` returns the single receiver a transmission competes at: `frame.dst` for an
**MMS fragment** that is not a broadcast, and `null` for everything else (every 4z frame, every
narrowband message, every broadcast train). It is carried on the `Arrival`/`Reception` and
declared on `Emission.rxId`. In `startRx`, two open receptions contend only when `competes()`
holds — both unscoped or both scoped to this receiver.

Why it is needed: in a one-to-many round the R responder trains are all unicast to the
initiator and are on the air in the same milliseconds. At the initiator they *do* compete (the
5 dB rule decides); at responder j, which is accumulating the initiator's broadcast train,
responder k's fragment is not something its radio was decoding and must not doom the train it
is building.

The rule is per reception, and an MMS fragment *is* one reception, so it is applied per
fragment: a receiver keeps whichever train is strongest in each millisecond rather than
deciding once. A fragment that lost to a train leading it by `UWB_CAPTURE_DB` now reports
`RX_FAIL reason: 'capture'`; a mutual loss stays `'collision'`. Only MMS fragments ever get the
new reason, so the 4z contention path (`UWB_CONTEND_COLLISION` keys on `'collision'`) and every
existing fixture are untouched. `Spectrum.foreignMw` deliberately ignores `rxId`: foreign power
is power wherever it lands, and scoping it would have quietly changed the coexistence lesson.

## The bug this task uncovered (and fixed)

`mmsLayout`'s "a millisecond is two slots" is only true at the draft's 600 RSTU slot. A
one-to-many round makes a millisecond R + 1 slots, so at 600 RSTU with three responders the
fragments are really **2 ms** apart. The receiver was still dividing the measured span by
`MS_RCTU`, read a clock ratio of ~2, and produced ranges of −37 km. Fixed by carrying the
round's real spacing on the plan (`MmsRoundPlan.fragGapNs = (R + 1) · slotNs`) and measuring the
clock ratio, the drift re-spacing and the RMARKER walk-back over *that*. At R = 1 and 600 RSTU
it is exactly `MS_NS` / `MS_RCTU`, so nothing pairwise moves.

## Gates

- `npx tsc -b --noEmit --force` — clean.
- `npx vitest run` — 134 files, 2276 tests, all green (including both hash suites, run
  **without** `UPDATE_HASHES`).
- `git status` — `tests/fixtures/*.json` unmodified.

## Concerns / carry list for T4 and the reviewer

1. **Three responders is the cap at the draft's 600 RSTU slot.** The POLL grows by three octets
   per responder and must fit its two-slot window; at 600 RSTU that allows R ≤ 3. Four anchors
   need a longer slot (the schema and `UwbNetwork` both say so, with the numbers). T4's
   one-to-many lesson scenes must be built with this in mind — the four-anchor ring the pairwise
   lessons use will be refused as-is.
2. ~~**The stretched millisecond is honest but not ideal.** … a scene that wants a true
   millisecond needs `slotRstu = 1 ms / (R + 1)` — 300 RSTU at R = 3.~~
   **Corrected in fix round 1 (review I1): that recipe is unreachable and must not be followed.**
   An MMS slot must be a multiple of 300 RSTU *and* two of them must hold the 608.2 µs REPORT, so
   **600 RSTU is the shortest legal MMS slot**. A true millisecond between fragments therefore
   exists only in the pairwise round it was designed for: R = 2 would need 400 RSTU (not a
   multiple of 300) and R = 3 would need 300 RSTU (refused by the schema, already pinned by
   `tests/model/uwb-scenario.test.ts`). A one-to-many round's fragments are always *more* than a
   millisecond apart, the ruler is simply longer, and `fragGapNs` is what every receiver measures
   its clock ratio and RMARKER walk-back over. Nothing needs to be configured to make this right;
   it needs to be **said**, and now is — README, both EditorGuide entries, the editor hint,
   `MmsRoundPlan.fragGapNs` and `rmarkerFromFragment`. (A fragment still spends one millisecond's
   37 nJ, so a stretched round is under its duty budget, never over.)
3. **One-to-many is not wired into any lesson scene** — that is T4 by design, and no fixture key
   moves in this commit.
4. **Stale README bullet from T2, not touched here**: "MMS (P802.15.4ab) does **not** model
   SNR-dependent timestamp precision …" is now false (T2 made the train's stamp scale with the
   combined SNR). Out of T3's scope; flagging it for the whole-branch review.
5. The one-to-many responder list is the session's anchors in scenario order — never negotiated,
   and there is no ADV-POLL/ADV-RESP handshake. Stated in the README's simplifications.

---

# Fix round 1 (review `task-3-review.md`, on top of c73953d)

All nine findings addressed; none declined. `src/course` and `tests/course` untouched — no pin
broke.

**I1 — the "true millisecond" recipe is unreachable.** Carry note 2 above is struck through and
corrected. The same correction now appears in `README.md` (the one-to-many row says in bold that
the fragments are more than a millisecond apart *at every slot the schema allows*, and why
600 RSTU is the floor), in both EditorGuide entries (EN + ZH), in `uwbOneToManyHint` (EN + ZH),
in `MmsRoundPlan.fragGapNs` and in `rmarkerFromFragment`'s `gapRctu` doc.

**M2 — `uwbNbSlotFitNs` understated a one-responder one-to-many POLL.** The guard now takes the
round's shape, not just a count: `uwbNbSlotFitNs(mms?: MmsRoundShape, responders = 1)` sizes the
one-to-many POLL whenever `mms.oneToMany`, at any R. Callers in `network.ts` and `scenario.ts`
pass it. Pinned: `uwbNbSlotFitNs(otm, 1) === 736_200` against `608_200` for the pair round, and
the R = 3 / R = 4 straddle of the 600 RSTU window.

**M3 — pairwise at a non-600 slot.** New pin: a pairwise round at `slotRstu = 1200` has
`fragGapNs = 2 ms`, recovers the analytic clock ratio `((1 + tagPpm)/(1 + ancPpm) − 1)` to inside
4 σ of `ratioSigma` over the train's real span, and ranges to < 30 cm. The report's original
"nothing pairwise moves" was true only at 600 RSTU — at every other slot the pairwise path was
carrying the *same* bug the one-to-many round exposed, and `fragGapNs` fixes it there too. No
shipped scene uses another slot, so no fixture moves.

**M4 — the rationale overstated the overlap.** `rxScopeOf`, the capture comment, the
`device.mms.ts` header and the README capture row now say plainly that every device owns its own
slot inside a millisecond, that a fragment (≤ 82 µs) never overlaps another in any scheduled
round at the shortest legal slot (250 µs), and that the scope and the per-fragment rule are
cheap defence against a tighter layout — reached from the unit harness, not from any scene.

**M5 — the field was plumbed and not rendered.** `uwbRespondersText(u, S, name)` in
`src/uwb/ui/rows.ts`, rendered by `UwbInspector` as a "one-to-many" line beside the narrowband
channel, with `responders` / `respondersHint` / `respondersOf` in EN and ZH. One line rather than
a seventh column: every train of one round carries the same list. Pinned on the tag *and* on an
anchor, and pinned null in a pair round.

**M6 — MessageControl.** `NB_OTM_POLL_BYTES` now cites "message 0x10 at MessageControl 0x10 — or
at 0x30 / 0x40, which carry the same content and are the variants where both ends report, which
is what this engine's default `report: 'bi'` does".

**M7 — a responder accepting frames from a non-peer.** `onMmsRx` now returns early at a responder
unless `from === r.tagId`, so no bogus peer state can be opened and `anyPrimed` cannot be talked
into authorising a train. The listen windows already made it unreachable; the guard removes the
dependency on that invariant.

**M8 — stale `'capture'`.** `Reception.capturedBy` records the captor, and `endRx` settles the
reason: a capture whose captor was itself spoiled inside the margin is reported `'collision'`,
because nothing was decoded in that millisecond. Pinned with a three-way overlap
(near captures far; mid then collides with near; all three report `'collision'`).

**M9 — `UWB_BROADCAST` untagged.** Now tagged **model**, with what it stands for (802.15.4 would
carry a broadcast short address) and why the decoder reads the leading `*`.

Gates: `npx tsc -b --noEmit` clean; `npx vitest run` 136 files / 2350 tests green, including both
hash suites run **without** `UPDATE_HASHES`; `tests/fixtures/*.json` unmodified.

Still open, unchanged by this round: the three-responder cap at 600 RSTU (real, refused readably,
and what T4's scenes were built against).
