# Wi-Fi / AMP 对齐标准：引擎改正（2026-11-11 起）

姊妹计划：`docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md`（其中的「硬规则」同样适用于这里）。
差异清单：课程重排时整理出的 Wi-Fi 引擎与 IEEE Std 802.11-2024 / IEEE Std 802.11be-2024 不一致之处，
按工作流分给 W6、W7……，每一项先在标准正文里核实，再改引擎、改课、改测试。

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
