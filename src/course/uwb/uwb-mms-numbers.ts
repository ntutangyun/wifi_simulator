/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · Fragments, budgets and the 12 dB.
 *
 * The arithmetic under `uwb-mms`, in the standard-first shape (2026-11-10): ① the regulatory
 * millisecond budget as 15-22/0205r0 states it, the fragment's length as 15-23/0100r2 builds it,
 * the mandatory parameter sets of 15-23/0502r3, the ±20 ppm of §16.4.9 and the clock-offset
 * correction of §10.29.1.2.2 — and that none of the proposals says how a receiver combines a
 * train or estimates a clock ratio from it; ② the simulator's own budget, combining rule,
 * threshold and ratio estimate, each labelled for what it is; ③ four guided runs: one fragment's
 * budget item by item, three trains in one room, the clock ratio over a 7 ms span, and the
 * honest split of the 19.57 dB a train beats a 4z poll by.
 *
 * It loads exactly the scene `uwb-mms` loads, so the split adds no new scenario. Every figure the
 * labs print is read back out of the lesson and compared with a run in
 * tests/course/uwb-mms-numbers.test.ts.
 */
import { J, firstNbReport, firstUwbRange, firstUwbRsf, firstUwbTrain, type Lesson } from '../lessonKit'
import { uwbMmsScenario } from './uwb-mms'

