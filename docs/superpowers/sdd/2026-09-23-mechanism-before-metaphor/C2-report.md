# C2 — width, streams, rate, rate-fallback

Base 880f9c7 (graded against HEAD dc6a280, which moved under me). Four lessons rewritten to the
2026-09-23 amendment; scenario builders, variants and jumps untouched, so every recorded timeline
hash is byte-identical and the `rate` / `rate-fallback` fixture pair is still one run twice.

Grading: `MECHANISM_INCLUDE=width,streams,rate,rate-fallback npx vitest run tests/course/readability.test.ts`
— all four green. `npx vitest run tests/course` → 2155 passed, 3 failed, and all three failures are
other implementers' in-flight lessons (`capstone` ×2, `mlo` ×1), none of them a file of mine.
`npx tsc -b --noEmit` clean.

## Budget lines (`npx tsx scripts/lesson-dump.ts <id> en`)

```
width            picture  636/900 · numbers  527/550 · practice  398/450 · total 1561 (25 min)
streams          picture  550/900 · numbers  379/550 · practice  338/450 · total 1267 (20 min)
rate             picture  557/900 · numbers  447/550 · practice  371/450 · total 1375 (25 min)
rate-fallback    picture  601/900 · numbers  272/550 · practice  374/450 · total 1247 (20 min)
```

No split needed. `width`'s numbers section is the tight one at 527/550; anything added there later
has to come out of the two existing tables.

## width

**Procedure** (`numbers`, six steps, "What a width actually changes, step by step"), read out of
`negotiatedWidth` (src/model/caps.ts), `noiseDbm`, `reqSinrDb`, `RATE_MARGIN_DB`, `mcsForRssi`,
`toneRatio` and `txTimeModeNs` (src/engine/phy.ts), in the order `simulation.ts`'s `mcsForPeer`
and `mac.ts`'s `exchangeNs` call them:

1. the link runs the narrower of the two ends' widths;
2. noise floor at that width = kTB over that bandwidth + the receiver's noise figure (−93.99 dBm at
   20 MHz, +3.01 dB per doubling);
3. SNR = RSSI − that noise floor;
4. highest rung whose required SINR + the 3 dB rate margin fits the SNR — the requirement itself
   never depends on the width (`reqSinrDb` takes no width);
5. bits per symbol = the rung's 20 MHz bits per symbol × the width's sub-carrier ratio;
6. symbols = the frame's bits ÷ that, rounded up to a whole symbol; airtime = 48 µs + 13.6 µs × symbols.

**Worked example**: the living-room laptop at 80 and 160 MHz, row by row, ending in 170.4 µs and
224.8 µs — which is exactly where the old 这笔账 sentence stood. The inversion is now mechanical:
at 160 MHz the SNR is 14.45 dB and MCS 1 asks 14.99 dB, so it misses the rung above by 0.54 dB and
lands two rungs below what 80 MHz holds.

**Pointer phrase**: 这笔账 gone; the paragraph now names the noise floor and says the width doubles
the noise power it takes in. (The English "bill"/"goods" image survives, with the quantity named.)

**Naming**: `channel width` ("…is the channel width"), `sub-carrier` ("each one is a sub-carrier"),
`symbol` ("each chunk is a symbol"), `noise floor` ("…when nobody is talking is the noise floor");
"a station (STA)" in the third outcome; "the router — this flat's access point (AP)" in the watch
block. No new terms; still four.

**Pins added** (tests/course/width.test.ts, `proseMax` 880 → 1200): one test walks the worked
example against the engine — `negotiatedWidth`, `noiseDbm(20/40/80/160)`, the link's own RSSI
(−70.51 dBm), `mcsForRssi` at both widths, `reqSinrDb + RATE_MARGIN_DB` for the chosen rung and the
one above it, the 0.54 dB miss, `PHY_MODES.eht.ndbps × toneRatio`, the 12 262-bit payload, the
symbol counts and both airtimes, plus the two airtimes the run itself produces.

## streams

**Procedure** (`numbers`, five steps), from `negotiatedNss`/`nssOf` (src/model/caps.ts) and the
`nss` factor in `txTimeModeNs`: the link takes the smaller stream count of the two ends; the rung is
chosen exactly as in `width` and the stream count is not an input to it (`mcsForRssi` takes a width,
never an `nss`); bits per symbol × the stream count; whole-symbol rounding, so a stream that only
trims a part-filled symbol buys nothing; airtime = the same fixed opening plus 13.6 µs a symbol.

**Worked example**: "4 streams" against "Router 4 · Phone 2", ending in 75.2 µs and 88.8 µs.

**Naming**: `antenna` now introduced as "one such element is an antenna" (the old first use was
"the two ends' antenna counts" in an outcome, which named nothing); `spatial stream` already carried
its naming clause. No new terms.

**Pins added** (tests/course/streams.test.ts, `proseMax` 700 → 1000): `nssOf` for both ends of both
variants, `negotiatedNss` = 4 and 2, `mcsForRssi` = 13 for the link regardless, the bits per symbol
arithmetic as the table prints it, the rounding, both airtimes from `txTimeModeNs` and the mixed
pair's airtime on the timeline. 噪声底 → 噪声地板 in two Chinese strings (one name per thing).

## rate

