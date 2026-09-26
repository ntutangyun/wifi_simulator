# MMS 草案功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 4ab 草案里五样没建模的东西建进引擎,并配三门课。

**Architecture:** `MmsPhy` 加五个默认值复现今天行为的字段;`mmsLayout` 长出非交织分支;
`device.mms.ts` 新增一步捕获判定(UWB 驱动下才生效);编辑器、指南、词汇表、课程随之补齐。

**Tech Stack:** TypeScript、Zod schema、Vitest、React(无框架 UI)。

**Spec:** `docs/superpowers/specs/2026-09-26-mms-draft-features-design.md`

## Global Constraints

- **绝不把标准/草案原文写进仓库。** 只取字段名、数值与规则,一律改写。
- **每个常量都要带出处标记**:`standard §x`、`4ab draft 15-YY/NNNNrR`、`FiRa`、
  `regulation`、`model` 之一。
- **既有场景逐字节不变。** `tests/fixtures/lesson-hashes.json` 与
  `tests/fixtures/uwb-record-hashes.json` 在新功能全部默认关闭时必须零 diff。
  只允许新增行,不允许改既有行。
- **新字段的默认值必须复现今天的行为**:`control: 'nba'`、`nonInterleaved: false`、
  `fixedReplyRstu: null`、`reversedOrder: false`、`rsfSfd: false`、`uwbdControl: 'sp0'`
  (最后一个在 `control: 'nba'` 下不生效,所以默认值取什么都不影响既有行为)。
- **测试重心是逻辑,不是文案。** 不为显示文本新增测试。
- **课程为中文**,官方术语首次出现时在括号里带标准英文名与常用缩写。
- 提交信息以下列两行结尾:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`

---

### Task 1: `MmsPhy` 的六个字段与 schema 校验

**Files:**
- Modify: `src/uwb/mms.ts`(`MmsPhy` 接口、`MMS_SETS` 的补全、`mmsSet`)
- Modify: `src/model/scenario.ts`(zod schema 与跨字段 superRefine)
- Test: `tests/model/uwb-scenario.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `MmsPhy.control: 'nba' | 'uwbd'`、`MmsPhy.nonInterleaved: boolean`、
  `MmsPhy.fixedReplyRstu: number | null`、`MmsPhy.reversedOrder: boolean`、
  `MmsPhy.rsfSfd: boolean`、`MmsPhy.uwbdControl: 'sp0' | 'none'`;
  常量 `MMS_FIXED_REPLY_RSTU_MIN = 300`、
  `MMS_FIXED_REPLY_RSTU_MAX = 612_000`、`MMS_FIXED_REPLY_RSTU_DEFAULT = 600`、
  `MMS_REVERSED_OFFSET_RSTU = 600`。

- [ ] **Step 1: 先写失败的 schema 测试**

在 `tests/model/uwb-scenario.test.ts` 加一个 describe。先 `grep -n "mms" src/model/scenario.ts`
找到 MMS 那个 zod object 的名字;若它尚未导出,本步顺带导出,并在该文件注释里写明
原因(测试要单独解析它)。下面用 `UwbMmsSchema` 指代它。

```ts
describe('the MMS draft-feature fields', () => {
  const base = { rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1 as const }
  // uwbdControl defaults to 'sp0'; under control: 'nba' it is ignored, and the schema
  // refuses 'none' there rather than silently carrying a setting that does nothing.
  const mms = (over: Record<string, unknown>) => ({ ...base, ...over })

  it('defaults reproduce todays session', () => {
    const p = UwbMmsSchema.parse(base)
    expect(p.control).toBe('nba')
    expect(p.nonInterleaved).toBe(false)
    expect(p.fixedReplyRstu).toBeNull()
    expect(p.reversedOrder).toBe(false)
    expect(p.rsfSfd).toBe(false)
    expect(p.uwbdControl).toBe('sp0')
  })

  it('refuses a UWB-driven control choice under narrowband-assisted control', () => {
    expect(UwbMmsSchema.safeParse(mms({ uwbdControl: 'none' })).success).toBe(false)
  })

  it('accepts a zero-length control phase under UWB-driven control', () => {
    expect(UwbMmsSchema.safeParse(mms({ control: 'uwbd', uwbdControl: 'none' })).success).toBe(true)
  })

  it('refuses rsfSfd outside UWB-driven control', () => {
    expect(UwbMmsSchema.safeParse(mms({ rsfSfd: true })).success).toBe(false)
  })

  it('refuses rsfSfd at an RSF length the draft does not allow', () => {
    expect(UwbMmsSchema.safeParse(mms({ control: 'uwbd', rsfSfd: true, nMsr: 128 })).success).toBe(false)
  })

  it('accepts rsfSfd at 32 and 64 under UWB-driven control', () => {
    for (const nMsr of [32, 64]) {
      expect(UwbMmsSchema.safeParse(mms({ control: 'uwbd', rsfSfd: true, nMsr })).success).toBe(true)
    }
  })

  it('refuses a fixed reply time in interleaved mode', () => {
    expect(UwbMmsSchema.safeParse(mms({ fixedReplyRstu: 600 })).success).toBe(false)
  })

  it('refuses a fixed reply time outside 300-612000 RSTU', () => {
    for (const v of [299, 612_001]) {
      expect(UwbMmsSchema.safeParse(mms({ nonInterleaved: true, fixedReplyRstu: v })).success).toBe(false)
    }
  })

  it('accepts a fixed reply time at both ends of the drafts range', () => {
    for (const v of [300, 612_000]) {
      expect(UwbMmsSchema.safeParse(mms({ nonInterleaved: true, fixedReplyRstu: v })).success).toBe(true)
    }
  })

  it('refuses reversed order in interleaved mode', () => {
    expect(UwbMmsSchema.safeParse(mms({ reversedOrder: true })).success).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试,确认它失败**

`npx vitest run tests/model/uwb-scenario.test.ts`
预期:`control` 等属性不存在,断言失败。

- [ ] **Step 3: 加字段与校验**

`src/uwb/mms.ts` 的 `MmsPhy` 增五个字段,每个带一行 `4ab draft …` 标记与一句语义:

```ts
  /** Config 2 (narrowband-assisted) or Config 1 (UWB-driven), which carries its control
   * phase on the HRP UWB PHY itself. 4ab draft 15-25/0194r0 */
  control: 'nba' | 'uwbd'
  /** Each side sends its whole train contiguously, in its own sub-round, rather than
   * interleaving a fragment per millisecond. 4ab draft 15-25/0292r1 (§10.39.7) */
  nonInterleaved: boolean
  /** macMmsFixedReplyTime in RSTU: the responder replies this long after it RECEIVES the
   * first fragment, not at the phase start. null is the draft's default (disabled).
   * 4ab draft 15-25/0224r2 */
  fixedReplyRstu: number | null
  /** The responder transmits its MMS packet first. 4ab draft 15-25/0556r2 */
  reversedOrder: boolean
  /** phyUwbMmsRsfSfd: an SFD after every RSF, so any RSF can open the packet.
   * 4ab draft 15-25/0066r1 */
  rsfSfd: boolean
  /** UWB-driven only: whether the control phase carries an SP0 (BASIC_PACKET) frame.
   * The draft makes the control phase zero-length when the poll and response slot
   * counts are zero, and puts SP0 in use when they are 1-15; this is that choice.
   * Ignored under `control: 'nba'`. 4ab draft 15-25/0194r0 */
  uwbdControl: 'sp0' | 'none'
