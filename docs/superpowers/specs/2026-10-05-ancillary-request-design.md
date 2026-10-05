# 测距辅助信息 Request = 1：排程能不能被请求改变

2026-10-05。已发布标准 §10.35.1 与 §10.35.2.1（RAICT IE，Figure 10-271）。
`docs/uwb-modellable-backlog.md` 的切片 3d（进度表第 41 行，正文在第 157 行起那一节）。
前一半（Request = 0）的规格是 `docs/superpowers/specs/2026-10-02-ancillary-design.md`，已落地，课是 `@uwb-ancillary`。

**结论先写在前面：建议批，但要先改 3c 留下的一个上限，而且课不许落在 `uwb-ancillary` 里。**
理由在 §7，三条前置条件在 §7.4。立案时的两条风险判断（「要动所有模式共用的 `RoundPlan`」
「要让一个请求改变后续排程就得把轮的排布变成每块重算一次」）**查完代码之后都不成立**，§1 给出推翻它们的测量。

本文每个数后面都带它是怎么量出来的。探针放在 scratchpad，用
`npx vite-node --root <worktree> <文件>` 跑；凡是写「量过」的，命令都在那一段里。

**一条关于这份规格自己的话。** 2026-10-05 的文档改动把切片 5b 判成「范围决定：不建」，
于是 **3d 是 UWB 这边表上剩下的最后一刀**。这件事在 §7.3 里单独处理：
**它不是一条批准的理由**，而且本规格给出「该做」的结论与这件事无关——§7.1/§7.2 的两套判据
是在知道这件事之前就量完的。

---

## 1. 立案时的风险判断是错的，而错在两处

backlog 第 41 行与 `@uwb-ancillary` 那条 `out-of-scope` 限制（`src/course/uwb/uwb-ancillary.ts:377`）
都写着同一句话：

> 本引擎的轮排布在会话构造时一次算定、整场共用（`uwb/network.ts` 的构造函数里调一次 `roundPlan`），
> 要让一个请求改变后续排程，就得把轮的排布变成每块重算一次，而那是多对多、下行到达时间差、
> 多毫秒片段全都共用的结构。

**前半句是真的**：`roundPlan` 在 `UwbNetwork` 的构造函数里只调一次（`src/uwb/network.ts:82`），
`this.plan`（:82）是整场会话唯一的一个 `RoundPlan`。
**后半句是假的，而且是两重的假。**

### 1.1 每块重算的接缝已经在了——切片 3b 与 3c 自己建的

`src/uwb/session.ts` 里有三个**已经带块号**的函数，它们正是「轮的排布每块重算一次」：

| 函数 | 行 | 随块变的是什么 |
| --- | --- | --- |
| `blockSlots(plan, block)` | 491 | 这一块的轮有几个时隙：`plan.slots` 加 `mmrcr` 的那批，加辅助消息的那批 |
| `blockSlotStartNs(p, block, round, slot)` | 515 | 轮的步幅按 `blockSlots(p, block)` 走，不按 `p.roundNs` |
| `blockSlotAction(plan, block, slot)` | 558 | `plan.slots` 以下与 `slotAction` 逐格相同，以上按块号给出追加时隙的归属 |

`plan.slots` 本身不随块变，而**它也不需要变**：辅助信息的时隙是**追加**在测距阶段之后的，
`blockSlots` 的 docblock 自己把这件事写明了（`plan.slots`, **plus** the window-closing MMRCM slots …,
**plus** the ancillary message's own slots）。
所以这一刀要改的不是「轮的排布」，是**追加那一批有多宽**。

**量出来的现状**（探针 `scratchpad/probe1.ts`：对 `uwbAncillaryScenario()` 的四个场景各调
`roundPlan`，再对块 0…7 调 `blockSlots`）：

| 场景 | `plan.slots` | `ancillarySlots` | `blockSlots` 块 0…7 |
| --- | --- | --- | --- |
| 基础（time, R = 1, frames = 4） | 5 | 4 | 9,9,9,9,9,9,9,9 |
| 竞争式（contention） | 9 | 8 | 17,17,17,17,17,17,17,17 |
| 窗口 R = 4 | 5 | 4 | **9,5,5,5,9,5,5,5** |
| 关掉 | 5 | 0 | 5,5,5,5,5,5,5,5 |

第三行就是「每块重算」已经在跑的证据：同一个 `RoundPlan`，块 0 与块 4 是 9 个时隙，块 1/2/3 是 5 个。

### 1.2 接缝在时间上也已经在了——块是一块一块铺的，不是一次铺完

`UwbNetwork` 的 `startBlock(block)` 在自己的末尾排下一块：
`q.schedule((block + 1) * this.plan.blockNs, () => startBlock(block + 1), 0)`（`src/uwb/network.ts:437`）。
所以**块 b + 1 的时隙表是在 t = (b+1)·blockNs 那一刻才建出来的**，那时块 b 的每一个事件都已经跑完了。

**量出来的余量**（探针 `scratchpad/timing.ts`：跑 `uwbAncillaryScenario()` 到 1300 ms）：
块 0 的最后一条记录在 **18 ms**；块 0 的四帧辅助信息在
10.183291 / 12.183291 / 14.183291 / 16.183291 ms；块 1 在 **200 ms** 铺。
所以从块 0 最后一帧辅助信息到块 1 的时隙表建出来，有 **183.816709 ms** 的余量。
`UWB_ROUND_END` 落在 18, 218, 418, 618, 818, 1018, 1218 ms——每块一条，每条都在下一块铺之前。

**于是这一刀不需要发明任何时序。** 请求在块 b 的辅助窗口里发出，控制器在同一块里读到，
块 b + 1（R = 1）或块 b + R 的时隙表在 183.8 ms 之后才建——那一刻读批复，是现成的。

### 1.3 「多对多、下行、多毫秒共用」这一条也不成立

`ancillary` 在**除 `twr` 之外的每一种模式里都已经被 schema 拒掉了**，四条独立的 `addIssue`：
`dl-tdoa`（`src/model/scenario.ts:2076`）、`ul-tdoa`（:2090）、`mms`（:2098）、`m2m`（:2106）。
`blockCarriesAncillary` 自己再加一道 `plan.mode === 'twr'`（`src/uwb/session.ts:453`），
而它的 docblock 把这件事说成「what makes that refusal a fact this file relies on rather than assumes」。
schema 还拒掉 `ancillary` + `sp3`（:2124）。

所以按构造，这一刀碰不到 m2m / dl-tdoa / ul-tdoa / mms / sp3 任何一条路径。
**真正共用的那部分（`plan.slots`、`slotAction`、`mmsSlotAction`、`sp3ReportAction`、
`m2mParticipants`）一个字都不用动。**

---

## 2. 正文到底说了什么，以及它没说什么

§10.35 的正文自己读过（语料库 `text/802154-2024.json`，§10.35 落在第 527–528 页）。
下面只记条号、字段名与结论，正文句子不抄。

§10.35.1 的最后一句与 §10.35.2.1 一起给出 Request = 1 的全部语义：

- Request 位置 1 表示这个 RAICT IE 是**向控制器要时隙**的；置 0 时是另一件事（3c 做的那一半）。
- Request 置 1 时 **Frames Remaining 字段装的是请求的时隙数**，要求控制器为**下一次交换**排这么多。
- 这一位**只有当辅助信息交换的发起方不是控制器时**才有意义。
- 正文把两种用法并列成「两种不同的用法」，**所以一个 IE 不能同时做两件事**：
  Frames Remaining 这一个字段在两种用法下装的是两个不同的量。

**正文没有说的，这里必须记下来，因为它决定了这一刀有多少是 `model`：**

