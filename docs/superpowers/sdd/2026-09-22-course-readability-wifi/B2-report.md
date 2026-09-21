# B2 report — Wi-Fi Tier 1 wave 2 (roles-stack, frame-anatomy + frame-anatomy-bytes)

Commit `ca9a420` on `feat/uwb-ranging`, 10 files, no file outside the dispatch.

## roles-stack — rewritten in place

- **Budget** `roles-stack picture 630/650 · numbers 270/350 · practice 400/400 · total 1300 (20 min)`
- **needs** `['radio-primer']`
- **terms** `BSS, BSSID, SSID, DS` — the three of the owner table, plus `DS`, because
  "everything goes through the middle" cannot be told without naming what the access point
  hands the payload to. Four terms, under the six-word cap.
- **Watch** block at picture index 2, jumping to *first relayed frame, hop 1*.
- **Register.** The stack is told in plain words — *payload*, *the frame the MAC builds*,
  *what is on the air* — because `MSDU`, `MPDU`, `PSDU` and `PPDU` belong to `frame-anatomy`,
  the next lesson, and the acronym rule forbids using a later lesson's words. Likewise `ACK`
  (airtime), `RTS`/`CTS` (hidden) and `SIFS` (ifs): the observations say "a short reservation
  frame", "acknowledgements", "16 µs".
- **Numbers, tabulated**: "One payload, four wrappings" (1400 B → 26 + 1400 + 4 = 1430 B →
  a batch of 50 → 125.6 µs at 20 MHz); "What each device is doing" (50 × 1500 B / 60 ms,
  1400 B / 0.85 ms, 1400 B / 1.4–1.7 ms, a fixed 50 µs to forward); the hop-by-hop `steps`
  block (1.4157 → 1.5413 → 1.5853 → 1.6353 → 1.8049 ms, 169.6 µs a hop, 389.2 µs door to
  door); "One hop or two" (about 0.7 ms against about 1.3 ms).
- **Moved to `deeper`**: the MAC–PHY primitive table and the record list, the LLC/SNAP note,
  the IBSS / TDLS / ESS / MLD cases, the three frame families, and the Phone A `RX_FAIL`
  note (its pin moved with it).
- **Moved to `sources`**: Clause 3 and §4.3, §5.2, §8.3, and the 50 µs forwarding as a model
  choice.
- **Pins**: every pin of `tier1-roles-stack.test.ts` survives, plus three new ones — the
  four-wrappings table (QOS_HDR_BYTES 26, FCS_BYTES 4, 1430 B, HE MCS 11, 20 MHz, 125.6 µs,
  the 50-frame batch), the 6 m between the phones behind the `RX_FAIL`, and the phones'
  1400 B arrival size. `.body!` retired: the hand-rolled word count is now `lessonShapeSuite`.
- **Nothing dropped.** The old lesson's every claim is either in the main path, in `deeper`
  or in `sources`.

## frame-anatomy — first half, rewritten in place

- **Budget** `frame-anatomy picture 635/650 · numbers 295/350 · practice 368/400 · total 1298 (20 min)`
- **needs** `['roles-stack']` · **terms** `MSDU, MPDU, PPDU, FCS, CRC, QOS` — six, so no
  other word is introduced. `RA`/`TA`/`SA`/`DA` are glossed in place (`RA (the radio that
  must answer)`), and the address-role cells are language-neutral, so both are exempt.
- **Watch** at picture index 2, jumping to *first legacy data frame*.
- **Moved to `deeper`**: the bit-by-bit Frame Control table (all twelve rows), the fourth
  address and the mesh case, the management frames. **`sources`**: §9.2.4.*, Table 9-30,
  Table 10-1, and the 44 µs as a measured value.
- **Pins kept here**: the Frame Control bits, the field key list and byte sizes, the uplink
  and downlink address roles, Duration 44 µs = 16 + 28 and the answering frame's field list,
  the QoS frame at 20.452 ms with TID 6, `TID_FOR_AC = [1, 0, 5, 6]`, the router's reply at
  20.596600 ms with every role reversed, the retransmission at 12.013 ms with the repeat bit
  and counter 11 against the original at 11.650 ms, the 12-bit counter range, both
  experiments (marking off → plain Data; Wi-Fi 5 → TID 0).

