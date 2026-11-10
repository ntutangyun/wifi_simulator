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
      { from: 'sta-4', to: 'sta-3', label: '无直接通路', tone: 'muted' },
    ],
    ring: { nodes: nodes.map((n) => n.id), label: '一个网络（BSS）' },
  }
}

export const rolesStack: Lesson = {
  id: 'roles-stack',
  module: 1,
  title: '一个网络中的角色',
  why: '上一课把链路（link）看作两台设备加上一份速率余量。但一个家庭网络中不止两台设备：有一台所有设备都与之通信的中心设备——接入点（access point, AP），几台与它通信的设备——站点（station, STA），以及所有设备都已加入的网络名称——服务集标识（service set identifier, SSID）。接入点本身也是一个站点：它运行同样的两层——媒体访问控制（medium access control, MAC）和物理层（physical layer, PHY），同样需要排队；它多出的只是一项职责——每个站点都能直接寻址到它，它负责为所有站点转发载荷（payload）。一个接入点连同加入它的设备构成一个网络，即基本服务集（basic service set, BSS）；这个网络的地址不是另外分配的，就是接入点自己的 MAC 地址，称为基本服务集标识（basic service set identifier, BSSID）。SSID 只是用户在列表中选择的名称：楼上楼下两台路由器共用一个名称，却是两个网络、两个地址。站点把每一个数据帧（data frame）的接收方都填为接入点，最终目的地另外记录，所以屋里没有任何数据帧是从站点直接发给站点的：两部手机之间的载荷先交给接入点，经它背后的分发系统（distribution system, DS）后再由它发送第二次。决定这条路径的是体系结构，而不是距离。',
  outcomes: [
    '说出家庭网络中的两种角色，并说明接入点承担了哪些站点不承担的职责',
    '区分一个网络的名称与用来标识这个网络的地址',
    '解释为什么一个站点能发送数据的对端只有一个',
  ],
  // decode-thresholds owns `rate margin`, which this lesson's opening sentence uses
  // to recall where the last one ended: naming it in `needs` is what makes that honest.
  needs: ['radio-primer', 'decode-thresholds'],
  terms: [
    { term: 'BSS', plain: '一个接入点加上已加入它的设备——即家中的路由器和连接到它的所有设备' },
    { term: 'BSSID', plain: '标识这个网络的地址：接入点自己的 MAC 地址' },
    { term: 'SSID', plain: '用户在列表中选择的网络名称；多个接入点可以共用同一个' },
    { term: 'DS', plain: '分发系统：在各个接入点后方把多个网络连接起来的系统——在家庭中，就是路由器内部的网桥' },
  ],
  picture: [
    { heading: '两种角色，同一套规则', text: '笔记本、手机、电视运行的都是同样的两层：决定何时可以发送的媒体访问控制（MAC），以及把一帧转换为空口信号的物理层（PHY）。它们每一台都是站点——接入点也是。接入点的特殊之处在哪里？不是射频更强，也不是可以不等待就发送，而是它多了一项其他站点没有的职责：每个站点都能直接寻址到它，而它负责为所有站点转发载荷（payload）。' },
    { heading: '一个接入点，一个网络', text: '一个接入点连同加入它的设备，构成一个网络——也就是基本服务集（BSS）。这个网络需要一个自己的地址：站点必须指明某一帧属于哪个网络，邻居网络发出的帧也要能与本网络的帧区分开。这个地址不是另外分配的，它就是接入点自己的 MAC 地址；用在这个位置上时，它称为基本服务集标识（BSSID）。' },
    { kind: 'watch', jump: 0, heading: '在仿真中观察', text: '载入仿真，跳到笔记本发出的第一个数据帧，再跳到接入点发给电视的那一帧。两帧的方向相反，但其中一端始终是同一台设备：接入点。' },
    {
      kind: 'diagram', heading: '设备之间的通信关系', spec: rolesStackTopology(),
      caption: '图中的位置就是本场景中的位置。每一条实线的另一端都是接入点：这个网络中没有任何数据帧是从站点直接发给站点的。手机到手机的那条虚线上从来没有直接传送过——两部手机相距 6 m，连对方发出的第一帧都无法解码，因此载荷只能经第一跳、第二跳传送。',
    },
    { heading: '用户选择的是网络名称', text: '加入一个网络时，用户从来不需要输入地址，而是在列表中选择一个名称，这个名称就是 SSID。名称和地址是有意分开的：楼上、楼下各有一台路由器的住宅，是两个网络、两个地址、一个名称；因此笔记本被带到楼下时，用户无需做任何选择，它就已经切换到了第二个网络。' },
  ],
  numbers: [
    { kind: 'steps', heading: '一份载荷的接收方如何确定', items: [
      '上层交下来的载荷标明了它的最终目的设备——例如另一部手机。',
      'MAC 并不把这个地址用作接收方：它把接收方填为接入点。一个站点能发送数据的对端只有一个。',
      '这一帧发出后，只有接入点应答。屋里其他设备即使收到，也不应答。',
      '接入点接收并确认之后，把载荷交给后方连接多个网络的系统——分发系统（distribution system, DS）——再原样取回，按最终地址发送第二次。这两跳在下一课讲。',
    ] },
    { kind: 'table', heading: '每台设备的业务', head: [
      '设备', '发送内容', '大小与间隔',
    ], rows: [
      ['笔记本', '上行（uplink, UL）的备份', '50 × 1500 B，每 60 ms 一批'],
      ['电视', '只接收下行（downlink, DL）视频', '1400 B，约每 0.85 ms 一个'],
      ['手机 A 与手机 B', '彼此之间的通话', '1400 B，每个方向每 1.4–1.7 ms 一个'],
      ['接入点', '为这两部手机转发载荷', '每份载荷都在空口上传送两趟'],
    ] },
  ],
  deeper: [
    { kind: 'table', heading: '可观察的 MAC–PHY 边界', head: [
      '原语', '时间轴记录',
    ], rows: [
      ['PHY-TXSTART.request', 'TX_START——MAC 请求 PHY 发送'],
      ['PHY-CCA.indication', 'CCA_BUSY / CCA_IDLE——信道是否忙？'],
      ['PHY-RXEND.indication', 'RX_OK / RX_FAIL（MAC 校验之后）'],
    ] },
    { text: '时间轴上其余的一切——ARRIVAL、ENQUEUE、IFS、退避、NAV、RETRY、DROP、DEQUEUE——都是 MAC 在两个这样的原语之间做出的决定。MAC 之上是 IEEE 802.2 LLC：承载 IP 时，MAC 载荷以 8 个八位组的 LLC/SNAP 头开头，指明后面是什么协议；而在 802.11 看来，那只是载荷的一部分。' },
    { heading: '为什么不能"就近直接传送"', text: '先说明这个场景中实际发生了什么：两部手机之间一次直接传送也没有发生过。引擎把每一份手机对手机的视频载荷都以 AP 为目的地入队，对端只记录在 finalDst 字段中，所以空口上从来没有出现过从手机 A 直接发给手机 B 的帧。时间轴上那条 RX_FAIL 是另一回事：手机 A 收到手机 B 发给 AP 的上行帧，但未能解码——两者相隔 6 m，信干噪比不足以支持 B 对 AP 所用的那一级。所以它是间接证据，而不是演示：它说明这两部手机无法解码对方正在使用的速率等级；至于直接传送是否可行，这个场景没有测试，因为体系结构根本不提供这条路径。而位置更高、又处于中间的 AP，是每个站点都能直接到达的位置——这才是"决定路径的是体系结构而不是距离"的含义。' },
    { heading: '这个房间里看不到的几种情况', text: '独立 BSS（IBSS）是完全没有 AP 的自组网；TDLS 直连链路则是经协商建立的例外，让两个已关联的站点直接通信。多个 BSS 经 DS 连接构成扩展服务集（ESS），在上层看来就像一个 BSS——同一 SSID 下的多台 Mesh AP 便是如此。Wi-Fi 7 还突破了"一个站点一条链路"的限制：多链路设备（MLD）是一个 MAC 实体，向上只提供一个服务接入点，其下有多个附属站点，各自占用一条链路。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '这一课讲的名称与地址，引擎中都没有：能放上空口的帧种类里没有信标、探测、认证与关联（src/model/frames.ts 的 FRAME_KINDS），所以 SSID 从未被广播，BSSID 与 MAC 地址也不存在——节点只有字符串 id，字段视图里那三个 6 字节的地址位置填入的就是这些 id。每个站点从 0 时刻起就已关联，真实设备要先扫描信道、再完成认证和关联，之后才会发送第一个数据帧。' },
    { kind: 'out-of-scope', text: '一个场景只有一个网络：simulation.ts 取节点表里第一个 kind === ap 的节点作为接入点，其余站点都以它为对端。因此「楼上一台、楼下一台，同一个名称」这种情况只能在课文中讲解，无法在仿真中运行；邻居网络在同一条信道上的竞争与干扰同样不存在。' },
    { kind: 'unmodelled', text: '引擎中根本没有站点到站点直接传送数据的代码路径：p2pvideo 的每一份载荷入队时接收方就写为接入点，最终目的地另外记录（traffic.ts）。所以图中那条「无直接通路」不是一次判定的结果，它对应的是手机收到对方上行帧时的一次解码失败；真实设备有 TDLS 与 Wi-Fi Direct，经协商之后确实可以直接通信。' },
    { kind: 'model-value', text: '每台设备发送什么、包多大、间隔多久，都来自本仿真器编写的到达模型（traffic.ts 的各个 profile），而不是抓包数据。1500 B 一批 50 份的备份、每 0.85 ms 一个 1400 B 的视频帧，都是为了让课程有确定的数字可供观察而选定的，真实业务的包长分布与突发形态要复杂得多。' },
  ],
  sources: [
    '站点的定义是"通往无线介质、可被单独寻址的一个 MAC 与 PHY 接口实例"（IEEE Std 802.11-2024 第 3 章）；AP 是一个同时为其关联 STA 提供分发服务接入的 STA。两者遵守同样的帧格式（第 9 章）与信道接入规则（第 10 章）。',
    'BSS、BSSID、SSID、DS 与 ESS 见 §4.3；SSID 为 0–32 个八位组，BSSID 为 48 位，每个频段一个。把载荷入队的 MAC 数据服务见 §5.2；"深入一层"里的 MAC–PHY 原语见 §8.3。',
    '"接收方如何确定"那四步，是本仿真器里 traffic.ts 与 simulation.ts 的写法：手机之间的载荷入队时接收方就是 AP，最终目的地另外记录，等这一帧被确认之后 AP 才转发。上面其余的每一个数字，都是在本场景中实测得到的。',
  ],
  scenario: rolesStackScenario,
  jumps: [
    J('第一个上行数据帧（笔记本 → AP）', firstUplinkData),
    J('第一个下行数据帧（AP → 电视）', firstDownlinkData),
  ],
  observe: [
    '跳到第一个上行数据帧。笔记本发送的每一帧，接收方都是接入点；在整整一秒内，这个网络中没有任何数据帧是从站点直接发给站点的。',
    '再跳到第一个下行数据帧（接入点 → 电视）。电视那条泳道上没有任何数据帧：只接收数据的设备仍然需要发送，但只是为了应答。',
  ],
  tryThis: [
    '在编辑器里把电视的业务改成 backup（上行备份）再载入。它的泳道上开始出现数据帧，但接收方仍然只有接入点：方向变了，角色没有变。',
  ],
  quiz: [
    {
      q: '楼上一台路由器、楼下一台路由器，用的是同一个网络名称。这是几个网络、几个地址？',
      options: [
        '一个网络、一个地址——名称相同，就是同一个网络',
        '两个网络、两个地址，共用一个名称',
        '两个网络、一个地址：地址由名称决定',
      ],
      answer: 1,
      explain: '标识一个网络的是接入点自己的 MAC 地址，也就是 BSSID，每个接入点一个；SSID 只是用户在列表中选择的名称。把笔记本带到楼下，用户无需做任何选择，它就已经切换到了第二个网络。',
    },
    {
      q: '接入点和站点的区别在哪里？',
      options: [
        '它本身也是一个站点，此外还为关联到它的站点提供一条经 DS 通往外部的路径',
        '它可以不排队直接发送',
        '它没有 MAC 地址，只有一个 SSID',
      ],
      answer: 0,
      explain: '接入点就是一个站点，只是多了一项职责；它自己的 MAC 地址就是 BSSID。它和其他设备一样需要排队——它为手机转发的那一次，也必须重新等待。',
    },
  ],
}
