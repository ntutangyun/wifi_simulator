# C4 — Wi-Fi Tier 2 wave 2: `rate` (+ `rate-fallback`)

Commit `21b9c64` — `feat(course): rate on the readability contract — rate-fallback split from rate`.

## Split: yes

`rate` was 2 009 words carrying two ideas a reader wants to stop between, and the pin
inventory (the three airtimes and rate lines, the ceiling, the 25 excursions and their six
bottom-rung runs, the per-rung attempt counts, the 2 666 freezes, the neighbour's hold
times, the airtime tax, the near station, two whole experiments, the multi-user reporting
note) does not fit under 1 300 words with `numbers` ≤ 350 without dropping claims.
Taken as plan ruling 2 allows:

- **`rate` — "Rate control — picking how fast to talk"**: why a fixed speed is wrong both
  ways, the ceiling the signal sets, and the single scrap of news a sender has (answered
  or not). Keeps the id and `rateScenario()`.
- **`rate-fallback` — "Rate fallback — how the sender climbs and falls"** (NEW): the
  two-down/ten-up rule, the asymmetry, where the failures come from, and what an excursion
  costs the room. Reuses `rate`'s builder, no variant, so the fixture line is a copy.

Registered exactly as the brief allows: one import + one entry in `src/course/lessons.ts`,
`'rate-fallback'` right after `'rate'` in `COURSE_ORDER`, and
`"rate-fallback": "3e219398"` (= rate's) in `tests/fixtures/lesson-hashes.json`. `rate` has
no variants, so there are no `#n` lines.

## Budget lines

```
rate             picture  539/650 · numbers  152/350 · practice  368/400 · total 1059 (20 min)
rate-fallback    picture  510/650 · numbers  181/350 · practice  373/400 · total 1064 (20 min)
```

Both tests assert `proseMax: 700` (each is 691).

## Terms and needs

| | terms | needs |
|---|---|---|
| `rate` | `ceiling`, `attempt` | `decode-thresholds`, `retries-queues`, `bianchi-vs-sim`, `width` |
| `rate-fallback` | `ARF`, `excursion` | `rate`, `anomaly` |

`rate control` and `capture` were drafted as terms of these two lessons and then given up:
`bianchi-vs-sim` already owns both, and the contract's prerequisite-closure test requires
the owner to be reachable. `bianchi-vs-sim` therefore joins `rate`'s `needs` (it is Tier 1,
M2, and precedes), which puts `capture` in `rate-fallback`'s closure through `rate`.
MCS comes from `decode-thresholds`, ACK / ACK timeout / CW / backoff through
`retries-queues`, `performance anomaly` from `anomaly`.

## Pins

The old lesson had **no test file of its own and no `.body!` site anywhere** — its pins lived
in `tests/course/quoted-timestamps.test.ts` (4 `it` blocks) and one shape check in
`tests/course/lessons.test.ts`. Both files are untouched and stay green: they read
`l.scenario()`, never prose, and the builder is unchanged.

Moved into `tests/course/rate.test.ts` with their sentences: the three rungs
(524.0 / 768.8 / 1 476.0 µs, 25.8 / 17.2 / 8.6 Mb/s), the 2.8× ratio, the ceiling
(max MCS 2), the near station (4 010 frames, all MCS 11, no ACK timeout), and both
experiments (half a metre frame-for-frame identical; two metres → MCS 3 and 3 712 vs
3 003 frames; five metres → no bottom rung). Added: the share column (79.8 / 17.2 / 3.0 %),
1 530 octets, and the scene's geometry (one metre / far corner / a wall).

Moved into `tests/course/rate-fallback.test.ts`: the 25 excursions and the six bottom-rung
runs (10, 10, 10, 13, 19, 28), the per-rung attempt counts (2 396 / 517 / 90), the
no-collision/capture claims, the 2 666 freezes all resuming at their own value, the hold
times (615.0 / 859.8 / 1 579.0 / 964.0 µs), the airtime tax (607 frames, 20.2 %, 29.7 %,
530.3 vs 318.1 ms, 212.2 ms, 7.1 %) and the third-uploader experiment (26.3 % vs 3.0 %, the
other three spots 36–43 %). Added: a replay of the four rules over the whole run — the
state machine reproduces all 3 003 attempts' MCS exactly — and "a change is always one rung".

## Correction found while pinning (please read)

The old lesson's per-attempt loss rates (**8.7 % / 7.5 % / 6.7 %**, "the longest frames are,
if anything, the least often lost") count **only `ACK_TIMEOUT` records**. That is 254 of the
far station's **337** actually-failed attempts; the other 83 are declared at the end of a
reception that was already under way when the answer came due (a `RETRY` with no
`ACK_TIMEOUT`). The engine's `onFailure` fires for all 337 — replaying ARF over the
timeout subset diverges from the run within 180 ms, and over all 337 it reproduces the run
attempt for attempt.

Counted whole, the rates are **11.1 % (ceiling) / 11.8 % (MCS 1) / 11.1 % (MCS 0)** — flat,
not falling with frame length. The lesson now says that, the death-spiral argument is
unchanged and if anything stronger (MCS 1 is still the worst, so the quiz answer stands),
and `deeper` states the 337 / 254 / 83 split so a reader can reconcile what they see on the
timeline. `quoted-timestamps.test.ts` still pins the 8.7/7.5/6.7 timeout subset and is
still green; **its comments now describe prose that no longer exists** and should be
re-worded by whoever owns that file.

## Not carried over / moved

- The multi-user outcome reporting paragraph (169 PPDUs, 492 parts, 620 / 128 / 492 / 597 /
  23) → `rate`'s `deeper`. Its pin already lives in `quoted-timestamps.test.ts` against the
  `mumimo` scene and is untouched.
- "Production drivers run a moving-window packet-error estimate instead" and the
  backoff-freeze/engine-exception argument → `rate-fallback`'s `deeper`.
- All clause numbers (§10.23.2.4, §10.3.2.9, §17.4.3, Clause 36), the ARF provenance
  (Kamerman & Monteban 1997) and the model choices (45 µs ACK timeout, the rate margin,
  the capture model) → `sources`.

## Verification

- `npx tsc -b --noEmit` clean.
- `npx vitest run tests/course/rate.test.ts tests/course/rate-fallback.test.ts` — 34 tests,
  all green.
- `READABILITY_INCLUDE=rate,rate-fallback npx vitest run tests/course/readability.test.ts` —
  both lessons pass every contract rule.
- `npx vitest run tests/course` — 1 722 passed, 4 failed, none of them mine:
  `readability > MIGRATING bookkeeping (txop-protect)`, two in `airtime.test.ts` and one in
  `tier1-project.test.ts`, all from other implementers' in-flight edits to Tier 1 files
  (`git status` shows those files dirty and unstaged by me).
- Rendered and read with `scripts/lesson-dump.ts` in `en` and `zh`.
