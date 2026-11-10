# UWB 特性覆盖表：标准怎么说，本仿真器做到哪一步

这张表回答一个问题：**这门课能不能把一个从零开始的人，送到看得懂 IEEE mentor 上正在发生的事。**

回答需要一张地图。左边是特性，中间是它在标准世界里的处境，右边是本仿真器究竟做了多少。
三件事分开写，因为它们会各自漂移，而把它们混在一句话里正是本仓库反复出现的那类缺陷
（本月已查出五处课文与引擎不符，其中两处是几小时前写的课）。

---

## 怎么读这张表

**第一列 特性**：名字，加上它在 IEEE Std 802.15.4-2024 里的条号，或者它在 TG4ab 的文稿编号。
条号取自 `.superpowers/sdd/uwb-clause-list.txt`——从 2024 版目录里抽出的 145 行，凡标题里带
UWB、ranging、HRP、LRP、STS 的条款都在内。工作从那份清单出发，不从记忆出发。

**第二列 标准状态**，只取五个值：

| 值 | 含义 |
| --- | --- |
| 已发布 | 在 IEEE Std 802.15.4-2024 正文里（802.15.4z 已并入）。不需要再举证。 |
| 已进草案且未见争议 | P802.15.4ab 草案里有它，且语料库没有记下针对它的失败动议或未决议题。**必须在单元格里给出文稿编号。** |
| 仍在争论 | 草案里有它，但工作组还在吵。**必须给出文稿编号，有表决的要给出票数。** |
| 仅为提案，未进草案 | 语料库里只有提案，且有明确记录说它没被采纳。 |
| 无法判定 | 语料库不足以定论。**单元格里要说清查了什么。** |

**为什么第二列有一半格子要举证。** P802.15.4ab 的草案正文是会员限定的，本仓库里没有抄过一个字。
语料库（`D:/ai_patent_experiments/.claude/skills/wifi_patent_skill/references/uwb_tg4ab/text/`，
2026-10-21 刷新后 1150 篇，其中 1137 篇抽出了正文；**2026-11-02 的增量刷新没有动这份镜像**——它在另一台机器的 D 盘上，这次是直接从 mentor 读了 10-20 之后上传的 22 份修订，见第十一节开头与第十七节第 8 条；最新一篇的修订日是 2026-11-02）里有的是：投稿、逐条引用草案页/行/条号的意见决议、以及会议纪要。
所以「草案里有没有」这件事，只能靠草案引文和纪要来推。**推不出来就写「无法判定」，不填一个听起来合理的猜测。**
这张表一半的价值在于读者能分辨哪个结论是有据的。

**第三列 本仿真器**：已建模 / 部分建模 / 未建模。**这一列读的是代码，不是课文。**
写「部分建模」的行，第四列必须有一句说清哪一部分。

**第四列 位置与证据**：已建模的行给出引擎符号与课程编号；未建模的行说明它是**范围决定**还是**未偿的债**。

**引用写法**（`tests/course/uwb-coverage.test.ts` 按这两个形状取词）：

- 引擎符号写作 `` `uwb/ranging.ts#ssTwrCorrected` ``——路径相对 `src/`，`#` 后是该文件的模块级导出名。
- 课程编号写作 `` `@uwb-sstwr` ``。

---

## 总数（写作时，`tests/course/uwb-coverage.test.ts` 钉住）

全表 **109 行**。

| 标准状态 | 行数 |
| --- | --- |
| 已发布 | 64 |
| 已进草案且未见争议 | 26 |
| 仍在争论 | 8 |
| 仅为提案，未进草案 | 1 |
| 无法判定 | 10 |

| 本仿真器 | 行数 |
| --- | --- |
| 已建模 | 29 |
| 部分建模 | 40 |
| 未建模 | 40 |

这三个数字被测试钉住，所以加一行必须同时改这里——这正是要的：一张说不出自己有多大的表，
读者无从判断某一处空白是刻意的还是漏的。

「仅为提案，未进草案」一行也没有，值得说明：那个值要求语料库里有**明确的否决记录**，
而 4ab 的实际情形是提案被反复搁置而不是被判死，所以那些行落在「无法判定」里。

<a id="coverage-counts"></a>

---

## 这张表会怎样撒谎

`tests/course/uwb-coverage.test.ts` 只钉住一件事：这张表点到名的每个引擎符号和每个课程编号**还存在**。

它**抓不到**的是最要紧的那种腐烂：**一行所描述的特性被人从底下换掉了，而符号名没变。**
`ssTwrCorrected` 明天可以改成不做时钟修正，符号还在，测试还绿，而「已建模」这一格就开始撒谎了。
同样，某一行的「仍在争论」会因为一次成功的动议而过期，而语料库刷新之后没人回头看这张表。

所以这张表的保质期是：**语料库的截止日（2026-11-02 增量刷新，最新文稿 2026-11-02）加上引擎的下一次改动。**
重读它的正确方式是重跑一遍第二列的检索，再重读一遍第三列引用的那几个函数。测试只替你挡住改名与删除——
那是这种表格开始撒谎最便宜的入口，堵住它值得，但别把它当成正确性的证明。

---

## 一、已发布标准：测距测量与单位（§10.29.1）

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 测距测量与测距计数器（ranging counter）§10.29.1、§10.29.1.3 | 已发布 | 已建模 | 每次测量都是一对计数器读数：发射方给自己即将发出的 RMARKER 盖章，接收方给收到的盖章。`uwb/clock.ts#UwbClock`、`uwb/clock.ts#counterDiff`（40 bit 回绕，`uwb/units.ts#COUNTER_BITS`，标准只要求「至少 32 位」）。`@uwb-intro` |
| 测距计数器时间单位（ranging counter time unit, RCTU）§10.29.1.4 | 已发布 | 已建模 | `uwb/units.ts#RCTU_PER_CHIP` = 128，`uwb/units.ts#RCTU_NS` ≈ 15.650 ps。`@uwb-intro` |
| 测距调度时间单位（ranging scheduling time unit, RSTU）§10.29.1.5 | 已发布 | 已建模 | `uwb/phy.ts#RSTU_CHIPS` = 416、`uwb/phy.ts#RSTU_NS` = 833.333 ns（Table 10-145）；块与时隙都用它计量，`uwb/phy.ts#rstuNs`。`@uwb-blocks` |
| 测距跟踪偏移与测距跟踪间隔（ranging tracking offset / interval）§10.29.1.6.2、§10.29.1.6.3 | 已发布 | 部分建模 | 建的是**这两个量背后的物理**——收发两端的相对时钟偏移，用来把应答方量到的间隔换算到发起方的钟上：`uwb/ranging.ts#ssTwrCorrected` 的 `(1 − coffs)`。没建的是标准规定的**上报形式**（偏移值与它的计量间隔作为字段传递）；引擎里 `coffs` 从场景里两台设备的真实 ppm 之差加一次高斯噪声得来，不是从载波锁定里测出来的。`uwb/device.ts#UwbDevice`、`@uwb-sstwr` |
| 测距品质因数（ranging figure of merit, FoM）§10.29.1.7 | 已发布 | 部分建模 | 字节的编解码是全的：`uwb/phy.ts#fomDecode`、`uwb/phy.ts#fomText`，全零解释为「不可用」。但取值只有两个：`uwb/ranging.ts#fomFor` 按纯几何遮挡返回 `uwb/phy.ts#FOM_NLOS` 或 `uwb/phy.ts#FOM_LOS`，与实际电平、噪声、多径都无关。`@uwb-geometry` |
| 单边双向测距（single-sided two-way ranging, SS-TWR）§10.29.1.2.2 | 已发布 | 已建模 | `uwb/ranging.ts#ssTwrRaw`、`uwb/ranging.ts#ssTwrCorrected`。`@uwb-sstwr` |
| 双边双向测距（double-sided two-way ranging, DS-TWR）§10.29.1.2.3 | 已发布 | 已建模 | `uwb/ranging.ts#dsTwr`（对称式：`(T_r1·T_r2 − T_p1·T_p2) / (T_r1+T_r2+T_p1+T_p2)`）。`@uwb-dstwr` |
| 测距交互前的准备与交互后的收尾 §10.29.2、§10.29.3 | 已发布 | 未建模 | **范围决定。** 一个场景只有一条测距会话，而它从不需要被建立起来：时隙网格在会话开始之前就把谁在哪个时隙发讲定了（`uwb/session.ts#roundPlan`），没有能力交换、没有协商、没有拆除。已写进 `@uwb-blocks` 的 `limits`。 |
| 基本测距交互 §10.29.5 | 已发布 | 已建模 | Poll → Response（→ Final → Report）这条链就是它：`uwb/frames.ts#makePoll`、`uwb/frames.ts#makeResp`、`uwb/frames.ts#makeFinal`、`uwb/frames.ts#makeReport`。`@uwb-sstwr`、`@uwb-dstwr` |

## 二、已发布标准：测距过程的五种形态（§10.29.6）

这五行是本表最容易被读错的一段，所以先说清判定依据：**802.15.4-2024 的条文本身不在语料库里，
本仓库只抽出了目录。** 所以下面把引擎行为对到 §10.29.6.x 的某一小节，依据是**条款标题**加上引擎实际
携带的 IE，不是条文。这是一个有据的对照，不是一次照抄。

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 测距的控制与结果传输 §10.29.6.2 | 已发布 | 部分建模 | 结果传输**五种形态全建了**（见下面四行）：嵌入、延后、固定三条路都走得通，`uwb/session.ts#RoundPlan` 的 `replyTime` 决定走哪条。控制**仍然没建**：没有任何原语或管理帧能启停、重配一次测距（见 §10.29.9 那一行），`replyTime` 是场景配置而不是空口协商的结果。`uwb/frames.ts#makeReport`、`@uwb-dstwr`、`@uwb-reply-time` |
| SS-TWR，回复时间延后上报 §10.29.6.3 | 已发布 | 已建模 | Response 不带 RRTI（14 字节，而嵌入式 21 字节），回复时间在**自己的时隙里、自己的一条报文里**跟上，照标准装在 RMI IE 里（§10.29.6.3，图 10-203；2026-11-10 之前用的是 RRTI IE）：`uwb/frames.ts#makeSsDefer`（19 字节，`ies` 恰为 `['RMI']`：内容头 2 + 一个回复时间 4，单播不带地址）、独立的 `'uwbSsDefer'` 帧类型、`uwb/session.ts#slotAction` 给它时隙 A+1…2A，所以一轮是 2A+1 个时隙而不是 A+1。标签在延后报文落地时才算出距离。`@uwb-reply-time` |
| SS-TWR，回复时间嵌入 §10.29.6.4 | 已发布 | 已建模 | 这是引擎 SS-TWR 的那一种：Response 携带 `['RRMC', 'RRTI']`，回复时间在 `replyRctu` 里。RRTI IE 照图 10-208 带 1 字节内容头，单播的一个列表元素不带地址：`uwb/phy.ts#RRTI_IE_BYTES` = 7。`uwb/frames.ts#makeResp`。`@uwb-sstwr` |
| SS-TWR，固定回复时间 §10.29.6.5 | 已发布 | 已建模 | 已发布标准这一条长在**它自己的路径上**（SP1 帧、槽位化轮次、不走 MMS）：`scenario.ts` 的 `replyTime: 'fixed'` 加 `fixedReplyRstu`，`uwb/session.ts#RoundPlan` 的 `fixedReplyNs`。回复时间一个字节都不上空口（Response 14 字节）。照 §10.32.2 图 10-226，固定回复时间 FRTi 从轮询帧的 RMARKER 量到第 i 个应答方响应帧的 RMARKER，每个应答方一个值：`fixedReplyRstu` 是 FRT1，FRTi = FRT1 + (i − 1) 个时隙（取值是本仿真器的，标准把取值留给上层；两端在带外约定，RRTN IE 未实现）。2026-11-10 之前从收完 Poll 起算、共用一个数。这是**整个 UWB 侧唯一一处不对齐时隙的发送**，时隙预算因此两边都有界（`scenario.ts` 的两条拒绝规则，`uwb/phy.ts#uwbFixedReplyWindowRstu`：S − 最近飞行时间 ≤ FRT1 ≤ 2S − 响应帧空口时间 − 守卫 − 最远飞行时间）。4ab 的 MMS 固定回复时间是**另一个设置、另一种轮形**：`uwb/mms.ts#MMS_FIXED_REPLY_RSTU_DEFAULT`、`@uwb-subrounds`。`@uwb-reply-time` |
| DS-TWR，测距时间信息延后 §10.29.6.6 | 已发布 | 已建模 | 照 §10.29.6.6 与 §10.32.5 图 10-237：Final 是一帧**不带任何 IE** 的测距帧（`uwb/phy.ts#uwbFinalBytes` 延后下 11 字节），它自己的发送时刻正是 treply2 要量到的那一刻；随后发起方在测量报告阶段广播一帧延后数据帧，一枚 RMI IE（Deferred Mode = 1）给每个它收到过 Response 的应答方一个列表元素：tround1、treply2 与地址（`uwb/frames.ts#makeDsDeferredReport`、`uwb/phy.ts#uwbDsDeferredReportBytes` = 15 + 10A）。**应答方据此算出距离**（`uwb/device.ts` 的 `onDsDeferredReport`），这一帧也告诉它发起方有没有收到它的 Response、它该不该在报告相位开口。一轮因此是 2A+3 个时隙。2026-11-10 之前延后 Final 带一张只有地址的 RMI 列表（违反 §10.29.8.4「至少一项测量」），而且发起方从不把两个时间发给应答方。算出来的锚点上限是 11（`uwb/phy.ts#uwbMaxAnchors`，被那帧延后报告卡住）。`@uwb-deferred-ds` |
| DS-TWR，测距时间信息嵌入 §10.29.6.7 | 已发布 | 已建模 | Final 携带 `['RMI', 'RRTI']`（§10.32.5 图 10-236）：一枚 RMI IE 列出每个锚点的 tround1 与地址（4 + 6A），一枚 RRTI IE 列出每个锚点的 treply2 与地址（3 + 6A），整帧 18 + 12A 字节：`uwb/frames.ts#makeFinal`、`uwb/phy.ts#rmiFinalIeBytes`。锚点凑上自己的 `treply1`/`tround2` 当场解出距离。代价是这条 Final 每多一个锚点长 12 字节，于是它把一轮卡在 9 个锚点（`uwb/phy.ts#uwbMaxAnchors`：这一种 9，延后 DS 11，SS 三种 32）。`@uwb-dstwr`、`@uwb-deferred-ds` |

