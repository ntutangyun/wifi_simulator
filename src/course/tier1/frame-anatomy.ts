/**
 * Tier 1 · M1 · lesson 3: frame anatomy. What one PPDU carries, field by field:
 * the PHY preamble and header, the MAC header (Frame Control bits, Duration,
 * the four address roles, Sequence Control, QoS Control), the FCS, the tiny
 * control frames and the A-MPDU subframe. Every number quoted here is pinned in
 * tests/course/tier1-frame-anatomy.test.ts by decoding this scenario's frames.
 */
import type { TLRecord } from '../../model/records'
import { N, J, node, oneRoom, sc, txOf, type Lesson } from '../lessonKit'

/**
 * A router and three very different clients in one room, so the first 21 ms
 * hold one of every frame the lesson dissects: an 802.11a laptop uploading
 * plain Data frames, a Wi-Fi 6 phone on a voice call (EDCA only, so single QoS
 * Data frames in both directions) and a Wi-Fi 5 laptop whose cloud backup goes
 * out in RTS-protected A-MPDUs answered by BlockAcks. Seed 29 keeps each first
 * frame clear of collisions, so the first A-MPDU is a first transmission.
 */
export function frameAnatomyScenario() {
  return sc(oneRoom(), [
    node('ap', 'Router', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Old laptop', 'sta', 3, 3, 'nonht', 'saturated'),
    node('sta-2', 'Phone', 'sta', 7, 5, 'he', 'voice', { edca: true }),
    node('sta-3', 'Laptop', 'sta', 6.5, 2.5, 'vht', 'backup'),
  ], { rtsThresholdBytes: 2000, seed: 29 })
}

export const firstLegacyData = txOf((r) => r.frame.kind === 'data' && r.frame.src === 'sta-1')
export const firstQosSingle = txOf((r) => r.frame.kind === 'data' && !r.frame.ampdu && r.frame.src !== 'sta-1')
export const firstRtsFrame = txOf((r) => r.frame.kind === 'rts')
export const firstAmpduFrame = txOf((r) => r.frame.ampdu !== undefined)
export const firstBlockAck = txOf((r) => r.frame.kind === 'ba')
export const firstLegacyRetry = (r: TLRecord): boolean =>
  r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.src === 'sta-1' && r.frame.retryFlag === true

export const frameAnatomy: Lesson = {
  id: 'frame-anatomy',
  module: 0,
  title: { en: 'Frame anatomy — what is actually on the air', zh: '帧的解剖——空中到底传了什么' },
  body: [
    { text: {
      en: 'Every block on the timeline is one PPDU, and every PPDU is a set of nested wrappers. The layer above hands the MAC an MSDU (here a 1500 B packet). The MAC wraps it into an MPDU: MAC header + frame body + FCS. The PHY carries that MPDU, or an aggregate of several, as its PSDU, and puts a preamble and a PHY header in front. Click any frame on the timeline and open “Fields on the air” to see this decode for real (IEEE 802.11-2024 §9.2–9.3).',
      zh: '时间轴上的每一个块都是一个 PPDU，而每个 PPDU 都是层层包裹的结构。上层交给 MAC 的是 MSDU（这里是一个 1500 B 的数据包）。MAC 把它封装成 MPDU：MAC 头 + 帧体 + 帧校验序列（FCS）。物理层把这个 MPDU（或由多个 MPDU 聚合而成的整体）作为 PSDU 承载，并在前面加上前导码和 PHY 头。在时间轴上点击任意一帧，展开“空中字段”，就能看到真实的逐字段解码（IEEE 802.11-2024 §9.2–9.3）。',
    } },
    { kind: 'formula', text: {
      en: 'PPDU = preamble + PHY header + PSDU      MPDU = MAC header + frame body + FCS',
      zh: 'PPDU = 前导码 + PHY 头 + PSDU      MPDU = MAC 头 + 帧体 + FCS',
    } },
    { kind: 'table', heading: { en: 'The PPDU: what the PHY puts in front', zh: 'PPDU：物理层在前面加了什么' }, head: [
      { en: 'Format', zh: '格式' }, { en: 'Preamble + PHY header', zh: '前导码 + PHY 头' }, { en: 'One data symbol', zh: '一个数据符号' },
    ], rows: [
      [{ en: 'Non-HT (802.11a, clause 17)', zh: '非 HT（802.11a，第 17 章）' }, { en: '20 µs = L-STF + L-LTF 16 µs + SIGNAL 4 µs', zh: '20 µs = L-STF + L-LTF 16 µs + SIGNAL 4 µs' }, N('4 µs')],
      [{ en: 'VHT (Wi-Fi 5)', zh: 'VHT（Wi-Fi 5）' }, N('40 µs'), N('4 µs')],
      [{ en: 'HE (Wi-Fi 6)', zh: 'HE（Wi-Fi 6）' }, { en: '44 µs (+4 µs HE-SIG-B in an MU PPDU)', zh: '44 µs（MU PPDU 另加 4 µs HE-SIG-B）' }, N('13.6 µs')],
      [{ en: 'EHT (Wi-Fi 7)', zh: 'EHT（Wi-Fi 7）' }, { en: '48 µs (+4 µs EHT-SIG in an MU PPDU)', zh: '48 µs（MU PPDU 另加 4 µs EHT-SIG）' }, N('13.6 µs')],
    ] },
    { text: {
      en: 'The non-HT numbers are the standard’s own. The newer rows are the simulator’s representative single-user values for 20 MHz and one stream: the real VHT/HE/EHT preamble grows with the number of streams and users. SIGNAL tells the receiver the rate and the length; the data symbols then carry a 16-bit SERVICE field, the PSDU, 6 tail bits and padding up to a whole symbol.',
      zh: '非 HT 那一行是标准本身的数值。更新的几行是仿真器采用的代表性单用户数值（20 MHz、单流）：真实的 VHT/HE/EHT 前导码会随空间流数和用户数变长。SIGNAL 字段告诉接收方速率和长度；随后的数据符号承载 16 比特的 SERVICE 字段、PSDU、6 个尾比特，以及补齐到整符号的填充。',
    } },
    { kind: 'formula', text: {
      en: 'TXTIME (non-HT) = 16 + 4 + 4 × ⌈(16 + 8 × LENGTH + 6) ÷ N_DBPS⌉ µs',
      zh: 'TXTIME（非 HT）= 16 + 4 + 4 × ⌈(16 + 8 × LENGTH + 6) ÷ N_DBPS⌉ µs',
    }, note: {
      en: '§17.4.3. N_DBPS, the data bits per symbol, is 216 at 54 Mb/s and 96 at 24 Mb/s.',
      zh: '§17.4.3。N_DBPS 是每个符号的数据比特数：54 Mb/s 时为 216，24 Mb/s 时为 96。',
    } },
    { kind: 'table', heading: { en: 'Frame Control (2 B), bit by bit — §9.2.4.1', zh: '帧控制字段（2 B）逐位拆解——§9.2.4.1' }, head: [
      { en: 'Bits', zh: '比特' }, { en: 'Subfield', zh: '子字段' }, { en: 'What it says', zh: '含义' },
    ], rows: [
      [N('B0–B1'), { en: 'Protocol Version', zh: '协议版本' }, { en: 'Always 0.', zh: '恒为 0。' }],
      [N('B2–B3'), { en: 'Type', zh: '类型' }, { en: '00 management, 01 control, 10 data, 11 extension.', zh: '00 管理帧，01 控制帧，10 数据帧，11 扩展帧。' }],
      [N('B4–B7'), { en: 'Subtype', zh: '子类型' }, { en: 'Data 0000, QoS Data 1000; RTS 1011, CTS 1100, Ack 1101, Block Ack 1001.', zh: 'Data 0000，QoS Data 1000；RTS 1011，CTS 1100，Ack 1101，Block Ack 1001。' }],
      [N('B8'), N('To DS'), { en: '1: the frame is going into the distribution system (towards the AP).', zh: '1：帧正进入分布式系统（发往 AP）。' }],
      [N('B9'), N('From DS'), { en: '1: the frame is coming out of it (sent by the AP).', zh: '1：帧来自分布式系统（由 AP 发出）。' }],
      [N('B10'), { en: 'More Fragments', zh: '更多分片' }, { en: 'Another fragment of this MSDU follows.', zh: '后面还有本 MSDU 的分片。' }],
      [N('B11'), { en: 'Retry', zh: '重传' }, { en: '1 on a retransmission, so the receiver can drop a duplicate.', zh: '重传时置 1，接收方据此丢弃重复帧。' }],
      [N('B12'), { en: 'Power Management', zh: '电源管理' }, { en: 'The sender will doze after this exchange.', zh: '发送方在本次交换后将进入休眠。' }],
      [N('B13'), { en: 'More Data', zh: '更多数据' }, { en: 'The AP holds more buffered frames for a dozing station.', zh: 'AP 还为休眠终端缓存着更多帧。' }],
      [N('B14'), { en: 'Protected Frame', zh: '受保护帧' }, { en: 'The body is encrypted.', zh: '帧体已加密。' }],
      [N('B15'), N('+HTC / Order'), { en: 'A 4 B HT Control field follows the header.', zh: '头后跟着 4 B 的 HT 控制字段。' }],
    ] },
    { kind: 'list', heading: { en: 'The rest of the MAC header — §9.2.4.2–9.2.4.7', zh: 'MAC 头的其余部分——§9.2.4.2–9.2.4.7' }, items: [
      { en: 'Duration/ID (2 B): how many µs the exchange still needs after this frame ends. Every station that decodes the frame but is not its receiver sets its NAV from it. A data frame that expects an ACK carries SIFS + ACK = 16 + 28 = 44 µs.', zh: '持续时间/ID（2 B）：本帧结束后这次帧交换还需要多少微秒。凡是解出此帧、但不是接收方的站点，都据此设置自己的 NAV。一个等待 ACK 的数据帧写的是 SIFS + ACK = 16 + 28 = 44 µs。' },
      { en: 'Address 1–3 (6 B each): which radio receives, which sends, and the endpoints behind them. Address 4 appears only when To DS and From DS are both 1.', zh: '地址 1–3（各 6 B）：谁接收、谁发送，以及它们背后的端点。只有 To DS 与 From DS 同时为 1 时才出现地址 4。' },
      { en: 'Sequence Control (2 B): a 12-bit sequence number (0–4095) and a 4-bit fragment number. A retransmission keeps its number, which is how duplicates are recognised.', zh: '序列控制（2 B）：12 比特序列号（0–4095）加 4 比特分片号。重传帧沿用原序列号，重复帧正是靠它识别的。' },
      { en: 'QoS Control (2 B, QoS Data only): the TID (4 bits), the ack policy (2 bits) and a few more bits.', zh: 'QoS 控制（2 B，仅 QoS Data 帧有）：TID（4 比特）、确认策略（2 比特）以及其他几个比特。' },
      { en: 'Frame body: the MSDU itself. FCS (4 B): a CRC-32 over header and body. A receiver whose CRC does not match discards the frame silently — no ACK — so the sender retries.', zh: '帧体：MSDU 本身。帧校验序列 FCS（4 B）：对头和帧体计算的 CRC-32。CRC 不匹配时接收方悄悄丢弃该帧——不回 ACK——于是发送方重传。' },
    ] },
    { kind: 'table', heading: { en: 'Address roles per To DS / From DS', zh: '按 To DS / From DS 划分的地址角色' }, head: [
      N('To DS · From DS'), { en: 'Address 1', zh: '地址 1' }, { en: 'Address 2', zh: '地址 2' }, { en: 'Address 3', zh: '地址 3' }, { en: 'Address 4', zh: '地址 4' }, { en: 'Used for', zh: '用途' },
    ], rows: [
      [N('0 · 0'), N('RA = DA'), N('TA = SA'), N('BSSID'), N('—'), { en: 'Management frames; data sent directly between stations', zh: '管理帧；终端之间直接收发的数据' }],
      [N('1 · 0'), N('RA = BSSID'), N('TA = SA'), N('DA'), N('—'), { en: 'Uplink: station → AP', zh: '上行：终端 → AP' }],
      [N('0 · 1'), N('RA = DA'), N('TA = BSSID'), N('SA'), N('—'), { en: 'Downlink: AP → station', zh: '下行：AP → 终端' }],
      [N('1 · 1'), N('RA'), N('TA'), N('DA'), N('SA'), { en: 'Mesh and wireless distribution systems', zh: 'Mesh 与无线分布式系统' }],
    ] },
    { text: {
      en: 'RA is the radio that must decode and acknowledge the frame; TA is the radio that sent it. DA and SA are the endpoints of the packet; BSSID is the AP’s MAC address. This lesson has no servers, so the stations’ packets end at the router and an uplink frame names the router as DA in Address 3; with a real destination on the wired side, Address 3 would hold that MAC address instead.',
      zh: 'RA 是必须解出并确认此帧的无线电；TA 是发出此帧的无线电。DA 和 SA 是数据包的两个端点；BSSID 是 AP 的 MAC 地址。本课没有配置服务器，终端的数据包就终止在路由器，因此上行帧的地址 3 把路由器写作 DA；如果目的地在有线侧，地址 3 填的就会是那个 MAC 地址。',
    } },
    { kind: 'table', heading: { en: 'TID and access category — Table 10-1', zh: 'TID 与接入类别——表 10-1' }, head: [
      { en: 'Access category', zh: '接入类别' }, { en: 'User priorities', zh: '用户优先级' }, { en: 'TID this simulator writes', zh: '本仿真器写入的 TID' },
    ], rows: [
      [{ en: 'AC_BK background', zh: 'AC_BK 背景' }, N('1, 2'), N('1')],
      [{ en: 'AC_BE best effort', zh: 'AC_BE 尽力而为' }, N('0, 3'), N('0')],
      [{ en: 'AC_VI video', zh: 'AC_VI 视频' }, N('4, 5'), N('5')],
      [{ en: 'AC_VO voice', zh: 'AC_VO 语音' }, N('6, 7'), N('6')],
    ] },
    { text: {
      en: 'TID numbers are not a priority order: background is TID 1, best effort TID 0. The ack policy 00 means Normal Ack on a lone frame; inside an A-MPDU the same two bits mean Implicit Block Ack Request, and the receiver answers the whole aggregate with one BlockAck.',
      zh: 'TID 的数值并不代表优先级高低：背景流量是 TID 1，尽力而为是 TID 0。确认策略 00 用在单个帧上表示 Normal Ack（普通确认）；在 A-MPDU 里同样的两个比特表示 Implicit Block Ack Request（隐式块确认请求），接收方用一个 BlockAck 回复整个聚合帧。',
    } },
    { kind: 'formula', heading: { en: 'Bytes you can check on the timeline', zh: '可以在时间轴上核对的字节数' }, text: {
      en: '1500 B MSDU → 24 + 1500 + 4 = 1528 B (Data)  ·  26 + 1500 + 4 = 1530 B (QoS Data)',
      zh: '1500 B 的 MSDU → 24 + 1500 + 4 = 1528 B（Data）  ·  26 + 1500 + 4 = 1530 B（QoS Data）',
    }, note: {
      en: 'At 54 Mb/s both fill 57 symbols: 20 + 57 × 4 = 248 µs — the two QoS octets cost no extra symbol here. The ACK’s 14 B at 24 Mb/s fill 2 symbols: 20 + 2 × 4 = 28 µs.',
      zh: '在 54 Mb/s 下两者都占 57 个符号：20 + 57 × 4 = 248 µs——多出的两个 QoS 字节在这里没有多占符号。ACK 的 14 B 在 24 Mb/s 下占 2 个符号：20 + 2 × 4 = 28 µs。',
    } },
    { kind: 'table', heading: { en: 'Control frames carry only what they need — §9.3.1', zh: '控制帧只带必需的字段——§9.3.1' }, head: [
      { en: 'Frame', zh: '帧' }, { en: 'Fields', zh: '字段' }, { en: 'Size', zh: '大小' },
    ], rows: [
      [N('Ack / CTS'), { en: 'Frame Control, Duration, RA, FCS', zh: '帧控制、持续时间、RA、FCS' }, N('14 B')],
      [N('RTS'), { en: 'Frame Control, Duration, RA, TA, FCS', zh: '帧控制、持续时间、RA、TA、FCS' }, N('20 B')],
      [{ en: 'BlockAck (compressed)', zh: 'BlockAck（压缩型）' }, { en: 'Frame Control, Duration, RA, TA, BA Control (2 B), starting sequence number (2 B) + 64-bit bitmap (8 B), FCS', zh: '帧控制、持续时间、RA、TA、BA 控制（2 B）、起始序列号（2 B）+ 64 比特位图（8 B）、FCS' }, N('32 B')],
    ] },
    { text: {
      en: 'An ACK needs no TA: it goes out one SIFS after the frame it answers, and only that frame’s sender is waiting for it. An RTS does carry a TA, because the CTS must be addressed back to it. Management frames — beacons, probes, authentication, association (type 00) — carry the full 24 B header plus information elements. The simulator does not send them yet; they get their own module on the link lifecycle.',
      zh: 'ACK 不需要 TA：它在被确认的帧结束后一个 SIFS 发出，而只有那一帧的发送方在等它。RTS 却要带 TA，因为 CTS 必须回给它。管理帧——信标、探测、认证、关联（类型 00）——带有完整的 24 B 头加上信息元素。仿真器目前还不发送管理帧，后面讲链路生命周期的模块会专门讲它们。',
    } },
    { kind: 'formula', heading: { en: 'A preview of aggregation', zh: '聚合预告' }, text: {
      en: 'A-MPDU subframe = delimiter (4 B) + MPDU + padding to a 4-octet boundary (none after the last)',
      zh: 'A-MPDU 子帧 = 分隔符（4 B）+ MPDU + 补齐到 4 字节边界的填充（最后一个子帧不填充）',
    }, note: {
      en: 'The Wi-Fi 5 laptop’s 1530 B MPDUs get 2 B of padding: 14 subframes = 13 × 1536 + 1534 = 21 502 B. Why aggregation pays is the subject of the A-MPDU lesson.',
      zh: 'Wi-Fi 5 笔记本的 1530 B MPDU 各补 2 B：14 个子帧 = 13 × 1536 + 1534 = 21 502 B。聚合为什么划算，留到 A-MPDU 那一课再讲。',
    } },
    { kind: 'list', heading: { en: 'In the simulation', zh: '在仿真里看' }, items: [
      { en: 'Router (Wi-Fi 7). Old laptop (802.11a): uploads 1500 B packets non-stop, as plain Data frames.', zh: '路由器（Wi-Fi 7）。旧笔记本（802.11a）：不停上传 1500 B 的数据包，用的是普通 Data 帧。' },
      { en: 'Phone (Wi-Fi 6, EDCA on, no aggregation): a voice call, 200 B each way in single QoS Data frames.', zh: '手机（Wi-Fi 6，开启 EDCA，不聚合）：语音通话，双向各 200 B，用单个 QoS Data 帧发送。' },
      { en: 'Laptop (Wi-Fi 5): a cloud backup sent as A-MPDUs. The RTS threshold is 2000 B, so every aggregate is opened by RTS/CTS while the old laptop’s 1528 B frames are not.', zh: '笔记本（Wi-Fi 5）：云备份，以 A-MPDU 发送。RTS 门限为 2000 B，因此每个聚合帧前都有 RTS/CTS，而旧笔记本 1528 B 的帧则没有。' },
    ] },
  ],
  scenario: frameAnatomyScenario,
  jumps: [
    J('first legacy data frame', '第一个传统数据帧', firstLegacyData),
    J('first QoS data frame', '第一个 QoS 数据帧', firstQosSingle),
    J('first RTS', '第一个 RTS', firstRtsFrame),
    J('first A-MPDU', '第一个 A-MPDU', firstAmpduFrame),
    J('first BlockAck', '第一个 BlockAck', firstBlockAck),
    J('first retransmission (Retry = 1)', '第一次重传（Retry = 1）', firstLegacyRetry),
  ],
  observe: [
    {
      en: 'Jump to the first legacy data frame (0 µs) and the first QoS data frame (20.452 ms), click each and open “Fields on the air”. The old laptop’s frame is Data (0000), 1528 B, To DS 1 and From DS 0, Address 1 the Router as RA = BSSID, Address 2 the Old laptop as TA = SA. The phone’s is QoS Data (1000), 230 B = 26 + 200 + 4, TID 6, Duration 44 µs. Two frames later the router answers: From DS 1, Address 1 the Phone as RA = DA, Address 2 the Router as TA = BSSID.',
      zh: '跳到第一个传统数据帧（0 µs）和第一个 QoS 数据帧（20.452 ms），分别点击并展开“空中字段”。旧笔记本的帧是 Data（0000），1528 B，To DS 1、From DS 0，地址 1 是路由器（RA = BSSID），地址 2 是旧笔记本（TA = SA）。手机的帧是 QoS Data（1000），230 B = 26 + 200 + 4，TID 6，持续时间 44 µs。再往后两帧是路由器的回复：From DS 1，地址 1 是手机（RA = DA），地址 2 是路由器（TA = BSSID）。',
    },
    {
      en: 'Jump to the first RTS (2.298 ms): 20 B, Duration 2356 µs = CTS 28 + A-MPDU 2248 + BlockAck 32 + three SIFS 48. The CTS carries 2312 µs, the same reservation minus the SIFS and its own 28 µs. The first A-MPDU holds 14 subframes (21 502 B): TID 1, ack policy Implicit BAR, Duration 48 µs = SIFS + the 32 µs BlockAck. The first BlockAck (4.650 ms) carries Duration 0: nothing follows it.',
      zh: '跳到第一个 RTS（2.298 ms）：20 B，持续时间 2356 µs = CTS 28 + A-MPDU 2248 + BlockAck 32 + 三个 SIFS 共 48。CTS 写的是 2312 µs，即同一预约减去一个 SIFS 和它自己的 28 µs。第一个 A-MPDU 含 14 个子帧（21 502 B）：TID 1，确认策略 Implicit BAR，持续时间 48 µs = SIFS + 32 µs 的 BlockAck。第一个 BlockAck（4.650 ms）的持续时间为 0：它之后没有后续帧。',
    },
    {
      en: 'Jump to the first retransmission (12.013 ms): the old laptop’s frame collided and went again with Retry = 1 and the same sequence number, 11. Compare the PPDU bars: its preamble is 16 µs of L-STF + L-LTF and 4 µs of SIGNAL before 57 symbols; the phone’s Wi-Fi 6 frame is a 44 µs preamble and a single 13.6 µs symbol.',
      zh: '跳到第一次重传（12.013 ms）：旧笔记本的帧发生碰撞，于是以 Retry = 1、相同的序列号 11 再发一次。对比 PPDU 条：它的前导是 16 µs 的 L-STF + L-LTF 加 4 µs 的 SIGNAL，之后是 57 个符号；手机的 Wi-Fi 6 帧则是 44 µs 前导加一个 13.6 µs 的符号。',
    },
  ],
  tryThis: [
    {
      en: 'Open the scenario in the editor and turn EDCA off on the phone: its frames become plain Data, 228 B, with no QoS Control field and no TID.',
      zh: '在编辑器中打开本场景，关闭手机的 EDCA：它的帧变成普通 Data 帧，228 B，没有 QoS 控制字段，也就没有 TID。',
    },
    {
      en: 'Change the old laptop to Wi-Fi 5: its uploads turn into QoS Data A-MPDUs with TID 0 (best effort), each opened by an RTS.',
      zh: '把旧笔记本改成 Wi-Fi 5：它的上传变成 TID 0（尽力而为）的 QoS Data A-MPDU，每个前面都有 RTS。',
    },
  ],
  quiz: [
    {
      q: { en: 'A station sends a data frame to its AP. Which address is the RA?', zh: '终端向它的 AP 发送一个数据帧。哪个地址是 RA？' },
      options: [
        { en: 'Address 1, the AP (RA = BSSID)', zh: '地址 1，即 AP（RA = BSSID）' },
        { en: 'Address 2, the station itself', zh: '地址 2，即终端自己' },
        { en: 'Address 3, the final destination', zh: '地址 3，即最终目的地' },
      ],
      answer: 0,
      explain: {
        en: 'Uplink means To DS 1, From DS 0: Address 1 is always the receiving radio, here the AP, which is also the BSSID. The station is the TA = SA in Address 2 and the destination DA sits in Address 3.',
        zh: '上行即 To DS 1、From DS 0：地址 1 永远是接收的无线电，这里就是 AP，它同时也是 BSSID。终端是地址 2 的 TA = SA，目的地 DA 在地址 3。',
      },
    },
    {
      q: { en: 'Why can an ACK leave out the transmitter address?', zh: '为什么 ACK 可以省略发送方地址？' },
      options: [
        { en: 'The FCS already identifies the sender', zh: 'FCS 已经标识了发送方' },
        { en: 'It is sent one SIFS after the frame it acknowledges, and only that frame’s sender is waiting for it', zh: '它在被确认的帧结束后一个 SIFS 发出，而只有那一帧的发送方在等它' },
        { en: 'ACKs are broadcast to everyone', zh: 'ACK 是广播给所有人的' },
      ],
      answer: 1,
      explain: {
        en: 'The exchange itself gives the context: the ACK’s RA is the TA of the frame just received, and no other station expects an ACK at that instant. That is why it fits in 14 B and 28 µs at 24 Mb/s.',
        zh: '帧交换本身就提供了上下文：ACK 的 RA 就是刚收到那一帧的 TA，而此刻没有别的站点在等 ACK。所以它只要 14 B，在 24 Mb/s 下只占 28 µs。',
      },
    },
    {
      q: { en: 'A lone data frame that expects an ACK carries Duration = 44 µs. What does that cover?', zh: '一个等待 ACK 的单独数据帧写着持续时间 = 44 µs。它覆盖的是什么？' },
      options: [
        { en: 'The data frame’s own airtime', zh: '数据帧本身的空口时间' },
        { en: 'The backoff the sender drew', zh: '发送方抽取的退避时间' },
        { en: 'What remains after the frame ends: SIFS 16 µs + ACK 28 µs', zh: '帧结束后剩下的部分：SIFS 16 µs + ACK 28 µs' },
      ],
      answer: 2,
      explain: {
        en: 'Duration counts from the end of the frame that carries it. Bystanders already know the frame is on the air; what they must not trample is the ACK that follows, so they set their NAV for SIFS + ACK.',
        zh: '持续时间从携带它的帧结束时开始计算。旁听者已经知道这一帧正在空中；它们不能踩到的是随后的 ACK，所以按 SIFS + ACK 设置 NAV。',
      },
    },
  ],
}