1. **没有批复、没有拒绝、没有应答。** §10.35 通篇只定义请求本身；控制器收到之后做什么、
   怎么告诉请求方它做了什么、能不能不做——一个字都没有。一台把请求丢掉的控制器是合规的。
   **所以「控制器可以拒绝吗」这个问题，标准的答案是「标准不管」，而本引擎里它必然是 `model`。**
2. **没有说请求方怎么得知结果。** 在本引擎里这一条反而是现成的：
   时隙表由 `UwbNetwork` 铺，两端读的是同一张表（设备从 `onSlot` 收到它那一格），
   所以**批复是不是落地，请求方在下一次交换的窗口宽度上直接看得见**——不需要另一条应答。
   这是本引擎的结构带来的便宜，要在课里点明，否则读者会以为标准里有一条应答。
3. **没有说请求的那一帧坐在哪。** 见 §3.2。

---

## 3. 建什么

### 3.1 一个请求字段，两个它改不了的东西

新增两个会话字段（`UwbSessionCfg`，`src/model/scenario.ts`）：

| 字段 | 类型 | 缺省 | 出处 |
| --- | --- | --- | --- |
| `ancillaryRequest` | `boolean` | `false` | `standard §10.35.2.1`（Request 位） |
| `ancillaryRequestSlots` | `int ≥ 1` | `1` | `standard §10.35.2.1`（Frames Remaining 在 Request = 1 时的含义）／`model`（这个数从哪来） |

`ancillaryRequestSlots` 标 `model` 的理由与 `ancillaryFrames` 的那条**逐字相同**：
本仿真器一条 MAC 原语都没有，没有上层来决定「下一次我要发多长的消息」。
这一条要写进新课的 `limits`，照 `ancillaryFrames` 已有的那条写（`src/course/uwb/uwb-ancillary.ts:365` 那条 `unmodelled`）。

缺省 `false` 是「不配置就什么也不发」，与 3c 的 §5.6 同一条纪律。

### 3.2 请求帧坐在哪：给它自己的一个时隙，不与片段共帧

两条路，选第一条：

- **（选）自己一帧、自己一格。** 时间排程下 `ancillarySlots` 变成 `frames + 1`，
  请求帧坐在窗口的最后一格；它是一帧普通的辅助信息帧，带一个 Request = 1 的 RAICT IE。
  **量过的代价**（探针 `scratchpad/bytes.ts`：调 `raictIeBytes`／`uwbAncillaryBytes`／`uwbPpduNs`）：
  IE 4 字节（`numberPresent: false`、`framesRemainingPresent: true`），整帧 15 字节，
  空口 182 244 ns，坐在 2 000 000 ns 的测距时隙里。
- **（不选）搭在最后一个片段上，同一帧里放第二个 RAICT IE。** 代价更小，
  但它要假设「一帧里可以有两个 RAICT IE」，而正文没有说这件事。
  **本仓库的口径是不发明标准没给的语义**，所以不选；这一条写进新课的 `deeper` 或留在这里即可。

四个存在位组合的字节数与空口时间（同一个探针）：

| numberPresent | framesRemainingPresent | IE 字节 | 整帧字节 | 空口 ns |
| --- | --- | --- | --- | --- |
| false | false | 3 | 14 | 181 218 |
| true | false | 4 | 15 | 182 244 |
| **false** | **true** | **4** | **15** | **182 244** |
| true | true | 5 | 16 | 183 269 |

常数来源：`UWB_MHR_BYTES` = 9、`UWB_IE_HDR_BYTES` = 2、`RAICT_IE_MIN_BYTES` = 3、`UWB_FCS_BYTES` = 2，
全部在 `src/uwb/phy.ts`，标 `model`（3c 的规格已经这样标过）。

请求帧那一行就是 Request = 1 的那一行：`numberPresent: false`（请求不报消息号——它不是一条消息的一部分），
`framesRemainingPresent: true`（那个字段装的就是请求的时隙数）。
**这正好是 3c 已经测过的四种组合里的第三种**，`raictIeBytes` 一个字也不用改。

### 3.3 谁发请求，谁批复

**发请求的是 `ANCILLARY_SENDER_INDEX`（= 0）那个响应方**，也就是 3c 已经选定的那个辅助信息发送端
（`src/uwb/device.ancillary.ts:57`）。它在测距里是响应方、在辅助信息交换里是发起方，而**它不是控制器**
——于是 §10.35.1 那条「只有当发起方不是控制器时这一位才有意义」的条件，
**在本引擎里是构造上成立的，不是一条需要检查的前提**。这一条值得在课里单独点出来：
3c 已经用整篇课文讲了角色反转，而这里是那次反转第一次换来一个具体的权利。

**批复的是标签**，也就是测距的发起方、本交换的接收方、本会话的控制器。
它在自己的 `onAncillaryRx`（`src/uwb/device.ancillary.ts:234`）那条路径上读到 Request = 1 的那一帧，
把批复的宽度存进自己的设备状态。

**网络在铺下一块时去问它**：`startBlock(block)` 里 `this.devices.get(tagId)!.ancillaryGrant()`。
用**拉**而不是**推**，理由是 `endRound` 的返回值已经被竞争式的「听到了谁」占着
（`src/uwb/network.ts:391`：`const heard = new Set(this.devices.get(tagId)!.endRound(false))`），
把批复挂上去会让一个返回值承担两件事。
拉的时刻是现成的：§1.2 量过，块 b 的最后一件事与块 b+1 铺表之间有 183.8 ms。

### 3.4 批复改变什么：下一次交换的**消息长度**，不只是窗口宽度

**这是整份规格最容易交出一个空转配置的地方，所以写清楚。**

如果批复只改**窗口宽度**，而消息仍然是 `ancillaryFrames` 帧，那么批到的多余时隙全是空的：
排程变长了，空口上的消息一个字节也没变。**读者会问「请求买到了什么」，而正确答案是「什么也没买到」。**
按 `docs/inert-config-contract.md` 的判据，那是一个「打开它之后记录流只变时刻、不变内容」的配置，
而它的内容本该变。

所以：**批到的时隙数就是下一次交换的消息帧数**。Frames Remaining 的倒数从 `W − 1` 数到 0，
`W` 是批复的宽度。于是请求的效果**直接写在倒数的头一个数上**：
批复前块 0 的消息数 3,2,1,0；批到 6 之后块 1 的消息数 5,4,3,2,1,0。
这件事读者在时间线上一眼看得见，而且它是 §10.35.1 自己的意思：
那个单元是给上层用来把信息分装在多条 MAC 消息里跨多个测距时隙发出去的，
请求要的时隙就是下一次装这条消息要用的。

`ancillaryFrames` 因此降级为**第一条消息的长度**；从第二次交换起，长度是批复。
这一条要写进新课的 `limits`（`model-value`）。

### 3.5 拒绝的边界：块装不下，而这个边界一个新常数也不需要

控制器批不批，按**这一块装不装得下**判，而「装不装得下」是引擎与 schema **已经在算两遍**的同一件事：

- `src/uwb/network.ts:133-141` 那段 `mmrcrSlots` / `extraSlots` / `closingRoundNs` 的守卫；
- `src/model/scenario.ts:2369` 起那段 `roundSlots = slots + mmrcrSlots + ancillarySlotCount` 的预算。

**量出来的余量**（探针 `scratchpad/probe1.ts`：`Math.floor(p.blockNs / p.slotNs) - p.slots`）：

| 场景 | 一块装得下的时隙 | `plan.slots` | 余量 |
| --- | --- | --- | --- |
| 基础（time） | 100 | 5 | **95** |
| 竞争式 | 100 | 9 | **91** |

