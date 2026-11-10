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
 * What it takes with it: the five-step relay timeline, the one-hop-against-two
 * table, both observations and both experiments. What it leaves behind: the
 * roles, the names and the addressing rule, which are the first half's topic.
 *
 * §4 gives this lesson a `sequence` figure, and it replaces prose: the path a
 * payload walks used to be narrated twice, once in the picture and once in the
 * steps. The picture now carries one paragraph and the figure; the steps carry
 * the microseconds.
 *
 * Every number quoted below is pinned in tests/course/relay-hops.test.ts.
 */
import type { SequenceSpec } from '../diagram'
import { J, type Lesson } from '../lessonKit'
import {
  rolesStackScenario, firstUplinkData, firstDownlinkData, firstRelayHop1, firstRelayHop2,
} from './roles-stack'

/** The payload one phone hands down, in octets: every p2pvideo arrival of the run carries this many. */
export const RELAY_PAYLOAD_BYTES = 1400
/** What the MAC makes of it on the air, in octets, and how long that takes at 20 MHz. */
export const RELAY_FRAME_BYTES = 1430
export const RELAY_FRAME_US = 125.6
/** The AP's forwarding latency, in microseconds: `RELAY_FWD_NS` in src/engine/simulation.ts. */
export const RELAY_FWD_US = 50
/** The instants the figure prints, exactly as the steps write them. */
export const RELAY_HOP1_AT = '1.4157 ms'
export const RELAY_HOP2_AT = '1.6353 ms'
export const RELAY_DONE_AT = '1.8049 ms'

