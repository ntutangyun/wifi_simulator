/**
 * Wi-Fi Tier 1 · M6 · Predicting DCF on paper.
 *
 * Standard-first shape (① standard → ② this simulator → ③ hands-on), converted
 * on 2026-11-11. The lesson is built on an analytic model, so ① is the DCF
 * procedure the model abstracts, checked against IEEE Std 802.11-2024 (§10.3.3,
 * §10.3.4.3, §10.3.7, §10.3.2.11, §10.3.4.4, §10.6.6.5.2, §17.4.3, §17.4.4),
 * and it says in so many words that the standard gives no performance formula.
 * The model itself is Bianchi's paper (IEEE JSAC 2000) in Wu et al.'s
 * finite-retry form (INFOCOM 2002); it is introduced in ③ and labelled as a
 * paper every time, never as the standard.
 *
 * The one thing that must not drift back: the equations on the main path are
 * the FINITE-retry pair `solveBianchi` actually solves. Bianchi's classic
 * infinite-retry closed form sits beside them, labelled as his, carrying the
 * 48.09 % against 49.59 % at twenty stations that is the difference it makes.
 *
 * The analytic values come from ./bianchiModel.ts and every measured figure from
 * a run; tests/course/bianchi.test.ts reads each one back out of the lesson
 * text. Where the model and the simulator disagree is the next lesson
 * (bianchi-vs-sim.ts). The scenario builder and its three variants are
 * unchanged, so the recorded timeline hashes stay identical.
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
  why: '到目前为止，我们都是先观察碰撞发生，再回头统计。还有另一种方法。IEEE 802.11-2024 的分布式协调功能（distributed coordination function, DCF）只规定接入的过程——从 0 到竞争窗口（contention window, CW）之间随机选取退避（backoff）计数、每个空闲时隙（slot time）减一、介质（medium）忙时停止递减、失败之后竞争窗口加倍、发送七次仍失败就放弃——并不给出碰撞概率或吞吐量的算法。Bianchi 在 2000 年发表的论文把这个过程写成一条马尔可夫链，于是能预先算出一组始终有帧待发的站点（STA）相互碰撞的频率，以及最终能送出多少数据。这是论文的模型，不是标准的一部分。它有两个相互定义的未知数：一台站点在某个时隙内发送的概率，以及一次发送与其他站点发生碰撞的概率；只有一对数能使两个关系同时成立，对区间反复二分就能找到它。决定答案的只有站点数和窗口，帧长、速率、房间都不在其中。把概率换算成吞吐量时，要按空闲时隙、成功、碰撞三种情形加权；空闲时隙几乎不占时间，一次碰撞却与一次成功的时长相近，所以站点一多，损失主要来自碰撞而不是等待。本课的场景按论文的假设布置，五台站点运行十秒，实测的碰撞比例比预测低不到两个百分点。',
  outcomes: [
    '说出标准规定的退避过程中，哪几条规则进入了 Bianchi 模型',
    '分清标准、论文模型与本仿真器三者各自给出了什么',
    '用计算器解出不动点，并从表中读出任意站点数下的碰撞概率与吞吐量',
  ],
  needs: ['collisions-cw', 'queues'],
  terms: [
    { term: 'saturation', plain: '一种状态：每台站点始终有下一帧待发，因此没有任何站点会因为“没有帧要发”而不发送' },
    { term: 'transmit probability', plain: '某一台站点在任意一个空闲时隙内发送的概率' },
    { term: 'collision probability', plain: '一次尝试与其他站点的某次尝试发生碰撞的概率' },
  ],
  standard: [
    { heading: '退避计数怎样选取（§10.3.3，式 (10-1)，§17.4.4 表 17-24）', text: '退避计数是从 [0, CW] 中均匀分布地选取的伪随机整数。CW 的初值为 aCWmin；每次发送失败，CW 取序列 2^k − 1 中的下一个值，直到 aCWmax 为止；每次成功发送之后，或者站点的重传（retry）计数达到 dot11ShortRetryLimit 时，CW 恢复为 aCWmin。20 MHz 的正交频分复用（orthogonal frequency-division multiplexing, OFDM）物理层（physical layer, PHY）aCWmin 为 15，aCWmax 为 1023，aSlotTime 为 9 µs，aSIFSTime 为 16 µs。' },
    { heading: '计数怎样递减（§10.3.4.3）', text: '退避过程中，站点在每个退避时隙用载波侦听（carrier sense）判断介质是否忙；整个时隙都空闲，计数减一；时隙内任何时刻介质忙，这个时隙不减，之后要等介质再空闲一个分布式帧间间隔（DCF interframe space, DIFS）——或扩展帧间间隔（extended interframe space, EIFS）——再加一个 aSlotTime 才继续递减。计数减到 0 时开始发送。每次发送数据帧（data frame）之后都要执行一次退避，即使没有其他帧在等待：成功时从收到的确认帧（acknowledgement, ACK）结束时开始，失败时从 ACK 超时（ACK timeout）结束时开始。' },
    { heading: '帧间间隔与 ACK 超时（§10.3.7 式 (10-6)，§10.3.2.11）', text: 'DIFS = aSIFSTime + 2 × aSlotTime，在 OFDM 物理层上为 34 µs。发送方发出数据帧之后等待一个 ACK 超时：aSIFSTime + aSlotTime + aRxPHYStartDelay，即 45 µs；期限内没有开始接收，这次发送即告失败。' },
    { heading: '一次发送占用多长时间（§17.4.3 式 (17-29)，§10.6.6.5.2）', text: 'OFDM 帧的发送时长 TXTIME = TPREAMBLE + TSIGNAL + TSYM × NSYM。确认帧在短帧间间隔（short interframe space, SIFS）之后发送，所用速率为基本速率集中不超过数据帧速率的最高一档；基本速率集中没有这样的速率时，取物理层强制速率（mandatory rate）中不超过数据帧速率的最高一档。' },
    { heading: '放弃一帧（§10.3.4.4）', text: '一帧的短重传计数等于 dot11ShortRetryLimit（缺省 7）时，重传停止，这一帧被丢弃；这个上限即重传上限（retry limit）。一帧的发送时间超过生存期（MSDU lifetime）时，重传同样停止。' },
    { heading: '标准不给出性能公式', text: '标准只规定上面这些过程，不给出碰撞概率或吞吐量的计算方法。本课用来预测的方程出自论文，见 ③。' },
    { kind: 'steps', heading: '一台始终有帧待发的站点，按标准：逐步说明', items: [
      '从 [0, CW] 中选取退避计数；CW 从 aCWmin = 15 开始（§10.3.3）。',
      '每个空闲的 9 µs 时隙计数减一；介质忙时停止递减，空闲 DIFS 之后再继续（§10.3.4.3）。',
      '计数为 0 时发送数据帧。',
      '在 SIFS 之后收到确认帧：成功，CW 恢复为 15，从确认帧结束时开始下一次退避（§10.3.3，§10.3.4.3）。',
      'ACK 超时之内没有开始接收：失败，CW 取序列中的下一个值（最大 1023），从 ACK 超时结束时开始下一次退避（§10.3.2.11，§10.3.3）。',
      '同一帧发送满 7 次仍失败：丢弃这一帧，CW 恢复为 15，下一帧从头开始（§10.3.4.4）。',
    ] },
  ],
  implementation: [
    { topic: '退避计数', standard: '从 [0, CW] 均匀选取（§10.3.3）', sim: '照此选取；随机数由场景种子生成，同一场景每次运行结果相同。', kind: 'faithful' },
    { topic: '竞争窗口的序列', standard: '2^k − 1，从 aCWmin 到 aCWmax（§10.3.3）', sim: '15、31、…、1023，即模型里 W = 16、最多加倍 m = 6 次。', kind: 'faithful' },
    { topic: '忙时停止递减', standard: '时隙内介质忙则不减（§10.3.4.3）', sim: '照此：介质忙时计数保持不变，空闲 DIFS 之后再按 9 µs 递减。', kind: 'faithful' },
    { topic: '一次成功与一次碰撞的时长', standard: 'SIFS 之后的确认帧；失败时从 ACK 超时结束起等待（§10.3.2.11，§10.3.4.3）', sim: '成功：数据帧 + SIFS + 确认帧 + DIFS；碰撞：数据帧 + 45 µs 的 ACK 超时 + DIFS。', kind: 'faithful' },
    { topic: '确认帧的速率', standard: '基本速率集中不超过数据帧速率的最高一档（§10.6.6.5.2）', sim: '没有基本速率集，一律取 6、12、24 Mb/s 这三个强制速率中不超过数据帧速率的最高一档：数据帧 6 Mb/s 时确认帧也是 6 Mb/s，54 Mb/s 时是 24 Mb/s。', kind: 'value' },
    { topic: '重传上限', standard: 'dot11ShortRetryLimit，缺省 7（§10.3.4.4）', sim: '固定为 7，即模型里的 L = 7。', kind: 'value' },
    { topic: '两帧重叠时', standard: '标准不规定接收机的判决', sim: '前导码（preamble）的信干噪比（signal-to-interference-plus-noise ratio, SINR）不足 4 dB 时不能检出；第二个前导码比正在接收的强 5 dB 以上时才转而接收它（捕获）。本课的站点到达接入点（AP）的电平完全相同，所以任何重叠都使其中每一帧都接收失败。', kind: 'value' },
    { topic: '速率选择', standard: '标准未规定调整方法（§10.6.5.8）', sim: '速率控制始终在运行。本课把站点放在 3 m 圆弧上、发射功率（transmit power）−20 dBm，接入点收到 −81.7 dBm、信噪比（signal-to-noise ratio, SNR）12.3 dB，只够 6 Mb/s，所以速率不会再降。', kind: 'choice' },
    { topic: '生存期', standard: 'dot11MaxTransmitMSDULifetime 缺省 512 TU（§10.4）', sim: '本课场景把生存期设为十分钟，使任何一帧都不会因等待过久而被丢弃；模型里没有这一情形。', kind: 'value' },
  ],
  labs: [
    {
      heading: '五台站点的第一次碰撞',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一次碰撞。五台饱和的站点在 3 m 圆弧上，彼此都在侦听范围内。',
        '看 t = 0 有几台站点同时发送，这次重叠到何时结束；再看接入点一侧记录的是什么。',
      ],
      expect: '介质从一开始就空闲，五台站点在 t = 0 同时发送，这次重叠到 2064 µs 才结束。接入点一侧只有错失记录，没有接收失败记录：五个前导码强度相同，一个也没有检出。',
      meaning: '等强度的电平使「无捕获」成立（②），所以一次重叠就是一次使每一帧都失败的碰撞——这正是模型假设的碰撞。',
    },
    {
      heading: '用计算器解出那一对数',
      steps: [
        '读下面的方程：它们出自论文，不是标准。',
        '按七个步骤，对五台站点算一遍，再与下表对照。',
      ],
      blocks: [
        { kind: 'formula', heading: '本课要解的那一对方程', text: 'τ = Σ_{i<L} p^i / Σ_{i<L} p^i (W_i + 1)/2        p = 1 − (1−τ)^(n−1)', note: 'n 是站点数，L = 7 是一帧可用的尝试次数，W_i = 2^min(i,m)·W 是第 i 次尝试时的窗口，W = 16、m = 6。三个数都来自 ① 的规则：W 是 aCWmin + 1，m 是从 15 加倍到 1023 的次数，L 是 dot11ShortRetryLimit。左边的方程是论文对退避过程的稳态解；右边假设其余 n − 1 台站点在每个时隙相互独立、以同一个 τ 发送。' },
        { kind: 'steps', heading: '用计算器求出这一对数', items: [
          '用四个数描述这个房间：n，正在竞争的饱和站点数；W = 16；m = 6；L = 7。',
          '先假设一个碰撞概率 p。已经失败 i 次的那一帧从 W_i = 2^min(i,m)·W 个取值中随机选取。把 p^i 在这 L 个阶段上求和作为分子，把 p^i(W_i + 1)/2 求和作为分母，两者相除即得 τ。',
          '把 τ 代回：一次尝试不与任何站点发生碰撞的概率是 (1 − τ) 的 n − 1 次方；其余部分就是碰撞概率，记作 p′。',
          '比较 p′ 与 p。p 越大 τ 越小，所以两者之差只在唯一一处过零。把区间 0 到 1 二分五十次，每次保留 p′ 更大的那一半，这一对数就收敛了。',
          '计算两个概率：这个时隙内有站点发送的概率 P_tr = 1 − (1 − τ)^n，以及在有站点发送的前提下恰好只有一台发送的概率 P_s = n·τ·(1 − τ)^(n−1) ÷ P_tr。',
          '按发生频率对三种情形加权，得到平均时隙长度：(1 − P_tr)σ + P_tr·P_s·T_s + P_tr(1 − P_s)T_c，其中 σ = 9 µs。',
          '吞吐量等于 P_s·P_tr·E[P] 除以平均时隙长度，E[P] = 12,000 比特是一个 1500 字节的载荷（payload）。',
        ] },
        { kind: 'table', heading: '五台站点：按步骤计算一遍', head: ['步骤', '数值'], rows: [
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
      ],
      expect: '二分收敛到 p = 0.2722，此时 τ = 0.0763，代回第二个方程又得到 0.2722；平均时隙 712.5 µs，吞吐 4.679 Mb/s。',
      meaning: '模型只用到 ① 里的几条规则：均匀选取、窗口加倍、忙时停止递减、七次上限。帧长与速率只在最后两步通过 T_s 与 T_c 出现，不影响碰撞概率。',
    },
    {
      heading: '一个时隙的三种情形与四种站点数',
      variant: 2,
      more: [0, 1],
      steps: [
        '读出一次成功与一次碰撞各占多长时间，再看下面按比例绘制的三种时隙。',
        '对照下表读出 2、5、10、20 台站点的预测。',
      ],
      blocks: [
        { kind: 'formula', heading: '一次成功与一次碰撞各占多长时间', text: 'T_s = 2064 + 16 + 44 + 34 = 2158 µs        T_c = 2064 + 45 + 34 = 2143 µs', note: '1500 字节的载荷加上帧头（MAC header）与校验共 1528 字节，按式 (17-29) 在 6 Mb/s 下为 2064 µs。成功：SIFS 16 µs、6 Mb/s 的确认帧 44 µs、DIFS 34 µs。碰撞：ACK 超时 45 µs，之后的 DIFS 34 µs。' },
        { kind: 'diagram', heading: '一个时隙的三种情形', spec: bianchiSlotTiming(), caption: '按真实比例绘制：空闲的那一条几乎看不见，而碰撞的那一条几乎与成功的一样长。' },
        { kind: 'table', heading: '这两个方程的预测结果', head: ['n', '每时隙发送概率', '碰撞概率', '54 Mb/s 下的吞吐', '6 Mb/s 下的吞吐'], rows: [
          ['2', '0.1046', '10.46 %', '31.28', '5.169 Mb/s'],
          ['5', '0.0763', '27.22 %', '29.52', '4.679 Mb/s'],
          ['10', '0.0533', '38.92 %', '27.36', '4.275 Mb/s'],
          ['20', '0.0354', '49.59 %', '24.91', '3.857 Mb/s'],
        ] },
        { kind: 'formula', heading: '论文原版：无限重传', text: 'τ = 2(1−2p) / [(1−2p)(W+1) + pW(1−(2p)^m)]', note: 'Bianchi 的原式没有尝试次数上限。上表用的是 Wu 等人（INFOCOM 2002）的有限重传形式：用完七次机会的站点从 aCWmin 重新开始，所以发送略为频繁。20 台站点时，原式给出 48.09 %，有限重传形式给出 49.59 %。' },
      ],
      expect: '站点从 2 台增加到 20 台，碰撞概率从 10.46 % 升到 49.59 %，6 Mb/s 下的吞吐从 5.169 Mb/s 降到 3.857 Mb/s。一次碰撞只比一次成功短 15 µs，一个空闲时隙只有 9 µs。',
      meaning: '空闲时隙几乎不占时间，碰撞却与成功一样昂贵，所以站点越多，损失越是来自碰撞。T_s 与 T_c 由 ① 的时间参数与本仿真器的确认帧速率（②）决定。',
    },
    {
      heading: '预测与实测',
      more: [1],
      steps: [
        '载入本课场景运行十秒，统计数据帧的发送次数与重传记录数，后者除以前者即为实测碰撞率；再统计确认帧数。',
        '载入「n = 10 台站点」，同样统计。',
        '在编辑器里把种子依次改成 8 与 12345，再运行五台站点的场景。',
      ],
      blocks: [
        { kind: 'table', heading: '十秒实测', head: ['场景', '尝试', '碰撞', '确认帧', '实测碰撞率', '预测碰撞率', '实测吞吐', '预测吞吐'], rows: [
          ['n = 5', '5302', '1370', '3931', '25.84 %', '27.22 %', '4.717 Mb/s', '4.679 Mb/s'],
          ['n = 10', '5678', '1992', '3684', '35.08 %', '38.92 %', '4.421 Mb/s', '4.275 Mb/s'],
        ] },
      ],
      expect: '五台站点十秒内发送 5302 次，其中 1370 次失败，即 25.84 %，预测 27.22 %。十台站点 5678 次中 1992 次失败，3684 个确认帧，4.421 Mb/s，预测 4.275 Mb/s。种子 7、8、12345 的五台站点实测碰撞率分别为 25.84 %、25.53 %、25.71 %：随机选取的值变了，统计结果基本不变。',
      meaning: '两者很接近，但实测总比预测少一些碰撞；偏差的方向每次都相同，原因在下一课。重传记录能当作碰撞来统计，是因为本课的场景没有捕获（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.3.3 与式 (10-1)（退避计数与 CW 序列）、§10.3.4.3（忙时停止递减、每次发送之后的退避及其起点）、§10.3.7 式 (10-6)（DIFS）、§10.3.2.11（ACK 超时）、§10.3.4.4（重传上限）、§10.6.6.5.2（确认帧的速率）、§10.6.5.8（数据帧的速率）、§17.4.3 式 (17-29)（OFDM 发送时长）、§17.4.4 表 17-24（aSlotTime 9 µs、aSIFSTime 16 µs、aCWmin 15、aCWmax 1023）。',
    '模型出自论文，不是标准：G. Bianchi，《Performance Analysis of the IEEE 802.11 Distributed Coordination Function》，IEEE JSAC 18(3):535–547，2000；有限重传形式出自 H. Wu、Y. Peng、K. Long、S. Cheng 与 J. Ma，INFOCOM 2002。',
    '本仿真器的取值与取法：3 m 圆弧、−20 dBm 的发射功率、种子 7、十分钟的生存期、十秒的采样时长、4 dB 的前导检测门限与 5 dB 的捕获（capture effect）余量、6／12／24 Mb/s 的确认帧速率，目的是使论文的假设成立。',
  ],
  limits: [],
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
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '把每台站点都移到 AP 旁边，使每一帧都以高得多的速率发出。按照模型，碰撞概率会如何变化？',
      options: [
        '下降：帧更短，可能发生碰撞的时间更少',
        '不变：进入方程的只有站点数和窗口',
        '上升：每秒能容纳更多次发送',
      ],
      answer: 1,
      explain: '有站点在发送时计数器停止递减（§10.3.4.3），所以帧长不会使任何站点多一次发生碰撞的机会。每秒的碰撞次数确实上升，而每次尝试的碰撞概率不变。',
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
      q: '下面哪一项出自标准，而不是出自 Bianchi 的论文？',
      options: [
        'τ 与 p 这一对方程',
        '其余站点在每个时隙相互独立、以同一个概率发送',
        '介质忙时退避计数停止递减',
      ],
      answer: 2,
      explain: '§10.3.4.3 规定忙时不减；两个方程和独立性假设都是论文为了得到闭式解而引入的，标准不给出任何性能公式。',
    },
  ],
}
