# B1 review — radio-primer, frame-anatomy, frame-anatomy-bytes

Reviewed at HEAD (9b1c187), diffing `c395e14..HEAD` over the six paths. B1's
work landed in 70ed2be (swept into B2's commit, per B1-report.md) with naming
fixes in b23e991; both are on the current branch tip.

## Method

1. Read `steps` blocks against the engine: `src/engine/propagation.ts`
   (`pathLossDb`, `wallLossDb`, `rxPowerDbm`), `src/engine/phy.ts`
   (`noiseDbm`, `txTimeModeNs`, `txTimeNs`), `src/engine/channel.ts`
   (`interferenceMw`, `resolveLock` — the mW-then-dB SINR sum),
   `src/engine/mac.ts` (`buildDataFrame`, `assignSeq`) and
   `src/model/frameFields.ts` (`dataMpdu`).
2. Hand-derived every quoted number from those functions rather than from the
   lesson prose.
3. Ran `npx tsx scripts/lesson-dump.ts <id> en|zh` for all three and read them
   as a first-time reader / as Chinese prose.
4. Diffed the pin lists in the three test files against the claims above.
5. `MECHANISM_INCLUDE=radio-primer,frame-anatomy,frame-anatomy-bytes npx
   vitest run tests/course/readability.test.ts tests/course/radio-primer.test.ts
   tests/course/frame-anatomy.test.ts tests/course/frame-anatomy-bytes.test.ts`
   and `npx tsc -b --noEmit`.

## 1. Procedure vs. engine

**radio-primer**, "The whole budget, step by step" (six steps: tx power →
`pathLossDb` → `wallLossDb` → `noiseDbm` → SNR → SINR via the mW sum).
Matches `rxPowerDbm` (`propagation.ts:68`: `txDbm - pathLossDb(d) -
wallLossDb(a,b,walls)`) in the same order, `noiseDbm` (`phy.ts:58`), and
`interferenceMw`/`resolveLock` (`channel.ts:759`, `698`: noise floor in mW,
interferers summed in mW, then converted back to dB for the SINR). Correct.

**frame-anatomy**, "Building one frame, step by step" (kind → direction bits →
Duration → addresses → sequence number → QoS bytes/body/FCS). Matches
`dataMpdu` (`frameFields.ts:192`) field order exactly: `fcField` (kind +
toDs/fromDs) → `duration` → `addrs` → `seqCtl` → `qos` (if present) → `body`
→ `fcs`. `assignSeq` (`mac.ts:1107`, "gets its sequence number on its first
transmission and keeps it on every retry") matches step 5's "gives out the
next value on the first attempt only ... a repeat carries the same number."
Correct.

**frame-anatomy-bytes**, "From bytes to microseconds, step by step" (bytes →
bits with SERVICE+tail → ÷N_DBPS rounded up → preamble+symbols → what a newer
radio changes → step 1 redone with the mark). Matches `txTimeModeNs`
(`phy.ts:236`): `nsym = ceil((16 + 8*lengthBytes + 6) / ndbps)`, `return
m.preambleNs + ... + m.symNs * nsym`. Correct.

No place where the engine disagreed with a lesson claim.

## 2. Worked examples, re-derived

- **12.16 dB SINR**: `mw(noiseDbm(20)) = 3.99e-10`, `mw(-85) = 3.16e-9`, sum
  `3.56e-9 mW = -84.48 dBm`; RSSI at 9 m + 1 brick = `15 - pathLossDb(9) -
  12 = -72.33 dBm`; `-72.33 - (-84.48) = 12.15…` → rounds to 12.16 dB as
  quoted. Reproduces.
- **Duration 16 + 28 = 44 µs**: `txTimeNs(ACK_BYTES=14, 24) = PREAMBLE_NS
  16000 + SIGNAL_NS 4000 + SYM_NS*ceil((16+8*14+6)/96) = 16000+4000+8000 =
  28000 ns`; `SIFS_NS(16000) + 28000 = 44000 ns`. Reproduces.
- **24 + 1500 + 4 = 1528 B**: `MAC_HDR_BYTES(24) + payload(1500) +
  FCS_BYTES(4)`. Reproduces (`field(m,'body').bytes === 1500` pinned).
- **57 symbols, 20 + 57×4 = 248 µs**: `ceil((16 + 8*1528 + 6)/216) =
  ceil(12246/216) = ceil(56.694…) = 57`; `20 + 57*4 = 248`. Reproduces. The
  claim that the QoS-marked frame (1530 B) still rounds to 57 also
  reproduces: `ceil((16+8*1530+6)/216) = ceil(12262/216) = ceil(56.768) =
  57`.

All four worked examples reproduce exactly. No Important finding here.

## 3. Beginner read, both languages

Read `radio-primer` cold in both languages: the picture (voice in a room →
two numbers → what the trip takes → interference) is followable with no
prior Wi-Fi knowledge, and the six-step "whole budget" block in `numbers`
closes it concretely without ever pointing at an unnamed quantity. The
lesson no longer uses margin/余量 anywhere (`grep` over all three files
turns up the word only inside a `/**` comment, not in learner-facing text);
SNR and SINR carry the "how far above the noise" idea instead, and step 6
performs the mW-then-dB conversion explicitly rather than gesturing at "the
neighbour's share." This reads as an improvement, not a loss — the reader
never needed the word margin here, only the two ratios.

`frame-anatomy` and `frame-anatomy-bytes` read the same way: MAC/PHY, FCS/CRC,
QoS, L-STF/L-LTF/L-SIG/U-SIG are all named right where the analogy
introduces them, in both languages, matching the "naming fix round" the
report describes.

Chinese: both lessons read as written Chinese, not translated English —
verb-final constructions (“做成的这个包裹就是 MPDU”), no dangling 的/是 chains,
full-width quotes throughout. I could not find a sentence in either language
that points at a quantity it never names (deliberately grepped for 之类/这笔账/
留在手里/不含余量/那笔账 across all three files — none found outside the
grader's own `SHORTHAND` list in the test file).

No Important or Minor finding here.

## 4. Pins

Checked every claim listed in section 2 against
`tests/course/radio-primer.test.ts`, `frame-anatomy.test.ts` and
`frame-anatomy-bytes.test.ts`: each is pinned against the named engine
function or the record it names, not asserted from prose. Two of the three
files go further and re-run the rule over the whole scenario rather than one
row:

- `radio-primer.test.ts` "the procedure holds at all four places" re-derives
  RSSI/SNR by hand at all four `PRIMER_DISTANCES` against `buildLinkTable`.
- `frame-anatomy.test.ts` "step 2 holds in the other direction too, and step
  6 on a marked frame" checks direction bits and header+body+FCS = frame
  bytes for every single-MPDU data frame in the run.
- `frame-anatomy-bytes.test.ts` (per B1-report.md) re-runs steps 1–4 for
  every PPDU of the run across nonht/vht/he.

I re-ran the shared index: `tests/fixtures/lesson-hashes.json` lines 13–14
confirm `frame-anatomy` and `frame-anatomy-bytes` share the recorded hash
`27f82e3c`, matching the claim that the split adds no scenario.

Pre-existing pins (the address-role table, the four-kinds-of-traffic table,
the noise-floor-by-width table, the try-this distances, etc.) are all still
present and still pinned; nothing was dropped in the rewrite.

No Important or Minor finding here.

## 5. Rules / budgets

`MECHANISM_INCLUDE=radio-primer,frame-anatomy,frame-anatomy-bytes npx vitest
run tests/course/readability.test.ts tests/course/radio-primer.test.ts
tests/course/frame-anatomy.test.ts tests/course/frame-anatomy-bytes.test.ts`:
66 tests across the three lesson files pass; `readability.test.ts` is
878 tests with exactly one failure, in `txop-protect` (`numbers: expected
604 to be less than or equal to 550`) — a different lesson, currently being
edited by another batch per `git status` (`M src/course/tier2/txop-protect.ts`
is unstaged, outside B1's six paths). Not B1's regression.

`npx tsc -b --noEmit`: clean.

Budget lines reproduced by `lesson-dump.ts`, matching B1-report.md exactly:

- `radio-primer`: picture 423/900 · numbers 274/550 · practice 296/450 ·
  total 993 (opener ceiling 1000, prose window 700 — actual prose
  993−296=697).
- `frame-anatomy`: picture 660/900 · numbers 539/550 · practice 368/450 ·
  total 1567 (prose window 1200 — actual prose 1567−368=1199, one word of
  headroom left).
- `frame-anatomy-bytes`: picture 645/900 · numbers 509/550 · practice
  365/450 · total 1519 (prose window 1200 — actual prose 1519−365=1154).

Nothing I found requires an addition, so the "what comes out to pay for it"
question does not arise. If a future pass needs to add anything to
`frame-anatomy`'s prose, the one-word margin means something must be cut
first; `frame-anatomy-bytes` still has ~46 words of headroom and
`radio-primer` has the most slack of the three.

## Findings

**Minor** — `tests/course/frame-anatomy.test.ts:80-87`, the comment inside
`'the three jump targets are the ones this half's text uses, in order'`:
`// Step review, Minor: the RTS / A-MPDU / BlockAck buttons are
frame-anatomy-bytes' — three acronyms of later lessons on the jump bar of
lesson 4. This half keeps only the frames its own text walks the reader
through.` This reads as a leftover self-review note (documenting an issue
already fixed by the split) rather than a comment explaining the test to a
future reader. Nothing to fix in the lesson; consider trimming the comment
to state what the test checks, not the history of getting there.

**Minor** — `src/course/tier1/frame-anatomy-bytes.ts`, `numbers` steps block,
item 5 ("A newer radio changes only the two sizes: a 44 or 48 µs front, and
a symbol of 13.6 µs that carries many more bits." / 「更新的射频只改这两个尺寸……」).
This is accurate (it names the two fields `PHY_MODES` varies per generation)
but it does not advance the running numeric example the way steps 1–4 and 6
do — it is a generality sandwiched between "so the frame is on the air for
248 µs" (step 4) and "now redo step 1 with the traffic mark" (step 6), so a
reader following the worked numbers loses the thread for one step before
step 6 picks it back up. Not incorrect and not required to fix — flagging
because it is the one place in the three lessons where a `steps` item is not
itself a step of the worked calculation. If trimmed for budget, this is the
item that could go (folded into the "what the trip takes" style note beside
the formula instead), freeing a small amount of headroom.

No Important findings.

## Verdict

PASS.
