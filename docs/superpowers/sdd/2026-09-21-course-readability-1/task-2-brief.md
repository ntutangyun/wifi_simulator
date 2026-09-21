### Task 2: `uwb-intro` rewritten, `uwb-frame` split out

**Files:**
- Modify: `src/course/uwb/uwb-intro.ts`, `src/course/curriculum.ts` (`COURSE_ORDER`: insert `'uwb-frame'` right after `'uwb-intro'`), `src/course/lessons.ts` (register), `tests/course/uwb-intro.test.ts` (pins that stay), `tests/course/readability.test.ts` (remove `'uwb-intro'` from `MIGRATING`), `tests/fixtures/lesson-hashes.json` (additions `uwb-frame`, `uwb-frame#0`).
- Create: `src/course/uwb/uwb-frame.ts`, `tests/course/uwb-frame.test.ts`.

**Interfaces:** consumes Task 1's `Lesson` fields, `watch` block and `MIGRATING`. Produces nothing later tasks consume. Both lessons use `uwbIntroScenario(5)` with the `uwbIntroScenario(20)` variant, unchanged.

**Content contract for `uwb-intro` — "A radio that measures time" / "一台测量时间的射频"** (module 11, 600–900 main-path words):

- `why` (draft, EN; write the ZH fresh): *Your phone can already tell you how far it is from a Wi-Fi router, roughly, from how loud the router sounds. Roughly is the problem: a wall or a hand costs more signal than ten metres of air. Ultra-wideband takes a different route. It does not ask how loud a signal is. It asks when it arrived, and light is a very reliable clock. This lesson shows the smallest possible measurement: one anchor, one phone, four timestamps, one distance.*
- `outcomes`: read the four timestamps of a ranging round off the log; say why the phone measures a round trip and the anchor a reply time; explain why a few centimetres of error is not a bug.
- `needs`: `['radio-primer', 'frame-anatomy']`.
- `terms` (≤ 4): `UWB` (ultra-wideband: a radio that sends very short pulses over a very wide band, so the moment a pulse arrives can be pinned down sharply), `anchor` (a UWB radio fixed to the building, the reference the phone measures against), `RMARKER` (the one instant inside a frame both radios agree to timestamp), `RCTU` (the tick of the ranging clock; there are tens of thousands in a microsecond).
- `picture` (headings in EN/ZH): "Loud is not the same as near" (RSSI's failure in one paragraph, no numbers); "Clicks instead of tones" (a pulse radio, why a sharp edge gives a sharp time; no table); "One question, one answer" (poll and response; both sides write down when the frame passed a fixed point inside it; a `watch` block with `jump: 0`: *Load the simulation and press play. The phone sends a poll, the anchor answers in the next slot. Zoom the timeline until you can see the tiny gap between the two lanes: that gap is the air between them.*); "Two clocks that do not agree" (each radio has its own counter starting anywhere; only differences on the same clock mean anything; the round trip minus the reply time is two flights); "How wrong is a few centimetres" (noise on every timestamp; a `watch` with `jump: 3` pointing at the range line). At most two numbers per paragraph: allowed are "5 m" and "17 ns"-class quantities; no RCTU values here.
- `numbers`: the single-sided two-way ranging formula block (keep as is); the table of the four counters (keep); the arithmetic formula block (keep); one paragraph on raw vs corrected range (4.95 / 5.00 / 5.02 m); one table "Units" (chip 2.003 ns, RCTU 15.650 ps, 1 m = 3.3356 ns = 213.1 RCTU, tick = 4.7 mm flight / 2.3 mm range) with a "where" column citing §16.4 / §10.29 in the cells; the 17 ns vs 16.678 ns rounding paragraph.
- `deeper`: the 40-bit counter wrap (17.2 s); the ±20 ppm consequence; the Wi-Fi channel's zero propagation delay by contrast.
- `sources`: the old opening paragraph, rewritten as 3–4 bullet sentences (standard, clauses, FiRa's 2 ms / 200 ms, the model values −14 dBm / −93 dBm / 100 ps / 0.2 ppm / wall delay).
- `jumps`, `variants`: unchanged. `observe`: keep items 1, 2, 3 (the fourth, about the two 2 ms slots, moves to `uwb-frame`). `tryThis`: keep the 20 m one; the "do the arithmetic yourself" one moves to `uwb-frame`. `quiz`: keep Q1 (RCTU) and Q3 (17 ns), drop Q2 (RMARKER position — moves to `uwb-frame`); add one plain question: *Why does UWB measure time instead of signal strength?* (answer: strength depends on walls and hands, arrival time depends on distance and the speed of light).

**Content contract for `uwb-frame` — "What a ranging frame is made of" / "一帧测距帧由什么组成"** (module 11, 800–1 200 words):

- `why`: *A ranging frame carries almost no data, yet it is long — far longer than a Wi-Fi acknowledgement. Every part of it earns its place: some parts let the receiver lock on, one part fixes the exact instant to timestamp, one part makes the timestamp impossible to fake. Knowing the parts tells you where the RMARKER is and why it is there.*
- `outcomes`: name the five parts of a ranging frame and what each is for; point to the RMARKER on the frame's timeline; explain why the payload is the smallest part.
- `needs`: `['uwb-intro']`. `terms` (≤ 6): SYNC, SFD, STS, PHR, PSDU, slot.
- `picture`: "Locking on before listening" (SYNC and SFD in plain words); "A sequence nobody can forge" (STS; `watch` jump to the poll: *open the poll in frame detail and read the strip left to right*); "The header and the message" (PHR, PSDU: why 30 octets); "Two slots, one round" (the 2 ms slots; the fourth old observe item's content); "Where the stamp goes" (the RMARKER = first chip after the SFD, in words).
- `numbers`: the "What 197.628 µs is made of" table (moved intact, cited cells allowed); the RMARKER arithmetic paragraph (65.128 + 8.141 = 73.269 µs) and the response (20 octets, 187.372 µs); the PSDU line (240 data bits, 48 parity, 2-symbol tail at 6.81 Mb/s).
- `deeper`: none required. `sources`: standard clauses for Clause 16 fields, §10.29.1.1 RMARKER, §10.32 SP1.
- `observe`: the old fourth item (two slots of 2 ms, response at exactly 2 000 000 ns; only 385 µs carries a frame) + one new (*open the poll in frame detail: the PSDU is the last and smallest segment*). `tryThis`: the "do the arithmetic yourself" item. `quiz`: the old Q2 (RMARKER position) + one on the STS's purpose + one on why the payload is small. `jumps`: `firstUwbPoll`, `firstUwbResp`.

- [ ] **Step 1: Split the tests first.** Create `tests/course/uwb-frame.test.ts` by moving from `uwb-intro.test.ts` the describes "what 197.628 µs is made of" (all of it) and the pins "the round is two 2 ms slots and the response leaves at exactly 2 000 000 ns"; point them at `uwbFrame` (`import { uwbFrame } from '../../src/course/uwb/uwb-frame'`). Add to both files a `lesson shape` block asserting: `isMigrated`, `lessonMinutes ≤ 20`, `lessonWords` inside the lesson's word window, every jump target found in the base run, both languages present for every string (reuse the existing bilingual walk). Keep in `uwb-intro.test.ts`: the units, the flight time on the timeline, the four lines to subtract, the range the log reports. Update the study-time test from "15–25" to "≤ 20".

- [ ] **Step 2: Run** `npx vitest run tests/course/uwb-intro.test.ts tests/course/uwb-frame.test.ts` → FAIL (uwb-frame missing; shape assertions fail).

- [ ] **Step 3: Write the two lessons** to the content contracts above. Register `uwbFrame` in `src/course/lessons.ts` beside `uwbIntro`; insert `'uwb-frame'` in `COURSE_ORDER` after `'uwb-intro'`. Remove `'uwb-intro'` from `MIGRATING`. Every number that stays in prose must be one the tests pin; every number that has no pin is either given one in the numbers section's test or removed.

- [ ] **Step 4: Hashes.** `$env:UPDATE_HASHES='1'; npx vitest run tests/engine/lesson-hashes.test.ts` then `git diff tests/fixtures/lesson-hashes.json` must show exactly two added lines (`uwb-frame`, `uwb-frame#0`) with the same hashes as `uwb-intro` / `uwb-intro#0`. Anything else: stop and report.

- [ ] **Step 5: Gates.** `npx vitest run tests/course` (readability now runs for `uwb-intro` and `uwb-frame`), full `npx vitest run`, `npx tsc -b --noEmit`, `npm run build`.

- [ ] **Step 6: Commit** `feat(course): uwb-intro rewritten zero-to-hero — a radio that measures time; frame anatomy split into uwb-frame`.

---

