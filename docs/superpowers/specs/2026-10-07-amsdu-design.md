# 切片 W8：A-MSDU —— **立案，建议不批这一刀，批它的前置**

2026-10-07。基线提交 `57ddf47`（= `main`，已推；`git status --porcelain` 在本 worktree 空）。
已发布标准 IEEE Std 802.11-2024（§9.2.4.8.1 与 Table 9-34、§9.3.2.2.1、§9.3.2.2.2 与图 9-123、
§9.3.2.2.4、§9.3.2.2.5、§10.11、§10.12、§10.25）。
语料读法：`D:\ai_patent_experiments\.claude\skills\wifi_patent_skill\references\ieee_standards\text\80211-2024.json`
的 `pages` 字典按**目录页码**取键（`toc/80211-2024.json` 的 `page` 与之同号，已核：
目录说 §10.11 在 1971 页，`pages['1971']` 的末尾正是「10.11 A-MSDU operation」）。

**这份规格的结论是三句话：**

1. **「先拆还是先建」两条都不是对的答案。** `mac.ts` 的问题不是它有 1 758 行，
   是**同一个「把队列里的 MSDU 装成一个 PSDU」的决定在它里面写了五遍**，
   横跨它八个分块里最大的三个。该做的是**把那个决定命名成一个函数**（§2.4），
   那是 C 项开场动作的真身，它可被 263 条哈希证明无行为变化，而且做完之后
   A-MSDU 从「改五处」变成「改一处」。**拆文件是另一件事，而且它今天不该做**（§2.3）。
2. **这一刀若建，只能建嵌套那一层；而 backlog 判它「量不出新东西」的理由管的是另一件事。**
   （这是一条**条件性**判定——第 3 句与 §8.1 的结论是这一刀现在不该建。）
   理由（整帧解码）对**失败语义**是成立的，对**字节算术**不成立；
   而 Table 9-34 把不嵌套的那一条路堵死了：**单个 MPDU 的上限让一个 A-MSDU 最多装 7 个
   1 500 字节的 MSDU，而本语料里聚合 PPDU 常态装 14 到 20 个（实测最大 50）**。
   所以**不嵌套的 A-MSDU 在这个引擎里是一次吞吐倒退，不是省**（§3.2）。
   真正「允许但空转」的那一条是**子帧级失败隔离**，它按六步判据应当**在设计期拒掉**（§3.3）。
3. **而「能跑出数」跑出来了，数不好看。** 逐 PPDU 量出来：1 500 字节载荷下
   A-MSDU 比 A-MPDU 省 **每子帧 20 字节**（不是 backlog 说的 30），
   整个交换省 **1.1 %–1.7 %**；64 字节载荷下省 **10 %–17 %**。
   **而 264 个场景跑满读者的 2 秒时间轴，117 719 个聚合 PPDU 里只有 23 个落在后一个区间**，
   剩下 117 694 个（99.98 %）全在前一个（§4.3）。
   **把它推进后一个区间需要一条「大量小帧积压」的业务档位，而那个档位得靠发明数字**——
   这违反 backlog 自己那条第 2 判据（§4.4）。

§0 是更正，§1 是标准查证，§2 是「先拆还是先建」，§3 是嵌套与允许但空转，
§4 是「能量出什么」与闸门，§5 是「若仍要批，建什么」，§6 是口径代价，§7 是验收，§8 是结论与疑虑。

---

## 0. 先更正

### 0.1 backlog 那笔算术错了两次，而两次的方向相反

backlog 第 603–604 行：「一份 QoS 帧头 26 字节加 4 字节 FCS…n 个子帧聚成一个 A-MSDU
省掉 **(n−1) × 30 字节**」。

**两个常数都对，这笔算术错两处：**

| 漏算的 | 方向 | 字节 | 出处 |
| --- | --- | --- | --- |
| A-MPDU 的 4 字节定界符 A-MSDU 也省掉 | 省更多 | **−4** | `src/engine/phy.ts:462` `AMPDU_DELIMITER_BYTES = 4` |
| A-MSDU 每个子帧要自带一份子帧头 | 省更少 | **+14** | 802.11-2024 §9.3.2.2.2 图 9-123：DA 6 + SA 6 + Length 2 |

净效：**每多一个子帧省 20 字节，不是 30**。而且在 n = 1 时 **A-MSDU 反而多 10 字节**
（一份 14 字节子帧头对一个 4 字节定界符），所以「省 (n−1)×30」连符号都不总对。
逐数见 §4.1；重量的命令在 §4.5。

### 0.2 backlog 和覆盖表都说这笔交易的代价是「一丢全丢」，而**这个引擎里没有这个代价**

backlog 第 604 行与覆盖表第 246 行都写：A-MSDU 的代价是一丢全丢，而 A-MPDU 有分隔符（可逐子帧救）。
**对标准成立，对这个引擎不成立。** 覆盖表自己第三节「压缩 BlockAck」那一行就是反证：

> **没建的是位图本身**：`engine/mac.ts` 是整 PPDU 解码模型，一次交换要么全成功要么全失败，
> 没有逐子帧失败这回事（代码注释自己说「no per-subframe bitmap to partially fail on」）。

所以**今天 A-MPDU 已经是一丢全丢**：失败时 `this.queues.restore(ac, msdus)` 把**全部**
被 claim 的 MSDU 退回队首。**这笔交易在这个引擎里只有省的那一半，没有代价那一半。**
这不是可以在课文里一句话绕开的事——它是「这一课能量出什么」的全部内容（§4）。

### 0.3 brief 那些数，逐条核过

| brief 的说法 | 我重量的命令 / 读到的 | 结论 |
| --- | --- | --- |
| `mac.ts` 今天 1 758 行 | `wc -l src/engine/mac.ts` → `1758` | **对** |
| `LOOKAHEAD_NS` = 2 秒，在 `src/player/player.ts:12` | 读该行：`const LOOKAHEAD_NS = 2_000_000_000` | **对**，行号也对 |
| 课数 `toBe(87)`、模块数 `toBe(30)` | `w8-ratchet.ts`（§4.5）→ `87` / `30`；断言在 `tests/course/readability.test.ts:1152/1154` | **对** |
| 分钟数总和 1 850 是等式 | 同上 → `1850`；断言在 `:1210` `.toBe(1_850)` | **对** |
| 逐课主路径字数落在 (700, 4 400) | `:1170` `.toBeGreaterThan(700)`、`:1175` `.toBeLessThan(4_400)` | **对** |
| `limits` 棘轮 292 且零余量 | 同上 → `criterion Q today: 292 pairs over 76 lessons`；断言 `:976` `.toBeLessThanOrEqual(292)` | **对** |
| `LimitKind` 恰好四个，`regulation` 不是 | 读 `src/course/lessonKit.ts:80-88`：`threshold` / `unmodelled` / `model-value` / `out-of-scope` | **对** |
| `until` 只许站 `out-of-scope` | `src/course/lessonKit.ts` 的 `Limit.until` docblock，**Only legal on `kind: 'out-of-scope'`** | **对** |
| `picture` 第一个 `watch` 必须在前三块内 | `tests/course/kit.ts:138-140`：`expect(firstWatch).toBeLessThan(3)` | **对** |
| 括号首次使用窗口 40 个字符 | `src/course/readability.ts:876`：`if (at < start || at > end + 40) continue` | **对** |
| 最紧的是 `@rate` 1 个汉字，第二紧 `@edca` 16 个字 | `w8-buckets.ts`（§4.5）→ `rate margin=1.0`、`edca margin=16.0` | **两条都对** |
| A-MSDU 属 M7，模块已存在 | `MODULES.length = 30`，M7 在列；本规格不碰 `TIERS` 与 UWB 的 `module` 索引 | **对** |
| 全量 266 文件 / 7 623 条绿 | **没重跑**（本规格只写文档，不动源码，没有重跑的必要）。我只跑了针对性探针与 `readability` 的那组数 | **未核** |
| backlog 里有**四条**「立案并建议不批」的先例 | `grep -n "立案，建议不批" docs/wifi-course-backlog.md` → W2、W4、W6、W7、**W10** | **错，是五条**（4d / 5b 是形状的来源，不是这张表里的条目——那张表第 45 行自己这么写） |

