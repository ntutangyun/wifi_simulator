# B2 review — roles-stack, frame-anatomy, frame-anatomy-bytes (commit ca9a420)

## Method

- Pass 1 (novice read): `npx tsx scripts/lesson-dump.ts <id> en|zh` for all three lessons,
  read as a reader who knows only radio-primer and decode-thresholds.
- Pass 2 (pins): compared `git show 43b90e4:src/course/tier1/{frame-anatomy,roles-stack}.ts`
  and their old tests against the new lesson files and `tests/course/{roles-stack,
  frame-anatomy,frame-anatomy-bytes}.test.ts`; checked `COURSE_ORDER`, `lessons.ts`,
  `tests/fixtures/lesson-hashes.json`, owner-word `terms`, and the decoder path
  (`decodeFrame`/`ppduLayout` from `src/model/frameFields`, rendered by
  `src/ui/FrameDetail.tsx` — "Fields on the air").
- Ran `npx vitest run tests/course/roles-stack.test.ts tests/course/frame-anatomy.test.ts
  tests/course/frame-anatomy-bytes.test.ts` (57/57 green) and
  `READABILITY_INCLUDE=roles-stack,frame-anatomy,frame-anatomy-bytes npx vitest run
  tests/course/readability.test.ts` (479/479 green).

## Verdict

**Fix round required** — one novice-read stop point per the spec's review rule
("One finding of the first kind is a fix round"): untranslated English left in the
Chinese `roles-stack` numbers table.

## Important (2)

- `src/course/tier1/roles-stack.ts:107,110,115,118` — four `numbers`-table cells use
  the language-neutral helper `N()` on full English phrases (`'1400 B of video'`,
  `'125.6 µs at 20 MHz'`, `'50 × 1500 B every 60 ms'`, `'a fixed 50 µs to forward'`),
  so the ZH dump prints raw English inside an otherwise-Chinese table (confirmed:
  `npx tsx scripts/lesson-dump.ts roles-stack zh` shows "50 × 1500 B every 60 ms" and
  "a fixed 50 µs to forward" verbatim). `N()` is meant for numbers/symbols/protocol
  names (`en === zh`), not prose with words like "of", "every", "to forward" — the
  pre-rewrite lesson translated the equivalent cells properly (e.g. `'1400 octets of
  video'` → `'1400 个八位组的视频'`, `'125.6 µs at HE MCS 11, 20 MHz'` → `'HE MCS
  11、20 MHz 下 125.6 µs'`). This is a real EN/ZH parity regression, not just a nit:
  a ZH-only reader hits untranslated English mid-table.
- `src/course/tier1/roles-stack.ts:210` (quiz, EN and ZH) — the correct quiz answer to
  "What makes an access point different from a station?" is "It contains a station,
  and gives the stations on it a way out through the DS" (ZH: "它本身含有一个站点…").
  This misstates the relationship as containment; the standard (and this lesson's own
  `sources` section) says an AP *is* a STA that additionally gives its associated STAs
  access to the DS — an is-a relationship, not has-a/contains. The picture text avoids
  this trap ("It has a job the others do not"); the quiz answer reintroduces a wrong
  mental model and contradicts `sources`.

## Minor (2)

- `src/course/tier1/frame-anatomy-bytes.ts` picture ("Look at the bars") and B2-report
  both describe the watch/observations as sending the reader to "Fields on the air",
  but that exact label is never used in the lesson text (the old `frame-anatomy.ts`
  did name it explicitly). Not a defect — the decoder path itself is exercised and
  green — but the report overstates precision; a beginner following the watch block
  only sees "compare how much of each block is front," with no pointer to the panel
  name.
- `roles-stack` quiz option 0 phrasing aside, the rest of the lesson's register is
  clean; flagging only because it sits next to the Important item above in the same
  quiz block and a fix round should cover both while the file is open.

## Confirmed clean (no findings)

- Split boundary: `frame-anatomy` stops after header/addresses/QoS mark — a natural
  stopping point before byte-counting/decoder/aggregation content of
  `frame-anatomy-bytes`.
- All pinned claims from `tier1-roles-stack.test.ts` and `tier1-frame-anatomy.test.ts`
  survive in the new suites against the same named records (spot-checked every
  timestamp, byte count, and named field; `TID_FOR_AC`, preamble/symbol tables, the
  aggregate math, and both `deeper` derivations all present).
- `tests/fixtures/lesson-hashes.json`: exactly one added line,
  `"frame-anatomy-bytes": "27f82e3c"`, equal to `frame-anatomy`'s.
- `COURSE_ORDER` has `frame-anatomy-bytes` immediately after `frame-anatomy`, same
  module; `lessons.ts` has one import + one entry in the same position.
- Owner words present verbatim: roles-stack (BSS, BSSID, SSID), frame-anatomy (PPDU,
  MPDU, MSDU, FCS, CRC, QOS), frame-anatomy-bytes (L-STF, L-LTF, L-SIG, U-SIG).
- Decoder still works in `frame-anatomy-bytes`: its test imports and exercises
  `decodeFrame`/`ppduLayout` from `src/model/frameFields` (the same code path behind
  `src/ui/FrameDetail.tsx`'s "Fields on the air" panel) against the shared scenario.
- No EN/ZH quantity or claim disagreement found elsewhere; no undefined words for a
  reader who knows only radio-primer/decode-thresholds; no citations outside
  `sources`/table cells; readability suite green with both lessons/all three ids
  included.
