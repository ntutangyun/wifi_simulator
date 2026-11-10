/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · TXOP, a bounded time on the medium.
 *
 * **Standard-first shape (2026-11-11).** ① states what IEEE Std 802.11-2024 specifies: the TXOP as
 * the unit of allocation (§10.23.1), multiple frame exchange sequences a SIFS apart and only of the
 * primary AC (§10.23.2.8), the TXOP limit and what a limit of 0 allows (§10.23.2.9, Table 9-194),
 * truncation by CF-End (§10.23.2.10) and the backoff the holder invokes when its last PPDU has gone
 * (§10.23.2.2 item b, CW reset to CWmin). ② says what the engine does with each; ③ is four guided
 * runs. The audit found the burst rules faithful; the reverse direction protocol (§10.29), TXOP
 * sharing (§10.23.2.7) and the Beacon that advertises the limits are absent, and what the engine
 * does after a failure inside a TXOP is one of the options the standard leaves open.
 *
 * The scenario builder and the jump predicates are unchanged, so the recorded timeline hash stays
 * identical. Every figure below is pinned in tests/course/txop.test.ts against a 300 ms run.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstTxop, J } from '../lessonKit'

/**
 * This run's first burst against the time it was allowed, to scale. Every figure is a record of the
 * base run, relative to the TXOP_START at 0.883 ms: the two data frames at 0–188 and 248–436 µs,
 * the two answers at 204–232 and 452–480, the TXOP_END at 480, and the limit, 4 096 µs from
 * `EDCA_PARAMS` for AC_VI.
 */
export function txopBurstTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '接入点', spans: [
        { fromUs: 0, toUs: 188, label: '两帧视频，各 188 µs', tone: 'accent' },
        { fromUs: 248, toUs: 436, tone: 'accent' },
      ] },
      { label: '两台电视', spans: [
        { fromUs: 204, toUs: 232, label: '各一个确认' },
        { fromUs: 452, toUs: 480 },
      ] },
      { label: '上限', spans: [{ fromUs: 0, toUs: 4096, label: '4 096 µs' }] },
    ],
    axis: { fromUs: 0, toUs: 4200, ticks: [0, 1000, 2000, 3000, 4000], unit: 'µs（0 是本轮开始）' },
  }
}

