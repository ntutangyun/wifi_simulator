### Task 3: `amp-intro` rewritten, `amp-ppdu` split out

**Files:**
- Modify: `src/course/amp/amp-intro.ts`, `src/course/curriculum.ts` (`COURSE_ORDER`: `'amp-ppdu'` after `'amp-intro'`), `src/course/lessons.ts`, `tests/course/amp-intro.test.ts`, `tests/course/readability.test.ts` (remove `'amp-intro'`), `tests/fixtures/lesson-hashes.json` (additions `amp-ppdu`, `amp-ppdu#0`).
- Create: `src/course/amp/amp-ppdu.ts`, `tests/course/amp-ppdu.test.ts`.

**Interfaces:** as Task 2. Both lessons use `ampIntroScenario({250,250})` with the `{1000,1000}` variant, unchanged.

**Content contract for `amp-intro` — "A tag with no battery" / "没有电池的标签"** (module 7, 600–900 words):

- `why`: *Imagine a sticker on a milk carton that reports the fridge temperature to your router — no battery, ever. It lives on the few microwatts it can scavenge from the air. A radio that poor cannot do what every Wi-Fi station does all day: listen for a gap and take its turn. So the router has to do the asking. This lesson shows one round of that asking, from the router's first frame to the last acknowledgement.*
- `outcomes`: say why a tag cannot use carrier sense; describe one polling round in order (reserve, ask, answer, acknowledge); read a tag's slot draw and its outcome in the log.
- `needs`: `['radio-primer', 'frame-anatomy']`. `terms` (≤ 4): AMP (ambient power: a Wi-Fi feature for devices that live on harvested energy), tag (the battery-free device; the standard calls it an Active Tx non-AP AMP STA), slot (a short window the router opens for one answer), ABOC (the number a tag draws to pick its slot).
- `picture`: "A radio that cannot listen" (envelope detector, microwatts, no clock; one-line reminders of what carrier sense and NAV are); "The router asks" (CTS-to-self as "keep quiet" to the Wi-Fi neighbours — one line on what a CTS is —, then the trigger that opens slots; `watch` jump to the first trigger); "Picking a slot at random" (ABOC in plain words, why two tags can pick the same slot; `watch` jump to the first lost response); "An acknowledgement is also a clock" (the Acks pace the slots because a tag cannot count time); "What a tag never does" (no CCA_BUSY, no backoff, no IFS records — the record names are allowed).
- `numbers`: the "first round on the AP's lane" table (moved intact); the round formula block (4190 µs, 4.19 %); the "second of polling" paragraph (ten rounds, forty slots, sixteen Acks naming a tag, 10/8/2); the ACW/ABOC arithmetic paragraph; one short "link margin" paragraph (−37.4 dBm vs −72 dBm; −57.4 dBm vs −94 dBm).
- `deeper`: the protection paragraph ("Protecting the round, and who ignores it") — it belongs to `amp-coexist` conceptually but is pinned here; keep it in deeper.
- `sources`: the old opening paragraph as bullets (P802.11bp draft status, 11-24/1613r20, 11-26/1519r5, 11-26/1889r4; the model values −72 dBm, 8 dB, 10 dB).
- `observe`: items 1 and 3 (the 10 µs gaps; the inspector step-through). `tryThis`: the deafened-Door-tag experiment. `quiz`: Q1 (why a slot) + one new plain question on why two tags sometimes lose (same draw) + Q on what an Ack for an empty slot names (the router itself).

**Content contract for `amp-ppdu` — "A frame a tag can hear" / "一帧标签听得懂的帧"** (module 7, 800–1 200 words):

- `why`: *A Wi-Fi radio and a battery-free tag cannot understand each other's signals. One speaks in finely shaped waveforms; the other can only tell loud from quiet. Yet they share the same air, and the router must talk to both in one breath. The frame that does this has two halves, and its length has very little to do with the data inside it.*
- `outcomes`: name the parts of a downlink AMP frame and say which half is for whom; explain why a four-byte acknowledgement takes hundreds of microseconds; predict which frame shrinks most when the data rate rises.
- `needs`: `['amp-intro']`. `terms` (≤ 6): OOK (on–off keying: the signal is either on or off, one bit per flash), Manchester (each bit is a flash-then-dark or dark-then-flash, so the receiver never loses the rhythm), preamble (the opening of a Wi-Fi frame every Wi-Fi radio recognises; here reminded, not new), AMP-Sync, AMP-SIG, padding.
- `picture`: "Two listeners, one frame" (legacy preamble for Wi-Fi radios, then the tag's part; `watch`: open the trigger in frame detail); "Loud or quiet, and nothing in between" (OOK and Manchester in plain words); "Why the frame is padded" (the tag needs time to think before answering); "Uplink: the mirror image" (no preamble, hence Wi-Fi only senses energy); "Small frame, long airtime" (fixed overhead dominates — the Ack).
- `numbers`: the trigger airtime formula (32 + 80 + 64 + 416 + 20 + 6 = 618 µs) with its note; the "three AMP frames" table; the response-scaling paragraph (528 → 132 µs); the padding values (20 / 36 µs) in a two-row table with a cited cell; the Ack's 128 µs of 330 µs.
- `sources`: SFD sections for the PPDU format, 11-26/1519r5 §39.3.2.2 padding, the model AMP-SIG widths.
- `observe`: the old item 2 (the Ack at 1226 µs in frame detail; the empty-slot Ack at 2982 µs) + one on the trigger's segment strip. `tryThis`: the 1 Mb/s variant item (318 µs, 1670 µs, 1.67 %, CTS Duration 1620 µs). `quiz`: old Q2 (padding) and Q3 (330 µs Ack) + one on why Wi-Fi only energy-detects the uplink. `jumps`: `firstAmpTrigger`, first Ack naming a tag, first Ack for an empty slot.

- [ ] **Step 1: Split the tests first.** Move to `tests/course/amp-ppdu.test.ts`: the describe "standard constants" items about the PPDU (padding, downlink PPDU parts, uplink no preamble, the three frames' octets and airtimes, the scaling, the CTS-to-self length), "at 1 Mb/s the same round is 1670 µs", and from "what the UI shows" the Ack ID-field, the 128 µs of 330 µs and the trigger body pins. Keep in `amp-intro.test.ts`: the shape of one round (timeline table, 4190 µs, 3044/90/1056), a second of polling, the tags never carrier-sense, no NAV_SET, link budget, the deafened tag, the log lines, AMP SIFS. Add the shape block to both (as in Task 2, ≤ 20 minutes).

- [ ] **Step 2: Run** both test files → FAIL.

- [ ] **Step 3: Write the two lessons**, register, order, remove `'amp-intro'` from `MIGRATING`.

- [ ] **Step 4: Hashes** — exactly `amp-ppdu` and `amp-ppdu#0` added, equal to `amp-intro` / `amp-intro#0`.

- [ ] **Step 5: Gates** as Task 2.

- [ ] **Step 6: Commit** `feat(course): amp-intro rewritten zero-to-hero — a tag with no battery; the PPDU split into amp-ppdu`.

---

