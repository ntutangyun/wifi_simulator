# 多对多测距实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建标准 §10.32.6 / §10.32.7 的多对多测距，让「一次发送同时是问也是答」
成为一个能量出来的 N 倍差距。

**Architecture:** 一个新的 `UwbMode` 值 `'m2m'`；轮的参与者是一份有序名单而不是
「一个标签加 N 个锚点」；帧内容与 DL-TDoA 的「自己的发送时刻 + 收到的接收时刻」同形。
`src/uwb/ranging.ts` 的算术一行不改。

**Spec:** `docs/superpowers/specs/2026-09-30-many-to-many-design.md`

## Global Constraints

- **既有场景逐字节不变。** `tests/fixtures/lesson-hashes.json` 与
  `uwb-record-hashes.json` 零 diff，**绝不运行 `UPDATE_HASHES=1`**（最后一个任务
  生成新课的 fixture 行时除外，且那时**只允许新增**）。
- **`src/uwb/ranging.ts` 一行都不改。** 多对多只是让四个时间量走另一条路汇到一起。
- **上限不许写成字面量。** 参与者上限由「最后一个参与者的帧 ≤ 127 字节」算出来。
- **跑完整轮、读它的输出，一个功能才算建模完成。** 算术测试替代不了。
- 每个常量带出处标记（`standard §x` / `model`）。
- 中文课文与中文校验消息，全角标点（，：）。消息要给**理由**，不许写「暂不支持」。
- 提交信息以下列两行结尾：
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`

### 上一刀留下的四条纪律，逐条适用

- **一个数写进课文、而测试只用字符串比对来守它，那个数已经是 bug 了。**
  课文与指南里的每个测得的数，测试要**当场跑出来**再比。
- **类型检查器才是「一个联合类型欠了哪些账」的索引，grep 只是猜。**
  `UwbMode` 与 `FrameKind` 都要扩宽，扩完跑 `npx tsc -b` 让它把欠账列出来。
  上一刀 grep 漏了三张表。
- **非空断言不是运行时检查。** 上一刀为此付过一条全是 NaN 的 `UWB_RANGE` 记录，
  而且没有任何异常。值可能不在，就分支，不要断言掉。
- **先怀疑尺子。** 上一刀三次「测量结果反常」全都是量它的工具错了
  （参数位置、取整的除数、搜索式）。报告一个东西缺失或无效之前，
  先把签名、拼写、常数再读一遍，并在结论里写清你用什么量的。

---

### Task 1: 帧内容、帧长，与被算出来的参与者上限

**Files:** Modify `src/uwb/phy.ts`、`src/uwb/frames.ts`、`src/uwb/frameFields.ts`、
`src/model/frames.ts`；Test `tests/uwb/m2m-frames.test.ts`

**Interfaces:**
- Produces：`makeM2m(...)`；`'uwbM2m'` 加进 `FRAME_KINDS`；
  `uwbM2mBytes(rxTimes: number)`；`uwbMaxParticipants(method)`。
- Consumes：无。

**先做一个命名判断，并在报告里说理由。** 参与者的帧内容与 DL-TDoA 的 Final
**真的一样**：自己的发送时刻，加收到的每一个接收时刻。现成的常量是
`phy.ts#DL_TX_TIME_IE_BYTES`、`phy.ts#dlRxTimesIeBytes`、`frames.ts#UwbDlTimes`。
复用是对的，但 `DL_` 这个前缀在多对多里**是假话**（多对多不是单向测距）。
两条路：复用并加注释说明前缀的历史，或者改成中性名字并更新 DL-TDoA 的引用。
**倾向改名**——名字撒谎的代价比一次机械波及大——但先扫一遍调用方再定。

**时钟偏移不进帧**（规格 §4）：`coffs` 由接收端自己量，和既有 SS 路径一致。

- [ ] **Step 1: 先写失败的测试**

```ts
it('grows by one ranging time per arrival it reports', () => {
  // uwbM2mBytes(k+1) - uwbM2mBytes(k) 恒为 4，对 k = 0…8
})
it('makes the last participant the longest frame of the round', () => {
  // 参与者 i 带 i 个接收时刻，所以 i = N-1 那一帧最长
})
it('derives the participant cap from that frame, not from a literal', () => {
  // uwbM2mBytes(cap-1) <= 127 < uwbM2mBytes(cap)，两侧都钉
})
it('carries the sender own transmit time and nothing about clock offset', () => {
  // ies 里有发送时刻与接收时刻，没有 coffs——那是接收端量的
})
it('leaves every DL-TDoA frame byte-identical', () => {
  // 若选了改名，这条就是改名没改坏东西的证据；逐字段比对
})
```

