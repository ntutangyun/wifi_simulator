/**
 * UWB Tier 2 · M21 SP3 分组测距, in the standard-first shape (2026-11-10).
 *
 * ① teaches IEEE Std 802.15.4-2024's SP3 packet (§10.29.1.1: SHR + STS, no PHR, no data), the
 * time-scheduling rule (§10.32.2), the three phases of §10.32.8.2 / Figure 10-242 and the SRRR IE
 * with its four request bits (§10.32.9.9). ② says what this engine does: the one-to-many SS shape
 * with the initiator's own marker and the RMI reports, faithful; no STS check, no MLME-STS, no
 * RSSD; and the bearing report carried in an RAOA IE the standard does not define (audit W4).
 *
 * The scenes are four runs of one 22 × 8 m hall with the same four anchors and tag, differing only
 * in the session switches: SP3 (base), SP1 deferred, SP1 embedded, SP3 with both request bits on.
 * Four anchors is where SP3 first stops being longer than the SP1 deferred round in this engine's
 * airtime accounting.
 *
 * Every figure the labs print is read back out of the lesson text and compared with a run in
 * tests/course/uwb-sp3.test.ts; the A = 1…6 table is checked against a live round at every A.
 */
import type { Scenario, UwbSessionCfg, UwbSrrrCfg } from '../../model/scenario'
import type { UwbReplyTime } from '../../uwb/phy'
import { J, anchor, firstUwbRange, rangingLab, txOf, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/** Anchors of every scene of this lesson. */
export const ANCHORS = 4
/** Where the anchors stand, in metres; the first `ANCHORS` of them are this lesson's own scenes,
 * and all six are the sweep the test measures A = 1…6 over. No two distances to the tag alike. */
export const PLACES: readonly { x: number; y: number }[] = [
  { x: 1, y: 1 }, { x: 21, y: 1 }, { x: 21, y: 7 }, { x: 11, y: 7 }, { x: 3, y: 6 }, { x: 19, y: 4 },
]
/** Where the tag stands. */
export const TAG = { x: 7, y: 3 } as const
/** The anchor counts the lesson's table prints. */
export const SWEEP = [1, 2, 3, 4, 5, 6] as const

/** Anchor i's id; the id order is the slot order. */
export const idOf = (i: number): string => `anc-${i + 1}`
/** The tag's id: the round's initiator. */
export const TAG_ID = 'uwb-1'

/** The devices of one scene: `n` anchors off `PLACES`, then the tag. */
const devices = (n: number) => [
  ...PLACES.slice(0, n).map((p, i) => anchor(idOf(i), `A${i + 1}`, p.x, p.y)),
  uwbTag(TAG_ID, 'Tag', TAG.x, TAG.y),
]

/**
 * One scene: `n` anchors, one tag, SS-TWR. `cfoNoisePpm: 0` and `nlos: false` because the subject
 * is airtime: in a deferred SS round the reply time is whole slots long, and the carrier-offset
 * residual would be worth decimetres at the far slots.
 */
const scene = (n: number, session: Partial<UwbSessionCfg>): Scenario =>
  uwbSc(rangingLab(), devices(n), { method: 'ss', nlos: false, cfoNoisePpm: 0, ...session })

/** The base scene: SP3 over `ANCHORS` anchors. The schema refuses `sp3` with any reply time but
 * `deferred`: an SP3 packet cannot carry the reply time, so it has to come back in a later frame. */
export function uwbSp3Scenario(srrr: UwbSrrrCfg = { raoa: false, rrtt: false }): Scenario {
  return scene(ANCHORS, { replyTime: 'deferred', sp3: true, srrr, aoa: srrr.raoa })
}

/** The same hall, the same devices, with SP3 off: the SP1 round of the reply-time shape named. */
export function uwbSp1Scenario(replyTime: UwbReplyTime): Scenario {
  return scene(ANCHORS, { replyTime })
}

/** The same shapes at any anchor count: what the test runs a live round of at every A. */
export function uwbSp3SweepScenario(
  anchors: number, shape: 'sp3' | 'sp3-rrtt' | 'deferred' | 'embedded',
): Scenario {
  if (shape === 'embedded' || shape === 'deferred') return scene(anchors, { replyTime: shape })
  return scene(anchors, {
    replyTime: 'deferred', sp3: true, srrr: { raoa: false, rrtt: shape === 'sp3-rrtt' },
  })
}

/** The initiator's own marker, in slot 1. */
const initiatorMarker = txOf((r) => r.frame.kind === 'uwbSp3' && r.node === TAG_ID)

export const uwbSp3: Lesson = {
  id: 'uwb-sp3',
  module: 23,
  title: '最短的测距帧，不构成最短的轮',
  why: 'SP3 是 IEEE 802.15.4-2024 里最短的测距包：只有同步头与加扰时间戳序列（scrambled timestamp sequence, STS），没有物理头（PHY header, PHR），没有载荷（payload），也没有帧头（MAC header）（§10.29.1.1、§6.6.2），所以它带不了时间值，也带不了发送者的地址。标准因此规定 SP3 测距只能按时间调度，靠时隙区分不同设备的消息（§10.32.2）。一轮 SP3 测距分三段（§10.32.8.2）：测距控制消息用 ARC 与 RDM 信息单元给出时隙与角色，用 SRRR 信息单元请求报告哪几项；随后发起方发出自己的 SP3 包，各响应方在各自的时隙里回一个 SP3 包；最后在测量报告阶段用测距测量信息（ranging measurement information, RMI）信息单元送回回复时延（reply time）、往返时间或到达角（angle of arrival, AoA）。SRRR 有 RAOA、RRT、RRTT、RTOF 四个请求位。本仿真器照此实现一对多的单边形态。最短的测距包并不构成最短的一轮：控制消息带有载荷，不能作为时间标记，发起方要多发一个 SP3 包，测距之后还要多一段报告阶段。按本仿真器的时长计算，与回复时延嵌在帧里的单边测距相比，SP3 在每个响应方数上都更长；与回复时延延后报告的做法相比，到第 4 个响应方才持平，请求往返时间后要到第 11 个。本仿真器的到达角报告目前用了标准里没有的 RAOA 信息单元，这是待改正的偏差。',
  outcomes: [
    '说出 SP3 包由哪几段组成，以及标准为什么规定 SP3 测距只能按时间调度',
    '按标准说出一轮 SP3 测距的三个阶段，以及 SRRR 信息单元的四个请求位',
    '在本仿真器里比较 SP3 与两种 SP1 的整轮时长，说出交叉点落在第几个响应方',
    '指出本仿真器的 SP3 哪些照标准、哪些与标准不同',
  ],
  needs: ['uwb-reply-time', 'uwb-receipt'],
  terms: [
    { term: 'SP3 format packet', plain: 'SP3 包：只有同步头与加扰时间戳序列，没有物理头、载荷与帧头的测距包（§10.29.1.1、§6.6.2）' },
    { term: 'measurement report phase', plain: '测量报告阶段：SP3 测距阶段之后的那一段时隙，回复时延、往返时间、到达角在这里用 RMI 信息单元送回（§10.32.8.2）' },
    { term: 'SRRR IE (SP3 Ranging Request Reports IE)', plain: 'SP3 测距请求报告信息单元：控制消息里按请求方与提供方成对声明要报告哪几项（§10.32.9.9）' },
    { term: 'RAOA / RRT / RRTT / RTOF', plain: 'SRRR 信息单元的四个请求位：分别请求到达角、回复时延、往返时间、飞行时间的报告' },
  ],
  standard: [
    { heading: 'SP3 包（§10.29.1.1，§6.6.2）', text: 'HRP 设备可以配置成 SP3 包：PPDU（PHY protocol data unit）没有物理头，也没有数据，只有同步头（SHR）与 STS，因而也没有帧头与帧校验。SP3 包按测距帧（RFRAME）处理。期待普通数据帧（data frame）的接收方因为没有物理头而丢弃它；期待 SP3 包的接收方，要么只在 STS 与期望值一致时接受，要么接受并通过 RangingStsFom 通知上层，由上层决定是否拒绝。' },
    { heading: '只能按时间调度（§10.32.2）', text: 'SP3 测距只能按时间调度，以区分来自不同设备的消息。调度可以是静态的，也可以通过 RDM 信息单元动态给出，还可以通过带外机制确定。控制器可以在测距控制消息里用 SRRR 信息单元请求受控设备报告到达角、回复时延或往返时间，也可以通过带外机制协调。SP3 测距也可以没有测量报告阶段，例如一台设备只用多台设备的到达角来定位。' },
    { heading: '三个阶段（§10.32.8.2，图 10-242）', text: '图 10-242 是一对多单边双向测距（single-sided two-way ranging, SS-TWR）使用 SP3 包的示例，分为控制、SP3 测距、测量报告三个阶段。控制消息里的 ARC 信息单元指明测距过程与 SP3 包格式，RDM 信息单元给出时隙分配与设备角色，并按需要带 SRRR 信息单元；控制消息还可以带 RSSD 信息单元交换 STS 种子的一部分。设备的上层在 SP3 测距阶段前后调用 MLME-STS 原语启用、停用 SP3 包配置，并把 STS 计数器推进到正确的值。测距阶段里，发起方先发一个 SP3 包作为测距启动，各响应方在各自的时隙里回一个 SP3 包。测量报告阶段里，各响应方把被请求的回复时延放在 RMI 信息单元里发给发起方；被请求时，发起方也用 RMI 信息单元把到达角与往返时间发给请求它的响应方。' },
    { heading: 'SRRR 信息单元（§10.32.9.9，图 10-255）', text: '内容字段依次是请求方与提供方的地址长度说明、RAOA、RRT、RRTT、RTOF 四个请求位，以及请求方地址和提供方地址（各为 0、2 或 8 字节）。四个请求位为 1 时分别表示需要报告到达角、回复时延、往返时间、飞行时间。请求方是其发射信号被测到达角的设备或发起测距的设备，提供方是测量到达角的设备。一条控制消息可以带一个或多个 SRRR 信息单元；一个发起方、多个响应方且控制器就是发起方时，可以省略请求方地址。' },
    { kind: 'steps', heading: '一轮一对多 SP3 单边测距（控制器即发起方），按标准：逐步说明', items: [
      '控制器发出测距控制消息：ARC 信息单元指明测距过程与 SP3 包格式，RDM 信息单元给出时隙与角色，按需要为每对请求方与提供方各带一个 SRRR 信息单元（§10.32.9.1、§10.32.9.8、§10.32.9.9）。',
      '各设备的上层用 MLME-STS 原语启用 SP3 包配置，设好 STS 的种子与计数器（§10.32.8.2）。',
      '发起方在自己的时隙里发出测距启动的 SP3 包。',
      '各响应方在 RDM 分配的时隙里各回一个 SP3 包；接收方按时隙知道它来自哪台设备。',
      '测量报告阶段：各响应方用 RMI 信息单元发回被请求的回复时延；被请求时，发起方用 RMI 信息单元发出到达角与往返时间（§10.29.8.4）。',
    ] },
    { heading: '推广（§10.32.8.1，§10.32.8.3）', text: '这些过程可以推广到多个发起方、多个响应方的情形。双边形态（图 10-243）与单边形态相似，区别是测距阶段里发起方还要发第二个 SP3 包。' },
  ],
  implementation: [
    { topic: 'SP3 包的结构', standard: '只有 SHR 与 STS，没有物理头、数据与帧头（§10.29.1.1、§6.6.2）', sim: '照此实现：一个 SP3 包 70 368 个码片（chip），即同步头 36 576 加 STS 33 792，没有物理头的 10 752 个码片；字节数 0，信息单元为空。', kind: 'faithful' },
    { topic: 'STS 的判决', standard: 'STS 一致才接受，或交给上层按 RangingStsFom 决定（§6.6.2）', sim: '未实现：STS 只计入空口时间（airtime），不持有密钥（key），也不做比对。', kind: 'absent' },
    { topic: 'MLME-STS、RSSD 与 STS 计数器', standard: '上层用 MLME-STS 启停 SP3 配置，控制消息可带 RSSD，计数器要推进（§10.32.8.2）', sim: '未实现：本仿真器没有这些原语，信息单元里没有 RSSD，也没有 STS 计数器。', kind: 'absent' },
    { topic: '只能按时间调度', standard: 'SP3 测距只能按时间调度（§10.32.2）', sim: '照此实现：编辑器拒绝 SP3 与竞争式测距同时打开；接收方按时隙表把 SP3 包记到这个时隙的主人名下。', kind: 'faithful' },
    { topic: '控制消息', standard: 'ARC、RDM 与按需要的 SRRR（§10.32.8.2）', sim: '照此实现：控制消息带 ARC、RR、RDM、RRMC 和 4 个 SRRR 信息单元，62 字节；不用 SP3 时同一条控制消息 42 字节。', kind: 'faithful' },
    { topic: 'SRRR 的格式', standard: '请求方与提供方成对；控制器即发起方时可省略请求方地址（§10.32.9.9）', sim: '照此实现：每个响应方一个 SRRR，省略请求方地址，带提供方的短地址，共 5 字节（单元头 2、控制 1、短地址 2）。', kind: 'faithful' },
    { topic: 'RRT 与 RTOF 两位', standard: '标准未规定何时置位', sim: '发起方总是置 RRT，响应方据此报告回复时延；RTOF 不使用。', kind: 'choice' },
    { topic: '发起方的 SP3 包', standard: '测距阶段以发起方的 SP3 包开始（图 10-242）', sim: '照此实现：放在第 1 个时隙，紧接在控制消息之后。', kind: 'faithful' },
    { topic: '回复时延的报告', standard: '响应方用 RMI 信息单元发回回复时延（§10.32.8.2）', sim: '照此实现：每个响应方在报告阶段发一帧 19 字节的报告，带 RMI 信息单元。', kind: 'faithful' },
    { topic: '往返时间的报告', standard: '被请求时发起方用 RMI 信息单元发出往返时间（§10.32.8.2）', sim: '照此实现：有响应方置了 RRTT 时，发起方在报告阶段多发一帧 RMI 报告，多占一个时隙。', kind: 'faithful' },
    { topic: '到达角的报告', standard: '到达角放在 RMI 信息单元的 AOA Azimuth 字段里（§10.29.8.4）；RAOA 只是 SRRR 里的请求位', sim: '本仿真器把天线（antenna）阵列装在锚点（anchor）上，由响应方报告到达角，而且在报告帧里另加一个 RAOA 信息单元（4 字节）。本仿真器目前用了标准里没有的 RAOA 信息单元，这是待改正的偏差。', kind: 'differs' },
    { topic: '没有报告阶段的 SP3', standard: 'SP3 测距可以没有测量报告阶段（§10.32.2）', sim: '未实现：编辑器要求 SP3 配延后的回复时延，总有报告阶段。', kind: 'absent' },
    { topic: '多发起方', standard: '可以推广到多个发起方、多个响应方（§10.32.8.1）', sim: '未实现：只有一对多；多对多模式不接受 SP3。', kind: 'absent' },
    { topic: '时隙与块', standard: '由 ARC 给出，标准未规定取值', sim: '每个时隙 2 ms，每块 200 ms；本课场景不计载波频偏的估计误差、关掉非视距（non-line-of-sight, NLOS），只保留时间戳噪声。', kind: 'value' },
  ],
  labs: [
    {
      heading: '一轮 SP3 的十个时隙',
      jump: 0,
      steps: [
        '载入本课场景，跳到发起方自己的 SP3 包。',
        '依次打开这一轮的每一帧，读出字节数、信息单元与空口时间。',
      ],
      blocks: [
        { kind: 'table', heading: '第 0 块的一轮', head: ['时隙', '发送者', '帧', '字节', '信息单元', '空口时间'], rows: [
          ['0', 'uwb-1', '控制消息', '62', 'ARC、RR、RDM、RRMC、SRRR', '238.397 µs'],
          ['1', 'uwb-1', 'SP3 包', '0', '—', '140.962 µs'],
          ['2', 'anc-1', 'SP3 包', '0', '—', '140.962 µs'],
          ['3', 'anc-2', 'SP3 包', '0', '—', '140.962 µs'],
          ['4', 'anc-3', 'SP3 包', '0', '—', '140.962 µs'],
          ['5', 'anc-4', 'SP3 包', '0', '—', '140.962 µs'],
          ['6', 'anc-1', '报告', '19', 'RMI', '188.141 µs'],
          ['7', 'anc-2', '报告', '19', 'RMI', '188.141 µs'],
          ['8', 'anc-3', '报告', '19', 'RMI', '188.141 µs'],
          ['9', 'anc-4', '报告', '19', 'RMI', '188.141 µs'],
        ] },
      ],
      expect: '控制消息之后是 5 个 0 字节的 SP3 包，每个 140.962 µs；第一条测距行在 12.188 ms 出现，是 anc-1 的报告收到之后，测距阶段结束时发起方还没有任何距离。',
      meaning: '这就是标准的三个阶段（①）。SP3 包里没有地址，接收方按时隙表认定发送者（②）。',
    },
    {
      heading: 'SP3 与两种 SP1',
      more: [0, 1],
      steps: [
        '依次载入本课场景、「延后的 SP1」与「嵌在帧里的 SP1」，各看第 0 块的一轮。',
        '把每一轮里各帧的空口时间加起来，与下表对照。',
      ],
      blocks: [
        { kind: 'table', heading: '同一个大厅、同样 4 个锚点', head: ['轮形', '交互占用的时隙', '整轮空口时间'], rows: [
          ['SP1，回复时延嵌在帧里', '5', '978.653 µs'],
          ['SP1，回复时延延后', '9', '1702.501 µs'],
          ['SP3', '10', '1695.771 µs'],
        ] },
      ],
      expect: 'SP3 比延后的 SP1 短 6.730 µs，比嵌在帧里的 SP1 长 717.118 µs；三种轮形都测得 4 条距离。',
      meaning: 'SP3 缩短的只是测距帧，报告阶段是全部的代价：嵌在帧里的做法本来没有报告阶段，所以 SP3 相对它只有开销。这些时长是本仿真器按帧长算出的（②），标准没有做这种比较。',
    },
    {
      heading: '到第几个响应方才持平',
      steps: [
        '读下表：每一列是把本课场景的锚点数改为 A 后各运行一轮，SP3 的整轮空口时间减去 SP1 的。',
        '再读下面的算式，看交叉点为什么在 A = 4。',
      ],
      blocks: [
        { kind: 'table', heading: '整轮空口时间之差（µs）', head: ['响应方数 A', '1', '2', '3', '4', '5', '6'], rows: [
          ['SP3 − 延后的 SP1', '104.039', '73.270', '36.347', '−6.730', '−43.652', '−80.574'],
          ['SP3 − 嵌在帧里的 SP1', '285.001', '435.194', '579.233', '717.118', '861.158', '1005.198'],
        ] },
        { kind: 'formula', heading: '每个响应方的净节省，与发起方多出的那个 SP3 包', text: '42.051 − 5.128 = 36.923 µs；140.962 ÷ 36.923 = 3.82', note: '42.051 µs 是一个 SP3 包比延后 SP1 的 14 字节应答少占的时间，5.128 µs 是这个响应方的 SRRR 信息单元让控制消息多占的时间，140.962 µs 是发起方的 SP3 包。' },
      ],
      expect: '与延后的 SP1 相比，差值从 A = 4 起变为负；与嵌在帧里的 SP1 相比，差值随 A 一直增大。',
      meaning: '交叉点取决于本仿真器的帧长与时长（②）。请求往返时间时发起方要多发一帧报告，交叉点后移（见下一项）。',
    },
    {
      heading: '两个请求位都打开',
      variant: 2,
      steps: [
        '载入「SP3，两个请求位都打开」，看报告阶段多了什么。',
        '打开发起方的报告与任意一个响应方的报告，读字节数与信息单元。',
      ],
      blocks: [
        { kind: 'table', heading: '报告阶段的两种帧', head: ['帧', '字节', '信息单元'], rows: [
          ['发起方的报告', '39', 'RMI'],
          ['响应方的报告', '23', 'RMI、RAOA'],
        ] },
      ],
      expect: '交互占用的时隙从 10 个变成 11 个，多出的是发起方的报告；每个响应方的报告从 19 字节变成 23 字节，多了一个 RAOA 信息单元；整轮 1920.837 µs。只请求往返时间时，交叉点后移到 A = 11。',
      meaning: '往返时间由发起方用 RMI 报告，照标准（①）；到达角放进 RAOA 信息单元是本仿真器与标准不同之处，标准把它放在 RMI 的 AOA Azimuth 字段里（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.1（SP3 包只有 SHR 与 STS）、§6.6.2（SP3 包的接受与拒绝）、§10.32.2（SP3 测距只能按时间调度，可以没有测量报告阶段）、§10.32.8.1 至 §10.32.8.3 与 Figure 10-242、10-243（SP3 测距的三个阶段）、§10.32.9.9 与图 10-255（SRRR 信息单元的四个请求位与地址字段）、§10.29.8.4（RMI 信息单元，含 AOA Azimuth 字段）、§10.29.6.3（回复时延延后报告）。本课不依赖任何草案。',
    '本仿真器的取值与取法：SP3 包 70 368 个码片；每个响应方一个 SRRR 信息单元，带提供方的短地址；发起方总是置 RRT；到达角由锚点测量，装在另加的 RAOA 信息单元里（标准里没有，待改正）；每个时隙 2 ms、每块 200 ms；本课场景把载波频偏估计残差设为 0、关掉非视距。整轮空口时间是各帧 PPDU 时长之和，A 从 1 到 6 的差值逐一用一轮仿真核对。',
  ],
  limits: [],
  scenario: () => uwbSp3Scenario(),
  variants: [
    { label: '延后的 SP1：测距帧仍带物理头与载荷', scenario: () => uwbSp1Scenario('deferred') },
    { label: '嵌在帧里的 SP1：没有报告阶段', scenario: () => uwbSp1Scenario('embedded') },
    { label: 'SP3，两个请求位都打开', scenario: () => uwbSp3Scenario({ raoa: true, rrtt: true }) },
  ],
  jumps: [
    J('发起方自己的 SP3 包：0 字节', initiatorMarker),
    J('第一条测距行', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '为什么一轮 SP3 测距的第一帧不可能是 SP3 包？',
      options: [
        '因为第一帧要带整轮的时间基准，而 SP3 包太短',
        '因为第一帧要发布时隙分配与请求，而 SP3 包没有物理头也没有载荷，带不了任何信息单元',
        '因为标准规定 SP3 包只能由响应方发送',
      ],
      answer: 1,
      explain: '§10.32.8.2：控制消息带 ARC、RDM 与 SRRR 信息单元；SP3 包只有 SHR 与 STS（§10.29.1.1），所以发起方的 SP3 包排在控制消息之后。',
    },
    {
      q: '按标准，SP3 测距为什么只能按时间调度？',
      options: [
        '因为 SP3 包没有帧头、带不了发送者地址，只能靠时隙区分不同设备的消息',
        '因为 SP3 包太短，无法参与竞争',
        '因为 SP3 只用于一对一测距',
      ],
      answer: 0,
      explain: '§10.32.2：只能按时间调度，以区分来自不同设备的消息。',
    },
    {
      q: 'SRRR 信息单元有哪几个请求位？',
      options: [
        '只有 RAOA 与 RRTT 两个',
        'RAOA、RRT、RRTT、RTOF 四个，分别请求到达角、回复时延、往返时间、飞行时间',
        '只有一个「需要报告」位',
      ],
      answer: 1,
      explain: '§10.32.9.9，图 10-255。',
    },
    {
      q: '本仿真器里，同样 4 个响应方，SP3 的一轮比哪一种 SP1 短？',
      options: [
        '比两种都短，因为它的测距帧最短',
        '比两种都长，因为它多了一个报告阶段',
        '只比回复时延延后的那一种短；比嵌在帧里的那一种长，因为那一种本来没有报告阶段',
      ],
      answer: 2,
      explain: '延后的做法本来就要为报告阶段发帧，SP3 只是把它的测距帧缩到最短；嵌在帧里的做法没有报告阶段，SP3 相对它只有开销。',
    },
  ],
}
