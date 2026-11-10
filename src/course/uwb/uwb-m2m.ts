/**
 * UWB Tier 2 · M18 多对多测距, in the standard-first shape (2026-11-10).
 *
 * ① teaches IEEE Std 802.15.4-2024 §10.32.6 (SS) and §10.32.7 (DS): the controller's RCM gives
 * every device one role, initiators send ranging initiation messages, each responder answers with
 * one RRTI IE per initiator, and M + N frames give M × N distances (DS adds a final frame per
 * initiator and the responder computes).
 *
 * ② says plainly that this engine does not do that yet (audit #2, workstream W3): its
 * many-to-many round has no control message, every device is both initiator and responder, each
 * sends once in id order, and the frames carry two information elements the standard does not
 * define (TXT, RXT). The arrangement's own arithmetic — N slots for N(N−1)/2 pairs, only the
 * earlier device of a pair computes, the last frame sets the participant cap — is taught in ③ as
 * what this simulator does, never as the standard.
 *
 * Every figure the labs print is read back out of the lesson text and compared with a run in
 * tests/course/uwb-m2m.test.ts.
 */
import type { Scenario, UwbSessionCfg, Wall } from '../../model/scenario'
import { J, brick, firstUwbM2m, firstUwbRange, uwbSc, uwbTag, type Lesson } from '../lessonKit'
import { roundPlan } from '../../uwb/session'

/** Participants of the base round — the N of every number below. */
export const PARTICIPANTS = 6
/** Participants of the walled round: the first four of the same six places. */
export const WALLED_PARTICIPANTS = 4

/**
 * Where the six devices stand, in metres. No two pairwise distances are alike —
 * 5.385 m to 14.318 m — so a round that answered one number for every pair could
 * not be mistaken for one that measured fifteen.
 */
export const PLACES: readonly { x: number; y: number }[] = [
  { x: 1, y: 1 }, { x: 7, y: 2 }, { x: 3, y: 6 }, { x: 11, y: 9 }, { x: 5, y: 13 }, { x: 15, y: 4 },
]

/** One crystal offset per participant, in ppm: distinct, and spread over most of the ±20 ppm the
 * standard allows (§16.4.9). They are what makes the SS column of the accuracy table what it is. */
export const PPM: readonly number[] = [0, 18, -14, 9, -20, 5]

/** Participant i's id. Ids decide the slot order (`session.ts#m2mParticipants` sorts them), so
 * `p-0`…`p-5` is also the order the round transmits in, and `PLACES[i]` is where participant i is. */
export const idOf = (i: number): string => `p-${i}`

/** The hall: 20 × 16 m inside one brick shell, which no path between two participants crosses. */
function m2mHall(): { rooms: { x: number; y: number; w: number; h: number; name: string }[]; walls: Wall[] } {
  return {
    rooms: [{ x: 0, y: 0, w: 20, h: 16, name: 'Hall' }],
    walls: [brick(0, 0, 20, 0), brick(20, 0, 20, 16), brick(20, 16, 0, 16), brick(0, 16, 0, 0)],
  }
}

/**
 * Three brick partitions across every way out of the corner participant 0 stands
 * in: 36 dB of loss where the link has 28.5 dB of headroom, so nothing of
 * participant 0 is heard and it hears nothing. They cross no other pair's path —
 * every other participant is out at x + y ≥ 9 and these segments only reach
 * x + y = 3.4 — so what the walled round loses is exactly what one unheard
 * participant costs, and nothing else.
 */
function closet(): Wall[] {
  return [0, 0.2, 0.4].map((d) => ({
    x1: 0, y1: 3 + d, x2: 3 + d, y2: 0, material: 'brick' as const, openings: [],
  }))
}

/**
 * The lesson's scene: `n` UWB devices in the hall, all ranging to each other.
 *
 * `role` is `tag` on every one of them, and it means nothing here — in this mode
 * every UWB node is a participant and the role only decides how the editor and
 * the 3-D scene draw it. The session runs with no excess delay and no timestamp
 * noise, so the only error term left is the residual on each receiver's own
 * carrier-offset estimate, which the session default (`cfoNoisePpm`) leaves on.
 */
