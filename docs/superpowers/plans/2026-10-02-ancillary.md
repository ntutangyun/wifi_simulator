# 测距辅助信息（§10.35，Request = 0）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建已发布标准 §10.35 的辅助信息交换里不需要动共用结构的那一半——
一条消息分装在多帧里跨时隙发出去，Frames Remaining 数着还剩几帧——
并把「丢了」这件事的第三种粒度摆出来。

**Architecture:** RAICT IE 是本引擎第一个**长度由存在位决定**的信息单元（1 到 3 字节）。
窗口沿用切片 3 的 `rcmValidityRounds`，不新发明边界。角色名在这一节里与测距相反，
而时隙仍按测距角色排，所以这一刀的难点在**把角色讲清楚**，不在新机制。

**Spec:** `docs/superpowers/specs/2026-10-02-ancillary-design.md`

## Global Constraints

- **既有场景逐字节不变。** 辅助信息交换缺省关；两份 fixture 零 diff，
  **绝不运行 `UPDATE_HASHES=1`**（最后一个任务生成新课的 fixture 行时除外，
  且那时**只允许新增**）。
- **不许把标准正文抄进仓库。** 条号、字段名、数值可以；句子不可以。
- 每个常量带出处标记（`standard §x` / `model`）。上限不许写成字面量。
- 中文课文与中文校验消息，全角标点（，：），拒绝消息要给**理由**。
  官方术语首次出现带英文名与缩写。
- **用词守 `docs/course-wording-contract.md`。** 禁用词里与开销有关的几个特别容易撞：
  **更贵、账、买到、省钱、白费、值钱**。写任何关于开销的中文之前先读
  `tests/course/wording.test.ts` 的禁用表。
