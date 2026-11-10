/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · TXOP, the lease on the channel.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md) and grown
 * from the 193-word original: winning once and keeping the floor, the ceiling
 * that bounds it, and why a bounded lease is fair enough.
 *
 * **Stays whole** in the 2026-09-25 re-pacing
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, §2 M8): one
 * mechanism with one measurable payoff. What it loses:
 *  - 「告诉整个房间要躲多久」(§5.1.4) — the Duration that telegraphs a burst is
 *    `txop-protect`'s own procedure, taught there properly with the numbers;
 *    one forward-pointing clause is left in `deeper`;
 *  - 「把发言权借回去」(§5.5, the 2024 corpus's own heading, quoted as history —
 *    the lesson now says 把剩下的占用时间让给对端) — reverse-direction TXOP, which this simulator
 *    never puts on the timeline, cut to one sentence;
 *  - 「这里的每一串突发是被什么结束的」(§5.3) — it restated 「多数时候拦住你的不是
 *    上限」using the table between them. The new figure carries it instead: the
 *    480 µs the longest burst used, drawn against the 4 096 µs it was allowed;
 *  - the 短租 metaphor, which ran four times; the mechanism's own names
 *    (信道占用时间, TXOP 上限) do the work (§5.2).
 *
 * **2026-10-03 — the post-TXOP backoff.** A reader watched the access point
 * finish its first burst with nothing left to send and then count down six
 * slots, and asked why. The lesson's own frame made that look like a bug: it
 * said the holder goes back to 「等待、倒数」 in order to transmit again, which is
 * the PRE-backoff story. The countdown is item b) of §10.23.2.2 — for the
 * EDCAF that is the TXOP holder, the transmission of the final PPDU of the TXOP
 * has completed — and it carries no condition on having anything more to send.
 * So the lesson now says that where the procedure's last step is, and shows the
 * payoff the standard is after: the queue is empty at 1.363 ms and 6 slots are
 * drawn and counted down anyway, and the frame that arrives at 1.652 ms goes
 * out in that same nanosecond, with no silence and no countdown, because the
 * price was already paid. 412 of this run's 463 bursts start that way. The
 * 462 draws `tryThis` already quoted are these post-backoffs, one after each
 * burst — true before, and read the wrong way round. Which took its own
 * explanation down with it: 「462 比它发出的 463 串突发少一次，因为整轮的第一串根本
 * 不需要倒数」 is the pre-backoff arithmetic, and it is wrong. The draws pair with
 * the burst ENDS, of which this window holds 462; run the same scenario to
 * 301 ms and starts, ends and draws are all 464. The missing draw is the one the
 * 463rd burst has not reached yet, not one the first burst was spared — that
 * burst is spared a draw, but being spared it never changed the count.
 *
 * Text, one jump label and one added jump target. The scenario builder is
 * unchanged, so the recorded timeline hash stays identical. Every number quoted
 * below is pinned in tests/course/txop.test.ts.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstTxop, J } from '../lessonKit'

