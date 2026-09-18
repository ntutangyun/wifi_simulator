# Task 10 report — Lesson `amp-intro`, "A station that never contends"

Commit `10dd983` on `feat/amp-active-tx` (parent `cbf9bd4`).

## What was done

Test-first. `tests/course/amp-intro.test.ts` was written before the lesson, run once with
`console.log` probes against the brief's scenario to measure every value, then pinned with
`toBe`. `src/course/amp/amp-intro.ts` quotes only pinned numbers; it is registered in
`src/course/lessons.ts` (import + `AUTHORED` entry, ordered by the existing `COURSE_ORDER`
slot after `mlo`).

Files:

- `src/course/amp/amp-intro.ts` (new) — the lesson: 17 body blocks (p / list / formula /
  table), `ampIntroScenario()` exported, 1 variant, 6 jumps, 3 observe, 2 try-this, 3 quiz.
- `tests/course/amp-intro.test.ts` (new) — 30 `it`s in 5 `describe`s; each assertion carries a
  comment quoting the sentence it guards.
- `src/course/lessons.ts` — import and `AUTHORED` entry (2 lines).
- `tests/fixtures/lesson-hashes.json` — two new keys, `amp-intro: f1e44e52` and
  `amp-intro#0: 94328b86`, regenerated with `UPDATE_HASHES=1`. The diff is `+2` lines only;
  no existing hash moved.

## Scenario

`sc(oneRoom(), [ampAp('ap','Router',5,4,rates), tag('tag-1','Fridge tag',3,4),
tag('tag-2','Door tag',8,6)])` — AP defaults (100 ms, 4 slots, ACWE 2, 250/250, ctsSelf,
inline). Variant: `{ dlKbps: 1000, ulKbps: 1000 }` "1 Mb/s both ways". Lanes: `ap#2g`,
`tag-1#2g`, `tag-2#2g`.

## Measured values (all pinned)

Constants, asserted from `src/engine/amp.ts` / `src/engine/phy.ts` exports, never as literals:

| Quantity | Value |
|---|---|
| AMP SIFS / ERP 2.4 GHz SIFS / DCF slot | 10 µs / 10 µs / 9 µs |
| Padding unprotected / protected | 20 µs / 36 µs |
| DL PPDU parts | legacy preamble 32 µs, AMP-Sync 80 µs, AMP-SIG (2 oct) 64 µs @250 kb/s, 16 µs @1 Mb/s, signal extension 6 µs |
| Trigger / Ack / response octets | 13 / 4 / 15 (7 identity-only) |
| Airtimes @250 kb/s | 618 / 330 / 528 µs |
| Airtimes @1 Mb/s | 258 / 186 / 132 µs |
| UL sync | 48 chips → 48 µs @250 kb/s, 12 µs @1 Mb/s |
| CTS-to-self | 44 µs @6 Mb/s + 6 µs extension = 50 µs |
| Model values | tag DL sens −72 dBm, DL SINR 8 dB, UL SINR 10 dB @250 kb/s, AP UL floor −94 dBm |

Round 1 on `ap#2g` (base run):

| | from | to |
|---|---|---|
| CTS-to-self, Duration 4140 µs | 0 µs | 50 µs |
| AMP Trigger | 60 µs | 678 µs |
| slot 1 (Door tag) | 688 µs | 1216 µs |
| Ack₁ → tag-2 | 1226 µs | 1556 µs |
| slot 2 (Fridge tag) | 1566 µs | 2094 µs |
| Ack₂ → tag-1 | 2104 µs | 2434 µs |
| slot 3 (empty) | 2444 µs | 2972 µs |
| Ack₃ → AP | 2982 µs | 3312 µs |
| slot 4 (empty) | 3322 µs | 3850 µs |
| Ack₄ → AP | 3860 µs | 4190 µs |

- Trigger starts exactly one ERP SIFS (10 µs) after the CTS ends; slot 1 = trigger end + AMP
  SIFS; slot k ≥ 2 = Ack_{k−1} end + AMP SIFS. All verified as differences, not as literals.
- CTS Duration 4140 µs, CTS end 50 µs → NAV expiry 4190 µs = **exactly** the last Ack's end
  (the brief allowed 20 µs slack; the engine is exact, so equality is pinned).
- Round total 4190 µs = 4.19 % of 100 ms. Breakdown: 3044 µs PPDU + 90 µs (nine SIFS gaps) +
  1056 µs (two unused slots).
- 1 Mb/s variant: CTS Duration 1620 µs, trigger ends 318 µs, slot 1 at 328 µs, round 1670 µs =
  1.67 % of 100 ms, slot duration 132 µs.

