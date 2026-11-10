# 测距轮次组：一条控制消息管的是块里的轮，不是块（W1 会话结构）

2026-11-10。`docs/uwb-standard-audit.md` 的 #23、#9、#13、#10，以及 #1 的余下部分；
工作计划 `docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md` 的 W1。
只改引擎（与引擎直接相连的 schema、编辑器校验、帧检查器）；课文只改到「不再说错」为止。

## 1. 标准怎么规定（IEEE Std 802.15.4-2024）

| 条款 | 内容（转述） |
| --- | --- |
| §10.32.2 | 测距块由整数个测距轮组成，测距轮由整数个时隙组成；RCM 在一轮的第 0 号时隙发出。 |
| §10.32.3.2 | 「测距轮次组」（ranging round set）：一个块里由同一条 RCM 管辖的若干轮，组内的轮首尾相接；一组的轮数就是 ARC IE 的 RCM Validity Rounds；一个块可以有多个轮次组，每组由它第一轮开头的 RCM 定义。 |
| §10.32.3.3 | 块式模式下块内轮数 = 块长 / 轮长；块结构可以由 ARC IE 的三个时长字段给出，也可以由上层设定。块、轮、时隙各有从 0 起的序号；控制器用 ARC IE 和 RR IE 组成本轮的 RCM，第一轮的 RCM 带 RR IE。 |
| §10.32.9.1，图 10-244 | ARC IE 内容：2 个八位组的控制位（bit 0–1 Multi-node Mode、2–3 Ranging Round Usage、4–5 STS Packet Config、6 Schedule Mode、7 Deferred Mode、8 Time Structure Indicator、9–14 RCM Validity Rounds、15 MMRCR），1 个八位组的 Content Control（bit 0–3 为 RBDP/RRDP/RSDP/SIP 四个存在位），其后可选的块长 3、轮长 1、时隙长 2、Session ID 4 个八位组。RCM Validity Rounds 是本条 RCM 管辖的连续轮数，**含本轮**，并且**不能大于当前块里剩余的轮数**。 |
| §10.32.9.3，图 10-248 | RR IE 内容：Ranging Block Index 2 个八位组；Hopping Mode 1 位 + Round Index 15 位，共 2 个八位组；Transmission Offset 2 个八位组。块与轮的序号在这里，不在 ARC IE。 |
| §10.32.9.5，图 10-250/251 | RCPS IE 内容：CP Table Length 1 个八位组，其后每个竞争阶段一个 CP Table Element：Phase Indicator 2 位（0 发起方竞争、1 应答方竞争、2 测量报告竞争）、起始时隙 7 位、结束时隙 7 位，共 2 个八位组。 |
| §10.32.1，§10.32.9.6 | 一条 RCM 管辖的那组轮里，一个设备最多尝试几次由控制器的上层决定，可用 RCMA IE 发送；这个值不大于 RCM Validity Rounds。 |
| §10.32.2 | 时长以 RSTU 为单位；**没有**「3 RSTU 的整数倍」之类的规定。 |

推论：一条控制消息的有效窗口永远在一个块之内；窗口数的是**轮**。

## 2. 原来的引擎错在哪里

- 每个标签每块只有一轮（第 k 个标签固定是第 k 轮），于是「块内轮号」等于「哪个标签」，
  有效窗口只好按**块**数：`blockCarriesRcm` 是 `block % R === 0`，一条控制消息管 R 个块。
  `blockCarriesMmrcm`、`blockCarriesAncillary`、设备里的 `block - block % R`（RMNR 的
  `holdsValidRcm`、收妥位图、竞争尝试计数）全都跟着按块数。
- ARC IE 是 2 + 8：控制 2，块号、轮号、时隙号各 2——后三项是 ARC IE 没有的字段。
- RCPS IE 是 2 + 2：首末时隙各 1 个八位组，没有表长和阶段指示。
- schema 与编辑器要求块长、时隙长是 3 RSTU 的整数倍。

