/**
 * Wi-Fi Tier 1 · M2 · Channel access · Predicting collisions on paper.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the idea
 * first — two unknowns that each depend on the other, and the one pair of
 * values that satisfies both — then the equations in `numbers`, then the
 * derivations and the paper's own history in `deeper` and `sources`.
 *
 * The analytic values quoted below come from ./bianchiModel.ts and are
 * recomputed, together with every measured number, by
 * tests/course/bianchi.test.ts. Where the model and the simulator disagree is
 * the next lesson (bianchi-vs-sim.ts), which also owns the comparison table.
 *
 * The scenario builder and its three variants are unchanged, so the recorded
 * timeline hashes stay identical.
 */
import type { Scenario } from '../../model/scenario'
import { J, N, firstBackoffDraw, firstCollision, firstData, firstRetry, node, oneRoom, sc, type L10n, type Lesson } from '../lessonKit'

/**
 * n saturated legacy stations on a 3 m arc around the AP, every one of them
 * heard at exactly the same level, and all whispering at −20 dBm so the AP
 * receives them at −81.7 dBm: 12.3 dB of SNR, which only 6 Mb/s clears. That
 * pins the rate for the whole run — with headroom, the rate controller reads
 * collisions as a fading channel and walks the rate down, which is not the
 * fixed-rate world the model describes (see bianchi-vs-sim).
 *
 * Equal receive levels also mean no capture: two frames that start in the same
 * slot reach the AP at ~0 dB SINR and both fail the 4 dB preamble-detection
 * rule, so a collision destroys every frame in it, exactly as the model assumes.
 */
export function bianchiScenario(n: number, opts: { near?: boolean } = {}): Scenario {
  const nodes = [node('ap', 'AP', 'ap', 2, 4, 'nonht', 'idle', {})]
  for (let i = 0; i < n; i++) {
    const deg = opts.near ? (360 * i) / n : -25 + (50 * i) / (n - 1)
    const a = (deg * Math.PI) / 180
    const r = opts.near ? 1 : 3
    const s = node(
      `sta-${i + 1}`, `STA-${i + 1}`, 'sta',
      +(2 + r * Math.cos(a)).toFixed(3), +(4 + r * Math.sin(a)).toFixed(3),
      'nonht', 'saturated', {},
    )
    s.txPowerDbm = opts.near ? 15 : -20
    nodes.push(s)
  }
  // The model knows no ageing rule: a 10-minute MSDU lifetime keeps every
  // queued frame alive, so every station stays saturated for the whole run.
  return sc(oneRoom(), nodes, { seed: 7, queue: { limit: 500, lifetimeMs: 600_000 } })
}

export const nLabel = (n: number): L10n => ({ en: `n = ${n} stations`, zh: `n = ${n} 台站点` })

