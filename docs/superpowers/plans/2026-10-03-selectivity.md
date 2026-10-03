# 频率选择性（切片 4a）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给解调判决一个按 26 音调资源单元分格的信噪比，格数由标准算出来，
格内偏差复用既有的小尺度衰落，合成用容量；并把 `width` 那条 `limits` 的方向**改过来**。

**Architecture:** 一个结构体字段加两个纯函数。爆炸半径是 `resolveLock` 那 15 行——
CCA、前导检测、捕获、速率选择全部保持标量，**`linkTable` 不需要频率维度**。
格内偏差复用 `fading.ts` 的 `smallScaleDb`，key 加一个格号，**一个新常数都不加**。

**Spec:** `docs/superpowers/specs/2026-10-03-selectivity-design.md`

## Global Constraints

- **既有场景逐字节不变。** `selectivity` 小节**缺省不存在**；两份 fixture 零 diff，
  **绝不运行 `UPDATE_HASHES=1`**（最后一个任务生成新课的行时除外，且那时**只允许新增**）。
- **不许发明数字。** 这一刀过得了这条准则，而且它是规格的核心论证：
  格数、格宽、ΔSNR 的范围全部来自标准条号；格内分布与 K 因子来自**既有的** `fading`；
  合成用容量，因为容量**不需要任何常数**。**EESM 的逐 MCS β 是真正需要发明的那个数，
  所以 EESM 标 `out-of-scope`，理由是举证。**
- 每个常量带出处标记：`standard §x` / `standard be Table 36-18` / `physics` / `model`。
  上限与格数**算出来**，不写字面量。
- **不许把标准正文抄进仓库。** 条号、字段名、数值可以；句子不可以。
- 中文课文与中文校验消息，全角标点（，：），拒绝消息要给**理由**。
  官方术语首次出现带英文名与缩写。注释用英文，密度随各文件。
- **用词守 `docs/course-wording-contract.md`。** 与「代价」有关的禁用词容易撞：
  **更贵、账、买到、省钱、白费、值钱、定死、说了算、惩罚**。
  另外**不要把被禁的说法当反例原样引用**——断言它不出现的测试分不清引用和主张。
- **每次提交前跑 `tsc -b --force`，不只跑 vitest。** 本分支有过「vitest 绿、带着
  类型错误提交」，也有过「因为参数进错了位置而以错误理由通过」的测试。
- **提交必须带显式路径**；不用裸 `git commit`、`--amend`、`-a`、`git reset`。
  用 `git commit -F <file> -- <paths>`。要搁置工作优先用临时提交；若必须 stash，
  打唯一标签、用 `git stash apply <sha>` 恢复、**收工前删掉**（共享栈，今天留过两个）。
