# W7a 设计说明：Wi-Fi MAC 帧、确认与保护（2026-11-11）

对照 IEEE Std 802.11-2024（下称「标准」）与 802.11be-2024。计划见
`docs/superpowers/plans/2026-11-11-wifi-standard-alignment.md`。

## 1. 保护：两类 Duration 设置（§9.2.5.2，§9.2.5.6）

- `TxopProtection` 只剩 `'single' | 'multiple'`。旧场景里的 `'boundary'` 由 zod 预处理读成 `'multiple'`
  （它开头的 RTS 本来就是多重保护的写法）。编辑器、i18n 只列两类。
- 类别在 TXOP 的第一帧（`beginTxop`）选定：节点配置为 `'multiple'` 且这一类的 TXOP 上限不为 0 时为多重保护，
  否则为单次保护（上限为 0 时 b)1)/2) 的 D 退化为单次保护的值）。
- 多重保护：RTS 与此后每一个数据帧（含 DL MU PPDU）的 Duration = TXOP 起点 + 上限 − 本帧结束，
  即 b)3)/b)4) 允许范围的上限（本仿真器的取值，标准给的是范围）。
- 单次保护：RTS = 3 SIFS + CTS + 数据帧 + 应答（a)1)）。数据帧 = SIFS + 应答 + 下一次交互（SIFS + 下一个 PPDU +
  SIFS + 它的应答），最后一帧只有 SIFS + 应答（a)8)）。「下一次交互」由 `nextExchangeNs` 估算：与
  `continueOrRelease`/`transmitFor` 的判断相同——队首的一次交互能否放进上限、能放进时按 `AcQueues.claim` 的走法
  聚合多少个 MSDU。估算基于构造这一帧时的队列与速率；之后到达的帧或提高的速率仍可能让上限之内多一次交互
  （标准说的是「估计」，没有禁止继续），那一帧不在隐藏站点的预约之内。课程 txop-protect 的 ② 行「哪一帧是最后一帧」
  标为「取法」。
- 应答帧：CTS、Ack、BlockAck（含 TB PPDU 里的块确认）的 Duration = 引出它的帧的 Duration − SIFS − 自身空口时间，
  负值写 0（§9.2.5.6、§9.2.5.7、§9.2.5.1）。多重保护下接入点的确认帧因此把 TXOP 终点转述给隐藏站点；单次保护下
  逐次转述下一次交互。
- 去掉「规划到不止一次交互就强制发 RTS」：RTS 只由 dot11RTSThreshold 决定（§10.3.5）。
- CF-End：持有者在本 TXOP 里自己宣布的 NAV 终点（`announcedEndNs`，即 b) 的 T_END-NAV）超出时发送，条件不变
  （§10.23.2.10）。单次保护下宣布的终点就是最后一个应答的结束，所以不发。
- Duration 仍以纳秒记录、不取整：取整到微秒属于另一工作流（PHY 定时/取整）。

## 2. CTS 应答规则（§10.3.2.9，§10.23.2.4）

收到 RTS 时「NAV 指示空闲」= NAV 为 0，或 RTS 的 TA 等于保存的 TXOP 持有者地址。持有者地址在设置 NAV 时保存
（该帧的 Address 2，CTS 则取 Address 1），NAV 复位或到期时清除。测试：tests/engine/txop-protection.test.ts
「CTS response and the saved TXOP holder address」。

## 3. DL MU 确认（§10.3.2.13.2，§9.2.4.7.1，§26.5.2.3.4）

- DL MU PPDU 的每个 MPDU 带 HE 变体 HT Control 字段（+4 八位组），其中 TRS 控制子字段给出 UL Data Symbols、
  RU、UL HE-MCS。成员 MPDU 的确认策略为 HETP Ack。
- 接入点的取法（标准留给实现）：每个成员一个 RU（成员数等分，partIdx 为成员顺序；MU-MIMO 之后的应答也是
  UL OFDMA）；UL HE-MCS = min(成员的 MCS, 3)（字段范围 0–3）；UL Data Symbols 按最大的成员承载一个
  「定界符 + 32 八位组块确认」的 A-MPDU 取值，所有成员相同。
- TB PPDU：格式 HE_TB/EHT_TB（随 DL MU PPDU 的格式）、NUM_STS 1、1.6 µs GI 与 2x HE-LTF（DL 用 3.2 µs GI 时
  亦然；本仿真器的 DL 不会用 4x+3.2 以外的组合）；时长 = 前导 + N_SYM × 符号时长（前导用现有的 `preambleNsFor`，
  HE TB 前导的精确字段时长属于 PHY 定时工作流）。
- 没有 TRS 的 DL MU 成员不回复；回复不看 NAV（§26.5.2.3.4 NOTE 1）。
- 接入点按每个成员块确认的位图出队、其余重传；所有 MPDU 都失败才按 f)/j) 加倍 CW（§10.23.2.2）。

## 4. A-MPDU（§9.7，§10.12，§10.25）

- 逐个 MPDU 接收：信道为每次接收记录干扰的阶梯函数（`Lock.interf`）。整个 PSDU 达不到门限时，先看 PHY 头
  （前导到数据字段开始）在最稳健速率的门限下能否解出；能解出则把每个 MPDU 按它在 PSDU 里的八位组偏移映射到
  数据字段的时间段（SERVICE、PSDU、尾比特均匀铺在数据符号上），对该段的最大干扰判定。至少一个 MPDU 通过时上报
  `RX_OK` 并带 `mpduOk`。逐段判定的方法是接收机的取法（标准不规定接收机怎样判定，只规定每个 MPDU 各自校验 FCS）。
