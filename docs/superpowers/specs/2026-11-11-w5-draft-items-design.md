# P802.15.4ab 草案项按草案改正（W5）

2026-11-11。`docs/uwb-standard-audit.md` 的 #6、#17、#18、#19、#20、#22，W2b 表的一对多窄带 POLL 长度，以及窄带跳频的生成式；工作计划 `docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md` 的 W5。
硬规则照旧：草案（或已通过的 TG4ab 决议）里没有的元素一律不建；做不到的写「未实现」。每一项都对照语料库原文核过（`uwb_tg4ab/text/*.json`、`ieee_standards/text/802154-2024.json`）。

## 1. 改了什么，依据哪一条

| # | 内容 | 依据 | 以前 | 现在 |
| --- | --- | --- | --- | --- |
| 6 | 预测回复时间 | 决议 15-25/0681r1（纪要 15-26/0006r0：无异议通过）：One-to-one / One-to-many Response Compact 帧的 Message Control 增加取值 2，Message Content 为 5 个八位组的 Predicted Reply Time（应答方测得的、收到的发起方片段与它随后发出的片段之间 RMARKER 的时间差，单位见 §10.29.1.4），只用于非交织模式，「用来避免单独报告回复时间」 | `fixedReplyRstu`（15-25/0224r2）与 `reversedOrder`（15-25/0556r2）两个被取代的提案 | 两个提案删除（`MmsPhy`、schema、编辑器、引擎、课）。`MmsPhy.predictedReplyTime`：应答方在非交织子轮开头的应答帧（窄带 RESP 或 SP0 RESP）里带上预测回复时间——用自己的计数器算「收到的发起方 RMARKER」到「自己第一个计时片段的发送时刻」之差——并不再发回复时间报告；发起方在判定应答方那列片段时直接用往返时间与它算出距离（时钟修正同 SS-TWR）。RESP 仍是 12 字节（5 个零字节换成 5 字节的时间）。schema 只在非交织且有控制相位（应答帧）时接受 |
| 17 | SP0 的代价 | 15-25/0194r0 第 7–8 页：「Longer SP0 Frame is sent at lower peak power level」，按脉冲数之比 6.3／5.3／3.8 dB，结论「~4dB」——这 4 dB 就是峰值功率的损失 | SP0 按节点突发功率（比片段低 10.54 dB）发射，又把门限提高 4 dB | `mmsSp0TxDbm`：SP0 按包首片段（本引擎里第一个 RSF/RIF）的功率减 4 dB 发射，按普通的 −93 dBm 判定。`MMS_SP0_RX_SENS_DBM` 删除 |
| 18 | RSF 带 SFD 与 SP0 控制面 | 15-25/0066r1 是对 CID 963 的处置提案；15-25/0082r8 记录 CID 963 已由提出者撤回，草案里没有这一位与 `phyUwbMmsRsfSfd`。15-25/0194r0 的示意图：Config 1 的 MMS 包无论有没有 SP0 都以 SYNC+SFD 片段开头，CFO 与定时取自它 | `rsfSfd` 选项（RSF 后附 SFD、任一片段可开包）；有 SP0 时视为已捕获 | `rsfSfd`、`rsfAirNs`、`MMS_RSF_SFD_N_MSR` 删除。`acquired`：Config 1 两种控制相位都要包首片段单独不低于灵敏度 |
| 19 | 窄带先听后发 | 草案 §10.39.8.3（15-25/0307r1、15-25/0427r4 改写）：法规要求时，收发两端在每个发射时隙上各自独立地用 §6.3.2 的 CSMA-CA 或 §10.45 的 SSBD；不要求时可用于共存 | UNII-5 一律执行；一次判忙在这个块余下的时间里不再发送 | `nbAccess`：每条窄带消息在自己的发射时隙里接入。SSBD 设了就用 SSBD；否则在 `nbLbtRequired` 为真时用 CSMA-CA（标准 §6.3.2.1，图 6-2：random(2^BE − 1) 个单位退避周期，CCA，忙则 NB+1、BE+1，NB > macMaxCsmaBackoffs 失败），macUnitBackoffPeriod = aTurnaroundTime 12 + phyCcaDuration 8 = 20 个符号（320 µs，表 8-37、表 12-1）。`UWB_NB_LBT` 记录改为 CSMA-CA 事件（`retry`／`fail`／`noRoom`）；视图的「跳过的块」改为「未发出的消息」 |
| 20 | 感知时长 | 标准 §11.2.8 b)「The CCA detection time shall be equal to phyCcaDuration」；表 12-2：物理层条款没有另行推荐时推荐 8 个符号周期；CID 490/495：SSBD 读物理层的这个属性 | 一次瞬时读数（SSBD 上界里按 9 µs 记） | `UwbChannel.ccaMeasure`：在 phyCcaDuration = 128 µs 上对外部功率做精确的分段积分（每次频谱变化闭合一段），结束时与门限比较；CSMA-CA 与 SSBD 都用它，发送在 CCA 结束时开始。`ssbdBoundNs` 缺省按 128 µs 计（缺省参数 788 µs） |
| 22 | 交织片段间隔与一对多 | 15-24/0633r1（D01）：发起方发一个片段后应答方隔 500 µs 发一个；15-25/0213r2（CID 474）：一对多按应答方分子轮，第一个子轮的一对多 Poll 为 Message Control 1（列出应答方），以后各子轮为 0；每个子轮里像一对一那样交织 | 一对多共用一个控制相位与一列发起方片段，每毫秒 (R + 1) 个时隙，三个应答方 2 ms | `mmsLayout` 交织分支：R 个成对子轮，片段间隔 `max(2, slotsPerMs)` 个时隙、应答方晚一半（600 RSTU 时 1 ms／500 µs）；`polls`、`pollFor`、`pollSlot(i)`；发起方在每个子轮各发一次自己的一列（单播）。成对轮次逐时隙不变。SP0 的一对多 POLL 因此也按子轮单播，不再需要「轮里的应答方表」代替地址 |
| W2b | 一对多窄带 POLL 长度 | 15-22/0381r5 表 1.6.3.1：消息号 1 + RPA_hash 3 + RPA_prand 3 + MessageControl 1 + {应答方数 1、时隙数 1、地址 3N} + CRC 2 = 12 + 3N；草案 One-to-many Poll Compact 帧 Message Control 1 保留同样三个字段，「three octets per address」（15-24/0687r4 Figure 90；15-26/0364r1 同） | 14 + 3N（成对 POLL 的两个零内容字节没有被替换） | `nbOtmPollBytes` = 12 + 3N；后续子轮的 Poll（Message Control 0）12 字节 |
| — | 窄带跳频 | 草案 §10.39.8.4.3：NbaPrng(seed, RangingBlockIndex) 是 AES-128 分组加密（附录 B.2.2，15-24/0223r1），两者按高位补零的 128 位无符号整数，PrngValue 取输出第 0–31 位（15-24/0658r1），所选信道 = 列表[PrngValue mod n]；测试向量 15-26/0215r2、15-26/0408r2 | 仿真器自己的字符串散列 | `uwb/aes128.ts`（FIPS 197，纯 TS）+ `nb.ts#nbaPrngValue`；按草案两组测试向量与 FIPS 197 附录 B 校验（`tests/uwb/nb-prng.test.ts`）。种子取场景种子 mod 256（取值：种子由上层在建立时商定，一个八位组） |

