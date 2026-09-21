# Review package: bd65183~1..bd65183

## Commits
bd65183 test(uwb): records-hash fixture for every UWB lesson scene

## Files changed
 tests/engine/uwb-record-hashes.test.ts | 147 +++++++++++++++++++++++++++++++++
 tests/fixtures/uwb-record-hashes.json  |  39 +++++++++
 2 files changed, 186 insertions(+)

## Diff
diff --git a/tests/engine/uwb-record-hashes.test.ts b/tests/engine/uwb-record-hashes.test.ts
new file mode 100644
index 0000000..d79ec57
--- /dev/null
+++ b/tests/engine/uwb-record-hashes.test.ts
@@ -0,0 +1,147 @@
+/**
+ * Guard: every UWB lesson scene (base scenario and each variant) hashes its own
+ * UWB_* records — SIR, capture, train detection, ranges, fixes, LBT and the rest
+ * of the reception side that the air-only timeline hash (tests/engine/lesson-hashes.test.ts,
+ * which folds only `t:seq:type`) never touches. One test per lesson/variant key, each
+ * running its own Simulation fresh — nothing is memoised across tests.
+ *
+ * Regenerate deliberately with UPDATE_HASHES=1 npx vitest run tests/engine/uwb-record-hashes.test.ts
+ * and explain the change in the commit message.
+ */
+import { describe, it, expect, afterAll } from 'vitest'
+import fs from 'node:fs'
+import path from 'node:path'
+import { LESSONS } from '../../src/course/lessons'
+import { Simulation } from '../../src/engine/simulation'
+import type { Scenario } from '../../src/model/scenario'
+import type { TLRecord } from '../../src/model/records'
+
+const MS = 1_000_000
+/** The window every UWB lesson measures over (see tests/course/uwb-ul-tdoa.test.ts and its
+ * siblings): seven 200 ms blocks, closed with margin before an eighth would start. */
+const RUN_NS = 1300 * MS
+const FIXTURE = path.resolve(__dirname, '../fixtures/uwb-record-hashes.json')
+const UPDATE = !!process.env.UPDATE_HASHES
+
+/** Base scene keyed by lesson id, each variant keyed `${lessonId}#${variantIndex}` —
+ * the timeline fixture's own key style (tests/engine/lesson-hashes.test.ts). */
+function scenarios(): { key: string; sc: Scenario }[] {
+  const out: { key: string; sc: Scenario }[] = []
+  for (const l of LESSONS) {
+    if (!l.id.startsWith('uwb-')) continue
+    out.push({ key: l.id, sc: l.scenario() })
+    l.variants?.forEach((v, i) => out.push({ key: `${l.id}#${i}`, sc: v.scenario() }))
+  }
+  return out
+}
+
+/** Canonical text for one value: numbers to 6 decimals, with the three values a JSON
+ * round trip cannot carry (`NaN`, `±Infinity`, `null`) spelled out explicitly; strings
+ * and booleans verbatim; objects and arrays walked recursively in key order so a field
+ * reorder in the source can never move the line. */
+function serialiseValue(v: unknown): string {
+  if (v === null) return 'null'
+  if (v === undefined) return 'undefined'
+  if (typeof v === 'number') {
+    if (Number.isNaN(v)) return 'NaN'
+    if (v === Infinity) return 'Infinity'
+    if (v === -Infinity) return '-Infinity'
+    return String(Number(v.toFixed(6)))
+  }
+  if (typeof v === 'string' || typeof v === 'boolean') return String(v)
+  if (Array.isArray(v)) return `[${v.map(serialiseValue).join(',')}]`
+  if (typeof v === 'object') {
+    const o = v as Record<string, unknown>
+    return `{${Object.keys(o).sort().map((k) => `${k}:${serialiseValue(o[k])}`).join(',')}}`
+  }
+  return String(v)
+}
+
+/** One record, as `type`, `node`, then every other own enumerable field (including `t`
+ * and `seq`) in sorted key order. */
+function serialiseRecord(r: TLRecord): string {
+  const o = r as unknown as Record<string, unknown>
+  const rest = Object.keys(o).filter((k) => k !== 'type' && k !== 'node').sort()
+  const parts = [`type:${String(o.type)}`, `node:${String(o.node)}`]
+  for (const k of rest) parts.push(`${k}:${serialiseValue(o[k])}`)
+  return parts.join('|')
+}
+
+/** FNV-1a fold over every record's serialised line, a record separator between them so
+ * `"ab"` then `"c"` can never hash the same as `"a"` then `"bc"`. Streams straight from the
+ * records — no intermediate array of lines is built on the (hash-compare-first) hot path. */
+function hashOf(records: TLRecord[]): string {
+  let h = 0x811c9dc5
+  const fold = (s: string) => {
+    for (let i = 0; i < s.length; i++) {
+      h ^= s.charCodeAt(i)
+      h = Math.imul(h, 0x01000193)
+    }
+  }
+  for (const r of records) {
+    fold(serialiseRecord(r))
+    fold('\n')
+  }
+  return (h >>> 0).toString(16)
+}
+
+function uwbRecordsOf(sc: Scenario): TLRecord[] {
+  const sim = new Simulation(sc)
+  return sim.runUntil(RUN_NS).records.filter((r) => r.type.startsWith('UWB_'))
+}
+
+function readFixture(): Record<string, string> {
+  try {
+    return JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as Record<string, string>
+  } catch {
+    return {}
+  }
+}
+
+describe('UWB record hashes of every UWB lesson scene', () => {
+  const recorded = readFixture()
+  const toWrite: Record<string, string> = {}
+
+  afterAll(() => {
+    if (!UPDATE) return
+    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true })
+    fs.writeFileSync(FIXTURE, JSON.stringify(toWrite, null, 2) + '\n')
+  })
+
+  for (const { key, sc } of scenarios()) {
+    it(key, () => {
+      const records = uwbRecordsOf(sc)
+      const hash = hashOf(records)
+
+      if (UPDATE) {
+        toWrite[key] = hash
+        expect(hash).toBe(hash)
+        return
+      }
+
+      const expected = recorded[key]
+      if (expected === undefined) {
+        throw new Error(
+          `no recorded UWB record hash for '${key}' — regenerate deliberately with `
+          + 'UPDATE_HASHES=1 npx vitest run tests/engine/uwb-record-hashes.test.ts '
+          + 'and explain the change in the commit message.',
+        )
+      }
+      if (hash !== expected) {
+        // Only on a mismatch: materialise the serialised lines and the first record's
+        // content, so the failure names something a developer can start from.
+        const lines = records.map(serialiseRecord)
+        const first = records[0]
+        throw new Error(
+          `UWB record hash for '${key}' no longer matches the recorded fixture `
+          + `(expected ${expected}, got ${hash}) over ${records.length} UWB_* records.\n`
+          + `First record (index 0): ${first ? JSON.stringify(first) : '<none>'}\n`
+          + `First serialised line: ${lines[0] ?? '<none>'}\n`
+          + 'If this is a deliberate change, regenerate with UPDATE_HASHES=1 npx vitest run '
+          + 'tests/engine/uwb-record-hashes.test.ts and explain the change in the commit message.',
+        )
+      }
+      expect(hash).toBe(expected)
+    })
+  }
+})
diff --git a/tests/fixtures/uwb-record-hashes.json b/tests/fixtures/uwb-record-hashes.json
new file mode 100644
index 0000000..100566d
--- /dev/null
+++ b/tests/fixtures/uwb-record-hashes.json
@@ -0,0 +1,39 @@
+{
+  "uwb-intro": "1ada81b1",
+  "uwb-intro#0": "98180104",
+  "uwb-sstwr": "8f987747",
+  "uwb-sstwr#0": "aaec6f46",
+  "uwb-sstwr#1": "c3bce7fa",
+  "uwb-dstwr": "77d01690",
+  "uwb-dstwr#0": "db377b9c",
+  "uwb-blocks": "61f12a0a",
+  "uwb-blocks#0": "a1a161e",
+  "uwb-position": "419eeeeb",
+  "uwb-position#0": "6a80ee32",
+  "uwb-position#1": "c9030cd2",
+  "uwb-coexist": "b75e1d47",
+  "uwb-coexist#0": "f0466ba0",
+  "uwb-coexist#1": "f0466ba0",
+  "uwb-coexist#2": "ca679335",
+  "uwb-coexist#3": "811c9dc5",
+  "uwb-contention": "812c10ad",
+  "uwb-contention#0": "c61d5254",
+  "uwb-contention#1": "4f31c220",
+  "uwb-dl-tdoa": "880b58db",
+  "uwb-dl-tdoa#0": "85b0161f",
+  "uwb-dl-tdoa#1": "10551c37",
+  "uwb-ul-tdoa": "1f3f486",
+  "uwb-ul-tdoa#0": "2d74e6be",
+  "uwb-aoa": "80846581",
+  "uwb-aoa#0": "ed087dba",
+  "uwb-aoa#1": "bcf8c1ae",
+  "uwb-aoa#2": "28093454",
+  "uwb-mms": "570d5920",
+  "uwb-mms#0": "3f439e6",
+  "uwb-mms#1": "84fb6090",
+  "uwb-mms#2": "6860caff",
+  "uwb-nba": "c035d3f0",
+  "uwb-nba#0": "9960de2c",
+  "uwb-nba#1": "188980c4",
+  "uwb-nba#2": "676dd7a5"
+}
