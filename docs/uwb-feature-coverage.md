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
截至 2026 年 9 月下旬 1138 份抽出的文稿）里有的是：投稿、逐条引用草案页/行/条号的意见决议、以及会议纪要。
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
| 仅为提案，未进草案 | 0 |
| 无法判定 | 11 |

| 本仿真器 | 行数 |
| --- | --- |
| 已建模 | 29 |
| 部分建模 | 38 |
| 未建模 | 42 |

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

所以这张表的保质期是：**语料库的截止日（2026 年 9 月下旬）加上引擎的下一次改动。**
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
| SS-TWR，回复时间延后上报 §10.29.6.3 | 已发布 | 已建模 | Response 不带 RRTI（14 字节，而嵌入式 20 字节），回复时间在**自己的时隙里、自己的一条报文里**跟上：`uwb/frames.ts#makeSsDefer`（17 字节，`ies` 恰为 `['RRTI']`）、独立的 `'uwbSsDefer'` 帧类型、`uwb/session.ts#slotAction` 给它时隙 A+1…2A，所以一轮是 2A+1 个时隙而不是 A+1。标签在延后报文落地时才算出距离。`@uwb-reply-time` |
| SS-TWR，回复时间嵌入 §10.29.6.4 | 已发布 | 已建模 | 这是引擎 SS-TWR 的那一种：Response 携带 `['RRMC', 'RRTI']`，回复时间在 `replyRctu` 里。`uwb/frames.ts#makeResp`、`uwb/phy.ts#RRTI_IE_BYTES`。`@uwb-sstwr` |
| SS-TWR，固定回复时间 §10.29.6.5 | 已发布 | 已建模 | 已发布标准这一条现在长在**它自己的路径上**（SP1 帧、槽位化轮次、不走 MMS）：`scenario.ts` 的 `replyTime: 'fixed'` 加 `fixedReplyRstu`，`uwb/session.ts#RoundPlan` 的 `fixedReplyNs`。回复时间一个字节都不上空口（Response 14 字节），而这是**整个 UWB 侧唯一一处不对齐时隙的发送**：应答方在 `收到 Poll 的时刻 + fixedReplyNs + k × 时隙` 发，否则 `Treply` 就会随距离变化、标签不被告知就算不出来。时隙预算因此两边都有界（`scenario.ts` 的两条拒绝规则）。4ab 的 MMS 固定回复时间是**另一个设置、另一种轮形**：`uwb/mms.ts#MMS_FIXED_REPLY_RSTU_DEFAULT`、`@uwb-subrounds`。`@uwb-reply-time` |
| DS-TWR，测距时间信息延后 §10.29.6.6 | 已发布 | 已建模 | Final **不带时间，但带响应方名单**——名单是它在这个形态里仍然存在的全部理由：锚点得知道标签究竟有没有收到它的 Response（`uwb/device.ts` 的 `finalListedMe`），那决定它该不该在报告相位里开口。于是 `uwb/phy.ts#uwbFinalBytes` 在延后下是 `14 + 2A` 而嵌入下是 `14 + 12A`（九个锚点：32 对 122 字节）。代价写在 §10.29.6.7 那一行的对面：**锚点从此算不出距离**，只有标签算得出。收益是被算出来的锚点上限从 9 移到 33（`uwb/phy.ts#uwbMaxAnchors`）。`@uwb-deferred-ds` |
| DS-TWR，测距时间信息嵌入 §10.29.6.7 | 已发布 | 已建模 | Final 携带 `['RMI', 'RRTI']`，每个锚点一组 `{tround1, treply2}`：`uwb/frames.ts#makeFinal`、`uwb/phy.ts#rmiFinalIeBytes`。锚点凑上自己的 `treply1`/`tround2` 当场解出距离——**五种形态里唯一两端都拿到距离的那一种**。代价是这条 Final 每多一个锚点长 12 字节，于是它是把一轮卡在 9 个锚点的那个东西（`uwb/phy.ts#uwbMaxAnchors`：这一种 9，其余四种 33）。`@uwb-dstwr`、`@uwb-deferred-ds` |

## 三、已发布标准：测距 IE（§10.29.7、§10.29.8）

