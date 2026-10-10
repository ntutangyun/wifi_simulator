/**
 * UWB Tier 1 · M14 两只钟 · You cannot put a number inside the frame that measures it.
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
 * Every number the lesson prints is pinned in tests/course/uwb-reply-time.test.ts,
 * and every count that can be computed is computed — `uwbMaxAnchors`,
 * `uwbRespBytes`, `UWB_SS_DEFER_BYTES`, `uwbSlotFitNs` — never typed as a literal.
 * `npx tsx scripts/lesson-dump.ts uwb-reply-time` prints it with its length.
 *
 * CAUTION — this lesson is 4 Chinese characters from `lessonMinutes`
 * rounding up from 25 to 30. Measure before adding a sentence, and measure by
 * importing `CHARS_PER_MINUTE`/`OBSERVE_MINUTES`/`TRY_MINUTES` from
 * `curriculum.ts` rather than retyping them — the controller got all three
 * wrong once and read a 484-character margin where there were four.
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
  UWB_MHR_BYTES, UWB_SLOT_GUARD_NS, UWB_SS_DEFER_BYTES, rstuNs, uwbFinalBytes, uwbMaxAnchors,
  uwbPollBytes, uwbPpduNs, uwbRespBytes, uwbSlotFitNs, uwbSlotsPerTag,
} from '../../uwb/phy'
import { MMS_SLOTS_PER_MS } from '../../uwb/mms'

/** The true separation of the two devices, in metres — exactly 5.00 m, both at bench height. */
export const BENCH_M = 5

/** The crystals the scene runs: 35 ppm apart, which is inside the standard's ±20 ppm each way. */
export const PPM = { anchor: 20, tag: -15 } as const

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
  ], { method, replyTime, nlos: false, tsNoisePs: 0, cfoNoisePpm: 0 })
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
 * Design §6.1's two-sided bound on the fixed reply time `F`, as the two whole
 * RSTU the schema actually accepts — computed here, not quoted, from the same
 * three terms `src/model/scenario.ts` checks it with:
 *
 *     S − Ap − ToF   ≤   F   ≤   2S − Ap − Ar − guard − ToF
 *
 * S is the slot, Ap and Ar the two airtimes, ToF the flight. The flight term is
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
  const pollNs = uwbPpduNs(uwbPollBytes(1))
  const respNs = uwbPpduNs(uwbRespBytes('ss', 'fixed'))
  const tofNs = distM / C_M_PER_NS
  const lowerNs = slotNs - pollNs - tofNs
  const upperNs = 2 * slotNs - pollNs - respNs - UWB_SLOT_GUARD_NS - tofNs
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
 * round's does not — it leaves one Poll airtime INTO slot 1, because it is timed
 * from the Poll's arrival and not from the slot boundary. That is the one
 * transmission in the whole simulator that no slot edge decides.
 */
export const FIG = {
  slotUs: 2000,
  pollEndUs: 197.628,
  /** Embedded: the Response carries the reply time, and is six octets longer for it. */
  respEmbeddedUs: 2187.372,
  /** Deferred and fixed: the same 14-octet Response, in two different places. */
  respDeferredUs: 2181.218,
  fixedStartUs: 2197.601,
  fixedEndUs: 2378.819,
  /** The follow-up message, a whole slot after the Response it completes. */
  deferEndUs: 4184.295,
  axisUs: 6000,
} as const