/**
 * One payload, from Phone B to Phone A: the two transmissions, the two answers
 * and the forward between them. Every instant printed in the gutter is read
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
      { from: 'ap', to: 'sta-4', label: '确认' },
      { from: 'ap', to: 'ap', label: `转发 ${RELAY_FWD_US} µs` },
      { from: 'ap', to: 'sta-3', label: '数据帧', at: RELAY_HOP2_AT, tone: 'accent' },
      { from: 'sta-3', to: 'ap', label: '确认', at: RELAY_DONE_AT },
    ],
  }
}

export const relayHops: Lesson = {
  id: 'relay-hops',
  module: 1,
  title: '手机之间的数据也要经过两跳',
  why: '两部手机位于同一个房间、同一个网络中，中间没有墙。但它们之间的每一份载荷（payload），都要在空口上传送两次：先发给接入点（access point, AP），再由接入点发出。接入点把载荷交给后方的分发系统（distribution system, DS），再原样取回，然后和任何一台设备一样，重新排队、重新等待发送机会、发送、等待对方回复确认帧（acknowledgement, ACK）。所以第二跳与第一跳所用的时间完全相同；接入点转发这一步只占全程的一小部分，即使把它计为零，全程也仍是一跳的两倍。运行满一秒，手机互传的平均时延接近接入点直接发给电视的两倍；笔记本停止发送、信道空闲下来之后，仍是两倍。把两部手机移到一起也不会缩短这段时延，因为路径由网络结构决定，而不由距离决定。',
  outcomes: [
    '跟踪一份载荷的全程：从一部手机的上层交下，到另一部手机接收',
    '说出两跳比一跳多出的开销是什么，并指出多出的时间消耗在哪一步',
    '解释把两部手机移到一起为什么不会缩短这段时延',
  ],
  needs: ['roles-stack'],
  terms: [
    { term: 'DS', plain: '分发系统：接入点后方接收载荷、再原样交回的系统——在家庭中，就是路由器内部的网桥' },
  ],
  picture: [
    { heading: '一份载荷，两次发送', text: '一个站点（station, STA）能发送数据的对端只有一个，所以手机 B 发给手机 A 的那个数据帧（data frame），接收方填的是接入点。接入点把载荷交给后方的分发系统（distribution system, DS），再原样取回，然后重新排队、等待发送机会，再发送第二次。屋里两部手机之间没有捷径：数据沿网络结构传送，而不是沿两者之间的直线。' },
    { kind: 'watch', jump: 2, heading: '在仿真中观察', text: '载入仿真，跳到一部手机发给另一部手机的第一帧。它的接收方是接入点，而不是另一部手机。再跳到下一个目标，可以看到接入点把同一份载荷又发送了一次——载荷编号相同。' },
    {
      kind: 'diagram', heading: '一份载荷的全程', spec: relayHopsSequence(),
      caption: '图中的时刻就是时间轴上的时刻。两次发送各带一个确认帧（acknowledgement, ACK），中间是接入点固定 50 µs 的转发；从载荷到达手机 B 到手机 A 应答完毕，全程 389.2 µs。',
    },
  ],
  numbers: [
    { kind: 'steps', heading: '一份载荷，从一部手机到另一部', items: [
      '1.4157 ms，它到达手机 B；此时信道空闲，手机 B 立即将它发出。',
      '这一帧时长 125.6 µs。接入点在 1.5413 ms 接收完毕，16 µs 后应答。',
      '这个应答在空口上占 28 µs。第一跳在 1.5853 ms 结束，共用时 169.6 µs。',
      '转发用时 50 µs，因此在 1.6353 ms 时这份载荷进入发往手机 A 的队列（queue），并立即发出。',
      '到 1.8049 ms，手机 A 已经应答完毕。第二跳同样用时 169.6 µs：全程 389.2 µs。',
    ] },
    { kind: 'table', heading: '一跳与两跳：整整一秒内的平均时延', head: [
      '路径', '空口跳数', '平均时延',
    ], rows: [
      ['接入点到电视', '1', '约 0.7 ms'],
      ['手机到手机', '2', '约 1.3 ms'],
    ] },
    { text: '接近两倍——而且不是因为那 50 µs 的转发：389.2 µs 的全程里，转发只占 50 µs。开销来自第二跳本身需要排队、需要等待发送机会，与第一跳完全相同。' },
  ],
  deeper: [
    { heading: '那 50 µs 是模型取值，不是标准规定', text: '接入点转发载荷所用的 50 µs，是本仿真器的取值；真实网桥的时延取决于具体设备，通常还要更短。即使把它计为 0，两跳也仍是 169.6 × 2 = 339.2 µs，而一跳是 169.6 µs——这正是上面那段话要说明的：代价在于排队和竞争，而不在于转发。' },
  ],
  limits: [
    { kind: 'model-value', text: '那 50 µs 是一个常数：src/engine/simulation.ts 的 RELAY_FWD_NS，任何负载下都不变。真实网桥的转发时延取决于查表命中、内部队列深度与当时的拥塞，轻载时比这小得多，重载时会大一个数量级——而恰恰在那种情况下，两跳的代价才真正突出。' },
    { kind: 'unmodelled', text: '分发系统在引擎中只有一行代码：接入点确认上行帧之后，把同一份载荷原样重新入队（simulation.ts）。没有转发表、没有地址学习、没有对未知目的地址的泛洪，也没有网桥自身的丢弃。真实网桥需要查表、会泛洪，也会因为表满或广播风暴而丢包。' },
    { kind: 'unmodelled', text: '转发只在上行帧被确认之后发生，上行一旦失败，这份载荷就被丢弃（relayPending.delete）。因此永远不会出现真实网络中常见的那种情形：接入点已经收到，但它的确认帧丢失，站点重发，同一份载荷被转发两次。真实接收端要依靠序列号与重发位去除这种重复，而引擎中没有任何一处读取它们。' },
    { kind: 'unmodelled', text: '第一跳那一帧的第三个地址写的是接入点自己，不是手机 A：解码器按 To DS 规则把 addr3 填成 apId（src/model/frameFields.ts），最终目的地只存在于引擎内部的 finalDst 字段里。真实的上行帧地址 3 就是最终目的地址，接入点正是读取它才知道应转发到哪里——这一点在本课的字段视图中看不出来。' },
  ],
  sources: [
    '分发系统与 BSS 内部的转发见 IEEE Std 802.11-2024 §4.3；把载荷入队的 MAC 数据服务见 §5.2。一个已关联的站点把数据帧发往 AP（To DS = 1），AP 再以 From DS = 1 发出，见第 9 章的地址表 9-30。',
    '16 µs 的静默是 aSIFSTime（§17.4.4）；125.6 µs、28 µs 与 169.6 µs 都是本场景实测。接入点转发的 50 µs 是本仿真器的模型取值（src/engine/simulation.ts 里的 RELAY_FWD_NS），标准里没有这个数。',
  ],
  scenario: rolesStackScenario,
  jumps: [
    J('第一个上行数据帧（笔记本 → AP）', firstUplinkData),
    J('第一个下行数据帧（AP → 电视）', firstDownlinkData),
    J('第一个中继帧，第一跳（手机 B → AP）', firstRelayHop1),
    J('第一个中继帧，第二跳（AP → 手机 A）', firstRelayHop2),
  ],
  observe: [
    '把指针悬停在第一跳与第二跳的数据块上：载荷编号相同，先发往接入点，再由它发给手机 A。这里没有任何数据帧是从站点直接发给站点的。',
    '在笔记本的第一个数据帧处，它先发送一个用于预约信道的短帧，接着是一次突发：50 份载荷共用同一个前导码（preamble）。运行满一秒，电视接收的平均时延稳定在约 0.7 ms，而手机互传是 1.3 ms。',
  ],
  tryThis: [
    '把手机 B 拖到手机 A 旁边。每一份载荷仍要经过接入点，时延仍约 1.3 ms：路径由网络结构决定，而不由距离决定。',
    '把笔记本改成 idle 再运行一遍。手机互传降到约 0.7 ms，电视降到约 0.3 ms——仍接近两倍：中继仍要承担两次排队的代价。',
  ],
  quiz: [
    {
      q: '手机 A 给手机 B 发一条消息，两部手机在同一个接入点上。只算成功送达的帧，它在空口上传了几次？',
      options: [
        '一次，直接发送——它们本来就在同一个基本服务集（basic service set, BSS）里',
        '两次：手机 A 到接入点，接入点再到手机 B',
        '三次：手机 A、接入点、DS，然后手机 B',
      ],
      answer: 1,
      explain: 'DS 把载荷交回同一个接入点，它本身并不是空口上的一跳：共两帧，各有一个应答。',
    },
    {
      q: '第二跳的开销为什么和第一跳一样大？',
      options: [
        '因为接入点需要 50 µs 来转发它',
        '因为接入点要重新排队、重新等待发送机会，和任何一台设备一样',
        '因为第二跳的帧更长——多了一层头部',
      ],
      answer: 1,
      explain: '转发只占全程 389.2 µs 里的 50 µs。第二跳的开销来自它是一次完整的发送：排队、等待、发送、等确认，接入点在这件事上没有任何特权。',
    },
  ],
}
