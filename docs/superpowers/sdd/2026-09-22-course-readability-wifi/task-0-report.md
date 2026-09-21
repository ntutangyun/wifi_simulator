# T0 report — Wi-Fi lessons and scene builders into tier1/, tier2/ and wifiScenes.ts

## What moved

Six tier-0 lessons out of `src/course/lessons.ts` into `src/course/tier1/`:
`airtime.ts`, `ifs.ts`, `backoff.ts`, `nav.ts`, `hidden.ts`, `anomaly.ts`.

Twelve tier-1 lessons into `src/course/tier2/`:
`edca.ts`, `ampdu.ts`, `txop.ts`, `txop-protect.ts`, `ofdma-dl.ts`, `ofdma-ul.ts`,
`mlo.ts`, `capstone.ts`, `width.ts`, `streams.ts`, `mumimo.ts`, `rate.ts`.

Each new file follows the `tier1/radio-primer.ts` shape: an `import { type Lesson, ... } from '../lessonKit'`
line (plus `../wifiScenes` and/or `../../model/caps` where a lesson needs them),
then `export const <camelId>: Lesson = { ... }`. File names match the lesson
`id` exactly (so `txop-protect.ts`, `ofdma-dl.ts`, `ofdma-ul.ts`).

## wifiScenes.ts

New `src/course/wifiScenes.ts` holds the scene builders shared across lessons:
`oneRoom`, `hallwayHouse`, `longApartment`, `sc` (moved out of `lessonKit.ts`,
unchanged) plus `widthScenario`, `mumimoScenario`, `rateScenario` (moved out of
`lessons.ts`, unchanged). `lessonKit.ts` now does
`export { oneRoom, hallwayHouse, longApartment, sc } from './wifiScenes'`
(and also imports `sc` itself, since `lessonKit.ts`'s own `uwbSc` helper calls
it) — every existing `from './lessonKit'` import of these four names in
amp/uwb/tier1 files keeps working unchanged, satisfying "reachable from where
they import it today." `wifiScenes.ts` imports `brick` and `node` back from
`lessonKit.ts`; this is a real import cycle between the two files, but every
use of the cycled names is inside function bodies (`oneRoom`, `hallwayHouse`,
`longApartment`, `widthScenario`, etc.) that only run after the whole module
graph has loaded, never at module-evaluation time, so it is safe — confirmed
by `tsc -b` and the full test run.

## lessons.ts

Now only the assembly: imports for every lesson (amp/uwb files unchanged,
new imports for the 18 moved tier1/tier2 lessons) and the `AUTHORED` array in
the same order as before, with the original `// ==== MODULE n ====` separator
comments kept in place between groups.

## scripts/lesson-dump.ts

Added `--all-wifi` beside `--all-uwb` (filters `trackOf(x) === 'wifi'`),
updated the header comment and the usage/error text.

## Not byte-identical (and why)

Nothing in lesson text changed. The only textual differences from the
original are structural, exactly as scoped: 2-space dedent (array element →
top-level `const`), the trailing `},` → `}` on the lesson's closing brace, and
new file-level docstrings/import lines that didn't exist before (import
lists are new code, not lesson content). No word, table cell, quiz option or
provenance string was reworded, reordered or retyped — extraction was done by
a script that sliced the original file's exact lines and only dedented them,
never retranscribed the prose, to rule out transcription drift.

## Gates

- `npx tsc -b --noEmit`: clean.
- `npx vitest run`: 136 files / 2357 tests passed.
- `git status --short`: `tests/fixtures/lesson-hashes.json` and
  `tests/fixtures/uwb-record-hashes.json` do not appear (unmodified).
- `npx tsx scripts/lesson-dump.ts --all-wifi`: prints exactly 26 lines.

## Files touched

- Modified: `src/course/lessons.ts`, `src/course/lessonKit.ts`, `scripts/lesson-dump.ts`
- Added: `src/course/wifiScenes.ts`
- Added: `src/course/tier1/{airtime,ifs,backoff,nav,hidden,anomaly}.ts`
- Added: `src/course/tier2/{edca,ampdu,txop,txop-protect,ofdma-dl,ofdma-ul,mlo,capstone,width,streams,mumimo,rate}.ts`