引擎的 IE 不是比特级的：`uwb/phy.ts` 只给每个 IE 一个字节数，`uwb/frameFields.ts#uwbFrameFields` 按名字把它
们列进解码视图。所以「已建模」在这一节里一律意味着**帧长与字段清单**，不意味着比特布局。

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| RSSD IE（Ranging STS Seed and Data IE）§10.29.7.1、§10.29.8.2 | 已发布 | 未建模 | **范围决定。** 引擎不持有密钥、不生成 STS 序列，也就没有种子要传（见 §16.2.9 那几行）。 |
| RRTI IE（Ranging Reply Time Instantaneous IE）§10.29.8.1 | 已发布 | 部分建模 | 出现在 SS 的 Response 与 DS 的 Final 上，长度 `uwb/phy.ts#RRTI_IE_BYTES`（头 + 4 字节一个回复时间，一个 IE 装一个）。字段内部布局未建。`@uwb-frame` |
| RRMC IE（Ranging Request Measurement and Control IE）§10.29.8.3 | 已发布 | 部分建模 | 每条 Poll / Response / Final 都挂它，长度 `uwb/phy.ts#RRMC_IE_BYTES`（头 + 一个控制八位组）。控制位本身不解析：这一轮要向应答方索取什么，引擎从 `uwb/session.ts#RoundPlan` 读，不从这个 IE 读。 |
| RMI IE（Ranging Measurement Information IE）§10.29.8.4 | 已发布 | 部分建模 | 两种形状都有：Final 里按应答方数计长（`uwb/phy.ts#rmiFinalIeBytes`），Report 里定长（`uwb/phy.ts#RMI_REPORT_IE_BYTES`）。DL-TDoA 的时间也是照这个 IE 的形状放的（`uwb/frames.ts#UwbDlTimes`，模型取值）。`@uwb-dl-tdoa` |
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
| 测距块、轮与时隙结构 §10.32.2 | 已发布 | 已建模 | `uwb/session.ts#roundPlan`、`uwb/session.ts#slotStartNs`、`uwb/session.ts#slotAction`；块与时隙都按 3 RSTU 的整数倍计（`model/scenario.ts#UwbSessionCfg`）。`@uwb-blocks`、`@uwb-slot-budget` |
| 测距模式：时间调度与竞争 §10.32.3 | 已发布 | 已建模 | 两种都有。时间调度里每个时隙的主人事先定好；竞争轮（schedule mode 0）改为开一个共享响应窗，每个锚点从自己的随机流里抽一个时隙，两个锚点可以撞在一起。`uwb/session.ts#SlotAction`、`uwb/phy.ts#RCPS_IE_BYTES`、`uwb/phy.ts#RCMA_IE_BYTES`。`@uwb-contention` |
| 时隙化方案里的接收使能 §10.32.3.4 | 已发布 | 已建模 | 设备只在自己那个时隙开接收机，其余时间 `idle`——这正是 UWB 测距便宜的原因。`uwb/device.ts#UwbDevice`（`listenFor` / `uwbWait` 状态）。`@uwb-blocks` |
| 一对多 SS-TWR §10.32.4 | 已发布 | 已建模 | 一条广播 Poll 点名若干锚点（RDM IE），每个锚点在自己的时隙里答：`uwb/frames.ts#makePoll`、`uwb/phy.ts#rdmIeBytes`、`uwb/phy.ts#uwbSlotsPerTag`。`@uwb-sstwr` |
| 一对多 DS-TWR §10.32.5 | 已发布 | 已建模 | 加上广播 Final 与逐锚点的 Report：`uwb/frames.ts#makeFinal`、`uwb/frames.ts#makeReport`。`@uwb-dstwr` |
| 多对多 SS-TWR §10.32.6 | 已发布 | 已建模 | 一轮 N 个时隙，参与者 i 在第 i 个时隙发一次，那一帧对后面的人是问、对前面的人是答：`uwb/session.ts#m2mParticipants`（顺序按 id，model）、`uwb/session.ts#slotAction` 的 `uwbM2m` 分支、`uwb/device.m2m.ts#transmitM2m`、`uwb/device.m2m.ts#onM2mRx`、`uwb/frames.ts#makeM2m`、`uwb/phy.ts#uwbM2mBytes`、`uwb/phy.ts#uwbMaxParticipants`。距离仍由 `uwb/ranging.ts#ssTwrCorrected` 算，而且只有排在前面的那个参与者算得出来（N−1−i 条）。`@uwb-m2m` |
| 多对多 DS-TWR §10.32.7 | 已发布 | 已建模 | 同一套路走两趟，每趟 N 个时隙（2N），第二趟的帧只带第二趟听到的到达时刻，所以帧长上限与 SS 相同：`uwb/session.ts#slotAction` 的 `pass`、`uwb/device.m2m.ts#onM2mRx`、`uwb/ranging.ts#dsTwr`。晶振拉开时比 SS 准约 150 倍（回复间隔是整整几个时隙，SS 要按估出来的时钟偏差折算）。`@uwb-m2m` |
| SP3 分组下的测距 §10.32.8（含 §10.32.8.2、§10.32.8.3） | 已发布 | 部分建模 | **建了的那一半**：SP3 包是 `uwb/phy.ts#uwbSp3Chips` = SHR + STS，没有 PHR 没有载荷，所以 `uwb/phy.ts#uwbSp3Ns` ≈ 141 µs，比最短的 SP1 帧短 40.256 µs；独立的 `uwbSp3` 帧类型与 `uwb/frames.ts#makeSp3`，而它**没有任何能装身份或时间的字段**——身份来自时隙（`uwb/session.ts#slotAction`），这一条由一次变异验收：把发起方的时隙表倒过来，距离会「出现而且是错的」，逐位等于另一台锚点的测量。三个相位齐全（§10.32.8.2）：RCM、SP3 测距、测量报告，而报告相位由 schema 保证而不是靠设备自觉——`sp3` 要求 `replyTime` 恰好是 `deferred`。Figure 10-242 的两帧也建了：发起方自己的标记，以及它在 RRTT 请求时才发的那一帧报告（`uwb/frames.ts#makeSp3InitReport`，`14 + 6A` 字节）。时隙预算 `uwb/phy.ts#uwbSlotsPerTag` 在 `sp3` 下是 `2A+2`，请求了 RRTT 是 `2A+3`，而 `sp3` 配双边双向测距同样合法、同样再多一个（量过：6 个锚点时 77 个时隙对 70 个）。**整轮的账量过**：对 SP1 嵌入式每个 A 都更长且差距变大，对 SP1 延后在 **A = 4** 交叉（请求 RRTT 时 A = 11）。**仍未建**：MLME-STS 原语与 RSSD IE，因此 STS 计数器的推进也没有（本引擎没有一处密码学，`UWB_STS_CHIPS` 建的只是它占多少空口时间）；SP2；以及 §10.32.8.1 说过程可推广到的多发起方多响应方。`@uwb-sp3` |

