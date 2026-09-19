# Task 1 report — config, schema, round plans, frames, hyperbolic solver

Commit `df37e84` — `feat(uwb): TDoA modes in config and plan, DL message times, blink frame, hyperbolic solver`.
`npx tsc -b`, `npx vite build` and the full `npx vitest run` (104 files, 1271 tests) are green.

## Interfaces produced for Tasks 2–3

### Config (`src/model/scenario.ts`)

```ts
export type UwbMode = 'twr' | 'dl-tdoa' | 'ul-tdoa'
// UwbSessionCfg gains:
mode: UwbMode                  // default 'twr'
tdoaClockCorrection: boolean   // default true  (DL only)
syncErrorNs: number            // default 0, schema 0…10 (UL only, model)
```

Schema rules (all `path: ['uwb']`, so the editor still tells a session issue by its path):

- `mode !== 'twr'` + `schedule: 'contention'` → "contention-based rounds are two-way ranging only";
  a non-`'time'` schedule also draws "one-way ranging needs a time-scheduled session (schedule: time)".
- `mode !== 'twr'` with fewer than 4 anchors → "one-way ranging needs at least 4 anchors for 3 time
  differences (found N)".
- `dl-tdoa` skips the tags ≤ block-fit rule entirely (every tag listens to the one anchor round).
- `ul-tdoa` falls out of the existing rule unchanged: `uwbSlotsPerTag(..., 'ul-tdoa')` is 1, so
  `fits = floor(blockRstu / slotRstu)` = 100 at the defaults.
- the slot-fit rule now asks the mode: `uwbSlotFitNs(anchors, mode)`.

### Round plan (`src/uwb/session.ts`)

`RoundPlan` gains `mode: UwbMode`. `roundPlan(cfg, anchors)`:

| mode | slots | roundsPerBlock (defaults) |
| --- | --- | --- |
| twr (ds) | 2A + 2 = 10 at A = 4 | 10 |
| dl-tdoa | A + 1 = 5 at A = 4 | **1** (one anchor round per block; 20 would fit) |
| ul-tdoa | 1 | 100 (one round per tag, as today) |

`SlotAction` gained `{ kind: 'uwbPoll'; tx: 'anchor'; anchor }`, `{ kind: 'uwbFinal'; tx: 'anchor'; anchor }`
and `{ kind: 'uwbBlink'; tx: 'tag' }`. `slotAction`:

- dl-tdoa: slot 0 → `uwbPoll` anchor 0; slots 1…A−1 → `uwbResp` anchor *i* (slot index **is** the anchor
  index, which is what lets the Final list RX times in slot order without addresses); slot A → `uwbFinal`
  anchor 0; beyond that it throws `DL-TDoA round has N slots`.
- ul-tdoa: slot 0 → `uwbBlink` tx tag; slot 1 throws `UL-TDoA round has 1 slots`.
- TWR and contention are untouched (device.ts needed no change: its `switch (action.kind)` has no
  exhaustiveness assertion, and `action.tx === 'tag'` still narrows).

### Frames (`src/uwb/frames.ts`)

```ts
export type UwbFrameKind = … | 'uwbBlink'          // also added to model FrameKind
export interface UwbDlTimes { txCounter: number; rxCounters: Record<string, number>; coffs?: number }
// UwbInfo gains  dl?: UwbDlTimes
makeBlink(tag, block, round): FrameDesc
makePoll(tag, anchors, method, block, round, schedule?, contentionSlots?, maxAttempts?, dl?)
makeResp(anchor, tag, method, block, round, slot, replyRctu?, dl?)
makeFinal(tag, times, block, round, slot, dl?)     // DL: pass times = []
```

Call notes for Task 2: in DL-TDoA the Poll's `anchors` argument is the **responders** (anchors 1…N−1);
the Response's `tag` argument should be `'*'` (every tag is the audience, and the decoder already treats
a `*` destination as broadcast); the Final's `times` is empty — a listening tag wants the instants, not
the round trips. Each builder copies `dl` (including `rxCounters`) into the FrameDesc, so a later slot
cannot rewrite what a frame already said. IE lists are derived from the data: `TXT` always, `RXT` when
`rxCounters` is non-empty, `COFF` when `coffs` is set — and the sizes come from the same function, so a
frame cannot be decoded at a width it was not built at.

### Solver (`src/uwb/position.ts`)

```ts
export function solveTdoa(anchors: AnchorPos[], refId: string, deltas: { id: string; dtNs: number }[],
                          zTag: number, sigmaRangeM: number): Fix | null
```

