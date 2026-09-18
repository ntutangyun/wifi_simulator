# Task 5 report: Simulation wiring — per-link timing and path loss

## What

Implemented `LINK_EXTRA_LOSS_DB` (real 2.4 GHz figure of −6.5 dB, replacing the
Task 4 placeholder `0` + `TODO(Task 5)`) and `timingFor(link)` in
`src/engine/simulation.ts`, and wired both, plus link-aware `negotiatedWidth`,
through the per-link `WifiMac` construction loop. Replaced the old
`primaryMac`/ARRIVAL logic (which only knew about `5g`/`6g`) with a
`primaryVid` helper driven by `plan.virtualIds` order, so a 2g-only station's
primary MAC and ARRIVAL record resolve correctly.

Exactly the diff the brief specified:
- `LINK_EXTRA_LOSS_DB: Record<LinkId, number> = { '2g': -6.5, '5g': 0, '6g': 1.2 }`
- `export function timingFor(link: LinkId): PhyTiming { return link === '2g' ? ERP_2G : OFDM_5G }`
- WifiMac cfg gets `timing: timingFor(link)`.
- `widthForPeer: (peer) => negotiatedWidth(n, other(n, peer), link)`.
- `mcsForPeer`'s ceiling now calls `mcsForRssi(mode, rssi, cap, negotiatedWidth(n, peerCfg, link))`.
- `primaryVid = (id) => plan.virtualIds.find((v) => physicalId(v) === id)!`,
  `primaryMac(id) = this.macs.get(primaryVid(id))!`, and `enqueue`'s ARRIVAL
  record uses `node: primaryVid(atNode)`.

## TDD evidence

### RED

Appended the brief's `describe('a station on the 2.4 GHz link inside a
Simulation', ...)` block (imports of `Simulation`, `LINK_EXTRA_LOSS_DB`,
`timingFor` from `../../src/engine/simulation`, `defaultScenario` from
`../../src/model/scenario`, `buildLinkTable` from
`../../src/engine/propagation`; `ERP_2G`/`OFDM_5G` were already imported) to
`tests/engine/link-2g.test.ts`, then:

```
$ npx vitest run tests/engine/link-2g.test.ts
```

Result: 3 failed / 7 passed (the 7 already-passing ones are Tasks 2/3 tests,
untouched):

```
 × a station on the 2.4 GHz link inside a Simulation > path loss on 2.4 GHz is 6.5 dB lower than on 5 GHz
   → expected { '5g': +0, '6g': 1.2, '2g': +0 } to deeply equal { '2g': -6.5, '5g': +0, '6g': 1.2 }
 × a station on the 2.4 GHz link inside a Simulation > records on the 2g lane use the 2.4 GHz timing and carry the extension
   → Cannot read properties of undefined (reading 'enqueue')
     at TrafficSource.enqueue src/engine/simulation.ts:183:24
 × a station on the 2.4 GHz link inside a Simulation > the 2g link table is the 5g table plus 6.5 dB
   → Cannot read properties of undefined (reading 'enqueue')
```

Failing for the right reason: `LINK_EXTRA_LOSS_DB['2g']` was still the Task 4
placeholder `0`, and `primaryMac` (pre-fix) only recognized `'5g'`/`'6g'`
members, so a 2g-only station's `enqueue` call hit `this.macs.get(undefined
virtualId)!.enqueue` → `undefined.enqueue`.

### GREEN

Implemented the brief's changes in `src/engine/simulation.ts`, then:

```
$ npx vitest run tests/engine/link-2g.test.ts
 ✓ tests/engine/link-2g.test.ts (10 tests) 55ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

## Suites run

```
$ npx vitest run tests/engine tests/model tests/course
 Test Files  59 passed (59)
      Tests  542 passed (542)
```

Includes `tests/engine/lesson-hashes.test.ts` (1 test, passing) — the 5 GHz
hash fixture is untouched: bit-identical, as required.

```
$ npx tsc -b
(no output — clean)
```

