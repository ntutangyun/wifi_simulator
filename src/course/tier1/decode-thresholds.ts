/**
 * Wi-Fi Tier 1 · M1 · lesson 3: one question, asked once — when does a frame
 * decode? The answer is a hard threshold: the worst SINR of the whole frame
 * against the requirement of the rung it was sent at, with the sender's 3 dB
 * held back for the wobble.
 *
 * Re-paced on 2026-09-25 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md,
 * batch A). The lesson used to carry four things: the three questions, the
 * requirement, the fourteen-rung ladder and the rate-picking algorithm. The
 * ladder and the algorithm are now `mcs-ladder`, which loads this lesson's own
 * scene; the CCA thresholds — the −82/−62 dBm pair and the twenty decibels
 * between them — go to `cca` (M4), where a station is actually seen freezing on
 * a neighbour's frame. Nothing in these four variants ever produces a busy CCA,
 * which is why that material could not stay: it had a table and a quiz and
 * nothing to watch.
 *
 * What is left is one rule and one procedure. The requirement's derivation came
 * up out of `deeper` onto the main path — it is the lesson's whole subject now
 * — and the wide-channel corner case went the other way, out of `deeper` and
 * into `tryThis`, because it is the experiment that proves the threshold is
 * hard: at 160 MHz the far-wall link is heard perfectly and decodes nothing.
 *
 * Every number quoted below is pinned in tests/course/decode-thresholds.test.ts.
 */
