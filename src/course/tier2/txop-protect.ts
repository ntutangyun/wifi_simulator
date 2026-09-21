import { type Lesson, N, hallwayHouse, node, sc, firstRts, firstCfEnd, firstCfEndRelay, firstCollision, J } from '../lessonKit'

export const txopProtect: Lesson = {
  id: 'txop-protect',
  module: 2,
  title: { en: 'Protecting the burst — one CTS for the whole TXOP', zh: '保护整个突发——一个 CTS 预约整个 TXOP' },
  body: [
    { text: {
      en: 'Lesson 9 showed a holder chaining exchanges one SIFS apart. Anyone who can hear the holder cannot break in: SIFS is shorter than every AIFS. But lesson 5’s hidden station hears only the receiver. This scene is lesson 5’s hallway with TXOP bursts and an RTS threshold of 500 B, so every TXOP — in both variants — opens with an RTS/CTS the hidden station can hear. The only difference left is how far that reservation reaches. Under single protection it covers one exchange: the hidden station stays quiet for the first frame and its ACK, then counts straight into the second frame of the burst.',
      zh: '第 9 课里，持有者以一个 SIFS 的间隔串联多次交换。听得到持有者的站点插不进来：SIFS 比任何 AIFS 都短。但第 5 课那种隐藏站点只听得到接收方。本场景就是第 5 课的走廊，加上 TXOP 突发，并把 RTS 门限设成 500 B——于是两个变体里的每一个 TXOP 都以隐藏站点听得见的 RTS/CTS 开场。剩下的唯一区别，是这段预约能覆盖多远。单次保护下它只覆盖一次交换：隐藏站点为第一帧和它的 ACK 保持安静，随后就径直数进了突发的第二帧。',
    } },
    { kind: 'table', heading: { en: 'Three ways to announce a burst (§9.2.5.2)', zh: '预告突发的三种方式（§9.2.5.2）' }, head: [
      { en: 'Policy', zh: '策略' }, { en: 'Opens the burst with', zh: '突发以什么开头' }, { en: 'Data frames carry', zh: '数据帧携带' }, { en: 'Ends early with', zh: '提前结束时' },
    ], rows: [
      [{ en: 'single', zh: '单次' }, { en: 'the data frame (RTS only above the threshold)', zh: '数据帧本身（超过门限才有 RTS）' }, N('SIFS + ACK'), { en: 'nothing to give back', zh: '无需归还' }],
      [{ en: 'boundary', zh: '边界' }, { en: 'RTS/CTS whose Duration reaches the end of the TXOP', zh: 'Duration 直达 TXOP 末尾的 RTS/CTS' }, N('SIFS + ACK'), N('CF-End')],
      [{ en: 'multiple', zh: '多重' }, { en: 'the same RTS/CTS', zh: '同样的 RTS/CTS' }, { en: 'the TXOP remainder', zh: 'TXOP 剩余时间' }, N('CF-End')],
    ] },
    { heading: { en: 'What the CTS does that the RTS cannot', zh: 'CTS 能做到而 RTS 做不到的事' }, text: {
      en: 'The RTS is heard only by the holder’s neighbourhood; the hidden station cannot decode it. The CTS comes from the receiver — here the AP — and repeats the reservation minus itself. That is the frame the hidden station loads into its NAV, and with boundary protection that NAV lasts to the end of the TXOP, not just one exchange.',
      zh: 'RTS 只有持有者周围的站点能听到，隐藏站点解不出它。CTS 来自接收方——这里是 AP——把预约减去自身后再广播一遍。隐藏站点装进 NAV 的正是这一帧；在边界保护下，这个 NAV 一直持续到 TXOP 结束，而不只是一次交换。',
    } },
    { kind: 'formula', text: {
      en: 'CTS Duration = RTS Duration − SIFS − CTS time\nNAV at hidden B = CTS end + CTS Duration = end of A’s TXOP',
      zh: 'CTS 的 Duration = RTS 的 Duration − SIFS − CTS 时长\n隐藏站 B 的 NAV = CTS 结束 + CTS 的 Duration = A 的 TXOP 末尾',
    } },
    { heading: { en: 'Giving time back — CF-End', zh: '把时间还回去——CF-End' }, text: {
      en: 'A reservation to the end of the TXOP is usually more than the burst needs. When the burst ends before it — the queue ran dry, or the next exchange no longer fits — the holder sends a CF-End one SIFS after the last ACK, and every station that decodes it resets its NAV. A hidden station cannot decode the holder’s CF-End — so the standard has the AP repeat it one SIFS later (§10.23.2.9): the same trick as the CTS, in reverse.',
      zh: '预约到 TXOP 末尾通常比突发实际需要的更长。突发提前结束时——队列空了，或者下一次交换已经装不下——持有者就在最后一个 ACK 之后一个 SIFS 发出 CF-End，所有解出它的站点清零 NAV。隐藏站点解不出持有者的 CF-End——所以标准让 AP 在一个 SIFS 后重复一遍（§10.23.2.9）：和 CTS 一样的手法，方向相反。',
    } },
    { kind: 'table', heading: { en: 'This scenario, 300 ms', zh: '本场景，300 ms' }, head: [
      { en: 'Metric', zh: '指标' }, { en: 'single', zh: '单次' }, { en: 'boundary', zh: '边界' },
    ], rows: [
      [{ en: 'collisions', zh: '碰撞' }, N('46'), N('21')],
      [{ en: 'frames delivered', zh: '送达帧数' }, N('212'), N('614')],
      [{ en: 'retries', zh: '重传' }, N('112'), N('47')],
      [{ en: 'frames dropped', zh: '丢弃帧数' }, N('6'), N('1')],
    ] },
    { text: {
      en: 'Of the 21 collisions that remain, 18 are RTS meeting RTS — two hidden stations starting within one 28 µs RTS of each other, but now each loses 20 bytes instead of a burst of 1500-byte frames — and 3 catch a data frame already under way. That is lesson 5’s bargain, extended from one frame to a whole TXOP.',
      zh: '剩下的 21 次碰撞里，18 次是 RTS 撞 RTS——两台隐藏站点的起跑时刻相差不到一个 28 µs 的 RTS，但现在各自只损失 20 字节，而不是一整串 1500 字节的帧——另外 3 次撞上了正在进行中的数据帧。这正是第 5 课的那笔交易，从一帧扩展到了整个 TXOP。',
    } },
    { text: {
      en: 'The price is airtime: an RTS/CTS per burst, a CF-End (twice, with the relay), and anyone who misses the CF-End waits until the announced end. Real Wi-Fi 6/7 gear pays it this way: data frames keep single protection, and the RTS/CTS — or its multi-user form, MU-RTS — at the TXOP boundary carries the burst.',
      zh: '代价是空口时间：每个突发一次 RTS/CTS、一次 CF-End（加上 AP 的重复是两次），而错过 CF-End 的站点要等到预告的末尾。真实的 Wi-Fi 6/7 设备正是这样付账的：数据帧保持单次保护，由 TXOP 边界处的 RTS/CTS——或其多用户形式 MU-RTS——来承载整个突发的预约。',
    } },
    { text: {
      en: 'And note what boundary protection is not: a blanket rule that every TXOP opens with an RTS. The holder sends that boundary RTS only when more than one exchange is actually planned for this TXOP — there is no burst to protect otherwise. So when the rate falls far enough that a single 1500-byte frame fills the TXOP on its own, boundary protection sends nothing, and that lone exchange is protected only if the frame is above the RTS threshold. That is why this scene sets the threshold to 500 B: without it, the TXOPs that hold one long low-rate frame would go out bare, and they are exactly the ones a hidden station has the most time to walk into.',
      zh: '也要看清边界保护不是什么：它不是“每个 TXOP 都先发一个 RTS”的一刀切规则。只有当这个 TXOP 确实计划了不止一次交换时，持有者才会发出这个边界 RTS——否则根本没有突发需要保护。于是当速率低到一个 1500 字节的帧就能把整个 TXOP 填满时，边界保护什么也不会发，那次孤零零的交换只能靠 RTS 门限来保护。这正是本场景把门限设为 500 B 的原因：否则那些只装得下一个长慢帧的 TXOP 会裸奔上阵——而恰恰是它们，给了隐藏站点最长的时间撞进来。',
    } },
  ],
  scenario: () => sc(hallwayHouse(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    { ...node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'boundary' },
    { ...node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'boundary' },
  ], { rtsThresholdBytes: 500 }),
  variants: [
    {
      label: { en: 'single protection (per exchange)', zh: '单次保护（逐次交换）' },
      scenario: () => sc(hallwayHouse(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }),
        node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }),
      ], { rtsThresholdBytes: 500 }),
    },
    {
      label: { en: 'multiple protection (data frames carry the remainder)', zh: '多重保护（数据帧携带剩余时间）' },
      scenario: () => sc(hallwayHouse(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        { ...node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'multiple' },
        { ...node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'multiple' },
      ], { rtsThresholdBytes: 500 }),
    },
  ],
  jumps: [
    J('first RTS', '第一个 RTS', firstRts),
    J('first CF-End', '第一个 CF-End', firstCfEnd),
    J('first CF-End relayed by the AP', '第一个由 AP 重复的 CF-End', firstCfEndRelay),
    J('first collision', '第一次碰撞', firstCollision),
  ],
  observe: [
    { en: '“first RTS”: A and B both open with an RTS at t = 0 — and collide, 20 bytes each. A’s third try at 0.736 ms gets through: hover its RTS (Duration 2500 µs, reaching the end of its 2.528 ms TXOP) and the AP’s CTS at 0.780 ms (2456 µs — the same minus one SIFS and the CTS itself). Hidden B’s lane turns NAV-purple until 3.264 ms, although B never hears A.', zh: '“第一个 RTS”：A 和 B 都在 t = 0 以 RTS 开场——然后撞在一起，各损失 20 字节。A 在 0.736 ms 的第三次尝试成功了：悬停它的 RTS（Duration 2500 µs，直达它 2.528 ms TXOP 的末尾）和 AP 在 0.780 ms 的 CTS（2456 µs——相同数值减去一个 SIFS 和 CTS 自身）。隐藏站 B 的泳道一直到 3.264 ms 都是 NAV 紫色，尽管 B 从来听不到 A。' },
    { en: '“first CF-End” (≈ 2.90 ms): after five exchanges 376 µs of A’s reservation remain — too little for another 1500-byte frame and its ACK. A sends CF-End, the AP repeats it one SIFS later, and B’s NAV ends at 2.976 ms instead of 3.264 ms.', zh: '“第一个 CF-End”（≈ 2.90 ms）：五次交换之后，A 的预约还剩 376 µs——不够再发一个 1500 字节的帧加 ACK。A 发出 CF-End，AP 在一个 SIFS 后重复一遍，B 的 NAV 在 2.976 ms 结束，而不是 3.264 ms。' },
    { en: '“first collision” (28 µs) is an RTS meeting an RTS — 20 bytes lost each, not a burst. Then load the “single protection” variant: B’s NAV covers only the first exchange, so it wakes up inside the burst and collides into A’s second, third or fourth frame — 24 of its 29 data-frame collisions are not the first exchange of a TXOP — and the red ticks pile up as in lesson 5.', zh: '“第一次碰撞”（28 µs）是 RTS 撞 RTS——各损失 20 字节，而不是一整个突发。再载入“单次保护”变体：B 的 NAV 只覆盖第一次交换，于是它在突发中途醒来，撞进 A 的第二、第三或第四帧——它那 29 次数据帧碰撞里有 24 次都不是 TXOP 的第一次交换——红色刻度像第 5 课那样堆积起来。' },
  ],
  tryThis: [
    { en: 'Load the “multiple protection” variant and hover a data frame inside a burst: its Duration now reaches the end of the TXOP, so even a station that missed the CTS learns the reservation from the data itself.', zh: '载入“多重保护”变体，悬停突发内部的一个数据帧：它的 Duration 现在直达 TXOP 末尾，于是错过 CTS 的站点也能从数据帧本身得知预约。' },
    { en: 'Open the scenario in the editor, turn TXOP off on both stations and compare: every frame contends again, and there is no burst left to protect.', zh: '在编辑器中打开本场景，关闭两台终端的 TXOP 再比较：每一帧都要重新竞争，也就没有突发可保护了。' },
    { en: 'Raise the RTS threshold back to the usual 3000 B, above the 1500-byte frames, and reload. Boundary protection still covers the multi-exchange bursts, but every TXOP that turned out to hold a single frame now opens bare: collisions rise from 21 to 80 and deliveries fall from 614 to 344. The frames that go unprotected are the slow ones — one MCS-0 frame is 1.9 ms and fills the 2.528 ms TXOP by itself.', zh: '把 RTS 门限调回常见的 3000 B（高于 1500 字节的帧）再重新载入。边界保护仍然覆盖多次交换的突发，但凡是最后只装了一帧的 TXOP 都变成裸奔：碰撞从 21 次升到 80 次，送达帧数从 614 降到 344。裸奔的恰恰是那些慢帧——一个 MCS 0 的帧要 1.9 ms，光它自己就填满了 2.528 ms 的 TXOP。' },
  ],
  quiz: [
    {
      q: { en: 'Hidden B never hears A. Which frame silences B for A’s whole burst?', zh: '隐藏站 B 从来听不到 A。哪一帧让 B 在 A 的整个突发期间保持安静？' },
      options: [
        { en: 'A’s RTS', zh: 'A 的 RTS' },
        { en: 'The AP’s CTS', zh: 'AP 的 CTS' },
        { en: 'A’s first data frame', zh: 'A 的第一个数据帧' },
      ],
      answer: 1,
      explain: { en: 'Only the AP is audible to B. The CTS repeats A’s reservation from the AP’s side, and with boundary protection that reservation reaches the end of A’s TXOP.', zh: 'B 只听得到 AP。CTS 从 AP 一侧重复 A 的预约，而在边界保护下这段预约直达 A 的 TXOP 末尾。' },
    },
    {
      q: { en: 'A burst ends 1.5 ms before its announced reservation. What happens?', zh: '一个突发比预告的预约提前 1.5 ms 结束。会发生什么？' },
      options: [
        { en: 'Nothing — everyone waits out the reservation', zh: '什么都不发生——所有人把预约等完' },
        { en: 'The holder sends CF-End and the AP repeats it', zh: '持有者发出 CF-End，AP 重复一遍' },
        { en: 'The holder sends a new RTS', zh: '持有者再发一个 RTS' },
      ],
      answer: 1,
      explain: { en: 'CF-End truncates the TXOP (§10.23.2.9). Stations that decode either copy reset their NAV; the rest wait until the announced end.', zh: 'CF-End 截断 TXOP（§10.23.2.9）。解出任一份的站点清零 NAV，其余站点等到预告的末尾。' },
    },
  ],
}