### 0.4 brief 漏了的两件，都会咬这一刀

**一、`mac.ts` 不在 `engine/mac.ts`，在 `src/engine/mac.ts`。**
backlog 与覆盖表全程写 `engine/mac.ts`（那是覆盖表「怎么读这张表」自己声明的省略写法，
见 `tests/course/coverage.ts` 的解析器），但规格里的路径要写全，否则 `grep` 空手而归。

**二、新术语 `A-MSDU` 一进 `ZH_TERMS`，棘轮当场从 292 跳到 295，而且是三门*旧*课贡献的。**
这是我量出来的，不是推测（`w8-ratchet.ts`，§4.5）：

```
adding { zh: 聚合 MSDU, abbr: A-MSDU } would touch:
  frame-qos-fcs · limits
  frame-anatomy-bytes · limits
  ampdu · limits
=> criterion Q would become 295
```

三处原文：

- `src/course/tier1/frame-qos-fcs.ts:69`（`unmodelled`）：「…EOSP 与 **A-MSDU** 存在位都没有对应的模型」
- `src/course/tier1/frame-anatomy-bytes.ts:133`（`out-of-scope`）：「…MSDU 最大 2304 字节，**A-MSDU** 最大 3839、4065 或 7935 字节」
- `src/course/tier2/ampdu.ts:144`（`model-value`）：「…引擎不做 **A-MSDU**——把多个上层包塞到同一个 MAC 帧头下面的那一层聚合」

**所以这一刀的第一笔支出不是新课，是先把这三笔债还掉**（每门课主路径加一句、在首次使用处带括号）。
好消息是三门课的五分钟档位都有余量，加一句不会动 1 850 那条等式（§6.2）。

---

## 1. 标准查证：§10.11 的正文自己读过了

### 1.1 §10.11 几乎不讲字节，它讲地址

802.11-2024 p.1971–1973（目录页码同号）。§10.11 整节的内容是**地址约束与能力前提**，不是帧长：

- 开篇一句：A-MSDU 只装那些 DA 映射到同一个 RA、SA 映射到同一个 TA 的 MSDU（见 §9.3.2.2）。
- 「The constituent MSDUs of an A-MSDU shall all have the same priority parameter value
  from the corresponding MA-UNITDATA.request primitive.」——**同一个 TID**。
- 「A non-DMG and non-S1G STA that has a value of false for `dot11HighthroughputOptionImplemented`
  shall not transmit an A-MSDU.」且「shall not transmit an A-MSDU to a STA from which it has not
  received a frame containing an HT Capabilities element.」——**两端取与的能力门**。
- 「The expiration of the A-MSDU lifetime timer occurs only when the lifetime timer of all of the
  constituent MSDUs of the A-MSDU have expired.」后面紧跟 NOTE 6：这条规则**允许一个已过期的
  MSDU 仍然被发出去**。
- 没有 A-MSDU Fragmentation Support（HE Capabilities 的 MAC Capabilities Information 字段）时，
  一个 A-MSDU **必须不分片地装在一个 QoS Data 帧里**。

**字节宽度全在 §9.3.2.2.2，不在 §10.11。** backlog 把 §10.11 当帧长条款引是不准的；
条号本身对（这是 A-MSDU operation 那一节），但这一课要引的字段宽度得引 §9.3.2.2.2 与图 9-123。

### 1.2 Basic A-MSDU 子帧：14 字节子帧头，填充规则和 A-MPDU 一样

802.11-2024 §9.3.2.2.2，p.774–775，图 9-123「Basic A-MSDU subframe structure when not in a mesh Data frame」：

| 字段 | 字节 |
| --- | --- |
| DA | 6 |
| SA | 6 |
| Length | 2 |
| MSDU | variable |
| Padding | 0–3 |

正文：「In the Basic A-MSDU subframe, each A-MSDU subframe (except the last) is padded so that its
length is a multiple of 4 octets. The last A-MSDU subframe has no padding.」
——**和 `src/model/frames.ts:250` 那条 A-MPDU 注释「every subframe but the last is padded to a
4-octet boundary」是同一条规则**，这是这一课最便宜的一个对照。

另两种子帧格式，**本规格都不建**，理由各自成立：

- **Short A-MSDU**（§9.3.2.2.4，p.776，图 9-125）：子帧头只有 2 字节 Length。
  正文 NOTE：「The Short A-MSDU subframe format is not transmitted by non-DMG STAs.」
  **这个引擎里没有 DMG**（覆盖表没有第 20 章那一行），所以它构造不出来。
- **Dynamic A-MSDU**（§9.3.2.2.5，p.776，图 9-126/9-127）：2 字节 Subframe Control
  （Length 14 位 + DA Present + SA Present）加可选的 DA/SA。
  §10.11 p.1973：「An S1G STA transmitting an A-MSDU shall use only the Dynamic A-MSDU subframe
  format」——**这个引擎里没有 S1G**，同理构造不出来。

「MPDU containing the A-MSDU is carried in any of the following data frame subtypes: QoS Data,
QoS Data +CF-Ack, QoS Data +CF-Poll, QoS Data +CF-Ack +CF-Poll」——**只能是 QoS Data**，
所以引擎侧的门就是现成的 `this.qosWith(peer)`。
再加一句决定了 §0.2 的「A-MSDU structure is contained in the frame body of a single MPDU.
If encrypted, the MPDU is encrypted as a single unit.」

### 1.3 Table 9-34：这是把「不嵌套」那条路堵死的那张表

802.11-2024 §9.2.4.8.1 引 Table 9-34「Maximum data unit sizes and durations」，表在 p.703–705，
注在 p.706。这一刀要用的四行：

| 量 | Non-HT | HT PPDU | VHT PPDU | HE PPDU |
| --- | --- | --- | --- | --- |
| MSDU | 2304 | 2304 | 2304 | 2304 |
| A-MSDU | 3839 或 4065（见 NOTE 2），非 HT 站点 N/A | 3839 或 4065 或 7935 | 见 NOTE 3 | 2.4 GHz：3839 或 7935；否则见 NOTE 3 |
| MPDU | 见 NOTE 4 | 见 NOTE 5 | 3895 或 7991 或 11 454（并见 Table 9-313） | 2.4 GHz 见 NOTE 5；否则 3895 或 7991 或 11 454 |
| PPDU 时长 | 见 NOTE 6 | 5484（HT-mixed） | 5484 | 5484 |

**NOTE 3（p.706）是关键那一句**：「No direct constraint on the maximum A-MSDU size; indirectly
constrained by the maximum MPDU size.」

所以在这个引擎实际跑的世代上（`he` / `eht`，非 2.4 GHz），**一个 A-MSDU 的上限就是一个 MPDU 的上限**，
也就是 3 895 / 7 991 / 11 454 字节里收端声明支持的那一档。这个数在 §3.2 决定一切。

顺带：`frame-anatomy-bytes.ts:133` 那条 `out-of-scope` 引的「MSDU 最大 2304、A-MSDU 最大 3839 /
4065 / 7935、VHT 的 MPDU 三档 3895 / 7991 / 11454」——**逐个核对 Table 9-34，全对**。
那条 `limits` 是这张表在仓库里唯一一处已有的正确引用。

**本节一句标准正文也没有抄进仓库的课文或代码**：上面带引号的英文句子只出现在本规格里，
用于说明判据的来源；§5 的落地物只带条号、字段名与数值。

---

## 2. 先拆 `mac.ts`，还是先建 A-MSDU