## 三、已发布标准：测距 IE（§10.29.7、§10.29.8）

引擎的 IE 不是比特级的：`uwb/phy.ts` 只给每个 IE 一个字节数，`uwb/frameFields.ts#uwbFrameFields` 按名字把它
们列进解码视图。所以「已建模」在这一节里一律意味着**帧长与字段清单**，不意味着比特布局。

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| RSSD IE（Ranging STS Seed and Data IE）§10.29.7.1、§10.29.8.2 | 已发布 | 未建模 | **范围决定。** 引擎不持有密钥、不生成 STS 序列，也就没有种子要传（见 §16.2.9 那几行）。 |
| RRTI IE（Ranging Reply Time Instantaneous IE）§10.29.8.1 | 已发布 | 部分建模 | 出现在 SS 的 Response 与 DS 的 Final 上，照图 10-208/10-209：1 字节内容头（地址长度说明 2 位 + 列表长度 6 位）加列表，每个元素一个 4 字节回复时间，广播时另带 2 字节短地址（`uwb/phy.ts#rrtiIeBytes`、`uwb/phy.ts#RRTI_IE_BYTES`）。一枚 IE 装整张列表。2026-11-10 之前没有内容头、Final 每个锚点一枚 IE。比特布局之外的语义（RequestRrtiTxList 原语）未建。`@uwb-frame` |
| RRMC IE（Ranging Request Measurement and Control IE）§10.29.8.3 | 已发布 | 部分建模 | 每条 Poll / Response / Final 都挂它，长度 `uwb/phy.ts#RRMC_IE_BYTES`（头 + 一个控制八位组）。控制位本身不解析：这一轮要向应答方索取什么，引擎从 `uwb/session.ts#RoundPlan` 读，不从这个 IE 读。 |
| RMI IE（Ranging Measurement Information IE）§10.29.8.4 | 已发布 | 部分建模 | 照图 10-212/10-213：2 字节内容头加列表，每个元素按存在位带回复时间、往返时间（各 4 字节），广播时带 2 字节地址（`uwb/phy.ts#rmiIeBytes`）。四种用处：嵌入式 Final 的往返时间（`uwb/phy.ts#rmiFinalIeBytes`）、应答方报告（`uwb/phy.ts#RMI_REPORT_IE_BYTES` = 12，单播）、SS 延后报文、延后 DS 的发起方报告。TOF 与到达角字段未用。DL-TDoA 的时间也是照这个 IE 的形状放的（`uwb/frames.ts#UwbDlTimes`，模型取值）。`@uwb-dl-tdoa` |
| RCPCS IE（Ranging Channel and Preamble Code Selection IE）§10.29.8.5 | 已发布 | 未建模 | **范围决定。** 一条会话只有一个信道、一个前导码：`uwb/phy.ts#UWB_CHANNEL_MHZ` 只有 5 与 9 两项，序列码索引这个量在 `src` 里根本不存在。 |
| RRTN IE（Ranging Reply Time Negotiation IE）§10.29.8.6 | 已发布 | 未建模 | **范围决定。** 引擎里没有任何协商：回复时间由时隙网格决定（`uwb/session.ts#slotStartNs`），两端不商量。 |

## 四、已发布标准：原语、常量与描述符

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 测距的 MAC 管理服务原语 §10.29.9（含校准原语 §10.29.9.3） | 已发布 | 未建模 | **范围决定。** `src` 里没有一个 MLME/MCPS 原语：本仿真器没有分层的服务接口，场景直接构造设备。 |
| STS 参数原语 MLME-STS.request / .confirm §10.29.9.4 | 已发布 | 未建模 | **范围决定。** 同上，且引擎不生成 STS。 |
| 测距的 MAC 常量与 PIB 属性 §10.29.10 | 已发布 | 部分建模 | 会话参数存在，但存在的形状是场景配置而不是 PIB：`model/scenario.ts#UwbSessionCfg`、`model/scenario.ts#DEFAULT_UWB_SESSION`。没有 PIB 的读写接口，也没有属性名。 |
| DataRequestRangingDescriptor §8.3.2.2、RangingReportDescriptor §8.3.2.3 | 已发布 | 未建模 | **范围决定。** 这两个描述符属于 MAC 数据服务接口，而引擎没有那一层；测量结果直接以时间线记录发出（`uwb/records.ts#UwbRecord`）。 |
| 具备测距能力的 PHY §11.3、HRP UWB PIB 属性 §12.3.7 | 已发布 | 部分建模 | PHY 侧的量都在（`uwb/phy.ts`、`uwb/units.ts`），但同样不是 PIB 属性的形状，没有能力声明、没有属性名。 |
| 工作频率范围 §11.1.2、HRP UWB 信道编号 §11.1.3.5 | 已发布 | 部分建模 | 只有信道 5（6489.6 MHz）与 9（7987.2 MHz）：`uwb/phy.ts#UWB_CHANNEL_MHZ`、`uwb/phy.ts#UWB_BAND_MHZ`。HRP 的其余信道未建。`@uwb-coexist` |

## 五、已发布标准：超帧与多节点测距（§10.30、§10.32）

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| PAN 超帧结构下的 ERDEV 测距 §10.30，及 RD IE（Ranging Descriptor IE）§10.30.2.1 | 已发布 | 未建模 | **范围决定。** 本仿真器的 UWB 侧只有块/轮/时隙这一套结构（§10.32），没有信标与超帧。 |
| 测距块、轮与时隙结构 §10.32.2 | 已发布 | 已建模 | `uwb/session.ts#roundPlan`、`uwb/session.ts#slotStartNs`、`uwb/session.ts#slotAction`；块与时隙都以整数个 RSTU 计（`model/scenario.ts#UwbSessionCfg`；2026-11-10 去掉了标准里没有的「3 RSTU 整数倍」规则）。每个标签每块连续跑 `initiatorRounds` 轮，测距轮次组（§10.32.3.2）就在这几轮里：`uwb/session.ts#roundSetOf`。`@uwb-blocks`、`@uwb-slot-budget` |
| 测距模式：时间调度与竞争 §10.32.3 | 已发布 | 已建模 | 两种都有。时间调度里每个时隙的主人事先定好；竞争轮（schedule mode 0）改为开一个共享响应窗，每个锚点从自己的随机流里抽一个时隙，两个锚点可以撞在一起。`uwb/session.ts#SlotAction`、`uwb/phy.ts#RCPS_IE_BYTES`、`uwb/phy.ts#RCMA_IE_BYTES`。`@uwb-contention` |
| 时隙化方案里的接收使能 §10.32.3.4 | 已发布 | 已建模 | 设备只在自己那个时隙开接收机，其余时间 `idle`——这正是 UWB 测距便宜的原因。`uwb/device.ts#UwbDevice`（`listenFor` / `uwbWait` 状态）。`@uwb-blocks` |
| 一对多 SS-TWR §10.32.4 | 已发布 | 已建模 | 一条广播 Poll 点名若干锚点（RDM IE），每个锚点在自己的时隙里答：`uwb/frames.ts#makePoll`、`uwb/phy.ts#rdmIeBytes`、`uwb/phy.ts#uwbSlotsPerTag`。`@uwb-sstwr` |
| 一对多 DS-TWR §10.32.5 | 已发布 | 已建模 | 加上广播 Final 与逐锚点的 Report：`uwb/frames.ts#makeFinal`、`uwb/frames.ts#makeReport`。`@uwb-dstwr` |
| 多对多 SS-TWR §10.32.6 | 已发布 | 已建模 | 一轮 N 个时隙，参与者 i 在第 i 个时隙发一次，那一帧对后面的人是问、对前面的人是答：`uwb/session.ts#m2mParticipants`（顺序按 id，model）、`uwb/session.ts#slotAction` 的 `uwbM2m` 分支、`uwb/device.m2m.ts#transmitM2m`、`uwb/device.m2m.ts#onM2mRx`、`uwb/frames.ts#makeM2m`、`uwb/phy.ts#uwbM2mBytes`、`uwb/phy.ts#uwbMaxParticipants`。距离仍由 `uwb/ranging.ts#ssTwrCorrected` 算，而且只有排在前面的那个参与者算得出来（N−1−i 条）。`@uwb-m2m` |
| 多对多 DS-TWR §10.32.7 | 已发布 | 已建模 | 同一套路走两趟，每趟 N 个时隙（2N），第二趟的帧只带第二趟听到的到达时刻，所以帧长上限与 SS 相同：`uwb/session.ts#slotAction` 的 `pass`、`uwb/device.m2m.ts#onM2mRx`、`uwb/ranging.ts#dsTwr`。晶振拉开时比 SS 准约 150 倍（回复间隔是整整几个时隙，SS 要按估出来的时钟偏差折算）。`@uwb-m2m` |
| SP3 分组下的测距 §10.32.8（含 §10.32.8.2、§10.32.8.3） | 已发布 | 部分建模 | **建了的那一半**：SP3 包是 `uwb/phy.ts#uwbSp3Chips` = SHR + STS，没有 PHR 没有载荷，所以 `uwb/phy.ts#uwbSp3Ns` ≈ 141 µs，比最短的 SP1 帧短 42.051 µs；独立的 `uwbSp3` 帧类型与 `uwb/frames.ts#makeSp3`，而它**没有任何能装身份或时间的字段**——身份来自时隙（`uwb/session.ts#slotAction`），这一条由一次变异验收：把发起方的时隙表倒过来，距离会「出现而且是错的」，逐位等于另一台锚点的测量。三个相位齐全（§10.32.8.2）：RCM、SP3 测距、测量报告，而报告相位由 schema 保证而不是靠设备自觉——`sp3` 要求 `replyTime` 恰好是 `deferred`。Figure 10-242 的两帧也建了：发起方自己的标记，以及它在 RRTT 请求时才发的那一帧报告（`uwb/frames.ts#makeSp3InitReport`，`15 + 6A` 字节）。时隙预算 `uwb/phy.ts#uwbSlotsPerTag` 在 `sp3` 下是 `2A+2`，请求了 RRTT 是 `2A+3`；`sp3` 配双边双向测距是 `2A+4`（Final 之后还有发起方的延后报告，§10.29.6.6）。**仍未建**：MLME-STS 原语与 RSSD IE，因此 STS 计数器的推进也没有（本引擎没有一处密码学，`UWB_STS_CHIPS` 建的只是它占多少空口时间）；SP2；以及 §10.32.8.1 说过程可推广到的多发起方多响应方。`@uwb-sp3` |

## 六、已发布标准：多节点测距 IE（§10.32.9）

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| ARC IE（Advanced Ranging Control IE）§10.32.9.1 | 已发布 | 部分建模 | 每条 Poll 与辅助信息轮的 RCM 都挂它，应答方按它收到的 ARC IE 行事（有效轮数、MMRCR），长度 `uwb/phy.ts#ARC_IE_BYTES`（头 + 控制位 2 + Content Control 1；三个时长与 Session ID 不带——块结构由上层设定）。控制位逐个字段进了帧（`uwb/frames.ts#UwbArcFields`），帧检查器逐个列出；块号与轮号在 RR IE 里（下一行）。2026-11-10 之前它是「头 + 控制 2 + 块 2 + 轮 2 + 时隙 2」，后三项是 ARC IE 没有的字段。**RCM Validity Rounds（bit 9–14，六位）**——`scenario.ts` 的 `rcmValidityRounds`（1…63）、`uwb/session.ts#roundCarriesRcm`，一条控制消息管同一块里连续的几轮（不跨块，§10.32.9.1），其余轮只发 14 字节的启动消息。Multi-node Mode 的取值 2 只是名字对上了号：就是 `mode: 'm2m'` 建的那个多对多（那条路径不发 RCM）；Ranging Round Usage 的取值 3 由辅助信息交换轮的 RCM 发出（§10.35，见那一行）。**MMRCR（bit 15）现在也建了**——`scenario.ts` 的 `mmrcr`，一次收妥确认的请求，见 §10.36 那一行；**控制字里其余的位仍未建。** `@uwb-frame`、`@uwb-rcm-validity`、`@uwb-receipt` |
| RIU IE（Ranging Interval Update IE）§10.32.9.2 | 已发布 | 未建模 | **范围决定。** 会话的块长在整场仿真里是常数，没有任何东西能在空口上改它。 |
| RR IE（Ranging Round IE）§10.32.9.3 | 已发布 | 已建模 | 2026-11-10 起每条 RCM 都带它：`uwb/phy.ts#RR_IE_BYTES`（头 2 + 块号 2 + 跳轮位与轮号 2 + 发送偏移 2），轮号是本轮在块内的序号；不跳轮、不加偏移，这两个字段为 0。轮次的归属仍由 `uwb/session.ts#roundPlan` 一次算定，不在空口上协商。 |
| RBU IE（Ranging Block Update IE）§10.32.9.4 | 已发布 | 未建模 | **范围决定。** 同 RIU。 |
| RCPS IE（Ranging Contention Phase Structure IE）§10.32.9.5 | 已发布 | 部分建模 | 照标准的阶段表：表长 1 + 每个阶段一个 2 字节表项（阶段指示 2 位，起止时隙各 7 位），`uwb/phy.ts#rcpsIeBytes`、`uwb/frames.ts#UwbInfo` 的 `contention`。竞争测距轮的 Poll 带一个应答方竞争阶段（指示 1）；竞争式辅助信息交换轮的 RCM 带一个发起方竞争阶段（指示 0）。应答方按它收到的 RCPS 与 RCMA 行事（`uwb/device.ts` 的 `holdRcm`）。`@uwb-contention` |
| RCMA IE（Ranging Contention Maximum Attempts IE）§10.32.9.6 | 已发布 | 部分建模 | 同上，重试预算进了帧：`uwb/phy.ts#RCMA_IE_BYTES`。`@uwb-contention` |
| RCR IE（Ranging Change Request IE）§10.32.9.7 | 已发布 | 未建模 | **范围决定。** 引擎里没有任何一方能请求改变一次会话。 |
| RDM IE（Ranging Device Management IE）§10.32.9.8 | 已发布 | 部分建模 | 时间调度 Poll 携带锚点的时隙顺序：`uwb/phy.ts#rdmIeBytes`、`uwb/phy.ts#RDM_ENTRY_BYTES`（每台 3 字节）、`uwb/frames.ts#UwbInfo` 的 `schedule`。加入/退出的管理动作未建。`@uwb-slot-budget` |
| SRRR IE（SP3 Ranging Request Reports IE）§10.32.9.9 | 已发布 | 已建模 | 照图 10-255：一枚 IE 给一对请求方与提供方，控制 1 字节（两个地址长度说明、RAOA、RRT、RRTT、RTOF 四个请求位）加两个地址。本仿真器的发起方兼任控制器，请求方地址按 §10.32.9.9 省略，每个应答方一枚，`uwb/phy.ts#SRRR_IE_BYTES` = 头 2 + 控制 1 + 提供方地址 2 = 5，RCM 长 `uwb/phy.ts#srrrIeBytes` = 5A——**请求不是免费的**，与 §10.36 的 MMRCR 恰好相反。RRT 位总是置 1，应答方只在收到的 SRRR 置了 RRT 时才回报回复时间、置了 RAOA 时才带方位角（2026-11-10 之前不带地址、总是回报回复时间）；RAOA 与 RRTT 两位是 `scenario.ts` 的 `srrr`，两位都真的改变空口。RTOF 未用。两位在 SS-TWR 之外都被拒绝。`@uwb-sp3` |

