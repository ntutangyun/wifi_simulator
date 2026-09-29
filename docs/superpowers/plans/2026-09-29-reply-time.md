# 五种测距形态实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐标准 §10.29.6 缺的三种测距形态（SS 延后、SS 固定、DS 延后），
让“回复时间放在哪里”成为一个能量出来的取舍。

**Architecture:** 一个会话字段 `replyTime` 贯穿帧内容、轮形、发送时刻三层；
`src/uwb/ranging.ts` 的算术一行不改。

**Spec:** `docs/superpowers/specs/2026-09-29-reply-time-design.md`

## Global Constraints

- **既有场景逐字节不变。** `replyTime` 缺省 `embedded`，`tests/fixtures/lesson-hashes.json`
  与 `uwb-record-hashes.json` 零 diff，**绝不运行 `UPDATE_HASHES=1`**（最后一个任务
  生成新课的 fixture 行时除外，且那时**只允许新增**）。
- **`src/uwb/ranging.ts` 一行都不改。** 要改它说明搬运路线建错了，回去读规格 §2、§8。
- **上限不许写成一个数。** `uwbMaxAnchors` 由“轮里最长的帧 ≤ 127 字节”算出来。
  代码里不许出现字面量 33。
- **跑完整轮、读它的输出，一个功能才算建模完成。** 算术测试替代不了。
- 每个常量带出处标记（`standard §x` / `model`）。
- 中文课文，全角标点（，：）。
- 提交信息以下列两行结尾：
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`

---

### Task 1: 帧内容与帧长，以及被算出来的锚点上限

**Files:** Modify `src/uwb/phy.ts`、`src/uwb/frames.ts`、`src/uwb/frameFields.ts`；
Test `tests/uwb/reply-time-frames.test.ts`

**Interfaces:**
- Produces：`UwbReplyTime = 'embedded' | 'deferred' | 'fixed'`（放 `phy.ts`，
  两侧都要 import 它）；`uwbRespBytes(method, replyTime)`；
  `uwbFinalBytes(anchors, replyTime)`；`UWB_SS_DEFER_BYTES`；
  `uwbMaxAnchors(mode, method, replyTime, schedule)`；`UWB_MAX_PSDU_BYTES = 127`；
  `makeSsDefer(anchor, tag, replyRctu, block, round, slot)`；
  `makeResp` / `makeFinal` 各多一个 `replyTime` 参数。
- Consumes：无。

**先扫调用方。** `uwbRespBytes`、`uwbFinalBytes`、`UWB_MAX_ANCHORS`、`makeResp`、
`makeFinal`、`uwbLongestFrameBytes` 的每一个调用点都要看过并在报告里列出来——
`UWB_MAX_ANCHORS` 至少有 `src/model/scenario.ts` 与 `src/uwb/network.ts` 两个，
`makeResp` / `makeFinal` 在 `device.ts` 与 DL-TDoA 路径上都有。
**DL-TDoA 路径上这三个的行为必须一个比特都不变。**

- [ ] **Step 1: 先写失败的测试**

```ts
it('drops the reply time from a Response that does not carry one', () => {
  expect(uwbRespBytes('ss', 'embedded')).toBe(20)
  expect(uwbRespBytes('ss', 'fixed')).toBe(14)
  expect(uwbRespBytes('ss', 'deferred')).toBe(14)
  expect(uwbRespBytes('ds', 'embedded')).toBe(14) // 今天的值，不许变
})

it('stops the deferred Final growing with the anchor count', () => {
  // 延后的 Final 不随锚点数增长——具体常数由 Task 4 的裁定确定（见下）
  const at1 = uwbFinalBytes(1, 'deferred')
  for (const a of [5, 9]) expect(uwbFinalBytes(a, 'deferred')).toBe(at1)
  expect(uwbFinalBytes(9, 'embedded')).toBe(122) // 今天的值，不许变
})

it('derives the anchor cap from the longest frame of the round, not from a literal', () => {
  // DS 嵌入仍然是 9；DS 延后与三种 SS 都高于 9，且每一种都由
  // uwbLongestFrameBytes(cap, …) <= 127 < uwbLongestFrameBytes(cap + 1, …) 钉住。
})

it('a deferred Response carries no replyRctu key at all', () => {
  // 不是 undefined，是键不存在——FrameDesc 要能和手搭的比较相等
})

it('the deferred reply-time message carries the reply time and nothing else', () => {
  // makeSsDefer：ies 恰为 ['RRTI']，replyRctu 在里面，长度 = MHR + RRTI IE + FCS
})

