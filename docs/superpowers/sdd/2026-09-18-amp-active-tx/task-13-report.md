# Task 13 report: Glossary, Guide, README, editor labels and lesson-1 wording

## Fix round 1 (post-review)

Coordinator findings and fixes:

1. **Important — Guide.tsx heading collision**: the new AMP section was headed "7 · Ambient power
   (802.11bp)" (EN, ~line 103) / "7 · 环境能量（802.11bp）" (ZH, ~line 229), but "7 · OFDMA
   (Wi-Fi 6)" already existed and the new section sits physically after "9 · Rates and the PHY".
   Checked every numbered heading in both `GuideEn` and `GuideZh` (1 through 9, then the new
   section) and renumbered the new heading to **"10 ·"** in both languages — now the sequence
   runs 1–10 with no collisions in either track.
2. **Minor — ZH wording collision**: "标签待发时会显示一段带标签的等待区间" repeated
   标签/带标签 awkwardly. Reworded to "标签等待时隙时会显示一段标注了时隙号的等待区间。"
3. **Minor — lesson-1 heading mismatch**: `src/course/amp/amp-intro.ts` line 76's table heading
   was EN "The first round on the AP's lane" vs ZH "AP 的 2.4G 泳道上的第一轮" — mismatched band
   suffix. Dropped "2.4G" from the ZH side (→ "AP 泳道上的第一轮") rather than adding "2.4 GHz" to
   EN, since the round-1 fix to `tests/course/amp-intro.test.ts`'s comment already quotes the EN
   form without a band suffix ("The first round on the AP's lane") and nearby lesson prose already
   states "2.4 GHz" explicitly in the paragraph just above the table. No further test-comment
   change was needed — it already matched.

Verification:

- `npx vitest run tests/ui tests/course/amp-intro.test.ts tests/engine/lesson-hashes.test.ts` →
  **7 files / 74 tests, all passed** (lesson-hashes fixture unchanged).
