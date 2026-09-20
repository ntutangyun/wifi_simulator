# Task 7 report — UWB records-hash determinism guard

Commit `bd65183`. Files: `tests/engine/uwb-record-hashes.test.ts` (new), `tests/fixtures/uwb-record-hashes.json`
(new). No engine, lesson or timeline-fixture file touched; `src/engine/hash.ts` was read but not modified — a
test-local FNV-1a fold (copied from its `hashStr`) was sufficient.

## What was built

`tests/engine/uwb-record-hashes.test.ts` enumerates every `LESSONS` entry whose `id` starts with `uwb-` (12
lessons today) plus each of its variants, keyed exactly like the timeline fixture: `${lessonId}` for the base
scene, `${lessonId}#${variantIndex}` for a variant — 12 base + 25 variants = **37 keys**.

For each key, one `it(key, ...)` runs its own fresh `new Simulation(scenario).runUntil(1300 * MS)`, filters
`records` to `type.startsWith('UWB_')`, and hashes them:

- Per record: `type`, `node`, then every other own enumerable field (including `t` and `seq`) in **sorted key
  order**, so a field reorder in `src/uwb/records.ts` or `device.ts` can never move the serialised line.
- Numbers: `Number(x.toFixed(6))`; `NaN`, `Infinity`, `-Infinity` and `null` spelled out explicitly (a JSON round
  trip cannot carry the first three, and `UWB_MMS_TRAIN`'s `NOTHING_HEARD_DBM` sentinel already exists for
  exactly that reason).
- Strings/booleans verbatim; nested objects (`ellipse: {a,b,thetaRad}`) and arrays walked recursively in sorted
  key order.
- The per-record lines are folded straight into one running FNV-1a accumulator (`0x811c9dc5` seed, same
  constants as `hashStr`), with a record separator between them — no array of serialised lines is built unless a
  mismatch is found, per "hash-compare first".

`{ [key]: hash }` is written to the fixture (`UPDATE_HASHES=1`, same env var and full-rebuild-not-merge
behaviour as `lesson-hashes.test.ts`). A missing key throws "no recorded UWB record hash for '<key>' —
regenerate deliberately with UPDATE_HASHES=1 …". A hash mismatch throws the key, expected/actual hash, the
record count, and the first UWB_* record's index and full JSON content plus its serialised line — the record
content a developer needs to start debugging. (The fixture stores only a hash per key, as specified, so there is
no historical record content to diff positionally against; "first differing record" is read as "the first
record of the now-mismatching set", which is what the failure prints.)

Per the brief, each key is its own `it()` and nothing is memoised across tests — every test builds its own
`Simulation` from scratch, unlike `uwb-ul-tdoa.test.ts`'s shared `runOf` memo helper.

## Runtime

37 tests in **3.5–3.9 s** test time (4.8–5.4 s wall including collect/transform), comfortably under the ~60 s
budget. No shrinking of the 1.3 s window was needed.

## RED / GREEN evidence

- **RED** (before the fixture existed): `npx vitest run tests/engine/uwb-record-hashes.test.ts` → all 37 tests
  failed, each with `no recorded UWB record hash for '<key>' — regenerate deliberately with UPDATE_HASHES=1
  npx vitest run tests/engine/uwb-record-hashes.test.ts and explain the change in the commit message.`
- **Regenerate**: `$env:UPDATE_HASHES='1'; npx vitest run tests/engine/uwb-record-hashes.test.ts` → 37/37 green,
  fixture written (1071 bytes, 37 keys).
- **GREEN**: `npx vitest run tests/engine/uwb-record-hashes.test.ts tests/engine/lesson-hashes.test.ts` → 38/38
  green (37 + the timeline guard's 1).
- **Failure-path check**: tampered one fixture value (`uwb-intro` → `deadbeef`) and reran with `-t uwb-intro`;
  got exactly the designed message:
  ```
  UWB record hash for 'uwb-intro' no longer matches the recorded fixture (expected deadbeef, got 1ada81b1)
  over 63 UWB_* records.
  First record (index 0): {"t":0,"type":"UWB_ROUND","node":"tag-1","block":0,"round":0,"slots":2,
  "slotNs":2000000,"method":"ss","mode":"twr","untilNs":4000000,"seq":0}
  First serialised line: type:UWB_ROUND|node:tag-1|block:0|method:ss|mode:twr|round:0|seq:0|slotNs:2000000|
  slots:2|t:0|untilNs:4000000
  ```
  then regenerated the fixture cleanly again before committing.

## Gates

- `npx tsc -b`: clean.
- `npx vitest run tests/engine/uwb-record-hashes.test.ts tests/engine/lesson-hashes.test.ts`: 38/38 green.
- `git status`: only the two new files touched; `tests/fixtures/lesson-hashes.json` unchanged throughout.

## Self-review

- Confirmed field order robustness: sorting keys (rather than relying on object-literal insertion order) means
  a cosmetic reorder of fields in a record's construction site in `device.ts` will not itself flip the hash —
  only an actual value change will. This is a deliberate strengthening beyond a literal "insertion order" read
  of the brief, and is called out here in case a reviewer wants insertion order instead.
- `t` and `seq` are included in the hashed fields (not excluded), so the guard also covers UWB event timing and
  ordering, not only field values — a stricter guard than "reception-side fields only" but one that costs
  nothing extra to compute and catches strictly more regressions.
- Verified the fixture is a plain hash-only map (no leaked record content), matching the requirement's exact
  shape.
- One interpretive call worth flagging: the brief's "index and content of the first differing record" implies a
  positional diff against a historical record list, but only a single hash per key is persisted (as the brief
  itself specifies), so no such list exists to diff against. The failure message instead surfaces the first
  record of the current (mismatching) run — the most useful debugging anchor available under that constraint.