## 六、已发布标准：多节点测距 IE（§10.32.9）

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| ARC IE（Advanced Ranging Control IE）§10.32.9.1 | 已发布 | 部分建模 | 每条 Poll 都挂它，长度 `uwb/phy.ts#ARC_IE_BYTES`（头 + 控制 2 + 块 2 + 轮 2 + 时隙 2）。块/轮/时隙三个号确实在帧里（`uwb/frames.ts#UwbInfo`）。**控制字（Content Control，bit 0–15）现在建了其中一个字段**：RCM Validity Rounds（bit 9–14，六位）——`scenario.ts` 的 `rcmValidityRounds`、`uwb/session.ts#blockCarriesRcm`，一条控制消息管几个块，其余块只发 14 字节的启动消息。另外两处只是名字对上了号而不是建了：Multi-node Mode 的取值 2 就是 `mode: 'm2m'` 建的那个多对多，Ranging Round Usage 的取值 3 选的是 §10.35。**MMRCR（bit 15）现在也建了**——`scenario.ts` 的 `mmrcr`，一次收妥确认的请求，见 §10.36 那一行；**控制字里其余的位仍未建。** `@uwb-frame`、`@uwb-rcm-validity`、`@uwb-receipt` |
| RIU IE（Ranging Interval Update IE）§10.32.9.2 | 已发布 | 未建模 | **范围决定。** 会话的块长在整场仿真里是常数，没有任何东西能在空口上改它。 |
| RR IE（Ranging Round IE）§10.32.9.3 | 已发布 | 未建模 | **范围决定。** 轮次的归属由 `uwb/session.ts#roundPlan` 一次算定，不在空口上分配。 |
| RBU IE（Ranging Block Update IE）§10.32.9.4 | 已发布 | 未建模 | **范围决定。** 同 RIU。 |
| RCPS IE（Ranging Contention Phase Structure IE）§10.32.9.5 | 已发布 | 部分建模 | 竞争 Poll 携带它，窗口的首尾时隙进了帧：`uwb/phy.ts#RCPS_IE_BYTES`、`uwb/frames.ts#UwbInfo` 的 `contention`。内容的比特布局是模型取值。`@uwb-contention` |
| RCMA IE（Ranging Contention Maximum Attempts IE）§10.32.9.6 | 已发布 | 部分建模 | 同上，重试预算进了帧：`uwb/phy.ts#RCMA_IE_BYTES`。`@uwb-contention` |
| RCR IE（Ranging Change Request IE）§10.32.9.7 | 已发布 | 未建模 | **范围决定。** 引擎里没有任何一方能请求改变一次会话。 |
| RDM IE（Ranging Device Management IE）§10.32.9.8 | 已发布 | 部分建模 | 时间调度 Poll 携带锚点的时隙顺序：`uwb/phy.ts#rdmIeBytes`、`uwb/phy.ts#RDM_ENTRY_BYTES`（每台 3 字节）、`uwb/frames.ts#UwbInfo` 的 `schedule`。加入/退出的管理动作未建。`@uwb-slot-budget` |
| SRRR IE（SP3 Ranging Request Reports IE）§10.32.9.9 | 已发布 | 已建模 | `uwb/phy.ts#SRRR_IE_BYTES` = 头 2 + 控制 1，每个响应方一个，所以 RCM 长 `uwb/phy.ts#srrrIeBytes` = 3A 字节——**请求不是免费的**，与 §10.36 的 MMRCR 恰好相反（那一位在 RCM 本来就带着的控制字里，一个字节都不花）。正文的 RAOA 与 RRTT 两位都建成了`scenario.ts` 的 `srrr`，而且**两位都真的改变空口**：RAOA 关掉时报告帧短 4 个字节，RRTT 置位时发起方多发一帧报告并多占一个时隙。这一条是补过的——最初 RRTT 上了空口而整个报告相位逐字节不变，是一个被允许却可证明无效果的配置；`sp3 + ds + raoa` 当时同样无效果。两位现在在 SS-TWR 之外都被拒绝。`@uwb-sp3` |

## 七、已发布标准：安全（§10.31、§10.33）

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 安全事务测距 §10.31 | 已发布 | 未建模 | **范围决定。** 引擎不持有密钥、不加密、不做比对；`src` 里没有一处密码学。`@uwb-sts` 的 `limits` 已把这条后果写明：一次拒绝之后什么也不发生，会话不重试、不告警、不换密钥。 |
| 认证挑战—应答测距 §10.33（含协调 §10.33.4、ACRRC IE §10.33.6.1、Ranging Verifier / Prover 命令 §10.33.7.1/.2、MCPS-RANGING-VERIFIER/PROVER 原语 §10.33.8） | 已发布 | 未建模 | **范围决定。** 整节缺席：没有 Verifier/Prover 角色、没有挑战、没有那两个命令帧，也没有原语。这是 §10.31 那条范围决定的同一个后果。 |

## 八、已发布标准：消息处理（§10.34–§10.36）

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 测距消息未收到交互 §10.34，及 RMNR IE（Ranging Message Non Receipt IE）§10.34.2.1 | 已发布 | 已建模 | 响应方持有仍然有效的控制消息、却没收到本轮启动消息时，不再在自己的时隙里沉默，而是发一帧 RMNR：`uwb/frames.ts#makeRmnr`（13 字节 = MHR 9 + 一个 2 字节的单元头 + FCS 2，那个信息单元**没有内容字段**）、独立的 `'uwbRmnr'` 帧类型、`uwb/device.ts` 的 `owesRmnr`、`UWB_RMNR` 记录、以及 `view.ts` 里与 `timeouts` 配对的 `rmnr` 计数。发起方由此能把「这个锚点没听到」与「听到了但回答丢了」分开：墙后一个锚点的场景里，七条无从区分的 `UWB_TIMEOUT` 变成四条超时加三条点了名的理由。**它必须和 RCM 有效轮次一起建**，理由见 `@uwb-rcm-validity`：每轮一条控制消息时，丢了那一帧的响应方连自己该在哪个时隙发送都不知道。`@uwb-rcm-validity` |
| 测距辅助信息 §10.35，及 RAICT IE（Ranging Ancillary Information Message Counter and Type IE）§10.35.2.1 | 已发布 | 已建模 | **Request = 0 的那一半整个建了：帧、分段、以及缺帧的发现。** `uwb/phy.ts#raictIeBytes` 是本引擎第一个**长度由存在位决定**的信息单元：内容是控制 1 字节，加上消息编号 0 或 1 字节、Frames Remaining 0 或 1 字节，所以四种组合有三种长度（`uwb/phy.ts#RAICT_IE_MIN_BYTES`、`uwb/phy.ts#uwbAncillaryBytes`、`uwb/frames.ts#makeAncillary`——给了一个存在位却说没留位置的计数就抛，照 `makeMmrcm` 的先例；独立的 `uwbAncillary` 帧类型，以及它在帧检查器、时间线颜色与泳道提示里的那几行）。**分段**：一条消息分装在多帧里，一帧一个时隙，排在测距相位之后（`uwb/phy.ts#uwbAncillarySlots`、`uwb/session.ts#ancillarySlots`、`uwb/session.ts#blockSlots`），Frames Remaining 从 N−1 数到 0，而**每一帧都带着这个数**。**缺帧是被发现的，不是被超时猜出来的**：接收端把这一次读数和上一次相减，缺的那一帧在**下一帧到达的同一纳秒**就被点名，对着这条消息自己的截止时刻早 3.82 ms（量过，见 `tests/uwb/ancillary-round.test.ts` 与 `tests/course/uwb-ancillary.test.ts`：`missing: [2]` 落在该次接收的 `RX_OK` 上，整个过程一条 `UWB_TIMEOUT` 也没有）。边界也量过：丢最后一帧时倒数停住，只剩截止时刻那一条记录；丢第一帧时这个机理**什么也点不出**，因为这个信息单元既不带总帧数也不带帧序数。窗口沿用 RCM 有效期那一个（`uwb/session.ts#blockCarriesAncillary`，这是它的第三处用处），排程式与竞争式两种排法都跑得通且记录不同。另外这一节把**发起方与响应方的意思换了**：发辅助信息的那一端叫发起方，与测距里的角色相反，所以发消息的是在测距里作答的那一端。**仍未建**：Request = 1 的排程请求（切片 3d，理由是一次该做多少不是举证不足——机理已读通，而本引擎的 `RoundPlan` 在 `uwb/network.ts` 的构造函数里一次算定、整个会话共用，要让一个请求改变后续排程就得把轮的排布变成每块重算一次）；消息类型只建成一个常量而不是取值表（`uwb/device.ancillary.ts#ANCILLARY_MESSAGE_KIND`，模型取值）；一轮只有一条消息、发送端恒为第 0 个响应方（`uwb/device.ancillary.ts#ANCILLARY_SENDER_INDEX`，模型取值）；以及「一条消息分几帧」由场景配置给出而不是由上层算出（本引擎一条 MAC 原语都没有）。`@uwb-ancillary` |
| 多消息接收确认 §10.36，及 RMMRC IE（Ranging Multiple Message Receipt Confirmation IE）§10.36.2.1 | 已发布 | 已建模 | 请求是 ARC IE 控制字里的 MMRCR 位（bit 15，`scenario.ts` 的 `mmrcr`），置位前后控制消息逐字节相同——这一位本来就在那两个字节里。回答是一帧 MMRCM：`uwb/frames.ts#makeMmrcm`、独立的 `'uwbMmrcm'` 帧类型、`uwb/phy.ts#uwbMmrcmBytes`（15 + 3N，R ≤ 8 时）与算出来的条目上限 `uwb/phy.ts#uwbMaxMmrcmInitiators`；时隙由 `uwb/phy.ts#uwbMmrcmSlots` 与 `uwb/session.ts#mmrcmResponders` 排在有效期窗口最后一块的轮之后，**每个响应方一个**；位图在 `uwb/device.ts` 的 `noteOpener` 与 `receiptIn` 里按当前有效期窗口的开场消息逐块记下，一个发起方一张，`UWB_MMRCM` 记录落在发起方这一侧。**两个计数不是同一个**：IE 的列表条目每个**发起方**一个（一个响应方可能听到好几个），时隙与帧每个**响应方**一个——「每个发起方一帧」在双向轮里读着对，在多对多里不可能。标准为它画的那张图（Figure 10-272）用的正是**多对多**，所以它接在 `@uwb-m2m` 之后。仍未建的是多播／多节点下发、长地址那一种条目，以及「哪几条消息」的别种取法（位图覆盖的窗口是本仿真器选的）。`@uwb-receipt` |

