# W6 设计：Wi-Fi PHY 时序与载波侦听按标准改正

日期：2026-11-11。计划条目见 `docs/superpowers/plans/2026-11-11-wifi-standard-alignment.md` 的 W6 一节。
依据：IEEE Std 802.11-2024、IEEE Std 802.11be-2024（本仓库整理的标准正文）。规则：不发明协议元素；只有标准留给实现的地方才写「本仿真器的取值／取法」。

## 1. 载波侦听：主 20 MHz 信道（§17.3.10.6.1，§27.3.22.6.3/.4/.5，§36.3.21.6.3/.4）

- 主 20 MHz 信道取工作信道里最低的一个 PSC（6 GHz 的 PSC 中心频率 5895 + 80n MHz，§26.17.2.3）；5 GHz 与 2.4 GHz 取最低的 20 MHz 子信道。实现：`src/engine/simulation.ts` 的 `primary20LoMhz`。
- 前导检测（−82 dBm）与能量检测（−62 dBm）都与「落在主 20 MHz 信道内的功率」比较。宽于 20 MHz 的 PPDU 按功率在带宽内均匀分布折算：`primary20Dbm = 总功率 − 10·lg(w/20)`（`src/engine/channel.ts`）。窄于工作带宽的 PPDU 放在主信道所在的那一块上。
- 每个 20 MHz 副信道另按 −62 dBm 判忙闲（§27.3.22.6.5，§36.3.21.6.4），记录每个子信道的空闲起点（`RadioState.per20IdleSince`）。
- 宽带发送前：§10.23.2.5 列出 a)–e) 几种做法；本仿真器取 e)（静态带宽）：副信道在 TXOP 开始前空闲不足 PIFS 时，本次不发送，按原 CW 重新抽取退避。这是标准允许的选择之一，标为 choice。

## 2. aRxPHYStartDelay 与 AckTimeout／CTSTimeout（§6.7.4.4，§10.3.2.9，§10.3.2.11）

- 第 17、18 章 20 µs；HT、VHT、HE 24 µs（表 19-25、21-28、27-61）；EHT 表 36-70：EHT MU PPDU 32 + 4·N_EHT-SIG，EHT TB PPDU 32 µs。
- §6.7.4.4：取站点所支持、在该情形下允许的各 PHY 条款中最大的值。确认帧与 CTS 不会以 EHT MU 格式到达，所以 HT 及以上世代的超时用 24 µs（5 GHz 49 µs，2.4 GHz 43 µs）；EHT 接入点等待 EHT TB PPDU 用 32 µs；RTS 之后 NAV 复位的等待用「任何情形」下的最大值。实现：`timingForGen`（`src/engine/phy.ts`）与 `mac.ts` 中三处局部改动。

## 3. PPDU 时长按标准公式（式 19-x、21-x、27-149、36-110）

- HE：TXTIME = 20 + T_HE-PREAMBLE + N_SYM·T_SYM + T_PE；前导 = RL-SIG、HE-SIG-A、HE-STF（TB 为 8 µs）、N_HE-LTF 个 HE-LTF（表 21-13 / 36-43 的 1,2,4,4,6,6,8,8）。HE 格式不取整（§6.7.6.2 只豁免 HE）。
- EHT/UHR：前导含 U-SIG 与 N_EHT-SIG 个 EHT-SIG 符号；EHT-SIG 用 MCS 0 时 N_EHT-SIG = 2（本仿真器取最稳健的一级，choice）；TXTIME 向上取整到微秒。
- 编码：RU ≤ 242 音调、NSS ≤ 4、MCS ≤ 9 时两种编码都允许，本仿真器取 BCC（choice）；其余必须 LDPC，N_SYM 按 LDPC 的额外符号段计算（式 27-68…72，表 19-16）。VHT 的 N_ES = ⌈N_DBPS/2160⌉。
- T_PE = 4a µs，取每个接收方声明的名义填充 16 µs（表 27-47 / 36-61，§26.12，§35.13.2）。16 µs 是本仿真器的取值。
- 多用户 PPDU：MU-MIMO 的 HE-LTF 个数按各成员流数之和，OFDMA 按成员中最多的流数。

## 4. Duration 字段（表 9-9，§9.3.1.2，§9.3.2.1）

发送时把 Duration 向上取整到整微秒，并截断在 32767。实现：`durationFieldValueNs` 在 `transmitFrame` 中调用。

## 5. 2.4 GHz 的 EIFS（式 10-7，表 10-8，§18.1.2）

EIFS = aSIFSTime + AckTxTime + DIFS，AckTxTime 以最低的强制速率 1 Mb/s DSSS 计算：长前导与 PLCP 头 192 µs + 14 字节 112 µs = 304 µs，所以 10 + 304 + 28 = 342 µs。本仿真器不发送 DSSS 帧，这个速率只用于算 EIFS。

## 6. 课程与测试

每门受影响的课：② 中原先标 differs 的能量检测范围、ACK 超时、EIFS 长度改为 faithful；③ 的每一个数字按新引擎重新测量；测试读回课文。哈希夹具用 `UPDATE_HASHES=1` 重新生成。引擎单元测试：`tests/engine/w6-phy-timing.test.ts`。

## 7. 仍与标准不同（未在 W6 内改）

- 检测概率与 aCCATime：仍是硬门限、零时延。
- 副信道的前导检测（§27.3.22.6.5 中按 PPDU 带宽的 −82/−79/−76 dBm 等级）未建模，只做 −62 dBm 能量检测。
- 动态带宽（§10.23.2.5 a）–d)）与 RTS/CTS 带宽信令未实现。
- DSSS/CCK 与 ERP 保护未实现。长时隙由 W7b 实现（基本服务集里有不支持短时隙的设备时用 20 µs，§11.1.3.2）。

## 8. 与 W7a、W7b 合并（2026-11-11）

PSDU_LENGTH 改按式 (27-153)/(36-112)、(36-113)/(21-112) 计算，空口时间由 APEP_LENGTH 计算；DL MU 成员按共同的
N_SYM,init、a_init 计算 PSDU_LENGTH；TRS 征询的 TB PPDU 用 TB 前导、a = 4、Default PE Duration 16 µs（本仿真器的取值）；
2.4 GHz 先取 aRxPHYStartDelay 再换长时隙，EIFS 长时隙 364 µs。详见计划 `docs/superpowers/plans/2026-11-11-wifi-standard-alignment.md`
W6 一节的「与 W7a、W7b 合并」，测试见 `tests/engine/w6-phy-timing.test.ts` 的最后一组。