（`slotRstu` = 2400 → `slotNs` = 2 000 000；`blockRstu` = 240000 → `blockNs` = 200 000 000；
这两个数来自 `FiRa` 的缺省配置，3c 的 `sources` 已经这样标过。一个标签，一轮一块。）

所以在 `@uwb-ancillary` 那个大厅里，批复上限是 95，而请求 96 会被拒。
**那不是一个发明出来的数，它是 `blockNs`、`slotNs`、`plan.slots` 与 `mmrcmResponders` 算出来的。**
要让拒绝在课里真的发生，新课配一个块短一些或时隙长一些的场景即可——
上限会跟着那两个字段掉下来，而课文里一个字面量都不用写。

**拒绝是看得见的**，这是 §2 第 2 条那个便宜的回报：被拒之后下一次交换的窗口仍然是缺省宽度，
而请求方读的是同一张时隙表，所以它在自己的窗口宽度上就知道没批到。
不需要一条标准没定义的拒绝应答。

### 3.6 改到的代码，逐处

| 文件 | 改什么 | 为什么请求关掉时是恒等的 |
| --- | --- | --- |
| `src/uwb/phy.ts#uwbAncillarySlots` | 多一个 `requestSlot: boolean` 形参，`time` 下 `+1` | 形参缺省 `false`，表达式逐字还原 |
| `src/uwb/session.ts#ancillarySlots` | 多一个可选的「本块批到的宽度」形参 | 不传时取 `plan.ancillaryFrames`，即原表达式 |
| `src/uwb/session.ts#blockSlots` | 同上，透传 | 同上 |
| `src/uwb/session.ts#blockSlotStartNs` | 同上，透传 | 同上 |
| `src/uwb/session.ts#blockSlotAction` | 同上，透传；`AncillarySlotAction` 多一个 `request: boolean` | 不传时同上；新字段恒 `false` |
| `src/uwb/session.ts#RoundPlan` | 多 `ancillaryRequest`／`ancillaryRequestSlots` 两个字段，`roundPlan` 直通 | 建的时候还没有读者，与 `sp3`／`ancillary` 刚建时同一形状 |
| `src/uwb/network.ts` | 一个会话级可变量（批到的宽度，缺省 `null`）＋ `startBlock` 里一次拉取 | `null` 时每个调用退回原表达式 |
| `src/uwb/device.ts#beginRound` | 选项对象多一项「本轮的辅助窗口宽度」 | 已有 `nbChannel`／`participants` 两个先例 |
| `src/uwb/device.ancillary.ts` | 发请求、读请求、批复；`transmitAncillary` 的宽度从 `RoundState` 读而不是 `ancillarySlots(r.plan)` | 请求关掉时 `RoundState` 里就是 `plan.ancillaryFrames` |
| `src/model/scenario.ts` | 两个字段＋一条拒绝（§6）＋预算按最大可批宽度算 | 缺省 `false`／`1`，既有场景解析结果不变 |
| `src/uwb/records.ts` | `UWB_ANCILLARY` 多两个**可选**字段：`requestedSlots?`、`grantedSlots?` | 请求关掉时两个字段**不存在**（不是 `undefined`），见 §5.1 |

**不动的**：`plan.slots`、`slotAction`、`mmsSlotAction`、`sp3ReportAction`、`m2mParticipants`、
`slotStartNs`、`blockCarriesRcm`、`blockCarriesMmrcm`、`mmrcmResponders`、`blockCarriesAncillary`。

**一条记账提醒**：`UWB_ANCILLARY` 加字段**不是**加记录类型，所以不会触发
`tests/uwb/view.test.ts` 那张按 `UwbRecord['type']` 映射的 `SAMPLES` 的编译错误，
也不会触发 `src/ui/format.ts#fmtRecord` 的 TS2366。
**要是哪一步决定改成一个新的记录类型，那三道防线都要跟着动**，而 backlog 开头那条
「主记录归约没有穷举保护」的工程债说的正是这一类。

---

## 4. `RoundPlan` 的调用方清单，与每块重算之后它们会看到什么

扫的是**调用方**，不是文件清单：
`grep -rno '\(plan\|p\|mp\|r\.plan\|this\.plan\)\.\(method\|anchors\|participants\|slots\|slotNs\|roundNs\|blockNs\|roundsPerBlock\|schedule\|contentionSlots\|mode\|replyTime\|fixedReplyNs\|rcmValidityRounds\|mmrcr\|sp3\|srrr\|ancillary\|ancillaryFrames\|mms\)\b'`
对 `src/` 全量跑一遍，再逐个回去读上下文把假阳性剔掉。
**剔掉的五处是**：`src/course/diagram.ts` 的 `p.mode`（图的嵌套样式）、
`src/course/widgetModel.ts` 的 `p.mode`（Wi-Fi 的调制模式）、
`src/editor/FloorPlanEditor.tsx` 的 `p.slots`、`src/ui/format.ts` 的 `mp.slots`／`mp.slotNs`（都是 AMP 的触发帧）、
`src/uwb/ui/rows.ts` 的 `p.method`（定位行）。**它们都不是 `RoundPlan`。**

### 4.1 引擎侧：读的是 `UwbNetwork` 那唯一一个实例

| # | 文件 | 读哪几个字段／调哪几个函数 | 每块重算之后看到什么 |
| --- | --- | --- | --- |
| 1 | `src/uwb/session.ts` | 建它的地方；`slotStartNs`、`blockCarriesRcm`、`blockCarriesMmrcm`、`mmrcmResponders`、`blockCarriesAncillary`、`ancillarySlots`、`blockSlots`、`blockSlotStartNs`、`blockSlotAction`、`slotAction`、`mmsSlotAction`、`sp3ReportAction` | 四个函数多一个可选形参；**不传就是今天的表达式**，这是恒等变换的全部 |
| 2 | `src/uwb/network.ts` | `blockNs`×6、`slotNs`×8、`slots`×6、`roundNs`×6、`roundsPerBlock`×4、`mode`×7、`method`×3、`schedule`×4、`replyTime`×2、`sp3`×2、`mms`×1；调 `blockSlots`、`blockSlotStartNs`×2、`blockSlotAction`、`ancillarySlots`、`mmrcmResponders` | 第一个真正改的调用方。构造函数的预算守卫要按**最大可批宽度**算（§3.5）；`runRound` 的 `slots` 与步幅要带上本块的批复 |
| 3 | `src/uwb/device.ts` | `mode`×31、`schedule`×8、`method`×6、`replyTime`×6、`rcmValidityRounds`×10、`contentionSlots`×2、`srrr`×1、`anchors`×1、`fixedReplyNs`×1、`slotNs`×2、`slots`×1、`roundNs`×1、`mms`×1；调 `blockCarriesRcm` | 一个字段都不动；`beginRound` 的选项对象多一项，照 `nbChannel` 的先例 |
| 4 | `src/uwb/device.ancillary.ts` | `r.plan.ancillaryFrames`×4、`r.plan.schedule`×1；调 `ancillarySlots(r.plan)` | **第二个真正改的调用方**：那 4 处 `ancillaryFrames` 与那一次 `ancillarySlots` 要改读本轮的窗口宽度 |
| 5 | `src/uwb/device.mms.ts` | `r.plan.mms`×3、`r.plan.slotNs`×5；调 `slotStartNs`×2 | 什么也看不到：`ancillary` 在 `mms` 下被 schema 拒（:2098） |
| 6 | `src/uwb/device.m2m.ts` | `plan.mode`、`plan.participants`×2、`r.plan.method`×2、`r.plan.mode` | 什么也看不到：`m2m` 下被拒（:2106） |
| 7 | `src/uwb/device.sp3.ts` | `plan.mode`、`plan.sp3`×2、`r.plan.method`、`r.plan.srrr`；调 `slotAction` | 什么也看不到：`ancillary` + `sp3` 被拒（:2124） |
| 8 | `src/uwb/device.tdoa.ts` | `p.replyTime`×2、`r.plan.method`×2 | 什么也看不到：两种 TDoA 都被拒（:2076／:2090） |
| 9 | `src/uwb/device.report.ts` | `r.plan.mode` | 不变 |

