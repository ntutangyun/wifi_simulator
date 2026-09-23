# U1 review — uwb-intro, uwb-frame, uwb-sts

Reviewed at HEAD (branch feat/uwb-ranging), commit d7b8876 is U1's own. `git
diff 3bba75f d7b8876` over the six lesson/test paths.

## Method

1. Read every `steps` block against `src/uwb/device.ts` (`transmitFor`,
   `onRxOk`/`onResponse`), `src/uwb/frameFields.ts` (`uwbPpduLayout`),
   `src/uwb/phy.ts` (`UWB_TS_ACCUM_GAIN_DB`, chip/RCTU constants),
   `src/uwb/clock.ts` (`UwbClock.counter`, `counterDiff`) and
   `src/uwb/ranging.ts` (`ssTwrRaw`, `rctuToMetres`).
2. Hand-derived every quoted figure from those constants (73.269 µs, 18.1 dB,
   15.650 ps, 3195 ticks, 14.99 m) rather than from the prose.
3. `MECHANISM_INCLUDE=uwb-intro,uwb-frame,uwb-sts READABILITY_INCLUDE=uwb-intro,uwb-frame,uwb-sts
   npx vitest run tests/course/readability.test.ts` — 941/942 (the one
   failure is `uwb-blocks`, another implementer's in-flight file, expected
   red per the dispatch) — and `npx vitest run tests/course/uwb-intro.test.ts
   tests/course/uwb-frame.test.ts tests/course/uwb-sts.test.ts` — 79/79 green.
4. `npx tsx scripts/lesson-dump.ts <id> en|zh` for all three, read end to end.
5. `git diff 3bba75f d7b8876` on the three test files to confirm no pin was
   dropped rather than requoted.

## 1–2. Procedure vs. engine, and the quoted figures

All three lessons' `steps` blocks reproduce the engine's own order and
constants. Checked by hand:

- **uwb-intro**: `transmitFor` reads `clock.counter(t + UWB_RMARKER_NS)`
  before `send()` (device.ts:632–633) — step 1. The anchor's `uwbResp` case
  computes `counterDiff(txCounter, r.rxPollCounter)` into `replyRctu`
  (device.ts:662) — step 3. `onResponse`'s `tround1 = counterDiff(counter,
  r.txPollCounter)` (device.ts:727) — step 4. `ssTwrRaw` and `rctuToMetres`
  (ranging.ts) close it. The four-counter worked example subtracts and
  halves to 1070 RCTU / 5.02 m exactly as pinned.
- **uwb-frame**: `SYNC_NS (65 128) + SFD_NS (8 141) = 73 269 ns` in
  `frameFields.ts` matches the quoted 73.269 µs exactly.
  `UWB_TS_ACCUM_GAIN_DB = 10·log10(64) = 18.0618…` → "18.1 dB" reproduces.
  `RCTU_NS = UWB_CHIP_NS / 128 ≈ 15.650390625 ps` → "15.650 ps" reproduces.
  `UwbClock.counter` rounds `localNs / RCTU_NS` — matches "rounds to whole
  ticks." `uwbPpduLayout`'s segment order (`sync, sfd, stsGap, sts, stsGap,
  phr, psdu`) matches the six-step order, and the 197.628 µs / 18.1 dB /
  290-symbol PSDU arithmetic all reproduce from `phy.ts`'s constants
  (`SYNC_SYMBOLS`, `STS_ACTIVE_CHIPS`, `psduSymbols`, `chipsToNs`).
- **uwb-sts**: the attacker branch in `onRxOk` (device.ts:491–503) fires
  *before* `extraNs`/`counter` are computed, exactly as steps 2–3 describe,
  and `advanceNs` is only ever subtracted when `stsOff === true`
  (device.ts:500), matching step 5. `tests/course/uwb-sts.test.ts` proves
  3195 ticks low on both receptions and the 14.99 m theft directly against
  `runOf` output (`26 381 601 449 → 26 381 598 254`,
  `336 335 294 125 → 336 335 290 930`, both diffs 3195; `rctuToMetres(3195)
  = 14.99`). The "halving hands one advance back" claim is proven, not
  asserted, via `ssTwrRaw(hRound, hReply) − ssTwrRaw(sRound, sReply) === 3195`.
  32 768 vs 32 512 chips (STS active vs SYNC) is correctly stated as "about as
  long as," not "two thirds as long again," and the test pins the phrase's
  absence (`uwb-sts.test.ts:172-173`).

No procedure step, in any of the three lessons, disagrees with the code it
claims to describe. All quoted figures reproduce by hand and by test.

## 3. The honesty of uwb-sts — Important

`uwb-sts`'s main-path `numbers` steps (block "What the receiver does with the
sequence," items 3–4) state:

> "At the instant it stamps, the receiver looks for the pulses it generated
> itself. With the sequence on it finds noise there, writes one
> UWB_STS_REJECT, and takes no reading at all."

and the `picture` says the same thing in plainer words ("The other outcome:
nothing at all" — "The receiver takes its stamp only if the pulses it
expected really were there at that instant; they were not, so it throws the
reading away"). Both describe a per-reception correlation check: the
receiver compares an expected pulse sequence against what arrived, and
rejects on mismatch.

That is not what `onRxOk` does (device.ts:491–503). The actual condition is:

```
const atk = this.cfg.attacker
if (atk !== undefined && atk.advanceNs > 0 && !this.cfg.stsOff) {
  emit UWB_STS_REJECT; return
}
```

There is no correlator, no comparison against generated pulses, and no
"noise" computed anywhere. The check fires purely on "an attacker is
configured with a positive advance, and the STS switch is on" — it is a
boolean gate on the *scenario's* attacker config, not a signal-processing
step the receiver performs on every reception. In particular, an honest
reception with no attacker present never runs anything resembling this
check at all (the `if` is skipped entirely, since `atk === undefined`), so
the steps' claim that "the receiver looks for the pulses it generated
itself" as a general per-reception behaviour is fiction, not a step the
engine takes.

The batch report's own "Anything the engine contradicted" section
acknowledges the underlying fact ("the simulator does **not** generate an
STS: it is a switch (`stsOff`) plus a fixed-advance attacker") but keeps
that disclosure out of `picture` and `numbers`, deferring it to `deeper`
("What the simulator models, and what it does not") and `sources`. That
`deeper` paragraph, however, only qualifies the *attacker's* realism (that a
real relay's advance is bounded by the predictable head of the frame); it
never states that the "receiver looks for pulses / finds noise" story in
`numbers` is not what the code computes. A reader who stops at the picture
or the numbered steps — which is most of the lesson's main path — comes away
believing they are watching a real STS correlator reject a forged edge, when
they are watching a two-line boolean check on a scenario config field.

**What it should say instead**: at the point steps 3–4 (or the "other
outcome" paragraph in `picture`) introduce the rejection, name what the
simulator actually checks — e.g. "In this simulator the check is a switch,
not a correlator: `scenario.uwb.stsOff` decides whether an attacker's early
edge is accepted (`stsOff` on) or rejected outright (`stsOff` off is wrong —
correct per the code: rejected when the sequence is **on**, i.e. `stsOff`
false) — the pulses themselves are never generated or compared." This
belongs where the beginner meets the claim, not only in `sources`.

## 4. uwb-intro as a track opener

999/1000 words, four terms, no table in `picture` — within the rules. Read
cold: the why → picture → numbers arc lands. The six-step "From four counters
to metres" is short and concrete, and the four-counter worked example
against it is genuinely legible for a first-time reader. No split needed, and
the report is right that it has no headroom left — any future addition to
this lesson forces the split conversation the report flags.

## 5. Beginner read, both languages

Read `npx tsx scripts/lesson-dump.ts <id> en` and `zh` for all three, start
to finish. No sentence stopped me. `tag-1` / `anchor-1` are joined to their
plain-words stand-ins at first use in all three lessons ("The phone (`tag-1`
in the log — a tag is whatever is being located)" / 手机（日志里叫它
tag-1：被定位的那一端就叫标签）), and the ZH reads as written Chinese, not
translated English — no pointer-phrase equivalents of 这笔账/留在手里的 found
anywhere in the three lessons' `picture` or `numbers`. Every quantity used on
the main path (73.269 µs, 18.1 dB, 3195 ticks, 14.99 m, 15.650 ps) is named
and sized at the point of use, not gestured at.

## 6. Pins

`git diff 3bba75f d7b8876` on all three test files: no assertion was removed
without being requoted or superseded by a stronger one — only comments and
one `proseMax`/import-list change per lesson (documented in the report:
`uwb-frame` 1000→1100, `uwb-sts` 820→1050). New pins derive from the engine
(`counterDiff`, `ssTwrRaw`, `uwbPpduLayout`, `UWB_TS_ACCUM_GAIN_DB`,
`STS_ACTIVE_CHIPS`/`SYNC_SYMBOLS`) rather than from copied prose constants.
The "not two thirds as long again" standing correction is untouched and
still pinned (`uwb-sts.test.ts:173`).

## Summary

One Important finding (§3), no Minor findings.

---

**NEEDS FIXES**
Important: 1, Minor: 0.
Worst finding: `uwb-sts`'s main-path steps and picture narrate the STS
rejection as a live correlation check ("looks for the pulses it generated
itself... finds noise there") when the engine's actual mechanism is a
two-line boolean gate on `scenario.uwb.attacker`/`stsOff` with no pulses
generated or compared anywhere, and that gap is disclosed nowhere before
`deeper`/`sources`.
