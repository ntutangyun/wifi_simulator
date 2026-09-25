/**
 * Wi-Fi Tier 1 · M6 · Predicting DCF on paper.
 *
 * Re-paced 2026-09-25 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md).
 * §2 proposed splitting this lesson at the throughput step; §8 rejected the
 * split and I kept the ruling: the fixed point and the price of a slot are one
 * method, and the seven-step calculator cannot be cut in two without leaving
 * the first half on a probability the reader cannot use. What the lesson lost
 * instead is padding — the three-kinds-of-slot enumeration is now the timing
 * figure below, and the scene-setting prose is half its old length.
 *
 * The one thing that must not drift back: the equations on the MAIN PATH are
 * the FINITE-retry pair `solveBianchi` actually solves. Bianchi's classic
 * infinite-retry closed form lives in `deeper`, labelled as his, carrying the
 * 48.09 % against 49.59 % at twenty stations that is the difference it makes.
 * tests/course/bianchi.test.ts keeps the two apart by assertion.
 *
 * The analytic values quoted below come from ./bianchiModel.ts and are
 * recomputed, together with every measured number, by
 * tests/course/bianchi.test.ts. Where the model and the simulator disagree is
 * the next lesson (bianchi-vs-sim.ts), which owns the comparison table.
 *
 * The scenario builder and its three variants are unchanged, so the recorded
 * timeline hashes stay identical.
 */
import type { Scenario } from '../../model/scenario'
import type { TimingSpec } from '../diagram'
import { SLOT_NS } from '../../engine/phy'
import { J, firstBackoffDraw, firstCollision, firstData, firstRetry, node, oneRoom, sc, type Lesson } from '../lessonKit'
import { dcfTimes } from './bianchiModel'

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

export const nLabel = (n: number): string => (`n = ${n} 台站点`)

/**
 * The three kinds of channel slot the last three steps price, drawn to scale
 * from the engine's own constants: an empty slot is `SLOT_NS`, a successful one
 * `dcfTimes(1500, 6).tsNs`, a collided one `tcNs`. The figure and the formula
 * above it read the same two sources, so neither can drift from the other, and
 * the picture is what shows the thing a table cannot: nine microseconds against
 * two thousand is why a crowd pays so little for its empty slots.
 */
export function bianchiSlotTiming(): TimingSpec {
  const t = dcfTimes(1500, 6)
  const us = (ns: number): number => ns / 1000
  const slot = us(SLOT_NS)
  const data = us(t.dataNs)
  return {
    kind: 'timing',
    lanes: [
      { label: '空的', spans: [{ label: `${slot} µs`, fromUs: 0, toUs: slot }] },
      {
        label: '成功的',
        spans: [
          { label: `数据 ${data} µs`, fromUs: 0, toUs: data, tone: 'accent' },
          { label: `回答与等待 ${us(t.tsNs) - data} µs`, fromUs: data, toUs: us(t.tsNs) },
        ],
      },
      {
        label: '撞车的',
        spans: [
          { label: `两帧重叠 ${data} µs`, fromUs: 0, toUs: data, tone: 'muted' },
          { label: `期限与等待 ${us(t.tcNs) - data} µs`, fromUs: data, toUs: us(t.tcNs) },
        ],
      },
    ],
    axis: { fromUs: 0, toUs: 2200, ticks: [0, 1000, 2000], unit: 'µs' },
  }
}