## 七、已发布标准：安全（§10.31、§10.33）

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 安全事务测距 §10.31 | 已发布 | 未建模 | **范围决定。** 引擎不持有密钥、不加密、不做比对；`src` 里没有一处密码学。`@uwb-sts` 的 `limits` 已把这条后果写明：一次拒绝之后什么也不发生，会话不重试、不告警、不换密钥。 |
| 认证挑战—应答测距 §10.33（含协调 §10.33.4、ACRRC IE §10.33.6.1、Ranging Verifier / Prover 命令 §10.33.7.1/.2、MCPS-RANGING-VERIFIER/PROVER 原语 §10.33.8） | 已发布 | 未建模 | **范围决定。** 整节缺席：没有 Verifier/Prover 角色、没有挑战、没有那两个命令帧，也没有原语。这是 §10.31 那条范围决定的同一个后果。 |

## 八、已发布标准：消息处理（§10.34–§10.36）

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 测距消息未收到交互 §10.34，及 RMNR IE（Ranging Message Non Receipt IE）§10.34.2.1 | 已发布 | 已建模 | 响应方持有仍然有效的控制消息、却没收到本轮启动消息时，不再在自己的时隙里沉默，而是发一帧 RMNR：`uwb/frames.ts#makeRmnr`（13 字节 = MHR 9 + 一个 2 字节的单元头 + FCS 2，那个信息单元**没有内容字段**）、独立的 `'uwbRmnr'` 帧类型、`uwb/device.ts` 的 `owesRmnr`、`UWB_RMNR` 记录、以及 `view.ts` 里与 `timeouts` 配对的 `rmnr` 计数。发起方由此能把「这个锚点没听到」与「听到了但回答丢了」分开：墙后一个锚点的场景里，七条无从区分的 `UWB_TIMEOUT` 变成四条超时加三条点了名的理由。**它必须和 RCM 有效轮次一起建**，理由见 `@uwb-rcm-validity`：每轮一条控制消息时，丢了那一帧的响应方连自己该在哪个时隙发送都不知道。`@uwb-rcm-validity` |
| 测距辅助信息 §10.35，及 RAICT IE（Ranging Ancillary Information Message Counter and Type IE）§10.35.2.1 | 已发布 | 部分建模 | **Request = 0 与 Request = 1 两半都建了。** RAICT IE 照图 10-271：控制 1 字节（Request 位、消息编号存在位、保留位），加上消息编号 0 或 1 字节、Frames Remaining 0 或 1 字节——Frames Remaining **没有存在位**，带不带由信息元长度看出（`uwb/phy.ts#raictIeBytes`、`uwb/phy.ts#RAICT_IE_MIN_BYTES`、`uwb/phy.ts#uwbAncillaryBytes`、`uwb/frames.ts#makeAncillary`）。**辅助信息交换有自己的测距轮**（§10.35.1，ARC IE 的 Ranging Round Usage = 3，表 10-164）：每个标签在每块的测距轮之后多一轮，第 0 号时隙是控制器的独立 RCM（`uwb/frames.ts#makeAncillaryRcm`，`'uwbRcm'` 帧类型），按时间调度时用 RDM IE（SIU = 1）把时隙逐个指定给发送方，竞争时用 RCPS IE 给出一个发起方竞争阶段（`uwb/session.ts#roundCarriesAncillary`、`uwb/session.ts#roundsPerInitiator`）；发送方按它收到的 RCM 行事，没收到就不发。2026-11-10 之前辅助帧追加在测距轮之后，测距轮因此变长，这与块式结构只有一个轮长不符。**分段**：Frames Remaining 从 N−1 数到 0，而**每一帧都带着这个数**，缺的那一帧在**下一帧到达时**就被点名，不靠超时（`tests/uwb/ancillary-round.test.ts`、`tests/course/uwb-ancillary.test.ts`）；丢第一帧时这个机理什么也点不出，因为这个信息单元既不带总帧数也不带帧序数。这一节里**发起方与响应方的意思换了**：发辅助信息的那一端叫发起方。**Request = 1**：请求帧 Request 位置 1、Frames Remaining 带要求的时隙数、不带消息编号（`uwb/device.ancillary.ts#onAncillarySlot`）；§10.35 没有定义准予、拒绝或回复，控制器批不批是本仿真器定的——辅助信息轮装不装得下（`uwb/session.ts#ancillaryGrantFits`）——批了就在下一个辅助信息轮的 RCM 里用 RDM IE 把这么多时隙指定给发送方（竞争时放宽 RCPS 阶段），这是标准的元素；拒绝不发任何帧。**仍未建**：消息内容本身；没有消息类型字段（标准里也没有）；一轮只有一条消息、发送端恒为第 0 个响应方（`uwb/device.ancillary.ts#ANCILLARY_SENDER_INDEX`，模型取值）；「一条消息分几帧」由场景配置给出；SP3 会话里的辅助信息轮。`@uwb-ancillary`、`@uwb-ancillary-loss`、`@uwb-ancillary-request` |
| 多消息接收确认 §10.36，及 RMMRC IE（Ranging Multiple Message Receipt Confirmation IE）§10.36.2.1 | 已发布 | 已建模 | 请求是 ARC IE 控制字里的 MMRCR 位（bit 15，`scenario.ts` 的 `mmrcr`），应答方按它收到的那条 ARC IE 里这一位行事。回答是一帧 MMRCM：`uwb/frames.ts#makeMmrcm`、独立的 `'uwbMmrcm'` 帧类型、`uwb/phy.ts#uwbMmrcmBytes`。位图照 §10.36.2.1 **每个时隙一位**，覆盖这组测距轮次里确认帧之前的全部时隙（`uwb/session.ts#mmrcmAckSlots`），每个列表元素是地址 + 1 字节位图长度 + 位图（图 10-274）；2026-11-10 之前按轮一位、没有长度字节。确认帧落在这组最后一轮测距之后、轮长之内，**每个响应方一个时隙**（`uwb/phy.ts#uwbMmrcmSlots`、`uwb/session.ts#mmrcmResponders`）；位图在 `uwb/device.ts` 的 `noteReceipt` 里逐时隙记下。**两个计数不是同一个**：IE 的列表条目每个**发起方**一个，时隙与帧每个**响应方**一个。仍未建的是多播／多节点下发与长地址那一种条目。`@uwb-receipt` |

## 九、已发布标准：HRP UWB 物理层（§16）

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| HRP UWB PPDU 格式 §16.2 | 已发布 | 部分建模 | 每一段在引擎里只是一个码片数，加起来得出空口时间：`uwb/phy.ts#uwbPpduChips`、`uwb/phy.ts#uwbPpduNs`、`uwb/phy.ts#psduSymbols`；分段的画法是 `uwb/frameFields.ts#uwbPpduLayout`。没有调制、没有扩频、没有比特。`@uwb-frame` |
| BPRF 模式下 HRP-ERDEV 的 PHR §16.2.7.2 | 已发布 | 部分建模 | 长度照表 16-2：`uwb/phy.ts#PHR_SYMBOLS` = 21 个 PHR 速率符号（19 个 PHR 比特加 PSDU 的头两个比特），`uwb/phy.ts#PHR_SYMBOL_CHIPS` = 512（850 kb/s 标称）；2026-11-10 之前按 19 个算，每个 PPDU 短 896 码片。字段内容未建；PSDU 上限 127 字节这条约束记在 `uwb/phy.ts` 的注释里。 |
| HPRF 模式下的 PHR §16.2.7.3 与 HPRF 调制 §16.3.4 | 已发布 | 未建模 | **范围决定。** 整个 UWB 侧只有 BPRF 参数集 3 一种配置（见 §16.7 那一行），HPRF 在 `src` 里连一个常量都没有。术语表已写明这一点。 |
| 加扰时间戳序列（scrambled timestamp sequence, STS）字段 §16.2.9 | 已发布 | 部分建模 | 建的是**它占多少空口时间**：`uwb/phy.ts#UWB_STS_CHIPS` = 512 + 64×512 + 512 = 33 792 码片（67.692 µs），由 `uwb/phy.ts#STS_GAP_CHIPS` 与 `uwb/phy.ts#STS_ACTIVE_CHIPS` 拼出，插在 PHR 之前。没建的是序列本身。`@uwb-sts` |
| STS 的 DRBG §16.2.9.2、形成 STS §16.2.9.3、生成测试矢量 Annex G / §G.2 / §G.3 | 已发布 | 未建模 | **范围决定。** 引擎不生成伪随机码片、不做 AES-128、也不比对。攻击者伪造不了更早的前沿这件事，在 `@uwb-sts` 里是一条**布尔量**（场景里的一个开关），不是一次密码学判定；该课的 `limits` 已把这条写明。 |
| 附加 STS RMARKER（SRMARKER）§16.2.9.4 | 已发布 | 未建模 | **范围决定**（2026-10-03 从「未偿的债」改判，`docs/superpowers/specs/2026-10-03-leftovers-design.md` §1）。三条理由：一，BPRF 强制参数集的段数是「1，强制」（Table 16-17），段长 64 个 512 码片单位（Table 16-31 第 3、4 行，即 `uwb/phy.ts#STS_ACTIVE_CHIPS`），所以五个 SRMARKER 里只有两个存在，SRMARKER2–4 在本引擎里不是没建而是不存在。二，§16.2.9.4 自己写明，PHR 与 PSDU 排在 STS 之后、或者整个不存在的那两种分组配置下 SRMARKER0 与 RMARKER 是同一时刻，而本引擎只建这两种（`sp: 1` 与 `sp: 3`），那个时刻就是 `uwb/phy.ts#UWB_RMARKER_CHIPS`。三，剩下 SRMARKER1 唯一落得到本引擎的用途是 §10.29.1.1 的相对时钟偏差估计，而那个算术引擎已经有了，并且跨度长十五倍：`uwb/mms.ts#ratioSigma` 在 SRMARKER0→1 的 66.667 µs 上给 2.1 ppm，在一串片段的 14 ms 上给 0.010 ppm，而会话直接交出来的 `cfoNoisePpm` 缺省是 0.2 ppm。**这不是举证不足**：§16.2.9.4、§10.29.1.1、Table 16-17、Table 16-31 全文都在语料库里（第 662、435、661、681 页）。`@uwb-sts` |
| 可选脉冲形状：UWB 线性调频（chirp on UWB, CoU）§16.5.2 | 已发布 | 未建模 | **范围决定。** 引擎没有波形层，`src` 里没有 `chirp` 这个词。脉冲形状的全部影响在这里被一个带宽代替（`uwb/units.ts#UWB_CHIP_HZ` = 499.2 MHz）。 |
| 可选脉冲形状：连续频谱（continuous spectrum, CS）脉冲 §16.5.3 | 已发布 | 未建模 | **范围决定。** 同上。 |
| 脉冲的线性组合（linear combination of pulses, LCP）§16.5.4 | 已发布 | 未建模 | **范围决定。** 同上。 |
| HRP-ERDEV 参数集 §16.7 | 已发布 | 部分建模 | 只有一组，并且是硬写的：`uwb/phy.ts#SYNC_SYMBOLS` = 64、`uwb/phy.ts#SFD_SYMBOLS` = 8（Table 16-31 参数集 3）、`uwb/phy.ts#PSYM_CHIPS` = 508、`uwb/phy.ts#DATA_SYMBOL_CHIPS` = 64（6.8 Mb/s）、`uwb/phy.ts#RS_PARITY_BITS` = 48。参数集不是一个可选的量，所以「换一组参数集」这件事在课程里不可能出现。 |
| 晶振容差 ±20 ppm §16.4.9 | 已发布 | 已建模 | `uwb/phy.ts#UWB_PPM_MAX` = 20，`uwb/clock.ts#UwbClock` 按一个固定 ppm 线性缩放时间。真实晶振随温度漂这件事未建，已写进 `@uwb-mms` 的 `limits`。 |
| 最大输入电平 −45 dBm/MHz §16.4.10 | 已发布 | 未建模 | **范围决定。** 值写在 `uwb/phy.ts#UWB_MAX_INPUT_DBM_PER_MHZ` 里但不生效：强干扰只进信干比（`uwb/phy.ts#UWB_SIR_MIN_DB`），从不堵住接收机。已写进 `@uwb-coexist` 的 `limits`。 |

## 十、已发布标准：LRP UWB 物理层（§19）

**整章缺席。** 这是本表最大的一块空白，而它是一个范围决定：本仿真器的 UWB 侧从第一刀起就只建 HRP
（术语表明写「LRP UWB 不在范围内」）。两行足以说明它的大小。

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| LRP UWB PHY 的四种符号结构与它们的帧：基本模式 §19.2.2、扩展模式 §19.2.3、长距模式 §19.2.4、双频模式 §19.2.5；SHR 与前导码 §19.3.2.1–§19.3.2.4；SFD §19.3.3.1；PHR §19.4；PSDU §19.5；发射机规格 §19.7；收发定时 §19.8；信道编号 §11.1.3.8；LRP PIB §12.3.6；信道能力 E.7.4.5 | 已发布 | 未建模 | **范围决定。** `src` 里唯一一处提到 LRP 的地方是术语表里那句「不在范围内」。整个物理层、它的四种模式、它自己的信道表、它自己的 PIB，一行也没有。课程里没有一课以 LRP 为题。 |
| LRP 的定位增强信息后导码 §19.6，及 LRP-ERDEV 的附加 SFD §19.3.3.2 | 已发布 | 未建模 | **范围决定。** 跟着上一行一起缺。单独列出来，是因为这两条正是 LRP 那一侧做测距的入口——读者若只看上一行，会以为缺的只是一种调制。 |