export const txop: Lesson = {
  id: 'txop',
  module: 7,
  title: 'TXOP——一次竞争成功，换来一段信道占用时间',
  why: 'IEEE 802.11-2024 里，竞争成功换来的不是一次交换，而是一段传输机会（transmit opportunity, TXOP）：它有起始时刻和最大长度，持有者在其中可以连续进行多次帧交换，每两次之间只隔一个短帧间间隔（short interframe space, SIFS）。SIFS 比任何一类的仲裁帧间间隔（arbitration interframe space, AIFS）都短，其他站点（station, STA）无法在其间开始竞争。TXOP 的长度包括对方的应答，不得超过这一接入类别（access category, AC）的 TXOP 上限（TXOP limit），默认值视频 4.096 ms、语音 2.080 ms、尽力而为与后台 2.528 ms；上限为 0 时一次只能发一个数据单元，或者由多个 MPDU（MAC protocol data unit）聚合成的一个聚合 MPDU（aggregate MPDU, A-MPDU）。持有者只能发送取得 TXOP 的那一类的帧。最后一个 PPDU（PHY protocol data unit）发完之后，持有者立即调用一次退避（backoff），与队列（queue）里是否还有帧无关。本课场景里，接入点（access point, AP）的视频突发最长的一串也不到上限的八分之一，每一串都因发往电视的队列已空而结束；交还之后的那次退避提前完成了下一次竞争的倒数，于是 463 串突发里有 414 串在帧到达的同一纳秒发出。这可以算作公平：所有站点遵守同一条规则，竞争过程本身不变，改变的只是每次竞争成功能发多少；代价是晚到的站点要等别人的一整串结束，上限限定了这段等待。',
  outcomes: [
    '说出 TXOP 内连续发送的条件，以及 TXOP 上限包括哪些时间',
    '从仿真中读出每一串突发因何结束，并与上限比较',
    '说明持有者交还信道之后为什么立即退避，以及本仿真器在哪些地方没有实现标准的机制',
  ],
  needs: ['edca', 'ampdu'],
  terms: [
    { term: 'TXOP', plain: '传输机会：竞争成功的站点可以连续占用介质的一段时间，期间可以连续进行多次帧交换' },
    { term: 'TXOP limit', plain: 'TXOP 的最长时长，按接入类别分别规定，包括对方的应答' },
  ],
  standard: [
    { heading: 'TXOP（§10.23.1）', text: '混合协调功能下分配发送权的基本单位是 TXOP。每个 TXOP 由一个起始时刻和一个最大长度确定；在增强型分布式信道接入（enhanced distributed channel access, EDCA）下，站点在竞争中取得的 TXOP 称为 EDCA TXOP。' },
    { heading: '一个 TXOP 里的多次帧交换（§10.23.2.8）', text: '持有者的发送队列里还有同一接入类别（主 AC）的帧交换，而且这次交换的时长短于剩余的 TXOP 时间时，持有者可以在上一次交换完成后隔一个 SIFS 开始这次交换，同时受 TXOP 上限的约束。其他接入类别的帧不得在这个 TXOP 里发送，除非符合 §10.23.2.7 的 TXOP 共享规则。HT 站点还可以把同一类的多个 MPDU 装进一个 A-MPDU，只要它加上预期的块确认（block acknowledgement, BlockAck）短于剩余时间。' },
    { heading: 'TXOP 上限（§10.23.2.9，表 9-194）', text: 'TXOP 的时长是持有者不间断地控制介质（medium）的时间，包括对方作为即时应答发送的帧；上限非零时，持有者必须保证 TXOP 不超过它（另有少数例外，例如单个 MPDU 的重传（retry））。上限由接入点在信标（Beacon）与 Probe Response 帧的 EDCA 参数集（parameter set）元素里通告。上限为 0 表示一次只能发一个数据单元或一个 A-MPDU，加上所需的应答与保护帧。' },
    { kind: 'table', heading: 'TXOP 上限的默认值（表 9-194，第 17、18、19、21、27 章的物理层（physical layer, PHY））', head: ['接入类别', 'TXOP 上限'], rows: [
      ['AC_VO', '2.080 ms'],
      ['AC_VI', '4.096 ms'],
      ['AC_BE', '2.528 ms'],
      ['AC_BK', '2.528 ms'],
    ] },
    { heading: '交还与退避（§10.23.2.10，§10.23.2.2）', text: '持有者清空了发送队列时，可以发一个 CF-End（contention-free end）帧提前结束 TXOP，其他站点收到后把网络分配向量（network allocation vector, NAV）清零。持有者在 TXOP 里发出的最后一个 PPDU 发送完毕、TXNAV 定时器到期时，调用一次退避过程（§10.23.2.2 第 b) 项），并把竞争窗口（contention window, CW）复位到最小竞争窗口（minimum contention window, CWmin）、QSRC 清零；这一条不以队列里还有帧为条件。另有反向传输协议（§10.29）：持有者可以把 TXOP 剩余的时间让给对端发送。' },
    { kind: 'steps', heading: '一个 EDCA TXOP，按标准：逐步说明', items: [
      'EDCAF 在时隙（slot time）边界上计数为零且有帧，发起 TXOP（§10.23.2.4）；TXOP 从这一刻开始，长度不得超过这一类的 TXOP 上限（§10.23.2.9）。',
      '完成第一次帧交换：一个 PPDU、一个 SIFS、对方的应答。',
      '队列里还有同一类的帧，而且下一次交换（SIFS、PPDU、SIFS、应答）能在剩余时间内完成，持有者隔一个 SIFS 继续发送（§10.23.2.8）。',
      '剩余时间不够、队列已空，或者交换失败，TXOP 结束；持有者可以发 CF-End 提前结束（§10.23.2.10）。',
      '最后一个 PPDU 发完，持有者调用退避过程，CW 复位到 CWmin（§10.23.2.2 第 b) 项）。',
    ] },
  ],
  implementation: [
    { topic: 'TXOP 的起止', standard: '从发起时刻开始，不超过 TXOP 上限，包括应答（§10.23.2.9）', sim: '照此处理：发出第一帧的时刻加上上限就是期限，每次交换连同应答都必须在期限之前结束。', kind: 'faithful' },
    { topic: '续发的条件', standard: '同一类还有帧，下一次交换短于剩余时间，隔一个 SIFS 发送（§10.23.2.8）', sim: '照此处理：收到应答后看同一类的队头，整次交换能在期限前结束就隔 16 µs 发送，否则交还。', kind: 'faithful' },
    { topic: '上限的取值', standard: '默认值见表 9-194；由接入点在信标里通告（§10.23.2.9）', sim: '四个上限是引擎里的常量，取表 9-194 的值；没有信标，场景不能通告另一套上限。', kind: 'value' },
    { topic: '只发主 AC 的帧', standard: '其他类的帧不得在这个 TXOP 里发送，TXOP 共享与多业务标识（traffic identifier, TID）的 A-MPDU 除外（§10.23.2.7，§10.23.2.8）', sim: '只看取得 TXOP 的那一类的队列；TXOP 共享与多 TID 聚合没有实现。', kind: 'absent' },
    { topic: '交还之后的退避', standard: '最后一个 PPDU 发完即调用退避，CW 复位到 CWmin（§10.23.2.2 第 b) 项）', sim: '照此处理：TXOP 一结束就再等一段 AIFS、抽取一次退避值，与队列是否为空无关。', kind: 'faithful' },
    { topic: '用 CF-End 提前结束', standard: '队列清空时可以发 CF-End（§10.23.2.10）', sim: '只在第一帧通告了比实际更长的占用时间时才发；本课的突发只保护第一次交换，不发 CF-End。', kind: 'choice' },
    { topic: 'TXOP 中途失败', standard: '非首个 PPDU 失败时，可以在 PIFS 后恢复、退避，或等 TXNAV 到期（§10.23.2.2，§10.23.2.8）', sim: '任何一次交换失败都结束 TXOP，CW 加倍并重新退避。', kind: 'choice' },
    { topic: 'SIFS 期间有人发送', standard: '标准未单独规定', sim: 'SIFS 结束时介质已经忙，就不再续发，交还 TXOP。', kind: 'choice' },
    { topic: '反向传输', standard: '持有者可以把剩余时间让给对端（§10.29）', sim: '没有实现。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '第一串突发',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一次 TXOP 开始。',
        '依次查看两帧视频与两个确认帧（acknowledgement, ACK），对照下图与下表。',
      ],
      blocks: [
        { kind: 'diagram', heading: '第一串突发与它的上限', spec: txopBurstTiming(), caption: '两帧视频、两个确认帧（acknowledgement, ACK），480 µs 就结束了，而上限是 4 096 µs。' },
        { kind: 'table', heading: '第一串突发，按步骤计算', head: ['步骤', '数值'], rows: [
          ['第一帧发送的时刻', '0.883 ms'],
          ['期限：再加 VI 的上限 4 096 µs', '4.979 ms'],
          ['发给电视 2，188 µs，再加 16 + 28 µs：收到应答', '1.115 ms'],
          ['下一次交换需要 16 + 188 + 16 + 28', '248 µs'],
          ['它在 1.363 ms 结束，早于期限 4.979 ms', '可以容纳'],
          ['隔一个 SIFS，发给电视 1 的帧开始', '1.131 ms'],
          ['应答到达，队列已空，TXOP 结束', '1.363 ms'],
          ['实际占用，上限为 4 096 µs', '480 µs'],
        ] },
      ],
      expect: '你应该看到：接入点在 0.883 ms 发出第一帧，两次交换之间只隔 16 µs，没有 AIFS，也没有倒数；TXOP 在 1.363 ms 结束，共 480 µs。',
      meaning: '这说明：续发的条件照标准（①、②）；结束这串突发的是队列已空，不是上限。',
    },
    {
      heading: '每一串突发因何结束',
      steps: [
        '运行 300 ms。',
        '统计接入点每一串突发的帧数与时长。',
      ],
      blocks: [
        { kind: 'table', heading: '300 ms 里接入点的突发', head: ['300 ms 之内', '数值'], rows: [
          ['发起的 TXOP', '463'],
          ['已经结束、只发一帧的', '219'],
          ['已经结束、发两帧的', '243'],
          ['最短的突发', '232 µs'],
          ['最长的突发', '480 µs'],
          ['平均', '362.4 µs'],
          ['VI 的 TXOP 上限', '4 096 µs'],
        ] },
      ],
      expect: '你应该看到：已经结束的 462 串突发里，219 串只发一帧，243 串发两帧；最长的一串 480 µs，不到上限的八分之一。第 463 串在 300 ms 结束时还没有结束。',
      meaning: '这说明：上限只有在发送方积压的数据超过它所能容纳的量时才起作用（①）；这里两台电视的视频流量不大，每一串都在队列清空时结束。',
    },
    {
      heading: '交还之后立即退避',
      jump: 1,
      steps: [
        '跳到突发结束后的那次退避抽取。',
        '看它之前的 AIFS 从何时开始，抽到几，以及倒数结束时队列里有没有帧。',
        '再跳到下一串突发，看它开始之前有没有 AIFS 与倒数。',
      ],
      expect: '你应该看到：第一串突发在 1.363 ms 结束，队列已空；25 µs 之后接入点抽到 6 并倒数完毕。下一帧在 1.652 ms 到达，在同一纳秒发出，前面没有 AIFS，也没有倒数。300 ms 里 463 串突发有 414 串是在帧到达的同一纳秒发出的；抽取一共 462 次，每一次都紧跟在一串突发之后。',
      meaning: '这说明：最后一个 PPDU 发完就调用退避，不以队列有帧为条件（①）。倒数在空闲时已经完成，下一帧到达时只要介质空闲就可以直接发送。',
    },
    {
      heading: '关掉接入点的 TXOP',
      steps: [
        '在功能面板里关掉接入点的 TXOP，再载入并运行 300 ms。',
        '统计接入点发出的数据帧（data frame）数与退避抽取的次数。',
      ],
      expect: '你应该看到：接入点发出的数据帧仍是 707 帧，但退避抽取从 462 次增加到 706 次：每发完一帧就要抽取一次。',
      meaning: '这说明：关掉 TXOP 相当于上限为 0、一次只发一个数据单元（①），每一帧都要单独承担一次竞争的开销。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.23.1（TXOP 的定义）、§10.23.2.8（一个 TXOP 里的多次帧交换、A-MPDU 加块确认短于剩余时间）、§10.23.2.7（TXOP 共享）、§10.23.2.9 与表 9-194（TXOP 上限及其默认值、上限为 0 的含义）、§10.23.2.10（CF-End）、§10.23.2.2 第 b) 项（最后一个 PPDU 发完后的退避，CW 复位）、§10.23.2.4（发起 TXOP）、§10.29（反向传输协议）。',
    '本仿真器的取值与取法：常量的上限表、失败即结束 TXOP、SIFS 期间介质变忙即交还。两台电视、它们的视频流量、随机种子与本轮采用的编码都是本仿真器的场景，可以复现；一帧视频 188 µs 由这个编码决定。',
  ],
  limits: [],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV 1', 'sta', 3.5, 5.5, 'vht', 'video'),
    node('sta-2', 'TV 2', 'sta', 6.5, 5.5, 'vht', 'video'),
  ]),
  jumps: [
    J('第一次 TXOP 开始', firstTxop),
    J('突发结束后的那次退避抽取', (r) => r.type === 'BACKOFF_DRAW' && r.node === 'ap'),
    // The burst after that one, which starts with no AIFS and no countdown because the post-TXOP
    // backoff has already been spent. A record predicate sees one record at a time, so the second
    // burst is named by a threshold between the two: 0.883 ms and 1.652 ms.
    J('下一串突发：无需倒数即开始', (r) => r.type === 'TXOP_START' && r.node === 'ap' && r.t > 1_500_000),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '同一个 TXOP 里，两次帧交换之间隔着什么？',
      options: [
        '一段 AIFS，加上一次新的倒数',
        '一个 SIFS',
        '什么也没有：帧首尾相接',
      ],
      answer: 1,
      explain: '§10.23.2.8：下一次交换在上一次完成后隔一个 SIFS 开始。SIFS 比任何 AIFS 都短，其他站点无法在其间开始竞争。',
    },
    {
      q: '在本课的仿真里，多数突发是被什么结束的？',
      options: [
        'TXOP 上限到了',
        '发往那台电视的队列已空',
        '另一台站点占用了介质',
      ],
      answer: 1,
      explain: '最长的一串不到上限的八分之一；流量不大时，队列清空的时刻远早于期限。',
    },
    {
      q: '持有者的最后一个 PPDU 发完时，队列已经空了。按标准，它还要做什么？',
      options: [
        '什么也不做，等下一帧到达再竞争',
        '调用一次退避过程，CW 复位到 CWmin',
        '发一个 CF-End，这是必须的',
      ],
      answer: 1,
      explain: '§10.23.2.2 第 b) 项不以队列有帧为条件；CF-End 是可选的（§10.23.2.10）。',
    },
  ],
}
