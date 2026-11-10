# Wi-Fi 对齐标准：引擎改正 + 课程更新（2026-11-11 起）

姊妹计划：`docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md`（硬规则与课程新结构见该文件）。
本计划记录 Wi-Fi 引擎各工作流对照 IEEE Std 802.11-2024（及 802.11be-2024）的改正。
不一致项清单来自课程审计（各条带审计分组 A1–B8）。

## 不变的规矩

- 硬规则：标准里没有的信息单元、字段、帧、规则，引擎里一律不许有；做不到就不实现，② 里写「未实现」。
- 每一处改正都写明条款；fixture 只为合法的引擎改正重新生成，并写明原因。
- 改了引擎，就改所有受影响的课：② 行改为「照标准」，③ 的数字重新测量，测试改为钉住标准的行为。

## W7a：MAC 帧、确认与保护（本工作流）

设计说明：`docs/superpowers/specs/2026-11-11-wifi-mac-frames-ack-design.md`。

| 改正 | 条款 | 原来的引擎 |
| --- | --- | --- |
| 去掉自创的「边界」保护策略，只留单次保护与多重保护两类；多重保护下每一帧预约到 TXOP 末尾（取上限）；RTS 只由 RTS 门限决定 | §9.2.5.2 | 三种策略，其中「边界」是自创的混合；保护突发时强制发 RTS |
| 单次保护：不是最后一帧的数据帧覆盖下一帧及其应答；确认帧、块确认、CTS 的 Duration = 引出它的帧的 Duration − SIFS − 自身 | §9.2.5.2 a)8)，§9.2.5.6 | 数据帧只覆盖自己的应答；确认帧一律写 0 |
| CTS 应答：RTS 来自保存的 TXOP 持有者地址时，NAV 不为 0 也回复 CTS | §10.3.2.9，§10.23.2.4 | NAV 不为 0 就不回复 |
| DL MU 确认：每个 MPDU 带 HT Control 的 TRS 控制子字段，成员以 HE/EHT TB PPDU 在各自 RU 上回块确认；未被征询不回复 | §10.3.2.13.2，§9.2.4.7.1，§26.5.2.3.4 | 成员不经征询各自以 24 Mb/s 非 HT 块确认回复 |
| A-MPDU：逐个 MPDU 判定接收，块确认位图如实报告，只重传未确认的 MPDU；VHT/HE/EHT 的 PSDU 一律是 A-MPDU（单个 MSDU 为 S-MPDU）、末子帧填充与 EOF 填充补到 PSDU_LENGTH；定界符字段（EOF、长度、CRC-8、签名 0x4E）按位计入 | §9.7.1–§9.7.3，§10.12.5–§10.12.8，§10.25 | 整个 PPDU 一次判定；位图不按子帧生成；单个 MSDU 不带定界符；无 EOF 填充 |
| 地址 3 按表 9-60（To DS 时为 DA，From DS 时为 SA）；接收端按 <TA, TID, SN> 与 Retry 位检测重复帧；接入点收到即交给分发系统（确认帧丢失也转发）；序列号空间按 <Address 1, TID>，非 QoS 数据用一个基线计数器 | 表 9-60，§10.3.2.14.3，表 10-5，表 10-6 | 地址 3 一律是接入点（文件误引表 9-26）；按引擎内部载荷编号去重；发送端收到确认之后才转发；按 <接收端, AC> 计数 |

受影响的课：txop-protect、protect-policies（场景去掉重复的「多重」变体，基础场景为多重保护、变体为单次保护）、
ofdma-dl、ofdma-ul、mumimo、mumimo-choose、capstone、ru-diversity、frame-anatomy 系列、small-frames、ampdu、
roles-stack、relay-hops、wan-rtt、airtime 以及与 Wi-Fi 共存的 UWB 课（Wi-Fi 帧长变化使其时间轴移动）。

### 进度

- [x] 引擎改正（mac.ts、channel.ts、frames.ts、frameFields.ts、queues.ts、simulation.ts、scenario.ts）
- [x] 引擎测试：tests/engine/w7a-frames.test.ts、tests/engine/txop-protection.test.ts（重写）
- [x] 受影响的课按新数字重写，② 行改为「照标准」
- [x] fixture 重新生成（原因见设计说明 §5）

### 未实现（W7a 范围内）