import { J, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

export const decodeThresholds: Lesson = {
  id: 'decode-thresholds',
  module: 0,
  title: '一帧在什么条件下能解码成功',
  why: '信号能够到达，不等于这一帧能解码成功。发送端选择的那一级速率——调制与编码方式（modulation and coding scheme, MCS）——对信号高出噪声的幅度提出了一个要求；接收端收完整帧后，用全程最差时刻的信干噪比（signal-to-interference-plus-noise ratio, SINR）与这一要求比较。这里不存在“勉强解码”：达到要求就整帧解码成功，随即回复一个确认帧（acknowledgement, ACK）；差 0.1 dB 就整帧作废，发送端只会等不到任何应答。每一级的要求由标准的灵敏度（sensitivity）表换算而来：减去该表所假设的噪声，得到的比值与信道带宽（channel width）无关，更宽的信道只是通过抬高噪声地板（noise floor）来缩小覆盖范围。解码是接收端要回答的第三个问题，前两个——能否检出帧开头的前导码（preamble）、空口总功率是否过高——都满足了，它也未必满足：远端墙边那台笔记本把信道加宽到八倍后，前导码仍能检出、接收仍会开始，却没有一帧能解码成功。发送端选择速率等级时会在要求之上多留几分贝的速率余量，用于应对信号起伏，接收端解码时并不计入它：比值低于含余量的门限、却高于不含余量的要求的帧，仍然会被确认。',
  outcomes: [
    '说明一帧能否解码成功的分界线在哪里',
    '从标准的灵敏度（sensitivity）表算出某一级所需的信干噪比（SINR）',
    '说明发送端多留的那 3 dB 属于哪一方、在什么时候使用',
  ],
  needs: ['radio-primer', 'noise-floor'],
  terms: [
    { term: 'MCS', plain: '调制与编码方式：发送端选择的速率等级；下一课列出全部十四级' },
    { term: 'sensitivity', plain: '灵敏度：某一级仍能解码成功的最低到达功率，标准为每一级规定一个值' },
    { term: 'rate margin', plain: '速率余量：发送端在所选那一级的要求之上多留的 3 dB' },
  ],
  picture: [
    { heading: '一道硬门限', text: '接收端不存在“解码一半”的情况。它收完整帧，取全程最差时刻的信干噪比（SINR），与这一帧所用速率等级的要求比较：达到要求就记为 RX_OK，随即回复一个确认帧（ACK）；稍有不足就记为 RX_FAIL，发送端则等不到任何应答。' },
    { kind: 'watch', jump: 0, heading: '在仿真中观察', text: '载入仿真，跳到笔记本的第一个数据帧（data frame），再看紧跟在它右侧的那一小段：那是路由器的确认帧。四个变体中，每一个数据帧后面都有这样一段——这条链路（link）没有丢失任何一帧。' },
    { heading: '三个问题，而不是一个', text: '接收端对空口上的一段信号能量要回答三个问题：能否检出它开头的前导码（preamble）？空口总功率是否已高到本站不应发送？收完整帧后能否解码成功？前两个合起来称为空闲信道评估（clear channel assessment, CCA），在后面讲信道接入时介绍；这一课只讨论第三个。' },
  ],
  numbers: [
    { kind: 'table', heading: '三个问题', head: [
      '问题', '条件', '接下来会怎样',
    ], rows: [
      ['是否检出了前导码？',
       '接收信号强度指示（RSSI）≥ −82 dBm 且 SINR ≥ 4 dB',
       '前导检测（preamble detection）成功，开始接收；电平足够但 SINR 不到 4 dB 则记为 RX_MISS。'],
      ['空口总功率是否过高？',
       '空口总功率 ≥ −62 dBm',
       '判定信道忙，但没有可解码的内容——对于非 Wi-Fi 能量，这是唯一的判据。'],
      ['能否解码成功？',
       '整帧期间最差的 SINR ≥ 该 MCS 的要求',
       '记为 RX_OK 并回复确认帧；不满足则记为 RX_FAIL，发送方一直等到超时。'],
    ] },
    { kind: 'formula', heading: '这个要求的来源', text: '所需 SINR = 灵敏度 − kTB(20 MHz) − 10 dB = 灵敏度 + 90.99 dB', note: '标准给的不是比值，而是每一级的最小输入灵敏度；那张表假设了 10 dB 的噪声系数，所以减去该表所假设的噪声，得到的才是这一帧真正需要的比值。第 0 级灵敏度 −82 dBm，所需 8.99 dB。' },
    { kind: 'steps', heading: '判定一帧能否解码成功的步骤', items: [
      '查出这一帧所用速率等级的灵敏度：客厅那台笔记本使用第 3 级，标准规定为 −74 dBm。',
      '加上 90.99 dB，得到所需 SINR：16.99 dB。它与信道带宽（channel width）无关——更宽的信道只是通过抬高噪声地板（noise floor）来缩小覆盖范围。',
      '用整帧期间最差的 SINR 与它比较。这条链路的值是 21.66 dB，满足要求：记为 RX_OK，路由器回复确认帧。',
    ] },
    { kind: 'table', heading: '那 3 dB 由哪一方计入', head: [
      '这一次比较', '发送端选择速率等级时', '接收端解码时',
    ], rows: [
      ['使用的门限', '所需 SINR + 3 dB = 19.99 dB', '所需 SINR = 16.99 dB'],
      ['这条链路的值', '21.66 dB ✓', '21.66 dB ✓'],
      ['如果不满足', '降到下一级，帧变长', '整帧作废，发送端收不到应答'],
    ] },
  ],
  deeper: [
    { heading: '那张表里还包含 5 dB', text: '标准的灵敏度表除了假设 10 dB 的噪声系数，还预先扣除了 5 dB 的实现余量，用于覆盖相位噪声、信道估计误差等损伤。这 5 dB 保留在要求之内，没有减去，因为接收机的这些损伤对干扰和对噪声的作用相同。另外，本仿真器自己的 7 dB 噪声系数比标准假设的 10 dB 低 3 dB。这 3 dB 抵消的正是发送端预留的 3 dB 速率余量——注意，抵消的不是两个数字本身，而是选级的结果：本仿真器按「7 dB 噪声系数 + 3 dB 余量」选出的那一级，恰好等于一台按标准假设（10 dB 噪声系数）的接收机不留任何余量时会选择的那一级。这一点与带宽无关，20、40、80、160 MHz 都成立，因为两个 3 dB 都是比值，而 kTB 对两边同样放大。',
    },
  ],
  limits: [
    { kind: 'threshold', text: '解码是一道硬门限：达到要求就一定解码成功，低于要求就一定失败。真实接收机的误码率曲线在几个 dB 的范围内急剧下降，门限附近的结果是概率性的，而不是确定的。' },
    { kind: 'unmodelled', text: '默认没有衰落：到达电平只由几何位置和墙决定，同一个位置永远得到同一级。编辑器的「时变链路（衰落）」一节可以把它打开，打开后同一个位置会在几级之间来回变化，本课的场景没有打开。' },
    { kind: 'unmodelled', text: '“信道的一部分严重衰落、另一部分完好”在场景打开衰落、再加上 selectivity 一节之后会出现（缺少衰落这一节，schema 会拒绝），而这一课的硬门限作用在合成之后的那个值上：信道按 2.03125 MHz 一格各自独立取一次衰落值，各格的信噪比按容量折算成一个有效信噪比，再与该级的要求比较一次。所以“一部分严重衰落”并不等于“这一帧失败”——320 MHz 上最深那一格平均深 24.09 dB，整帧的有效信噪比却只降低 2.36 dB。而只有解调使用这个合成值：前导检测与捕获效应（capture effect）判定时使用的仍然是那一次平坦抽样，于是在同一帧的接收过程中，“到达电平”对应两个不同的值。本课的场景两节都没有写，整个信道带宽始终只有一个值。' },
    { kind: 'model-value', text: '全场所有电台共用一个 7 dB 噪声系数，所以“这一级解不解得出”对每台设备都是同一个答案。' },
    { kind: 'threshold', text: '聚合帧是整体成败：一个 A-MPDU 要么全部收到，要么全部丢失。真实的聚合帧逐个子帧校验，块确认（BlockAck，BA）用位图告知发送端哪几个子帧出错，只有这几个需要重传。本引擎始终按整包判定，后面讲 A-MPDU 的那一课也不会改变这一点。' },
  ],
  sources: [
    '最小输入灵敏度表：OFDM PHY 见 §17.3.10.2，HE 见 §27.3.19.4，EHT 有对应条款；每一处都写明了 10% 误包率的条件，以及其背后 10 dB 噪声系数与 5 dB 实现余量的假设。',
    '−82 dBm 的前导检测门限与 −62 dBm 的能量检测门限，出自 §17.3.10.6 的空闲信道规则，并被后来的各 PHY 原样沿用；这一对门限本身是后面「空闲判断」那一课的主题。',
    '4 dB 的前导检测比值与 3 dB 的速率余量都是本仿真器的模型取值，并非标准正文；把灵敏度表换算成所需 SINR 同样如此，真实接收机只是近似遵循。',
  ],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [
    '跳到客厅变体的第一个数据帧：它使用第 3 级，所需 16.99 dB，而这条链路的值是 21.66 dB。紧接着就是路由器的确认帧——这一帧解码成功。',
    '四个变体各运行 100 ms，没有重传（retry）、没有超时，也没有一次接收失败：四条链路都处于各自允许的最高等级，但要求之上仍保留 3 dB 速率余量。',
  ],
  tryThis: [
    '在编辑器里打开远端墙边变体，把两端的信道带宽改成 80 MHz。噪声地板升高到 −87.97 dBm，比值降到 9.89 dB——低于第 0 级含余量的 11.99 dB，却高于它不含余量的 8.99 dB 要求——因此每一帧仍然被确认。',
    '再改成 160 MHz：比值只有 6.87 dB。前导码仍能检出，接收仍会开始并持续到帧尾，但没有一帧能解码成功——每次接收都以 RX_FAIL 结束。一条链路可以被可靠地检出，却完全无法使用。',
  ],
  quiz: [
    {
      q: '远端墙边那台笔记本换到 160 MHz 后，路由器不再回复任何确认帧。为什么？',
      options: [
        '信号太弱，前导码根本没有被检出',
        '前导码能被检出，接收也已开始，但整帧的比值低于这一级的要求，因此记为 RX_FAIL',
        '噪声地板升高后，接收端会自动关闭这条链路',
      ],
      answer: 1,
      explain: '到达电平 −78.08 dBm 高于 −82 dBm，6.87 dB 也高于开始接收所需的 4 dB，接收正常开始。不满足的是第三个问题：6.87 低于 8.99 dB。',
    },
    {
      q: '发送端多留的那 3 dB，接收端解码时是否计入？',
      options: [
        '计入：接收端要求所需比值再加 3 dB',
        '不计入：接收端只用最差的比值与不含余量的要求比较，3 dB 是发送端为信号起伏预留的',
        '计入一半：所需比值加 1.5 dB',
      ],
      answer: 1,
      explain: '80 MHz 那个实验就是证据：9.89 dB 低于含余量的 11.99 dB，却高于不含余量的 8.99 dB 要求，每一帧仍被确认。余量决定发送端选择哪一级，不决定这一帧能否解码成功。',
    },
  ],
}