export function uwbM2mScenario(
  method: 'ss' | 'ds' = 'ss', n: number = PARTICIPANTS, walled = false,
): Scenario {
  const hall = m2mHall()
  const house = walled ? { rooms: hall.rooms, walls: [...hall.walls, ...closet()] } : hall
  return uwbSc(
    house,
    Array.from({ length: n }, (_, i) => uwbTag(idOf(i), `P${i}`, PLACES[i].x, PLACES[i].y, 1, PPM[i])),
    { mode: 'm2m', method, nlos: false, tsNoisePs: 0 },
  )
}

/** The session the scene runs, read back off the scenario rather than restated. */
const SESSION: UwbSessionCfg = uwbM2mScenario().uwb!

/** The N the comparison table is read at. */
export const TABLE_NS = [3, 4, 6] as const

/** Slots one many-to-many round's exchange of `n` participants takes, from the round planner itself
 * (`rangingSlots`: since 2026-11-11 the round is stretched to a whole divisor of the block, §10.32.2). */
export const m2mSlots = (n: number, method: 'ss' | 'ds'): number =>
  roundPlan({ ...SESSION, method }, n).rangingSlots

/**
 * Slots the arrangement the comparison is against takes: `n` one-to-many rounds, one per device
 * taking its turn as the tag, each of them a round of `n − 1` anchors.
 */
export const takingTurnsSlots = (n: number): number =>
  n * roundPlan({ ...SESSION, mode: 'twr', method: 'ss', replyTime: 'embedded' }, n - 1).rangingSlots

/** Pairs in a group of `n`. */
export const pairsOf = (n: number): number => (n * (n - 1)) / 2

