/**
 * Tier 1 · M1 · lesson 2: who talks to whom (STA, AP, BSS, ESS, DS), and where
 * the MAC sits between LLC above and the PHY below. The demo is one AP with a
 * laptop uploading, a TV receiving video and two phones streaming to each
 * other, so every relayed MSDU visibly crosses the air twice.
 *
 * Every number quoted here is pinned in tests/course/tier1-roles-stack.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { J, N, node, oneRoom, sc, txOf, type Lesson } from '../lessonKit'

/**
 * One room, one Wi-Fi 6 AP. OFDMA and MU-MIMO are off so every frame has one
 * sender and one receiver; A-MPDU stays on so the laptop's bursts fit the air.
 */
export function rolesStackScenario(): Scenario {
  const feats = { edca: true, ampdu: true }
  return sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'he', 'idle', feats),
    node('sta-1', 'Laptop', 'sta', 2, 2, 'he', 'backup', feats),
    node('sta-2', 'TV', 'sta', 8, 2, 'he', 'video', feats),
    { ...node('sta-3', 'Phone A', 'sta', 2, 6, 'he', 'p2pvideo', feats), p2pTarget: 'sta-4' },
    { ...node('sta-4', 'Phone B', 'sta', 8, 6, 'he', 'p2pvideo', feats), p2pTarget: 'sta-3' },
  ])
}

const isPhone = (id: string): boolean => id === 'sta-3' || id === 'sta-4'

/** Jump predicates, exported for the test. */
export const firstUplinkData = txOf((r) => r.frame.kind === 'data' && r.node === 'sta-1')
export const firstDownlinkData = txOf((r) => r.frame.kind === 'data' && r.node === 'ap' && r.frame.dst === 'sta-2')
export const firstRelayHop1 = txOf((r) => r.frame.kind === 'data' && isPhone(r.node) && r.frame.dst === 'ap')
export const firstRelayHop2 = txOf((r) => r.frame.kind === 'data' && r.node === 'ap' && isPhone(r.frame.dst))