## 九、已发布标准：HRP UWB 物理层（§16）

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| HRP UWB PPDU 格式 §16.2 | 已发布 | 部分建模 | 每一段在引擎里只是一个码片数，加起来得出空口时间：`uwb/phy.ts#uwbPpduChips`、`uwb/phy.ts#uwbPpduNs`、`uwb/phy.ts#psduSymbols`；分段的画法是 `uwb/frameFields.ts#uwbPpduLayout`。没有调制、没有扩频、没有比特。`@uwb-frame` |
| BPRF 模式下 HRP-ERDEV 的 PHR §16.2.7.2 | 已发布 | 部分建模 | 长度建了：`uwb/phy.ts#PHR_SYMBOLS` = 19、`uwb/phy.ts#PHR_SYMBOL_CHIPS` = 512（850 kb/s 标称）。字段内容未建；PSDU 上限 127 字节这条约束记在 `uwb/phy.ts` 的注释里。 |
| HPRF 模式下的 PHR §16.2.7.3 与 HPRF 调制 §16.3.4 | 已发布 | 未建模 | **范围决定。** 整个 UWB 侧只有 BPRF 参数集 3 一种配置（见 §16.7 那一行），HPRF 在 `src` 里连一个常量都没有。术语表已写明这一点。 |
| 加扰时间戳序列（scrambled timestamp sequence, STS）字段 §16.2.9 | 已发布 | 部分建模 | 建的是**它占多少空口时间**：`uwb/phy.ts#UWB_STS_CHIPS` = 512 + 64×512 + 512 = 33 792 码片（67.692 µs），由 `uwb/phy.ts#STS_GAP_CHIPS` 与 `uwb/phy.ts#STS_ACTIVE_CHIPS` 拼出，插在 PHR 之前。没建的是序列本身。`@uwb-sts` |
| STS 的 DRBG §16.2.9.2、形成 STS §16.2.9.3、生成测试矢量 Annex G / §G.2 / §G.3 | 已发布 | 未建模 | **范围决定。** 引擎不生成伪随机码片、不做 AES-128、也不比对。攻击者伪造不了更早的前沿这件事，在 `@uwb-sts` 里是一条**布尔量**（场景里的一个开关），不是一次密码学判定；该课的 `limits` 已把这条写明。 |
| 附加 STS RMARKER（SRMARKER）§16.2.9.4 | 已发布 | 未建模 | **未偿的债。** 只有一个 RMARKER：`uwb/phy.ts#UWB_RMARKER_CHIPS`（SFD 之后第一个码片）、`uwb/frameFields.ts#UWB_RMARKER_OFFSET_NS`。STS 段内部的附加时标一个也没有。 |
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

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 多毫秒（multi-millisecond, MMS）UWB 操作 §10.39 总体 | 已进草案且未见争议 | 部分建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.39「Multi-millisecond (MMS) UWB operation」直接引 §10.39；2026 年的意见决议成批引用 §10.39.x 的页/行（§10.39.8.3 一项就命中 272 次）。引擎建的是**单边双向加时钟比率修正**那一种：`uwb/mms.ts#mmsLayout`、`uwb/device.mms.ts#onMmsSlot`、`uwb/device.mms.ts#onMmsRx`、`uwb/device.mms.ts#solveMmsFix`；`uwb/session.ts#MmsRoundPlan`。MMS 里的 DS-TWR 未建。`@uwb-mms`、`@uwb-mms-numbers` |
| HRP UWB MMS 包格式 §16.2.11 | 已进草案且未见争议 | 部分建模 | 证据：条号 `16.2.11` 在 2026 年文稿里仍被引用（4 次），四年未变；15-25/0066r1 引「UWB driven MMS packet format configuration」。引擎建的是片段的**长度与位置**：`uwb/mms.ts#rsfNs`、`uwb/mms.ts#rifNs`、`uwb/mms.ts#mmsPacketFragments`、`uwb/mms.ts#rifStartMs`、`uwb/frameFields.ts#mmsPpduLayout`。片段内部的序列未建。`@uwb-mms-numbers` |
| RSF / RIF 片段数与长度（草案现名 RSF Fragment Length / RIF Fragment Length）§10.39.11.1.3.8 | 已进草案且未见争议 | 已建模 | 证据：15-26/0193r0 引「The MMS Number of Fragments field, if present, shall be set as per 10.39.11.1.3.8」；字段改名出自 15-24/0506 与 15-25/0066r1。取值集合：`uwb/mms.ts#N_MSR_SET`、`uwb/mms.ts#STS_LEN_SET`、`uwb/mms.ts#RSF_COUNT_SET`、`uwb/mms.ts#RIF_COUNT_SET`。`@uwb-mms-numbers` |
| MMRS 符号与参数集（Config 表）§16.2.11 | 已进草案且未见争议 | 部分建模 | 证据：15-23/0502r3（拟编 16.2.11.4）；草案的 MMRS 配置集现为 Table 85，至少到 Config #49。引擎的 `uwb/mms.ts#MMS_SETS`、`uwb/mms.ts#mmsSet` 是其中一个**命名子集**，不是整张表。`uwb/mms.ts#MMRS_LEN`、`uwb/mms.ts#MMS_SPREAD`。`@uwb-mms-numbers` |
| 每毫秒能量预算 | 已进草案且未见争议 | 已建模 | 证据：15-22/0205r0。`uwb/mms.ts#UWB_MS_BUDGET_NJ` = 37 nJ、`uwb/mms.ts#mmsFragmentDbm`：片段越短发得越猛。峰值功率那条规矩未建，已写进 `@uwb-mms-numbers` 的 `limits`。 |
| 片段累加与检出（acquisition） | 已进草案且未见争议 | 部分建模 | 证据：15-23/0100r2 §2.3.2。`uwb/mms.ts#combineGainDb`（上限 10·log₁₀16）、`uwb/mms.ts#trainDetected`、`uwb/mms.ts#acquired`、`uwb/mms.ts#ratioSigma`、`uwb/mms.ts#rmarkerFromFragment`。「接收机事先知道这一串的形状」在引擎里是一个布尔量，不是一次相关运算。`@uwb-acquisition` |
| `macMmsRpDuration` 的下界 | 已进草案且未见争议 | 部分建模 | 证据：15-25/0282r1 引述草案——下界由所有 RSF/RIF 片段的实际时长推出。引擎的 `Math.max` 形状对，但垫在下面的 `uwb/mms.ts#MMS_RP_MIN_SLOTS` = 20 是**本仿真器自己的地板**，草案没有这个数。`@uwb-slot-budget` |
| 非交织子轮 §10.39.7 | 仍在争论 | 部分建模 | 证据：I-331 的决议提案（15-26/0296r1，含 §10.39.7.4 的插入句）先后两次被否——2026 年 7 月全会 **19/9/4（67.8%）**、9 月前的电话会 **11/7/1（61.11%）**，见 15-26/0348r1、15-26/0377r2；另有 15-26/0354r0「clarification of one-to-many modes and interleaving modes」仍在澄清这套概念。引擎的非交织是 `subRounds = 1 + responders`（`uwb/mms.ts#mmsLayout`），即**两子轮的单边双向那一种**。`@uwb-subrounds` |
| 一对多非交织 DS-TWR（三子轮 §10.39.7.2.3、四子轮 §10.39.7.2.4） | 仍在争论 | 未建模 | 证据：15-26/0425r0（2026 年 9 月中间会议纪要）记 Motion #26——Group J 的意见决议（15-26/0417r0，R1-50 与 R1-13）**Y/N/A 12/13/1，动议被否**，反对理由是「一对多非交织 DS-TWR 在移动场景下的时长，以及应答方多时的帧长」；另有 15-26/0184r1 的意见直接提议**删掉 §10.39.7.2.4 与全部四子轮 DS-TWR 的引用**。**未偿的债**：`@uwb-subrounds` 算出来的时长只是两子轮那一种的时长，该课 `limits` 已写明三子轮形态未建，但四子轮那一种尚未写进去。 |
| 报告嵌入后续测距交互（可选延后） | 仍在争论 | 未建模 | 证据：Group G 的决议提案三次被否——2026 年 7 月 **21/12/3（63.6%）**（15-26/0194r1）、9 月前电话会 **12/6/1（66.67%）**（15-26/0194r2）、9 月中间会议 Motion #27 **11/13/0**（15-26/0194r3），见 15-26/0348r1、15-26/0377r2、15-26/0425r0。反对理由：把报告塞进下一次交互会拖慢上一次的收尾，而下一次若失败报告就丢了。**未偿的债**（若草案最终采纳）：引擎的报告阶段始终是独立的（`uwb/mms.ts#mmsReportSlots`）。 |
| 固定回复时间 `macMmsFixedReplyTime` | 无法判定 | 已建模 | **查了什么：** 提案正文在语料库里（15-25/0224r2 给出对 §10.39.11.1.3.8 与 §10.39.11.3.7/.8 的逐页修改，15-25/0376r0→r2、15-25/0556r1/r2 是它的后续，15-25/0681r1 把起点从 MmsRangingRxOnTime 改成收完整个 MMS 包之后）。但纪要里这份提案**每次都以「更多线下讨论」收场**（15-25/0428r0 两处、15-25/0514r1、15-25/0676r0），没有一条「无异议通过」或表决记录；而**2026 年的全部文稿——包括 D04/D05 的意见汇总与决议——没有一处出现 `macMmsFixedReplyTime` 或 `Fixed Reply Time` 字样**。所以它究竟进没进 D04/D05，语料库定不了。引擎：`uwb/mms.ts#MMS_FIXED_REPLY_RSTU_DEFAULT`、`uwb/mms.ts#MMS_FIXED_REPLY_RSTU_MIN`、`uwb/mms.ts#MMS_FIXED_REPLY_RSTU_MAX`、`uwb/device.mms.ts#onMmsSlot`。`@uwb-subrounds` |
| 反序 MMS（Reversed MMS Order） | 无法判定 | 已建模 | **查了什么：** 同上一行的那几份文稿（字段布局见 15-25/0224r2 的 Figure 65，bit 6 与 bit 7 同在 MMS Number of Fragments Configuration 那一字节）。2026 年文稿里 `Reversed` 只出现两次，且都在 15-26/0184r1 谈 §10.39.7.2.4「reversed roles」的语境里，与这个**被信令置位的参数**不是一回事。引擎：`uwb/mms.ts#MMS_REVERSED_OFFSET_RSTU` = 600 RSTU、`uwb/mms.ts#MMS_DRAFT_DEFAULTS`。`@uwb-subrounds` |
| RSF 带 SFD（`phyUwbMmsRsfSfd`） | 无法判定 | 部分建模 | **查了什么：** 15-25/0066r1 给出字段位置（Ranging PHY Configuration 的 bit 19）与 PIB 属性定义，15-25/0095r3 有相关意见。2026 年文稿里没有一处提到这个属性或这一位。引擎：开关在（`uwb/mms.ts#MMS_DRAFT_DEFAULTS` 的 `rsfSfd`），但**置 1 之后 RSF 不变长**——`uwb/frames.ts#makeRsf` 的长度恒为 `rsfNs(nMsr, gap)`，SFD 的码片没加进去；草案给的两条置 1 条件里，序列码索引那一条引擎无从校验。该课 `limits` 已写明。`@uwb-uwbd` |
| NBA-MMS（Config 2）与 UWBD-MMS（Config 1）两套配置 | 已进草案且未见争议 | 部分建模 | 证据：15-26/0029r2 逐条引用 §10.39.4.2 的草案文字并直呼「NBA MMS UWB」；15-25/0066r1 引「UWB driven MMS configurations」。引擎：两套配置是会话配置里的一个开关（`model/scenario.ts#UwbMmsCfg`、`uwb/mms.ts#MMS_DRAFT_DEFAULTS` 的 `control`），**不是空口上的一次商定**——管理帧那个 SOR Management PHY Configuration 字段引擎不建。`@uwb-uwbd` |
| 零长控制阶段（Poll/Response 长度为零） | 无法判定 | 已建模 | **查了什么：** 只有 15-25/0194r0（含它第 17 页那张非交织图）说这件事；2026 年的草案引文里找不到对应文字。引擎：`uwb/mms.ts#MMS_DRAFT_DEFAULTS` 的 `uwbdControl`，取 `'none'` 时一轮里除片段之外只剩报告帧。`@uwb-subrounds` |
| SP0（BASIC_PACKET）控制面 | 无法判定 | 部分建模 | **查了什么：** 同上，15-25/0194r0。**草案的消息 ID 属于窄带的压缩 PSDU（15-22/0381r5 Table 1.6.3.1），而 SP0 内容自己的布局语料库里没有**，所以引擎把角色直接当角色携带（`uwb/frames.ts#UwbSp0Msg`），这是模型取值。长度与灵敏度代价建了：`uwb/mms.ts#MMS_SP0_NS`、`uwb/mms.ts#MMS_SP0_PENALTY_DB`、`uwb/mms.ts#MMS_SP0_MBPS`。`@uwb-uwbd` |
| 片段间隔 | 已进草案且未见争议 | 部分建模 | 证据：成对轮次 1 ms 出自 15-23/0100r2；交织模式 500 µs 偏移出自 15-25/0388r1。引擎用的是**第三种**：一对多交织轮里 `(responders + 1) × slot`（`uwb/session.ts#MmsRoundPlan` 的 `fragGapNs`），因为 MMS 时隙必须是 300 RSTU 的整数倍，R > 1 时没有一个合法时隙能让 (R+1) 个凑成一毫秒。交织模式的 500 µs 偏移**未建**。`@uwb-mms-numbers` |