### 4.2 引擎外：自己另建一份 plan，**永远看不到运行时的批复**——这是这一刀真正的风险

下面四处都是现场调一次 `roundPlan(cfg, n)`，拿到的是**没有批复的那一份**：

| # | 位置 | 读什么 | 批复生效之后它说的话 |
| --- | --- | --- | --- |
| 10 | `src/uwb/scene.ts:120` | `plan.blockNs`、`plan.roundNs` | `roundEndNs`（:126）用 `roundNs` 算叠加层光环的淡出时刻。**这一处今天就已经偏了，不是这一刀造成的**：量过，基础场景 `roundNs` = 10 ms 而真实轮长 9 × 2 = 18 ms，早 8 ms，占一块的 4 %。只是外观（环的透明度），而这一刀会让这个偏差随块变。**要在这一刀里修掉，或者明确记成已知缺陷。** |
| 11 | `src/uwb/ui/UwbSessionFields.tsx:848, 1106` | `plan.slots`、`plan.roundsPerBlock`（`E.uwbPlan`） | 编辑器那行说的是**没有请求时**的时隙数与轮数。批复能把块里的轮加长，于是「装得下几轮」会偏乐观。**措辞要改成「不计请求时」，或者按最大可批宽度算。** |
| 12 | `src/ui/Guide.tsx:90, 94` | `roundPlan(...).slots`（m2m 的两个数） | 不受影响：m2m 下 `ancillary` 被拒 |
| 13 | `src/course/uwb/uwb-ancillary.ts`×4、`uwb-m2m.ts`×2、`uwb-rcm-validity.ts`×1、`uwb-receipt.ts`×2、`uwb-sp3.ts`×6 | 课文里的时隙算术 | 只有 `uwb-ancillary` 那四处在这一刀的范围里，而它们算的都是**请求关掉时**的宽度，仍然正确 |

**第 10 与第 11 两处是这一刀要正面处理的**，而它们都是「显示层说了一句引擎已经不再保证的话」，
不是引擎缺陷——这正是本仓库反复抓到的那一类漂移。

---

## 5. 「没有请求时逐字节不变」怎么保证，怎么证明

### 5.1 怎么保证：新形参的缺省值**就是**今天的表达式

§3.6 的每一行都是同一个形状：一个新的可选形参，不传时表达式逐字还原。
`ancillaryRequest` 缺省 `false`，`roundPlan` 直通，`uwbAncillarySlots` 的 `requestSlot` 缺省 `false`，
`UwbNetwork` 的会话级批复量缺省 `null`，`null` 时 `ancillarySlots` 读 `plan.ancillaryFrames`。
**所以恒等性是构造上的，不是测出来的**；测量的作用是抓住构造写错了的那一次。

两条不许违反的纪律：

1. `UWB_ANCILLARY` 的两个新字段必须在请求关掉时**完全不出现**，而不是出现并取 `undefined`。
   理由是量具：`tests/engine/uwb-record-hashes.test.ts#serialiseRecord`（:62）用
   `Object.keys(o)` 取字段，**一个显式赋成 `undefined` 的键会进哈希**（序列化成 `undefined`），
   而一个没赋过的键不会。写成 `...(request ? { requestedSlots } : {})`，
   照 `roundPlan` 自己对 `mms` 的写法与 `UwbDevice` 构造里对 `attacker`／`stsOff` 的写法。
2. 新课与新变体只许**追加**。变体追加在数组末尾（`uwb-ancillary` 现有 `#0`／`#1`／`#2`，新的是 `#3`），
   插在中间会把既有键重编号，而那就是改既有行。

### 5.2 两份 fixture 只许增行，而**不许改既有行**

- `tests/fixtures/lesson-hashes.json`：254 个键。
- `tests/fixtures/uwb-record-hashes.json`：108 个键，其中 `uwb-ancillary`、`#0`、`#1`、`#2` 四行。

（命令见 §5.4。）

**全仓库唯一一次改既有 fixture 行的先例，在切片 6 的「建成之后：量到的数，和余下的一条」那一节**
（2026-10-05 的文档改动把它从第 410 行推到了**第 421 行**，所以按标题找，别按行号找）。
去读它怎么论证的——它的论证有三步，而三步都成立才算：

1. **普查先行**：`uwb-acquisition#0` 被查出是「全仓库唯一一个把这个属性打开的既有场景」；
2. **改是必须的**：那个场景的行为真的变了（`rsfSfd` 置 1 之后 RSF 真的变长了），所以行值必须变；
3. **改完的那个不等式本身就是验收**：改之前 `uwb-acquisition` 与 `uwb-acquisition#0` 的空口哈希
   **逐字节相同**，那个相等正是缺陷的证明；改之后两行不再相等，**这个不相等就是验收本身**。

**3d 不满足第 2 步，所以 3d 一行既有 fixture 都不许改。** 请求缺省关，既有的四个 `uwb-ancillary`
场景一个都不打开它，于是它们的行为一个字节都不该变。**任何一行既有 fixture 变了，就是这一刀写错了，
不是 fixture 该更新。**

### 5.3 哈希能证明什么、不能证明什么——两份 fixture 的盲区是**不同的两个**

立案时的转述只对了一半，这里按实测订正。

**`tests/fixtures/lesson-hashes.json`：字段全盲，而且只看得见 150 ms。**

`Simulation.updateHash`（`src/engine/simulation.ts:437`）折的是 `` `${r.t}:${r.seq}:${r.type}` ``，
所以只改字段不动时刻的变化它看不见。
**实测证据**：`wan-rtt` 与 `edca-tamper#9` 哈希**完全相同**（`9a3160d4`），
而后者是前者挂了一个 `txopHog` 作弊预设。

**而它还有第二个盲区，立案时没提而它更要紧**：那个测试的 `RUN_NS = 150 * MS`
（`tests/engine/lesson-hashes.test.ts:39`），而 UWB 课的一块是 **200 ms**。
**所以这份 fixture 对每一门 UWB 课都只看得见块 0。**
**实测证据**：`uwb-ancillary`（R = 1）与 `uwb-ancillary#1`（R = 4）哈希**相同**（`69eba038`），
而它们在块 1／2／3 上的行为完全不同（§1.1 那张表：9,9,9,9 对 9,5,5,5）。
**一个「块 b 的请求改变块 b+1」的特性，对这份 fixture 是全不可见的。**

**`tests/fixtures/uwb-record-hashes.json`：这一份不是字段全盲的——立案时的转述在这一点上要订正。**

`serialiseRecord`（`tests/engine/uwb-record-hashes.test.ts:62`）把每条记录的
**每一个自有可枚举字段**（含 `t` 与 `seq`）按键名排序折进去，数字取 6 位小数；
`RUN_NS = 1300 * MS`（:22），跑满七块。
**所以它是一把逐字段的尺，覆盖每一门 UWB 课的基础场景与每一个变体。**
它的盲区是另外两个：

