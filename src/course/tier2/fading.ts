/**
 * Wi-Fi Tier 2 · M8 · 容量参数与速率控制 · What a time-varying link turns into.
 *
 * The engine has had two fading layers since the `selectivity` slice and no lesson
 * has ever run their time axis: the only two published scenes that write a
 * `fading` section both set `shadowSigmaDb: 0` and use it as a *frequency*-axis
 * ingredient. This lesson is the first scene in the course where the level on one
 * link moves with time and nothing else does.
 *
 * Its conclusion is the opposite of the intuition, and it is the reason the lesson
 * exists: **the gentler channel drops more frames.** Rician at K = 6 dB fades
 * shallowly (`P(< −10 dB)` 1.68 % against Rayleigh's 9.51 %) and drops 10–12 % of
 * frames; Rayleigh drops 1–5 %. Measured on five seeds, every one of them in the
 * same direction. The mechanism is that rate control answers a fade with RATE:
 * Rayleigh's deep fades push the link to its lowest rung and park it there, where
 * it has ten-odd dB of margin and drops nothing, while the Rician link climbs back
 * to the rung with 3.62 dB of margin and sits on it.
 *
 * Design: docs/superpowers/specs/2026-10-05-fading-lesson-design.md. Every figure
 * below is pinned in tests/course/fading.test.ts with its instrument. Two things
 * the design doc decided and this file obeys:
 *
 *  - **the scene is single-link.** Opening fading on the two-station `rateScenario`
 *    takes `COLLISION` from 0 to 514, which drowns the half this lesson is about
 *    (design §2.1, §5.3 — that is a separate lesson, in tier 1's M4).
 *  - **the shadow layer is a `tryThis`, not a variant.** `lesson-hashes.test.ts`
 *    runs 150 ms and the shadow's coherence time is 100 ms, so a shadowed row would
 *    hash identically to an unshadowed one (design §4.1). Its gate runs 1000 ms in
 *    this lesson's own test file instead.
 */
import { type Lesson, firstData, J } from '../lessonKit'
import { fadingScenario } from '../wifiScenes'
import { RICIAN_K_DEFAULT_DB } from '../../engine/fading'

/** σ 0 and the shadow out of the way: the two variants that carry the lesson's claim. */
const RAYLEIGH = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rayleigh' } as const
const RICIAN = { shadowSigmaDb: 0, coherenceMs: 100, smallScale: 'rician', ricianKdB: RICIAN_K_DEFAULT_DB } as const

