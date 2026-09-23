# C4 — mlo, capstone

Base dc6a280. Files touched: `src/course/tier2/mlo.ts`, `tests/course/mlo.test.ts`,
`src/course/tier2/capstone.ts`, `tests/course/capstone.test.ts`, and this report.

## mlo

**Budget line:** `mlo  picture 567/900 · numbers 547/550 · practice 340/450 · total 1454 (1454 words, 25 min)`

**Procedure — "How a frame gets a link, step by step"** (in `numbers`, six steps),
read out of the engine, not the old prose:

| Step | Where it comes from |
| --- | --- |
| 1. queued once at the MLD; both links' radios hold the same four AC queues; ARRIVAL/ENQUEUE name the first lane | `src/engine/simulation.ts` — `queuesOf` is one `AcQueues` **per physical node**, handed to the MAC of every link; `enqueue()` goes through `primaryMac()` and emits against `primaryVid()` (5 GHz) |
| 2. the device wakes the other link's radio; both begin counting | `simulation.ts` `enqueue()` loops the siblings calling `mac.pokeAccess()`; `WifiMac.pokeAccess` (mac.ts:373) |
| 3. each link contends alone — own CS, own countdown, own CW | per-link `Edcaf` state in `src/engine/mac.ts`; nothing pools contention |
| 4. the first link to reach zero claims up to **64** consecutive frames for one receiver, one without aggregation; claiming removes them | `mac.ts:633` `this.queues.claim(ei, peer, useAmpdu ? MAX_AMPDU_MPDUS : 1, …)`; `AcQueues.claim` splices them out; `MAX_AMPDU_MPDUS = 64` (`phy.ts:325`) |
| 5. one sequence counter per (receiver, access category), kept with the shared queue | `AcQueues.seq` / `nextSeq` (`queues.ts`), documented there as the MLD-sharing guarantee |
| 6. acknowledged → DEQUEUE on the sending lane; unacknowledged → one retry each against a limit of **7**, set returned to the **front** of the same shared queue, so either link may take the retry | `mac.ts` `failMsdus` → `queues.restore`; `SHORT_RETRY_LIMIT = 7` (`phy.ts:41`) |

**Worked example — "MSDU 66 through those steps"**, five rows, each naming its record:
4.424 ms ARRIVAL+ENQUEUE on `sta-1` (1500 B, AC_BE, depth 1) → 4.512 ms TX_START on
`sta-1#6g` (ids 66–85, 30,718 B, MCS 13) → the 5 GHz BACKOFF_DEC still at 2 that instant,
88 µs behind → 6.0176 ms BlockAck from `ap#6g`, 32 B → 6.0496 ms twenty DEQUEUEs on
`sta-1#6g`, and no id of 66–85 ever on 5 GHz.

**Naming:** `接入点（AP）` / `an access point (AP)` added at the first mention in `picture`.
Record names are glossed at first use in the steps (`the arrival (ARRIVAL)`, `(ENQUEUE)`,
`(TX_START)`, `(BACKOFF_DEC)`, `a dequeue (DEQUEUE)`) — the neutral-cell acronym rule
requires each one glossed inside the section that tabulates it.

**Terms added:** none. `link` / `MLO` / `MLD` already carry the procedure's vocabulary, and
the procedure uses no quantity from the `QUANTITIES` list.

**Pins added** (`tests/course/mlo.test.ts`, +11 tests):
- step 1 — no ARRIVAL or ENQUEUE is ever logged on the 6 GHz lane, in the run.
- step 2 — both lanes draw their own backoff, each value within its own CW.
- steps 4/6 — `MAX_AMPDU_MPDUS === 64`, `SHORT_RETRY_LIMIT === 7`, no burst exceeds 64.
- step 4 — proven, not asserted: across the whole 300 ms no MSDU of the laptop is carried
  by both lanes (>300 MSDUs checked); plus a unit test that `AcQueues.claim` empties the queue.
- step 5 — `nextSeq` is per (dst, ac) and restarts per AC; and in the run the two lanes'
  AC_BE sequence numbers are all distinct.
- step 6 — `AcQueues.restore` puts a failed set at the **front** (`[7,8,9]`).
- the five worked-example rows, each against its record.

**Where the code disagreed with the old lesson:** nothing contradicted, but one `deeper`
claim is a code fact that this scene never exercises — "a failure on one link can be retried
on the other". In this 300 ms run **no** MSDU is ever tried on both lanes (the laptop's six
retries all stay on 5 GHz), so that claim is now pinned at the `AcQueues` level (shared queue,
restore-to-front) rather than being read off the timeline. The claim stands; its evidence moved.

**`proseMax`** in the mlo test raised 900 → 1120 (the per-lesson ratchet; `BUDGETS` itself is
met at 547/550 for `numbers`).

## capstone

**Budget line:** `capstone  picture 535/900 · numbers 549/550 · practice 386/450 · total 1470 (1470 words, 25 min)`

