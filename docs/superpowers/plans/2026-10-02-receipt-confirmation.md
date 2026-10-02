# 多消息收妥确认实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建标准 §10.36 的多消息收妥确认与 RMMRC IE，让发送方第一次知道**谁听见了它**。

**Architecture:** 控制器在 ARC IE 的 MMRCR 位（bit 15，既有的两字节控制字里，不增帧长）
请求；收方用一帧 MMRCM 回答，里面每个发起方一个条目、一张位图，覆盖**当前 RCM 有效期
窗口里该发起方发出的那几条开场消息**。`src/uwb/ranging.ts` 一行不改。

**Spec:** `docs/superpowers/specs/2026-10-02-receipt-confirmation-design.md`

## Global Constraints

- **既有场景逐字节不变。** MMRCR 缺省关；`tests/fixtures/lesson-hashes.json` 与
  `uwb-record-hashes.json` 零 diff，**绝不运行 `UPDATE_HASHES=1`**（最后一个任务生成
  新课的 fixture 行时除外，且那时**只允许新增**）。
- **`src/uwb/ranging.ts` 一行都不改。** 收妥确认是一条额外的消息，不是测量的一部分。
- **位图必须来自接收端自己的经历**，不是从记录里倒推。这是本刀的验收，见规格 §5.1。
- **上限不许写成字面量。**
- **不许把标准正文抄进仓库。** 条号、字段名、数值可以；句子不可以。
- 每个常量带出处标记（`standard §x` / `model`）。
- 中文课文与中文校验消息，全角标点（，：）。消息要给**理由**。
- **提交必须带显式路径**（`git commit -m … -- <paths>`），不用裸 `git commit`、
  不用 `--amend`、不用 `-a`。这个工作树已经为此丢过一条提交消息。