Residual `r_i = (‖p − a_i‖ − ‖p − a_ref‖) − c·Δt_i` (Δt in ns × `C_M_PER_NS`), J row `u_i − u_ref`
(horizontal parts of the 3-D unit vectors), Gauss–Newton from the centroid of the reference plus the
anchors used, 20 iterations / 1 mm step, the same `MIN_DET` singularity guard. The GDOP/ellipse/residual
tail of `solvePosition` was factored into a shared `fixFrom(...)` that both solvers now call — `solvePosition`
behaviour is bit-identical (its pinned tests still pass). `null` on: unknown `refId`, fewer than 3 usable
deltas (the reference's own delta and deltas for unknown anchors do not count), singular geometry.

## Byte accounting

Every ranging time is **4 octets** (exactly as the RRTI IE sizes one) and the clock offset is **2**, as
briefed. **Deviation from the brief's shorthand, deliberate and documented:** each of these rides in its
own IE, and every IE in `uwb/phy.ts` carries the file's 2-octet element header (ID + length). Counted
exactly, the frames therefore grow by 6 / 16 / 8 + 4·(N−1) octets, not 4 / 10 / 4 + 4·(N−1). Choosing
otherwise would have made these the only header-less IEs in the file.

| constant / function | octets | breakdown |
| --- | --- | --- |
| `BLINK_IE_BYTES` | 3 | header 2 + 1 |
| `UWB_BLINK_BYTES` | **14** | MHR 9 + blink IE 3 + FCS 2 |
| `DL_TX_TIME_IE_BYTES` | 6 | header 2 + TX counter 4 |
| `dlRxTimesIeBytes(n)` | 2 + 4n | header 2 + one 4-octet RX counter per time, in slot order |
| `DL_COFFS_IE_BYTES` | 4 | header 2 + 16-bit CFO |
| `dlExtraBytes(rx, coffs)` | 6 + (rx ? 2 + 4·rx : 0) + (coffs ? 4 : 0) | the one definition builders and decoder share |
| `uwbDlPollBytes(R)` | 33 + 3R (**42** at R = 3) | `uwbPollBytes(R)` 27 + 3R, + TX time 6 |
| `uwbDlRespBytes()` | **30** | DS Response 14 + TX 6 + RX(1) 6 + coffs 4 |
| `uwbDlFinalBytes(R)` | 22 + 4R (**34** at R = 3) | MHR 9 + RRMC 3 + FCS 2 + TX 6 + RX(R) 2 + 4R |

The DL Final carries no two-way times, so it does **not** grow 12 octets per anchor the way the TWR Final
does: at 9 anchors it is 54 octets against the TWR Final's 122, and `UWB_MAX_ANCHORS` (a 127-octet PSDU
rule derived from the TWR Final) stays the binding cap in every mode.

PPDU airtimes (SP1 BPRF, `uwbPpduNs`) and slot fits (`+ UWB_SLOT_GUARD_NS` 200 ns):

| frame | octets | airtime ns | slot fit ns |
| --- | --- | --- | --- |
| blink | 14 | 181 218 | 181 418 |
| DL Response | 30 | 197 628 | — |
| DL Final (R = 3) | 34 | 201 731 | — |
| DL Poll (R = 3) | 42 | 216 090 | 216 290 (`uwbSlotFitNs(4, 'dl-tdoa')`) |
| DL Poll (R = 8) | 57 | 231 474 | 231 674 (`uwbSlotFitNs(9, 'dl-tdoa')`) |
| TWR Final (A = 4) | 62 | 236 603 | 236 803 (`uwbSlotFitNs(4)`) |

`uwbLongestFrameBytes(anchors, mode)` is the new seam: TWR Final / max(DL Poll, DL Response, DL Final) /
blink. In DL-TDoA the Poll is the longest frame (its RDM IE grows 3 per responder against the Final's 4,
but it starts 11 ahead), so the slot rule is a Poll rule there, not a Final rule.

## GDOP values (pinned in `tests/uwb/position.test.ts`)

Square 10 × 10, anchors at the corners, tag at the centre, reference `a1` at (0, 0), σ = 0.042 m:

- rows `u_i − u_ref` are (−√2, 0), (0, −√2), (−√2, −√2); `JtJ = [[4, 2], [2, 4]]`, det 12.
- **GDOP = √(2/3) = 0.816 496 580 927 726 1**.
- ellipse a = σ/√2 = 0.029 698 m, b = σ/√6 = 0.017 146 m (ratio √3), θ = −π/4 — the major axis lies on the
  a2–a3 diagonal, across the reference anchor's own.

**Caveat for Tasks 2–5:** a difference row has norm up to 2 where a spherical row is a unit vector, so this
GDOP is *not* on the same scale as `solvePosition`'s 1.00 at the same point and the two numbers must not be
compared term for term in a lesson. What does compare is the shape: trilateration gives a circle there, the
hyperbolic fix an ellipse √3 times as long as it is wide. If a lesson wants a like-for-like number, the
per-difference sigma (√2 σ for two independent timestamps) should be passed in `sigmaRangeM`.

