/**
 * UWB Tier 2 · M14 · Other ranging modes · Listen-only positioning, in the standard-first shape
 * (2026-11-10).
 *
 * ① is IEEE Std 802.15.4-2024 §10.29.1.2.5's second TDOA case and nothing else: synchronised
 * fixed nodes broadcast in turn at known transmit offsets, and the mobile device compares the
 * arrivals. ② says plainly that the engine does not run that case: it runs a FiRa-style round
 * between unsynchronised anchors, whose frames carry TXT, RXT and COFF IEs that the standard does
 * not define (audit #15, scheduled for W4). ③ guides four runs.
 *
 * Every figure the lesson prints is read back out of its text in tests/course/uwb-dl-tdoa.test.ts
 * and compared with a run.
 */
import type { Scenario } from '../../model/scenario'
import { J, anchor, firstUwbFinal, firstUwbPoll, firstUwbPosition, firstUwbTdoa, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/** Which scene the lesson runs: three listeners, three listeners with the tag clock left raw, or ten. */
export type UwbDlTdoaVariant = 'base' | 'raw' | 'ten'

/**
 * The four corner anchors, in the order the round uses them. The first is the
 * reference: it sends the Poll in slot 0 and the Final in the last slot, and
 * every time difference a badge computes is taken against its Poll. The other
 * three answer in slots 1, 2 and 3, in this order.
 *
 * The corners and the heights are `uwb-position`'s.
 */
export const DL_ANCHORS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5 },
  { id: 'anchor-2', name: 'Anchor 2', x: 9.5, y: 0.5 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.5, y: 7.5 },
  { id: 'anchor-4', name: 'Anchor 4', x: 9.5, y: 7.5 },
]
/** Anchors on the ceiling, badges at chest height — `uwb-position`'s two planes. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0

/**
 * Where the listeners stand. The first three are the base scene; all ten are the
 * "ten badges" one, which changes nothing else — the round does not know they are
 * there.
 */
export const TAG_SPOTS: { x: number; y: number }[] = [
  { x: 4, y: 3.5 }, { x: 7, y: 6 }, { x: 2, y: 6.5 },
  { x: 5, y: 1 }, { x: 8.5, y: 3 }, { x: 1.5, y: 2.5 }, { x: 6, y: 4.5 },
  { x: 3, y: 1.5 }, { x: 9, y: 7 }, { x: 5.5, y: 7 },
]

/** How many badges each scene puts in the room. */
export const TAG_COUNT: Record<UwbDlTdoaVariant, number> = { base: 3, raw: 3, ten: 10 }

/**
 * `uwb-position`'s four corner anchors and three (or ten) badges that never
 * transmit, on a DL-TDoA session with everything else at its default: NLOS on,
 * both noise knobs at their defaults, and every crystal drawn rather than set.
 *
 * 'raw' clears `tdoaClockCorrection` and changes nothing else. 'ten' adds seven
 * more listeners and changes nothing at all about the round.
 */
export function uwbDlTdoaScenario(variant: UwbDlTdoaVariant = 'base'): Scenario {
  const tags = TAG_SPOTS.slice(0, TAG_COUNT[variant])
  return uwbSc(
    oneRoom(),
    [
      ...DL_ANCHORS.map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z)),
      ...tags.map((p, i) => uwbTag(`badge-${i + 1}`, `Badge ${i + 1}`, p.x, p.y, TAG_Z)),
    ],
    { mode: 'dl-tdoa', nlos: true, ...(variant === 'raw' ? { tdoaClockCorrection: false } : {}) },
  )
}