## 十二、P802.15.4ab 草案：窄带辅助与共存

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 窄带辅助 UWB（narrowband-assisted UWB, NBA-UWB）控制面 §10.39.4.2 | 已进草案且未见争议 | 部分建模 | 证据：15-26/0029r2 逐条引用 §10.39.4.2 页 84 的草案文字；15-26/0174r1 把「删掉窄带（Clause 13）」这条意见（I-386）判为 **Rejected**，理由是超出 PAR 范围——也就是说窄带留在草案里这件事本身已有裁定。引擎：那部窄带射频**只有一个物理层，没有任何链路层**——`uwb/nb.ts#nbPpduNs`（2 Mchip/s O-QPSK、250 kb/s）加几个消息大小，帧由 `uwb/frames.ts#makeNbPoll`、`uwb/frames.ts#makeNbResp`、`uwb/frames.ts#makeNbReport`、`uwb/frames.ts#makeNbPollOtm` 造出来。`@uwb-nba` |
| 窄带信道规划（UNII-3 / UNII-5，250 个 2.5 MHz 信道） | 已进草案且未见争议 | 部分建模 | 证据：15-22/0381r5 §1.4.1 给出数量与频段边界；15-26/0029r2 的意见直接谈 UNII-3/UNII-5 下的窄带操作，是草案内容。引擎：`uwb/nb.ts#NB_CHANNELS` = 250、`uwb/nb.ts#NB_CHANNEL_MHZ` = 2.5、`uwb/nb.ts#nbCenterMhz`、`uwb/nb.ts#nbBand`。**中心频率那个公式是照数量与边界反推的**，草案只把编号画成一张图。`@uwb-nba-coexist` |
| 窄带按块跳频 | 已进草案且未见争议 | 部分建模 | 证据：15-26/0365r0 逐句引用草案的规范文字「the next channel in the hopping sequence」——跳频序列在草案里。引擎：`uwb/nb.ts#nbChannelForBlock` 用的是**仿真器自己的字符串散列**，不是 15-22/0381r5 §1.5.3 提的「以会话种子为密钥对块序号做 AES-128-CTR」；而那条推导方式本身 2026 年文稿里查不到，所以序列怎么生成的这一问是开着的。`@uwb-nba-coexist` |
| 窄带先听后说（listen-before-talk, LBT）§10.39.8.3 | 仍在争论 | 部分建模 | 证据：**这是 15-26/0391r4 第 36 页列出的三个未决技术议题之一**（"Various narrow band technical topics"）。表决记录：LBT 意见的成批决议（15-26/0244r1）2026 年 7 月 **25/14/1（64.1%）被否**；CID I-28（CCA 判空后是否「立即发送」，§10.39.8.3）两次被否——**20/15/2（57.1%）** 与 **18/19/0（48.6%）**；把 LBT 从 "may" 改成 "shall" 的那批意见 15-26/0061r0 判为 **Rejected，理由是「Group failed to reach consensus」**。均见 15-26/0348r1。引擎：`uwb/nb.ts#nbLbtRequired`、`uwb/nb.ts#NB_LBT_THRESHOLD_DBM`；**草案要求至少评估 9 µs，这里以一次瞬时功率读数代之**。`@uwb-nba-coexist` |
| 窄带发射功率控制（transmit power control, TPC）与复合帧 | 仍在争论 | 未建模 | 证据：**15-26/0391r4 第 36 页三个未决议题的第二个**（"Support for transmit power control with compact frames"）。CID I-23 的决议提案至少三度被否：15-26/0281r02 在 7 月全会 **13/10/10**、15-26/0285r1 同场 **14/16/2（46.6%）**，见 15-26/0348r1；该文稿本身已改到 r11，另有 15-26/0253r1、15-26/0362r1、15-26/0364r1 三份竞争方案，以及第 63 页与第 71 页两次非正式投票。**范围决定**：引擎里 UWB 与窄带的发射功率都是常数（`uwb/phy.ts#UWB_TX_POWER_DBM`、`uwb/nb.ts#NB_TX_DBM`），没有任何功率自适应。 |
| 窄带在 UNII-3/UNII-5 与 802.11 的共存 | 仍在争论 | 部分建模 | 证据：15-26/0341r0「Multiple no-LBT narrowband 802.15.4ab effect on 802.11」专门研究不做 LBT 的后果；窄带信道接入的成批决议（15-26/0241r2 配 15-26/0298r0 的仿真）2026 年 7 月 **17/22/3（43.5%）被否**，见 15-26/0348r1；并见上面 LBT 那一行。引擎：两种电台同场，共存只经由**一份带内功率**——`engine/spectrum.ts#Spectrum`、`engine/spectrum.ts#bandOverlapMhz`、`uwb/phy.ts#uwbBandOverlapMhz`、`uwb/phy.ts#uwbInBandDbm`、`uwb/nb.ts#nbListOverlapsSixGhz`。每一路发射在自己频带里是一个平铺的矩形（`engine/spectrum.ts#Emission` 只带一对频带边沿），没有频谱模板。`@uwb-coexist`、`@uwb-nba-coexist` |
| 基于频谱感知的延后（spectrum sensing based deferral, SSBD）4ab 草案 §10.45 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.45 引 §10.45；规范文字来自 15-22/0486r5 与 15-24/0010r36，评审意见见 15-24/0121r2 的 CID 489/493 与 490/495。**条号属于草案，不属于已发布标准**：`802154-2024` 全文里 `10.45`、`SSBD`、`spectrum sensing` 各 0 次命中，第 10 章止于 §10.37。真正的入口是 §10.39.8.3——CSMA-CA 与 SSBD 二选一，由两端**在每个发送时隙里各自独立**执行。**未偿的债，但不是本行原先写的那一笔**：本行此前写着「LBT 一次拒绝之后什么也不发生」，那是错的——`uwb/device.ts#UwbDevice` 的 `nbSkipBlock` 被置为当前块（`uwb/device.mms.ts` 里判忙的那条路），那台设备的窄带电台整整一个 200 ms 的块都不出声，而 `@uwb-nba-coexist` 的测试标题就写着这件事。缺的是**按时隙的退避**，不是后果本身。 |
| 频域延后（proposed §10.47 Deferral） | 仍在争论 | 未建模 | 15-26/0365r0 给出 `DeferralActive` 的规范文字（CCA 判忙时在时隙内 200 µs 处改用跳频序列的下一个信道），能力位 11。**它不是 §10.45**，本表此前把它的文字记在了 §10.45 那一行。评审组在 D04 上否决了它所答复的那条意见，理由是频域延后会抬高失步概率。另外它自己的前提是测距块不超过 100 ms，而本仓库每一个 MMS 场景的缺省块长都是 200 ms。 |

