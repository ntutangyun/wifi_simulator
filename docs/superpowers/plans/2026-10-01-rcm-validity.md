# RCM 有效轮次与 RMNR 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建 ARC IE 的 RCM Validity Rounds（标准 §10.32.9.1）与 §10.34 的
测距消息未收到交互（RMNR IE），让「一条控制消息管好几轮」买到的空口时间
与「没收到的那一方怎么说话」都能跑出来。

**Architecture:** 一条 RCM 管 R 轮，于是一个块里的轮次分两种——带控制内容的那一轮，
和只有启动消息的其余 R−1 轮。RMNR 只在后者里有意义，这是它的前提而不是它的附属。
`src/uwb/ranging.ts` 的算术一行不改。

**Spec:** `docs/superpowers/specs/2026-10-01-rcm-validity-design.md`

## Global Constraints

- **既有场景逐字节不变。** `rcmValidityRounds` 缺省 1、`rmnr` 缺省 false；
  `tests/fixtures/lesson-hashes.json` 与 `uwb-record-hashes.json` 零 diff，
  **绝不运行 `UPDATE_HASHES=1`**（最后一个任务生成新课的 fixture 行时除外，
  且那时**只允许新增**）。
- **`src/uwb/ranging.ts` 一行都不改。** 这一刀改的是控制开销与"谁说了话"，不是测量。
- **不许把标准正文抄进仓库。** 条号、字段名与数值可以；句子不可以。
- **跑完整轮、读它的输出，一个功能才算建模完成。** 算术测试替代不了。
- 每个常量带出处标记（`standard §x` / `model`）。
- 中文课文与中文校验消息，全角标点（，：）。消息要给**理由**，不许写「暂不支持」。
- 提交信息以下列两行结尾：
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`

### 前两刀付过代价的四条纪律，逐条适用

- **类型检查器才是「一个联合类型欠了哪些账」的索引，grep 只是猜。** `FrameKind` 要扩宽；
  扩完跑 `npx tsc -b`，让它把欠账列出来。切片 2 靠 grep 漏了三张表，其中一张是
  `src/ui/laneLayout.ts` 的提示文字链——**它没有报错的 default 分支，会静默掉到
  CTS 标签上**。
- **非空断言不是运行时检查。** 切片 1 为此付过一条全是 NaN 的 `UWB_RANGE` 记录，
  而且没有任何异常。值可能不在就分支，不要断言掉。
- **一个数只靠字符串比对来守，它已经是 bug 了。** 课文与指南里每个测得的数，
  测试要当场跑出来再比。
- **先怀疑尺子。** 这条分支上九次「测量结果反常」全都是量它的工具错了：参数位置、
  取整的除数、搜索式、参数形状、写错字段的覆盖、两倍块长的时间窗、放不下的图注、
  1σ 当成上限、**没去放着正文的那个目录看**。报告任何东西缺失或无效之前，
  先把签名、常数、窗口或查询路径再读一遍，并在报告里写清你用什么量的。

---

### Task 1: 帧内容与帧长

**Files:** Modify `src/uwb/phy.ts`、`src/uwb/frames.ts`、`src/uwb/frameFields.ts`、
`src/model/frames.ts`；Test `tests/uwb/rmnr-frames.test.ts`

**Interfaces:**
- Produces：`uwbInitBytes(anchors)`（只有启动内容的那种消息）；
  `RMNR_IE_BYTES`；`uwbRmnrBytes()`；`makeInit(...)`；`makeRmnr(...)`；
  `'uwbRmnr'` 加进 `FRAME_KINDS`。
- Consumes：无。

两件事：

1. **只有启动消息的那一种**（规格 §2）：没有 ARC，没有 RDM，于是
   `MHR + RRMC + FCS` = 14 个字节，**与锚点数无关**。今天的 Poll 是 27 + 3A，
   所以每轮省 `13 + 3A`。`makePoll` 不要改签名去兼容两者——
   **两种消息内容不同，给它自己的构造函数**，理由与切片 1 的延后报文相同。
2. **RMNR 帧**：RMNR IE **没有 Content 字段**（标准 §10.34.2.1），所以它就是一个
   IE 头部，`UWB_IE_HDR_BYTES` = 2。整帧 `MHR + 2 + FCS`。
   **`'uwbRmnr'` 要有自己的 `FrameKind`**：这一课的全部要点是「它出现在本该是
   响应的地方」，时间线把它标成别的东西就把那一点抹掉了。

- [ ] **Step 1: 先写失败的测试**

```ts
it('the initiation-only message does not grow with the anchor count', () => {
  for (const a of [1, 4, 9]) expect(uwbInitBytes(a)).toBe(14)
  expect(uwbPollBytes(4)).toBe(39) // 今天的值，不许变
})
it('an RMNR frame is a header-only IE and nothing else', () => {
  // RMNR_IE_BYTES === UWB_IE_HDR_BYTES；整帧 = MHR + 2 + FCS；ies 恰为 ['RMNR']
})
it('says what the first round saves against the ones after it', () => {
  // uwbPollBytes(a) - uwbInitBytes(a) === 13 + 3a，对 a = 1,4,9
})
it('leaves every existing frame byte-identical', () => {
  // Poll / Resp / Final / Report / blink / m2m 逐字段比对
})
```

- [ ] **Step 2: 跑测试，确认失败**
- [ ] **Step 3: 实现**（`frameFields.ts` 要能解码两者；`FRAME_KINDS` 扩宽之后
      **跑 `npx tsc -b`**，把它列出来的每一张表都填上，并且**手动检查
      `src/ui/laneLayout.ts` 的 `spanTooltip` 三元链**——它不会报错）
- [ ] **Step 4: 全过** · **Step 5: 全量 + fixture 零 diff** · **Step 6: 提交**

---

### Task 2: 会话配置与那条讲道理的拒绝规则

**Files:** Modify `src/model/scenario.ts`；Test `tests/model/rcm-validity-scenario.test.ts`

**Interfaces:**
- Consumes：Task 1。
- Produces：`UwbSessionCfg.rcmValidityRounds`、`UwbSessionCfg.rmnr`。

`rcmValidityRounds` 取 1…64（标准的字段是 6 位，本仿真器按「管几轮」计数，
所以 1 就是今天的行为），缺省 **1**；`rmnr` 缺省 **false**。两个都要有缺省值，
否则既有场景读不回来。

**那条规则**（规格 §4）：`rmnr` 为 true 而 `rcmValidityRounds` 为 1 时**拒绝**。
消息里要把因果说出来——每轮一条 RCM 时，没收到 Poll 的响应方**连自己的时隙都不知道**，
它发不出 RMNR，所以那个状态不存在。**这是本刀唯一一条「拒绝是为了讲清一个道理」
的规则，措辞值得花时间。**

还有两条必写：**不写这两个字段时解析通过且取缺省值**；
**schema 能解析自己的输出**（切片 1 的 Ruling 4 就是漏了这条踩的雷，
见 `.superpowers/sdd/2026-09-27-fading/progress.md`）。

与既有模式的组合要想清楚并各写一条：`mode` 为 `dl-tdoa`/`ul-tdoa`/`mms`/`m2m` 时，
`rcmValidityRounds` 与 `rmnr` 各意味着什么——**由实现者判断并在报告里论证**，
不相容就拒绝并说理由，**不要默默忽略**。（提示：DL-TDoA 一个块只有一轮，
UL-TDoA 只有一个闪发时隙。）

- [ ] 五步同上 + fixture 零 diff

---

### Task 3: 哪一轮带控制内容

**Files:** Modify `src/uwb/session.ts`、必要时 `src/uwb/phy.ts`；
Test `tests/uwb/rcm-validity-schedule.test.ts`

**Interfaces:**
- Consumes：Task 1、Task 2。
- Produces：`RoundPlan.rcmValidityRounds`；一个判据
  `roundCarriesRcm(plan, round)`（或等价物），**只在这里判一次**。

和 `mms`/`replyTime` 同样的理由：一轮的两端必须读同一个判据，设备自己再算一遍
就是再有一次机会算歧。时隙表本身不变——变的只是时隙 0 里放哪一种消息。

- [ ] **Step 1: 先写失败的测试**

```ts
it('carries the control content on the first round of every R, and only there', () => {
  // R = 1,2,4：块里每一轮都问一次，第 0、R、2R… 轮为 true
})
it('leaves the slot table itself unchanged', () => {
  // 对每个 R，slotAction 的结果与 R = 1 时逐格相同
})
it('is byte-identical to today when R is 1', () => {})
```

- [ ] 五步同上 + fixture 零 diff

---

### Task 4: 设备与网络 —— 省掉的开销，和取代沉默的那一帧

**Files:** Modify `src/uwb/device.ts`、`src/uwb/network.ts`；
Test `tests/uwb/rmnr-round.test.ts`

**Interfaces:** Consumes Task 1–3 的一切。

三件事：

1. **第一轮之外发 `makeInit`**，不带 ARC/RDM。响应方的时隙表来自仍然有效的那条
   RCM，所以它**不需要**重新知道（规格 §2.1）——不要为此发明新字段，
   块号与轮号已经在每一帧上。
2. **响应方持有有效 RCM、却没收到本轮启动消息时发 RMNR**，而不是沉默。
   「持有有效 RCM」这个状态要存在设备上，而且**跨轮存活**——
   这是本刀唯一一处设备状态活过一轮的地方，注释要说明为什么。
3. **发起方要能把「没听到」与别的原因分开**（规格 §3.1）：今天一轮丢帧只留一条
   `UWB_TIMEOUT`，发起方分不出「这个锚点没听到」「听到了但回答丢了」「它不在了」。
   收到 RMNR 之后它知道第一种。**记录类型要能表达这件事**，这样课程能 `watch` 它。

- [ ] **Step 1: 先写失败的测试** —— 这六条就是验收，全部**跑完整轮读记录**：

```ts
it('saves 3 × (13 + 3A) octets a block at R = 4, and measures the same distances', () => {
  // 读时间线里每帧的字节数；UWB_RANGE 逐字段与 R = 1 时相同
})
it('sends no RDM after the first round of each R', () => {
  // 读 ies
})
it('turns one anchor silence into something the initiator can name', () => {
  // 一台锚点移到墙后：rmnr 关闭时只有 UWB_TIMEOUT；打开时有 RMNR 记录
})
it('still ranges with every anchor that did hear the initiation', () => {
  // 丢一个不该连带丢别人
})
it('does not send RMNR from a device that never held the RCM', () => {
  // 第一轮就没听到 RCM 的设备不知道自己的时隙，它必须保持沉默
})
it('is deterministic, and every other mode is byte-identical', () => {})
```

**第五条是这一刀的物理底线**，不是边界情况：一个从未收到 RCM 的设备**不知道自己
该在哪个时隙发言**，它发 RMNR 就是在别人的时隙里发言。

**Step 2 的注意**：第一条若以「没有记录」失败，说明轮没跑到出数那一步——
先把轮修对。前两刀各有一个功能看着做完了其实什么都没做，只有跑完整轮才看得出来。

- [ ] **Step 2: 确认失败** · **Step 3: 实现** · **Step 4: 全过**
- [ ] **Step 5: 全量 + fixture 零 diff** · **Step 6: 提交**

---

### Task 5: 编辑器、指南与词汇表

**Files:** `src/uwb/ui/UwbSessionFields.tsx`、`src/editor/planOps.ts`、
`src/editor/EditorGuide.tsx`、`src/ui/Guide.tsx`、`src/ui/i18n.ts`、`src/ui/glossary.ts`

一个数字框（`rcmValidityRounds`）加一个开关（`rmnr`），按该文件既有的置灰与红字写法。
**`rmnr` 在 `rcmValidityRounds` 为 1 时要置灰**，并把规格 §4 那条因果写进提示里——
这是编辑器里少有的「置灰本身在教一件事」的地方。

`Guide.tsx` 加一节：规格 §2 那张两种轮次的表，与 §3 那张「一个零内容的 IE 携带
三条信息」的表。词汇表加：RCM 有效轮次、RMNR。每条带出处标记。

**指南里每个测得的数，测试要当场跑出来再比**，不许只做字符串比对（切片 1 的
Ruling 17 为此改过一次）。

- [ ] 五步同上 + fixture 零 diff

---

### Task 6: 课

**Files:** Create `src/course/uwb/uwb-rcm-validity.ts`；注册进 `lessons.ts` 与
`COURSE_ORDER`（放在 `uwb-m2m` 之后）；`curriculum.ts` 的模块与 `basis`；
fixture **只增行**

**`uwb-rcm-validity`「一个零内容的信息单元，不是一条空消息」** ——
规格 §1 与 §3 是骨架，而 §1 那条**前提**比机制本身更该先讲：
RMNR 之所以需要「一条 RCM 管好几轮」，是因为一个连控制消息都没收到的响应方
**不知道自己该在哪个时隙开口**。先讲清这个，再讲那个空 IE 怎么用「谁、在哪、
本该发什么却发了这个」携带三条信息。

图：一个块里两种轮次的时隙表（`timing`），第一轮带控制内容、其余只有启动消息。

`basis` 是**已发布标准** IEEE Std 802.15.4-2024 §10.32.9.1 与 §10.34，不是草案。
和前两刀的三课一样，是少数完全不依赖草案的 UWB 课。

`limits` 必填，2–5 条，**每条对着引擎核过**。已知该说的：没有 MCPS 原语，
所以这两个都是场景配置而不是空口协商的结果；ARC IE 的其余控制位只建长度不建布局；
**§10.35 的辅助信息交换与 §10.36 的多消息收妥确认排在后面一刀**，
而且理由是切片大小，**不是举证不足**——那两节的机理已经读通了
（上一刀在这个区别上写错过一次，见 `docs/uwb-feature-coverage.md` 的冲突第 4 条）。

- [ ] **Step 1: 写课** · **Step 2: 课程契约测试全过**
- [ ] **Step 3: 生成 fixture 行**，`git diff tests/fixtures/` **逐行确认只有新增**
- [ ] **Step 4: 全量全绿** · **Step 5: 提交**