**结论：两条都不对。先把那个重复了五遍的决定命名成一个函数（§2.4），不要拆文件（§2.3）。**

### 2.1 `mac.ts` 今天是怎么分块的（实测）

`wc -l src/engine/mac.ts` → **1 758**。
它已经被八条横幅注释分成八块了——**横幅就是一份没人执行的拆分计划**：

| 行区间 | 行数 | 块 |
| --- | --- | --- |
| 1–207 | 207 | 引入、`MacHooks` / `WifiMacCfg` / `AmpTiers` / `Edcaf` / `Awaiting` / `MuDlState` / `MuUlState` / `StaMuAwait`，以及 `effectiveParams` 与 `maxPsduBytesFor` 两个导出函数 |
| 208–411 | 204 | `class WifiMac` 的字段、构造与生命周期 |
| 412–592 | 181 | `// ---------- access procedure (per EDCAF) ----------` |
| 593–867 | 275 | `// ---------- transmission paths ----------` |
| 868–1097 | 230 | `// ---------- OFDMA (AP side) ----------` |
| 1098–1305 | 208 | `// ---------- exchange mechanics ----------` |
| 1306–1650 | 345 | `// ---------- PhyListener ----------` |
| 1651–1705 | 55 | `// ---------- NAV ----------` |
| 1706–1758 | 53 | `// ---------- helpers ----------` |

重量命令在 §4.5。

### 2.2 A-MPDU 的装配路径在哪：**它不在一处，它在五处，横跨最大的三块**

`grep -n "ampduPsduBytes" src/engine/mac.ts` → 679、804、949、954、1561、1566。
把它们按块归位，并逐个读过之后：

| 处 | 行 | 块 | 它自己做的事 |
| --- | --- | --- | --- |
| **A** `transmitFor` | 661–683 | transmission paths | `useAmpdu = this.cfg.ampduWith(peer) && mode !== 'nonht'`；`claim(ei, peer, useAmpdu ? MAX_AMPDU_MPDUS : 1, fit)`；`psdu = aggregate ? ampduPsduBytes(…) : qos ? QOS_HDR_BYTES + … + FCS_BYTES : dataPsduBytes(…)`；`respTime = airNs(aggregate ? BA_BYTES : ACK_BYTES, …)` |
| **B** `exchangeNs` | 791–812 | transmission paths | 又写一遍 `aggregate = this.cfg.ampduWith(peer) && mode !== 'nonht' && msduBytes.length > 1`，又写一遍那三路 `psdu`，又写一遍 `BA_BYTES : ACK_BYTES` |
| **C** `planBurstNs` | 735–762 | transmission paths | 第三遍：`useAmpdu = this.cfg.ampduWith(peer) && this.cfg.modeForPeer(peer) !== 'nonht'`，自己滚一个 `bytes.length < MAX_AMPDU_MPDUS` 的循环 |
| **D** `transmitDlMu` | 948–956 | OFDMA (AP side) | `airtime = (bytes) => this.airModeNs(modeAll, ampduPsduBytes(bytes), …)`；`claim(…, MAX_AMPDU_MPDUS, fit)`；`MuPart` 带 `mpduCount` |
| **E** `respondToTrigger` | 1559–1572 | PhyListener | `budget = maxPsduBytesFor(…)`；`claim(ac, null, MAX_AMPDU_MPDUS, (m, claimed) => ampduPsduBytes([…]) <= budget)`；再 `ampduPsduBytes` 算最终 `bytes` |

**三件事从这张表里读得出来：**

1. **「A-MPDU 的装配路径」这个单数不存在。** 五处各自 claim、各自算字节、各自挑响应帧。
   `ampduPsduBytes` 在每一处都被调**两次**（一次在 `fits` 闭包里试，一次定稿），所以是十次调用。
2. **「这是不是一次聚合」这个判断原文写了三遍**（A 的 661 行、B 的 803 行、C 的 737 行），
   三遍的拼写还不完全一样：A 把 `msdus.length > 1` 拆成随后的 `aggregate` 变量，
   B 把它写进同一个表达式，C 根本不判长度而是靠循环条件。
3. **这五处落在八块里最大的三块**：transmission paths (275) + OFDMA (230) + PhyListener (345)
   = 850 行 = 全文件的 **48.4 %**。

### 2.3 「先拆」的代价：它不是拆文件，是拆一个类，而今天不该做

`mac.ts` 的 1 758 行里，八块中有六块是**同一个 `class WifiMac implements PhyListener` 的方法**。
它们共享的不是几个参数，是构造期建立的那一组私有字段（`state`、`queues`、`edcafs`、`navUntil`、
`navClearHandle`、`navSetBy`、`awaiting`、`txopEndNs`、`announcedEndNs`、`ampNext`、`ampPending`、
`wantTrigger`、`reach`、`T`、`cfg`、`hooks`…）。拆它只有三条路，每条都有代价：

1. **按块拆成 mixin 或基类链** —— TypeScript 这一侧可行，但每个字段的可见性都要重定级，
   而 `private` 变 `protected` 把今天「这个字段只有这一块读」这件事从**类型保证**降成**约定**。
2. **抽出一个 context 对象，块变成自由函数** —— 最干净，也最贵：十几个字段要一个个判断
   谁写谁读，而唯一能证明没改行为的东西是 **263 条哈希 fixture**。
3. **只搬方法、不动结构（按块切成 `mac.access.ts` / `mac.tx.ts` …）** —— 省不下任何耦合，
   只把 48 % 的改动面从一个文件分到三个文件。**这一条是看起来做了而实际没做的那种。**

**而「拆了没有」这件事，今天没有任何测试能回答。**
覆盖表第 650 行把 1 758 行当成 C 项「没开始」的证据，但那是一句写在文档里的数，
**没有断言钉住它**——这正是 `docs/wifi-feature-coverage.md` 第 174 行自己讲的那条教训
（「脚本不是测试」）的另一面：**一个只在文档里的行数，和一句注释的保证是同一个保证。**

所以「先拆」的真实代价是：**一次多日的结构改造，它唯一的外部验证是 263 条哈希，
它不产生任何一条新记录，而它的完成标准今天连一条断言都没有。**
按本仓库自己的判据（「一个特性没跑出记录不算做完」），这一刀**不具备可验收的形状**。

### 2.4 「先建」的代价，与那条第三条路

**不做任何准备就建 A-MSDU 的代价，是把 §2.2 那个「写了三遍的判断」变成写了四遍，
把那十次 `ampduPsduBytes` 变成十次「A-MPDU 还是 A-MSDU 还是两层」的三岔路。**
backlog 说「在 `mac.ts` 里再加一层聚合会让下一次拆更难」——**方向对，诊断错**：
难的不是文件长，是**这个决定没有名字**，所以每加一个取值就要在五个地方各写一遍。

**第三条路，也是本规格的建议：先把那个决定命名成一个函数。**

```
// src/engine/mac.ts，紧跟 maxPsduBytesFor（它已经是这个文件里同类的导出函数）
export function psduPlan(
  msduBytes: number[], opts: { qos: boolean; ampdu: boolean; mode: PhyMode },
): { psduBytes: number; aggregate: boolean; respBytes: number }
```

它要吃下的，正是 §2.2 五处今天各自写的那三件：是不是聚合、PSDU 多少字节、响应帧是 ACK 还是 BlockAck。
五处改成调用它（A 与 B 还要把 `fits` 闭包里那次调用也换掉）。

**为什么这一步是便宜的、可验收的、而且是 C 项开场动作的真身：**

| 判据 | 这一步 | §2.3 的拆文件 |
| --- | --- | --- |
| 可证明无行为变化 | **可以**：263 条哈希 fixture 一个值都不许动，而这是一次纯提取 | 可以，但改动面大一个数量级 |
| 有一条断言能说它做完了 | **有**：`grep -c 'ampduPsduBytes' src/engine/mac.ts` 从 6 降到 0，`psduPlan` 的调用点数可断言 | **没有** |
| 它让下一刀变便宜 | **是**：A-MSDU 从改五处变成改一处 | 是，但要先付完 |
| 它自己产出记录 | 不产出，而它也不声称产出——它是重构，不是特性 | 同 |
| 代价 | 约 40 行新代码，删掉三份重复谓词；一个任务 | 多日；三到四个任务加修正轮 |

