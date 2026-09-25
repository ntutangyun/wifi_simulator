/**
 * Wi-Fi Tier 1 · M3 · lesson 4: what a small frame costs, and what one preamble
 * buys when fourteen frames queue up behind it.
 *
 * The SECOND half of `frame-anatomy-bytes`, split per
 * docs/superpowers/plans/2026-09-25-course-repacing-proposal.md §2 · M3. It
 * loads exactly the scene its parent loads — `frameAnatomyScenario`, no variant
 * — so the split adds no scenario and this lesson's recorded hash is
 * `frame-anatomy-bytes`', value for value (`sameSceneAs` in its shape suite).
 *
 * What it takes with it: the control-frame sizes, the aggregation formula, the
 * reservation durations, the burst observation, the RTS-threshold experiment
 * and the quiz about what fourteen frames behind one front really save. The
 * bytes→microseconds procedure stays next door: this lesson uses its result.
 *
 * §4 gives it a `sequence` figure — RTS, CTS, the burst, the one reply — and it
 * replaces prose: the paragraph that narrated that exchange is gone, and the
 * durations each frame reserves stay in the table under the figure.
 *
 * Every number quoted below is pinned in tests/course/small-frames.test.ts.
 */
import type { SequenceSpec } from '../diagram'
import { J, type Lesson } from '../lessonKit'
import {
  frameAnatomyScenario, firstRtsFrame, firstAmpduFrame, firstBlockAck,
} from './frame-anatomy'

/** The burst this lesson walks: fourteen frames, in octets, as the run builds it. */
export const BURST_MPDUS = 14
export const BURST_BYTES = 21_502
/** The instants the figure prints, exactly as the prose writes them. */
export const RTS_AT = '2.298 ms'
export const BURST_AT = '2.386 ms'
export const BA_AT = '4.650 ms'

/**
 * One protected burst, end to end: the reservation, the go-ahead, the fourteen
 * frames behind one preamble and the single reply. The instants in the gutter
 * are read back out of the run by the test, so the figure cannot drift from
 * the timeline.
 */
export function burstSequence(): SequenceSpec {
  return {
    kind: 'sequence',
    columns: [
      { id: 'sta-3', label: '笔记本' },
      { id: 'ap', label: '路由器' },
    ],
    messages: [
      { from: 'sta-3', to: 'ap', label: 'RTS 20 B', at: RTS_AT },
      { from: 'ap', to: 'sta-3', label: 'CTS 14 B' },
      { from: 'sta-3', to: 'ap', label: '14 帧一个突发', at: BURST_AT, tone: 'accent' },
      { from: 'ap', to: 'sta-3', label: 'BlockAck 32 B', at: BA_AT },
    ],
  }
}