- [ ] **Step 2: 跑测试，确认失败**
- [ ] **Step 3: 实现**（`frameFields.ts` 要能解码它；`src/model/frames.ts` 的
      `FRAME_KINDS` 扩宽之后 **跑 `npx tsc -b`**，把它列出来的每一张表都填上，
      包括 `src/ui/i18n.ts` 的 `kindName`/`whatIs`/`next`、`src/uwb/format.ts`、
      `src/uwb/frameFields.ts`、`src/scene/effects.ts`、`src/ui/laneLayout.ts` 的
      提示文字链——**上一刀 grep 漏了后三处，靠 tsc 才找齐**）
- [ ] **Step 4: 全过** · **Step 5: 全量 + fixture 零 diff** · **Step 6: 提交**

---

### Task 2: 会话配置 —— 新模式，以及它不需要标签

**Files:** Modify `src/model/scenario.ts`；Test `tests/model/m2m-scenario.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `uwbMaxParticipants`。
- Produces：`UwbMode` 多一个 `'m2m'`。

三件事：

1. `mode: 'm2m'` 进枚举。**默认仍是 `'twr'`**，所以既有场景读回来不变。
2. **UWB 会话现在要求至少一个标签，而 `m2m` 不需要**（规格 §5）。
   把那条规则按模式分开，消息里说清 `m2m` 为什么不需要——多对多里没有标签也没有
   锚点，每台设备两种活都干。
3. **一个块装一轮，全组共用**（和 DL-TDoA 一样），不是每个标签一轮。
   块装配那条规则要照这个改。

还有两条必写的测试：**不写 `mode` 时解析通过且值为 `'twr'`**；
**schema 能解析自己的输出**（上一刀 Ruling 4 就是这条漏掉踩的雷，
见 `.superpowers/sdd/2026-09-27-fading/progress.md`）。

`m2m` 与既有开关的组合要想清楚并各写一条：`schedule: 'contention'`（多对多的时隙
是排定的，竞争没有意义——拒绝，说理由）、`replyTime`（切片 1 的三种形态与多对多
是否相容，由实现者判断并在报告里论证；**不相容就拒绝并说理由，不要默默忽略**）、
`aoa`。

- [ ] 五步同上 + fixture 零 diff

---

### Task 3: 参与者名单与轮形

**Files:** Modify `src/uwb/phy.ts`（`uwbSlotsPerTag`）、`src/uwb/session.ts`；
Test `tests/uwb/m2m-schedule.test.ts`

**Interfaces:**
- Consumes：Task 1、Task 2。
- Produces：`RoundPlan.participants: number`；`SlotAction` 多一个
  `{ kind: 'uwbM2m'; tx: 'peer'; index: number; pass: 0 | 1 }`。

- SS 多对多：**N 个时隙**，时隙 i 属于参与者 i。
- DS 多对多：**2N 个时隙**，两趟各 N 个（规格 §3），`pass` 区分。
- 参与者顺序**按节点 id 排序**（规格 §5，标 `model`，理由是确定性：
  场景里的节点顺序会被编辑器改动，而那会换掉时隙分配与时间线哈希）。

- [ ] **Step 1: 先写失败的测试**

```ts
it('gives one slot to each participant in SS and two passes in DS', () => {
  // N = 2,3,6：SS 得 N，DS 得 2N
})
it('walks every slot of both shapes without a gap and without a repeat', () => {
  // 每个时隙恰好一个 (pass, index)，没有重复没有遗漏
})
it('orders participants by id, not by the order the scenario lists them', () => {
  // 同一组节点两种列举顺序，得到同一份名单
})
it('leaves every other mode slot-for-slot identical to today', () => {})
```

- [ ] 五步同上 + fixture 零 diff

---

### Task 4: 设备与网络 —— 一次发送干两份活

**Files:** Modify `src/uwb/device.ts`（或新建 `src/uwb/device.m2m.ts`，
按 `device.tdoa.ts`/`device.mms.ts` 的先例——**文件超过 900 行就该拆**）、
`src/uwb/network.ts`；Test `tests/uwb/m2m-round.test.ts`

**Interfaces:** Consumes Task 1–3 的一切。

三件事：

1. **每个参与者在自己的时隙发一帧**，带自己的发送时刻与它已经收到的接收时刻。
2. **收到后面那个人的帧时算距离**（规格 §2）：i 用 `T_i(i)`、`T_i(j)` 与帧里带来的
   `T_j(j)`、`T_j(i)`，走 `ssTwrCorrected`。DS 走 `dsTwr`，四个量在第 2 趟齐。
3. **听不到就没有**（规格 §6）：少一个接收时刻就少一条距离，不是错误路径。

- [ ] **Step 1: 先写失败的测试** —— 这六条就是验收，全部**跑完整轮读记录**：

```ts
it('measures every pair in N slots where one-to-many needs N squared', () => {
  // 同一组 N 台设备，两种方案各数 UWB_RANGE 与时隙数；比值恰为 N。N = 3,4,6
})
it('gets every distance right', () => {
  // 每条对上几何真值，误差在噪声之内
})
it('gives participant i exactly N-1-i ranges, because only the earlier one can compute', () => {
  // 读记录的 node 字段，对上规格 §2
})
it('needs two passes for DS and is more accurate than SS when the crystals differ', () => {
  // 2N 个时隙，同样多的距离；ppm 拉开时 DS 更接近真值
})
it('loses exactly the pairs it could not hear', () => {
  // 一台设备移到墙后，少掉的条数与预期一致
})
it('is deterministic, and every other mode is byte-identical', () => {})
```

**Step 2 的注意**：第一条若以「没有记录」失败，说明轮没跑到出数那一步——
先把轮修对，不要去修一个看不见的东西。上一刀有两个功能看着做完了其实什么都没做，
只有跑完整轮才看得出来。

- [ ] **Step 2: 确认失败** · **Step 3: 实现** · **Step 4: 全过**
- [ ] **Step 5: 全量 + fixture 零 diff** · **Step 6: 提交**

---

### Task 5: 编辑器、指南与词汇表

**Files:** `src/uwb/ui/UwbSessionFields.tsx`、`src/uwb/ui/UwbNodeFields.tsx`、
`src/editor/planOps.ts`、`src/editor/EditorGuide.tsx`、`src/ui/Guide.tsx`、
`src/ui/i18n.ts`、`src/ui/glossary.ts`、`src/uwb/scene.ts`、`src/uwb/view.ts`

模式下拉多一项。**`m2m` 下角色字段要说清它不影响测距**（规格 §5：
它只影响怎么画），否则读者会以为自己选错了。

`Guide.tsx` 加一节：规格 §1 那张时隙表与 §2「谁算得出来」。
词汇表加：多对多测距、参与者名单、以及那个 N 倍。每条带出处标记。

**指南与词汇表里每个测得的数，测试要当场跑出来再比**，不许只做字符串比对——
上一刀为此改过一次（Ruling 17）。

- [ ] 五步同上 + fixture 零 diff

---

### Task 6: 课

**Files:** Create `src/course/uwb/uwb-m2m.ts`（必要时第二门讲 DS 的）；
注册进 `lessons.ts` 与 `COURSE_ORDER`（放在 `uwb-contention` 之后）；
`curriculum.ts` 的模块与 `basis`；fixture **只增行**

**`uwb-m2m`「一次发送，同时是问也是答」** —— 规格 §1 与 §2 是骨架。
N 倍那个数要在课里**跑出来**，不是写出来。图：一轮 N 个时隙，
每个时隙对后面是问、对前面是答（`timing`）。

`basis` 是**已发布标准** IEEE Std 802.15.4-2024 §10.32.6/§10.32.7，不是草案。
和切片 1 的两课一样，是少数完全不依赖草案的 UWB 课。

`limits` 必填，2–5 条，**每条对着引擎核过**。已知该说的：
参与者顺序按 id 排是本仿真器的决定（标准让排定表决定，而这里没有排定表可商量）；
IE 的控制位只建长度不建布局；多对多的安全（§10.31/§10.33）不建；
**§10.32.8 的 SP3 分组测距不在范围内，而且理由是举证不足不是范围决定**——
仓库只抽了已发布标准的目录，SP3 分组测距的机理无从建立（规格 §7）。

- [ ] **Step 1: 写课** · **Step 2: 课程契约测试全过**
- [ ] **Step 3: 生成 fixture 行**，`git diff tests/fixtures/` **逐行确认只有新增**
- [ ] **Step 4: 全量全绿** · **Step 5: 提交**
