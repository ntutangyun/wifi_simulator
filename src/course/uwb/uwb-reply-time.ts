/**
 * UWB Tier 1 · M14 两个时钟 · You cannot put a number inside the frame that measures it.
 *
 * IEEE Std 802.15.4-2024 §10.29.6 lists five two-way ranging procedures. They
 * measure the same distance with the same arithmetic (`src/uwb/ranging.ts` is
 * untouched by the slice that added them); what differs is the route each time
 * takes from the device that produced it to the device that needs it. This
 * lesson teaches the one constraint that makes three of those routes necessary,
 * and it is design §2 of
 * docs/superpowers/specs/2026-09-29-reply-time-design.md in one sentence:
 *
 *   `Treply = T3 − T2`, and **T3 is this frame's own transmit instant** — so to
 *   write `Treply` into that frame, the responder must know when it will
 *   transmit before it has transmitted.
 *
 * Hence §10.29.6.4 embedded (the hardware can pre-schedule, so T3 is known),
 * §10.29.6.3 deferred (it cannot, so the reply time follows in a message of its
 * own, one slot later), and §10.29.6.5 fixed (agreed in advance, so the number
 * never goes on the air at all).
 *
 * The scene is the smallest one that still shows all three: one anchor and one
 * tag 5.00 m apart on a bench, crystals 35 ppm apart (anchor +20, tag −15), and
 * both noise sources switched off — so the three shapes' readings are
 * comparable to the last digit rather than to a σ, which is what makes "the
 * same arithmetic over a different carrier" a thing a reader can see rather
 * than take on trust. The base scenario is the DEFERRED shape, because the
 * frame that only exists in it is the whole turning point of the lesson; the
 * two variants are embedded and fixed.
 *
 * 2026-11-10 (W2, audit #4/#5/#8): the deferred message now carries an RMI IE (§10.29.6.3), the RRTI
 * IE has its 1-octet content header, the PHR is 21 symbols, and the fixed reply time is FRT1 measured
 * RMARKER to RMARKER with one value per responder (§10.32.2, Figure 10-226); the figures follow.
 *
 * Every number the lesson prints is pinned in tests/course/uwb-reply-time.test.ts,
 * and every count that can be computed is computed — `uwbMaxAnchors`,
 * `uwbRespBytes`, `UWB_SS_DEFER_BYTES`, `uwbSlotFitNs` — never typed as a literal.
 * `npx tsx scripts/lesson-dump.ts uwb-reply-time` prints it with its length.
 */