## 3. 新的会话模型

### 3.1 一个发起方每块跑几轮：会话参数 `initiatorRounds`

新增 `UwbSessionCfg.initiatorRounds`（1…63，缺省 1）：每个发起方（标签）在每个块里连续跑几轮。
第 k 个标签占块里的第 `k·n … k·n + n − 1` 轮（n = `initiatorRounds`），首尾相接。

**为什么是参数而不是推导出来的。** 标准只规定块内能放几轮（块长 / 轮长），一个会话用块里的哪几轮、
用几轮，是控制器上层的事（§10.32.3.3：轮跳变、发送偏移的准则都在标准范围之外）。可以推导的
唯一候选是「把块填满」，那会让每个现有场景一块跑几十轮、轮数随锚点数变化，课文里的每个数都跟着
动，却没有教任何东西。参数缺省为 1，`rcmValidityRounds` 为 1 的会话（所有没开有效期的场景）
因此逐个时刻保持原样。这是标准留给实现的取值，不是协议元素。

只在 `mode: 'twr'` 下可以大于 1：DL-TDoA 与多对多一块一轮由全体共享，MMS 的轮号另有含义，
UL-TDoA 没有控制消息——本仿真器没有为它们实现一块多轮（schema 拒绝并说明）。

### 3.2 轮次组

在一个标签自己的那 n 轮里，每 R 轮开一个新组（R = `rcmValidityRounds`）：组从第 `j − j mod R`
轮开始（j 是这一轮在标签那 n 轮里的位置），长度是 `min(R, 标签在本块剩下的轮数)`。这个长度就是
这一组 RCM 的 RCM Validity Rounds 字段值——最后一组不足 R 轮时，控制器照标准把字段值写成剩下的轮数，
窗口不出块。schema 另外拒绝 `rcmValidityRounds > initiatorRounds`（§10.32.9.1：不能大于块里剩下的轮数；
本仿真器里一个组只能覆盖本标签自己的轮，后面的轮属于别的标签或块已结束），并把上限定为 63（6 位字段）。

新的判断全部以**块内轮号**为参数，放在 `src/uwb/session.ts`：

| 旧 | 新 |
| --- | --- |
| `blockCarriesRcm(plan, block)` | `roundCarriesRcm(plan, round)`：本轮是组的第一轮 |
| `blockCarriesMmrcm(plan, block)` | `roundCarriesMmrcm(plan, round)`：`mmrcr` 开着且本轮是组的最后一轮 |
| `blockCarriesAncillary(plan, block)` | `roundCarriesAncillary(plan, round)`：交换开着、双向测距、本轮是组的第一轮 |
| `blockSlots(plan, block, frames)` | `roundSlots(plan, round, frames)` |
| `blockSlotStartNs(plan, block, round, slot, frames)` | 同名，但轮的起点是块内前面各轮实际长度之和（各轮长度不再相同） |
| `blockSlotAction(plan, block, slot, frames)` | `roundSlotAction(plan, round, slot, frames)` |
| — | `roundSetOf(plan, round)`：`{ first, length, index }` |

双向测距以外的模式里每一轮自成一组（这些模式的 R 被 schema 固定为 1），所以多对多的收妥确认仍是每块一次。

### 3.3 设备状态

- RMNR 的「持有有效 RCM」：按发起方记下解出的 RCM 所在的（块，组首轮，组长）；本轮在同一块、同一组内才算持有。
- 收妥位图：按发起方、按组记；位图长度是组长，第 i 位是组内第 i 轮。
- 竞争尝试计数：按组计（块 + 组首轮）；新组开始才清零，没有任何反馈。上限是 `min(maxAttempts, 组长)`——
  这一组 RCM 里 RCMA 的值由控制器上层给出且不大于本组的有效轮数（§10.32.9.6），截短的最后一组因此取组长。
