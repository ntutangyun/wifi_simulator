# 帧与信息单元按标准改正（W2）

2026-11-10。`docs/uwb-standard-audit.md` 的 #7、#8、#4、#3、#5、#11/#24、#12、#14，以及 W1 留下的三件事（块式结构下轮长固定、设备按收到的信息单元行事、竞争式辅助信息的 RCPS）；工作计划 `docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md` 的 W2。
硬规则照旧：标准（IEEE Std 802.15.4-2024）里没有的信息单元、字段、帧、规则一律不建；做不到的写「未实现」。每一项的字段宽度都对照语料库原文核过（`ieee_standards/text/802154-2024.json`）。

## 1. 改了什么，依据哪一条

| # | 内容 | 标准 | 以前 | 现在 |
| --- | --- | --- | --- | --- |
| 7 | PHR 长度 | 表 16-2/16-3：「21 symbols of PHY header at the PHR symbol rate」——19 个 PHR 比特 H0–H18 加 PSDU 的头两个比特 D0、D1（码率 1/2 时），数据速率的符号从第 21 个起，共 N 个 | 19 个 PHR 符号，PSDU 按 数据比特 + 校验 + 2 个尾符号 计 | `PHR_SYMBOLS` = 21；`psduSymbols` = 数据比特 + 校验 − 2 + 2 个尾符号。每个 SP1 PPDU 长 2 × (512 − 64) = 896 码片（约 1.795 µs） |
| 8 | RRTI 内容头 | §10.29.8.1，图 10-208/10-209：1 字节（地址长度说明 2 位、列表长度 6 位）+ 列表；元素 = 4 字节回复时间 + 0/2/8 字节地址；单播省地址 | 头 + 4，Final 每个锚点一枚 | `rrtiIeBytes`；SS 嵌入式 Response 的 RRTI = 7（Response 21 字节）；Final 一枚 RRTI 列出全部锚点，带短地址（3 + 6A） |
| 8 | RMI 内容头 | §10.29.8.4，图 10-212/10-213：2 字节（各存在位、地址长度说明、Deferred Mode、7 位列表长度）+ 列表；广播必须带地址，单播一个元素不带地址；「At least one measurement shall be present」 | 内容头 1 字节 | `rmiIeBytes`；嵌入式 Final 18 + 12A，应答方报告 23 |
| 4 | 延后 SS-TWR 的回复时间 | §10.29.6.3，图 10-203：「This reply time is communicated to the initiating side in the RMI IE ... carried by a subsequent message」 | RRTI IE，17 字节 | RMI IE（一个回复时间，单播），19 字节 |
| 3 | 延后 DS-TWR | §10.29.6.6；§10.32.5 图 10-237：Final 只是 `{Ranging}`；随后发起方在一帧延后数据帧里用 RMI IE（Deferred Mode = 1）把第一次往返时间与第二次回复时间发给应答方，应答方计算 | 延后 Final 带一张只有地址的 RMI 列表（违反「至少一项测量」），发起方从不发出两个时间，应答方算不出距离 | Final 不带 IE（11 字节）；紧接一个时隙是发起方的延后报告 `makeDsDeferredReport`（广播，一枚 RMI IE，每个它收到 Response 的应答方一个元素：tround1、treply2、地址，15 + 10A）；应答方据此算出距离（`onDsDeferredReport`），并据此判断自己是否被听到。一轮 2A + 3 个时隙 |
| 5 | 固定回复时间 | §10.32.2，图 10-226：「The fixed reply time FRTj is measured from the RMARKER of the ranging initiation message P1 to the RMARKER of the response message, Rj」，FRTi > FRTj（i > j），由上层选定，可用 RRTN IE（§10.29.8.6）或带外交换 | 从收完 Poll 起算，共用一个 F 加 k 个时隙 | `fixedReplyRstu` 是 FRT1（RMARKER 到 RMARKER），第 i 个应答方 FRTi = FRT1 + (i − 1) 个时隙（取值：标准把取值留给上层）；schema 与编辑器的时间窗去掉了 Poll 的空口时间：S − 最近飞行时间 ≤ FRT1 ≤ 2S − 响应帧空口时间 − 守卫 − 最远飞行时间 |
| 11/24 | 收妥位图 | §10.36.2.1，图 10-274：元素 = 地址 + 1 字节位图长度 + 位图；位图长度 = ⌈被确认的时隙数 / 8⌉，每个时隙一位，第一位对应第一个时隙；未收到或不是发给本设备的时隙置 0 | 每轮一位，没有长度字节 | `mmrcmAckSlots`（一组轮次里确认帧之前的全部时隙）、`mmrcmBitIndex`、`rmmrcEntryBytes` = 2 + 1 + ⌈时隙数/8⌉；应答方在收到发起方任何一帧的那个时隙置位（`noteReceipt`）。记录 `UWB_MMRCM` 的 `windowRounds` 改名 `ackSlots` |
| 12 | RAICT IE | §10.35.2.1，图 10-271：控制字节里只有 Request 位与消息编号存在位；Frames Remaining 没有存在位 | 文档与代码注释里写了一个「剩余帧数存在」位 | 去掉；Frames Remaining 带不带由信息元长度看出（字节数不变）。`UWB_ANCILLARY` 记录的 `messageKind` 删除（标准没有消息类型字段） |
| 12 | 辅助信息轮 | §10.35.1：块里可以有一个或多个测距轮用于辅助信息交换；表 10-164：Ranging Round Usage = 3 | 辅助帧追加在每个测距轮次组第一轮之后 | 每个标签在每块的测距轮之后多一轮（`roundsPerInitiator`、`roundCarriesAncillary`）：第 0 号时隙是控制器的独立 RCM（新帧类型 `uwbRcm`：ARC（RRU = 3、有效轮数 1）+ RR + 时间调度时的 RDM（SIU = 1，逐个时隙指定给发送方，§10.32.9.8）或竞争时的 RCPS（一个发起方竞争阶段，Phase Indicator 0，§10.32.9.5）；不带 RRMC），之后的时隙给辅助信息。每块每个标签一条消息，消息编号 = 块号 mod 256 |
| 12 | 排程请求的批复 | §10.35.1：发起方不是控制器时可用 Request 位请控制器为下一次交换排这么多时隙；标准没有定义批复 | 批不批按一块装不装得下，批了就把追加窗口加宽（设备从网络层拿到宽度） | 批不批按辅助信息轮装不装得下（本仿真器的取法，`ancillaryGrantFits`）；批了就在下一个辅助信息轮的 RCM 里用 RDM IE 指定这么多时隙（竞争时把 RCPS 阶段放宽到装得下），发送方从收到的 RCM 读出自己能发几帧。时间调度下 RDM 列表最多 63 个元素（6 位长度字段），schema 拒绝超过的帧数 |
| 14 | SRRR IE | §10.32.9.9，图 10-255：一枚 IE 给一对请求方—提供方，控制 1 字节（两个地址长度说明 + RAOA、RRT、RRTT、RTOF）+ 两个地址；发起方兼任控制器时可省请求方地址 | 每个应答方一枚、头 + 1、不带地址，回复时间总是回报 | 每个应答方一枚 = 头 2 + 控制 1 + 提供方地址 2 = 5 字节；RRT 由发起方置位，应答方只在收到的 SRRR 里 RRT = 1 时回报回复时间、RAOA = 1 时带方位角 |
| W1 | 块式结构下轮长固定 | §10.32.3.3：块内轮数 = 块长 / 轮长，轮内时隙数 = 轮长 / 时隙长——轮长只有一个值 | 收妥确认与辅助信息的时隙追加在特定轮之后，轮长随位置变化 | `plan.slots` = `uwbRoundSlotCount`（测距本身 + 收妥确认时隙，与辅助信息轮所需，取较长者），每一轮一样长；`plan.rangingSlots` 是测距本身的时隙数，其余时隙在收妥确认轮里给 MMRCM、在其他轮里空闲；`roundSlots`、`blockSlotStartNs` 不再随轮变化 |
| W1 | 设备按收到的信息单元行事 | §10.32.9.1（ARC IE「is supplied to the next higher layer of the controlee to set its ranging parameters」）、§10.32.9.6（「Upon reception, the value shall be used as the maximum number of contention attempts」）等 | 应答方直接读会话配置 | 应答方保存它解出的 RCM（`HeldRcm`：有效轮数、MMRCR 位、RCPS/RCMA、自己的 SRRR、辅助信息轮的 RDM 指定）：有效期按收到的 RCM Validity Rounds、收妥确认按收到的 MMRCR 位、竞争的阶段与尝试上限按收到的 RCPS/RCMA、SP3 回报按收到的 SRRR、辅助信息按收到的 RDM/RCPS |
| W1 | 竞争式辅助信息的 RCPS | §10.32.9.5，表 10-170：阶段指示 0 = 发起方竞争 | 没有描述 | 辅助信息轮的 RCM 带 RCPS，一个阶段，指示 0（辅助信息的发起方就是发送方，§10.35.1） |

