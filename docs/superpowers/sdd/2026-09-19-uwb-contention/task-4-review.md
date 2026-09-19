# Task 4 review — docs for contention-based rounds

Reviewed: brief, report, and `task-4-review.diff` (commit bb2423f) against ground truth in
`src/model/scenario.ts`, `src/uwb/phy.ts`, `src/uwb/device.ts`, `src/uwb/session.ts`,
`src/uwb/frames.ts`, `src/uwb/channel.ts`, `src/uwb/ui/UwbSessionFields.tsx`.

## Drift check (all verified against the engine)

- `DEFAULT_UWB_SESSION`: `schedule: 'time', contentionSlots: 8, maxAttempts: 3` — matches the
  Guide/glossary/README's "8 slots, 3 attempts" claims (`src/model/scenario.ts:198-201`).
- `UWB_CAPTURE_DB = 6` (`src/uwb/phy.ts:71`) — matches the "6 dB capture margin" prose, and
  `src/uwb/channel.ts:257-265` confirms the weak reception is always doomed and the strong one is
  doomed too unless it leads by the margin, matching "both fail unless one leads by ... margin".
- Uniform draw over 1…S: `device.ts:370` — `slot = 1 + this.rng.int(r.plan.contentionSlots - 1)`,
  and `Rng.int(maxInclusive)` is inclusive (`src/engine/rng.ts:26`), so the range is exactly
  `[1, contentionSlots]`. Correct.
- Sit-out after `maxAttempts` unheard rounds and refill on a hit:
  `device.ts:222-224` (`attemptsLeft = heard ? maxAttempts : max(0, attemptsLeft - 1)`) and
  `device.ts:364-369` (an anchor with `attemptsLeft === 0` answers in no slot, then its budget is
  reset). Matches.
- Collisions counted at the tag: `device.ts:269-275` — `onRxFail` only emits
  `UWB_CONTEND_COLLISION` when `this.cfg.role === 'tag'`. Matches.
- Feedback model is network-mediated, not something an SS-TWR responder can see itself:
  `network.ts:134-135` computes `heard` from the tag's `endRound()` result and hands it back to
  each anchor's `endRound(heard)`. Matches the Guide/glossary/README's "the network tells the
  anchor" framing, and the `§10.32.1 NOTE` citation matches the code comment at
  `device.ts:208-210`.
- `UWB_ROUND.slots = 1 + S`: `uwbSlotsPerTag` in `src/uwb/phy.ts:195-198` returns
  `1 + contentionSlots` for `schedule === 'contention'`. Matches.
- RCPS/RCMA content sizing: `RCPS_IE_BYTES = UWB_IE_HDR_BYTES + 2`,
  `RCMA_IE_BYTES = UWB_IE_HDR_BYTES + 1` (`phy.ts:128-131`) — matches "header plus two octets" /
  "header plus one octet" in the glossary, and `frames.ts:23-58` confirms `firstSlot: 1,
  lastSlot: contentionSlots` — matches the glossary's "first slot 1, last slot 8 by the model
  default".
- IE full names (controller-confirmed): glossary text "ranging contention phase structure IE"
  and "ranging contention maximum attempts IE" match §10.32.9.5/§10.32.9.6 titles as confirmed.
- EditorGuide's placement of "Schedule" / "Response slots / Attempts" before "Block / Slot":
  looked like a mismatch against `UwbSessionCfg`'s raw field declaration order (which has
  `blockRstu`/`slotRstu` before `schedule`/`contentionSlots`/`maxAttempts`), but the actual
  rendered form order in `src/uwb/ui/UwbSessionFields.tsx` is Method → Schedule → Contention
  Slots → Max Attempts → Block → Slot → Channel — i.e. the doc correctly follows the UI's visual
  field order, not the interface's declaration order. Not a defect.

## Findings

1. **(Blocking) `src/ui/glossary.ts` — the three new terms' `alt.en` fields contain untranslated
   Chinese text, not English.** Every existing glossary entry (ARC IE, RDM IE, RRTI IE, RMI IE,
   FoM, Noise rise, …) keeps `alt.en` pure English and `alt.zh` pure Chinese. The three new
   entries break this:
   - `Contention-based ranging`: `alt.en: '竞争式测距 — schedule mode 0, §10.32.2'`
   - `RCPS IE`: `alt.en: '竞争阶段结构信息元 — ranging contention phase structure IE, §10.32.9.5'`
   - `RCMA IE`: `alt.en: '竞争最大尝试次数信息元 — ranging contention maximum attempts IE, §10.32.9.6'`

   An English-locale reader of the glossary would see Chinese characters prepended to the
   alt/summary line. A repo-wide grep for CJK inside any `alt.en` string
   (`en: '[^']*[一-鿿]`) matches only these three new lines — nowhere else in the file.
   This looks like a copy/paste slip (the `zh` clause's lead-in was pasted into `en` too). The
   added test only checks `hasCjk(item.alt.zh)` is true; it never asserts `alt.en` is CJK-free, so
   it didn't catch this. Fix: drop the leading Chinese phrase from each `alt.en`, e.g.
   `en: 'contention-based ranging — schedule mode 0, §10.32.2'`,
   `en: 'ranging contention phase structure IE, §10.32.9.5'`,
   `en: 'ranging contention maximum attempts IE, §10.32.9.6'`. The `def.en`/`def.zh` pairs for all
   three terms are correctly separated — only the `alt` fields are affected.

2. **(Nit, not blocking) README's "RCPS / RCMA IE content" row tag is compound**
   (`standard §10.32.9.5 / §10.32.9.6; content sizing model`) where the brief's shorthand names
   this row's category simply "model". The table already has precedent for compound tags (e.g.
   the CFO-tracking row), and the row body correctly explains that only the byte layout is a model
   choice while the IEs' existence/purpose is standard, so I'm not treating this as a defect —
   flagging only for awareness.

## Verification run

- `npx vitest run tests/ui/uwb-guide.test.ts` — 26/26 passed, matches the report.
- `npx tsc -b` — clean (no errors, including course files).
- No `any` or `@ts-ignore` introduced anywhere in the diff.
- ZH parity is otherwise correct: `Guide.tsx`'s new paragraph and `EditorGuide.tsx`'s new "Schedule"
  / "Response slots / Attempts" entries are properly separated EN/ZH content (only the
  `glossary.ts` `alt.en` fields in finding 1 are affected).

## Verdict

Spec: CHANGES REQUIRED
Quality: CHANGES REQUIRED

Both verdicts are driven by finding 1 (glossary `alt.en` fields contain untranslated Chinese
text for all three new terms) — a small, mechanical fix, but a real bilingual-parity defect that
ships into the EN UI as written. Everything else — the engine-fact drift check, the standard
citations, the standard/model tagging in the README (aside from the nit), the tests, `tsc -b`,
and EN/ZH parity everywhere but the glossary `alt` fields — is correct.
