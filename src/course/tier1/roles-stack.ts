/**
 * Wi-Fi Tier 1 · M2 · lesson 1: who is who in a home network — the access
 * point and the stations, the name on the list and the address underneath it,
 * and why every data frame in the room is addressed to the box in the middle.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the four
 * architecture words are `terms`, the service primitives and the multi-link
 * preview are in `deeper`, and the clause numbers are in `sources`.
 *
 * Re-paced on 2026-09-25 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md,
 * §2 · M2 and §5.1): this is the FIRST half. The two hops, their timeline, the
 * one-hop-against-two table and both experiments are `relay-hops`, which loads
 * this lesson's own scene. Deleted rather than moved: the 一层套一层的信封
 * paragraph and the nested stack figure that grew out of the four-row wrapping
 * table — both pre-taught `frame-anatomy`'s own opening, so the layering (and
 * the figure that draws it) is now `frame-anatomy`'s, on its own frame. The
 * management-frame disclaimer went the same way: `frame-anatomy` keeps the one
 * copy (§5.1 item 6).
 *
 * The topology figure stays, and with it the diagram block this lesson piloted
 * (docs/superpowers/specs/2026-09-25-course-pace-and-diagrams.md): who talks to
 * whom is what this half is about, and the figure is built from the run.
 *
 * The scenario builder and the jump predicates are untouched, so the recorded
 * timeline hash of this lesson is the one the fixture already holds.
 *
 * Every number quoted below is pinned in tests/course/roles-stack.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import type { TopologySpec } from '../diagram'
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

/** Jump predicates, exported for the test and for `relay-hops`, which shares this scene. */
export const firstUplinkData = txOf((r) => r.frame.kind === 'data' && r.node === 'sta-1')
export const firstDownlinkData = txOf((r) => r.frame.kind === 'data' && r.node === 'ap' && r.frame.dst === 'sta-2')
export const firstRelayHop1 = txOf((r) => r.frame.kind === 'data' && isPhone(r.node) && r.frame.dst === 'ap')
export const firstRelayHop2 = txOf((r) => r.frame.kind === 'data' && r.node === 'ap' && isPhone(r.frame.dst))

/** The Chinese name the figures give each device of the scene. */
const DIAGRAM_NAMES: Record<string, string> = {
  ap: '接入点（AP）', 'sta-1': '笔记本', 'sta-2': '电视',
  'sta-3': '手机 A', 'sta-4': '手机 B',
}

/**
 * Who talks to whom, read out of the lesson's own scenario: the ids, the roles
 * and the positions all come from `rolesStackScenario()`, so a device moved in
 * the scene moves in the figure, and the test compares the two node for node.
 *
 * The two labelled hops are the relay `relay-hops` takes apart next door, and
 * the dashed line is the one path the run refuses: Phone A cannot decode Phone
 * B across the room, which is an RX_FAIL in the timeline and a pin in the test.
 */
export function rolesStackTopology(): TopologySpec {
  const nodes = rolesStackScenario().nodes.map((n) => ({
    id: n.id,
    label: DIAGRAM_NAMES[n.id],
    role: n.kind === 'ap' ? ('ap' as const) : ('sta' as const),
    x: n.pos.x,
    y: n.pos.y,
  }))
  return {
    kind: 'topology',
    nodes,
    links: [
      { from: 'sta-1', to: 'ap', both: true },
      { from: 'sta-2', to: 'ap', both: true },
      { from: 'sta-4', to: 'ap', label: '第一跳', tone: 'accent' },
      { from: 'ap', to: 'sta-3', label: '第二跳', tone: 'accent' },
      { from: 'sta-4', to: 'sta-3', label: '直发不通', tone: 'muted' },
    ],
    ring: { nodes: nodes.map((n) => n.id), label: '一张网（BSS）' },
  }
}