**所以结论：批 W8a（`psduPlan` 提取），不批 W8b（A-MSDU 本身）。**
W8a 做完之后 A-MSDU 是否还值得做，由 §4 的数决定——而 §4 的数说现在不值得。

---

## 3. 嵌套那一层建不建，以及真正「允许但空转」的是哪一条

### 3.1 backlog 的判断，核过：**理由对着的是另一件事**

backlog 第 611–613 行：A-MSDU 与 A-MPDU 可以嵌套，「而这个引擎的 PPDU 是整帧解码模型
（见覆盖表第三节），所以**嵌套的那一层在这里量不出新东西**——规格里要先决定建不建那一层，默认**不建**」。

把它拆成两句话来核：

- **「整帧解码，所以嵌套不改失败行为」——对。** 覆盖表第三节与 `mac.ts` 自己的注释
  （「no per-subframe bitmap to partially fail on」）都成立。嵌不嵌套，一个 PPDU 要么整体解出要么整体失败。
- **「所以嵌套那一层量不出新东西」——不对。** 嵌套改的不是失败行为，是**字节数与空口时间**，
  而那恰好是这一课唯一能量出的东西（§4.1）。这句话把**失败语义**和**字节算术**接在了一起。

### 3.2 而 Table 9-34 把「不嵌套」那条路堵死了

**判定：嵌套那一层是这一刀唯一付得出钱的形状；不嵌套的那一条反而要拒。**

论证只有三步，每一步都有数：

1. **不嵌套时，一个 A-MSDU 的上限 = 一个 MPDU 的上限。** §1.3 的 Table 9-34 NOTE 3。
   在 `he` / `eht` 上那是 3 895 / 7 991 / 11 454 字节。
2. **把那三档换算成 MSDU 个数**（`amsdu-math.ts`，§4.5）：

   | MPDU 上限 | 1 500 B 载荷 | 200 B 载荷 | 64 B 载荷 |
   | --- | --- | --- | --- |
   | 3 895 | **2** 个 | 17 个 | 48 个 |
   | 7 991 | **5** 个 | 36 个 | 99 个 |
   | 11 454 | **7** 个 | 52 个 | 142 个 |

3. **而本语料的聚合 PPDU 常态装多少？** 264 个场景跑 30 ms（`agg-census.ts`，§4.5），
   数据 PPDU 的 `ampdu.mpduCount` 直方图：

   ```
   n=1: 7680   n=2: 11   n=3: 28   n=4: 14   n=5: 138   n=8: 4   n=9: 101
   n=11: 28    n=12: 2   n=14: 24  n=15: 5   n=16: 5    n=19: 65
   n=20: 1219  n=50: 1
   ```

   **最常见的是 20，最大的是 50**（`household|work-from-home`）。而 §4.3 另一份普查说
   这些 PPDU 的载荷**全部**在 1 200 字节以上。

**三步接起来：不嵌套的 A-MSDU 会把今天装 20 个 1 500 字节 MSDU 的 PPDU 砍到 7 个。**
那不是省，那是一次吞吐倒退；而「省掉 n−1 份帧头」的那个卖点在 n 只能到 7 的时候也小得多。
**所以 backlog 默认的那个取值（建不嵌套的、不建嵌套的）恰好是唯一一个会让引擎变差的取值。**

### 3.3 真正「允许但空转」的那一条：**子帧级失败隔离**，按六步处置

`docs/inert-config-contract.md` 的六步，对着**这一刀真的会想加的那个字段**走一遍。
那个字段不是「建不建嵌套」（§3.2 已判定它有后果），是任何表达
「A-MSDU 没有子帧级校验、A-MPDU 有」的开关——叫它 `perSubframeCheck` / `partialRetry` 都一样。

**第一步 · 前置普查，扫全部课程场景与变体，不读代码猜。**
照契约点名的查法做了：`LESSONS` 的 `scenario()` 与 `variants[*].scenario()`，加 `HOUSEHOLDS`
与 `defaultScenario()`，共 **264** 个场景（= 覆盖表第十七节那 256 个 + 7 个编辑器家庭 + `defaultScenario`，
这三个数相加正好对上，也顺便证明了普查没漏）。
跑 30 ms 与跑 2 s 两遍（`agg-census.ts` / `small-agg.ts`，§4.5）。
**结果：2 秒里 117 719 个聚合 PPDU，一个子帧级结局都没有**——不是「很少」，是**记录类型里没有这种东西**：
`TLRecord` 的 `TX_START` / `TX_END` 只带一个 `FrameDesc`（`src/model/records.ts:35-36`），
`FrameDesc.ampdu` 只有 `{ mpduCount, msduIds }`（`src/model/frames.ts:188`），没有逐子帧结局字段。
**没有一门课在演示这样一个字段，因为这样一个字段不存在。**

**第二步 · 能不能只钉住现状？两种情形都不成立。**
(1) 它不是任何一门课的教具（读者点不到它，它不存在）；
(2) 「它什么都不做」本身也不是要教的事实——**那个事实已经被教了**，在
`src/course/tier2/ampdu.ts:143` 的 `unmodelled` 里（没有 ADDBA、没有重排序窗口），
与覆盖表第三节那一行里。所以加一个字段再钉住它，是**给一个已经被教过的事实再造一个载体**。

**第三步 · 拒绝的门槛是「读不到」。成立。**
`perSubframeCheck` 在哪条路径上都读不到：判决在 `src/engine/channel.ts` 由整帧最差的那个比值决定
（`frame-qos-fcs.ts:63` 的课文已经把这件事说破：「这台引擎里没有一次 CRC」），
失败后 `queues.restore` 退回**全部**被 claim 的 MSDU。**这是接线问题，不是效果小。**

**第四步 · 拒绝之后，物理证据要从还合法的那一侧量得出来。有，而且今天就能量。**
还合法的那一侧是「A-MSDU 的 PPDU 与 A-MPDU 的 PPDU 装同一串 MSDU 时，失败的后果逐字节相同」。
这正是 `greedy ≡ cw` 那个形状，**而它该变成一条 `tests/engine/` 的断言**（§5.4），
不是一条注释。**这是这一刀唯一一条我建议无条件落地的测试。**

**第五步与第六步 · 不适用，而这是好事。**
因为处置是**在设计期不加这个字段**，而不是加完再 `superRefine` 拒掉：
没有新字段 → 没有新拒绝消息 → 没有两份会漂的措辞 → 没有被 `scenarioLoadIssues` 变长的句子。
`src/model/scenario.ts` 的四个导出拒绝函数（`selectivityRefusals`、`driverRefusalsFor`、
`ancillaryRequestRefusals` 与 `superRefine` 本体）**数目不动**，
而契约第 4 节说得很清楚，那个计数跟着导出函数长、不跟着规则条数长。

**第三步与「设计期拒掉」的区别，写明白免得下一个人以为可以省掉上面五步：**
契约第三步讲的是「schema 已经收下了这个字段，现在要不要拒」。
这里的处置更早一步——**连字段都不加**。但六步仍然要走完，因为**第一步那个普查是决定该不该加的依据**，
而 2026-10-05 那一刀的教训正是「先拒后查」会把三条绿测试打红。

### 3.4 §3 的三条判定，摆在一起

