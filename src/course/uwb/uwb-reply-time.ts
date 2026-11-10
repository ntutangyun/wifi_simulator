/**
 * UWB Tier 1 · M14 两个时钟 · You cannot put a number inside the frame that measures it.
 *
 * Standard-first shape (2026-11-10, docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md):
 * ① IEEE Std 802.15.4-2024's three SS-TWR procedures — §10.29.6.3 deferred (RMI IE in a subsequent
 * message), §10.29.6.4 embedded (RRTI IE, with §10.29.8.1's condition for using it), §10.29.6.5
 * fixed — and §10.32.2's one-to-many fixed reply times FRTi (RMARKER to RMARKER, increasing with
 * i, exchanged by RRTN IE or out of band); ② what this simulator does with each, including that
 * RRTN is not implemented and that the deferred message takes a slot of its own; ③ four runs.
 *
 * The scene is the smallest one that still shows all three: one anchor and one tag 5.00 m apart on
 * a bench, crystals 35 ppm apart (anchor +20, tag −15), and both noise sources switched off — so
 * the three shapes' readings are comparable to the last digit. The base scenario is the DEFERRED
 * shape; the two variants are embedded and fixed. `uwb-deferred-ds` builds its scene with the same
 * function and `method: 'ds'`.
 *
 * Every figure the lesson prints is read back out of its text and compared with a run in
 * tests/course/uwb-reply-time.test.ts; every count that can be computed is computed —
 * `uwbMaxAnchors`, `uwbRespBytes`, `UWB_SS_DEFER_BYTES`, `uwbSlotFitNs` — never typed as a literal.
 */
import type { Scenario } from '../../model/scenario'
import type { TimingSpec } from '../diagram'
import {
  J, anchor, firstUwbPoll, firstUwbRange, firstUwbResp, firstUwbSsDefer, oneRoom, uwbSc, uwbTag,
  type Lesson,
} from '../lessonKit'
import type { UwbReplyTime } from '../../uwb/phy'
import {
  C_M_PER_NS, RDM_ENTRY_BYTES, RRTI_IE_BYTES,
  UWB_SLOT_GUARD_NS, UWB_SS_DEFER_BYTES, rstuNs, uwbDsDeferredReportBytes, uwbFinalBytes,
  uwbMaxAnchors, uwbPollBytes, uwbPpduNs, uwbRespBytes, uwbSlotFitNs, uwbSlotsPerTag,
} from '../../uwb/phy'
import { MMS_SLOTS_PER_MS } from '../../uwb/mms'

/** The true separation of the two devices, in metres — exactly 5.00 m, both at bench height. */
export const BENCH_M = 5

/** The crystals the scene runs: 35 ppm apart, which is inside the standard's ±20 ppm each way. */
export const PPM = { anchor: 20, tag: -15 } as const

/**
 * The fixed reply time FRT1 this scene agrees on, in RSTU (Poll RMARKER to Response RMARKER,
 * standard §10.32.2). Not one whole slot: at exactly one slot this bench's anchor, whose crystal runs
 * 20 ppm fast, starts its Response about 23 ns before slot 1 opens and the tag misses it — the
 * schema's window does not budget for clock offset. 2600 RSTU starts it about 167 µs into its slot.
 * A value the higher layers choose (§10.32.2), so a scene value.
 */
export const FIXED_REPLY_RSTU = 2600

/**
 * One anchor and one tag 5.00 m apart on a bench in a 10 × 8 m lab, both at
 * 1.20 m so the separation is exactly the distance along the bench.
 *
 * The session switches both noise sources off (`tsNoisePs: 0`, `cfoNoisePpm: 0`)
 * and there is no wall between the two devices. That is a deliberate scene
 * choice, not a claim about radios: the lesson's point is that three routes
 * carry the same arithmetic, and two of them return the *identical* number —
 * which a 100 ps timestamp draw would hide behind a couple of centimetres of
 * scatter. `uwb-sstwr` and `uwb-dstwr` are where the noise is measured.
 */
export function uwbReplyTimeScenario(replyTime: UwbReplyTime, method: 'ss' | 'ds' = 'ss'): Scenario {
  return uwbSc(oneRoom(), [
    anchor('anchor-1', 'Anchor 1', 2, 4, 1.2, PPM.anchor),
    uwbTag('tag-1', 'Phone', 2 + BENCH_M, 4, 1.2, PPM.tag),
  ], { method, replyTime, nlos: false, tsNoisePs: 0, cfoNoisePpm: 0, fixedReplyRstu: FIXED_REPLY_RSTU })
}