```

常量四个,同样带标记。`src/model/scenario.ts` 的 schema 增对应字段(全部
`.default(...)`),并在既有的 `superRefine` 里加四条规则,每条 `message` 说明草案
为什么这样限制:

```ts
if (mms.rsfSfd && mms.control !== 'uwbd') {
  ctx.addIssue({ code: 'custom', path: ['mms', 'rsfSfd'],
    message: 'RSF 带 SFD 只在 UWB 驱动配置下有意义：窄带辅助模式里没有包首 SYNC+SFD 可丢' })
}
if (mms.rsfSfd && mms.nMsr !== 32 && mms.nMsr !== 64) {
  ctx.addIssue({ code: 'custom', path: ['mms', 'rsfSfd'],
    message: '草案只在 RSF 片段长度为 32 或 64 时允许 RSF 带 SFD（15-25/0066r1）' })
}
```

`fixedReplyRstu`(要非交织、且落在 300–612000)与 `reversedOrder`(要非交织)
各一条同样形状的规则。

- [ ] **Step 4: 跑测试,确认全过**

`npx vitest run tests/model/uwb-scenario.test.ts`

- [ ] **Step 5: 确认 fixture 零 diff**

```bash
npx vitest run tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts
git diff --stat tests/fixtures/
```

预期:全过且 diff 为空。任何一行变化都说明默认值没复现今天的行为,必须回头修,
**不得重生成 fixture**。

- [ ] **Step 6: 提交**

```bash
git add src/uwb/mms.ts src/model/scenario.ts tests/model/uwb-scenario.test.ts
git commit -F <message-file>
```

---

### Task 2: `mmsLayout` 的非交织分支

**Files:**
- Modify: `src/uwb/mms.ts`(`MmsLayout`、`mmsLayout`)
- Test: `tests/uwb/mms-layout.test.ts`(先 `ls tests/uwb/` 看是否已有布局测试文件;
  有就加进去,没有就新建)

**Interfaces:**
- Consumes: Task 1 的 `MmsPhy.nonInterleaved`、`MmsPhy.reversedOrder`。
- Produces: `MmsLayout.subRounds: number`(交织恒为 1);
  `MmsLayout.subRoundStart(i: number): number`(第 i 个子轮的起始时隙);
  既有的 `fragmentSlot` / `slotFragment` / `respSlot` 签名不变,在非交织下改走新算术。

- [ ] **Step 1: 先写失败的布局测试**

```ts
import { mmsLayout } from '../../src/uwb/mms'

const phy = (over = {}) => ({
  rsfs: 8, rifs: 0, nMsr: 40, gap: 64, stsLen: 64, gapMs: 1 as const,
  control: 'nba' as const, nonInterleaved: false, fixedReplyRstu: null,
  reversedOrder: false, rsfSfd: false, ...over,
})

it('interleaved is unchanged: one sub-round, R+1 slots to a millisecond', () => {
  const l = mmsLayout(phy(), 3)
  expect(l.subRounds).toBe(1)
  expect(l.fragmentSlot('responder', 'rsf', 0, 1)).toBe(l.controlSlots + 2)
})

it('non-interleaved gives each side its own sub-round', () => {
  const l = mmsLayout(phy({ nonInterleaved: true }), 1)
  expect(l.subRounds).toBe(2)
  // a sub-round is one narrowband window (2 slots) plus the ranging phase
  expect(l.subRoundStart(1)).toBe(2 + l.rpSlots)
})

it('non-interleaved one-to-many is one sub-round per device', () => {
  expect(mmsLayout(phy({ nonInterleaved: true }), 3).subRounds).toBe(4)
})

it('non-interleaved does not multiply the ranging phase by the device count', () => {
  const one = mmsLayout(phy({ nonInterleaved: true }), 1)
  const three = mmsLayout(phy({ nonInterleaved: true }), 3)
  expect(three.rpSlots).toBe(one.rpSlots)
})

it('non-interleaved costs more slots in total than interleaved', () => {
  // the price the drafts own commenters named: longer ranging
  const inter = mmsLayout(phy(), 3)
  const non = mmsLayout(phy({ nonInterleaved: true }), 3)
  expect(non.slots).toBeGreaterThan(inter.slots)
})

it('reversed order puts the responders sub-round first', () => {
  const l = mmsLayout(phy({ nonInterleaved: true, reversedOrder: true }), 1)
  expect(l.fragmentSlot('responder', 'rsf', 0)).toBeLessThan(l.fragmentSlot('initiator', 'rsf', 0))
})

