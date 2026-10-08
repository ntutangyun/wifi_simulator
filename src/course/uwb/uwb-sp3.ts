/**
 * UWB Tier 2 · M21 SP3 分组测距 · The shortest ranging frame cannot be the round's first frame.
 *
 * IEEE Std 802.15.4-2024 §10.32.8 (ranging procedures with SP3 format packets) and its SRRR IE
 * (§10.32.9.9), which is `docs/superpowers/specs/2026-10-02-sp3-design.md`. **§2.3 is the current
 * accounting**; §2.1 ("there is no crossover") and §2.2 ("against the deferred shape SP3 is always
 * shorter") are superseded and kept in that document only as the record of how it was got wrong.
 * §4.1 is the fix round that gave the initiator its own marker and its own RRTT report, and it is
 * what moved the answer a third time.
 *
 * The one sentence this lesson exists for: **the shortest ranging frame cannot be the round's
 * first frame.** Something has to announce the slot table, and an SP3 packet can announce nothing
 * — no PHR, no payload. So an SP3 round lays one extra marker out up front (the initiator's own)
 * and earns 37.179 µs back per responder, and under four responders it never earns it back.
 *
 * **Two baselines, and the lesson must not blur them** (design §2.3):
 *  - against SP1 **embedded** (reply time inside the ranging frame, no report phase at all): SP3
 *    is longer at every anchor count, and the gap widens with A;
 *  - against SP1 **deferred** (reply time in a later frame — §10.29.6.3, the road `uwb-reply-time`
 *    built): the crossover is at A = 4, and at A = 11 once some responder requests RRTT.
 *
 * So the real subject is that the **report phase is the whole cost**, and the shortest ranging
 * frame only gets a chance on the road that has already paid for it. SP3 is that road's end: once
 * the time has to come back in another frame anyway, there is no reason for the ranging frame to
 * still carry a PHR and a payload.
 *
 * The scenes. Four runs of one 22 × 8 m hall with the same four anchors, the same tag and the same
 * seed, differing only in the session switches, so every figure below is a difference of one
 * decision rather than of two scenes: SP3 (base), the SP1 deferred round it is built out of, the
 * SP1 embedded round that needs no report phase at all, and SP3 with both SRRR request bits on.
 * **Four anchors is the crossover itself**, which is why the base scene has that many: the SP3
 * round is 1.600 µs shorter than the deferred round it replaces — the whole of what the initiator's
 * marker has just finished paying off.
 *
 * Every number is computed, never typed: `uwbSp3Ns`, `uwbSp3PollBytes`, `uwbSp3ReportBytes`,
 * `uwbSp3InitReportBytes`, `uwbRespBytes`, `uwbPollBytes`, `uwbPpduNs`, `srrrIeBytes` and
 * `roundPlan` are called, the crossover is **searched** rather than written down, and
 * tests/course/uwb-sp3.test.ts re-measures every round total against a live round for A = 1…6.
 *
 * `npx tsx scripts/lesson-dump.ts uwb-sp3` prints it with its length. Measure the same way before
 * adding a sentence, by IMPORTING `CHARS_PER_MINUTE`/`OBSERVE_MINUTES`/`TRY_MINUTES` from
 * `curriculum.ts` rather than retyping them: the controller retyped all three once and read a
 * 484-character margin where there were four.
 */
import type { Scenario, UwbSessionCfg, UwbSrrrCfg } from '../../model/scenario'
import type { FieldsSpec } from '../diagram'
import {
  J, anchor, firstUwbPoll, firstUwbRange, firstUwbSp3, firstUwbSsDefer, rangingLab, txOf, uwbSc,
  uwbTag, type Lesson,
} from '../lessonKit'
import {
  SRRR_IE_BYTES, type UwbReplyTime, UWB_IE_HDR_BYTES, UWB_PHR_CHIPS, UWB_SHR_CHIPS,
  UWB_SP3_RAOA_ITEM_BYTES, UWB_SS_DEFER_BYTES, UWB_STS_CHIPS,
  srrrIeBytes, uwbPollBytes, uwbPpduNs, uwbRespBytes, uwbSp3Chips, uwbSp3InitReportBytes,
  uwbSp3Ns, uwbSp3PollBytes, uwbSp3ReportBytes,
} from '../../uwb/phy'
import { roundPlan } from '../../uwb/session'

/** Anchors of every scene of this lesson: four, because four is the crossover itself. */
export const ANCHORS = 4
/** Where the anchors stand, in metres; the first `ANCHORS` of them are this lesson's own scenes,
 * and all six are the sweep the test measures A = 1…6 over. No two distances to the tag alike, so
 * a range attributed to the wrong anchor disagrees with its own `trueDistM`. */
export const PLACES: readonly { x: number; y: number }[] = [
  { x: 1, y: 1 }, { x: 21, y: 1 }, { x: 21, y: 7 }, { x: 11, y: 7 }, { x: 3, y: 6 }, { x: 19, y: 4 },
]
/** Where the tag stands. */
export const TAG = { x: 7, y: 3 } as const
/** The anchor counts the lesson's table prints, and the test runs a live round at each of. */
export const SWEEP = [1, 2, 3, 4, 5, 6] as const

/** Anchor i's id; the id order is the slot order (`slotAction`'s `anchor` index). */
export const idOf = (i: number): string => `anc-${i + 1}`
/** The tag's id: the round's initiator, and the only device that solves anything here. */
export const TAG_ID = 'uwb-1'

