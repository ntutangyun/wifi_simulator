### Task 8: Course track seam, lesson kit, lesson 1 "Timestamps, not throughput"

**Files:**
- Modify: `src/course/curriculum.ts`, `src/course/CoursePanel.tsx`, `src/course/lessonKit.ts`, `src/course/lessons.ts`, `src/ui/i18n.ts` (course strings if any), `tests/fixtures/lesson-hashes.json` (regenerated, additions only)
- Create: `src/course/uwb/uwb-intro.ts`
- Test: `tests/course/uwb-intro.test.ts`

**Interfaces:**

```ts
// curriculum.ts
export type Track = 'wifi' | 'uwb'
export interface Tier extends L10n { track: Track }
export const TRACKS: Record<Track, L10n> = { wifi: { en: 'Wi-Fi', zh: 'Wi-Fi' }, uwb: { en: 'UWB ranging', zh: 'UWB 测距' } }
export const TIERS: Tier[]   // existing four with track 'wifi'; plus { track: 'uwb', en: 'UWB Tier 1 · Ranging foundations', zh: 'UWB 第一阶段 · 测距基础' }
// MODULES: append { tier: 4, title: { en: 'Time of flight', zh: '飞行时间' } } (index 11) and { tier: 4, title: { en: 'Ranging sessions and positioning', zh: '测距会话与定位' } } (index 12)
// COURSE_ORDER: append // UWB Tier 1 — M11 time of flight
//   'uwb-intro', 'uwb-sstwr', 'uwb-dstwr',
//   // UWB Tier 1 — M12 sessions and positioning
//   'uwb-blocks', 'uwb-position',
// CoursePanel: before a tier whose track differs from the previous rendered tier's, print a track heading (t(TRACKS[track])) in the tier-heading style, slightly larger.

// lessonKit.ts additions
export function anchor(id: string, name: string, x: number, y: number, z = 2.2, ppm?: number): NodeCfg   // kind 'uwb', txPowerDbm −14, profiles ['idle'], caps { generation: 'nonht', features: {} }, uwb: { role: 'anchor', ppm }
export function uwbTag(id: string, name: string, x: number, y: number, z = 1.0, ppm?: number): NodeCfg
export function uwbSc(house: { rooms: Room[]; walls: Wall[] }, nodes: NodeCfg[], session: Partial<UwbSessionCfg> = {}, extra: Partial<Scenario> = {}): Scenario   // like sc(), plus uwb: { ...DEFAULT_UWB_SESSION, ...session }
export const firstUwbPoll = txOf((r) => r.frame.kind === 'uwbPoll')
export const firstUwbResp = txOf((r) => r.frame.kind === 'uwbResp')
export const firstUwbFinal = txOf((r) => r.frame.kind === 'uwbFinal')
export const firstUwbReport = txOf((r) => r.frame.kind === 'uwbReport')
export const firstUwbRange = (r: TLRecord): boolean => r.type === 'UWB_RANGE'
export const firstUwbPosition = (r: TLRecord): boolean => r.type === 'UWB_POSITION'
export const firstUwbTimeout = (r: TLRecord): boolean => r.type === 'UWB_TIMEOUT'
export const firstUwbRxTs = (r: TLRecord): boolean => r.type === 'UWB_TS' && r.dir === 'rx'
```

Lesson 1 (`src/course/uwb/uwb-intro.ts`, `export const uwbIntro: Lesson`, `id: 'uwb-intro'`, `module: 11`):