## frame-anatomy-bytes — new second half

- **Budget** `frame-anatomy-bytes picture 633/650 · numbers 301/350 · practice 365/400 · total 1299 (20 min)`
- **needs** `['frame-anatomy']` · **terms** `L-STF, L-LTF, L-SIG, U-SIG`, taught as "the part
  every radio can read". **Watch** at picture index 2. **Decoder kept**: both the watch block
  and the observations send the reader to "Fields on the air" and to the split PPDU bars.
- **Same scene, no new builder**: `scenario: frameAnatomyScenario`, no variant, so
  `sameSceneAs: 'frame-anatomy'` holds and the fixture line is a byte-for-byte copy
  (`"frame-anatomy-bytes": "27f82e3c"`).
- **Pins moved here with their sentences**: the preamble table (non-HT 20 µs = 16 + 4, 4 µs
  symbol, VHT 40, HE 44 + 4, EHT 48 + 4, 13.6 µs symbol), the phone's 44 µs + 13.6 µs layout
  and 57.6 µs, the TXTIME formula and N_DBPS 216 / 96, 24 + 1500 + 4 = 1528 and
  26 + 1500 + 4 = 1530 both at 57 symbols and 248 µs, the 14 B answer at two symbols and
  28 µs, the control-frame field lists and sizes (14 / 20 / 32 B, the 2 B BA Control and 10 B
  BA Info), the aggregate (14 subframes, 4 B delimiters, 2 B padding but the last,
  13 × 1536 + 1534 = 21 502 B, 2 248 µs), the reservation durations (2356, 2312, 48, 0 µs at
  2.298 ms and 4.650 ms) and `TID 1 · Implicit BAR`.
- **New experiments, both pinned**: raising the reservation threshold above 21 502 B (no
  reservation frame at all), and the old laptop as a Wi-Fi 5 device (aggregates behind a
  reservation).
- **`deeper`**: the airtime derivation ⌈(16 + 12 224 + 6) ÷ 216⌉ = 57, why the newer fronts
  are representative only, and the ack-policy bits inside an aggregate. **`sources`**:
  §17.3.2, §17.4.3, §9.3.1, §9.8, §36.3.12 and the model choices.

## Registration (the three lines the brief allows)

- `src/course/lessons.ts`: one import and one entry, right after `frameAnatomy`.
- `src/course/curriculum.ts`: `'frame-anatomy-bytes'` in `COURSE_ORDER`, right after
  `'frame-anatomy'`, same module 0.
- `tests/fixtures/lesson-hashes.json`: one line, equal to frame-anatomy's.

`tests/course/readability.test.ts` was **not** edited; grading used
`READABILITY_INCLUDE=roles-stack,frame-anatomy`.

## Tests

`READABILITY_INCLUDE=roles-stack,frame-anatomy npx vitest run tests/course` →
**1404 passed, 1 failed**, and the one failure is `retries-queues: expected true to be false`
in the migration bookkeeping — another implementer's lesson, migrated in the shared worktree
while still listed in the controller-owned `MIGRATING`. `tests/course/bianchi-vs-sim.test.ts`
also fails to collect (`bianchiVsSim.body is not iterable`) for the same reason. Neither
touches my files; my three suites are 57/57 green and `npx tsc -b --noEmit` is clean apart
from that implementer's `bianchi.test.ts`.

Two entries remain for the controller: `roles-stack` and `frame-anatomy` are still in
`MIGRATING`, so the bookkeeping test will name them until that list is trimmed.

## Concerns

- **`TIER1_BASELINE`** still stands, because `frame-anatomy` is in `MIGRATING`. Once both
  ids come off and the baseline goes, `HE`, `EHT`, `HT` and `VHT` have no owner in any Tier 1
  `terms`. This batch avoids them entirely (the tables say `802.11a`, `Wi-Fi 5/6/7`), but the
  step-5 deletion test asserts every ex-baseline word has an owner, so those four need a
  ruling — retire them from the baseline as protocol-generation names, or give them to a
  lesson.