---

## 十一、P802.15.4ab 草案：MMS 测距（§10.39、§16.2.11）

本仓库的 4ab 模型照公开提案改写，主要依据 15-22/0381r5、15-23/0100r2、15-23/0502r3、15-22/0205r0。
下面每一行的第二列都另行举证，因为提案编号只说明「有人提过」，不说明「进了草案」。

**当前草案版本是 D05，正在第一次 SA 投票复审中。** 证据：15-26/0194r3 摘要写「SA ballot of P802.15.4ab D05」，
15-26/0281r11 摘要写「P802.15.4ab/D05 Draft Standard」，15-26/0414r0 标题即「resolution of sa ballot **d05** comment r1-297」，
15-26/0420r0 逐条对比「line 19-20 in D05」与「the original sentence in D04」。这一条推翻了仓库现有的一处说法——见下文第 1 条。

**2026-10-15 刷新后的复审进度**（15-26/0431r4 第 38–45 页、15-26/0427r6 的议程）：D05 这一轮复审投票 9-21 开、10-03 关，共 **316 条意见**（108 条技术、204 条编辑、4 条一般，编号 R1-*）；9-29 的意见决议组（comment resolution group, CRG）电话会之后，232 条有了处置、84 条仍空着。往下的日程是每周一次电话会（9-29、10-06、10-13、10-20、10-27、11-03），**下一次复审投票 10-23 至 11-02**，11 月全会 11-09 至 11-12；主席给的硬期限是「要在全会前走完复审，就得 10-28 开票」。本节与下面两节里带日期的票数都出自这几份记录。

**2026-10-21 刷新**（15-26/0431r6 与 15-26/0427r8，均为 10-20 的修订）：索引多了 9 条修订、落盘 5 份，语料库仍是 1150 篇——**没有一个新编号，全是旧编号的新版**。10-20 的电话会之后：CRG Motion #33（R1-1、R1-2，15-26/0431r6 第 55 页）**无异议通过**；#32（15-26/0408 那 25 条处置，含 R1-279、R1-280）的结果栏**仍然空着**；新排了 #35（R1-315，15-26/0437r0）与 #36（R1-35，15-26/0365r2），两条都还没有结果。15-26/0408 改到 r2（10-19）：R1-316／R1-318 的处置改写，并新增一条 Rogue-26。这一次的改法多了一步：**刷新触到的每一个文稿编号，在 `src/course` 与 `docs/` 里各 grep 一遍**——第十七节第 7 条记着为什么。

**2026-11-02 刷新**（直接读 mentor，镜像没动——为什么，见第十七节第 8 条）：10-20 的电话会之后又传了 **22 份修订**：**9 个新编号**（15-26/0447、15-26/0448、15-26/0450、15-26/0454、15-26/0455、15-26/0456、15-26/0457、15-26/0458、15-26/0460）与 5 个旧编号的新版（15-26/0417r1、15-26/0427r9–r11、15-26/0431r7、15-26/0277r7–r8、意见汇总表 r10–r12）。新编号里没有一份新特性提案——八份是意见决议、一份是 11 月全会的议程。
**动议结果**（15-26/0431r7 第 56–64 页；日期出自 15-26/0277r8 的计票页与意见汇总表 r12 的 Voted 栏）：CRG Motion #32（15-26/0408r2 那 22 条，含 R1-279、R1-280、R1-314、R1-196、R1-197、Rogue-26）**10-20 无异议通过**；#35（R1-315，15-26/0437r0）**无异议通过**；**#36（15-26/0365r2，R1-35 与 R1-311）10-27 以 Y/N/A 5/4/7 被否**；#37（15-26/0440r2，R1-11／R1-12）、#39（15-26/0454r1）、#40（15-26/0455r1）、#41（Group I 的三条 rogue 意见）10-27 均无异议通过；#38（15-26/0458r0 的 32 条窄带信道接入意见）与 #42（15-26/0448r0 的 R1-282）已排上、无人动议、无结果。
**复审进度**（意见汇总表 r12，10-27）：316 条里 262 条有处置（160 条 Accepted、63 条 Rejected、39 条 Revised），**54 条空着——全是技术意见**，其中 20 条在 §10.39.8.3、6 条在 §10.39.4.2、3 条在 §10.44.2：剩下的几乎全是窄带信道接入那一堆，而它们正是 #38 要包掉的。日程：幻灯片第 45 页仍写着「复审投票 10-23 至 11-02」，但 11-03 的电话会议程（15-26/0427r11）排的还是意见决议（15-26/0448r0 与 R1-317），11 月全会（11-09 至 11-12，15-26/0450r0）周一留了 30 分钟「继续讨论信道接入的提案」——这一轮复审到底开没开票，语料库定不了。
grep 步骤照做：这次触到的编号在 `src/course` 与 `docs/` 里命中的是 15-26/0365r2（`@uwb-ssbd` 的 `sources`、`curriculum.ts` 的文稿条目、backlog 切片 5b 三处写着「动议尚未表决」）、15-26/0437r0（`uwb/mms.ts` 注释里引的旧参数名）与 15-26/0417r0（本表一行），全改了。

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 多毫秒（multi-millisecond, MMS）UWB 操作 §10.39 总体 | 已进草案且未见争议 | 部分建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.39「Multi-millisecond (MMS) UWB operation」直接引 §10.39；2026 年的意见决议成批引用 §10.39.x 的页/行（§10.39.8.3 一项就命中 272 次）。引擎建的是**单边双向加时钟比率修正**那一种：`uwb/mms.ts#mmsLayout`、`uwb/device.mms.ts#onMmsSlot`、`uwb/device.mms.ts#onMmsRx`、`uwb/device.mms.ts#solveMmsFix`；`uwb/session.ts#MmsRoundPlan`。MMS 里的 DS-TWR 未建。**2026-10-15 刷新：D05 把往返时间与回复时间的减法写反了，而引擎没有。** R1-280 指出 §10.39.10 把 Tround 定成「发减收」、把 Treply 定成「收减发」，照字面算出来两个时间都是负的；处置 **Accepted**，改成发起方取「收减发」、应答方取「发减收」（15-26/0408r1）。引擎本来就是这个方向——`uwb/device.mms.ts` 里先发的那一端取 `counterDiff(收, 发)`、另一端取 `counterDiff(发, 收)`，而那段注释写的正是反过来会怎样：`counterDiff` 只会回绕，于是一个倒着跑的区间变成将近 2⁴⁰ 的计数，乘上时钟修正之后是几十公里的距离，照样作为一条 `UWB_RANGE` 发出去。这条处置排在 CRG Motion #32 里（10-20 的议程 15-26/0427r6；15-26/0431r4 第 54 页那一栏的结果还空着——**2026-10-21 刷新**：10-20 修订的 15-26/0431r6 第 54 页仍然空着，而同一份幻灯片已经排上了它后面的 #35 与 #36）。**2026-11-02 刷新：通过了。** CRG Motion #32 于 10-20 无异议通过（15-26/0431r7 第 56 页；意见汇总表 r12 里 R1-280 的 Voted 栏写着 10-20），减法方向的更正进了草案。`@uwb-mms`、`@uwb-mms-numbers` |
| HRP UWB MMS 包格式 §16.2.11 | 已进草案且未见争议 | 部分建模 | 证据：条号 `16.2.11` 在 2026 年文稿里仍被引用（4 次），四年未变；15-25/0066r1 引「UWB driven MMS packet format configuration」。引擎建的是片段的**长度与位置**：`uwb/mms.ts#rsfNs`、`uwb/mms.ts#rifNs`、`uwb/mms.ts#mmsPacketFragments`、`uwb/mms.ts#rifStartMs`、`uwb/frameFields.ts#mmsPpduLayout`。片段内部的序列未建。`@uwb-mms-numbers` |
| RSF / RIF 片段数与长度（草案现名 RSF Fragment Length / RIF Fragment Length）§10.39.11.1.3.8 | 已进草案且未见争议 | 已建模 | 证据：15-26/0193r0 引「The MMS Number of Fragments field, if present, shall be set as per 10.39.11.1.3.8」；字段改名出自 15-24/0506 与 15-25/0066r1。取值集合：`uwb/mms.ts#N_MSR_SET`、`uwb/mms.ts#STS_LEN_SET`、`uwb/mms.ts#RSF_COUNT_SET`、`uwb/mms.ts#RIF_COUNT_SET`。`@uwb-mms-numbers` |
| MMRS 符号与参数集（Config 表）§16.2.11 | 已进草案且未见争议 | 部分建模 | 证据：15-23/0502r3（拟编 16.2.11.4）；草案的 MMRS 配置集现为 Table 85，至少到 Config #49。引擎的 `uwb/mms.ts#MMS_SETS`、`uwb/mms.ts#mmsSet` 是其中一个**命名子集**，不是整张表。`uwb/mms.ts#MMRS_LEN`、`uwb/mms.ts#MMS_SPREAD`。**2026-10-15 刷新**：R1-304 要求把「强制参数集见 §16.8.1／§16.8.2」这句话加回 §16.2.11.1，处置 **Rejected**——同一小节十几行之后还有一份同样的话，D04 阶段按 I-219／I-93 删掉的正是重复的那一份；该处置随 CRG Motion #29 于 9-29 无异议通过。`@uwb-mms-numbers` |
| 每毫秒能量预算 | 已进草案且未见争议 | 已建模 | 证据：15-22/0205r0。`uwb/mms.ts#UWB_MS_BUDGET_NJ` = 37 nJ、`uwb/mms.ts#mmsFragmentDbm`：片段越短发得越猛。峰值功率那条规矩未建，已写进 `@uwb-mms-numbers` 的 `limits`。 |
| 片段累加与检出（acquisition） | 已进草案且未见争议 | 部分建模 | 证据：15-23/0100r2 §2.3.2。`uwb/mms.ts#combineGainDb`（上限 10·log₁₀16）、`uwb/mms.ts#trainDetected`、`uwb/mms.ts#acquired`、`uwb/mms.ts#ratioSigma`、`uwb/mms.ts#rmarkerFromFragment`。「接收机事先知道这一串的形状」在引擎里是一个布尔量，不是一次相关运算。`@uwb-acquisition` |
| `macMmsRpDuration` 的下界 | 已进草案且未见争议 | 部分建模 | 证据：15-25/0282r1 引述草案——下界由所有 RSF/RIF 片段的实际时长推出。引擎的 `Math.max` 形状对，但垫在下面的 `uwb/mms.ts#MMS_RP_MIN_SLOTS` = 20 是**本仿真器自己的地板**，草案没有这个数。`@uwb-slot-budget` |
| 非交织子轮 §10.39.7 | 仍在争论 | 部分建模 | 证据：I-331 的决议提案（15-26/0296r1，含 §10.39.7.4 的插入句）先后两次被否——2026 年 7 月全会 **19/9/4（67.8%）**、9 月前的电话会 **11/7/1（61.11%）**，见 15-26/0348r1、15-26/0377r2；另有 15-26/0354r0「clarification of one-to-many modes and interleaving modes」仍在澄清这套概念。引擎的非交织是 `subRounds = 1 + responders`（`uwb/mms.ts#mmsLayout`），即**两子轮的单边双向那一种**。**2026-10-15 刷新**：R1-314 指出「时间间隔 A 的 2 ms／1.5 ms 必须支持」这条要求连着的例子只对交织模式成立，处置 **Revised**——那句话里补上「在交织测距中」（15-26/0408r1，排在 CRG Motion #32，10-14 时未表决）。也就是说非交织的那几种形态不受这两个数约束。**2026-11-02 刷新**：#32 已于 10-20 无异议通过，R1-314 的那句「在交织测距中」进了草案。`@uwb-subrounds` |
| 一对多非交织 DS-TWR（三子轮 §10.39.7.2.3、四子轮 §10.39.7.2.4） | 仍在争论 | 未建模 | 证据：15-26/0425r0（2026 年 9 月中间会议纪要）记 Motion #26——Group J 的意见决议（15-26/0417r0，R1-50 与 R1-13）**Y/N/A 12/13/1，动议被否**，反对理由是「一对多非交织 DS-TWR 在移动场景下的时长，以及应答方多时的帧长」；另有 15-26/0184r1 的意见直接提议**删掉 §10.39.7.2.4 与全部四子轮 DS-TWR 的引用**。**未偿的债**：`@uwb-subrounds` 算出来的时长只是两子轮那一种的时长，该课 `limits` 已把三子轮与四子轮两种形态都写明未建（**2026-11-02 更正**：此前这里写着「四子轮那一种尚未写进去」，而 `@uwb-subrounds` 的 `limits` 第一条写的正是四子轮——表在替课记一笔它早已还清的债，见第十七节第 8 条）。**2026-10-15 刷新**：R1-315（15-26/0437r0，排在 10-20 的电话会）要动的正是报告窗口那几个时隙参数——D05 的「第一／第二／第三报告时隙数」里第三个之所以存在，就是为了 §10.39.9.3 的省时一对多；提案建议改成「发起方报告时隙数」与「应答方报告时隙数」一对，腾出位置给 Final 消息自己的时隙数（D05 根本没给它配一个）。引擎的报告窗口是自己的一对（`uwb/mms.ts#mmsReportWindowSlots`、`uwb/mms.ts#mmsReportSlots`），注释里引的就是那几个草案参数名，它们可能要改名。**2026-10-21 刷新**：这条处置已排成 CRG Motion #35（15-26/0431r6 第 57 页，10-20 时无结果）。**2026-11-02 刷新：三件事。** 一、#35 于 10-20 无异议通过（15-26/0431r7 第 57 页）：D05 的 `mms1stReportNSlots`／`mms2ndReportNSlots`／`mms3rdReportNSlots` 换成 `mmsInitiatorReportNSlots` 与 `mmsResponderReportNSlots` 一对，Management MAC Configuration 字段里腾出的位置给了 `RcpFinalSlots`（15-26/0437r0）——`uwb/mms.ts#mmsReportWindowSlots` 注释里引的旧名已随之加注。二、Group J 回来了：15-26/0417r1（Skyworks／ST，11-02）不再按 9 月被否的 r0 走，把 R1-50／R1-13 改判 Revised——新增 One-to-many Final 复合帧（Compact Frame ID 19，§10.39.11.3.21），Message Control 为 0 时内容是五个零字节（只为估时钟频偏），为 1 时带「应答方数 + 往返时间列表 + 预计 Poll-to-Final 时间」，让每个应答方自己算 Treply2、省掉单独的报告帧；一对多与交织模式的组合（R1-17）留给「基于 15-26/0354 的另一份 CR」。三条在意见汇总表 r12 里仍然空着，尚未排动议。三、15-26/0454r1（NXP，10-27，CRG Motion #39 无异议通过）把三子轮 DS-TWR 与「混合」形态里第三帧的名字与时序统一成 Final 复合帧与 `mmsRcpFinalNSlots`（R1-275、R1-276、Rogue-36），并把单向测距里的「发射方」改成「发起方」（R1-206）。**本行括号里的条号是 D04 的**：0454r1 把 §10.39.7.2.4 叫作「混合」形态（一个交织子轮加一个非交织子轮），15-26/0458r0 的时长表又把混合形态编在 §10.39.7.2.5、单向测距在 .2.7——D05 把这几节挪过号，而 15-26/0184r1 说的「四子轮」在这两份里都没有以这个名字出现。条号以草案为准；这里按 0184r1 写的 D04 条号保留，并标明。 |
| 报告嵌入后续测距交互（可选延后） | 仍在争论 | 未建模 | 证据：Group G 的决议提案三次被否——2026 年 7 月 **21/12/3（63.6%）**（15-26/0194r1）、9 月前电话会 **12/6/1（66.67%）**（15-26/0194r2）、9 月中间会议 Motion #27 **11/13/0**（15-26/0194r3），见 15-26/0348r1、15-26/0377r2、15-26/0425r0。反对理由：把报告塞进下一次交互会拖慢上一次的收尾，而下一次若失败报告就丢了。**未偿的债**（若草案最终采纳）：引擎的报告阶段始终是独立的（`uwb/mms.ts#mmsReportSlots`）。 |
| 固定回复时间 `macMmsFixedReplyTime` | 仅为提案，未进草案 | 已建模 | **2026-11-10 的标准核查改判。** 提案正文在语料库里（15-25/0224r2 给出对 §10.39.11.1.3.8 与 §10.39.11.3.7/.8 的逐页修改，15-25/0376r0→r2、15-25/0556r1/r2 是它的后续），答复的是 CID 73、74、78、82；而这几条意见最终采用的决议是 **15-25/0681r1**（电话会议纪要 15-26/0006r0：无异议通过），它的结论是不需要固定回复时间参数，改由应答方在一对一或一对多的应答紧凑帧里携带**预测回复时间（Predicted Reply Time）**，且只用于非交织模式；15-26/0180r3 把这个字段当作现有草案文字引用。**此前本格写「0681r1 把起点改成收完整个 MMS 包之后」是读错了——它取代的是这个选项本身。** 下面保留的是改判之前的检索记录：但纪要里这份提案**每次都以「更多线下讨论」收场**（15-25/0428r0 两处、15-25/0514r1、15-25/0676r0），没有一条「无异议通过」或表决记录；而**2026 年的全部文稿——包括 D04/D05 的意见汇总与决议——没有一处出现 `macMmsFixedReplyTime` 或 `Fixed Reply Time` 字样**。所以它究竟进没进 D04/D05，语料库定不了。引擎：`uwb/mms.ts#MMS_FIXED_REPLY_RSTU_DEFAULT`、`uwb/mms.ts#MMS_FIXED_REPLY_RSTU_MIN`、`uwb/mms.ts#MMS_FIXED_REPLY_RSTU_MAX`、`uwb/device.mms.ts#onMmsSlot`。`@uwb-subrounds` |
| 反序 MMS（Reversed MMS Order） | 无法判定 | 已建模 | **查了什么：** 同上一行的那几份文稿（字段布局见 15-25/0224r2 的 Figure 65，bit 6 与 bit 7 同在 MMS Number of Fragments Configuration 那一字节）。2026 年文稿里 `Reversed` 只出现两次，且都在 15-26/0184r1 谈 §10.39.7.2.4「reversed roles」的语境里，与这个**被信令置位的参数**不是一回事。引擎：`uwb/mms.ts#MMS_REVERSED_OFFSET_RSTU` = 600 RSTU、`uwb/mms.ts#MMS_DRAFT_DEFAULTS`。`@uwb-subrounds` |
| RSF 带 SFD（`phyUwbMmsRsfSfd`） | 无法判定 | 部分建模 | **查了什么：** 15-25/0066r1 给出字段位置（Ranging PHY Configuration 的 bit 19）与 PIB 属性定义，15-25/0095r3 有相关意见。2026 年文稿里没有一处提到这个属性或这一位。引擎：开关在 `uwb/mms.ts#MMS_DRAFT_DEFAULTS` 的 `rsfSfd`，而**置 1 之后 RSF 真的变长了**（2026-10-03）——`uwb/mms.ts#rsfAirNs` 给它加上 5 800 ns 的 SFD（取自 15-25/0194r0 捕获对照表短分组那一列，已在 `uwb/mms.ts#MMS_SP0_SEGMENT_NS` 里；标准那条路是 8 个前导符号 × 364 码片 = 5 833 ns，两者差 0.57%），`uwb/frames.ts#makeRsf` 的长度与 `uwb/mms.ts#mmsLongestFragmentNs` 的时隙上限都从它来，于是每个片段的峰值功率低 0.188 dB（`nMsr` 32 时 0.368 dB）。**没建的是**：片段内部的序列与相关检测（`uwb/mms.ts#acquired` 一向是一条门限判据），以及片段的画法仍是一整段而没有拆成序列 + SFD（`uwb/frameFields.ts#mmsPpduLayout`，留给下一刀）。序列码索引那一条不必校验：草案的「9–32」就是长 127（Table 16-8）与长 91（Table 16-9）两族码，而本引擎的 MMS 分组用的正是长 91 那一族，**条件构造上成立**。该课 `limits` 已写明。`@uwb-acquisition`、`@uwb-uwbd` |
| NBA-MMS（Config 2）与 UWBD-MMS（Config 1）两套配置 | 已进草案且未见争议 | 部分建模 | 证据：15-26/0029r2 逐条引用 §10.39.4.2 的草案文字并直呼「NBA MMS UWB」；15-25/0066r1 引「UWB driven MMS configurations」。引擎：两套配置是会话配置里的一个开关（`model/scenario.ts#UwbMmsCfg`、`uwb/mms.ts#MMS_DRAFT_DEFAULTS` 的 `control`），**不是空口上的一次商定**——管理帧那个 SOR Management PHY Configuration 字段引擎不建。`@uwb-uwbd` |
| 零长控制阶段（Poll/Response 长度为零） | 无法判定 | 已建模 | **查了什么：** 只有 15-25/0194r0（含它第 17 页那张非交织图）说这件事；2026 年的草案引文里找不到对应文字。引擎：`uwb/mms.ts#MMS_DRAFT_DEFAULTS` 的 `uwbdControl`，取 `'none'` 时一轮里除片段之外只剩报告帧。`@uwb-subrounds` |
| SP0（BASIC_PACKET）控制面 | 无法判定 | 部分建模 | **查了什么：** 同上，15-25/0194r0。**草案的消息 ID 属于窄带的压缩 PSDU（15-22/0381r5 Table 1.6.3.1），而 SP0 内容自己的布局语料库里没有**，所以引擎把角色直接当角色携带（`uwb/frames.ts#UwbSp0Msg`），这是模型取值。长度与灵敏度代价建了：`uwb/mms.ts#MMS_SP0_NS`、`uwb/mms.ts#MMS_SP0_PENALTY_DB`、`uwb/mms.ts#MMS_SP0_MBPS`。`@uwb-uwbd` |
| 片段间隔 | 已进草案且未见争议 | 部分建模 | 证据：成对轮次 1 ms 出自 15-23/0100r2；交织模式 500 µs 偏移出自 15-25/0388r1。引擎用的是**第三种**：一对多交织轮里 `(responders + 1) × slot`（`uwb/session.ts#MmsRoundPlan` 的 `fragGapNs`），因为 MMS 时隙必须是 300 RSTU 的整数倍，R > 1 时没有一个合法时隙能让 (R+1) 个凑成一毫秒。交织模式的 500 µs 偏移**未建**。**2026-11-02 刷新**：15-26/0456r0（Apple，10-26）对 R1-209「给时间间隔 A 定 ±4 码片的容差」提议 Rejected——单是窄带射频通路的群时延就有约 100 ns 的个体差异，而且没有现成的测试手段；尚未表决。`@uwb-mms-numbers` |