- 注释用英文，密度随各文件。
- **提交必须带显式路径**；不用裸 `git commit`、不用 `--amend`、不用 `-a`。
- 提交信息以下列两行结尾：
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`

### 这条分支付过代价的纪律

- **`tsc -b` 不是完整的索引。** 三个结构对它和 grep 都隐形：`i18n.ts` 的 `tooltips`、
  `laneLayout.ts` 的 `spanTooltip` 三元链、`view.ts` 的 reducer（`default: return false`）。
  切片 3.5 的 Task 3 已经给 `laneLayout.ts` 加了一条扫遍整个 `FRAME_KINDS` 的
  `it.each`，**所以 `spanTooltip` 这一处现在会报错而不是静默**——但另两处还要手查。
- **非空断言不是运行时检查。**
- **一个数只靠字符串比对来守，它已经是 bug 了。** 导入常量，不从文档里抄。
- **先怀疑尺子。** 报告里要写清**你用什么量的**。
- **扫接口的调用方，不是任务的文件清单。** `RoundPlan` 加字段已经咬过两次，
  都是 `uwbModePatch`／`uwbSchedulePatch` 没复位新字段。
- **一个被允许却可证明无效果的配置，正是一个特性看起来做完了的方式。**
  这条在本分支出过两次（`contention` + `rmnr`，以及 SP3 的 `srrr.rrtt`）。
- **一个特性没跑完整轮并读过输出，就不算建成。**

---

### Task 1: RAICT IE —— 第一个长度由存在位决定的信息单元

**Files:** Modify `src/uwb/phy.ts`、`src/uwb/frames.ts`、`src/uwb/frameFields.ts`、
`src/model/frames.ts`；Test `tests/uwb/ancillary-frames.test.ts`

**Produces:** `RAICT_IE_MIN_BYTES`；`raictIeBytes(numberPresent, framesRemainingPresent)`；
`uwbAncillaryBytes(...)`；`makeAncillary(...)`；`'uwbAncillary'` 加进 `FRAME_KINDS`。

- [ ] **Step 1: 先写失败的测试** —— 四种组合，各自一条：

```ts
it('is one octet of control plus whichever optional octets the presence bits claim', () => {
  // 四种组合：两个存在位各开各关。内容 1 到 3 字节，头部另算。
  expect(raictIeBytes(false, false)).toBe(UWB_IE_HDR_BYTES + 1)
  expect(raictIeBytes(true, true)).toBe(UWB_IE_HDR_BYTES + 3)
  // 并且两个中间态互不相等 —— 一个只认总长的实现会在这里通过，所以要分开钉
})
it('refuses to claim a frames-remaining count it did not make room for', () => {
  // 存在位为 false 而调用方给了计数：抛，并说理由（makeMmrcm 的先例）
})
```

**第二条是这一刀的形状**：切片 3b 的 `makeMmrcm` 在条目长度与 `windowRounds`
不符时**抛异常**，因为一个默默接受不一致输入的构造器会把错误推到下游。照同样的办法。

- [ ] **Step 2: 确认失败** · **Step 3: 实现**（`FRAME_KINDS` 扩完**跑 `tsc -b`**
      并手查 `i18n.ts` 的 `tooltips` 与 `view.ts` 的 reducer；`laneLayout.ts` 现在有测试守）
- [ ] **Step 4: 全过** · **Step 5: 全量 + fixture 零 diff** · **Step 6: 提交（显式路径）**

**报告里必须有**：四种组合的字节数，以及**你是怎么确认那个 `it.each` 真的会在缺分支时失败的**
（变异一次，看它红）。

---

### Task 2: 会话开关与分段的形状

**Files:** Modify `src/model/scenario.ts`、`src/uwb/session.ts`；
Test `tests/model/ancillary-scenario.test.ts`、`tests/uwb/ancillary-schedule.test.ts`

**Produces:** `UwbSessionCfg.ancillary`（缺省 `false`）；
`UwbSessionCfg.ancillaryFrames`（一条消息分几帧，缺省 1）；`RoundPlan` 上的对应字段。

**窗口沿用 `rcmValidityRounds`**（规格 §3）：辅助交换发生在当前轮以及受这条 RCM 管的
后续轮里。**不要新加一个窗口字段**——那会变成同一个边界的第二个名字，而本分支
已经因此付过一次（`rmnr` 与 `rcmValidityRounds` 的那组拒绝）。

与既有开关的组合**由实现者判断并各写一条**，不相容就拒绝并说理由：
`ancillary` 与 `dl-tdoa`／`ul-tdoa`／`mms`／`m2m`／`sp3` 各自；
与 `schedule` 的两种（**两种都必须能跑**，规格 §3）；
与 `ancillaryFrames` 为 1 时是否还算分段（**提示但要自己核**：
一帧的消息没有分段，所以 `ancillary: true` + `ancillaryFrames: 1` 可能是一个
被允许却无效果的配置——裁定它，并写出理由）。

**收工前把新字段与既有字段的每种组合探一遍**，确认没有哪一条拒绝的补救被另一条拒绝
禁止——这个环状死循环在本文件里出过一次，注释在 `src/model/scenario.ts:1130` 附近。

**三条必写**：不写这两个字段时解析通过且取缺省；**schema 能解析自己的输出**；
以及 `ancillaryFrames` 的上限**算出来**（一轮里有几个时隙装得下），不写字面量。

- [ ] 五步同上 + fixture 零 diff

---

### Task 3: 设备与网络 —— 缺帧是被发现的，不是被猜出来的

**Files:** Modify `src/uwb/device.ts`（或新建 `src/uwb/device.ancillary.ts`，
按 `device.tdoa.ts`／`device.m2m.ts`／`device.sp3.ts` 的先例）、`src/uwb/network.ts`、
`src/uwb/records.ts`、`src/uwb/view.ts`、`src/scene/laneLayout.ts`、`src/ui/i18n.ts`；
Test `tests/uwb/ancillary-round.test.ts`

三件事：**按 Frames Remaining 从 N−1 发到 0**；**接收端在后一帧到达时就知道缺了哪一号**；
**角色与测距相反**（发辅助信息的那一端在这一节里叫发起方）。

- [ ] **Step 1: 先写失败的测试** —— 这六条是验收，全部**跑完整轮读记录**：

```ts
it('spreads one message across N slots, counting down to zero', () => {})
it('names the missing frame when the NEXT frame arrives, not at a timeout', () => {
  // 加一面墙让中间某一帧收不到。断言：缺失是在下一帧到达的那一刻被记录的，
  // 而且记录里有缺的那个号 —— 这是本刀的验收
})
it('runs under contention and produces a different record than under time', () => {
  // 不许出现一个被允许却可证明无效果的组合
})
it('leaves UWB_RANGE field-for-field identical with ancillary on', () => {})
it('sends nothing at all when ancillary is off', () => {})
it('is deterministic, and every other mode byte-identical', () => {})
```

**第二条是这一刀的验收**：不是分段能跑，是**缺帧被发现的时刻比超时早**。

- [ ] 五步同上 + fixture 零 diff

**`view.ts` 的 reducer 要为新记录类型加计数**——漏过一次。
`i18n.ts` 要为 `'uwbAncillary'` 加帧名／这是什么／接下来三条。

---

### Task 4: 编辑器、指南与词汇表

**Files:** `src/uwb/ui/UwbSessionFields.tsx`、`src/editor/planOps.ts`、
`src/editor/EditorGuide.tsx`、`src/ui/Guide.tsx`、`src/ui/glossary.ts`

一个开关（`ancillary`）加一个帧数。**切换模式、`schedule` 或 `replyTime` 时要把它们带回
合法状态**（`uwbModePatch`／`uwbSchedulePatch`／`uwbReplyTimePatch` 已为 `rmnr`／`mmrcr`／
`sp3` 做过，照同样的办法，**而 `sp3` 那一次是漏的，所以把三个函数都查一遍**）。

`Guide.tsx` 加一节：规格 §4.3 那张「丢了的三种粒度」表——RMNR 逐轮、收妥位图整窗口、
Frames Remaining 一条消息之内。**这三者很容易被读成一回事**，而那正是这一节要防的。
另外要讲**角色名在这一节里反过来**（规格 §2）。

词汇表加：测距辅助信息（ranging ancillary information）、剩余帧数（Frames Remaining）。
每条带出处标记。

**用户可见的每个字符串都守 `docs/course-wording-contract.md`**（那些文件没有测试在管，
控制者自己在编辑器指南里犯过一次）。**指南里每个测得的数，测试要当场跑出来再比。**

- [ ] 五步同上 + fixture 零 diff

---

### Task 5: 课

**Files:** Create `src/course/uwb/uwb-ancillary.ts`；注册进 `lessons.ts` 与 `COURSE_ORDER`
（放在 `uwb-sp3` 之后）；`curriculum.ts` 的模块与 `basis`；fixture **只增行**

**`uwb-ancillary`「一条消息装不进一帧」** —— 规格是骨架，标题就是结论。

要讲清三件事：**为什么要分段**（一帧的载荷有上限，而一条辅助消息可以比它长）；
**Frames Remaining 让接收端不必等超时**，这是「丢了」的第三种粒度，
与 RMNR、收妥位图并列而不是重复；以及**这一节把发起方与响应方的意思换了**，
所以读者会看到一台在测距里作答的设备在这里发消息。

`basis` 是**已发布标准** §10.35 与 §10.35.2.1，不是草案。

`limits` 必填，2–5 条，**每条对着引擎核过**。已知该说的：
一条消息分几帧是场景配置，不是上层算出来的（本引擎一条 MAC 原语都没有，
照 `rcmValidityRounds` 已有的理由写）；消息类型建成常量，不建取值表；
Request = 1 的排程请求不建（切片 3d，**而理由是一次该做多少，不是举证不足**——
机理已读通，照 `uwb-rcm-validity` 那条 `out-of-scope` 的写法）。

**课文与新课都要过 `tests/course/wording.test.ts` 与 `tests/course/readability.test.ts`**，
两条都没有豁免名单了（AMP 的那个例外已经删掉）。
**首次出现规则是位置性的**：括号要在首次使用处 40 字以内，不是在 `sources` 里。
不要用字符串存在比对去探它，让测试自己打印失败数组。

- [ ] **Step 1: 写课** · **Step 2: 课程契约与两条测试全过**
- [ ] **Step 3: 生成 fixture 行**，逐行确认只有新增
- [ ] **Step 4: 全量全绿** · **Step 5: 提交（显式路径）**