it('slotFragment inverts fragmentSlot in both shapes', () => {
  for (const ni of [false, true]) {
    const l = mmsLayout(phy({ nonInterleaved: ni }), 2)
    for (let i = 0; i < 8; i++) {
      const slot = l.fragmentSlot('initiator', 'rsf', i)
      expect(l.slotFragment(slot)).toMatchObject({ side: 'initiator', kind: 'rsf', index: i })
    }
  }
})
```

- [ ] **Step 2: 跑测试,确认它失败**

`npx vitest run tests/uwb/mms-layout.test.ts`
预期:`subRounds` 不存在。

- [ ] **Step 3: 实现非交织分支**

在 `mmsLayout` 里按 `phy.nonInterleaved` 分两条路。**交织那条一行都不改**,
原样留在 `if (!phy.nonInterleaved)` 里,这样既有 fixture 不可能被波及。
非交织那条:

```ts
// §10.39.7: each sub-round is its own control window plus its own ranging phase, and
// only one device transmits in it. One sub-round per device, so a one-to-many round
// costs (R + 1) of them — the "longer duration" the draft's own commenters named as
// this mode's price. 4ab draft 15-25/0292r1, 15-25/0331r1
const rpOne = Math.max(MMS_RP_MIN_SLOTS, y > 0 ? rifStartMs(x, z, y - 1) + 1 : x)
const subRounds = 1 + responders
const subRound = NB_WINDOW_SLOTS + rpOne
```

`fragmentSlot(side, kind, index, responder)` 在非交织下 =
`subRoundStart(devIndex) + NB_WINDOW_SLOTS + msOf(kind, index)`,其中 `devIndex`
在 `reversedOrder` 为假时发起方为 0、应答方 r 为 `1 + r`,为真时发起方排在所有
应答方之后。`slotFragment` 是它的逆,照既有那条的写法反解。

- [ ] **Step 4: 跑测试,确认全过**

- [ ] **Step 5: 全量测试 + fixture 零 diff**

`npx vitest run` 必须全过,且 `git diff --stat tests/fixtures/` 为空。

- [ ] **Step 6: 提交**

---

### Task 3: 让排程与片段间隔跟上布局

Task 2 交付后发现的计划缺陷。两个问题,同一个根因:布局长出了第二种形态,
而读布局的那两处还按第一种形态读。

**问题一 —— 片段间隔被压到半毫秒,打穿了 MMS 的前提。**
`session.ts:105` 算 `fragGapNs = (responders + 1) * slotNs`。成对轮次 R=1、
600 RSTU 时隙(0.5 ms)下是 2 × 0.5 = 1 ms,正确。但非交织下一个子轮里只有一方在发,
Task 2 把片段排成相隔**一个时隙**,即 0.5 ms。

这不是排得紧一点的问题:「每个片段可以花掉整整一毫秒的法规能量额度」这个前提,
成立的根据正是它占掉一毫秒的空口时间。0.5 ms 间隔等于让设备辐射两倍的允许平均功率。
而且 `fragGapNs` 那行是独立算的,它会报 2 ms,布局却排 0.5 ms——两个互相矛盾的真相来源,
接收机拿哪一个去反推时钟比率都会错。

**订正,而且它比原计划更好看**:非交织下片段间隔仍是**一毫秒**。一个毫秒占
`slotsPerMs` 个时隙(草案默认 600 RSTU 时隙下是 2),与应答方数目无关。
于是非交织有一个交织没有的真实好处:**不论多少个锚点,片段间隔都稳定在 1 ms**;
而交织的一对多会把它拉长到 2 ms(三个应答方时)。这一条正好是 Task 8 第三课要展示的东西。

**问题二 —— 排程还按交织读。**
`mmsSlotAction`(`src/uwb/session.ts`)把 `slot < controlSlots` 当控制阶段、
把时隙 0 写死成 POLL。Task 2 之后 `controlSlots` 在非交织下是一个**总数而不是前缀**,
所以这两条都不再成立。而 `UwbMmsSchema` 已经接受 `nonInterleaved: true`,
也就是说现在就能造出一个「schema 放行、排程却算错」的场景。这个口子必须在
Task 9 把控件暴露给用户之前堵上。

**Files:**
- Modify: `src/uwb/mms.ts`(`mmsLayout` 的非交织分支改用 `slotsPerMs`;
  新增可选参数与 `MmsLayout.slotsPerMs`)
- Modify: `src/uwb/session.ts`(`fragGapNs` 与 `mmsSlotAction`)
- Test: `tests/uwb/mms-layout.test.ts`(既有,补间隔断言)、
  `tests/uwb/mms-schedule.test.ts`(新建,排程)

**Interfaces:**
- Consumes: Task 2 的 `subRounds`、`subRoundStart`、`respSlot`。
- Produces: `mmsLayout(phy, responders, slotsPerMs?)`,第三个参数默认 **2**
  (草案默认 600 RSTU 时隙下的一毫秒);`MmsLayout.slotsPerMs`;
  `MmsLayout.pollSlot(subRound: number): number`。

- [ ] **Step 1: 先写失败的测试**

间隔(加进 `tests/uwb/mms-layout.test.ts`):

```ts
it('non-interleaved keeps fragments one millisecond apart, not one slot', () => {
  const l = mmsLayout(phy({ nonInterleaved: true }), 1)
  const a = l.fragmentSlot('initiator', 'rsf', 0)
  const b = l.fragmentSlot('initiator', 'rsf', 1)
  expect(b - a).toBe(l.slotsPerMs)
})

it('non-interleaved holds the gap steady however many responders there are', () => {
  // the advantage interleaved does not have: one-to-many interleaved stretches
  // the gap to (R + 1) slots, and this does not
  for (const r of [1, 2, 3]) {
    const l = mmsLayout(phy({ nonInterleaved: true }), r)
    const g = l.fragmentSlot('initiator', 'rsf', 1) - l.fragmentSlot('initiator', 'rsf', 0)
    expect(g).toBe(l.slotsPerMs)
  }
})

it('a shorter slot needs more slots to make the same millisecond', () => {
  const l = mmsLayout(phy({ nonInterleaved: true }), 1, 4)
  expect(l.fragmentSlot('initiator', 'rsf', 1) - l.fragmentSlot('initiator', 'rsf', 0)).toBe(4)
})

