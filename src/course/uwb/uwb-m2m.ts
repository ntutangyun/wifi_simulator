/**
 * UWB Tier 2 · M18 多对多测距, in the standard-first shape (2026-11-10; rewritten 2026-11-11 for W3).
 *
 * ① teaches IEEE Std 802.15.4-2024 §10.32.6 (SS) and §10.32.7 (DS): the controller's RCM gives
 * every device one role, initiators send ranging initiation messages, each responder answers with
 * one response carrying a reply time per initiator, and M + N frames give M × N distances (DS adds a
 * final frame per initiator and the responder computes).
 *
 * ② says how this engine does it since W3 (audit #2): the same procedure, time-scheduled, with the
 * tags as initiators, the anchors as responders and the first initiator as controller.
 *
 * Every figure the labs print is read back out of the lesson text and compared with a run in
 * tests/course/uwb-m2m.test.ts.
 */
import type { Scenario, UwbSessionCfg, Wall } from '../../model/scenario'
import { J, anchor, brick, firstUwbM2mResp, firstUwbPoll, firstUwbRange, uwbSc, uwbTag, type Lesson } from '../lessonKit'
import { roundPlan } from '../../uwb/session'

/** Initiators (tags) of the lesson's round — the M. */
export const INITIATORS = 2
/** Responders (anchors) of the lesson's round — the N. */
export const RESPONDERS = 4

/** Initiator k's id. Ids decide the order (`session.ts#m2mRoles` sorts them), so `t-0` is the
 * controller and `t-0`, `t-1` is the initiation order. */
export const initiatorId = (k: number): string => `t-${k}`
/** Responder j's id; `a-0`…`a-3` is the response order. */
export const responderId = (j: number): string => `a-${j}`

/** Where the initiators stand (handsets, 1 m up), in metres: the lesson's two, and a third the
 * comparison table's three-initiator row uses. */
export const INITIATOR_PLACES: readonly { x: number; y: number }[] = [{ x: 5, y: 5 }, { x: 13, y: 10 }, { x: 9, y: 12 }]
/** Where the four responders stand (anchors, 2.2 m up): the hall's corners. No two of the eight
 * initiator–responder distances are alike. */
export const RESPONDER_PLACES: readonly { x: number; y: number }[] = [
  { x: 1, y: 1 }, { x: 19, y: 1 }, { x: 19, y: 15 }, { x: 1, y: 15 },
]

/** One crystal offset per device, in ppm: distinct, and spread over most of the ±20 ppm the
 * standard allows (§16.4.9). */
export const INITIATOR_PPM: readonly number[] = [0, 18, 12]
export const RESPONDER_PPM: readonly number[] = [-14, 9, -20, 5]

/** The hall: 20 × 16 m inside one brick shell. */
function m2mHall(): { rooms: { x: number; y: number; w: number; h: number; name: string }[]; walls: Wall[] } {
  return {
    rooms: [{ x: 0, y: 0, w: 20, h: 16, name: 'Hall' }],
    walls: [brick(0, 0, 20, 0), brick(20, 0, 20, 16), brick(20, 16, 0, 16), brick(0, 16, 0, 0)],
  }
}

/** Three brick partitions across the corner responder `a-0` stands in (x + y < 3): nothing of it is
 * heard and it hears nothing. Every other device stands at x + y ≥ 10, so no other path crosses them. */
function cornerCloset(): Wall[] {
  return [0, 0.2, 0.4].map((d) => ({
    x1: 0, y1: 3 + d, x2: 3 + d, y2: 0, material: 'brick' as const, openings: [],
  }))
}

/** Three nested brick boxes around the controller `t-0`: nothing of it is heard, so no device
 * receives the round's RCM. */
function controllerBox(): Wall[] {
  const { x, y } = INITIATOR_PLACES[0]
  return [0.5, 0.7, 0.9].flatMap((r) => [
    brick(x - r, y - r, x + r, y - r), brick(x + r, y - r, x + r, y + r),
    brick(x + r, y + r, x - r, y + r), brick(x - r, y + r, x - r, y - r),
  ])
}

/**
 * The lesson's scene: two initiators (tags) and four responders (anchors). No excess delay and no
 * timestamp noise, so the only error term left is the residual on each receiver's own carrier-offset
 * estimate (`cfoNoisePpm`, left at the session default). `wall`: none, around responder `a-0`, or
 * around the controller.
 */