/** Octets of the three frames the three SS-TWR shapes put on the air, from the PHY itself. */
export const BYTES = {
  poll: uwbPollBytes(1),
  respEmbedded: uwbRespBytes('ss', 'embedded'),
  respDeferred: uwbRespBytes('ss', 'deferred'),
  respFixed: uwbRespBytes('ss', 'fixed'),
  defer: UWB_SS_DEFER_BYTES,
} as const

/** Octets an embedded DS-TWR Final gains per anchor, and the Poll's own growth, as `uwbFinalBytes`
 * and `uwbPollBytes` actually grow. Both numbers decide a cap, so neither is typed. */
export const FINAL_GROWTH = uwbFinalBytes(2, 'embedded') - uwbFinalBytes(1, 'embedded')
/** What one anchor adds to the deferred DS-TWR round's longest frame, the initiator's deferred report. */
export const DEFERRED_REPORT_GROWTH = uwbDsDeferredReportBytes(2) - uwbDsDeferredReportBytes(1)
/** The Poll's own length law, as the cap table's middle column prints it. */
const POLL_GROWTH = `Poll，${uwbPollBytes(0)} + ${RDM_ENTRY_BYTES}A`

/** The anchor cap of each shape — the largest count whose longest frame still fits the PSDU. */
export const CAP = {
  ssEmbedded: uwbMaxAnchors('twr', 'ss', 'embedded'),
  ssDeferred: uwbMaxAnchors('twr', 'ss', 'deferred'),
  ssFixed: uwbMaxAnchors('twr', 'ss', 'fixed'),
  dsEmbedded: uwbMaxAnchors('twr', 'ds', 'embedded'),
  dsDeferred: uwbMaxAnchors('twr', 'ds', 'deferred'),
} as const

/** Anchors the slot-demand comparison is made at — the embedded DS-TWR cap, and its own number. */
export const DEMAND_ANCHORS = CAP.dsEmbedded

/** The shortest slot each shape fits in at {@link DEMAND_ANCHORS} anchors, in nanoseconds. */
export const DEMAND = {
  ss: uwbSlotFitNs(DEMAND_ANCHORS, 'twr', 'time', undefined, 'ss', 'embedded'),
  dsEmbedded: uwbSlotFitNs(DEMAND_ANCHORS, 'twr', 'time', undefined, 'ds', 'embedded'),
} as const

/** A 300 RSTU slot, the shortest the schema accepts — the one the comparison is read against. */
export const SHORT_SLOT_NS = rstuNs(300)

/**
 * The two-sided bound on the fixed reply time `F` (FRT1, Poll RMARKER to Response RMARKER), as the
 * two whole RSTU the schema actually accepts — computed here, not quoted, from the same terms
 * `src/model/scenario.ts` checks it with (2026-11-10: the Poll airtime dropped out, §10.32.2):
 *
 *     S − ToF   ≤   F   ≤   2S − Ar − guard − ToF
 *
 * S is the slot, Ar the Response airtime, ToF the flight. The flight term is
 * the only one that moves with the room, and it is the small one — which is this
 * bound's whole lesson, so the lesson prints it at two distances.
 *
 * WHOLE RSTU, and searched with `rstuNs` rather than divided by it: `rstuNs` is
 * the engine's own conversion and it rounds to the nanosecond, so dividing a
 * nanosecond bound by `rstuNs(1)` (833 ns, where one RSTU is 833.33…) drifts by
 * a part in 2500 — 1.7 RSTU at the upper end, which is larger than the whole
 * effect this function exists to show. The bound is also a bound on an integer
 * field: `fixedReplyRstu` is `z.number().int()`, so the two numbers a reader can
 * actually type are what the lesson should print.
 */
export function fixedWindowRstu(distM: number, slotRstu: number): { lo: number; hi: number } {
  const slotNs = rstuNs(slotRstu)
  const respNs = uwbPpduNs(uwbRespBytes('ss', 'fixed'))
  const tofNs = distM / C_M_PER_NS
  const lowerNs = slotNs - tofNs
  const upperNs = 2 * slotNs - respNs - UWB_SLOT_GUARD_NS - tofNs
  let lo = Math.floor(lowerNs / rstuNs(1))
  while (rstuNs(lo) < lowerNs) lo++
  let hi = Math.ceil(upperNs / rstuNs(1))
  while (rstuNs(hi) > upperNs) hi--
  return { lo, hi }
}