## 2. 未实现

- SOR 等初始化消息、RPA 散列：照旧未实现。
- RRTN 类的带外回复时间约定：MMS 侧不需要（预测回复时间在帧里传）。
- 一对多非交织形态的细节：草案尚未定完（15-25/0213r2，CID 205/207「Need extra work」）；本引擎的排法（发起方一个子轮、每个应答方一个子轮）照旧是取法。
- 一对多的「时间高效」「竞争式」变体（Message Control 0x50、0x90 等）：未实现。

## 3. 本仿真器的取值与取法

- CSMA-CA 的 macMinBe 取 0（标准范围 0…macMaxBe，缺省 3）：缺省值下第一次退避就可能 7 × 320 µs，而一个窄带窗口只有 1 ms。macMaxBe 5、macMaxCsmaBackoffs 4 取标准缺省。
- 下一次退避与 CCA 之后窗口里放不下这条消息时，这一时隙不发送（`noRoom`）：标准没有说 MAC 遇到时隙用完怎么办。SSBD 的「截断退避」沿用 SSBD 切片的取法，窗口里连一次 CCA 也放不下时同样记 `noRoom`。
- `nbLbt: 'auto'` 把 UNII-5 建模为法规要求先做信道接入的频段、UNII-3 不要求（15-22/0381r5 §1.4.2 的说法）：哪条法规适用是部署的事。
- 门限仍取 ETSI 的 −75 dBm/MHz 换算到 2.5 MHz（−71.02 dBm）：草案正文没有给出。
- phyCcaDuration 取标准表 12-2 推荐的 8 个符号周期：草案的窄带物理层没有给出别的值（D04 一条要求定最短感知时长的意见未被采纳）。
- 预测回复时间打开时，发起方仍在自己的报告窗口里把往返时间发给应答方，使应答方也得到距离；应答方自己的报告窗口空着。
- SP0 的 4 dB 取提案结论句的整数。
- 交织间隔在非 600／300 RSTU 的时隙上取 `max(2, ⌈1 ms / 时隙⌉)` 个时隙、应答方晚一半（草案的 500 µs 是在缺省时隙上写的）。