export const uwbMmsNumbers: Lesson = {
  id: 'uwb-mms-numbers',
  module: 28,
  title: '片段、预算，和那 12 dB',
  why: '多毫秒（multi-millisecond, MMS）测距的链路预算可以逐项算清。法规按一毫秒平均限制超宽带（ultra-wideband, UWB）发射，于是一毫秒里只有 37 nJ 的能量；一个片段（fragment）只有 82.051 µs，把这 37 nJ 集中在其中，功率就是 −3.46 dBm。提案给出了片段的构成与可选的参数集（parameter set），但没有规定接收机怎样合并一串片段，也没有规定怎样由它估计时钟；这两步都是本仿真器的取法：理想的合成增益（combining gain）为 10·log10(片段数)，余量不为负即判为检出。在本课的房间里，每个片段到达时是 −100.26 dBm，八个片段合起来是 −91.23 dBm，比 −93 dBm 的灵敏度（sensitivity）高 1.77 dB；四个片段只差 3.01 dB，余量变为负值，整段运行一次测距也没有。一串片段跨越 7 ms，接收方用它测得两块晶振（crystal）之间的时钟比值（clock ratio），以百万分之几（parts per million, ppm）计，残余误差只有 0.0202 ppm，所以单边测距不必再做第二次往返。一串片段比一帧普通 Poll 强 19.57 dB，其中只有 9.03 dB 来自合成增益，其余 10.54 dB 来自发射功率（transmit power）：片段更短，以及本仿真器的 4z 发射机没有用满它的能量额度。',
  outcomes: [
    '分清预算中哪些数来自法规与提案，哪些是本仿真器的取值或取法',
    '算出一串片段合成后的电平与余量，并说明片段数减半为什么使整个房间测不到距离',
    '把增益中来自多毫秒设计的部分，与来自发射功率的部分区分开',
  ],
  needs: ['uwb-mms'],
  terms: [
    { term: 'combining gain', plain: '接收机把一串片段合起来之后，整串相对单个片段的电平提高了多少' },
    { term: 'clock ratio', plain: '一台设备的晶振频率相对另一台快或慢多少，用百万分之几表示' },
    { term: 'parameter set', plain: '一组带名称的预定义取值，规定片段长度和每串片段数，两端只需指明名称即可约定' },
  ],
  standard: [
    { heading: '一毫秒的能量（法规；15-22/0205r0）', text: '超宽带的发射限值是平均等效全向辐射功率 −41.3 dBm/MHz，按一毫秒取平均。这是一份能量额度，而不是功率上限：提案 15-22/0205r0 把它写成每 500 MHz 每毫秒 37 nJ。一毫秒之内这份能量怎样分配，法规的平均限值不加区分。' },
    { heading: '片段的长度（15-23/0100r2）', text: '一个测距序列符号（symbol）由两段长 64 的序列 A、B 组成，每段之后可以加一段 0 到 64 个零的间隔，写成 [A, G, B, G]，再乘以扩频因子 4；一个测距序列片段（ranging sequence fragment, RSF）把这个符号重复 32、40、48、64、128 或 256 次。片段长度因此等于 重复次数 × 4 × (128 + 2 × 间隔) 个码片（chip）。' },
    { heading: '参数集（15-23/0502r3）', text: '提案 15-23/0502r3 从全部合法配置中选出一组强制的参数集，以降低测试成本、便于互通：测距序列的码号与间隔取若干组固定组合；只含 RSF 的配置按「一串至多 16 个片段可以相干合成、每个片段约 64 µs」来选取。' },
    { heading: '晶振容差与单边测距的时钟误差（标准 §16.4.9、§10.29.1.2.2）', text: 'IEEE Std 802.15.4-2024 规定高速率脉冲（HRP）超宽带物理层（physical layer, PHY）的发射中心频率容差为 ±20 × 10⁻⁶（§16.4.9）。单边双向测距（single-sided two-way ranging, SS-TWR）的飞行时间估计为 ½(Tround − Treply)；两端各用自己的时钟测量这两个时间，误差随回复时延（reply time）增大。接收端若能测得与对端之间的相对时钟偏差（clock offset），就可以用它修正 Treply（§10.29.1.2.2）。怎样测得这个偏差，标准不规定。' },
    { kind: 'steps', heading: '单边双向测距的时钟偏差修正，按标准 §10.29.1.2.2：逐步说明', items: [
      '设备 A 发出第一帧，设备 B 收到后经过回复时延 Treply 发出应答；两端各用自己的时钟测量。',
      'A 测得往返时间 Tround；Treply 由 B 随应答帧携带，或用另一条消息随后送给 A。',
      '不加修正时，飞行时间估计为 ½(Tround − Treply)；两块时钟各自的频率误差使这个估计的误差随 Treply 增大。',
      'A 的接收机若能测得与 B 的发射机之间的相对时钟偏差 Coffs，就把 Treply 乘以 (1 − Coffs) 再代入上式。',
      'Coffs 怎样测得，标准不规定；能测时，它通过 MCPS-DATA 原语的 RangingTrackingInterval 与 RangingOffset 参数报告。',
    ] },
    { heading: '提案没有规定的两步', text: '上面三份文稿都没有规定接收机怎样把一串片段合起来、怎样判定检出，也没有规定怎样由一串片段估计时钟比值。下一节里，这两步都标为本仿真器的取法。' },
  ],
  implementation: [
    { topic: '一毫秒的能量', standard: '−41.3 dBm/MHz，按一毫秒平均；每 500 MHz 每毫秒 37 nJ（15-22/0205r0）', sim: '−41.3 dBm/MHz × 499.2 MHz = −14.3 dBm，持续一毫秒即 37 nJ。', kind: 'faithful' },
    { topic: '片段的功率', standard: '平均限值不规定一毫秒之内怎样分配', sim: '每个片段都用满 37 nJ：功率 = 10·log10(37 nJ ÷ 片段长度)。不设峰值功率上限，也不累计一毫秒里实际发出的能量。', kind: 'choice' },
    { topic: '4z 发射机', standard: '标准不规定发射功率的取值', sim: '不论帧长都按 −14 dBm 发射，从不把短帧的功率提高到能量额度允许的值。', kind: 'value' },
    { topic: '合成与判决', standard: '提案未规定', sim: '整串电平 = 收到的第一个片段的电平 + 10·log10(收到的片段数)；减去 −93 dBm 的灵敏度，差值不为负即判为检出。', kind: 'choice' },
    { topic: '参数集', standard: '15-23/0502r3 的强制参数集；现行草案的配置表另有增减', sim: '收录该提案 RSF-only 与混合两类共 17 组；「rsf-1」是本仿真器对 RSF-only 第 1 组的叫法：X = 16，重复 40 次，间隔 33 个零。', kind: 'choice' },
    { topic: '基准场景的那一串', standard: '测距周期的缺省值 X = 8（15-22/0381r5 表 1.2.3.2）', sim: 'X = 8、重复 40 次、间隔 64 个零，与任何一个有名称的参数集都不对应。', kind: 'value' },
    { topic: '时钟比值的估计', standard: '标准只说可以用测得的时钟偏差修正 Treply，不规定测法（§10.29.1.2.2）', sim: '只用收到的第一个与最后一个片段的两个时间戳：比值 = 实测跨度 ÷ ((j − i) × 片段间隔)；中间的片段只计入合成增益。', kind: 'choice' },
    { topic: '时间戳噪声', standard: '标准不规定', sim: '每个时间戳 100 ps 的噪声；两个接收时间戳给任何一次测距带来约 2.1 cm 的误差。', kind: 'value' },
    { topic: '晶振', standard: '±20 × 10⁻⁶（§16.4.9）', sim: '本场景的晶振是设定的，不是抽样的：标签（tag）+20 ppm，锚点（anchor）−20、0、+10 ppm，于是标签处的真实比值是 40、20、10 ppm。', kind: 'faithful' },
  ],
  labs: [
    {
      heading: '一个片段的预算，逐项计算',
      jump: 1,
      steps: [
        '载入本课场景，跳到对端如何判定这一串片段。',
        '按下表从一毫秒的能量算到余量，再与那条判定记录对照。',
      ],
      blocks: [
        { kind: 'formula', heading: '整串的电平与余量（本仿真器的模型）', text: '增益 = 10·log10(X)      余量 = rx + 增益 − (−93 dBm)', note: 'rx 是一个片段到达时的电平；合成与判决的方式是本仿真器的取法。' },
        { kind: 'table', heading: '这六项在本场景中的取值', head: ['符号', '本场景'], rows: [
          ['E，一毫秒', '−41.3 dBm/MHz × 499.2 MHz = −14.3 dBm → 37 nJ'],
          ['t，一个片段的长度', '40 × 4 × (128 + 2 × 64) = 40 960 chips → 82.051 µs'],
          ['P，一个片段', '10·log10(37 / 82.051) = −3.46 dBm'],
          ['rx，到达时', '−3.46 − (50.50 + 22.30 + 24) = −100.26 dBm'],
          ['G，八个与四个', '+9.03 dB · +6.02 dB'],
          ['余量，S = −93 dBm', '+1.77 dB · −1.24 dB'],
        ] },
      ],
      expect: '判定记录写着 8/8 heard、−100.3 dBm + 9.0 dB = margin 1.8 dB，与表中逐项算出的 −100.26 dBm、+9.03 dB、+1.77 dB 一致。',
      meaning: 'E 与 t 出自法规与提案（①）；P、G 与判据是本仿真器的取法（②），rx 里的 50.50、22.30 与 24 是本仿真器的传播模型。',
    },
    {
      heading: '同一个房间里的三种片段串',
      more: [0, 1],
      steps: [
        '依次载入本课场景、「四个片段」与「参数集 rsf-1」，各运行 1.3 秒。',
        '对照下表读出每个片段的电平、增益、余量与测距次数。',
      ],
      blocks: [
        { kind: 'table', heading: '三种片段串', head: ['片段串', '每个片段', '增益', '余量', '结果', '测距'], rows: [
          ['8 × 82.051 µs', '−100.26 / −100.07 dBm', '+9.03 dB', '+1.77 / +1.96 dB', '检出', '21'],
          ['4 × 82.051 µs', '−100.26 / −100.07 dBm', '+6.02 dB', '−1.24 / −1.05 dB', '丢失', '0'],
          ['16 × 62.179 µs', '−99.05 / −98.86 dBm', '+12.04 dB', '+5.99 / +6.18 dB', '检出', '21'],
        ] },
      ],
      expect: '前两行的片段、电平完全相同，也都全部收到，判定结果因 3.01 dB 之差而反转。rsf-1 的片段更短，同样 37 nJ 集中在 62.179 µs 里，每个片段高 1.20 dB，再加 16 个片段的增益，余量升到 +6 dB 左右。',
      meaning: '片段数与参数集出自提案（①）；「差一点就一个也测不到」来自本仿真器的硬判决（②）。',
    },
    {
      heading: '七毫秒跨度上的时钟比值',
      jump: 1,
      steps: [
        '在判定记录里读出标签测得的比值，与设定的晶振对照。',
        '对照下表，看这个比值用于 0.5 ms 的回复时延后还剩多少误差。',
      ],
      blocks: [
        { kind: 'formula', heading: '比值与它的不确定度（本仿真器的取法）', text: '比值 = 实测跨度 / ((j − i) × 间隔)      σ = √2 · σ_ts / ((j − i) × 间隔)', note: '这一轮里同一台设备的片段相隔 1 ms，从第一个片段到第八个是 7 ms；σ_ts = 100 ps 时，σ = 0.0202 ppm。' },
        { kind: 'table', heading: '这个比值用于 0.5 ms 的回复', head: ['修正方式', '剩余误差'], rows: [
          ['第 0 轮测得，真值为 40 / 20 / 10 ppm', '39.970, 19.992, 9.967 ppm'],
          ['不修正，相差 40 ppm', '3.00 m'],
          ['一块晶振偏到 ±20 ppm 的极限', '1.5 m'],
          ['4z 的载波估计，残差 0.2 ppm', '1.5 cm'],
          ['这一串的 0.0202 ppm', '1.51 mm'],
          ['两个接收时间戳带来的下限，21 次测距的均方根', '2.10 cm'],
        ] },
      ],
      expect: '三个比值与真值相差都在 0.04 ppm 以内；用于半毫秒的回复后只留下 1.51 mm，远小于两个接收时间戳本身带来的 2.10 cm。',
      meaning: '用测得的时钟偏差修正 Treply 是标准给出的做法（①，§10.29.1.2.2）；用整串片段的跨度去测，是本仿真器的取法（②）。',
    },
    {
      heading: '那 19.57 dB 从哪里来',
      variant: 2,
      more: [],
      steps: [
        '载入「以 4z 作对照」，看普通 Poll 的长度与它到达锚点时的电平。',
        '对照下表把差值拆成三项。',
      ],
      blocks: [
        { kind: 'table', heading: '一串片段比一帧 Poll 强多少', head: ['组成', '大小'], rows: [
          ['一帧普通 Poll', '39 octets, 208.654 µs, 8.31 nJ'],
          ['Poll 与整串到达时', '−110.80 dBm, −91.23 dBm'],
          ['八个片段的合成', '9.03 dB'],
          ['片段更短', '4.053 dB'],
          ['未用满的能量额度', '6.488 dB'],
        ] },
      ],
      expect: '两者相差 19.57 dB。其中两项取决于发射机：合起来 10.54 dB——一台用满额度的突发发射机，发同样长的 Poll 本可达到 −7.51 dBm。归于多毫秒设计的只有 9.03 dB。',
      meaning: '「未用满的额度」来自本仿真器给 4z 发射机取的 −14 dBm（②）；唯一与器件无关的是合成增益，而它的大小又取决于本仿真器的理想合成模型。',
    },
  ],
  sources: [
    '法规：超宽带平均等效全向辐射功率 −41.3 dBm/MHz，按一毫秒平均；15-22/0205r0 把它写成每 500 MHz 每毫秒 37 nJ。',
    'P802.15.4ab 草案（截至 2026 年 9 月，投票稿为 D05，仍在 Sponsor 投票复审中），本课依据 TG4ab 文稿：15-23/0100r2（测距序列符号的构成、扩频因子 4、重复次数）、15-23/0502r3（强制参数集）、15-22/0381r5（测距周期的缺省值）、15-22/0205r0（能量预算）。已投票的 D05 可能与此不同。',
    'IEEE Std 802.15.4-2024：§16.4.9（±20 × 10⁻⁶ 的频率容差）、§10.29.1.2.2（单边双向测距与 Treply 的时钟偏差修正）。',
    '本仿真器的取值与取法：每个片段用满 37 nJ、不设峰值上限；4z 发射机 −14 dBm；10·log10(X) 的合成与 −93 dBm 的硬判决；用首尾两个片段估计时钟比值；100 ps 的时间戳噪声；这个房间的路径损耗与砖墙损耗。',
  ],
  limits: [],
  scenario: () => uwbMmsScenario('base'),
  variants: [
    { label: '四个片段', scenario: () => uwbMmsScenario('four') },
    { label: '参数集 rsf-1', scenario: () => uwbMmsScenario('rsf1') },
    { label: '以 4z 作对照', scenario: () => uwbMmsScenario('twr') },
    { label: '每次只与一个锚点测距', scenario: () => uwbMmsScenario('pairwise') },
  ],
  jumps: [
    J('第一串片段里的第一个', firstUwbRsf),
    J('对端如何判定这一串片段', firstUwbTrain),
    J('收尾的那帧窄带 REPORT', firstNbReport),
    J('两者共同得出的那次测距', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '四个片段时什么也测不出来，八个时全都测得出来。空口上究竟变了什么？',
      options: [
        '四个时片段的功率更低',
        '什么也没变——同样的片段、同样的电平，而且全都收到了。不同的只是合成后的总和：6.02 dB 对 9.03 dB',
        '四个时接收机根本没就绪',
      ],
      answer: 1,
      explain: '每个片段使用的是它自己那一毫秒的能量额度，所以它的功率与后面还有几个无关；判定的反转来自本仿真器的硬判决。',
    },
    {
      q: '在这里，八个片段的一串比一帧普通 Poll 强 19.57 dB。其中有多少属于“多毫秒”这个设计？',
      options: [
        '全部',
        '9.03 dB；另外 10.54 dB 是发射功率——片段更短，加上一台在 37 nJ 里只用掉 8.31 nJ 的发射机',
        '12.04 dB，表里最大的那个合成增益',
      ],
      answer: 1,
      explain: '只有合成增益来自“占用八个毫秒而不是一个”；其余比较的是两台发射机。',
    },
    {
      q: '哪一项是标准规定的，而不是本仿真器的取法？',
      options: [
        '用一串片段首尾两个时间戳估计时钟比值',
        '用测得的相对时钟偏差修正单边测距里的 Treply',
        '合成增益取 10·log10(片段数)',
      ],
      answer: 1,
      explain: '§10.29.1.2.2 给出用 Coffs 修正 Treply 的公式，但不规定怎样测得 Coffs；另两项都是本仿真器的取法。',
    },
  ],
}