export const uwbDlTdoa: Lesson = {
  id: 'uwb-dl-tdoa',
  module: 25,
  title: '只接收不发送的定位',
  why: 'IEEE 802.15.4-2024 §10.29.1.2.5 描述了到达时间差（time difference of arrival, TDoA）定位的两种情形，本课讲第二种：多个彼此同步的固定节点按已知的发送时刻偏移依次广播，移动设备只接收；它把每两条消息的到达时刻相减、再扣除已知的发送偏移，每一对固定节点的结果把它限定在一条双曲线（hyperbola）上（三维空间中是一张双曲面），几条的交点就是它的位置。业界把这种情形称为下行形态（downlink TDoA, DL-TDoA），这个名称不出自标准。标准只作了这样的概括描述：固定节点怎样同步、消息里带什么、移动设备怎样处理自己的晶振（crystal）、由谁解算位置，都没有规定。本仿真器实现的不是标准的这一情形，而是 FiRa 风格的另一种方案：锚点（anchor）彼此不同步，参考锚点（reference anchor）发起一轮、其余锚点依次应答、参考锚点结束这一轮，每一帧带着发送方自己的发送时刻、它记录的接收时刻和时钟偏差（clock offset），胸牌据此做时钟修正（clock correction）。这些帧用到的 TXT、RXT、COFF 三个信息单元在标准里都不存在，是待改正的偏差。按本仿真器取的噪声值，修正后的时间差误差为几十厘米；关闭修正，七个块里一次定位也解不出来。房间里有三个还是十个胸牌，锚点发送的帧完全相同——这一点来自标准描述的情形本身：移动设备只接收、不发送。',
  outcomes: [
    '说出标准描述的到达时间差第二种情形：谁发送、谁接收、位置由什么确定',
    '分清本仿真器的哪些做法是标准的，哪些是标准里没有、待改正的',
    '从日志里读出一个时间差和由它解出的位置，并解释胸牌的晶振为什么必须修正',
  ],
  needs: ['uwb-geometry'],
  terms: [
    { term: 'TDoA', plain: '到达时间差：依据信号到达时刻的先后来定位，而不是依据设备之间的距离' },
    { term: 'DL-TDoA', plain: '下行形态：发送全部由固定节点承担，被定位的一方只接收。这是业界的名称，标准 §10.29.1.2.5 只把它描述为到达时间差的第二种情形' },
    { term: 'hyperbola', plain: '一条曲线，线上每一点到一个锚点的距离都比到另一个锚点远出相同的量' },
    { term: 'clock correction', plain: '先消除接收端自身时钟的速率偏差，再使用它测得的间隔。本仿真器的做法，依赖标准里没有的 TXT 信息单元' },
  ],
  standard: [
    { heading: '单向测距用于到达时间差（§10.29.1.1，§10.29.1.2.1）', text: '标准支持的定位方法有三种：单边双向测距（single-sided two-way ranging, SS-TWR）、双边双向测距（double-sided two-way ranging, DS-TWR），以及用于到达时间差定位的单向测距（one-way ranging, OWR）。所有时间都以 RMARKER（ranging marker）为准：对超宽带（ultra-wideband, UWB）物理层（physical layer, PHY），它是帧起始定界符（start-of-frame delimiter, SFD）之后第一个码片（chip）对应的峰值脉冲位置。' },
    { heading: '到达时间差的两种情形（§10.29.1.2.5）', text: '到达时间差依据一条或多条消息的相对到达时刻定位移动设备，使用单向测距。第一种情形：移动设备周期性地广播一条消息，通常称为闪发（blink），多个以某种方式同步的固定节点接收并比较到达时刻。第二种情形：多个同步的节点按彼此已知的发送时刻偏移依次广播消息，移动设备接收。对任意一对同步的固定节点，到达时间差都把移动设备限定在一张双曲面上；多对的结果相交，就得到它的位置。第二种情形计算到达时间差时要计入已知的发送偏移。' },
    { heading: '固定节点怎样同步（§10.29.1.2.5）', text: '标准说固定节点的同步可以通过有线分发时钟信号实现，无线同步方案同样可行：固定节点之间互发超宽带消息，借助已知或预先测得的飞行时间，算出彼此的相对频率偏差与漂移。标准没有规定移动设备怎样处理自己晶振的偏差，也没有规定消息的内容和由谁解算位置。' },
    { heading: '在测距控制中声明单向测距（§10.32.2，表 10-164）', text: 'ARC 信息单元的 Ranging Round Usage 字段取 0 时，这一测距轮（ranging round）用于单向测距；§10.32.2 说测距轮里可以按 §10.29.1.2.5 使用单向测距。' },
    { kind: 'steps', heading: '第二种情形，按标准：逐步说明', items: [
      '固定节点彼此同步：有线分发时钟，或用无线方案估计彼此的频率偏差与漂移（§10.29.1.2.5）。',
      '固定节点按彼此已知的发送时刻偏移，依次广播消息。',
      '移动设备接收每一条消息，记录它的 RMARKER 到达时刻（§10.29.1.1）。',
      '对每一对固定节点，把两条消息的到达时刻相减，再扣除这一对的已知发送偏移。',
      '每个结果把移动设备限定在一张以这两个节点为焦点的双曲面上；多张双曲面的交点就是它的位置。由谁、用什么算法求交点，标准不规定。',
    ] },
  ],
  implementation: [
    { topic: '测距轮用途', standard: 'ARC 信息单元的 Ranging Round Usage 为 0 表示单向测距（表 10-164）', sim: '参考锚点 anchor-1 的 Poll 带 ARC 信息单元，Ranging Round Usage 为 0，Multi-node Mode 为 1（一对多）；Poll 还带 RDM 信息单元，为 anchor-2、anchor-3、anchor-4 依次指定第 1、2、3 号时隙。', kind: 'faithful' },
    { topic: '固定节点是否同步', standard: '第二种情形的固定节点彼此同步（§10.29.1.2.5）', sim: '四个锚点彼此不同步，各自晶振的偏差以百万分之几（parts per million, ppm）计，在 ±20 ppm 内随机取值。这是 FiRa 风格的方案，不是标准描述的情形。', kind: 'differs' },
    { topic: '发送时刻偏移', standard: '按彼此已知的发送时刻偏移依次广播（§10.29.1.2.5）', sim: '发送时刻不是事先已知的：anchor-1 在第 0 号时隙发 Poll，其余三个锚点收到 Poll 后在各自的时隙里发 Response，anchor-1 在第 4 号时隙发 Final；每个锚点把自己实际的发送时刻写进帧里。', kind: 'differs' },
    { topic: 'TXT 与 RXT 信息单元', standard: '标准里没有这两个信息单元', sim: '本仿真器目前用了标准里没有的 TXT（发送方自己的发送时刻）与 RXT（它记录的接收时刻）信息单元，这是待改正的偏差。', kind: 'differs' },
    { topic: 'COFF 信息单元', standard: '标准里没有这个信息单元', sim: '本仿真器目前让每个应答锚点用标准里没有的 COFF 信息单元报告它相对 anchor-1 的时钟偏差，这是待改正的偏差；这个值取两个晶振的真实差值加 0.2 ppm 的白噪声。', kind: 'differs' },
    { topic: '移动设备的时钟', standard: '标准未规定', sim: '胸牌用自己测得的 Poll 到 Final 的跨度，除以 anchor-1 在 TXT 里报告的同一段跨度，得到时钟修正的比值。这个做法依赖上面的 TXT 信息单元，同属待改正的偏差。', kind: 'differs' },
    { topic: '晶振容差', standard: 'HRP 超宽带物理层的发射中心频率容差为 ±20 ppm（§16.4.9）', sim: '每个节点的晶振在 ±20 ppm 内均匀随机取值；本场景中 anchor-1 为 −19.04 ppm，三个胸牌为 1.96、17.65 与 4.08 ppm。', kind: 'value' },
    { topic: '接收时间戳', standard: '以 RMARKER 为准，精度标准未给出（§10.29.1.1）', sim: '每个接收时间戳带 100 ps 的 1σ 噪声。', kind: 'value' },
    { topic: '求交点', standard: '标准未规定算法', sim: '胸牌自己解算：把高度当作已知，在这一高度的平面上求三条双曲线的交点；求不出交点就不输出位置，求解前不检查时间差是否超出两个锚点的间距。', kind: 'choice' },
    { topic: '时隙与块', standard: '取值由实现决定', sim: '每个时隙 2 ms，五个时隙组成一轮，每个 200 ms 的块一轮。', kind: 'value' },
  ],
  labs: [
    {
      heading: '锚点自行发起的一轮',
      jump: 0,
      steps: [
        '载入本课场景，跳到 anchor-1 的 Poll。',
        '依次查看这一轮的五帧，在检视面板里打开每一帧的信息单元。',
      ],
      blocks: [
        { kind: 'table', heading: '一轮五帧，每块一次', head: ['时隙', '发送者', '帧', '长度与空口时间', '信息单元'], rows: [
          ['0', 'anchor-1', 'Poll', '45 B, 221.0 µs', 'ARC、RR、RDM、RRMC、TXT'],
          ['1–3', 'anchor-2/3/4', 'Response', '30 B, 199.4 µs', 'RRMC、TXT、RXT、COFF'],
          ['4', 'anchor-1', 'Final', '34 B, 203.5 µs', 'RRMC、TXT、RXT'],
        ] },
      ],
      expect: '七个块共 35 次发送，全部来自锚点，胸牌一次也没有发送；Poll 里 ARC 的 Ranging Round Usage 为 0。',
      meaning: '「只有固定节点发送」与「测距轮用途为单向测距」是标准的（①）；TXT、RXT、COFF 三个信息单元是标准里没有的，属于待改正的偏差（②）。',
    },
    {
      heading: '第一个时间差和由它解出的位置',
      jump: 2,
      steps: [
        '跳到第一个时间差，读出 badge-1 在第 0 块里的三个时间差和旁边的真值。',
        '再往下一行，读出由它们解出的位置。',
      ],
      blocks: [
        { kind: 'table', heading: 'badge-1，第 0 块', head: ['项目', '测得', '真值'], rows: [
          ['anchor-2 − anchor-1', '5.66 ns', '5.39 ns'],
          ['anchor-3 − anchor-1', '1.12 ns', '2.29 ns'],
          ['anchor-4 − anchor-1', '6.85 ns', '7.15 ns'],
          ['位置', '(3.90, 3.74) m', '(4.00, 3.50) m'],
        ] },
      ],
      expect: '三个时间差与一次定位在第 10 ms 同时出现，定位误差为 0.26 m；检视面板里没有任何距离。',
      meaning: '每个时间差对应一条以两个锚点为焦点的双曲线，交点就是位置（①）；把高度当作已知、在胸牌上求交点是本仿真器的取法（②）。',
    },
    {
      heading: '关闭时钟修正',
      variant: 0,
      steps: [
        '载入「关闭时钟修正」，运行七个块。',
        '对照下表读出 badge-2 未修正的偏差，以及修正后 21 次中的最大误差。',
      ],
      blocks: [
        { kind: 'table', heading: '胸牌的晶振带来的偏差', head: ['应答锚点', '距 Poll', '未修正，badge-2 的平均偏差', '修正后，21 次中最大误差'], rows: [
          ['anchor-2', '2 ms', '22.02 m', '0.19 m'],
          ['anchor-3', '4 ms', '44.04 m', '0.44 m'],
          ['anchor-4', '6 ms', '65.81 m', '0.51 m'],
        ] },
      ],
      expect: '关闭修正后有 63 个时间差、0 次定位；偏差约等于 badge-2 与 anchor-1 的晶振之差 36.69 ppm 乘以距 Poll 的时间。修正后最后应答的 anchor-4 误差最大。',
      meaning: '胸牌相减的两个到达时刻相隔几毫秒，它自身晶振的偏差会进入结果；标准没有规定怎样处理（①）。本仿真器的修正依赖标准里没有的 TXT 信息单元（②）。',
    },
    {
      heading: '三个胸牌与十个胸牌',
      variant: 1,
      steps: [
        '载入「十个胸牌」，运行七个块，与本课场景对照。',
        '数一数锚点发送的帧和得到的定位次数。',
      ],
      blocks: [
        { kind: 'table', heading: '七个块，两个场景', head: ['场景', '锚点发送的帧', '空口时间', '时间差', '定位'], rows: [
          ['本课场景', '35', '7.159 299 ms', '63', '21'],
          ['十个胸牌', '35', '7.159 299 ms', '210', '70'],
        ] },
      ],
      expect: '两个场景中锚点发送的帧数与空口时间（airtime）完全相同；定位从 21 次增加到 70 次，每个胸牌每块一次。',
      meaning: '移动设备只接收、不发送，这是标准第二种情形本身的性质（①），不依赖本仿真器的帧内容。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.1（三种定位方法，RMARKER 的定义）、§10.29.1.2.5（到达时间差的两种情形，固定节点的有线与无线同步）、§10.32.2 与表 10-164（ARC 信息单元的 Ranging Round Usage 为 0 时表示单向测距）、§16.4.9（±20 ppm 的发射中心频率容差）。「下行形态」「参考锚点」「时钟修正」都不是标准的术语。',
    '本仿真器的做法与取值：锚点不同步的 FiRa 风格方案，以及它用到的 TXT、RXT、COFF 三个标准里没有的信息单元（待改正）；2 ms 的时隙、每块一轮；100 ps 的时间戳噪声与 0.2 ppm 的时钟偏差剩余误差；在已知高度上求交点的解算方法。',
  ],
  limits: [],
  scenario: () => uwbDlTdoaScenario('base'),
  variants: [
    { label: '关闭时钟修正', scenario: () => uwbDlTdoaScenario('raw') },
    { label: '十个胸牌', scenario: () => uwbDlTdoaScenario('ten') },
  ],
  jumps: [
    J('anchor-1 的 Poll 开启这一轮', firstUwbPoll),
    J('结束这一轮的 Final 帧', firstUwbFinal),
    J('第一个时间差', firstUwbTdoa),
    J('由它解出的定位', firstUwbPosition),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '按标准，到达时间差的第二种情形里，谁发送、谁接收？',
      options: [
        '移动设备广播闪发，同步的固定节点接收',
        '同步的固定节点按已知的发送时刻偏移依次广播，移动设备接收',
        '移动设备与每个固定节点各做一次双向测距',
      ],
      answer: 1,
      explain: '§10.29.1.2.5：第一种情形由移动设备广播，第二种情形由同步的固定节点依次广播，计算时计入已知的发送偏移。',
    },
    {
      q: '下面哪一项是本仿真器的做法，而且标准里没有？',
      options: [
        'Poll 里 ARC 信息单元的 Ranging Round Usage 为 0',
        '每个应答锚点用 COFF 信息单元报告它相对参考锚点的时钟偏差',
        '到达时间差把移动设备限定在一张双曲面上',
      ],
      answer: 1,
      explain: 'COFF 与 TXT、RXT 一样，是标准里没有定义的信息单元，属于待改正的偏差；另外两项都出自标准。',
    },
    {
      q: '胸牌从三个增加到十个，锚点发送的帧却完全不变。原因是什么？',
      options: [
        '胸牌只接收、不发送，这一轮的每一帧都是广播',
        '本仿真器在十个胸牌时缩短了时隙',
        '十个胸牌共用同一个时钟修正比值',
      ],
      answer: 0,
      explain: '这是标准第二种情形本身的性质：移动设备只接收，所以接收端的数量不影响固定节点发送什么。',
    },
  ],
}
