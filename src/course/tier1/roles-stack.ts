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
import { J, node, oneRoom, sc, txOf, type Lesson } from '../lessonKit'

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
  title: '一张网里，谁是谁',
  why: '上一课把链路看成两台设备加一份速率余量。可一个家里并不是两台设备：是一个大家都在跟它说话的盒子（接入点，AP）、几台跟它说话的设备（站点，日志里写作 STA），外加一个大家都加入了的名字（SSID）。这一课讲清楚谁扮演哪个角色、一张网怎么起名、又怎么被寻址，以及为什么同一个房间里两部手机之间的消息，仍要绕着那个盒子走一圈。',
  outcomes: [
    '说出家庭网络里的两种角色，并讲清接入点做了哪些站点不做的事',
    '把一张网的名字，和用来标识这张网的那个地址区分开',
    '跟着一份载荷走完全程：从上层交下来，发到空口，再在对端交上去',
    '解释同一个房间里两部手机之间的消息，为什么要在空口上传两次',
  ],
  // decode-thresholds owns `rate margin`, which this lesson's opening sentence uses
  // to recall where the last one ended: naming it in `needs` is what makes that honest.
  needs: ['radio-primer', 'decode-thresholds'],
  terms: [
    { term: 'BSS', plain: '一个接入点，加上已经加入它的那些设备——就是你家路由器和挂在上面的一切' },
    { term: 'BSSID', plain: '标识这一张网的那个地址：接入点自己的 MAC 地址' },
    { term: 'SSID', plain: '你在列表里挑的那个网络名称；多个接入点可以共用同一个' },
    { term: 'DS', plain: '分发系统：在各个接入点背后把几张网连起来的那套东西——在家里，就是路由器内部的那个网桥' },
  ],
  picture: [
    { heading: '两种角色，同一套规则', text: '家里这张网上的每台设备，跑的都是同样两层：决定什么时候可以开口的那一层（MAC），和把一帧变成空口上信号的那一层（PHY）。它们每一台都是站点：笔记本、手机、电视——接入点也是。接入点特殊在哪儿？不是射频更强，也不是想说就能说，而是它多了一份别人没有的差事，而且每个别的站点都可以直接寻址到它。' },
    { heading: '一个接入点，一张网', text: '一个接入点，连同加入它的那些设备，合起来是一张网——也就是 BSS。这张网需要一个自己的地址：站点得说清楚某一帧属于哪张网，而邻居发的帧也要能和这张网的帧分得开。这个地址不是另起的，它就是接入点自己的 MAC 地址；用在这个位置上时，它被叫作 BSSID。一个接入点，一张网，一个地址。' },
    { kind: 'watch', jump: 2, heading: '去看一眼', text: '载入仿真，跳到一部手机发给另一部手机的第一帧。它的收件人是接入点，而不是对面那部手机。再跳到下一个目标，看接入点把同一份载荷又发了一次。' },
    { heading: '你真正挑的是那个名字', text: '加入一张网的时候，你从来不用去输入什么地址。你是在一个列表里挑一个名字，这个名字就是 SSID。名字和地址是有意分开的：楼上一台路由器、楼下一台路由器的屋子，是两张网、两个地址、一个名字；于是被拿着下楼的笔记本，谁都没选，就已经换到了第二张网上。' },
    { heading: '一切都从中间过', text: '一个站点能发送数据的对端只有一个：它的接入点。哪怕要找的那台设备就在旁边，帧也要先发给接入点；接入点把载荷交给背后那套把几张网连起来的东西（分发系统，DS），又原样拿回来，于是第二次把它发出去。走哪条路，取决于这张网，而不是屋里的直线距离。' },
    { heading: '一层套一层的信封', text: '这些事，上面那一层一概看不见：它只是把一份载荷交给 MAC，然后等着它被送到。MAC 在前面加一段头、后面加一个校验——这个包裹就是一帧。PHY 拿到一帧、或一批帧，在最前面放上一段固定的图案——前导码（preamble）——好让附近的射频锁住它；到这时，空口上才真的有东西。' },
  ],
  numbers: [
    { kind: 'table', heading: '同一份载荷，四层包装', head: [
      '这是什么', '在哪儿交接', '本场景里的值',
    ], rows: [
      ['上层交下来的载荷', '交给 MAC', '1400 B 的视频'],
      ['MAC 造出来的帧', '头 + 载荷 + 校验', '26 + 1400 + 4 = 1430 B'],
      ['交给 PHY 的东西', '一帧，或者一批', '1430 B；笔记本一次交 50 个'],
      ['空口上传的东西', '先一段图案，再是前面那个', '20 MHz 下 125.6 µs'],
    ] },
    { kind: 'table', heading: '每台设备在干什么', head: [
      '设备', '它在发什么', '多大、多久一次',
    ], rows: [
      ['笔记本', '上行的备份', '50 × 1500 B，每 60 ms 一批'],
      ['电视', '只收下行的视频', '1400 B，约每 0.85 ms 一个'],
      ['手机 A 与手机 B', '彼此之间的通话', '1400 B，每个方向每 1.4–1.7 ms 一个'],
      ['接入点', '把载荷再发出去', '转发固定 50 µs'],
    ] },
    { kind: 'steps', heading: '一份载荷，从一部手机到另一部', items: [
      '1.4157 ms，它到达手机 B；屋里正安静，手机 B 立刻把它发了出去。',
      '这一帧长 125.6 µs。接入点在 1.5413 ms 收齐，隔 16 µs 后作答。',
      '这个回复占 28 µs 空口。第一跳在 1.5853 ms 结束，花掉 169.6 µs。',
      '转发花 50 µs，于是 1.6353 ms 时这份载荷进入发往手机 A 的队列，并立刻发出。',
      '到 1.8049 ms，手机 A 已经作答。第二跳同样花 169.6 µs：全程 389.2 µs。',
    ] },
    { kind: 'table', heading: '一跳还是两跳，整整一秒的平均', head: [
      '路程', '空口上几跳', '平均',
    ], rows: [
      ['接入点到电视', '1', '约 0.7 ms'],
      ['手机到手机', '2', '约 1.3 ms'],
    ] },
    { text: '接近两倍——而且不是因为那 50 µs 的转发：是第二跳同样要排队、同样要等轮到自己。' },
  ],
  deeper: [
    { kind: 'table', heading: '看得见的 MAC–PHY 边界', head: [
      '原语', '时间轴记录',
    ], rows: [
      ['PHY-TXSTART.request', 'TX_START——MAC 请求 PHY 发送'],
      ['PHY-CCA.indication', 'CCA_BUSY / CCA_IDLE——信道忙不忙？'],
      ['PHY-RXEND.indication', 'RX_OK / RX_FAIL（MAC 校验之后）'],
    ] },
    { text: '时间轴上其余的一切——ARRIVAL、ENQUEUE、IFS、退避、NAV、RETRY、DROP、DEQUEUE——都是 MAC 在两个这样的原语之间做出的决定。MAC 之上是 IEEE 802.2 LLC：承载 IP 时，MAC 载荷以 8 个八位组的 LLC/SNAP 头开头，指明后面是什么协议；而在 802.11 看来，那只是载荷的一部分。' },
    { heading: '为什么"就近直传"这条捷径走不通', text: '手机 A 连手机 B 的第一帧都解不出来：隔着房间 6 m，SINR 撑不起两部手机所用的 MCS，记录是一条 RX_FAIL。位置更高、又在中间的 AP，才是每个站点都够得着的地方——这也是"决定路径的是体系结构而不是距离"的又一个理由。' },
    { heading: '这个房间里看不到的几种情况', text: '独立 BSS（IBSS）是完全没有 AP 的自组网；TDLS 直连链路则是经协商建立的例外，让两个已关联的站点直接对话。多个 BSS 经 DS 连接构成扩展服务集（ESS），在上层看来就像一张 BSS——同一 SSID 下的多台 Mesh AP 便是如此。Wi-Fi 7 还打破了"一个站点一条链路"：多链路设备（MLD）是一个 MAC 实体，向上只提供一个服务接入点，下面挂着各自占一条链路的多个附属站点。' },
    { text: '帧分三大类。数据帧承载载荷；控制帧——ACK、RTS、CTS、BlockAck、Trigger——协助把它们送达；管理帧则负责把 BSS 建起来：信标、认证、关联。仿真器目前还不发管理帧，所以这个房间里的每个站点一开始就已经处于关联状态。' },
  ],
  sources: [
    '站点的定义是"通往无线介质、可被单独寻址的一个 MAC 与 PHY 接口实例"（IEEE Std 802.11-2024 第 3 章）；AP 是一个同时为其关联 STA 提供分发服务接入的 STA。两者遵守同样的帧格式（第 9 章）与信道接入规则（第 10 章）。',
    'BSS、BSSID、SSID、DS 与 ESS 见 §4.3；SSID 为 0–32 个八位组，BSSID 为 48 位，每个频段一个。把载荷入队的 MAC 数据服务见 §5.2；"深入一层"里的 MAC–PHY 原语见 §8.3。',
    '接入点把载荷转发出去所花的 50 µs，是本仿真器的模型取值，并非标准中的数值：真实网桥的时延取决于具体设备。上面其余的每一个数字，都是在本场景里实测出来的。',
  ],
  scenario: rolesStackScenario,
  jumps: [
    J('第一个上行数据帧（笔记本 → AP）', firstUplinkData),
    J('第一个下行数据帧（AP → 电视）', firstDownlinkData),
    J('第一个中继帧，第一跳（手机 B → AP）', firstRelayHop1),
    J('第一个中继帧，第二跳（AP → 手机 A）', firstRelayHop2),
  ],
  observe: [
    '悬停第一跳与第二跳的数据块：载荷编号相同，先发往接入点，再由它发给手机 A。这里没有任何数据帧是站点直发站点的。',
    '在第一个上行帧处，笔记本先发一个短的预约帧，接着是一个突发：50 份载荷跟在同一个前导后面。电视那条泳道上一个数据帧也没有：只收不发的设备仍然要发送，但只是为了作答。跑满一秒，它的接收数值稳定在约 0.7 ms，而手机互传是 1.3 ms。',
  ],
  tryThis: [
    '把手机 B 拖到手机 A 旁边。每一份载荷仍要绕经接入点，仍约 1.3 ms：路径跟着这张网走，而不是跟着距离走。',
    '把笔记本改成 idle 再跑一遍。手机互传降到约 0.7 ms，电视降到约 0.3 ms——仍接近两倍：中继照样要付两次排队的代价。',
  ],
  quiz: [
    {
      q: '手机 A 给手机 B 发一条消息，两部手机在同一个接入点上。只算成功送达的帧，它在空口上传了几次？',
      options: [
        '一次，直接送过去——它们本来就在同一个 BSS 里',
        '两次：手机 A 到接入点，接入点再到手机 B',
        '三次：手机 A、接入点、DS，然后手机 B',
      ],
      answer: 1,
      explain: 'DS 把载荷交回同一个接入点，它自己并不是空口上的一跳：两帧，各带一个回复。',
    },
    {
      q: '笔记本一次交给射频 50 份载荷。MAC 造了几帧？空口上走了几个突发？',
      options: [
        '50 帧、50 个突发',
        '1 帧、1 个突发',
        '50 帧、1 个突发',
      ],
      answer: 2,
      explain: '每份载荷都有自己的头和校验，所以是 50 帧。它们跟在同一段图案后面作为一个突发发出——时间轴上于是只有一个块。',
    },
    {
      q: '接入点和站点，区别到底在哪儿？',
      options: [
        '它本身也是一个站点，此外还为挂在它上面的站点提供一条经 DS 出去的路',
        '它可以不排队就发送',
        '它没有 MAC 地址，只有一个 SSID',
      ],
      answer: 0,
      explain: '接入点就是一个站点，只是多了一份差事；它自己的 MAC 地址就是 BSSID。它和其余设备一样要排队——中继的第二跳之所以和第一跳一样贵，原因在此。',
    },
  ],
}