it('interleaved still spaces by the device count', () => {
  const l = mmsLayout(phy(), 3)
  expect(l.fragmentSlot('initiator', 'rsf', 1) - l.fragmentSlot('initiator', 'rsf', 0)).toBe(4)
})
```

排程(新建 `tests/uwb/mms-schedule.test.ts`):照 `session.ts` 现有的
`mmsSlotAction` 签名写。至少三条:(a) 非交织下每个子轮的头一个时隙是那个子轮
自己的 POLL/RESP,不是整轮的时隙 0;(b) 非交织下 `controlSlots` 不再是前缀,
所以「`slot < controlSlots` 即控制阶段」这条判断给出错误答案的那个具体时隙,
现在得到正确答案;(c) 交织下每一个时隙的答案与改动前逐个相同——
这一条用一个循环覆盖整轮的全部时隙。

- [ ] **Step 2: 跑测试,确认它们失败**

- [ ] **Step 3: 实现**

`mmsLayout` 第三个参数 `slotsPerMs = 2`,带注释说明:

```ts
// A millisecond is a millisecond whoever is transmitting. In the interleaved round the
// device count happens to set the spacing — (R + 1) slots — and at the draft's 600 RSTU
// slot the pairwise case lands on exactly 1 ms. A non-interleaved sub-round has one
// transmitter, so the spacing has to come from the slot length instead, or a fragment
// would go out every half millisecond and spend a millisecond's energy budget doing it.
// 4ab draft 15-23/0100r2 §2.3.2 for the millisecond; model for taking it from the slot.
```

`session.ts` 里 `slotsPerMs` 由 `Math.ceil(MS_RSTU / cfg.slotRstu)` 算出并传进去
(`MS_RSTU` 已在 `mms.ts`,值 1200),`fragGapNs` 改成读布局:
`layout.slotsPerMs * slotNs`(非交织)或 `(responders + 1) * slotNs`(交织)——
更好的做法是让布局自己给出这个数,两处就不会再各算各的。**实现者自行判断哪种更干净,
但结论必须是只有一个地方决定间隔。**

`mmsSlotAction` 改用 `subRoundStart` / `pollSlot` / `respSlot`,不再假设
控制阶段是整轮的前缀。

- [ ] **Step 4: 跑测试,确认全过**
- [ ] **Step 5: 全量测试 + fixture 零 diff**

交织路径一个数都不许变,所以 `git diff --stat tests/fixtures/` 必须为空。

- [ ] **Step 6: 提交**

---

### Task 4: 捕获

**Files:**
- Modify: `src/uwb/mms.ts`(`acquired()` 与门限常量)
- Modify: `src/uwb/device.mms.ts`(在累加之前插入捕获判定)
- Test: `tests/uwb/mms-acquisition.test.ts`(新建)

**Interfaces:**
- Consumes: Task 1 的 `MmsPhy.control`、`MmsPhy.rsfSfd`。
- Produces: `MMS_SP0_PENALTY_DB = 4`;
  `acquired(phy: MmsPhy, fragments: { rssiDbm: number }[]): boolean` —— 是否用 SP0 由
  `phy.uwbdControl` 自己说了算(Task 1 的字段),不再另传参数。

- [ ] **Step 1: 先写失败的捕获测试**

```ts
import { acquired, MMS_SP0_PENALTY_DB } from '../../src/uwb/mms'
import { UWB_RX_SENS_DBM } from '../../src/uwb/units'

const f = (...dbm: number[]) => dbm.map((rssiDbm) => ({ rssiDbm }))
// 'none' means no SP0 frame, so acquisition rides the packet's own SYNC+SFD fragment
const uwbd = (over = {}) => phy({ control: 'uwbd', uwbdControl: 'none', ...over })

it('narrowband-assisted needs no acquisition at all', () => {
  // the narrowband exchange already handed the receiver its time base
  expect(acquired(phy({ control: 'nba' }), f(-120))).toBe(true)
})

it('UWB-driven acquires on the leading fragment alone, with no combining', () => {
  expect(acquired(uwbd(), f(UWB_RX_SENS_DBM))).toBe(true)
  expect(acquired(uwbd(), f(UWB_RX_SENS_DBM - 0.1))).toBe(false)
})

it('four quiet fragments do not add up to an acquisition', () => {
  // the whole distinction: ranging combines, acquisition does not
  expect(acquired(uwbd(), f(-99, -99, -99, -99))).toBe(false)
})

it('SP0 costs 4 dB against the packets own SYNC+SFD', () => {
  const justUnder = UWB_RX_SENS_DBM + MMS_SP0_PENALTY_DB - 0.1
  const sp0 = phy({ control: 'uwbd', uwbdControl: 'sp0' })
  expect(acquired(sp0, f(justUnder))).toBe(false)
  expect(acquired(sp0, f(justUnder + 0.2))).toBe(true)
  // the same level acquires fine without SP0 in the way
  expect(acquired(uwbd(), f(justUnder))).toBe(true)
})

it('RSF with SFD lets a later fragment open the packet', () => {
  const lost = [{ rssiDbm: -120 }, { rssiDbm: UWB_RX_SENS_DBM }]
  expect(acquired(uwbd({ rsfSfd: false }), lost)).toBe(false)
  expect(acquired(uwbd({ rsfSfd: true, nMsr: 64 }), lost)).toBe(true)
})
```

- [ ] **Step 2: 跑测试,确认它失败**

- [ ] **Step 3: 实现 `acquired` 并接进设备**

```ts
/** How much worse an SP0 control frame is at acquisition than the packet's own SYNC+SFD
 * fragment: SP0 is longer and sent at a lower peak power, so it is what defines the link
 * budget, and a worse one. The draft's own comparison gives 6.3, 5.3 or 3.8 dB depending
 * on code length and PSR, and its conclusion sentence is "~4 dB". The engine takes the one
 * figure; the three are in the lesson. 4ab draft 15-25/0194r0 (model) */
