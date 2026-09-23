# U4 review — uwb-dl-tdoa, uwb-ul-tdoa, uwb-aoa

Reviewer: read-only, worktree `D:\wifi_sim\.claude\worktrees\feat-link-2g`, branch
feat/uwb-ranging. No files edited, no commits made. Red in `uwb-mms*` / `uwb-nba*` /
Tier 1 lessons observed and ignored per instructions (other agents' fix wave, confirmed
unrelated to U4 by name and by the readability run below).

## 1. Are the procedures the code's?

Checked `src/uwb/device.tdoa.ts` (`onDlSlot`, `transmitDl`, `onDlRx`, `solveTdoaFix`,
`onUlSlot`, `ulArrivalNs`, `solveUlFix`) against the `steps` blocks of both TDoA lessons,
line by line.

- `uwb-dl-tdoa`'s seven steps reproduce the code's own order exactly: Poll (slot 0, own
  transmit counter) → Responses (slots 1–3, transmit counter + Poll-arrival counter +
  `coffs` read off the Poll's carrier, matching `onDlRx`'s `dl.coffsToRef = -coffs`) →
  Final (slot 4, closes the rate interval) → the ratio (`solveTdoaFix`'s
  `counterDiff(rxFinal,rxPoll)/counterDiff(txFinal,txPoll)`) → per-responder subtraction
  (`arrivalGap/rate − (tofRctu + replyTime·(1−coffs))`, same order as the code) →
  `UWB_TDOA` emission → `solveTdoa` at the tag's configured height. Every constant quoted
  (20 ppm, 0.2 ppm, 100 ps) matches `DEFAULT_UWB_SESSION` / `UWB_PPM_MAX`.
- `uwb-ul-tdoa`'s seven steps match `onUlSlot` → `ulArrivalNs` → `solveUlFix`: one blink,
  radio off; each anchor stamps a counter on its own crystal for the log while the fix
  uses `arrival = trueFlight + noise + offset` on the shared timebase; `syncOffsetNs`
  drawn once (bias, not noise); reference anchor subtracts with no rate correction; three
  `UWB_TDOA` lines → `solveTdoa`. This matches `solveUlFix`'s comments and code exactly.
