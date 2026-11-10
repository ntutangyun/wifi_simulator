/**
 * Wi-Fi Tier 1 · M4 · 等待与退避 · clear channel assessment: the two thresholds.
 *
 * **Standard-first shape (2026-11-11).** ① what IEEE Std 802.11-2024 says: carrier sense
 * combines the NAV, the transmitter status and the PHY's CCA (§10.3.2.1); the clause 17 OFDM
 * PHY must report busy within 4 µs on the start of an OFDM transmission at −82 dBm or more, and
 * on any signal at −62 dBm or more (§17.3.10.6.1); the HE PHY states the same two levels for the
 * primary 20 MHz channel and holds a detected PPDU busy for its duration (§27.3.22.6.3). ② what
 * the engine does — two hard thresholds with no detection delay and no miss probability, an
 * energy sum over the whole channel width, and only UWB as a foreign source. ③ four runs.
 *
 * This lesson loads **`backoff`'s scene** (`sameSceneAs: 'backoff'`) and takes jump predicates
 * of its own over that same run. The procedure is `updateAllCca` in src/engine/channel.ts. Every
 * figure printed below is read back out of the lesson text in tests/course/cca.test.ts.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, J } from '../lessonKit'

/**
 * How loud the neighbour is at STA-1 in this scene, in dBm: `buildLinkTable`
 * over the lesson's own nodes, on the 5 GHz link they default to. Typed here as
 * the figure the prose quotes and re-derived in the test.
 */
export const CCA_NEIGHBOUR_DBM = -46.01

/**
 * The neighbour's frame and its answer, with both thresholds' verdicts drawn
 * beside them. Every instant is a record of `backoff`'s base run: TX_START and
 * TX_END at 498 and 746, the access point's acknowledgement at 762 and 790, and
 * a CCA_BUSY / CCA_IDLE pair at each of those four instants.
 */
export function ccaTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '空口', spans: [
        { fromUs: 498, toUs: 746, label: '邻居的数据帧' },
        { fromUs: 762, toUs: 790, label: 'ACK' },
      ] },
      { label: '前导检测', spans: [
        { fromUs: 498, toUs: 746, label: '忙 · 高出 36 dB', tone: 'accent' },
        { fromUs: 762, toUs: 790, tone: 'accent' },
      ] },
      { label: '能量检测', spans: [
        { fromUs: 498, toUs: 746, label: '忙 · 高出 16 dB' },
        { fromUs: 762, toUs: 790 },
      ] },
    ],
    axis: { fromUs: 470, toUs: 830, ticks: [500, 600, 700, 800], unit: 'µs' },
  }
}

