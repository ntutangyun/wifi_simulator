/**
 * Wi-Fi Tier 1 · M2 · lesson 1: who is who in a home network.
 *
 * Standard-first shape (2026-11-11). ① is IEEE Std 802.11-2024's architecture: the §3.1
 * definitions of STA, AP, BSS, SSID, DS and ESS, the BSSID field (§9.2.4.3.4), joining and
 * association (§4.3.4, §4.3.5.1), the To DS / From DS address table (Tables 9-3 and 9-60) and
 * intra-BSS distribution (§4.5.2.1). ② marks this simulator against it: one BSS per scene, node
 * names for addresses, no management frames, no TDLS; since W7a (2026-11-11) Address 3 is the DA /
 * SA Table 9-60 requires, and the AP hands an MSDU to the DS when it receives it. ③ reads the run.
 *
 * The scenario builder and the jump predicates are untouched (`relay-hops` loads this scene),
 * so the recorded timeline hash is the one the fixture already holds. Every figure is read back
 * out of the lesson text in tests/course/roles-stack.test.ts.
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
  why: '上一课把链路（link）看作两台设备加上一份速率余量。但一个家庭网络中不止两台设备。IEEE Std 802.11-2024 把每一个可以单独寻址的媒体访问控制（medium access control, MAC）与物理层（physical layer, PHY）接口实例称为站点（station, STA）；接入点（access point, AP）是一个包含一个站点、并为与它关联的站点提供分发服务接入的实体——它也是站点，多出的是通往分发系统（distribution system, DS）的那一项职责。一组同步在一起的站点构成基本服务集（basic service set, BSS）；在有接入点的基本服务集里，标识它的基本服务集标识（basic service set identifier, BSSID）就是接入点那个站点正在使用的 MAC 地址。服务集标识（service set identifier, SSID）只是一个 0 到 32 个八位组的名称，用来标识由一个或多个基本服务集组成的扩展服务集：楼上楼下两台路由器共用一个名称，仍是两个网络、两个地址。非 AP 站点发给接入点的数据帧（data frame）把地址 1（Address 1）填为 BSSID、地址 3 填为最终目的地；目的地在同一个基本服务集里时，接入点收下载荷（payload）、经分发系统后再由它发送第二次。两个非 AP 站点只有建立隧道直连链路之后才能直接发送数据帧。本仿真器每个场景只有一个接入点，没有信标（Beacon）与关联，地址就是节点的名字；屋里没有任何数据帧从站点直接发给站点，两部手机之间的每一份载荷都由接入点转发。',
  outcomes: [
    '按标准的定义说出站点与接入点的区别',
    '区分一个网络的名称（SSID）与标识这个网络的地址（BSSID）',
    '读出一个上行（uplink, UL）数据帧的三个地址各填的是谁，并与表 9-60 逐项对照',
  ],
  // decode-thresholds owns `rate margin`, which this lesson's opening sentence uses
  // to recall where the last one ended: naming it in `needs` is what makes that honest.
  needs: ['radio-primer', 'decode-thresholds'],
  terms: [
    { term: 'BSS', plain: '基本服务集：一组同步在一起的站点；家庭里就是路由器和连接到它的所有设备' },
    { term: 'BSSID', plain: '标识这个基本服务集的地址：接入点那个站点正在使用的 MAC 地址' },
    { term: 'SSID', plain: '0 到 32 个八位组的网络名称，标识一个扩展服务集；多个接入点可以共用同一个' },
    { term: 'DS', plain: '分发系统：把多个基本服务集与有线局域网连成一个扩展服务集的系统——在家庭中，就是路由器内部的网桥' },
  ],
  standard: [
    { heading: '站点与接入点（§3.1）', text: '站点是一个逻辑实体，是通往无线介质（medium）、可以单独寻址的一个 MAC 与 PHY 接口实例。接入点是包含一个站点、并经无线介质为与它关联的站点提供分发服务接入的实体；它由一个站点和一个分发系统接入功能组成。' },
    { heading: '基本服务集与 BSSID（§3.1，§9.2.4.3.4）', text: '基本服务集是一组已经同步在一起的站点。标准特别说明：成为基本服务集的成员，不意味着能与其他所有成员直接通信。BSSID 字段与 MAC 地址格式相同，唯一地标识一个基本服务集；在有接入点的基本服务集里，它就是接入点中那个站点当前使用的 MAC 地址。' },
    { heading: 'SSID、扩展服务集与分发系统（§3.1，§4.3.5）', text: 'SSID 是一个字符串，用来标识组成一个扩展服务集（extended service set, ESS）的各个基本服务集，长度为 0 到 32 个八位组。同一扩展服务集里的基本服务集使用同一个 SSID，但 SSID 相同的两个基本服务集不一定属于同一个扩展服务集。扩展服务集是由一个分发系统连接起来的一个或多个基本服务集，在逻辑链路控制子层看来就像一个 IEEE 802 接入域。' },
    { heading: '加入一个基本服务集（§4.3.4，§4.3.5.1）', text: '站点先按 §11.1.4.5 的同步过程加入基本服务集；要使用有接入点的基本服务集的全部服务，还要完成关联。关联完成时，接入点通知分发系统，于是分发系统知道发往这个站点的数据该交给哪个接入点。' },
    { kind: 'table', heading: '数据帧的三个地址（表 9-3，表 9-60）', head: ['To DS / From DS', '含义', '地址 1', '地址 2', '地址 3'], rows: [
      ['1 / 0', '发往分发系统：非 AP 站点发给接入点', 'RA = BSSID', 'TA = SA', 'DA'],
      ['0 / 1', '离开分发系统：接入点发出', 'RA = DA', 'TA = BSSID', 'SA'],
      ['0 / 0', '同一基本服务集里两个非 AP 站点直接发送（隧道直连链路）', 'RA = DA', 'TA = SA', 'BSSID'],
    ] },
    { kind: 'steps', heading: '一份载荷从手机 B 到同一网络里的手机 A，按标准：逐步说明', items: [
      '手机 B 发出 To DS = 1 的数据帧：地址 1 为 BSSID，地址 2 为手机 B，地址 3 为最终目的地手机 A（表 9-60）。',
      '接入点收到这个 To DS = 1 的帧，在短帧间间隔（short interframe space, SIFS）之后回复确认帧（acknowledgement, ACK）（§10.3.2.11）。',
      '接入点把载荷交给分发系统；目的地与发送方在同一个基本服务集里，“输入”与“输出”是同一个接入点（§4.5.2.1）。',
      '接入点发出 From DS = 1 的数据帧：地址 1 为手机 A，地址 2 为 BSSID，地址 3 为原始发送方手机 B。',
    ] },
  ],
  implementation: [
    { topic: '站点与接入点', standard: '接入点也是站点，多出分发系统接入功能（§3.1）', sim: '照此：接入点与其他站点运行同样的 MAC 与 PHY，同样排队、同样竞争信道；它多出的只是转发。', kind: 'faithful' },
    { topic: 'MAC 地址', standard: '48 位地址，BSSID 是接入点的 MAC 地址（§9.2.4.3.4）', sim: '节点只有字符串名字（ap、sta-1 等），字段视图里三个 6 字节的地址位置填的就是这些名字。', kind: 'differs' },
    { topic: '信标、扫描、认证与关联', standard: '加入基本服务集要同步并关联（§4.3.4）', sim: '未实现：能放上空口的帧种类里没有信标、Probe Request、Probe Response、认证与关联帧；每个站点从 0 时刻起就已关联。', kind: 'absent' },
    { topic: 'SSID', standard: '0 到 32 个八位组的名称', sim: '未实现：没有任何帧携带 SSID。', kind: 'absent' },
    { topic: '几个基本服务集', standard: '可以有多个基本服务集，经分发系统连成扩展服务集（§4.3.5）', sim: '未实现：一个场景只有一个基本服务集，取节点表里第一个接入点，其余站点都以它为对端；没有扩展服务集，也没有同信道的邻居网络。', kind: 'absent' },
    { topic: '同一基本服务集内的转发', standard: '输入与输出是同一个接入点（§4.5.2.1）', sim: '照此：手机之间的载荷入队时接收方就写为接入点，最终目的地写在地址 3；接入点收到第一跳时就把载荷交给分发系统，再排进自己的队列（queue），按最终目的地发送第二跳。', kind: 'faithful' },
    { topic: '上行帧的地址 3', standard: 'To DS = 1 时地址 3 是最终目的地 DA（表 9-60）', sim: '照此：手机发给手机的载荷，第一跳的地址 3 是另一部手机（DA）；下行（downlink, DL）帧的地址 3 是原始发送方（SA），由接入点自己发起的载荷则是接入点。', kind: 'faithful' },
    { topic: '隧道直连链路', standard: 'To DS = 0、From DS = 0 的直连路径（表 9-3）', sim: '未实现：引擎里没有站点到站点直接发送数据帧的路径。', kind: 'absent' },
    { topic: '业务', standard: '标准不涉及', sim: '每台设备发送什么、包多大、间隔多久，都来自本仿真器编写的到达模型，不是抓包数据。', kind: 'value' },
  ],
  labs: [
    {
      heading: '每一个数据帧的一端都是接入点',
      jump: 0,
      steps: [
        '载入本课场景，跳到笔记本发出的第一个数据帧，再跳到接入点发给电视的第一个数据帧。',
        '运行 1 s，按发送方与接收方统计数据帧。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '设备之间的通信关系', spec: rolesStackTopology(),
          caption: '图中的位置就是本场景中的位置。每一条实线的另一端都是接入点；手机到手机的那条虚线上从来没有直接传送过，载荷只能经第一跳、第二跳传送。',
        },
        { kind: 'table', heading: '1 s 内的数据帧，按发送方与接收方', head: ['发送方 → 接收方', '数据帧数'], rows: [
          ['接入点 → 电视', '1089'],
          ['手机 B → 接入点', '612'],
          ['手机 A → 接入点', '629'],
          ['接入点 → 手机 A', '587'],
          ['接入点 → 手机 B', '584'],
          ['笔记本 → 接入点', '16'],
          ['站点 → 站点', '0'],
        ] },
      ],
      expect: '1 s 内共有 3517 个数据帧，每一个的一端都是接入点；没有一个数据帧从站点直接发给站点。电视只接收数据：1 s 内它发出了 1084 帧，没有一个是数据帧，全部是对接入点的应答。',
      meaning: '接入点为两部手机转发，符合 §4.5.2.1（①、②）；站点之间没有直连路径，是因为本仿真器没有实现隧道直连链路（②）。',
    },
    {
      heading: '手机 A 解不出手机 B 的帧',
      jump: 0,
      steps: [
        '在 1 s 的运行里，找手机 A 一侧的接收失败记录，并看手机 B 的数据帧用的是哪一级调制与编码方式（modulation and coding scheme, MCS）。',
        '对照下表读出到达手机 A 的两个电平，再与那一级所需的信干噪比（signal-to-interference-plus-noise ratio, SINR）比较。',
      ],
      blocks: [
        { kind: 'table', heading: '到达手机 A 的电平', head: ['发送方', '到达电平'], rows: [
          ['接入点（20 dBm）', '−43.89 dBm'],
          ['手机 B（15 dBm，相距 6 m）', '−55.04 dBm'],
        ] },
      ],
      expect: '1 s 内，手机 A 收到手机 B 发给接入点的帧却解不出来，记了 551 次 RX_FAIL（原因 lowSinr）；手机 B 发出的 612 个数据帧里有 573 个用 MCS 11，它的所需 SINR 是 38.99 dB，而这条路径只有 38.95 dB。',
      meaning: '这说明手机 A 解不出手机 B 当时用的等级；直接发送是否可行，这个场景并没有测试，因为本仿真器根本没有那条路径（②）。按标准，两部手机要直接通信，也要先建立隧道直连链路（①）。',
    },
    {
      heading: '字段视图里的三个地址',
      jump: 2,
      steps: [
        '跳到手机 B 发给接入点的第一个数据帧（第一跳），打开它的字段视图。',
        '读出 To DS、From DS 与三个地址，再与①的表格比较。',
      ],
      blocks: [
        { kind: 'table', heading: '第一跳的地址字段', head: ['字段', '本仿真器', '按表 9-60 应为'], rows: [
          ['To DS / From DS', '1 / 0', '1 / 0'],
          ['地址 1', 'ap（RA、BSSID）', 'BSSID'],
          ['地址 2', 'sta-4（TA、SA）', '手机 B'],
          ['地址 3', 'sta-3（DA）', '手机 A（DA）'],
        ] },
      ],
      expect: 'To DS 为 1，三个地址都符合表 9-60：地址 1 是接入点（BSSID），地址 2 是手机 B，地址 3 是最终目的地手机 A。',
      meaning: '接入点正是读取第一跳的地址 3，才知道这份载荷要交给分发系统、再发给手机 A（①）；本仿真器照此填写（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§3.1（站点、接入点、基本服务集、SSID、分发系统、扩展服务集的定义）、§4.3.4 与 §4.3.5.1（加入与关联）、§4.5.2.1（同一基本服务集内的分发）、§9.2.4.3.4（BSSID 字段）、表 9-3 与表 9-60（To DS / From DS 与地址字段）、§10.3.2.11（接入点确认 To DS = 1 的帧）；SSID 长度 0 到 32 个八位组见第 6 章 MLME 原语的参数表。',
    '本仿真器的取法：一个场景一个基本服务集、节点名字代替 MAC 地址、没有管理帧、手机之间的载荷由接入点转发；每台设备的业务来自本仿真器的到达模型。上面的每一个数字都是在本场景中实测得到的。',
  ],
  limits: [],
  scenario: rolesStackScenario,
  jumps: [
    J('第一个上行数据帧（笔记本 → AP）', firstUplinkData),
    J('第一个下行数据帧（AP → 电视）', firstDownlinkData),
    J('手机发给 AP 的第一个数据帧（第一跳）', firstRelayHop1),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '楼上一台路由器、楼下一台路由器，用的是同一个网络名称。这是几个基本服务集、几个 BSSID？',
      options: [
        '一个基本服务集、一个 BSSID——名称相同，就是同一个网络',
        '两个基本服务集、两个 BSSID，共用一个 SSID',
        '两个基本服务集、一个 BSSID：地址由名称决定',
      ],
      answer: 1,
      explain: '标识一个基本服务集的是接入点那个站点的 MAC 地址，每个接入点一个（§9.2.4.3.4）；SSID 只是名称，SSID 相同也不一定属于同一个扩展服务集。',
    },
    {
      q: '按标准，同一网络里的两个非 AP 站点要直接发送数据帧，需要什么？',
      options: [
        '什么都不需要，离得近就可以直接发',
        '先建立隧道直连链路，然后用 To DS = 0、From DS = 0 的帧直接发送',
        '不可能：标准禁止站点之间直接通信',
      ],
      answer: 1,
      explain: '表 9-3 把同一基本服务集里两个非 AP 站点之间的直接发送列为 To DS = 0、From DS = 0，用于隧道直连链路的直连路径；本仿真器没有实现它。',
    },
    {
      q: '接入点和站点的区别在哪里？',
      options: [
        '它本身也是一个站点，此外还为关联到它的站点提供经分发系统通往外部的路径',
        '它可以不排队直接发送',
        '它没有 MAC 地址，只有一个 SSID',
      ],
      answer: 0,
      explain: '§3.1：接入点由一个站点和一个分发系统接入功能组成；它自己的 MAC 地址就是 BSSID。它和其他设备一样需要排队——它为手机转发的那一次，也必须重新竞争信道。',
    },
  ],
}
