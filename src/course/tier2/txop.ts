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
 * The scenario builder is unchanged, so the recorded timeline hash stays
 * identical. Every number quoted below is pinned in tests/course/txop.test.ts.
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
  why: '竞争成功才是代价最高的那一步，可到目前为止，竞争成功的站点做完一次交互就把信道原样交还了——然后重新排队，再付一遍同样的代价。如果一台站点（STA）手里还攒着好几帧、都是发给同一个邻居的，这样做就很浪费。于是一次竞争成功不再只换来一次交互，而是换来对空口的一段连续占用时间。这一课我们看一个接入点（AP）如何连续占用信道，并追问：是什么让它不能一直占下去。',
  outcomes: [
    '说清竞争成功的站点在第一次交互之后还能拿这条信道做什么',
    '说出是什么给一串突发划了界，并从仿真里读出每一串究竟是被什么结束的',
    '解释为什么“有上限的连续占用”算得上公平，以及这个上限在保护什么',
  ],
  needs: ['edca', 'ampdu'],
  terms: [
    { term: 'TXOP', plain: '传输机会：竞争成功的站点可以连续占用信道的那一段时间，期间可以一次接一次地交互，中间不必重新竞争' },
    { term: 'TXOP limit', plain: '这段时间的上限，按接入类别分别规定：发出去的每样东西、以及它们的每个回答，都必须装在里面' },
  ],
  picture: [
    { heading: '一次竞争成功，换来一段占用时间', text: '在那么多等待和倒数之后，竞争成功的站点得到的其实不止“一次交互”：在一小段时间里，它是信道上唯一可以发送的站点。其他站点在发送前依然必须先听到一段静默，可这段静默根本不出现——持有者只隔着交互内部那段短短的停顿就又开始发送，而这段停顿比任何竞争者要等的都短。这段归它独占的时间，就是传输机会（transmit opportunity, TXOP）；一次竞争成功所带出去的那几帧，就是它的突发。' },
    { kind: 'watch', jump: 0, heading: '看一串突发', text: '载入仿真，跳到第一串突发。接入点发给一台电视，收下它的回答，转眼间就已经在发给另一台了——中间没有必等的静默，也没有任何倒数。' },
    { heading: '这段占用有个上限', text: '一段没有终点的占用等于直接接管信道，所以每一次竞争成功都同时定下一个期限，这个期限就是 TXOP 上限（TXOP limit）。持有者发出去的每样东西、收到的每个回答，都必须落在这个期限之内；一旦剩下的时间不够做下一次交互，持有者就停止发送，回去和其他站点一样等待、倒数。这个上限是按类别分别设定的，所以承载通话的那些类别有自己的取值。' },
    { heading: '多数时候拦住你的不是上限', text: '实际上，持有者很少真的顶到自己的上限。它停下来，是因为发往那个邻居的队列（queue）已经空了——手里攒着两帧就竞争成功的站点，发完两帧就把空口交还。只有当发送方手里攒的东西远远超过这段时间装得下的量时，上限才真正起作用，而这正是当初写下它的那种情形。' },
    { heading: '为什么这算得上公平', text: '大家守的是同一条规则：任何站点竞争成功之后，都可以同样连续占用信道。没有人因此更频繁地竞争成功——争抢那一段一点没变。变的是每一次竞争成功能换来多少发送量，于是房间把更少的时间花在竞争开销上、更多的时间用来传数据。代价是等待：一台刚好在别人竞争成功之后到场的站点，得把整串突发等完，所以那个上限，其实是给“任何人最多要等多久”封的顶。' },
  ],
  numbers: [
    {
      kind: 'diagram', heading: '第一串突发，对着它的上限',
      spec: txopBurstTiming(),
      caption: '本轮第一串突发：两帧视频、两个确认帧（ACK），480 µs 就结束了，而它被允许占到 4 096 µs。拦住它的不是这个上限，是发往那台电视的队列已经空了。',
    },
    { kind: 'table', heading: '按类别看上限', head: [
      '类别', '上限', '为什么是这个取值', '出处',
    ], rows: [
      ['VO（语音）', '2.080 ms', '短：不能让一通电话等太久', 'Table 9-194'],
      ['VI（视频）', '4.096 ms', '最大：视频帧又大又成组到达', 'Table 9-194'],
      ['BE（尽力而为）/ BK（后台）', '2.528 ms', '够让一次竞争成功多发出几帧，摊薄它的代价', 'Table 9-194'],
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
      ['它得到的上限', '4 096 µs'],
    ] },
    { kind: 'formula', heading: '把最长的那串加起来', text: '188 + 16 + 28 + 16 + 188 + 16 + 28 = 480 µs\n188 + 16 + 28                     = 232 µs', note: '一帧、一段短停顿、一个回答——做两遍，或者只做一遍。两次交互之间，除了那段停顿什么也没有。' },
    { kind: 'steps', heading: '一次获胜，从第一帧到把信道交还', items: [
      '竞争成功的站点发出第一帧的那一刻，本轮占用的期限就定下来了：期限是这一刻加上该类别的上限——在这里，视频那一类是 4 096 µs。',
      '第一次交互走完：一帧、一段 16 µs 的停顿、一个回答。',
      '回答到手后，持有者看同一类队列的队头，把下一次交互整个量一遍——停顿、帧、停顿、它的回答——拿去和期限前剩下的时间比较。',
      '若它整个能在期限之内结束，持有者就只等那一段停顿，接着再发。而 16 µs 比任何竞争者必须听到的最短静默（34 µs）还短，所以其他站点根本无法在这个间隔里开始发送。',
      '以下四件事哪一件先发生，本轮就在哪里结束：下一次交互已经装不进剩下的时间了、这一类的队列空了、回答没有回来，或者停顿结束时信道上已经有别人在发送。',
      '持有者把信道交还，然后和所有站点一样，重新听一段静默、重新抽一次倒数：竞争一次的代价再付一遍，也只付这一遍，换来下一整串突发。',
    ] },
    { kind: 'table', heading: '第一串突发，照着步骤走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['第一帧发出去的时刻', '0.883 ms'],
      ['于是占用的期限在 4 096 µs 之后，即', '4.979 ms'],
      ['发给电视 2，188 µs，再加 16 + 28 µs：回答到手于', '1.115 ms'],
      ['下一次交互需要 16 + 188 + 16 + 28', '248 µs'],
      ['它会在 1.363 ms 结束，而期限是 4.979 ms', '装得下 ✓'],
      ['于是隔一段停顿，发给电视 1 的帧出发于', '1.131 ms'],
      ['回答到达，队列空了，本轮结束于', '1.363 ms'],
      ['实际占用，而允许的是 4 096 µs', '480 µs'],
    ] },
  ],
  deeper: [
    { heading: '把剩下的占用时间让给对端', text: '持有者不一定非得自己把这段时间用完：它可以把剩下的交给正在对话的那台站点，让对方的回答里捎上自己的数据。本仿真器不做这件事，时间轴上也就看不到它。' },
    { heading: '突发越长，风险越大', text: '一口气占用好几毫秒，只有在房间对持有者而言真的安静时才是安全的。一个未能检出这串突发的隐藏邻居会直接开始发送并造成碰撞，从那一刻到本轮结束的所有时间都浪费了。所以长突发通常要先用一次简短的保护性交互开场，并且在开场那一帧里就把整串要占多久预告出去——那两件事都是下一课的主题。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '持有者只能自己把这段时间用完：引擎既不建模反向传输——把剩下的借给正在对话的那台站点——也不建模 802.11be 的 TXOP 共享，即接入点把自己竞争得到的一段时间划给某台站点上行。两件事真实设备都在做，而时间轴上永远看不到，所以这里一次竞争成功的价值被低估了。' },
    { kind: 'unmodelled', text: '一串突发里只能装同一个接入类别的帧（续发时只看本类队列的队首），也只有一个业务标识：引擎不建模多 TID 聚合。真实设备可以在同一个 TXOP 里把不同优先级、不同业务标识的帧一起发出去。于是这里那 219 次「队列空了就交还」的单帧突发，在真实设备上常常还能接着装别的东西。' },
    { kind: 'model-value', text: '那四个上限（2.080 / 4.096 / 2.528 ms）在引擎里是一张常量表（phy.ts 的 EDCA_PARAMS），取的是 Table 9-194 的默认值；而引擎不发信标、不广播 EDCA 参数集，所以场景里没有办法让接入点宣布另一套。真实接入点广播的这四个数五花八门，不少型号把尽力而为那一类设成 0——那等于每次竞争成功只发一帧，也就是本课「关掉这个功能」那个对照。' },
    { kind: 'unmodelled', text: '那 16 µs 的停顿在这里是一个精确常数，加上一路发射到达各处不花时间、全场共用一个时钟，「其他站点无法在这个间隔里开始发送」就成了一条绝对成立的算术。真实设备的接收—发射转换要花时间，晶振各差几十 ppm，这个缝隙的实际宽度每一次都略有不同。' },
  ],
  sources: [
    '传输机会、“一个 PPDU 连同它的响应必须装进上限之内”的规定，以及反向传输与多帧突发的规则，见 IEEE Std 802.11-2024 的 §10.23.2.8；各接入类别的 TXOP 上限见 Table 9-194。',
    '随机种子、两台电视，以及它们的码流所要求的速率，都是本仿真器的模型取值；本轮最终采用的编码同样如此，而正是它把这里一帧视频的时长定在 188 µs。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV 1', 'sta', 3.5, 5.5, 'vht', 'video'),
    node('sta-2', 'TV 2', 'sta', 6.5, 5.5, 'vht', 'video'),
  ]),
  jumps: [
    J('第一次 TXOP 开始', firstTxop),
    J('接入点的第一次退避抽取', (r) => r.type === 'BACKOFF_DRAW' && r.node === 'ap'),
  ],
  observe: [
    '突发进行时，检视器会显示它属于哪一类，以及这段占用还剩多少时间。这里显示的是 AC_VI，因为两路流都是视频。',
    '整轮下来接入点竞争成功 463 次、发出 463 串突发：其中 219 串只带一帧，243 串带两帧。决定是哪一种的是队列，不是上限。',
  ],
  tryThis: [
    '在接入点上关掉这个功能再载入。它发出的帧数一模一样，但抽取倒数的次数从 462 变成了 706——462 比它发出的 463 串突发少一次，因为整轮的第一串根本不需要倒数。每一次交互都要把竞争的代价重新付一遍。',
    '把其中一台电视的业务从视频流改成饱和下载。现在只要接入点竞争成功，发往这台站点的帧总是攒着，于是突发长到 1.9 ms、一次三帧。',
  ],
  quiz: [
    {
      q: '同一串突发里，两次交互之间隔着什么',
      options: [
        '必等的静默，加上一次新的倒数',
        '只有交互内部用的那段短停顿',
        '什么都没有：帧是首尾相接发的',
      ],
      answer: 1,
      explain: '这段停顿比任何竞争者要等的时间都短，所以其他站点根本没有开始发送的机会。竞争的代价只在突发的边界上付一遍。',
    },
    {
      q: '在本轮仿真里，多数突发是被什么结束的？',
      options: [
        '占用的期限到了',
        '持有者手里没有更多发往那个邻居的东西了',
        '另一台站点把信道抢走了',
      ],
      answer: 1,
      explain: '这里最长的一串突发，只用掉了它被允许的大约十分之一。流量不大时，队列会比这个期限早得多地空掉。',
    },
    {
      q: '这个上限到底为什么要存在？',
      options: [
        '为了不让某个持有者把所有人耽搁太久',
        '为了不让帧变得太大',
        '为了让接入点比站点多拿到几轮',
      ],
      answer: 0,
      explain: '任何站点最坏的等待大约就是一整串突发，所以给突发封顶，就是给等待封顶——这也正是承载通话的那一类上限最短的原因。',
    },
  ],
}
