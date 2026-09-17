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
  minutes: 35,
  title: { en: 'Roles and the stack — STA, AP, BSS and where the MAC sits', zh: '角色与协议栈——STA、AP、BSS，以及 MAC 在哪一层' },
  body: [
    { text: {
      en: 'The radio primer treated the link as a black box: SINR goes in, a decode outcome and an airtime come out. This lesson names who is on each end of that link, whom they are allowed to talk to, and which layer of the protocol stack makes each decision you will see on the timeline. Every later lesson assumes this vocabulary.',
      zh: '上一课的射频入门把链路当成一个黑盒：输入 SINR，输出“能否解码”和“占用多少空口时间”。这一课要说清楚：链路两端分别是谁，它们可以和谁通信，以及你在时间轴上看到的每一个决定，是协议栈中哪一层做出的。之后的每一课都默认你已掌握这套术语。',
    } },

    { heading: { en: 'Station and access point: two roles of one MAC', zh: '站点与接入点：同一个 MAC 的两种角色' }, text: {
      en: 'IEEE 802.11-2024 (Clause 3) defines a station (STA) as a singly addressable instance of an 802.11 MAC and PHY interface to the wireless medium. Your phone contains one; so does your router. An access point (AP) is not a different kind of radio: it is an entity that contains one STA and, in addition, gives the STAs associated with it access to the distribution services. A STA that is not an AP is called a non-AP STA — in everyday speech, “the client”.',
      zh: 'IEEE 802.11-2024（第 3 章）把站点（STA）定义为：通往无线介质的、可被单独寻址的一个 802.11 MAC 与 PHY 接口实例。手机里有一个，路由器里也有一个。接入点（AP）并不是另一种无线电：它是一个包含一个 STA 的实体，并额外为与它关联的 STA 提供分发服务的接入。不是 AP 的 STA 叫非 AP STA——也就是日常说的“终端”或“客户端”。',
    } },
    { text: {
      en: 'Both roles run the same MAC: the same frame formats (Clause 9), the same channel-access rules (Clause 10) and the same retransmission logic. When the AP sends downlink video it contends for the medium exactly as a phone does. What the role changes is responsibility — the AP starts the BSS, sends beacons, accepts associations and forwards traffic — not the right to transmit.',
      zh: '两种角色运行的是同一个 MAC：同样的帧格式（第 9 章）、同样的信道接入规则（第 10 章）、同样的重传逻辑。AP 发送下行视频时，和手机一样要竞争介质。角色改变的是职责——AP 负责建立 BSS、发送信标、接受关联、转发流量——而不是发送的权利。',
    } },

    { kind: 'table', heading: { en: 'The architecture vocabulary (§4.3)', zh: '体系结构术语（§4.3）' }, head: [
      { en: 'Term', zh: '术语' }, { en: 'What it is', zh: '含义' }, { en: 'In a home', zh: '在家里对应什么' },
    ], rows: [
      [{ en: 'BSS — basic service set', zh: 'BSS——基本服务集' }, { en: 'One AP and the STAs associated with it: the basic building block', zh: '一个 AP 加上与之关联的 STA：最基本的组成单元' }, { en: 'Your router’s 5 GHz network and every device joined to it', zh: '路由器的 5 GHz 网络及接入它的所有设备' }],
      [{ en: 'BSSID', zh: 'BSSID' }, { en: 'The 48-bit identifier of one BSS; in an infrastructure BSS, the MAC address of the AP’s STA', zh: '一个 BSS 的 48 位标识；在基础结构 BSS 中就是 AP 所含 STA 的 MAC 地址' }, { en: 'Differs per band and per AP', zh: '每个频段、每台 AP 各不相同' }],
      [{ en: 'SSID', zh: 'SSID' }, { en: 'The network name, 0–32 octets; many BSSs may share it', zh: '网络名称，0–32 个八位组；多个 BSS 可以共用' }, { en: '“HomeWiFi” on 2.4, 5 and 6 GHz', zh: '2.4、5、6 GHz 上同名的“HomeWiFi”' }],
      [{ en: 'DS — distribution system', zh: 'DS——分发系统' }, { en: 'Whatever interconnects BSSs (and wired LANs) behind the APs', zh: '在 AP 背后把多个 BSS（以及有线局域网）连起来的系统' }, { en: 'The Ethernet bridge inside the router, or the cable to a mesh node', zh: '路由器内部的以太网桥，或连到 Mesh 节点的网线' }],
      [{ en: 'ESS — extended service set', zh: 'ESS——扩展服务集' }, { en: 'BSSs joined by a DS that look like one BSS to the LLC layer of every STA', zh: '由 DS 连接起来、在每个 STA 的 LLC 层看来如同一个 BSS 的若干 BSS' }, { en: 'Several mesh APs with one SSID: you roam without changing IP address', zh: '同一 SSID 的多台 Mesh AP：漫游时 IP 地址不变' }],
      [{ en: 'IBSS — independent BSS', zh: 'IBSS——独立 BSS' }, { en: 'STAs talking directly, with no AP and no DS (ad hoc)', zh: '没有 AP、也没有 DS，STA 之间直接通信（自组网）' }, { en: 'Rare today; this course uses infrastructure BSSs', zh: '如今很少见；本课程只用基础结构 BSS' }],
    ] },

    { heading: { en: 'Everything goes through the AP', zh: '一切都要经过 AP' }, text: {
      en: 'In an infrastructure BSS a non-AP STA sends every data frame to the AP — even when the final destination is another STA in the same room. The AP hands the MSDU to the distribution system, the DS finds that the destination is associated with this very AP, and the AP transmits it again, towards that STA. The frame header records the direction in its To DS and From DS bits and carries the final addresses separately from the radio receiver’s address; the frame-anatomy lesson opens those fields. (802.11 does define direct STA-to-STA links, TDLS, but they need a setup handshake and the simulator does not model them.)',
      zh: '在基础结构 BSS 里，非 AP STA 的每个数据帧都发给 AP——哪怕最终目的地就是同一个房间里的另一个 STA。AP 把 MSDU 交给分发系统，DS 发现目的 STA 正关联在这台 AP 上，于是 AP 再把它发送一次，发往那个 STA。帧头用 To DS 与 From DS 两个比特记录方向，并把最终地址与无线接收方地址分开携带；下一课“帧结构”会逐个字段拆开。（802.11 也定义了 STA 之间的直连链路 TDLS，但它需要建立握手，仿真器暂不建模。）',
    } },

    { heading: { en: 'The stack: LLC above, the MAC, the PHY below', zh: '协议栈：上面是 LLC，中间是 MAC，下面是 PHY' }, kind: 'list', items: [
      { en: 'Above: IEEE 802.2 logical link control (LLC). For IP traffic the MAC’s payload begins with an 8-octet LLC/SNAP header (AA-AA-03, a 3-octet OUI, then the EtherType) that tells the receiver which protocol follows. To 802.11 it is just payload.', zh: '上面：IEEE 802.2 逻辑链路控制（LLC）。对 IP 流量而言，MAC 载荷以 8 个八位组的 LLC/SNAP 头开头（AA-AA-03、3 个八位组的 OUI，再加 EtherType），告诉接收方后面跟的是哪种协议。对 802.11 来说，这只是载荷。' },
      { en: 'The MAC sublayer (Clauses 9–11): channel access (DCF and EDCA), framing, acknowledgement, retransmission, aggregation, and management — joining a BSS, security, power save. It decides when to transmit, what, and to whom.', zh: 'MAC 子层（第 9–11 章）：信道接入（DCF 与 EDCA）、成帧、确认、重传、聚合，以及管理——加入 BSS、安全、节能。它决定何时发送、发送什么、发给谁。' },
      { en: 'The PHY (Clause 8 for its service interface; Clause 27 for the Wi-Fi 6 HE PHY used here): wraps what the MAC hands down into a PPDU — a preamble, a PHY header, the payload — and modulates it onto the channel; on receive, it detects preambles, reports whether the channel is busy, and demodulates.', zh: 'PHY（服务接口见第 8 章；本课所用 Wi-Fi 6 HE PHY 见第 27 章）：把 MAC 交下来的内容封装成 PPDU——前导码、PHY 头、载荷——并调制到信道上；接收时检测前导码、报告信道是否忙、完成解调。' },
    ] },

    { kind: 'table', heading: { en: 'The MAC–PHY service boundary on the timeline (§8.3)', zh: '时间轴上的 MAC–PHY 服务边界（§8.3）' }, head: [
      { en: 'Service primitive', zh: '服务原语' }, { en: 'Direction', zh: '方向' }, { en: 'Timeline record', zh: '时间轴记录' },
    ], rows: [
      [N('PHY-TXSTART.request'), N('MAC → PHY'), { en: 'TX_START: a frame begins on the air', zh: 'TX_START：帧开始上空口' }],
      [N('PHY-TXEND.confirm'), N('PHY → MAC'), { en: 'TX_END: the last symbol has left', zh: 'TX_END：最后一个符号已发出' }],
      [N('PHY-CCA.indication (BUSY / IDLE)'), N('PHY → MAC'), { en: 'CCA_BUSY / CCA_IDLE', zh: 'CCA_BUSY / CCA_IDLE' }],
      [N('PHY-RXSTART.indication'), N('PHY → MAC'), { en: 'RX_START (drawn at the preamble start; the real indication follows the PHY header)', zh: 'RX_START（画在前导码起点；真实的指示在 PHY 头之后才到达）' }],
      [N('PHY-RXEND.indication'), N('PHY → MAC'), { en: 'RX_OK or RX_FAIL, after the MAC checks the FCS', zh: 'RX_OK 或 RX_FAIL（MAC 校验 FCS 之后）' }],
    ] },
    { text: {
      en: 'Everything else on the timeline — ARRIVAL and ENQUEUE (an MSDU handed down through the MAC data service, §5.2), IFS waits, backoff draws and freezes, NAV, RETRY, DROP, DEQUEUE — is a MAC decision taken between those primitives. That is the whole picture this course draws: a MAC reacting to indications from its PHY and issuing requests to it.',
      zh: '时间轴上的其余一切——ARRIVAL 与 ENQUEUE（通过 MAC 数据服务交下来的 MSDU，§5.2）、IFS 等待、退避抽取与冻结、NAV、RETRY、DROP、DEQUEUE——都是 MAC 在这些原语之间做出的决定。本课程画出的全部内容就是：MAC 对 PHY 的指示做出反应，并向 PHY 发出请求。',
    } },

    { kind: 'table', heading: { en: 'Four names for data at four boundaries', zh: '四个边界上数据的四个名字' }, head: [
      { en: 'Unit', zh: '单元' }, { en: 'Boundary', zh: '所在边界' }, { en: 'Made of', zh: '组成' }, { en: 'In this demo', zh: '本课示例' },
    ], rows: [
      [{ en: 'MSDU — MAC service data unit', zh: 'MSDU——MAC 服务数据单元' }, { en: 'LLC ↔ MAC', zh: 'LLC ↔ MAC' }, { en: 'The payload the MAC must deliver', zh: 'MAC 需要交付的载荷' }, { en: '1400 octets of phone video', zh: '1400 个八位组的手机视频' }],
      [{ en: 'MPDU — MAC protocol data unit', zh: 'MPDU——MAC 协议数据单元' }, { en: 'Inside the MAC', zh: 'MAC 内部' }, { en: 'MAC header + frame body + FCS', zh: 'MAC 头 + 帧体 + FCS' }, { en: '26 + 1400 + 4 = 1430 octets', zh: '26 + 1400 + 4 = 1430 个八位组' }],
      [{ en: 'PSDU — PHY service data unit', zh: 'PSDU——PHY 服务数据单元' }, { en: 'MAC ↔ PHY', zh: 'MAC ↔ PHY' }, { en: 'One MPDU, or an A-MPDU of several', zh: '一个 MPDU，或由多个 MPDU 组成的 A-MPDU' }, { en: 'The same 1430 octets; the laptop’s is 50 MPDUs', zh: '同样 1430 个八位组；笔记本的是 50 个 MPDU' }],
      [{ en: 'PPDU — PHY protocol data unit', zh: 'PPDU——PHY 协议数据单元' }, { en: 'On the air', zh: '空口上' }, { en: 'Preamble + PHY header + PSDU', zh: '前导码 + PHY 头 + PSDU' }, { en: '125.6 µs at HE MCS 11, 20 MHz', zh: 'HE MCS 11、20 MHz 下 125.6 µs' }],
    ] },
    { text: {
      en: 'One more nesting exists: an A-MSDU packs several MSDUs into one MPDU. It comes later, with A-MPDU and Block Ack.',
      zh: '还有一种嵌套：A-MSDU 把多个 MSDU 装进一个 MPDU。它会在后面与 A-MPDU、Block Ack 一起讲。',
    } },

    { kind: 'list', heading: { en: 'Three kinds of frame (Clause 9)', zh: '三类帧（第 9 章）' }, items: [
      { en: 'Data frames carry MSDUs: the blue blocks.', zh: '数据帧：承载 MSDU，即时间轴上的蓝色块。' },
      { en: 'Control frames help deliver them: ACK, RTS, CTS, Block Ack, Trigger. Short, sent at robust rates, never carrying user data.', zh: '控制帧：协助交付——ACK、RTS、CTS、Block Ack、Trigger。它们很短，以稳健的速率发送，从不携带用户数据。' },
      { en: 'Management frames build and maintain the BSS: beacons, probes, authentication, association. The simulator does not yet send them — every STA starts already associated — so none appear on this timeline.', zh: '管理帧：建立并维护 BSS——信标、探测、认证、关联。仿真器目前还不发送它们——所有 STA 一开始就已关联——所以本时间轴上看不到。' },
    ] },

    { heading: { en: 'How traffic enters the simulation', zh: '流量如何进入仿真' }, text: {
      en: 'A traffic profile is the simulator’s stand-in for the layers above the MAC. An uplink profile enqueues MSDUs at the STA; a downlink profile enqueues them at the AP, addressed to the STA. Here, in one room with one Wi-Fi 6 AP: the Laptop uploads a backup (bursts of 50 × 1500-octet MSDUs every 60 ms, uplink); the TV plays video (a 1400-octet MSDU about every 0.85 ms, downlink); and Phone A and Phone B stream video to each other (a 1400-octet MSDU every 1.4–1.7 ms each way). A phone’s MSDU enters at the phone, bound for the AP; once the AP has acknowledged it, the AP enqueues it again, bound for the other phone. OFDMA and MU-MIMO are switched off so that every frame has exactly one sender and one receiver, and the AP’s forwarding step is modelled as a fixed 50 µs.',
      zh: '流量模型是仿真器对 MAC 之上各层的替身。上行模型在 STA 处把 MSDU 入队；下行模型在 AP 处入队，目的地址是该 STA。本课场景是一个房间、一台 Wi-Fi 6 AP：笔记本在上传备份（每 60 ms 一批 50 个 1500 八位组的 MSDU，上行）；电视在播放视频（大约每 0.85 ms 一个 1400 八位组的 MSDU，下行）；手机 A 和手机 B 互相推送视频（每个方向每 1.4–1.7 ms 一个 1400 八位组的 MSDU）。手机的 MSDU 在手机处入队，发往 AP；AP 确认之后，再在 AP 处重新入队，发往另一部手机。OFDMA 与 MU-MIMO 已关闭，这样每一帧都恰好只有一个发送方和一个接收方；AP 的转发步骤按固定 50 µs 建模。',
    } },
    { kind: 'steps', heading: { en: 'The first relayed MSDU, hop by hop', zh: '第一个被中继的 MSDU，逐跳来看' }, items: [
      { en: '1.4157 ms: the MSDU arrives at Phone B. The medium has been idle, so Phone B sends at once: a 125.6 µs data frame addressed to the AP.', zh: '1.4157 ms：MSDU 到达手机 B。介质一直空闲，手机 B 立即发送：一个发往 AP 的 125.6 µs 数据帧。' },
      { en: '1.5413 ms: the AP decodes it; one SIFS (16 µs) later it sends a 28 µs ACK. At 1.5853 ms Phone B’s MAC removes the MSDU from its queue. Hop 1 took 169.6 µs.', zh: '1.5413 ms：AP 解码成功；一个 SIFS（16 µs）后发出 28 µs 的 ACK。1.5853 ms，手机 B 的 MAC 把该 MSDU 移出队列。第一跳用了 169.6 µs。' },
      { en: '1.6353 ms: 50 µs of forwarding later, the same MSDU enters the AP’s queue for Phone A, and the AP sends it at once.', zh: '1.6353 ms：经过 50 µs 转发，同一个 MSDU 进入 AP 发往手机 A 的队列，AP 立即发送。' },
      { en: '1.8049 ms: Phone A’s ACK arrives. Hop 2 also took 169.6 µs; the whole trip took 389.2 µs.', zh: '1.8049 ms：手机 A 的 ACK 到达。第二跳同样 169.6 µs；全程 389.2 µs。' },
    ] },
    { text: {
      en: 'That first MSDU met an idle channel twice. Over the first second the average one is less lucky: a phone-to-phone MSDU takes about 1.3 ms from Phone B’s queue to Phone A’s ACK, against about 0.7 ms for one of the TV’s single-hop downlink MSDUs — close to double, because the relay queues and contends twice and spends two data frames and two ACKs of airtime. In this run Phone A could not even decode that first frame from Phone B (RX_FAIL, SINR too low for MCS 11): the AP is the one place every STA can reach.',
      zh: '第一个 MSDU 两次都碰上了空闲信道。放到第一秒的平均水平就没那么幸运了：一个手机互传的 MSDU 从手机 B 的队列到手机 A 的 ACK 平均约 1.3 ms，而电视的单跳下行 MSDU 平均约 0.7 ms——接近两倍，因为中继要排两次队、竞争两次，还要花掉两个数据帧和两个 ACK 的空口时间。在这次运行里，手机 A 甚至解不出手机 B 发出的第一帧（RX_FAIL，SINR 不足以支撑 MCS 11）：AP 才是每个 STA 都能够到的地方。',
    } },

    { heading: { en: 'Preview: the multi-link device', zh: '预告：多链路设备' }, text: {
      en: 'Wi-Fi 7 (the 802.11be amendment, Clause 35) loosens “one STA, one link”. A multi-link device (MLD) is one MAC entity with a single MAC service access point to LLC, above several affiliated STAs, each operating its own link — for example one on 5 GHz and one on 6 GHz. An AP MLD and a non-AP MLD set up all their links at once, and one MSDU queue can be served by whichever link is free. The MLO lesson builds on exactly this split between the MLD and its affiliated STAs.',
      zh: 'Wi-Fi 7（802.11be 修正案，第 35 章）打破了“一个 STA、一条链路”的格局。多链路设备（MLD）是一个 MAC 实体，向 LLC 只提供一个 MAC 服务接入点，下面挂着多个附属 STA，每个 STA 工作在自己的链路上——比如一个在 5 GHz、一个在 6 GHz。AP MLD 与非 AP MLD 一次建立全部链路，同一个 MSDU 队列可以由任意一条空闲的链路来服务。后面的 MLO 一课正是建立在 MLD 与其附属 STA 的这种分工之上。',
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
    { en: 'Jump to hop 1, then hop 2, and hover both data blocks: the same MSDU id, first addressed to the AP, then sent by the AP to Phone A. No data frame in this scenario ever goes straight from one STA to another.', zh: '依次跳到第一跳和第二跳，悬停两个数据块：MSDU 编号相同，先发往 AP，再由 AP 发往手机 A。本场景中没有任何数据帧从一个 STA 直接发给另一个 STA。' },
    { en: 'Jump to the first uplink frame: before its 50-MPDU aggregate the Laptop sends an RTS to the AP. The TV’s lane never carries a data frame — only control frames: ACKs, Block Acks and the occasional CTS. A downlink-only STA transmits just to answer the AP.', zh: '跳到第一个上行帧：笔记本在发送 50 个 MPDU 的聚合帧之前，先向 AP 发出 RTS。电视的泳道上从来没有数据帧——只有控制帧：ACK、Block Ack，以及偶尔的 CTS。只收下行的 STA 发送，仅仅是为了回应 AP。' },
    { en: 'After a second, select Phone A and compare its phone-to-phone latency (about 1.3 ms) with the TV’s rx latency (about 0.7 ms): the relay costs close to double.', zh: '运行一秒后选中手机 A，把它的“手机互传”时延（约 1.3 ms）与电视的“接收时延”（约 0.7 ms）比较：中继的代价接近两倍。' },
  ],
  tryThis: [
    { en: 'Drag Phone B right next to Phone A and run again: every MSDU still goes through the AP, and the phone-to-phone latency stays about 1.3 ms. The path is set by the BSS architecture, not by distance.', zh: '把手机 B 拖到紧挨着手机 A 的位置再运行：每个 MSDU 依然经过 AP，手机互传时延仍约 1.3 ms。路径由 BSS 体系结构决定，与距离无关。' },
    { en: 'Set the Laptop’s traffic to idle: with the uploads gone, the phone-to-phone latency falls to about 0.7 ms, still about twice the TV’s, which falls to about 0.3 ms.', zh: '把笔记本的流量改为 idle（空闲）：上传停掉之后，手机互传时延降到约 0.7 ms，仍约为电视的两倍——电视降到约 0.3 ms。' },
  ],
  quiz: [
    {
      q: { en: 'Phone A sends an MSDU to Phone B; both are associated with the same AP. How many times does it cross the air, counting only data frames that succeed?', zh: '手机 A 向手机 B 发送一个 MSDU，两者关联在同一台 AP 上。只算成功的数据帧，它要在空口上传几次？' },
      options: [
        { en: 'Once, directly, because they are in the same BSS', zh: '一次，直接发送，因为它们在同一个 BSS' },
        { en: 'Twice: Phone A → AP, then AP → Phone B', zh: '两次：手机 A → AP，再 AP → 手机 B' },
        { en: 'Three times: Phone A → AP → distribution system → Phone B', zh: '三次：手机 A → AP → 分发系统 → 手机 B' },
      ],
      answer: 1,
      explain: { en: 'In an infrastructure BSS a non-AP STA sends every data frame to the AP. The AP passes the MSDU to the distribution system, which delivers it back to the same AP; the DS is not a radio hop. So there are two over-the-air frames, each with its own ACK. Only a TDLS direct link, set up in advance, would avoid the second hop.', zh: '在基础结构 BSS 中，非 AP STA 的每个数据帧都发给 AP。AP 把 MSDU 交给分发系统，DS 再把它交回同一台 AP；DS 并不是一跳无线传输。所以空口上是两帧，各自带一个 ACK。只有事先建立的 TDLS 直连链路才能省掉第二跳。' },
    },
    {
      q: { en: 'The Laptop sends one aggregate carrying 50 MSDUs. How many MPDUs, PSDUs and PPDUs is that?', zh: '笔记本发出一个承载 50 个 MSDU 的聚合帧。它对应多少个 MPDU、PSDU 和 PPDU？' },
      options: [
        { en: '50 MPDUs, 50 PSDUs, 50 PPDUs', zh: '50 个 MPDU、50 个 PSDU、50 个 PPDU' },
        { en: '1 MPDU, 1 PSDU, 1 PPDU', zh: '1 个 MPDU、1 个 PSDU、1 个 PPDU' },
        { en: '50 MPDUs, 1 PSDU, 1 PPDU', zh: '50 个 MPDU、1 个 PSDU、1 个 PPDU' },
      ],
      answer: 2,
      explain: { en: 'Each MSDU gets its own MAC header and FCS, so there are 50 MPDUs. An A-MPDU packs them into a single PSDU, which the PHY sends behind one preamble and PHY header as one PPDU. (Packing 50 MSDUs into one MPDU would be an A-MSDU instead.)', zh: '每个 MSDU 都有自己的 MAC 头和 FCS，所以是 50 个 MPDU。A-MPDU 把它们装进一个 PSDU，PHY 在一个前导码和 PHY 头之后把它作为一个 PPDU 发出。（若把 50 个 MSDU 装进一个 MPDU，那就是 A-MSDU 了。）' },
    },
    {
      q: { en: 'What makes an AP different from a non-AP STA?', zh: 'AP 与非 AP STA 的区别是什么？' },
      options: [
        { en: 'It contains a STA and also gives associated STAs access to the distribution system; it contends for the medium under the same rules', zh: '它包含一个 STA，并为关联的 STA 提供分发系统的接入；竞争介质时遵守同样的规则' },
        { en: 'It uses a different MAC that may transmit without contending', zh: '它使用另一种 MAC，可以不经竞争直接发送' },
        { en: 'It has no MAC address, only an SSID', zh: '它没有 MAC 地址，只有 SSID' },
      ],
      answer: 0,
      explain: { en: 'By definition an AP is an entity that contains one STA and provides access to the distribution services for associated STAs (Clause 3, §4.3). Its STA’s MAC address is the BSSID. It sends its downlink frames through the same contention as everyone else — which is exactly why the AP’s two relay hops each have to wait their turn.', zh: '按定义，AP 是一个包含一个 STA、并为关联 STA 提供分发服务接入的实体（第 3 章，§4.3）。它所含 STA 的 MAC 地址就是 BSSID。它发送下行帧时和其他人经历同样的竞争——这也正是 AP 中继的两跳各自都要排队等候的原因。' },
    },
  ],
}
