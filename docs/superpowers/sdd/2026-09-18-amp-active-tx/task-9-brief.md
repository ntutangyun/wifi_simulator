### Task 9: Curriculum module and lesson kit helpers

**Files:**
- Modify: `src/course/curriculum.ts` (`MODULES`, `COURSE_ORDER`), `src/course/lessonKit.ts` (helpers), `src/course/lessons.ts` (imports, once lessons exist)
- Test: `tests/course/lessons.test.ts` (module tier list)

**Interfaces (produced):**
```ts
// lessonKit.ts
export function tag(id: string, name: string, x: number, y: number, dlSensDbm?: number): NodeCfg
export function ampAp(id: string, name: string, x: number, y: number, amp: Partial<AmpApCfg> = {}, features?: Record<string, boolean>): NodeCfg  // eht AP with edca+txop and ampAp
export const firstAmpTrigger = txOf((r) => r.frame.kind === 'ampTrigger')
export const firstAmpResp = txOf((r) => r.frame.kind === 'ampResp')
export const firstAmpAck = txOf((r) => r.frame.kind === 'ampAck')
export const firstAmpAckToTag = txOf((r) => r.frame.kind === 'ampAck' && r.frame.dst !== r.frame.src)
export const firstAmpSatOut = (r: TLRecord) => r.type === 'AMP_ABOC' && r.slot === null
export const firstAmpLost = (r: TLRecord) => r.type === 'AMP_RESULT' && r.sent && !r.acked
export const firstScheduledTrigger = txOf((r) => r.frame.kind === 'ampTrigger' && r.frame.amp?.phase === 'scheduled')
```
`MODULES`: insert `{ tier: 1, title: { en: 'Ambient power IoT (802.11bp)', zh: '环境能量物联网（802.11bp）' } }` at index 7 (before "Real applications"); the capstone lesson's `module` becomes 8; Tier 3/4 modules shift to 9 and 10. `COURSE_ORDER`: after `'mlo'` insert `'amp-intro', 'amp-slots', 'amp-coexist'`.

- [ ] **Step 1: Update the test** in `tests/course/lessons.test.ts`: `expect(MODULES.map((m) => m.tier)).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 3])`; and in the tier test list add `'amp-intro'` among Tier 1 (index 1) ids once it exists.
- [ ] **Step 2: Run to see it fail.**
- [ ] **Step 3: Implement** `curriculum.ts`, the capstone `module: 8` in `src/course/lessons.ts` (search `id: 'capstone'`), and the `lessonKit.ts` helpers:
```ts
export function tag(id: string, name: string, x: number, y: number, dlSensDbm?: number): NodeCfg {
  return { id, kind: 'amp', name, pos: { x, y, z: 1 }, txPowerDbm: 0, profiles: ['idle'], caps: { generation: 'nonht', features: {} }, linkId: '2g', ampTag: dlSensDbm === undefined ? {} : { dlSensDbm } }
}
export function ampAp(id: string, name: string, x: number, y: number, amp: Partial<AmpApCfg> = {}, features?: Record<string, boolean>): NodeCfg {
  const n = node(id, name, 'ap', x, y, 'eht', 'idle', features ?? { edca: true, txop: true, ampdu: true })
  return { ...n, ampAp: { ...DEFAULT_AMP_AP, ...amp } }
}
```
- [ ] **Step 4: Run** — `npx vitest run tests/course/lessons.test.ts tests/course/lesson-claims.test.ts` → PASS (no AMP lesson yet; `COURSE_ORDER` ids without a lesson are skipped).
- [ ] **Step 5: Commit** — `git commit -am "feat(course): ambient-power module slot and AMP lesson-kit helpers"`

---

