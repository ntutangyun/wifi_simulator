/**
 * Tier 1 · M2 · "Saturation throughput from first principles — the Bianchi model".
 *
 * The analytic numbers quoted in the prose come from src/course/tier1/
 * bianchiModel.ts and are recomputed, together with every measured number,
 * by tests/course/tier1-bianchi.test.ts. Where the model and the simulator
 * disagree is the next lesson (bianchi-vs-sim.ts).
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

export const nLabel = (n: number): L10n => ({ en: `n = ${n} stations`, zh: `n = ${n} 台终端` })

export const bianchi: Lesson = {
  id: 'bianchi',
  module: 1,
  title: {
    en: 'Saturation throughput from first principles — the Bianchi model',
    zh: '从第一性原理求饱和吞吐——Bianchi 模型',
  },
  body: [
    { text: {
      en: 'Everything so far you observed. Here you predict first: what n saturated stations on one DCF channel must deliver, from the access rules alone (G. Bianchi, IEEE JSAC 18(3):535–547, 2000).',
      zh: '此前的一切都是“看”出来的。这一课先做预测：n 台饱和终端共享一条 DCF 信道必然得到什么结果，全部只从接入规则推出（G. Bianchi，IEEE JSAC 18(3):535–547，2000）。',
    } },
    { kind: 'list', heading: { en: 'Assumptions', zh: '假设' }, items: [
      { en: 'Saturation: every station always has a frame queued.', zh: '饱和：每台终端永远有帧排队。' },
      { en: 'Ideal channel, no capture: a frame is lost only when another overlaps it, and then both die.', zh: '理想信道、无捕获：帧只因与另一帧重叠而丢失，且重叠双方同归于尽。' },
      { en: 'Decoupling: every attempt collides with the same independent probability p, whatever the stage or the history.', zh: '解耦：每次尝试都以同一个相互独立的概率 p 碰撞，与阶段和历史无关。' },
      { en: 'Retries forever. The MAC here stops at dot11ShortRetryLimit = 7 attempts, one per stage 0…6 — the finite-retry chain of Wu et al., INFOCOM 2002, which the solver takes as an `attempts` option. At n = 20 it moves p 48.09% → 49.59%.', zh: '无限重传。而这里的 MAC 在 dot11ShortRetryLimit = 7 次尝试后停止，阶段 0…6 各一次——即 Wu 等人（INFOCOM 2002）的有限重传链，求解器用 `attempts` 选项支持它。n = 20 时它把 p 从 48.09% 推到 49.59%。' },
    ] },
    { kind: 'formula', heading: { en: 'The fixed point', zh: '不动点' }, text: {
      en: 'τ = 2(1−2p) / [(1−2p)(W+1) + pW(1−(2p)^m)]        p = 1 − (1−τ)^(n−1)',
      zh: 'τ = 2(1−2p) / [(1−2p)(W+1) + pW(1−(2p)^m)]        p = 1 − (1−τ)^(n−1)',
    }, note: {
      en: 'τ is the chance a station transmits in a backoff slot; p the chance at least one of the other n−1 does. W = CWmin+1 = 16, m = log2((CWmax+1)/(CWmin+1)) = 6 (§17.4.4: aCWmin 15, aCWmax 1023). τ(p) falls, p(τ) rises: one root, found by bisection.',
      zh: 'τ 是终端在一个退避时隙里发送的概率，p 是其余 n−1 台中至少一台发送的概率。W = CWmin+1 = 16，m = log2((CWmax+1)/(CWmin+1)) = 6（§17.4.4：aCWmin 15、aCWmax 1023）。τ(p) 递减、p(τ) 递增：根唯一，二分即可求出。',
    } },
    { text: {
      en: 'The first equation is the backoff chain solved: a station in stage i draws uniformly from [0, 2^i·W − 1] and walks down one slot at a time, so the time it spends in stage i is proportional to p^i(2^i·W + 1)/2, and τ is the fraction of those slots in which it sits at zero. The solver evaluates (1 − (2p)^m)/(1 − 2p) as Σ_{k<m}(2p)^k, so p = ½ is an ordinary point rather than 0/0. The second equation is the definition of p, and it is the bold one: it treats the other n − 1 stations as coins tossed independently at every slot, which is what "decoupling" buys.',
      zh: '第一个方程是退避链的解：处于第 i 阶段的终端从 [0, 2^i·W − 1] 均匀抽签、每个时隙走一步，所以它停留在第 i 阶段的时间正比于 p^i(2^i·W + 1)/2，而 τ 就是其中计数为零的那部分时隙的比例。求解器把 (1 − (2p)^m)/(1 − 2p) 按 Σ_{k<m}(2p)^k 计算，于是 p = ½ 只是一个普通点，而不是 0/0。第二个方程是 p 的定义，也是大胆的那一个：它把其余 n − 1 台终端当成每个时隙独立抛掷的硬币——这正是“解耦”换来的东西。',
    } },
    { kind: 'formula', heading: { en: 'Pricing a generic slot', zh: '给“通用时隙”定价' }, text: {
      en: 'S = P_s·P_tr·E[payload] / [(1−P_tr)σ + P_tr·P_s·T_s + P_tr(1−P_s)·T_c]',
      zh: 'S = P_s·P_tr·E[净荷] / [(1−P_tr)σ + P_tr·P_s·T_s + P_tr(1−P_s)·T_c]',
    }, note: {
      en: 'P_tr = 1−(1−τ)^n; P_s = nτ(1−τ)^(n−1)/P_tr.',
      zh: 'P_tr = 1−(1−τ)^n；P_s = nτ(1−τ)^(n−1)/P_tr。',
    } },
    { text: {
      en: 'σ, T_s and T_c are the engine\'s own constants, not fitted: σ = 9 µs; a 1500-byte MSDU is 1528 octets on the air, 2064 µs at 6 Mb/s (Eq. 17-29); the ACK is 44 µs at the control-response rate (§10.6).',
      zh: 'σ、T_s、T_c 用的是引擎自身的常数，不是拟合值：σ = 9 µs；1500 字节的 MSDU 上空口是 1528 字节，6 Mb/s 下 2064 µs（式 17-29）；ACK 按控制响应速率发送（§10.6），44 µs。',
    } },
    { kind: 'formula', text: {
      en: 'T_s = 2064 + SIFS 16 + ACK 44 + DIFS 34 = 2158 µs        T_c = 2064 + ACKTimeout 45 + DIFS 34 = 2143 µs',
      zh: 'T_s = 2064 + SIFS 16 + ACK 44 + DIFS 34 = 2158 µs        T_c = 2064 + ACK 超时 45 + DIFS 34 = 2143 µs',
    }, note: {
      en: 'T_c follows this MAC: the retry\'s DIFS starts at the end of the ACK timeout (onRespTimeout in mac.ts), not at the end of the frame.',
      zh: 'T_c 依本 MAC 的规则：重传的 DIFS 从 ACK 超时结束时开始计（mac.ts 的 onRespTimeout），而不是从帧结束时。',
    } },
    { kind: 'table', heading: { en: 'Prediction (W = 16, m = 6, 1500 B)', zh: '预测（W = 16、m = 6、1500 字节）' }, head: [
      N('n'), N('τ'), N('p'), N('S @ 54 Mb/s'), N('S @ 6 Mb/s'),
    ], rows: [
      [N('2'), N('0.1046'), N('10.46 %'), N('31.28'), N('5.169 Mb/s')],
      [N('5'), N('0.0763'), N('27.22 %'), N('29.52'), N('4.679 Mb/s')],
      [N('10'), N('0.0533'), N('38.92 %'), N('27.36'), N('4.275 Mb/s')],
      [N('20'), N('0.0354'), N('49.59 %'), N('24.91'), N('3.857 Mb/s')],
    ] },
    { text: {
      en: 'Note what p ignores: payload, rate, airtime. Only n, W and m enter it — counters do not tick while the medium is busy (§10.23.2.4), so a long frame gives nobody extra slots. Note too how little contention costs at 6 Mb/s (5.17 → 3.86 Mb/s) against 54 Mb/s (31.3 → 24.9): the same microseconds, weighed against very different frames.',
      zh: '注意 p 与什么无关：净荷、速率、空口时间统统无关，只有 n、W、m 进入方程——介质忙时计数器不走（§10.23.2.4），长帧不会给任何人多出时隙。也注意竞争在 6 Mb/s 上代价有多小（5.17 → 3.86 Mb/s），而在 54 Mb/s 上是 31.3 → 24.9：同样的微秒数，面对的却是完全不同的帧长。',
    } },
    { text: {
      en: 'Two numbers in that table deserve discomfort. A 54 Mb/s PHY hands a single pair 31.3 Mb/s — the MAC keeps well under two thirds of the nominal rate before any contention worth the name — and going from two stations to twenty costs only a further 20%. Binary exponential backoff is doing its job: the window widens as the crowd grows, and the per-slot attempt rate τ falls almost exactly as fast as n rises.',
      zh: '表里有两个数值得你不舒服一下。54 Mb/s 的 PHY 只给一对收发 31.3 Mb/s——还没算上像样的竞争，MAC 就已经吃掉了名义速率的三分之一还多——而从两台增加到二十台，也只再多花 20%。二进制指数退避正在起作用：人越多窗口越宽，每时隙的发送概率 τ 下降的速度几乎正好抵消 n 的增长。',
    } },
    { heading: { en: 'Why the stations whisper', zh: '终端为什么要低声细语' }, text: {
      en: 'Why whisper? Because the model has one rate and this simulator\'s rate controller does not: two failed attempts in a row step the MCS down, and a collision is indistinguishable from fading to it. At −20 dBm there is no rung below 6 Mb/s to fall to, so the fixed-rate assumption holds by construction. The next lesson runs the same five stations at a 54 Mb/s ceiling and measures what that does.',
      zh: '为什么要低声细语？因为模型只有一种速率，而本仿真器的速率控制器不是：连续两次尝试失败就降一档 MCS，而碰撞在它看来与衰落无异。在 −20 dBm 下，6 Mb/s 之下已无档可降，于是固定速率的假设按构造成立。下一课会把同样五台终端放在 54 Mb/s 的上限下，量一量那会带来什么。',
    } },
    { heading: { en: 'The measurement', zh: '测量' }, text: {
      en: 'Saturation is a configuration, not a wish: each station holds twenty queued MSDUs and refills as frames leave, and the MSDU lifetime is raised to ten minutes so nothing is discarded by age — at 2 ms a frame, the default 500 ms would empty queues the model assumes are full. Sampling matters too: ten seconds is thousands of attempts, enough that the estimates below move by a few tenths of a point between seeds.',
      zh: '饱和是配置出来的，不是许愿来的：每台终端队列里常备二十个 MSDU，帧一离开就补充；MSDU 生存期被抬到十分钟，使任何帧都不会因老化被丢弃——每帧 2 ms 的情况下，默认的 500 ms 会把模型假定为满的队列清空。样本量同样重要：十秒就是数千次尝试，足以让下面的估计值在不同种子间只摆动零点几个百分点。',
    } },
    { text: {
      en: 'n legacy stations sit on a 3 m arc, all saturated, all received at −81.7 dBm — 12.3 dB of SNR, which pins every frame at 6 Mb/s and makes simultaneous starts a clean collision. An attempt is one data TX_START; it collided if no ACK came, which the MAC records as a RETRY (here nothing else can cause one). p̂ = ΣRETRY / Σattempts; throughput = 12,000 bits per ACK the AP sends, over 10 s.',
      zh: 'n 台传统终端站在 3 m 的圆弧上，全部饱和，在 AP 处的接收电平都是 −81.7 dBm——12.3 dB 的 SNR，把每一帧钉在 6 Mb/s，也让同时起始的帧成为干净的碰撞。一次尝试 = 一条数据帧 TX_START；若 ACK 未到，MAC 记一条 RETRY，就算它碰撞（这里没有别的成因）。p̂ = ΣRETRY / Σ尝试；吞吐 = AP 每发一个 ACK 记 12,000 比特，除以 10 秒。',
    } },
    { kind: 'table', heading: { en: 'Model vs simulator (10 s, seed 7)', zh: '模型对仿真（10 秒，种子 7）' }, head: [
      N('n'), N('p'), N('p̂'), N('Δ'), N('S'), N('Ŝ'), N('Δ'),
    ], rows: [
      [N('2'), N('10.46 %'), N('11.20 %'), N('+7.1 %'), N('5.169'), N('5.136'), N('−0.6 %')],
      [N('5'), N('27.22 %'), N('25.84 %'), N('−5.1 %'), N('4.679'), N('4.717'), N('+0.8 %')],
      [N('10'), N('38.92 %'), N('35.08 %'), N('−9.9 %'), N('4.275'), N('4.421'), N('+3.4 %')],
      [N('20'), N('49.59 %'), N('45.83 %'), N('−7.6 %'), N('3.857'), N('4.027'), N('+4.4 %')],
    ] },
    { text: {
      en: 'Every p within 10% of the prediction and every throughput within 5%, with no fitted parameter: a whole BSS reduced to two numbers. The gaps are systematic, not noise, and reading them is the next lesson.',
      zh: '每个 p 都落在预测的 10% 以内，每个吞吐在 5% 以内，且没有任何拟合参数：整个 BSS 被压成两个数。这些偏差是系统性的而非噪声，如何读懂它们是下一课的事。',
    } },
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
    { en: 'The run opens with its worst collision: the medium has been idle "since forever", so all five (all twenty at n = 20) skip backoff and transmit at t = 0, clearing at 2.064 ms.', zh: '仿真以它最糟的一次碰撞开场：介质“自古以来”就空闲，于是五台（n = 20 时是二十台）全都跳过退避在 t = 0 发送，到 2.064 ms 才结束。' },
    { en: 'Every data frame is the same 1,528 octets, 2,064 µs, answered one SIFS later — that constancy is why T_s is a number, not a distribution.', zh: '每个数据帧都是同样的 1,528 字节、2,064 µs，一个 SIFS 后被应答——正是这种一致性让 T_s 是一个数而不是一个分布。' },
    { en: 'A collision leaves no RX_START at the AP at all: both preambles arrive at ~0 dB SINR and are logged RX_MISS (preambleSinr). That is the model\'s "no capture" assumption, visible.', zh: 'AP 侧的碰撞连 RX_START 都不会留下：两个前导都以 ≈ 0 dB SINR 到达，被记为 RX_MISS（preambleSinr）。这就是模型“无捕获”假设的可见形态。' },
  ],
  tryThis: [
    { en: 'Predict, then switch. Read the n = 10 row (38.92%, 4.275 Mb/s), run the n = 10 variant ten seconds and count: 5,678 attempts, 1,992 collided (35.08%), 3,684 ACKs — 4.421 Mb/s. Repeat for n = 2 and n = 20.', zh: '先预测，再切换。读 n = 10 那一行（38.92%、4.275 Mb/s），把 n = 10 变体跑十秒再数：5,678 次尝试、1,992 次碰撞（35.08%）、3,684 个 ACK——4.421 Mb/s。对 n = 2 和 n = 20 重复一遍。' },
    { en: 'Change the seed in the editor. Seeds 7, 8 and 12345 give p̂ = 25.84%, 25.53%, 25.71% and 4.717, 4.734, 4.727 Mb/s: the draws move, the statistics do not.', zh: '在编辑器里换种子。种子 7、8、12345 给出 p̂ = 25.84%、25.53%、25.71%，吞吐 4.717、4.734、4.727 Mb/s：抽签变了，统计量没变。' },
  ],
  quiz: [
    {
      q: { en: 'Move all twenty stations next to the AP so every frame flies at 54 Mb/s. What does the model say p does?', zh: '把二十台终端全挪到 AP 旁，让每帧都以 54 Mb/s 发送。模型说 p 会怎样？' },
      options: [
        { en: 'Falls — shorter frames are exposed for less time', zh: '下降——帧更短，暴露的时间更少' },
        { en: 'Unchanged at 49.59%: only n, W and m enter the fixed point', zh: '不变，仍是 49.59%：不动点里只有 n、W、m' },
        { en: 'Rises — more transmissions per second', zh: '上升——每秒发送次数更多' },
      ],
      answer: 1,
      explain: { en: 'Backoff freezes while the medium is busy, so airtime buys no one a chance to collide. Collisions per second do rise; p, a per-attempt probability, does not.', zh: '介质忙时退避冻结，所以空口时间不会给谁多一次碰撞机会。每秒碰撞次数确实上升；而 p 是每次尝试的概率，不变。' },
    },
    {
      q: { en: 'Why is p̂ = ΣRETRY / Σattempts a valid estimator of p here, but not in a flat with distant stations?', zh: '为什么 p̂ = ΣRETRY / Σ尝试 在这里是 p 的有效估计，在终端散布的公寓里却不是？' },
      options: [
        { en: 'Because RETRY counts only frames that reached the retry limit', zh: '因为 RETRY 只统计达到重传上限的帧' },
        { en: 'Because a missing ACK here can only be a collision: ideal channel, equal power, everyone in range', zh: '因为这里 ACK 丢失只可能是碰撞：理想信道、等功率、彼此都在覆盖内' },
        { en: 'Because the AP retransmits lost ACKs', zh: '因为 AP 会重发丢失的 ACK' },
      ],
      answer: 1,
      explain: { en: 'Spread the stations out and the same record also counts SINR failures, hidden-node losses the model never posits, and frames a captured neighbour survived — the estimator silently changes meaning.', zh: '把终端摊开，同一条记录还会计入 SINR 失败、模型从未设想的隐藏节点丢失，以及被捕获效应放过的邻居帧——估计量的含义会悄悄改变。' },
    },
  ],
}