- 提交信息以下列两行结尾：
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`

### 前三刀付过代价的纪律，逐条适用

- **`tsc -b` 枚举它能枚举的，但它不是完整的索引。** 这条分支上有三个结构对它和 grep
  都隐形：`i18n.ts` 的 `tooltips`、`laneLayout.ts` 的 `spanTooltip` 三元链、
  `view.ts` 的 reducer（`default: return false`）。扩宽任何联合类型都要手查这三处。
- **非空断言不是运行时检查。** 为此付过一条全是 NaN 的 `UWB_RANGE` 记录。
- **一个数只靠字符串比对来守，它已经是 bug 了。**
- **先怀疑尺子。** 十三次「测量结果反常」全是量它的工具错了：参数位置、取整的除数、
  搜索式、两倍块长的时间窗、凭记忆重打的三个常数、喂错索引的判据、
  以及把记录的 `node`／`peer` 读反。报告任何东西缺失或无效之前，先把签名、常数、
  窗口或字段名再读一遍，并在报告里写清**你用什么量的**。
- **把它当复核做，不是当实现做。** 这条分支上五次「一句形象化的说法替一个事实错误
  打掩护」，还有一次是一个 schema 允许而无线电用不上的组合。

---

### Task 1: 帧与信息单元

**Files:** Modify `src/uwb/phy.ts`、`src/uwb/frames.ts`、`src/uwb/frameFields.ts`、
`src/model/frames.ts`；Test `tests/uwb/mmrcm-frames.test.ts`

**Interfaces:**
- Produces：`RMMRC_FIXED_BYTES`；`rmmrcEntryBytes()`；`uwbMmrcmBytes(initiators, windowRounds)`；
  `makeMmrcm(...)`；`'uwbMmrcm'` 加进 `FRAME_KINDS`；`uwbMaxMmrcmInitiators(windowRounds)`。
- Consumes：无。

规格 §3.2 的字段表与 §3.3 的帧长式子。要点：

- **RMMRC IE 的控制字节**只建 Address Present 与 Address Size 两位，
  地址固定用 2 字节的短地址（规格 §6，标 `model`，注释里说明标准允许两种）。
- **位图宽度随窗口长度走**：`⌈R/8⌉` 字节。R ≤ 8 时一个字节。
- **`'uwbMmrcm'` 要有自己的 FrameKind**：课程的要点是「这一帧是回答，不是测量」，
  时间线把它标成别的东西就把这一点抹掉了。扩完 `FRAME_KINDS` **跑 `npx tsc -b`**，
  并**手查上面那三处它抓不到的地方**。

- [ ] **Step 1: 先写失败的测试**

```ts
it('costs 15 + 3N octets at a window of eight rounds or fewer', () => {
  for (const [n, want] of [[1, 18], [3, 24], [6, 33]] as const) {
    expect(uwbMmrcmBytes(n, 4)).toBe(want)
  }
})
it('widens the bitmap once the window passes eight rounds', () => {
  expect(uwbMmrcmBytes(1, 9) - uwbMmrcmBytes(1, 8)).toBe(1)
})
it('derives the initiator cap from the PSDU, not from a literal', () => {
  // 两侧边界都钉：cap 处 ≤ 127 < cap+1 处
})
it('carries one list entry per initiator, each with an address and a bitmap', () => {
  // ies 与字段和都查，不只查声明的长度
})
it('leaves every existing frame byte-identical', () => {})
```

- [ ] **Step 2: 确认失败** · **Step 3: 实现** · **Step 4: 全过**
- [ ] **Step 5: 全量 + fixture 零 diff** · **Step 6: 提交（显式路径）**

---

### Task 2: 会话开关与这一帧放在哪

**Files:** Modify `src/model/scenario.ts`、`src/uwb/session.ts`；
Test `tests/model/mmrcm-scenario.test.ts`、`tests/uwb/mmrcm-schedule.test.ts`

**Interfaces:**
- Consumes：Task 1。
- Produces：`UwbSessionCfg.mmrcr`（缺省 `false`）；`RoundPlan.mmrcr`；
  时隙表里 MMRCM 的位置。

两件事：

1. **`mmrcr` 缺省关**，所以既有场景逐字节不变。
2. **这一帧放在窗口的最后一块**（规格 §3.3：位图覆盖整个窗口，所以要等窗口走完）。
   时隙表因此在窗口最后一块多出每个发起方一个时隙——**而其余块一个时隙都不多**。
   这一条要单独测：前 R−1 块的时隙表与 `mmrcr` 关闭时逐格相同。

**与既有开关的组合要想清楚并各写一条**，由实现者判断并在报告里论证，
不相容就拒绝并说理由，**不要默默忽略**：
`mmrcr` 与 `rcmValidityRounds: 1`（窗口只有一块，位图只有一位——还有意义吗？）；
与 `dl-tdoa`／`ul-tdoa`／`mms`／`m2m` 各自；与 `schedule: 'contention'`。

**提示，但要自己核**：`m2m` 是标准为这一节画图时用的那个模式（规格 §2），
所以它大概是**最该支持**的那一个，不是该拒绝的。

**两条必写的测试**：不写 `mmrcr` 时解析通过且为 `false`；**schema 能解析自己的输出**
（切片 1 的 Ruling 4 就是漏了这条踩的雷）。

- [ ] 五步同上 + fixture 零 diff

---

### Task 3: 设备与网络 —— 位图从接收端自己的经历里来

**Files:** Modify `src/uwb/device.ts`、`src/uwb/network.ts`、`src/uwb/records.ts`、
`src/uwb/view.ts`；Test `tests/uwb/mmrcm-round.test.ts`

**Interfaces:** Consumes Task 1、Task 2。

三件事：

1. **每个响应方记下它在本窗口里收到了该发起方的哪几条开场消息。** 这是跨轮状态，
   而这条分支上那种状态只有一处先例（`rcmBlock`），它的教训要照搬：
   **按发起方分键。** 一个设备为 tag 1 记下的收妥情况，**绝不能**用来回答 tag 2——
   切片 3 正是在这里出过一个让功能说谎的缺陷（15 条声称收到了从未解出过的控制消息
   的 RMNR 帧），而破案线索一直写在注释里。
2. **窗口最后一块发 MMRCM**，每个发起方一帧（规格 §6：不建多播）。
3. **记录类型 + `view.ts` 的计数**，这样课程能 `watch` 它，而读者在实时视图里看得见。
   `view.ts` 的 reducer 以 `default: return false` 结尾——**缺一个分支对 tsc 和 grep
   都是隐形的**，这条分支上已经为此付过一次。

- [ ] **Step 1: 先写失败的测试** —— 这六条就是验收，全部**跑完整窗口读记录**：

```ts
it('reports exactly the openers that arrived, bit for bit', () => {
  // 加一面墙让某几块的开场收不到：位图的 0 位与 RX_OK 的缺失逐位对上。
  // 位图不许是记录的复述——要能在变异下失败：把它改成「永远全 1」，这条必须红。
})
it('never answers an initiator it has not heard from', () => {
  // 两个发起方，第二个低 14 dB：给它的位图一条都不该有。切片 3 那个缺陷的同形。
})
it('asks for nothing on the air: the RCM is the same size with MMRCR set', () => {})
it('sends no MMRCM when MMRCR is clear', () => {})
it('leaves every UWB_RANGE field-for-field identical', () => {})
it('adds slots only on the window last block', () => {})
```

**Step 2 的注意**：第一条若以「没有记录」失败，说明窗口没跑到出数那一步——
先把窗口修对。这条分支已经三次交付过「看着做完了其实什么都没做」的功能。

- [ ] 五步同上 + fixture 零 diff

---

### Task 4: 编辑器、指南与词汇表

**Files:** `src/uwb/ui/UwbSessionFields.tsx`、`src/uwb/ui/UwbInspector.tsx`、
`src/editor/planOps.ts`、`src/editor/EditorGuide.tsx`、`src/ui/Guide.tsx`、
`src/ui/i18n.ts`、`src/ui/glossary.ts`

一个开关（`mmrcr`）。**切换模式或改 `rcmValidityRounds` 时要把它带回合法状态**——
`uwbModePatch`／`uwbSchedulePatch` 已经为 `rmnr` 做过这件事，照同样的办法；
切片 3 的 Task 5 在那里找到过第二例同类缺陷。

`Guide.tsx` 加一节：规格 §4 那张「它让谁知道了什么」的表，以及
**RMNR 与收妥位图的区别**——逐轮、响应方主动、对方没发来 vs 整窗口、控制器请求、
我收到了哪几条。**这两者很容易被读成一回事**，而那正是这一节要防的。

词汇表加：多消息收妥确认（MMRCM）、收妥位图。每条带出处标记。

**用户可见的每个字符串都守 `docs/course-wording-contract.md`。** 控制者自己在
编辑器指南里犯过这条（写了 `开口`／`说话`），而那些文件**没有任何测试在管**。

**指南里每个测得的数，测试要当场跑出来再比**，不许只做字符串比对。

- [ ] 五步同上 + fixture 零 diff

---

### Task 5: 课

**Files:** Create `src/course/uwb/uwb-receipt.ts`；注册进 `lessons.ts` 与
`COURSE_ORDER`（放在 `uwb-rcm-validity` 之后）；`curriculum.ts` 的模块与 `basis`；
fixture **只增行**

**`uwb-receipt`「谁听见了我」** —— 规格 §2 是骨架。切片 2 留下的那个问题是开场：
多对多里**每一对距离只有排在前面的那一个算得出来**，参与者 N−1 发出全轮最长的帧
却算出零条距离——于是它知道自己算出了什么，**却不知道谁听见了它**。这一节就是答案。

要讲清的三件事：**请求不花空口时间**（MMRCR 在既有的两字节控制字里）；
**回答按发起方分条目**，一条一张位图；以及**它和 RMNR 不是一回事**
（规格 §4：逐轮／整窗口，响应方主动／控制器请求）。

图：一张位图对上一次真实的丢失（`fields` 或 `timing`，实现者判断）。

`basis` 是**已发布标准** IEEE Std 802.15.4-2024 §10.36 与 §10.32.9.1，不是草案。

`limits` 必填，2–5 条，**每条对着引擎核过**。已知该说的：位图覆盖的是
**本仿真器选的那个窗口**（标准没指定是哪几条消息，这是模型决定）；
地址只建短地址那一种；不建多播下发，每个发起方一帧；
**§10.35 单独一刀，而它真正的题目是「排程能不能被请求改变」**——
不是举证不足（机理已读通），这个区别这个仓库写错过一次。

- [ ] **Step 1: 写课** · **Step 2: 课程契约与用词测试全过**
- [ ] **Step 3: 生成 fixture 行**，`git diff tests/fixtures/` **逐行确认只有新增**
- [ ] **Step 4: 全量全绿** · **Step 5: 提交（显式路径）**