export const MMS_SP0_PENALTY_DB = 4
```

`acquired` 的规则:`control === 'nba'` 直接 true(窄带交互已把时基交给接收机);
否则取候选片段 —— `rsfSfd` 为真时是全部片段,为假时只有第一个 —— 任一片段的
`rssiDbm` 不低于 `UWB_RX_SENS_DBM + (phy.uwbdControl === 'sp0' ? MMS_SP0_PENALTY_DB : 0)`
即为捕获。
**不累加**,这是它与 `trainDetected` 的分野,注释里写明这一句。

`device.mms.ts` 里,在调用 `trainDetected` 之前先问 `acquired`;没捕获就当整列没检出,
该轮不产生测距结果。

- [ ] **Step 4: 跑测试,确认全过**

- [ ] **Step 5: 全量测试 + fixture 零 diff**

`control` 默认 `'nba'`,`acquired` 恒为 true,既有行为不变;diff 必须为空。

- [ ] **Step 6: 提交**

---

### Task 5: UWB 驱动配置真的换掉窄带控制面

Task 4 交付后发现的计划缺陷。`phy.control` 在整个 `src/` 里只被读过一处——
捕获那道门(`mms.ts:186`)。窄带的 POLL/RESP 与 priming 在 `control: 'uwbd'` 下
照跑,所以现在的 Config 1 是个半成品:它自己要捕获,却又同时享受着窄带给的预热。
课程若按这个状态去讲,教的是一台不存在的设备。

**草案给的两种形态**(15-25/0194r0 slide 12–13、17):

| 配置 | 控制阶段 | 报告阶段 | 捕获靠什么 |
| --- | --- | --- | --- |
| NBA-MMS(今天) | 窄带 POLL/RESP | 窄带 REPORT | 不需要,窄带已预热 |
| UWBD + `sp0` | UWB PHY 上的 SP0 包 | UWB PHY 上的 SP0 包 | SP0(比 SYNC+SFD 差 4 dB) |
| UWBD + `none` | **没有** | **没有** | 包首的 SYNC+SFD 片段 |

`none` 那一行不是简化,是草案自己的话:两个 NSlots 置零时 SP0 帧被跳过,
SOR 的时间偏移直接指向测距包的 SYNC+SFD,而那个片段本来就能用来估计载波频偏与定时,
于是它**就是** poll 与 response。

**Files:**
- Modify: `src/uwb/device.mms.ts`(priming 的来源、控制阶段发什么)
- Modify: `src/uwb/device.report.ts`(报告走哪条路,或者不走)
- Modify: `src/uwb/frames.ts`(UWB PHY 上的 SP0 控制帧;沿用既有 `FrameDesc` 形状)
- Modify: `src/uwb/mms.ts`(SP0 帧的时长)
- Modify: `src/model/scenario.ts`(补上一条 Task 1 漏掉的校验,见 Step 1)
- Modify: `src/uwb/session.ts`(控制/报告阶段的时隙数随配置变化)
- Test: `tests/uwb/mms-uwbd.test.ts`(新建)

**Interfaces:**
- Consumes: Task 1 的 `control` / `uwbdControl`、Task 4 的 `acquired`。
- Produces: `MMS_SP0_NS`(SP0 帧时长)、`mmsControlSlots(phy)` /
  `mmsReportSlots(phy, responders)` —— 由配置决定的阶段长度,取代
  `mmsLayout` 里写死的 `NB_WINDOW_SLOTS * (1 + responders)`。

- [ ] **Step 1: 先写失败的测试**

```ts
it('UWB-driven sends no narrowband poll or response', () => { /* 一轮里窄带帧数为 0 */ })
it('UWB-driven with SP0 still has a control phase, on the UWB PHY', () => { /* 控制时隙 > 0，帧是 SP0 */ })
it('UWB-driven without SP0 has no control phase and no report phase', () => {
  const l = mmsLayout(phy({ control: 'uwbd', uwbdControl: 'none' }), 1)
  expect(l.controlSlots).toBe(0)
  expect(l.reportSlots).toBe(0)
})
it('a UWB-driven device is primed by acquiring the packet, not by a narrowband exchange', () => { /* ... */ })
it('narrowband-assisted is unchanged in every one of the above', () => { /* ... */ })
```

再补上 Task 1 漏掉的那条 schema 校验(规格 §3 规则 4 列了,Task 1 只落了六条里的
其余几条):`control === 'uwbd'` 时不接受窄带信道列表与先听后发的设置,
理由是那一侧根本没有电台。消息按既有中文风格写,说清为什么。

- [ ] **Step 2: 跑测试,确认它们失败**

- [ ] **Step 3: 实现**

SP0 帧的时长取自 15-25/0194r0 slide 9 的表:短包(PSR64)**117.6 µs**、
长包(PSR128)**170.1 µs**。选哪一个由 `nMsr` 决定还是固定取短包,由实现者判断并
在注释里说明——但**必须标 `4ab draft 15-25/0194r0`,并写明它是那张表里的哪一格**。

priming:NBA 保持今天的行为(窄带交互之后两端 primed)。UWBD 下,
priming 就是 `acquired` 的结果——设备捕获到这个包,才谈得上后面的累加。
把这条写进注释,它正是第二门课要讲的因果。

- [ ] **Step 4: 跑测试,确认全过**
- [ ] **Step 5: 全量测试 + fixture 零 diff**

`control` 默认 `'nba'`,所以既有场景一个数都不许变。

- [ ] **Step 6: 提交**

---

### Task 6: 固定回复时间(并先修 Task 5 留下的三处)

**Step 0 先做:三处更正,都是控制器复审 Task 5 时裁定的。**

**0a — 报告阶段与控制阶段解耦。** Task 5 的简报让「没有控制阶段就没有报告阶段」,
那是我的推断,不是草案的句子,而且草案自己的两张图并不一致:15-25/0194r0 slide 13
(交织、不带 SP0)没有 Report;slide 17(非交织、不带 SP0)画着
`macMms1stReportNSlots` / **Report (optional)** / `macMms2ndReportNSlots`。
草案里报告阶段有自己的一对参数,与控制阶段的那对是分开的。

改成:`control: 'uwbd'` 下报告阶段**始终存在**,与 `uwbdControl` 无关。
在注释里记下 slide 13 那个形态(交织且不带 SP0 时草案没画报告),
并写明本引擎不为它开特例——要省掉报告,走的是本 Task 的固定回复时间。

这同时修掉 Task 5 报告的第一个问题:`uwbdControl: 'none'` 现在拿不到测距结果,
因为没有报告就没有回复时间,而单边双向测距需要它。

**0b — 4 dB 现在被算了两次。** `uwbdControl: 'sp0'` 时,SP0 帧本身要经过信道投递
判定一次,`acquired()` 又在首片段上再加 4 dB 判定一次。同向叠加,偏保守,但是错的:
一个门限只能有一个地方。

改成按路径分工,每条路径只判一次:

| 配置 | 由什么 primed | 门限 |
| --- | --- | --- |
| `nba` | 窄带交互 | 不判捕获 |
| `uwbd` + `sp0` | 收到那帧 SP0 | SP0 帧自己的接收判定,**4 dB 罚值挪到这里** |
| `uwbd` + `none` | 捕获到首个 SYNC+SFD/RSF 片段 | `UWB_RX_SENS_DBM`,**不加罚值** |

`MMS_SP0_PENALTY_DB` 因此从 `acquired()` 移走,只留在 SP0 帧的接收门限上;
`acquired()` 只再负责 `none` 那一行。两处的注释都要说明为什么罚值在那里而不在别处。

**0c — 一对多的 Config 1 是近似的,要写明。** SP0 的 POLL 按表只有 12 个八位组的
PSDU,点不了名多个应答方;把它撑大属于发明。在 `mmsLayout` 或 SP0 帧构造处留一条注释
说明这个组合是近似的、近似在哪里。**不要**因此禁掉这个组合。

做完 0a–0c 跑一次全量并确认 fixture 零 diff,再进入下面的固定回复时间。

---


**Files:**
- Modify: `src/uwb/device.mms.ts`(应答方子轮起点的运行期排程)
- Modify: `src/uwb/device.report.ts`(带固定回复时间时,应答方不再发送报告)
- Test: `tests/uwb/mms-fixed-reply.test.ts`(新建)

**Interfaces:**
- Consumes: Task 1 的 `fixedReplyRstu`、Task 2 的 `subRoundStart`。

**先读这一段,规格里有两处我写错了,以下为准(裁定 6)。**

1. **起点是收完发起方整个 MMS 包,不是收到第一个片段。** 15-25/0224r2 写的是
   「第一个片段」,但那是早期修订;较晚的 15-25/0556r2 与 15-25/0681r1 都写
   「from the reception of the HRP UWB PHY MMS packet from the initiator」,
   而且讨论里说得很清楚:准确的到达时间估计「在非交织模式下,要到 MMS 包末尾
   才可能」。以较晚的为准——这也正好解释了为什么这个功能要绑非交织。
2. **省下来的不是几个字节,是整条报告。** 这个提案在工作组里的名字就叫
   「MMS without report」(15-25/0224 的议程标题)。15-25/0376r2 说该选项省能量的
   方式是「avoiding the need to send the report」;15-25/0261r0 的图直接标着
   「No report / ToF available at Initiator side」。道理很直白:单边双向测距要
   Tround 与 Treply 两个时间,发起方自己测 Tround,而回复时间既然是事先约定的
   已知量,它两个都有了,应答方那条报告就没有存在的必要。

所以 `NB_REPORT_BYTES` 一个字节都不用改。要改的是**那条报告还发不发**。

- [ ] **Step 1: 先写失败的测试**

断言三件事。(a) 应答方那列片段的起点是「它收完发起方的 MMS 包 +
fixedReplyRstu × RSTU」,而不是子轮边界。(b) 应答方的窄带 REPORT **不再发出**,
因而该轮的窄带消息数下降,空口时间下降。(c) `fixedReplyRstu` 为 null 时两者都
回到今天的行为。

再加一条,它是这个功能的意义所在:(d) 关掉报告之后,测距结果**仍然出现在发起方
一侧**——因为它已经知道回复时间。若这一条过不了,说明省掉的不只是报告。

具体断言按 `device.mms.ts` 与 `device.report.ts` 现有的 API 写。数值先跑一次
确定性场景读出来,再写死进测试——不要在测试里重算一遍实现的算术。

精度的代价也要记进注释:草案说测距精度取决于对到达时间估计得多准、以及应答方对
自己发送时刻的控制有多细,**每 1 ns 的飞行时间误差约合 30 cm 测距误差**
(15-25/0556r2)。本引擎是否建模这项额外误差由实现者判断;若不建模,
在注释里写明它存在而未建模。

- [ ] **Step 2: 跑测试,确认它失败**

- [ ] **Step 3: 实现**

起点是运行期才知道的量(取决于传播时延),所以它**不进 `mmsLayout`**;由应答方在
收完发起方的 MMS 包时按 `rxEndTime + fixedReplyRstu × RSTU` 排程自己那列片段。
应答方的窄带 REPORT 在该模式下不发送,理由写在注释里并标
`4ab draft 15-25/0376r2`(避免发送报告)与 `15-25/0556r2`(条件与精度代价)。

- [ ] **Step 4: 跑测试,确认全过**
- [ ] **Step 5: 全量测试 + fixture 零 diff**
- [ ] **Step 6: 提交**

---

### Task 7: 非交织下的 priming

Task 6 交付后发现的缺陷,而且是个硬缺陷:**非交织只要带控制阶段就完全测不出距离**。
实测 Config 2 零次、Config 1 带 SP0 零次,只有 Config 1 零长控制阶段那一种能跑。
Task 2 与 Task 3 的测试查的是布局算术,查不到这个;要跑一整轮才看得见。

**根因**,两半都在 `src/uwb/device.mms.ts`:

- `opensRound()` 不让发起方在被 RESP 预热之前发送。可非交织把那条 RESP 排在了
  发起方整个测距阶段**之后**,所以它永远等不到。
- 应答方是在**自己发出** RESP 时才被标记 primed。可非交织里它必须先听完发起方的包
  才谈得上回应,于是它根本没在听。

**草案对此有直接的一句**(15-25/0292r1,15-25/0331r1 重述):非交织子轮里,
发起方**不等**应答方的 compact 帧就发 MMS 包——这一点与交织模式正相反;
应答方**收到发起方的 MMS 包之后**才发响应。

**因此非交织的 priming 规则**(交织一个字不改):

| 角色 | 何时 primed |
| --- | --- |
| 发起方 | 自己的控制窗口过去即可,不等任何人;控制阶段为零长时,进入测距阶段即可 |
| 应答方 | 听到发起方的 POLL;控制阶段为零长时,捕获到发起方的包(即 `acquired()`) |

零长那一行与 Task 4、Task 5 已经建的东西正好接上:那种配置下,包本身既是 poll
也是预热来源。

**Files:**
- Modify: `src/uwb/device.mms.ts`(`opensRound`、`controlPrimes`、priming 的设置点)
- Test: `tests/uwb/mms-nonint-ranging.test.ts`(新建)

**Interfaces:**
- Consumes: Task 5 的 `sp0Control`、Task 4 的 `acquired`、Task 2/3 的 `subRoundStart`。

- [ ] **Step 1: 先写失败的测试**

端到端,不是布局算术——这正是既有测试漏掉它的原因:

```ts
it('non-interleaved ranges in every configuration, not just the zero-length one', () => {
  for (const cfg of [
    { control: 'nba' },
    { control: 'uwbd', uwbdControl: 'sp0' },
    { control: 'uwbd', uwbdControl: 'none' },
  ]) {
    // 跑一个确定性场景，断言 UWB_RANGE 记录数 > 0
  }
})