1. **只收 `UWB_*`**：`uwbRecordsOf`（:88）过滤 `r.type.startsWith('UWB_')`。
   **实测**（探针 `scratchpad/probe1.ts` 的类型普查）：`uwb-ancillary` 基础场景 903 条记录里，
   `MAC_STATE` 378、`RX_OK` 84、`RX_START` 84、`TX_END` 63、`TX_START` 63 条**都在这把尺之外**
   ——而 `TX_START`／`TX_END` 正是载着帧长与空口时间的那些记录。
2. **只覆盖课程场景**：107 个 UWB 场景站点（§6.1 的普查），
   schema 收得下而没有课在跑的配置它不管。

### 5.4 所以量具是什么：一次**逐字段逐记录**的全流对比，而不是「fixture 零 diff」

**「两份 fixture 零 diff」不是逐字节不变的证据。** 规格指定的量具是下面三样，缺一不可。

**量具 A（重构门禁，一次性，放 scratchpad 不进仓库）。**
动代码之前，对**每一个** UWB 课程场景（108 个键，`scenarios()` 的同一张表——
  其中 `uwb-coexist#3` 没有 UWB 会话，见 §6.1）跑满 1300 ms，
把**整条记录数组**（**不过滤** `UWB_*`）按 `JSON.stringify` 落盘；动完代码再跑一次，**逐行 diff**。
这把尺补上 §5.3 两个盲区里的第一个（非 `UWB_*` 记录）。
形状照 `tests/engine/tamper-inert.test.ts` 的 `stream()`／`diff()`——
那个文件的 `stream` 就是「`JSON.stringify` over the whole record array, nothing dropped」，
而它的 `diff()` 报出**哪些记录类型、哪些字段**动了，
这正是把「记录流变了」变成一句别人能动手的话的那一步。

**量具 B（进仓库的恒等断言）。** 新建 `tests/engine/ancillary-request-inert.test.ts`，
按 `*-inert.test.ts` 家族的形状，在同一个 build 里断言：
`ancillaryRequest: false`（缺省）的场景与把两个新字段整段去掉的场景，**整条记录数组逐字节相同**。
这条断言永久守住缺省，而量具 A 只守住这一次重构。

**量具 C（两份 fixture）。** 只许增行。它们守的是「别的场景没被带着动」，
而按 §5.3 它们各自的盲区都写在这里了——**谁也不许把它们的绿读成「逐字节不变」**。

命令（可重跑）：

```sh
# 两份 fixture 的键数与重复哈希（§5.2／§5.3 引用的那两个相等）
python -c "import json,collections;d=json.load(open('tests/fixtures/lesson-hashes.json',encoding='utf-8'));print(len(d));inv=collections.defaultdict(list);[inv[v].append(k) for k,v in d.items()];print([ks for ks in inv.values() if len(ks)>1])"
# 两份 fixture 本身
npx vitest run tests/engine/lesson-hashes.test.ts tests/engine/uwb-record-hashes.test.ts
```

---

## 6. 空转普查：按 `docs/inert-config-contract.md` 的六步走一遍

### 6.1 第一步 · 前置普查：有没有一门课正在演示这个配置

**扫的是全部课程场景与变体，不是读代码猜**（探针 `scratchpad/census.ts`：
对 `LESSONS` 的每一门调 `scenario()`，对 `variants[*]` 调 `scenario()`，
再加 `HOUSEHOLDS` 与 `defaultScenario()`，把带 `uwb` 的那些收集起来；无一处抛异常）。

**量出来的结果：**

- 85 门课，其中 UWB 32 门；**107 个带 UWB 会话的场景站点，而这 107 个全部来自 `uwb-*` 这 32 门课**。
  `HOUSEHOLDS` 七个预设里**一个都没有** UWB 会话，`defaultScenario()` 也没有
  （探针 `scratchpad/census2.ts` 把来源拆开数了一遍）。
  **这个 107 与 `uwb-record-hashes.json` 的 108 个键差的那一个是 `uwb-coexist#3`**：
  它是 `uwb-coexist` 的一个纯 Wi-Fi 变体（只有 `ap` 与 `sta` 两个节点、没有 `scenario.uwb`），
  所以它在那份 fixture 里占一行而一条 `UWB_*` 记录都不产生（探针 `scratchpad/census3.ts`）。
  **两个数都是对的，差的那一个有名字。**
- 模式分布：`twr` 63、`mms` 35、`m2m` 4、`dl-tdoa` 3、`ul-tdoa` 2。
- `twr` 的排程分布：`time` 59、`contention` 4。
- **`ancillary: true` 的站点恰好 3 个，全部在 `uwb-ancillary` 一门课里**：

  | 站点 | mode | schedule | frames | R | contentionSlots |
  | --- | --- | --- | --- | --- | --- |
  | `uwb-ancillary:scenario()` | twr | time | 4 | 1 | 8 |
  | `uwb-ancillary:variants[0]` | twr | **contention** | 4 | 1 | 8 |
  | `uwb-ancillary:variants[1]` | twr | time | 4 | **4** | 8 |

- 其余 104 个站点 `ancillary` 全是 `false`，`ancillaryFrames` 全是 1（缺省）。

**结论**：唯一演示这个配置的是 `uwb-ancillary`，而它**一处也没有打开请求**（请求还不存在）。
所以第一步对 3d 的回答是：**拒掉任何与请求有关的组合，不会删掉任何现有教学内容**；
而反过来，任何要靠请求演示的东西，都得由**新**的教具来演示。

命令：`npx vite-node --root <worktree> <scratchpad>/census.ts`

### 6.2 第二步 · 只能钉住现状的两种情形

两条都不成立：现在没有一门课在点请求（它不存在），也没有一门课把「请求什么都不做」当成要教的事实。
所以第二步不阻挡拒绝。

### 6.3 第三步 · 门槛是「读不到」，不是「效果小」

这一刀 schema 会收得下的组合，逐条过：

| 组合 | 结局 | 为什么 |
| --- | --- | --- |
| `ancillaryRequest: true` 而 `ancillary: false` | **拒** | 接线问题：没有辅助信息交换就没有一帧能带 RAICT IE，这个字段在这条路径上**一个都读不到**（`blockCarriesAncillary` 第一个条件就是 `plan.ancillary`） |
| `ancillaryRequest: true` 在 `dl-tdoa`／`ul-tdoa`／`mms`／`m2m` 下 | **已经被拒** | 经由 `ancillary` 的四条既有拒绝传递过来，**不必新写规则**；只需保证新措辞不把同一件事再说一遍 |
| `ancillaryRequest: true` 配 `sp3` | **已经被拒** | 同上，经由 `ancillary` + `sp3` 那条（:2124） |
| `ancillaryRequestSlots` 恰好等于 `ancillaryFrames` | **钉住** | 这个字段**被读了**——它去给下一次交换定长度，算出来的数恰好与上一次相同。按第三步，这是算术，不是接线。钉成一条断言：每一次交换的消息长度都相同，而与请求关掉时的唯一差别是多出来的那一帧请求 |
| 竞争式下 `ancillaryRequestSlots ≤ contentionSlots` | **钉住** | 见 §6.3.1：窗口宽度不变，**但消息长度变**，所以它不是空转——而「窗口不变」这件事要钉住，否则读者会以为那是 bug |
| `ancillaryRequestSlots` 大过这一块装得下的 | **钉住，而且这是教学内容** | 它会被控制器拒，而拒绝本身是这一刀要教的东西（§3.5）。schema **不许**替控制器拒掉它：装不装得下取决于块长、时隙长与轮数，而拒绝发生在运行时才有意义 |

#### 6.3.1 竞争式下的那个 `Math.max`，量出来的空转区间

`uwbAncillarySlots`（`src/uwb/phy.ts:637`）在竞争式下返回 `Math.max(ancillaryFrames, contentionSlots)`。
**实测**（探针 `scratchpad/bytes.ts`，`contentionSlots = 8`）：