/** The devices of one scene: `n` anchors off `PLACES`, then the tag. */
const devices = (n: number) => [
  ...PLACES.slice(0, n).map((p, i) => anchor(idOf(i), `A${i + 1}`, p.x, p.y)),
  uwbTag(TAG_ID, 'Tag', TAG.x, TAG.y),
]

/**
 * One scene: `n` anchors, one tag, SS-TWR, and whichever of the three shapes `session` names.
 *
 * `cfoNoisePpm: 0` and `nlos: false` are this lesson's own two knobs, and the reason is that its
 * whole subject is air time: in a **deferred** SS round the reply time is whole slots long, so the
 * carrier-offset estimator's 0.2 ppm residual is worth decimetres of range at the far slots
 * (`ssTwrCorrected`'s `(1 − coffs)`), which would swamp the only thing the reader is asked to check
 * about the distances here — that they still come out and still match the geometry. The residual
 * has its own lessons (`uwb-reply-time`, `uwb-m2m`); nothing about any airtime below depends on it,
 * and `sources` says so out loud.
 */
const scene = (n: number, session: Partial<UwbSessionCfg>): Scenario =>
  uwbSc(rangingLab(), devices(n), { method: 'ss', nlos: false, cfoNoisePpm: 0, ...session })

/**
 * The base scene: SP3 grouped ranging over `ANCHORS` anchors, both SRRR request bits off.
 *
 * `replyTime: 'deferred'` is not a choice here — the schema refuses `sp3` with any other reply
 * time, because an SP3 packet cannot carry the reply time at all and the deferred shape
 * (§10.29.6.3) is the one that already puts it in a later frame.
 */
export function uwbSp3Scenario(srrr: UwbSrrrCfg = { raoa: false, rrtt: false }): Scenario {
  return scene(ANCHORS, { replyTime: 'deferred', sp3: true, srrr, aoa: srrr.raoa })
}

/** The same hall, the same devices, with SP3 off: the SP1 round of the reply-time shape named. */
export function uwbSp1Scenario(replyTime: UwbReplyTime): Scenario {
  return scene(ANCHORS, { replyTime })
}

/**
 * The sweep the A = 1…6 table is checked against: the same three shapes at any anchor count.
 * Not a variant — it adds no fixture row — because what it is for is letting the test run a real
 * round at every A the table prints rather than trusting the formula at five of the six.
 */
export function uwbSp3SweepScenario(
  anchors: number, shape: 'sp3' | 'sp3-rrtt' | 'deferred' | 'embedded',
): Scenario {
  if (shape === 'embedded' || shape === 'deferred') return scene(anchors, { replyTime: shape })
  return scene(anchors, {
    replyTime: 'deferred', sp3: true, srrr: { raoa: false, rrtt: shape === 'sp3-rrtt' },
  })
}

/** The sessions the scenes run, read back off the scenarios rather than restated. */
const SESSIONS = {
  sp3: uwbSp3Scenario().uwb!,
  sp3Rrtt: uwbSp3Scenario({ raoa: true, rrtt: true }).uwb!,
  deferred: uwbSp1Scenario('deferred').uwb!,
  embedded: uwbSp1Scenario('embedded').uwb!,
} as const

/** The ranging slot and the ranging block of every scene here, in milliseconds — read off the
 * plan the engine lays out, not off the two numbers FiRa's defaults are usually quoted as. */
export const MS = {
  slot: roundPlan(SESSIONS.sp3, ANCHORS).slotNs / 1e6,
  block: roundPlan(SESSIONS.sp3, ANCHORS).blockNs / 1e6,
} as const

/** Slots one round of each shape takes, asked of the engine rather than counted off the figure. */
export const SLOTS = {
  sp3: roundPlan(SESSIONS.sp3, ANCHORS).slots,
  sp3Rrtt: roundPlan(SESSIONS.sp3Rrtt, ANCHORS).slots,
  deferred: roundPlan(SESSIONS.deferred, ANCHORS).slots,
  embedded: roundPlan(SESSIONS.embedded, ANCHORS).slots,
} as const

/** Every frame length the lesson prints, in octets. A marker has none at all — it is not sized in
 * octets, which is why its row says 0 and its time comes from `uwbSp3Ns` instead. */
export const BYTES = {
  rcmSp3: uwbSp3PollBytes(ANCHORS),
  rcmSp1: uwbPollBytes(ANCHORS),
  respDeferred: uwbRespBytes('ss', 'deferred'),
  respEmbedded: uwbRespBytes('ss', 'embedded'),
  report: uwbSp3ReportBytes(false),
  reportRaoa: uwbSp3ReportBytes(true),
  initReport: uwbSp3InitReportBytes(ANCHORS),
  srrrIe: SRRR_IE_BYTES,
  srrrAll: srrrIeBytes(ANCHORS),
  raoaItem: UWB_SP3_RAOA_ITEM_BYTES,
} as const

/** The chips of one SP3 packet: the only length in this lesson that is not octets or nanoseconds.
 * `phr` is the one segment a marker does NOT have, which is why it is here too. */
export const CHIPS = {
  marker: uwbSp3Chips(), shr: UWB_SHR_CHIPS, sts: UWB_STS_CHIPS, phr: UWB_PHR_CHIPS,
} as const

