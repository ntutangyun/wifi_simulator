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
