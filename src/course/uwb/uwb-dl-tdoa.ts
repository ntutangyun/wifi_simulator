/**
 * UWB Tier 2 · M14 · Other ranging modes · Listen-only positioning, in the standard-first shape
 * (2026-11-10).
 *
 * ① is IEEE Std 802.15.4-2024 §10.29.1.2.5's second TDOA case and nothing else: synchronised
 * fixed nodes broadcast in turn at known transmit offsets, and the mobile device compares the
 * arrivals. ② is how the engine runs that case. 2026-11-11 (W4, audit #15): the engine now runs the
 * standard's case itself — a one-way ranging round of Figure 10-225 (the controller's RCM with ARC
 * Ranging Round Usage = 0 and an RDM IE, then one bare ranging message per synchronized anchor) — so
 * the ② rows that said "differs" (unsynchronised anchors, the TXT/RXT/COFF IEs) are gone. ③ guides
 * four runs.
 *
 * Every figure the lesson prints is read back out of its text in tests/course/uwb-dl-tdoa.test.ts
 * and compared with a run.
 */
import type { Scenario } from '../../model/scenario'
import { J, anchor, firstUwbPosition, firstUwbRcm, firstUwbResp, firstUwbTdoa, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/** Which scene the lesson runs: three listeners, three listeners with the tag clock left raw, or ten. */
export type UwbDlTdoaVariant = 'base' | 'raw' | 'ten'

/**
 * The four corner anchors, in the order the round uses them. The first is the controller: it sends
 * the RCM in slot 0, and its own ranging message in slot 1 is the reference every time difference a
 * badge computes is taken against. The RCM's RDM IE gives the four of them slots 1, 2, 3 and 4, in
 * this order.
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
 * both noise knobs at their defaults, and every badge crystal drawn rather than set.
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
  why: 'IEEE 802.15.4-2024 §10.29.1.2.5 描述了到达时间差（time difference of arrival, TDoA）定位的两种情形，本课讲第二种：多个彼此同步的固定节点按已知的发送时刻偏移依次广播，移动设备只接收；它把每两条消息的到达时刻相减、再扣除已知的发送偏移，每一对固定节点的结果把它限定在一条双曲线（hyperbola）上（三维空间中是一张双曲面），几条的交点就是它的位置。业界把这种情形称为下行形态（downlink TDoA, DL-TDoA），这个名称不出自标准。本仿真器按标准的这一情形实现：作为控制器的锚点（anchor）先发测距控制消息（RCM），声明这一轮用于单向测距并为每个锚点指定时隙；四个彼此同步的锚点随后各在自己的时隙开始时广播一条测距消息。发送偏移由时隙号与时隙长度确定，事先已知，所以没有一帧携带时间。胸牌唯一要处理的是自己晶振（crystal）的偏差：它用接收机测得的时钟偏差（clock offset）修正，业界称为时钟修正（clock correction）；修正后，时间差误差为几十厘米；关闭修正，晶振偏差最大的 badge-2 七个块里一次也定不了位，另外两个胸牌偏离 2 到 4 m。房间里有三个还是十个胸牌，锚点发送的帧完全相同：移动设备只接收、不发送。',
  outcomes: [
    '说出标准描述的到达时间差第二种情形：谁发送、谁接收、位置由什么确定',
    '说出本仿真器用哪些标准的帧与信息单元组成这一轮，哪些做法是本仿真器的取法',
    '从日志里读出一个时间差和由它解出的位置，并解释胸牌的晶振为什么必须修正',
  ],
  needs: ['uwb-geometry'],
  terms: [
    { term: 'TDoA', plain: '到达时间差：依据信号到达时刻的先后来定位，而不是依据设备之间的距离' },
    { term: 'DL-TDoA', plain: '下行形态：发送全部由固定节点承担，被定位的一方只接收。这是业界的名称，标准 §10.29.1.2.5 只把它描述为到达时间差的第二种情形' },
    { term: 'hyperbola', plain: '一条曲线，线上每一点到一个锚点的距离都比到另一个锚点远出相同的量' },
    { term: 'clock correction', plain: '先消除接收端自身时钟的速率偏差，再使用它测得的间隔。业界与本仿真器的叫法，不是标准术语' },
  ],
  standard: [
    { heading: '单向测距用于到达时间差（§10.29.1.1，§10.29.1.2.1）', text: '标准支持的定位方法有三种：单边双向测距（single-sided two-way ranging, SS-TWR）、双边双向测距（double-sided two-way ranging, DS-TWR），以及用于到达时间差定位的单向测距（one-way ranging, OWR）。所有时间都以 RMARKER（ranging marker）为准：对超宽带（ultra-wideband, UWB）物理层（physical layer, PHY），它是帧起始定界符（start-of-frame delimiter, SFD）之后第一个码片（chip）对应的峰值脉冲位置。接收端可以根据报告的接收计数值估计发送端与本机之间的相对时钟偏差。' },
    { heading: '到达时间差的两种情形（§10.29.1.2.5）', text: '到达时间差依据一条或多条消息的相对到达时刻定位移动设备，使用单向测距。第一种情形：移动设备周期性地广播一条消息，通常称为闪发（blink），多个以某种方式同步的固定节点接收并比较到达时刻。第二种情形：多个同步的节点按彼此已知的发送时刻偏移依次广播消息，移动设备接收。对任意一对同步的固定节点，到达时间差都把移动设备限定在一张双曲面上；多对的结果相交，就得到它的位置。第二种情形计算到达时间差时要计入已知的发送偏移。' },
    { heading: '固定节点怎样同步（§10.29.1.2.5）', text: '标准说固定节点的同步可以通过有线分发时钟信号实现，无线同步方案同样可行：固定节点之间互发超宽带消息，借助已知或预先测得的飞行时间，算出彼此的相对频率偏差与漂移。标准没有规定移动设备怎样处理自己晶振的偏差，也没有规定由谁解算位置。' },
    { heading: '在测距控制中声明单向测距（§10.32.2，表 10-164，图 10-225）', text: '测距轮（ranging round）里可以按 §10.29.1.2.5 使用单向测距。ARC 信息单元的 Ranging Round Usage 字段取 0 时，这一测距轮用于单向测距。图 10-225 画出单向测距轮的消息顺序：控制器在第 0 号时隙发测距控制消息（ranging control message, RCM），随后各应答方依次发出测距消息，最后可以有控制器的测量报告。按时间调度时，时隙可以由 RDM 信息单元分配（§10.32.9.8）。' },
    { kind: 'steps', heading: '第二种情形，按标准：逐步说明', items: [
      '固定节点彼此同步：有线分发时钟，或用无线方案估计彼此的频率偏差与漂移（§10.29.1.2.5）。',
      '控制器发出测距控制消息，Ranging Round Usage 为 0，为各固定节点分配时隙（§10.32.2，§10.32.9.8）。',
      '固定节点按彼此已知的发送时刻偏移，依次广播消息。',
      '移动设备接收每一条消息，记录它的 RMARKER 到达时刻（§10.29.1.1）。',
      '对每一对固定节点，把两条消息的到达时刻相减，再扣除这一对的已知发送偏移。',
      '每个结果把移动设备限定在一张以这两个节点为焦点的双曲面上；多张双曲面的交点就是它的位置。由谁、用什么算法求交点，标准不规定。',
    ] },
  ],
  implementation: [
    { topic: '测距控制消息', standard: 'ARC 信息单元的 Ranging Round Usage 为 0 表示单向测距（表 10-164）；时隙可以由 RDM 信息单元分配（§10.32.9.8）', sim: 'anchor-1 作为控制器在第 0 号时隙发 RCM：ARC 信息单元的 Ranging Round Usage 为 0、Multi-node Mode 为 1、Schedule Mode 为 1；RDM 信息单元为 anchor-1 到 anchor-4 依次指定第 1 到 4 号时隙，角色为应答方；另带 RR 信息单元。没有收到 RCM 的设备不知道时隙，锚点不发送，胸牌不测量。', kind: 'faithful' },
    { topic: '固定节点是否同步', standard: '第二种情形的固定节点彼此同步（§10.29.1.2.5）', sim: '四个锚点彼此同步，按同一时基的时隙边界发送。', kind: 'faithful' },
    { topic: '同步的方式与精度', standard: '标准未规定，有线与无线方案都可以（§10.29.1.2.5）', sim: '本仿真器假定完全同步：锚点时钟与公共时基（common time base）之间没有频率偏差，以百万分之几（parts per million, ppm）计为 0 ppm；发送时刻就是真实的时隙边界，没有残余误差。', kind: 'choice' },
    { topic: '发送时刻偏移', standard: '按彼此已知的发送时刻偏移依次广播（§10.29.1.2.5）', sim: '锚点在 RDM 指定的时隙开始时发送，相邻两条相隔一个时隙。胸牌从 RCM 的 RDM 信息单元读出时隙号，乘以时隙长度得到已知的发送偏移。时隙长度不在 RCM 里（ARC 的 Content Control 为 0），由会话事先约定。', kind: 'faithful' },
    { topic: '帧里的时间', standard: '发送偏移已知，消息无需携带发送时刻（§10.29.1.2.5）', sim: '没有一帧携带时间：RCM 只带 ARC、RR、RDM 三个信息单元，测距消息不带信息单元。', kind: 'faithful' },
    { topic: '测距消息的内容', standard: '标准未规定', sim: '每条测距消息是不带信息单元的数据帧（data frame）：帧头（MAC header）9 字节加帧校验 2 字节，共 11 字节，广播发送。', kind: 'choice' },
    { topic: '测量报告阶段', standard: '图 10-225 的单向测距轮最后可以有控制器的测量报告', sim: '未实现：本仿真器的单向测距轮在最后一条测距消息之后结束。标准也没有规定单向测距时报告什么。', kind: 'absent' },
    { topic: '移动设备的时钟', standard: '标准未规定移动设备怎样处理自己晶振的偏差；接收端可以估计发送端与本机的相对时钟偏差（§10.29.1.1）', sim: '胸牌取接收机在 anchor-1 的测距消息上测得的时钟偏差（真实差值加 0.2 ppm 的白噪声），换算出自己晶振的速率，用它校正到达时刻之差。锚点彼此同步，所以对任何一个锚点测得的偏差都是胸牌自己相对公共时基的偏差。', kind: 'choice' },
    { topic: '晶振容差', standard: 'HRP 超宽带物理层的发射中心频率容差为 ±20 ppm（§16.4.9）', sim: '胸牌的晶振在 ±20 ppm 内均匀随机取值，本场景的三个胸牌为 1.96、17.65 与 4.08 ppm。', kind: 'value' },
    { topic: '接收时间戳', standard: '以 RMARKER 为准，精度标准未给出（§10.29.1.1）', sim: '每个接收时间戳带 100 ps 的 1σ 噪声。', kind: 'value' },
    { topic: '求交点', standard: '标准未规定算法', sim: '胸牌自己解算，以 anchor-1 为基准：把高度当作已知，在这一高度的平面上求三条双曲线的交点；求不出交点就不输出位置，求解前不检查时间差是否超出两个锚点的间距。', kind: 'choice' },
    { topic: '时隙与块', standard: '取值由实现决定', sim: '每个时隙 2 ms，一轮五个时隙（RCM 加四条测距消息），每个 200 ms 的块一轮。', kind: 'value' },
  ],
  labs: [
    {
      heading: '锚点自行完成的一轮',
      jump: 0,
      steps: [
        '载入本课场景，跳到 anchor-1 的 RCM。',
        '依次查看这一轮的五帧，在检视面板里打开每一帧的信息单元。',
      ],
      blocks: [
        { kind: 'table', heading: '一轮五帧，每块一次', head: ['时隙', '发送者', '帧', '长度与空口时间', '信息单元'], rows: [
          ['0', 'anchor-1', 'RCM', '39 B, 208.7 µs', 'ARC、RR、RDM'],
          ['1–4', 'anchor-1/2/3/4', '测距消息', '11 B, 179.9 µs', '无'],
        ] },
      ],
      expect: '七个块共 35 次发送，全部来自锚点，胸牌一次也没有发送；RCM 里 ARC 的 Ranging Round Usage 为 0，RDM 为 anchor-1 到 anchor-4 依次指定第 1 到 4 号时隙。',
      meaning: '「只有固定节点发送」「测距轮用途为单向测距」「RCM 之后各节点依次发送」都是标准的（①）；测距消息不带信息单元是本仿真器的取法，标准没有规定它的内容（②）。',
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
          ['anchor-2 − anchor-1', '4.94 ns', '5.39 ns'],
          ['anchor-3 − anchor-1', '1.61 ns', '2.29 ns'],
          ['anchor-4 − anchor-1', '5.68 ns', '7.15 ns'],
          ['位置', '(4.10, 3.68) m', '(4.00, 3.50) m'],
        ] },
      ],
      expect: '三个时间差与一次定位在第 10 ms 同时出现，定位误差为 0.21 m；检视面板里没有任何距离。',
      meaning: '每个时间差是两条消息的到达时刻之差扣除已知的发送偏移，对应一条以两个锚点为焦点的双曲线，交点就是位置（①）；把高度当作已知、在胸牌上求交点是本仿真器的取法（②）。',
    },
    {
      heading: '关闭时钟修正',
      variant: 0,
      steps: [
        '载入「关闭时钟修正」，运行七个块。',
        '对照下表读出 badge-2 未修正的偏差，以及修正后 21 次定位所用的 63 个时间差中各锚点的最大误差。',
      ],
      blocks: [
        { kind: 'table', heading: '胸牌的晶振带来的偏差', head: ['锚点', '距 anchor-1 的发送偏移', '未修正，badge-2 的平均偏差', '修正后，21 次中最大误差'], rows: [
          ['anchor-2', '2 ms', '10.58 m', '0.32 m'],
          ['anchor-3', '4 ms', '21.16 m', '0.62 m'],
          ['anchor-4', '6 ms', '31.73 m', '0.92 m'],
        ] },
      ],
      expect: '关闭修正后仍有 63 个时间差，定位只有 14 次，全部来自晶振偏差较小的 badge-1 与 badge-3，误差 1.96 到 3.91 m；badge-2 一次也定不了位。偏差约等于 badge-2 晶振的偏差 17.65 ppm 乘以发送偏移。修正后发送偏移最大的 anchor-4 误差最大。',
      meaning: '胸牌相减的两个到达时刻相隔几毫秒，它自身晶振的偏差会进入结果；标准没有规定怎样处理（①）。本仿真器用接收机测得的时钟偏差修正，剩下的误差随发送偏移增大（②）。',
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
          ['本课场景', '35', '6.498 786 ms', '63', '21'],
          ['十个胸牌', '35', '6.498 786 ms', '210', '70'],
        ] },
      ],
      expect: '两个场景中锚点发送的帧数与空口时间（airtime）完全相同；定位从 21 次增加到 70 次，每个胸牌每块一次。',
      meaning: '移动设备只接收、不发送，这是标准第二种情形本身的性质（①），不依赖本仿真器的帧内容。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.1（三种定位方法，RMARKER 的定义，接收端估计相对时钟偏差）、§10.29.1.2.5（到达时间差的两种情形，固定节点的有线与无线同步）、§10.32.2 与图 10-225（测距轮中的单向测距，单向测距轮的消息顺序）、表 10-164（ARC 信息单元的 Ranging Round Usage 为 0 时表示单向测距）、§10.32.9.8（RDM 信息单元分配时隙）、§16.4.9（±20 ppm 的发射中心频率容差）。「下行形态」「时钟修正」都不是标准的术语。',
    '本仿真器的做法与取值：锚点完全同步的假设；不带信息单元、11 字节的测距消息；没有测量报告阶段；胸牌用测得的时钟偏差修正自己的晶振；2 ms 的时隙、每块一轮；100 ps 的时间戳噪声与 0.2 ppm 的时钟偏差剩余误差；在已知高度上求交点的解算方法。',
  ],
  limits: [],
  scenario: () => uwbDlTdoaScenario('base'),
  variants: [
    { label: '关闭时钟修正', scenario: () => uwbDlTdoaScenario('raw') },
    { label: '十个胸牌', scenario: () => uwbDlTdoaScenario('ten') },
  ],
  jumps: [
    J('anchor-1 的 RCM 开启这一轮', firstUwbRcm),
    J('anchor-1 的测距消息，时间差的基准', firstUwbResp),
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
      q: '本课的测距消息里为什么不需要发送时刻？',
      options: [
        '锚点彼此同步，并在 RCM 指定的时隙开始时发送，发送偏移事先已知',
        '胸牌自己测量每个锚点的发送时刻',
        '标准规定测距消息里不能带信息单元',
      ],
      answer: 0,
      explain: '第二种情形的发送偏移是已知的（§10.29.1.2.5）；本仿真器的偏移由 RDM 信息单元给出的时隙号乘以时隙长度得到。测距消息的内容标准没有规定。',
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
