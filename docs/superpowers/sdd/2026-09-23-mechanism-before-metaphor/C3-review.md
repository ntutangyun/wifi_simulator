# C3 review — ofdma-dl, ofdma-ul, mumimo

Reviewed commit 9626f11 against `src/engine/mac.ts` and `src/engine/phy.ts`, both lesson dumps
(en/zh), `git show 9626f11 -- tests/course/{ofdma-dl,ofdma-ul,mumimo}.test.ts`, and
`MECHANISM_INCLUDE=ofdma-dl,ofdma-ul,mumimo npx vitest run tests/course/readability.test.ts` plus
`npx vitest run tests/course/{ofdma-dl,ofdma-ul,mumimo}.test.ts`. No edits made; worktree left
untouched.

## 1. Procedure vs. engine

Walked each `steps` block against the code it claims to come from:

- **ofdma-dl** (`numbers`, 6 steps) against `transmitFor`'s OFDMA branch (mac.ts:592-598) and
  `buildMuParts` (mac.ts:869-899): list → `dsts(ei, reach).filter(ofdmaWith)`, `< 2` → single-user
  fallback, `slice(0, 4)`, `frac = 1/n`, per-member airtime via `txTimeModeNs`/`airModeNs` with
  `ruFraction`, `queues.claim` up to `durCap`, length = 44 + 4 + 13.6·symbols, SIFS + 32 µs BlockAck
  per member, success = "any member acked" (`resolveDlMu`). Matches, in order, with the code's
  constants.
- **ofdma-ul** (`numbers`, 7 steps) against `notifyUlBacklog`, the trigger branch of `transmitFor`
  (mac.ts:596-604), `transmitTrigger` (mac.ts:939ff) and `respondToTrigger`/the `'trigger'` receive
  case (mac.ts:1382-1387, 1466ff). Matches, including the `depthFor(ei) === 0` gate before a trigger
  is considered, one format for the whole round, `maxPsduBytesFor` capped at 2 ms, `triggerBytes`/
  `multiStaBaBytes` constants, and the `ACK_TIMEOUT_NS` (45 µs) window measured from the trigger's
  own end, not from the end of the answers.
- **mumimo** (`numbers`, 6 steps) against `transmitDlMu`, `fitsStreams` and `buildMuParts`
  (mac.ts:812-847, 869-899). Matches: `MUMIMO_MIN_BYTES = 1000`, streams-vs-`ownNss()` trim from the
  end, fallback to the *original* (untrimmed, up to 4) candidate list when fewer than two survive —
  the lesson gets this right ("falls back to slices for the whole group", not just the trimmed pair).

No Important finding here: every step is a step the code takes, in the code's order, with its
constants.

## 2. The three engine findings, verified independently

(a) **No per-device power correction on the uplink.** `respondToTrigger` (mac.ts ~1466-1480) computes
its budget with `this.cfg.nssForPeer(trigger.src)` and builds the outgoing frame with no reference to
any target-RSSI or power field carried by the trigger — the responder's power is never touched.
Confirmed correct.

(b) **NAV, not CCA.** The `'trigger'` case (mac.ts:1382-1387) gates on
`if (this.now() < this.navUntil && this.navSetBy !== from) break` — a NAV check exempting the
triggering AP's own NAV, exactly as `ofdma-ul` step 6 and `deeper` now say. Confirmed correct.

(c) **A slicing member keeps its own `nss`, but the part records only `ruFraction`.** In
`buildMuParts` (mac.ts ~880-895), `opts` is built as
`mumimo ? {mu:true, widthMhz, nss} : {mu:true, ruFraction: frac, widthMhz, nss}` — `nss` flows into
`airtime()`/`txTimeModeNs` on **both** branches — but the pushed `MuPart` only carries
`...(mumimo ? {nss} : {ruFraction: frac})`. So a slicing member's length still scales by its own
stream count even though the record shows only its RU share. This is exactly what makes 133.6 µs (not
92.8 µs) the number for an OFDMA member at `nss = 2`; confirmed by re-deriving both figures from
`txTimeModeNs` and by the mumimo test's own `symbolsOf` helper, which explicitly falls back to
`nssOf(p.dst)` for parts with no recorded `nss`. Confirmed correct.

All three findings hold exactly as claimed.

## 3. Earlier corrections still hold

- **ofdma-dl, no throughput win.** `numbers` closes with "The same film, less air": "Every television
  receives exactly the frames it received before... What changes is the air," and the run table shows
  identical per-television delivery (352/355/354 frames, 13.1/13.3/13.2 Mb/s) both with and without
  OFDMA, with only "Time the air was busy" changing (161.5 ms vs. 163.0 ms, i.e. the quoted 1.44 ms
  over 300 ms). The quiz's second question explicitly rejects "a higher rate for each television" as
  the answer. Holds.
- **mumimo, 162/169 not "always."** Step 6: "one 16 µs gap later a single round of acknowledgement
  settles the group — in 162 of the 169 group sends of the slicing variant. The other seven are the
  sends the laptop talked over." `tests/course/mumimo.test.ts` ("one round of acknowledgement settles
  the whole group") pins 162/169 for the OFDMA variant and 190/196 for MU-MIMO — neither is 100%.
  Holds.

## 4. Beginner read, both languages

Read all six dumps (`npx tsx scripts/lesson-dump.ts <id> {en,zh}`) start to finish as a Tier-1-plus-
earlier-Tier-2 reader. No sentence stopped me in either language in any of the three lessons. The
Chinese reads as Chinese: no relative-clause pileups translated straight from English syntax, no
untranslated pointer phrases, full-width quotes used consistently. I specifically checked for the
banned forms from the amendment (这笔账 / 留在手里 / 不含余量的那个要求 / 之类 / "kept in hand" /
"head arithmetic" / "the bare requirement") — none appear in any of the six dumps. Every quantity a
sentence points at (44 µs, 975 bits/symbol, 17,425 B, 1,000 B floor, 162/169, etc.) is introduced or
computed at the point it is used, not gestured at from elsewhere.