- 定界符 CRC-8 的数值不计算（8 位计入长度与空口时间，值不生成）。
- 块确认协商（ADDBA）、块确认请求（BlockAckReq）、MU-BAR 触发帧：确认一律由隐式请求（SU）或 TRS（DL MU）征询。
- TRS 的 AP Tx Power、UL Target Receive Power 子字段不参与任何计算（功率控制未实现）。

## W7b：EDCA/QoS、游戏模式、AMP

设计说明：`docs/superpowers/specs/2026-11-11-w7b-design.md`。

| 改正 | 条款 | 原来的引擎 |
| --- | --- | --- |
| 接入点用 dot11QAPEDCATable 的缺省值（AIFSN 7/3/1/1，CWmax 1023/63/15/7），非 AP 站点用表 9-194 | §10.2.3.2，附录 C，§10.23.2.4 | 接入点也用非 AP 站点那张表 |
| 每个 MSDU 带用户优先级，接入类别按表 10-1 由它得出，TID 即 UP；业务档给哪个 UP 是取法 | §10.2.3.2，表 10-1 | 业务档直接指定接入类别 |
| 生存期：EDCA 500 TU（512 ms）从交给 MAC 时起算；DCF dot11MaxTransmitMSDULifetime 512 TU 从第一次发送起算 | §10.23.2.12.1，§10.4，附录 C | 一律从入队起算、500 ms |
| EDCA 的 QSRC：小于上限才加一，已达上限的那次失败才复位；DCF 仍按 §10.3.3 到上限即复位。内部碰撞给落败帧记重传——核实为标准要求，不改 | §10.23.2.2，§10.3.3，§10.23.2.12.1 | EDCA 也按「到上限即复位」，早一次 |
| 删除自创的路由器「游戏模式」；MSCS 未实现 | §11.25.3 | 接入点一个布尔把游戏流上下行移到 AC_VI |
| AMP 每个传输机会都不超过 AC_BK 的 TXOP 限制，一轮分到几个传输机会；去掉豁免 | §10.23.2.9，表 9-194 | 一轮 4190/6620 µs 不受限制；反向散射 4 ms |
| 单站反向散射按草案重建：广播 AMP Trigger（单时隙、ACWE）→ AMP Response（ID）→ AMP RFID 帧携带 Read 读回 EPC | PDT 11-26/1519r5 §39.3.3，11-26/1520r3，11-26/1798r1，§39.4 | 按未采纳的提案 11-25/0061r0 隧穿 EPC Gen2 Query/QueryRep/ACK、2^Q 槽 |
| 触发帧写入信道指示（6）、上行频移（0）、扰码种子编号（0 → 0x5C）；标签对 14/15 不作答 | §39.3.2.1，§39.3.2.2，§39.4，表 39-1 | 三个字段不起作用 |
| CTS-to-self 出处改为 §9.2.5.2 / §10.3.2.15 | — | 误引 §10.23.2.8 |
| 2.4 GHz 短时隙：基本服务集里有不支持短时隙的设备就用 20 µs 长时隙 | §10.3.2.16，§11.1.3.2，表 18-5 | 一律 9 µs |

### 进度

- [x] 引擎改正（phy.ts、mac.ts、queues.ts、traffic.ts、simulation.ts、amp*.ts、frames.ts、records.ts、scenario.ts）
- [x] 引擎测试：tests/engine/w7b-edca.test.ts，AMP 各测试按新行为重写
- [x] 受影响的课重测并改写（AMP 五课、edca、edca-cost、wan-rtt、queues、retries-queues 及其他数字移动的 Wi-Fi 课）
- [x] fixture 重新生成；汇总数字重测

### 未实现（W7b 范围内）

- MSCS（§11.25.3）：需要管理帧（Action 帧），本引擎没有。
- 单站反向散射的 Select（可选）、Write（≥ 2 ms 处理时延装不进传输机会）、Authenticate。
- 2.4 GHz EIFS 的最低必选速率：已由 W6 改正（见下一节）。

## W6：Wi-Fi PHY 时序与载波侦听

设计说明：`docs/superpowers/specs/2026-11-11-w6-phy-timing-design.md`。新测试：`tests/engine/w6-phy-timing.test.ts`。

