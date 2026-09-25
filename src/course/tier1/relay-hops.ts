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
  title: '手机发给手机，也要走两趟',
  why: '两部手机就在同一个房间里、同一张网上，中间没有墙。可它们之间的每一份载荷（payload），都要在空口上走两趟：先发给接入点（access point, AP），再由接入点发出去。这一课给这两趟掐一次表，看看第二趟贵在哪儿——不是贵在接入点转发的那点时间。',
  outcomes: [
    '跟着一份载荷走完全程：从一部手机交下来，到另一部手机收上去',
    '说出两跳比一跳多花的是什么，并指出多出来的时间花在哪一步',
    '解释把两部手机挪到一起为什么救不了这件事',
  ],
  needs: ['roles-stack'],
  terms: [
    { term: 'DS', plain: '分发系统：接入点背后把载荷收下、再原样交回来的那套东西——在家里，就是路由器内部的那个网桥' },
  ],
  picture: [
    { heading: '一份载荷，两次发送', text: '一个站点（station, STA）能发送数据的对端只有一个，所以手机 B 发给手机 A 的那个数据帧（data frame），收件人写的是接入点。接入点把载荷交给背后的分发系统（distribution system, DS），又原样拿回来，于是排一次队、等一次机会，再发第二次。屋里两部手机之间没有捷径：走的是这张网，不是那条直线。' },
    { kind: 'watch', jump: 2, heading: '去看一眼', text: '载入仿真，跳到一部手机发给另一部手机的第一帧。它的收件人是接入点，而不是对面那部手机。再跳到下一个目标，看接入点把同一份载荷又发了一次——载荷编号相同。' },
    {
      kind: 'diagram', heading: '一份载荷的全程', spec: relayHopsSequence(),
      caption: '时刻就是时间轴上的时刻。两次发送各带一个确认帧（acknowledgement, ACK），中间是接入点固定 50 µs 的转发；从载荷到达手机 B 到手机 A 作答完毕，全程 389.2 µs。',
    },
  ],
  numbers: [
    { kind: 'steps', heading: '一份载荷，从一部手机到另一部', items: [
      '1.4157 ms，它到达手机 B；屋里正安静，手机 B 立刻把它发了出去。',
      '这一帧长 125.6 µs。接入点在 1.5413 ms 收齐，隔 16 µs 后作答。',
      '这个回复占 28 µs 空口。第一跳在 1.5853 ms 结束，花掉 169.6 µs。',
      '转发花 50 µs，于是 1.6353 ms 时这份载荷进入发往手机 A 的队列（queue），并立刻发出。',
      '到 1.8049 ms，手机 A 已经作答。第二跳同样花 169.6 µs：全程 389.2 µs。',
    ] },
    { kind: 'table', heading: '一跳还是两跳，整整一秒的平均', head: [
      '路程', '空口上几跳', '平均',
    ], rows: [
      ['接入点到电视', '1', '约 0.7 ms'],
      ['手机到手机', '2', '约 1.3 ms'],
    ] },
    { text: '接近两倍——而且不是因为那 50 µs 的转发：389.2 µs 的全程里，转发只占 50 µs。贵的是第二跳自己要排队、要等轮到自己，和第一跳一模一样。' },
  ],
  deeper: [
    { heading: '那 50 µs 是模型，不是标准', text: '接入点把载荷转发出去所花的 50 µs，是本仿真器的取值；真实网桥的时延取决于具体设备，通常还要小一些。就算把它算成 0，两跳也还是 169.6 × 2 = 339.2 µs，对一跳的 169.6 µs——这正是上面那段话想说的：账单在排队和竞争上，不在转发上。' },
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
    '悬停第一跳与第二跳的数据块：载荷编号相同，先发往接入点，再由它发给手机 A。这里没有任何一个数据帧是站点直发站点的。',
    '在笔记本的第一个数据帧处，它先发一个短的预约帧，接着是一个突发：50 份载荷跟在同一个前导码（preamble）后面。跑满一秒，电视的接收数值稳定在约 0.7 ms，而手机互传是 1.3 ms。',
  ],
  tryThis: [
    '把手机 B 拖到手机 A 旁边。每一份载荷仍要绕经接入点，仍约 1.3 ms：路径跟着这张网走，而不是跟着距离走。',
    '把笔记本改成 idle 再跑一遍。手机互传降到约 0.7 ms，电视降到约 0.3 ms——仍接近两倍：中继照样要付两次排队的代价。',
  ],
  quiz: [
    {
      q: '手机 A 给手机 B 发一条消息，两部手机在同一个接入点上。只算成功送达的帧，它在空口上传了几次？',
      options: [
        '一次，直接送过去——它们本来就在同一个基本服务集（basic service set, BSS）里',
        '两次：手机 A 到接入点，接入点再到手机 B',
        '三次：手机 A、接入点、DS，然后手机 B',
      ],
      answer: 1,
      explain: 'DS 把载荷交回同一个接入点，它自己并不是空口上的一跳：两帧，各带一个回复。',
    },
    {
      q: '第二跳为什么和第一跳一样贵？',
      options: [
        '因为接入点要花 50 µs 把它转发过去',
        '因为接入点重新排一次队、重新等一次机会，和任何一台设备一样',
        '因为第二跳的帧更长——多了一层包装',
      ],
      answer: 1,
      explain: '转发只占全程 389.2 µs 里的 50 µs。第二跳贵在它是一次完整的发送：排队、等待、发送、等确认，接入点在这件事上没有任何特权。',
    },
  ],
}