## 4. 核查不了的

- 现行草案（D05）正文不在语料库里：Response Compact 帧 Message Control 2 的最终图号、One-to-many Poll Compact 帧在 D05 里的确切字段（2026 年的文稿 15-26/0281、0438 在 Message Control 7/8 上又加了 Poll Control、Presence Bitmap 等字段；本引擎用的是 Message Control 1 的基本格式）。
- 4ab 窄带物理层是否另行规定 phyCcaDuration；ETSI EN 303 687 被撤销符合性推定后欧盟的后续版本。
- 草案的一对多 Report 在子轮里的确切位置（15-25/0213r2 说每个子轮的控制阶段用到 Poll、Response、Report 三种帧）；本引擎把报告放在每个子轮末尾。
- 零长控制阶段（15-25/0194r0）仍是提案，采纳未确认（不在本工作流范围）。

## 5. 动到的数

- 一对多交织的一轮：三个应答方 84 个时隙（3 × 28），片段间隔 1 ms；`uwb-mms`、`uwb-mms-numbers`（比值跨度 7 ms，σ 0.0202 ppm）、`uwb-capstone`（一对多列 420 次发射）。
- 一对多 POLL 21 B（三个应答方），以后各子轮 12 B。
- UNII-5 上每条窄带消息晚 128 µs 发出；`uwb-nba` 改在路由器信道之外的 100 号信道上演示（`uwbNbaScenario('clear')`），路由器信道之内的场景在那里成了变体、在 `uwb-nba-coexist` 里是基准：手机每块的 Poll 都接入失败，一个距离也没有。
- SSBD 缺省参数的上界 788 µs，长于 POLL 窗口 424 µs 的余量：路由器信道上 SSBD 与 CSMA-CA 都一个距离也没有（`uwb-ssbd`、指南第 21 节）。
- SP0 作用距离 56.53 m（以前 16.80 m）：`uwb-uwbd` 的二十米锚点在三种控制面下都测得距离。
- 跳频序列（`uwb-nba-coexist` 的跳变变体）：210、150、200、100、100、100、200。
- fixture：`tests/fixtures/lesson-hashes.json` 与 `uwb-record-hashes.json` 中 UWB 的 MMS 场景（acquisition、capstone#2、mms、mms-numbers、nba、nba-coexist、ssbd、subrounds、uwbd）因上面几项而重新生成；删除了已不存在的变体（acquisition#3、nba#2、nba#3）。