- `npx vitest run tests/course/lessons.test.ts` → **41/41 passed**, including the dynamic
  study-time-pin check for every lesson (amp-intro's study time stayed within its 15–25 minute
  range; no wording change here altered word count anyway — only a heading's band suffix and
  Guide.tsx text, which isn't part of `lessonWords`).
- `npx tsc -b` → clean, no output. No `tests/course/zzprobe.test.ts` present (nothing to ignore).
- Confirmed via `git status`/`git diff --stat` that an unrelated, concurrently-modified set of
  files (`src/course/amp/amp-coexist.ts`, `tests/course/amp-coexist.test.ts`,
  `tests/engine/amp-ap.test.ts` — presumably another agent's in-flight work) was present in the
  working tree; left untouched and unstaged, staged only `src/ui/Guide.tsx` and
  `src/course/amp/amp-intro.ts` by path for this fix commit.

Commit: `dec3a62` — `fix(docs): Guide section numbering and lesson-1 heading parity` on
`feat/amp-active-tx`, with both required attribution lines, staged by path (2 files changed,
4 insertions, 4 deletions).

## What was done (original implementation)

Note: the file at `task-13-brief.md` describes an older/short version of this task (glossary +
Guide + README + memory index). The actual instructions given to this agent (in the dispatch
message) superseded and expanded that brief — memory-note work was explicitly out of scope
("controller's job — skip it") and five additional deliverables were specified (README known-
simplifications, editor labels, lesson-1 wording, test-comment fixes). This report covers the
dispatch-message scope, which is what was implemented.

1. **`src/ui/glossary.ts`** — added a new group `id: 'amp'`, title "Ambient power (802.11bp)" /
   "环境能量（802.11bp）", with 12 items: AMP, AMP AP, Active Tx non-AP AMP STA, AMP Trigger,
   AMP Ack, ABOC, ACW, AMP SIFS, AMP-Sync / AMP-SIG, Manchester OOK, Backscatter (future),
   Energizer (future). Every numeric value (10 µs SIFS, 80 µs AMP-Sync, 64/16 µs AMP-SIG,
   48/12/6 µs UL sync, −72 dBm sensitivity, ACWE/ACW defaults) was cross-checked against
   `src/engine/amp.ts` constants and the spec doc's Part B tables. Model-only values are called
   out as such ("model" / "模型取值").

2. **`src/ui/Guide.tsx`** — added "7 · Ambient power (802.11bp)" to both `GuideEn` and `GuideZh`,
   4 short paragraphs each: what a tag is (no carrier sense, transmits only in an assigned slot),
   the round shape (CTS-to-self → Trigger → Ack-keyed slots), ABOC/ACW slot selection, what the
   timeline shows (teal DL frames, violet UL responses, per-slot ticks/wait spans on the AP/tag
   lanes), and a closing sentence naming the draft status and the three document numbers
   (11-24/1613r20, 11-26/1519r5, 11-26/1889r4).

3. **`README.md`**:
   - Feature bullets: mentioned "ambient power IoT" in the course-mode bullet, added AMP tag
     placement/config to the Edit-mode bullet, and AMP-specific lane/inspector behavior to the
     Simulate-mode sub-bullets.
   - Five new conformance-table rows tagged "P802.11bp draft" (with SFD/PDT document numbers):
     AMP SIFS 10 µs, AMP downlink PPDU anatomy, AMP uplink PPDU, AMP slotted random access,
     CTS-to-self round protection.
   - Three new known-simplifications bullets: Active-Tx-only (no backscatter/energizer/WPT/
     harvesting yet), the −72 dBm sensitivity and OOK SINR thresholds being model choices, and
     tags finding their slot by counting Acks in arrival order (matching the `r.acksSeen++`
     mechanism in `src/engine/ampSta.ts`, not by decoding a slot-number field) plus the TBD ABOC
     retransmission behaviour.

4. **Editor labels (`src/editor/FloorPlanEditor.tsx` + `src/ui/i18n.ts`)**:
   - Added `E.ampProtLabel: 'protection'/'保护'` and `E.ampReadLabel: 'read mode'/'读取方式'`,
     now rendered as visible labels before the `protection` and `readMode` `<select>`s (which
     previously had no label at all).
   - Added `title` hints `E.ampSlotsHint`, `E.ampDlHint`, `E.ampUlHint` (EN+ZH, one line each) and
     wired them onto the slots / DL rate / UL rate `<label>` elements.
   - Updated the `Strings` interface in `i18n.ts` to require all five new keys in both languages.

5. **Lesson-1 deferred one-liners**:
   - `tests/course/amp-intro.test.ts` line ~246: comment quoting the old table heading `"The
     first round on the AP's 2.4 GHz lane"` → corrected to the shipped heading `"The first round
     on the AP's lane"`.
   - `tests/course/amp-intro.test.ts` lines ~411–412: comment quoting superseded link-budget
     numbers (−43.9 / 28.1 / −63.9 / 30.1 dB) → replaced with the shipped numbers
     (−37.4 / 34.6 / −57.4 / 36.6 dB), matching the assertions a few lines below and the lesson
     body text (which already had the correct numbers).
   - `src/course/amp/amp-intro.ts`: "Every AMP frame in this slice is unprotected, so every one
     pads 20 µs." → "Every **downlink** AMP frame in this slice is unprotected, so every one pads
     20 µs." (ZH: inserted "下行" the same way: "本切片里的下行 AMP 帧全部是非保护帧…").
   - `src/course/amp/amp-intro.ts`: aligned the EN opening sentence "It follows the TGbp
     Specification Framework…" with the ZH "本模块依据…三份文件建模" → "This module is modelled
     on the TGbp Specification Framework…".
   - Ran `amp-intro.test.ts` and `lessons.test.ts` (which include the lesson's dynamic
     study-time-pin check, `lessonMinutes` computed from `lessonWords`) — both green; the small
     wording changes did not cross a 5-minute rounding boundary.

Memory-note work (task item 6 in the dispatch message) was explicitly skipped per instruction —
that's the controller's job.

## Commands and output

- `npx vitest run` — **75 test files / 744 tests, all passed** (40.4 s), including
  `tests/engine/lesson-hashes.test.ts` (hash fixture unchanged) and the full
  `tests/course/amp-intro.test.ts` / `tests/course/lessons.test.ts` suites.
- `npx tsc -b` — clean, no output, exit 0.
- `npm run build` — succeeded (`tsc -b && vite build`); only pre-existing chunk-size warning,
  unrelated to this change.

## Files changed

- `README.md`
- `src/course/amp/amp-intro.ts`
- `src/editor/FloorPlanEditor.tsx`
- `src/ui/Guide.tsx`
- `src/ui/glossary.ts`
- `src/ui/i18n.ts`
- `tests/course/amp-intro.test.ts`

Commit: `d895af9` — `docs(amp): glossary, guide section, README rows, editor labels and lesson-1
wording` on branch `feat/amp-active-tx`, with both required attribution lines.

## Self-review

- **Both languages everywhere**: every new glossary item, every new Guide paragraph, every new
  editor label/hint, and every new README-adjacent lesson-text edit has an EN and a ZH side;
  verified by reading both `GuideEn`/`GuideZh` diffs and both EN/ZH blocks in `i18n.ts` and
  `glossary.ts` side by side.
- **Glossary values vs `src/engine/amp.ts`**: cross-checked AMP_SIFS_NS (10 000 ns), AMP_DL_SYNC_NS
  (80 000 ns → 80 µs AMP-Sync), AMP_DL_SIG_BYTES (2 octets → 64/16 µs AMP-SIG at 250/1000 kb/s via
  `ampBitsNs`), AMP_UL_SYNC_CHIPS (48) × AMP_UL_CHIP_NS (1000/250/125 ns → 48/12/6 µs), and
  AMP_TAG_DL_SENS_DBM (−72 dBm, marked model) — all match the glossary text and the spec doc's
  Part B tables.
- **No curly-quote corruption**: ran a code-point scan over every added (`+`) line in the
  `glossary.ts`/`Guide.tsx` diff hunks. All non-ASCII code points are ordinary CJK characters,
  fullwidth punctuation (， 。 （ ） ：), em dash (—), minus sign (−), micro sign (µ), and
  middle dot (·) — consistent with the file's existing house style; no U+FFFD or mis-encoded
  byte sequences found.
- **Whole suite green**: see Commands and output above — 744/744 tests, tsc clean, build clean,
  lesson-hashes fixture unchanged (confirms no 5 GHz/existing-lesson scenario timeline was
  perturbed).

## Concerns

- The task brief file (`task-13-brief.md`) describes a materially different, smaller scope
  (includes a memory-index paragraph, omits editor labels / lesson-1 wording / README known-
  simplifications). I followed the fuller, more specific dispatch-message instructions instead,
  per the explicit note there that the memory note is "the controller's job — skip it." Flagging
  this in case the brief file itself should be updated to match, but no functional ambiguity
  affected the implementation.
- None of the changes touch engine behaviour or pinned timeline hashes — this was a
  documentation/UI-label-only task, confirmed by the unchanged `lesson-hashes.test.ts` fixture.