export const rolesStack: Lesson = {
  id: 'roles-stack',
  module: 1,
  title: '一张网里，谁是谁',
  why: '上一课把链路（link）看成两台设备加一份速率余量。可一个家里并不是两台设备：是一个大家都在跟它说话的盒子——接入点（access point, AP）、几台跟它说话的设备——站点（station, STA），外加一个大家都加入了的名字——服务集标识（SSID）。这一课讲清楚谁扮演哪个角色、一张网怎么起名又怎么被寻址，以及为什么屋里每一个数据帧（data frame）的收件人都是那个盒子。',
  outcomes: [
    '说出家庭网络里的两种角色，并讲清接入点做了哪些站点不做的事',
    '把一张网的名字，和用来标识这张网的那个地址区分开',
    '解释为什么一个站点能发送数据的对端只有一个',
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
    { heading: '两种角色，同一套规则', text: '笔记本、手机、电视，跑的都是同样两层：决定什么时候可以开口的媒体访问控制（MAC），和把一帧变成空口信号的物理层（PHY）。它们每一台都是站点——接入点也是。接入点特殊在哪儿？不是射频更强，也不是想说就能说，而是它多了一份别人没有的差事：每个站点都能直接寻址到它，而它替所有人把载荷（payload）转出去。' },
    { heading: '一个接入点，一张网', text: '一个接入点，连同加入它的那些设备，合起来是一张网——也就是基本服务集（BSS）。这张网需要一个自己的地址：站点得说清楚某一帧属于哪张网，邻居发的帧也要能和这张网的帧分得开。这个地址不是另起的，它就是接入点自己的 MAC 地址；用在这个位置上时，它被叫作基本服务集标识（BSSID）。' },
    { kind: 'watch', jump: 0, heading: '去看一眼', text: '载入仿真，跳到笔记本发出的第一个数据帧，再跳到接入点发给电视的那一帧。两帧的方向相反，可有一头总是同一个：接入点。' },
    {
      kind: 'diagram', heading: '谁跟谁说话', spec: rolesStackTopology(),
      caption: '图里的位置就是本场景里的位置。每一条实线的另一端都是接入点：这张网里没有一个数据帧是站点直发站点的。手机到手机那条虚线从来没走通过——隔着 6 m，第一帧就解不出来，于是载荷只好走第一跳、第二跳。',
    },
    { heading: '你真正挑的是那个名字', text: '加入一张网的时候，你从来不用去输入什么地址。你是在一个列表里挑一个名字，这个名字就是 SSID。名字和地址是有意分开的：楼上一台路由器、楼下一台路由器的屋子，是两张网、两个地址、一个名字；于是被拿着下楼的笔记本，谁都没选，就已经换到了第二张网上。' },
  ],
  numbers: [
    { kind: 'steps', heading: '一份载荷的收件人是怎么定的', items: [
      '上层交下来的那份载荷，写着它最终要去的那台设备——比如对面那部手机。',
      'MAC 并不拿这个地址当收件人：它把收件人填成接入点。一个站点能发送数据的对端只有一个。',
      '这一帧发出去，只有接入点作答。屋里其他设备即使听得见，也不回。',
      '接入点收下并确认之后，把载荷交给背后那套把几张网连起来的东西——分发系统（distribution system, DS）——再原样拿回来，拿着最终地址发第二次。那两跳是下一课的事。',
    ] },
    { kind: 'table', heading: '每台设备在干什么', head: [
      '设备', '它在发什么', '多大、多久一次',
    ], rows: [
      ['笔记本', '上行（uplink, UL）的备份', '50 × 1500 B，每 60 ms 一批'],
      ['电视', '只收下行（downlink, DL）的视频', '1400 B，约每 0.85 ms 一个'],
      ['手机 A 与手机 B', '彼此之间的通话', '1400 B，每个方向每 1.4–1.7 ms 一个'],
      ['接入点', '替这两部手机把载荷再发一次', '每份载荷都在空口上走两趟'],
    ] },
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
  ],
  sources: [
    '站点的定义是"通往无线介质、可被单独寻址的一个 MAC 与 PHY 接口实例"（IEEE Std 802.11-2024 第 3 章）；AP 是一个同时为其关联 STA 提供分发服务接入的 STA。两者遵守同样的帧格式（第 9 章）与信道接入规则（第 10 章）。',
    'BSS、BSSID、SSID、DS 与 ESS 见 §4.3；SSID 为 0–32 个八位组，BSSID 为 48 位，每个频段一个。把载荷入队的 MAC 数据服务见 §5.2；"深入一层"里的 MAC–PHY 原语见 §8.3。',
    '"收件人怎么定"那四步，是本仿真器里 traffic.ts 与 simulation.ts 的写法：手机之间的载荷入队时收件人就是 AP，最终目的地另记一笔，等这一帧被确认之后 AP 才转发。上面其余的每一个数字，都是在本场景里实测出来的。',
  ],
  scenario: rolesStackScenario,
  jumps: [
    J('第一个上行数据帧（笔记本 → AP）', firstUplinkData),
    J('第一个下行数据帧（AP → 电视）', firstDownlinkData),
  ],
  observe: [
    '跳到第一个上行数据帧。笔记本发的每一帧，收件人都是接入点；整整一秒里，这张网上没有一个数据帧是站点直发站点的。',
    '再跳到第一个下行数据帧（接入点 → 电视）。电视那条泳道上一个数据帧也没有：只收不发的设备仍然要发送，但只是为了作答。',
  ],
  tryThis: [
    '在编辑器里把电视的业务改成 backup（上行备份）再载入。它的泳道上开始出现数据帧了，可收件人依旧只有接入点一个：方向变了，角色没变。',
  ],
  quiz: [
    {
      q: '楼上一台路由器、楼下一台路由器，用的是同一个网络名称。这是几张网、几个地址？',
      options: [
        '一张网、一个地址——名字相同，就是同一张网',
        '两张网、两个地址，共用一个名字',
        '两张网、一个地址：地址是跟着名字走的',
      ],
      answer: 1,
      explain: '标识一张网的是接入点自己的 MAC 地址，也就是 BSSID，一个接入点一个；SSID 只是你在列表里挑的那个名字。把笔记本拿下楼，它谁也没选，就已经换到了第二张网上。',
    },
    {
      q: '接入点和站点，区别到底在哪儿？',
      options: [
        '它本身也是一个站点，此外还为挂在它上面的站点提供一条经 DS 出去的路',
        '它可以不排队就发送',
        '它没有 MAC 地址，只有一个 SSID',
      ],
      answer: 0,
      explain: '接入点就是一个站点，只是多了一份差事；它自己的 MAC 地址就是 BSSID。它和其余设备一样要排队——它替手机再发的那一次，也得重新等一遍。',
    },
  ],
}