- Scenario `uwbIntroScenario(dM: 5 | 20)`: `oneRoom()`; `anchor('anchor-1', 'Anchor 1', 1, 4, 2.2, 0)` and `uwbTag('tag-1', 'Phone', 1 + dM, 4, 2.2, 0)` (same z so the distance is exactly dM), `{ method: 'ss', nlos: false }`. Variant `{ en: '20 m apart', zh: '相距 20 m' }`.
- Body (EN + ZH, ~1 300–1 600 English words so `lessonMinutes` lands in 15–25 with 4 observe + 2 tryThis): (1) source sentence: IEEE Std 802.15.4-2024 Clause 16 / §10.29 / §10.32; which numbers are FiRa (2 ms slot, 200 ms block) and which are model (−14 dBm, −93 dBm, 100 ps noise, 0.2 ppm offset noise, NLOS delays); (2) "A radio that measures time": the 499.2 MHz chip, the 15.65 ps counter unit, one metre = 3.34 ns = 213 counter units, 40-bit counter wrapping every 17.2 s; (3) the SP1 frame anatomy as a `table` block (SYNC 65.13 µs, SFD 8.14, STS 67.69 with its two 1.03 µs gaps, PHR 19.49, PSDU for the 30-octet poll 35.13 → 197.63 µs) and the RMARKER at 73.27 µs; (4) "The delay Wi-Fi never showed you": RX_START 17 ns after TX_START at 5 m, why the Wi-Fi engine schedules arrival at the same instant, why UWB cannot; (5) `formula` block: SS-TWR `T̂prop = (Tround − Treply) / 2`, with the lab's Treply = 2 ms − Tprop and the counters the learner can read in the log; (6) the four `UWB_TS` lines and how to subtract them; (7) a note that the two crystals are set to 0 ppm here, and lesson 2 removes that mercy.
- `jumps`: poll TX (`firstUwbPoll`), the anchor's RX RMARKER (`firstUwbRxTs`), the response TX (`firstUwbResp`), the range (`firstUwbRange`).
- `observe` (4): the 17 ns gap between TX_START and RX_START; the four RMARKER lines; the range line within a few cm of 5.00 m; the round's two slots on the phone lane.
- `tryThis` (2): switch to the 20 m variant and read 67 ns and the same-size error; compute the range by hand from the four counters and compare with the log.
- `quiz` (3): one on the counter unit, one on the RMARKER position, one on why the arrival delay is 17 ns and not 16.68.

- [ ] **Step 1: Write the failing test** `tests/course/uwb-intro.test.ts`, in the style of `tests/course/amp-intro.test.ts` (memoised runs of the base and variant scenarios for 30 ms; every assertion quotes the sentence it guards). Pin:
  - lesson shape: schema-valid scenario and variant, `lessonMinutes` in [15, 25], every jump found, module 11, exactly one anchor and one tag, both 0 ppm.
  - constants quoted: chip 2.003 ns, RCTU 15.650 ps, 1 m = 3.3356 ns = 213.1 RCTU, wrap 17.2 s (from `phy.ts`).
  - the PPDU table: field durations from `chipsToNs` of the chip constants; the poll is 30 octets and 197 628 ns; RMARKER 73 269 ns.
  - the base run: `RX_START.t − TX_START.t === 17` for the poll and the response; variant 67.
  - `UWB_ROUND` at 0 with 2 slots of 2 000 000 ns; the response TX_START at exactly 2 000 000.
  - the four `UWB_TS` records in order tag-tx, anchor-rx, anchor-tx, tag-rx; recomputing `(Tround − Treply) / 2` from their counters equals `UWB_RANGE.tofRawRctu`. The corrected and raw values differ slightly even at 0 ppm (the 0.2 ppm offset-estimate noise), so assert `|rctuToMetres(tofRctu) − 5| < 3·rangeSigmaM(100)` and `|rctuToMetres(tofRawRctu) − 5| < 3·rangeSigmaM(100)` rather than equality.
  - the ZH strings exist for every block (each `L10n` has non-empty `zh` ≠ `en` except `N()` cells).
- [ ] **Step 2: Run** — failure. **Step 3: Implement** the seam, kit, lesson; register in `lessons.ts`; regenerate hashes (`UPDATE_HASHES=1 …`) and check the fixture diff is additions only. **Step 4:** `npx vitest run` green (including `tests/course/lessons.test.ts`, `lesson-claims`, `quoted-timestamps`); `npx tsc -b`; `npx vite build`.
- [ ] **Step 5: Commit** `feat(course): UWB track, lesson kit builders and lesson "Timestamps, not throughput"`.

---