| 候选 | 判定 | 依据 |
| --- | --- | --- |
| 嵌套的 A-MSDU（A-MSDU 装进 A-MPDU 子帧） | **若这一刀被批，只建这一个** | §3.2：它是唯一不倒退的形状 |
| 不嵌套的独立 A-MSDU | **不建** | §3.2：Table 9-34 的 MPDU 上限会把 20 个 MSDU 的突发砍到 7 个 |
| 任何表达子帧级失败隔离的配置 | **设计期拒掉 + 用一条引擎测试钉住两者等同** | §3.3 的六步 |
| Short / Dynamic A-MSDU 子帧格式 | **不建** | §1.2：标准把它们限定在 DMG / S1G，而这个引擎没有这两者——触发它们的前提构造不出来，和 W4 第 2 条同形 |

---

## 4. 这一课能量出什么，而闸门怎么判

### 4.1 重量过的算术（每个常数标出处）

| 常数 | 值 | 出处 |
| --- | --- | --- |
| `QOS_HDR_BYTES` | 26 | `src/engine/phy.ts:463` |
| `FCS_BYTES` | 4 | `src/engine/phy.ts:66` |
| `AMPDU_DELIMITER_BYTES` | 4 | `src/engine/phy.ts:462` |
| `MAX_AMPDU_MPDUS` | 64 | `src/engine/phy.ts:464` |
| `MAX_PPDU_NS` | 5 484 000 | `src/engine/phy.ts:465`（aPPDUMaxTime；Table 9-34 的 5484 µs） |
| `ACK_BYTES` | 14 | `src/engine/phy.ts:67` |
| `BA_BYTES` | 32 | `src/engine/phy.ts:455`（compressed BlockAck） |
| A-MSDU 子帧头 | **14** | 802.11-2024 §9.3.2.2.2 图 9-123（DA 6 + SA 6 + Length 2）——**引擎里没有这个常数，这一刀要新建** |
| 单个 MPDU 上限 | 3 895 / 7 991 / 11 454 | Table 9-34 的 VHT/HE 行并见 Table 9-313——**引擎里没有，这一刀要新建** |

**每子帧的非载荷字节，与载荷大小无关**（`amsdu-math.ts`）：

| 载荷 b | A-MPDU 子帧 | 其中开销 | A-MSDU 子帧 | 其中开销 | 差 |
| --- | --- | --- | --- | --- | --- |
| 64 | 100 | 36 | 80 | 16 | **20** |
| 128 | 164 | 36 | 144 | 16 | **20** |
| 200 | 236 | 36 | 216 | 16 | **20** |
| 512 | 548 | 36 | 528 | 16 | **20** |
| 1 500 | 1 536 | 36 | 1 516 | 16 | **20** |

**整个 PSDU，b = 1 500：**

| n | A-MPDU | A-MSDU | 省 | 占比 |
| --- | --- | --- | --- | --- |
| 1 | 1 534 | 1 544 | **−10** | −0.65 % |
| 2 | 3 070 | 3 060 | 10 | 0.33 % |
| 4 | 6 142 | 6 092 | 50 | 0.81 % |
| **14** | **21 502** | **21 252** | **250** | **1.16 %** |
| **20** | **30 718** | **30 348** | **370** | **1.20 %** |
| 64 | 98 302 | 97 052 | 1 250 | 1.27 % |

n = 14 那一行的 21 502 不是我算的，**是 `src/course/tier1/small-frames.ts:30` 的
`BURST_BYTES = 21_502`**——它正是 `@small-frames` 今天在课文里写的那个数。这一课要接的就是它。

**空口时间**（`he`、20 MHz、1 空间流，`txTimeModeNs` + `txTimeNs`，`amsdu-math.ts`）：

占比的算式写明，因为它是可被引错的那一类：
`省 = (数据段_A-MPDU − 数据段_A-MSDU) ÷ (数据段_A-MPDU + 响应)`，**响应两侧都是 BlockAck 32 B**。

| MCS | n × b | 数据段 | 响应 | 整个交换省 |
| --- | --- | --- | --- | --- |
| 5 | 20 × 1 500 | 3 620.8 → 3 580.0 µs | BA 32.0 µs（两侧相同） | 40.8 µs，**1.12 %** |
| 7 | 20 × 1 500 | 2 913.6 → 2 872.8 µs | 同 | 40.8 µs，**1.39 %** |
| 9 | 14 × 1 500 | 1 553.6 → 1 526.4 µs | 同 | 27.2 µs，**1.72 %** |
| 11 | 20 × 1 500 | 1 771.2 → 1 744.0 µs | 同 | 27.2 µs，**1.51 %** |
| 7 | 20 × 64 | 234.4 → 207.2 µs | 同 | 27.2 µs，**10.2 %** |
| 5 | 20 × 64 | 288.8 → 234.4 µs | 同 | 54.4 µs，**17.0 %** |
| 11 | 64 × 64 | 411.2 → 343.2 µs | 同 | 68.0 µs，**15.3 %** |

**所以嵌套形状的区间是：1 500 字节载荷 1.1 %–1.7 %，64 字节载荷 10 %–17 %。**

> **一处要当心，否则这张表会被引错。** `amsdu-math.ts` 的原始输出**比上表每行多省 4 µs**，
> 因为它把响应帧从 BlockAck（32 B）换成 ACK（14 B）一起算了进去。
> **那只在不嵌套的形状下成立**（一个 MPDU 用 ACK 确认），而 §3.2 已经判定不建那个形状。
> **嵌套的形状响应仍然是 BlockAck，所以上表的「响应」一栏两侧相同，省的全部来自数据段。**
> 上表每一行都是我把探针那一行减掉 4 µs 再按上面那条算式重算的；
> 本规格后文每一处引用的都是嵌套形状的数。

### 4.2 结论一：这笔交易只有省的那一半

§0.2 已经说过，这里把它变成一句可以直接写进课文的话：

**在这个仿真器里，A-MSDU 相对 A-MPDU 只有收益，没有代价。**
代价那一半（没有子帧级校验）在标准里真实存在，而在这个引擎里 A-MPDU 本来就一丢全丢。
所以这一课**不能**写成「省字节 vs 一丢全丢」的取舍课——那会是一句被一条绿测试钉住的假话，
正是 W1 那一刀抓到的那类缺陷。它只能写成：**这个省是多少、它什么时候可观、以及为什么这个房间里不可观。**

### 4.3 结论二：闸门（W5 的那条）—— 跑了，数不好看

照 W5 那条规矩（「251 个场景里一条记录都不出的特性，不许只写一门介绍它的课」），
我把普查跑到**读者真正看得到的那条时间轴**上。**不是测试窗口**——
`DEFAULT_RUN_NS = 30 ms`（`tests/course/kit.ts:42`）只是测试常数，
而 `Player.load` 一开口就向 worker 要 `LOOKAHEAD_NS = 2_000_000_000`
（`src/player/player.ts:12`，已核）。所以两个窗口都跑了，**而两个窗口给出不同的答案**：

| 窗口 | 场景 | 聚合 PPDU（`mpduCount ≥ 2`） | 平均 MSDU ≥ 1 200 B | < 300 B |
| --- | --- | --- | --- | --- |
| 30 ms | 264 | 1 645 | **1 645（100 %）** | **0** |
| 2 s | 264 | 117 719 | 117 694（99.98 %） | **23** |

**所以：**

- **在测试窗口里，这一课要教的那个区间一条记录都不出。** 一门写在 30 ms 窗口上的课测试，
  **看不到它自己要讲的东西**——而那条测试会是绿的，因为它不会去问。
  这就是 W1 那条教训提前应用：**「读者看不见」要对着 `LOOKAHEAD_NS` 核，不要对着测试窗口。**
- **在读者的 2 秒里，小帧聚合出现 23 次，占 0.02 %。** 它们每次省 10 到 50 字节（4.0 %–10.5 %），
  `n` 只有 2 到 4。全部集中在四个场景：`wan-rtt|v0`、`wan-rtt|v1`、
  `household|full-house`、`household|three-gamers`——也就是跑游戏业务的那几个。