## 十二、P802.15.4ab 草案：窄带辅助与共存

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 窄带辅助 UWB（narrowband-assisted UWB, NBA-UWB）控制面 §10.39.4.2 | 已进草案且未见争议 | 部分建模 | 证据：15-26/0029r2 逐条引用 §10.39.4.2 页 84 的草案文字；15-26/0174r1 把「删掉窄带（Clause 13）」这条意见（I-386）判为 **Rejected**，理由是超出 PAR 范围——也就是说窄带留在草案里这件事本身已有裁定。引擎：那部窄带射频**只有一个物理层，没有任何链路层**——`uwb/nb.ts#nbPpduNs`（2 Mchip/s O-QPSK、250 kb/s）加几个消息大小，帧由 `uwb/frames.ts#makeNbPoll`、`uwb/frames.ts#makeNbResp`、`uwb/frames.ts#makeNbReport`、`uwb/frames.ts#makeNbPollOtm` 造出来。`@uwb-nba` |
| 窄带信道规划（UNII-3 / UNII-5，250 个 2.5 MHz 信道） | 已进草案且未见争议 | 部分建模 | 证据：15-22/0381r5 §1.4.1 给出数量与频段边界；15-26/0029r2 的意见直接谈 UNII-3/UNII-5 下的窄带操作，是草案内容。引擎：`uwb/nb.ts#NB_CHANNELS` = 250、`uwb/nb.ts#NB_CHANNEL_MHZ` = 2.5、`uwb/nb.ts#nbCenterMhz`、`uwb/nb.ts#nbBand`。**中心频率那个公式是照数量与边界反推的**，草案只把编号画成一张图。`@uwb-nba-coexist` |
| 窄带按块跳频 | 已进草案且未见争议 | 部分建模 | 证据：15-26/0365r0 逐句引用草案的规范文字「the next channel in the hopping sequence」——跳频序列在草案里（**2026-10-21 刷新**：那份提案的 r2 已不再用「序列的下一条」，改成允许清单里按偏移量取的那一条，见下面频域延后那一行；但这句引文证明的只是「草案有跳频序列」，而 R1-279 的处置已把生成式本身摆了出来，所以这一格的证据不受影响）。引擎：`uwb/nb.ts#nbChannelForBlock` 用的是**仿真器自己的字符串散列**，不是 15-22/0381r5 §1.5.3 提的「以会话种子为密钥对块序号做 AES-128-CTR」。**2026-10-15 的刷新把这一问关掉了**：生成式确实写在 D05 §10.39.8.4.3 里，而 R1-279（15-26/0408r1）为了换掉一个越界的例子把它整段算了一遍——`NbaPrng(种子, 计数器)` 出 128 位，取其中 32 位作 `PrngValue`，再映到信道号；种子只有一个八位组（Table 35 把 `mmsPrngSeed` 限在 0–255，而原来的例子写的是 1234），计数器是块序号（草案里叫 `RangingBlockIndex`；R1-18 顺手删掉了把它改名成 `mmsChannelSwitchCounter` 的那条编辑注记）。处置 **Revise**，给出种子 123 的十行对照值。所以 15-22/0381r5 §1.5.3 那个「拿会话种子当密钥、对块序号跑分组密码」的形状是对的，而引擎的字符串散列从此是一处**已知的背离**，不再是一个开着的问题（这条随 CRG Motion #32 等 10-20 的电话会）。`@uwb-nba-coexist` |
| 窄带先听后说（listen-before-talk, LBT）§10.39.8.3 | 仍在争论 | 部分建模 | 证据：**这是 15-26/0391r4 第 36 页列出的三个未决技术议题之一**（"Various narrow band technical topics"）。表决记录：LBT 意见的成批决议（15-26/0244r1）2026 年 7 月 **25/14/1（64.1%）被否**；CID I-28（CCA 判空后是否「立即发送」，§10.39.8.3）两次被否——**20/15/2（57.1%）** 与 **18/19/0（48.6%）**；把 LBT 从 "may" 改成 "shall" 的那批意见 15-26/0061r0 判为 **Rejected，理由是「Group failed to reach consensus」**。均见 15-26/0348r1。引擎：`uwb/nb.ts#nbLbtRequired`、`uwb/nb.ts#NB_LBT_THRESHOLD_DBM`；**草案要求至少评估 9 µs，这里以一次瞬时功率读数代之**。**2026-10-21 刷新**：R1-12（15-26/0440r2，Samsung，10-20）问的正是 LBT 把一帧窄带捕获复合帧（Narrowband Acquisition Compact frame）拖晚之后、帧里的会话信息已经作废怎么办——处置 **Revised**，加一条注记：用 CSMA/CA 发这种帧时**建议把最大退避次数置 0**，信道忙就让 MAC 直接报 CHANNEL_ACCESS_FAILURE，由上层换一帧新信息再试、或只带下一帧的时刻。本引擎没有捕获帧；而它的窄带侧「判忙就不发」与这条注记的方向一致——都不让一条过时的消息在队列里等。**2026-11-02 刷新：这一行的争论换了形状。** R1-12 的那条注记随 CRG Motion #37 于 10-27 无异议通过（15-26/0431r7 第 59 页）。更大的一件事是 15-26/0458r0（Qualcomm、Meta、Huawei、Cisco、Calterah 联署，10-27）：一份处置包掉 32 条窄带信道接入意见（20 条在 §10.39.8.3，多条标着「必须满足」），把 D05「可以用 LBT」那句整段换成**按占空比触发的强制 CCA**——任意 200 ms 窗口内窄带发射占空比超过 7% 的设备，每次 O-QPSK 发射前做 CCA mode 1 或 3a，**CCA 至少 16 µs**（短于 16 µs 会在 802.11 的 SIFS 间隙里误判空闲），能量检测门限按当地法规、没有法规时取 −75 dBm/MHz，判空立即发、判忙就不发；§10.39.4.2 的「may」与捕获帧的「建议」一并改成「shall」。文稿自己算的占空比：一对一各形态 10 Hz 测距都在 3% 以下，一对多 7 个应答方时发起方 6.24%——7% 这条线画在 4ab 自己定义的所有形态之上。它排成 CRG Motion #38（第 64 页），10-27 的议程状态是「n，还要时间」，11 月全会周一留了 30 分钟继续谈，**尚未表决**。对本引擎：−75 dBm/MHz 正是 `uwb/nb.ts#NB_LBT_THRESHOLD_DBM` 取的数；16 µs 的最短感知时长仍以一次瞬时读数代之；而「占空比超过 7% 才强制」这一层引擎根本没有——它的窄带侧每个时隙都做 LBT，要么全开要么全关。`@uwb-nba-coexist` |
| 窄带发射功率控制（transmit power control, TPC）与复合帧 | 仍在争论 | 未建模 | 证据：**15-26/0391r4 第 36 页三个未决议题的第二个**（"Support for transmit power control with compact frames"）。CID I-23 的决议提案至少三度被否：15-26/0281r02 在 7 月全会 **13/10/10**、15-26/0285r1 同场 **14/16/2（46.6%）**，见 15-26/0348r1；该文稿本身已改到 r11，另有 15-26/0253r1、15-26/0362r1、15-26/0364r1 三份竞争方案，以及第 63 页与第 71 页两次非正式投票。**范围决定**：引擎里 UWB 与窄带的发射功率都是常数（`uwb/phy.ts#UWB_TX_POWER_DBM`、`uwb/nb.ts#NB_TX_DBM`），没有任何功率自适应。**2026-10-15 刷新：第四次被否，而且这一次有日期。** 15-26/0281 改到 r12 之后，CRG Motion #34（按该文稿采纳 R1-8、R1-269 的决议并写进草案）在 10-13 的电话会上 **Y/N/A 6/5/3，动议不通过**（15-26/0431r4 第 56 页）。同一对意见另有一份相反的处置：15-26/0408r1 提议 **Rejected**，理由是 D05 在 TPC 上没有文字改动、D04 阶段唯一一条 TPC 意见只要求加资料性文字，因此这一轮复审里新建一套 TPC 机理属于范围之外——它排在 CRG Motion #32，10-14 时仍未表决。**2026-11-02 刷新：上一句错了。** 10-20 通过的 #32 清单里没有 R1-8 与 R1-269（15-26/0431r7 第 56 页逐条列出），意见汇总表 r12 里这两条的处置栏仍然空着，「建议文稿」一栏写着「0408r2 或 0281r12」二选一。所以 TPC 这一轮仍然悬着：提案四次被否，反方的 Rejected 也没表决。 |
| 窄带在 UNII-3/UNII-5 与 802.11 的共存 | 仍在争论 | 部分建模 | 证据：15-26/0341r0「Multiple no-LBT narrowband 802.15.4ab effect on 802.11」专门研究不做 LBT 的后果；窄带信道接入的成批决议（15-26/0241r2 配 15-26/0298r0 的仿真）2026 年 7 月 **17/22/3（43.5%）被否**，见 15-26/0348r1；并见上面 LBT 那一行。引擎：两种电台同场，共存只经由**一份带内功率**——`engine/spectrum.ts#Spectrum`、`engine/spectrum.ts#bandOverlapMhz`、`uwb/phy.ts#uwbBandOverlapMhz`、`uwb/phy.ts#uwbInBandDbm`、`uwb/nb.ts#nbListOverlapsSixGhz`。每一路发射在自己频带里是一个平铺的矩形（`engine/spectrum.ts#Emission` 只带一对频带边沿），没有频谱模板。**2026-10-15 刷新**：D05 复审里两条想把共存从「可以」抬到「必须」的意见都被判出界——R1-197（按 CCA／LBT 的失败次数或收到的 802.11 信标动态更新 `mmsNbChannelAllowList`）与 R1-196（检测到并发的 802.11 传输时，把「可以排除」改成「必须排除」），两条的理由相同：针对的是 D04 未改动的文字，属于新特性提案（15-26/0408r1，排在 CRG Motion #32，10-14 时未表决；**2026-10-21 刷新**：r2 把理由改写成「针对上一轮投票未改动的文字，因此出界」，意思不变，10-20 时仍未表决）。**2026-11-02 刷新**：R1-196／R1-197 随 #32 于 10-20 无异议通过，出界成立；但同一个问题换了入口回来了——15-26/0458r0 用 32 条意见要求把窄带信道接入改成按占空比触发的强制 CCA（含 §10.44 卸载数据的 R1-39、R1-305、R1-192、R1-22），排在 CRG Motion #38，尚未表决，见上面 LBT 那一行。`@uwb-coexist`、`@uwb-nba-coexist` |
| 基于频谱感知的延后（spectrum sensing based deferral, SSBD）4ab 草案 §10.45 | 已进草案且未见争议 | 部分建模 | 位置：`uwb/phy.ts#ssbdBoundNs`（算出来的延迟上界）、`uwb/phy.ts#nbSlotSlackNs`（一个窄带窗口的余量）、`model/scenario.ts#UwbSsbdSchema`（五个属性与四条拒绝）、`@uwb-ssbd`。证据：15-26/0179r1 的 PICS 插入项 MLF9.45 引 §10.45，状态为可选；规范文字来自 15-22/0486r5 与 15-24/0010r36，评审意见见 15-24/0121r2 的 CID 489/493 与 490/495。**条号属于草案，不属于已发布标准**：`802154-2024` 全文里 `10.45`、`SSBD`、`spectrum sensing` 各 0 次命中，第 10 章止于 §10.37。真正的入口是 §10.39.8.3——CSMA-CA 与 SSBD 二选一，由两端**在每个发送时隙里各自独立**执行，范围见 15-25/0486r1。**本行此前记的那两笔都已更正**：「LBT 一次拒绝之后什么也不发生」是错的（`nbSkipBlock` 让该设备整整一个 200 ms 的块都不出声），而这一刀补的也不是一个缺失的后果，是**把一个按块的后果换成按时隙的那一个**。**没建的那一半**：六个属性里只建了五个（持久化的定义是「本次是不是一次重传」，而本引擎的窄带控制面没有重传，这一位取不到真）；那五个量在标准里是 MAC PIB 条目，在这里是场景配置；FailOnEnd 在标准里是一个 MCPS 确认的状态码，这里只落成一条时间线记录；CCA mode 3a 的载波侦听那一半要一个窄带解调器，没有；而感知读的是中介另一侧（Wi-Fi）的功率，所以躲不开另一台 15.4ab 设备。能量检测门限草案正文没有定义（要求加门限与规定最短感知时长的评审意见在 15-26/0244r1 里拟定为否决，但采纳这些否决处置的动议以 25/14/1 未获通过，见 15-26/0348r1——所以这些意见并没有被否决，只是至今未被采纳），引擎取的 −75 dBm/MHz 是 ETSI EN 303 687 的，而该标准对这一类设备的符合性推定已被欧盟 2025/893 号决定撤销（15-25/0307r1）。 |
| 频域延后（proposed §10.47 Deferral） | 仍在争论 | 未建模 | **范围决定（2026-10-05）。** 本行此前既没写「范围决定」也没写「未偿的债」，而第四列的规矩要求未建模的行必须二选一——这一格是补上的那个判决，不是新证据。 15-26/0365r0 给出 `DeferralActive` 的规范文字（CCA 判忙时在时隙内 200 µs 处改用跳频序列的下一个信道），能力位 11。**它不是 §10.45**，本表此前把它的文字记在了 §10.45 那一行。评审组在 D04 上否决了它所答复的那条意见，理由是频域延后会抬高失步概率。**2026-10-15 的刷新废掉了这一格原来的第二个理由，照实记下。** 原来写的是：「它自己的前提是测距块不超过 100 ms，而本仓库每一个 MMS 场景的缺省块长都是 200 ms。」9 月的电话会纪要（15-26/0377r2）记下了那段问答：有人问时隙内 200 µs 够不够容下时钟不确定度、包检测与换信道，答者说延后是可选的、当前文字把它限在 100 ms 以内的测距块，**更长或可协商的延后时间可以在修订里考虑**。15-26/0365**r1**（10-13）就是那次修订：两个数都变成协商出来的字段——延后时间 150–500 µs 共八档（能力位报最小值，会话配置挑用哪一档），「块长上限」则成了 100／200／300／400 ms 四档的门限字段，**200 ms 现在是其中合法的一档**，于是块长那条理由不成立了。留下来的理由是机理本身：延后要的是同一时隙里改用跳频序列的下一个信道、且不推进这个序列，接收端还要在那个信道上再守一次——**一格两个接收窗口**，而引擎的窄带侧判忙就整块跳过（`uwb/nb.ts#nbLbtRequired`），一个时隙只有一次收。**2026-10-21 刷新：这一格的证据又换了一版，而且性质变了。** 15-26/0365r2（10-20）答复的不再只是三条被否的 D04 意见（I-112、I-142、I-167），还有 D05 复审的 **R1-35**——于是它第一次有了进入这一轮复审的路径：CRG Motion #36（15-26/0431r6 第 58 页，Qualcomm 动议，10-20 时无结果）。文字也改了：延后的信道不再是「跳频序列里的下一条」，而是 `mmsNbChannelAllowList[(当前序号 + 偏移量) mod n]`，偏移量是控制器关联响应里新增的「延后参数」字段（Figure 20x）的 6 位；「不推进跳频序列」那句话随之删掉，因为它根本不碰序列了。能力位 11、150–500 µs 八档、100–400 ms 四档不变。**留下的理由不变**：一格两个接收窗口。而 `@uwb-ssbd` 的课文直到这一次刷新还印着 r0 的「不超过 100 ms」那条前提——10-15 改了这张表、没改那门课——现在课文、`curriculum.ts` 的文稿条目与 `docs/uwb-modellable-backlog.md` 的切片 5b 裁定一起改了，见第十七节第 7 条。**2026-11-02 刷新：被否了。** CRG Motion #36（15-26/0365r2，R1-35 与 R1-311）于 10-27 的电话会上 **Y/N/A 5/4/7，动议不通过**（15-26/0431r7 第 58 页；15-26/0277r8 的计票页把这一栏记在 10-27）。两条意见在意见汇总表 r12 里仍然空着。这是频域延后第二次在表决里倒下（第一次是 D04 的 I-112／I-142／I-167，7 月 17/22/3）。裁定不变；`@uwb-ssbd` 的 `sources`、`curriculum.ts` 的文稿条目与 backlog 切片 5b 里「动议尚未表决」那句这次一起改了。 |