## 十三、P802.15.4ab 草案：感知

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| UWB 感知 §10.40 总体（感知阶段、测量报告阶段） | 已进草案且未见争议 | 部分建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.40 引 §10.40；感知意见的成批决议 15-26/0242r0 在 2026 年 5 月中间会议**无异议通过**（15-26/0265r0 第 17 页）。**一条注意**：D05 复审又对感知报告阶段的措辞提了意见（15-26/0420r0，Group K），而 9 月中间会议只表决了 Motion #26 与 #27（均被否），Group K 的处置**尚未表决**。引擎建的只有几何：一个接收机被递来第二个到达时，把它蕴含的东西记下来（`uwb/sensing.ts#UwbSensor`、`engine/scatter.ts#echoExcessM`、`engine/scatter.ts#isResolvable`、`engine/scatter.ts#echoLossDb`）。草案 §10.40 的任何 MAC 结构——感知阶段、报告阶段、会话——一样也没有。`@uwb-sensing`、`@uwb-sensing-resolution` |
| Application Control IE §10.40.6.1、CIR Report IE §10.40.6.2、SBP Request/Response/Termination IE §10.40.6.3–.5、Processed Target Feature Report IE §10.40.6.6 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MIEMIE4.60–4.66 逐个给出条号；CIR IE 的意见决议 15-26/0224r0 在 2026 年 5 月**无异议通过**（15-26/0265r0 第 13 页）。**范围决定**：引擎的回波是一条时间线记录（`uwb/records.ts#UwbRecord` 的 `UWB_ECHO`），不是一个空口上的报告；没有 CIR，也没有信道冲激响应这个量。 |
| 静止散射体的双站回波 | 已进草案且未见争议 | 部分建模 | 证据：感知本身在草案里——15-26/0179r1 的 PICS 插入项 MLF9.40 引 §10.40，感知意见决议 15-26/0242r0 于 2026 年 5 月无异议通过。引擎：**只有双站**——介质跳过 `rxId === from`，所以没有单站雷达；散射体是静止的点目标（`engine/scatter.ts#ScattererCfg`、`engine/scatter.ts#apertureCorrectionDb`）。**范围决定**（`docs/superpowers/specs/2026-09-29-sensing-design.md` §9）：墙不作为散射体、不建多普勒与运动、不改 4z/4ab 的测距行为、Wi-Fi 侧不加散射体。另有一处引擎记不下来的事：**回波太弱这件事**——介质按直射路径自己的灵敏度门控回波，没有独立的感知底噪。`@uwb-sensing` |