- **剩下 117 694 个 PPDU 每个省 370 字节左右**，也就是**字节数的 1.20 %**、
  **整个交换空口时间的 1.1 %–1.7 %**（§4.1 的两张表分别是这两个量，别把它们混成一个数）。
  那是真的、可复现的、
  而且完全由标准常数推出来的——但它是一个**要放大才看得见的数**。

### 4.4 结论三：把它推进「可观」那个区间，需要发明数字

A-MSDU 要同一个 TID、同一个 RA 的**两个以上 MSDU 同时在队**（§1.1）。
本引擎的九种业务档位（`src/model/scenario.ts:61`）里，小帧的那几种**都不积压**：

| 档位 | 帧长 | 节奏 | 读出来的地方 |
| --- | --- | --- | --- |
| `gaming` 上行 | 89 / 91 / 100 / 131 B | 实测直方图，约 33 fps | `src/engine/traffic.ts` 的 `WZRY_UL_SIZES` / `WZRY_UL_GAPS` |
| 游戏服务器下行 | 133–203 B；约五个 tick 里有一个另带 52–76 B | 65 ms ± 3 ms | 同上 `WZRY_DL_UPDATE` / `WZRY_DL_SMALL` |
| `voice` | 200 B | 每 20 ms | `scheduleVoice` |
| ping | 64 B | 每 250 ms ± 10 % | `PING_BYTES` / `PING_PERIOD_NS` |
| `iot` | 约 100 B | 稀疏 | `smart-home` 家庭的 blurb 自己写「6 Mb/s 下一条 100 字节的读数」 |

**而三种会积压的档位全是大帧**：`backup`（每 60 ms 一次 50 × 1 500 B）、
`browsing`（20–80 × 1 400 B，间隔 1 ms）、`saturated`。

一个 33 fps 的流要排到深度 4，介质得被堵住约 100 ms——**而实测最深的那一次正是 4**
（`wan-rtt|v0`，n = 4，平均 84 B，省 50 B）。要排到深度 20 得堵约 600 ms，
**那个场景教的是饿死，不是聚合**。

**所以要让这一课量出那 17 %，得新造一条「大量小帧积压」的业务档位。
而现有那两条小帧档位是从真机抓包测出来的**（`src/engine/traffic.ts:105-107`：
王者荣耀，华为手机 USB 镜像，2026-09-09，十分钟对局），
**一条「小帧积压」的档位没有这样的来源，只能发明。**
backlog 给 W8 过的那条第 2 判据原话是「不需要发明数字」——
**这一刀真正要发明的那个数字不在帧长里，在业务形状里，而 backlog 没看那一侧。**

### 4.5 重跑本节每一个数

四个探针都在 scratchpad，`tests/` 下没有建任何临时文件：

```bash
cd D:/wifi_sim/.claude/worktrees/feat-link-2g
S="C:/Users/T00965~1/AppData/Local/Temp/claude/D--wifi-sim/d228a212-82ef-42bf-bc86-7123f327b295/scratchpad"

# §4.1 的字节与空口时间表，以及 §3.2 的三档 MPDU 上限换算
npx vite-node --root "$PWD" "$S/amsdu-math.ts"

# §3.2 的 mpduCount 直方图与 §4.3 的 30 ms 一行（264 个场景）
npx vite-node --root "$PWD" "$S/agg-census.ts"

# §4.3 的两行普查；RUN_NS 不给就是 30 ms
RUN_NS=2000000000 npx vite-node --root "$PWD" "$S/small-agg.ts"

# §0.3 / §0.4 的棘轮、课数、模块数、分钟数、字数
npx vite-node --root "$PWD" "$S/w8-ratchet.ts"

# §6.2 的五分钟档位余量
npx vite-node --root "$PWD" "$S/w8-buckets.ts"

# §2.1 的分块行数
python - <<'PY'
lines=open('src/engine/mac.ts',encoding='utf-8').read().split('\n')
marks=[(1,'preamble'),(208,'class fields/ctor')]+[(i+1,l.strip()) for i,l in enumerate(lines) if l.startswith('  // ----------')]+[(len(lines),'EOF')]
for (a,t),(b,_) in zip(marks,marks[1:]): print(f'{a:5d}-{b-1:5d} {b-a:5d}  {t}')
PY
```

探针用 `/src/...` 形式的根相对引入，所以 `--root` 必须指向这个 worktree。
`small-agg.ts` 的 2 秒那一遍约跑十分钟，建议 `run_in_background`。

---

## 5. 若仍要批：建什么（这一节是条件性的，前提是 §8 的结论被否掉）

### 5.1 引擎：一个取值，不是一个开关族

- **`src/engine/phy.ts`**：加 `AMSDU_SUBFRAME_HDR_BYTES = 14`（§9.3.2.2.2 图 9-123）
  与 `MAX_MPDU_BYTES`（3 895 / 7 991 / 11 454 三档，Table 9-34 并见 Table 9-313）。
  **两个都是标准里的数，不是本仿真器选的**，所以进 `sources` 而不是 `limits` 的 `model-value`。
- **`src/model/frames.ts`**：加 `amsduSubframeBytes(b)` 与 `amsduPsduBytes(list)`，
  形状照它旁边的 `ampduSubframeBytes` / `ampduPsduBytes`（`:245` / `:251`）——
  **填充规则同形是这一课最便宜的对照**，所以两个函数要并排放、注释互指。
- **`FrameDesc`**：`ampdu` 旁边加 `amsdu?: { perMpdu: number[] }`
  （每个 A-MPDU 子帧里装了几个 MSDU）。**不是 `boolean`**：嵌套时每个子帧装的个数可以不同，
  而一个布尔值会让 `frameFields.ts` 的字节尺无法画。
  `MuPart` 同样要加——否则 OFDMA 下行那一路画不出来（§2.2 的 D）。
- **`src/model/scenario.ts`**：节点侧一个能力位，**默认关**。
  默认关是硬要求：开着会动 117 694 个 PPDU 的字节数，263 条哈希全红。
  能力是**两端取与**（`src/model/caps.ts` 的 `negotiated`），照 `ampdu` 今天的样子——
  §1.1 的标准正文正好也这么说（没收到对端 HT Capabilities 就不许发）。
- **装配**：**改一处**——`psduPlan`（§2.4）。这是 W8a 先行的全部意义。

### 5.2 要先做 W8a，否则这一节的工作量翻五倍

没有 `psduPlan` 时，§5.1 的「改一处」会变成 §2.2 那五处各改一遍，
每处都要在 `fits` 闭包里和定稿处各写一次三岔路，**也就是十处**。
**这是 backlog「引擎：小」那个判断不成立的地方**：小的是概念，不是改动面。

### 5.3 UI 与模型侧四处，一处今天就是错的隐患

| 位置 | 今天 | A-MSDU 之后 |
| --- | --- | --- |
| `src/model/frameFields.ts:407-413` | `f.ampdu` 时按 `msduBytes` 逐个 `dataMpdu(..., inAmpdu: true)` 画字节尺 | 每个子帧内部要再分成 n 个 A-MSDU 子帧（14 B 头 + 载荷 + 填充） |
| `src/model/view.ts:551` | `fallback = r.frame.ampdu ? r.frame.bytes / mpduCount - 34 : r.frame.bytes - 28` | **那个 34 是写死的 4+26+4**，A-MSDU 下它会给出错的载荷估计。这一刀要改它，或者让它走新函数 |
| `src/model/view.ts:555` | `myPart.bytes / Math.max(1, myPart.mpduCount) - 34` | 同上，MU 那一路 |
| `src/ui/format.ts:98` | `` const agg = f.ampdu ? ` A-MPDU×${f.ampdu.mpduCount}` : '' `` | 要能印出两层，而这行是读者在时间轴上看到的那行字 |

### 5.4 一条无条件落地的测试（即使 W8b 不批也该有）

这是 §3.3 第四步那份证据，换成断言：