export function uwbM2mScenario(
  method: 'ss' | 'ds' = 'ss', wall: 'none' | 'responder' | 'controller' = 'none',
  m: number = INITIATORS, n: number = RESPONDERS,
): Scenario {
  const hall = m2mHall()
  const extra = wall === 'responder' ? cornerCloset() : wall === 'controller' ? controllerBox() : []
  return uwbSc(
    { rooms: hall.rooms, walls: [...hall.walls, ...extra] },
    [
      ...INITIATOR_PLACES.slice(0, m).map((p, k) => uwbTag(initiatorId(k), `T${k}`, p.x, p.y, 1, INITIATOR_PPM[k])),
      ...RESPONDER_PLACES.slice(0, n).map((p, j) => anchor(responderId(j), `A${j}`, p.x, p.y, 2.2, RESPONDER_PPM[j])),
    ],
    { mode: 'm2m', method, nlos: false, tsNoisePs: 0 },
  )
}

/** The session the scene runs, read back off the scenario rather than restated. */
const SESSION: UwbSessionCfg = uwbM2mScenario().uwb!

/** The (M, N) the comparison table is read at. */
export const TABLE_ROWS = [[1, 4], [2, 4], [3, 3]] as const

/** Slots one many-to-many round's exchange of M initiators and N responders takes, from the round
 * planner itself (`rangingSlots`; the round is stretched to a whole divisor of the block, §10.32.2). */
export const m2mSlots = (m: number, n: number, method: 'ss' | 'ds'): number =>
  roundPlan({ ...SESSION, method }, n, m).rangingSlots

/** Slots of the arrangement the comparison is against: M one-to-many rounds over the same N
 * anchors, one per initiator taking its turn as the tag. */
export const takingTurnsSlots = (m: number, n: number): number =>
  m * roundPlan({ ...SESSION, mode: 'twr', method: 'ss', replyTime: 'embedded' }, n).rangingSlots

/** The controller's RCM: the first frame of the round. */
const rcmJump = firstUwbPoll

