/**
 * Wi-Fi Tier 2 · M8 · 容量旋钮与速率控制 · What a time-varying link turns into.
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
  title: '温和的信道丢得更多——起伏被速率控制换成了速率',
  why: '前两课的那条规则在它自己的场景里没有本来该有的触发源：链路（link）电平由几何与墙一次算定，整段仿真一动不动，所以那里的失败全部来自竞争。这一课把时间轴打开：同一个位置、同一台设备，到达电平自己在均值上下起伏。然后它问一个会把人问住的问题——两种起伏，一种深一种浅，哪一种丢的帧更多。答案是浅的那一种，而原因不在电平上。',
  outcomes: [
    '分清两层起伏：一层按相干区间换值，一层逐帧换值，并在事件日志里把两个数读出来',
    '说清为什么深衰落多的信道掉帧更少，而它付的是别的东西',
    '读出相干时间——它不是屏幕上的一个数字，是失败在时间上聚成的那一团有多宽',
  ],
  needs: ['rate-fallback', 'rate-cost'],
  terms: [
    { term: 'shadowing', plain: '慢的那一层起伏：整条信道一起深一起浅，在一段相干时间里保持同一个值' },
    { term: 'small-scale fading', plain: '快的那一层起伏：多条路径在接收端相加相消，这里一帧一个值' },
    { term: 'coherence time', plain: '慢的那一层保持同一个值的那段时间；本仿真器取 100 ms' },
    { term: 'Rician K factor', plain: '直射径功率与散射功率之比；K 越大起伏越浅，K 趋于零就是瑞利' },
  ],
  picture: [
    { heading: '一个不动的位置，一个会动的电平', text: '到此为止的每一课里，到达电平都是算出来的定数：发射功率（transmit power）减去路径损耗（path loss），减去挡在中间的那几堵墙。真实房间里没有这么安静——人在屋里走动、门开合、家具反射的那几条路径随时相加相消，于是两端都不动，电平也会在自己的均值上下起伏若干分贝。本仿真器把这件事建成两层，而这一课的全部内容是这两层的节奏不同。' },
    { kind: 'watch', jump: 1, heading: '去看一眼', text: '载入仿真——载入的就是「瑞利」那一档——在事件日志里找接收端那一行：preamble 后面多了两个带正负号的数，shadow 与 fast。顺着往下翻几十行——shadow 一直是 +0.0，而 fast 每一帧都不同，正负都有，偶尔深到十几个负分贝。这一课的两个旋钮，在屏幕上就是这两个数。' },
    { heading: '两层，两种节奏', text: '慢的那一层是阴影：它按相干区间取键，一个区间里所有帧共用同一个值。快的那一层按帧取键，每一帧重抽一次。它们之所以分开印而不相加，正是因为相加之后节奏就看不见了——而节奏是区分两层的唯一东西。还有一件要记住的：阴影取键用的是这一帧开始发送的时刻，不是「现在」，所以一帧跨过相干区间的边界时，它的电平不会在半途变。' },
    { kind: 'steps', heading: '这一帧到达时的电平是怎么定出来的，一步一步', items: [
      '先查那张静态链路表：几何距离与穿过的墙算出的那个定数，与前面每一课完全一样。',
      '加上这一帧开始发送时刻所在那个相干区间的阴影值——同一区间内的每一帧加的是同一个数。',
      '再加上这一帧自己的那个小尺度衰落值——每一帧一个，与上一帧无关。',
      '两层都是「相对均值的分贝」，所以不开起伏时它们精确为零，电平一位不变。',
      '最后一步是这一课的全部机理所在：发送端挑调制与编码方式（modulation and coding scheme, MCS）时读的是那张表里的均值，这一帧的两层起伏一个字都不进去。',
    ] },
  ],
  numbers: [
    { kind: 'table', heading: '同一条链路，三种配置，五个种子（7 / 11 / 23 / 101 / 999），各跑 1000 ms', head: [
      '配置', '掉帧率', '用到的级别', '吞吐（均值）', '有失败的 100 ms 窗口',
    ], rows: [
      ['不开起伏', '0.00%，五个种子一个样', '只有 MCS 3', '21.47 Mb/s', '0 / 10'],
      ['瑞利', '1.11% ～ 4.73%', 'MCS 0 到 3', '9.58 Mb/s', '4 ～ 9 of 10'],
      [`莱斯 K = ${RICIAN_K_DEFAULT_DB} dB`, '9.98% ～ 12.09%', 'MCS 1 到 3', '17.07 Mb/s', '10 / 10'],
    ] },
    { heading: '第一行是这一课的基准，而它是一个精确的零', text: '切到「不开起伏」那个变体，这条链路，这条链路发出约 1750 个数据帧（data frame），一帧未丢，级别从头到尾钉在同一档，碰撞标记一个也没有；五个种子一个样。表里的掉帧率有一个固定的量法，看数之前要先说清：分母是这台站点（station, STA）发出的数据帧条数，分子是接入点（access point, AP）那一侧没解出来的接收条数，两者都只数这一条链路上的，而且三种配置用的是同一套定义。这个场景里只有一台站点和一个接入点，没有第二台设备，所以打开起伏之后每一次失败都只能来自链路本身。而打开之后，上面那张表的每一列都变了：掉帧率、吞吐、用到的级别数，以及失败在时间上的分布，四个量一起变。' },
    { heading: '这一课的结论，它与直觉相反', text: `莱斯 K = ${RICIAN_K_DEFAULT_DB} dB 的信道比瑞利温和得多——它有一条稳定的直射径，深衰落少得多——掉帧率却是瑞利的 2.5 到 4 倍，而吞吐高出 78%。五个种子逐个成立，不是一次测量的巧合。` },
    { kind: 'table', heading: '机理的两半，都在种子 7 上量过', head: [
      '量', '瑞利', `莱斯 K = ${RICIAN_K_DEFAULT_DB} dB`,
    ], rows: [
      ['抽到的值低于 −10 dB 的比例', '9.51%', '1.68%'],
      ['1000 ms 里发出的数据帧', '848', '1600'],
      ['其中落在最低一级的', '345', '0'],
      ['其中留在最高一级的', '51', '1090'],
      ['每帧平均占用的空口时间（airtime）', '995 µs', '456 µs'],
    ] },
    { heading: '所以变坏的不是电平，是速率控制把起伏换成了什么', text: '深衰落多的瑞利信道把起伏换成速率：规则把它按到最低一级并让它停在那儿，而那一级之上有十来分贝余量，于是它几乎不掉帧——代价是每帧长了一倍多，吞吐腰斩。浅衰落的莱斯信道换成的是掉帧：它爬得上去并待在最高那一级，而那一级只剩 3.62 dB 余量，剩下的浅衰落就足够打掉一成的帧。两种结局都来自同一件事——挑级别读的是静态均值。' },
    { heading: '为什么阴影那一档只在实验里出现，而不是第四个变体', text: '课程有一份清单，逐个场景钉住它跑出来的那条时间轴。那份清单的窗口是 150 ms，而阴影的相干时间是 100 ms——于是一轮里最多只抽到两个阴影值，两个都落在门限以上，一行「阴影开着」会与「阴影关着」写成同一个结果。所以这一课的变体只有三个，阴影那一档放进下面的实验里，跑满 1000 ms 才量得出来。一把窗口与被测量的周期同量级的尺，量不出那个周期——这件事本身比它量错的那个数更值得记住。' },
    { kind: 'table', heading: '相干时间看得出来：阴影 σ 4 dB、关掉快层、种子 7，把失败按 100 ms 分到十个窗口里', head: [
      '相干时间', '每个窗口里的失败数',
    ], rows: [
      ['10 ms', '6, 8, 15, 1, 0, 4, 4, 0, 8, 4 —— 摊开'],
      ['50 ms', '0, 0, 0, 13, 13, 0, 0, 0, 13, 12 —— 两两成对'],
      ['100 ms', '0, 0, 0, 0, 0, 0, 0, 26, 24, 0 —— 全挤在两格里'],
      ['500 ms', '一次也没有 —— 整轮只抽到 2 个阴影值'],
    ] },
  ],
  deeper: [
    { heading: '为什么余量是一个阶梯而不是一个分布', text: '在这条链路上加一节 selectivity 量过 809 次接收：余量的第 5 百分位 3.62 dB、中位 8.62 dB、第 95 百分位 11.62 dB，而全部取值只有四个。原因是阴影关着时均值电平是常数，于是「余量」等于固定信噪比（signal-to-noise ratio, SNR）减去当前那一级的门限——它只能取几个离散值。最小的 3.62 dB 对应最高那一级，最大的 11.62 dB 对应最低那一级。所以这不是「链路的余量分布」，而是「速率控制此刻坐在哪一级」的另一种说法。' },
    { heading: '为什么只印比率不印条数', text: '降级让帧变长，同样时间里发出的帧就少了：不开起伏 1758 帧，瑞利只有 848 帧。于是失败的条数在两种配置之间不可比——分母差了一倍。这一课因此一个失败条数都不印，只印掉帧率，并把分母写在旁边。这条规矩是带宽那一课栽过一次才立起来的。' },
    { heading: '两层的不对称：一层零均值，另一层不是', text: '阴影在分贝域里确实零均值（20 万次抽取量到 +0.001 dB，标准差 3.998）。快的那一层不是：瑞利平均 −2.51 dB，莱斯 K = 6 dB 平均 −0.96 dB。原因是功率域的零均值经过对数之后不再是零均值，瑞利那个数的理论值正好是 −10γ/ln10 = −2.5068 dB。所以打开瑞利并不只是给这条链路加方差，它把平均电平压低了 2.51 dB。' },
  ],
  limits: [
    { kind: 'model-value', text: '四个取值全是本仿真器选的：阴影标准差 4 dB、相干时间 100 ms、瑞利、K = 6 dB。标准里没有信道模型表、没有阴影标准差，Rayleigh 与 Rician 两个词在已发布的四份文件里一次也没有出现。这四个数取自室内实测常报范围的中间（阴影标准差常报 3 到 8 dB、K 常报 3 到 10 dB），不是任何一次测量活动的结果。标准在时间轴上给的是另外两样：一条把波束成形反馈发不发挂在「相干时间间隔」上的规则，而它没有给过这个量一个数；以及中段训练字段的 10 或 20 个符号（symbol）的周期，折成 136 µs 与 272 µs——那是帧内尺度，比这里的 100 ms 小 735 倍。' },
    { kind: 'unmodelled', text: '没有多普勒（Doppler）：节点在整段仿真里不动，所以相干时间是一个配置值，不是从谁的速度推出来的。也没有空间相关：经过同一面墙的两条链路在这里各自独立地抽阴影，而真实房间里它们会一起变深。那要一个相关长度，而这个量在已发布的四份文件里都没有取值，于是本仿真器取独立——独立是方差偏大的那一边。' },
    { kind: 'threshold', text: '小尺度衰落还有一道硬夹断：它不许深过 −50 dB。这么深的一次衰落已经远在任何接收机的灵敏度（sensitivity）之下，夹断它不改变任何结果，只是让分贝运算保持有限；20 万次抽取里撞到约两次。另外要分清两个域：E[|h|²] = 1 说的是功率域平均为一，而分贝域的平均落在零以下，所以上面那两个负数不是误差。' },
    { kind: 'out-of-scope', text: '起伏一个字都不进挑级别那一步：发送端读的是链路表里那个静态均值（simulation.ts 的 mcsForPeer），连慢的那层阴影都不含。这是刻意的——帧还不存在的时候就要定级——但这一课的结论完全建立在它上面，所以不要把这一课读成「速率控制会替这条链路把起伏吸收掉」。另外两件也在范围外：这个场景只有一条链路，所以载波侦听（carrier sense）、隐藏节点（hidden station）与碰撞在这里都没有问题可问（打开起伏会让两台互相听不见的站点时隐时现，那是另一门课）；而这一课不开频率选择性，所以它的掉帧率与 selectivity、ru-diversity 两课的掉帧率不可直接比较。' },
  ],
  sources: [
    '「相干时间」是 IEEE Std 802.11-2024 §10.33.3 里一条规范句子的闸门：波束成形接收端不应回送反馈，如果反馈帧到达时的 TSF 时刻减去帧里 Sounding Timestamp 字段的值大于传播信道的相干时间间隔。标准自己把一个发不发的判决挂在这个量上，而全书没有给过它一个数——这正是 coherenceMs 这个旋钮替代的那件事。',
    '帧内的那个时间尺度是标准量化过的：触发帧 Common Info 字段里的 Doppler 子字段为 1 时，HE TB PPDU 里带中段训练字段，而周期只有两档——10 个符号或 20 个符号（IEEE Std 802.11-2024 Table 9-47 与 §26.16）。折成时间只用引擎自己已有的符号长度 13.6 µs：136 µs 与 272 µs。本课不建中段训练字段、不建 Doppler 字段、不建信道估计误差，这两个条号在这里只作为时间尺度的出处出现。',
    '阴影衰落、小尺度衰落、对数正态、瑞利与莱斯都不是 IEEE Std 802.11-2024 的词：穷举检索过 802.11-2024、802.11be-2024 与 802.11bf-2025 三份全文，shadowing、Rayleigh、Rician、log-normal 四个词一次都没有出现过。所以这一课四个取值标为模型取值是查证后的判断，不是省事。',
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
    J('第一次没解出来的接收', (r) => r.type === 'RX_FAIL' && r.reason === 'lowSinr'),
  ],
  observe: [
    '载入之后先盯住事件日志里 fast 那个数：它逐帧都不同，而同一个相干区间里 shadow 一直是同一个值（这一轮阴影关着，所以那个值是 +0.0）。切到「莱斯」，fast 的摆动幅度明显小了一圈——而掉帧率反而从 2.71% 涨到 10.31%（种子 7）。',
    '把三个变体的时间轴整段拉完，数一数失败落在哪些 100 ms 窗口里：不开起伏时十个窗口全空，瑞利时四到九个窗口有失败，莱斯时十个窗口全都有。莱斯那条链路一直坐在只剩 3.62 dB 余量的那一级上，所以它的失败是均匀洒开的，而不是成串的。',
  ],
  tryThis: [
    '点「在编辑器中打开」，在「时变链路（衰落）」一节里把小尺度衰落改成「无」，阴影标准差填 2 dB，相干时间留 100 ms。跑完会发现时间轴与完全不开起伏的那一轮逐哈希相同：1758 帧、0 掉帧、级别恒为 3。两个数都算出来了，而最高一级之上还有 3.62 dB，2 dB 的阴影一帧都翻不动——一个四个字段都填好的合法配置，产出与关着一模一样。',
    '把阴影标准差调回 4 dB、小尺度衰落仍然选「无」，再把相干时间从 100 ms 改成 500 ms。失败会整轮消失，而原因不是起伏变小了：相干时间与这一轮的长度同量级，整轮只抽到两个阴影值，而两个都落在门限以上。把仿真跑到 10 秒，失败就回来了。相干时间与观测窗同量级时，一轮量到的不是分布，是一次抽样。',
  ],
  quiz: [
    {
      q: '莱斯 K = 6 dB 的信道比瑞利温和，为什么它掉的帧更多？',
      options: [
        '因为莱斯分布的平均电平比瑞利低，起伏虽浅但基准更差',
        '因为速率控制把瑞利的深衰落换成了速率：它被按到最低一级并停在那儿，而那一级有十来分贝余量；莱斯爬得上去，坐在只剩 3.62 dB 余量的那一级上',
        '因为莱斯信道的帧更长，在空中待得更久，被撞上的机会更多',
      ],
      answer: 1,
      explain: '平均电平正相反：瑞利在分贝域平均 −2.51 dB，莱斯 K = 6 dB 只有 −0.96 dB。而碰撞在这个单链路场景里恒为 0。两种配置的差别全在速率控制停在哪一级：瑞利每帧平均 995 µs、吞吐 9.58 Mb/s，莱斯每帧 456 µs、吞吐 17.07 Mb/s。',
    },
    {
      q: '阴影标准差 4 dB、相干时间 500 ms，跑 1000 ms 一次失败也没有。为什么？',
      options: [
        '相干时间越长起伏越小，500 ms 时阴影已经接近常数',
        '整轮只抽到两个阴影值，而这两个恰好都落在门限以上——量到的不是分布，是一次抽样',
        '相干时间超过 100 ms 之后引擎就不再抽阴影了',
      ],
      answer: 1,
      explain: '阴影的标准差与相干时间无关，变的只是换值的节奏。相干时间与观测窗同量级时，窗口里装不下几个值；这正是课程那份哈希清单的 150 ms 窗口量不出这一层的同一个原因。把仿真跑长，失败就回来了。',
    },
  ],
}