## 十四、P802.15.4ab 草案：其余的整块特性

这八行都是**范围决定**：本仓库的 4ab 那一半从一开始就只挑了测距那一条线（MMS 与它的控制面）。列出来，
是为了让读者知道自己在 mentor 上会看到多少与本课程无关的流量。

| 特性 | 标准状态 | 本仿真器 | 位置与证据 |
| --- | --- | --- | --- |
| 复合帧（compact frame）§10.38 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 FD9「Compact Frame Support」与 MLF9.38 均引 §10.38；复合帧的具体帧型被 2026 年文稿逐个引用（如 §10.39.11.3.20 的 One-to-one Final Compact，Compact Frame ID 18）。**范围决定**：引擎的帧是 802.15.4 的 MHR + IE + FCS 那一套（`uwb/phy.ts#UWB_MHR_BYTES`、`uwb/phy.ts#UWB_IE_HDR_BYTES`、`uwb/phy.ts#UWB_FCS_BYTES`），复合帧的压缩布局一处也没有。 |
| 复合帧优化 | 仍在争论 | 未建模 | 证据：**15-26/0391r4 第 36 页三个未决技术议题的第一个**（"Compact frame optimizations"）；第 63 页另有一次关于「为自适应发射功率控制增加复合帧」的草案投票。**范围决定**，同上一行。 |
| 复合帧安全 §9.2.12、§9.2.13 | 已进草案且未见争议 | 未建模 | 证据：15-26/0220r0（security part 1）与 15-26/0257r0（part 2）在 2026 年 5 月中间会议**均无异议通过**（15-26/0265r0 第 13、25 页）；15-26/0289r0 的替代决议（I-198、I-195）在 7 月前电话会**以全体同意通过**（15-26/0270r1）。引文可见 `secCompactFrameKeyDescriptor`、由测距时隙/轮/块导出的帧计数器。**范围决定**：引擎没有任何密码学，见 §10.31 那一行。 |
| 超块模式（hyper block mode）§10.32.3.5，及 Scheduling IE §10.32.9.10、Enhanced Ranging Round IE §10.32.9.11、Hyper Block Structure IE §10.32.9.12 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.32.1 与 MIEMIE4.57–4.59 逐个给出条号；15-26/0220r0 直接修改 §10.32.3.5 的段落，15-26/0289r0 引「In hyper block mode, the ranging block index shall be calculated as specified in 10.32.3.5」并已通过。**范围决定**：引擎的块序号是一个单调计数（`uwb/session.ts#slotStartNs`），没有超块这一层。 |
| 设备发现与关联（block-based mode）§10.41，及 Controller Association Request/Response 命令 §10.41.4.1/.2 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.41、MF4.34、MF4.35；15-26/0175r4 处置 I-38 时逐字改写 §10.41.4.1 页 198 行 20。**范围决定**：同 §10.29.2 那一行——本仿真器的会话从不需要被建立起来。 |
| HRP UWB PHY 的参数协商 §10.42，及 Dynamic Data Mode Negotiation IE §10.42.3.1 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.42、MIEMIE4.67；15-26/0172r0 引草案页 201「An HRP-EMDEV may optionally support the mechanism defined in 10.42 for negotiating dynamic data mode parameters」。**范围决定**：引擎里没有协商。 |
| 唤醒无线电 §10.43 与它的物理层 §16.9 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.43；15-26/0167r0 处置 I-377 与 I-32 时引 §16.9.1 的唤醒符号时长 1.025 ms 与 PIB 属性 `phyUwbWuPeriod`。**范围决定**：引擎不建功耗，也没有第二个接收机。 |
| UWB 数据卸载到窄带 §10.44，及 Narrowband Allocation IE §10.44.3.1 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.44、MIEMIE4.68。**范围决定**：引擎的窄带只跑控制消息，不跑数据。 |
| 测距支持服务（Ranging Support Service, RSS）§10.46 | 已进草案且未见争议 | 未建模 | 证据：15-26/0179r1 的 PICS 插入项 MLF9.46。**范围决定。** |
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

