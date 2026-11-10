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
      { label: '空闲', spans: [{ label: `${slot} µs`, fromUs: 0, toUs: slot }] },
      {
        label: '成功',
        spans: [
          { label: `数据 ${data} µs`, fromUs: 0, toUs: data, tone: 'accent' },
          { label: `应答与等待 ${us(t.tsNs) - data} µs`, fromUs: data, toUs: us(t.tsNs) },
        ],
      },
      {
        label: '碰撞',
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
  why: '到目前为止，我们都是先观察碰撞发生，再回头统计。还有另一种方法：仅凭接入规则本身——随机选取一个数、递减到零、失败之后扩大窗口——就能预先算出一组都要发送的站点（STA）相互碰撞的频率，以及最终能送出多少数据。前提是每台站点始终有下一帧待发，这样业务模式就从问题中排除了。剩下两个相互定义的未知数：一台站点在某个空闲时隙（slot time）内发送的概率，以及一次发送与其他站点发生碰撞的概率。碰撞越多，窗口越宽，发送越稀疏；其他站点发送越频繁，越容易发生碰撞。只有一对数能使这两个关系同时成立，对区间反复二分就能找到它，一台计算器就足够。决定答案的只有站点数和窗口，帧长、速率、房间都不在其中：有站点在发送时，其他站点的计数器停止递减。站点越多，碰撞越频繁，送出的数据越少。把概率换算成吞吐量时，要按空闲时隙、成功、碰撞三种情形加权；空闲时隙几乎不占时间，一次碰撞却与一次成功的时长相近，所以站点一多，损失主要来自碰撞而不是等待。五台站点运行十秒，实测的碰撞比例与预测相差不到两个百分点，而且偏低。',
  outcomes: [
    '说明什么是饱和网络，以及这个预测为什么必须以它为前提',
    '解释这两个未知数为什么只能联立求解',
    '对任意数量的站点，从表中读出平均每几次尝试发生一次碰撞',
  ],
  needs: ['collisions-cw', 'queues'],
  terms: [
    { term: 'saturation', plain: '一种状态：每台站点始终有下一帧待发，因此没有任何站点会因为“没有帧要发”而不发送' },
    { term: 'transmit probability', plain: '某一台站点在任意一个空闲时隙内发送的概率' },
    { term: 'collision probability', plain: '一次尝试与其他站点的某次尝试发生碰撞的概率' },
  ],
  picture: [
    { heading: '从观察到计算', text: '此前的一切都是观察它的发生。这一次先把它计算出来：给定一组同时争用信道的站点，仅凭接入规则本身就能确定它们相互碰撞的频率。房间、射频、业务、距离都不影响答案。' },
    { heading: '每台站点都还有下一帧待发', text: '这个预测需要一个很强的假设：一帧刚离开，下一帧已经在等待，因此没有任何站点会因为“没有帧要发”而不发送——这就是饱和。它不是一个正常的网络，而是最坏的情形，也正因此值得算清楚：当所有站点同时争用信道的全部容量时，结果如何。' },
    { kind: 'watch', jump: 1, heading: '要统计的就是这种事件', text: '载入仿真，跳到第一次碰撞。五台饱和的站点彼此都在侦听范围内；从这里开始的每一次重叠，都是那两个方程所描述的事件。' },
    { heading: '两个未知数相互定义', text: '“某一台站点在给定的空闲时隙（slot time）内发送”的概率叫发送概率，记作 τ；“一次尝试与其他站点发生碰撞”的概率叫碰撞概率，记作 p。前者取决于后者：碰撞越多，窗口越宽，发送就越稀疏。后者又取决于前者：其余站点发送得越频繁，发生碰撞的可能性越大。这两个数都无法单独算出。' },
    { heading: '只有一对数能同时满足两个关系', text: '所以要找出使两个关系同时成立的那一对数——这一对数叫作不动点。τ 随 p 增大而减小，于是两条曲线只在唯一一处相交，对区间反复二分就能找到它——下面的步骤做的就是这件事。' },
    { heading: '从概率到比特率', text: '概率还不是吞吐量。要得到吞吐量，就需要算出“平均一个信道时隙”有多长——而一个时隙只有三种情形。按各自发生的频率加权，用送出的数据量除以所用的时间，预测结果就以每秒多少兆比特的形式给出。' },
  ],
  numbers: [
    { kind: 'formula', heading: '本课要解的那一对方程', text: 'τ = Σ_{i<L} p^i / Σ_{i<L} p^i (W_i + 1)/2        p = 1 − (1−τ)^(n−1)', note: 'n 是站点数，L = 7 是一帧可用的尝试次数，W_i = 2^min(i,m)·W 是第 i 次尝试时的窗口，其中 W = 16、m = 6。左边的方程，是按“一帧尝试 L 次后即放弃”这套媒体访问控制（MAC）求解得到的退避（backoff）规则；右边的方程是“发生碰撞”的定义。' },
    { kind: 'table', heading: '这两个方程的预测结果', head: [
      'n', '每时隙发送概率', '碰撞概率',
      '54 Mb/s 下的吞吐', '6 Mb/s 下的吞吐',
    ], rows: [
      ['2', '0.1046', '10.46 %', '31.28', '5.169 Mb/s'],
      ['5', '0.0763', '27.22 %', '29.52', '4.679 Mb/s'],
      ['10', '0.0533', '38.92 %', '27.36', '4.275 Mb/s'],
      ['20', '0.0354', '49.59 %', '24.91', '3.857 Mb/s'],
    ] },
    { heading: '碰撞概率与什么无关', text: '帧长、数据速率、空口时间（airtime）都不出现在方程中：进入方程的只有站点数和窗口。有站点在发送时计数器停止递减，所以长帧不会使任何站点多一次发生碰撞的机会。' },
    { kind: 'formula', heading: '一次成功与一次碰撞各占多长时间', text: 'T_s = 2064 + 16 + 44 + 34 = 2158 µs        T_c = 2064 + 45 + 34 = 2143 µs', note: '1500 字节的帧在低速率上占用 2064 µs 空口时间。一次成功还要加上一个短帧间间隔（SIFS）、一个确认帧（ACK）——这里是 44 µs，按“空口时间”那一课的规则，应答使用同一档速率——以及一个分布式帧间间隔（DIFS）。一次碰撞加上的是 ACK 超时（ACK timeout）与一个 DIFS：重传（retry）前的等待要在期限到期后才开始计时。' },
    {
      kind: 'diagram', heading: '一个时隙的三种情形', spec: bianchiSlotTiming(),
      caption: '按真实比例绘制：空闲的那一条几乎看不见，而碰撞的那一条几乎与成功的一样长。这正是要点——空闲时隙几乎不占时间，一次碰撞占用的时间却与一次成功几乎相同，所以站点越多，损失越是来自“碰撞”而不是“等待”。',
    },
    { kind: 'steps', heading: '用计算器求出这一对数', items: [
      '用四个数描述这个房间：n，正在竞争的饱和站点数；W = 16，最小的窗口；m = 6，窗口最多可翻倍的次数；L = 7，一帧被丢弃之前可用的尝试次数。',
      '先假设一个碰撞概率 p。已经失败 i 次的那一帧从 W_i = 2^min(i,m)·W 个取值中随机选取。把 p^i 在这 L 个阶段上求和作为分子，把 p^i(W_i + 1)/2 求和作为分母，两者相除即得 τ。',
      '把 τ 代回。其余站点在同一个时隙内各自独立地以同一个 τ 发送，所以一次尝试不与任何站点发生碰撞的概率是 (1 − τ) 的 n − 1 次方；其余部分就是这种行为对应的碰撞概率，记作 p′。',
      '比较 p′ 与 p。p 越大 τ 越小，所以两者之差只在唯一一处过零。把区间 0 到 1 二分五十次，每次保留 p′ 更大的那一半，这一对数就收敛了。',
      '要算出平均时隙长度，先计算两个概率：这个时隙内有站点发送的概率 P_tr = 1 − (1 − τ)^n，以及在确实有站点发送的前提下恰好只有一台发送的概率 P_s = n·τ·(1 − τ)^(n−1) ÷ P_tr。',
      '再按发生频率对三种情形加权：(1 − P_tr)σ + P_tr·P_s·T_s + P_tr(1 − P_s)T_c，其中 σ 是时隙长度，这里是 9 µs。',
      '最后相除。一次成功送出的载荷（payload）E[P] = 12,000 比特；吞吐量等于 P_s·P_tr·E[P] 除以平均时隙长度。',
    ] },
    { kind: 'table', heading: '五台站点：按步骤计算一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['n、W、m、L', '5, 16, 6, 7'],
      ['同时满足两个关系的 p', '0.2722'],
      ['分子，p^i 之和', '1.3738'],
      ['分母，p^i(W_i + 1)/2 之和', '17.9942'],
      ['= τ', '0.0763'],
      ['1 − (1 − τ)^4', '0.2722 ✓'],
      ['P_tr', '0.3277'],
      ['P_s', '0.8478'],
      ['平均时隙', '712.5 µs'],
      ['吞吐', '4.679 Mb/s'],
    ] },
    { heading: '预测与实际运行的对照', text: '把五台站点的场景运行十秒：5302 次尝试，其中 1370 次与其他站点发生碰撞，即 25.84%，而预测是 27.22%。两者很接近，但偏差的方向每次都相同——理解这个方向是下一课的内容。' },
  ],
  deeper: [
    { heading: '第一个方程的由来', text: '它是退避链的稳态解。一台已经失败 i 次的站点，从 W_i 个取值中均匀随机选取，每个空闲时隙递减一次，于是它停留在这一阶段的时间正比于 p^i(W_i + 1)/2——这正是页面上那个分式的分母；而单独的 p^i 表示它进入这一阶段的频率。τ 就是其中计数值为零的时隙所占的比例，也就是分子除以分母。' },
    { heading: '第二个方程的假设更强', text: 'p = 1 − (1−τ)^(n−1) 把其余 n − 1 台站点视为在每个时隙相互独立、发送概率都是 τ 的发送源——这相当于每个时隙独立抛掷 n − 1 枚相同的硬币——无论它们各自处于哪个阶段、刚刚发生过什么，使用的都是同一个 τ。这就是解耦假设，也正是闭式解得以存在的原因。它同时也是最先失效的那个假设，而且 n 越小偏差越大：只有一台竞争站点时，根本不存在可以求平均的群体。' },
    { heading: '教科书中的公式，以及无限重传的链', text: '正文中的两个方程对应本 MAC，因为表中的数字就是由它算出的。在其他资料中常见的形式是 Bianchi 的原版：那条链无限重传，因此能化简为一个闭式解。两者是同一套推导，区别只在于求和在何处截止。' },
    { kind: 'formula', text: 'τ = 2(1−2p) / [(1−2p)(W+1) + pW(1−(2p)^m)]', note: 'Bianchi 本人的公式，其中没有尝试次数上限。把 (1 − (2p)^m)/(1 − 2p) 按 Σ_{k<m}(2p)^k 这个和式计算，p = ½ 就只是一个普通点，而不是 0/0。而本 MAC 只给一帧七次机会，之后就将其丢弃——这就是 Wu 等人（INFOCOM 2002）的有限重传变体：用完机会的站点会从最小的窗口重新开始，而不是一直停留在最大的窗口，因此它的发送略为频繁。在二十台站点时，这使预测的碰撞概率从 48.09% 升高到 49.59%——后者正是表中的那个数，而两者之差，就是教科书与本仿真器之间的差距。' },
    { heading: '为什么每台站点都用很低的发射功率', text: '模型只有一种数据速率，而本仿真器的速率控制器并非如此：连续两次失败就降一档，而且它无法区分碰撞与信道衰落。因此这个场景把每台站点放得足够远、发射功率设得足够低，使速率已处于最低一档、无法再降，于是固定速率的假设由场景设计保证成立。等强度的接收电平还意味着两个重叠的帧都不会被锁定——这就排除了捕获效应（capture effect）：接收机一旦锁定某个前导码就保持锁定，只有遇到明显更强的前导码时才转而与之同步。“无捕获”这个假设是通过场景布置实现的，而不是仅仅假定的。' },
  ],
  limits: [
    { kind: 'model-value', text: '使论文假设成立的这套布置是引擎的取值，而不是标准：等距圆弧、−20 dBm 的发射功率、种子 7，以及十分钟的 MSDU 生存期（bianchiScenario）。最后这一条尤其人为——它实际上关闭了生存期规则，因为方程中没有「帧会因等待过久而被丢弃」这一情形。真实网络中没有任何一项是这样设置的。' },
    { kind: 'unmodelled', text: '等距圆弧使每台站点到达接入点的电平完全相同，于是引擎的捕获（channel.ts 的 CAPTURE_MARGIN_DB = 5 dB）永远不会触发，一次重叠会使其中每一帧都接收失败。真实房间中各站点的电平相差十几分贝，较强的那一帧往往仍能被正确解出。本课之所以能把重传记录当作碰撞来统计，依靠的正是这种有意布置的条件。' },
    { kind: 'unmodelled', text: '全场共用一个时钟：时隙边界对每台设备是同一时刻（mac.ts 按精确的 9 µs 调度下一次递减），而且一路发射到达各处不需要时间。真实设备各有几十 ppm 的晶振误差与传播时延，时隙边界会相互错开几十纳秒到几微秒。因此这里的「同一个时隙内同时发送」是一个精确确定的事件，在真实空口上它对应一个很短的时间窗口。' },
    // `out-of-scope` rather than `unmodelled`, which is what it said until the `fading`
    // lesson landed: this limit's own first clause is 「不是引擎中的一个开关，而是通过场景布置实现的」,
    // so by its own words it describes this SCENE's arrangement and not a gap in the engine —
    // the engine has built both fading layers all along, behind a scenario section. That is the
    // same correction `width`'s flat-channel entry took, and criterion A in
    // `tests/course/limits.test.ts` is the rule it is being corrected against.
    { kind: 'out-of-scope', text: '固定速率这个前提不是引擎中的一个开关，而是通过场景布置实现的：引擎默认没有衰落，链路电平是由几何位置与墙体计算出的定值，所以速率已处于最低一级、无法再降。编辑器的「时变链路（衰落）」一节可以开启电平起伏，此时同一条链路的速率会在几级之间变化，本课的两张表随即不再适用。', until: 'fading' },
  ],
  sources: [
    '模型出自 G. Bianchi，《Performance Analysis of the IEEE 802.11 Distributed Coordination Function》，IEEE JSAC 18(3):535–547，2000。它形式化的退避过程见 IEEE Std 802.11-2024 §10.3.4.3；aCWmin 15 与 aCWmax 1023 见 §17.4.4，于是 W = 16、m = 6。',
    '1500 字节的载荷在空口上是 1528 字节，按式 17-29 在 6 Mb/s 下为 2064 µs；ACK 按 §10.6 的控制响应速率发送，44 µs；介质忙时计数器冻结见 §10.23.2.4。碰撞代价 T_c 依据的是本 MAC 而非论文：重传前的 DIFS 从 ACK 超时结束时开始计时（§10.3.2.9）。',
    '有限重传链出自 Wu、Peng、Long、Cheng 与 Ma，INFOCOM 2002。站点排成的圆弧、−20 dBm 的发射功率、种子 7、十分钟的 MSDU 生存期与十秒的采样时长，都是本仿真器的模型取值，目的正是使论文的假设成立。',
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
    '仿真以最严重的一次碰撞开始：介质（medium）从一开始就空闲，五台站点在 t = 0 同时发送，这次多帧重叠直到 2.064 ms 才结束。',
    '每个数据帧（data frame）都是 2064 µs，每个应答都在一个 SIFS 之后到达。正是这种一致性，使一次成功可以用一个数表示，而不需要一个分布。',
    '一次碰撞中接入点（AP）根本没有启动接收，而不是收到错误的帧：两个前导码（preamble）强度相同，都没有被锁定——这就是“无捕获”假设在时间轴上的表现。',
  ],
  tryThis: [
    '先预测，再切换。从表中读出十台站点那一行，把该变体运行十秒后统计：5678 次尝试、1992 次碰撞、3684 个应答——4.421 Mb/s，预测是 4.275。',
    '换一个种子把五台站点的场景再运行一遍。种子 7、8、12345 给出 25.84%、25.53%、25.71%：随机选取的值变了，统计结果基本不变。',
  ],
  quiz: [
    {
      q: '把每台站点都移到 AP 旁边，使每一帧都以高得多的速率发出。按照预测，碰撞概率会如何变化？',
      options: [
        '下降：帧更短，可能发生碰撞的时间更少',
        '不变：进入方程的只有站点数和窗口',
        '上升：每秒能容纳更多次发送',
      ],
      answer: 1,
      explain: '有站点在发送时计数器停止递减，所以空口时间不会使任何站点多一次发生碰撞的机会。每秒的碰撞次数确实上升，而“每次尝试”的碰撞概率不变。',
    },
    {
      q: '这两个未知数为什么不能分别单独求解？',
      options: [
        '因为不联立求解，这组方程就无解',
        '因为每一个都由另一个定义，只有同时满足两者的那一对数才是答案',
        '因为站点数本身也是未知的',
      ],
      answer: 1,
      explain: '发送的频率取决于失败的频率，而失败的频率又取决于其余站点发送的频率。同时成立的那一对数，是唯一自洽的解。',
    },
    {
      q: '饱和这个假设为预测带来了什么？',
      options: [
        '它使每一帧的长度相同',
        '它把业务模式从问题中排除了：没有任何站点会因为没有帧要发而不发送',
        '它保证不会有任何一帧被放弃',
      ],
      answer: 1,
      explain: '没有它就必须对“每台站点何时有帧要发”建模；有了它，答案只取决于接入规则。',
    },
  ],
}