export const bianchi: Lesson = {
  id: 'bianchi',
  module: 5,
  title: '在纸上预测碰撞',
  why: '到目前为止我们都是先看着碰撞发生，再回头去数。还有另一条路：只凭接入规则本身——抽一个数、倒着数完、失败之后把窗口加宽——就能提前算出一屋子想说话的站点（STA）彼此打断得多频繁，以及最终能送出去多少。这一课把这个预测做出来，并教你拿一只计算器重算一遍。',
  outcomes: [
    '说清什么是饱和网络，以及这个预测为什么非要它不可',
    '解释这两个未知数为什么只能一起求出来',
    '对任意规模的人群，从表里读出尝试之间多久撞上一次',
  ],
  needs: ['collisions-cw', 'queues'],
  terms: [
    { term: 'saturation', plain: '一种状态：每台站点手里永远还有下一帧等着发，于是没有谁是“自己不想说”才安静的' },
    { term: 'transmit probability', plain: '某一台站点在任意一个空闲时隙里开口发送的概率' },
    { term: 'collision probability', plain: '一次尝试撞上别人某次尝试的概率' },
  ],
  picture: [
    { heading: '从看，到算', text: '此前的一切都是看着它发生。这一次先把它算出来：给定一群同时都想要信道的站点，光是接入规则本身就钉死了它们彼此打断的频率。房间、射频、业务、距离都不进入答案。' },
    { heading: '每个人手里都还有话要说', text: '这个预测要一个很强的假设：一帧刚离开，下一帧已经在等着，于是没有哪台站点是因为“没话可说”才安静的——这就是饱和。它不是一个正常的网络，而是最坏的那一种，也正因此值得算清楚：你向信道索取它的全部时，它会怎么回答。' },
    { kind: 'watch', jump: 1, heading: '要数的就是这种事件', text: '载入仿真，跳到第一次碰撞。五台饱和的站点，彼此都在听力范围内；从这里往后的每一次重叠，都是那两个方程要数的事件。' },
    { heading: '两个未知数，各自由对方定义', text: '“某一台站点在给定的空闲时隙（slot time）里开口”的概率叫发送概率，记作 τ；“一次尝试撞上别人”的概率叫碰撞概率，记作 p。前者取决于后者：碰撞越多，窗口越宽，出手越稀。后者又取决于前者：其余人出手越勤，撞上的可能越大。两个数，谁都没法单独算出来。' },
    { heading: '只有一对数能同时成立', text: '所以要找那一对能让两句话同时成立的数——这一对数叫作不动点。τ 随 p 上升而下降，于是两者只在唯一一处相遇，把区间对半砍就能走到那里——下面的步骤就是这件事。' },
    { heading: '从一个概率，到一个比特数', text: '概率还不是吞吐。要得到吞吐，就得给“平均一个信道时隙”标个价——而一个时隙只有三种长相。按各自发生的频率加权，用送出去的量除以花掉的时间，预测就以每秒多少兆比特的形式出现。' },
  ],
  numbers: [
    { kind: 'formula', heading: '本课要解的那一对方程', text: 'τ = Σ_{i<L} p^i / Σ_{i<L} p^i (W_i + 1)/2        p = 1 − (1−τ)^(n−1)', note: 'n 是站点数，L = 7 是一帧拿到的尝试次数，W_i = 2^min(i,m)·W 是第 i 次尝试时的窗口，其中 W = 16、m = 6。左边那个方程，是按“一帧过了 L 次就放弃”这套媒体访问控制（MAC）解出的退避（backoff）规则；右边那个是“撞上”的定义。' },
    { kind: 'table', heading: '这两个方程预测出什么', head: [
      'n', '每时隙发送概率', '碰撞概率',
      '54 Mb/s 下的吞吐', '6 Mb/s 下的吞吐',
    ], rows: [
      ['2', '0.1046', '10.46 %', '31.28', '5.169 Mb/s'],
      ['5', '0.0763', '27.22 %', '29.52', '4.679 Mb/s'],
      ['10', '0.0533', '38.92 %', '27.36', '4.275 Mb/s'],
      ['20', '0.0354', '49.59 %', '24.91', '3.857 Mb/s'],
    ] },
    { heading: '碰撞概率与什么无关', text: '帧长、数据速率、空口时间（airtime）统统缺席：进入方程的只有人数和窗口。有人在发送时计数器不走，所以长帧不会给谁多一次撞上的机会。' },
    { kind: 'formula', heading: '一次成功与一次撞车各值多少', text: 'T_s = 2064 + 16 + 44 + 34 = 2158 µs        T_c = 2064 + 45 + 34 = 2143 µs', note: '1500 字节的帧在慢速率上占 2064 µs 空口时间。一次成功再加一个短帧间间隔（SIFS）、一个确认帧（ACK）——这里 44 µs，按“空口时间”那条规则回答走同一档速率——以及一个分布式帧间间隔（DIFS）。一次碰撞加的是 ACK 超时（ACK timeout）与一个 DIFS：重传（retry）前的等待要等期限到期才开始计。' },
    {
      kind: 'diagram', heading: '一个时隙的三种长相', spec: bianchiSlotTiming(),
      caption: '按真实比例画：空的那一条几乎看不见，而撞车的那一条几乎和成功的一样长。这就是要点——空时隙近乎免费，撞车却几乎和成功一样贵，所以人越多，账坏在“撞”上而不是“等”上。',
    },
    { kind: 'steps', heading: '拿一只计算器把这一对数算出来', items: [
      '把这个房间写成四个数：n，正在竞争的饱和站点有几台；W = 16，最小的窗口；m = 6，窗口最多还能翻几倍；L = 7，一帧被丢掉之前拿到几次机会。',
      '先猜一个碰撞概率 p。已经失败过 i 次的那一帧从 W_i = 2^min(i,m)·W 个取值里抽签。把 p^i 在这 L 个阶段上加起来作分子，把 p^i(W_i + 1)/2 加起来作分母，一除就是 τ。',
      '把 τ 送回去。其余站点在同一个时隙里抛同一枚硬币，所以一次尝试毫发无损通过的概率是 (1 − τ) 的 n − 1 次方；剩下的那部分就是这种行为造出的碰撞概率，记作 p′。',
      '把 p′ 和 p 比一比。p 越大 τ 越小，所以两者之差只在唯一一处穿过零。把 0 到 1 对半砍五十次，每次留下 p′ 更大的那一半，这一对数就不再动了。',
      '给平均时隙标价，先算两个概率：这个时隙里有人发送的概率 P_tr = 1 − (1 − τ)^n，以及在确实有人发送的前提下恰好只有一台的概率 P_s = n·τ·(1 − τ)^(n−1) ÷ P_tr。',
      '再按频率加权那三种长相：(1 − P_tr)σ + P_tr·P_s·T_s + P_tr(1 − P_s)T_c，其中 σ 是时隙长度，这里 9 µs。',
      '最后一除。一次成功送走的载荷（payload）E[P] = 12,000 比特；吞吐等于 P_s·P_tr·E[P] 除以平均时隙长度。',
    ] },
    { kind: 'table', heading: '五台站点，照着步骤走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['n、W、m、L', '5, 16, 6, 7'],
      ['同时满足两句话的 p', '0.2722'],
      ['分子，p^i 之和', '1.3738'],
      ['分母，p^i(W_i + 1)/2 之和', '17.9942'],
      ['= τ', '0.0763'],
      ['1 − (1 − τ)^4', '0.2722 ✓'],
      ['P_tr', '0.3277'],
      ['P_s', '0.8478'],
      ['平均时隙', '712.5 µs'],
      ['吞吐', '4.679 Mb/s'],
    ] },
    { heading: '预测对上一次实跑', text: '把五台站点的场景跑十秒：5302 次尝试，其中 1370 次撞上了别人，也就是 25.84%，而预测是 27.22%。很接近，但偏差的方向每次都一样——读懂这个方向是下一课的事。' },
  ],
  deeper: [
    { heading: '第一个方程是怎么来的', text: '它是退避链在长期行为下的解。一台已经失败 i 次的站点，从 W_i 个取值里均匀抽签，每个空闲时隙走一步，于是它停留在这一阶段的时间正比于 p^i(W_i + 1)/2——这正是页面上那个分式的分母；而单独的 p^i 数的是它能走到这一阶段的频率。τ 就是其中计数读数为零的那部分时隙的比例，也就是分子除以分母。' },
    { heading: '大胆的是第二个方程', text: 'p = 1 − (1−τ)^(n−1) 把其余 n − 1 台站点当成每个时隙独立抛掷的硬币，不论它们各自处在哪个阶段、刚刚发生过什么，用的都是同一个 τ。这就是解耦，也正是闭式解得以存在的原因。它同时也是最先松动的那个假设，而且 n 越小越糟：只有一个对手时，根本没有“人群”可供平均。' },
    { heading: '教科书上的那个式子，以及那条不会停的链', text: '主路上那两个方程是本 MAC 的，因为表里的数字就是它算出来的。你在别处会遇到的那个形式，是 Bianchi 的原版：那条链永远重传下去，于是能收成一个闭式解。两者是同一套推导，只差在那个和在哪里停下。' },
    { kind: 'formula', text: 'τ = 2(1−2p) / [(1−2p)(W+1) + pW(1−(2p)^m)]', note: 'Bianchi 自己的式子，里面没有尝试次数上限。把 (1 − (2p)^m)/(1 − 2p) 按 Σ_{k<m}(2p)^k 这个和来算，p = ½ 就只是一个普通点，而不是 0/0。而本 MAC 只给一帧七次机会，之后就把它丢掉——这就是 Wu 等人（INFOCOM 2002）的有限重传变体：用光机会的站点会从最小的窗口重新开始，而不是一直待在最大的窗口上，于是它出手略勤一些。在二十台站点时，这把预测的碰撞概率从 48.09% 抬到 49.59%——后一个正是表里那个数，而两者之差，就是教科书与本仿真器之间的距离。' },
    { heading: '站点为什么要低声细语', text: '模型只有一种数据速率，而本仿真器的速率控制器不是。连续两次失败就降一档，而碰撞在它看来与信道衰落一模一样。因此这个场景把每台站点放得足够远、发得足够轻，让最慢的那一档之下再无可降，于是固定速率的假设按构造成立。等强度的接收电平还意味着两个重叠的帧谁也不会被锁定——“无捕获”这个假设，是被布置出来的，而不是被假定的。' },
  ],
  sources: [
    '模型出自 G. Bianchi，《Performance Analysis of the IEEE 802.11 Distributed Coordination Function》，IEEE JSAC 18(3):535–547，2000。它形式化的退避过程见 IEEE Std 802.11-2024 §10.3.4.3；aCWmin 15 与 aCWmax 1023 见 §17.4.4，于是 W = 16、m = 6。',
    '1500 字节的载荷在空口上是 1528 字节，按式 17-29 在 6 Mb/s 下为 2064 µs；ACK 按 §10.6 的控制响应速率发送，44 µs；介质忙时计数器冻结见 §10.23.2.4。碰撞代价 T_c 依的是本 MAC 而非论文：重传前的 DIFS 从 ACK 超时结束时开始计（§10.3.2.9）。',
    '有限重传链出自 Wu、Peng、Long、Cheng 与 Ma，INFOCOM 2002。站点排成的圆弧、−20 dBm 的发射功率、种子 7、十分钟的 MSDU 生存期与十秒的采样时长，都是本仿真器的模型取值，其目的正是让论文的假设成立。',
  ],
  scenario: () => bianchiScenario(5),
  variants: [
    { label: nLabel(2), scenario: () => bianchiScenario(2) },
    { label: nLabel(10), scenario: () => bianchiScenario(10) },
    { label: nLabel(20), scenario: () => bianchiScenario(20) },
  ],
  jumps: [
    J('第一个数据帧', firstData),
    J('第一次碰撞', firstCollision),
    J('第一次重传', firstRetry),
    J('第一次退避抽签', firstBackoffDraw),
  ],
  observe: [
    '仿真以它最糟的一次碰撞开场：介质（medium）从一开始就空闲，五台站点在 t = 0 同时发送，这堆叠加直到 2.064 ms 才结束。',
    '每个数据帧（data frame）都是 2064 µs，每个回答都在一个 SIFS 之后到来。正是这种一致性，让一次成功可以用一个数定价，而不是一个分布。',
    '一次碰撞里接入点（AP）根本没有启动接收，而不是收到乱码：两个前导码（preamble）强度相同，哪个都没被锁住——这就是“无捕获”假设的可见形态。',
  ],
  tryThis: [
    '先预测，再切换。从表里读出十台站点那一行，把该变体跑十秒再数：5678 次尝试、1992 次碰撞、3684 个回答——4.421 Mb/s，预测是 4.275。',
    '换一个种子把五台站点的场景再跑一遍。种子 7、8、12345 给出 25.84%、25.53%、25.71%：抽到的数变了，统计量没变。',
  ],
  quiz: [
    {
      q: '把每台站点都挪到 AP 旁边，让每一帧都飞得快得多。预测说碰撞概率会怎样？',
      options: [
        '下降：帧更短，暴露的时间更少',
        '不动：进入方程的只有人数和窗口',
        '上升：一秒里塞得下更多次发送',
      ],
      answer: 1,
      explain: '有人在发送时计数器不走，所以空口时间不会给谁多一次撞上的机会。每秒的碰撞次数确实上升，而“每次尝试”的概率不变。',
    },
    {
      q: '这两个未知数为什么不能一个一个地算？',
      options: [
        '因为不一起解，这组方程就无解',
        '因为每一个都是用另一个定义的，只有同时满足两者的那一对数才算答案',
        '因为站点数本身也是未知的',
      ],
      answer: 1,
      explain: '出手多勤取决于失败得多频繁，而失败得多频繁又取决于其余人出手多勤。同时成立的那一对数，是唯一自洽的说法。',
    },
    {
      q: '饱和这个假设，给预测换来了什么？',
      options: [
        '它让每一帧都一样长',
        '它把业务模式从问题里拿掉了：没有谁是因为没东西可发才安静的',
        '它保证不会有任何一帧被放弃',
      ],
      answer: 1,
      explain: '没有它就得去建模“每台站点什么时候有话要说”；有了它，答案只取决于接入规则。',
    },
  ],
}
