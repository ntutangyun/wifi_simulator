# Batch C2 — `txop-protect` on the readability contract

Commit `1582f6b`, branch feat/uwb-ranging. Files touched: `src/course/tier2/txop-protect.ts`,
`tests/course/txop-protect.test.ts` (new). Nothing else — `lessons.ts`, `curriculum.ts`,
`readability.test.ts`, `lesson-claims.test.ts`, `quoted-timestamps.test.ts` and the fixture are
untouched (no split in this batch).

## txop-protect

Budget line (`npx tsx scripts/lesson-dump.ts txop-protect en`):

```
txop-protect     picture  627/650 · numbers  293/350 · practice  327/400 · total 1247 (1247 words, 20 min)
```

Was 1 004 words / 25 min in the old flat shape; now 1 247 main-path words and 20 minutes
(3 observe, 2 try-this — a third experiment would have pushed the formula to 25, so it moved to
`deeper`, see below).

- **needs**: `['nav', 'hidden', 'txop']` — `nav` owns NAV, `hidden` owns RTS/CTS and the hallway
  scene, `txop` owns the burst being protected.
- **terms** (3): `protection`, `CF-End`, `CTS-to-self`. **No word was taken from `edca`, `ampdu`
  or `txop`**: the readability test did not demand it, because the lesson is written in plain
  words ("the turn", "the burst", "the question", "the answer") and never uses the token `TXOP`
  in any checked field. The EN title says "the whole turn"; the ZH title was changed from
  "整个 TXOP" to "整轮" for the same reason. `CF-End` needs a term of its own (the log name is
  `CFEND`, which does not admit `CF-End`); `CTS-to-self` tokenises to `CTS`, which `hidden` owns.
- **`.body!` retired**: none — this lesson never had a test file, so there was no `.body!` site.
- **Scene**: builder and both variants byte-identical; `tests/fixtures/lesson-hashes.json`
  untouched.

### Pins

Every pin in `tests/course/lesson-claims.test.ts` ("lesson 10 · protecting the burst") and in
`tests/course/lessons.test.ts` stays where it is and stays green: the 300 ms table (46/21,
212/614, 112/47, 6/1), the reach of each policy's RTS, the 24-of-29 single-run census, the bare
3000 B threshold (21 → 80 collisions, 614 → 344 deliveries, the 1.9 ms MCS-0 frame), and every
timing of the observe list (0.736 ms / 2500 µs / 0.780 ms / 2456 µs / 3.264 ms / ≈2.90 ms /
376 µs / 2.976 ms / 28 µs). `quoted-timestamps.test.ts` never held this id.

New pins in `tests/course/txop-protect.test.ts` (13 tests), all measured on the 300 ms runs:

| Sentence | Pin |
|---|---|
| module, needs, the three terms | `module 2`, `['nav','hidden','txop']`, `['protection','CF-End','CTS-to-self']` |
| "the hallway house … threshold at 500 bytes" | scenario schema, `rtsThresholdBytes 500`, `txopProtection` per variant, variants differ in the policy and nothing else |
| the third column of both tables | multiple ≡ boundary: counts, announcing air, total air, mean NAV; `[21, 614]` |
| "Air spent on questions, answers and CF-End" | 14.9 ms / 14.3 ms, share between 1/25 and 1/17, single sends no CF-End, the AP relays exactly half of boundary's |
| "Air spent per frame delivered" / "a third of the air each" | 1281 µs / 422 µs, ratio 2.9–3.1, deliveries > 2.8× |
| "2.45 ms instead of 1.05 ms" | mean `NAV_SET` at sta-2, and every one of them loaded from a frame of the AP's |
| "up to 2.164 ms, where boundary carries 60 µs" | max data `durationFieldNs` per variant; each long one ends exactly at `TXOP_END` |
| "turn bursting off … no burst left to protect" | no `TXOP_START`, no CF-End, data still flows |
| "21 … 18 … 3 … 20 bytes" | locked-frame census of the collisions, RTS pairs within one RTS, RTS = 20 B |

### What did not fit, and where it went

- The RTS-threshold corner (boundary protection sends nothing for a one-frame turn; raise the
  threshold to 3000 and collisions rise 21 → 80, deliveries fall 614 → 344; the 1.9 ms slow
  frame) was the old third experiment — now a `deeper` block, so the minutes formula stays at 20.
  Its pins remain in `lesson-claims.test.ts`.
- What a CTS-to-self cannot do in this house → `deeper`.
- All clause numbers → `sources`: §9.2.5/§9.2.5.2 (Duration under single and multiple
  protection), §10.3.2.9 (RTS/CTS), §10.23.2.10 "Truncation of TXOP" (CF-End; the AP's repeat is
  spelled out for an S1G AP, so the simulator's general relay is flagged as a model choice),
  §10.3.2.15 "NAV distribution" (CTS-to-self, and the standard's own note that it is less robust
  against hidden nodes). All four verified against the 802.11-2024 corpus.

### Tests

`npx tsc -b --noEmit` clean. `READABILITY_INCLUDE=txop-protect npx vitest run
tests/course/readability.test.ts`: txop-protect passes every rule. `npx vitest run tests/course`
= 1717 passed / 7 failed, and **all seven failures belong to another implementer's in-flight
`rate` / `rate-fallback` split and to an `airtime.needs` change**, none of them in this batch's
files: `rate-fallback` budget (practice 416/400), `rate-fallback` needs-closure ("capture" is
bianchi-vs-sim's word), three `rate-fallback` content pins, the MIGRATING bookkeeping for `rate`,
and `airtime.test.ts` expecting `needs` without `frame-anatomy-bytes`.