- **The clock contrast, checked directly**: DL says the badge's own crystal must be
  divided out via the Poll→Final ratio, and that anchor-1's crystal cancels too because
  the flight sits in both arrivals; UL says no interval is ever measured on anybody's
  crystal — the two anchor arrivals are subtracted directly and the badge's unknown
  transmit instant cancels because it appears identically in both terms. This is the
  right assignment for each direction (confirmed against `solveTdoaFix`'s `rate`
  computation vs. `solveUlFix`'s plain `dtNs = ns - refNs`), and neither lesson borrows
  the other's clock story. No mirror-direction error found.

No Important findings against the engine.

## 2. `uwb-aoa`'s honesty

The "What the model actually does" paragraph sits immediately after the picture's
opening paragraph ("Two antennas, one arrival"), in both `en` and `zh` dumps, and states
plainly: real hardware has two receive chains and compares them; the simulator has
neither — it computes the phase a λ/2 pair would see at the true angle, adds one draw of
receiver noise, and inverts that single number. This matches `measureAoa` in
`device.report.ts` exactly (`pdoaRad(trueThetaDeg,...) + gaussian(dev.rng)*AOA_SIGMA_PHI_RAD`,
one draw, one inversion via `azimuthFromPdoaDeg`).

Checked `watch`, `observe` and `tryThis` for anything implying two antennas are actually
compared: none found. "Watch one arrive" says the bearing "comes off the badge's opening
frame"; `observe` says "the anchor stamps that frame, reads its phase, and prints a
bearing"; `tryThis` never mentions antennas. Nothing suggests two receive chains are
simulated.

No findings.

## 3. The structural move

Confirmed via `deeper`: two "Behind the anchor" text blocks moved out of `numbers`. The
mechanism itself ("The half it cannot see" — mirror-image phase, ±90° clamp, aim into
the room or add an antenna) is still in `picture`, on the main path. The two pinned
sentences ("Facing the wall, the badge is 180.0° off boresight, and the fourteen
bearings come back as the base scene's, to every digit." and "The seven fixes then land
near (5.06, −1.47) m, 3.97 to 4.03 m from the badge — twice the floor distance, outside
the room.") are present verbatim in `deeper` and asserted by
`tests/course/uwb-aoa.test.ts` via `prose()`, which walks `deeper` too (confirmed: full
suite green, 34/34 tests).

No findings.

## 4. Quoted figures

Re-derived independently rather than trusting the lesson text or the report:

- Ran `npx vitest run tests/course/uwb-dl-tdoa.test.ts tests/course/uwb-ul-tdoa.test.ts
  tests/course/uwb-aoa.test.ts`: **113/113 pass**. Inspected the test bodies (not just
  the pass/fail) and confirmed the pins are not tautological: every worked-example row
  in all three files is recomputed from the run's own `UWB_TS` / `TX_START` /
  `UWB_TDOA` / `UWB_AOA` / `UWB_POSITION` records (e.g. `uwb-dl-tdoa.test.ts`'s
  `block0()` rebuilds the rate, the reply-time scaling and the leftover from raw
  records and checks `toBeCloseTo(td.dtNs, 9)` against the engine's own emitted
  record, not against a hand-typed constant).
- Independently checked the AoA constants against `src/uwb/aoa.ts`:
  `AOA_SIGMA_PHI_RAD = 0.15`, `AOA_SIGMA_CLAMP_DEG = 45`, `aoaSigmaDeg` =
  `min(45, (0.15/(π·cosθ))·(180/π))` — matches the lesson's σ_θ formula and the
  2.74°/3.87°/5.47° figures at 0°/45°/60°.
- Ran the readability/mechanism grader scoped to these three ids
  (`MECHANISM_INCLUDE=uwb-dl-tdoa,uwb-ul-tdoa,uwb-aoa READABILITY_INCLUDE=...`): the 7
  failures reported all belong to `bianchi`, `edca`, `uwb-mms`, `uwb-mms-numbers` — none
  to the U4 lessons. Confirmed these are the other implementers' in-flight files per the
  batch report's own note.

No Important findings; nothing failed to reproduce.

## 5. Beginner read, both languages

Read all three lessons' `en` and `zh` dumps (`npx tsx scripts/lesson-dump.ts <id> en|zh`)
end to end, in course order (uwb-dl-tdoa → uwb-ul-tdoa → uwb-aoa), as a reader who has
just finished uwb-position/uwb-geometry. No sentence stopped me; nothing pointed at an
unnamed quantity. The Chinese reads as written Chinese, not translated English: full-width
punctuation, no pointer phrases, natural clause order (e.g. uwb-aoa's "噪声一样大，疑虑却
大得多" restructures the English "The same noise costs more degrees off to the side"
into an independent Chinese sentence rather than mirroring English word order).

No findings.

## 6. Pins and carries

- `CELL_RULE_CARRIES` in `tests/course/readability.test.ts` no longer lists
  `uwb-ul-tdoa` (only `uwb-mms-numbers` remains, which is explicitly out of scope —
  "not mine"). Confirmed the offending cell (`'1 slot of 2 ms, 1 frame'`) now has a real
  Chinese half (`'1 个 2 ms 时隙，1 帧'`).
- The regression test (`uwb-ul-tdoa.test.ts`, "a language-neutral cell of this lesson is
  a value, never an English sentence") replays the **actual** rule: its `prosey` and
  `logLine` regexes are character-for-character identical to `CELL_PROSE` and `LOG_LINE`
  in `tests/course/readability.test.ts`, applied generically to every `en === zh` table
  cell in `numbers` and `picture` — not scoped to just the one fixed cell — plus one
  explicit assertion that the Chinese half now reads `'1 个 2 ms 时隙，1 帧'`. This is a
  genuine regression test of the rule, not a restatement of the new string. Confirmed
  the full readability suite (unscoped) shows no failure for `uwb-ul-tdoa`.
- Pre-existing pins: spot-checked that pinned sentences named in the U4 report (crystal
  draws, GDOP-floor comparison, two-way vs. TDoA error comparison, ellipse honesty
  language, sync-error walk table, "Behind the anchor" pair) all appear verbatim in the
  current lesson files and are asserted in the corresponding test files with
  `prose()`/`deepCell()` lookups, and all tests pass.

No findings.

## Verdict

PASS. 0 Important, 0 Minor.

Worst finding: none — no defect found in either engine-fidelity, AoA honesty, the
structural move, quoted figures, bilingual readability, or the pin/carry bookkeeping.