export const cca: Lesson = {
  id: 'cca',
  module: 3,
  title: '空闲信道评估：两条门限，相差二十分贝',
  why: '上一课里，站点（station, STA）开始发送之前要先判断介质（medium）是否忙。IEEE 802.11-2024 规定，这一判断由三部分合成：本站是否正在发送、网络分配向量（network allocation vector, NAV）是否为零，以及物理层（physical layer, PHY）的空闲信道评估（clear channel assessment, CCA）。对空闲信道评估，标准给出两条要求：一个正交频分复用（orthogonal frequency-division multiplexing, OFDM）帧的开头以不低于 −82 dBm 的电平到达，必须在 4 µs 内报忙，这依靠识别前导码（preamble）的固定序列，称为前导检测（preamble detection）；任何信号的能量不低于 −62 dBm，也必须在 4 µs 内报忙，这称为能量检测（energy detection, ED）。两条门限相差二十分贝，即一百倍的功率。电平落在两条门限之间、而本站又错过了开头的信号，标准没有要求报忙。本仿真器把这两条要求实现为两条硬门限，判忙没有时延。在本课的房间里，邻居到达 STA-1 的电平是 −46.01 dBm，远高于两条门限，凡是其他站点引起的判忙都由前导检测判出；记为能量的判忙，全部发生在本站自己正在发送时。',
  outcomes: [
    '说出标准对空闲信道评估（clear channel assessment, CCA）的两条要求各是多少、各自针对什么信号',
    '解释为什么错过了前导码（preamble），判忙所需的电平会提高二十分贝',
    '在时间轴上找到一次判忙，说出它是哪一种，并分清本仿真器与标准的不同之处',
  ],
  terms: [
    { term: 'CCA', plain: '空闲信道评估：射频对“信道此刻是否忙”作出的二元判断' },
    { term: 'preamble detection', plain: '前导检测：检测到了某一帧的开头，因而按较低的门限判忙' },
    { term: 'energy detection', plain: '能量检测：未检测到开头，只按空中的总功率判断，门限高得多' },
  ],
  needs: ['ifs'],
  standard: [
    { heading: '介质忙闲由三部分合成（§10.3.2.1）', text: '载波侦听（carrier sense）机制把网络分配向量的状态、本站发送机的状态与物理载波侦听合起来，判断介质忙闲。网络分配向量不为零即为忙；本站正在发送时，介质一律判为忙。物理载波侦听由 PHY 的空闲信道评估提供。' },
    { heading: '第 17 章 OFDM PHY 的两条要求（§17.3.10.6.1）', text: '一个 OFDM 传输的开头以不低于最低调制（modulation）编码灵敏度（sensitivity）的电平到达——20 MHz 信道为 −82 dBm——空闲信道评估必须在 4 µs 内以超过 90% 的概率报忙；检测的依据是前导码里的短训练序列。此外，任何信号的接收能量比最低灵敏度高 20 dB 以上——20 MHz 信道为 −62 dBm——也必须在 4 µs 内报忙。' },
    { heading: '高效率 PHY 的同样两条（§27.3.22.6.3）', text: 'HE 站点对占用主 20 MHz 信道的 PPDU（PHY protocol data unit），按同样的 −82 dBm 检测其开头，并在这个 PPDU 持续期间保持忙；对主 20 MHz 信道内不低于 −62 dBm 的任何信号同样报忙，电平一直超过门限就不报空闲。工作带宽大于 20 MHz 时，副信道另有规定（§27.3.22.6.4）。' },
    { heading: '标准没有说什么', text: '这两条是最低要求：达到这两个电平必须报忙，并不禁止更灵敏的实现。一个信号的电平落在 −82 与 −62 dBm 之间、而本站没有检测到它的开头时，标准没有要求报忙。' },
    { kind: 'steps', heading: '介质是否忙，按标准：逐步说明', items: [
      '本站正在发送：介质忙（§10.3.2.1）。',
      '一个 OFDM PPDU 的开头以不低于 −82 dBm 的电平到达：4 µs 内以超过 90% 的概率报忙（§17.3.10.6.1）。',
      '任何信号的能量不低于 −62 dBm：4 µs 内报忙（§17.3.10.6.1）。',
      '物理载波侦听的结果与网络分配向量合起来，任何一方为忙，介质就忙（§10.3.2.1）。',
    ] },
  ],
  implementation: [
    { topic: '本站发送时', standard: '介质一律判为忙（§10.3.2.1）', sim: '直接判忙，不做门限比较；记录里的原因字段沿用默认值「能量」，并不是一次能量检测的结果。', kind: 'faithful' },
    { topic: '前导检测', standard: '开头不低于 −82 dBm 时，4 µs 内以超过 90% 的概率报忙（§17.3.10.6.1）', sim: '一条硬门限：开头在本站接收时到达、电平不低于 −82 dBm，就以百分之百的概率判忙；低于就不判。', kind: 'value' },
    { topic: '能量检测', standard: '任何信号不低于 −62 dBm 时，4 µs 内报忙（§17.3.10.6.1）', sim: '一条硬门限：所有正在进行的发射到达本站的功率之和不低于 −62 dBm 就判忙。', kind: 'value' },
    { topic: '判忙的时延', standard: '最多 4 µs（§17.3.10.6.1）', sim: '没有时延：一路发射开始的那一纳秒，所有能收到它的站点同时变为忙。', kind: 'differs' },
    { topic: '错过了开头的信号', standard: '电平在两条门限之间、没有检测到开头时，标准没有要求报忙', sim: '开头在本站自己发送期间到达的信号，只计入能量之和，不再按 −82 dBm 判忙。', kind: 'choice' },
    { topic: '能量检测的范围', standard: 'HE 站点在主 20 MHz 信道内按 −62 dBm 判（§27.3.22.6.3），副信道另有规定（§27.3.22.6.4）', sim: '照此：把落在主 20 MHz 信道内的功率之和与 −62 dBm 比较（宽于 20 MHz 的发射按功率在带宽内均匀分布折算）；每个 20 MHz 子信道另按 −62 dBm 判忙闲，用于宽带发送前的检查。本课的场景都是 20 MHz。', kind: 'faithful' },
    { topic: '其他技术的信号', standard: '任何信号都按 −62 dBm 判（§17.3.10.6.1）', sim: '只有共享频段的超宽带（ultra-wideband, UWB）信号会计入能量之和；微波炉、蓝牙等其他干扰源没有建模。', kind: 'absent' },
    { topic: '电平是否随时间变化', standard: '标准未规定信道模型', sim: '默认没有衰落，邻居到达的电平是由几何位置与墙体算出的定值；本课的场景没有开启衰落。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '一次前导检测判忙',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一次前导检测判忙，即邻居的数据帧（data frame）开始的时刻。',
        '对照下图读出 STA-1 判忙与回到空闲的时刻、记录的原因，以及接入点（access point, AP）回复的确认帧（acknowledgement, ACK）使它再判忙的时刻。',
      ],
      blocks: [
        { kind: 'diagram', heading: '邻居的一帧与两条门限各自的判决', spec: ccaTiming(), caption: '两条门限判出的忙时段一样长。' },
      ],
      expect: '你应该看到：邻居的数据帧在 498 µs 开始，STA-1 在同一时刻判忙，原因是前导码，它的退避（backoff）计数随即暂停；746 µs 邻居的帧结束，STA-1 回到空闲；762 到 790 µs 接入点的确认帧使它再判忙一次。邻居到达 STA-1 的电平是 −46.01 dBm，比 −82 dBm 高 36 dB，比 −62 dBm 高 16 dB。',
      meaning: '这说明：电平远高于两条门限时，两条门限判出的忙时段相同（①）；判忙与信号开始在同一纳秒，是本仿真器没有判忙时延的结果（②）。',
    },
    {
      heading: '本站发送时的判忙',
      jump: 1,
      steps: [
        '跳到 0 µs 的第一次能量判忙。',
        '查看这一时刻判忙的站点是否正在发送。',
      ],
      expect: '你应该看到：0 µs 时两台站点同时开始发送，各自在这一时刻判忙，记录的原因是能量。',
      meaning: '这说明：本站发送时介质一律为忙（①）；这里的「能量」是记录的默认原因，不是一次能量检测（②）。',
    },
    {
      heading: '每一次判忙是哪一种',
      steps: [
        '载入本课场景，运行 300 ms。',
        '在事件日志里过滤 STA-1 的判忙记录，按原因统计；再逐条查看原因为能量的记录发生时 STA-1 是否正在发送。',
      ],
      expect: '你应该看到：300 ms 内 STA-1 判忙 1587 次，其中 1164 次是前导检测，423 次是能量；这 423 次每一次都发生在它自己正在发送时，没有一次由邻居引起。',
      meaning: '这说明：这个房间太小，邻居的电平远高于 −82 dBm，凡是其他站点引起的判忙都由前导检测判出（①）。两台站点之间隔着墙、电平降到 −82 dBm 以下时，两条门限都不会判忙，这是隐藏节点（hidden station）一课的起点。',
    },
    {
      heading: '判忙不等于解调',
      jump: 2,
      steps: [
        '跳到碰撞期间接入点的判忙。',
        '查看同一时刻接入点有没有锁定这两帧中的任何一帧。',
      ],
      expect: '你应该看到：接入点在 0 µs 判忙，原因是前导码；同一时刻它对两帧各记一条 RX_MISS，一帧也没有锁定。',
      meaning: '这说明：判忙只要求检测到一个电平足够高的开头（①），之后能否解出内容是另一回事；碰撞期间信道因此不会被判为空闲。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.3.2.1（载波侦听合成网络分配向量、发送机状态与物理载波侦听）、§17.3.10.6.1（−82 dBm 的开头检测与 −62 dBm 的能量检测，4 µs，超过 90% 的概率）、§27.3.22.6.3 与 §27.3.22.6.4（HE 站点在主 20 MHz 信道与副信道上的空闲信道评估）。',
    '本仿真器把两个门限写在 src/engine/phy.ts 的 CCA_PD_DBM 与 CCA_ED_DBM 里，判定过程在 src/engine/channel.ts 的 updateAllCca；判忙没有时延、按功率在带宽内均匀分布折算主 20 MHz 信道内的能量、外来信号只把超宽带信号计入，是本仿真器的取法。−46.01 dBm 这个电平与 1587、1164、423 这几个计数都是本仿真器的场景，可以通过随机种子复现。',
  ],
  limits: [],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'STA-1', 'sta', 3.5, 5, 'nonht', 'saturated'),
    node('sta-2', 'STA-2', 'sta', 6.5, 5, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('第一次前导检测判忙', (r) => r.type === 'CCA_BUSY' && r.cause === 'preamble' && r.node !== 'ap'),
    J('第一次能量判忙（本机正在发送）', (r) => r.type === 'CCA_BUSY' && r.cause === 'energy'),
    J('碰撞期间接入点的判忙', (r) => r.type === 'CCA_BUSY' && r.cause === 'preamble' && r.node === 'ap'),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一帧到达你这里是 −70 dBm，但它的开头是在你自己正发送的时候到的。按标准，你的空闲信道评估必须报忙吗？',
      options: [
        '必须：−70 dBm 高于 −82 dBm',
        '不必：开头已经错过，−82 dBm 的要求针对的是检测到的开头，而 −70 dBm 低于 −62 dBm 的能量检测要求',
        '必须：任何能收到的信号都算忙',
      ],
      answer: 1,
      explain: '§17.3.10.6.1 的 −82 dBm 针对一个 OFDM 传输的开头；没有检测到开头时，只有不低于 −62 dBm 的能量才必须报忙。',
    },
    {
      q: '一台超宽带（ultra-wideband, UWB）设备的信号落进了 Wi-Fi 的工作信道。Wi-Fi 的侦听会按哪条门限判断它？',
      options: [
        '−82 dBm 的那条：它毕竟也是一路真实的信号',
        '−62 dBm 的那条：Wi-Fi 无法识别它的开头，所以它只能按能量判断',
        '两条都不用：不是 Wi-Fi 的信号一律忽略',
      ],
      answer: 1,
      explain: '前导检测识别的是 OFDM 前导码的序列。其他技术的信号只能按能量判断，标准对任何信号都要求在 −62 dBm 时报忙。',
    },
    {
      q: '本仿真器里，邻居开始发送后多久 STA-1 判忙？标准允许多久？',
      options: [
        '本仿真器 0 µs，标准最多 4 µs',
        '两者都是 4 µs',
        '本仿真器 9 µs，即一个时隙（slot time）',
      ],
      answer: 0,
      explain: '§17.3.10.6.1 要求 4 µs 内报忙；本仿真器没有判忙时延，信号开始的同一纳秒就判忙。',
    },
  ],
}