| frames | time 窗口 | contention 窗口 |
| --- | --- | --- |
| 1 | 1 | **8** |
| 2 | 2 | **8** |
| 4 | 4 | **8** |
| 6 | 6 | **8** |
| 8 | 8 | **8** |
| 10 | 10 | 10 |
| 12 | 12 | 12 |

**所以在竞争式下，帧数（也就是批复）在 1…8 这整个合法区间里，窗口宽度都是 8，一格也不变。**
这是一个 schema 收得下、而**对窗口宽度**可证明无效果的整片区间。
按第三步它该**钉住**而不是拒绝：那个字段被读了（它去定消息长度，而消息长度真的变），
**变不了的只是窗口宽度**——而那是竞争时隙预算在管，不是请求在管。
这件事要进新课的课文，因为它正是「请求买到了什么」这个问题在竞争式下的准确答案。

### 6.4 第四步 · 拒绝之后，物理的证据要从还合法的那一侧量得出来

只有一条新拒绝（`ancillaryRequest` 配 `ancillary: false`）。
还合法的那一侧现成：`ancillary: true` ＋ 同一个 `ancillaryRequestSlots`，
它跑得出请求帧、跑得出批复、跑得出下一次交换变长的消息。
**所以「关掉交换时这个字段读不到」这件事，证据不随拒绝一起消失。** 第四步通过。

### 6.5 第五步 · 拒绝要说出该改哪里，而 schema 与编辑器读同一份措辞

照 `selectivityRefusals`／`driverRefusalsFor` 立下的形状：规则与它的措辞住在**一个导出函数**里
（`ancillaryRequestRefusals`，放 `src/model/scenario.ts`，紧挨既有那两个），
`ScenarioSchema` 的 `superRefine` 与编辑器的面板都读它。
消息里三样齐全：**哪个字段**（`ancillaryRequest`）、**为什么它在这里是死的**
（没有辅助信息交换就没有带 RAICT IE 的帧）、**该改成什么**（把 `ancillary` 打开，或把 `ancillaryRequest` 关掉）。
编辑器那一侧**红字渲染在控件旁边，不是 `title` 提示**——触摸屏没有悬停，而这个仓库是在折叠屏上看的。

### 6.6 第六步 · 让句子变长的那一刀，要负责渲染

这一刀只加一条拒绝，而且它比 2026-10-05 那一批短。
`scenarioLoadIssues`（`src/editor/planOps.ts`）已经把 `custom` 的 issue 只印 `message`，形状正合。
**不需要为这一刀动渲染**，但要在提交信息里写明这一条是查过的、不是没想。
zod 的短路（节点级类型错误时 `superRefine` 不跑）照旧，不为这一刀去拆 schema 的分层。

### 6.7 判定结果

**一条拒绝，四条钉住**，写进这份规格与那一刀的提交信息：

| 配置 | 结局 |
| --- | --- |
| `ancillaryRequest` 配 `ancillary: false` | 拒 |
| 请求值等于当前帧数 | 钉住 |
| 竞争式下请求值 ≤ `contentionSlots`（窗口宽度不变） | 钉住 |
| 请求值大过这一块装得下的（被控制器拒） | 钉住，且是教学内容 |
| 缺省关时整条记录流不变 | 钉住（量具 B） |

---

## 7. 这一刀要不要做

### 7.1 先按 4d 的否决判据量一遍

4d 立过案并建议不批（理由在 4b 规格 §5.2），它的两条否决理由是：
**（a）要改九条既有 fixture 行；（b）`ofdma-dl` 那一课的结论数会从 1.44 ms 掉到约 0.2 ms，那一课要重写。**

3d 对着这两条量：

- **（a）要改几行既有 fixture？0 行。** 请求缺省关，107 个场景站点里 3 个打开 `ancillary`，
  而那三个一个也不打开请求（§6.1 普查）。新课与新变体只增行（§5.1 第 2 条）。
- **（b）有哪一课的结论数会动？没有。** `uwb-ancillary` 课文里的时隙算术算的是
  请求关掉时的宽度，仍然正确（§4.2 第 13 行）。
  **唯一要改的是那一课 `limits` 里的一段话，而那段话今天就是错的**
  （§1 推翻的那句「就得把轮的排布变成每块重算一次」），改它跟做不做 3d 无关；
  而 `limits` 不在 `MAIN_PATH_SECTIONS` 里（`src/course/readability.ts:374`），
  所以改它**一分钟也不花**。

**3d 两条都不满足，所以它不是一个 4d。**

### 7.2 再按 backlog 自己的两条准入判据量一遍

- **能跑出数。** 跑得出四个量：请求帧的字节与空口时间（15 字节／182 244 ns，§3.2 量过）；
  批到的窗口宽度；下一次交换 Frames Remaining 倒数的**头一个数**（§3.4）；
  被拒时下一次交换仍是缺省宽度。
  前三个落在 `UWB_ANCILLARY` 的现有字段上，或落在两个新的可选字段上。**过。**
- **不需要发明数字。** 请求值是场景给的（`model`，与 `ancillaryFrames` 同一条理由）；
  拒绝的边界是 `blockNs`／`slotNs`／`plan.slots`／`mmrcmResponders` 算出来的（§3.5），
  不是一个新常数；字节宽度全在 `phy.ts`，3c 已经标过。**过。**

### 7.3 「它是最后一刀」不是一条理由

2026-10-05 的文档改动把 5b 判成「范围决定：不建」（进度表第 49 行），
于是这张表上 UWB 只剩 3d。**这件事明确不计入上面任何一条判据。**
§7.1 与 §7.2 两套判据是对着代码与测量算的，和表上还剩几行无关；
而 4d 与 5b 两条「范围决定」的先例本身就说明，以一条范围决定收尾是一个干净的收尾。
**如果 §7.4 的三条前置条件里有任何一条不打算做，那么「UWB 以三条范围决定收尾」比
「交一刀技术上正确而读者看不出所以然的特性」好。**

### 7.4 结论：**建议批，三条前置条件**

这一刀换来的是这门课 85 门里没有一门教过的一件事：**一个不是在会话开始前就定死的排程。**
`src/uwb/session.ts` 的文件头现在写着「The block, round and slot lengths are fixed before the
session starts, in every mode」，`src/uwb/network.ts` 的文件头写着
「the block/round/slot grid … says who transmits when, for the whole session, before it starts」。
这两句话在切片 3b／3c 落地之后就已经不完全成立了（§1.1 那张 9,5,5,5 的表），
而 3d 会让它们第一次因为**一台设备要求**而不成立。**那个差别就是这一课。**

**前置条件一（必须先做，否则这一刀的效果几乎看不见）：
改掉 3c 留下的 `ancillaryFrames ≤ plan.slots` 这个上限。**

`src/model/scenario.ts:2333` 把消息帧数的上限钉在**测距阶段自己的时隙数**上，
消息写着「它要连续占住本轮的 N 个时隙」。**那句话说错了机理**：
辅助信息的时隙是 `blockSlots` **追加**的，不是从 `plan.slots` 里拿的
（`blockSlots` 自己的 docblock：`plan.slots`, **plus** the ancillary message's own slots）。
真正的上限是**这一块装不装得下**，而那由另一条规则（:2369 那段预算）已经在管。

后果是量得出来的：`@uwb-ancillary` 的大厅里 A = 4 → `plan.slots` = 5，
而一块装得下 100 个时隙、余量 95（§3.5 量过）。
**于是今天合法的批复只有 1…5，而 4 已经在用——可达的变化只有 ±1 个时隙。**
把上限改成块容量是**放宽**，一个既有场景都不会变（放宽不会让已经通过的方案失败），
两份 fixture 零 diff。
**不先做这一笔，3d 会交出一个技术上正确而读者看不出所以然的特性。**