Over 1 s (base): 10 rounds (CTS at 0, 100, …, 1000 ms), 40 slots, 40 Acks (16 naming a tag, 24
naming the AP), 20 tag responses, 16 acknowledged. Per tag: 10 responses, 8 acked, 2 lost,
**0 sit-outs**; ABOC always in [0, 3] with ACW 3 and slot = ABOC + 1. Two slot collisions
(RX_FAIL `collision` at the AP) at 201 216 µs (slot 1) and 502 972 µs (slot 3); the tags learn
at 201 556 µs and 503 312 µs. Neither tag emits any CCA_BUSY / CCA_IDLE / NAV_SET /
BACKOFF_* / IFS_* / CW_CHANGE / RETRY record; the AP's lane has all of them, and every
`IFS_START` is `ac: 0` (AC_BK). Link budget: AP→Door tag −43.9 dBm (28.1 dB over −72 dBm);
Door tag→AP −63.9 dBm (30.1 dB over −94 dBm).

UI strings pinned: `ABOC 1 of [0, 3] → slot 2`, `AMP round (random): 4 slots × 528.0 µs,
ACW 3, DL 250 kb/s, UL 250 kb/s`, `slot 1: acknowledged`, the trigger body
`Session 1 · ACWE 2 (ACW 3) · 4 slots × 528 µs · reading`, the Ack's 2-octet `ampId` field
(tag node for a decoded slot, AP for an empty one), and the Ack PPDU's 128 µs `ampData`
segment of 330 µs.

## Deviation from the brief

The brief's fifth jump target, **"first sit-out"**, cannot occur in this scenario: ACWE 2 gives
ACW = 2² − 1 = 3 and the AP offers 4 slots, so `slot = ABOC + 1` is always valid and
`AMP_ABOC.slot` is never `null`. Rather than change the brief's scenario (sit-outs are the
subject of `amp-slots`, which raises ACWE), the jump was replaced by two targets that do occur:
**"first Ack for an empty slot"** and **"first lost response (two tags, one slot)"**. The prose
states why no tag sits out and forward-references the next lesson, and the test pins the
sit-out count at 0 for both tags. Claim 5 of the brief ("how many rounds each sat out
(measured)") is therefore satisfied with the measured value zero.

Minor: the brief's try-this 2 said to move the Door tag behind a far wall until its RSSI drops
below −72 dBm. `oneRoom()` has only the outer brick shell, and the AP→tag link has 28.1 dB of
margin, so no reachable position inside the lab does it. The experiment instead raises the
tag's `dlSensDbm` above the −43.9 dBm it receives — the same lesson (a tag that cannot decode
the trigger simply vanishes from the round) with a knob that exists in the editor. The
`linkBudget` widget was not embedded because it models only 5 GHz/6 GHz bands.

## Suites run

- `npx vitest run tests/course tests/engine/lesson-hashes.test.ts` → **14 files, 274 tests,
  all pass**, no console output.
- `npx vitest run` (whole suite) → **73 files, 680 tests, all pass**.
- `npx tsc -b` → clean, exit 0.

## Self-review

- Every number in the prose (body, observe, try-this, quiz) appears in a test assertion. Swept
  the file line by line: airtimes, octet counts, µs timestamps, percentages, counts, dBm
  values, the 9 µs slot, the 2-octet AMP-SIG, the `eht` generation behind "Wi-Fi 7", the
  AC_BK access function. Standard document numbers, § references and draft dates are citations
  from the task brief, not simulated quantities.
- Study time: 1991 English words → **25 minutes** (3 observe × 2 + 2 try-this × 4 + 1991/150 =
  27.3 → 25). Inside the 15–25 target, and the test asserts both the formula and the bounds.
  The lesson was trimmed three times to get there from an initial 2313 words (30 min).
- All six jump targets occur in the base run (test asserts it).
- Both languages complete; every block, observe item, try-this item, quiz question, option and
  explanation is bilingual (`tests/course/lessons.test.ts` enforces this across all lessons).
  The Chinese is written, not translated, and keeps the same citations and numbers.
- Test output is pristine — no `console.log` left behind, no skipped tests. The two temporary
  probe files were deleted before committing.

## Concerns

1. **Word-count headroom is 34 words.** At 1991 words the lesson is 34 words below the 2025
   threshold at which `lessonMinutes` rounds to 30 and the test fails. The content is static,
   so it cannot drift on its own, but any later edit that adds a sentence to the English prose
   must remove one elsewhere.