**Procedure** (`numbers`, five steps, "The loop, as the engine runs it"), read out of
`RateControl` (src/engine/rate.ts) and its call site in `simulation.ts`: the ceiling is recomputed
before every frame and capped by what the two ends negotiated; the per-peer working rung is clamped
down to the ceiling on every use; one outcome per attempt; two counters that zero each other; two
failures in a row → one rung down, failure count back to zero (so four failures cost two rungs);
ten successes in a row → one rung up, never above the ceiling, count back to zero.

**Worked example**: the far link value by value — RSSI −75.46 dBm, noise floor −93.99, SNR 18.53 dB,
MCS 2 asks 16.99 ✓ / MCS 3 asks 19.99 ✗ → ceiling MCS 2 — and then its first excursion: attempts
192 and 193 unanswered, attempt 194 goes out at MCS 1 (768.8 µs), ten answered frames to climb back.

**Engine over prose (correction)**: the old lesson said the near station sends "every one of them at
its own MCS 11 ceiling", which reads as a signal limit. It is not. `mcsForPeer` passes
`cap = 11` when the pair has not negotiated 4096-QAM, and `rateScenario` gives both ends only
`edca`; the link's 58.7 dB SNR would carry MCS 13. The lesson now says so and the claim is pinned
(`negotiated(sta, ap, 'qam4k') === false`, `mcsForRssi(…, 11) = 11` against `mcsForRssi(…, 13) = 13`).

**Naming**: `ceiling` ("…is the ceiling"; the outcome that used the word before the picture was
reworded), `attempt` ("One sending of a frame is an attempt"), 两台站点（STA）, 接入点（AP）.
A fourth outcome was added for stepping the loop by hand (the cap is four).

**Pins added** (tests/course/rate.test.ts, `proseMax` 700 → 1050): the ceiling arithmetic against
`buildLinkTable` / `noiseDbm` / `reqSinrDb` / `RATE_MARGIN_DB` / `mcsForRssi`; the capability cap;
the first frame at the ceiling; a lone failure moving nothing; the first consecutive pair and the
rung and airtime of the frame after it; the ten answered frames that bring it back, all at MCS 1.

## rate-fallback

**Procedure** (`picture`, the existing steps block rewritten from four items to five, from the
sender's side): send and wait 45 µs (`ACK_TIMEOUT_NS`); one failure zeroes the success count and
retries at the same rung; the second in a row drops a rung, zeroes the failure count and makes the
next frame longer while the channel is busy for all of it; every answered attempt zeroes the
failures — nine buy nothing, the tenth lifts the rung, never above the ceiling; one failure anywhere
in the climb throws the count away.

**Worked example** (`numbers`): one trip to the bottom rung step by step — 524.0 → 768.8 → 1,476.0
µs down, ten answered frames a rung back up — ending in what the shortest such trip in this run cost:
ten frames, 14.8 ms, against 5.2 ms at the ceiling.

**Naming**: 站点（STA） in `why`, 接入点（AP） at the first mention in the picture. No new terms;
the corrected failure figures were left exactly as they were — 337 real failures, of which 254 end
in an ACK-timeout record and 83 do not, and a per-attempt loss rate that is flat across the rungs
(11.1 / 11.8 / 11.1 %). Nothing of the old "loss falls with frame length" claim was reintroduced.

**Pins added** (tests/course/rate-fallback.test.ts, `proseMax` 700 → 950): `ACK_TIMEOUT_NS = 45 µs`;
every lone failure in the run leaves the next frame on the same rung (>50 cases); every climb in the
run happens on a multiple of ten answered frames and never before ten; the three airtimes and the
14.8 ms / 5.2 ms of the worked table.

## Concerns for the controller

1. **RULE BUG — six literal BACKSPACE bytes (0x08) in tests/course/readability.test.ts.** Same class
   as ef74e20, but in regex literals rather than a template literal: the source of lines 371, 374 and
   485–488 contains `\x08` where `\b` was meant. That makes these rules grade **vacuously**:
   - the Tier-2 name sheet's `/<BS>routers?<BS>/i` (English "router" ban) and `/<BS>AP<BS>/`
     (bare-AP-in-Chinese ban) — nothing can ever match them;
   - the English half of all four `QUANTITIES` regexes (`margins?`, `sensitivit(y|ies)`,
     `thresholds?`, `noise floors?`); only the Chinese alternatives still fire.
   Find them with `grep -n $'\x08' tests/course/readability.test.ts`.
2. **A real conflict is hiding behind that bug.** Once `/<BS>AP<BS>/` is repaired to `/\bAP\b/`, the
   Tier-2 rule ("no `AP` in Chinese") and amendment rule 4 ("the first 接入点 carries （AP）") become
   mutually unsatisfiable for every Tier-2 lesson whose scene labels the node `AP` — `rate`,
   `rate-fallback`, `mlo`, `ofdma-*`, `capstone`. I followed the brief and wrote 接入点（AP）, so
   those two lessons will turn red the moment the backspace is fixed unless the rule is narrowed,
   e.g. `/(?<![（(])\bAP\b/`, which still catches a bare AP but allows the gloss in brackets.
   (`width` and `streams` are `ROUTER_LABELLED`, so their Chinese says 路由器 and they are unaffected;
   their English watch block carries "access point (AP)".)
3. `proseMax` was raised per lesson again (1200 / 1000 / 1050 / 950) — the same carry B1 reported.
   It wants centralising at the track review; the real ceiling is `BUDGETS` and this argument now
   only duplicates it.
4. Nothing else the engine contradicted, and no pin was lost: every figure the four lessons had
   before is still pinned, and `rate` / `rate-fallback` still load the identical scenario.