## 十三、P802.15.4ab 草案：感知

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| UWB 感知 §10.40 总体（感知阶段、测量报告阶段） | 已进草案且未见争议 | 部分建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.40 引 §10.40；感知意见的成批决议 15-26/0242r0 在 2026 年 5 月中间会议**无异议通过**（15-26/0265r0 第 17 页）。**一条注意**：D05 复审又对感知报告阶段的措辞提了意见（15-26/0420r0，Group K），而 9 月中间会议只表决了 Motion #26 与 #27（均被否）。**2026-10-15 刷新：这件事定了。** CRG Motion #29 在 9-29 的电话会上无异议通过（15-26/0431r4 第 51 页），把 15-26/0420r0 的处置连同文字改动一并采纳；其中 R1-306（要求把 §10.40.4.5.1 报告阶段那两行改回 D04 的措辞）判 **Rejected**，理由是这处改动的来源是 D04 的意见 I-238、决议在 15-26/0242r0 里，原来的理由仍然成立。也就是说 **D05 的措辞不动**。引擎建的只有几何：一个接收机被递来第二个到达时，把它蕴含的东西记下来（`uwb/sensing.ts#UwbSensor`、`engine/scatter.ts#echoExcessM`、`engine/scatter.ts#isResolvable`、`engine/scatter.ts#echoLossDb`）。草案 §10.40 的任何 MAC 结构——感知阶段、报告阶段、会话——一样也没有。`@uwb-sensing`、`@uwb-sensing-resolution` |
| Application Control IE §10.40.6.1、CIR Report IE §10.40.6.2、SBP Request/Response/Termination IE §10.40.6.3–.5、Processed Target Feature Report IE §10.40.6.6 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MIEMIE4.60–4.66 逐个给出条号；CIR IE 的意见决议 15-26/0224r0 在 2026 年 5 月**无异议通过**（15-26/0265r0 第 13 页）。**范围决定**：引擎的回波是一条时间线记录（`uwb/records.ts#UwbRecord` 的 `UWB_ECHO`），不是一个空口上的报告；没有 CIR，也没有信道冲激响应这个量。**2026-11-02 刷新**：15-26/0457r0（Calterah，10-27，候补议程、尚未宣讲）的 R1-295 要把 Processed Target Feature Report IE 的方位角与仰角定成 16 位二补码、单位 2π/(2¹⁶−1) 弧度——描述写的是 7 位，图却画了两个八位组。这是感知报告里目标的到达角，不是测距那一侧的 AoA（第十六节第 9 条不受影响）。 |
| 静止散射体的双站回波 | 已进草案且未见争议 | 部分建模 | 证据：感知本身在草案里——15-26/0179r1 的 PICS 插入项 MLF9.40 引 §10.40，感知意见决议 15-26/0242r0 于 2026 年 5 月无异议通过。引擎：**只有双站**——介质跳过 `rxId === from`，所以没有单站雷达；散射体是静止的点目标（`engine/scatter.ts#ScattererCfg`、`engine/scatter.ts#apertureCorrectionDb`）。**范围决定**（`docs/superpowers/specs/2026-09-29-sensing-design.md` §9）：墙不作为散射体、不建多普勒与运动、不改 4z/4ab 的测距行为、Wi-Fi 侧不加散射体。另有一处引擎记不下来的事：**回波太弱这件事**——介质按直射路径自己的灵敏度门控回波，没有独立的感知底噪。`@uwb-sensing` |