export const smallFrames: Lesson = {
  id: 'small-frames',
  module: 2,
  title: '小帧的成本，和一个前导码的买卖',
  why: '上一课算出：一帧的空口时间（airtime）= 前导码（preamble）+ 整数个符号（symbol）。可对一个只有十四个字节的回复来说，这笔账几乎全在前导码上——它载荷（payload）一个字节都没有，却照样要付前面那一整段。这一课先给小帧算一次账，再看标准里最划算的一招：把许多帧排在同一个前导码后面，一次发完。',
  outcomes: [
    '说出确认帧（ACK）、请求发送（RTS）、允许发送（clear to send, CTS）与块确认（BlockAck）各自带什么、各占多少字节',
    '解释为什么小帧的空口时间几乎与它装了什么无关',
    '算出十四帧排成一个突发之后有多少字节，并说出省下的是什么',
    '读懂一次预约里每一帧写的持续时间（Duration/ID）各罩住了哪一段',
  ],
  needs: ['frame-anatomy-bytes'],
  terms: [
    { term: 'A-MPDU', plain: '把许多造好的帧排成一队，跟在同一个前导码后面一次发出去' },
    { term: 'BlockAck', plain: '块确认：一整串帧只换回来的那一个回复，里面有一张位图说明哪几帧收到了' },
  ],
  picture: [
    { heading: '一个十四字节的回复，要花 28 µs', text: '确认帧（acknowledgement, ACK）里只有四样东西：这是什么帧、这次交互还剩多久、发给谁，以及末尾的校验——一共十四个字节。可它在空口上要占 28 µs，其中 20 µs 是前导码。小帧的账单几乎全在前面那一段上，而那一段与你装了什么毫无关系。' },
    { kind: 'watch', jump: 0, heading: '去看一次突发', text: '载入仿真，跳到第一个 RTS（2.298 ms），再跳到它后面的那个突发。那个长块是十四帧，可时间轴上只有一个块——因为它们只用了一个前导码。' },
    {
      kind: 'diagram', heading: '一次受保护的突发', spec: burstSequence(),
      caption: '笔记本先用一个 20 B 的小帧把房间要下来，路由器用一个 14 B 的小帧放行；随后是 21 502 B 的突发，最后是一个 32 B 的回复。四样东西里，只有第三样在搬运载荷。',
    },
    { heading: '很多帧，共用一个前导码', text: '一次只发一个小帧，就意味着每次都要付一遍前导码、排一遍队、等一个各自的回复。于是站点（STA）把许多造好的帧排成一队——每一帧仍有自己的帧头（MAC header）和校验——跟在同一个前导码后面作为一个 PPDU（PHY protocol data unit）发出；回来的也只有一个覆盖全部的回复。' },
  ],
  numbers: [
    { kind: 'table', heading: '小帧只带非带不可的东西', head: [
      '帧', '里面有什么', '大小',
    ], rows: [
      ['Ack, CTS', '帧控制（Frame Control）、持续时间（Duration/ID）、地址 1（Address 1）、帧校验序列（FCS）', '14 B'],
      ['RTS', '同样的内容，再加地址 2——回复得找得到它', '20 B'],
      ['BlockAck', '块确认（BlockAck）：一整串帧只换一个回答，里面是两个地址、一个起始序号（sequence number）、一张 64 位位图（bitmap）', '32 B'],
    ] },
    { kind: 'formula', heading: '把它们排在一个前导码后面', text: '队列里的一个位置 = 4 B 的分隔符 + 那一帧 + 补齐到 4 的倍数的填充', note: 'Wi-Fi 5 笔记本的十四帧一起走：13 × 1536 + 1534 = 21 502 B，全都跟在同一个前导码后面。只有最后一个不必填充（padding）。' },
    { kind: 'steps', heading: '这一串是怎么被放出去的', items: [
      '笔记本把队列（queue）里的帧一个个排进去：每帧 1530 B，前面 4 B 的分隔符，再补齐到 4 的倍数——十四个之后是 21 502 B。',
      '这个长度超过了本场景的预约门限 2000 B，所以它先发一个 20 B 的 RTS，持续时间写 2356 µs：放行帧、突发、回复，外加三个间隔。',
      '路由器用一个 14 B 的 CTS 放行，持续时间写 2312 µs——同一个预约，减去一个间隔和它自己。',
      '突发随后发出，占 2248 µs 空口；它自己的持续时间只写 48 µs，因为它后面只剩一个间隔和一个回复。',
      '4.650 ms，一个 32 B 的 BlockAck 一次回答十四帧，持续时间写 0：它后面什么都没有了。',
    ] },
  ],
  deeper: [
    { heading: '聚合帧里的确认策略', text: 'QoS 控制里的两个确认策略（Ack Policy）比特，在单独一帧上读作 Normal Ack；同样这两个比特放在 A-MPDU 里，含义是 Implicit Block Ack Request。这正是十四帧只换回一个带 64 位位图、32 B 的 BlockAck，而不是十四个 14 B 的 Ack 的原因。' },
    { heading: '这一课没讲的那一半', text: '一串帧里如果有一两帧没被收下，那张位图会把它们点出来，发送端只补发那几帧——这件事、以及“赢一次可以发多久”，是第二阶段 A-MPDU 与 TXOP 两课的题目。这里只数它们的字节。' },
  ],
  sources: [
    '控制帧的大小见 IEEE Std 802.11-2024 §9.3.1；A-MPDU 子帧——4 个八位组的分隔符、MPDU，再补齐到 4 字节边界（最后一个不补）——见 §9.8。',
    'RTS/CTS 交换与它们写入的持续时间见 §10.3.2.7；块确认见 §9.3.1.9 与 §10.25。预约门限（本场景 2000 B）是本仿真器的场景参数，标准把它留给实现。',
    '上面每一个时长、字节数和时刻，都是在本课场景里实测出来的：它与前一课是同一个房间、同一次运行。',
  ],
  scenario: frameAnatomyScenario,
  jumps: [
    J('第一个 RTS', firstRtsFrame),
    J('第一个 A-MPDU', firstAmpduFrame),
    J('第一个 BlockAck', firstBlockAck),
  ],
  observe: [
    '跳到第一次预约（2.298 ms），再跳到它后面的那个突发：14 帧、21 502 B，全都是一个块。覆盖全部的那一个回复出现在 4.650 ms，写的持续时间是 0——它后面什么都没有了。',
    '悬停那两个小帧：RTS 20 B、CTS 14 B，各占 28 µs，而且两个都是 24 Mb/s。它们加起来还不到那个突发的百分之三。',
  ],
  tryThis: [
    '在编辑器里把预约门限抬到 21 502 B 以上。突发前面就什么都没有了：那两个小帧、以及它们带来的间隔都省掉了。',
    '把旧笔记本改成 Wi-Fi 5。它原本一帧一帧地发，变成许多帧共用一个前导码的突发，每个突发前还有一次预约；那条泳道也从许多小块变成几个长块。',
  ],
  quiz: [
    {
      q: '十四帧共用一个前导码，真正省下的是什么？',
      options: [
        '省下帧头和校验：十四帧变成了一帧',
        '省下十三个前导码、十三次排队，以及十三个各自的回复',
        '空口上什么也没省；省的只是发送端的活儿',
      ],
      answer: 1,
      explain: '每一帧都保留自己的帧头和校验——突发之所以是 21 502 B，原因就在这里。省掉的是它们外面那些重复。',
    },
    {
      q: '一个 14 B 的确认帧占 28 µs，其中 20 µs 是前导码。把它砍成 7 个字节，会省多少？',
      options: [
        '一半：14 µs',
        '最多 4 µs——它还得占满整数个符号，而前导码一点不动',
        '什么都不省：小帧的时长是固定的',
      ],
      answer: 1,
      explain: '14 B 在 24 Mb/s 下要两个符号，7 B 只要一个，省下的就是那一个 4 µs 的符号。前面那 20 µs 与装了什么无关——这正是小帧贵的原因。',
    },
  ],
}