| # | 改正 | 标准条款 | 引擎位置 |
| --- | --- | --- | --- |
| 1 | 前导检测（−82 dBm）与能量检测（−62 dBm）都按**主 20 MHz 信道内**测得的功率比较；宽 PPDU 的功率按带宽均匀分布折算。窄于工作信道的 PPDU 放在同宽度的主信道上（不再放在信道中央）；6 GHz 的主 20 MHz 信道取工作信道里最低的 PSC。 | §27.3.22.6.3，§36.3.21.6.3（be），§17.3.10.6，§26.17.2.3 | `channel.ts` `primary20Dbm`、`primaryBandMhz`、`updateAllCca`、`applyOneTx`；`simulation.ts` `primary20LoMhz` |
| 1b | 次信道按每个 20 MHz 子信道 −62 dBm 判忙闲；EDCAF 取得 TXOP 时，宽 PPDU 所占的次信道在之前 PIFS 内必须空闲，否则按 §10.23.2.5 e) 不发送、重新退避（静态带宽是本仿真器在 a)–e) 中的选择）。 | §27.3.22.6.5，§36.3.21.6.4，§10.23.2.5 | `channel.ts` `secondaryIdleSinceNs`；`mac.ts` `secondaryIdleForPifs`、`arbitrate` |
| 2 | aRxPHYStartDelay 按 STA 支持的 PHY 条款与情境取最大值：第 17 章 20 µs；HT/VHT/HE 24 µs（AckTimeout 49 µs）；EHT 等 EHT TB PPDU 时 32 µs，等任意 PPDU（RTS 后的 NAV 复位）时 32 + 4 × N_EHT-SIG = 40 µs；2.4 GHz ERP-OFDM 20 µs。 | §6.7.4.4，表 19-25，表 21-28，表 27-61，表 36-70（be），§10.3.2.9，§10.3.2.11，§10.3.2.4 | `phy.ts` `timingForGen`；`simulation.ts` `timingFor(link, gen)`；`mac.ts` 触发帧超时、NAV 复位 |
| 3 | PPDU 时长按标准公式逐字段计算：HE 前导 36 µs + N_HE-LTF × T_HE-LTF-SYM（1.6 µs GI 时 LTF 符号 8.0 µs，四倍 GI 52.0 µs）；EHT 前导含 U-SIG 与 2 个 EHT-SIG 符号（EHT-SIG MCS 0，本仿真器的选择）与按流数的 EHT-LTF；VHT 前导按流数；HE/EHT 的 N_SYM 与预纠错填充因子 a 按 BCC/LDPC 的式子（MCS 10 以上、宽于 242 子载波必须 LDPC；都允许时用 BCC，本仿真器的选择）；包扩展 T_PE = 4a µs（每个接收方声明 16 µs 名义填充，本仿真器的取值）；EHT 的 TXTIME 按 §6.7.6.2 取整到 µs；VHT 的 N_ES。TB PPDU 的 HE-STF/EHT-STF 8 µs；MU-MIMO 的 LTF 按总流数。 | 式 (27-149)，式 (36-110)，表 27-13，表 36-18，表 21-13，表 36-43，§27.3.12.5，§36.3.13.3，表 27-47，表 36-61，§6.7.6.2 | `phy.ts` `ppduTiming`、`preambleNsFor`、`heDataSymbols`、`codingFor`、`maxPsduBytesForDur`；`frameFields.ts` `ppduLayout`（新增 PE 段） |
| 4 | Duration 字段按整微秒向上取整、不超过 32 767 µs，在 MAC 唯一的发送出口统一处理。 | 表 9-9（§9.2.4.2），§9.3.1.2，§9.3.2.1 | `phy.ts` `durationFieldValueNs`；`mac.ts` `transmitFrame` |
| 5 | 2.4 GHz 的 EIFS 用 ERP PHY 的最低强制速率 1 Mb/s DSSS 计算确认帧时长：10 + 304 + 28 = 342 µs（原为 6 Mb/s OFDM 的 88 µs）。 | 式 (10-7)，表 10-8，第 18 章 | `phy.ts` `ERP_2G` |

### 仍未实现 / 仍与标准不同（W6 范围内）