export const fading: Lesson = {
  id: 'fading',
  module: 8,
  title: '衰落较浅的信道丢帧更多——速率控制把起伏转化成了速率损失',
  why: '前两课的那条规则在它自己的场景里缺少本应存在的触发因素：链路（link）电平由几何位置与墙一次性确定，整段仿真保持不变，所以那里的失败全部来自竞争。本课让电平随时间变化：同一个位置、同一台设备，到达电平围绕均值起伏。本仿真器把起伏建模为两层：慢变的阴影每个相干区间随机取值一次，同一区间里的帧共用一个值；快变的那一层每一帧重新取值。两种起伏，一种深一种浅，丢帧更多的是浅的那一种，而原因不在电平上：发送端选择级别时依据的是链路表里的静态均值，这一帧的起伏完全不参与。深衰落多的瑞利信道被连续丢帧压到最低一级并停留在那里，那一级要求的信噪比（signal-to-noise ratio, SNR）比实际低十余分贝，于是几乎不再丢帧，代价是同样的字节在空口上停留的时间长一倍多，吞吐量减半。带一条稳定直射径的莱斯信道能升到并停留在最高一级，那一级的要求只比实际信噪比低几分贝，剩余的浅衰落就足以使一成的帧丢失：它的丢帧率是瑞利的几倍，吞吐量却高出近八成。五个种子逐个成立；场景里没有第二台设备，所以这些失败只可能来自链路本身。',
  outcomes: [
    '区分两层起伏：一层按相干区间更换取值，一层逐帧更换取值，并在事件日志里读出这两个数',
    '说明为什么深衰落多的信道丢帧更少，以及它付出的是什么代价',
    '读出相干时间——它不是屏幕上的一个数字，而是失败在时间上聚集成簇的宽度',
  ],
  needs: ['rate-fallback', 'rate-cost'],
  terms: [
    { term: 'shadowing', plain: '慢变的那一层起伏：整条信道同时变深或变浅，在一段相干时间内保持同一个值' },
    { term: 'small-scale fading', plain: '快变的那一层起伏：多条路径在接收端相互叠加或抵消，这里每帧取一个值' },
    { term: 'coherence time', plain: '慢变的那一层保持同一个值的时长；本仿真器取 100 ms' },
    { term: 'Rician K factor', plain: '直射径功率与散射功率之比；K 越大起伏越浅，K 趋于零就是瑞利' },
  ],
  picture: [
    { heading: '位置不变，电平变化', text: '到目前为止的每一课里，到达电平都是计算出的定值：发射功率（transmit power）减去路径损耗（path loss），再减去中间各堵墙的损耗。真实房间里的情况并非如此稳定——人员走动、门的开合、家具反射形成的多条路径随时相互叠加或抵消，因此即使两端都不动，电平也会围绕自身均值起伏若干分贝。本仿真器把这一现象建模为两层，而本课的全部内容在于这两层的变化节奏不同。' },
    { kind: 'watch', jump: 1, heading: '在事件日志中观察', text: '载入仿真——载入的就是「瑞利」那个变体——在事件日志里找到接收端那一行：preamble 后面多了两个带正负号的数，shadow 与 fast。向下浏览几十行——shadow 始终是 +0.0，而 fast 每一帧都不同，有正有负，偶尔低至负十几分贝。本课的两个参数，在屏幕上就是这两个数。' },
    { heading: '两层起伏，两种节奏', text: '慢变的那一层是阴影：它以相干区间为键取值，一个区间里所有帧共用同一个值。快变的那一层以帧为键取值，每一帧重新取值一次。两者分开显示而不相加，正是因为相加之后节奏就无法分辨——而节奏是区分两层的唯一依据。还有一点需要注意：阴影取值的键是这一帧开始发送的时刻，而不是「当前时刻」，所以一帧跨越相干区间的边界时，它的电平不会在中途改变。而 100 ms 这个相干时间是本仿真器选定的：标准里唯一与这个量相关的规则是判断波束成形（beamforming）反馈是否已经过时，而标准本身从未给出这个量的数值。' },
    { kind: 'steps', heading: '一帧到达时的电平如何确定：逐步说明', items: [
      '先查静态链路表：由几何距离与穿过的墙计算出的定值，与前面每一课完全相同。',
      '加上这一帧开始发送时刻所在那个相干区间的阴影值——同一区间内的每一帧加的是同一个数。',
      '再加上这一帧自己的那个小尺度衰落值——每一帧一个，与上一帧无关。',
      '两层都是「相对均值的分贝」，所以不启用起伏时它们精确为零，电平完全不变。',
      '最后一步是本课全部机理所在：发送端选择调制与编码方式（modulation and coding scheme, MCS）时依据的是链路表里的均值，这一帧的两层起伏完全不参与。',
    ] },
  ],
  numbers: [
    { kind: 'table', heading: '同一条链路，三种配置，五个种子（7 / 11 / 23 / 101 / 999），各运行 1000 ms', head: [
      '配置', '丢帧率', '用到的级别', '吞吐（均值）', '有失败的 100 ms 窗口',
    ], rows: [
      ['不开起伏', '0.00%，五个种子结果相同', '只有 MCS 3', '21.47 Mb/s', '0 / 10'],
      ['瑞利', '1.11% ～ 4.73%', 'MCS 0 到 3', '9.58 Mb/s', '4 ～ 9 of 10'],
      [`莱斯 K = ${RICIAN_K_DEFAULT_DB} dB`, '9.98% ～ 12.09%', 'MCS 1 到 3', '17.07 Mb/s', '10 / 10'],
    ] },
    { heading: '第一行是本课的基准，而它是一个精确的零', text: '切换到「不开起伏」那个变体，这条链路发出约 1750 个数据帧（data frame），一帧未丢，级别自始至终固定在同一级，没有任何碰撞标记；五个种子结果相同。表里的丢帧率有固定的统计方法，看数之前要先说明：分母是这台站点（station, STA）发出的数据帧条数，分子是接入点（access point, AP）一侧未能解出的接收条数，两者都只统计这一条链路，而且三种配置使用同一套定义。这个场景里只有一台站点和一个接入点，没有第二台设备，所以启用起伏之后每一次失败都只能来自链路本身。没有第二台设备还排除了另外两种情况：发送之前的载波侦听（carrier sense）在这里始终检测到空闲，而只有两台互相收不到的站点才会形成的隐藏节点（hidden station）局面在这里根本不可能出现——所以碰撞数为零不是偶然，而是这个场景不具备产生碰撞的条件。而启用起伏之后，上面那张表的每一列都发生了变化：丢帧率、吞吐量、用到的级别数，以及失败在时间上的分布，四个量同时变化。' },
    { heading: '本课的结论与直觉相反', text: `莱斯 K = ${RICIAN_K_DEFAULT_DB} dB 的信道起伏比瑞利浅得多——它有一条稳定的直射径，深衰落少得多——丢帧率却是瑞利的 2.5 到 9.5 倍，而吞吐量高出 78%。五个种子逐个成立，不是一次测量的巧合。` },
    { kind: 'table', heading: '机理的两个方面，均在种子 7 上测得', head: [
      '指标', '瑞利', `莱斯 K = ${RICIAN_K_DEFAULT_DB} dB`,
    ], rows: [
      ['取值低于 −10 dB 的比例', '9.51%', '1.68%'],
      ['1000 ms 内发出的数据帧', '848', '1600'],
      ['其中使用最低一级的', '345', '0'],
      ['其中使用最高一级的', '51', '1090'],
      ['每帧平均占用的空口时间（airtime）', '995 µs', '456 µs'],
    ] },
    { heading: '所以变差的不是电平，而是速率控制把起伏转化成了什么', text: '深衰落多的瑞利信道把起伏转化为速率损失：规则把它压到最低一级并使它停留在那里，而那一级之上有十余分贝余量，于是它几乎不丢帧——代价是同样的字节要多发送一倍多的符号（symbol），每帧在空口上停留的时间长一倍多，吞吐量减半。浅衰落的莱斯信道转化成的是丢帧：它能升到并停留在最高那一级，而那一级只剩 3.62 dB 的信噪比（signal-to-noise ratio, SNR）余量，剩余的浅衰落就足以使一成的帧丢失。两种结果都源于同一个原因——选择级别时依据的是静态均值。' },
    { heading: '为什么阴影配置只出现在实验中，而没有作为第四个变体', text: '课程有一份清单，逐个场景固定它运行得到的时间轴。那份清单的窗口是 150 ms，而阴影的相干时间是 100 ms——于是一轮里最多只取到两个阴影值，两个都落在当前那一级的门限以上，「阴影开启」那一行会与「阴影关闭」得到同一个结果。所以本课的变体只有三个，阴影配置放在下面的实验里，运行满 1000 ms 才能测出来。观测窗口与被测周期同量级的测量方法，测不出那个周期——这件事本身比它测错的那个数更值得记住。' },
    { kind: 'table', heading: '相干时间可以直接观察到：阴影 σ 4 dB、关闭快变层、种子 7，把失败按 100 ms 分到十个窗口里', head: [
      '相干时间', '每个窗口里的失败数',
    ], rows: [
      ['10 ms', '6, 8, 15, 1, 0, 4, 4, 0, 8, 4 —— 分散'],
      ['50 ms', '0, 0, 0, 13, 13, 0, 0, 0, 13, 12 —— 两两成对'],
      ['100 ms', '0, 0, 0, 0, 0, 0, 0, 26, 24, 0 —— 全部集中在两个窗口'],
      ['500 ms', '一次也没有 —— 整轮只取到 2 个阴影值'],
    ] },
  ],
  deeper: [
    { heading: '为什么余量是一个阶梯而不是一个分布', text: '在这条链路上添加一节 selectivity 后测量了 809 次接收：余量的第 5 百分位 3.62 dB、中位 8.62 dB、第 95 百分位 11.62 dB，而全部取值只有四个。原因是阴影关闭时均值电平是常数，于是「余量」等于固定信噪比（signal-to-noise ratio, SNR）减去当前那一级的门限——它只能取几个离散值。最小的 3.62 dB 对应最高那一级，最大的 11.62 dB 对应最低那一级。所以这不是「链路的余量分布」，而是「速率控制此刻处于哪一级」的另一种表述。' },
    { heading: '为什么只给出比率而不给出条数', text: '降级使帧变长，同样时间内发出的帧就更少：不开起伏 1758 帧，瑞利只有 848 帧。于是失败条数在两种配置之间不可比——分母相差一倍。因此本课不给出任何失败条数，只给出丢帧率，并注明分母。这条规则是在带宽那一课出过一次错之后才确立的。' },
    { heading: '两层的不对称：一层零均值，另一层不是', text: '阴影在分贝域里确实是零均值（20 万次取值测得 +0.001 dB，标准差 3.998）。快变的那一层不是：瑞利平均 −2.51 dB，莱斯 K = 6 dB 平均 −0.96 dB。原因是功率域平均为一（即 0 dB）的量取对数之后，分贝域的平均值不再为零，瑞利那个数的理论值正好是 −10γ/ln10 = −2.5068 dB。所以启用瑞利不只是给这条链路增加方差，它还把平均电平降低了 2.51 dB。' },
  ],
  limits: [
    { kind: 'model-value', text: '四个取值都是本仿真器选定的：阴影标准差 4 dB、相干时间 100 ms、瑞利、K = 6 dB。标准里没有信道模型表、没有阴影标准差，Rayleigh 与 Rician 两个词在已发布的四份文件里一次也没有出现。这四个数取自室内实测常见报告范围的中段（阴影标准差常见报告值为 3 到 8 dB、K 常见报告值为 3 到 10 dB），不是任何一次测量活动的结果。标准在时间轴上给出的是另外两项：一条以「相干时间间隔」决定是否发送波束成形反馈的规则，而标准没有给出这个量的数值；以及中段训练字段 10 或 20 个符号（symbol）的周期，换算为 136 µs 与 272 µs——那是帧内尺度，比这里的 100 ms 小 735 倍。' },
    { kind: 'unmodelled', text: '没有建模多普勒（Doppler）：节点在整段仿真中不移动，所以相干时间是一个配置值，而不是根据某个移动速度推导出来的。也没有建模空间相关性：穿过同一面墙的两条链路在这里各自独立地取阴影值，而在真实房间里它们会同时变深。建模这一点需要一个相关长度，而这个量在已发布的四份文件里都没有取值，于是本仿真器采用独立假设——独立假设是方差偏大的一侧。' },
    { kind: 'threshold', text: '小尺度衰落还有一个硬限幅：它不允许低于 −50 dB。这么深的衰落已经远低于任何接收机能够解调的门限，限幅不改变任何结果，只是使分贝运算保持有限；20 万次取值中约有两次触及这一下限。另外要区分两个域：E[|h|²] = 1 指的是功率域平均为一，而分贝域的平均值低于零，所以上面那两个负数不是误差。' },
    { kind: 'out-of-scope', text: '起伏完全不参与选择级别这一步：发送端依据的是链路表里的静态均值（simulation.ts 的 mcsForPeer），连慢变的那层阴影都不包含。这是有意的设计——帧尚不存在时就要确定级别——但本课的结论完全建立在这一点上，所以不要把本课理解为「速率控制会为这条链路吸收起伏」。另外两项也不在本课范围内：这个场景只有一条链路，所以载波侦听（carrier sense）、隐藏节点（hidden station）与碰撞在这里都不涉及（启用起伏会使两台互相收不到的站点时而能收到彼此、时而收不到，那是另一门课的内容）；而本课不启用频率选择性，所以它的丢帧率与 selectivity、ru-diversity 两课的丢帧率不可直接比较。' },
  ],
  sources: [
    '「相干时间」是 IEEE Std 802.11-2024 §10.33.3 里一条规范性语句的判决条件：如果反馈帧到达时的 TSF 时刻减去帧里 Sounding Timestamp 字段的值大于传播信道的相干时间间隔，波束成形接收端不应回送反馈。标准把一个是否发送的判决建立在这个量上，而全书没有给出它的数值——coherenceMs 这个参数填补的正是这个空缺。',
    '帧内的时间尺度是标准给出了具体数值的：触发帧 Common Info 字段里的 Doppler 子字段为 1 时，HE TB PPDU 里带中段训练字段，而周期只有两档——10 个符号或 20 个符号（IEEE Std 802.11-2024 Table 9-47 与 §26.16）。换算为时间只用到引擎已有的符号长度 13.6 µs：136 µs 与 272 µs。本课不建模中段训练字段、不建模 Doppler 字段、不建模信道估计误差，这两个条号在这里只作为时间尺度的出处。',
    '阴影衰落、小尺度衰落、对数正态、瑞利与莱斯都不是 IEEE Std 802.11-2024 的词：穷举检索过 802.11-2024、802.11be-2024 与 802.11bf-2025 三份全文，shadowing、Rayleigh、Rician、log-normal 四个词一次都没有出现过。所以本课把四个取值标为模型取值是查证后的判断，而不是为了省事。',
    '降档与升档的那两个门限（连续两次失败降一档、连续十次成功升一档）是引擎的取值，与「自动速率回退」那一课讲的同一套；标准把速率选择整个留给实现者。表里的掉帧率、吞吐与级别分布都由场景的种子复现。',
  ],
  // The base scene is the Rayleigh one rather than the unfaded one: a reader who loads this
  // lesson should meet the thing it is about, and the two `RX_START` fields exist on the screen
  // only once a `fading` section is in the scene. 「不开起伏」 is the first variant and the
  // counterfactual, the same shape `ru-diversity` gives its `ofdmaOn` control.
  scenario: () => fadingScenario({ ...RAYLEIGH }),
  variants: [
    { label: '不开起伏', scenario: () => fadingScenario() },
    { label: '瑞利', scenario: () => fadingScenario({ ...RAYLEIGH }) },
    { label: `莱斯 K = ${RICIAN_K_DEFAULT_DB} dB`, scenario: () => fadingScenario({ ...RICIAN }) },
  ],
  jumps: [
    J('第一个数据帧', firstData),
    J('第一条带起伏的接收', (r) => r.type === 'RX_START' && r.shadowDb !== undefined),
    J('第一次未能解出的接收', (r) => r.type === 'RX_FAIL' && r.reason === 'lowSinr'),
  ],
  observe: [
    '载入之后先观察事件日志里 fast 那个数：它逐帧不同，而同一个相干区间里 shadow 始终是同一个值（这一轮阴影关闭，所以那个值是 +0.0）。切换到「莱斯」，fast 的波动幅度明显减小——而丢帧率反而从 2.71% 升高到 10.31%（种子 7）。',
    '把三个变体的时间轴从头看到尾，数一数失败落在哪些 100 ms 窗口里：不开起伏时十个窗口全空，瑞利时四到九个窗口有失败，莱斯时十个窗口全都有。莱斯那条链路始终停留在只剩 3.62 dB 余量的那一级上，所以它的失败是均匀分布的，而不是成串出现的。',
  ],
  tryThis: [
    '点击「在编辑器中打开」，在「时变链路（衰落）」一节里把小尺度衰落改为「无」，阴影标准差填 2 dB，相干时间保持 100 ms。运行结束后会发现时间轴与完全不开起伏的那一轮哈希完全相同：1758 帧、0 丢帧、级别恒为 3。两个数都计算出来了，但最高一级之上还有 3.62 dB 余量，2 dB 的阴影不会使任何一帧失败——一个四个字段都填写完整的合法配置，结果与关闭时完全相同。',
    '把阴影标准差调回 4 dB、小尺度衰落仍选「无」，再把相干时间从 100 ms 改为 500 ms。整轮的失败会全部消失，而原因不是起伏变小：相干时间与这一轮的时长同量级，整轮只取到两个阴影值，而两个都落在门限以上。把仿真时长延长到 10 秒，失败就会重新出现。相干时间与观测窗同量级时，一轮测得的不是分布，而是一次抽样。',
  ],
  quiz: [
    {
      q: '莱斯 K = 6 dB 的信道起伏比瑞利浅，为什么它丢的帧更多？',
      options: [
        '因为莱斯分布的平均电平比瑞利低，起伏虽浅但基准更差',
        '因为速率控制把瑞利的深衰落转化成了速率损失：它被压到最低一级并停留在那里，而那一级有十余分贝余量；莱斯能升上去，停留在只剩 3.62 dB 余量的那一级上',
        '因为莱斯信道的帧更长，在空口上停留得更久，发生碰撞的机会更多',
      ],
      answer: 1,
      explain: '平均电平恰好相反：瑞利在分贝域平均 −2.51 dB，莱斯 K = 6 dB 只有 −0.96 dB。而碰撞在这个单链路场景里恒为 0。两种配置的差别完全在于速率控制停在哪一级：瑞利每帧平均 995 µs、吞吐 9.58 Mb/s，莱斯每帧 456 µs、吞吐 17.07 Mb/s。',
    },
    {
      q: '阴影标准差 4 dB、相干时间 500 ms，运行 1000 ms 没有一次失败。为什么？',
      options: [
        '相干时间越长起伏越小，500 ms 时阴影已经接近常数',
        '整轮只取到两个阴影值，而这两个恰好都落在门限以上——测得的不是分布，而是一次抽样',
        '相干时间超过 100 ms 之后引擎就不再生成阴影值了',
      ],
      answer: 1,
      explain: '阴影的标准差与相干时间无关，变化的只是更换取值的节奏。相干时间与观测窗同量级时，窗口里容纳不了几个值；课程那份哈希清单的 150 ms 窗口测不出这一层，也是同一个原因。延长仿真时长，失败就会重新出现。',
    },
  ],
}