it('leaves every DL-TDoA frame byte-identical', () => {
  // 对 makePoll / makeResp / makeFinal 的 dl 分支逐字段比对
})
```

- [ ] **Step 2: 跑测试，确认失败**
- [ ] **Step 3: 实现**

`uwbMaxAnchors` 要**搜**出上限：从 1 往上试，最大的使
`uwbLongestFrameBytes(a, mode, schedule, replyTime) ≤ UWB_MAX_PSDU_BYTES` 成立的 a。
`uwbLongestFrameBytes` 因此也要接 `replyTime`，并且 SS 延后轮里那条延后报文
也算在“最长的帧”里。`UWB_MAX_ANCHORS` 这个常量**删掉**——留着它就留着一条第二来源。

`frameFields.ts` 要能解码新帧：延后报文一行 RRTI，延后的 Final 没有带时间的 RMI 行。

- [ ] **Step 4: 全过** · **Step 5: 全量测试 + fixture 零 diff** · **Step 6: 提交**

---

### Task 2: 会话配置与三条拒绝规则

**Files:** Modify `src/model/scenario.ts`；Test `tests/model/reply-time-scenario.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `UwbReplyTime`、`uwbMaxAnchors`。
- Produces：`UwbSessionCfg.replyTime`、`UwbSessionCfg.fixedReplyRstu`。

`replyTime` 默认 `'embedded'`。`fixedReplyRstu` 也要有默认值，取值由实现者从
`DEFAULT_UWB_SESSION.slotRstu = 2400` 与规格 §6 的时隙预算算出来，并在注释里写清
为什么是这个数、标 `model`。**两个都要有默认值**，否则既有场景读不回来。

- [ ] **Step 1: 先写失败的测试**

规格 §3.1 的三条，每条一个测试，**断言消息里给的是理由不是“暂不支持”**：
`ds` + `fixed` 拒绝（标准枚举的五种里没有这一种）；`contention` + `deferred` 拒绝
（抽到的时隙没有固定的延后时隙可去）；`contention` + `fixed` **接受**。

再两条：**不写 `replyTime` 时解析通过且值为 `'embedded'`**（和 `fading` 相反——
这里默认值是对的，因为它就是今天的行为）；**schema 能解析自己的输出**
（`fading` 那一刀漏了这条，踩了雷，见 `.superpowers/sdd/2026-09-27-fading/progress.md`
的 Ruling 4）。

还有规格 §6 的时隙预算：`fixed` 下时隙不够长要被拒，消息里要把那条不等式的四项
都说出来。**这一条的数要自己算过**，不要抄规格里的式子——规格是论证，不是实现。

- [ ] **Step 2: 确认失败** · **Step 3: 实现** · **Step 4: 全过**
- [ ] **Step 5: 全量 + fixture 零 diff** · **Step 6: 提交**

---

### Task 3: 轮形与时隙表

**Files:** Modify `src/uwb/phy.ts`（`uwbSlotsPerTag`）、`src/uwb/session.ts`
（`RoundPlan`、`slotAction`）；Test `tests/uwb/reply-time-schedule.test.ts`

**Interfaces:**
- Consumes：Task 1、Task 2。
- Produces：`RoundPlan.replyTime`、`RoundPlan.fixedReplyNs`。

`RoundPlan` 加这两个字段，**和 `mms` 同样的理由**：一轮的两端必须读同一个数，
设备自己再算一遍就是再有一次机会算歧。`fixedReplyNs` 由 `rstuNs(fixedReplyRstu)`
换算，**只在这里换算一次**。

规格 §4 的表：SS 延后是 2A+1 个时隙，多出来的 A 个时隙是延后报文。
`slotAction` 对 SS 延后轮的 slot A+1…2A 返回
`{ kind: 'uwbSsDefer', tx: 'anchor', anchor: k }`——一个**新的** `SlotAction` 变体，
不要挪用 `uwbReport`（那是 DS 的 RMI 报告，内容不一样，复用它会让两种报文在
`transmitFor` 里分不开）。

- [ ] **Step 1: 先写失败的测试**

```ts
it('lays out the five shapes with the slot counts the spec tabulates', () => {
  // 五种组合 × A = 1, 3, 9，对着规格 §4 的表逐格断言
})
it('walks every slot of every shape without throwing and without a gap', () => {
  // 对每种形态：slot 0..slots-1 每个都有 action，且没有两个时隙拿到同一个 (kind, anchor)
})
it('leaves the embedded shapes slot-for-slot identical to today', () => {})
```

- [ ] 五步同上 + fixture 零 diff

---

### Task 4: 设备侧 —— 三条新的搬运路线，以及唯一一次不对齐时隙的发送

**Files:** Modify `src/uwb/device.ts`、`src/uwb/network.ts`；
Test `tests/uwb/reply-time-round.test.ts`

**Interfaces:**
- Consumes：Task 1–3 的一切。

三件事：

1. **SS 延后**：锚点在自己的 Response 之后记下发送时间戳，在它的延后时隙发
   `makeSsDefer`；标签在收到延后报文时才算距离。Response 上不再算。
