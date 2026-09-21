/**
 * Wi-Fi Tier 1 · M1 · lesson 3: who is who in a home network — the access
 * point and the stations, the name on the list and the address underneath it,
 * and why what leaves an antenna is a payload inside a frame inside a burst.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the four
 * architecture words are `terms`, the wrappers are told in plain language
 * (their standard names are `frame-anatomy`'s to introduce, one lesson on),
 * the service primitives and the multi-link preview are in `deeper`, and the
 * clause numbers are in `sources`.
 *
 * The scenario builder and the jump predicates are untouched, so the recorded
 * timeline hash of this lesson is the one the fixture already holds.
 *
 * Every number quoted below is pinned in tests/course/roles-stack.test.ts.
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
  title: { en: 'Who is who in one network', zh: '一张网里，谁是谁' },
  why: {
    en: 'The last lesson treated a link as two radios and a margin. A home is not two radios: it is one box everyone talks to, several devices that talk to it, and a name they all joined. This lesson says who plays which part, how a network is named and how it is addressed, and why a message between two phones in the same room still goes round by way of the box.',
    zh: '上一课把链路看成两台设备加一个余量。可一个家里并不是两台设备：是一个大家都在跟它说话的盒子、几台跟它说话的设备，外加一个大家都加入了的名字。这一课讲清楚谁扮演哪个角色、一张网怎么起名、又怎么被寻址，以及为什么同一个房间里两部手机之间的消息，仍要绕着那个盒子走一圈。',
  },
  outcomes: [
    { en: 'name the two roles in a home network and say what the access point does that a station does not', zh: '说出家庭网络里的两种角色，并讲清接入点做了哪些站点不做的事' },
    { en: 'tell a network\'s name apart from the address that identifies one network', zh: '把一张网的名字，和用来标识这张网的那个地址区分开' },
    { en: 'follow one payload from the layer above it down onto the air and up again at the far end', zh: '跟着一份载荷走完全程：从上层交下来，发到空口，再在对端交上去' },
    { en: 'explain why a message between two phones in one room crosses the air twice', zh: '解释同一个房间里两部手机之间的消息，为什么要在空口上传两次' },
  ],
  needs: ['radio-primer'],
  terms: [
    { term: 'BSS', plain: {
      en: 'one access point and the devices that have joined it — your router and everything on it',
      zh: '一个接入点，加上已经加入它的那些设备——就是你家路由器和挂在上面的一切',
    } },
    { term: 'BSSID', plain: {
      en: 'the address that identifies that one network: the access point\'s own MAC address',
      zh: '标识这一张网的那个地址：接入点自己的 MAC 地址',
    } },
    { term: 'SSID', plain: {
      en: 'the network name you pick out of a list; several access points may share one',
      zh: '你在列表里挑的那个网络名称；多个接入点可以共用同一个',
    } },
    { term: 'DS', plain: {
      en: 'the distribution system: whatever joins networks up behind their access points — at home, the bridge inside the router',
      zh: '分发系统：在各个接入点背后把几张网连起来的那套东西——在家里，就是路由器内部的那个网桥',
    } },
  ],
  picture: [
    { heading: { en: 'Two parts, one set of rules', zh: '两种角色，同一套规则' }, text: {
      en: 'Every device in a home network runs the same MAC and the same PHY, and obeys the same rules about when it may speak. A station is anything that has joined: a laptop, a phone, a TV. One device is not like the others — the access point — but not because its radio is stronger or because it may talk whenever it likes. It has a job the others do not, and it is the one device every station may address.',
      zh: '家里这张网上的每台设备，跑的都是同一套 MAC 和同一套 PHY，什么时候可以开口，守的也是同一套规则。凡是加入进来的都叫站点：笔记本、手机、电视。只有一台设备不太一样——接入点——但不是因为它的射频更强，也不是因为它想说就能说。它多的是一份别人没有的差事，而且它是唯一一台每个站点都可以直接寻址的设备。',
    } },
    { heading: { en: 'One access point, one network', zh: '一个接入点，一张网' }, text: {
      en: 'An access point and the devices that joined it are one network — a BSS. It needs an address of its own, so that a station can say which network a frame belongs to and a neighbour\'s frames can be told apart from this one\'s. That address is not invented: it is the access point\'s own MAC address, and used this way it is called the BSSID. One access point, one network, one address.',
      zh: '一个接入点，连同加入它的那些设备，合起来是一张网——也就是 BSS。这张网需要一个自己的地址：站点得说清楚某一帧属于哪张网，而邻居发的帧也要能和这张网的帧分得开。这个地址不是另起的，它就是接入点自己的 MAC 地址；用在这个位置上时，它被叫作 BSSID。一个接入点，一张网，一个地址。',
    } },
    { kind: 'watch', jump: 2, heading: { en: 'Go and look', zh: '去看一眼' }, text: {
      en: 'Load the simulation and jump to the first frame one phone sends the other. It is addressed to the access point, not to the other phone. Then take the next jump and watch the access point send the very same payload on again.',
      zh: '载入仿真，跳到一部手机发给另一部手机的第一帧。它的收件人是接入点，而不是对面那部手机。再跳到下一个目标，看接入点把同一份载荷又发了一次。',
    } },
    { heading: { en: 'The name you actually pick', zh: '你真正挑的是那个名字' }, text: {
      en: 'You never type an address when you join a network. You pick a name off a list, and that name is the SSID. Name and address are kept apart on purpose: a house with a router upstairs and another downstairs has two networks, two addresses and one name, so a laptop carried down the stairs joins the second network without anyone choosing anything.',
      zh: '加入一张网的时候，你从来不用去输入什么地址。你是在一个列表里挑一个名字，这个名字就是 SSID。名字和地址是有意分开的：楼上一台路由器、楼下一台路由器的屋子，是两张网、两个地址、一个名字；于是被拿着下楼的笔记本，谁都没选什么，就已经换到了第二张网上。',
    } },
    { heading: { en: 'Everything goes through the middle', zh: '一切都从中间过' }, text: {
      en: 'A station has exactly one peer it may send data to: its access point. Even when the device it is talking to sits beside it, the frame goes to the access point first. The access point hands the payload to the DS, which hands it straight back, and the access point sends it a second time. The path follows the network, not the distance across the room.',
      zh: '一个站点能发送数据的对端只有一个：它的接入点。哪怕要找的那台设备就在旁边，帧也要先发给接入点。接入点把载荷交给 DS，DS 再原样交回来，接入点于是第二次把它发出去。走哪条路，取决于这张网，而不是屋里的直线距离。',
    } },
    { heading: { en: 'Envelopes inside envelopes', zh: '一层套一层的信封' }, text: {
      en: 'None of that is visible to the layer above, which just hands the MAC a payload and expects it delivered. The MAC puts a header in front and a check behind — that parcel is a frame. The PHY takes the frame, or a batch of them, puts a pattern in front that any nearby radio can lock on to, and only then is anything on the air.',
      zh: '这些事，上面那一层一概看不见：它只是把一份载荷交给 MAC，然后等着它被送到。MAC 在前面加一段头、后面加一个校验——这个包裹就是一帧。PHY 拿到一帧、或一批帧，再在最前面放上一段图案，好让附近任何一台射频都能锁住；到这时，空口上才真的有东西。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'One payload, four wrappings', zh: '同一份载荷，四层包装' }, head: [
      { en: 'What it is', zh: '这是什么' }, { en: 'Where it is handed over', zh: '在哪儿交接' }, { en: 'In this scenario', zh: '本场景里的值' },
    ], rows: [
      [{ en: 'The payload from the layer above', zh: '上层交下来的载荷' }, { en: 'down into the MAC', zh: '交给 MAC' }, N('1400 B of video')],
      [{ en: 'The frame the MAC builds', zh: 'MAC 造出来的帧' }, { en: 'header + payload + check', zh: '头 + 载荷 + 校验' }, N('26 + 1400 + 4 = 1430 B')],
      [{ en: 'What the PHY is handed', zh: '交给 PHY 的东西' }, { en: 'one frame, or a batch', zh: '一帧，或者一批' }, { en: '1430 B; the laptop hands over 50', zh: '1430 B；笔记本一次交 50 个' }],
      [{ en: 'What is on the air', zh: '空口上传的东西' }, { en: 'a pattern in front, then that', zh: '先一段图案，再是前面那个' }, N('125.6 µs at 20 MHz')],
    ] },
    { kind: 'table', heading: { en: 'What each device is doing', zh: '每台设备在干什么' }, head: [
      { en: 'Device', zh: '设备' }, { en: 'What it sends', zh: '它在发什么' }, { en: 'How much, how often', zh: '多大、多久一次' },
    ], rows: [
      [{ en: 'Laptop', zh: '笔记本' }, { en: 'a backup, uphill', zh: '上行的备份' }, N('50 × 1500 B every 60 ms')],
      [{ en: 'TV', zh: '电视' }, { en: 'video, downhill only', zh: '只收下行的视频' }, { en: '1400 B about every 0.85 ms', zh: '1400 B，约每 0.85 ms 一个' }],
      [{ en: 'Phone A and Phone B', zh: '手机 A 与手机 B' }, { en: 'a call to each other', zh: '彼此之间的通话' }, { en: '1400 B every 1.4–1.7 ms each way', zh: '1400 B，每个方向每 1.4–1.7 ms 一个' }],
      [{ en: 'Access point', zh: '接入点' }, { en: 'handing a payload back out', zh: '把载荷再发出去' }, N('a fixed 50 µs to forward')],
    ] },
    { kind: 'steps', heading: { en: 'One payload from phone to phone', zh: '一份载荷，从一部手机到另一部' }, items: [
      { en: 'At 1.4157 ms it arrives at Phone B, which finds the room quiet and sends it straight away.', zh: '1.4157 ms，它到达手机 B；屋里正安静，手机 B 立刻把它发了出去。' },
      { en: 'That frame is 125.6 µs long. The access point has it at 1.5413 ms and answers 16 µs later.', zh: '这一帧长 125.6 µs。接入点在 1.5413 ms 收齐，隔 16 µs 后作答。' },
      { en: 'The answer is 28 µs of air. The first hop is over at 1.5853 ms, having cost 169.6 µs.', zh: '这个回复占 28 µs 空口。第一跳在 1.5853 ms 结束，花掉 169.6 µs。' },
      { en: 'Forwarding costs 50 µs, so at 1.6353 ms the payload is queued for Phone A and goes out at once.', zh: '转发花 50 µs，于是 1.6353 ms 时这份载荷进入发往手机 A 的队列，并立刻发出。' },
      { en: 'Phone A has answered by 1.8049 ms. The second hop cost 169.6 µs too: 389.2 µs door to door.', zh: '到 1.8049 ms，手机 A 已经作答。第二跳同样花 169.6 µs：全程 389.2 µs。' },
    ] },
    { kind: 'table', heading: { en: 'One hop or two, over a whole second', zh: '一跳还是两跳，整整一秒的平均' }, head: [
      { en: 'Journey', zh: '路程' }, { en: 'Hops on the air', zh: '空口上几跳' }, { en: 'Average', zh: '平均' },
    ], rows: [
      [{ en: 'Access point to TV', zh: '接入点到电视' }, N('1'), N('about 0.7 ms')],
      [{ en: 'Phone to phone', zh: '手机到手机' }, N('2'), N('about 1.3 ms')],
    ] },
    { text: {
      en: 'Close to double, and the doubling is not the 50 µs of forwarding: the second hop queues and waits its turn exactly like the first.',
      zh: '接近两倍，而多出来的这一倍并不是那 50 µs 的转发：是第二跳同样要排队、同样要等轮到自己。',
    } },
  ],
  deeper: [
    { kind: 'table', heading: { en: 'The boundary between the MAC and the PHY you can see', zh: '看得见的 MAC–PHY 边界' }, head: [
      { en: 'Primitive', zh: '原语' }, { en: 'Timeline record', zh: '时间轴记录' },
    ], rows: [
      [N('PHY-TXSTART.request'), { en: 'TX_START — the MAC asks the PHY to send', zh: 'TX_START——MAC 请求 PHY 发送' }],
      [N('PHY-CCA.indication'), { en: 'CCA_BUSY / CCA_IDLE — is the channel busy?', zh: 'CCA_BUSY / CCA_IDLE——信道忙不忙？' }],
      [N('PHY-RXEND.indication'), { en: 'RX_OK / RX_FAIL, once the MAC has checked the frame', zh: 'RX_OK / RX_FAIL（MAC 校验之后）' }],
    ] },
    { text: {
      en: 'Everything else on the timeline — ARRIVAL, ENQUEUE, IFS, backoff, NAV, RETRY, DROP, DEQUEUE — is a MAC decision taken between two such primitives. Above the MAC sits IEEE 802.2 LLC: for IP traffic the MAC payload opens with an 8-octet LLC/SNAP header naming the protocol that follows, which to 802.11 is simply more payload.',
      zh: '时间轴上其余的一切——ARRIVAL、ENQUEUE、IFS、退避、NAV、RETRY、DROP、DEQUEUE——都是 MAC 在两个这样的原语之间做出的决定。MAC 之上是 IEEE 802.2 LLC：承载 IP 时，MAC 载荷以 8 个八位组的 LLC/SNAP 头开头，指明后面是什么协议；而在 802.11 看来，那只是载荷的一部分。',
    } },
    { heading: { en: 'Why the room itself cannot be the shortcut', zh: '为什么"就近直传"这条捷径走不通' }, text: {
      en: 'Phone A cannot even decode Phone B\'s first frame: at 6 m apart across the room the SINR is too low for the MCS the phones use, and the record is an RX_FAIL. The AP, higher up and in the middle, is the one place every station reaches — which is another reason architecture, not distance, decides the path.',
      zh: '手机 A 连手机 B 的第一帧都解不出来：隔着房间 6 m，SINR 撑不起两部手机所用的 MCS，记录是一条 RX_FAIL。位置更高、又在中间的 AP，才是每个站点都够得着的地方——这也是"决定路径的是体系结构而不是距离"的又一个理由。',
    } },
    { heading: { en: 'The cases this room does not show', zh: '这个房间里看不到的几种情况' }, text: {
      en: 'An independent BSS (IBSS) is the ad hoc case with no AP at all; a TDLS direct link is a negotiated exception that lets two associated stations talk straight to each other. Several BSSs joined by a DS form an extended service set (ESS), which looks to the layer above like a single BSS — mesh APs under one SSID. And Wi-Fi 7 loosens "one station, one link": a multi-link device (MLD) is one MAC entity with a single service access point above several affiliated stations, each on its own link.',
      zh: '独立 BSS（IBSS）是完全没有 AP 的自组网；TDLS 直连链路则是经协商建立的例外，让两个已关联的站点直接对话。多个 BSS 经 DS 连接构成扩展服务集（ESS），在上层看来就像一张 BSS——同一 SSID 下的多台 Mesh AP 便是如此。Wi-Fi 7 还打破了"一个站点一条链路"：多链路设备（MLD）是一个 MAC 实体，向上只提供一个服务接入点，下面挂着各自占一条链路的多个附属站点。',
    } },
    { text: {
      en: 'Frames come in three families. Data frames carry payloads; control frames — ACK, RTS, CTS, BlockAck, Trigger — help deliver them; management frames build the BSS in the first place: beacons, authentication, association. The simulator sends no management frames yet, so every station in this room starts already associated.',
      zh: '帧分三大类。数据帧承载载荷；控制帧——ACK、RTS、CTS、BlockAck、Trigger——协助把它们送达；管理帧则负责把 BSS 建起来：信标、认证、关联。仿真器目前还不发管理帧，所以这个房间里的每个站点一开始就已经处于关联状态。',
    } },
  ],
  sources: [
    { en: 'A station is "a singly addressable instance of a MAC and PHY interface to the wireless medium" (IEEE Std 802.11-2024, Clause 3); an AP is a STA that also gives its associated STAs access to the distribution services. Both obey the same frame formats (Clause 9) and the same channel-access rules (Clause 10).',
      zh: '站点的定义是"通往无线介质、可被单独寻址的一个 MAC 与 PHY 接口实例"（IEEE Std 802.11-2024 第 3 章）；AP 是一个同时为其关联 STA 提供分发服务接入的 STA。两者遵守同样的帧格式（第 9 章）与信道接入规则（第 10 章）。' },
    { en: 'BSS, BSSID, SSID, DS and ESS are §4.3; the SSID is 0–32 octets and the BSSID is 48 bits, one per band. The MAC data service that enqueues a payload is §5.2, and the MAC–PHY primitives in "Going deeper" are §8.3.',
      zh: 'BSS、BSSID、SSID、DS 与 ESS 见 §4.3；SSID 为 0–32 个八位组，BSSID 为 48 位，每个频段一个。把载荷入队的 MAC 数据服务见 §5.2；"深入一层"里的 MAC–PHY 原语见 §8.3。' },
    { en: 'The 50 µs the access point takes to forward a payload back out is this simulator\'s model choice, not a value from the standard: real bridging latency depends on the box. Every other figure above is measured off this scenario.',
      zh: '接入点把载荷转发出去所花的 50 µs，是本仿真器的模型取值，并非标准中的数值：真实网桥的时延取决于具体设备。上面其余的每一个数字，都是在本场景里实测出来的。' },
  ],
  scenario: rolesStackScenario,
  jumps: [
    J('first uplink data frame (Laptop → AP)', '第一个上行数据帧（笔记本 → AP）', firstUplinkData),
    J('first downlink data frame (AP → TV)', '第一个下行数据帧（AP → 电视）', firstDownlinkData),
    J('first relayed frame, hop 1 (Phone B → AP)', '第一个中继帧，第一跳（手机 B → AP）', firstRelayHop1),
    J('first relayed frame, hop 2 (AP → Phone A)', '第一个中继帧，第二跳（AP → 手机 A）', firstRelayHop2),
  ],
  observe: [
    { en: 'Hover the data blocks at hop 1 and hop 2: the same payload number, addressed first to the access point and then sent by it to Phone A. No data frame here goes straight from one station to another.', zh: '悬停第一跳与第二跳的数据块：载荷编号相同，先发往接入点，再由它发给手机 A。这里没有任何数据帧是从一个站点直接发给另一个站点的。' },
    { en: 'At the first uplink frame the Laptop sends a short reservation frame, then one burst carrying 50 payloads. The TV\'s lane holds no data frame at all: a device that only receives still transmits, but only to answer. Run a second and its receive figure settles near 0.7 ms, against 1.3 ms phone to phone.', zh: '在第一个上行帧处，笔记本先发一个短的预约帧，接着是承载 50 份载荷的一个突发。电视那条泳道上一个数据帧也没有：只收不发的设备仍然要发送，但只是为了作答。跑满一秒，它的接收数值稳定在约 0.7 ms，而手机互传是 1.3 ms。' },
  ],
  tryThis: [
    { en: 'Drag Phone B across the room until it sits next to Phone A. Every payload still goes by way of the access point, and the average is still about 1.3 ms: the path follows the network, not the distance.', zh: '把手机 B 拖到手机 A 旁边。每一份载荷仍要绕经接入点，平均值仍约 1.3 ms：路径跟着这张网走，而不是跟着距离走。' },
    { en: 'Set the Laptop to idle and run again. Phone to phone falls to about 0.7 ms and the TV to about 0.3 ms — still close to double, because the relay still pays for two turns.', zh: '把笔记本改成 idle 再跑一遍。手机互传降到约 0.7 ms，电视降到约 0.3 ms——仍接近两倍，因为中继照样要付两次排队的代价。' },
  ],
  quiz: [
    {
      q: { en: 'Phone A sends a message to Phone B, both on the same access point. Counting only frames that got through, how many times does it cross the air?', zh: '手机 A 给手机 B 发一条消息，两部手机在同一个接入点上。只算成功送达的帧，它在空口上传了几次？' },
      options: [
        { en: 'Once, straight across — they are in the same BSS', zh: '一次，直接送过去——它们本来就在同一个 BSS 里' },
        { en: 'Twice: Phone A to the access point, then the access point to Phone B', zh: '两次：手机 A 到接入点，接入点再到手机 B' },
        { en: 'Three times: Phone A, the access point, the DS, then Phone B', zh: '三次：手机 A、接入点、DS，然后手机 B' },
      ],
      answer: 1,
      explain: { en: 'The DS hands the payload back to the same access point, and is not itself a hop on the air: two frames, each with its own answer.', zh: 'DS 把载荷交回同一个接入点，它自己并不是空口上的一跳：两帧，各自带一个回复。' },
    },
    {
      q: { en: 'The Laptop hands the radio 50 payloads at once. How many frames did the MAC build, and how many bursts went out?', zh: '笔记本一次交给射频 50 份载荷。MAC 造了几帧？空口上走了几个突发？' },
      options: [
        { en: '50 frames and 50 bursts', zh: '50 帧、50 个突发' },
        { en: 'One frame and one burst', zh: '1 帧、1 个突发' },
        { en: '50 frames and one burst', zh: '50 帧、1 个突发' },
      ],
      answer: 2,
      explain: { en: 'Each payload gets its own header and check, so the MAC builds 50 frames. They go behind one pattern as a single burst — hence one block on the timeline.', zh: '每份载荷都有自己的头和校验，所以 MAC 造了 50 帧。它们跟在同一段图案后面作为一个突发发出——时间轴上于是只有一个块。' },
    },
    {
      q: { en: 'What makes an access point different from a station?', zh: '接入点和站点，区别到底在哪儿？' },
      options: [
        { en: 'It contains a station, and gives the stations on it a way out through the DS', zh: '它本身含有一个站点，并为挂在它上面的站点提供一条经 DS 出去的路' },
        { en: 'It may transmit without waiting its turn', zh: '它可以不排队就发送' },
        { en: 'It has no MAC address, only an SSID', zh: '它没有 MAC 地址，只有一个 SSID' },
      ],
      answer: 0,
      explain: { en: 'That is the definition, and its own MAC address is the BSSID. It waits its turn like everyone else — which is why a relay\'s second hop costs as much as its first.', zh: '这就是定义，而它自己的 MAC 地址就是 BSSID。它和所有设备一样要排队——中继的第二跳之所以和第一跳一样贵，原因在此。' },
    },
  ],
}