it('the non-interleaved initiator does not wait for a response compact frame', () => {
  // 发起方的第一个片段早于应答方的 RESP
})

it('the non-interleaved responder listens before it answers', () => {
  // 应答方在发出 RESP 之前就已经收下了发起方的片段
})

it('interleaved priming is unchanged', () => {
  // 逐条覆盖交织的两种角色，断言与改动前一致
})
```

数值先跑一次读出来再写死,不要在测试里重算实现的算术。

- [ ] **Step 2: 跑测试,确认它们失败**(前三条应失败,第四条应通过)
- [ ] **Step 3: 实现**
- [ ] **Step 4: 跑测试,确认全过**
- [ ] **Step 5: 全量测试 + fixture 零 diff**
- [ ] **Step 6: 提交**

顺带处理一条 Task 6 留下的判断题:它加的
`fixedReplyRstu` + `reversedOrder` 互斥规则,是本仿真器的自洽规则,不是草案的禁令
(草案把两个位放在同一个八位组里,并没有禁止同时置位)。规则**保留**——反序时
应答方是开场的那一方,"收到之后固定时间再回复"对它无意义,这不是罕见组合而是
自相矛盾——但消息要改成明说这是本仿真器的自洽规则,不要写得像草案的禁令。

---

### Task 8: 反序真的能用

五样功能里的最后一样。schema 放行它,布局排列它,但一整轮跑下来它是坏的——
Task 7 验证过,两处都是既有缺陷,与 Task 7 的改动无关:

1. **反序 + 任何控制阶段 ⇒ 测距零次。** 开场的那个应答方把 RESP 放在时隙 0,
   而 `txControlResp` 要求先有 POLL。
2. **反序 + 零长控制阶段 ⇒ 报出约 65.9 公里。** 单边双向测距的算术假定发起方先发,
   于是 `counterDiff` 回绕了。

第二条比第一条严重得多:**一个错误的数字走到了记录和界面上**。在这个仓库里,
测不出来只是功能缺失,测出一个假数字是另一回事——整个课程的纪律就是
"说出来的数要和仿真出来的数对得上"。

**草案说了什么**(15-25/0556r2):反序为 TRUE 时,测距阶段里应答方先发 MMS 包,
发起方自进入测距阶段起偏移 **600 RSTU**(`MMS_REVERSED_OFFSET_RSTU`,Task 1 已定义
但至今没有 `src/` 消费者——就是这里)再发自己的。

**Files:**
- Modify: `src/uwb/device.mms.ts`(控制帧的次序、SS-TWR 算术的方向)
- Modify: `src/uwb/device.report.ts`(谁测到哪个时间,随次序改变)
- Test: `tests/uwb/mms-reversed.test.ts`(新建)

**Interfaces:**
- Consumes: Task 1 的 `reversedOrder`、`MMS_REVERSED_OFFSET_RSTU`;Task 7 的 priming 规则。

- [ ] **Step 1: 先写失败的测试**

端到端,并且**先钉住那个错数**——它是这个任务存在的理由:

```ts
it('reversed order ranges, and does not report a distance from orbit', () => {
  for (const cfg of [
    { control: 'nba' },
    { control: 'uwbd', uwbdControl: 'sp0' },
    { control: 'uwbd', uwbdControl: 'none' },
  ]) {
    const ranges = run(cfg)               // reversedOrder: true, nonInterleaved: true
    expect(ranges.length).toBeGreaterThan(0)
    for (const r of ranges) expect(Math.abs(r.metres - TRUE_M)).toBeLessThan(0.5)
  }
})