export const rolesStack: Lesson = {
  id: 'roles-stack',
  module: 0,
  title: { en: 'Roles and the stack — STA, AP, BSS and where the MAC sits', zh: '角色与协议栈——STA、AP、BSS，以及 MAC 在哪一层' },
  body: [
    { text: {
      en: 'The primer treated the link as a black box: SINR in, a decode outcome and an airtime out. This lesson names who sits at each end, whom they may talk to, and which layer makes each decision you see on the timeline.',
      zh: '上一课把链路当作黑盒：输入 SINR，输出能否解码与占用多少空口时间。这一课说清楚：链路两端是谁、可以和谁通信，以及时间轴上的每个决定由哪一层做出。',
    } },

    { heading: { en: 'Two roles of one MAC', zh: '同一个 MAC 的两种角色' }, text: {
      en: 'A station (STA) is a singly addressable instance of an 802.11 MAC and PHY interface to the wireless medium (Clause 3); anything that is not an AP is a non-AP STA, “the client”. An access point (AP) is not another kind of radio: it contains one STA and also gives its associated STAs access to the distribution services. Both run the same frame formats (Clause 9) and channel-access rules (Clause 10): the role adds responsibility — beacons, associations, forwarding — not the right to transmit.',
      zh: '站点（STA）是通往无线介质、可被单独寻址的一个 802.11 MAC 与 PHY 接口实例（第 3 章）；不是 AP 的都是非 AP STA，即“终端”。接入点（AP）不是另一种无线电：它包含一个 STA，并为关联的 STA 提供分发服务接入。两者用同样的帧格式（第 9 章）与信道接入规则（第 10 章）：角色多出来的是职责——信标、关联、转发——而不是发送的权利。',
    } },

    { kind: 'table', heading: { en: 'Architecture vocabulary (§4.3)', zh: '体系结构术语（§4.3）' }, head: [
      { en: 'Term', zh: '术语' }, { en: 'What it is, and at home', zh: '含义，以及在家里对应什么' },
    ], rows: [
      [{ en: 'BSS (basic service set)', zh: 'BSS（基本服务集）' }, { en: 'One AP and its associated STAs: the router’s 5 GHz network', zh: '一个 AP 与关联到它的 STA：路由器的 5 GHz 网络' }],
      [N('BSSID'), { en: 'A BSS’s 48-bit identifier: the AP STA’s MAC address, one per band', zh: '一个 BSS 的 48 位标识：AP 所含 STA 的 MAC 地址，每频段一个' }],
      [N('SSID'), { en: 'The network name, 0–32 octets, shared by many BSSs: “HomeWiFi”', zh: '网络名称，0–32 个八位组，可被多个 BSS 共用：“HomeWiFi”' }],
      [{ en: 'DS (distribution system)', zh: 'DS（分发系统）' }, { en: 'What interconnects BSSs behind the APs: the bridge inside the router', zh: '在 AP 背后把各 BSS 连起来的系统：路由器内部的网桥' }],
      [{ en: 'ESS (extended service set)', zh: 'ESS（扩展服务集）' }, { en: 'BSSs joined by a DS, looking to LLC like one BSS: mesh APs under one SSID', zh: '由 DS 连接的多个 BSS，在 LLC 看来如同一个：同一 SSID 下的多台 Mesh AP' }],
    ] },

    { heading: { en: 'Everything goes through the AP', zh: '一切都要经过 AP' }, text: {
      en: 'In an infrastructure BSS a non-AP STA sends every data frame to the AP, even when the destination is the STA beside it — the AP is the only peer it talks to. The AP passes the MSDU to the distribution system, which returns it to this same AP, and the AP sends it again. (An independent BSS, or IBSS, is the AP-less ad hoc case; a TDLS direct link is the negotiated exception.) The header keeps the radio receiver’s address apart from the final source and destination — fields the next lesson opens.',
      zh: '在基础结构 BSS 中，非 AP STA 的每个数据帧都发给 AP，哪怕目的地就在旁边——AP 是它唯一的通信对端。AP 把 MSDU 交给分发系统，分发系统把它送回同一台 AP，AP 再发送一次。（没有 AP 的自组网是独立 BSS，即 IBSS；经协商建立的 TDLS 直连链路是例外。）帧头把无线接收方地址与最终的源、目的地址分开存放——这些字段下一课再拆。',
    } },

    { heading: { en: 'The stack', zh: '协议栈' }, text: {
      en: 'Above sits IEEE 802.2 LLC: for IP, the MAC’s payload opens with an 8-octet LLC/SNAP header naming the protocol that follows — to 802.11, just payload. The MAC sublayer (Clauses 9–11) does channel access, framing, acknowledgement, retransmission, aggregation and management. The PHY (Clause 8; the Wi-Fi 6 HE PHY in Clause 27) wraps what it is handed into a PPDU — preamble, PHY header, payload — and modulates it; on receive it detects preambles and reports whether the channel is busy.',
      zh: '上面是 IEEE 802.2 LLC：对 IP 而言，MAC 载荷以 8 个八位组的 LLC/SNAP 头开头，指明后面是哪种协议——对 802.11 来说它只是载荷。MAC 子层（第 9–11 章）负责信道接入、成帧、确认、重传、聚合与管理。PHY（第 8 章；本课的 Wi-Fi 6 HE PHY 见第 27 章）把交下来的内容封装成 PPDU——前导码、PHY 头、载荷——并调制发出；接收时检测前导码并报告信道是否忙。',
    } },
    { kind: 'table', heading: { en: 'The MAC–PHY service boundary you can see (§8.3)', zh: '看得见的 MAC–PHY 服务边界（§8.3）' }, head: [
      { en: 'Primitive', zh: '原语' }, { en: 'Timeline record', zh: '时间轴记录' },
    ], rows: [
      [N('PHY-TXSTART.request'), { en: 'TX_START — the MAC asks the PHY to send', zh: 'TX_START——MAC 请求 PHY 发送' }],
      [N('PHY-CCA.indication'), { en: 'CCA_BUSY / CCA_IDLE — is the channel busy?', zh: 'CCA_BUSY / CCA_IDLE——信道忙不忙？' }],
      [N('PHY-RXEND.indication'), { en: 'RX_OK / RX_FAIL, after the MAC checks the FCS', zh: 'RX_OK / RX_FAIL（MAC 校验 FCS 之后）' }],
    ] },
    { text: {
      en: 'Everything else — ARRIVAL, ENQUEUE (the MAC data service, §5.2), IFS, backoff, NAV, RETRY, DROP, DEQUEUE — is a MAC decision between such primitives.',
      zh: '其余一切——ARRIVAL、ENQUEUE（MAC 数据服务，§5.2）、IFS、退避、NAV、RETRY、DROP、DEQUEUE——都是 MAC 在这些原语之间做出的决定。',
    } },

    { kind: 'table', heading: { en: 'Four names at four boundaries', zh: '四个边界上的四个名字' }, head: [
      { en: 'Unit', zh: '单元' }, { en: 'Boundary', zh: '边界' }, { en: 'Made of', zh: '组成' }, { en: 'Here', zh: '本课示例' },
    ], rows: [
      [N('MSDU'), { en: 'LLC ↔ MAC', zh: 'LLC ↔ MAC' }, { en: 'The payload the MAC must deliver', zh: 'MAC 需要交付的载荷' }, { en: '1400 octets of video', zh: '1400 个八位组的视频' }],
      [N('MPDU'), { en: 'Inside the MAC', zh: 'MAC 内部' }, { en: 'MAC header + body + FCS', zh: 'MAC 头 + 帧体 + FCS' }, N('26 + 1400 + 4 = 1430')],
      [N('PSDU'), { en: 'MAC ↔ PHY', zh: 'MAC ↔ PHY' }, { en: 'One MPDU, or an A-MPDU of several', zh: '一个 MPDU，或多个组成的 A-MPDU' }, { en: 'Here 1430; the laptop’s holds 50 MPDUs', zh: '这里是 1430；笔记本的装了 50 个 MPDU' }],
      [N('PPDU'), { en: 'On the air', zh: '空口上' }, { en: 'Preamble + PHY header + PSDU', zh: '前导码 + PHY 头 + PSDU' }, { en: '125.6 µs at HE MCS 11, 20 MHz', zh: 'HE MCS 11、20 MHz 下 125.6 µs' }],
    ] },
    { text: {
      en: 'Data frames carry MSDUs (the blue blocks); control frames — ACK, RTS, CTS, Block Ack, Trigger — help deliver them; management frames build the BSS: beacons, authentication, association. The simulator sends no management frames yet: every STA starts associated.',
      zh: '数据帧承载 MSDU（蓝色块）；控制帧——ACK、RTS、CTS、Block Ack、Trigger——协助交付；管理帧用于建立 BSS（信标、认证、关联）。仿真器暂不发送管理帧：所有 STA 一开始就已关联。',
    } },

    { heading: { en: 'The demo', zh: '本课场景' }, text: {
      en: 'An uplink traffic profile enqueues MSDUs at the STA, a downlink one at the AP. One room, one Wi-Fi 6 AP: the Laptop uploads a backup (50 × 1500-octet MSDUs every 60 ms), the TV plays downlink video (1400 octets about every 0.85 ms), and the phones stream to each other (1400 octets every 1.4–1.7 ms each way), entering at the phone and, once acknowledged, enqueued again at the AP for the other phone. OFDMA and MU-MIMO are off; forwarding is a fixed 50 µs.',
      zh: '上行流量模型在 STA 处入队，下行模型在 AP 处入队。一个房间、一台 Wi-Fi 6 AP：笔记本上传备份（每 60 ms 一批 50 个 1500 八位组的 MSDU），电视播放下行视频（约每 0.85 ms 一个 1400 八位组），两部手机互相推流（每个方向每 1.4–1.7 ms 一个 1400 八位组）。手机的 MSDU 在手机处入队发往 AP，确认后在 AP 处重新入队发往另一部手机。OFDMA 与 MU-MIMO 已关闭；转发按固定 50 µs 建模。',
    } },
    { kind: 'steps', heading: { en: 'The first relayed MSDU', zh: '第一个被中继的 MSDU' }, items: [
      { en: '1.4157 ms: it arrives at Phone B, which finds the medium idle and sends a 125.6 µs data frame to the AP.', zh: '1.4157 ms：它到达手机 B；介质空闲，手机 B 发出一个 125.6 µs、发往 AP 的数据帧。' },
      { en: '1.5413 ms: the AP decodes it and, one SIFS (16 µs) later, sends a 28 µs ACK. Hop 1 ends at 1.5853 ms — 169.6 µs.', zh: '1.5413 ms：AP 解码成功，一个 SIFS（16 µs）后发出 28 µs 的 ACK。第一跳在 1.5853 ms 结束——169.6 µs。' },
      { en: '1.6353 ms: 50 µs of forwarding later, the MSDU enters the AP’s queue for Phone A and goes out at once.', zh: '1.6353 ms：经过 50 µs 转发，该 MSDU 进入 AP 发往手机 A 的队列并立即发出。' },
      { en: '1.8049 ms: Phone A’s ACK arrives. Hop 2 also took 169.6 µs; the whole trip cost 389.2 µs.', zh: '1.8049 ms：手机 A 的 ACK 到达。第二跳同样 169.6 µs；全程 389.2 µs。' },
    ] },
    { text: {
      en: 'That MSDU met an idle channel twice; the average one is less lucky. Over the first second, phone to phone takes about 1.3 ms against about 0.7 ms for the TV’s single-hop downlink — close to double, because the relay queues, contends and pays airtime twice. Phone A could not even decode that first frame from Phone B (RX_FAIL, SINR too low for MCS 11): the AP is the one place every STA reaches.',
      zh: '那个 MSDU 两次都遇上了空闲信道，平均水平没这么幸运。第一秒里手机到手机约 1.3 ms，而电视的单跳下行约 0.7 ms——接近两倍，因为中继要排队、竞争、付空口时间都是两次。手机 A 甚至解不出手机 B 的第一帧（RX_FAIL，SINR 不足以支撑 MCS 11）：AP 才是每个 STA 都够得着的地方。',
    } },
    { text: {
      en: 'Wi-Fi 7 loosens “one STA, one link”: a multi-link device (MLD) is one MAC entity with a single service access point to LLC above several affiliated STAs, each on its own link (802.11be, Clause 35). The MLO lesson builds on that split.',
      zh: '预告一句：Wi-Fi 7 打破了“一个 STA、一条链路”。多链路设备（MLD）是一个 MAC 实体，向 LLC 只提供一个服务接入点，下面挂着各自占用一条链路的多个附属 STA（802.11be 第 35 章）；后面的 MLO 一课基于这一分工展开。',
    } },
  ],
  scenario: rolesStackScenario,
  jumps: [
    J('first uplink data frame (Laptop → AP)', '第一个上行数据帧（笔记本 → AP）', firstUplinkData),
    J('first downlink data frame (AP → TV)', '第一个下行数据帧（AP → 电视）', firstDownlinkData),
    J('first relayed frame, hop 1 (Phone B → AP)', '第一个中继帧，第一跳（手机 B → AP）', firstRelayHop1),
    J('first relayed frame, hop 2 (AP → Phone A)', '第一个中继帧，第二跳（AP → 手机 A）', firstRelayHop2),
  ],
  observe: [
    { en: 'Hover the data blocks at hop 1 and hop 2: the same MSDU id, first addressed to the AP, then sent by the AP to Phone A. No data frame here goes STA to STA.', zh: '悬停第一跳与第二跳的数据块：MSDU 编号相同，先发往 AP，再由 AP 发往手机 A。本场景没有数据帧在两个 STA 之间直接传送。' },
    { en: 'At the first uplink frame the Laptop sends an RTS before its 50-MPDU aggregate. The TV’s lane carries no data frame — only ACKs, Block Acks and the occasional CTS — a downlink-only STA transmits just to answer the AP.', zh: '第一个上行帧处，笔记本在 50 个 MPDU 的聚合帧之前先发 RTS。电视的泳道上完全没有数据帧——只有 ACK、Block Ack 和偶尔的 CTS——只收下行的 STA 发送，仅仅是为了回应 AP。' },
    { en: 'After a second, select Phone A and compare its phone-to-phone latency (about 1.3 ms) with the TV’s rx latency (about 0.7 ms): the relay costs close to double.', zh: '运行一秒后选中手机 A，把它的“手机互传”时延（约 1.3 ms）与电视的“接收时延”（约 0.7 ms）对比：中继的代价接近两倍。' },
  ],
  tryThis: [
    { en: 'Drag Phone B next to Phone A: every MSDU still goes through the AP, still about 1.3 ms. The path follows the architecture, not the distance.', zh: '把手机 B 拖到手机 A 旁边：每个 MSDU 仍经过 AP，仍约 1.3 ms。路径取决于体系结构，而不是距离。' },
    { en: 'Set the Laptop to idle: phone-to-phone falls to about 0.7 ms, still about twice the TV’s, which falls to about 0.3 ms.', zh: '把笔记本改为 idle：手机互传降到约 0.7 ms，仍约为电视的两倍——电视降到约 0.3 ms。' },
  ],
  quiz: [
    {
      q: { en: 'Phone A sends an MSDU to Phone B, both associated with the same AP. Counting successful data frames, how many times does it cross the air?', zh: '手机 A 向手机 B 发送一个 MSDU，两者关联在同一台 AP。只算成功的数据帧，它在空口上传几次？' },
      options: [
        { en: 'Once, directly — they are in the same BSS', zh: '一次，直接发送——它们在同一个 BSS' },
        { en: 'Twice: Phone A → AP, then AP → Phone B', zh: '两次：手机 A → AP，再 AP → 手机 B' },
        { en: 'Three times: Phone A → AP → distribution system → Phone B', zh: '三次：手机 A → AP → 分发系统 → 手机 B' },
      ],
      answer: 1,
      explain: { en: 'The AP passes the MSDU to the distribution system, which returns it to the same AP: the DS is not a radio hop, so there are two frames on the air, each with its own ACK.', zh: 'AP 把 MSDU 交给分发系统，分发系统再交回同一台 AP。DS 不是一跳无线传输，所以空口上是两帧，各带一个 ACK。' },
    },
    {
      q: { en: 'The Laptop sends one aggregate carrying 50 MSDUs: how many MPDUs, PSDUs and PPDUs?', zh: '笔记本发出一个承载 50 个 MSDU 的聚合帧：这是多少个 MPDU、PSDU、PPDU？' },
      options: [
        { en: '50, 50, 50', zh: '50、50、50' },
        { en: '1, 1, 1', zh: '1、1、1' },
        { en: '50 MPDUs, 1 PSDU, 1 PPDU', zh: '50 个 MPDU、1 个 PSDU、1 个 PPDU' },
      ],
      answer: 2,
      explain: { en: 'Each MSDU gets its own MAC header and FCS: 50 MPDUs. An A-MPDU packs them into one PSDU, sent behind one preamble as one PPDU.', zh: '每个 MSDU 都有自己的 MAC 头和 FCS：50 个 MPDU。A-MPDU 把它们装进一个 PSDU，在一个前导码之后作为一个 PPDU 发出。' },
    },
    {
      q: { en: 'What makes an AP different from a non-AP STA?', zh: 'AP 与非 AP STA 的区别是什么？' },
      options: [
        { en: 'It contains a STA and gives associated STAs access to the distribution system', zh: '它包含一个 STA，并为关联的 STA 提供分发系统接入' },
        { en: 'Its MAC may transmit without contending', zh: '它的 MAC 可以不经竞争就发送' },
        { en: 'It has no MAC address, only an SSID', zh: '它没有 MAC 地址，只有 SSID' },
      ],
      answer: 0,
      explain: { en: 'That is the definition (Clause 3, §4.3), and its STA’s MAC address is the BSSID. It contends like everyone else — which is why each relay hop waits its turn.', zh: '这正是定义（第 3 章、§4.3），其 STA 的 MAC 地址就是 BSSID。它和所有人一样竞争——这也是中继每一跳都要排队的原因。' },
    },
  ],
}
