# T3 review — one-to-many MMS rounds with per-receiver fragment capture (44c0282)

Reviewed against `docs/superpowers/plans/2026-09-22-uwb-completion.md` (Binding constraints,
Decision 4, task line T3), the implementer's `task-3-report.md` and the full diff
(`task-3-review.diff`, 23 files).

Gates re-run in the worktree:

- `npx vitest run tests/uwb` — 18 files, 324 tests, green (incl. the new
  `tests/uwb/mms-one-to-many.test.ts`, 15 cases).
- `npx tsc -b --noEmit` — clean, exit 0.
- Probe run (vite-node, scratchpad): the schema accepts a one-to-many round of 1–3 responders at
  600 RSTU and refuses 4 with
  `two 600 RSTU slots are 1000.0 µs, but a narrowband message of a round with 4 responders needs
  1024.2 µs plus flight`, and 5 likewise — the cap the report claims is real and the message is
  honest and readable.

**Verdict: NEEDS FIXES — 1 Important, 7 Minor.** The engine work is sound: the slot algebra
reduces exactly to the pairwise round at R = 1, the `fragGapNs` bug the task uncovered is fixed
consistently in all three places that need it, per-peer state means each responder's `UWB_RANGE`
carries its own stamps and its own combined-SNR σ, and no new nondeterminism was introduced.
What needs fixing is documentation that points a user (and T4) at a configuration the schema can
never accept, plus a set of smaller inaccuracies and one dead field.

---

## What was verified as correct

**1. Pairwise byte-identity.** `mmsLayout(phy, 1)` gives control 4 / rp 20 / report 4, fragment
slots 4 and 5, report slots 24 and 26, 28 slots total (`src/uwb/mms.ts:283-336`, pinned in
`tests/uwb/mms-one-to-many.test.ts` §4). `mmsSlotAction` reduces to the old literal slot tests,
RNG draws are in the same order (one `gaussian` for the first stamp, one more only at heard ≥ 2 —
`src/uwb/device.mms.ts:437-458`), `UWB_MMS_TRAIN` omits `responders` unless `oneToMany`
(`device.mms.ts:466`), the REPORT message ids only change under `otm`
(`src/uwb/frames.ts:371-380`), and the zod default keeps old plans parsing
(`src/model/scenario.ts:545`). Scenes the fixtures do not cover were checked by hand:
X = 0 (`slotFragment` skips the `ms < x` branch and the RIF branch generalises, `mms.ts:315-326`),
NB failures (nothing in the LBT/discontinuation path changed), and other `slotRstu` values (see
Minor 3 — a real, deliberate change).