**前置条件二：课不许落在 `uwb-ancillary` 里。** 见 §8，那里有实测数与三条路的代价。

**前置条件三：§6.7 那一条拒绝与四条钉住，和 §4.2 第 10／11 两处显示层漂移，都在这一刀的范围里。**
第 11 处（编辑器那行 `plan.slots`／`roundsPerBlock`）是这一刀让它变得会骗人的，
按契约第六步，「既有的」不是「不归我」。

**三条里少任何一条就不要做 3d：** 少了第一条它是空转的近邻；
少了第二条它会把一门已经顶格的课压红；少了第三条它会留下两句引擎不再保证的 UI 文案。

---

## 8. 课程落点：`uwb-ancillary` 顶在上限上，实测如下

### 8.1 实测值

公式是 `lessonMinutes`（`src/course/curriculum.ts:487`）：
`mainPathChars / 220 + 2 × observe.length + 4 × tryThis.length`，`Math.round` 到 5，下限 5，
上限 `MAX_MINUTES = 30`。断言在 `tests/course/kit.ts:143-150`（公式自身 ＋ `≤ MAX_MINUTES`，后者在第 150 行）。

探针 `scratchpad/minutes.ts`（对 `LESSONS` 逐门算 `lessonChars` 与原始分钟数）：

| 课 | 主路径字数 | observe | tryThis | 原始分钟 | 标称 | 还能加几个主路径字 |
| --- | --- | --- | --- | --- | --- | --- |
| **`uwb-ancillary`** | **3766** | **3** | **2** | **31.118182** | **30** | **303** |
| `ru-diversity` | 4030 | 2 | 2 | 30.318182 | 30 | 479 |
| `uwb-receipt` | 3498 | 3 | 2 | 29.900000 | 30 | 571 |
| `selectivity` | 3904 | 2 | 2 | 29.745455 | 30 | 605 |
| `uwb-sp3` | 3320 | 3 | 2 | 29.090909 | 30 | 749 |

**所以记着的 31.12 是对的，而「四舍进到上限 30」这个说法要说准一点**：
`Math.round(31.118182 / 5) = Math.round(6.223636) = 6`，`6 × 5 = 30`——它是**向下**落到 30 的，
30 恰好等于上限。**`uwb-ancillary` 是全课程原始分钟数最高的一门，而且它已经超过 30。**
（**不是字数最多的那一门**：`ru-diversity` 有 4030 个主路径字而 `uwb-ancillary` 只有 3766。
顶格的是那三条 `observe` 与两条 `tryThis` 一起算出来的 14 分钟，不是课文本身的长度
——这一点对路 B／路 C 的代价估算有影响，见 §8.2。）

**往这一课加字会不会当场红，答案要分开说：**

- **加一条 `observe`：当场红。** 31.118182 + 2 = 33.118182 → `round(6.623636) = 7` → 35 > 30。
- **加一条 `tryThis`：当场红。** +4 → 35.118182 → 35。
- **只加主路径文字：有 303 个字的余量，而第 304 个字就红。**
  **这个数不是减出来的，是一个字一个字走出来的**（探针 `scratchpad/headroom.ts`，
  对 `base + add` 逐个调一遍公式，`add` 从 0 到 600）：
  `+0` → 30，**`+304` → 35**，中间没有别的台阶。
  原因是边界恰好落在 .5 上：3766 + 304 = 4070 个字给出 raw 正好 **32.500000**，
  而 `Math.round(6.5) = 7`（JS 对 .5 向上），`7 × 5 = 35 > 30`。
  **用 `ceil((32.5 − 31.118182) × 220)` 减出来会得到 305，而 305 是红的**
  ——那个式子的浮点结果是 304.00000000000006，`ceil` 把它推到了 305，
  而且就算算得准（304）也已经是红的那一格。
  **所以这一课的主路径上限是 4069 个字，不是 4070。**
- **加 `limits` 条目：一分钟也不花。** `limits` 不在 `MAIN_PATH_SECTIONS` 里
  （`src/course/readability.ts:374`，那张表是
  why／outcomes／terms／body／picture／numbers／observe／tryThis／quiz）。
  但它要过 §9 的棘轮。
- **加变体或跳转：一分钟也不花。** `variantLabel`／`jumpLabel` 是 chrome
  （`CHROME_SECTIONS`，`src/course/readability.ts:419`），不计字。但要过 §9 的臂二。

命令：`npx vite-node --root <worktree> <scratchpad>/minutes.ts`

### 8.2 三条路，各自的代价

**路 A · 新课 `@uwb-ancillary-request`。**

- 代价：一整份课程契约（`tests/course/kit.ts` 的 `isMigrated`、`picture` 前三块之内要有一个 `watch`、
  `numbers`、`sources`、每个 `jumps[].find` 都要在基础运行里命中、`quiz`、`limits`、`terms`、
  `needs`、`COURSE_ORDER` 里的位置、tier 归属），外加两份 fixture **各增两行以上**
  （基础 ＋ 变体）。85 → 86 门。
- 好处：**`uwb-ancillary` 一个字都不用动**（除了那条本来就错的 `limits`）；
  新课的主路径是空白的，所以 §9 的两条臂与 `limits` 棘轮都好过（要讲的术语自己写进主路径就行）；
  而 `uwb-ancillary` 那条限制**本来就是 `out-of-scope`**，于是它可以合法地带上
  `until: 'uwb-ancillary-request'`——`until` 只许站在 `out-of-scope` 上
  （`src/course/lessonKit.ts` 的 `Limit.until` docblock，`tests/course/limits.test.ts:137`），
  这一条刚好满足。那个 `until` 账本是**冻结的**（`tests/course/limits.test.ts:237`，
  「the sixteen `until` promises are a frozen ledger」），所以加一条是一次显式编辑，不是悄悄的。
  **这正是切片 4e 想要的那种 `until`：一个有人去兑现的承诺。**
- 风险：新课要有自己的 `why`，而「为什么读者该关心请求」与 3c 的「为什么该关心分段」
  必须是两个题目——如果写不出两个不同的题目，那说明这一刀本该并进 3c，
  而不是说明新课不该开。

**路 B · 在 `uwb-ancillary` 里加一个变体（`#3`）。**

- 代价：变体标签不计字，但一个没有课文解释的按钮是一个没人会按的按钮。
  要解释它，得在 `numbers` 或 `picture` 里加一段——**而那段最多 303 个字**（§8.1 走出来的），
  而这一刀的内容（请求、批复、拒绝、窗口宽度与消息长度的区别、竞争式的 `Math.max`）
  **装不进 303 个字**。
- 还有一条更硬的：原始分钟数已经 31.118，而
  `docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md` 与 `lessonMinutes` 的 docblock
  都写着「一课超过 30 分钟就是在教两个题目，答案是拆开它」。
  **往一门公式已经判定是两个题目的课里再塞第三个题目，是拿一条测量换一次方便。**
- 好处：fixture 只增两行；不动课程顺序与 tier。

**路 C · 先把 `uwb-ancillary` 瘦身，再往里加。**

- 代价：三条里唯一一条**还债**的路，也是最贵的。要让它装得下 3d 的内容
  （保守估两段共约 1200 字），**得先砍掉至少 897 个主路径字**
  ——这个数同样是走出来的，不是减出来的（探针 `scratchpad/headroom.ts`：
  对 `add = 1000 / 1200 / 1500` 各自把 `cut` 从 0 递增到公式不再超上限，
  结果是 697／**897**／1197，三个都停在净 4069 个字上，也就是 §8.1 那个上限）。
  而那一课的四段 `picture`／`numbers` 每一段都在讲一件独立的事
  （角色反转、三种粒度、存在位与长度、竞争式窗口）。砍掉任何一段都是删教学内容。