/** A chip count as the prose prints it: digits grouped in threes, so 70368 reads as 70 368. */
export const grp = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** One frame's airtime, in nanoseconds. */
export const NS = {
  marker: uwbSp3Ns(),
  respDeferred: uwbPpduNs(BYTES.respDeferred),
  respEmbedded: uwbPpduNs(BYTES.respEmbedded),
  report: uwbPpduNs(BYTES.report),
  reportRaoa: uwbPpduNs(BYTES.reportRaoa),
  initReport: uwbPpduNs(BYTES.initReport),
  rcmSp3: uwbPpduNs(BYTES.rcmSp3),
  rcmSp1: uwbPpduNs(BYTES.rcmSp1),
} as const

/** What one marker saves, against each of the two SP1 ranging frames. */
export const SAVE = {
  shortest: NS.respDeferred - NS.marker,
  embedded: NS.respEmbedded - NS.marker,
} as const

/** How many times over one responder's report frame costs what its marker saved, against each
 * baseline. Two numbers, and the prose has to say which it means (design §2.2). */
export const MULT = {
  embedded: (NS.report / SAVE.embedded).toFixed(3),
  shortest: (NS.report / SAVE.shortest).toFixed(3),
} as const

/** A whole round's airtime: the RCM, the ranging phase's A + 1 markers (the initiator's own
 * included — design §4.1), the report phase's A responder reports, and the initiator's own report
 * only when some responder asked for the round-trip time. */
export function sp3RoundNs(anchors: number, rrtt: boolean, raoa = false): number {
  return uwbPpduNs(uwbSp3PollBytes(anchors)) + (anchors + 1) * NS.marker
    + anchors * uwbPpduNs(uwbSp3ReportBytes(raoa))
    + (rrtt ? uwbPpduNs(uwbSp3InitReportBytes(anchors)) : 0)
}
/** The SP1 deferred round: the Poll, one 14-octet Response each, one follow-up message each. */
export function sp1DeferredRoundNs(anchors: number): number {
  return uwbPpduNs(uwbPollBytes(anchors))
    + anchors * uwbPpduNs(uwbRespBytes('ss', 'deferred')) + anchors * uwbPpduNs(UWB_SS_DEFER_BYTES)
}
/** The SP1 embedded round: the Poll and one 20-octet Response each. No report phase exists. */
export function sp1EmbeddedRoundNs(anchors: number): number {
  return uwbPpduNs(uwbPollBytes(anchors)) + anchors * uwbPpduNs(uwbRespBytes('ss', 'embedded'))
}

/** One round of each shape at this lesson's own anchor count. */
export const ROUND = {
  sp3: sp3RoundNs(ANCHORS, false),
  /** RRTT requested and RAOA not: the shape the A = 11 crossover is searched over. */
  sp3Rrtt: sp3RoundNs(ANCHORS, true),
  /** **Both** request bits on: the shape the third variant runs, which is RRTT's extra frame plus
   * a bearing item in every responder's report. The two are not the same round, and the prose has
   * to print the one the variant it names actually radiates. */
  sp3Both: sp3RoundNs(ANCHORS, true, true),
  deferred: sp1DeferredRoundNs(ANCHORS),
  embedded: sp1EmbeddedRoundNs(ANCHORS),
} as const

/** The base scene's round, by phase: what the figure draws. */
export const PHASE = {
  rcm: NS.rcmSp3,
  ranging: (ANCHORS + 1) * NS.marker,
  report: ANCHORS * NS.report,
} as const

/** The gap against each baseline, at every A the table prints. */
export const GAP = {
  vsDeferred: SWEEP.map((a) => sp3RoundNs(a, false) - sp1DeferredRoundNs(a)),
  vsEmbedded: SWEEP.map((a) => sp3RoundNs(a, false) - sp1EmbeddedRoundNs(a)),
  vsDeferredRrtt: SWEEP.map((a) => sp3RoundNs(a, true) - sp1DeferredRoundNs(a)),
} as const

/**
 * The smallest anchor count at which a whole SP3 round is no longer longer than the SP1 deferred
 * round it is built out of — **searched**, never written down, the same discipline `uwbMaxAnchors`
 * uses for its own cap. It throws when the range holds no crossover, so a change that removes one
 * fails loudly here rather than leaving a stale number in the prose.
 */
export function crossoverAnchors(rrtt: boolean, raoa = false): number {
  for (let a = 1; a <= 200; a++) if (sp3RoundNs(a, rrtt, raoa) <= sp1DeferredRoundNs(a)) return a
  throw new Error('crossoverAnchors: no crossover in range')
}

/**
 * The arithmetic the lesson is: what one responder nets, what the initiator's marker costs once,
 * and where the two meet.
 *
 * `srrrPerResponder` is read at the margin — one responder, not divided out of many — because the
 * RCM's own PPDU time is quantised by the PHY's code-block size, so the cost of three more octets
 * is not exactly the same at every A. Only this marginal reading is exact, and it is the one the
 * net saving needs; the crossover below never goes through it.
 */
const SRRR_PER_RESPONDER_NS = uwbPpduNs(uwbSp3PollBytes(1)) - uwbPpduNs(uwbPollBytes(1))
const NET_PER_RESPONDER_NS = SAVE.shortest - SRRR_PER_RESPONDER_NS
export const PAY = {
  perResponder: SAVE.shortest,
  srrrPerResponder: SRRR_PER_RESPONDER_NS,
  net: NET_PER_RESPONDER_NS,
  initiatorMarker: NS.marker,
  responders: (NS.marker / NET_PER_RESPONDER_NS).toFixed(2),
  crossover: crossoverAnchors(false),
  crossoverRrtt: crossoverAnchors(true),
  /** Both request bits, which is a third shape again: RRTT's extra frame plus a bearing item in
   * every responder's report, so the crossover moves further out than RRTT alone moves it. */
  crossoverBoth: crossoverAnchors(true, true),
} as const