**2. Per-receiver capture.** `Emission.rxId` is set only for a non-broadcast MMS fragment
(`src/uwb/channel.ts:123-126`, `311`), `competes()` gates the capture loop per receiver
(`channel.ts:130-133`, `389`), the 5 dB rule is applied per reception and an MMS fragment is one
reception, so it is applied per fragment; `doomed` bookkeeping is unchanged, only `failReason` is
new, and only an MMS frame can ever carry `'capture'` (`channel.ts:393-401`) so the 4z contention
path (`UWB_CONTEND_COLLISION`, which keys on `'collision'`) is untouched. `Spectrum.foreignMw`
deliberately ignores `rxId` (`src/engine/spectrum.ts:136-147`) — no double counting, and the
coexistence lesson's numbers are unaffected. The "train addressed to one receiver must not fail at
another" case is tested at one receiver with two overlapping trains
(`mms-one-to-many.test.ts`, "captures the weaker train…" and "does not let a train addressed to one
receiver doom another receiver's train").

**3. Round shape vs the cited contribution.** Checked against the corpus extract of
15-22/0381r5 in the scratchpad: `POLL (One-to-many) 0x10` with MessageControl 0x10 content
`{Number of Responders[1], SlotsPerResponder[1], List of Responder Address[3]}`,
`RESP (One-to-many) 0x11`, `REPORT (from responder…) 0x12`, `REPORT (from initiator…) 0x13`.
`NB_MSG_ID`, `NB_ADDR_BYTES = 3` and `NB_OTM_POLL_BYTES = 2` all match, the interleave is tagged
**model** in `mmsLayout`, the README row, the i18n hint and both EditorGuide entries, and nothing
of the draft's wording is pasted anywhere — the prose is original throughout.

**4. Per-responder ranging.** `MmsPeerState` is per peer; σ_ts is drawn from *that peer's*
combined train (`rxDbm + gainDb` of `p.frags`, `device.mms.ts:443`), the round trip is
`counterDiff(p.rxRmarker, m.txRmarker)` against the one shared `txRmarker`
(`device.mms.ts:319-321`, `526`), and the ratio fallback is per peer. Each responder's
`UWB_RANGE` is its own, not the first responder's.

**5. `fragGapNs`.** Used by the clock ratio (`device.mms.ts:449`), the drift re-spacing of
arrivals (`device.mms.ts:362`) and the RMARKER walk-back (`device.mms.ts:458` →
`rmarkerFromFragment(…, gapRctu)`, `mms.ts:136-141`). `(R+1)·slotNs` is 1 000 000 ns at R = 1 /
600 RSTU, so the pairwise fixtures do not move; the test pins 2 000 000 ns at R = 3.

**6. Determinism.** No `Math.random`/`Date.now`; the only `Map` iteration over `m.peers` is
`anyPrimed()` returning a boolean (`device.mms.ts:132-135`). Train evaluation walks
`peers.anchors` — scenario order — not the Map (`device.mms.ts:395-411`), and `blockRanges` is
filled in report-slot order. Per-node order is stable.

**7. i18n.** `uwbOneToMany` / `uwbOneToManyHint` EN and ZH carry the same content (citation,
one-train-heard-by-all, per-responder windows, "one slot per device rather than two", default off,
interleave = model). The two EditorGuide entries likewise. `nbResponders` row name EN + ZH.

---

## Important (fix before merge)

**I1. The "true millisecond" recipe is unreachable at every legal slot, and the carry list hands
T4 a configuration the schema always refuses.**
`README.md:136` — "a true millisecond only when the slot is 1 ms / (R + 1)" — and
`task-3-report.md` concern 2 — "A scene that wants a true millisecond needs `slotRstu = 1 ms / (R
+ 1)` — 300 RSTU at R = 3".
An MMS slot must be a multiple of 300 RSTU (`src/model/scenario.ts:692`), and at 300 RSTU the two
slots a narrowband window gets are 500 µs against the 608.2 µs REPORT, which the schema refuses
(`scenario.ts:304-313`; already pinned by `tests/model/uwb-scenario.test.ts:410`). So **600 RSTU is
the shortest legal MMS slot**, and a one-to-many round can never space its fragments a true
millisecond apart: R = 1 needs 600 (pairwise only), R = 2 would need 400 RSTU (not a multiple of
300) and R = 3 would need 300 RSTU (refused). The sentence is literally true but reads as an
achievable setting, and T4 is explicitly told to build scenes with it.
Fix: say in the README row (and, if it is worth a sentence, in the EditorGuide entries that
already explain the 2 ms) that at any legal slot a one-to-many round's fragments are *more* than a
millisecond apart — the ruler is longer, which is why the engine measures it — and correct carry
note 2 in `task-3-report.md` before T4 reads it.

---

## Minor

**M2. `uwbNbSlotFitNs` understates the POLL when a one-to-many round has exactly one responder.**
`src/uwb/phy.ts:411` — `responders > 1 ? nbOtmPollBytes(responders) : 0`. A one-to-many round with
one anchor still sends a 17-octet one-to-many POLL (736.2 µs), but the guard measures the round
against the 13-octet REPORT (608.2 µs). Probe output: `R=1 fit=608200 actualPollNs=736200`.
Unreachable through the schema today (the smallest legal slot, 600 RSTU, gives 1000 µs and covers
both), but the guard exists precisely so a frame cannot outlive its window, and `UwbNetwork` is
also constructed directly. The signature cannot distinguish "pairwise, 1 responder" from
"one-to-many, 1 responder"; pass the flag, or take the whole `MmsRoundShape`.

**M3. Pairwise is byte-identical only at 600 RSTU — nothing pins the other slots.**
`src/uwb/session.ts:97` — `fragGapNs = (R+1)·slotNs`. At the *default* session slot
(`DEFAULT_UWB_SESSION.slotRstu = 2400`) a pairwise round now measures its ratio over 4 ms where it
used to divide by `MS_RCTU` (probe: `pairwise fragGap 2400: 4000000`). This is a genuine fix — the
old reading produced a ratio of ≈ 4 and nonsense ranges, the same bug the task found for
one-to-many — but it contradicts "nothing pairwise moves" in the report, and no fixture or test
covers it (all three shipped MMS scenes use 600 RSTU: `src/course/uwb/uwb-mms.ts:82`,
`src/course/uwb/uwb-nba.ts:81`). Worth one assertion in `mms-one-to-many.test.ts` §4 pinning a
pairwise round at a non-600 slot, and a line in the commit/report saying the pairwise path was
fixed too.

**M4. The rationale for the scope overstates what actually overlaps.**
`src/uwb/channel.ts:115-122`, `src/uwb/device.mms.ts:5-12`, `README.md:137` all say the responders'
trains "are on the air in the same milliseconds" and compete at the initiator. In this engine's
interleave every device owns its own slot inside the millisecond (`mmsLayout`'s `perMs`), a
fragment is ≤ 82 µs and the shortest legal slot is 250 µs — so **two MMS fragments never overlap in
time in any scheduled round**, and the per-receiver capture path is reachable only from the unit
harness. The scoping is correct and cheap defence, but the prose should say it guards a case the
slot grid already keeps apart rather than describing it as the mode's mechanism.

**M5. `UwbTrainView.responders` is plumbed into `ViewState` and never rendered.**
`src/uwb/view.ts:76` and `view.ts:265`; `src/uwb/ui/rows.ts:115-122` builds the train rows and
ignores the field. The timeline line (`src/uwb/format.ts:97`) is the only surface that shows the
responder list. Either add it to the inspector's train row (the T3 checklist asks for it) or drop
the field. Per-responder *ranges* do show, because the range rows are already per peer.

**M6. MessageControl 0x10 is cited while the default report mode is "both report".**
`src/uwb/nb.ts:66-69` tags `NB_OTM_POLL_BYTES` as "0x10, MessageControl 0x10". In the cited table
MessageControl 0x10 is the variant where only the responder reports; both-ends-report is 0x30/0x40
(same content). The session default is `report: 'bi'`, and the engine does emit both 0x12 and
0x13. One clause in the tag ("0x30/0x40 when both ends report, same content") keeps the citation
exact.

**M7. `onMmsRx` accepts fragments and RESPs from devices that are not this device's peer.**
`src/uwb/device.mms.ts:352-368` — a responder's `index` is its own slot index, so any frame from
any round member lands in `peerState(m, …, from, index)`: a responder overhearing another
responder's RESP would set `primed` on a bogus peer and let `anyPrimed()` (`device.mms.ts:300`)
authorise its own train even though it never answered the POLL. It is unreachable today only
because `UwbDevice.listening()` is true only inside a listen window (`src/uwb/device.ts:426`) and a
responder opens no window in another responder's slots. A two-line guard — at a responder, accept
only `from === peers.tag` — removes the dependency on that invariant.

**M8. Three-way capture keeps a stale `'capture'` reason.**
`src/uwb/channel.ts:393-401` — if A captures B (B → `'capture'`) and a later C then collides with A
inside the margin, B stays `'capture'` although nothing was decoded in that millisecond. Cosmetic,
log-only, and rare; noting it so the reason is understood as "lost to a stronger reception at the
time it started".

**M9. `UWB_BROADCAST` carries no provenance tag.** `src/uwb/frames.ts:131` — every other constant
in these files is tagged standard / draft / model; this one is a model addressing convention and
should say so.

---

## Checklist answers

| asked | answer |
| --- | --- |
| pairwise path byte-identical | yes at 600 RSTU (every shipped scene); changed — and fixed — at other slots, see M3 |
| `Emission.rxId` semantics, 5 dB per fragment, `RX_FAIL 'capture'` per fragment per receiver | correct; `'capture'` already exists in `RxFailReason` and is Wi-Fi's own name for the same thing |
| no double counting in `Spectrum` energy | correct — `foreignMw` ignores `rxId` by design |
| no leak across receivers | correct, and tested |
| slot order vs 15-22/0381r5 | matches the corpus for the messages and the per-responder allocation; the interleave is tagged model in all four places |
| per-responder `UWB_RANGE`, own stamps, own combined SNR | correct |
| `fragGapNs` used by ratio, drift re-spacing, RMARKER walk-back | all three |
| `slotRstu = 1 ms/(R+1)` stated where a user finds it | stated in the README — but unreachable, see I1 |
| 3-responder cap honest, schema refuses 4 readably | yes (probe output above); message is EN-only, like every other schema message in this repo (`src/editor/planOps.ts:302` surfaces `issue.message` verbatim) — pre-existing, not a T3 regression |
| determinism | seeded streams only, per-node order independent of Map iteration |
| UI / i18n / docs EN = ZH | yes |
| every constant tagged | yes except `UWB_BROADCAST` (M9) |
| tests assert the listed behaviours | yes; the capture test does exercise two overlapping trains at one receiver, fragment by fragment |
| copyrighted standard text | none |