export const bianchi: Lesson = {
  id: 'bianchi',
  module: 1,
  title: {
    en: 'Predicting collisions on paper',
    zh: '在纸上预测碰撞',
  },
  why: {
    en: 'So far you have watched collisions happen and counted them afterwards. There is another way. Given nothing but the access rules — draw a number, count down, widen the window after a failure — you can work out in advance how often a room full of busy stations will talk over each other, and how much they will get through. This lesson builds that prediction.',
    zh: '到目前为止，我们都是先看着碰撞发生，再回头去数。还有另一条路。只凭接入规则本身——抽一个数、倒着数完、失败之后把窗口加宽——你可以提前算出：一屋子都想说话的站点，彼此打断的频率会是多少，最终又能送出去多少。这一课我们就把这个预测做出来。',
  },
  outcomes: [
    { en: 'say what a saturated network is and why the prediction needs one', zh: '说清什么是饱和网络，以及这个预测为什么非要它不可' },
    { en: 'explain why the two unknowns can only be found together', zh: '解释这两个未知数为什么只能一起求出来' },
    { en: 'read a collision probability off the table for any crowd size', zh: '对任意规模的人群，从表里读出它的碰撞概率' },
  ],
  needs: ['backoff', 'retries-queues'],
  terms: [
    { term: 'saturation', plain: {
      en: 'the state where every station always has another frame waiting, so nobody is ever quiet by choice',
      zh: '一种状态：每台站点手里永远还有下一帧等着发，于是没有谁是“自己不想说”才安静的',
    } },
    { term: 'transmit probability', plain: {
      en: 'the chance that one station starts sending in any given idle slot',
      zh: '某一台站点在任意一个空闲时隙里开口发送的概率',
    } },
    { term: 'collision probability', plain: {
      en: 'the chance that an attempt runs into somebody else’s attempt',
      zh: '一次尝试撞上别人某次尝试的概率',
    } },
  ],
  picture: [
    { heading: { en: 'From watching to predicting', zh: '从看，到算' }, text: {
      en: 'Everything so far you watched happen. Here you work it out first. Given a crowd of stations that all want the channel at once, the access rules by themselves fix how often those stations will talk over each other. Nothing about the room, the radios, the traffic or the distances enters the answer. Two equations on paper, and the number falls out.',
      zh: '此前的一切，都是看着它发生。这一次，我们先把它算出来。给定一群同时都想要信道的站点，光是接入规则本身，就已经钉死了它们彼此打断的频率。房间、射频、业务、距离——这些都不进入答案。纸上两个方程，数就出来了。',
    } },
    { heading: { en: 'Everybody always has something to send', zh: '每个人手里都还有话要说' }, text: {
      en: 'The prediction needs one strong assumption: saturation. The instant a frame leaves, the next one is already waiting, so no station is ever quiet because it has run out of things to say. That is not a normal network. It is the worst case — and it is the case worth knowing, because it is what the channel does when it is asked for everything it has.',
      zh: '这个预测需要一个很强的假设：饱和。一帧刚离开，下一帧已经在等着了，于是没有哪台站点是因为“没话可说”才安静下来的。这不是一个正常的网络。它是最坏的情况——也正是值得算清楚的那一种，因为它刻画的是：当你向信道索取它的全部时，它会怎么回答。',
    } },
    { kind: 'watch', jump: 1, heading: { en: 'The events being counted', zh: '要数的就是这种事件' }, text: {
      en: 'Load the simulation and jump to the first collision. Five stations, all saturated, all within earshot of one another. Every overlap from here on is one of the events the two equations are about to count.',
      zh: '载入仿真，跳到第一次碰撞。五台站点，都处于饱和，彼此都在听力范围内。从这里往后的每一次重叠，都是接下来那两个方程要数的事件。',
    } },
    { heading: { en: 'Two unknowns, each defined by the other', zh: '两个未知数，各自由对方定义' }, text: {
      en: 'Call the chance that one station opens its mouth in a given idle slot its transmit probability. Call the chance that an attempt runs into somebody else’s its collision probability. The first depends on the second: more collisions mean wider windows, so each station attempts less often. The second depends on the first: the more often the others attempt, the likelier a clash. Neither can be worked out on its own.',
      zh: '把“某一台站点在给定的空闲时隙里开口”的概率叫作它的发送概率。把“一次尝试撞上别人的尝试”的概率叫作碰撞概率。前者取决于后者：碰撞越多，窗口越宽，于是每台站点出手越稀。后者又取决于前者：其余人出手越勤，撞上的可能就越大。两个数，谁都没法单独算出来。',
    } },
    { heading: { en: 'One pair of values fits both', zh: '只有一对数能同时成立' }, text: {
      en: 'So you go looking for the pair that makes both statements true at once. Guess a collision probability; work out what the backoff rules would then make a station do; ask what collision probability that behaviour would in turn produce. One quantity falls as the other rises, so the two meet at exactly one place, and halving the interval over and over walks you to it.',
      zh: '于是你去找那一对能让两句话同时成立的数。先猜一个碰撞概率；算出在这个前提下退避规则会让站点怎么做；再问这种行为反过来会造出多大的碰撞概率。一个量随另一个量上升而下降，所以两者只在唯一一处相遇；不断把区间对半砍，就能一步步走到那里。',
    } },
    { heading: { en: 'From a probability to a number of bits', zh: '从一个概率，到一个比特数' }, text: {
      en: 'A probability is not yet a throughput. To get one, put a price on an average slot of channel time. Most slots are empty and cost only themselves. Some carry one frame and the answer to it. Some carry a pile-up that ends in nothing but a wasted wait. Weigh the three by how often each happens, divide what was delivered by the time it took, and the prediction is in megabits per second.',
      zh: '概率还不是吞吐。要得到吞吐，就得给“平均一个信道时隙”标个价。大多数时隙是空的，代价只有它自己。有些时隙里装着一帧和对它的回答。还有些时隙里是一堆撞在一起的帧，最后只换来一段白等。按各自发生的频率给这三种情况加权，用送出去的量除以花掉的时间，预测就以每秒多少兆比特的形式出现了。',
    } },
  ],
  numbers: [
    { kind: 'formula', heading: { en: 'The pair of equations', zh: '那一对方程' }, text: {
      en: 'τ = 2(1−2p) / [(1−2p)(W+1) + pW(1−(2p)^m)]        p = 1 − (1−τ)^(n−1)',
      zh: 'τ = 2(1−2p) / [(1−2p)(W+1) + pW(1−(2p)^m)]        p = 1 − (1−τ)^(n−1)',
    }, note: {
      en: 'τ is the transmit probability, p the collision probability, n the number of stations. W = 16 is the smallest window and m = 6 the number of doublings above it, so the window runs 15 up to 1023. The left equation is the backoff rules solved; the right one is the definition of a clash.',
      zh: 'τ 是发送概率，p 是碰撞概率，n 是站点数。W = 16 是最小的窗口，m = 6 是它之上还能翻几倍，于是窗口从 15 一路走到 1023。左边那个方程是退避规则的解，右边那个是“撞上”的定义。',
    } },
    { kind: 'table', heading: { en: 'What the equations predict', zh: '方程预测出什么' }, head: [
      N('n'), { en: 'Transmits per slot', zh: '每时隙发送概率' }, { en: 'Collides', zh: '碰撞概率' },
      { en: 'Throughput at 54 Mb/s', zh: '54 Mb/s 下的吞吐' }, { en: 'Throughput at 6 Mb/s', zh: '6 Mb/s 下的吞吐' },
    ], rows: [
      [N('2'), N('0.1046'), N('10.46 %'), N('31.28'), N('5.169 Mb/s')],
      [N('5'), N('0.0763'), N('27.22 %'), N('29.52'), N('4.679 Mb/s')],
      [N('10'), N('0.0533'), N('38.92 %'), N('27.36'), N('4.275 Mb/s')],
      [N('20'), N('0.0354'), N('49.59 %'), N('24.91'), N('3.857 Mb/s')],
    ] },
    { heading: { en: 'What the collision probability ignores', zh: '碰撞概率与什么无关' }, text: {
      en: 'Frame size, data rate and airtime are all absent: only the crowd and the window enter. Counters do not tick while somebody is transmitting, so a long frame hands nobody an extra chance to clash. Note too how little the crowd costs at the slow rate, 5.17 down to 3.86 Mb/s, against 31.3 down to 24.9 at the fast one.',
      zh: '帧长、数据速率、空口时间统统缺席：进入方程的只有人数和窗口。有人在发送时计数器不走，所以长帧不会给任何人多一次撞上的机会。也请留意，在慢速率上人群的代价有多小——5.17 掉到 3.86 Mb/s——而在快速率上是 31.3 掉到 24.9。',
    } },
    { kind: 'formula', heading: { en: 'What a success and a pile-up cost', zh: '一次成功与一次撞车各值多少' }, text: {
      en: 'T_s = 2064 + 16 + 44 + 34 = 2158 µs        T_c = 2064 + 45 + 34 = 2143 µs',
      zh: 'T_s = 2064 + 16 + 44 + 34 = 2158 µs        T_c = 2064 + 45 + 34 = 2143 µs',
    }, note: {
      en: 'A 1500-byte frame is 2064 µs of air at the slow rate. A success adds a SIFS, the ACK and a DIFS — and at this rate the ACK itself is 44 µs, not the 28 µs of the earlier rooms. A collision adds the ACK timeout and a DIFS instead, because this MAC starts the retry’s wait only when the deadline expires. Every one of those constants is the engine’s own, not fitted.',
      zh: '1500 字节的帧在慢速率上占 2064 µs 空口时间。一次成功要再加一个 SIFS、一个 ACK 和一个 DIFS——在这个速率上，ACK 本身是 44 µs，而不是前面几个房间里的 28 µs。一次碰撞加的则是 ACK 超时和一个 DIFS，因为本 MAC 要等期限到期才开始计重传前的等待。这些常数没有一个是拟合来的，全都取自引擎自身。',
    } },
    { heading: { en: 'The prediction against one run', zh: '预测对上一次实跑' }, text: {
      en: 'Run the five-station scene for ten seconds and count what happens: 5302 attempts, of which 1370 met somebody else. That is 25.84 % against a predicted 27.22 % — close, and wrong in a direction that repeats. Reading that direction is the next lesson.',
      zh: '把五台站点的场景跑十秒，数一数发生了什么：5302 次尝试，其中 1370 次撞上了别人。也就是 25.84%，而预测是 27.22%——很接近，但偏差的方向每次都一样。读懂这个方向，是下一课的事。',
    } },
  ],
  deeper: [
    { heading: { en: 'Where the first equation comes from', zh: '第一个方程是怎么来的' }, text: {
      en: 'It is the backoff chain solved for its long-run behaviour. A station that has failed i times draws uniformly from a window of 2^i·W values and walks down one step per idle slot, so the time it spends at that stage is proportional to p^i(2^i·W + 1)/2, and τ is the fraction of those slots in which its counter reads zero. The solver evaluates (1 − (2p)^m)/(1 − 2p) as the sum Σ_{k<m}(2p)^k, so p = ½ is an ordinary point rather than 0/0.',
      zh: '它是退避链在长期行为下的解。一台已经失败 i 次的站点，从 2^i·W 个取值里均匀抽签，每个空闲时隙走一步，于是它停留在这一阶段的时间正比于 p^i(2^i·W + 1)/2，而 τ 就是其中计数读数为零的那部分时隙的比例。求解器把 (1 − (2p)^m)/(1 − 2p) 按 Σ_{k<m}(2p)^k 这个和来算，于是 p = ½ 只是一个普通点，而不是 0/0。',
    } },
    { heading: { en: 'The bold assumption is the second equation', zh: '大胆的是第二个方程' }, text: {
      en: 'p = 1 − (1−τ)^(n−1) treats the other n − 1 stations as coins tossed independently in every slot, with the same τ whatever stage each of them is at and whatever just happened. That is decoupling, and it is what makes a closed form possible at all. It is also the assumption that frays first, and worst when n is small: with a single opponent there is no crowd to average over.',
      zh: 'p = 1 − (1−τ)^(n−1) 把其余 n − 1 台站点当成每个时隙独立抛掷的硬币，不论它们各自处在哪个阶段、刚刚发生过什么，用的都是同一个 τ。这就是解耦，也正是闭式解得以存在的原因。它同时也是最先松动的那个假设，而且 n 越小越糟：只有一个对手时，根本没有“人群”可供平均。',
    } },
    { heading: { en: 'The chain stops at seven', zh: '这条链在第七次停下' }, text: {
      en: 'The original chain retries for ever. This MAC gives a frame seven attempts and then discards it, which is the finite-retry variant of Wu et al. (INFOCOM 2002): a station that has exhausted its attempts restarts at the smallest window instead of sitting at the largest one, so it attempts slightly more often. At twenty stations that lifts the predicted collision probability from 48.09 % to 49.59 %. Every number in this lesson uses the finite chain.',
      zh: '原始的链是无限重传的。而本 MAC 给一帧七次机会，之后就把它丢掉——这就是 Wu 等人（INFOCOM 2002）的有限重传变体：用光机会的站点会从最小的窗口重新开始，而不是一直待在最大的窗口上，于是它出手略勤一些。在二十台站点时，这把预测的碰撞概率从 48.09% 抬到 49.59%。本课里的每一个数，用的都是有限链。',
    } },
    { heading: { en: 'Why the stations whisper', zh: '站点为什么要低声细语' }, text: {
      en: 'The model has one data rate; this simulator’s rate controller does not. Two failures in a row step the rate down, and a collision looks exactly like a fading channel to it. The scene therefore puts every station far enough away and quiet enough that there is no rung below the slowest one to fall to, so the fixed-rate assumption holds by construction. Equal receive levels also mean neither of two overlapping frames is ever locked onto — the no-capture assumption, arranged rather than assumed.',
      zh: '模型只有一种数据速率，而本仿真器的速率控制器不是。连续两次失败就降一档，而碰撞在它看来与信道衰落一模一样。因此这个场景把每台站点放得足够远、发得足够轻，让最慢的那一档之下再无可降，于是固定速率的假设按构造成立。等强度的接收电平还意味着两个重叠的帧谁也不会被锁定——“无捕获”这个假设，是被布置出来的，而不是被假定的。',
    } },
  ],
  sources: [
    { en: 'The model is G. Bianchi, “Performance Analysis of the IEEE 802.11 Distributed Coordination Function”, IEEE JSAC 18(3):535–547, 2000. The backoff procedure it formalises is §10.3.4.3 of IEEE Std 802.11-2024; aCWmin 15 and aCWmax 1023 are §17.4.4, giving W = 16 and m = 6.',
      zh: '模型出自 G. Bianchi，《Performance Analysis of the IEEE 802.11 Distributed Coordination Function》，IEEE JSAC 18(3):535–547，2000。它形式化的退避过程见 IEEE Std 802.11-2024 §10.3.4.3；aCWmin 15 与 aCWmax 1023 见 §17.4.4，于是 W = 16、m = 6。' },
    { en: 'A 1500-byte payload is 1528 octets on the air, 2064 µs at 6 Mb/s by Eq. 17-29; the ACK is 44 µs at the control-response rate of §10.6; the counters freeze while the medium is busy by §10.23.2.4. The collision cost T_c follows this MAC rather than the paper: the retry’s DIFS starts at the end of the ACK timeout (§10.3.2.9).',
      zh: '1500 字节的净荷在空口上是 1528 字节，按式 17-29 在 6 Mb/s 下为 2064 µs；ACK 按 §10.6 的控制响应速率发送，44 µs；介质忙时计数器冻结见 §10.23.2.4。碰撞代价 T_c 依的是本 MAC 而非论文：重传前的 DIFS 从 ACK 超时结束时开始计（§10.3.2.9）。' },
    { en: 'The finite-retry chain is Wu, Peng, Long, Cheng and Ma, INFOCOM 2002. The arc of stations, the −20 dBm transmit power, seed 7, the ten-minute MSDU lifetime and the ten-second sample are this simulator’s model choices, made so the paper’s assumptions hold.',
      zh: '有限重传链出自 Wu、Peng、Long、Cheng 与 Ma，INFOCOM 2002。站点排成的圆弧、−20 dBm 的发射功率、种子 7、十分钟的 MSDU 生存期与十秒的采样时长，都是本仿真器的模型取值，其目的正是让论文的假设成立。' },
  ],
  scenario: () => bianchiScenario(5),
  variants: [
    { label: nLabel(2), scenario: () => bianchiScenario(2) },
    { label: nLabel(10), scenario: () => bianchiScenario(10) },
    { label: nLabel(20), scenario: () => bianchiScenario(20) },
  ],
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first collision', '第一次碰撞', firstCollision),
    J('first retry', '第一次重传', firstRetry),
    J('first backoff draw', '第一次退避抽签', firstBackoffDraw),
  ],
  observe: [
    { en: 'The run opens with its worst collision: the medium has been idle since before the start, so all five stations transmit at t = 0 and the pile-up clears at 2.064 ms.', zh: '仿真以它最糟的一次碰撞开场。介质从开始之前就一直空闲，于是五台站点在 t = 0 同时发送，这堆叠加直到 2.064 ms 才结束。' },
    { en: 'Every data frame is the same 2064 µs long and every answer follows one SIFS later. That constancy is why a success can be priced as one number, not a distribution.', zh: '每个数据帧都是同样的长度，2064 µs，每个回答都在一个 SIFS 之后到来。正是这种一致性，让一次成功可以用一个数来定价，而不是一个分布。' },
    { en: 'A collision leaves the AP with no reception at all, not a garbled one: both preambles arrive at the same strength and neither is locked onto — no capture, made visible.', zh: 'AP 在一次碰撞里根本没有启动接收，而不是收到了乱码：两个前导以同样的强度到达，哪个都没被锁住。这就是“无捕获”假设的可见形态。' },
  ],
  tryThis: [
    { en: 'Predict, then switch. Read the ten-station row, run that variant ten seconds and count: 5678 attempts, 1992 collided, 3684 answers — 4.421 Mb/s against a predicted 4.275.', zh: '先预测，再切换。从表里读出十台站点那一行，把该变体跑十秒再数：5678 次尝试，其中 1992 次碰撞，3684 个回答——4.421 Mb/s，而预测是 4.275。' },
    { en: 'Change the seed and run the five-station scene again. Seeds 7, 8 and 12345 give 25.84 %, 25.53 % and 25.71 %: the draws move, the statistic does not.', zh: '在编辑器里换一个种子，把五台站点的场景再跑一遍。种子 7、8、12345 给出 25.84%、25.53%、25.71%：抽到的数变了，统计量没变。' },
  ],
  quiz: [
    {
      q: { en: 'Move every station next to the AP so each frame flies much faster. What does the prediction say the collision probability does?', zh: '把每台站点都挪到 AP 旁边，让每一帧都飞得快得多。预测说碰撞概率会怎样？' },
      options: [
        { en: 'It falls: shorter frames are exposed for less time', zh: '下降：帧更短，暴露的时间更少' },
        { en: 'It does not move: only the crowd size and the window enter the equations', zh: '不动：进入方程的只有人数和窗口' },
        { en: 'It rises: more transmissions fit into a second', zh: '上升：一秒里塞得下更多次发送' },
      ],
      answer: 1,
      explain: { en: 'Counters do not tick while somebody is transmitting, so airtime buys no extra chance to clash. Collisions per second do rise; a per-attempt probability does not.', zh: '有人在发送时计数器不走，所以空口时间不会给谁多一次撞上的机会。每秒的碰撞次数确实上升；而“每次尝试”的概率不变。' },
    },
    {
      q: { en: 'Why can the two unknowns not be worked out one at a time?', zh: '这两个未知数为什么不能一个一个地算？' },
      options: [
        { en: 'Because the equations have no solution unless they are solved together', zh: '因为不一起解，这组方程就无解' },
        { en: 'Because each one is defined in terms of the other, so only a pair that satisfies both is an answer', zh: '因为每一个都是用另一个定义的，只有同时满足两者的那一对数才算答案' },
        { en: 'Because the number of stations is unknown as well', zh: '因为站点数本身也是未知的' },
      ],
      answer: 1,
      explain: { en: 'How often a station attempts depends on how often it fails, and how often it fails depends on how often the others attempt. Only the pair where both hold is consistent.', zh: '一台站点出手多勤，取决于它失败得多频繁；而它失败得多频繁，又取决于其余人出手多勤。两者同时成立的那一对数，是唯一自洽的说法。' },
    },
    {
      q: { en: 'What does saturation buy the prediction?', zh: '饱和这个假设，给预测换来了什么？' },
      options: [
        { en: 'It makes every frame the same size', zh: '它让每一帧都一样长' },
        { en: 'It removes the traffic pattern: nobody is ever quiet for lack of something to send', zh: '它把业务模式从问题里拿掉了：没有谁是因为没东西可发才安静的' },
        { en: 'It guarantees that no frame is ever given up', zh: '它保证不会有任何一帧被放弃' },
      ],
      answer: 1,
      explain: { en: 'Without it you would have to model when each station has something to say. With it the answer depends on the access rules alone.', zh: '没有它，你就得去建模“每台站点什么时候有话要说”。有了它，答案只取决于接入规则。' },
    },
  ],
}