- 辅助信息消息号：原来用块号当消息号（一窗口一块），现在用「块号 × 每块组数 + 组序号」之类的全局组号，保证每条消息一个号。

### 3.4 帧内容

- ARC IE = 2（头）+ 2（控制位）+ 1（Content Control）= 5 个八位组。三个时长字段与 Session ID 都不带：
  块结构由上层（场景配置）设定，§10.32.3.3 允许这样做；会话在带外建立。控制位的取值：
  Multi-node Mode 1（一对多）；Ranging Round Usage 1（SS-TWR）/2（DS-TWR）/0（DL-TDoA 的单向测距）；
  STS Packet Config 1（SP1）/3（SP3）；Schedule Mode 0（竞争）/1（按时间）；Deferred Mode 在本轮测距之后排了数据帧时隙
  （SS 延后、DS 的报告、SP3 的报告阶段）时为 1；Time Structure Indicator 1（块式）；RCM Validity Rounds 为本组长度；MMRCR 照会话。
- 每条 RCM 另带 RR IE = 2 + 6 = 8 个八位组：块号、Hopping Mode 0、本轮在块内的轮号、Transmission Offset 0。
- RCPS IE = 2 + 1 + 2 = 5 个八位组：表长 1，一个阶段（Phase Indicator 1，应答方竞争，起止时隙 1…S）。
- 测距启动消息（组内后面各轮）不变：MHR + RRMC + FCS = 14。

于是按时间调度的 Poll 由 27 + 3A 变为 30 + 3A，竞争式 Poll 由 31 变为 35，组内后面各轮比 RCM 省 16 + 3A（原来 13 + 3A）。

### 3.5 3 RSTU

删除 schema 的两条 `% 3` 规则、编辑器 RSTU 输入框按 3 取整与 `step={3}`。

## 4. 改哪些文件

- `src/uwb/session.ts`：`RoundPlan.initiatorRounds`、轮次组函数、轮起点、`ancillaryGrantFits` 改为按整块（一个标签的 n 轮）计。
- `src/uwb/network.ts`：每个标签跑 n 轮；块容量检查按块内全部轮的实际时隙数。
- `src/uwb/device.ts`、`device.ancillary.ts`：上节的设备状态；`openerKind` 读 `roundCarriesRcm`。
- `src/uwb/phy.ts`：`ARC_IE_BYTES`、新 `RR_IE_BYTES`、`RCPS_IE_BYTES`、`uwbPollBytes`；`uwbInitiatorBlockSlots`（schema 与编辑器共用的块容量算式）。
- `src/uwb/frames.ts`、`frameFields.ts`、`src/ui/i18n.ts`、`src/model/frameFields.ts`：ARC 行按字段写，新增 RR 行，RCPS 行写阶段表。
- `src/model/scenario.ts`：`initiatorRounds` 字段与规则、有效轮数不大于标签每块轮数、上限 63、块容量、删除 3 RSTU。
- `src/uwb/ui/UwbSessionFields.tsx`：去掉按 3 取整；有效轮数上限 63，改有效轮数时把 `initiatorRounds` 一并抬到不小于它（不加新控件，界面布局不动）；辅助帧上限按新的块容量。

## 5. 会动的课

- 打印 Poll 字节数的课（30 + 3A 取代 27 + 3A）：frame、dstwr、blocks、slot-budget、sp3、reply-time、deferred-ds 等，只改数。
- `uwb-rcm-validity`、`uwb-receipt`（双向测距变体）、`uwb-ancillary`（窗口变体）、`uwb-ancillary-loss`（有效期变体）：
  场景的有效轮数 4 原来管 4 个块；改为 `initiatorRounds: 4`，一块之内 4 轮一组。课文里「一条控制消息管 4 个块」之类的说法
  改为「管一块里的 4 轮」，只做最小改写。
- `uwb-contention`：RCPS 一行原来标为「与标准不同」，现在照标准，改写这一行。