- 好处：还掉了一笔真债；瘦身之后那一课落在 30 以内，上限有了余量。
- 风险：瘦身与加新内容在同一刀里，会让「哪一处改动造成了这一行 fixture 变化」说不清——
  而这个分支已经为「重命名与行为改动落在一起」付过两次代价
  （`RoundPlan.participants` 的 docblock 自己写着）。

### 8.3 推荐

**路 A（新课），而且 `uwb-ancillary` 那条 `out-of-scope` 限制同时改两件事：**
改掉 §1 里那句错的机理，并加上 `until: 'uwb-ancillary-request'`。

理由按分量排：

1. **3c 的课已经不是「差一点满」，是「公式判定它在教两个题目」**（原始 31.118，上限 30）。
   往里加是把一条测量按下去。
2. **3d 的题目与 3c 的题目不是同一个。** 3c 教的是「一条消息装不进一帧的时候」，
   3d 教的是「排程可以被请求改变，而控制器可以不答应」。
   backlog 自己也是这样拆的（「分界线不是工作量」）。
3. **路 A 让一条 `until` 第一次被兑现**，而 4e 刚刚把 `until` 收窄成只有 `out-of-scope` 能带
   ——现成的靶子就在那里，而且 `kind` 已经对了。
4. 路 B 装不下（303 字），路 C 要先砍 897 个字，把还债与加料混在一刀里。

---

## 9. 措辞：新课文要先过尺再定稿

2026-10-05 的两条规则，四个字段臂（`tests/course/readability.test.ts:721` 起那个 describe）。
实测核对过：

- **臂一（`title`，`titleArmFailures`，:732）**：标题里的词表术语，必须在**本课自己**被判过的主路径上
  加括号讲过（`taught(own, t)`，即 `bracketedAtFirstZhUse(...) === true`）。
  **不能靠前置课**，理由写在那个函数的 docblock 与断言消息里：
  标题会被印在它自己那门课之外（目录、`needs` 按钮、别课 `limits` 旁边）。
- **臂二（`variants[].label`／`jumps[].label`／`terms[].plain`，`closureArmFailures`，:753）**：
  本课**或** `needs` 的传递闭包（`needsClosure`）。
  三个 section 是从 `lessonTexts` 筛出来的，不是手写的字段名单。

**`limits` 棘轮：实测 296，顶格，余量 0。**
探针 `scratchpad/ratchet.ts`（照 `tests/course/readability.test.ts` 的
`zhMainText = gradedProseTexts(l).join(' ')`、`zhTermsFor = ZH_TERMS.filter(track)`、
`names = bracketedAtFirstZhUse(...) !== null` 原样复制，对 85 门课跑判据 Q）：

```
criterion Q over limits = 296 | ceiling 296 | slack 0
lessons carrying it = 76
uwb-ancillary own debt: ["uwb-ancillary|媒体访问控制","uwb-ancillary|下行","uwb-ancillary|到达时间差","uwb-ancillary|多毫秒","uwb-ancillary|片段"]
sources Q = 185   deeper Q = 86
```

（顺带一处可以订正的：那个 describe 的 docblock 把 `sources` 的判据 Q 记成 182，实测 **185**。
断言本身是 `> 100`，所以它没红——但那张表里的 182 是旧值。）

**所以新课的 `limits` 里点到的每一个术语，要么写进新课自己的主路径，要么先还掉一笔。
抬那个 296 需要人批，而缺省不批。**

实操上这一条对路 A 很友好：新课的主路径是从零写的，几个把术语讲清的句子就够。
要当心的是 `uwb-ancillary` 自己已经欠着 5 笔（上面那一行），
**所以改它那条 `limits` 的时候，不要把一个新术语带进去**——它没有余量接第六笔。

**`LimitKind` 恰好四个**（`src/course/lessonKit.ts:80`）：
`threshold | unmodelled | model-value | out-of-scope`。**`regulation` 不是其中之一。**
`until` 只许站在 `out-of-scope` 上（`tests/course/limits.test.ts:137` 那条断言），
`seeAlso` 任何 `kind` 都可以带、但不许与 `until` 同条（:183）。

新课预计的 `limits` 三条：请求值从哪来（`unmodelled`，照 `ancillaryFrames` 那条）、
批复与拒绝的策略是模型定的（`model-value`，因为正文不定义批复与拒绝，§2 第 1 条）、
一轮只有一个请求方（`model-value`，照 `ANCILLARY_SENDER_INDEX` 那条）。
一条 `until` 都不带——这一刀建完之后没有下一刀来解除它们。

---

## 10. 验收

1. **请求真的上了空口。** 一帧，15 字节，空口 182 244 ns，
   `numberPresent: false`／`framesRemainingPresent: true`，
   长度**全部由 `raictIeBytes`／`uwbAncillaryBytes` 算出**，课文与测试里一个字面量都不写。
2. **批复真的改变了下一块。** 块 b 请求 W，块 b+R 的 `UWB_ANCILLARY` 倒数从 **W−1** 开始数到 0，
   而块 b 自己的那一条仍然从 `ancillaryFrames − 1` 开始。**这是这一刀的验收。**
3. **控制器真的能拒。** 请求一个大过本块余量的数（基础大厅里 > 95，§3.5 量过），
   下一次交换的宽度仍是缺省；请求方在自己的窗口宽度上就看得见，
   **不靠任何一条标准没定义的应答**。
   配一个块更短的场景，让同一个请求值在一个大厅里被批、在另一个里被拒。
4. **竞争式下，窗口宽度不动而消息长度动**（§6.3.1 那张表），两件事分别断言。
5. **测距结果不变。** 打开请求之后 `UWB_RANGE` 逐字段与关掉时相同——
   请求帧坐在测距阶段之后的追加窗口里，与 3c 的 §5.5 同一条理由。
6. **不配置就什么也不发**，而且**整条记录流逐字节相同**（量具 B）。
7. **既有场景逐字节不变**：量具 A 零 diff，两份 fixture **只增行、既有行一行不改**（§5.2）。
8. **四条钉住各一条断言**（§6.7），一条拒绝加它的措辞与编辑器渲染（§6.5）。
9. **`src/uwb/session.ts` 与 `src/uwb/network.ts` 的文件头要改。** 那两句
   「排程在会话开始前就全部定死」在这一刀之后就不再是这个引擎的性质了，
   而它们是读者进这两个文件看到的第一句话。

## 11. 明确不做

- **多台设备同时请求。** 一轮只有一个辅助信息发送端（`ANCILLARY_SENDER_INDEX`，3c 的 `model` 决定），
  所以也只有一个请求方。两台设备在同一个竞争窗口里各发一个请求、请求撞车——
  那是 3c 那条 `model-value` 限制已经记着的后续工作，不在这一刀里。
- **批复的应答帧。** 正文不定义（§2 第 1 条），而本引擎不需要它（§2 第 2 条）。
  发明一条应答会是往仓库里塞标准没有的语义。
- **把请求搭在片段上共用一帧。** §3.2 的第二条路，不选，理由在那里。
- **消息类型的取值表。** 照 3c 的 §6，仍然是一个常量。
- **MAC 原语与上层。** 照旧，一条都没有。
- **`until` 以外的 `uwb-ancillary` 改动。** 那一课只改一条 `limits`：改正机理、加上 `until`。
  别的一个字都不动，这是让 fixture 零 diff 的条件。