import type { Scenario } from '../../model/scenario'
import type { TimingSpec } from '../diagram'
import {
  J, anchor, firstUwbPoll, firstUwbRange, firstUwbResp, firstUwbSsDefer, oneRoom, uwbSc, uwbTag,
  type Lesson,
} from '../lessonKit'
import type { UwbReplyTime } from '../../uwb/phy'
import {
  C_M_PER_NS, RDM_ENTRY_BYTES, RRTI_IE_BYTES, UWB_FCS_BYTES, UWB_MAX_PSDU_BYTES,
  UWB_MHR_BYTES, UWB_SLOT_GUARD_NS, UWB_SS_DEFER_BYTES, rstuNs, uwbDsDeferredReportBytes, uwbFinalBytes,
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
  why: '前两课都把回复时延（reply time）当作 Response 帧中已有的一个数值：锚点（anchor）填入，标签（tag）减去。但这个数值测量的是「从收到 Poll 到发出这一帧」——而「发出这一帧」正是这一帧自身的发送时刻。要把它写入帧中，锚点必须在发送之前就知道自己的发送时刻。标准为此规定了三种方式（§10.29.6.3–§10.29.6.5）。嵌入：响应方能够事先准确确定这一帧的发送时刻，数值即可写入 Response，标签收到后即可算出距离。延后：Response 照常发送但不携带这个数值，发送后读取自己的时间戳，再用后续的一条报文发出，报文里由测距测量信息（ranging measurement information, RMI）信息单元承载它——在本课的时隙安排里，这条报文要占用一个单独的测距时隙（ranging slot），每增加一个锚点，一轮就增加两个时隙而不是一个，代价远大于节省的那几个字节。固定：双方事先约定这段时延，标签自行重建这一数值，不占用任何空口字节；标准把这段时延定义为从 Poll 的 RMARKER（ranging marker）到 Response 的 RMARKER，一对多测距时每个响应方各有一个值，排位越后值越大。本仿真器按此实现：第一个响应方的值取会话配置的 F，后面每个响应方的值依次多一个时隙。要求变成了必须准时发送，且约定值有上下界——过大，Response 无法在自己的时隙内发送完毕；过小，它会落入尚未轮到它的时隙，而那里没有接收方在接收。三种方式代入的是同一个公式：两端晶振（crystal）频率一致时，三者读数逐位相同；晶振有偏差时，嵌入与延后仍逐位相同，固定略有差异，因为那段时延是按锚点自己的晶振计时的。按本课的帧长取值，一轮最多能支持几个锚点，由轮中最长的一帧决定：单边三种形态中最长的是 Poll，所以它们能支持的锚点数远多于以 Final 为最长帧的双边嵌入式。',
  outcomes: [
    '说明一个数值为什么不能写入它自己测量的那一帧，以及嵌入形态为什么能够写入',
    '在三种形态中指出这个数值的传递方式、各占几个测距时隙（ranging slot）、帧长相差几个字节',
    '算出固定形态那个约定值的上下界，并说出越界时的两种不同失败方式',
  ],
  needs: ['uwb-sstwr'],
  terms: [
    { term: 'reply time', plain: '响应方从收到 Poll 到发出 Response 之间的等待时间' },
    { term: 'RRTI IE', plain: 'Ranging Reply Time Instantaneous IE：承载它所在那一帧自身回复时延的信息单元（§10.29.8.1）；单播帧中带一个回复时延时共七个字节：两字节头部、一字节内容首部、四字节时间值' },
    { term: 'embedded', plain: '把这个数值写入它所测量的那一帧' },
    { term: 'deferred', plain: '那一帧先发送而不带这个数值，数值随后由一条专门的报文携带' },
    { term: 'fixed', plain: '双方事先约定这个数值，它不占用任何空口字节' },
    { term: 'RSTU', plain: '测距调度时间单位（ranging scheduling time unit）：标准规定时隙长度等调度时间所用的单位，HRP UWB 中是 416 个码片，1 RSTU 约 833 ns（§10.29.1.5）' },
  ],
  picture: [
    { heading: '一个数，和它自己测量的那一帧', text: '单边双向测距（single-sided two-way ranging, SS-TWR）里，那段等待写成 Treply = T3 − T2：T2 是锚点收到 Poll 的时刻，T3 是它发出 Response 的时刻。两个读数都取自锚点自己的计数器，相减即得，不涉及对方的时钟。唯一的问题是——T3 是这一帧自身的发送时刻。要把 Treply 写入这一帧，发射机必须在这一帧组帧完成之前就知道自己的发送时刻。' },
    { kind: 'watch', jump: 2, heading: '只为传送一个数值而发送的报文', text: `载入仿真。这一轮只有三帧：${BYTES.poll} 字节的 Poll、${BYTES.respDeferred} 字节的 Response，以及一条 ${BYTES.defer} 字节的报文。跳到第三帧——它除了那个数值以外不携带任何内容，而它存在的原因正是上一帧无法携带这个数值。` },
    {
      kind: 'diagram', heading: '三种方式，同一条时隙标尺', spec: uwbReplyTimeTiming(),
      caption: `按比例绘制的三轮，使用同一刻度。每条泳道最左边是 Poll，紧随其后的是这一轮的 Response，字节数标注在条上。嵌入那一轮的 Response 最长——${BYTES.respEmbedded} 字节中有 ${RRTI_IE_BYTES} 个是承载那段等待时间的信息单元；固定与延后的都只有 ${BYTES.respFixed} 字节，少的正是那 ${RRTI_IE_BYTES} 个字节。位置也不同：延后的 Response 从第 1 个时隙的边界开始发送，第 2 个时隙中还要再发一条延后报文；固定的那一条则位于第 1 个时隙内部——它从 Poll 的 RMARKER 开始计时，与时隙边界无关。`,
    },
    { heading: '嵌入：硬件支持预定发送时刻', text: '标准的要求是：只有能事先准确确定这一帧发送时刻、并在组帧时算出那段时长的设备，才适合在帧中携带回复时延信息单元（RRTI IE，§10.29.8.1）。实现上，这通常意味着发射机支持「在指定时刻发射」这种命令，而不只是「立即发送」。如果支持，T3 在组帧之前就已知，于是那段等待时间可以立即算出并写入帧中，接收端收到 Response 的同时就能得到距离。前两课采用的都是这种方式。' },
    { heading: '延后：先发送，再读取自己的时间戳', text: '不支持预定发送的设备还有另一种方式：Response 照常发送，只是不携带这个数值；发送之后读取这次发送的时间戳，此时 T3 已是实测值，再用后续的一条报文将其发出。标准规定这个值由测距测量信息（RMI）信息单元承载（§10.29.6.3），本仿真器照此实现：RMI 的回复时延字段、延后模式置一，单播帧中不带地址。在本课的时隙安排里，这条报文要占用一个单独的时隙，所以每增加一个锚点，一轮就增加两个时隙而不是一个——它以一个时隙为代价，免除了对硬件的那项要求。' },
    { heading: '固定：这个数值不在空口传送', text: '第三种方式完全不传送：双方事先约定一个值（可以事先用 RRTN IE 协商，§10.29.8.6），响应方在相对于 Poll 的这一固定时延处发送（§10.29.6.5）。标准把这段时延定义为从 Poll 的 RMARKER 到 Response 的 RMARKER，一对多测距时每个响应方各有自己的值（§10.32.2 的图 10-226），本仿真器照此实现，见下面的步骤。发起方知道每个响应方的值，于是它自己就能重建那段等待时间——帧中不为它占用任何字节。要求只是发生了转移：从「能够预定发送时刻」变成「必须在那个时刻准时发送」，而偏离这一时刻有两种情形。' },
    { heading: '双边双向测距为什么只有两种', text: '双边双向测距（double-sided two-way ranging, DS-TWR）面对的是同一个问题的另一半：Final 是否携带标签自己测得的那两个时间。携带，就是嵌入（§10.29.6.7）；不携带，就是延后——按标准（§10.29.6.6），标签随后再用一帧延后的数据帧（data frame）把这两个时间发给锚点，锚点随后算出距离；本仿真器照此实现。标准的五种过程中，双边形态只有这两种，没有「固定」——下一课专门讲解这一半。' },
  ],
  numbers: [
    { kind: 'formula', heading: '计算公式完全不变', text: 'T̂prop = (Tround − Treply·(1 − Coffs)) / 2', note: `三种形态代入这个公式的是同样两个量，只是 Treply 的来源不同：嵌入取自 Response、延后取自后一条报文、固定取自事先约定的这个响应方的固定回复时间。所以两端晶振（crystal）频率相同时——百万分之几（parts per million, ppm）的差异为零——三种形态读出同一个 ${RANGE_M.matched} m，逐位相同。` },
    { kind: 'table', heading: '三种形态的帧长差异', head: [
      '帧', '嵌入', '延后', '固定',
    ], rows: [
      ['Poll', `${BYTES.poll} B`, `${BYTES.poll} B`, `${BYTES.poll} B`],
      ['Response', `${BYTES.respEmbedded} B`, `${BYTES.respDeferred} B`, `${BYTES.respFixed} B`],
      ['延后报文', '—', `${BYTES.defer} B`, '—'],
      ['一轮的时隙数', 'A + 1', '2A + 1', 'A + 1'],
      [`A = ${DEMAND_ANCHORS} 时的时隙数`, ssSlots('embedded'), ssSlots('deferred'), ssSlots('fixed')],
    ] },
    { text: `Response 相差的 ${RRTI_IE_BYTES} 个字节就是承载那段等待时间的信息单元（RRTI IE）：两字节头部、一字节内容首部加四字节时间值（§10.29.8.1）。延后的那条报文承载的是 RMI 信息单元——两字节头部、两字节内容首部加四字节回复时延（§10.29.8.4）——外加一个帧头（MAC header）与一个帧校验序列（frame check sequence, FCS），共 ${BYTES.defer} 字节，再加一个完整时隙，代价远大于节省的那 ${RRTI_IE_BYTES} 个字节。` },
    { kind: 'table', heading: '每种形态自己的锚点上限', head: [
      '形态', '轮里最长的一帧', '锚点上限',
    ], rows: [
      ['SS-TWR 嵌入', POLL_GROWTH, String(CAP.ssEmbedded)],
      ['SS-TWR 延后', POLL_GROWTH, String(CAP.ssDeferred)],
      ['SS-TWR 固定', POLL_GROWTH, String(CAP.ssFixed)],
      ['DS-TWR 嵌入', `Final，${uwbFinalBytes(0, 'embedded')} + ${FINAL_GROWTH}A`, String(CAP.dsEmbedded)],
      ['DS-TWR 延后', `延后数据帧，${uwbDsDeferredReportBytes(0)} + ${DEFERRED_REPORT_GROWTH}A`, String(CAP.dsDeferred)],
    ] },
    { heading: '上限随形态而变，不是同一个数', text: `上限不是固定的常数，而是按标准的字段宽度计算得出的：使轮中最长的那一帧仍能容纳于 ${UWB_MAX_PSDU_BYTES} 字节 PSDU（PHY service data unit）的最大锚点数。${CAP.dsEmbedded} 这个数属于双边嵌入式 Final——每增加一个锚点它增长 ${FINAL_GROWTH} 字节，${CAP.dsEmbedded} 个锚点时恰好 ${uwbFinalBytes(CAP.dsEmbedded, 'embedded')} 字节。而单边三种形态的轮中根本没有 Final，最长的是每个锚点只增长 ${RDM_ENTRY_BYTES} 字节的 Poll，上限是 ${CAP.ssEmbedded}；双边延后形态最长的是发起方的延后数据帧，每个锚点增长 ${DEFERRED_REPORT_GROWTH} 字节，上限是 ${CAP.dsDeferred}。${CAP.dsEmbedded} 这个上限不能套用到另外四种形态上。` },
    { heading: '时隙长度也按最长的那一帧确定', text: `在本课的场景里，时隙长度的道理相同。${DEMAND_ANCHORS} 个锚点时，单边一轮最长的帧需要 ${(DEMAND.ss / 1000).toFixed(1)} µs 的时隙，双边嵌入式需要 ${(DEMAND.dsEmbedded / 1000).toFixed(1)} µs——多出的 ${((DEMAND.dsEmbedded - DEMAND.ss) / 1000).toFixed(1)} µs 是为单边轮次中根本不发送的 Final 预留的。一个 300 RSTU（ranging scheduling time unit）的时隙为 ${(SHORT_SLOT_NS / 1000).toFixed(0)} µs：能容纳 ${DEMAND_ANCHORS} 个锚点的单边一轮，不能容纳六个锚点的双边嵌入式一轮。` },
    { kind: 'table', heading: '同一段距离，五种方式的测量结果', head: [
      '形态', '两端晶振相差 35 ppm', '两端频率一致',
    ], rows: [
      ['SS-TWR 嵌入', `${RANGE_M.embedded} m`, `${RANGE_M.matched} m`],
      ['SS-TWR 延后', `${RANGE_M.deferred} m`, `${RANGE_M.matched} m`],
      ['SS-TWR 固定', `${RANGE_M.fixed} m`, `${RANGE_M.matched} m`],
      ['DS-TWR 嵌入', `${RANGE_M.ds} m`, `${RANGE_M.matched} m`],
      ['DS-TWR 延后', `${RANGE_M.ds} m`, `${RANGE_M.matched} m`],
    ] },
    { text: `真值是 ${BENCH_M.toFixed(2)} m。嵌入与延后读出的是完全相同的数：同一套计算，只是那个数值的传递路径不同——这正是本课要证明的一点。固定读出的结果不同，因为它那段时延是按响应方自己的晶振计时的，误差来源因此不同。双边的两种最接近真值，这正是双边双向测距存在的理由。` },
    { kind: 'steps', heading: '固定形态一轮的步骤', items: [
      '会话配置中规定第一个响应方的固定回复时间 F，单位为 RSTU；第 i 个响应方的值是 F 再加 i − 1 个时隙（本仿真器的取值，满足标准「排位越后值越大」的要求）。两端都持有这份配置，此后它不在空口传送（标准允许事先用 RRTN IE 或带外方式交换，§10.32.2；本仿真器用带外方式，即会话配置，没有实现 RRTN IE）。',
      '标签发送 Poll，锚点为它的 RMARKER 打上到达时间戳。固定回复时间从这个 RMARKER 开始计算（§10.32.2 的图 10-226）。',
      '锚点让自己 Response 的 RMARKER 恰好落在 Poll 的 RMARKER 之后它自己那个固定回复时间处，也就是在那之前一个前导码（preamble）与帧起始定界符（start-of-frame delimiter, SFD）的时长开始发送。按自己的晶振计时，所以晶振的偏差会进入这段时延。',
      '标签收到 Response。它知道这个锚点的固定回复时间，于是重建出那段等待时间——这个值从未被发送给它，但它可以计算出来。',
      '将重建出的等待时间按时钟偏差（clock offset）缩放，再代入上面的公式，即得到距离，而空口上没有为它占用任何字节。',
    ] },
    { heading: 'F 的取值有上下界', text: `下面的上下界来自时隙安排：每个应答必须完整地落在自己的时隙里（标准也要求应答落在分配给它的时隙内且不得相互重叠（overlap），§10.32.2）。F 过大，Response 尚未发送完毕，自己的时隙就已结束——接收窗口已关闭，整轮以超时结束，尽管 Poll 已被正确接收。F 过小，Response 会落入一个尚未轮到它的时隙，那里没有接收方在接收。所以这是一个上下两端都受限的区间。F 从 RMARKER 量到 RMARKER，Poll 的长度不进入它，决定它的是时隙长度与 Response 的空口时间（airtime）：` },
    { kind: 'formula', text: '时隙 − 飞行时间  ≤  F  ≤  2 × 时隙 − Response − 守卫 − 飞行时间', note: `本课这一轮：时隙 ${SESSION.slotRstu} RSTU、Response ${(uwbPpduNs(BYTES.respFixed) / rstuNs(1)).toFixed(1)} RSTU，于是 F 只能取 ${WINDOW.lo} 到 ${WINDOW.hi} RSTU——这正是编辑器接受的整数范围。本课的会话取 ${SESSION.fixedReplyRstu} RSTU，没有取下界上的一个完整时隙：这个区间没有计入晶振偏差，而本课锚点的晶振快 20 ppm，取一个完整时隙时它的 Response 会比第 1 个时隙的边界早约 23 ns 开始发送，标签的接收窗口还没有打开。` },
    { text: `飞行时间的影响很小：把两台设备的距离从 ${BENCH_M} m 增加到 200 m，上界也只从 ${WINDOW.hi} 降到 ${WINDOW_FAR.hi} RSTU，恰好一个 RSTU。真正容易出问题的是下界——取半个时隙、即 ${SESSION.slotRstu / 2} RSTU 时，排在第一位的锚点会在 ${(rstuNs(SESSION.slotRstu / 2) / 1e6).toFixed(2)} ms 处发送，而那时它自己的时隙还没有开始。` },
  ],
  deeper: [
    { heading: '延后的那一帧也打了时间戳，但没有被使用', text: '延后报文和 Response 一样是一帧测距帧：两端都为它的发送与到达打了时间戳，时间轴上的 UWB_TS 行可以看到。但计算中一个都不使用——标签使用的是 Response 那次接收测得的往返时间和时钟偏差，只从这条报文中取出那一个数值。打时间戳本身符合标准的规定：测距功能开启期间，收到的每一帧测距帧都会产生时间戳报告（§10.29.5），设备无法选择某一帧不打时间戳，时间轴也因此保持对称。代价是查看帧检视面板的读者可能误以为那两个时间戳参与了测量。' },
    { heading: '为什么每个响应方多一个整时隙', text: '标准为每个响应方分别约定一个固定回复时间，只要求排位越后的值越大、应答落在各自的时隙内（§10.32.2 的图 10-226）；具体取什么值由上层决定。本仿真器取第 k 个锚点的值为 F + k·S（k 从 0 起）。把不等式完整写出就能看出这样取的好处。记轮起点 T0、时隙长 S、Response 空口时间 Ar、飞行时间 ToF。两帧的 RMARKER 都在各自帧头之后同样的位置，所以第 k 个锚点在 T0 + ToF + F + k·S 处开始发送，而这一时刻必须落在第 k+1 个时隙之内：不早于 T0 + (k+1)·S，也不晚到 T0 + (k+2)·S 减去 Ar 与守卫时间。两边消去 k·S，k 就不再出现：一个 F 的上下界对所有响应方同时适用。这些值在测距开始之前用 RRTN IE 或带外方式交换（§10.29.8.6），测距过程中不在空口传送。' },
  ],
  limits: [
    { kind: 'out-of-scope', text: '本课没有任何一条空口消息能启停或重配一次测距会话（标准 §10.29.6.2 的控制与结果传输，控制那一半）：使用哪一种形态是场景中事先规定的配置，一轮开始之前就已确定，整个运行过程中不变。真实设备要先通过管理原语建立会话、协商参数，而本课没有这一流程——所以本课讲的是三种形态各自的结果，而不是设备如何选定某一种形态。' },
    { kind: 'unmodelled', text: '两端不协商这个数值。真实设备可以用 RRTN IE 提出「期望的回复时延」，对方接受或另行提出一个值；本课中没有这个信息单元，也没有承载它的帧。三种形态是场景事先规定的，配置不一致的两台设备在本课中既不会被发现，也不会被纠正——它们只会各自计算，然后给出一个错误的距离，而没有任何记录可以解释这一错误。' },
    { kind: 'unmodelled', text: '本课中固定形态的响应方总是精确地在约定时刻发送：它的 Response 的 RMARKER 恰好落在「Poll 的 RMARKER + 它的固定回复时间」处（按它自己的晶振计时），一纳秒不差。真实设备的收发转换、中断与调度都会使这一时刻产生抖动，而这一抖动会直接成为测距误差——Treply 偏差 1 ns，距离就偏差约 15 cm（误差是它的一半乘以光速）。这是固定形态在实际中的弱点，本课没有对它建模，所以本课那张五种形态读数表中，固定那一格比真实设备上测得的理想得多。' },
    { kind: 'model-value', text: `帧长表里的字段宽度按标准：RRTI IE ${RRTI_IE_BYTES} 字节（§10.29.8.1：两字节头部、一字节内容首部、四字节回复时延），帧校验 ${UWB_FCS_BYTES} 字节。帧头 ${UWB_MHR_BYTES} 字节是本仿真器的取值——帧头长度随寻址方式而变，本仿真器一律用 16 位短地址；时隙守卫 ${UWB_SLOT_GUARD_NS} ns 也是本仿真器的取值，标准没有规定。所以「Response 相差 ${BYTES.respEmbedded - BYTES.respFixed} 个字节」只取决于标准，「延后报文 ${BYTES.defer} 字节」「上限从 ${CAP.dsEmbedded} 变为 ${CAP.ssEmbedded}」还取决于寻址方式：换成扩展地址，后两个数都要重新计算，但结论的方向不会改变。` },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.29.6 列出五种双向测距过程，本课讲其中三种：§10.29.6.3 回复时间延后、§10.29.6.4 回复时间嵌入、§10.29.6.5 固定回复时间。回复时延与往返时间信息这两个信息单元在 §10.29.8.1 与 §10.29.8.4；一帧最长 127 字节的 PSDU 由 §16.2.7 的物理头字段决定；±20 ppm 的晶振容差来自 §16.4.9。这一课完全不依赖任何草案。',
    '三个取值是本仿真器自己的模型选择：2 ms 的测距时隙（来自 FiRa 的缺省配置，不是标准正文）、时隙末尾 200 ns 的飞行守卫，以及 16 位短地址的帧头——帧头 9 字节；RRTI IE 7 字节与帧校验 2 字节是标准的宽度。本课场景的固定回复时间取 2600 RSTU，是从上面那个上下受限的不等式中选取的，不是标准给出的数。',
    '本课这一轮把时间戳噪声与时钟偏差估计噪声都调成零，两端之间也没有墙。这是为了使三种形态的读数可以逐位比较——开启噪声时它们只在噪声范围内一致，这一点已在讲两端时钟的两课中测量过。',
  ],
  scenario: () => uwbReplyTimeScenario('deferred'),
  variants: [
    { label: '嵌入：该数值在 Response 中', scenario: () => uwbReplyTimeScenario('embedded') },
    { label: '固定：该数值不在空口传送', scenario: () => uwbReplyTimeScenario('fixed') },
  ],
  jumps: [
    J('Poll 从手机发出', firstUwbPoll),
    J('Response：不携带该数值', firstUwbResp),
    J('延后报文：只为传送一个数值而发送', firstUwbSsDefer),
    J('测距行：距离到这一刻才出现', firstUwbRange),
  ],
  observe: [
    `整轮那一行写着 "3 slots"：一个锚点的单边一轮占了三个时隙，而嵌入形态只占两个。多出的那一个时隙用于发送 ${BYTES.defer} 字节的延后报文。`,
    `第 1 个时隙里的 Response 是 ${BYTES.respDeferred} 字节，不是 ${BYTES.respEmbedded} 字节——那 ${RRTI_IE_BYTES} 个字节的差额就是它没有携带的那个数值。载入「嵌入」再看同一帧，它恢复为原来的长度。`,
    '测距行出现在 4.188 ms，也就是延后报文到达的时刻，不是 2.183 ms 的 Response 到达时。Response 到达时，标签只有往返时间，无法完成减法运算。',
  ],
  tryThis: [
    `载入「固定：该数值不在空口传送」。Response 缩短为 ${BYTES.respFixed} 字节、一轮恢复为两个时隙，而它的发送时刻从 2.000 ms 推迟到了 2.167 ms——它的 RMARKER 在 Poll 的 RMARKER 之后 ${SESSION.fixedReplyRstu} RSTU。这是本课程所有场景中唯一一次不由时隙边界决定的发送。`,
    `在编辑器里把固定回复时间从本课的 ${SESSION.fixedReplyRstu} RSTU 向两个方向调整：越过 ${WINDOW.hi} 会被拒，理由是响应会被自己时隙的边界截断；退到半个时隙、也就是 ${SESSION.slotRstu / 2} 也会被拒，理由完全不同——响应会落入尚未轮到它的时隙。同一个字段，两种越界，两条不同的错误消息。`,
  ],
  quiz: [
    {
      q: '为什么「把回复时延写入 Response」对硬件有要求？',
      options: [
        '因为这个数值有四个字节，短帧容纳不下',
        '因为这个数值的终点就是这一帧自身的发送时刻，组帧完成之前必须已经知道它',
        '因为要先测出对方的时钟偏差才能算出它',
      ],
      answer: 1,
      explain: '发射机必须能事先准确确定发送时刻（标准 §10.29.8.1 的要求；实现上通常是支持「在指定时刻发射」这种命令）。如果不能，就只能先发送、再读取时间戳、再补发一条报文，这就是延后形态。',
    },
    {
      q: '嵌入与延后在本课这一轮中读出完全相同的距离，这说明什么？',
      options: [
        '两者都恰好抵消了晶振误差，所以都是准的',
        '传递方式只决定这几个时间量何时到达哪一端，不决定计算出的距离',
        '延后报文中的那个数值其实是从 Response 中复制的',
      ],
      answer: 1,
      explain: '同一套计算，同样两个量，只是其中一个量的传递方式不同。三种形态的差别在于时隙、帧长与硬件要求，而不在于计算。',
    },
    {
      q: `单边三种形态的锚点上限都是 ${CAP.ssEmbedded}，双边嵌入式却只有 ${CAP.dsEmbedded}。为什么？`,
      options: [
        '单边一轮较短，所以一个块中能容纳更多锚点',
        `上限由轮中最长的那一帧决定：单边没有 Final，最长的是每锚点增长 ${RDM_ENTRY_BYTES} 字节的 Poll`,
        '单边的 Response 更短，所以更多锚点能够完成应答',
      ],
      answer: 1,
      explain: `${CAP.dsEmbedded} 是嵌入式 Final 自身的上限——每个锚点使它增长 ${FINAL_GROWTH} 字节。把这个上限套用到没有 Final 的轮次上，等于用一帧并不存在的帧去限制它们。`,
    },
    {
      q: '固定形态的那个约定值调得太小，会发生什么？',
      options: [
        '响应会被自己时隙的边界截断，整轮超时',
        '响应会落入一个尚未轮到它的时隙，那里没有接收方在接收',
        '距离会偏小，偏差恰好等于约定值不足的部分',
      ],
      answer: 1,
      explain: '这个区间上下两端都受限，而两种越界的失败方式不同：过大会被自己的时隙截断，过小会发送到其他锚点的时隙中。',
    },
  ],
}