One TS fix needed along the way: TypeScript doesn't narrow `Array.prototype.find`'s
return type through a plain `r.type === 'X'` boolean predicate, so
`tx.frame.mbps`/`tx.frame.mcs` in the third test (accessed *after* the `find`,
not inside its predicate) didn't type-check. Fixed with the same pattern
already used elsewhere in this test suite (e.g.
`tests/engine/mlo-reachability.test.ts`, `tests/engine/dl-mu-standard.test.ts`):
added `import type { TLRecord } from '../../src/model/records'`, a local
`type Rec<K extends TLRecord['type']> = Extract<TLRecord, { type: K }>`, and
gave that one `.find` an explicit type predicate:
`recs.find((r): r is Rec<'TX_START'> => r.type === 'TX_START' && ...)`. No
behavior change, no `as` casts.

## Files changed

- `src/engine/simulation.ts` — `LINK_EXTRA_LOSS_DB` real value, new
  `timingFor`, `timing` in WifiMac cfg, link-aware `negotiatedWidth` calls
  (`widthForPeer`, `mcsForPeer`'s ceiling), new `primaryVid` helper replacing
  the old `primaryMac`, ARRIVAL record uses `primaryVid`.
- `tests/engine/link-2g.test.ts` — appended the brief's `describe` block
  verbatim, plus the strengthened third test and the `Rec<K>` type-predicate
  fix described above.

## Note on the brief's third test (as flagged in the task instructions)

The brief's own assertions in `'the 2g link table is the 5g table plus 6.5
dB'` (`tx.frame.mbps > 0` and a sanity check that the fixture geometry isn't
point-blank) don't actually exercise the −6.5 dB offset — any positive mbps
would pass whether or not the offset were wired up. Per the task
instructions, I strengthened it (did not delete the brief's assertions):
computed the RSSI from the *5g* link table (`table.get('sta-1')!.get('ap')!`),
added 6.5 dB by hand to reproduce what the 2g lane's effective RSSI should be
(`row.set(k, v - extra)` in `simulation.ts` with `extra = -6.5` means `v +
6.5`), then asserted the transmitted data frame's actual `mcs`/`mbps` on the
2g lane equals `mcsForRssi('he', rssi5g + 6.5, undefined, 20)` /
`mcsRateMbps('he', expectedMcs)` — `'he'` because `sta-1` is HE and `ap` is
EHT, so `minGen` picks `'he'`; width 20 because `sta-1` defaults to 20 MHz
and 2.4 GHz caps at 40 MHz anyway, so the cap never binds here. This directly
ties the test to the LINK_EXTRA_LOSS_DB wiring: reverting the 2g offset (or
the `negotiatedWidth(..., link)` plumbing) would break this assertion, not
just an "is it positive" check.

## Self-review

- Diff matches the brief's Step 3 code verbatim (constant, function,
  `timing` cfg field, the two `negotiatedWidth(..., link)` call sites,
  `primaryVid`/`primaryMac`, ARRIVAL using `primaryVid`).
- MLO sibling-poke line (`vid.startsWith(`${atNode}#`)`) left untouched, as
  the brief said — verified it still reads exactly as before.
- `LINK_EXTRA_LOSS_DB` key order in source is `{ '2g', '5g', '6g' }`, matching
  the brief's `Produces:` line and the test's `toEqual` (object key order is
  irrelevant to `toEqual`, but matched anyway for readability parity with the
  brief).
- Hash fixture (`tests/engine/lesson-hashes.test.ts`) passed unmodified —
  file untouched, confirmed via `git status`/`git diff` before commit only
  touched the two intended files.
- Test output is pristine: no `console.error`/warnings in either suite run,
  no skipped/pending tests introduced.
- `git status` after commit is clean; `git log -1` shows the single commit
  with the brief's exact subject line and the required attribution trailer.

## Concerns

- None blocking. The one deviation from the brief's literal file list is
  adding a `type Rec<K>` alias and a `TLRecord` type import to
  `tests/engine/link-2g.test.ts` — required only because TypeScript doesn't
  narrow `find()` predicates automatically past the callback boundary; this
  mirrors the exact idiom already used in four other test files in this
  suite, so it isn't a new pattern.
