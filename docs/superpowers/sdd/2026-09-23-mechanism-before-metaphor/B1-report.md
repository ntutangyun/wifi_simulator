# B1 — radio-primer, frame-anatomy, frame-anatomy-bytes

## Commit — read this first

**All six of B1's files are in commit `70ed2be`, under batch B2's message**
("fix(course): say what nav's frozen 3 is where the table prints it"). This worktree has one
shared git index: my six paths were staged when B2 ran a bare `git commit`, which swept them in.
Nothing of mine was lost or altered — `git diff HEAD` over my six paths is empty — and per the
batch brief I did not amend or reset. There is no second SHA: B1 has no commit of its own, and
its message (the one I had written for it) never landed. The ledger entry for B1 is `70ed2be`,
files 3–8 of 8.

Batch B1 of the "mechanism before metaphor" rollout. Base de14765, branch feat/uwb-ranging.
Grader used throughout:
`MECHANISM_INCLUDE=radio-primer,frame-anatomy,frame-anatomy-bytes READABILITY_INCLUDE=… npx vitest run tests/course/readability.test.ts`
— 850 passed, 0 failed for the three lessons.

## radio-primer

Budget line: `radio-primer picture 423/900 · numbers 274/550 · practice 296/450 · total 993 (993 words, 20 min)`
(opener ceiling 1000; prose window 700 in its own shape suite, now 696.)

**The procedure** — `numbers`, "The whole budget, step by step" / "整条链路，一步一步算", six steps,
the order `buildLinkTable` → `rxPowerDbm` (src/engine/propagation.ts) and then the channel take it:

1. the sender's transmit power (15 dBm, the scenario's own);
2. path loss, `pathLossDb`: `PL0_DB` 46.7 dB in the first metre and `PL_EXP` 3.0, i.e. 30 dB per
   tenfold — 75.3 dB at 9 m;
3. `wallLossDb` along the straight ray: `WALL_LOSS_DB` plasterboard 5, brick 12, glass 3 — one
   brick wall here, leaving the RSSI −72.3 dBm;
4. `noiseDbm(width)`: −174 dBm/Hz + 10·log10(W) + `NOISE_FIGURE_DB` 7 → −93.99 dBm at 20 MHz;
5. RSSI − floor = SNR, 21.66 dB;
6. the neighbour added to the floor as power, not decibels (`Channel.detectOrMiss` /
   `resolveLock` sum in mW): −85 dBm makes −84.48 dBm, so the SINR is 12.16 dB.