- 块确认的 `ba.acked` 只列收到的序列号；发送端收到块确认即视为成功（QSRC/CW 复位，§10.23.2.2 对「成功」的定义），
  位图没标出的 MPDU 记一次重传、回到队首，每个 MPDU 有自己的 Retry 位（`mpdus[i].retry`）。
- UL TB：接入点按收到的 MPDU 填多站点块确认里各站点的位图；站点只出队被确认的 MPDU。
- 帧格式：VHT/HE/EHT/UHR 的 PSDU 一律是 A-MPDU（§9.7.3、§10.12.5），单个 MSDU 为 S-MPDU（定界符 EOF=1，
  回 Ack，§10.12.7、§10.12.8）。`psduPlan` 返回 APEP_LENGTH（A-MPDU pre-EOF padding，末子帧不填充），
  空口时间按它计算；`FrameDesc.bytes` 记录 PSDU_LENGTH = 数据符号能装下的八位组（`psduLengthFor`），差额是
  §10.12.6 的 EOF 填充（末子帧填充到 4 八位组，然后 4 八位组的 EOF 填充子帧，然后填充八位组；`eofPadding`）。
  字段视图显示定界符的 EOF、MPDU 长度、CRC-8、签名 0x4E 与 EOF 填充。

## 5. 地址、序列号与重复帧（表 9-60，表 10-5，表 10-6，§10.3.2.14）

- 每个 MPDU 带 `MpduHdr`：SN、Retry、端到端 DA/SA。字段视图：To DS 时地址 3 = DA（中继的最终站点、云服务器，
  或接入点自己），From DS 时地址 3 = SA（中继的源站点、云服务器，或接入点自己）。修正了文件里误引的表 9-26。
- 序列号：QoS 数据按 <Address 1, TID>（TID 由 AC 按表 10-1 取），非 QoS 数据用单一基线计数器（SNS1）。
  计数器与接收端的重复帧缓存都放在 MLD 级共享的 `AcQueues` 里。
- 重复帧：接收端缓存每个 <TA, TID>（非 QoS 为 <TA>）最近 64 个 SN；Retry=1 且命中即丢弃，但仍确认（表 10-6 RC1/RC2
  要求至少保存最近一个，64 对应块确认窗口与 §10.25.6 的接收缓冲去重）。
- 接入点在收到 MSDU 时交给分发系统：中继到另一台站点、请求发往云服务器，都从接收时刻开始；确认帧丢失、
  发送端重传到上限丢弃，也不影响已经转发的载荷。

## 6. 重新生成的 fixture

`tests/fixtures/lesson-hashes.json`：59 项变化、两项删除（`txop-protect#1`、`protect-policies#1`，这两个课的
重复变体去掉了）。`tests/fixtures/uwb-record-hashes.json`：14 项变化（uwb-coexist#2、uwb-nba*、uwb-nba-coexist*、
uwb-ssbd*、uwb-capstone#2——这些场景里有 Wi-Fi 流量，其帧长与时序随上面各项改变）。原因：S-MPDU 使单个 MSDU
的 HE/EHT PPDU 多 4 个八位组（有时多一个符号）、应答帧转述 Duration 改变旁听站点的 NAV、单次保护的数据帧
覆盖下一次交互、DL MU 的确认改为 TB PPDU、逐个 MPDU 接收、接入点收到即转发。

## 7. 未实现

- 定界符 CRC-8 的数值（§9.7.2）：8 位计入长度，值不计算。
- ADDBA 协商、BlockAckReq、MU-BAR 触发帧、块确认的重排序缓冲超时：不实现，确认由隐式请求或 TRS 征询。
- TRS 的 AP Tx Power / UL Target Receive Power：写在 TRS 里的概念存在，引擎不读（上行功率控制未实现）。
- HE 站点的两个 NAV 与 TXOP_DURATION（§26.2.4）：仍只有一个 NAV。

## 8. 没能核实或留给别的工作流的

- HE/EHT TB PPDU 的前导（HE-STF 8 µs、Eq 27-147/36-?）与 PE：用的是现有 `preambleNsFor`，属 PHY 定时工作流。
- PSDU_LENGTH 用的 N_SYM 与 `txTimeModeNs` 的公式一致（ceil((16 + 8L + 6)/N_DBPS)）；HE 的 LDPC/Eq 27-66 改由
  PHY 工作流做时，`psduLengthFor` 应随之改。
- 单次保护「最后一帧」只能是估计：本仿真器允许之后再多一次交互（见 §1），标准对此没有明文。
- 速率自适应仍把 CTS 超时（RTS 相撞）记为一次失败，这不属于本工作流的六项。
- 信道的频率选择性合并（`channel.ts#muMemberShare`）只按 RU 切分数据 PPDU；TB PPDU 里的块确认仍按整个信道的 9 个分格合并，
  得到它没有的频率分集。课程 `@ru-diversity` 的 ② 行「块确认的接收」把它标为「与标准不同」。
- RTS 门限与 APEP_LENGTH（EOF 填充之前的长度）比较；§10.3.5 说的是 PSDU 长度，按字面应是 PSDU_LENGTH。没有课的数字依赖它。
