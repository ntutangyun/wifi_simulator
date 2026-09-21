import { type Lesson, N, oneRoom, node, sc, firstCollision, firstRetry, firstFreeze, J } from '../lessonKit'

export const backoff: Lesson = {
  id: 'backoff',
  module: 1,
  title: { en: 'Random backoff & collisions', zh: '随机退避与碰撞' },
  body: [
    { text: {
      en: 'When two stations both want the channel, silence alone cannot break the tie — both would finish DIFS at the same instant. So each one plays a lottery:',
      zh: '当两台终端都想要信道时，仅靠静默无法决出胜负——它们会在同一瞬间等完 DIFS。于是每台终端都要抽一次签：',
    } },
    { kind: 'steps', items: [
      { en: 'Draw a random integer from [0, CW].', zh: '从 [0, CW] 里抽一个随机整数。' },
      { en: 'Decrement it once per idle 9 µs slot; the lower draw transmits first.', zh: '介质每空闲一个 9 µs 时隙就减一，抽得小的先发。' },
      { en: 'Equal draws hit zero in the same slot and transmit on top of each other: a collision.', zh: '若抽到相同值，双方在同一时隙同时清零、同时发送：碰撞。' },
      { en: 'Neither notices until the 45 µs ACK timeout expires; then each doubles its CW (15→31→…→1023) and redraws — collisions get rapidly less likely.', zh: '双方都要等到 45 µs 的 ACK 超时才察觉，然后各自把 CW 翻倍（15→31→…→1023）并重抽——碰撞概率随之骤降。' },
    ] },
    { heading: { en: 'Why exactly 45 µs?', zh: '为什么恰好是 45 µs？' }, text: {
      en: 'A transmitter cannot hear a collision — while sending, its own signal drowns out everything else, so the only evidence of failure is silence: the ACK never arrives. But silence needs a deadline, and 45 µs is the sum of three physically motivated pieces:',
      zh: '发送方听不到碰撞——发送时自己的信号会盖过一切，所以失败的唯一证据是沉默：ACK 迟迟不来。但“沉默”需要一个期限，而 45 µs 是三段有物理含义的时间之和：',
    } },
    { kind: 'table', head: [
      { en: 'Piece', zh: '组成' }, N('µs'), { en: 'Meaning', zh: '含义' },
    ], rows: [
      [N('SIFS'), N('16'), { en: 'The gap the receiver legitimately takes before starting its ACK.', zh: '接收方在开始回 ACK 前理应等待的间隔。' }],
      [{ en: '1 slot', zh: '1 个时隙' }, N('9'), { en: 'Margin.', zh: '余量。' }],
      [N('RxPHYStartDelay'), N('20'), { en: 'The time a radio needs to detect that an incoming preamble has started.', zh: '电台检测到一个前导码已经开始所需的时间。' }],
    ] },
    { kind: 'formula', text: {
      en: 'ACK timeout = 16 + 9 + 20 = 45 µs',
      zh: 'ACK 超时 = 16 + 9 + 20 = 45 µs',
    } },
    { text: {
      en: 'If an ACK were really on its way, its preamble would have been detected within those 45 µs. Silence past that point is proof of death — the station doubles its CW and redraws.',
      zh: '如果 ACK 真的在路上，它的前导码一定会在这 45 µs 之内被检测到。过了这个期限仍是沉默，就等于宣告帧已阵亡——终端随即把 CW 翻倍并重新抽取。',
    } },
    { text: {
      en: 'Notice where the new countdown starts. The collided transmissions end at 248 µs, but the stations cannot count that silence as idle time yet: until the timeout expires, each is still waiting for its response. So the retry’s DIFS is counted from the end of the timeout — 293 µs — and the fresh backoff is drawn only at 327 µs, a full 34 µs later.',
      zh: '注意新一轮倒数从哪里开始。碰撞的传输在 248 µs 就结束了，但终端还不能把这段安静算作空闲时间：超时到来之前，它们仍在等待自己的响应。所以重传前的 DIFS 要从超时结束的那一刻——293 µs——开始计，新的退避要到 327 µs 才抽取，整整晚了 34 µs。',
    } },
    { heading: { en: 'And the AP? It detects neither frame', zh: '那 AP 呢？它哪一帧都没检测到' }, text: {
      en: 'The AP experienced this collision differently. It was not transmitting, but it did not receive a garbled frame either. A radio locks onto a frame only if its preamble stands at least 4 dB above everything else on the air. Here both preambles arrive in the same instant at about the same strength, so each buries the other: the AP detects neither, starts no reception, and hears only energy on the channel.',
      zh: 'AP 经历这场碰撞的方式不一样。它当时并没有发送，但也没有收到一帧乱码。电台只有在一个前导码比空中其他一切信号至少高出 4 dB 时，才会锁定这一帧。这里两个前导码在同一瞬间、以差不多的强度到达，彼此淹没：AP 哪个都没检测到，没有开始任何接收，只感到信道上有能量。',
    } },
    { heading: { en: 'EIFS — the wait after a frame that was received but broken', zh: 'EIFS——收到了、却是坏帧之后的等待' }, text: {
      en: 'That matters, because the longer penalty wait, EIFS, is armed only by a reception that actually started and then failed its check. A station that locked onto a preamble but could not decode the frame must stay quiet for EIFS instead of DIFS before its next access. A frame whose preamble was never detected leaves nothing to fail, so it arms no EIFS.',
      zh: '这一点很关键，因为更长的惩罚等待 EIFS，只有在一次真正开始了的接收最终校验失败时才会启动。站点锁定了前导码、却没能解出这一帧，那么下一次接入前必须保持安静一个 EIFS，而不是一个 DIFS。前导码根本没被检测到的帧，没有留下任何可以失败的接收，所以不会启动 EIFS。',
    } },
    { kind: 'formula', text: {
      en: 'EIFS = SIFS + ACK at the lowest rate + DIFS = 16 + 44 + 34 = 94 µs',
      zh: 'EIFS = SIFS + 以最低速率发完一个 ACK + DIFS = 16 + 44 + 34 = 94 µs',
    } },
    { text: {
      en: 'The logic: that broken frame may have been meant for someone else who is about to answer it with an ACK. Having failed to decode the frame, the listener also missed its Duration field, so it holds back long enough not to trample a reply it cannot anticipate.',
      zh: '道理在于：那帧损坏的数据也许本来是发给别人的，对方马上就要回 ACK。侦听者既然没解出这帧，也就错过了它的 Duration 字段，所以多等这一段，才不会踩到那个自己“预料不到”的 ACK。',
    } },
    { text: {
      en: 'You will not see an EIFS block on the AP’s lane here. At the same-slot collisions nothing was received, so there is no EIFS at all. And even after a broken reception, a defer block is drawn only when a station is waiting in order to send, and this AP has nothing to transmit. A real, visible EIFS appears in lesson 6 — hovering the far station’s defer block even shows the EIFS being cut short into a DIFS the moment a healthy frame arrives (§10.3.2.3.7).',
      zh: '在本场景里，你不会在 AP 的泳道上看到 EIFS 色块。同一时隙的碰撞里 AP 什么都没收到，所以根本没有 EIFS；而且即使在收到坏帧之后，也只有当站点是“为了发送”而等待时才会画出等待色块，而这台 AP 无东西可发。想看真实可见的 EIFS，请到第 6 课——悬停远处终端的等待色块，还能看到 EIFS 在一帧健康的帧到来时被截短成 DIFS（§10.3.2.3.7）。',
    } },
    { text: {
      en: 'This scenario saturates two legacy stations. Use “first collision”: the red tick marks two overlapping transmissions. That first one happens at the very start — both stations find the medium already idle at t = 0 and transmit at once, with no backoff at all. The next one, at about 8.1 ms, is the classic kind: step backwards from it and watch both backoff counters reach zero in the same slot — the collision was fully determined a moment earlier.',
      zh: '本场景让两台传统终端处于饱和状态。点“第一次碰撞”：红色刻度处两次传输重叠。这第一次发生在一开始——t = 0 时两台终端都发现介质早已空闲，于是不做任何退避、同时发送。下一次碰撞（约 8.1 ms）才是经典情形：从那里往回步进，会看到两个退避计数器在同一时隙同时清零——碰撞在片刻之前就已注定。',
    } },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'STA-1', 'sta', 3.5, 5, 'nonht', 'saturated'),
    node('sta-2', 'STA-2', 'sta', 6.5, 5, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('first collision', '第一次碰撞', firstCollision),
    J('first retry', '第一次重传', firstRetry),
    J('first backoff freeze', '第一次退避冻结', firstFreeze),
    J('first CW doubling', '第一次 CW 翻倍', (r) => r.type === 'CW_CHANGE' && r.cw > 15),
  ],
  observe: [
    { en: 'Backoff counters (bo:n) decrement only while the medium is idle; they freeze when the other station transmits and resume at the same value.', zh: '退避计数（bo:n）只在介质空闲时递减；对方发送时冻结，之后从同一数值继续。' },
    { en: 'At the red tick the AP’s lane shows the overlap hatched red and marked “not detected”: the two preambles started together at similar strength and buried each other, so the AP never locked onto either frame. Hover it to see who else was on the air.', zh: '红色刻度处 AP 泳道上的重叠部分打着红色斜线，并标着“未检测到”：两个前导码同时开始、强度相近，彼此淹没，AP 一帧也没有锁定。悬停可见另一位发送者。' },
    { en: 'After a collision, both stations show CW → 31 in the inspector, and the retry frame carries the Retry flag.', zh: '碰撞后检视器里双方的 CW 都变成 31，重传帧带有 Retry 标志。' },
    { en: 'Retries draw from the doubled window: gaps before retransmissions are visibly longer on average.', zh: '重传从翻倍后的窗口抽取：重传前的等待间隙平均明显更长。' },
  ],
  tryThis: [
    { en: 'Count the idle slots between DIFS end and TX start — it always equals the drawn backoff value.', zh: '数一数 DIFS 结束到发送开始之间的空闲时隙数——永远等于抽到的退避值。' },
    { en: 'Change the seed in the editor and reload: different draws, different collision times, same physics.', zh: '在编辑器中改个种子再载入：抽值不同、碰撞时刻不同，但规律完全一致。' },
  ],
  quiz: [
    {
      q: { en: 'How does a station discover that its frame collided?', zh: '终端如何发现自己的帧发生了碰撞？' },
      options: [
        { en: 'It hears the interference while transmitting', zh: '发送时听到了干扰' },
        { en: 'The ACK never arrives (timeout after 45 µs)', zh: 'ACK 一直没来（45 µs 后超时）' },
        { en: 'The AP broadcasts a collision notification', zh: 'AP 广播碰撞通知' },
      ],
      answer: 1,
      explain: { en: 'Half-duplex radios cannot listen while talking — collision *avoidance*, not detection.', zh: '半双工的无线电边说边听做不到——所以是碰撞“避免”而非“检测”。' },
    },
    {
      q: { en: 'Why double CW after each failure?', zh: '为什么每次失败后 CW 都要翻倍？' },
      options: [
        { en: 'To punish misbehaving stations', zh: '惩罚行为不端的终端' },
        { en: 'More contenders ⇒ more collisions ⇒ spreading draws over a wider range separates them', zh: '竞争者越多碰撞越多⇒把抽值范围拉大能把它们分开' },
        { en: 'To save battery', zh: '为了省电' },
      ],
      answer: 1,
      explain: { en: 'Binary exponential backoff adapts the contention window to the (unknown) number of active stations.', zh: '二进制指数退避让竞争窗口自适应于（未知的）活跃终端数量。' },
    },
  ],
}