## Files touched beyond the brief's list (all forced by the new frame kind)

`src/model/frames.ts` (`FrameKind` + `'uwbBlink'`), `src/model/frameFields.ts` (`FieldKey` + the four IE
keys), `src/uwb/format.ts` (`KIND_SHORT`, `Record<UwbFrameKind, …>`), `src/scene/effects.ts` (frame colour,
exhaustive switch), `src/ui/laneLayout.ts` (one label branch — without it a blink would have been labelled
"CTS" by the chain's fallback), `src/ui/i18n.ts`: the four field names EN/ZH as permitted, plus
`kindName`/`whatIs`/`next`/`laneTip` entries for `uwbBlink` in both languages, which `Record<FrameKind, …>`
makes mandatory. No course file, no lesson hash fixture was touched.

## Not built here (Tasks 2–3)

Device behaviour: who listens, the tag's rate correction from the poll-to-Final interval
(`tdoaClockCorrection`), the anchors' shared timebase and `syncErrorNs`, the `UWB_TDOA` / `UWB_POSITION`
records, and the network's mode-aware round scheduling (it still schedules `roundsPerBlock` rounds of one
tag each; for `dl-tdoa` it must run round 0 with every tag listening).

## Fix round 1

Review `task-1-review.md` (Spec CHANGES REQUIRED: 1 medium, 5 minor, 1 informational). No exported
signature changed — Task 2's call sites are untouched, and `uwbDl*Bytes` only gained defaulted trailing
parameters. Files: `src/model/scenario.ts`, `src/uwb/phy.ts`, `src/uwb/frames.ts`, `src/uwb/position.ts`
and two test files.

- **#1 (Medium) — the block-fit floor is back in every mode.** `fits < 1` now raises "the UWB block of N
  RSTU is too short for one round of S slots × R RSTU" before the tags rule (`else if`), so `dl-tdoa`
  lifts only the *tags ≤ roundsPerBlock* rule and a round can no longer outlive its block. Test: 4
  anchors, `blockRstu: 3000`, `slotRstu: 2400` — rejected in `dl-tdoa` and `twr` (and the tags message
  does not double it), accepted in `ul-tdoa`, whose one-slot round does fit.
- **#2 (Minor) — one mistake, one issue.** The two schedule checks are now one
  (`mode !== 'twr' && schedule !== 'time'`), worded "contention-based rounds are two-way ranging only;
  one-way ranging needs a time-scheduled session". A test asserts the issue count is exactly 1.
- **#3 (Minor) — one source of truth per DL frame.** `uwbDlPollBytes(responders, rxTimes = 0,
  coffs = false)`, `uwbDlRespBytes(rxTimes = 1, coffs = true)` and `uwbDlFinalBytes(responders,
  coffs = false)` are now what the builders size at, passing what their own `dl` payload holds, so the
  schema's slot rule measures the same arithmetic the builder used. `dlExtra` in `frames.ts` is gone
  (only `rxCount` remains). Tests pin the equality for the canonical three messages and for two
  non-canonical payloads (a Poll carrying an RX time and a coffs, a Response without one), decoder sums
  included.
- **#4 (Minor) — `UWB_MAX_ANCHORS` no longer claims a TWR fact for every mode.** Both the constant's
  comment and the schema message now say the 12-octets-per-anchor growth is the TWR Final's, and that
  the same cap is conservative for the one-way modes (their longest frame is the DL Poll, 57 octets at
  nine anchors).
- **#5 (Minor) — shared solver helpers.** `accumulateNormal` now goes through `unitTo`, and the
  Gauss–Newton loop is a single `gaussNewton(x0, y0, accumulate)` both solvers call with their own
  accumulator; `fixFrom` is unchanged. Same arithmetic in the same order, so `solvePosition` stays
  bit-identical — its pinned tests (GDOP 1.0, σ/√2 circle, exact recovery) and the `solveTdoa` ones all
  still pass.
- **#6 (Minor) — parked** by the controller: `makePoll`'s positional tail is for the combined fix wave.
- **#7 (Informational) — forwarded to Task 2:** `format.ts` prints every `UWB_ROUND` as "…-TWR", and
  `UwbDevice.transmitFor` has no `uwbBlink` case yet.

Verification after the fixes: `npx tsc -b` reports nothing in this task's files (the remaining
diagnostics are Task 2's in-flight `network.ts` / `records.ts` / `view.ts` and their tests);
`npx vitest run tests/uwb tests/model tests/engine/lesson-hashes.test.ts` is 24 of 25 files green —
262 passed, the only failure being Task 2's `tests/uwb/view.test.ts` (its new `tdoa` view field).
This task's own files: 78 tests, all passing.
