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
      { from: 'sta-3', to: 'ap', label: '14 帧组成一次突发', at: BURST_AT, tone: 'accent' },
      { from: 'ap', to: 'sta-3', label: 'BlockAck 32 B', at: BA_AT },
    ],
  }
}

export const smallFrames: Lesson = {
  id: 'small-frames',
  module: 2,
  title: '小帧的开销，以及共用前导码的收益',
  why: '上一课的结论是：一帧的空口时间（airtime）= 前导码（preamble）+ 整数个符号（symbol）。但对一个只有十四个字节的应答帧来说，这部分开销几乎全部来自前导码——它没有任何载荷（payload），却同样要占用前面整段前导码。确认帧（acknowledgement, ACK）只携带帧类型、这次交互的剩余时间、接收方和末尾的校验；即使把它的字节数再减少一半，最多也只节省一个符号，前导码保持不变。小帧逐个发送时，每次都要付出一次前导码、一次排队和一次单独应答的开销。标准中最有效的办法是聚合 MPDU（aggregate MPDU, A-MPDU）：把许多已构造好的帧依次排列，每一帧仍保留自己的帧头（MAC header）和校验，前面加一个很短的分隔符，跟在同一个前导码后面一次发完，最后只换回一个块确认（block acknowledgement, BlockAck），用一张位图（bitmap）说明哪几帧已经收到。节省的不是帧头和校验，而是重复的前导码、排队和应答。这一长串超过了本场景设定的长度，所以笔记本先发送请求发送（request to send, RTS）帧预约信道，路由器回复一个允许发送（clear to send, CTS）帧；这两个小帧加起来还不到后面那一长串的百分之三。每一帧写入的持续时间（Duration/ID），覆盖的都是它之后这次预约的剩余部分，所以最后那个应答帧写的是零。',
  outcomes: [
    '说出确认帧（ACK）、请求发送（RTS）、允许发送（clear to send, CTS）与块确认（BlockAck）各自携带哪些内容、各占多少字节',
    '解释为什么小帧的空口时间几乎与它承载的内容无关',
    '算出十四帧组成一次突发之后的字节数，并说出节省的是什么',
    '读懂一次预约中每一帧写入的持续时间（Duration/ID）各覆盖哪一段',
  ],
  needs: ['frame-anatomy-bytes'],
  terms: [
    { term: 'A-MPDU', plain: '把许多已构造好的帧依次排列，跟在同一个前导码后面一次发出' },
    { term: 'BlockAck', plain: '块确认：一整串帧只换回的一个应答，其中有一张位图说明哪几帧已经收到' },
  ],
  picture: [
    { heading: '一个十四字节的应答帧，占用 28 µs', text: '确认帧（acknowledgement, ACK）只包含四项内容：帧类型、这次交互的剩余时间、接收方，以及末尾的校验——一共十四个字节。但它在空口上要占用 28 µs，其中 20 µs 是前导码。小帧的开销几乎全部来自前导码，而前导码与承载的内容毫无关系。' },
    { kind: 'watch', jump: 0, heading: '观察一次突发', text: '载入仿真，跳到第一个 RTS（2.298 ms），再跳到它后面的那个突发。那个长色块包含十四帧，但时间轴上只有一个块——因为它们只使用了一个前导码。' },
    {
      kind: 'diagram', heading: '一次受保护的突发', spec: burstSequence(),
      caption: '笔记本先用一个 20 B 的小帧预约信道，路由器用一个 14 B 的小帧回复允许发送；随后是 21 502 B 的突发，最后是一个 32 B 的应答帧。这四个帧中，只有第三个承载载荷。',
    },
    { heading: '多个帧共用一个前导码', text: '每次只发送一个小帧，就意味着每次都要付出一次前导码、一次排队和一次单独应答的开销。因此站点（STA）把许多已构造好的帧依次排列——每一帧仍有自己的帧头（MAC header）和校验——跟在同一个前导码后面作为一个 PPDU（PHY protocol data unit）发出；返回的也只有一个覆盖全部帧的应答。由这样一组帧合成的 PPDU，在标准中称为聚合 MPDU（aggregate MPDU, A-MPDU）。' },
  ],
  numbers: [
    { kind: 'table', heading: '小帧只携带必需的内容', head: [
      '帧', '内容', '大小',
    ], rows: [
      ['Ack, CTS', '帧控制（Frame Control）、持续时间（Duration/ID）、地址 1（Address 1）、帧校验序列（FCS）', '14 B'],
      ['RTS', '同样的内容，再加地址 2——使应答方能找到发送方', '20 B'],
      ['BlockAck', '块确认（BlockAck）：一整串帧只需一个应答，其中包含两个地址、一个起始序号（sequence number）、一张 64 位位图（bitmap）', '32 B'],
    ] },
    { kind: 'formula', heading: '把这些帧排列在同一个前导码后面', text: '队列里的一个位置 = 4 B 的分隔符 + 那一帧 + 补齐到 4 的倍数的填充', note: 'Wi-Fi 5 笔记本的十四帧一起发送：13 × 1536 + 1534 = 21 502 B，全都跟在同一个前导码后面。只有最后一帧不需要填充（padding）。' },
    { kind: 'steps', heading: '这一串帧的发送过程', items: [
      '笔记本把队列（queue）中的帧逐个排入：每帧 1530 B，前面加 4 B 的分隔符，再补齐到 4 的倍数——十四帧之后共 21 502 B。',
      '这个长度超过了本场景的 RTS 门限（RTS threshold）2000 B，所以它先发送一个 20 B 的 RTS，持续时间写 2356 µs：涵盖 CTS、突发、应答，以及三个间隔。',
      '路由器用一个 14 B 的 CTS 回复允许发送，持续时间写 2312 µs——即同一个预约减去一个间隔和 CTS 本身。',
      '突发随后发出，在空口上占 2248 µs；它本身的持续时间只写 48 µs，因为它后面只剩一个间隔和一个应答。',
      '4.650 ms 时，一个 32 B 的 BlockAck 一次确认十四帧，持续时间写 0：它之后没有后续交互。',
    ] },
  ],
  deeper: [
    { heading: '聚合帧里的确认策略', text: 'QoS 控制里的两个确认策略（Ack Policy）比特，在单独一帧上读作 Normal Ack；同样这两个比特放在 A-MPDU 里，含义是 Implicit Block Ack Request。这正是十四帧只换回一个带 64 位位图、32 B 的 BlockAck，而不是十四个 14 B 的 Ack 的原因。' },
    { heading: '本课没有讲的部分', text: '一串帧中如果有一两帧未被正确接收，位图会标明这些帧，发送端只重发这几帧——这一点、以及“一次竞争成功之后可以发送多久”，是第二阶段 A-MPDU 与 TXOP 两课的主题。本课只计算它们的字节数。' },
  ],
  limits: [
    { kind: 'threshold', text: '十四帧是一个整体：它们合成一个 PSDU，一个比值决定全部十四帧是否都被正确接收，引擎中没有逐子帧的校验（mac.ts 中写明了这是整包解码模型）。因此那张 64 位位图中从不会出现「只有第三帧出错」，BlockAck 要么全是 1，要么这一串整体失败。真实的 A-MPDU 逐个子帧校验，只重发出错的那几个——这也是它可以一次聚合十四帧的依据。' },
    { kind: 'unmodelled', text: '4 个字节的分隔符只计入长度：其中的 CRC-8 与 EOF 位都没有建模（frames.ts 的 ampduSubframeBytes）。真实接收端正是依靠分隔符自身的校验在一串帧中重新定位帧边界，所以一个出错的子帧不会导致其后的子帧全部丢失；本课算出的 21 502 B 中，这 56 个字节在本模型里不起任何作用。' },
    { kind: 'model-value', text: 'RTS 门限 2000 B 是场景直接给定的参数（Scenario.rtsThresholdBytes），标准把 dot11RTSThreshold 留给实现。真实驱动大多根据帧长、最近的重试历史，甚至邻居的密度动态启用或关闭保护，而不是按一个固定的字节数统一处理。' },
    { kind: 'model-value', text: 'RTS 与 CTS 在这里也走「不超过本帧参考速率的最高强制速率」那条规则（mac.ts 的 rtsRate 用 ctrlRespRateForMode），所以本课两个小帧恒为 24 Mb/s、恒为 28 µs。标准只要求 RTS 取自本网络的基本速率集，真实设备常把保护帧降到最低档速率发送，以便更远的站点也能收到——这会使这部分开销明显增加。' },
    { kind: 'model-value', text: '一个突发最多 64 个子帧、最长 5.484 ms（phy.ts 的 MAX_AMPDU_MPDUS 与 MAX_PPDU_NS），实际聚合多少个由队列中当时的帧数决定。真实设备还要考虑两端协商的 BlockAck 窗口与聚合上限，能力不同的两台设备对同一队列中的帧会组成不同长度的突发。' },
  ],
  sources: [
    '控制帧的大小见 IEEE Std 802.11-2024 §9.3.1；A-MPDU 子帧——4 个八位组的分隔符、MPDU，再补齐到 4 字节边界（最后一个不补）——见 §9.8。',
    'RTS/CTS 交换与它们写入的持续时间见 §10.3.2.7；块确认见 §9.3.1.9 与 §10.25。RTS 门限（本场景 2000 B）是本仿真器的场景参数，标准把它留给实现。',
    '上面每一个时长、字节数和时刻，都是在本课场景中实测得到的：它与前一课是同一个房间、同一次运行。',
  ],
  scenario: frameAnatomyScenario,
  jumps: [
    J('第一个 RTS', firstRtsFrame),
    J('第一个 A-MPDU', firstAmpduFrame),
    J('第一个 BlockAck', firstBlockAck),
  ],
  observe: [
    '跳到第一次预约（2.298 ms），再跳到它后面的那个突发：14 帧、21 502 B，全部在一个色块中。覆盖全部帧的那一个应答出现在 4.650 ms，写入的持续时间是 0——它之后没有后续交互。',
    '把指针悬停在那两个小帧上：RTS 20 B、CTS 14 B，各占 28 µs，而且两个都是 24 Mb/s。它们加起来还不到那个突发的百分之三。',
  ],
  tryThis: [
    '在编辑器里把 RTS 门限提高到 21 502 B 以上。突发前面就不再有任何帧：那两个小帧以及它们带来的间隔都被省去了。',
    '把旧笔记本改成 Wi-Fi 5。它原本逐帧发送，现在变成许多帧共用一个前导码的突发，每个突发前还有一次预约；那条泳道也从许多小色块变成几个长色块。',
  ],
  quiz: [
    {
      q: '十四帧共用一个前导码，真正节省的是什么？',
      options: [
        '节省了帧头和校验：十四帧变成了一帧',
        '节省了十三个前导码、十三次排队，以及十三个单独的应答',
        '空口时间没有任何节省；节省的只是发送端的处理开销',
      ],
      answer: 1,
      explain: '每一帧都保留自己的帧头和校验——突发之所以是 21 502 B，原因就在这里。节省的是它们外部那些重复的开销。',
    },
    {
      q: '一个 14 B 的确认帧占 28 µs，其中 20 µs 是前导码。把它缩减为 7 个字节，能节省多少时间？',
      options: [
        '一半：14 µs',
        '最多 4 µs——它仍要占用整数个符号，而前导码保持不变',
        '完全不节省：小帧的时长是固定的',
      ],
      answer: 1,
      explain: '14 B 在 24 Mb/s 下需要两个符号，7 B 只需要一个，节省的就是那一个 4 µs 的符号。前面那 20 µs 与承载的内容无关——这正是小帧单位开销高的原因。',
    },
  ],
}