- DL MU PPDU 的 HE-SIG-B / EHT-SIG 符号数：标准由 RU Allocation 子字段与 User 字段数决定；本仿真器平均分 RU，没有 RU Allocation 子字段可数，MU 额外信令仍按 1 个符号（4 µs）计。
- TB PPDU 的包扩展按式 (27-114) 由触发帧的 UL Length 决定；本仿真器的 TB PPDU 直接补齐到触发帧给的时长。
- 多普勒中间导码（midamble）未实现（N_MA = 0）。
- 次信道上 −72 dBm 的 PPDU 检测条件不起作用：本仿真器的 Wi-Fi PPDU 全都占用主 20 MHz 信道。
- 每帧按动态带宽缩窄（§10.23.2.5 b–d）未实现，属于 B3 的特性项。

### 夹具

- `tests/fixtures/lesson-hashes.json`、`tests/fixtures/uwb-record-hashes.json`：W6 的每一项都会移动 Wi-Fi 记录的时刻，凡是含 Wi-Fi 的场景哈希都变；UWB 记录哈希里变的只有与 6 GHz Wi-Fi 共存的场景（Wi-Fi 发射的频带与时刻变了）。

### 与 W7a、W7b 合并（2026-11-11）

W6 从旧的主线分出，W7a、W7b 先并入主线；合并时两边的引擎改正按下列方式组合：

- PSDU_LENGTH：W7a 的 EOF 填充补到 PSDU_LENGTH，W6 之前按 BCC 的整符号公式计算。合并后由 `ppduTiming(...).psduLength`
  按标准公式给出：HE/EHT 为 ⌊((N_SYM,init − 1)·N_DBPS + N_DBPS,last,init − 16 − N_tail) / 8⌋（式 (27-153)，式 (36-112)、(36-113)），
  LDPC 没有尾比特，MAC 只填充到 a_init 对应的边界；VHT 为 ⌊(N_SYM·N_DBPS − 16 − 6·N_ES) / 8⌋（式 (21-112)）。空口时间一律由
  APEP_LENGTH 计算（`frameFields.ts` 的 PPDU 版面同样按 `apepBytes` 匹配）。
- DL MU PPDU：成员的 PSDU_LENGTH 按整个 PPDU 共同的 N_SYM,init 与 a_init（编码后最长的成员给出，式 (27-75)、(27-76)；
  式 (36-51)、(36-52)）计算（式 (27-154)、(27-155)；`psduLengthAt`），`MuPart.apepBytes` 记录成员的 APEP_LENGTH。
- TRS 征询的 HE TB / EHT TB PPDU（W7a 的块确认）：前导用 W6 的 TB 前导（HE-STF/EHT-STF 8 µs），预纠错填充因子 4，
  RU 小于 484 子载波用 BCC、否则 LDPC 且带额外符号，包扩展取接入点 HE Operation 元素的 Default PE Duration（§26.5.2.3.4，
  §9.4.2.248）。本引擎不交换 HE Operation 元素，这个值取 4（16 µs），是本仿真器的取值。EHT 的 TXTIME 取整到微秒。
  实现：`phy.ts#trsTbPpdu`，接入点等待这些 TB PPDU 时 EHT 用 32 µs 的 aRxPHYStartDelay（`mac.ts#tbResponseTimeoutNs`）。
- Duration：W7a 的保护与应答 Duration 公式不变，发送时统一按 W6 向上取整到微秒、截断在 32 767（`transmitFrame`）；
  应答帧以引出它的帧在空口上的 Duration 为基准。CF-End 判断用的「已宣布的 NAV 终点」也按取整后的 Duration 记录。
- 2.4 GHz 时隙与 EIFS：先按站点的世代取 aRxPHYStartDelay（`timingFor(link, gen)`），再按 W7b 的规则在有不支持短时隙的设备时
  换成 20 µs 长时隙（`bssTimingFor(link, members, gen)`）。EIFS 仍是 aSIFSTime + AckTxTime + DIFS（式 (10-7)）：短时隙 342 µs，
  长时隙 364 µs；HE 站点的 AckTimeout 短时隙 43 µs、长时隙 54 µs。
- 次信道 PIFS 检查（§10.23.2.5 e)）不拦 AMP 轮询轮：轮以 20 MHz 非 HT 帧开始。
- 仍是近似：DL MU PPDU 的时长取各成员单独计算的 TXTIME 的最大值；某个 LDPC 成员需要额外符号段而数据段最长的成员不需要时，
  标准要求全体成员一起加（§27.3.12.5.4，式 (27-78)–(27-80) 之后的条件），本仿真器没有这样做。