/**
 * This run's first burst against the clock it was given, to scale. Every figure
 * is a record of the base run, taken relative to the TXOP_START at 0.883 ms: the
 * two data frames at 0–188 and 248–436 µs, the two answers at 204–232 and
 * 452–480, the TXOP_END at 480, and the lease itself, 4 096 µs from `EDCA_PARAMS`
 * for AC_VI.
 *
 * The slivers are meant to be slivers. The whole finding of the lesson is that
 * the ceiling is not what stops a burst here — 480 µs of 4 096 — and a figure
 * drawn to scale says that in one look, which is why the paragraph that said it
 * in words is gone.
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
  why: '竞争成功才是代价最高的那一步，可到目前为止，竞争成功的站点完成一次交互就交还信道——然后重新排队，再承担一次同样的代价。如果一台站点（STA）还积压着好几帧、都是发往同一个邻居的，这样做就很浪费。于是一次竞争成功不再只换来一次交互，而是换来一段连续占用空口的时间。这段时间叫传输机会（transmit opportunity, TXOP）：持有者每完成一次交互，只间隔交互内部那段短间隔就继续发送下一帧，而这段间隔比任何竞争者必须侦听到的最短静默还短，其他站点无法在其间开始发送。每一次竞争成功都同时确定一个期限，按接入类别（access category, AC）分别规定，承载通话的那一类最短；剩余时间不足以完成下一次交互时，持有者就交还信道。但在本场景里，接入点（AP）几乎不会达到这个期限：最长的一串只用了允许时间的大约十分之一，使它结束的是发往那台电视的队列（queue）已经为空。交还之后它立即再抽取一次倒数值，提前完成下一次竞争所需的倒数，所以下一帧到达时多半可以立即发送。这可以算作公平：所有站点遵守同一条规则，没有谁因此更频繁地竞争成功，改变的只是每次竞争成功能发送多少；代价是晚到的站点要等别人的一整串发完，所以那个期限实际上限定了任何站点的最长等待。',
  outcomes: [
    '说明竞争成功的站点在第一次交互之后还能如何使用这条信道',
    '说明是什么限定了一串突发的长度，并从仿真中读出每一串究竟因何结束',
    '解释为什么“有上限的连续占用”可以算作公平，以及这个上限在保护什么',
  ],
  needs: ['edca', 'ampdu'],
  terms: [
    { term: 'TXOP', plain: '传输机会：竞争成功的站点可以连续占用信道的那一段时间，期间可以一次接一次地交互，中间不必重新竞争' },
    { term: 'TXOP limit', plain: '这段时间的上限，按接入类别分别规定：发送的每一帧及其每个应答，都必须在这段时间之内完成' },
  ],
  picture: [
    { heading: '一次竞争成功，换来一段占用时间', text: '在那么多等待和倒数之后，竞争成功的站点得到的其实不止“一次交互”：在一小段时间里，它是信道上唯一可以发送的站点。其他站点在发送前仍然必须先侦听到一段静默，但这段静默根本不会出现——持有者只间隔交互内部那段很短的间隔就再次开始发送，而这段间隔比任何竞争者要等的都短。这段由它独占的时间，就是传输机会（transmit opportunity, TXOP）；一次竞争成功之后连续发出的那几帧，就是它的突发。' },
    { kind: 'watch', jump: 0, heading: '看一串突发', text: '载入仿真，跳到第一串突发。接入点发送给一台电视，收到它的应答，随即就开始发送给另一台——中间没有必等的静默，也没有任何倒数。' },
    { heading: '这段占用有个上限', text: '一段没有结束时刻的占用等于完全独占信道，所以每一次竞争成功都同时确定一个期限，这个期限就是 TXOP 上限（TXOP limit）。持有者发送的每一帧、收到的每个应答，都必须在这个期限之内；一旦剩余时间不足以完成下一次交互，持有者就停止发送，交还信道。这个上限是按类别分别设定的，所以承载通话的那些类别有自己的取值。' },
    { heading: '多数时候起限制作用的不是上限', text: '实际上，持有者很少真正达到自己的上限。它停止发送，是因为发往那个邻居的队列（queue）已经为空——队列中只有两帧时竞争成功的站点，发完两帧就交还空口。只有当发送方积压的数据远远超过这段时间所能容纳的量时，上限才真正起作用，而这正是当初制定它所针对的情形。' },
    { kind: 'watch', jump: 1, heading: '交还之后，先完成下一次的倒数', text: '一串突发结束后，持有者并不是就此进入空闲：它立即再侦听一段静默、再抽取一次倒数值，与队列中是否还有帧无关。跳到这里：本轮在 1.363 ms 结束、队列已空，34 µs 之后它仍然抽到 6 个时隙（slot time）并完成倒数。提前完成的是下一次竞争的倒数——下一帧在 1.652 ms 才到达，它立即发送，没有静默，也没有倒数。整轮 463 串突发里，有 412 串都是在帧到达的同一纳秒发出的。' },
    { heading: '为什么这算得上公平', text: '所有站点遵守的是同一条规则：任何站点竞争成功之后，都可以同样连续占用信道。没有站点因此更频繁地竞争成功——竞争过程本身完全没有变化。改变的是每一次竞争成功能发送的数据量，于是整个房间用于竞争开销的时间更少、用于传输数据的时间更多。代价是等待：一台恰好在别人竞争成功之后才有帧待发的站点，必须等整串突发结束，所以那个上限实际上限定了“任何站点最多要等多久”。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '第一串突发与它的上限',
      spec: txopBurstTiming(),
      caption: '本轮第一串突发：两帧视频、两个确认帧（ACK），480 µs 就结束了，而它被允许占到 4 096 µs。使它结束的不是这个上限，而是发往那台电视的队列已经为空。',
    },
    { kind: 'table', heading: '各类别的上限', head: [
      '类别', '上限', '为什么是这个取值', '出处',
    ], rows: [
      ['VO（语音）', '2.080 ms', '短：不能让一通电话等太久', 'Table 9-194'],
      ['VI（视频）', '4.096 ms', '最大：视频帧较大且成组到达', 'Table 9-194'],
      ['BE（尽力而为）/ BK（后台）', '2.528 ms', '足以让一次竞争成功多发出几帧，分摊竞争的代价', 'Table 9-194'],
    ] },
    { kind: 'table', heading: '接入点实际的表现', head: [
      '300 ms 之内', '数值',
    ], rows: [
      ['竞争成功、发出突发的次数', '463'],
      ['其中只发一帧的', '219'],
      ['其中发两帧的', '243'],
      ['最短的突发', '232 µs'],
      ['最长的突发', '480 µs'],
      ['平均突发', '362.4 µs'],
      ['它的上限', '4 096 µs'],
    ] },
    { kind: 'formula', heading: '最长那串突发的累加', text: '188 + 16 + 28 + 16 + 188 + 16 + 28 = 480 µs\n188 + 16 + 28                     = 232 µs', note: '一帧、一段短间隔、一个应答——重复两次，或者只有一次。两次交互之间，除了那段间隔没有任何其他内容。' },
    { kind: 'steps', heading: '一次竞争成功：从第一帧到交还信道', items: [
      '竞争成功的站点发出第一帧的那一刻，本轮占用的期限就确定了：期限是这一刻加上该类别的上限——在这里，视频那一类是 4 096 µs。',
      '第一次交互完成：一帧、一段 16 µs 的间隔、一个应答。',
      '收到应答后，持有者查看同一类队列的队头，计算下一次交互的总时长——间隔、帧、间隔、它的应答——并与期限前的剩余时间比较。',
      '若整个交互能在期限之内结束，持有者就只等那一段间隔，然后继续发送。而 16 µs 比任何竞争者必须侦听到的最短静默（34 µs）还短，所以其他站点根本无法在这个间隔里开始发送。',
      '以下四种情况哪一种先发生，本轮就在那里结束：剩余时间已经不足以完成下一次交互、这一类的队列已空、应答没有返回，或者间隔结束时信道上已经有其他站点在发送。',
      '持有者交还信道，并立即为下一次竞争侦听一段静默、抽取一次倒数值：标准把“本轮最后一帧发完”本身列为退避（backoff）过程的触发条件之一（§10.23.2.2 b）。这部分代价因此在上一串突发结束时就已承担，下一帧到达时它往往不必再等待、也不必再倒数。',
    ] },
    { kind: 'table', heading: '第一串突发，按步骤计算一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['第一帧发送的时刻', '0.883 ms'],
      ['于是占用的期限在 4 096 µs 之后，即', '4.979 ms'],
      ['发给电视 2，188 µs，再加 16 + 28 µs：收到应答于', '1.115 ms'],
      ['下一次交互需要 16 + 188 + 16 + 28', '248 µs'],
      ['它会在 1.363 ms 结束，而期限是 4.979 ms', '可以容纳 ✓'],
      ['于是间隔一段时间后，发给电视 1 的帧开始发送于', '1.131 ms'],
      ['应答到达，队列已空，本轮结束于', '1.363 ms'],
      ['实际占用，而允许的是 4 096 µs', '480 µs'],
    ] },
  ],
  deeper: [
    { heading: '把剩余的占用时间让给对端', text: '持有者不一定要自己用完这段时间：它可以把剩余时间交给正在通信的那台站点，让对方在应答中携带自己的数据。本仿真器不建模这一机制，时间轴上也就看不到它。' },
    { heading: '突发越长，风险越大', text: '连续占用好几毫秒，只有在房间对持有者而言确实空闲时才是安全的。一个未能检出这串突发的隐藏邻居会直接开始发送并造成碰撞，从那一刻到本轮结束的所有时间都浪费了。所以长突发通常要先以一次简短的保护性交互开始，并且在第一帧里就预先通告整串要占用多长时间——那两件事都是下一课的主题。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '持有者只能自己把这段时间用完：引擎既不建模反向传输——把剩余时间让给正在通信的那台站点——也不建模 802.11be 的 TXOP 共享，即接入点把自己竞争得到的一段时间划给某台站点上行。两件事真实设备都在做，而时间轴上永远看不到，所以这里一次竞争成功的价值被低估了。' },
    { kind: 'unmodelled', text: '一串突发里只能装同一个接入类别的帧（续发时只看本类队列的队首），也只有一个业务标识：引擎不建模多 TID 聚合。真实设备可以在同一个 TXOP 里把不同优先级、不同业务标识的帧一起发出去。于是这里那 219 次「队列空了就交还」的单帧突发，在真实设备上常常还能继续发送其他帧。' },
    { kind: 'model-value', text: '那四个上限（2.080 / 4.096 / 2.528 ms）在引擎里是一张常量表（phy.ts 的 EDCA_PARAMS），取的是 Table 9-194 的默认值；而引擎不发信标、不广播 EDCA 参数集，所以场景里没有办法让接入点宣布另一套。真实接入点广播的这四个数差异很大，不少型号把尽力而为那一类设成 0——这等于每次竞争成功只发一帧，也就是本课「关掉这个功能」那个对照。' },
    { kind: 'unmodelled', text: '那 16 µs 的间隔在这里是一个精确常数，加上发射的信号到达各处不需要时间、全场共用一个时钟，「其他站点无法在这个间隔里开始发送」就成了一条绝对成立的算术结论。真实设备的接收—发射转换需要时间，晶振彼此相差几十 ppm，这个间隔的实际宽度每一次都略有不同。' },
  ],
  sources: [
    '传输机会、“一个 PPDU 连同它的响应必须装进上限之内”的规定，以及反向传输与多帧突发的规则，见 IEEE Std 802.11-2024 的 §10.23.2.8；各接入类别的 TXOP 上限见 Table 9-194。',
    '突发结束之后那一次退避：IEEE Std 802.11-2024 的 §10.23.2.2 列举了启动退避过程的几种情形，其中一种是——对作为 TXOP 持有者的那个 EDCAF 而言——本轮最后一个 PPDU 已经发完、该 PPDU 不征询 HE TB PPDU、且 TXNAV 定时器已到期。这一条不以“队列里还有帧”为前提。',
    '随机种子、两台电视，以及它们的码流所要求的速率，都是本仿真器的模型取值；本轮最终采用的编码同样如此，而正是它把这里一帧视频的时长定在 188 µs。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV 1', 'sta', 3.5, 5.5, 'vht', 'video'),
    node('sta-2', 'TV 2', 'sta', 6.5, 5.5, 'vht', 'video'),
  ]),
  jumps: [
    J('第一次 TXOP 开始', firstTxop),
    J('突发结束后的那次退避抽取', (r) => r.type === 'BACKOFF_DRAW' && r.node === 'ap'),
    // The burst after that one, which starts with no silence and no countdown because the
    // post-TXOP backoff has already been spent. A record predicate sees one record at a time,
    // so the second burst is named by a threshold between the two: the first burst starts at
    // 0.883 ms and this one at 1.652 ms. Both, and the 1.5 ms itself, are pinned in
    // tests/course/txop.test.ts.
    J('下一串突发：无需倒数即开始', (r) => r.type === 'TXOP_START' && r.node === 'ap' && r.t > 1_500_000),
  ],
  observe: [
    '突发进行时，检视器会显示它属于哪一类，以及这段占用还剩多少时间。这里显示的是 AC_VI，因为两路流都是视频。',
    '整轮运行中接入点竞争成功 463 次、发出 463 串突发：其中 219 串只带一帧，243 串带两帧。决定是哪一种的是队列，不是上限。它抽取倒数 462 次，每一次都紧跟在一串突发之后，没有一次在突发之前。',
  ],
  tryThis: [
    '在接入点上关掉这个功能再载入。它发出的帧数完全相同，但抽取倒数的次数从 462 变成了 706。那 462 次与 462 串已经结束的突发一一对应：第 463 串在 300 ms 的窗口里还没结束，它对应的那一次还没有抽取。关掉之后，每发完一帧都要抽取一次，于是同样的帧数要付 706 次代价。',
    '把其中一台电视的业务从视频流改成饱和下载。现在每当接入点竞争成功，发往这台站点的帧总有积压，于是突发长到 1.9 ms、一次三帧。',
  ],
  quiz: [
    {
      q: '同一串突发里，两次交互之间隔着什么',
      options: [
        '必须等待的静默，加上一次新的倒数',
        '只有交互内部使用的那段短间隔',
        '没有任何间隔：帧是首尾相接发送的',
      ],
      answer: 1,
      explain: '这段间隔比任何竞争者要等的时间都短，所以其他站点根本没有开始发送的机会。竞争的代价只在突发的边界上承担一次。',
    },
    {
      q: '在本轮仿真里，多数突发是被什么结束的？',
      options: [
        '占用的期限到了',
        '持有者没有更多发往那个邻居的帧了',
        '另一台站点占用了信道',
      ],
      answer: 1,
      explain: '这里最长的一串突发，只用掉了它被允许的大约十分之一。流量不大时，队列为空的时刻会比这个期限早得多。',
    },
    {
      q: '这个上限为什么要存在？',
      options: [
        '为了不让某个持有者使其他所有站点等待太久',
        '为了不让帧变得太大',
        '为了让接入点比站点多获得几轮',
      ],
      answer: 0,
      explain: '任何站点最坏的等待大约就是一整串突发，所以限定突发的长度，就是限定等待的时长——这也正是承载通话的那一类上限最短的原因。',
    },
  ],
}