> `tests/engine/aggregation-failure-inert.test.ts`：
> 同一串 MSDU，一次装成 A-MPDU、一次装成嵌套 A-MSDU，在同一次失败上
> 退回队列的 MSDU 集合、`DROP` / `DEQUEUE` 记录序列、重试计数**逐项相同**。
> 配一条反面断言（种一个「只退回一半」的构造必须被抓到），
> 照 `tests/model/driver-scenario.test.ts` 末尾那个 census 的形状——
> **一个数不出东西的普查会报出同一个零。**

**W8b 不批时它还有意义吗？有，而且更有。** 它钉住的是**今天**的 A-MPDU 行为
（整帧成败、全部退回），而覆盖表第三节与 `@ampdu` 的 `limits` 都在说这件事而没有断言钉住它。
那正是 `docs/wifi-feature-coverage.md:174` 自己讲的「脚本不是测试」的同一个坑。
**所以它应当从 W8b 里拆出来，和 W8a 一起落地**（`tests/engine/ampdu-whole-ppdu.test.ts`，
只测 A-MPDU 那一半，不需要 A-MSDU 存在）。

### 5.5 课程落点（条件性）

- **归属**：M7（QoS 与效率），**模块已存在**，所以不碰 `TIERS`、不碰 UWB 的 `module` 索引。
- **`needs`**：`ampdu`（它教第一层聚合）。`small-frames` 是更自然的前驱但它在 Tier 1 的 M3，
  跨层的 `needs` 要先确认 `needsClosure` 怎么判——**这件事动手前要 `grep` 一次
  `src/course/curriculum.ts` 的 `needsClosure`，不要照我这句话办。**
- **`picture` 的第一个 `watch` 要落在前三块之内**（`tests/course/kit.ts:140`）。
- **`jump` 要避开密集区。** `capstone` 跑 2 秒有 2 773 个聚合 PPDU；
  `src/ui/EventLog.tsx:33` 的 `.slice(-160)` 在密集区只留窗口里最后 160 条，
  于是**跳到了，那一行记录仍然可能渲染不出来**（W1 实测：窗口 551 条、首行落在播放头之后 101.6 µs）。
  所以这一课的 `jump` 要么落在场景开头前几个聚合 PPDU 上（稀疏区），
  要么课文老实说明读者会看到的是时刻与后果、不是那行字。**这件事已单独进队列，不在这一刀里修。**
- **会变成假话、必须同刀改掉的三句**：
  1. `src/course/tier2/ampdu.ts:144`：「**引擎不做 A-MSDU**——把多个上层包塞到同一个
     MAC 帧头下面的那一层聚合」——直接失效。
  2. 同一行后半句：「所以这里每 1500 字节载荷都要自带 36 字节的非载荷字节（含补齐）」——
     **这个 36 是对的**（§4.1 实测），但「所以」的前提变了。
  3. `src/course/tier2/ampdu.ts` 同条末句：「真实设备常常两层聚合一起用，同样的空口时间装得更多」——
     变成本仿真器也做的事，措辞要改。
  另有一处**不是**假话、不要误改：`src/course/tier1/small-frames.ts:139` 那条 quiz 解释
  「每一帧都保留自己的帧头和校验——突发之所以是 21 502 B，原因就在这里」——
  **它讲的是 A-MPDU，仍然为真**。而同一道题的选项 0「省下帧头和校验：十四帧变成了一帧」
  **正是 A-MSDU**，它作为错项仍然成立（那道题问的是 A-MPDU 省了什么）。
  **这四处要一起读，别只改前三处。**

---

## 6. 口径代价（条件性，但每个数都已经量过）

### 6.1 棘轮：先还 3，再谈新课的

§0.4 量出来的：`A-MSDU` 一进 `ZH_TERMS`，`criterion Q` 从 **292 → 295**，
来自 `frame-qos-fcs`、`frame-anatomy-bytes`、`ampdu` 三门旧课的 `limits`。
而断言是 `toBeLessThanOrEqual(292)` 且**292 既是上限也是现值**，零余量。

**两条合法的还法**（测试自己的 docblock 列的，`tests/course/readability.test.ts:940-958`）：
在那门课的主路径上补一句、在首次使用处带括号；或者把那条 `limits` 改写掉。
**抬上限需要人同意，不是因为红了就去做的事。** 本规格不建议抬。

**还债的具体形状**（三门课各一句，首次使用处带括号，窗口 40 字符）：
`聚合 MSDU（aggregate MSDU, A-MSDU）`。
`frame-anatomy-bytes` 那条最自然——它的 `out-of-scope` 已经在引 Table 9-34 的 A-MSDU 上限，
主路径上补一句「那三个上限管的是把多个载荷装进同一个帧头之下的那种聚合」即可。

### 6.2 五分钟档位：三门要改的课都有余量

`w8-buckets.ts`（`CHARS_PER_MINUTE = 220`、`OBSERVE_MINUTES = 2`、`TRY_MINUTES = 4`，
余量公式 `(5·(k+0.5) − raw) × 220`，`k = round(raw/5)`）：

| 课 | raw | 取整 | 到下一档余量 | 主路径字数 | 到 4 400 还剩 |
| --- | --- | --- | --- | --- | --- |
| `ampdu` | 22.97 | 25 | **996 字** | 2 414 | 1 986 |
| `frame-anatomy-bytes` | 21.16 | 20 | **294 字** | 2 016 | 2 384 |
| `frame-qos-fcs` | 17.79 | 20 | **1 036 字** | 1 274 | 3 126 |
| `small-frames`（只读，不改） | 18.11 | 20 | 966 字 | 1 344 | 3 056 |

**三门都放得下一句三十到六十字的话，1 850 那条等式不动。**
最紧的是 `frame-anatomy-bytes` 的 294 字，仍有约五倍余量。

**而全课程最紧的两门一个字也不许碰**（brief 这两条我核过，见 §0.3）：
`@rate` 余量 **1.0 字**、`@edca` 余量 **16.0 字**。
第三、第四紧的是 `@uwb-reply-time` 4.0 字与 `@uwb-m2m` 5.0 字，同样别碰。

### 6.3 课数、模块数、字数

- 课数 `toBe(87)` 是精确断言，加一门必然红——**那是设计意图**，改成 88 是这一刀的一部分。
- 模块数 `toBe(30)` **不动**（M7 已存在）。
- 新课主路径按 backlog 的 **+2 200 ± 300** 落在 (700, 4 400) 的中间三分之一，没有压力。
- 分钟数 1 850 要加上新课的档位。
- **一处与覆盖表的轻微漂移，记在这里但不是这一刀的事**：
  覆盖表第十七节记「全课程主路径汉字 191 285」，我重量到 **191 386**（`w8-ratchet.ts`），
  差 101 字。那张表的断言是区间（> 100 000 且 < 300 000），所以没有红；
  **这个数在那张表里是手写的，所以它会漂**。记一笔，留给下一刀改那一节的人。

### 6.4 覆盖表与 fixture

- `docs/wifi-feature-coverage.md:246` 的 A-MSDU 那一行要从 `未建模` + 「未偿的债」
  改成 `已建模` + `@课号`。**这张表有 `tests/course/wifi-coverage.test.ts` 当场核它**：
  第四列那两条纪律（未建模必须带裁定、非未建模必须带课号或「引擎建了，无课」）、
  每个符号与课号必须存在、**而且自述的十五个数都要跟着改**：
  第 109 行「全表 120 行」、第 60 行「107 处 `#` 形引用（去重 95 个符号）与 55 个课号」、
  以及第 107–135 行那三张计数表里 `已建模` 77→78、`未建模` 33→32、
  `带 @课号` 94→95、`未偿的债` 16→15。**自述数是「读出来再比」，文件里一个写死的数都没有**，
  所以漏一个就红。重跑脚本在那张表第 140 行起的代码块里。
