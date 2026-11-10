/**
 * Wi-Fi Tier 2 · M8 · 容量参数与速率控制 · What a time-varying link turns into.
 *
 * **Standard-first shape (2026-11-11).** ① what the standards say about a link whose level
 * moves with time — and the first thing to say is that IEEE Std 802.11-2024 and 802.11be-2024
 * define no channel model at all (no Rayleigh, Rician, log-normal or shadowing anywhere in
 * either text). What they do fix: the receiver's minimum sensitivity at 10 % PER (802.11be-2024
 * §36.3.21.2, Table 36-67), that rate selection is out of scope (§10.6.1) with an optional MCS
 * feedback (§26.13, 802.11be-2024 §35.19), coherence time only as a NOTE in §10.33.3, and the
 * in-PPDU midamble of a triggered HE TB PPDU (§9.3.1.22.1). ② the engine's two-layer fade, its
 * hard decode threshold and its rate choice on the static mean. ③ four runs.
 *
 * The lesson's conclusion is unchanged and still the reason it exists: **the gentler channel
 * drops more frames**, because the rate choice ignores the fade and parks Rayleigh on the bottom
 * rung while Rician climbs to the top one. Scenes, variants and jumps are unchanged, so the
 * recorded hashes do not move. Design: docs/superpowers/specs/2026-10-05-fading-lesson-design.md.
 * Every figure printed below is read back out of the lesson text in tests/course/fading.test.ts.
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
  why: 'IEEE 802.11-2024 与 802.11be-2024 都没有定义信道怎样随时间变化：瑞利、莱斯、对数正态、阴影这些词在两份标准里一次也没有出现。标准规定的是接收机在最低输入电平上误包率不超过 10%，以及速率切换的算法不在标准范围之内。所以链路（link）电平怎样起伏、发送端怎样应对，全部是本仿真器的取法。本仿真器把起伏建模为两层：慢变的阴影每个相干区间取值一次，快变的那一层每一帧重新取值；而发送端选级只看链路表里的静态均值，起伏完全不参与。结果与直觉相反：深衰落多的瑞利信道被连续丢帧压到最低一级并停留在那里，那一级要求的信噪比（signal-to-noise ratio, SNR）比实际低十余分贝，于是几乎不丢帧，代价是每帧在空口上停留的时间长一倍多、吞吐量减半；带一条稳定直射径的莱斯信道能升到并停留在最高一级，那一级的门限只比实际信噪比低几分贝（这个差值叫作余量），剩余的浅衰落就足以使一成的帧丢失。莱斯的丢帧率是瑞利的几倍，吞吐量却高出近八成，五个种子逐个成立；场景里没有第二台设备，所以这些失败只可能来自链路本身。',
  outcomes: [
    '说出标准对时变信道规定了什么、没有规定什么',
    '区分本仿真器的两层起伏，并在事件日志里读出这两个数',
    '说明为什么深衰落多的信道丢帧更少，以及它付出的是什么代价',
  ],
  needs: ['rate-fallback', 'rate-cost'],
  terms: [
    { term: 'shadowing', plain: '慢变的那一层起伏：整条信道同时变深或变浅，在一段相干时间内保持同一个值；本仿真器的模型，不是标准的术语' },
    { term: 'small-scale fading', plain: '快变的那一层起伏：多条路径在接收端相互叠加或抵消，本仿真器每帧取一个值' },
    { term: 'coherence time', plain: '信道可以看作不变的时长；标准只在一条注释里提到它，没有给出数值，本仿真器的阴影层取 100 ms' },
    { term: 'Rician K factor', plain: '直射径功率与散射功率之比；K 越大起伏越浅，K 趋于零就是瑞利' },
  ],
  standard: [
    { heading: '标准没有定义信道模型', text: 'IEEE Std 802.11-2024 与 IEEE Std 802.11be-2024 都不规定无线信道怎样随时间变化：两份全文里没有 Rayleigh、Rician、log-normal、shadowing 这些词，也没有阴影标准差或相干时间的取值。信道是标准的外部条件，标准规定的是收发两端在这个条件下应当做到什么。' },
    { heading: '接收机要做到什么（IEEE Std 802.11be-2024 §36.3.21.2，表 36-67）', text: '在表 36-67 给出的、随调制与编码方式（modulation and coding scheme, MCS）变化的输入电平上，误包率应小于 10%；PSDU（PHY service data unit）长度为 4096 字节（EHT-MCS 14、15 为 2048 字节）。这是一项一致性要求，规定的是一个电平上的误包率，而不是一条「高于即收到、低于即丢失」的门限。' },
    { heading: '谁来应对起伏（§10.6.1，§26.13；IEEE Std 802.11be-2024 §35.19）', text: '速率切换的算法不在标准范围之内。标准提供一种可选的链路自适应反馈：请求方在 HLA（EHT 为 ELA）控制子字段里置 MRQ，接收方回报建议的 MCS，也可以主动回报。是否使用、怎样使用，由实现决定。' },
    { heading: '相干时间（§10.33.3 NOTE 1）', text: '标准只在一条注释里提到相干时间：波束成形（beamforming）发送方收到反馈时，若反馈到达时的 TSF 时刻减去反馈帧里 Sounding Timestamp 字段的值大于传播信道的相干时间间隔，它可以丢弃这份反馈。标准没有给出这个间隔的数值。' },
    { heading: '帧内的时变（§9.3.1.22.1）', text: '触发帧（Trigger frame）Common Info 字段的 Doppler 子字段为 1 时，对它应答的 HE 基于触发的 PPDU（trigger-based PPDU, TB PPDU）在数据部分周期性地插入中间训练符号（midamble），周期为 10 个或 20 个符号（symbol），供接收方在一帧之内重新估计信道。这是标准为帧内信道变化提供的唯一手段。' },
    { kind: 'steps', heading: '一次发送遇到起伏的信道，按标准：逐步说明', items: [
      '发送端从接收方支持的 MCS 中选一级；选哪一级不在标准范围之内，它可以参考对方回报的 MCS 反馈（§10.6.1，§26.13）。',
      '信道在这一帧期间怎样变化，标准不规定；只有被触发的 HE 基于触发的 PPDU 可以用中间训练符号在帧内重新估计信道（§9.3.1.22.1）。',
      '接收方按自己的实现解调这一帧；标准对它的要求只是在表 36-67 的电平上误包率小于 10%（802.11be-2024 §36.3.21.2）。',
      '超时之内没有收到确认帧（acknowledgement, ACK），这次发送失败，发送端退避（backoff）并重传（retry）（§10.3.2.11，§10.23.2.2）。',
      '下一次用哪一级，仍由发送端自己的算法决定；起伏本身不会告诉它任何事，除非它请求并收到 MCS 反馈。',
    ] },
  ],
  implementation: [
    { topic: '信道模型', standard: '标准未定义', sim: '两层，单位都是相对均值的分贝：慢变的阴影服从对数正态分布，每个相干区间取值一次；快变的小尺度衰落每帧取值一次，可选瑞利或莱斯。两层不开时都精确为零，电平就是静态链路表的值。', kind: 'choice' },
    { topic: '四个取值', standard: '标准未规定', sim: '编辑器的默认值：阴影标准差 4 dB、相干时间 100 ms、瑞利、莱斯 K = 6 dB。本课的「瑞利」与「莱斯」两个变体把阴影标准差设为 0，只保留快变的那一层。', kind: 'value' },
    { topic: '阴影按哪个时刻取值', standard: '标准未规定', sim: '按这一帧开始发送的时刻所在的相干区间取值；一帧跨越区间边界时，电平不在中途改变。', kind: 'choice' },
    { topic: '多普勒与空间相关', standard: '标准未规定', sim: '节点不移动，相干时间是配置值，而不是根据移动速度推算的；穿过同一面墙的两条链路各自独立地取阴影值。', kind: 'choice' },
    { topic: '小尺度衰落的下限', standard: '标准未规定', sim: '不低于 −50 dB，只是为了使分贝运算保持有限；这么深的衰落远低于任何一级的要求，不改变任何结果。', kind: 'value' },
    { topic: '接收判决', standard: '在表 36-67 的电平上误包率小于 10%（802.11be-2024 §36.3.21.2）', sim: '每一级一条硬门限：所需信干噪比（signal-to-interference-plus-noise ratio, SINR）= 表 36-67 的灵敏度（sensitivity）减去噪声（噪声系数取 10 dB）；一帧的信干噪比不低于门限就解出，低于就丢失。', kind: 'choice' },
    { topic: '选级', standard: '不在标准范围之内（§10.6.1）', sim: '上限取静态链路表平均信噪比减去 3 dB 之后仍满足的最高一级，起伏完全不参与（连阴影也不参与）；工作级别按前两课的规则升降。所以发送端只能在帧已经丢失之后才做出反应。', kind: 'choice' },
    { topic: 'MCS 反馈', standard: '可选的 HLA／ELA 控制子字段（§26.13；802.11be-2024 §35.19）', sim: '未实现：发送端得不到接收方对信道的任何估计。', kind: 'absent' },
    { topic: '中间训练符号', standard: 'Doppler 子字段为 1 时，HE TB PPDU 每 10 或 20 个符号插入一次（§9.3.1.22.1）', sim: '未实现：一帧之内电平不变，不建模帧内的信道估计。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '两层起伏在日志里',
      jump: 1,
      steps: [
        '载入本课场景（就是「瑞利」那个变体），跳到第一条带起伏的接收。',
        '在接入点（access point, AP）一侧的接收记录里，读出前导码（preamble）后面的两个带正负号的数：shadow 与 fast。向下浏览几十行。',
      ],
      expect: 'shadow 始终是 +0.0，因为这个变体把阴影标准差设为 0；fast 每一帧都不同。运行 1000 ms，接入点一侧共有 728 条来自这台站点（station, STA）的接收记录，728 个 fast 值各不相同。',
      meaning: '两层分开显示，是因为它们的节奏不同（②）：一层按相干区间取值，一层按帧取值。标准不定义其中任何一层（①）。',
    },
    {
      heading: '三种配置，五个种子',
      more: [0, 1, 2],
      steps: [
        '依次载入「不开起伏」「瑞利」与「莱斯 K = 6 dB」，各运行 1000 ms。',
        '统计丢帧率：分母是这台站点发出的数据帧（data frame）条数，分子是接入点一侧未能解出的接收条数。再换四个种子重复。',
      ],
      blocks: [
        { kind: 'table', heading: '同一条链路，三种配置，五个种子（7 / 11 / 23 / 101 / 999），各运行 1000 ms', head: ['配置', '丢帧率', '用到的级别', '吞吐（均值）', '有失败的 100 ms 窗口'], rows: [
          ['不开起伏', '0.00%，五个种子结果相同', '只有 MCS 3', '21.47 Mb/s', '0 / 10'],
          ['瑞利', '1.12% ～ 4.78%', 'MCS 0 到 3', '9.50 Mb/s', '4 ～ 9 of 10'],
          [`莱斯 K = ${RICIAN_K_DEFAULT_DB} dB`, '9.99% ～ 12.04%', 'MCS 1 到 3', '16.97 Mb/s', '10 / 10'],
        ] },
      ],
      expect: '不开起伏时每个种子发出 1748 到 1760 帧，一帧未丢，级别始终是 MCS 3。种子 7 上瑞利丢帧 2.73%，莱斯丢帧 10.25%；五个种子里莱斯的每一个丢帧率都高于瑞利的每一个，而莱斯的吞吐量高出 79%。场景里没有碰撞。',
      meaning: '这些失败只可能来自链路本身。起伏较浅的信道丢帧反而更多，原因不在电平，而在本仿真器的选级不看起伏（②）。',
    },
    {
      heading: '机理：速率控制停在哪一级',
      variant: 2,
      more: [1],
      steps: [
        '载入「莱斯 K = 6 dB」，再载入「瑞利」，各运行 1000 ms（种子 7）。',
        '按级别统计这台站点发出的数据帧，读出每帧平均占用的空口时间（airtime）。',
      ],
      blocks: [
        { kind: 'table', heading: '机理的两个方面，均在种子 7 上测得', head: ['指标', '瑞利', `莱斯 K = ${RICIAN_K_DEFAULT_DB} dB`], rows: [
          ['1000 ms 内发出的数据帧', '844', '1591'],
          ['其中使用最低一级的', '341', '0'],
          ['其中使用最高一级的', '51', '1086'],
          ['每帧平均占用的空口时间', '1001 µs', '460 µs'],
        ] },
      ],
      expect: '瑞利把 844 帧中的 341 帧发在最低一级，每帧平均 1001 µs；莱斯从不降到最低一级，1591 帧中 1086 帧发在最高一级，每帧平均 460 µs。最高一级的门限比这条链路的平均信噪比低 3.62 dB，最低一级低十余分贝。',
      meaning: '瑞利的深衰落使它连续丢帧、被规则压到最低一级，那里余量大、几乎不丢，但每帧更长；莱斯停在只剩 3.62 dB 余量的那一级，浅衰落就足以使一成的帧丢失。两者都源于选级只看静态均值（②）。',
    },
    {
      heading: '相干时间是失败成簇的宽度',
      steps: [
        '点击「在编辑器中打开」，在「时变链路（衰落）」一节把小尺度衰落改为「无」、阴影标准差填 4 dB，相干时间依次填 10、50、100、500 ms。',
        '每次运行 1000 ms（种子 7），把失败按 100 ms 分到十个窗口里。',
      ],
      blocks: [
        { kind: 'table', heading: '阴影 σ 4 dB、关闭快变层、种子 7，把失败按 100 ms 分到十个窗口里', head: ['相干时间', '每个窗口里的失败数'], rows: [
          ['10 ms', '6, 8, 14, 0, 0, 4, 4, 0, 8, 4 —— 分散'],
          ['50 ms', '0, 0, 0, 12, 12, 0, 0, 0, 12, 12 —— 两两成对'],
          ['100 ms', '0, 0, 0, 0, 0, 0, 0, 24, 24, 0 —— 全部集中在两个窗口'],
          ['500 ms', '一次也没有 —— 整轮只取到 2 个阴影值'],
        ] },
      ],
      expect: '相干时间越长，失败越集中：10 ms 时分散在七个窗口里，100 ms 时全部落在两个窗口里；500 ms 时整轮一次也没有失败——不是起伏变小了，而是 1000 ms 里只取到两个阴影值，两个都在门限以上。',
      meaning: '相干时间在屏幕上不是一个数字，而是失败在时间上聚集成簇的宽度；它是本仿真器的配置值（②），标准没有给出它的数值（①）。观测窗口与相干时间同量级时，一轮测得的只是一次抽样。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.6.1（速率切换的算法不在标准范围之内）、§26.13（HLA 链路自适应）、§10.33.3 NOTE 1（相干时间只出现在这条注释里，没有数值）、§9.3.1.22.1（触发帧的 Doppler 子字段与 10 或 20 个符号的中间训练符号周期）。IEEE Std 802.11be-2024：§36.3.21.2 与表 36-67（最低输入灵敏度：误包率小于 10%）、§35.19（ELA 链路自适应）。在两份全文里检索 Rayleigh、Rician、log-normal、shadowing，结果都是零次。',
    '本仿真器的取值与取法：对数正态阴影（默认 σ 4 dB、相干时间 100 ms）、瑞利或莱斯小尺度衰落（默认 K = 6 dB）、−50 dB 的下限、按灵敏度表换算的硬门限、选级依据静态均值加 3 dB。这四个默认值取自室内实测常见报告范围的中段，不是任何一次测量活动的结果。表里的丢帧率、吞吐与级别分布都由场景的种子复现。',
  ],
  limits: [],
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
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '莱斯 K = 6 dB 的信道起伏比瑞利浅，为什么它丢的帧更多？',
      options: [
        '因为莱斯分布的平均电平比瑞利低，起伏虽浅但基准更差',
        '因为本仿真器的选级不看起伏：瑞利被连续丢帧压到最低一级并停留在那里，那一级有十余分贝余量；莱斯能升上去，停留在只剩 3.62 dB 余量的那一级上',
        '因为莱斯信道的帧更长，在空口上停留得更久，发生碰撞的机会更多',
      ],
      answer: 1,
      explain: '碰撞在这个单链路场景里恒为 0。两种配置的差别完全在于速率控制停在哪一级：瑞利每帧平均 1001 µs、吞吐 9.50 Mb/s，莱斯每帧 460 µs、吞吐 16.97 Mb/s。',
    },
    {
      q: '阴影标准差 4 dB、相干时间 500 ms，运行 1000 ms 没有一次失败。为什么？',
      options: [
        '相干时间越长起伏越小，500 ms 时阴影已经接近常数',
        '整轮只取到两个阴影值，而这两个恰好都落在门限以上——测得的不是分布，而是一次抽样',
        '相干时间超过 100 ms 之后引擎就不再生成阴影值了',
      ],
      answer: 1,
      explain: '阴影的标准差与相干时间无关，变化的只是更换取值的节奏。相干时间与观测窗同量级时，窗口里容纳不了几个值；延长仿真时长，失败就会重新出现。',
    },
    {
      q: '标准对「莱斯 K = 6 dB」这个信道规定了什么？',
      options: [
        '标准的信道模型表把室内信道规定为 K = 6 dB 的莱斯分布',
        '什么也没有规定：标准不定义信道模型，K = 6 dB 是本仿真器的默认值',
        '标准规定 K 越大，接收机的灵敏度要求越低',
      ],
      answer: 1,
      explain: 'IEEE 802.11-2024 与 802.11be-2024 里没有 Rician 这个词；标准规定的是接收机在表 36-67 的电平上误包率小于 10%，信道本身是外部条件。',
    },
  ],
}
