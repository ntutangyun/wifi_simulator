/**
 * Wi-Fi Tier 2 · M3 · QoS and efficiency · TXOP, the lease on the channel.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md) and grown
 * from the 193-word original: winning once and keeping the floor, the ceiling
 * that bounds it, and why a bounded lease is fair enough. The per-class limits
 * and what actually stops a burst are in `numbers`; the reverse direction and
 * the protection question are in `deeper`.
 *
 * The scenario builder is unchanged, so the recorded timeline hash stays
 * identical. Every number quoted below is pinned in tests/course/txop.test.ts.
 */
import { type Lesson, N, oneRoom, node, sc, firstTxop, J } from '../lessonKit'

export const txop: Lesson = {
  id: 'txop',
  module: 2,
  title: { en: 'TXOP — own the channel, briefly', zh: 'TXOP——短暂地拥有信道' },
  why: {
    en: 'Winning the channel is the expensive part, and so far a winner has handed it straight back after a single exchange — then queued up to pay the same price again. If a station has several frames waiting for the same neighbour, that is absurd. So a win stopped being a ticket for one exchange and became a short lease on the air. This lesson watches an access point keep the floor, and asks what stops it keeping it for ever.',
    zh: '赢下信道才是贵的那一步，可到目前为止，赢家做完一次交互就把它原样交还了——然后重新排队，再付一遍同样的价钱。如果一台终端手里还攒着好几帧、都是发给同一个邻居的，这就太荒唐了。于是“赢一次”不再是一次交互的门票，而变成了对空口的一小段短租。这一课我们看一个 AP 如何占住发言权，并追问：是什么让它不能一直占下去。',
  },
  outcomes: [
    { en: 'describe what a winner may do with the channel after its first exchange', zh: '说清赢家在第一次交互之后还能拿这条信道做什么' },
    { en: 'say what bounds a burst, and read off the run what actually ended each one', zh: '说出是什么给一串突发划了界，并从仿真里读出每一串究竟是被什么结束的' },
    { en: 'explain why a bounded lease is fair enough, and what the bound is protecting', zh: '解释为什么“有上限的短租”算得上公平，以及这个上限在保护什么' },
  ],
  needs: ['edca', 'ampdu'],
  terms: [
    { term: 'TXOP', plain: {
      en: 'transmit opportunity: the stretch of time a winner may keep the channel for, sending one exchange after another without contending again',
      zh: '传输机会：赢家可以把信道攥在手里的那一段时间，可以一次接一次地交互，中间不必重新竞争',
    } },
    { term: 'TXOP limit', plain: {
      en: 'the ceiling on that stretch, fixed per access category: everything sent, and every answer to it, must fit inside',
      zh: '这段时间的上限，按接入类别定死：发出去的每样东西、以及它们的每个回答，都必须装在里面',
    } },
  ],
  picture: [
    { heading: { en: 'Winning once, keeping the floor', zh: '赢一次，占住发言权' }, text: {
      en: 'After all the waiting and counting, a winner has bought something more valuable than a single exchange: for a while, it is the only one allowed to speak. Everyone else is still obliged to hear silence before starting, and there is no silence — the winner comes back on the air after only the short pause inside an exchange, which is shorter than anything a contender may wait. That stretch of ownership is the TXOP.',
      zh: '在那么多等待和倒数之后，赢家买到的东西其实比“一次交互”值钱得多：在一小段时间里，它是唯一被允许说话的。其他人开口前依然必须先听到静默，可静默根本不出现——赢家只隔着交互内部那段短短的停顿就又上了空口，而这段停顿比任何竞争者要等的都短。这段“归我所有”的时间，就是 TXOP。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Watch one burst', zh: '看一串突发' }, text: {
      en: 'Load the simulation and jump to the first burst. The access point sends to one television, takes its answer, and a moment later is already sending to the other — no required silence, no countdown anywhere in between.',
      zh: '载入仿真，跳到第一串突发。AP 发给一台电视，收下它的回答，转眼间就已经在发给另一台了——中间没有必等的静默，也没有任何倒数。',
    } },
    { heading: { en: 'The lease has a ceiling', zh: '短租有个上限' }, text: {
      en: 'A lease with no end would be a takeover, so every win comes with a clock: the TXOP limit. Everything the holder sends and every answer it gets must fit inside it, and when there is not enough time left for the next exchange, the holder stops and goes back to waiting and counting like everybody else. The ceiling is set per class, so the classes that carry conversation get their own size.',
      zh: '一段没有终点的短租等于直接接管，所以每一次获胜都配着一只钟：TXOP 上限。持有者发出去的每样东西、收到的每个回答，都必须装进这只钟里；一旦剩下的时间不够做下一次交互，持有者就停手，回去和别人一样等待、倒数。这个上限是按类别设的，所以承载对话的那些类别有自己的尺码。',
    } },
    { heading: { en: 'Usually it is not the ceiling that stops you', zh: '多数时候拦住你的不是上限' }, text: {
      en: 'In practice a holder rarely reaches its ceiling. It stops because the queue for that neighbour has run dry — a station that wins the air with two frames in hand sends two frames and gives it back. The limit only bites when a sender has far more waiting than the lease can carry, which is exactly the case it was written for.',
      zh: '实际上，持有者很少真的顶到自己的上限。它停下来，是因为发往那个邻居的队列已经空了——手里攒着两帧就赢下空口的终端，发完两帧就把空口还回去。只有当发送方手里攒的东西远远超过这段短租装得下的量时，上限才真正起作用，而这正是当初写下它的那种情形。',
    } },
    { heading: { en: 'Why this is fair enough', zh: '为什么这算得上公平' }, text: {
      en: 'Everyone plays by the same rule: win, and you may hold the floor the same way. Nobody wins more often because of it — the arguing is unchanged. What changes is how much each win is worth, so the room spends less of its time on ceremony and more of it carrying traffic. The cost is patience: a station that arrives just after someone wins waits out the whole burst, so the ceiling is really a cap on how long anyone must wait.',
      zh: '大家守的是同一条规则：你赢了，你也可以照样占住发言权。没有人因此赢得更频繁——争抢那一段一点没变。变的是每一次获胜值多少钱，于是房间把更少的时间花在排场上、更多的时间用来运东西。代价是耐心：一台刚好在别人获胜之后到场的终端，得把整串突发等完，所以那个上限，其实是给“任何人最多要等多久”封的顶。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'The ceiling, by class', zh: '按类别看上限' }, head: [
      { en: 'Class', zh: '类别' }, { en: 'Ceiling', zh: '上限' }, { en: 'Why that size', zh: '为什么是这个尺码' }, { en: 'Where', zh: '出处' },
    ], rows: [
      [N('VO'), N('2.080 ms'), { en: 'short: a call must not be made to wait', zh: '短：不能让一通电话干等' }, N('Table 9-194')],
      [N('VI'), N('4.096 ms'), { en: 'the largest: video frames are big and arrive in groups', zh: '最大：视频帧又大又成组到达' }, N('Table 9-194')],
      [N('BE / BK'), N('2.528 ms'), { en: 'enough to make a win worth having', zh: '够让“赢一次”值回票价' }, N('Table 9-194')],
    ] },
    { kind: 'table', heading: { en: 'What the access point actually did', zh: 'AP 实际的表现' }, head: [
      { en: 'Over 300 ms', zh: '300 ms 之内' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'Bursts won', zh: '赢下的突发次数' }, N('463')],
      [{ en: 'Carrying one frame', zh: '其中只发一帧的' }, N('219')],
      [{ en: 'Carrying two', zh: '其中发两帧的' }, N('243')],
      [{ en: 'Shortest burst', zh: '最短的突发' }, N('232 µs')],
      [{ en: 'Longest burst', zh: '最长的突发' }, N('480 µs')],
      [{ en: 'Mean burst', zh: '平均突发' }, N('362.4 µs')],
      [{ en: 'Ceiling it was given', zh: '它拿到的上限' }, N('4 096 µs')],
    ] },
    { kind: 'formula', heading: { en: 'The longest burst, added up', zh: '把最长的那串加起来' }, text: {
      en: '188 + 16 + 28 + 16 + 188 + 16 + 28 = 480 µs\n188 + 16 + 28                     = 232 µs',
      zh: '188 + 16 + 28 + 16 + 188 + 16 + 28 = 480 µs\n188 + 16 + 28                     = 232 µs',
    }, note: {
      en: 'A frame, a short pause, an answer — twice over, or once. Between the two exchanges there is nothing but that pause.',
      zh: '一帧、一段短停顿、一个回答——做两遍，或者只做一遍。两次交互之间，除了那段停顿什么也没有。',
    } },
    { heading: { en: 'What ended every burst here', zh: '这里的每一串突发是被什么结束的' }, text: {
      en: 'Not the ceiling: the longest hold is 480 µs of the 4 096 µs it was allowed. With two moderate video streams the access point simply has nothing more for that television, so about half of its wins carry a single frame. The lease is generous; the queue is not.',
      zh: '不是上限：最长的一次占用是 480 µs，而它被允许的是 4 096 µs。只有两路不大的视频流时，AP 手里根本没有更多东西要发给那台电视，所以它大约一半的获胜只带着一帧。短租很慷慨，队列并不。',
    } },
  ],
  deeper: [
    { heading: { en: 'Telling the room how long to stay away', zh: '告诉整个房间要躲多久' }, text: {
      en: 'A neighbour that hears only one frame of a burst has no way of knowing more is coming. So each frame of the burst announces, in its own header, how long the exchange it belongs to still needs, and neighbours hold their own timer accordingly. A burst is therefore not silence enforced by luck but by a number every listener updates — which is also why a burst survives a station that woke up in the middle of it.',
      zh: '一个只听到突发里某一帧的邻居，没法知道后面还有东西要来。所以突发里的每一帧都在自己的帧头里声明：它所属的这次交互还需要多久，邻居们据此各自维护自己的计时器。因此一串突发之所以安静，靠的不是运气，而是每个听者都在更新的一个数——这也正是为什么中途才醒来的终端不会破坏这串突发。',
    } },
    { heading: { en: 'Lending the floor back', zh: '把发言权借回去' }, text: {
      en: 'The holder does not have to use its lease alone. It may hand the remainder to the station it is talking to, so the answer comes back carrying data of its own, and it may ask that station to reply with something larger than an acknowledgement. Both are ways of spending one hard-won win on traffic in two directions, and both live inside the same ceiling.',
      zh: '持有者不一定非得自己把这段短租用完。它可以把剩下的时间交给正在对话的那台终端，让对方的回答里捎上自己的数据；它也可以要求对方回一个比确认帧更大的东西。这两种做法，都是把一次来之不易的获胜花在双向的流量上，而且都关在同一个上限之内。',
    } },
    { heading: { en: 'A long burst is a long bet', zh: '越长的突发，赌注越大' }, text: {
      en: 'Holding the floor for milliseconds is only safe if the room really is quiet for the holder. A hidden neighbour that cannot hear the burst will start into the middle of it, and everything from that moment to the end of the lease is wasted. That is why long bursts are usually opened with a short protective exchange first — the subject of the next lesson.',
      zh: '一口气占住好几毫秒，只有在房间对持有者而言真的安静时才是安全的。一个听不见这串突发的隐藏邻居会一头撞进来，从那一刻到租期结束的所有时间都白费了。这正是为什么长突发通常要先用一次简短的保护性交互开场——那是下一课的主题。',
    } },
  ],
  sources: [
    { en: 'The transmit opportunity, the rule that a PPDU and its response must fit inside the limit, and the reverse-direction and multiple-frame rules are §10.23.2.8 of IEEE Std 802.11-2024; the per-category TXOP limits are Table 9-194.',
      zh: '传输机会、“一个 PPDU 连同它的响应必须装进上限之内”的规定，以及反向传输与多帧突发的规则，见 IEEE Std 802.11-2024 的 §10.23.2.8；各接入类别的 TXOP 上限见 Table 9-194。' },
    { en: 'The seed, the two televisions and the rate their streams ask for are model choices of this simulator; so is the coding the run settles on, which fixes the 188 µs a video frame takes here.',
      zh: '随机种子、两台电视，以及它们的码流所要求的速率，都是本仿真器的模型取值；本轮最终采用的编码同样如此，而正是它把这里一帧视频的时长定在 188 µs。' },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV 1', 'sta', 3.5, 5.5, 'vht', 'video'),
    node('sta-2', 'TV 2', 'sta', 6.5, 5.5, 'vht', 'video'),
  ]),
  jumps: [
    J('first TXOP start', '第一次 TXOP 开始', firstTxop),
    J('first backoff draw by the AP', 'AP 的第一次退避抽取', (r) => r.type === 'BACKOFF_DRAW' && r.node === 'ap'),
  ],
  observe: [
    { en: 'The first burst, at 0.88 ms, serves both televisions: a frame to one, its answer, then one short pause later a frame to the other. No required silence and no countdown appear inside it.', zh: '第一串突发落在 0.88 ms，它一次服务了两台电视：发给其中一台、收到回答，再隔一段短停顿就发给另一台。突发内部既没有必等的静默，也没有任何倒数。' },
    { en: 'While a burst runs, the inspector shows the class it belongs to and the time still left on the lease. It reads AC_VI here, because both streams are video.', zh: '突发进行时，检视器会显示它属于哪一类，以及这段短租还剩多少时间。这里显示的是 AC_VI，因为两路流都是视频。' },
    { en: 'Across the run the access point wins 463 bursts: 219 of them carry one frame and 243 carry two. The queue, not the ceiling, decides which.', zh: '整轮下来 AP 赢下 463 串突发：其中 219 串只带一帧，243 串带两帧。决定是哪一种的是队列，不是上限。' },
  ],
  tryThis: [
    { en: 'Turn the feature off on the access point and reload. It sends the same number of frames, but now draws a countdown 706 times instead of 462 — every exchange pays the price of winning all over again.', zh: '在 AP 上关掉这个功能再载入。它发出的帧数一模一样，但抽取倒数的次数从 462 变成了 706——每一次交互都要把“赢一次”的代价重新付一遍。' },
    { en: 'Give one television a saturated download instead of a video stream. That station now has frames waiting whenever the access point wins, and bursts grow to 1.9 ms and three frames.', zh: '把其中一台电视的业务从视频流改成饱和下载。现在只要 AP 获胜，发往这台终端的帧总是攒着，于是突发长到 1.9 ms、一次三帧。' },
  ],
  quiz: [
    {
      q: { en: 'What separates two exchanges inside one burst?', zh: '同一串突发里，两次交互之间隔着什么' },
      options: [
        { en: 'The required silence and a fresh countdown', zh: '必等的静默，加上一次新的倒数' },
        { en: 'Only the short pause used inside an exchange', zh: '只有交互内部用的那段短停顿' },
        { en: 'Nothing at all: the frames are sent back to back', zh: '什么都没有：帧是首尾相接发的' },
      ],
      answer: 1,
      explain: { en: 'That pause is shorter than any contender’s wait, so nobody else ever gets a chance to start. The price of winning is paid once, at the boundary.', zh: '这段停顿比任何竞争者要等的时间都短，所以别人根本没有开口的机会。“赢一次”的代价只在边界上付一遍。' },
    },
    {
      q: { en: 'In this run, what ends most bursts?', zh: '在本轮仿真里，多数突发是被什么结束的？' },
      options: [
        { en: 'The ceiling on the lease runs out', zh: '短租的上限用完了' },
        { en: 'The holder has nothing more waiting for that neighbour', zh: '持有者手里没有更多发往那个邻居的东西了' },
        { en: 'Another station takes the channel', zh: '另一台终端把信道抢走了' },
      ],
      answer: 1,
      explain: { en: 'The longest burst here uses about a tenth of what it was allowed. With modest streams, the queue empties long before the clock does.', zh: '这里最长的一串突发，只用掉了它被允许的大约十分之一。流量不大时，队列会比钟早得多地见底。' },
    },
    {
      q: { en: 'Why does the ceiling exist at all?', zh: '这个上限到底为什么要存在？' },
      options: [
        { en: 'To stop one winner from making everybody else wait too long', zh: '为了不让某个赢家把所有人晾得太久' },
        { en: 'To keep frames from becoming too large', zh: '为了不让帧变得太大' },
        { en: 'To give the access point more turns than the stations', zh: '为了让 AP 比终端多拿到几轮' },
      ],
      answer: 0,
      explain: { en: 'The worst wait anyone faces is roughly one full burst, so bounding the burst bounds the wait — which is why the class that carries calls gets the shortest ceiling.', zh: '任何人最坏的等待大约就是一整串突发，所以给突发封顶，就是给等待封顶——这也正是承载通话的那一类上限最短的原因。' },
    },
  ],
}