- **`DS` as a term** is matched case-insensitively as a word prefix by the needs-honesty
  test. No migrated lesson's picture trips it today (checked), but a future paragraph opening
  a word with "ds" would. `ESS` was left out of `terms` for exactly this reason
  ("essentially" would have matched).
- **Study time** is at the ceiling: all three lessons land on 20 minutes with two `observe`
  items and two `tryThis`. A third observation pushes the formula to 25, which is why
  roles-stack's latency observation was folded into the burst one and frame-anatomy's two
  header observations were merged.

---

## Fix round 1 (review of `ca9a420`)

Both **Important** findings fixed, plus both **Minors**.

### Important 1 — English prose inside `N()` cells (EN/ZH parity)

`roles-stack` `numbers`: six cells that wrapped English prose in the
language-neutral helper are now bilingual, so the ZH dump has no English
mid-table. The reviewer named four; two more of the same class were found while
the file was open and fixed with them.

| cell | was | now (ZH) |
|---|---|---|
| "One payload, four wrappings" | `N('1400 B of video')` | `1400 B 的视频` |
| | `N('125.6 µs at 20 MHz')` | `20 MHz 下 125.6 µs` |
| "What each device is doing" | `N('50 × 1500 B every 60 ms')` | `50 × 1500 B，每 60 ms 一批` |
| | `N('a fixed 50 µs to forward')` | `转发固定 50 µs` |
| "One hop or two" *(also found)* | `N('about 0.7 ms')` | `约 0.7 ms` |
| | `N('about 1.3 ms')` | `约 1.3 ms` |

`N()` is kept only where `en === zh` genuinely holds: pure arithmetic
(`26 + 1400 + 4 = 1430 B`), bare counts (`1`, `2`) and the primitive names in
`deeper`. Verified by reading the ZH dump: the two `numbers` tables are now
Chinese throughout.

### Important 2 — "an access point contains a station"

The quiz said has-a where the standard (and this lesson's own `sources`) says
is-a. Fixed in EN and ZH:

- option 0: *"It is a station too, and it also gives the stations on it a way out
  through the DS"* / *"它本身也是一个站点，此外还为挂在它上面的站点提供一条经 DS 出去的路"*
- explanation: *"An access point is a station, with one job added; its own MAC
  address is the BSSID."* / *"接入点就是一个站点，只是多了一份差事…"*

The picture's opening paragraph was rewritten to teach the same relationship
rather than merely avoid it: *"Each of them is a station: the laptop, the phone,
the TV — and the access point too. What sets the access point apart is not a
stronger radio… It is a job the others do not have."* EN and ZH agree.

### Minor 1 — the decoder panel is now named

`frame-anatomy-bytes`'s watch block says *"opening \"Fields on the air\" on
each"* (ZH: `各自展开"空中字段"`), as `frame-anatomy`'s does, so a beginner
following it has the panel name in front of them.

### Minor 2 — the rest of that quiz block

Read through with the Important fix; the other two options and the two
neighbouring quizzes are unchanged and consistent.

### Paying for it

A bilingual cell costs its English words where a neutral cell cost one, so about
25 words were trimmed to stay inside the budget: the SSID and "everything goes
through the middle" paragraphs, the closing `numbers` line, one observation,
both experiments and two quiz explanations. No claim and no number was dropped.

### Budgets and gates after the fix

```
roles-stack          picture 614/650 · numbers 292/350 · practice 394/400 · total 1300 (20 min)
frame-anatomy        picture 635/650 · numbers 295/350 · practice 368/400 · total 1298 (20 min)
frame-anatomy-bytes  picture 630/650 · numbers 301/350 · practice 365/400 · total 1296 (20 min)
```

`npx vitest run tests/course/readability.test.ts tests/course/roles-stack.test.ts
tests/course/frame-anatomy.test.ts tests/course/frame-anatomy-bytes.test.ts` →
**536 passed, 0 failed** — the readability suite now grades all three ids for
real, since they came off `MIGRATING` at `6af7338`. `npx tsc -b --noEmit` → clean.