One soft spot, filed as Minor below: `ofdma-ul`'s `picture` step 4 ("How loudly: each device is told
to correct its power") reads as a plain statement of what happens, and a reader who never reaches
`deeper` would reasonably conclude the simulator does this. It doesn't (see §2a). The batch's own
report flags this honestly and the correction is real and present in `deeper` — this is a placement
call, not a false claim in the graded `numbers` procedure, so I'm not calling it Important.

## 5. Pins and budgets

`git show 9626f11 -- tests/course/{ofdma-dl,ofdma-ul,mumimo}.test.ts`: every pre-existing test in all
three files is left untouched (only `proseMax` numbers changed, upward, to the new totals). Each new
`describe` block proves its claim over the whole run rather than asserting a copied constant:
- `ofdma-dl`: group size bound to [2,4] and `ruFraction === 1/n` over every MU PPDU of the run; length
  re-derived from `ndbps × toneRatio × nss × ruFraction` and the symbol formula, not hard-coded;
  BlockAck timing/size checked against every send.
- `ofdma-ul`: `maxPsduBytesFor('he', 11, 0.5, 2ms, 20, 1)` computed inline and checked to equal 17,425
  → 143 symbols → 1988.8 µs, then checked against every trigger of the run (not just the worked one);
  `triggerBytes`/`multiStaBaBytes`/`ACK_TIMEOUT_NS` pulled from the engine's own exports.
  `Duration` field pinned as an exact equality (report notes it was a lower bound before — a
  strengthening, not a loss).
- `mumimo`: MU-MIMO parts checked for `bytes ≥ 1000`, stream sum `≤ 4`, no `ruFraction`; slicing parts
  checked for `ruFraction === 1/n`; length re-derived per part with the `nss` fallback described in
  §2c above, over every send of both variants.

The deleted `ofdma-ul` paragraph ("Padded to the length the trigger frame named") claimed three
things: (i) one length is given to every device, (ii) a device with less to say pads the rest, (iii)
the air is spent either way because the answers must end together for one BlockAck to cover them.
(i) and (iii) are verbatim in step 4 ("Every device is then given that one length, so the answers end
together and one acknowledgement can close the round"); (ii) is in step 6 ("fills its part up to the
bytes that length allows, and pads out the rest") and restated concretely in the second quiz's
explanation. Nothing substantive was lost. One nuance did drop silently: the deleted paragraph also
asserted, as an observed fact about *this scenario*, that both uploaders always have enough backlog to
fill the round without padding ("both fill their 1988.8 µs to the byte and nothing is wasted") — the
current text no longer states whether the pinned 16,894-byte example is itself padded or not. This is
a lost claim about the specific worked case, not about the mechanism, and it is not pinned either
before or after — filed as Minor.

## 6. Rules

`MECHANISM_INCLUDE=ofdma-dl,ofdma-ul,mumimo npx vitest run tests/course/readability.test.ts`: 2
failures, both `readability · mlo` (missing acronym glosses for `STAS`/`ARRIVAL`), which is other
implementers' unrelated red exactly as flagged in the dispatch — 888/890 passed, nothing under the
three lessons in scope failed.

`npx vitest run tests/course/ofdma-dl.test.ts tests/course/ofdma-ul.test.ts tests/course/mumimo.test.ts`:
55/55 passed.

Budget lines (from the dumps, matching the report):
- `ofdma-dl`: picture 554/900 · numbers 511/550 · practice 351/450 · total 1416, 25 min
- `ofdma-ul`: picture 588/900 · numbers 536/550 · practice 338/450 · total 1462, 25 min
- `mumimo`: picture 527/900 · numbers 517/550 · practice 362/450 · total 1406, 25 min

All within the 500–1800 / ≤900 / ≤550 / ≤450 / ≤30 min caps in `src/course/readability.ts`.

## Findings

**Important: none.**

**Minor (2):**

1. `ofdma-ul`, `picture`, step 4: "How loudly: each device is told to correct its power, so a near one
   and a far one reach the access point at similar strength." Stated as plain fact with no hedge; the
   correction is confirmed in §2a above to be standard text the engine does not apply — the caveat
   only arrives in `deeper` ("This simulator dictates the slice, the length, the rung and the width
   but not that correction..."). A reader who stops before `deeper` is left with a claim about this
   simulator that is false. Suggested fix: append a short parenthetical at the point of the claim,
   e.g. "(the standard's rule — see below for what this simulator actually does)", rather than leaving
   the correction to a section a reader may not reach.
2. `ofdma-ul`, deleted paragraph "Padded to the length the trigger frame named": the mechanism claims
   survive (see §5), but the paragraph's observational claim about the specific worked scenario — that
   both uploaders here always have enough queued to fill the round, so the pinned 16,894-byte example
   is never itself padded — is dropped and unpinned either before or after. Not a mechanism loss, but
   a fact about the worked example the lesson no longer asserts one way or the other. Suggested fix: a
   half-sentence in the "one triggered round" table's surrounding text or in step 6's application to
   the worked row, confirming whether 16,894 B is the full 17,425 B budget or already padded.

## Verdict

PASS. Important: 0. Minor: 2. Worst finding: `ofdma-ul`'s picture states the trigger frame's per-
device power correction as plain fact at the point a beginner reads it, with the "this simulator
doesn't do that" caveat arriving only later in `deeper`, where a reader may not go.
