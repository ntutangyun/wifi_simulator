/**
 * Wi-Fi Tier 1 · M2 · Channel access · Random backoff & collisions.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): why two
 * identical stations need a die at all, what the countdown does, and how a
 * sender that cannot hear a collision finds out about one. The dense material
 * that used to open the lesson — the deadline's three pieces, the buried
 * preambles, the EIFS that is never armed — lives in `numbers` and `deeper`.
 *
 * Every number quoted below is pinned in tests/course/backoff.test.ts. The
 * scenario builder is unchanged, so the recorded timeline hash stays identical.
 */
import { type Lesson, N, oneRoom, node, sc, firstCollision, firstRetry, firstFreeze, J } from '../lessonKit'

export const backoff: Lesson = {
  id: 'backoff',
  module: 1,
  title: { en: 'Random backoff & collisions', zh: '随机退避与碰撞' },
  why: {
    en: 'Waiting cannot settle an argument on its own. If two stations are both holding back until the channel goes quiet, they will both hear it go quiet at the same instant, and both start talking. Wi-Fi breaks the tie the only way it can without a referee: every station rolls a die, and the low roll speaks first. This lesson watches the dice, and what happens when two come up equal.',
    zh: '光是等，解决不了争端。如果两台站点都憋着、等信道安静下来，那它们会在同一瞬间听到它安静下来，然后一起开口。没有裁判的情况下，Wi-Fi 只能用唯一可行的办法来打破平局：每台站点掷一次骰子，点数小的先说。这一课我们盯着骰子看——也看看两颗骰子点数相同时会发生什么。',
  },
  outcomes: [
    { en: 'describe the draw-and-count-down rule in your own words', zh: '用自己的话说清“抽一个数、再倒着数下去”这条规则' },
    { en: 'explain how a sender discovers a collision it could not possibly have heard', zh: '解释发送方是怎么发现一次它根本听不见的碰撞的' },
    { en: 'say what doubling the window buys, and what it costs', zh: '说清把窗口翻倍买到了什么、又付出了什么' },
  ],
  needs: ['ifs'],
  terms: [
    { term: 'backoff', plain: {
      en: 'the random number of idle slots a station counts down before it is allowed to start',
      zh: '站点在获准开口之前，要倒着数完的那个随机的空闲时隙数',
    } },
    { term: 'CW', plain: {
      en: 'contention window: the top of the range the random number is drawn from',
      zh: '竞争窗口：抽那个随机数时，取值范围的上限',
    } },
    { term: 'ACK timeout', plain: {
      en: 'the deadline after which a sender stops expecting an answer and calls the frame lost',
      zh: '一个期限：过了它，发送方就不再指望回答，判这一帧已经丢了',
    } },
  ],
  picture: [
    { heading: { en: 'Two stations, one instant', zh: '两台站点，同一瞬间' }, text: {
      en: 'Both stations here are busy, both are waiting for the channel, and both follow the same rule. The moment the required silence is over they are in identical states — so a rule with no randomness in it would have them start in the same microsecond, every time, for ever. Something has to make two identical stations behave differently.',
      zh: '这里的两台站点都很忙，都在等信道，遵守的也是同一条规则。要求的那段安静一走完，它们的状态一模一样——也就是说，一条不带随机性的规则，会让它们在同一微秒开口，每一次都这样，永远这样。讲礼貌是不够的。必须有点什么，让两台一模一样的站点做出不一样的事。',
    } },
    { heading: { en: 'Roll, then count down', zh: '先掷骰子，再倒着数' }, text: {
      en: 'So each one draws a random whole number and treats it as a count of idle slots to sit through: its backoff. Every slot the channel stays quiet, the count drops by one; at zero the station sends. The lower draw wins, and since the draws are independent, the winner changes from round to round. If a frame starts mid-count the counter freezes and later picks up where it stopped, so nobody loses the waiting already done.',
      zh: '于是每台站点抽一个随机整数，把它当作“要熬过的空闲时隙数”：这就是它的退避值。信道每安静一个时隙，这个数就减一；减到零就发。抽得小的赢，而由于两边各抽各的，赢家每一轮都可能换人。若中途有帧开始，计数就地冻结，之后从停下的那个数继续，谁都不会把已经等过的时间白等。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Look at a collision', zh: '去看一次碰撞' }, text: {
      en: 'Load the simulation and jump to the first collision. Two frames start in the same instant and lie on top of each other; at the red tick the access point reports that it locked onto neither.',
      zh: '载入仿真，跳到第一次碰撞。两帧在同一瞬间开始，彼此叠在一起；在红色刻度处，AP 报告说这两帧它一个都没锁定。',
    } },
    { heading: { en: 'When both dice agree', zh: '当两颗骰子点数相同' }, text: {
      en: 'Nothing stops two stations drawing the same number. When they do, both counters reach zero in the same slot and both frames go out together, on top of each other. Neither sender notices: a radio cannot listen while it transmits. The first thing either learns is that the answer it expected has not arrived.',
      zh: '没有任何机制能阻止两台站点抽到同一个数。一旦抽到，两边的计数在同一个时隙同时归零，两帧一起发出去，彼此重叠。两个发送方什么都没察觉：无线电在发送时听不见。它们最先得知的事情，是自己等的那个回答没来。',
    } },
    { heading: { en: 'Silence needs a deadline', zh: '沉默需要一个期限' }, text: {
      en: 'So the sender starts a clock the moment its frame ends. If an answer were on its way it would have been noticed by now: the receiver’s own short pause, one slot of margin, and the time a radio needs to spot a signal beginning. Past that point silence is a verdict — the ACK timeout expires, the frame is lost, and the station must try again.',
      zh: '于是发送方在自己这帧结束的那一刻起表。如果回答真在路上，到这时候早该被察觉了：接收端理应先停的那一小段、一个时隙的余量、再加上无线电察觉“有信号开始了”所需的时间。过了这个点，沉默就是判决。ACK 超时到期，这一帧被判丢失，站点必须重来。',
    } },
    { heading: { en: 'Doubling the window', zh: '把窗口翻倍' }, text: {
      en: 'Trying again with the same die would be foolish: a collision is evidence that too many stations are drawing from too small a range. So a station that has failed doubles its CW, and doubles again with every further failure. Waits get longer, which costs airtime — but the chance of two draws landing on the same number falls fast. On the next success the window snaps back to its smallest value.',
      zh: '再拿同一颗骰子重来是愚蠢的：碰撞本身就是证据，说明抽签的人太多、范围太小。所以失败过的站点会把自己的 CW 翻倍，从更宽的范围里抽；再失败就再翻一倍。等待变长，要多花空口时间——但两个人抽到同一个数的概率会迅速下降。下一次成功之后，窗口立刻弹回到最小值。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'The draws this run makes', zh: '本轮仿真抽出来的数' }, head: [
      { en: 'Window', zh: '窗口' }, { en: 'Draws in 300 ms', zh: '300 ms 内的抽取次数' }, { en: 'Mean slots drawn', zh: '平均抽到的时隙数' },
    ], rows: [
      [N('CW = 15'), N('770'), N('7.15')],
      [N('CW = 31'), N('89'), N('16.07')],
      [N('CW = 63'), N('5'), N('23.80')],
    ] },
    { heading: { en: 'What a slot is worth', zh: '一个时隙值多少' }, text: {
      en: 'Every slot on that counter is 9 µs of waiting, so the mean wait roughly doubles with the window: about 64 µs at the smallest, 145 µs after one failure.',
      zh: '计数器上每一个时隙都是 9 µs 的等待，所以平均等待随窗口大致翻倍：最小窗口下约 64 µs，失败一次之后约 145 µs。',
    } },
    { kind: 'table', heading: { en: 'Why the deadline falls where it does', zh: '那个期限为什么落在这里' }, head: [
      { en: 'Piece', zh: '组成' }, N('µs'), { en: 'What it covers', zh: '它盖住了什么' }, { en: 'Where', zh: '出处' },
    ], rows: [
      [N('SIFS'), N('16'), { en: 'the pause the receiver legitimately takes before answering', zh: '接收端在回答之前理应先停的那一段' }, N('§17.4.4')],
      [{ en: 'one slot', zh: '一个时隙' }, N('9'), { en: 'margin', zh: '余量' }, N('§17.4.4')],
      [{ en: 'signal-detect delay', zh: '信号检测时延' }, N('20'), { en: 'the time a radio needs to spot a signal beginning', zh: '无线电察觉到“有信号开始了”所需的时间' }, N('§17.4.4')],
      [{ en: 'ACK timeout', zh: 'ACK 超时' }, N('45'), { en: 'past this, the frame is lost', zh: '过了这里，这一帧就算丢了' }, N('§10.3.2.9')],
    ] },
    { heading: { en: 'The first collision, timed', zh: '第一次碰撞的时刻表' }, text: {
      en: 'Both find the channel idle at the start and send at once, with no draw at all. The overlap is reported at 248 µs, the deadline expires at 293 µs, both windows double to 31, and the fresh draws come at 327 µs.',
      zh: '一开始两台站点都发现信道空闲，于是根本没抽签就同时发了出去。重叠在 248 µs 被报出来，期限在 293 µs 到期，两边的窗口都翻倍到 31，新的抽取在 327 µs 完成。',
    } },
    { heading: { en: 'How often it goes wrong', zh: '出错的频率' }, text: {
      en: 'Across 300 ms these two stations send 864 frames and collide 47 times — roughly one attempt in twenty. Doubling works: only five draws in the run come from a window as wide as 63.',
      zh: '在 300 ms 里，这两台站点一共发出 864 帧，碰撞 47 次——大约二十次里错一次。翻倍是管用的：整轮下来，只有五次抽取来自宽达 63 的窗口。',
    } },
  ],
  deeper: [
    { heading: { en: 'Why the access point sees nothing at all', zh: '为什么 AP 什么都没看到' }, text: {
      en: 'The access point was not transmitting, yet it did not receive a garbled frame either. A radio locks onto a frame only when its preamble stands clear of everything else on the air by a margin. Here the two preambles begin in the same instant at similar strength and bury each other, so the access point starts no reception at all and records only energy on the channel.',
      zh: 'AP 当时并没有在发送，可它也没有收到一帧乱码。无线电只有在某个前导比空中其余一切都高出一定余量时，才会锁定那一帧。这里两个前导在同一瞬间、以相近的强度开始，互相淹没，于是 AP 根本没有启动任何接收，只记录下信道上有能量。',
    } },
    { heading: { en: 'So no EIFS is ever armed here', zh: '所以这里从来不会有 EIFS' }, text: {
      en: 'That matters, because the long penalty wait is armed only by a reception that actually started and then failed its check. A station that never locked onto a preamble has nothing that failed, so it owes nothing extra. Across this whole run not a single EIFS is ever started, and the retry’s DIFS is counted from the end of the timeout at 293 µs rather than from the end of the collided frames at 248 µs.',
      zh: '这一点很关键：那段长长的惩罚等待，只有在“接收真的开始了、随后校验失败”时才会启动。压根没锁定过任何前导的站点，没有任何东西可以失败，也就不欠这一段。整轮仿真里一个 EIFS 都没有启动过；重传前的 DIFS 是从 293 µs 超时结束那一刻起算的，而不是从 248 µs 碰撞帧结束那一刻。',
    } },
  ],
  sources: [
    { en: 'The backoff procedure is §10.3.4.3 of IEEE Std 802.11-2024; aCWmin 15 and aCWmax 1023 are §17.4.4, and the window doubles 15 → 31 → 63 → … → 1023 on each failure.',
      zh: '退避过程见 IEEE Std 802.11-2024 的 §10.3.4.3；aCWmin 15 与 aCWmax 1023 见 §17.4.4，每失败一次窗口翻倍：15 → 31 → 63 → … → 1023。' },
    { en: 'The acknowledgement deadline is §10.3.2.9: aSIFSTime + aSlotTime + aRxPHYStartDelay, which is 16 + 9 + 20 µs here.',
      zh: '确认帧的期限见 §10.3.2.9：aSIFSTime + aSlotTime + aRxPHYStartDelay，在这里就是 16 + 9 + 20 µs。' },
    { en: 'The capture margin that decides which of two overlapping preambles a radio locks onto is a model choice of this simulator, as are the seed, the two saturated stations and the 1528-byte frame.',
      zh: '“两个重叠前导里无线电锁住哪一个”所用的捕获余量，是本仿真器的模型取值；随机种子、两台饱和站点与 1528 字节的帧同样如此。' },
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
    { en: 'The counters (bo:n) drop only while the channel is idle. When the other station transmits they freeze and resume at the same value — 770 pairs here, not one losing a slot.', zh: '计数器（bo:n）只在信道空闲时递减。对方一发送就冻结，之后从同一个值继续——本轮共有 770 组冻结与恢复，没有一组丢掉过一个时隙。' },
    { en: 'At the red tick the access point’s lane shows the overlap hatched and marked “not detected”. Afterwards both stations show CW 31 in the inspector, and each retry frame carries the Retry flag.', zh: '红色刻度处，AP 泳道上的重叠部分打着斜线并标着“未检测到”。之后检视器里两台站点的 CW 都变成 31，而每一个重传帧都带着 Retry 标志。' },
    { en: 'Jump to the second collision, at about 8.1 ms, and step backwards: both counters reach zero in the very same slot. It was settled a moment before it happened.', zh: '跳到大约 8.1 ms 处的第二次碰撞，从那里往回步进：两个计数器在同一个时隙同时归零。碰撞在发生之前的那一刻就已经注定了。' },
  ],
  tryThis: [
    { en: 'Count the idle slots between the end of a DIFS and the frame that follows it. It always equals the number that station drew.', zh: '数一数从一个 DIFS 结束到紧随其后那一帧开始之间的空闲时隙。它永远等于那台站点抽到的数。' },
    { en: 'Change the seed in the editor and reload: different draws, different collision times, still roughly one attempt in twenty going wrong.', zh: '在编辑器里换一个随机种子再载入。抽到的数不同，碰撞的时刻不同——但出错的比例依旧是大约二十次里一次。' },
  ],
  quiz: [
    {
      q: { en: 'How does a station discover that its frame collided?', zh: '站点是怎么发现自己那一帧碰撞了的？' },
      options: [
        { en: 'It hears the interference while it is transmitting', zh: '它在发送时听到了干扰' },
        { en: 'The answer never arrives, and the deadline for it expires', zh: '回答一直没来，等它的那个期限到期了' },
        { en: 'The access point broadcasts a collision notice', zh: 'AP 广播了一条碰撞通知' },
      ],
      answer: 1,
      explain: { en: 'A radio cannot listen while it talks. Hence collision avoidance rather than collision detection.', zh: '无线电边说边听是做不到的。正因如此，这套机制是“碰撞避免”，而不是“碰撞检测”。' },
    },
    {
      q: { en: 'Why double the window after each failure?', zh: '为什么每失败一次就要把窗口翻倍？' },
      options: [
        { en: 'To punish stations that misbehave', zh: '为了惩罚行为不端的站点' },
        { en: 'More contenders mean more collisions; spreading the draws over a wider range separates them again', zh: '竞争者越多碰撞越多；把抽值摊到更宽的范围上，能把它们重新分开' },
        { en: 'To save the station’s battery', zh: '为了给站点省电' },
      ],
      answer: 1,
      explain: { en: 'Nobody knows how many stations are active, so the window learns it the hard way: wider after each failure, smallest again after each success.', zh: '没人知道到底有多少台站点在抢，所以窗口只能用笨办法去学：每失败一次就变宽，每成功一次就弹回去。' },
    },
    {
      q: { en: 'A counter freezes at 7 while another station transmits. What value does it resume at?', zh: '别的站点在发送时，一个计数器冻结在 7。恢复时它从几开始？' },
      options: [
        { en: 'A freshly drawn number', zh: '重新抽一个数' },
        { en: '7 — exactly where it stopped', zh: '7——正是它停下的那个数' },
        { en: '0, because the wait is over', zh: '0，因为等待已经结束了' },
      ],
      answer: 1,
      explain: { en: 'Waiting already done is never thrown away — which stops a long-waiting station from being overtaken by one that has just arrived.', zh: '已经等过的时间从不作废。正是这一点，让等了很久的站点不至于被刚到的站点后来居上。' },
    },
  ],
}