- 提交信息以下列两行结尾：
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_016HUme5YXCB8DTeScyfn7pL`

### 这条分支付过代价的纪律

- **一个被允许却可证明无效果的配置，正是一个特性看起来做完了的方式。** 已出过三次。
  规格 §6 点名了七条，**Task 5 整个任务只做这件事**。
- **先怀疑尺子**，二十次了，而最近几次坏的是**核验方法**：先提交再 stash 什么也证明不了；
  `cmd | head; echo $?` 取的是 `head` 的退出码；右开区间会漏掉正好落在区间末端的记录；
  一个在 A 场景量出来的数不能直接写进 B 场景的课文。
- **一个特性没跑完整轮并读过输出，就不算建成。**
- **扫接口的调用方，不是任务的文件清单。**
- **非空断言不是运行时检查。**

---

### Task 1: 格的几何，以及标准自己那个 4 比特字段的自检

**Files:** Create `src/engine/selectivity.ts`；Modify `src/engine/fading.ts`；
Test `tests/engine/selectivity.test.ts`

**Produces:** `RU26_TONES`、`RU26_PER_20MHZ`、`DF_EHT_KHZ`、`selBinWidthMhz()`、
`selBins(widthMhz)`；`smallScaleDb` 的 key 加格号那一路。

- [ ] **Step 1: 先写失败的测试**

```ts
it('derives the bin count and width from the standard, never a literal', () => {
  expect([20, 40, 80, 160, 320].map(selBins)).toEqual([9, 18, 36, 72, 144])
  expect(selBinWidthMhz()).toBeCloseTo(2.03125, 5)
  // 把 DF_EHT_KHZ 换成 pre-EHT 的 312.5，格宽要变成 8.125 —— 证明它真的是算的
})
it('checks itself against the standard’s own 4-bit deviation field', () => {
  // 四万次抽取：rayleigh 落在 [−8, +7] dB 之外 15.3%，rician(K=6) 3.3%
})
```

**第二条是这一刀「caps are computed」最硬的一处**：它把「选哪个分布」从口味
变成了一个对着条号的百分比。**两个数都要断言。**

- [ ] **Step 2: 确认失败** · **Step 3: 实现** · **Step 4: 全过**
- [ ] **Step 5: 全量 + fixture 零 diff** · **Step 6: 提交（显式路径）**

**报告里必须有**：五个格数、格宽、两个百分比，以及**你用什么量的**。
并说明**为什么取 26 音调而不是 Ng**——规格 §3.1 给了三条理由，
**三条都要写进代码注释，因为这是一处有两个标准答案的选择。**

---

### Task 2: 合成，以及 Wi-Fi 记录流里第一个电平字段

**Files:** Modify `src/engine/selectivity.ts`、`src/model/records.ts`、`src/ui/view.ts`；
Test 扩 `tests/engine/selectivity.test.ts`

**Produces:** `selEffSinrDb(meanSinrDb, devsDb)`（容量平均，标 `physics`）；
`WIFI_SEL` 记录（字段见规格 §3.5）。

- [ ] **Step 1: 先写失败的测试** —— 这一条就是拒绝「取最差格」的全部依据：

```ts
it('combines by capacity, and that is an order of magnitude from the worst bin', () => {
  // 同一组抽取、320 MHz / 144 格：最深那一格平均 24.09 dB，
  // 而 selEffSinrDb 的损失中位数 2.36 dB —— 两个数一起断言
})
```

**取最差格等于宣布 320 MHz 的链路比 20 MHz 差 12 dB**，那是把「OFDM 跨整条信道编码」
整个删掉。**而那正是 `width` 那条 limits 预告的方向，所以这个取法要被点名拒绝**，
在注释里写明。

**容量的代价要写进注释**：真实接收机达不到容量，所以本模型给出的是频率选择性
**最小**的那份损失，而那个差值就是我们拒绝发明的 EESM 的 β。

- [ ] 五步同上 + fixture 零 diff。**新记录类型要让 `view.ts` 那条扫全集的测试先红**，
      再加 case，**并用变异确认它真的会红**。

---

### Task 3: 开关与三条拒绝

**Files:** Modify `src/model/scenario.ts`；Test `tests/model/selectivity-scenario.test.ts`

`Scenario.selectivity`：**缺省不存在**（不是一个填了 false 的字段），
照 `fading` 已立的规矩——`src/model/scenario.ts` 那段「默认在字段上，永不在小节上」
的注释讲得很清楚，照抄。**格数不可配**：一个可配的格数就是一个发明出来的数。

**三条拒绝**（规格 §6 上半张表），每条中文消息**要给理由**：
没有 `fading` 小节、`fading.smallScale: 'none'`、场景里没有任何 `eht`/`he`/`vht` 链路。
前两条若不拒，就是与关掉**逐字节相同**的空配置。

**收工前把新字段与既有字段的每种组合探一遍**，确认没有哪一条拒绝的补救被另一条禁止。

**两条必写**：不写这个小节时解析通过；**schema 能解析自己的输出**。

- [ ] 五步同上 + fixture 零 diff

**报告里必须有**：你扫出来的、后面任务要复位或钳制的每一个点位（扫调用方，不要抄清单）。

---

### Task 4: 接进 `resolveLock`，并把 AMP 两类帧留在原路

**Files:** Modify `src/engine/channel.ts`（`resolveLock`）、`src/engine/propagation.ts` 按需；
Test `tests/engine/selectivity-round.test.ts`

**只对 OFDM Wi-Fi PPDU 走逐格那一路。** `resolveLock` 同时服务反向散射回复与
`frame.amp?.dir === 'ul'` 的 OOK 帧——**这两类不是 OFDM，26 音调资源单元在它们身上
没有意义**，而反向散射的地板是读写器自己的泄漏，不是热噪声。**它们走原路。**

- [ ] **Step 1: 先写失败的测试** —— 这四条是验收，全部**跑完整轮读记录**：

```ts
it('drops fewer frames as the channel widens, measured from real rounds', () => {
  // 五个带宽各跑一轮，读 RX_FAIL(reason:'lowSinr') 条数：严格单调下降
  // —— 这一条是改 width 那条 limits 的唯一依据；不单调，这份规格就是错的
})
it('moves the MCS on the timeline, not a counter', () => {
  // 同一轮读 TX_START.frame.mcs：关着时是定值，开着时在几级之间走，
  // 而每次下降之前恰好有两次连续 RX_FAIL
})
it('leaves the backscatter path field-for-field identical', () => {})
it('does not enter the per-bin branch when the section is absent', () => {
  // 覆盖「没有进入那条分支」，而不是只看结果相同
})
```

- [ ] 五步同上 + fixture 零 diff

---

### Task 5: 规格 §6 那七条，每条一个证明

**Files:** Test `tests/engine/selectivity-inert.test.ts`（新）；按需 Modify `src/model/scenario.ts`

**这一整个任务只做一件事：证明每一个被允许的组合都不是空的。**
规格 §6 下半点名了四条 schema 拒不掉的，加上那条「两边都还在动」的，逐条证：

1. **反向散射与 AMP 上行帧**：开/关两轮，`AMP_BS_REPLY` 与 `AMP_BS_BOOT` **逐字段相同**，
   且 `WIFI_SEL` 里没有一条的 `from` 是标签。**分不开，AMP 那两份 fixture 就会无声地动。**
2. **链路余量够大的场景**：断言 `WIFI_SEL` **有记录**且 `lossDb > 0`，
   同时 `RX_FAIL` 条数与关着时相同。**「有量、无后果」要被明示地钉住。**
3. **`widthMhz: 20` 的单格近似**：五个带宽各跑一轮，`RX_FAIL` 严格单调下降。
   **这是效果最大的那一档，不是没用的那一档。**
4. **多用户帧**：断言 `WIFI_SEL.bins` 等于**整条信道**的格数而不是该成员那一份——
   **一个被高估的量要被断言成它现在的样子，而不是被当成对的。**
5. **`selectivity` + `fading.shadowSigmaDb > 0`**：`meanSinrDb` 在相干区间之间跳变，
   而 `lossDb` 的分布在区间内外一致。

**先红不可能**（这些钉的是前面任务已建的行为）。**那就用变异**：
一次改 `src/` 一行，记下每条测试被哪一次变异杀掉；**有变异一条都杀不掉的，
先判断是测试有洞还是尺子坏了**，并把结论写进报告。

- [ ] 五步同上 + fixture 零 diff

**报告里要逐条说你怎么证的，以及有没有哪一条证不出来——证不出来就是一个发现。**

---

### Task 6: 五条 `limits`，其中一条要改方向

**Files:** `src/course/tier1/radio-primer.ts`、`decode-thresholds.ts`、`mcs-ladder.ts`、
`noise-floor.ts`、`src/course/tier2/width.ts`，以及它们的测试

规格 §5 逐条点名了这五条、给了行号、并写了每条之后该说什么。
**`width` 那一条是这一刀的题目，而且它要改方向**——它现在预告的是
「信道越宽，越常有一部分是死的」，而跑出来掉帧率是**单调下降**的。

**每条改动都在那一课自己的测试里钉住**：新说法 `toContain`、旧说法 `not.toContain`，
照 `uwb-rcm-validity` 已有的先例。

**`ofdma-dl` 与 `ofdma-ul` 各加一条 `out-of-scope`**（多用户成员拿到整条信道的格数，
分集被高估），指向切片 4b。

**`limits` 在 `mainPathChars` 之外**，所以各课的时长不该动——**核一遍，不要假设**。

- [ ] 五步同上 + fixture 零 diff

---

### Task 7: 课

**Files:** Create `src/course/tier2/selectivity.ts`；注册进 `lessons.ts` 与 `COURSE_ORDER`
（**`width` 与 `streams` 之间**）；`curriculum.ts` 的模块与 `basis`；fixture **只增行**

**`selectivity`《一部分死掉，和这一帧死掉，是两回事》** —— 规格 §10 是骨架。

**一句话结论**：给整条信道一个电平，演不出「一部分深衰」；按标准自己的 26 音调资源
单元分格之后，**跑出来的结果与预告相反**——最深那个坑随带宽每翻一倍深约 3 dB
（12.05 → 24.09 dB），而掉帧率随带宽**单调下降**（34.43% → 7.14%），因为编码跨整条
信道，坑越多越摊得开。**宽信道真正的代价是那 12.04 dB 的噪声地板，频率选择性是
往回赚的那一边。** 三个数全部由测试跑出来。

课文还要顺带回答三件：为什么标准要为**每一个**资源单元回报一个信噪比而不是整条一个；
为什么那个逐子载波偏差字段**只给 4 比特就够**（莱斯 K=6 有 96.7% 落在 −8…+7 dB 里）；
以及为什么把信道切成资源单元要付一笔课程至今没算过的账（指向切片 4b）。

`limits` 四条，**每条对着引擎核过**：`model-value`（分布与 K 因子来自既有的 `fading`）、
`unmodelled`（格间相关长度没有取值，本刀取独立，而独立是分集偏多的那一边）、
`threshold`（容量是上界，所以这里给的是选择性损失的**下界**，而那个差值就是我们
拒绝发明的 EESM 的 β）、`out-of-scope`（CCA／前导检测／捕获仍走均值；多用户成员的
格数被高估）。

**课文与新课都要过 `wording.test.ts` 与 `readability.test.ts`**，两条都没有豁免名单。
**首次出现规则是位置性的**：括号要在首次使用处 40 字以内，不是在 `sources` 里。
**不要用字符串存在比对去探它**，让测试自己打印失败数组。

- [ ] **Step 1: 写课** · **Step 2: 两条测试全过**
- [ ] **Step 3: 生成 fixture 行**，逐行确认只有新增
- [ ] **Step 4: 全量全绿** · **Step 5: 提交（显式路径）**