The old steps block stays in `deeper` as the mW-by-mW arithmetic (heading renamed from
"邻居那一笔" to "把邻居加到地板上：换成毫瓦再算" — "那一笔" was the same pointer flavour the rule
is about). The worked example is carried by the steps themselves (every step names the
living-room laptop's value and the block ends in the answer) plus the existing four-place table,
rather than a seventh block: at 993/1000 words there was no room for one, and the second new
test re-runs steps 1–5 at all four places instead.

**margin / 余量 — the decision asked for in the dispatch: the lesson stops using the word.**
It was used twice on the main path (the widget caption, and the neighbour paragraph) and twice
in the practice, always meaning "how far the signal stands above the noise" — which is exactly
what this lesson's own SNR and SINR entries define. Adding a fourth terms entry would have spent
the opener's last term and ~15 of its last 7 words on a synonym; the three ratio words stay as
the owner table has them (the test still pins `['RSSI','SNR','SINR']`). `rate margin` (3 dB)
stays where it belongs, as decode-thresholds' own term. The SNR gloss gained "noise floor /
噪声地板", which step 4 now uses on the main path (rule 2).

**Cuts that paid for the procedure** (nothing was compressed *out*; the duplicated prose was
compressed): the "And when the neighbour joins in" paragraph became step 6; the wall prices left
the path-loss note for step 3; `why`, the opening analogy, the watch block, two quiz explains and
three practice items were tightened by a word or two each.

**Pins added** (tests/course/radio-primer.test.ts, "the budget as a procedure"):
each step against the engine function it names — `pathLossDb(1)`, 30 dB per decade,
`pathLossDb(9)`, `wallsCrossed` = `['brick']`, the hand-run budget against
`buildLinkTable(...).get('sta-1').get('ap')`, `noiseDbm(20)`, the SNR, the mW sum and the SINR —
and a second test that re-runs steps 1–5 at all four distances against the link table and the
four-place table, so the rule is pinned and not one row.

## frame-anatomy

Budget line: `frame-anatomy picture 645/900 · numbers 539/550 · practice 368/450 · total 1552 (1552 words, 20 min)`
(prose window raised 1000 → 1200 in its own shape suite, as decode-thresholds' is.)

**The procedure** — `numbers`, "Building one frame, step by step" / "造出一帧，一步一步来", six
steps, the order `MacSta.buildDataFrame` (src/engine/mac.ts) and then `dataMpdu`
(src/model/frameFields.ts) take it: kind (Data, or QoS Data when `qosWith(peer)`) → the To DS /
From DS bits from the direction → Duration (SIFS 16 µs + the answer, 44 µs) → the three addresses
from those two bits → the sequence number, given on the first attempt only and kept with the
repeat bit on a retry (`assignSeq`, `retryFlag = msdus.some(m => m.sent)`) → the QoS bytes, the
body, and last the FCS: 24 + 1500 + 4 = 1528 B. A table beside it runs the six on the old
laptop's first frame at 0 µs, value by value.

**Rule 4**: the first "access point" now reads "the router everything goes through (the access
point, AP)" / "接入点（AP）", and the first "station" "a client radio (a station, STA)" /
"站点（STA）".

**Pins added** (tests/course/frame-anatomy.test.ts): the six steps against the decoded first
legacy frame — subtype Data with `hasFeature(sta-1,'edca') === false`, To DS/From DS 1/0,
SIFS + `txTimeNs(ACK_BYTES,24)` = 44 µs, addr1/2/3 = ap/sta-1/ap with roles RA/TA/DA, `seqNo` 0
with the retry bit clear, body then FCS and 24 + 1500 + 4 = 1528 = `frame.bytes` — plus a second
test proving steps 2 and 6 over *every* single-MPDU data frame of the run (direction bits follow
the sender; header + body + FCS = the frame's bytes, with the marked header exactly two longer).

## frame-anatomy-bytes

Budget line: `frame-anatomy-bytes picture 634/900 · numbers 509/550 · practice 365/450 · total 1508 (1508 words, 20 min)`
(prose window raised 1000 → 1200.)

**这笔账 is gone from `why`**: "这一课来算这笔账" → "这一课就把字节数到微秒", which is what the
procedure then does.

**The procedure** — `numbers`, "From bytes to microseconds, step by step" / "从字节到微秒，一步
一步算", six steps, the body of `txTimeModeNs` (src/engine/phy.ts): bytes (24 + 1500 + 4 = 1528 B)
→ bits with the 16-bit SERVICE field in front and the 6 tail bits behind → ÷ N_DBPS (216 at
54 Mb/s), rounded up, 57 symbols → preamble 20 µs + 57 × 4 µs = 248 µs → what a newer radio
changes (44/48 µs front, 13.6 µs symbol) → step 1 redone with the mark, 1530 B, still 57 symbols.
A table runs it on the old laptop's first frame, ending in 248 µs.

**Rule 4**: the first "station" now reads "a client radio (a station, STA)" / "站点（STA）".

**Pins added** (tests/course/frame-anatomy-bytes.test.ts): each step against `PHY_MODES` and
`txTimeNs` with the recorded frame beside it, and a second test that re-runs steps 1–4 by hand
for *every* PPDU of the run, in its own mode and MCS, and lands on the `txTimeNs` the engine
recorded (nonht, vht and he all exercised).

## Other notes

- Nothing in the engine contradicted the lessons: every value the three lessons quoted was
  reproduced by the engine functions named above.
- Full-width quotes: `frame-anatomy` and `frame-anatomy-bytes` carried straight `"` in seven
  Chinese strings (pre-existing); those are now “ ”.
- Scenario builders, variants, jumps and `lesson-hashes.json` untouched.
- `npx tsc -b --noEmit` clean. `npx vitest run tests/course` shows one failure that is **not
  mine**: `retries-queues` numbers 552/550, a lesson another batch is editing in this same
  working tree right now (git status also shows anomaly, hidden and nav modified by others).
  My three test files and the mechanism grader over my three ids are green.

## Naming fix round (2026-09-23, after ef74e20)

Rule 4's checker had been blind (`\b` in a template literal), so B1 was reviewed
against a vacuous pass. With the checker fixed, these first uses named nothing
and were rewritten — one of the three admitted shapes each, in both languages:

- `frame-anatomy` · **MAC** — "The layer above hands a payload to the MAC — the
  part of the radio that wraps and addresses it." / 「交给 MAC——射频里负责加头、写地址的那一部分。」(gloss follows the name)
- `frame-anatomy` · **PHY** — "goes down to the PHY — the radio's signal-making
  part — which cannot just start sending bytes" / 「交给 PHY——射频里把它变成信号的那一部分——」
- `frame-anatomy` · **FCS** (ZH) — 「最后四个字节是 FCS」→「末尾的那四个字节就是 FCS」(naming clause)
- `frame-anatomy` · **CRC** (EN) — "a fixed piece of arithmetic, a CRC" → "a fixed
  piece of arithmetic that is the CRC"
- `frame-anatomy` · **QoS** — "carrying a QoS mark" → "carrying a traffic mark (the
  QoS field)" / 「写上一个业务标记（QoS 字段）」(brackets after the stand-in)
- `frame-anatomy-bytes` · **L-STF** (EN) — "a short repeating pattern, the L-STF" →
  "a short repeating pattern (the L-STF)"
- `frame-anatomy-bytes` · **L-LTF** — "Then a longer known pattern (the L-LTF), which
  the receiver measures the room with" / 「接着是一段更长的已知图案，也就是 L-LTF」
- `frame-anatomy-bytes` · **L-SIG** — "The next field is the L-SIG, and it tells the
  receiver two things" / 「接下来那个字段就是 L-SIG」
- `frame-anatomy-bytes` · **U-SIG** — "adds one more field (the U-SIG), which says
  what the newer format behind it really is" / 「之后才加上一个新字段，也就是 U-SIG」

No number, scenario, variant, jump or fixture changed; no pin changed.
`radio-primer` needed nothing — it already named every term where it pictured it.

**Budgets.** `frame-anatomy` went 18 words over the 1200-word prose window once the
MAC and PHY glosses were in, so the words came back out of the same two paragraphs
("puts a header in front and a check behind", "the parcel is the MPDU", "So it puts
a known pattern in front"). Final: `frame-anatomy` picture 660/900 · numbers 539/550
· total 1567; `frame-anatomy-bytes` picture 645/900 · numbers 509/550 · total 1519;
`radio-primer` unchanged at 993.

**Gate.** `MECHANISM_INCLUDE=<the seven> npx vitest run tests/course/readability.test.ts`
878/878, the seven lesson test files 130/130, `npx tsc -b --noEmit` clean.