## 十四、P802.15.4ab 草案：其余的整块特性

这一节的每一行都是**范围决定**：本仓库的 4ab 那一半从一开始就只挑了测距那一条线（MMS 与它的控制面）。
列出来，是为了让读者知道自己在 mentor 上会看到多少与本课程无关的流量。这是一节的标题，不是一个特性——
`src/course/featureGraph.ts` 把它拆成八组（复合帧、超块、发现与协商、唤醒无线电、卸载、RSS、
LE UWB、流式传输），因为它们各有各的历史：流式传输这一行引的是 2021 年的 PAR，而复合帧安全
是 2026 年才表决通过的。

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 复合帧（compact frame）§10.38 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 FD9「Compact Frame Support」与 MLF9.38 均引 §10.38；复合帧的具体帧型被 2026 年文稿逐个引用（如 §10.39.11.3.20 的 One-to-one Final Compact，Compact Frame ID 18）。**范围决定**：引擎的帧是 802.15.4 的 MHR + IE + FCS 那一套（`uwb/phy.ts#UWB_MHR_BYTES`、`uwb/phy.ts#UWB_IE_HDR_BYTES`、`uwb/phy.ts#UWB_FCS_BYTES`），复合帧的压缩布局一处也没有。**2026-10-21 刷新**：15-26/0408r2 新增 Rogue-26（Kivinen）：§10.39.11.1.2.1 复合帧的「私有地址」挡不住跟踪——重放一帧 Advertising Poll 或 One-to-one Poll，谁回应了就知道被跟踪的设备在射程内，而 RPA 的随机部分太短、被动记录够了也能认出来；要求改名「不那么私有的地址」并写明只为向后兼容而保留。处置草稿 **Rejected**：所述攻击要一张大规模的轮询监视网，而提议的一次性密码本机制要两端常年保持在射程内续表，对复合帧面向的用例不可用。本引擎无地址私有化，范围决定不变。 |
| 复合帧优化 | 仍在争论 | 未建模 | 证据：**15-26/0391r4 第 36 页三个未决技术议题的第一个**（"Compact frame optimizations"）；第 63 页另有一次关于「为自适应发射功率控制增加复合帧」的草案投票。**范围决定**，同上一行。 |
| 复合帧安全 §9.2.12、§9.2.13 | 已进草案且未见争议 | 未建模 | 证据：15-26/0220r0（security part 1）与 15-26/0257r0（part 2）在 2026 年 5 月中间会议**均无异议通过**（15-26/0265r0 第 13、25 页）；15-26/0289r0 的替代决议（I-198、I-195）在 7 月前电话会**以全体同意通过**（15-26/0270r1）。引文可见 `secCompactFrameKeyDescriptor`、由测距时隙/轮/块导出的帧计数器。**范围决定**：引擎没有任何密码学，见 §10.31 那一行。**2026-11-02 刷新：D05 复审又对它提了一批「rogue」安全意见。** 15-26/0447r1（Huawei，10-22／11-02）处置 Kivinen 的 Rogue-04、-11、-12、-15、-16、-17、-19、-20、-21、-30、-31、-32：复合帧的帧计数器（块／轮／时隙序号拼成）要在 MAC 里核「不倒退」——新增 `secRangingCompactFrameCounter`，小于等于它就报 COUNTER_ERROR；Figure 2 的字段顺序改成块序号在前；带块／轮序号的 Poll 复合帧建议用只认证不加密的安全级别。15-26/0448r0（同作者，10-22）再为块结构之外的复合帧（Advertising／SOR／Acquisition 等九种）另造一套 nonce：块序号固定 0xffff，加 3 个八位组的 Lower Frame Counter（R1-282，CRG Motion #42 已排、无结果）。10-27 宣讲了 0447、11-03 排了 0448，都没表决。本行的「未见争议」指的是进草案这件事；这一批改的是怎么核计数器，不是要不要有它。 |
| 超块模式（hyper block mode）§10.32.3.5，及 Scheduling IE §10.32.9.10、Enhanced Ranging Round IE §10.32.9.11、Hyper Block Structure IE §10.32.9.12 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.32.1 与 MIEMIE4.57–4.59 逐个给出条号；15-26/0220r0 直接修改 §10.32.3.5 的段落，15-26/0289r0 引「In hyper block mode, the ranging block index shall be calculated as specified in 10.32.3.5」并已通过。**范围决定**：引擎的块序号是一个单调计数（`uwb/session.ts#slotStartNs`），没有超块这一层。**2026-11-02 刷新**：15-26/0460r0（Samsung，11-02，排在 11-03 的电话会）为超块里的 NBA MMS 测距补 Start of Ranging 复合帧的 Message Control 2 格式——加「分配的相对块序号／轮序号／时隙序号」三个字段，让应答方知道去哪个时隙收 RCM 来确定超块结构（R1-317，尚未表决）。 |
| 设备发现与关联（block-based mode）§10.41，及 Controller Association Request/Response 命令 §10.41.4.1/.2 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.41、MF4.34、MF4.35；15-26/0175r4 处置 I-38 时逐字改写 §10.41.4.1 页 198 行 20。**范围决定**：同 §10.29.2 那一行——本仿真器的会话从不需要被建立起来。 |
| HRP UWB PHY 的参数协商 §10.42，及 Dynamic Data Mode Negotiation IE §10.42.3.1 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.42、MIEMIE4.67；15-26/0172r0 引草案页 201「An HRP-EMDEV may optionally support the mechanism defined in 10.42 for negotiating dynamic data mode parameters」。**范围决定**：引擎里没有协商。 |
| 唤醒无线电 §10.43 与它的物理层 §16.9 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.43；15-26/0167r0 处置 I-377 与 I-32 时引 §16.9.1 的唤醒符号时长 1.025 ms 与 PIB 属性 `phyUwbWuPeriod`。**范围决定**：引擎不建功耗，也没有第二个接收机。 |
| UWB 数据卸载到窄带 §10.44，及 Narrowband Allocation IE §10.44.3.1 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.44、MIEMIE4.68。**范围决定**：引擎的窄带只跑控制消息，不跑数据。**2026-10-21 刷新**：R1-11（15-26/0440r2）把 §10.44 Narrowband Allocation IE 那句里的「ERDEVs」改成「HRP-ARDEVs」，处置 **Accepted**——卸载到窄带只对带窄带电台的设备有意义。**2026-11-02 刷新**：随 CRG Motion #37 于 10-27 无异议通过。另一头，15-26/0458r0 要给卸载数据也套上按占空比触发的 CCA（R1-39、R1-305、R1-192、R1-22），排在 Motion #38，尚未表决。 |
| 测距支持服务（Ranging Support Service, RSS）§10.46 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.46。**范围决定。** **2026-11-02 刷新**：15-26/0455r1（Zigpos，10-27，CRG Motion #40 无异议通过）——R1-52 把 §10.46.1 里的「minimizing」改成「reducing」，R1-43 把 §10.39.3.3 里的「minimize」改成「reduce」，都是为了不像一句保证；这是本表第一次有 §10.46 的意见决议记录。 |
| 低能量 UWB 物理层（LE UWB PHY） | 已进草案且未见争议 | 未建模 | 证据：15-26/0156r2 直接引 **D04 的 Figure 236「Packet Structure of the LE UWB PHY」**，并给出 `phyLeUwbOokSymbolRate`、Table 12-14 与 Clause 33.2.2 的改法——SYNC/SFD/PHY Config 恒为 OOK 且不编码。**范围决定**：本仿真器的 UWB 侧只有 HRP 的 BPRF 参数集 3。 |
| 扩展信道频段 §16.4.1.2（HRP 与 LE UWB 两侧） | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 新插 E.7.4.4 的 ECH1「Extended channel bands」引 §16.4.1.2，并新开一小节 E.7.4.5a 给 LE UWB 的 LECH1。**范围决定**：引擎只有信道 5 与 9。 |
| 高速率流式传输（PAR 目标：≥ 50 Mb/s）与低时延流式传输 | 无法判定 | 未建模 | **查了什么：** 这两条写在 PAR 的范围里，2021 年的 TGD（15-21/0297r1 第 7 页的目标清单）也列着；但它们在语料库里只以**范围陈述**的形式出现（15-25/0032r3、15-25/0103r0 等反复照抄 PAR 那段话）。15-26/0179r1 的 PICS 插入项里**没有任何一项对应流式传输**，D04/D05 的意见与决议里也找不到一个流式传输的条号。所以草案里究竟有没有一套流式传输机制，语料库定不了。**范围决定**：本仿真器的 UWB 侧不传数据。 |

---

## 十五、本仿真器有、标准里对不上号的几行

这一节存在的理由和上面各节一样：说出来比挑一个好听的说法好。

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| DL-TDoA（下行到达时间差） | 无法判定 | 已建模 | **查了什么：** 802.15.4-2024 的目录里没有一条以 TDoA 为题的条款（`.superpowers/sdd/uwb-clause-list.txt` 里 §10.32.3「Ranging modes」是唯一可能的归属），4ab 语料库里也查不到一份把 DL-TDoA 写成草案条文的文稿。引擎里它是**照 FiRa 的形状建的模型**：Poll/Response/Final 携带各自的发射与接收时刻（`uwb/frames.ts#UwbDlTimes`，按 §10.29.8.4 RMI 的形状放），tag 只听不发。`uwb/device.tdoa.ts#onDlSlot`、`uwb/device.tdoa.ts#transmitDl`、`uwb/device.tdoa.ts#solveTdoaFix`、`uwb/position.ts#solveTdoa`。`@uwb-dl-tdoa` |
| UL-TDoA（上行到达时间差）与 blink | 无法判定 | 部分建模 | **查了什么：** 同上。引擎：tag 在自己的时隙里发一条 14 字节的 blink，什么时间也不带（`uwb/frames.ts#makeBlink`、`uwb/phy.ts#BLINK_IE_BYTES`），锚点在到达时各自盖章。**四个到达时刻怎么汇到参考锚点手里，本模型一个字也没说**——`uwb/network.ts#UwbNetwork` 在时隙结束时直接调用每台锚点的 `uwb/device.tdoa.ts#ulArrivalNs`，那条汇聚不在空中。`uwb/device.tdoa.ts#solveUlFix`。`@uwb-ul-tdoa` |
| 到达角（angle of arrival, AoA）与相位差（phase difference of arrival, PDoA） | 无法判定 | 部分建模 | **查了什么：** 2024 版目录里没有 AoA/PDoA 条款。引擎：纯几何，`uwb/aoa.ts#pdoaRad`、`uwb/aoa.ts#azimuthFromPdoaDeg`、`uwb/aoa.ts#aoaSigmaDeg`、`uwb/aoa.ts#antennaSpacingM`、`uwb/device.report.ts#measureAoa`。**锚点并没有两路接收**：`measureAoa` 由真实方位角算出一对半波长天线会看到的相位再加一次噪声；多径对方位角毫无影响。`@uwb-aoa` |
| 由多个距离解位置（等权高斯—牛顿） | 无法判定 | 部分建模 | **查了什么：** 定位解算不是 802.15.4 的内容——标准给测量，不给解算。引擎：`uwb/position.ts#solvePosition`、`uwb/position.ts#rangeSigmaM`、`uwb/position.ts#Ellipse`。**解算器对每条测量一视同仁，而且从不回头**：不按品质因数、不按到达电平加权，没有加权最小二乘。`@uwb-position`、`@uwb-geometry`、`@uwb-capstone` |
| UWB 侧的衰落 | 无法判定 | 未建模 | **查了什么：** 2024 版目录里没有一条信道模型条款——UWB 的信道模型出自 IEEE 802.15.4a 的信道模型报告，不是标准正文，所以「标准怎么规定衰落」这一问在这张表里无处可对。**范围决定**，见 `docs/superpowers/specs/2026-09-27-fading-design.md` §8：那一刀只动 Wi-Fi 侧，「UWB 有自己的信道模型与自己的课程，混在一起会让两边都难验」。后果已写进 `@uwb-mms` 的 `limits`：UWB 链路的电平由几何与墙一次算定（`uwb/channel.ts#UwbChannel`），相干时间这条代价引擎看不见。 |

---

## 十六、无法判定的那些格子：一份清单

十个格子写了「无法判定」（固定回复时间那一格 2026-11-10 改判为「仅为提案，未进草案」，见它自己的单元格）。它们不是懒，是语料库到此为止。逐条说明查了什么已在各自的单元格里，
这里只列出来，方便下一次刷新语料库时重跑：

1. **反序 MMS** — 出自与固定回复时间同一组提案（15-25/0224r2 CID 170、15-25/0556r2），而那组意见最终采用的决议 15-25/0681r1 里没有它；2026 年的 `Reversed` 两处命中都是另一件事。
2. **RSF 带 SFD `phyUwbMmsRsfSfd`** — 2025 年有字段与 PIB 定义，2026 年零命中。
3. **零长控制阶段** — 只有 15-25/0194r0。
4. **SP0 控制面的内容布局** — 语料库没有给过 SP0 内容的格式。
5. **高速率（≥ 50 Mb/s）与低时延流式传输** — PAR 目标反复被照抄，PICS 与意见里找不到条号。
6. **DL-TDoA** — 2024 版目录里无对应条款，4ab 语料库里无草案条文。
7. **UL-TDoA 与 blink** — 同上。
8. **AoA / PDoA** — 同上。
9. **由距离解位置** — 标准给测量不给解算，无条款可对。
10. **UWB 侧的衰落** — UWB 信道模型出自 802.15.4a 的信道模型报告，不在标准正文里。

**2026-10-15 的刷新重跑了这十一条的检索，一条也没动。** 新到的十二份文稿里，`FixedReplyTime`、
`Reversed`、`RsfSfd`、零长控制阶段、SP0 内容布局、TDoA、AoA／PDoA 的命中数都是 **0**；第 6 条
（≥ 50 Mb/s 的流式传输）唯一的两处命中是会议幻灯片里照抄的 PAR 范围段落，而这正是那一条当初判
「无法判定」的理由。所以这十一个格子不是旧了，是**真的没有新证据**。