2. **DS 延后**：Final 不带每锚点的时间。于是 `onFinal` 里锚点**算不出距离**
   （规格 §7），但 `finalListedMe` 这件事还得成立——否则锚点不知道该不该报告。
   **一个空的 Final 仍然可以带响应方列表**（RMI 的固定部分加地址，不带时间），
   那是最省的做法，也是标准让 Final 在延后形态里仍然存在的理由。
   **它的帧长因此不是 14**，而是 14 加那份列表——`uwbFinalBytes(a, 'deferred')`
   要不要随锚点数增长，由此决定，**控制者裁定并写进 ledger**（规格 §5 写的 14 是
   “什么都不带”的读法，Task 1 的测试只钉“不随锚点数增长”）。
   若裁定为带列表，则它确实随锚点数增长，Task 1 的那条测试要相应收窄为
   “增长得比嵌入式慢得多”，并由控制者在裁定里说清。
3. **固定回复时间**：锚点在 `rxPoll 时间戳 + fixedReplyNs + k × slotNs` 发送，
   不是在时隙起点。这是整个 UWB 侧唯一一处不对齐时隙的发送，注释要说明这一点
   以及它为什么必须这样（规格 §6）。

- [ ] **Step 1: 先写失败的测试** —— 这五条就是验收，全部**跑完整轮读记录**：

```ts
it('measures the same distance five different ways', () => {
  // 同场景同种子，五种组合各跑一轮，读 UWB_RANGE：五个距离在噪声之内一致
})
it('gives the anchor a range only in the embedded DS round', () => {
  // 规格 §7 的表，读记录的 node 字段
})
it('the deferred SS range does not exist until the deferred message lands', () => {
  // Response 之后没有 UWB_RANGE，延后报文之后有
})
it('a fixed reply time that overruns its slot loses the round', () => {
  // 调到刚好越界：UWB_TIMEOUT 且没有 UWB_RANGE；调回来：有 UWB_RANGE
})
it('is deterministic and byte-identical in the embedded shapes', () => {
  // 时间线哈希与今天相同
})
```

**Step 2 的注意**：第一条若以“没有记录”失败，说明轮没跑到出数那一步——
先把轮修对再往下做，不要去修一个看不见的东西。

- [ ] **Step 2: 确认失败** · **Step 3: 实现** · **Step 4: 全过**
- [ ] **Step 5: 全量 + fixture 零 diff** · **Step 6: 提交**

---

### Task 5: 编辑器、指南与译名

**Files:** `src/editor/FloorPlanEditor.tsx`（或 UWB 会话面板，先 grep `contentionSlots`
找到它在哪编辑）、`src/editor/EditorGuide.tsx`、`src/ui/Guide.tsx`、`src/ui/i18n.ts`、
`src/editor/planOps.ts`

一个下拉（三种形态）加一个数字框（`fixedReplyRstu`，仅 `fixed` 下可编辑）。
测试只测逻辑：非法组合不提交；`fixedReplyRstu` 在其他两种形态下置灰。

`Guide.tsx` 加一节：五种形态是一张取舍表，附规格 §5 与 §7 的两张表。

- [ ] 五步同上 + fixture 零 diff

---

### Task 6: 两门课

**Files:** Create `src/course/uwb/uwb-reply-time.ts`、`uwb-deferred-ds.ts`；
注册进 `lessons.ts` 与 `COURSE_ORDER`（放在 `uwb-dstwr` 之后）；
`src/course/curriculum.ts` 的模块归属；fixture **只增行**

1. **`uwb-reply-time`「你不能把一个数放进它自己测量的那一帧」** ——
   规格 §2 就是这一课的骨架。三种 SS 形态，各跑一次，读帧长与距离。
   图：三种形态的时隙表（`timing`）。
2. **`uwb-deferred-ds`「延后之后，锚点就只是一个应答器」** ——
   DS 两种形态，Final 的长度，被算出来的锚点上限从 9 移到哪里，
   以及 §7 那张“谁手里有距离”的表。图：`fields`（两种 Final 的字段对比）。

两课都要 `limits`（必填），并且要说清规格 §10 的三条：没有控制面原语、
不商量回复时间（RRTN 未建模）、响应方总是精确命中固定时刻（真实设备有发送抖动，
`Treply` 错 1 ns ≈ 15 cm）。

`sources` 要分清：条号是**已发布标准**，不是草案——这两课是全 UWB 课程里
少数完全不依赖草案的，`basis` 要写对。

- [ ] **Step 1: 写两课** · **Step 2: 课程契约测试全过**
- [ ] **Step 3: 生成 fixture 行**，`git diff tests/fixtures/` **逐行确认只有新增**
- [ ] **Step 4: 全量全绿** · **Step 5: 提交**