2. **Prose/ZH parity after trimming.** Three sentences were shortened in English more than in
   Chinese (the Chinese keeps a slightly fuller phrasing, e.g. "它没有载波侦听、没有 NAV、没有
   竞争窗口" where the English now says "it has none of those things"). Meaning is identical; if
   strict parity is wanted the Chinese can be trimmed to match without affecting the word count,
   which counts English only.
3. **Sit-out jump** — see the deviation above; the controller may want the brief updated so
   Task 11 (`amp-slots`) is the first place a sit-out appears.

---

# Fix round 1 — reviewer items 1–12

Commit `a03c8de` "fix(course): amp-intro — correct two claims, pin the rest" on
`feat/amp-active-tx`. Two files: `src/course/amp/amp-intro.ts`,
`tests/course/amp-intro.test.ts`. `tests/fixtures/lesson-hashes.json` is untouched — the
scenario did not change. All twelve items are done.

## Critical

**1 — the "longest of the three" claim was false.** Removed. The paragraph now reads:
"At 250 kb/s the trigger is still the longest frame and the Ack the shortest — but the
response is the one the low rate punishes most. With no fixed preamble to dilute it, its
airtime tracks the rate exactly: 528 µs becomes 132 µs at 1 Mb/s, a clean factor of four.
The trigger carries 138 µs that no rate can touch, so it only falls from 618 to 258 µs."
Pinned by a new `it('at 250 kb/s the trigger is longest and the Ack shortest, but only the
response scales by four')`: `trig250 > resp250 > ack250`, `resp250 / resp1000 === 4`,
`fixedNs === 138 * US`, `trig250 / trig1000 < 4`, and
`trig250 - fixedNs === 4 * (trig1000 - fixedNs)`.

Note on the arithmetic: the reviewer's "118 µs" (preamble + sync + extension) does not
balance, because the 20 µs padding is rate-independent too. The rate-independent part is
32 + 80 + 20 + 6 = **138 µs**, and 618 − 138 = 480 = 4 × (258 − 138). The formula note was
corrected the same way ("the 32 + 80 + 20 + 6 = 138 µs of preamble, sync, padding and
extension does not [shrink]").

**2 — "full of all four" was false for NAV_SET.** The record list in the prose is now three
records, exactly the list the test asserts (`CONTENTION_RECORDS = ['CCA_BUSY',
'BACKOFF_DRAW', 'IFS_START']`), and the teaching point is stated: "What no lane here holds
is a NAV_SET: a CTS-to-self sets a NAV in the nodes that hear it, never in its own sender,
and there is no other Wi-Fi node to send one back." Two tests: one asserts 0 for each of the
three at each tag and > 0 for each at the AP; a second, `it('no lane in this scene ever sets
a NAV')`, asserts `ofType(rs, 'NAV_SET').length === 0` and `countAt(rs, AP, 'NAV_SET') === 0`
while the CTS Duration is still 4140 µs on the air. Quiz 1's explanation was updated to the
same three record names.

## Important

**3 — try-this 2 is now measured.** New `describe('amp-intro · the try-this experiments')`:
`withSens(-36)` (above what the tag receives) gives 0 `AMP_ABOC`, 0 `TX_START`, 0
`AMP_RESULT` on `tag-2#2g`, while `AMP_SLOT` = 40, `ampAck` = 40, `AMP_ROUND` = 10 and the
Fridge tag still draws 10 ABOCs and is acknowledged all 10 times. `withSens(-38)` (below what
it receives) still gives 10 ABOCs, which brackets the received power empirically.

**This test found a real bug.** With −40 dBm the tag kept answering, because the quoted RSSI
was wrong: `buildLinkTable` is band-neutral and `Simulation` applies
`LINK_EXTRA_LOSS_DB['2g'] = -6.5`, i.e. 2.4 GHz gets 6.5 dB *less* path loss. Corrected
everywhere:

| | shipped before | correct |
|---|---|---|
| Router → Door tag | −43.9 dBm | **−37.4 dBm** |
| margin over −72 dBm | 28.1 dB | **34.6 dB** |
| Door tag → Router | −63.9 dBm | **−57.4 dBm** |
| margin over −94 dBm | 30.1 dB | **36.6 dB** |

The link-budget test now applies the band offset and asserts `LINK_EXTRA_LOSS_DB['2g'] ===
-6.5` so the correction cannot silently regress. Try-this 2 quotes −37.4 dBm.

**4 — comments re-synced; the ABOC comment fixed; scene sentence restored.** Every `//`
comment in the test now quotes the shipped sentence verbatim (re-read line by line against
the lesson). The wrong comment "can never reach the fourth slot's index" is gone; the test is
now `it('a draw of 3 lands in slot 4, so with ACW + 1 = N neither tag ever sits a round out')`
and asserts `acw + 1 === slots`, `acw + 1 > slots === false`, `slot === aboc + 1` for every
record, 0 sit-outs, and — across the run rather than per tag, because tag-1 never draws 3 in
these ten rounds — that some draw of 3 does land in slot 4. The scene sentence is restored as
the opening of "One round, microsecond by microsecond": "The scene is one router and two
battery-free tags, with no Wi-Fi traffic at all, so the round stands alone."

## Unpinned / overstated

**5** — "the 6 µs signal extension every 2.4 GHz PPDU **with a legacy preamble** carries", and
the uplink paragraph now says "no legacy preamble at all, and therefore no signal extension
either". Pinned by `it('the uplink PPDU has no legacy preamble and therefore no signal
extension')`: `ppduLayout(resp) === ['ampSync', 'ampData']`, contains neither
`legacyPreamble` nor `signalExt`, while the trigger's layout contains both.

**6** — "Ambient power buys that margin with data rate: −94 dBm is about 12 dB below the
−82 dBm preamble-detect gate an OFDM frame must clear to be received at all."
Pinned: `expect(CCA_PD_DBM).toBe(-82)` and
`expect(Math.round(CCA_PD_DBM - ampUlSensDbm(250))).toBe(12)`.

**7** — "Every AMP frame in this slice is unprotected, so every one pads 20 µs." Pinned by
`it('padding is 20 µs unprotected and 36 µs protected, and every frame here is unprotected')`:
all 50 downlink AMP frames in the run have `amp.padNs === AMP_PADDING_NS`, and none has
`AMP_PADDING_PROTECTED_NS`.

**8** — the view route, as preferred: `initViewState(ampIntro.scenario())` + `applyRecord`
over the whole second, then `expect(vs.nodes[tag].amp).toMatchObject({ sent: 10, acked: 8,
lost: 2, roundsHeard: 10, roundsSatOut: 0 })` for both tags. The prose states the number:
"its sent / acknowledged / lost counters — 10 / 8 / 2 after one second".

## Minor

**9** — "A tag sits a round out only when the draw can land past the last slot, that is when
ACW + 1 > N; here ACW + 1 = 4 = N, so neither tag ever sits out." (assertions above).

**10** — quiz 3: "Fixed overhead dominates a tiny frame. So does the round: besides 3044 µs
of PPDU it spends 90 µs on SIFS gaps and 1056 µs on two empty slots."

**11** — "they collide in the slot ending at 201 216 µs and the one ending at 502 972 µs";
the test also asserts each COLLISION instant equals some `AMP_SLOT.untilNs`.

**12** — "Protecting the round is not the same as a protected AMP frame, which means an
encrypted one and pads 36 µs instead of 20."

## Commands and output

```
npx tsc -b                                                  -> exit 0, no output
npx vitest run tests/course tests/engine/lesson-hashes.test.ts
  Test Files  15 passed (15)
       Tests  307 passed (307)
git status --porcelain (before staging)
  M src/course/amp/amp-intro.ts
  M tests/course/amp-intro.test.ts
git diff --stat tests/fixtures/lesson-hashes.json           -> (empty: unchanged)
```

`tests/course/amp-intro.test.ts` alone: 34 tests, all pass. Test output pristine — no
console output, no skips.

Study time: the prose was trimmed from 2201 to **2010 English words**, giving
`2010/150 + 3x2 + 2x4 = 27.4 -> 25 minutes`, inside the 15–25 target with 14 words of
headroom below the 2025-word threshold at which it would round to 30.

## Scratch files and other tasks' work

Deleted the probe files this task created: `tests/course/zz-amp-probe.test.ts`,
`tests/course/zz-words.test.ts`, `tests/course/zz-rssi-probe.test.ts`,
`tests/course/zz2-words.test.ts`. None remain.

`tests/course/_probe.test.ts`, `tests/course/_wc.test.ts`, `src/course/amp/amp-slots.ts`,
`tests/course/amp-slots.test.ts` and the edit to `src/engine/channel.ts` were **not mine** —
they belonged to the concurrent `amp-slots` task, which has since committed them as `4d00f86`.
They were left untouched, and staging was by path (`git add src/course/amp/amp-intro.ts
tests/course/amp-intro.test.ts`).

## Left for the next session

Nothing from items 1–12. Two small notes for a future reviewer:

1. The word-count headroom is 14 words. Any later English addition must remove an equivalent
   amount or the study-time test fails at 30 minutes.
2. `LINK_EXTRA_LOSS_DB['2g'] = -6.5` means the band-neutral `buildLinkTable` is 6.5 dB
   pessimistic for every 2.4 GHz lesson. Worth checking whether any earlier lesson quotes a
   2.4 GHz RSSI taken straight from that table; `amp-intro` was doing exactly that.