- 第 650 行 C 项那一格写着「`mac.ts` 今天 1758 行，一行没拆」与「A-MSDU…没有」。
  W8a 落地后行数会变（提取会净增约 40 行再删掉三份谓词），**W8b 落地后那句「A-MSDU 没有」失效**。
- **fixture 只许增行。** `tests/fixtures/lesson-hashes.json` 今天 263 条
  （= 256 个场景 + 7 个编辑器家庭；我的普查数到 264，多的那一个是 `defaultScenario`，
  它不在 fixture 里）。新课加 1 条加变体。
  `UPDATE_HASHES=1` 只许在全部落地且 `tests/course` 全绿之后跑一次。
  **而默认关那个能力位是 fixture 不动的全部保证**（§5.1）。

---

## 7. 验收（给 W8a，它是本规格唯一建议批的那一刀）

1. `npx tsc -b --force` exit 0。
2. `npx vitest run` 全绿，**而且 `tests/fixtures/lesson-hashes.json` 一个字节没动**
   （`git diff --stat tests/fixtures/` 为空）——这是「纯提取」这个说法的全部证据。
3. `grep -c 'ampduPsduBytes' src/engine/mac.ts` 从 **6** 降到 **0**；
   `grep -c "ampduWith(peer)" src/engine/mac.ts` 从 **3** 降到 **0**。
   （今天的值：`grep -n` 给出 679、804、949、954、1561、1566 六处，
   与 661、737、803 三处谓词。）
4. `psduPlan` 的调用点数在一条断言里，而不是在一句注释里。
5. `tests/engine/ampdu-whole-ppdu.test.ts`（§5.4 的那一半）绿，并带一条反面断言。
6. 覆盖表第 650 行的 `mac.ts` 行数跟着改，而第十六节那一格的结论（C 项「没开始」）
   **要诚实地改成「开始了一步，而那一步不是拆文件」**。

---

## 8. 结论与疑虑

### 8.1 建议

| 条目 | 建议 | 一句话理由 |
| --- | --- | --- |
| **W8a** 提取 `psduPlan`，把同一个决定从五处收成一处 | **批** | 可被 263 条哈希证明无行为变化；有可断言的完成标准；它是 C 项开场动作的真身 |
| **W8a′** 把「A-MPDU 整帧成败、失败全部退回」钉成一条引擎测试 | **批**（和 W8a 同刀） | 覆盖表与 `@ampdu` 都在说它而没有断言钉住它；它同时是将来 A-MSDU 那条等同性测试的一半 |
| **W8b** A-MSDU 本身 + 新课 | **不批，现在不做** | §4.3：在读者的 2 秒里，这一课要教的那个区间占 0.02 %；§4.4：把它推进可观区间要发明一条业务档位；§4.2：这笔交易在这个引擎里没有代价那一半 |
| 拆 `mac.ts` 成多个文件 | **不批** | §2.3：它拆的是一个类而不是一个文件；多日；唯一外部验证是 263 条哈希；没有一条断言能说它做完了 |
| 不嵌套的独立 A-MSDU | **不建**（即使 W8b 日后被批） | §3.2：Table 9-34 的 MPDU 上限会把 20 个 MSDU 的突发砍到 7 个 |
| 子帧级失败隔离的任何配置 | **设计期拒掉** | §3.3 的六步；处置比「加完再 `superRefine`」更早一步，所以四个导出拒绝函数不动 |

形状照 backlog 里「立案并建议不批」的先例。**而先例是五条，不是 brief 说的四条**：
`docs/wifi-course-backlog.md` 的 **W2（286 行）、W4（510 行）、W6（535 行）、W7（559 行）、
W10（643 行）**，五条都在它的总表第 32–40 行带着同一句裁定；
4d 与 5b 是这个形状的来源而不是这张表里的条目（那张表第 45 行自己说明了这一点）。
查法：`grep -n "立案，建议不批" docs/wifi-course-backlog.md`。
按那份文件第 704 行自己立的规矩——**「立案并建议不批」的条目不许删，理由不许搬家**——
本规格的理由留在这里，backlog 里只留一行指过来，并记下重新考虑的条件（§8.2）。

### 8.2 什么时候该重新考虑 W8b

**一个条件，可检验：当仓库里出现一条有真实来源的「小帧积压」业务档位时。**
今天没有，而发明一条违反 backlog 自己的第 2 判据。
注意这个条件**不是** W8b 的附属品——`@small-frames`、`@queues`、`iot` 那几门课
都会从它受益，所以它该作为独立一刀立案（业务档位的来源问题），而 W8b 排在它之后。
那一天 A-MSDU 的数会从 1.1 %–1.7 % 变成 10 %–17 %，而那时它确实够得上一门课。

### 8.3 我的疑虑，四条

1. **我没重跑全量 266 文件 / 7 623 条。** 本规格不动源码，所以没有重跑的理由；
   但我引的每一个课程侧的数（292 / 87 / 30 / 1 850 / 字数 / 档位余量）都是用
   `src/course/readability.ts` 与 `curriculum.ts` 的**同一批导出函数**在探针里重算的，
   不是读测试文件里的字面量。**如果那批导出函数和测试里的用法有出入，我的数就会偏**——
   而我用 `bracketedAtFirstZhUse` 时刻意传了同一个 `all` 参数，就是为了减小这个风险。
2. **`needs: ['ampdu']` 这个落点我没有核 `needsClosure` 的跨层行为**（§5.5 已标明）。
   M7 的课以 M3 的课为前驱是否合法，要在动手前读 `src/course/curriculum.ts`。
3. **§5.3 那四处 UI 改动我是读出来的，没有跑过。** 特别是 `view.ts:551` 那个写死的 `34`：
   我判断它在 A-MSDU 下会给出错的载荷估计，但那是一条 `fallback` 分支，
   **它在什么条件下真的被走到，我没有量**。如果 W8b 日后被批，这一条要先量再改。
4. **最要紧的一条：我这份规格推翻了 backlog 对 W8 的两条判据各一半**
   （判据 1 的「代价」那一半不存在，判据 2 的「不发明数字」在业务档位那一侧不成立），
   而 backlog 那一节是**在不知道这两件事的情况下**写的「建议批」。
   **所以这份规格的结论与 backlog 第 38 行表格里的「批」直接冲突**——
   那一行要改成「立案，建议不批（W8a 批）」，而**改它需要人同意**，
   本规格没有改它，只是写明了冲突在哪。

---

## 9. 本规格没做的事

- 没有 `git add`、没有 commit、没有派子 agent。
- 没有改任何源码、任何测试、任何 fixture。
- 没有改 `docs/wifi-course-backlog.md` 第 38 行那个「批」（§8.3 第 4 条说明了为什么）。
- 没有改 `docs/wifi-feature-coverage.md`（§6.4 列出了它该怎么改，但那是 W8b 落地时的事）。
- 没有起开发服务器，没有碰十二个端口上的任何进程。
- 没有把标准正文抄进仓库：§1 带引号的英文句子只在本规格里出现，用来交代判据的来源；
  §5 的落地物只带条号、字段名与数值。
- **两处顺手发现、不在这一刀里修的既有缺陷，记在这里免得下一个人重新发现：**
  1. `src/ui/glossary.ts` 的 `A-MPDU` 条目写「最多打包 64 个 MPDU（**上限 4 ms**）」，
     而 `MAX_PPDU_NS = 5_484_000` 是 **5.484 ms**（Table 9-34 的 5484 µs）。**术语表那个 4 ms 是错的。**
  2. 同一文件的 `BlockAck` 条目写「用一个帧的位图逐个确认 A-MPDU 中的每个 MPDU，
     **因此只需重传丢失的那些**」——**这个引擎不做这件事**（§0.2）。
     这是「说的和仿真的不一致」那一类，而且它正好是 W8b 的课文最容易踩上去的一句。
     **两条都该独立立案。**