export const uwbM2m: Lesson = {
  id: 'uwb-m2m',
  module: 20,
  title: '多对多测距：M + N 帧测出 M × N 个距离',
  why: 'IEEE 802.15.4-2024 的多对多测距（§10.32.6、§10.32.7）按角色分工：控制器在测距控制消息里为每台设备指定发起方或响应方及其时隙。单边形态里，M 个发起方各发一帧测距启动消息，N 个响应方各回一帧应答，为每个发起方各带一个回复时延（reply time），每个发起方据此算出到每个响应方的距离——共 M + N 帧，得到 M × N 对距离；双边形态由每个发起方再发一帧最终帧，距离由响应方算出，共 2M + N 帧。本仿真器按这个过程实现按时间调度的一轮：标签（tag）是发起方，锚点（anchor）是响应方，按编号排在最前的发起方担任控制器，把测距控制消息与自己的启动消息合成一帧。本课场景是 2 个发起方、4 个响应方，单边一轮 6 帧测出 8 个距离，而让两台设备轮流担任标签要 10 个时隙。没有收到控制消息的设备不知道自己的时隙，整轮都不发送；控制器本身未被接收时，这一轮一个距离也测不出。单边形态的误差来自本仿真器取的时钟偏差（clock offset）估计残差，回复时延跨好几个时隙，误差累积到分米级；双边形态的误差小两个数量级。',
  outcomes: [
    '说出标准的多对多测距怎样分工：谁发控制消息、谁发启动消息、谁发应答、谁计算，几帧得到几对距离',
    '读出一帧测距控制消息的 RDM 信息单元：每台设备的角色与时隙',
    '比较多对多与轮流担任标签所需的时隙数',
    '说出一台响应方或控制器未被接收时，这一轮丢失了哪些距离、为什么',
  ],
  needs: ['uwb-sstwr', 'uwb-dstwr'],
  terms: [
    { term: 'many-to-many ranging (M2M)', plain: '多对多测距：多个发起方与多个响应方在一轮里相互测距（§10.32.6、§10.32.7）；ARC 信息单元的 Multi-node Mode 字段取 2' },
    { term: 'RRMC IE', plain: '测距请求测量与控制信息单元（ranging request measurement and control IE，§10.29.8.3）：启动消息与应答用它请求对方报告回复时延或往返时间' },
    { term: 'RRTI IE', plain: '测距回复时延信息单元（ranging reply time instantaneous IE，§10.29.8.1）：列出一个或多个回复时延，每个回复时延可以带对方的地址' },
    { term: 'RDM IE', plain: '测距设备管理信息单元（ranging device management IE，§10.32.9.8）：控制器用它为每台设备指定角色（发起方或响应方）与时隙' },
  ],
  standard: [
    { heading: '谁来组织一轮（§10.32.6，§10.32.9.1，§10.32.9.8）', text: '多对多场景里，控制器向多个发起方和多个响应方发送测距控制消息（ranging control message, RCM），给出这一轮的测距配置。ARC 信息单元的 Multi-node Mode 字段取 2 表示多节点多对多（表 10-163）。RDM 信息单元的 SIU 字段为 1 时，每个列表元素为一台设备给出 Ranging Role（0 为响应方，1 为发起方）与 Ranging Slot Index；设备收到测距控制消息，就知道自己是否被选中参加这一轮。测距启动消息与应答都可以按时间调度发送，也可以竞争发送。' },
    { heading: '单边形态：M + N 帧，M × N 对（§10.32.6，图 10-240）', text: '每个发起方在测距启动阶段发一帧测距启动消息，其中 RRMC 信息单元（§10.29.8.3）的 Ranging Control Information 字段为 0、Reply Time Request 字段为 1，请求对方报告回复时延。每个响应方收齐各发起方的启动消息之后发一帧应答，为每个发起方插入一个回复时延（RRTI 信息单元，§10.29.8.1）。每个发起方收到一个响应方的应答，就有了算出到这个响应方飞行时间所需的全部量。M 个发起方、N 个响应方一共发 M + N 帧，得到 M × N 对距离。响应方也可以请求测距结果，这时每个发起方要再发一帧数据帧（data frame）。' },
    { heading: '双边形态：由响应方计算（§10.32.7，图 10-241）', text: '启动消息带 RRMC 信息单元，Ranging Control Information 为 2。响应方的应答带 RRMC 信息单元开始第二次往返，Ranging Control Information 为 3，Reply Time Request 与 Round-trip Time Request 都为 1。随后每个发起方发一帧最终帧，用 RRTI 信息单元报告回复时延，用测距测量信息（ranging measurement information, RMI）信息单元报告往返时间（§10.29.8.4）。每个响应方收到这一帧后算出它到这个发起方的飞行时间。一共 2M + N 帧。' },
    { kind: 'steps', heading: '一轮多对多单边双向测距（single-sided two-way ranging, SS-TWR），按标准：逐步说明', items: [
      '控制器发出测距控制消息：ARC 信息单元的 Multi-node Mode 为 2，RDM 信息单元为每台设备指定发起方或响应方的角色和时隙（§10.32.9.1、§10.32.9.8）。',
      '各发起方在测距启动阶段发出测距启动消息，消息带 RRMC 信息单元，请求回复时延（§10.32.6）。',
      '各响应方记下每一条启动消息的到达时刻，收齐之后在测距应答阶段发一帧应答，为每个发起方各带一个回复时延。',
      '每个发起方收到应答，用自己测得的往返时间和对方报告的回复时延算出到这个响应方的飞行时间。',
      '响应方请求了测距结果时，每个发起方再发一帧数据帧把结果告诉它们。',
    ] },
    { heading: '一帧的长度上限（§16.2.7.1）', text: 'BPRF 模式下物理头（PHY header, PHR）的 Frame Length 字段占 7 位，给出 PSDU（PHY service data unit）的字节数，所以一帧的 PSDU 最多 127 字节。' },
  ],
  implementation: [
    { topic: '控制消息', standard: '控制器向发起方与响应方发 RCM；ARC 的 Multi-node Mode 为 2，RDM 指定角色与时隙（§10.32.6、§10.32.9.1、§10.32.9.8）', sim: '照此实现：控制器在时隙 0 发出测距控制消息，带 ARC（Multi-node Mode 2）、RR、RDM 与 RRMC 信息单元；RDM 列出其余每台设备的角色与时隙。控制器本身是发起方，所以测距控制消息与它自己的启动消息合成一帧（§10.32.2 允许）。本课场景里这一帧 45 字节。', kind: 'faithful' },
    { topic: '谁担任控制器', standard: '一个测距会话只有一个控制器（§10.32.9.1）；由哪台设备担任由上层决定', sim: '按编号排在最前的发起方。', kind: 'choice' },
    { topic: '角色', standard: '每台设备由 RDM 的 Ranging Role 指定为发起方或响应方（§10.32.9.8）', sim: '照此实现：场景里的标签（tag）是发起方，锚点（anchor）是响应方。', kind: 'faithful' },
    { topic: '时隙顺序', standard: '由控制器的上层安排、经 RDM 下发（§10.32.6、§10.32.9.8）', sim: '启动阶段按发起方编号、应答阶段按响应方编号依次排开；双边形态的最终帧接在应答之后，按启动阶段的顺序。RDM 每台设备只给一个时隙，最终帧的时隙由这条顺序推出，标准没有规定。', kind: 'choice' },
    { topic: '没收到控制消息的设备', standard: '设备收到 RCM 才知道自己是否参加、在哪个时隙（§10.32.9.8）', sim: '照此实现：没收到控制消息、或 RDM 没有列出的设备整轮既不发送，也不在时隙 0 之后接收。', kind: 'faithful' },
    { topic: '启动消息', standard: '带 RRMC 信息单元（§10.32.6、§10.32.7）', sim: '照此实现：其余发起方的启动消息只带 RRMC，14 字节。', kind: 'faithful' },
    { topic: '单边形态的应答', standard: '为每个发起方插入一个回复时延（§10.32.6，图 10-240）', sim: '照此实现：一个 RRTI 信息单元，列表里每个收到的发起方一个元素——4 字节回复时延加 2 字节地址；不带 RRMC（图 10-240 没有）。本课场景里 26 字节。', kind: 'faithful' },
    { topic: '一个 RRTI 还是多个', standard: '正文说为每个发起方插入一个 RRTI；RRTI 的格式允许一个信息单元列出多个回复时延（§10.29.8.1）', sim: '本仿真器用一个 RRTI 信息单元列出全部发起方，每个元素都带地址。', kind: 'choice' },
    { topic: '双边形态的应答与最终帧', standard: '应答带 RRMC (3)；最终帧带 RRTI 与 RMI（§10.32.7）', sim: '照此实现：应答只带 RRMC，14 字节；最终帧为每个收到应答的响应方带往返时间与回复时延，本课场景里 66 字节。', kind: 'faithful' },
    { topic: '谁计算', standard: '单边由发起方计算，双边由响应方计算（§10.32.6、§10.32.7）', sim: '照此实现。', kind: 'faithful' },
    { topic: '测距结果上报', standard: '响应方可以请求测距结果，由发起方再发数据帧（§10.32.6）', sim: '未实现：一轮里不上报测距结果，距离留在算出它的设备处。', kind: 'absent' },
    { topic: '竞争发送', standard: '启动消息与应答都可以竞争发送（§10.32.6、§10.32.7）', sim: '未实现：编辑器只接受按时间调度的多对多测距。', kind: 'absent' },
    { topic: '一帧的长度上限', standard: 'BPRF 模式下 PSDU 最多 127 字节（§16.2.7.1）；RDM 最多列出 63 台设备（§10.32.9.8）', sim: '照此执行：单边应答随发起方数增长，双边最终帧随响应方数增长，测距控制消息随设备总数增长，任何一帧超过 127 字节的组合编辑器都拒绝。', kind: 'faithful' },
    { topic: '时隙长度', standard: '由 ARC 的 Ranging Slot Duration 给出，标准未规定取值（§10.32.9.1）', sim: '2 ms。', kind: 'value' },
    { topic: '单边测距的残余误差', standard: '标准不规定时钟偏差的估计方法', sim: '估计残差取百万分之几（parts per million, ppm）中的 0.2，即 0.2 ppm：回复时延每长一个 2 ms 的时隙，误差约多 0.06 m。本课场景关掉了多径附加时延与时间戳噪声，只留下这一项。', kind: 'value' },
    { topic: 'SP3', standard: 'SP3 测距过程可以推广到多发起方多响应方（§10.32.8.1）', sim: '未实现：多对多模式不接受 SP3。', kind: 'absent' },
    { topic: '定位', standard: '标准不定义定位', sim: '多对多模式不解算位置，距离留在各台设备处。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '六帧，八个距离',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一帧，打开它的 RDM 信息单元。',
        '依次打开这一轮的六帧，读出发送者、字节数和信息单元那一列。',
      ],
      blocks: [
        { kind: 'table', heading: '单边形态的一轮', head: ['时隙', '发送者', '帧', '字节', '信息单元'], rows: [
          ['0', 't-0', '测距控制消息与启动消息', '45', 'ARC、RR、RDM、RRMC'],
          ['1', 't-1', '启动消息', '14', 'RRMC'],
          ['2', 'a-0', '应答', '26', 'RRTI'],
          ['3', 'a-1', '应答', '26', 'RRTI'],
          ['4', 'a-2', '应答', '26', 'RRTI'],
          ['5', 'a-3', '应答', '26', 'RRTI'],
        ] },
      ],
      expect: '整轮六帧：t-0 的第一帧 RDM 列出 5 台设备，t-1 是发起方、时隙 1，a-0 到 a-3 是响应方、时隙 2 到 5；每个应答的 RRTI 信息单元有 2 个元素，各给 t-0 与 t-1 一个回复时延。这一轮得到 8 个距离。',
      meaning: '2 个发起方加 4 个响应方，6 帧得到 2 × 4 = 8 对距离（①）；控制器由排在最前的发起方担任、时隙按编号排开，是本仿真器的取法（②）。',
    },
    {
      heading: '每一对由谁算出',
      jump: 2,
      steps: [
        '跳到第一条测距行，看它出现的时刻和算出它的设备。',
        '让这一轮跑完，按算出它的设备统计八条测距行。',
      ],
      blocks: [
        { kind: 'table', heading: '每台设备算出的距离（单边形态）', head: ['设备', 't-0', 't-1', 'a-0', 'a-1', 'a-2', 'a-3'], rows: [
          ['距离条数', '4', '4', '0', '0', '0', '0'],
        ] },
      ],
      expect: '第一条测距行出现在 4.195 ms，即时隙 2 里 a-0 的应答接收完毕时，是 t-0 算出的它到 a-0 的距离；八条距离都由发起方算出，每个发起方 4 条。',
      meaning: '单边形态由发起方计算（①）：一个应答同时给了两个发起方各自需要的回复时延。',
    },
    {
      heading: '与轮流担任标签相比',
      steps: [
        '读下表：「轮流担任标签」是让每个发起方轮流担任标签、对同样 N 个锚点各做一轮一对多单边测距的合计；时隙数指测距交互实际占用的时隙，轮为了整除测距块（ranging block）而多出的空闲时隙不计在内。',
        '「多对多」是把本课场景改为表中的设备数后各运行一轮的结果。',
      ],
      blocks: [
        { kind: 'table', heading: '同一组设备，两种做法', head: ['发起方 M', '响应方 N', '轮流担任标签', '多对多，单边', '多对多，双边', '距离'], rows: [
          ['1', '4', '5 个时隙', '5 个时隙', '6 个时隙', '4 条'],
          ['2', '4', '10 个时隙', '6 个时隙', '8 个时隙', '8 条'],
          ['3', '3', '12 个时隙', '6 个时隙', '9 个时隙', '9 条'],
        ] },
      ],
      expect: '轮流担任标签要 M(N + 1) 个时隙，多对多单边只要 M + N 个；只有一个发起方时两者相同，那就是一对多测距。两种做法测到的距离一样多。',
      meaning: '多对多把各发起方的启动消息排在一起，每个响应方只回一帧就答复了全部发起方（①）。',
    },
    {
      heading: '双边形态：响应方算出距离',
      variant: 0,
      steps: [
        '载入「双边形态」，看应答和最终帧的长度，以及测距行出现在哪台设备上。',
        '对照下表读出两种形态的误差。',
      ],
      blocks: [
        { kind: 'table', heading: '同样八对，两种形态', head: ['形态', '交互占用的时隙', '最大误差', '平均误差'], rows: [
          ['单边', '6', '0.4058 m', '0.2294 m'],
          ['双边', '8', '0.001430 m', '0.000561 m'],
        ] },
      ],
      expect: '双边形态的应答只带 RRMC、14 字节，t-0 与 t-1 各发一帧 66 字节的最终帧；八条测距行都在响应方上，每个响应方 2 条。最大误差从 0.4058 m 降到 0.001430 m，约 284 倍；单边形态误差最大的一对是 t-0 与 a-1。',
      meaning: '双边形态由响应方计算（①）。单边形态的误差来自本仿真器取的 0.2 ppm 时钟偏差估计残差，回复时延跨好几个时隙，残差累积得多（②）；双边形态把时钟偏差抵消了。',
    },
    {
      heading: '一台响应方未被接收',
      variant: 1,
      steps: [
        '载入「用砖墙隔离响应方 a-0」。',
        '数这一轮的帧和测距行，看 a-0 在自己的时隙里有没有发送。',
      ],
      blocks: [
        { kind: 'table', heading: '隔离 a-0 之后（单边形态）', head: ['量什么', '无隔离', '隔离 a-0'], rows: [
          ['一轮的帧数', '6', '5'],
          ['距离条数', '8', '6'],
        ] },
      ],
      expect: 'a-0 在时隙 0 等不到测距控制消息，记下一次超时，之后整轮不发送；t-0 与 t-1 在时隙 2 各记一次超时。剩下 6 个距离，丢失的 2 个是 a-0 与两个发起方之间的。',
      meaning: '没有收到测距控制消息的设备不知道自己的时隙（①），一台响应方丢失的是它与 M 个发起方之间的 M 个距离。',
    },
    {
      heading: '控制器未被接收',
      variant: 2,
      steps: [
        '载入「用砖墙隔离控制器 t-0」。',
        '数这一轮的帧、超时和测距行。',
      ],
      blocks: [
        { kind: 'table', heading: '隔离 t-0 之后（单边形态）', head: ['量什么', '数量'], rows: [
          ['一轮的帧数', '1'],
          ['时隙 0 的超时', '5'],
          ['距离条数', '0'],
        ] },
      ],
      expect: '只有 t-0 自己的测距控制消息发了出去；其余 5 台设备在时隙 0 各记一次超时，之后都不发送。这一轮一个距离也没有。',
      meaning: '每台设备的角色与时隙都来自控制器的测距控制消息（①）：控制器未被接收，整轮停摆。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.32.6 与图 10-240（多对多单边双向测距）、§10.32.7 与图 10-241（多对多双边双向测距）、§10.29.8.1（RRTI 信息单元）、§10.29.8.3（RRMC 信息单元）、§10.29.8.4（RMI 信息单元）、§10.32.2（控制消息与启动消息合并）、§10.32.9.1 与表 10-163（ARC 信息单元的 Multi-node Mode）、§10.32.9.8（RDM 信息单元）、§10.32.8.1（SP3 测距可推广到多对多）、§16.2.7.1（物理头的 Frame Length 字段）。本课不依赖任何草案。',
    '本仿真器的取值与取法：按编号排在最前的发起方担任控制器；时隙按编号排开，双边最终帧接在应答之后；一个 RRTI 信息单元列出全部发起方；2 ms 的测距时隙；0.2 ppm 的时钟偏差估计残差；本课场景关掉了多径附加时延与时间戳噪声。未实现：竞争发送、测距结果上报、SP3。',
  ],
  limits: [],
  scenario: () => uwbM2mScenario('ss'),
  variants: [
    { label: '双边形态：每个发起方再发一帧最终帧', scenario: () => uwbM2mScenario('ds') },
    { label: '用砖墙隔离响应方 a-0', scenario: () => uwbM2mScenario('ss', 'responder') },
    { label: '用砖墙隔离控制器 t-0', scenario: () => uwbM2mScenario('ss', 'controller') },
  ],
  jumps: [
    J('第一帧：测距控制消息与 t-0 的启动消息', rcmJump),
    J('第一帧应答', firstUwbM2mResp),
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
      explain: '§10.32.6：M 个发起方各发一帧启动消息，N 个响应方各发一帧应答、为每个发起方带一个回复时延，共 M + N 帧、M × N 对。',
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
      q: '一台设备没有收到这一轮的测距控制消息，会怎样？',
      options: [
        '按上一轮的时隙照常发送',
        '不知道自己是否参加、在哪个时隙，这一轮不发送',
        '改用竞争方式抢一个时隙',
      ],
      answer: 1,
      explain: '§10.32.9.8：设备收到测距控制消息才知道自己是否被选中、角色与时隙是什么。本课隔离 a-0 的变体里 a-0 整轮不发送。',
    },
    {
      q: '本课场景里由哪台设备担任控制器？这是标准规定的吗？',
      options: [
        '编号最前的发起方 t-0；这是本仿真器的取法，标准只规定一个会话有一个控制器',
        '编号最前的响应方 a-0；标准规定控制器必须是响应方',
        '每台设备轮流担任；标准规定控制器轮换',
      ],
      answer: 0,
      explain: '§10.32.9.1：一个测距会话只有一个控制器，由哪台设备担任由上层决定。',
    },
  ],
}