## 2. 未实现（标准有、本仿真器没有）

- RRTN IE（§10.29.8.6）：固定回复时间的取值在带外约定，标准允许（§10.32.2「via the RRTN IE ... or via an out-of-band mechanism」）。
- RRTI 列表在预先约定顺序时省略地址（§10.29.8.1 允许）：本仿真器总是带地址。
- RMI 的 TOF、到达角字段：W4 的范围（SP3 报告里的方位角目前仍是一个 IE 头加 2 字节的「RAOA 项」，标准里没有这样一个信息单元，W4 改为 RMI 的 AOA Azimuth 字段）。
- SRRR 的 RTOF 位：不置位。
- SP3 会话里的辅助信息轮：schema 拒绝（以前的理由「两段追加没有定义次序」已经不成立，现写明是未实现）。
- 收妥确认在每轮只有一条控制消息（有效轮数 1）时被 schema 拒绝——这是本仿真器的规则，标准没有这一限制，提示文字已照此改写。

## 3. 本仿真器的取值与取法（标准留给实现的）

- FRTi = FRT1 + (i − 1) 个时隙：满足图 10-226 的 FRTi > FRTj；标准说取值由上层在建立测距时选定。FRT1 的缺省值改为一个时隙加 240 RSTU（2640 RSTU）：恰好一个时隙时 Response 紧贴时隙边界，晶振快 20 ppm 就会早于时隙开始。schema 的下界（时隙 − 最近飞行时间）仍未计入晶振偏差。
- 延后 DS-TWR 的应答方报告（reply time + round-trip time，单播 RMI，23 字节）照图 10-238 的形状保留：发起方的 RRMC 请求了回复时间与往返时间，所以两端都得到距离。
- 批复辅助信息排程请求的条件（辅助信息轮装得下）；竞争时发送方的帧数（已请求且阶段装得下就发请求的帧数，否则发场景给的帧数）。
- 辅助信息轮放在每个标签测距轮之后、每块一轮。
- 竞争 + 固定回复时间：应答方抽到第 s 个时隙就按 FRTs 回复（图 10-226 画的是时间调度；把抽到的时隙号当作 i 是本仿真器的取法）。

## 4. 核查不了的

- §10.35.2.1 正文提到「message type」，图 10-271 没有这个字段——照图实现（没有）。
- Frames Remaining 没有存在位时，接收方只能从信息元长度判断它带没带——标准没有明说，这是唯一可行的读法。

## 5. 动到的数

- 所有 SP1 帧长 1.795 µs（PHR）；SS 嵌入式 Response 21 字节；Poll 不变（30 + 3A）；嵌入式 DS Final 18 + 12A；应答方报告 23；SS 延后报文 19；SP3 RCM 30 + 8A；SP3 发起方报告 15 + 6A。
- 锚点上限（`uwbMaxAnchors`）：SS 三种 32，嵌入式 DS 9，延后 DS 11。
- 延后 DS 一轮 2A + 3 个时隙；SP3 双边 2A + 4。
- 开了收妥确认或辅助信息的会话：每轮一样长，块里的轮数随之变化；辅助信息帧在自己的轮里，第 1 号时隙起。
- fixture：`tests/fixtures/lesson-hashes.json` 与 `uwb-record-hashes.json` 因上面的空口时长与帧长改变而重新生成（见提交说明）。