/** The distance each shape reported at the tag, to six decimals — the run's own numbers. */
export const RANGE_M = {
  embedded: '4.998803',
  deferred: '4.998803',
  fixed: '4.998630',
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
  title: '你不能把一个数放进它自己测量的那一帧',
  why: '上两课都把回复时延（reply time）当成 Response 帧里现成的一个数：锚点（anchor）填进去，标签（tag）减掉。可这个数量的是「从收到 Poll 到发出这一帧」——而「发出这一帧」就是这一帧自己的发送时刻。要把它写进去，锚点必须在还没发之前就知道自己会在什么时候发。不是每块射频都做得到，于是标准为同一个距离列了三条不同的走法。',
  outcomes: [
    '说清一个数为什么写不进它自己测量的那一帧，以及嵌入形态凭什么能写',
    '在三种形态里指出那个数走的是哪条路、各占几个测距时隙（ranging slot）、帧长差几个字节',
    '算出固定形态那个约定值的上下界，并说出越界时两种不同的失败',
  ],
  needs: ['uwb-sstwr'],
  terms: [
    { term: 'reply time', plain: '响应方从收到 Poll 到发出 Response 之间的那段等待' },
    { term: 'RRTI IE', plain: '帧里专门装这段等待的那一小段，六个字节' },
    { term: 'embedded', plain: '把这个数写进它自己量出来的那一帧' },
    { term: 'deferred', plain: '那一帧先发空，这个数跟在后面一条专门的报文里' },
    { term: 'fixed', plain: '双方事先约定这个数，它一个字节都不上空口' },
    { term: 'RSTU', plain: '测距时隙的计时单位，1 RSTU 约 833 ns' },
  ],
  picture: [
    { heading: '一个数，和它自己测量的那一帧', text: '单边双向测距（single-sided two-way ranging, SS-TWR）里，那段等待写成 Treply = T3 − T2：T2 是锚点收到 Poll 的时刻，T3 是它发出 Response 的时刻。两个读数都取自锚点自己的计数器，一减就得，谁的时钟都不用管。只有一件事不对劲——T3 是这一帧自己的发送时刻。要把 Treply 写进这一帧，发射机必须在这一帧封好之前就知道自己会在什么时候把它发出去。' },
    { kind: 'watch', jump: 2, heading: '那条只为一个数而发的报文', text: `载入仿真。这一轮只有三帧：${BYTES.poll} 字节的 Poll、${BYTES.respDeferred} 字节的 Response，以及一条 ${BYTES.defer} 字节的报文。跳到第三帧——它除了那个数以外什么都没装，而它存在的理由正是上一帧装不下它。` },
    {
      kind: 'diagram', heading: '三条走法，同一条时隙标尺', spec: uwbReplyTimeTiming(),
      caption: `按比例画的三轮，同一把尺子。每条泳道最左边是 Poll，紧跟着的是这一轮的 Response，字节数标在条上。嵌入那一轮的 Response 最长——${BYTES.respEmbedded} 字节里有六个是那段等待；固定与延后的都只有 ${BYTES.respFixed} 字节，少掉的正是那六个。位置也不一样：延后的 Response 在第 1 个时隙的边界起发，第 2 个时隙里还要再发一条延后报文；固定的那一条却落在第 1 个时隙里面——它从 Poll 到达算起，不看时隙边界。`,
    },
    { heading: '嵌入：硬件能预约发送时刻', text: '第一条路要求发射机接受「在某个指定时刻发射」这种命令，而不是「现在就发」。能做到，T3 就在封帧之前已经是个已知数，于是那段等待可以当场算出来写进帧里，接收端收到 Response 的同时就拿到了距离。本仿真器前两课走的都是这一条。' },
    { heading: '延后：先发出去，再回头读自己的时间戳', text: '做不到预约的射频还有另一条路：Response 照发，只是不带那个数；发完之后读回自己刚才那一发的时间戳，此时 T3 已是实测值，再用一条专门的报文把它送出去。这条报文要占一个自己的时隙，所以每多一个锚点，一轮就多两个时隙而不是一个——它拿一个时隙，换掉了对硬件的那条要求。' },
    { heading: '固定：那个数根本不上空口', text: '第三条路干脆不传：双方事先约定一个值，响应方在「收到 Poll 之后的这个固定时延处」发送。发起方知道这个值、也知道对方排在第几位，于是它自己就能把那段等待重建出来——帧里一个字节都没为它花掉。要求只是转移了：从「能预约发送时刻」变成「必须准时发在那个时刻」，而偏离它有两种方式。' },
    { heading: '双边双向测距为什么只有两种', text: '双边双向测距（double-sided two-way ranging, DS-TWR）面对的是同一个问题的另一半：Final 要不要携带标签自己量的那两个时间。要，就是嵌入；不要，就是延后，那两个时间改由锚点的报告捎回去。标准的五种过程里，双边形态只有这两种，没有「固定」——下一课专讲这一半。' },
  ],
  numbers: [
    { kind: 'formula', heading: '算术一行都没改', text: 'T̂prop = (Tround − Treply·(1 − Coffs)) / 2', note: `三种形态送进这条式子的是同样两个量，只是 Treply 来处不同：嵌入取自 Response、延后取自后一条报文、固定取自会话配置加上响应方的排位。所以两端晶振（crystal）走得一样快时——百万分之几（parts per million, ppm）的差异归零——三种形态读出同一个 ${RANGE_M.matched} m，逐位相同。` },
    { kind: 'table', heading: '三种形态，帧长差在哪里', head: [
      '帧', '嵌入', '延后', '固定',
    ], rows: [
      ['Poll', `${BYTES.poll} B`, `${BYTES.poll} B`, `${BYTES.poll} B`],
      ['Response', `${BYTES.respEmbedded} B`, `${BYTES.respDeferred} B`, `${BYTES.respFixed} B`],
      ['延后报文', '—', `${BYTES.defer} B`, '—'],
      ['一轮的时隙数', 'A + 1', '2A + 1', 'A + 1'],
      [`A = ${DEMAND_ANCHORS} 时的时隙数`, ssSlots('embedded'), ssSlots('deferred'), ssSlots('fixed')],
    ] },
    { text: `Response 相差的六个字节就是那段等待自己那一小节（RRTI IE）：两字节表头加四字节的时间。延后的那条报文是同样一小节，外加一个帧头（MAC header）与一个帧校验序列（frame check sequence, FCS）——${BYTES.defer} 字节，再加一个整时隙，代价远大于省下的那六个字节。` },
    { kind: 'table', heading: '每种形态自己的锚点上限', head: [
      '形态', '轮里最长的一帧', '锚点上限',
    ], rows: [
      ['SS-TWR 嵌入', POLL_GROWTH, String(CAP.ssEmbedded)],
      ['SS-TWR 延后', POLL_GROWTH, String(CAP.ssDeferred)],
      ['SS-TWR 固定', POLL_GROWTH, String(CAP.ssFixed)],
      ['DS-TWR 嵌入', `Final，${uwbFinalBytes(0, 'embedded')} + ${FINAL_GROWTH}A`, String(CAP.dsEmbedded)],
      ['DS-TWR 延后', POLL_GROWTH, String(CAP.dsDeferred)],
    ] },
    { heading: '一个上限，曾经被算错在四种形态上', text: `上限不是写死的常数，是算出来的：轮里最长的那一帧还塞得进 ${UWB_MAX_PSDU_BYTES} 字节 PSDU（PHY service data unit）的最大锚点数。${CAP.dsEmbedded} 这个数属于双边嵌入式 Final——它每多一个锚点长 ${FINAL_GROWTH} 字节，${CAP.dsEmbedded} 个正好 ${uwbFinalBytes(CAP.dsEmbedded, 'embedded')} 字节。可单边的三种形态轮里根本没有 Final，最长的是每锚点只长 ${RDM_ENTRY_BYTES} 字节的 Poll，上限本该是 ${CAP.ssEmbedded}。同一个 ${CAP.dsEmbedded} 曾经压在这四种形态上。` },
    { heading: '时隙也是按最长的那一帧配的', text: `同样的错算还有第二处。${DEMAND_ANCHORS} 个锚点时，单边一轮最长的帧要 ${(DEMAND.ss / 1000).toFixed(1)} µs 的时隙，双边嵌入式要 ${(DEMAND.dsEmbedded / 1000).toFixed(1)} µs——多出的 ${((DEMAND.dsEmbedded - DEMAND.ss) / 1000).toFixed(1)} µs 是为一帧单边轮次根本不发的 Final 留的。一个 300 RSTU（ranging slot time unit）的时隙有 ${(SHORT_SLOT_NS / 1000).toFixed(0)} µs：装得下 ${DEMAND_ANCHORS} 个锚点的单边一轮，装不下六个锚点的双边嵌入式一轮。` },
    { kind: 'table', heading: '同一段距离，五种走法量出来', head: [
      '形态', '两端晶振相差 35 ppm', '两端对准',
    ], rows: [
      ['SS-TWR 嵌入', `${RANGE_M.embedded} m`, `${RANGE_M.matched} m`],
      ['SS-TWR 延后', `${RANGE_M.deferred} m`, `${RANGE_M.matched} m`],
      ['SS-TWR 固定', `${RANGE_M.fixed} m`, `${RANGE_M.matched} m`],
      ['DS-TWR 嵌入', `${RANGE_M.ds} m`, `${RANGE_M.matched} m`],
      ['DS-TWR 延后', `${RANGE_M.ds} m`, `${RANGE_M.matched} m`],
    ] },
    { text: `真值是 ${BENCH_M.toFixed(2)} m。嵌入与延后读出的字面上是同一个数：同一套算术，只是那个数走的路径不同——这正是本课要证的那一点。固定读出的不一样，因为它那段时延是按响应方自己的晶振数的，误差的来源因此不同。双边的两种最接近真值，而那就是双边双向测距存在的全部理由。` },
    { kind: 'steps', heading: '固定形态的一轮，一步一步', items: [
      '会话里写下一个数 F，单位 RSTU。两端都有这份配置，它从此不再上空口。',
      '标签发 Poll。锚点收完整帧，给它打上到达时间戳——固定时延是从这一帧收完算起的，不是从它的第一个脉冲算起。',
      '锚点在「收完 Poll 之后 F 加上自己排位那么多个时隙」处发送 Response。排第 k 位的锚点等 F 加 k 个时隙，所以同一个 F 对所有锚点同时成立。',
      '标签收到 Response。它知道 F、也知道这个锚点排第几，于是把那段等待重建出来——它从来没被告知过，但它算得出。',
      '把重建出来的那段等待按时钟偏差（clock offset）缩放一下，再代进上面那条式子。距离就出来了，而空口上一个字节也没为它花过。',
    ] },
    { heading: 'F 的取值上下都有界', text: `F 太大，Response 还没发完自己的时隙就到头了——接收窗口已关，整轮以超时收场，而 Poll 明明收到了。F 太小，Response 落进一个还没轮到它的时隙，那里没有人在听。所以这是一个两头都收紧的区间，而决定它的是时隙长度与两个空口时间（airtime）：` },
    { kind: 'formula', text: '时隙 − Poll 空口时间 − 飞行时间  ≤  F  ≤  2 × 时隙 − Poll − Response − 守卫 − 飞行时间', note: `本课这一轮：时隙 ${SESSION.slotRstu} RSTU、Poll ${(uwbPpduNs(BYTES.poll) / rstuNs(1)).toFixed(1)} RSTU、Response ${(uwbPpduNs(BYTES.respFixed) / rstuNs(1)).toFixed(1)} RSTU，于是 F 只能取 ${WINDOW.lo} 到 ${WINDOW.hi} RSTU——这正是编辑器会接受的那段整数。会话的缺省值恰好是一整个时隙，${SESSION.fixedReplyRstu} RSTU，两头都留足余量。` },
    { text: `飞行时间几乎不参与：把两台设备从 ${BENCH_M} m 拉到 200 m，上界也只从 ${WINDOW.hi} 降到 ${WINDOW_FAR.hi} RSTU，整整一个 RSTU。真正会卡住人的是下界——取半个时隙、${SESSION.slotRstu / 2} RSTU，排头那个锚点就会在 ${((rstuNs(SESSION.slotRstu / 2) + uwbPpduNs(BYTES.poll)) / 1e6).toFixed(2)} ms 处发送，那时它自己的时隙还没开始。` },
  ],
  deeper: [
    { heading: '延后的那一帧也被打了时间戳，却没人读', text: '延后报文和 Response 一样是一帧测距帧：两端都给它的到达与离开打了戳，时间轴上 UWB_TS 那几行看得见。但算术一个都不用——引擎的 onSsDefer（device.ts）拿的是 Response 那次接收测出的往返时间、那次接收测出的时钟偏差，只从这条报文里取出那一个数。这是对一台 4z 接收机诚实的做法：它没有能力挑一帧不打戳，时间轴也因此保持对称。代价是一个翻看帧检视面板的人会以为那两个戳参与了测量。' },
    { heading: '为什么排位要乘一个整时隙', text: '把不等式写全就清楚了。记轮起点 T0、时隙长 S、Poll 空口时间 Ap、Response 空口时间 Ar、第 k 个锚点的飞行时间 ToF。它在 T0 + Ap + ToF + F + k·S 处发送，而这一刻必须落在第 k+1 个时隙之内：不早于 T0 + (k+1)·S，也不晚到 T0 + (k+2)·S 减去 Ar 与守卫。两边约掉 k·S，k 就消失了——这正是「每个响应方加一个时隙」这个安排的作用，它让同一个 F 对所有响应方同时成立。若改成别的错开方式，F 就得逐个锚点各配一个，那个数也就重新需要上空口了。' },
  ],
  limits: [
    { kind: 'out-of-scope', text: '本仿真器没有任何一条空口消息能启停或重配一次测距会话（标准 §10.29.6.2 的控制与结果传输，控制那一半）：`replyTime` 是场景里写下的配置（model/scenario.ts 的 UwbSessionCfg），一轮开始之前就已定好，整场仿真都不变。真实设备要先用管理原语把会话建起来、把参数谈妥，而那条路径这里一行都没有——所以本课教的是三种形态各自的后果，不是设备怎么落到某一种形态上。' },
    { kind: 'unmodelled', text: '两端不商量这个数。真实设备可以用 RRTN IE 把「我希望的回复时延是多少」提出来，对方接受或另提一个；本仿真器里没有这个信息单元，src/uwb/frames.ts 的帧类型表里也没有一种帧承载它。三种形态是场景写死的，配置不一致的两台设备在这里不会被发现、也不会被纠正——它们只会各算各的，然后给出一个错得没有任何记录去解释的距离。' },
    { kind: 'unmodelled', text: '固定形态下的响应方总是精确落在它自己算出的那一刻：device.ts 的 armFixedReply 把发送排在「收完 Poll 的时刻 + F + 排位」处，一纳秒不差。真实射频的收发转换、中断与排程都会让这一刻抖动，而这个抖动直接就是测距误差——Treply 错 1 ns，距离就错约 15 cm（误差是它的一半乘光速）。这是固定形态真实的弱点，本仿真器没有建模它，所以本课那张五种形态读数表里，固定那一格比真实设备上量到的干净得多。' },
    { kind: 'model-value', text: `帧长表里每一行都是本仿真器自己的算术：帧头 ${UWB_MHR_BYTES} 字节、那一小节 ${RRTI_IE_BYTES} 字节、帧校验 ${UWB_FCS_BYTES} 字节、时隙守卫 ${UWB_SLOT_GUARD_NS} ns（uwb/phy.ts 的 UWB_MHR_BYTES、RRTI_IE_BYTES、UWB_FCS_BYTES、UWB_SLOT_GUARD_NS）。标准给的是字段清单，不是字段宽度，更没有规定守卫。所以「Response 差 ${BYTES.respEmbedded - BYTES.respFixed} 个字节」「延后报文 ${BYTES.defer} 字节」「上限从 ${CAP.dsEmbedded} 跳到 ${CAP.ssEmbedded}」这三个结论都随这些取值而定：换一种编址或另一种编码，三个数都要重算，而结论的方向不会变。` },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 的 §10.29.6 列出五种双向测距过程，本课讲其中三种：§10.29.6.3 回复时间延后、§10.29.6.4 回复时间嵌入、§10.29.6.5 固定回复时间。回复时延与往返时间信息这两个信息单元在 §10.29.8.1 与 §10.29.8.4；一帧最长 127 字节的 PSDU 由 §16.2.7 的物理头字段决定；±20 ppm 的晶振容差来自 §16.4.9。这一课完全不依赖任何草案。',
    '三个取值是本仿真器自己的模型选择：2 ms 的测距时隙（来自 FiRa 的缺省配置，不是标准正文）、时隙末尾 200 ns 的飞行守卫，以及各帧信息单元的宽度——帧头 9 字节、RRTI IE 6 字节、帧校验 2 字节。固定回复时间的缺省值取一整个时隙，是从上面那条两边收紧的不等式里挑的，不是标准给的数。',
    '本课这一轮把时间戳噪声与时钟偏差估计噪声都调成零，两端之间也没有墙。这是为了让三种形态的读数可以逐位比较——噪声打开时它们只在噪声之内一致，那件事在讲两端时钟的两课里量过了。',
  ],
  scenario: () => uwbReplyTimeScenario('deferred'),
  variants: [
    { label: '嵌入：那个数就在 Response 里', scenario: () => uwbReplyTimeScenario('embedded') },
    { label: '固定：那个数不上空口', scenario: () => uwbReplyTimeScenario('fixed') },
  ],
  jumps: [
    J('Poll 离开手机', firstUwbPoll),
    J('Response：不带那个数', firstUwbResp),
    J('延后报文：只为一个数而发', firstUwbSsDefer),
    J('测距行：距离到这一刻才出现', firstUwbRange),
  ],
  observe: [
    `整轮那一行写着 "3 slots"：一个锚点的单边一轮占了三个时隙，而嵌入形态只占两个。多出来的那一个装的是 ${BYTES.defer} 字节的延后报文。`,
    `第 1 个时隙里的 Response 是 ${BYTES.respDeferred} 字节，不是 ${BYTES.respEmbedded} 字节——那六个字节的差额就是它没带的那个数。载入「嵌入」再看同一帧，它长回去了。`,
    '测距行出现在 4.184 ms，也就是延后报文落地那一刻，不是 2.181 ms 的 Response 落地时。Response 那一刻标签手里只有往返时间，减不动。',
  ],
  tryThis: [
    `载入「固定：那个数不上空口」。Response 缩到 ${BYTES.respFixed} 字节、一轮回到两个时隙，而它的发送时刻从 2.000 ms 挪到了 2.198 ms——正好晚了一个 Poll 的空口时间。这是整个仿真器里唯一一发不由时隙边界决定的发送。`,
    `在编辑器里把固定回复时间从缺省的 ${SESSION.fixedReplyRstu} RSTU 往两头调：越过 ${WINDOW.hi} 会被拒，理由是响应会被自己时隙的边界切掉；退到半个时隙、也就是 ${SESSION.slotRstu / 2} 也会被拒，理由完全不同——响应会落进还没轮到它的时隙。同一个字段，两种越界，两条不一样的错误消息。`,
  ],
  quiz: [
    {
      q: '为什么「把回复时延写进 Response」这件事对硬件有要求？',
      options: [
        '因为那个数有四个字节，短帧装不下',
        '因为那个数的终点就是这一帧自己的发送时刻，帧封好之前必须已经知道它',
        '因为要先测出对方的时钟偏差才能算出它',
      ],
      answer: 1,
      explain: '发射机必须接受「在指定时刻发射」这种命令。做不到就只能先发、后读、再补发一条，那就是延后形态。',
    },
    {
      q: '嵌入与延后在本课这一轮里读出字面上同一个距离，这说明什么？',
      options: [
        '两者都恰好抵消了晶振误差，所以都是准的',
        '搬运路线只决定那几个时间量什么时候到谁手里，不决定算出来的是哪个距离',
        '延后报文里的那个数其实是从 Response 里复制的',
      ],
      answer: 1,
      explain: '同一套算术，同样两个量，只是换了一辆车来运其中一个。三种形态的差别在时隙、帧长与硬件要求上，不在算术上。',
    },
    {
      q: `单边三种形态的锚点上限都是 ${CAP.ssEmbedded}，双边嵌入式却只有 ${CAP.dsEmbedded}。为什么？`,
      options: [
        '单边一轮短，所以一个块里装得下更多锚点',
        `上限由轮里最长那一帧决定：单边没有 Final，最长的是每锚点长 ${RDM_ENTRY_BYTES} 字节的 Poll`,
        '单边的 Response 更短，所以更多锚点答得完',
      ],
      answer: 1,
      explain: `${CAP.dsEmbedded} 是嵌入式 Final 自己的数——它每锚点长 ${FINAL_GROWTH} 字节。把这个数压在没有 Final 的轮次上，是拿一帧不存在的帧去限制它们。`,
    },
    {
      q: '固定形态的那个约定值调得太小，会发生什么？',
      options: [
        '响应会被自己时隙的边界切掉，整轮超时',
        '响应会落进一个还没轮到它的时隙，没有人在听',
        '距离会偏小，偏的量正好是差的那一截',
      ],
      answer: 1,
      explain: '这个区间两边都收紧，而两种越界的失败方式不同：太大是被自己的时隙切掉，太小是发进别人的时隙。',
    },
  ],
}