export const uwbM2m: Lesson = {
  id: 'uwb-m2m',
  module: 20,
  title: '多对多测距：M + N 帧测出 M × N 个距离',
  why: 'IEEE 802.15.4-2024 的多对多测距（§10.32.6、§10.32.7）按角色分工：控制器在测距控制消息里为每台设备指定发起方或响应方。单边形态里，M 个发起方各发一帧测距启动消息，N 个响应方各回一帧应答，为每个发起方各带一个回复时延（reply time），每个发起方据此算出到每个响应方的距离——共 M + N 帧，得到 M × N 对距离；双边形态还要由每个发起方再发一帧最终帧，距离由响应方算出。本仿真器目前没有按这个过程实现，这是待改正的偏差：它不发控制消息，让每台设备同时担任两种角色，按设备编号各发一帧，帧里带自己的发送时刻和此前收到的每一帧的到达时刻，而这两个信息单元标准里没有。在本仿真器的排法下，N 台设备用 N 个测距时隙（ranging slot）测得 N(N−1)/2 对距离，每一对只有排在前面的那台算得出，排在最后的那台发送全轮最长的一帧而自己一条也算不出；这一帧不能超过 127 字节，所以一轮最多 27 台。单边形态的误差来自本仿真器取的时钟偏差（clock offset）估计残差，随回复间隔的时隙数累积到二十厘米左右；双边形态多发一趟，误差小两个数量级。',
  outcomes: [
    '说出标准的多对多测距怎样分工：谁发启动消息、谁发应答、谁计算，几帧得到几对距离',
    '指出本仿真器的多对多与标准的三处不同：没有控制消息、每台设备兼任两种角色、帧里用了标准没有的信息单元',
    '在本仿真器的排法下数清每台设备算出几条距离，并说出参与者上限由哪一帧决定',
    '读出一台设备的发送未被接收时，本仿真器丢失的是哪几条距离',
  ],
  needs: ['uwb-sstwr', 'uwb-dstwr'],
  terms: [
    { term: 'many-to-many ranging (M2M)', plain: '多对多测距：多个发起方与多个响应方在一轮里相互测距（§10.32.6、§10.32.7）；ARC 信息单元的 Multi-node Mode 字段取 2' },
    { term: 'RRMC IE', plain: '测距请求测量与控制信息单元（ranging request measurement and control IE，§10.29.8.3）：启动消息与应答用它请求对方报告回复时延或往返时间' },
    { term: 'RRTI IE', plain: '测距回复时延信息单元（ranging reply time instantaneous IE，§10.29.8.1）：多对多的应答里为每个发起方各带一个，给出响应方的回复时延' },
    { term: 'participant', plain: '本仿真器的叫法：多对多一轮里占一个时隙的设备，同时担任发起方和响应方；标准里没有这个角色' },
    { term: 'TXT IE / RXT IE', plain: '本仿真器目前用的两个信息单元：自己的发送时刻，以及收到的每一帧的到达时刻；IEEE Std 802.15.4-2024 没有定义它们，这是待改正的偏差' },
  ],
  standard: [
    { heading: '谁来组织一轮（§10.32.6，§10.32.9.1，§10.32.9.8）', text: '多对多场景里，控制器向多个发起方和多个响应方发送测距控制消息（ranging control message, RCM），给出这一轮的测距配置。ARC 信息单元的 Multi-node Mode 字段取 2 表示多节点多对多（表 10-163）；RDM 信息单元给出每台设备的角色与时隙。测距启动消息与应答都可以按时间调度发送，也可以竞争发送。' },
    { heading: '单边形态：M + N 帧，M × N 对（§10.32.6，图 10-240）', text: '每个发起方在测距启动阶段发一帧测距启动消息，其中 RRMC 信息单元（§10.29.8.3）的 Ranging Control Information 字段为 0、Reply Time Request 字段为 1，请求对方报告回复时延。每个响应方收齐各发起方的启动消息之后发一帧应答，为每个发起方各插入一个 RRTI 信息单元（§10.29.8.1）。每个发起方收到一个响应方的应答，就有了算出到这个响应方飞行时间所需的全部量。M 个发起方、N 个响应方一共发 M + N 帧，得到 M × N 对距离。响应方也可以请求测距结果，这时每个发起方要再发一帧数据帧（data frame）。' },
    { heading: '双边形态：由响应方计算（§10.32.7，图 10-241）', text: '启动消息带 RRMC 信息单元，Ranging Control Information 为 2。响应方的应答带 RRMC 信息单元开始第二次往返，Ranging Control Information 为 3，Reply Time Request 与 Round-trip Time Request 都为 1。随后每个发起方发一帧最终帧，用 RRTI 信息单元报告回复时延，用测距测量信息（ranging measurement information, RMI）信息单元报告往返时间（§10.29.8.4）。每个响应方收到这一帧后算出它到这个发起方的飞行时间。' },
    { kind: 'steps', heading: '一轮多对多单边双向测距（single-sided two-way ranging, SS-TWR），按标准：逐步说明', items: [
      '控制器发出测距控制消息：ARC 信息单元的 Multi-node Mode 为 2，RDM 信息单元为每台设备指定发起方或响应方的角色和时隙（§10.32.9.1、§10.32.9.8）。',
      '各发起方在测距启动阶段发出测距启动消息，消息带 RRMC 信息单元，请求回复时延（§10.32.6）。',
      '各响应方记下每一条启动消息的到达时刻，收齐之后在测距应答阶段发一帧应答，为每个发起方各带一个 RRTI 信息单元。',
      '每个发起方收到应答，用自己测得的往返时间和对方报告的回复时延算出到这个响应方的飞行时间。',
      '响应方请求了测距结果时，每个发起方再发一帧数据帧把结果告诉它们。',
    ] },
    { heading: '一帧的长度上限（§16.2.7.1）', text: 'BPRF 模式下物理头（PHY header, PHR）的 Frame Length 字段占 7 位，给出 PSDU（PHY service data unit）的字节数，所以一帧的 PSDU 最多 127 字节。' },
  ],
  implementation: [
    { topic: '控制消息', standard: '控制器向发起方与响应方发 RCM；ARC 的 Multi-node Mode 为 2，RDM 指定角色与时隙（§10.32.6、§10.32.9.1、§10.32.9.8）', sim: '本仿真器的多对多一轮不发控制消息：参与者名单由场景事先给定，场景里每一台设备都参加，整场不变，没有任何设备能中途加入或退出。这是待改正的偏差。', kind: 'differs' },
    { topic: '角色', standard: '每台设备是发起方或响应方之一（§10.32.6）', sim: '每台设备同时担任两种角色：它发的一帧对排在后面的设备是启动，对排在前面的设备是应答。', kind: 'differs' },
    { topic: '帧里的信息单元', standard: '启动消息带 RRMC；应答为每个发起方各带一个 RRTI（§10.29.8.1、§10.29.8.3）', sim: '每一帧带 RRMC 与 TXT（自己的发送时刻），从第二帧起再带 RXT（此前收到的每一帧的到达时刻）；不发 RRTI。本仿真器目前用了标准里没有的 TXT 与 RXT 信息单元，这是待改正的偏差。', kind: 'differs' },
    { topic: '帧数与距离数', standard: '单边 M + N 帧得 M × N 对；双边每个发起方再加一帧最终帧（§10.32.6、§10.32.7）', sim: '单边形态 N 台设备各发一帧，N 帧得 N(N−1)/2 对；双边形态发两趟，2N 帧，得到的仍是这么多对。', kind: 'differs' },
    { topic: '谁计算', standard: '单边由发起方计算，双边由响应方计算（§10.32.6、§10.32.7）', sim: '两种形态都由一对里排在前面的那台计算：它缺的两个时刻都在对方的帧里，而对方缺的那个时刻在它发送时还没有发生。排在最后的那台一条也算不出。', kind: 'differs' },
    { topic: '发送顺序', standard: '由控制器的上层安排、经 RDM 下发，也可以竞争（§10.32.6）', sim: '按设备编号排序，第 i 台占第 i 个时隙；顺序决定了谁算出哪一条距离。', kind: 'choice' },
    { topic: '一帧的长度上限', standard: 'BPRF 模式下 PSDU 最多 127 字节（§16.2.7.1）', sim: '照此执行。本仿真器的排法里最后一帧最长，所以一轮最多 27 台：27 台时最后一帧 126 字节，28 台时 130 字节，编辑器拒绝。这个上限取决于本仿真器自己的帧结构。', kind: 'faithful' },
    { topic: '字段宽度', standard: 'TXT 与 RXT 标准里没有定义', sim: '帧头（MAC header）9 字节、RRMC 3 字节、TXT 6 字节、RXT 的单元头 2 字节加每个到达时刻 4 字节、帧校验 2 字节，都是本仿真器的取值。', kind: 'value' },
    { topic: '时隙长度', standard: '由 ARC 的 Ranging Slot Duration 给出，标准未规定取值（§10.32.9.1）', sim: '2 ms。', kind: 'value' },
    { topic: '单边测距的残余误差', standard: '标准不规定时钟偏差的估计方法', sim: '估计残差取百万分之几（parts per million, ppm）中的 0.2，即 0.2 ppm：回复间隔每多一个 2 ms 的时隙，误差约多 0.06 m。本课场景关掉了多径附加时延与时间戳噪声，只留下这一项。', kind: 'value' },
    { topic: 'SP3', standard: 'SP3 测距过程可以推广到多发起方多响应方（§10.32.8.1）', sim: '多对多模式不接受 SP3：这个模式没有控制消息，没有地方放 SRRR 信息单元。', kind: 'absent' },
    { topic: '定位', standard: '标准不定义定位', sim: '多对多模式不解算位置，距离分布在各台设备处。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '六台设备，六帧',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一帧。',
        '依次打开六帧，读出发送者、字节数和信息单元那一列。',
      ],
      blocks: [
        { kind: 'table', heading: '一轮六帧，没有控制消息', head: ['时隙', '发送者', '字节', '信息单元', '携带的到达时刻'], rows: [
          ['0', 'p-0', '20', 'RRMC、TXT', '0 个'],
          ['1', 'p-1', '26', 'RRMC、TXT、RXT', '1 个'],
          ['2', 'p-2', '30', 'RRMC、TXT、RXT', '2 个'],
          ['3', 'p-3', '34', 'RRMC、TXT、RXT', '3 个'],
          ['4', 'p-4', '38', 'RRMC、TXT、RXT', '4 个'],
          ['5', 'p-5', '42', 'RRMC、TXT、RXT', '5 个'],
        ] },
      ],
      expect: '整轮只有六帧，每台设备一帧；字节数从 20 增加到 42，第一帧不带 RXT，从第三帧起每多一个到达时刻多 4 字节。',
      meaning: '这是本仿真器的排法（②），不是标准的过程（①）：标准的一轮以控制消息开始，应答带的是 RRTI 信息单元，TXT 与 RXT 标准里没有。',
    },
    {
      heading: '每一对由谁算出',
      jump: 1,
      steps: [
        '跳到第一条测距行，看它出现的时刻和算出它的设备。',
        '让这一轮跑完，按算出它的设备统计十五条测距行。',
      ],
      blocks: [
        { kind: 'table', heading: '每台设备算出的距离', head: ['设备', 'p-0', 'p-1', 'p-2', 'p-3', 'p-4', 'p-5'], rows: [
          ['距离条数', '5', '4', '3', '2', '1', '0'],
        ] },
      ],
      expect: '第一条测距行出现在 2.195 ms，即第二帧接收完毕时，是 p-0 算出的它到 p-1 的距离；十五条距离按设备分别是 5、4、3、2、1、0 条，排在最后的 p-5 一条也没有。',
      meaning: '本仿真器的排法里，一对距离只有排在前面的那台算得出（②）。标准里单边形态由发起方计算、双边形态由响应方计算（①），与排位无关。',
    },
    {
      heading: '与轮流担任标签相比',
      steps: [
        '读下表：「轮流担任标签」是让每台设备轮流担任标签（tag）、其余担任锚点（anchor），各运行一轮后的合计；时隙数指测距交互实际占用的时隙，轮为了整除测距块（ranging block）而多出的空闲时隙不计在内。',
        '「本仿真器的多对多」是把本课场景的设备数改为 3、4、6 后各运行一轮的结果。',
      ],
      blocks: [
        { kind: 'table', heading: '同一组设备，两种做法', head: ['设备数 N', '轮流担任标签', '本仿真器的多对多，单边', '本仿真器的多对多，双边', '距离'], rows: [
          ['3', '9 个时隙、6 条', '3 个时隙', '6 个时隙', '3 条'],
          ['4', '16 个时隙、12 条', '4 个时隙', '8 个时隙', '6 条'],
          ['6', '36 个时隙、30 条', '6 个时隙', '12 个时隙', '15 条'],
        ] },
      ],
      expect: '轮流担任标签所需的时隙数恰好是本仿真器多对多单边形态的 N 倍，而且每一对测了两遍。',
      meaning: '这个倍数只对本仿真器的排法成立（②）。标准的分工里，距离只在发起方与响应方之间测得，M + N 帧得到 M × N 对（①）。',
    },
    {
      heading: '双边形态：两趟',
      variant: 0,
      steps: [
        '载入「双边形态」，看每台设备发几次、第二趟的帧有多长。',
        '对照下表读出两种形态的误差。',
      ],
      blocks: [
        { kind: 'table', heading: '同样十五对，两种形态', head: ['形态', '交互占用的时隙', '最大误差', '平均误差'], rows: [
          ['单边', '6', '0.2175 m', '0.0828 m'],
          ['双边', '12', '0.001454 m', '0.000637 m'],
        ] },
      ],
      expect: '双边形态每台设备发两次，第二趟的帧与第一趟一样长；最大误差从 0.2175 m 降到 0.001454 m，约 150 倍。单边形态误差最大的一对是相隔 4 个时隙的 p-0 与 p-4。',
      meaning: '单边形态的误差来自本仿真器取的 0.2 ppm 时钟偏差估计残差，回复间隔越长累积越多（②）。标准的双边形态由响应方计算（①），本仿真器仍由排在前面的那台计算。',
    },
    {
      heading: '一台设备未被接收',
      variant: 1,
      steps: [
        '载入「用砖墙隔离排在第一位的设备」，这一轮只有四台设备。',
        '统计测距行，再看 p-1 发出的那一帧有多长。',
      ],
      blocks: [
        { kind: 'table', heading: '隔离 p-0 之后', head: ['设备', 'p-0', 'p-1', 'p-2', 'p-3'], rows: [
          ['算出的距离', '0', '2', '1', '0'],
          ['发出的帧（字节）', '20', '20', '26', '30'],
        ] },
      ],
      expect: '四台设备本应测得 6 对，隔离 p-0 之后只剩 3 对，丢失的 3 对全是 p-0 与其余三台之间的；p-1 的帧从 26 字节变成 20 字节，因为它没有收到 p-0，帧里少一个到达时刻。',
      meaning: '在本仿真器的排法里，排在第一位的设备未被接收，丢失的是它与后面每一台之间的距离（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.32.6 与图 10-240（多对多单边双向测距）、§10.32.7 与图 10-241（多对多双边双向测距）、§10.29.8.1（RRTI 信息单元）、§10.29.8.3（RRMC 信息单元）、§10.29.8.4（RMI 信息单元）、§10.32.9.1 与表 10-163（ARC 信息单元的 Multi-node Mode）、§10.32.9.8（RDM 信息单元）、§10.32.8.1（SP3 测距可推广到多对多）、§16.2.7.1（物理头的 Frame Length 字段）。本课不依赖任何草案。',
    '本仿真器的取值与取法：多对多一轮没有控制消息、每台设备兼任两种角色、按设备编号排序；TXT 与 RXT 两个信息单元（标准里没有，待改正）；帧头 9 字节、RRMC 3 字节、TXT 6 字节、到达时刻每个 4 字节、帧校验 2 字节；2 ms 的测距时隙；0.2 ppm 的时钟偏差估计残差；本课场景关掉了多径附加时延与时间戳噪声。',
  ],
  limits: [],
  scenario: () => uwbM2mScenario('ss'),
  variants: [
    { label: '双边形态：两趟，每趟 N 个时隙', scenario: () => uwbM2mScenario('ds') },
    { label: '用砖墙隔离排在第一位的设备', scenario: () => uwbM2mScenario('ss', WALLED_PARTICIPANTS, true) },
  ],
  jumps: [
    J('第一帧：只带自己的发送时刻', firstUwbM2m),
    J('第一条测距行', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '按标准的多对多单边形态，3 个发起方、4 个响应方一共发几帧，得到几对距离？',
      options: [
        '7 帧，12 对：每个发起方一帧启动消息、每个响应方一帧应答，每个发起方到每个响应方各一对',
        '12 帧，12 对：每一对各要一帧',
        '7 帧，21 对：七台设备两两之间都有距离',
      ],
      answer: 0,
      explain: '§10.32.6：M 个发起方各发一帧启动消息，N 个响应方各发一帧应答、为每个发起方带一个 RRTI，共 M + N 帧、M × N 对。',
    },
    {
      q: '按标准，多对多双边形态里由谁算出距离？',
      options: [
        '发起方，因为它最先发送',
        '响应方：它收到发起方的最终帧（带 RRTI 与 RMI）后就有了全部量',
        '控制器，它汇总所有时刻',
      ],
      answer: 1,
      explain: '§10.32.7：每个发起方的最终帧报告回复时延与往返时间，响应方据此计算。',
    },
    {
      q: '本仿真器多对多帧里的 TXT 与 RXT 信息单元是什么？',
      options: [
        '§10.32.6 规定的两个信息单元',
        '标准里没有的信息单元，是本仿真器待改正的偏差',
        'RRTI 信息单元的另一种写法',
      ],
      answer: 1,
      explain: '标准的应答带 RRTI 信息单元；TXT 与 RXT 是本仿真器自己的，计划按 §10.32.6、§10.32.7 改正。',
    },
    {
      q: '本仿真器的排法里，一对设备中为什么只有排在前面的那台算得出距离？',
      options: [
        '因为标准指定排在前面的那台担任发起方',
        '因为它缺的两个时刻都在对方那一帧里，而对方缺的那个时刻在它发送时还没有发生',
        '因为排在后面的那台没有记录自己的发送时刻',
      ],
      answer: 1,
      explain: '「我收到你的时刻」只有在你发送之后才存在，而那时排在前面的那一帧早已发出。这是本仿真器排法的性质，不是标准的规定。',
    },
  ],
}
