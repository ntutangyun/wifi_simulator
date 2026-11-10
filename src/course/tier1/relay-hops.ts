/**
 * Wi-Fi Tier 1 · M2 · lesson 2: a message from one phone to another crosses the
 * air twice. Two hops, two queues, two waits — and therefore close to twice the
 * latency, even when the two phones are side by side.
 *
 * The SECOND half of `roles-stack`, split per
 * docs/superpowers/plans/2026-09-25-course-repacing-proposal.md §2 · M2. It
 * loads exactly the scene `roles-stack` loads — the same builder, no variant —
 * so the split adds no scenario and this lesson's recorded hash is
 * `roles-stack`'s, value for value (`sameSceneAs` in its shape suite).
 *
 * Standard-first shape (2026-11-10): ① what IEEE Std 802.11-2024 says about a
 * payload between two stations of one BSS (§4.5.2.1, the address table 9-60,
 * the direct link of §11.20), ② where this simulator follows it and where it
 * does not — the forwarding delay is its own value, there is no TDLS — and ③
 * three runs.
 *
 * 2026-11-11 (W7a): the AP hands the MSDU to the DS when it RECEIVES the first hop
 * (previously only after the sender saw the Ack), Address 3 follows Table 9-60 and
 * duplicates are filtered by <TA, TID, SN> (§10.3.2.14.3). The labs are rewritten
 * around that: the 50 µs forward now runs while the AP answers and waits for the
 * medium, so the second hop starts 25 µs after the Ack (the AP's AIFS[AC_VI], AIFSN 1 in dot11QAPEDCATable;
 * 34 µs until 2026-11-11, when the AP still used the non-AP table) and the whole trip is 364.2 µs.
 *
 * Every figure the lesson prints is read back out of its text and compared
 * with a run in tests/course/relay-hops.test.ts.
 */
import type { SequenceSpec } from '../diagram'
import { J, type Lesson } from '../lessonKit'
import { rolesStackScenario, firstRelayHop1, firstRelayHop2 } from './roles-stack'

/** The payload one phone hands down, in octets: every p2pvideo arrival of the run carries this many. */
export const RELAY_PAYLOAD_BYTES = 1400
/** What the MAC makes of it on the air, in octets, and how long that takes at 20 MHz. */
export const RELAY_FRAME_BYTES = 1430
export const RELAY_FRAME_US = 125.6
/** The AP's forwarding latency, in microseconds: `RELAY_FWD_NS` in src/engine/simulation.ts. */
export const RELAY_FWD_US = 50
/** The instants the figure prints, exactly as the lab's table writes them. */
export const RELAY_HOP1_AT = '1.4157 ms'
export const RELAY_HOP2_AT = '1.6103 ms'
export const RELAY_DONE_AT = '1.7799 ms'

/**
 * One payload, from Phone B to Phone A: the two transmissions, the two answers
 * and the hand-over to the DS, which starts the moment the AP has received the
 * first hop — before its own Ack. Every instant printed in the gutter is read
 * back out of the run by the test, so the figure cannot drift from the timeline.
 */
export function relayHopsSequence(): SequenceSpec {
  return {
    kind: 'sequence',
    columns: [
      { id: 'sta-4', label: '手机 B' },
      { id: 'ap', label: '接入点' },
      { id: 'sta-3', label: '手机 A' },
    ],
    messages: [
      { from: 'sta-4', to: 'ap', label: '数据帧', at: RELAY_HOP1_AT, tone: 'accent' },
      { from: 'ap', to: 'ap', label: `转发 ${RELAY_FWD_US} µs` },
      { from: 'ap', to: 'sta-4', label: '确认' },
      { from: 'ap', to: 'sta-3', label: '数据帧', at: RELAY_HOP2_AT, tone: 'accent' },
      { from: 'sta-3', to: 'ap', label: '确认', at: RELAY_DONE_AT },
    ],
  }
}