/** Microseconds, three decimals: how every time in this lesson is printed. */
export const us = (ns: number): string => (ns / 1000).toFixed(3)

/** The initiator's own marker, in slot 1 — the frame the whole lesson turns on. */
const initiatorMarker = txOf((r) => r.frame.kind === 'uwbSp3' && r.node === TAG_ID)
/** The first responder's marker: the same frame, one slot later, from the other end. */
const responderMarker = txOf((r) => r.frame.kind === 'uwbSp3' && r.node === idOf(0))

/**
 * The base round's three phases, drawn to scale in microseconds.
 *
 * Three boxes rather than ten, because the thing to see is that the report phase alone is the
 * largest of the three: the markers are what SP3 made shorter, and they are not where the round's
 * time went. Every width comes from `phy.ts`, so the figure cannot drift from the round the engine
 * lays out.
 */
export function uwbSp3Fields(): FieldsSpec {
  const fields = [
    { label: '控制消息', size: Number((PHASE.rcm / 1000).toFixed(3)) },
    { label: `测距相位：1 + ${ANCHORS} 枚标记`, size: Number((PHASE.ranging / 1000).toFixed(3)) },
    { label: `报告相位：${ANCHORS} 帧`, size: Number((PHASE.report / 1000).toFixed(3)) },
  ]
  return {
    kind: 'fields',
    fields,
    unit: 'µs',
    total: `整轮 ${us(ROUND.sp3)} µs，其中报告相位 ${us(PHASE.report)} µs`,
  }
}