十一个格子写了「无法判定」。它们不是懒，是语料库到此为止。逐条说明查了什么已在各自的单元格里，
这里只列出来，方便下一次刷新语料库时重跑：

1. **固定回复时间 `macMmsFixedReplyTime`** — 提案正文有，纪要里每次以「更多线下讨论」收场，2026 年文稿零命中。
2. **反序 MMS** — 同上，且 2026 年的 `Reversed` 两处命中都是另一件事。
3. **RSF 带 SFD `phyUwbMmsRsfSfd`** — 2025 年有字段与 PIB 定义，2026 年零命中。
4. **零长控制阶段** — 只有 15-25/0194r0。
5. **SP0 控制面的内容布局** — 语料库没有给过 SP0 内容的格式。
6. **高速率（≥ 50 Mb/s）与低时延流式传输** — PAR 目标反复被照抄，PICS 与意见里找不到条号。
7. **DL-TDoA** — 2024 版目录里无对应条款，4ab 语料库里无草案条文。
8. **UL-TDoA 与 blink** — 同上。
9. **AoA / PDoA** — 同上。
10. **由距离解位置** — 标准给测量不给解算，无条款可对。
11. **UWB 侧的衰落** — UWB 信道模型出自 802.15.4a 的信道模型报告，不在标准正文里。

另有两处问题是**开着的，但整行的裁定不是「无法判定」**，所以不在上面这十一条里，读者查那一行时容易错过：

- **窄带跳频序列怎么生成。** 跳频序列本身在草案里（15-26/0365r0 引了它的规范文字），所以那一行判
  「已进草案且未见争议」；但「以会话种子为密钥对块序号做 AES-128-CTR」这条推导只见于 15-22/0381r5 §1.5.3，
  2026 年文稿里查不到。引擎用的是自己的字符串散列。
- **感知报告阶段的措辞。** 感知那一行判「已进草案且未见争议」，依据是 2026 年 5 月无异议通过的
  15-26/0242r0；但 D05 复审又对报告阶段提了意见（15-26/0420r0，Group K），而 9 月中间会议**没有表决
  Group K 的处置**。这一段的最终措辞尚未定。

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

另有一处不算冲突、只是补充：**9 月中间会议上两个意见决议动议全部被否**（Motion #26 的 12/13/1 与
Motion #27 的 11/13/0），7 月全会与 7–9 月电话会也是大面积被否。仓库现有说法「仍在 SA 投票复审中」
是对的，但读者值得知道复审卡在哪里：**卡在表决上，不是卡在起草上。**
