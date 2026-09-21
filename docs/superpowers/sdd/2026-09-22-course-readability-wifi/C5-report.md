# Batch C5 — Wi-Fi Tier 2, wave 3: `ofdma-dl`, `ofdma-ul`, `mumimo`

Scenario builders and variants unchanged in all three; `tests/fixtures/lesson-hashes.json`
untouched. No `.body!` site existed on any of these ids, so none was retired; the pins in
`lesson-claims.test.ts`, `quoted-timestamps.test.ts` and `lessons.test.ts` are all green
without editing those files (see "Shared pins" below).

## `ofdma-dl` — "OFDMA downlink — one send, several phones"

- Budget: `picture 536/650 · numbers 215/350 · practice 348/400 · total 1099 (20 min)`; prose window 760.
- `needs`: `width`, `txop`. `terms`: OFDMA, resource unit, RU, MU.
- Picture: the channel dealt out in blocks; who decides the slices (the router alone, from
  whichever queues are non-empty at that instant); what the slices buy (one opening and one
  answer round instead of two); what they cannot buy (no link goes faster).
- Numbers, all measured over the lesson's own 300 ms run and pinned in
  `tests/course/ofdma-dl.test.ts`: the two-frame comparison (44 µs × 2 / 6 + 6 symbols /
  125.6 µs × 2 / two 28 µs ACK frames against 48 µs / 12 symbols / 211.2 µs / two 32 µs
  BlockAck frames at the same instant); the symbol formula with the RU share; the whole-run
  table with OFDMA on and off (1016 vs 1061 sends, 45 carrying two televisions, the same
  352 / 355 / 354 frames and 13.1 / 13.3 / 13.2 Mb/s delivered either way, 161.5 vs 163.0 ms
  of busy air); the 40 µs saved and 8 µs handed back per pair, 1.44 ms over the run.
- New pin worth naming: the picture's claim that a television left out of a group "had
  nothing waiting for it" is measured against the access point's own ENQUEUE/DEQUEUE
  records — 45 of 45 exclusions had an empty queue.
- Experiments pinned: OFDMA off on television 1 (the other two still pair 11 times); off
  everywhere (1061 single-user sends, identical delivery, 1.44 ms more air).
- To `deeper`: why the group is two and not the four the engine allows; where the extra 4 µs
  of opening goes. To `sources`: Clause 27 / §17.4.3 / §26.5, the simulator's representative
  preamble and symbol values, and the engine's own four-member cap.

## `ofdma-ul` — "Trigger frames — the access point conducts the uplink"

- Budget: `picture 561/650 · numbers 257/350 · practice 338/400 · total 1156 (20 min)`; prose window 830.
- `needs`: `ofdma-dl`. `terms`: uplink, trigger frame, TB.
- Picture: why the uplink is the hard direction; a `steps` block for what the trigger frame
  settles (who / where / how long / how loudly / when); the TB PPDU as an answer that decides
  nothing; what the devices keep (no backoff inside the round, carrier sense and ordinary
  contention outside it).
- Numbers, over the lesson's own 100 ms run and pinned in `tests/course/ofdma-ul.test.ts`:
  the round end to end (36 µs trigger of 40 B at 24 Mb/s, 16 µs gap, two 1988.8 µs TB PPDU
  answers of 16,894 B each, 16 µs gap, one 36 µs multi-station BlockAck, 2092.8 µs and
  33,788 B in total); the whole-run table (16 triggers, 2 unanswered, 28 answers carrying
  473,032 B against 54 contended sends carrying 996,756 B, six collisions all outside
  triggered rounds).
- To `deeper`: why the answers must arrive at similar strength; why a group of one is no
  group (the experiment: OFDMA off on one uploader stops every trigger frame). To `sources`:
  §9.3.1.22, §9.3.1.9.7, §26.5.2, the CS Required field, and the 24 Mb/s as a model choice.
- Dropped: nothing of substance. The old body's "MAC starts to look like a scheduler" line
  and its verbatim list of Trigger fields are now the `steps` block.

## `mumimo` — "MU-MIMO — splitting by space instead of frequency"

- Budget: `picture 532/650 · numbers 158/350 · practice 362/400 · total 1052 (20 min, down
  from 1 165 words / 25 min)`; prose window 700.
- `needs`: `streams`, `ofdma-dl`. `terms`: MU-MIMO, beamforming, sounding.
- Picture: dividing space rather than the channel; why aiming needs the room measured
  (beamforming and sounding, and what a stale measurement aims at); why the group here is
  never three (four antennas against two streams a phone); when one beats the other.
- Numbers pinned in `tests/course/mumimo.test.ts`: the two-variant table (3 and 2 members,
  4,306 B each, 3 and 1 data symbols, 92.8 and 65.6 µs, 371.2 and 525.1 Mb/s); the
  `52 µs + 13.6 µs × symbols` formula, the threefold gain on the data and the 1.41 end to
  end; the combined 12,918 against 8,612 bytes.
- To `deeper`: where the trimmed phone turns up next (196 / 122 / 65 / 9, 62 / 33 / 5), the
  engine's grouping rule as `steps`, and the one feature flag the two variants differ in.
  To `sources`: Clause 27 / 36, the fact that this simulator runs no sounding exchange and
  idealises the nulling (a model choice), and the engine's 1,000-byte threshold.
- One claim was weakened to match the run: the old lesson said a single acknowledgement
  round always settles the group. It does for 162 of 169 sends in the OFDMA variant; the
  rest are talked over by the laptop. The observation now says so and the test pins the
  either/or (acknowledged one SIFS later, or collided with during the send).

## Shared pins (not edited, all green)

- `lesson-claims.test.ts`: the DL MU PPDU / simultaneous BlockAck pin (ofdma-dl), the
  EDCA-between-bursts pin (ofdma-ul), the backup-off pin (mumimo).
- `quoted-timestamps.test.ts`: mumimo's 92.8 / 65.6 µs sends, 371.2 / 525.1 Mb/s, the 3-vs-1
  symbols, 1.41, the 196 / 122 / 65 / 9 split, the added-phones cap, and lesson 18's
  outcome-reporting pin that runs on mumimo's scene.
- `lessons.test.ts`: the standard-alignment pin `/Wi-Fi 5 \(802\.11ac\)/` used to be met by
  ofdma-dl's opening paragraph. That paragraph is gone, so the fact now lives in mumimo's
  `sources` ("downlink MU-MIMO arrived with Wi-Fi 5 (802.11ac), and Wi-Fi 6 added OFDMA …
  this simulator models multi-user sends for Wi-Fi 6 and 7 only"), which is where the
  contract puts provenance. The pin is green.

## Verification

`npx tsc -b --noEmit` clean. `READABILITY_INCLUDE=ofdma-dl,ofdma-ul,mumimo npx vitest run
tests/course` — 1988 passed, 1 failed: `readability · migration bookkeeping` on ids not in
this batch (lessons already migrated by other waves but still listed in the controller-owned
MIGRATING). With the three ids included, the four suites of this batch plus
`readability.test.ts` run 854 passed / 0 failed.