/** The session the scene runs, read back off the scenario rather than restated. */
const SESSION = uwbReplyTimeScenario('deferred').uwb!

/**
 * The three rounds as the timeline lays them out, in microseconds. Every value
 * is read back out of the run in tests/course/uwb-reply-time.test.ts, so the
 * figure cannot drift from it.
 *
 * Read the third lane against the first: the deferred round's Response leaves at
 * the top of slot 1 like every other frame in this simulator, and the fixed
 * round's does not — it leaves inside slot 1, FRT1 after the Poll's RMARKER as the
 * anchor received it, not at the slot boundary. That is the one transmission in
 * the whole simulator that no slot edge decides.
 */
export const FIG = {
  slotUs: 2000,
  pollEndUs: 202.5,
  /** Embedded: the Response carries the reply time, and is seven octets longer for it. */
  respEmbeddedUs: 2190.192,
  /** Deferred and fixed: the same 14-octet Response, in two different places. */
  respDeferredUs: 2183.013,
  fixedStartUs: 2166.64,
  fixedEndUs: 2349.653,
  /** The follow-up message, a whole slot after the Response it completes. */
  deferEndUs: 4188.141,
  axisUs: 6000,
} as const

/** The distance each shape reported at the tag, to six decimals — the run's own numbers. */
export const RANGE_M = {
  embedded: '4.998803',
  deferred: '4.998803',
  fixed: '4.998063',
  ds: '4.999075',
  matched: '5.001420',
} as const

/**
 * The three rounds on one axis, drawn to scale: a slot ruler, then one lane per
 * shape. The lesson's whole comparison is visible as geometry — the embedded
 * lane's Response is the longest bar, the fixed lane's starts inside its slot
 * rather than at its edge, and the deferred lane needs a third slot nothing else
 * needs.
 */
export function uwbReplyTimeTiming(): TimingSpec {
  const poll = { label: `Poll ${BYTES.poll} B`, fromUs: 0, toUs: FIG.pollEndUs, tone: 'accent' as const }
  return {
    kind: 'timing',
    lanes: [
      { label: '时隙', spans: [0, 1, 2].map((i) => ({
        label: `第 ${i} 个`, fromUs: i * FIG.slotUs, toUs: (i + 1) * FIG.slotUs, tone: 'muted' as const,
      })) },
      { label: '嵌入', spans: [poll, {
        label: `${BYTES.respEmbedded} B`, fromUs: FIG.slotUs, toUs: FIG.respEmbeddedUs,
      }] },
      { label: '固定', spans: [poll, {
        label: `${BYTES.respFixed} B`, fromUs: FIG.fixedStartUs, toUs: FIG.fixedEndUs,
      }] },
      { label: '延后', spans: [poll, {
        label: `${BYTES.respDeferred} B`, fromUs: FIG.slotUs, toUs: FIG.respDeferredUs,
      }, {
        label: `延后报文 ${BYTES.defer} B`, fromUs: 2 * FIG.slotUs, toUs: FIG.deferEndUs, tone: 'accent' as const,
      }] },
    ],
    axis: { fromUs: 0, toUs: FIG.axisUs, ticks: [0, 2000, 4000, 6000], unit: 'µs' },
  }
}

/**
 * Slots one SS-TWR round of {@link DEMAND_ANCHORS} anchors takes in one shape. The three arguments
 * between `schedule` and `replyTime` belong to the contention and MMS branches this call never
 * reaches — a time-scheduled two-way round returns before any of them is read — so they are the
 * signature's own values restated, not numbers this lesson chose.
 */
const ssSlots = (replyTime: UwbReplyTime): string => String(uwbSlotsPerTag(
  'ss', DEMAND_ANCHORS, 'time', SESSION.contentionSlots, 'twr', undefined, MMS_SLOTS_PER_MS, replyTime,
))

const WINDOW = fixedWindowRstu(BENCH_M, SESSION.slotRstu)
const WINDOW_FAR = fixedWindowRstu(200, SESSION.slotRstu)