**2026-10-21 的刷新又重跑了一遍，仍然一条没动。** 这次落盘的五份都是旧编号的新版（15-26/0365r2、0408r2、0431r6、0440r2、0281r12），上面那些词在五份里的命中数全是 **0**；唯一的例外还是会议幻灯片里那段照抄的 PAR 范围（15-26/0431r6 里「50 Mb」1 次、「streaming」2 次），与上一次一样。

**2026-11-02 的刷新第三次重跑，仍然一条没动。** 这次读的 16 份（9 个新编号加 15-26/0417r1、15-26/0427r11、15-26/0431r7、15-26/0277r8、15-26/0437r0、Group I 的 rogue 决议、意见汇总表 r12）里，`FixedReplyTime`、`RsfSfd`、零长控制阶段、SP0、TDoA、AoA／PDoA 全是 **0**；`Reversed` 在 15-26/0457r0 里命中 2 次，说的是 O-QPSK 偶数符号的码片序列倒序（§13.2.5），与反序 MMS 无关；「50 Mb」与「streaming」还是 15-26/0431r7 里照抄的 PAR 范围那一段。第 9 条另有一处要说明：15-26/0457r0 的 R1-295 谈的是感知报告里目标的方位角／仰角编码（§10.40.6.6），不是测距对端的到达角——格子不动。

**而另外两处开着的问题——它们的裁定不是「无法判定」，所以此前列在这里提醒读者——这一次都关掉了：**

- **窄带跳频序列怎么生成。**（已关闭，2026-10-15）生成式在 D05 §10.39.8.4.3 里，R1-279
  （15-26/0408r1）把它整段算了一遍：`NbaPrng(种子, 计数器)` 出 128 位，取 32 位，再映到信道号；种子
  一个八位组、计数器是块序号。15-22/0381r5 §1.5.3 那个「拿会话种子当密钥跑分组密码」的形状是对的。
  引擎的字符串散列从此是一处**已知的背离**，写进了那一行。
- **感知报告阶段的措辞。**（已关闭，2026-10-15）CRG Motion #29 于 9-29 无异议通过了 Group K 的处置
  （15-26/0420r0），其中 R1-306 判 Rejected——D05 的措辞不动。

---

## 十七、与仓库现有说法的冲突

写这张表时查出三处，都与「某个数有多硬」有关，因此都值得单独记下。

**1. 「D5.0 这个版本号并未被语料库证实」——这条说法本身不成立。**
`docs/superpowers/specs/2026-09-26-uwb-standard-basis.md` §2 末尾如此断定，§4 据此把仓库里全部 11 处
「D5.0」删掉（4 课 + 学习指南 + 编辑器说明 + 词汇表 + i18n + README ×2）。但语料库里 D05 的证据是充分的：
15-26/0414r0 的**标题**就是「resolution of sa ballot **d05** comment r1-297」，15-26/0194r3 的摘要写
「the SA ballot of P802.15.4ab **D05**」，15-26/0281r11 写「P802.15.4ab/**D05** Draft Standard」，
15-26/0420r0 逐条对比「line 19-20 in **D05**」与「the original sentence in **D04**」，
另有 2026 年 1、3、5 月的多份闭幕报告把「Approve recirculation of **D05**」列为当周目标。
**现行草案是 D05，复审的是 D05 的意见（编号 R1-*）。** 删除是过度纠正：把 11 处版本号换成「草案」确实
更耐旧，但仓库现在不再说得出「哪一版」，而读者在 mentor 上看到的每一条意见编号都带着 D05 的印记。

**2. 非交织的「已知不完整」比记录里写的还大一号。**
同一份规格 §5.2 记下草案还有一个**三子轮**的双边双向形态（§10.39.7.2.3）未建。语料库里还有一个：
15-26/0184r1 的意见直接谈 **§10.39.7.2.4「DS-TWR with 4 non-interleaved sub-rounds」**，并提议把它连同全部
引用一起删掉。也就是说「非交织」这个名字底下至少有三种形态（两子轮 SS-TWR、三子轮 DS-TWR、四子轮
DS-TWR），引擎建的是第一种，而 `@uwb-subrounds` 的 `limits` 目前只说了第二种。

**3.（已解决，2026-09-30）「草案允许把回复时延定成一个两端事先约定的常量」——固定回复时间不是草案的新发明。**
原本的问题是：`@uwb-subrounds` 的课文与 `src/ui/glossary.ts` 都把固定回复时间讲成 4ab 草案带来的
选项，而 IEEE Std 802.15.4-2024 早已有 **§10.29.6.5「Ranging procedure for SS-TWR with fixed reply
time」**。代价是双重的——课文把一件**已发布**的事说成草案，同时把一件**没证据进草案**的事
（那两个 PIB 属性，本表判为无法判定）说成草案。

**现在两者在仓库里是分开的两样东西**，所以这处措辞不再有歧义可言：已发布那一条是
`UwbSessionCfg.replyTime: 'fixed'` 加 `fixedReplyRstu`，走 SP1 帧与槽位化轮次，课程是
`@uwb-reply-time`，术语表里的条目明确写着 SS-TWR；4ab 那一条是 `UwbMmsCfg.fixedReplyRstu`
（`macMmsFixedReplyTime`），走 MMS 包，课程是 `@uwb-subrounds`。两个字段同名、不同层，
各自的注释都指向对方并说明它们是**两种轮形的两个设置**。

**4.（2026-10-01，我自己造成的）「SP3 分组测距举证不足，机理无从建立」——证据一直都在。**

切片 2 的覆盖表两行、以及 `@uwb-m2m` 的一条 `limits`，都写着 SP3 分组测距（§10.32.8）与
SRRR IE（§10.32.9.9）之所以未建，是因为**举证不足**：说本仓库只抽出了已发布标准的目录，
正文一个字也没有，所以机理无从建立。那条 `limits` 还被当成「举证不足」与「范围决定」
这个区别的**教学例子**。

**那是错的。** IEEE Std 802.15.4-2024 的全文在语料库里
（`D:/ai_patent_experiments/.claude/skills/wifi_patent_skill/references/ieee_standards/text/802154-2024.json`，
228 万字符），§10.34「Ranging message non-receipt exchange」、§10.35「Ranging ancillary
information」、§10.36「Ranging: Multiple message receipt confirmation」、§10.32.8
「Ranging procedures with SP3 format packets」与 §10.32.9.9 的 SRRR IE **都在里面**，
而且都不只出现在目录里。

错的是我的推理，不是语料库：我把「**本仓库**里只有目录」当成了「**证据不存在**」。
这两句话差得很远，而且前者本来就是对的——本仓库永远不该收录标准正文。

**已改正**：上面两行与那条 `limits` 都不再声称举证不足；它们现在只说「还没建」。
这两条因此从「查不到」回到了「未偿的债」，排进 `docs/uwb-modellable-backlog.md`。

这是本分支上第九次同一形状的错误：**测量结果反常时，先怀疑量它的那把尺子。**
前八次是搜索式、参数位置、取整的除数、参数形状、写错字段的覆盖、两倍块长的时间窗、
放不下的图注、1σ 当成上限。这一次尺子是「我查了哪里」——而我根本没查那个放着正文的目录。

**5.（2026-10-14 发现）这张表自己过期了 9 天，而过期的那一格是「未建」。**

§10.35 那一行写着「**仍未建**：Request = 1 的排程请求（切片 3d……）」。那句话写在
`5a862b3`（2026-10-05 15:04），而切片 3d 在 `f1d8474`（**同日 15:53**）落地——**49 分钟之后**。
期间这张表一个字没动，`@uwb-ancillary-request`（第 72 课）与 `@uwb-ancillary-loss`（第 75 课，
2026-10-11 从 `@uwb-ancillary` 拆出）两门课在本表里**一次也没出现过**。

**为什么测试挡不住它**，这张表自己的「会怎样撒谎」那一节早就写明了：`uwb-coverage.test.ts` 只钉
住被点名的符号与课号**还存在**，钉不住「未建」这句话**还是真的**。这一次正是那种腐烂，而且方向
是最容易被忽略的那一个——**引擎跑到了它自己的覆盖表前面**。两处都改了（那一行现在写出请求帧、
控制器的裁决、以及「拒绝是静默的」这条本引擎的性质），而值得记下的是发现它的办法：有人问「现在
到底建到哪一步」，于是把全部 34 门 UWB 课挨个在这张表里找了一遍，两门找不到。**一张覆盖表的刷
新动作，应该从「有没有哪门课它没提过」开始，而不是从重读每一行开始。**

**6.（2026-10-15 发现）第二列也会腐烂，而它腐烂得比第三列快——两处只过了 10 天和 16 天。**

这一次刷新语料库（1140 → 1150 篇，12 份新文稿，全是 D05 的意见决议，**一份新特性提案也没有**，
因为这个组正在 SA 投票复审里，提案阶段早结束了），两处第二列的说法当场过期：

- **频域延后那一行的论据，在写下它的时候就已经被工作组自己否掉了。** 那一格 2026-10-05 写着
  「它自己的前提是测距块不超过 100 ms，而本仓库每一个 MMS 场景的缺省块长都是 200 ms」。可
  **9 月的电话会纪要里，作者被问到的正是这个，答的是「更长或可协商的延后时间可以在修订里考虑」**
  （15-26/0377r2）。10-13 的 r1 就是那次修订：块长门限成了 100／200／300／400 ms 四档，200 ms 是
  合法的一档。换句话说，那条论据不是被新证据推翻的，而是我**只读了提案、没读讨论它的那次纪要**。
- **感知那一行的「尚未表决」只对了 12 天。** 9-29 的电话会上 CRG Motion #29 无异议通过了 Group K
  的全部处置（15-26/0431r4 第 51 页）。

两处的形状是同一个：**一个「仍在争论／尚未表决」的判断，是一个带日期的事实，而这张表只在第三列
写了保质期。** 已改：每一处带票数的判断现在都写上它的日期与出处页，而刷新的动作从「把上一次写下
的判断按日期排一遍，最旧的先查」开始——不是从重读每一行开始（这正是第 5 条学到的那条的另一半）。

**一处本来可能相反的发现，值得单独记下：这一次草案错了，引擎对。** R1-280 指出 D05 §10.39.10 把
往返时间与回复时间的减法写反了（照字面算是负数），处置 Accepted。引擎的 `uwb/device.mms.ts` 本来
就是改正后的那个方向，而且那段注释早写明反过来会怎样：`counterDiff` 只会回绕，于是倒着跑的区间
变成将近 2⁴⁰ 的计数，乘上时钟修正之后是几十公里的距离，照样作为一条 `UWB_RANGE` 发出去。
**那段注释是在建模的时候被仿真器自己逼出来的**——写错方向就会看见几十公里，而读草案的人要等到
SA 投票才有人发现。

另有一处不算冲突、只是补充：**9 月中间会议上两个意见决议动议全部被否**（Motion #26 的 12/13/1 与
Motion #27 的 11/13/0），7 月全会与 7–9 月电话会也是大面积被否。仓库现有说法「仍在 SA 投票复审中」
是对的，但读者值得知道复审卡在哪里：**卡在表决上，不是卡在起草上。**

**7.（2026-10-21 发现）表改了，课没改——而第 6 条正是在说那一格。**

10-15 的刷新把频域延后那一格的「不超过 100 ms」前提废掉了（上面第 6 条），可 `@uwb-ssbd` 的
`deeper` 与 `sources`、`curriculum.ts` 里 15-26/0365r0 的那条文稿注记、`docs/uwb-modellable-backlog.md`
的切片 5b 裁定，**四处都还印着 r0 的那句话**，又过了 6 天。课文那一句还被 `uwb-ssbd.test.ts` 钉着——
钉的是「100 小于 200」这条不等式，而它对一个已经作废的前提照样成立。覆盖表的测试钉表，课文的测试钉课，
**两边谁也不钉「这张表与那门课说的是同一件事」**。

这次的补法是机械的，而且写进了第十一节开头那段刷新记录：**刷新触到的每一个文稿编号，在 `src/course`
与 `docs/` 里各 grep 一遍**，命中的每一处要么改、要么写明为什么不改。这一次 grep 到的四处全改了
（课文那句现在印的是 r2 的两张表：150–500 µs 八档、100–400 ms 四档、200 ms 是合法的一档；测试按
「等步长、行数对、最长延后装进一个时隙、本仓库的块长是表里的一行」读它）。上一条（第 6 条）说
第二列腐烂得比第三列快；这一条说**它腐烂的时候，带着引用它的那门课一起**——而那门课在覆盖表之外。

**8.（2026-11-02 发现）刷新流程写死了一台机器；而表说课没写的那条，课早就写了。**

两件事。第一件：第十一节的刷新命令与 `scripts/doc-meta.ts` 里的路径都指向 `D:/ai_patent_experiments/…`，
而这台机器没有 D 盘——语料库镜像既不在 C 盘的那份克隆里，也没推到 GitHub 上，它只存在于另一台机器上。
于是这一次没法照流程跑，改成按同一套抓取规则（curl、浏览器 UA、严格串行、每份隔 3–5 s）直接从 mentor 抓了
10-20 之后的 22 份修订，在临时目录里抽文本，`docMeta.json` 新引的 11 个编号用 `doc-meta.ts` 的同一套取词规则
在这边算出来。代价写明：镜像仍停在 10-21 的 1150 篇，`doc-meta.ts --check` 在这台机器上本来就跑不了；下一次在有
镜像的那台机器上 `fetch_mentor.py --index --download` 再 `doc-meta.ts`，会把这 11 条重算一遍——应当相等，不等以镜像为准。
教训是：**一份只在一台机器上的镜像，它的刷新流程就只在那台机器上成立**——路径该可配置的早就可配置了
（`$UWB_TG4AB_CATALOG`），缺的是镜像本身没有第二份。

第二件：一对多非交织 DS-TWR 那一行此前写着「该课 `limits` 已写明三子轮形态未建，但四子轮那一种尚未写进去」，
而 `@uwb-subrounds` 的 `limits` 第一条写的正是四子轮（§10.39.7.2.4，引 15-26/0184r1）。第 5 条说
引擎跑到了表前面，这一条是**课跑到了表前面**——表在替课记一笔它早已还清的债，而「未偿的债」这几个字
没有任何测试钉着。同一行还查出括号里的条号是 D04 的（0454r1 把 §10.39.7.2.4 叫作混合形态），两处一起改了。