export const relayHops: Lesson = {
  id: 'relay-hops',
  module: 1,
  title: '手机之间的数据也要经过两跳',
  why: '在同一个基本服务集（basic service set, BSS）里，两部手机之间没有建立直连时，每一份载荷（payload）都要在空口上传送两次：先发给接入点（access point, AP），由接入点交给分发系统（distribution system, DS），再由同一台接入点发出。IEEE 802.11-2024 §4.5.2.1 写明：目的站点（station, STA）与发送站点属于同一个 BSS 时，接收载荷的“输入”接入点与发出载荷的“输出”接入点是同一台。第二次发送与任何一次发送相同，要重新排队、重新竞争信道、发送并等待确认帧（acknowledgement, ACK），所以第二跳与第一跳用时相同。接入点收完第一跳就把载荷交给分发系统，不等自己的确认帧发完；转发需要多长时间，标准没有规定，本仿真器取 50 µs，这段时间落在接入点回复确认帧、等待介质（medium）空闲的那一段里，并不推迟第二跳。运行满一秒，手机互传的平均时延约为接入点直接发给电视的两倍；把两部手机移到一起，时延也不会缩短，因为路径由网络结构决定，而不由距离决定。标准另外定义了站点之间的直连，本仿真器没有实现。',
  outcomes: [
    '说出标准对同一 BSS 内两台站点之间的载荷规定了什么路径，以及两跳各自的方向比特与地址',
    '跟踪一份载荷的全程，指出多出的时间消耗在哪一步',
    '分清本仿真器的哪些做法照标准、哪些是它自己的取值，哪些与标准不同',
  ],
  needs: ['roles-stack'],
  terms: [
    { term: 'DS', plain: '分发系统：接入点后方接收载荷、再把它交给目的站点所在接入点的系统——在家庭中，就是路由器内部的网桥' },
    { term: 'TDLS', plain: '隧道直连建立：同一 BSS 里的两台站点建立直连、直接收发数据帧的机制' },
  ],
  standard: [
    { heading: '同一个 BSS 里的两台站点（§4.5.2.1）', text: '在基础结构 BSS 中，站点（station, STA）发出的载荷由“输入”接入点接收，交给分发系统；分发系统把它送到目的站点所在 BSS 的“输出”接入点，再由这台接入点在空口上发给目的站点。标准写明：目的站点与发送站点属于同一个 BSS 时，“输入”与“输出”是同一台接入点。' },
    { heading: '接入点与分发系统（§4.3.5.1）', text: '接入点是具有站点功能、又能接入分发系统的实体；非接入点站点先与接入点关联，才能经由它使用分发系统。分发系统负责把目的地址映射到目的站点所在的接入点。标准把空口与分发系统在逻辑上分开，不规定分发系统的内部实现，也没有给出转发所需的时间。' },
    { kind: 'table', heading: '两跳的方向比特与地址（§9.2.4.1.4 表 9-3，§9.3.2.1 表 9-60）', head: ['发送方向', 'To DS', 'From DS', '地址 1', '地址 2', '地址 3'], rows: [
      ['站点 → 接入点', '1', '0', 'RA = BSSID', 'TA = SA', 'DA'],
      ['接入点 → 站点', '0', '1', 'RA = DA', 'TA = BSSID', 'SA'],
    ] },
    { kind: 'steps', heading: '一份载荷从一台站点到同一 BSS 的另一台站点，按标准：逐步说明', items: [
      '发送站点取得发送机会，发出 To DS 为 1、From DS 为 0 的数据帧（data frame）：地址 1（Address 1）是接入点，地址 3 是最终的目的站点（表 9-60）。',
      '接入点正确接收后，相隔一个短帧间间隔（short interframe space, SIFS）回复确认帧；SIFS 的长度由物理层（physical layer, PHY）给出：第 17 章的正交频分复用（orthogonal frequency-division multiplexing, OFDM）物理层（20 MHz 信道间隔）与 5 GHz、6 GHz 频段的 HE 物理层都是 16 µs（§10.3.2.3.3，表 17-24，表 27-61）。',
      '接入点把载荷交给分发系统；目的站点在同一个 BSS 中，分发系统把它交回同一台接入点（§4.5.2.1）。',
      '接入点再次取得发送机会，发出 To DS 为 0、From DS 为 1 的数据帧：地址 1 是目的站点，地址 3 是源站点（表 9-60）。',
      '目的站点相隔 SIFS 回复确认帧，这份载荷送达。',
    ] },
    { heading: '站点之间的直连（§11.20，表 9-3）', text: '标准另外定义了隧道直连建立（tunneled direct link setup, TDLS）：两台站点仍与接入点保持关联，但可以建立直连，在直连路径上直接收发数据帧。直连路径上的数据帧 To DS 与 From DS 都为 0，地址 1 是对端站点。' },
    { heading: '重复帧的识别（§10.3.2.14）', text: '接入点已经收到一帧、但它的确认帧丢失时，发送站点会重发同一帧。接收端为每一帧记录序列号等信息；收到重发比特（Retry bit）为 1 的帧时查找记录，找到相同的就判为重复帧并丢弃，但仍回复确认帧。' },
  ],
  implementation: [
    { topic: '两跳的路径', standard: '同一 BSS 内的载荷由同一台接入点接收并再次发出（§4.5.2.1）', sim: '照此：手机之间的每一份载荷都先发给接入点；接入点收到这一帧就把载荷交给分发系统，再放入发往目的手机的队列（queue），发送第二次。', kind: 'faithful' },
    { topic: '第二跳的发送', standard: '接入点再次在空口上发送（§4.5.2.1）', sim: '接入点为这份载荷重新排队、重新竞争信道、发送并等待确认，流程与第一跳相同。', kind: 'faithful' },
    { topic: '转发时延', standard: '标准未规定', sim: '固定为 50 µs（RELAY_FWD_NS）：接入点收完第一跳的帧之后 50 µs，载荷进入发往目的手机的队列；任何负载下都不变。', kind: 'value' },
    { topic: '分发系统的内部', standard: '标准不规定其实现（§4.3.5.1）', sim: '只有上面那一个固定时延：没有转发表，没有地址学习，也没有网桥自身的丢弃。', kind: 'choice' },
    { topic: '短帧间间隔', standard: 'aSIFSTime 为 16 µs（表 17-24；HE 物理层在 5 GHz、6 GHz 频段，表 27-61）', sim: '照此取 16 µs。', kind: 'faithful' },
    { topic: '第一跳的地址 3', standard: 'To DS 为 1 时，地址 3 是 DA，即最终的目的站点（表 9-60）', sim: '照此：地址 3 是目的手机。', kind: 'faithful' },
    { topic: '第二跳的地址 3', standard: 'From DS 为 1 时，地址 3 是 SA，即源站点（表 9-60）', sim: '照此：地址 3 是源手机。', kind: 'faithful' },
    { topic: '确认帧丢失之后', standard: '站点重发，接收端依据序列号与重发比特丢弃重复帧（§10.3.2.14）', sim: '照此：接入点收到帧就转发，不看发送站点有没有收到确认帧；确认帧丢失时发送站点重发，接入点按〈发送端地址（transmitter address, TA）, 业务标识（traffic identifier, TID）, 序列号〉与重发比特把它判为重复帧丢弃，仍回复确认，同一份载荷只转发一次。本课场景一秒内没有出现确认帧丢失。', kind: 'faithful' },
    { topic: '直连', standard: 'TDLS（§11.20）', sim: '未实现：手机之间没有直连路径，所有载荷都经接入点。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '一份载荷的全程',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一个中继帧的第一跳（手机 B → 接入点）。',
        '依次读出这份载荷在手机 B、接入点、手机 A 三处的记录；再跳到第二跳，确认载荷编号相同。',
      ],
      blocks: [
        { kind: 'diagram', heading: '同一份载荷，两次发送', spec: relayHopsSequence(), caption: '图中的时刻就是时间轴上的时刻：两次发送各带一个确认帧；接入点收完第一跳就把载荷交给分发系统，50 µs 的转发与它的确认帧同时进行。' },
        { kind: 'table', heading: '同一份载荷的六个时刻', head: ['时刻', '事件'], rows: [
          ['1.4157 ms', '载荷到达手机 B，信道空闲，手机 B 立即发出一个 125.6 µs 的数据帧'],
          ['1.5413 ms', '接入点接收完毕，当即把载荷交给分发系统；16 µs 后回复一个 28 µs 的确认帧'],
          ['1.5853 ms', '确认帧结束，第一跳用时 169.6 µs'],
          ['1.5913 ms', '自接收完毕起转发 50 µs，载荷进入发往手机 A 的队列'],
          ['1.6103 ms', '介质自确认帧结束起空闲满 25 µs，即接入点视频类的一个仲裁帧间间隔（arbitration interframe space, AIFS；接入点的 AIFSN 为 1），接入点发出第二跳'],
          ['1.7799 ms', '手机 A 应答完毕；第二跳同样用时 169.6 µs'],
        ] },
      ],
      expect: '两跳各用 169.6 µs，中间只隔 25 µs；50 µs 的转发在接入点回复确认帧、等待介质空闲的这段时间里已经完成。从载荷到达手机 B 到手机 A 应答完毕，全程 364.2 µs。',
      meaning: '路径与标准一致（①）：同一 BSS 内的载荷由同一台接入点发送两次，接入点收到载荷就交给分发系统，不等确认帧（②）。50 µs 是本仿真器取的转发时延（②），它没有推迟第二跳：第二跳开始之前，接入点本来就要发完确认帧、再等介质空闲 25 µs。代价在于第二次接入信道，而不在于转发。',
    },
    {
      heading: '两跳的方向比特与地址',
      jump: 0,
      steps: [
        '在第一跳的数据帧上展开“空中字段”，读出方向比特与三个地址。',
        '跳到第二跳（接入点 → 手机 A），再读一次。',
      ],
      blocks: [
        { kind: 'table', heading: '两跳的方向比特与地址：本仿真器显示的内容', head: ['哪一跳', 'To DS / From DS', '地址 1', '地址 2', '地址 3'], rows: [
          ['第一跳', '1 / 0', '接入点', '手机 B', '手机 A'],
          ['第二跳', '0 / 1', '手机 A', '接入点', '手机 B'],
        ] },
      ],
      expect: '两跳的方向比特与三个地址都与表 9-60 相符：第一跳的地址 3 是手机 A（DA），第二跳的地址 3 是手机 B（SA）；地址 1（Address 1）与地址 2 是这一跳的两端。',
      meaning: '接入点正是读取第一跳的地址 3，才知道这份载荷要转发给谁（①）；第二跳的地址 3 让手机 A 知道载荷原本来自手机 B。本仿真器照此填写（②）。',
    },
    {
      heading: '一跳与两跳的平均时延',
      steps: [
        '载入本课场景，运行满一秒（1000 ms），读出电视与两部手机各自的平均时延。',
        '在编辑器里把笔记本的业务改为 idle，再运行一秒。',
        '恢复本课场景，把手机 B 拖到手机 A 旁边（x = 2.5 m，y = 6 m），再运行一秒。',
      ],
      blocks: [
        { kind: 'table', heading: '运行一秒的平均时延', head: ['场景', '电视（一跳）', '手机 A（两跳）', '手机 B（两跳）'], rows: [
          ['本课场景', '0.60 ms', '1.13 ms', '1.19 ms'],
          ['笔记本改为 idle', '0.28 ms', '0.59 ms', '0.61 ms'],
          ['手机 B 移到手机 A 旁边', '0.60 ms', '1.17 ms', '1.15 ms'],
        ] },
      ],
      expect: '每一行里手机互传的时延都约为电视的两倍；两部手机相距 0.5 m 时，时延没有缩短到一跳的水平，仍约为电视的两倍。',
      meaning: '路径由网络结构决定（①）：同一 BSS 内没有直连时，每份载荷都经接入点发送两次；本仿真器没有实现直连（②），所以把手机移近不改变路径。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§4.3.5.1（接入点与分发系统）、§4.5.2.1（同一 BSS 内的分发，输入与输出接入点相同）、§9.2.4.1.4 与表 9-3（To DS / From DS）、§9.3.2.1 与表 9-60（数据帧的地址字段）、§10.3.2.3.3、表 17-24 与表 27-61（SIFS，16 µs）、§10.3.2.14（重复帧的识别）、§11.20（TDLS）。',
    '本仿真器的取值与取法：接入点转发时延 50 µs（src/engine/simulation.ts 的 RELAY_FWD_NS），自接入点收完第一跳的帧起算。125.6 µs、28 µs、25 µs、169.6 µs 与各个时刻都是本课场景的实测值。',
  ],
  limits: [],
  scenario: rolesStackScenario,
  jumps: [
    J('第一个中继帧，第一跳（手机 B → AP）', firstRelayHop1),
    J('第一个中继帧，第二跳（AP → 手机 A）', firstRelayHop2),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '手机 A 给手机 B 发一条消息，两部手机连在同一个接入点上，没有建立直连。只算成功送达的帧，它在空口上传了几次？',
      options: [
        '一次，直接发送——它们本来就在同一个 BSS 里',
        '两次：手机 A 到接入点，接入点再到手机 B',
        '三次：手机 A、接入点、DS，然后手机 B',
      ],
      answer: 1,
      explain: '§4.5.2.1：目的站点在同一个 BSS 里时，输入与输出接入点是同一台。DS 把载荷交回这台接入点，它本身不是空口上的一跳：共两帧，各有一个确认帧。',
    },
    {
      q: '第二跳的开销为什么和第一跳一样大？',
      options: [
        '因为接入点需要 50 µs 来转发它',
        '因为接入点要重新排队、重新竞争信道、发送并等待确认，和任何一台设备一样',
        '因为第二跳的帧更长——多了一层帧头（MAC header）',
      ],
      answer: 1,
      explain: '50 µs 的转发与接入点回复确认帧的时间重叠，并没有推迟第二跳，而且 50 µs 是本仿真器的取值。全程 364.2 µs 里两跳各占 169.6 µs：第二跳的开销来自它是一次完整的发送。',
    },
    {
      q: '按表 9-60，第一跳（站点 → 接入点）的数据帧里，地址 3 应当填什么？',
      options: [
        '接入点，也就是基本服务集标识（basic service set identifier, BSSID）',
        '最终的目的站点（DA），这里是另一部手机',
        '发送站点自己（SA）',
      ],
      answer: 1,
      explain: 'To DS 为 1 时地址 3 是 DA；本仿真器照此在第一跳的地址 3 写出目的手机（②）。',
    },
  ],
}