**Procedure — "The method, step by step"** replaces the old "The write-up" list with the
method the learner actually carries out, and folds the hand-in into its last step:
1. baseline before touching anything — run, open the inspector, rank all seven by airtime
   share (58.7% and 90.6% for the laptop's two lanes, nothing else at 2%), write it down;
2. fix the four figures carried through every option (the table names the lane for each);
3. one edit at a time in the editor — **none of the three is a loadable variant**: set the
   laptop's traffic to idle, clear MLO on the laptop, or give the tablet a Wi-Fi 6 radio
   with OFDMA on;
4. re-read the same four figures and compare the options column against column;
5. rank by the wait freed, not by the device that looks worst — the **sensor** is the oldest
   radio in the flat and is not a candidate at all (three frames in five seconds);
6. hand in four sentences, ending with what the scene does not model.

Both facts the earlier correction established are kept and now pinned: the sensor is the
oldest radio (`sta-5`, `nonht`, and the only `nonht` node; the tablet is `vht`), and the
three options are editor edits because the lesson has no `variants`.

**Worked example** — the comparison table, transposed so that each **row** is a figure and
names where it is read: `bytes delivered on lanes ap and ap#6g`, `mean receive wait, lane
sta-2`, `mean receive wait, lane sta-4`, `mean send wait, lane sta-3`; the four columns are
the baseline and the three options. (One consequence: the prose that used to say the tablet
figure moves "by two orders of magnitude, in one column" now says "in one row".)

**Naming:** `One access point (AP)` / `一个接入点（AP）` in the first picture paragraph.

**Terms added:** none.

**Pins added** (`tests/course/capstone.test.ts`, +5 tests): the steps block is on the main
path and not in `deeper`; step 1's baseline percentages are the run's; step 3's three edits
each reproduce the table's figures and the lesson has no variants; step 5's "oldest radio in
the flat" against the generations in the scenario; and the comparison table's four row labels
verbatim, with each row's four cells checked against the counter the label names.

**`proseMax`** raised 900 → 1130.

## Not done / concerns

- Both lessons sit one or two words under `BUDGETS.numbers` (547 and 549 of 550). Any later
  edit to `numbers` in either file has to give a word back first. Neither lesson needed a split.
- ZH straight quotes `"…"` in four pre-existing capstone strings were changed to full-width
  `“…”` while I was in the file.
- Full `npx vitest run tests/course` is green (58 files, 2197 tests) and `npx tsc -b --noEmit`
  is clean at the time of the commit.

---

## Fix round (coordinator review)

**Important — mlo step 6 stated only one of the engine's two branches.**
`failMsdus` (`src/engine/mac.ts:1114-1133`) restores a failed set to the queue head **only
while** the frame's retry count is under `SHORT_RETRY_LIMIT`; at the limit it emits `DROP`
with `reason: 'retryLimit'` plus a `DEQUEUE` and does not restore. Step 6 now states both,
in the engine's terms: "each frame counts one more retry: one that has reached 7 is dropped
(DROP) with reason retryLimit and dequeued, the rest return to the front of the shared
queue". `DROP` is glossed parenthetically so it clears the section's acronym rule.

The drop branch is pinned against a **synthetic copy** of the scene — the laptop moved to
(200, 200), out of range — because the lesson's own 300 ms produces no `DROP` at all. The
lesson's `scenario()`, its (absent) variants, its jumps and every quoted number are
untouched, and nothing the lesson states is measured off the copy. Three new tests:

- the lesson's own run has zero `DROP` records — the reason the copy exists;
- under the limit the set really does go back to the shared queue: MSDU 1 is attempted
  exactly `SHORT_RETRY_LIMIT` (7) times, with `RETRY` counts `[1…7]` — and, a free
  confirmation of the `deeper` cross-link claim that previously had only queue-level
  evidence, those seven attempts alternate between `sta-1` and `sta-1#6g`;
- at the limit it is dropped, not restored: every `DROP` carries `reason: 'retryLimit'` and
  is matched by a `DEQUEUE` of the same MSDU on the same lane at the same instant; the
  first is MSDU 1 on the 5 GHz lane.

**Minor — "station" / 站点 glossed.** mlo's only use of the stand-in (the "neighbour gained
too" paragraph) now reads `the two stations (STA)` / `两台站点（STA）`, as the rest of the
tree does.

**Budget.** Step 6 grew by nine words and the gloss by one. All ten came from elsewhere in
the same `numbers` section — never from another step, never into `deeper`: one word each
from the "neighbour gained too" and "when everybody has two doors" paragraphs, and the
worked-example cells of rows 1, 2, 3 and 5 tightened. New line:
`mlo  picture 567/900 · numbers 548/550 · practice 340/450 · total 1455 (1455 words, 25 min)`.

**Gates.** `MECHANISM_INCLUDE=mlo,capstone npx vitest run tests/course/readability.test.ts`
— mlo and capstone green (929 passed; the single red is `uwb-sstwr`'s budget, another
batch's, on the ignore list). `npx vitest run tests/course/mlo.test.ts
tests/course/capstone.test.ts` — 54 passed. `npx tsc -b --noEmit` — clean for these files;
its one error is `tests/course/tier1-project.test.ts` (`CapabilityProfile.streams`), another
batch mid-edit. `npx tsx scripts/lesson-dump.ts mlo zh` read end to end.