export const uwbSp3: Lesson = {
  id: 'uwb-sp3',
  module: 22,
  title: '最短的测距帧，不构成最短的轮',
  why: 'SP3 是标准给测距留的最短的一种包：帧里没有物理头（PHY header, PHR），也没有载荷（payload），所以它既带不了自己量到的时间，也带不了发送者是谁。时间只能在后面另发一帧补上，而这一帧归谁，由它所在的测距时隙（ranging slot）回答。于是一轮 SP3 测距必须配一个报告相位——而那正是单边双向测距（single-sided two-way ranging, SS-TWR）把回复时延（reply time）延后那条路已经建好的东西。这一课要算的是另一件事：最短的测距帧并不构成最短的轮。总得有人先把时隙的分配说出去，而一个 SP3 包说不出任何东西，所以一轮里的第一帧一定不是它。',
  outcomes: [
    '说清 SP3 包为什么当不了一轮的第一帧，以及它的身份为什么只能来自时隙',
    '分开两个对照：对回复时延嵌在帧里的那种 SP1 永远更长，对延后那种才有交叉点',
    '算出交叉点落在第几个响应方，并说出式子两边各是什么',
    '说清 SRRR 与多消息收妥确认的请求位差在哪一侧',
  ],
  needs: ['uwb-reply-time', 'uwb-receipt'],
  terms: [
    { term: 'SP3 format packet', plain: '只有三段、没有物理头也没有载荷的那种包；它只是一个时间标记' },
    { term: 'ranging initiation', plain: '发起方自己那一枚标记：本轮的时间从它算起' },
    { term: 'data report phase', plain: '测距相位之后的那一段时隙：标记量到的时间在这里被送回去' },
    { term: 'SRRR IE (SP3 Ranging Request Reports IE)', plain: '控制消息里每个响应方一个，声明报告相位要给它报哪几项' },
    { term: 'RAOA / RRTT', plain: '那个信息单元里的两个请求位：一个要方位角，一个要往返时间' },
  ],
  picture: [
    {
      heading: '一个说不出任何东西的包',
      text: `一个 SP3 包只有三段：同步字段（SYNC field, SYNC）、帧起始定界符（start-of-frame delimiter, SFD），以及加扰时间戳序列（scrambled timestamp sequence, STS）。一共 ${grp(CHIPS.marker)} 个码片（chip），到这里就结束了，后面没有物理头，也没有一个字节的载荷。所以它只能做一件事：让收发两端各记下一个时刻。它量到的时间要在后面另一帧里回来；而「这一帧是谁发的」，帧里根本没有地方可读——只有时隙表回答得了。`,
    },
    {
      kind: 'watch', jump: 1,
      heading: `时间线上那一格 ${us(NS.marker)} µs，却是 0 字节`,
      text: `载入仿真并播放，跳到发起方那一枚标记：它在第 1 个时隙，宽 ${us(NS.marker)} µs，而点开它，字节数是 0、速率是 0、信息单元那一列是空的。再看第 0 个时隙那一帧：${BYTES.rcmSp3} 字节，带着 ARC、RDM、RRMC，外加 ${ANCHORS} 个 SRRR 信息单元。一轮的第一帧只能是它——时隙的分配要由它说出去。`,
    },
    {
      kind: 'steps', heading: '一轮 SP3 测距，从头到尾',
      items: [
        `发起方先发控制消息：ARC 与 RDM 两个信息单元把「哪个时隙归谁」讲定，后面跟着每个响应方各一个 SRRR 信息单元——那是响应方事先声明报告相位要给它报哪几项。`,
        '发起方发出自己那一枚 SP3 标记。本轮两端的时间都从这一枚算起，而不是从控制消息算起：控制消息带着载荷，它当不了一枚标记。',
        '每个响应方在自己的时隙里各发一枚 SP3 标记。两端各记一个时刻，而这一枚归谁，由时隙决定。',
        `报告相位：每个响应方发一帧，把自己的回复时延送回发起方——这一帧正是延后那条路本来就要发的那一帧。若有响应方请求了往返时间（RRTT），发起方也发一帧，一个响应方一条地报回去。`,
        '发起方要等报告落地才算得出距离。测距相位走完的那一刻，它手里一条距离也没有。',
      ],
    },
    {
      kind: 'table', heading: '三句问话，答案都不在帧里',
      head: ['问哪一句', '答案在哪里'],
      rows: [
        ['这一枚标记是谁发的', '时隙表：控制消息里的 RDM 信息单元，加上 uwb/session.ts 的 slotAction'],
        ['它量到的时间是多少', '报告相位那一帧里，SP3 包自己带不了'],
        ['帧里有什么能回答上面两句', `什么也没有：0 字节，一个信息单元也没有`],
      ],
    },
    {
      heading: '「帧里什么也不带」是可以量出来的',
      text: '这句话不是一句说明，它有一次验收：同一轮跑两遍，第二遍只把发起方那张「时隙归谁」的表倒过来，别的一个字节没动。于是两条测距结果照样出现了，而每一条都逐位等于另一台锚点（anchor）的测量，和它自己记下的真实距离差了 3 m。「出现而且是错的」才是这次验收承重的那一半：要是身份藏在帧里，倒过表之后收端会判定这一帧不属于本时隙，整轮直接沉默——而沉默分不开这两种情形。',
    },
    {
      heading: '所以最短的那一帧排不到最前面',
      text: `把两件事放在一起看就清楚了：一轮总得先有人把时隙的分配讲出去，而讲得出这件事的帧一定带着载荷。所以 SP3 并不是把一轮里每一帧都压短，它是先多出一枚标记——发起方自己那一枚，${us(NS.marker)} µs——再从每个响应方身上各省下一截。这一课后面要算的就是这两者谁大。`,
    },
  ],
  numbers: [
    {
      kind: 'table', heading: '一帧有多长',
      head: ['帧', '字节', '空口时间（airtime）'],
      rows: [
        ['SP3 标记', '0', `${us(NS.marker)} µs`],
        [`最短的 SP1 测距帧：回复时延延后的应答`, `${BYTES.respDeferred}`, `${us(NS.respDeferred)} µs`],
        [`回复时延嵌在帧里的应答`, `${BYTES.respEmbedded}`, `${us(NS.respEmbedded)} µs`],
        [`报告相位里一个响应方那一帧`, `${BYTES.report}`, `${us(NS.report)} µs`],
      ],
    },
    {
      heading: '省下的那一截，和多出来的那一帧',
      text: `一枚标记比最短的 SP1 测距帧短 ${us(SAVE.shortest)} µs，比回复时延嵌在帧里的那一种短 ${us(SAVE.embedded)} µs。而报告相位里一个响应方那一帧要 ${us(NS.report)} µs：对着嵌在帧里那一种，这一帧是一枚标记省下的时间的 ${MULT.embedded} 倍；对着最短的那一种是 ${MULT.shortest} 倍。引用这个倍数必须说清对着哪一个——它是两个单帧时长的比值，和锚点个数无关。`,
    },
    {
      kind: 'diagram', heading: `${ANCHORS} 个响应方的一轮，分成三段`, spec: uwbSp3Fields(),
      caption: `按微秒画的是基础场景那一轮：被 SP3 压短的是中间那一段，而整轮最长的一段是第三段。同一个大厅、同样 ${ANCHORS} 个锚点，回复时延嵌在帧里的 SP1 只有前两段共 ${us(ROUND.embedded)} µs，而且根本没有第三段。`,
    },
    {
      kind: 'table', heading: '三种轮形，同一个场景',
      head: ['轮形', '时隙', '整轮空口时间'],
      rows: [
        ['SP1，回复时延嵌在帧里', `${SLOTS.embedded}`, `${us(ROUND.embedded)} µs`],
        ['SP1，回复时延延后', `${SLOTS.deferred}`, `${us(ROUND.deferred)} µs`],
        ['SP3 分组', `${SLOTS.sp3}`, `${us(ROUND.sp3)} µs`],
      ],
    },
    {
      kind: 'formula',
      heading: '到第几个响应方才抵得过',
      text: `${us(PAY.perResponder)} − ${us(PAY.srrrPerResponder)} = ${us(PAY.net)} µs；${us(PAY.initiatorMarker)} ÷ ${us(PAY.net)} = ${PAY.responders}`,
      note: `左边是一个响应方的净省：它的标记省下 ${us(PAY.perResponder)} µs，减去它自己那个 SRRR 信息单元在控制消息里添出来的 ${us(PAY.srrrPerResponder)} µs。那个减数是按一个响应方的边际量出来的——控制消息的时长按码块取整，所以它不是严格线性的。右边是发起方那一枚标记，一轮只多付这一次。于是第 ${PAY.crossover} 个响应方才抵得过它。`,
    },
    {
      kind: 'table', heading: '对着延后的 SP1，整轮差多少',
      head: ['响应方数 A', ...SWEEP.map((a) => String(a))],
      rows: [
        ['SP3 − 延后（µs）', ...GAP.vsDeferred.map((g) => us(g))],
        ['SP3 − 嵌在帧里（µs）', ...GAP.vsEmbedded.map((g) => us(g))],
      ],
    },
    {
      heading: '两个对照，不能混着说',
      text: `对着回复时延嵌在帧里的 SP1，每一个锚点数上 SP3 都更长，而且差距随锚点数严格变大（${ANCHORS} 个响应方时是 ${us(GAP.vsEmbedded[ANCHORS - 1])} µs）：那条路本来就没有报告相位，SP3 在它身上只有开销，没有可省的东西。有交叉点的是延后那条路，因为报告相位的开销它已经付过了——交叉点在 A = ${PAY.crossover}。而一旦有响应方请求了往返时间，发起方自己也要发一帧报告，那一帧还随响应方数变长，交叉点就挪到 A = ${PAY.crossoverRrtt}。`,
    },
    {
      kind: 'table', heading: 'SRRR 与多消息收妥确认：开销落在请求这一侧',
      head: ['比什么', `SRRR（§10.32.9.9）`, `MMRCR（§10.36）`],
      rows: [
        ['请求本身', `每个响应方 ${BYTES.srrrIe} 字节，随响应方数变长`, '0 字节：那一位在控制消息本来就带着的控制字段里'],
        ['回答', '一整帧报告', '一整帧收妥确认'],
        ['控制消息为它长了多少', `${BYTES.srrrAll} 字节，也就是 3A——而且两个请求位是开还是关，这 ${BYTES.srrrAll} 字节都在：长出来的是信息单元本身`, '0 字节'],
      ],
    },
    {
      heading: '对称的是回答，不对称的是请求',
      text: '两节的回答是同一个形状：对端发一整帧，开销都落在那一帧上。差别全在请求这一侧——多消息收妥确认借的是控制消息本来就要发的那个控制字段里的一位，所以请求一个字节也不花；SRRR 要在控制消息里为每个响应方各加一个信息单元，所以请求随响应方数一起变长。于是「请求一件事要不要付代价」这个问题，在同一份标准里有两个相反的答案，而两者都不是哪一边设计得更好：收妥确认问的是一件对每个响应方都相同的事，SRRR 问的是每个响应方各自要什么。',
    },
    {
      heading: '两个请求位都真的改变空口',
      text: `RAOA 要的是锚点测到的到达角（angle of arrival, AoA）：关着时报告帧 ${BYTES.report} 字节、${us(NS.report)} µs，打开时 ${BYTES.reportRaoa} 字节、${us(NS.reportRaoa)} µs，差的正好是方位角那一项的 ${BYTES.raoaItem} 个字节。RRTT 要的是往返时间，而答它的是发起方自己那一帧：${ANCHORS} 个响应方时 ${BYTES.initReport} 字节、${us(NS.initReport)} µs，它随响应方数变长，还多占一个时隙（${SLOTS.sp3} 个变 ${SLOTS.sp3Rrtt} 个）。所以这两位都不是摆设，而它们的开销落在哪一侧是分得开的：请求在控制消息里，回答在报告相位里。`,
    },
  ],
  deeper: [
    {
      heading: '那次变异为什么只动发起方手里的表',
      text: '课文里那次验收在 tests/uwb/sp3-round.test.ts 的 identifies the sender by its slot。它只把发起方那张表倒过来，而每个响应方自己手里的表一个字节没动——这一条是让变异只剩一个变量：同样的设备在同样的时刻发同样的帧，连时间线上每一格的位置都不动，唯一变的是发起方相信每个时隙归谁。断言也不是一个噪声带，而是那次精确的对调：第一台锚点名下的那条结果必须恰好等于原来第二台名下的那一条，反过来也一样。所以它不可能侥幸通过——一个把身份读错成随机值的实现，给不出这种整齐的对调。',
    },
    {
      heading: '一个被允许却可证明无效果的请求位',
      text: 'RRTT 这一位最初是上了空口而什么也不做的：控制消息里那 3 个字节确实发了出去，而整个报告相位在它置位与不置位时逐字节相同——因为当时发起方在报告相位里根本没有自己的时隙。一个被允许、却可以被证明毫无效果的配置，正是一个特性看起来做完了的方式，所以补的不是一句说明，是 Figure 10-242 里发起方自己那两帧：一枚标记和一帧报告。补完之后交叉点才从 A = 11 这一侧浮出来——而这也是本课那个「发起方先多付一枚标记」的前提，在它之前，这一课算出来的是另一个结论。',
    },
  ],
  limits: [
    {
      kind: 'unmodelled',
      text: '一个 SP3 包整个是加扰时间戳序列，而本仿真器没有一处密码学：uwb/phy.ts 的 UWB_STS_CHIPS 建的只是「这一段占多少空口时间」，引擎既不持有密钥、不生成脉冲，也不做比对。于是本课说的「最短」只是时长上最短，而这一段本该换来的那件事——序列对不上就不接受这次测量——在 SP3 这里一行也没有。@uwb-sts 那一课的第一条限制说的是同一件事：在这个引擎里它是一个开关，不是一次判决。',
    },
    {
      kind: 'unmodelled',
      text: '§10.32.8.2 还要求三件事，本仿真器一件也没建：SP3 相位前后各调一次 MLME-STS 原语来启停这个包配置、控制消息可以携带 RSSD 信息单元交换种子的一部分，以及参与设备的 STS 计数器要为 SP3 包的收发各自推进并对齐。引擎全篇没有一个 MAC 原语（uwb/device.ts 的状态机由时隙表驱动），uwb/frameFields.ts 的信息单元清单里没有 RSSD，计数器的推进因此也无从建起。后果是这里的 SP3 相位不需要被启停：它由时隙表决定，谁也不必先打一声招呼。',
    },
    {
      kind: 'out-of-scope',
      text: '§10.32.8.1 说这个过程可以推广到多发起方多响应方，本仿真器只建一对多——一个标签、若干锚点，与 §10.32.8.2 那张图一致。多对多在引擎里已经是另一个模式（mode 取 m2m），而 model/scenario.ts 的校验规则在那个模式下直接拒绝 sp3：那里没有一条控制消息可以挂每个响应方的 SRRR 信息单元，也没有「发起方」这个角色来发第一枚标记。两者的合并是另一刀。',
    },
    {
      kind: 'out-of-scope',
      text: '标准还有 SP2 这种包配置（序列放在载荷之后），本仿真器不建，理由是范围：引擎不建调制也不建波形，而在「占多少空口时间」这个粒度上，SP2 与 SP1 没有差别。uwb/frames.ts 里 UwbInfo 的 sp 字段类型就只有 1 和 3 两个取值，连写下 SP2 的地方都没有。所以本课那张表回答得了「SP3 比 SP1 短多少」，回答不了「SP2 与 SP1 差在哪里」。',
    },
    {
      kind: 'model-value',
      text: '§10.32.8.2 的图里，是发起方把到达角送给提出请求的那个响应方；本仿真器里天线阵列装在锚点上（UwbDeviceCfg 的 aoa，而 UWB_AOA 这条记录也出自锚点），所以手里有方位角可报的那一端是响应方，它就装在响应方自己那一帧报告里（uwb/frames.ts 的 makeSsDefer 多出来的那个参数）。条款规定的是那个请求位，没有规定阵列装在哪一端，所以这是一处取值而不是一处缺失——但读者对着那张图读本课的报告相位时，方位角的方向是反的。另外报告里方位角那一项的 4 个字节也是本仿真器的取值：条款给的是请求位，不是上报格式。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 §10.32.8 是 SP3 分组下的测距过程——§10.32.8.1 给出三个相位，§10.32.8.2 连同它的 Figure 10-242 给出时隙的指派、调度由控制器的上层决定这一条，以及测量报告相位里两个方向的帧；§10.32.9.9 是 SRRR 信息单元与它的 RAOA、RRTT 两个请求位。报告相位走的那条路是 §10.29.6.3 的「回复时间延后」，发起方那一帧报告的内容形状取自 §10.29.8.4 的 RMI 信息单元。本课完全不依赖任何草案。',
    `一个 SP3 包的时长由 uwb/phy.ts 的 uwbSp3Chips 算出：UWB_SHR_CHIPS 加 UWB_STS_CHIPS，即 ${grp(CHIPS.shr)} + ${grp(CHIPS.sts)} = ${grp(CHIPS.marker)} 个码片，没有物理头那 ${grp(CHIPS.phr)} 个，也没有载荷。课文里每一个长度都由函数算出（uwbSp3Ns、uwbSp3PollBytes、uwbSp3ReportBytes、uwbSp3InitReportBytes、uwbRespBytes、uwbPollBytes、uwbPpduNs），交叉点由 crossoverAnchors 搜出来，一个字面量也没有写。SRRR 信息单元 ${BYTES.srrrIe} 字节（单元头 ${UWB_IE_HDR_BYTES} 加控制 ${BYTES.srrrIe - UWB_IE_HDR_BYTES}）与报告里方位角那一项 ${BYTES.raoaItem} 字节是本仿真器的取值。${MS.slot} ms 的测距时隙与 ${MS.block} ms 的测距块（ranging block）来自 FiRa 的缺省配置，不是标准正文。`,
    `本课四个场景是同一个 22 × 8 m 大厅、同样 ${ANCHORS} 个锚点与一个标签（tag）、同样的种子，只有会话上的开关不同：SP3、延后的 SP1、嵌在帧里的 SP1，以及两个请求位都打开的 SP3。${ANCHORS} 个锚点不是随手取的，它正好是交叉点那一个数。四个场景都把非视距与载波频偏估计的残差关掉（cfoNoisePpm 取 0），这是本课的取值：延后那条路的回复时延长达几个时隙，0.2 ppm 的残差在最后几个时隙上值几十厘米的距离，会盖住本课唯一要读者核对的那件事——距离照样算得出来而且对得上几何。空口时间与它无关，时间戳噪声照旧留着。A 从 1 到 6 那两行由上面那些函数算出，并在 tests/course/uwb-sp3.test.ts 里对着 1 到 6 个锚点各跑一轮真实的轮核对过，逐个 A 完全相等。`,
  ],
  scenario: () => uwbSp3Scenario(),
  variants: [
    { label: `延后的 SP1：同一轮，测距帧还带着物理头与载荷`, scenario: () => uwbSp1Scenario('deferred') },
    { label: `嵌在帧里的 SP1：根本没有报告相位`, scenario: () => uwbSp1Scenario('embedded') },
    { label: `SP3，两个请求位都打开`, scenario: () => uwbSp3Scenario({ raoa: true, rrtt: true }) },
  ],
  jumps: [
    J(`一轮的第一帧：${BYTES.rcmSp3} 字节的控制消息，它当不了标记`, firstUwbPoll),
    J(`发起方自己那一枚标记：整帧 0 字节`, initiatorMarker),
    J('第一个响应方的标记，在它自己的时隙里', responderMarker),
    J('报告相位的第一帧：时间在这里才回来', firstUwbSsDefer),
    J('第一条测距行', firstUwbRange),
    J('第一枚 SP3 标记（无论出自哪一端）', firstUwbSp3),
  ],
  observe: [
    `一块里 ${SLOTS.sp3} 个时隙：第 0 个是控制消息，第 1 个是发起方自己那一枚标记，第 2 到第 ${ANCHORS + 1} 个是每个响应方各一枚，最后 ${ANCHORS} 个是报告。测距相位那 ${ANCHORS + 1} 格每一格都是 ${us(NS.marker)} µs。`,
    `点开任意一枚标记：字节数 0、速率 0、信息单元一列空着。而日志里这一枚仍然带着一个对端的名字——那个名字来自时隙，不来自帧，所以收端写下的名字是「这个时隙归谁」，不是「这一帧说它是谁」。`,
    `整轮空口时间 ${us(ROUND.sp3)} µs。载入「延后的 SP1」变体：${SLOTS.deferred} 个时隙、${us(ROUND.deferred)} µs——两者只差 ${us(Math.abs(GAP.vsDeferred[ANCHORS - 1]))} µs，这正是发起方那一枚标记刚刚被 ${ANCHORS} 个响应方抵完的样子。`,
  ],
  tryThis: [
    `载入「嵌在帧里的 SP1」变体：只有 ${SLOTS.embedded} 个时隙、${us(ROUND.embedded)} µs，一帧报告也没有，而四条距离照样算得出来。再回到基础场景对一遍：SP3 在这条路上多出 ${us(GAP.vsEmbedded[ANCHORS - 1])} µs。没有报告相位的那条路不需要 SP3，这就是为什么两个对照不能混着说。`,
    `载入「两个请求位都打开」变体：时隙从 ${SLOTS.sp3} 个变成 ${SLOTS.sp3Rrtt} 个，多出来的那一个是发起方自己那一帧报告（${BYTES.initReport} 字节）；每个响应方的报告帧也从 ${BYTES.report} 字节变成 ${BYTES.reportRaoa} 字节，里面多了一个方位角。整轮 ${us(ROUND.sp3Both)} µs，比延后的 SP1 长 ${us(ROUND.sp3Both - ROUND.deferred)} µs。交叉点也跟着往后挪：只请求往返时间是 A = ${PAY.crossoverRrtt}，而像这个变体一样连方位角一起请求，要到 A = ${PAY.crossoverBoth}。`,
  ],
  quiz: [
    {
      q: '为什么一轮 SP3 测距的第一帧不可能是 SP3 包？',
      options: [
        '因为第一帧要带着整轮的时间基准，而 SP3 包太短了',
        '因为第一帧要把时隙的分配说出去，而 SP3 包没有物理头也没有载荷，什么也说不出来',
        '因为标准规定第一帧必须由控制器发出',
      ],
      answer: 1,
      explain: `控制消息要带 ARC、RDM 与每个响应方的 SRRR 信息单元，这一轮是 ${BYTES.rcmSp3} 字节。一个 SP3 包是 0 字节的载荷，它连一个信息单元也装不下，所以发起方自己那一枚标记只能排在控制消息之后，成为本轮多出来的那一帧。`,
    },
    {
      q: `同样 ${ANCHORS} 个响应方，SP3 分组的一轮比哪一种 SP1 更短？`,
      options: [
        '比两种都更短，因为它的测距帧最短',
        '比两种都更长，因为它多了一个报告相位',
        `只比回复时延延后的那一种更短 ${us(Math.abs(GAP.vsDeferred[ANCHORS - 1]))} µs；比嵌在帧里的那一种长 ${us(GAP.vsEmbedded[ANCHORS - 1])} µs`,
      ],
      answer: 2,
      explain: '延后那条路本来就要为报告相位发一帧，SP3 只是把它的测距帧压到最短；嵌在帧里那条路根本没有报告相位，SP3 在它身上只有开销。所以报告相位才是全部的开销所在。',
    },
    {
      q: `交叉点为什么落在第 ${PAY.crossover} 个响应方？`,
      options: [
        `因为一个响应方净省 ${us(PAY.net)} µs，而发起方那一枚标记是一次性的 ${us(PAY.initiatorMarker)} µs，两者相除是 ${PAY.responders}`,
        '因为一轮最多只能有四个响应方',
        '因为控制消息到第四个响应方时就装不下更多 SRRR 信息单元了',
      ],
      answer: 0,
      explain: `净省是一枚标记省下的 ${us(PAY.perResponder)} µs 减去那个 SRRR 信息单元添出来的 ${us(PAY.srrrPerResponder)} µs。请求了往返时间时发起方还要多发一帧报告，交叉点就挪到 A = ${PAY.crossoverRrtt}。`,
    },
    {
      q: '把发起方那张「时隙归谁」的表倒过来，这一轮会怎样？',
      options: [
        '这一轮直接沉默：等待会判定收到的帧不属于本时隙',
        '测距结果照样出现，而每一条都逐位等于另一台锚点的测量——出现而且是错的',
        '测距结果照样出现而且照样正确，因为帧里带着发送者的地址',
      ],
      answer: 1,
      explain: '一枚标记里没有任何可以用来认人的字段，所以身份完全来自那张表。表倒过来，收端仍然收下了每一帧，只是把它记在了别人名下——沉默说明身份藏在帧里，出现而且错了才说明身份只在表上。',
    },
  ],
}
