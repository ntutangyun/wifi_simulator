# Batch C3 — `width`, `streams` (Wi-Fi Tier 2, wave 1)

Both lessons share `widthScenario` in `src/course/wifiScenes.ts`; the builder, the base
scenario and every variant are unchanged, so `tests/fixtures/lesson-hashes.json` is
byte-identical and was not touched. `lessons.ts`, `curriculum.ts` and
`tests/course/readability.test.ts` were not touched either.

## width — "Channel width — more lanes, not a faster car"

- Budget: `picture 602/650 · numbers 263/350 · practice 398/400 · total 1263 (20 min)`
  (was 1185 words / 25 min). Prose window asserted at 880.
- `needs`: `decode-thresholds`, `airtime`.
- `terms` (4): channel width, sub-carrier, symbol, noise floor. MCS/OFDM/CCA come from
  `decode-thresholds`, preamble/payload/ACK from `airtime`, all inside the needs closure.
- Picture: a wider channel is more lanes not a faster car → the part that never shrinks
  (preamble + whole symbols) → watch (block 3) → the bill is noise → when wider comes out
  slower → and the neighbours.
- Numbers: the 20/40/80/160 table (width, data sub-carriers, MCS, rate line, symbols,
  airtime), the airtime formula with the guard-band note, the noise paragraph
  (3 dB / 9 dB / 48.7 against 48.0), the living-room table (415.2 / 238.4 / 170.4 / 224.8 µs,
  MCS 3/3/2/0), and the one-line explanation of the inversion.
- `deeper`: the one-decibel inversion window (now stated as "about one decibel wide" plus
  the −70.51 dBm position, rather than the old exact −70.98/−69.97 edges, which were an
  artefact of the sweep step) and the 802.11a fallback (704 µs, 18 Mb/s, 5.5×).
- `sources`: the sub-carrier numerology, the 48 µs / 13.6 µs model values and TXTIME,
  the kTB noise rule and the sensitivity tables (the short 2 dB rung).
- Pins moved/added — all in the new `tests/course/width.test.ts`:
  module/needs/terms; the scenario and four variants equal `widthScenario(...)`; per
  variant 1530 octets, width, MCS 13, 172.1 Mbps, airtime, symbols, and the 28 µs ACK;
  the sub-carrier column as `234 × toneRatio`; the formula reproducing all four airtimes
  and the 81.6/40.8/27.2/13.6 µs data parts; 3 dB per doubling and 9 dB across;
  48.7 dB against 48.0; the living-room table (airtimes, MCS ladder, no retries, no
  drops) and the 2 dB rung; the inversion window width and the −70.51 dBm position;
  the far corner (no ACK at 160 MHz; 524.0 / 768.8 / 401.6 µs) and the legacy fallback.
- `.body!` retired: none existed — `width` had no per-lesson test file before this batch.
  `lesson-claims.test.ts` ("lesson 15") and `quoted-timestamps.test.ts` were left
  untouched and stay green; their claims are now also pinned here, with the sentence.
- Dropped/moved: the explicit "48 µs preamble" arithmetic in the picture (it is in
  `numbers` and `observe`), the exact inversion-window edges (deeper, restated), the
  legacy-radio experiment (moved from `tryThis` into `deeper`, so the practice budget
  fits; its pin is kept in `width.test.ts`).

## streams — "Spatial streams — several words at once"

- Budget: `picture 522/650 · numbers 156/350 · practice 335/400 · total 1013 (20 min)`
  (was 697 words / 25 min). Prose window asserted at 700.
- `needs`: `width`.
- `terms` (2): spatial stream, antenna.
- Picture: several words at once → both ends have a vote → watch (block 3) → the
  multiplier that is free → where the multipliers stop.
- Numbers: the 1/2/4-stream table (bits per symbol, symbols, airtime), the two mixed
  variants as a table with a "Same as" column, and two short headed paragraphs.
- `deeper`: what the spare pair is for (MU-MIMO, named only here, as the acronym rule
  does not admit it in the picture) and why the paths have to differ.
- `sources`: the 2340-bit symbol and the stream multiplier, the capability negotiation,
  and the simulator's equal-quality-stream simplification.
- Pins moved/added — all in the new `tests/course/streams.test.ts`: module/needs/terms;
  scenario and the five variants; per variant 1530 octets, 20 MHz, MCS 13, 172.1 Mbps,
  airtime, bits per symbol and symbol count; the 81.6 → 40.8 → 27.2 µs data parts and the
  20.4 µs that rounds up; every node at 20 MHz for the three stream variants; the
  negotiated 4-on-router / 2-on-phone variant landing on 88.8 µs and being frame-for-frame
  the 2-stream run; 160 MHz · 4 streams at 61.6 µs with one symbol as the floor; and the
  "same 88.8 µs as 40 MHz, without the 3 dB" experiment.
- `.body!` retired: none existed — `streams` had no per-lesson test file before this batch.
  The "Router 4 · Phone 2" identity pin in `lesson-claims.test.ts` ("lesson 16") and the
  `quoted-timestamps.test.ts` walk were left untouched and stay green.
- Dropped/moved: the forward reference "that is MU-MIMO, and it is lesson 17" (moved to
  `deeper`, without the lesson number); one of the three experiments (merged, to fit the
  practice budget and the 20-minute ceiling).

## Verification

- `READABILITY_INCLUDE=width,streams npx vitest run tests/course/readability.test.ts
  tests/course/width.test.ts tests/course/streams.test.ts` — every rule green for both ids.
- `npx tsc -b --noEmit` clean; `npx vitest run tests/course` 1594/1595, the one failure
  being `readability · migration bookkeeping` reporting `edca` (and, on a clean tree,
  `width`/`streams`/`tier1-project`) as migrated while still listed in MIGRATING. That
  list is controller-owned; **the controller must delete `width` and `streams` from
  MIGRATING** when this batch lands.