export const uwbReplyTime: Lesson = {
  id: 'uwb-reply-time',
  module: 15,
  title: '一个数值无法写入它自己所测量的那一帧',
  why: '单边双向测距（single-sided two-way ranging, SS-TWR）里，发起方要算出距离，必须得到响应方的回复时延（reply time）Treply，而 Treply 的终点正是响应方发出应答这一帧的时刻。IEEE 802.15.4-2024 因此规定了三种过程（§10.29.1.2.2，§10.29.6.3–§10.29.6.5）。嵌入：响应方能够事先准确确定这一帧的发送时刻，就把 Treply 写进应答里的 RRTI 信息单元（§10.29.6.4、§10.29.8.1）。延后：Treply 在发送之后才确定，于是由后续的一条消息用测距测量信息（ranging measurement information, RMI）信息单元送达（§10.29.6.3）。固定：响应方能够精确控制应答相对于启动消息的发送时刻，双方事先约定 Treply，空口上完全不传送它（§10.29.6.5）；一对多时每个响应方有自己的固定回复时间，从启动消息的 RMARKER（ranging marker）量到应答的 RMARKER，排位越后值越大（§10.32.2）。三种过程代入的是同一个公式，差别只在 Treply 怎样到达发起方。本仿真器三种都实现了：延后的那条消息占用一个单独的时隙；固定回复时间在会话配置里约定，没有实现用于协商它的 RRTN 信息单元；晶振（crystal）的频率偏差以百万分之几（parts per million, ppm）计，本课的场景里两端相差 35 ppm，嵌入与延后读出逐位相同的距离，固定的读数略有不同，因为那段时延按响应方自己的晶振计时。',
  outcomes: [
    '说明一个数值为什么不能写入它自己测量的那一帧，以及标准为嵌入形态提出的要求',
    '指出三种形态里 Treply 的传送方式，以及它们在帧长与时隙数上的差别',
    '说出标准对一对多固定回复时间的约束，并算出本课场景里 F 的上下界',
  ],
  needs: ['uwb-sstwr'],
  terms: [
    { term: 'reply time', plain: '响应方从收到启动消息到发出应答之间的等待时间' },
    { term: 'RRTI IE', plain: 'Ranging Reply Time Instantaneous IE：承载它所在那一帧自身回复时延的信息单元（§10.29.8.1）' },
    { term: 'embedded', plain: '把这个数值写入它所测量的那一帧（§10.29.6.4）' },
    { term: 'deferred', plain: '那一帧先发送而不带这个数值，数值随后由另一条消息携带（§10.29.6.3）' },
    { term: 'fixed', plain: '双方事先约定这个数值，它不在空口上传送（§10.29.6.5）' },
    { term: 'RSTU', plain: '测距调度时间单位（ranging scheduling time unit）：标准规定时隙长度等调度时间所用的单位，HRP UWB 中是 416 个码片，约 833 ns（§10.29.1.5）' },
  ],
  standard: [
    { heading: 'Treply 怎样到达发起方（§10.29.1.2.2）', text: '单边双向测距要在设备 A 算出飞行时间，A 需要设备 B 的回复时延 Treply。Treply 由 B 在发送之后才确定时，需要再发一条消息把它送到 A（§10.29.6.3）；B 能在发送之前准确预知 Treply 时，可以把它嵌入应答本身（§10.29.6.4）；B 如果总能以足够准确的恒定或预知的回复时延应答，就根本不必传送 Treply（§10.29.6.5）。' },
    { heading: '嵌入（§10.29.6.4，图 10-204；§10.29.8.1）', text: '启动帧带 RRMC 信息单元请求回复时延，响应方的应答带 RRTI 信息单元。标准说明，只有发送设备能够准确地预先确定含这个信息单元的那一帧的发送时刻、算出这一时刻与参考时刻之间的时长、并把信息单元插入这一帧时，使用 RRTI 才是合适的。准备 RRTI 需要时间；响应方可以用 RRTN 信息单元告诉对方自己需要的回复时延，也可以在带外约定。RRTI 的内容首部 1 字节，每个回复时延 4 字节，一对一单播时省略地址，所以一个回复时延的 RRTI 共 7 字节（含 2 字节的信息单元头）。' },
    { heading: '延后（§10.29.6.3，图 10-203）', text: '启动帧同样带 RRMC 信息单元请求回复时延。应答完成往返测量；响应方从 MCPS-DATA.indication 原语得到自己的回复时延，再由后续的一条消息用测距测量信息（ranging measurement information, RMI）信息单元把它送给发起方。发起方收到这个信息单元，就能按 §10.29.1.2.2 的公式算出飞行时间。' },
    { heading: '固定（§10.29.6.5，图 10-205）', text: '响应方能够精确控制应答相对于启动消息到达时刻的发送时刻时，回复时延可以是双方约定的已知量，既不嵌入应答，也不另发消息。距离的准确度取决于响应方对发送时刻控制得有多精细：飞行时间每错 1 ns，距离约错 30 cm。约定可以用 RRTN 信息单元完成（§10.29.8.6）；这种过程也可以使用 SP3 格式的包。' },
    { heading: '一对多的固定回复时间（§10.32.2，图 10-226）', text: '第 i 个响应方在固定回复时间 FRTi 处应答；FRTj 从启动消息 P1 的 RMARKER（ranging marker）量到应答 Rj 的 RMARKER。为了让各个应答落在分配给它们的时隙内且互不重叠（overlap），应当满足：i > j 时 FRTi > FRTj；相邻两次发送的间隔减去包长是 K 个 RSTU（ranging scheduling time unit），K 由上层根据接收机的处理能力在建立测距时选定；FRTN 加包长小于 (N + 1) 个时隙。这些值可以在测距开始前用 RRTN 信息单元交换，也可以用带外方式交换。' },
    { kind: 'steps', heading: '延后形态的一次单边双向测距，按标准：逐步说明（§10.29.6.3）', items: [
      '发起方发出启动帧，RRMC 信息单元请求回复时延。',
      '响应方发出应答，不带回复时延；发送之后，它从自己的发送时间戳得到 Treply。',
      '发起方收到应答，得到往返时间 Tround，但还不能算出距离。',
      '响应方用后续的一条消息发出一个 RMI 信息单元，里面是 Treply。',
      '发起方收到这条消息，按 §10.29.1.2.2 的公式算出飞行时间。',
    ] },
  ],
  implementation: [
    { topic: '嵌入', standard: '应答带 RRTI（§10.29.6.4，§10.29.8.1）', sim: '照此：Response 带 RRMC 与 7 字节的 RRTI，共 21 字节。本仿真器的响应方总能预先确定发送时刻。', kind: 'faithful' },
    { topic: '延后', standard: '后续消息带 RMI，内含回复时延（§10.29.6.3）', sim: '照此：Response 只带 RRMC（14 字节）；随后一条 19 字节的消息带一个 RMI 信息单元（一个回复时延，延后模式置一，单播不带地址）。', kind: 'faithful' },
    { topic: '延后消息的时隙', standard: '标准只说「后续的一条消息」', sim: '在应答之后的下一个时隙发出，所以 A 个锚点（anchor）的一轮占 2A + 1 个时隙，而嵌入与固定各占 A + 1 个。', kind: 'choice' },
    { topic: '固定回复时间的定义', standard: 'FRTi 从启动消息的 RMARKER 量到应答的 RMARKER，FRTi 随 i 增大（§10.32.2）', sim: '照此量取；按响应方自己的晶振计时，所以晶振偏差进入这段时延。', kind: 'faithful' },
    { topic: '各响应方的值', standard: '由上层选定，只要求 FRTi > FRTj（§10.32.2）', sim: '会话配置给出 FRT1，第 i 个响应方取 FRT1 加 i − 1 个时隙；本课的场景取 FRT1 = 2600 RSTU。', kind: 'value' },
    { topic: '约定的方式', standard: 'RRTN 信息单元或带外方式（§10.29.8.6，§10.32.2）', sim: '只有带外方式，即两端共用的会话配置；RRTN 信息单元未实现，两端配置不一致的情形不会出现。', kind: 'absent' },
    { topic: 'FRT1 的上下界', standard: '应答落在自己的时隙内且互不重叠；FRTN 加包长小于 (N + 1) 个时隙（§10.32.2）', sim: '编辑器要求：时隙 − 最近飞行时间 ≤ FRT1 ≤ 2 × 时隙 − 应答的空口时间（airtime） − 守卫 − 最远飞行时间；守卫 200 ns 是本仿真器的取值。下界没有计入晶振偏差。K 个 RSTU 的那条约束没有检查。', kind: 'value' },
    { topic: '准时发送', standard: '准确度取决于响应方对发送时刻的控制（§10.29.6.5）', sim: '响应方总是恰好在约定时刻发送，没有抖动，所以固定形态的读数比真实设备理想。', kind: 'choice' },
    { topic: '帧长', standard: 'RRTI、RMI 的字段宽度（§10.29.8.1，§10.29.8.4）；一帧的 PSDU（PHY service data unit）最长 127 字节（§16.2.7）', sim: '字段宽度照标准；帧头（MAC header）9 字节是本仿真器的取值（一律用 16 位短地址）。锚点上限是轮中最长一帧仍不超过 127 字节的最大锚点数，随这些取值而定。', kind: 'value' },
  ],
  labs: [
    {
      heading: '只为传送一个数值而发送的消息',
      jump: 2,
      steps: [
        '载入本课场景（延后形态），依次看这一轮的三帧：Poll、Response 与延后消息。',
        '跳到延后消息，再找测距行出现的时刻，与 Response 到达的时刻对照。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '三种方式，同一条时隙标尺', spec: uwbReplyTimeTiming(),
          caption: `按比例绘制的三轮。嵌入那一轮的 Response 最长：${BYTES.respEmbedded} 字节中有 ${RRTI_IE_BYTES} 个是 RRTI 信息单元。固定与延后的 Response 都只有 ${BYTES.respFixed} 字节。延后的 Response 从第 1 个时隙的边界开始发送，第 2 个时隙里还有一条延后消息；固定的那一条位于第 1 个时隙内部，它的时刻由 Poll 的 RMARKER 加上约定的回复时间决定，与时隙边界无关。`,
        },
      ],
      expect: `这一轮只有三帧：${BYTES.poll} 字节的 Poll、${BYTES.respDeferred} 字节的 Response 与 ${BYTES.defer} 字节的延后消息，整轮那一行写着 3 slots。测距行出现在 4.188 ms，即延后消息到达的时刻，而不是 2.183 ms 的 Response 到达时。`,
      meaning: 'Response 到达时发起方只有往返时间，还不能算出距离，这正是 ① 的延后过程；延后消息单独占一个时隙是本仿真器的安排（②）。',
    },
    {
      heading: '三种形态的帧长、时隙与锚点上限',
      variant: 0,
      more: [1],
      steps: [
        '载入「嵌入」，看 Response 的长度与整轮的时隙数；再载入「固定」看同样两项。',
        '对照下面两张表：一个锚点的这一轮，以及按同样的帧长规则推到更多锚点时的情形；双边延后形态里最长的一帧是发起方的延后数据帧（data frame）。',
      ],
      blocks: [
        { kind: 'table', heading: '三种形态的帧长差异', head: ['帧', '嵌入', '延后', '固定'], rows: [
          ['Poll', `${BYTES.poll} B`, `${BYTES.poll} B`, `${BYTES.poll} B`],
          ['Response', `${BYTES.respEmbedded} B`, `${BYTES.respDeferred} B`, `${BYTES.respFixed} B`],
          ['延后消息', '—', `${BYTES.defer} B`, '—'],
          ['一轮的时隙数', 'A + 1', '2A + 1', 'A + 1'],
          [`A = ${DEMAND_ANCHORS} 时的时隙数`, ssSlots('embedded'), ssSlots('deferred'), ssSlots('fixed')],
        ] },
        { kind: 'table', heading: '每种形态自己的锚点上限', head: ['形态', '轮里最长的一帧', '锚点上限'], rows: [
          ['SS-TWR 嵌入', POLL_GROWTH, String(CAP.ssEmbedded)],
          ['SS-TWR 延后', POLL_GROWTH, String(CAP.ssDeferred)],
          ['SS-TWR 固定', POLL_GROWTH, String(CAP.ssFixed)],
          ['DS-TWR 嵌入', `Final，${uwbFinalBytes(0, 'embedded')} + ${FINAL_GROWTH}A`, String(CAP.dsEmbedded)],
          ['DS-TWR 延后', `延后数据帧，${uwbDsDeferredReportBytes(0)} + ${DEFERRED_REPORT_GROWTH}A`, String(CAP.dsDeferred)],
        ] },
      ],
      expect: `嵌入的 Response 是 ${BYTES.respEmbedded} 字节，固定与延后都是 ${BYTES.respFixed} 字节，相差的 ${RRTI_IE_BYTES} 个字节就是 RRTI 信息单元；嵌入与固定一轮两个时隙，延后三个。单边三种形态的上限都是 ${CAP.ssEmbedded}，双边嵌入是 ${CAP.dsEmbedded}，双边延后是 ${CAP.dsDeferred}。`,
      meaning: `延后省下的 ${RRTI_IE_BYTES} 个字节，换来一条 ${BYTES.defer} 字节的消息和每个锚点多一个时隙（②）。上限由轮中最长的一帧决定：单边的轮里没有 Final，最长的是每个锚点只增长 ${RDM_ENTRY_BYTES} 字节的 Poll；这些上限依赖本仿真器的地址取法（②）。`,
    },
    {
      heading: '同一段距离，五种方式',
      more: [0, 1],
      steps: [
        '依次载入本课场景、「嵌入」与「固定」，读出手机的测距行，保留六位小数。',
        '对照下表；双边两种形态的读数来自下一课的场景，即同样两台设备改用双边双向测距（double-sided two-way ranging, DS-TWR）。',
      ],
      blocks: [
        { kind: 'formula', heading: '计算公式完全不变', text: 'T̂prop = (Tround − Treply·(1 − Coffs)) / 2', note: '三种单边形态代入的是同样两个量，只是 Treply 的来源不同：嵌入取自 Response，延后取自后一条消息，固定取自事先约定的这个响应方的固定回复时间。' },
        { kind: 'table', heading: '同一段距离，五种方式的测量结果', head: ['形态', '两端晶振相差 35 ppm', '两端频率一致'], rows: [
          ['SS-TWR 嵌入', `${RANGE_M.embedded} m`, `${RANGE_M.matched} m`],
          ['SS-TWR 延后', `${RANGE_M.deferred} m`, `${RANGE_M.matched} m`],
          ['SS-TWR 固定', `${RANGE_M.fixed} m`, `${RANGE_M.matched} m`],
          ['DS-TWR 嵌入', `${RANGE_M.ds} m`, `${RANGE_M.matched} m`],
          ['DS-TWR 延后', `${RANGE_M.ds} m`, `${RANGE_M.matched} m`],
        ] },
      ],
      expect: `真值是 ${BENCH_M.toFixed(2)} m。嵌入与延后读出完全相同的 ${RANGE_M.embedded} m；固定读出 ${RANGE_M.fixed} m；双边两种都是 ${RANGE_M.ds} m，最接近真值。两端频率一致时，五种读数都是 ${RANGE_M.matched} m。`,
      meaning: '传送方式只决定 Treply 何时、以哪一帧到达，不改变计算（①）。固定形态的差异来自本仿真器让响应方按自己的晶振计时那段约定的时延（②）：晶振快 20 ppm，那段时延就短 20 ppm。',
    },
    {
      heading: '固定回复时间的上下界',
      variant: 1,
      steps: [
        `载入「固定」：Response 的发送时刻从 2.000 ms 推迟到 2.167 ms，它的 RMARKER 在 Poll 的 RMARKER 之后 ${SESSION.fixedReplyRstu} RSTU（按锚点的晶振计）。`,
        `在编辑器里把固定回复时间向两个方向调整：越过 ${WINDOW.hi} 会被拒绝；退到半个时隙，即 ${SESSION.slotRstu / 2} RSTU，也会被拒绝，两条错误消息的理由不同。`,
      ],
      blocks: [
        { kind: 'formula', heading: '本仿真器检查的不等式', text: '时隙 − 飞行时间  ≤  F  ≤  2 × 时隙 − Response − 守卫 − 飞行时间', note: `本课这一轮：时隙 ${SESSION.slotRstu} RSTU，Response ${(uwbPpduNs(BYTES.respFixed) / rstuNs(1)).toFixed(1)} RSTU，于是 F 只能取 ${WINDOW.lo} 到 ${WINDOW.hi} RSTU。` },
      ],
      expect: `F 过大，Response 来不及在自己的时隙内发送完毕，消息说它会被时隙边界截断；F 过小，Response 落入尚未轮到它的时隙，排在第一位的锚点会在 ${(rstuNs(SESSION.slotRstu / 2) / 1e6).toFixed(2)} ms 处发送。把两台设备的距离从 ${BENCH_M} m 增加到 200 m，上界只从 ${WINDOW.hi} 降到 ${WINDOW_FAR.hi} RSTU。`,
      meaning: `上界对应 ① 的「FRTN 加包长小于 (N + 1) 个时隙」，守卫与飞行时间两项是本仿真器另外扣除的（②）。本课取 ${SESSION.fixedReplyRstu} 而不是下界 ${WINDOW.lo}：下界没有计入晶振偏差，锚点的晶振快 20 ppm，取一个完整时隙时它的 Response 会在第 1 个时隙开始之前约 23 ns 发出。`,
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.2.2（Treply 的三种传送途径）、§10.29.6.3 与图 10-203（延后，RMI 信息单元）、§10.29.6.4 与图 10-204（嵌入，RRTI 信息单元，RRTN）、§10.29.6.5 与图 10-205（固定回复时间，1 ns 约 30 cm）、§10.29.8.1（RRTI 信息单元，使用条件，地址规则）、§10.29.8.4（RMI 信息单元）、§10.29.8.6（RRTN 信息单元）、§10.32.2 与图 10-226（一对多的固定回复时间）、§10.29.1.5（RSTU）、§16.2.7（127 字节的 PSDU）。',
    '本仿真器的取值与取法：2 ms 的测距时隙（通常认为来自 FiRa 的缺省配置，FiRa 规范不在核查用的语料里）、时隙末尾 200 ns 的守卫、16 位短地址的帧头（9 字节）、延后消息占下一个时隙、FRTi = FRT1 + (i − 1) 个时隙、FRT1 = 2600 RSTU、固定回复时间在带外约定。',
    '本课这一轮把时间戳噪声与时钟偏差估计噪声都设为零，两端之间也没有墙，所以三种形态的读数可以逐位比较；开启噪声时它们只在噪声范围内一致，这一点在讲两端时钟的两课中测量过。',
  ],
  limits: [],
  scenario: () => uwbReplyTimeScenario('deferred'),
  variants: [
    { label: '嵌入：该数值在 Response 中', scenario: () => uwbReplyTimeScenario('embedded') },
    { label: '固定：该数值不在空口传送', scenario: () => uwbReplyTimeScenario('fixed') },
  ],
  jumps: [
    J('Poll 从手机发出', firstUwbPoll),
    J('Response：不携带该数值', firstUwbResp),
    J('延后消息：只为传送一个数值而发送', firstUwbSsDefer),
    J('测距行：距离到这一刻才出现', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '为什么「把回复时延写入应答」对设备有要求？',
      options: [
        '因为这个数值有四个字节，短帧容纳不下',
        '因为这个数值的终点就是这一帧自身的发送时刻，组帧完成之前必须已经知道它',
        '因为要先测出对方的时钟偏差（clock offset）才能算出它',
      ],
      answer: 1,
      explain: '§10.29.8.1：只有能准确预先确定发送时刻、算出时长并插入信息单元的设备，使用 RRTI 才合适。做不到，就先发送、再读取时间戳、再用 RMI 补发，这就是延后形态。',
    },
    {
      q: '嵌入与延后在本课这一轮中读出完全相同的距离，这说明什么？',
      options: [
        '两者都恰好抵消了晶振误差，所以都是准的',
        '传送方式只决定 Treply 何时到达发起方，不决定计算出的距离',
        '延后消息中的那个数值其实是从 Response 中复制的',
      ],
      answer: 1,
      explain: '同一个公式，同样两个量，只是其中一个量的传送方式不同。三种形态的差别在于时隙、帧长与对设备的要求。',
    },
    {
      q: '按标准，一对多的固定回复时间 FRTi 从哪里量到哪里？',
      options: [
        '从启动消息接收完毕量到应答开始发送',
        '从启动消息的 RMARKER 量到第 i 个应答的 RMARKER，并且 i 越大值越大',
        '从时隙边界量到应答开始发送，所有响应方共用一个值',
      ],
      answer: 1,
      explain: '§10.32.2 与图 10-226：RMARKER 到 RMARKER，每个响应方一个值，FRTi > FRTj（i > j）。',
    },
    {
      q: '固定形态的那个约定值调得太小，在本仿真器里会发生什么？',
      options: [
        '响应会被自己时隙的边界截断，整轮超时',
        '响应会落入一个尚未轮到它的时隙，编辑器拒绝这个设置',
        '距离会偏小，偏差恰好等于约定值不足的部分',
      ],
      answer: 1,
      explain: '这个区间上下两端都受限，两种越界的失败方式不同：过大会被自己的时隙截断，过小会发送到尚未轮到它的时隙。',
    },
  ],
}