it('the reversed initiator follows 600 RSTU into the ranging phase', () => {
  // MMS_REVERSED_OFFSET_RSTU 第一次有 src/ 消费者
})

it('forward order is unchanged in all three control planes', () => { /* 守卫 */ })
```

`TRUE_M` 与容差先跑一次确定性场景读出来再写死。**不要**在测试里重算实现的算术。

- [ ] **Step 2: 跑测试,确认它们失败**——第一条应当以 65.9 km 那种量级失败,
  而不是以"没有记录"失败;若它以"没有记录"失败,说明场景没走到出数那一步,
  先把场景修对再往下做。
- [ ] **Step 3: 实现**

SS-TWR 的两个时间——往返与回复——归属于谁,取决于谁先发。把这件事写成一处显式的
判断而不是散在算术里,并在注释里说明为什么反序会让它反过来。

- [ ] **Step 4: 跑测试,确认全过**
- [ ] **Step 5: 全量测试 + fixture 零 diff**
- [ ] **Step 6: 提交**

---

### Task 9: 编辑器控件与说明

**Files:**
- Modify: `src/uwb/ui/UwbSessionFields.tsx`
- Modify: `src/editor/EditorGuide.tsx`
- Modify: `src/ui/i18n.ts`
- Test: 先 `ls tests/ui/` 找现有的会话字段测试;有就加进去,没有就新建
  `tests/ui/uwb-session-fields.test.ts`

**Interfaces:**
- Consumes: Task 1 的全部字段与校验消息。

- [ ] **Step 1: 先写失败的测试**

只测逻辑,不测文案:(a) `control === 'nba'` 时 `rsfSfd` 控件置灰;
(b) `nonInterleaved === false` 时固定回复时间与反序两个控件置灰;
(c) 非法的固定回复时间不会被提交上去,且会留下一条错误消息。

- [ ] **Step 2: 跑测试,确认它失败**

- [ ] **Step 3: 加控件**

五个控件,照该文件既有的 `NumSelect` / 勾选框 / 带校验的数字输入的写法。
`EditorGuide.tsx` 每个控件一条 `<D t="…">` 说明,说清它是什么、草案为什么这样限制。

- [ ] **Step 4: 跑测试,确认全过**
- [ ] **Step 5: 全量测试**
- [ ] **Step 6: 提交**

---

### Task 10: 指南、词汇表与文稿注册

**Files:**
- Modify: `src/ui/Guide.tsx`(第 12 节)
- Modify: `src/ui/glossary.ts`
- Modify: `src/course/curriculum.ts`(`CONTRIBUTIONS`)
- Modify: `README.md`(4ab 那一节)
- Test: `tests/course/basis.test.ts` 与 `tests/ui/uwb-guide.test.ts` 自然覆盖

**Interfaces:**
- Consumes: 前十个 Task 的一切。

- [ ] **Step 1: 注册新文稿**

`CONTRIBUTIONS` 加六条,每条一句说明它提供什么:
`15-25/0066r1`(RSF 带 SFD)、`15-25/0194r0`(两种配置与 SP0 取舍)、
`15-25/0224r2`(固定回复时间的属性与范围)、`15-25/0292r1`(非交织子轮)、
`15-25/0331r1`(非交织的控制阶段)、`15-25/0556r2`(反序与 Treply 的省略)。

- [ ] **Step 2: 跑 basis 测试,确认「注册了但没人用」那条会红**

`npx vitest run tests/course/basis.test.ts`

预期:`registers no contribution the course has stopped using` 失败——还没有课引用
它们。**这条红是对的**,它会在 Task 11 写完课之后转绿。本 Task 不要为了让它变绿
而删规则、加例外或提前塞引用。把这条红写进本 Task 的报告。

- [ ] **Step 3: 写指南与词汇表**

`Guide.tsx` 第 12 节补两段:两种配置的差别、非交织与它的代价。
`glossary.ts` 新增七条:UWBD-MMS、SP0、SYNC+SFD 片段、RSF+SFD、非交织子轮、
固定回复时间、反序。每条按既有规则带出处标记——`tests/course/basis.test.ts` 的
指南规则会检查这一点(标题含「草案」的分组里,每条都要有
草案引用 / 模型取值 / 标准 / 法规 之一)。
`README.md` 的 4ab 表新增对应行,并把「草案有、仿真器没有」那段改写成已建模。

- [ ] **Step 4: 全量测试**

预期:只剩 Step 2 那一条红,其余全过。

- [ ] **Step 5: 提交**

---

### Task 11: 三门课

**Files:**
- Create: `src/course/uwb/uwb-uwbd.ts`、`src/course/uwb/uwb-acquisition.ts`、
  `src/course/uwb/uwb-subrounds.ts`
- Modify: `src/course/lessons.ts`(注册)、`src/course/curriculum.ts`(`COURSE_ORDER`)
- Modify: `tests/fixtures/lesson-hashes.json`、`tests/fixtures/uwb-record-hashes.json`
  (**只新增行**)
- Create: `tests/course/uwb-uwbd.test.ts` 等三个

**Interfaces:**
- Consumes: 前十个 Task 的一切。

- [ ] **Step 1: 按规格 §7 写三课**

课程契约:`why/outcomes/needs/terms/picture/numbers/deeper?/sources`,加
`scenario/variants/jumps/observe/tryThis/quiz`。一课一主题、一条 `steps` 流程
(至少三步)、一个场景、30 分钟上限。官方术语首次出现带括号英文名与缩写。
每课的 `sources` 必须点名它依据的文稿,否则 `tests/course/basis.test.ts` 会挡住。

三课(主题、图示类型、各自要证明的因果,详见规格 §7):

1. `uwb-uwbd`「不靠那部窄带电台」— 两种配置的差别;去掉窄带就必须自己捕获;
   SP0 与 SYNC+SFD 的取舍。图:两种包结构对照(`fields`)。
2. `uwb-acquisition`「首片段丢了,整轮就废」— 捕获与累加是两回事;首片段丢失的
   后果;`rsfSfd` 如何救回来,以及它要付的空口时间。图:同一列片段两种命运(`timing`)。
3. `uwb-subrounds`「轮流发,还是穿插发」— 非交织子轮换来什么、付出什么。
   反序放进本课的深度部分,不单独成课。图:交织与非交织的时隙对照(`timing`)。

- [ ] **Step 2: 注册并跑课程契约测试**

`npx vitest run tests/course/` — 契约测试(术语、流程块、图示、readability)全过。

- [ ] **Step 3: 生成新 fixture 行**

```bash
UPDATE_HASHES=1 npx vitest run tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts
git diff tests/fixtures/
```

**逐行检查 diff:只允许新增。** 任何一行既有内容被改动,都说明前面某个 Task 的
默认值没复现今天的行为,必须回去修,不得就地接受。

- [ ] **Step 4: 全量测试**

`npx vitest run` — 全过,包括 Task 10 Step 2 那条现在应该转绿的规则。

- [ ] **Step 5: 提交**
