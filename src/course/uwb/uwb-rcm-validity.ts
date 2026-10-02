/**
 * UWB Tier 2 · M19 控制消息的有效期 · A zero-content IE is not an empty message.
 *
 * IEEE Std 802.15.4-2024 §10.32.9.1 (the ARC IE's **RCM Validity Rounds** field) and §10.34
 * (the ranging message non-receipt exchange, and its RMNR IE), which is
 * docs/superpowers/specs/2026-10-01-rcm-validity-design.md §1 and §3. Two published-standard
 * features in one lesson for the reason design §1 gives: **neither works without the other**,
 * and that dependency is the better half of the teaching.
 *
 * The spine, in the order the lesson tells it:
 *
 *   1. RMNR needs a control message that outlives its round. In this engine the Poll is BOTH
 *      the control message and the initiation message, so "I hold your configuration but I
 *      missed this round's start" is a state that cannot occur — and a responder that missed the
 *      Poll does not even know which slot is its own, so it could not send RMNR if it wanted to.
 *      The standard answers this itself with RCM Validity Rounds. A mechanism's precondition is
 *      worth more than the mechanism.
 *   2. Only then the zero-content IE: §10.34.2.1's "This IE is formatted without any Content
 *      field". It carries three things, none of them in a payload it does not have — who is
 *      speaking (the slot, which came from the still-valid control message), "I did receive your
 *      control message" (the fact that it was sent at all) and "I did not receive this round's
 *      initiation" (that it is an RMNR and not a timed response).
 *
 * Every number the lesson prints is measured or computed, never typed: `uwbPollBytes`,
 * `uwbInitBytes`, `uwbRmnrBytes`, `blockCarriesRcm` and `rstuNs` are called, and
 * tests/course/uwb-rcm-validity.test.ts re-measures each figure against whole runs — including
 * the moved-anchor run of §10.34, which no static scenario can produce because nothing in a
 * scenario moves by itself and UWB reception here is deterministic.
 *
 * The scenes are three settings of one room (`rangingLab`, four anchors and one tag, DS-TWR with
 * embedded reply times, NLOS off and the session's default 100 ps timestamp noise left on):
 * `rcmValidityRounds` 4, the same room at 1 — today's behaviour, byte for byte — and the same
 * room with one anchor behind a brick partition and `rmnr` on, where it sends nothing, which is
 * the precondition in §10.34's own terms.
 *
 * `npx tsx scripts/lesson-dump.ts uwb-rcm-validity` prints it with its length. Measured, not
 * guessed: 3099 main-path characters, three things to observe and two experiments put it at 28.09
 * raw minutes, which the formula rounds to the 30-minute bucket — 972 characters below the
 * 32.5 raw minutes that would break the ceiling. Measure the same way before adding a sentence,
 * by IMPORTING `CHARS_PER_MINUTE`/`OBSERVE_MINUTES`/`TRY_MINUTES` from `curriculum.ts` rather than
 * retyping them: the controller retyped all three once and read a 484-character margin where there
 * were four.
 */
import type { Scenario, UwbSessionCfg, Wall } from '../../model/scenario'
import type { TimingSpec } from '../diagram'
import {
  J, brick, firstUwbInit, firstUwbPoll, firstUwbRange, rangingLab, txOf, uwbSc, uwbTag, anchor,
  type Lesson,
} from '../lessonKit'
import {
  ARC_IE_BYTES, RDM_ENTRY_BYTES, RDM_IE_FIXED_BYTES, RMNR_IE_BYTES, RRMC_IE_BYTES, UWB_FCS_BYTES,
  UWB_IE_HDR_BYTES, UWB_MHR_BYTES, rdmIeBytes, rstuNs, uwbInitBytes, uwbPollBytes, uwbRmnrBytes,
} from '../../uwb/phy'
import { blockCarriesRcm, roundPlan, slotAction } from '../../uwb/session'

/** Anchors of every scene below — the A of `13 + 3A`, and the design's own worked example. */
export const ANCHORS = 4
/** `rcmValidityRounds` of the base scene: one control message for four blocks. */
export const VALIDITY = 4
/** The blocks of one validity window, which is what the arithmetic is per (design §2.2). */
export const WINDOW = Array.from({ length: VALIDITY }, (_v, i) => i)

/** Where the four anchors and the tag stand, in metres: the corners of the hall, and its middle. */
export const PLACES: readonly { id: string; x: number; y: number }[] = [
  { id: 'anchor-1', x: 0.5, y: 0.5 },
  { id: 'anchor-2', x: 21.5, y: 0.5 },
  { id: 'anchor-3', x: 0.5, y: 7.5 },
  { id: 'anchor-4', x: 21.5, y: 7.5 },
]

/** The anchor the walled variant cuts off, and the only one the scene treats differently. */
export const WALLED_ANCHOR = PLACES[3].id

/**
 * One brick partition across the corner anchor 4 stands in. The tag is 11.07 m away, which
 * leaves the link about 8 dB over the receiver floor, and one brick wall is far more than that —
 * so this anchor hears nothing of the tag and the tag hears nothing of it. It crosses no other
 * anchor's path to the tag: every other anchor is at the other end or the other side of the
 * hall, and the segment only reaches the (22, 8) corner.
 */
function closet(): Wall[] {
  return [brick(19, 8, 22, 5.5)]
}

/**
 * The lesson's scene: four anchors and one tag in the 22 × 8 m hall, DS-TWR with embedded reply
 * times so that both ends of every block produce a range.
 *
 * `rcmValidityRounds` is the one knob the first two scenes differ in, and `walled` adds the
 * partition the third needs. The session's default timestamp noise is left ON deliberately: the
 * claim that nothing about the measurement changes is worth more against a noisy range than
 * against a noiseless one.
 */
export function uwbRcmValidityScenario(
  rcmValidityRounds: number = VALIDITY, walled = false, rmnr = false,
): Scenario {
  const hall = rangingLab()
  const house = walled ? { rooms: hall.rooms, walls: [...hall.walls, ...closet()] } : hall
  return uwbSc(
    house,
    [
      ...PLACES.map((p, i) => anchor(p.id, `A${i + 1}`, p.x, p.y)),
      uwbTag('uwb-1', 'Tag', 11, 4),
    ],
    { method: 'ds', replyTime: 'embedded', nlos: false, rcmValidityRounds, rmnr },
  )
}

/** The session the scene runs, read back off the scenario rather than restated. */
const SESSION: UwbSessionCfg = uwbRcmValidityScenario().uwb!

/** The round plan at one validity setting — where `blockCarriesRcm` reads the window from. */
const planAt = (rcmValidityRounds: number) =>
  roundPlan({ ...SESSION, rcmValidityRounds }, ANCHORS)

/** The plan of the base scene, and the slot table both ends of every block read. */
const PLAN = planAt(VALIDITY)

/**
 * Octets the tag opens block `block` with, at validity setting `r`: the control message on the
 * first block of each window, the initiation message alone on the blocks that window covers.
 * The judgement is `blockCarriesRcm`'s own, so the lesson cannot disagree with the engine about
 * which block carries which message.
 */
export const openerBytes = (block: number, r: number = VALIDITY): number =>
  blockCarriesRcm(planAt(r), block) ? uwbPollBytes(ANCHORS) : uwbInitBytes()

/** The two openers, by name: the control message, and the initiation message alone. */
export const RCM_BYTES = uwbPollBytes(ANCHORS)
export const INIT_BYTES = uwbInitBytes()
/** What the two IEs that bought the window cost, which is exactly what each later block saves. */
export const SAVED_PER_BLOCK = RCM_BYTES - INIT_BYTES
/** The saving per tag per window: `(R − 1)(13 + 3A)`. Per WINDOW, not per block (design §2.2). */
export const SAVED_PER_WINDOW = (VALIDITY - 1) * SAVED_PER_BLOCK
/** The same saving spread over the window's blocks — the number the first design draft got wrong. */
export const SAVED_SPREAD = SAVED_PER_WINDOW / VALIDITY
/** Opener octets one window costs at each setting: four control messages, or one and three. */
export const WINDOW_BYTES = {
  every: WINDOW.reduce((s, b) => s + openerBytes(b, 1), 0),
  shared: WINDOW.reduce((s, b) => s + openerBytes(b, VALIDITY), 0),
} as const

/** The RMNR frame: MHR + a two-octet IE header + FCS, and no Content field anywhere in it. */
export const RMNR_BYTES = uwbRmnrBytes()

/** Ranging records one window produces: both ends of each block, one per anchor. */
export const RANGE_ROWS = 2 * ANCHORS * VALIDITY

/**
 * The moved-anchor measurement of §10.34 (acceptance item 2, tests/uwb/rmnr-round.test.ts):
 * four blocks, one responder that heard block 0's control message and then left the initiator's
 * reach, and one that never heard anything at all. With the exchange off the initiator holds
 * seven silences it cannot tell apart; with it on, four of them and three named reasons.
 */
export const MOVED = { silent: 7, timeouts: 4, named: 3 } as const

/** The walled variant: what one anchor behind a brick partition leaves, per block. */
export const WALLED = { timeoutsPerBlock: 2, rmnr: 0, anchorsInFix: 3 } as const

/** The first slot whose action is `kind`, read out of the round's own slot table. */
const firstSlotOf = (kind: string): number => {
  for (let s = 0; s < PLAN.slots; s++) if (slotAction(PLAN, s).kind === kind) return s
  throw new Error(`uwb-rcm-validity: this round has no ${kind} slot`)
}

/**
 * The round as the slot table lays it out: the slot width in microseconds, how many slots there
 * are, and where each stretch of the figure begins — every one of them asked of `slotAction`
 * rather than counted off the anchor count, so the figure is the round the engine runs.
 */
export const FIG = {
  slotUs: rstuNs(SESSION.slotRstu) / 1000,
  slots: PLAN.slots,
  responseFrom: firstSlotOf('uwbResp'),
  finalAt: firstSlotOf('uwbFinal'),
  reportFrom: firstSlotOf('uwbReport'),
} as const

/** The control message of the second window — where the reader sees the window turn over. */
const secondWindowRcm = txOf((r) => r.frame.kind === 'uwbPoll' && r.frame.uwb?.block === VALIDITY)

/**
 * Two blocks of one session on one axis, drawn to scale: the same slot table twice, and the one
 * slot whose content differs.
 *
 * The four response slots and the four report slots are each drawn as one span rather than as
 * four, because at this scale one slot is 19 of the figure's 240 units and four labels in that
 * stretch would run into one another (they did). Slot 0's own label goes on the callout row above
 * the lane for the same reason, which is where it reads best anyway: it is the only thing in the
 * figure that differs between the two lanes. Every boundary comes from `slotAction`, so a figure
 * of this round cannot drift from the round.
 */
export function uwbRcmValidityTiming(): TimingSpec {
  const s = FIG.slotUs
  const tail = (): { label?: string; fromUs: number; toUs: number; tone: 'muted' }[] => [
    { label: '四个应答', fromUs: FIG.responseFrom * s, toUs: FIG.finalAt * s, tone: 'muted' },
    { fromUs: FIG.finalAt * s, toUs: FIG.reportFrom * s, tone: 'muted' },
    { label: '四个报告', fromUs: FIG.reportFrom * s, toUs: FIG.slots * s, tone: 'muted' },
  ]
  return {
    kind: 'timing',
    lanes: [
      {
        label: '第 0 块',
        spans: [
          { label: `控制消息 ${RCM_BYTES} B`, fromUs: 0, toUs: s, tone: 'accent' },
          ...tail(),
        ],
      },
      {
        label: `第 1 块`,
        spans: [
          { label: `启动消息 ${INIT_BYTES} B`, fromUs: 0, toUs: s, tone: 'accent' },
          ...tail(),
        ],
      },
    ],
    axis: {
      fromUs: 0, toUs: FIG.slots * s,
      ticks: [0, FIG.finalAt * s, FIG.slots * s], unit: 'µs',
    },
  }
}

export const uwbRcmValidity: Lesson = {
  id: 'uwb-rcm-validity',
  module: 19,
  title: '一个零内容的信息单元，不是一条空消息',
  why: '前面每一课里，标签（tag）每开一个测距轮（ranging round）都先发一帧轮询帧：这一帧既告诉各个锚点（anchor）本轮谁在哪个测距时隙（ranging slot）作答，又打下本轮计时用的第一个时间戳。两件事合在一帧里，于是同一张时隙表每一轮都要重发一遍。标准允许不这样做：控制消息里有一个字段，说明它管的不止本轮，后面几轮的开场只剩一帧很短的启动消息。这一课要算清这样省下多少，而更要先想清楚它带来的那个新状态——一个锚点手里的配置还有效，却没收到本轮的启动消息，它该做什么。',
  outcomes: [
    '说清「一条控制消息管几轮」为什么是测距消息未收到交互的前提，而不是两件互不相干的事',
    '读出一个有效期窗口里两种开场帧各有多少字节，并算出每几个块省下多少',
    '说出一个没有内容字段的信息单元凭什么还能携带三条信息',
    '指出一个从未收到过控制消息的响应方为什么必须保持沉默',
  ],
  needs: ['uwb-frame', 'uwb-blocks'],
  terms: [
    { term: 'ranging control message (RCM)', plain: '把一轮的配置发给各响应方的那一帧：谁在哪个时隙作答，这一轮要求什么' },
    { term: 'RCM Validity Rounds', plain: 'ARC 信息单元里的一个 6 位字段：这一条控制消息除本轮之外还管其后几轮' },
    { term: 'ranging initiation message', plain: '只负责打下本轮第一个时间戳的那一帧，不带配置' },
    { term: 'RMNR IE', plain: '测距消息未收到信息单元：没有内容字段，全部宽度就是一个信息单元头' },
  ],
  picture: [
    {
      heading: '标准里这本来是两帧',
      text: '标准把开一轮测距分成两条消息：一条控制消息把本轮的时隙表与要求发给各个响应方，一条测距启动消息打下计时的第一个时间戳，§10.34 的插图画的正是两帧。本仿真器把它们合成了一帧轮询帧，所以在这里「配置」和「开场」总是同时到、同时丢。ARC 信息单元里的有效轮次字段改变的就是这一点：它规定这一条控制消息管本轮以及其后若干轮，后面那几轮的开场只发启动消息——没有 ARC，没有 RDM，时隙表不再重发，因为上一条还有效。',
    },
    {
      kind: 'watch', jump: 1,
      heading: `第 0 块 ${RCM_BYTES} 字节，第 1 块 ${INIT_BYTES} 字节`,
      text: `载入仿真并播放，跳到第 1 块的开场帧。时间线上它比第 0 块那一帧窄得多：${RCM_BYTES} 字节对 ${INIT_BYTES} 字节。点开它看信息单元那一列，只剩 RRMC 一个；第 0 块那一帧里的 ARC 与 RDM 都不在了。帧的名字也换了——它不是一帧更短的轮询帧，而是标准本来就另有其名的那一帧。`,
    },
    {
      kind: 'diagram', heading: '同一张时隙表，两个块', spec: uwbRcmValidityTiming(),
      caption: `按比例画的相邻两个块：唯一的差别在第 0 个时隙里——第 0 块是 ${RCM_BYTES} 字节的控制消息，第 1 块是 ${INIT_BYTES} 字节的启动消息。后面每一个时隙归谁一个也没有变，这正是「有效期」的含义。图里「四个应答」与「四个报告」各是一个锚点一个时隙，为了放得下字才合画成一段；两段之间没有字的那一格，是标签自己发的 Final。`,
    },
    {
      heading: '先有有效期，才谈得上「我没收到」',
      text: '§10.34 讲的是这样一个响应方：它收到过控制消息，却没收到本轮的测距启动消息。它不在自己的时隙里保持沉默，而是发一帧带 RMNR 信息单元的帧，报告「本轮的启动消息我没收到」。把这个场景放回「每轮一条控制消息」的做法里，它立刻不成立：轮询帧丢了就是配置和开场一起丢，而一个连轮询帧都没收到的锚点既没有本轮的时隙表，也就不知道自己该在第几个时隙发送——它没有可用的时隙，这一帧发不出来。所以这不是两件互不相干的事：RMNR 要求控制消息的有效期跨过多轮，而标准自己给出的答案正是有效轮次这个字段。',
    },
    {
      kind: 'table', heading: '三条信息，一条也不在载荷（payload）里',
      head: ['这一帧报告了什么', '从哪里读出来'],
      rows: [
        ['是哪个响应方在报告', '它发在哪个测距时隙——而那张时隙表来自那条仍然有效的控制消息'],
        ['「你的控制消息我收到了」', '它把这一帧发出来了这件事本身'],
        ['「本轮的启动消息我没收到」', '它发的是 RMNR，而不是一次按时的应答'],
      ],
    },
    {
      kind: 'steps', heading: '一个有效期窗口，从头到尾',
      items: [
        `标签在窗口的第一个块发完整的轮询帧：ARC、RDM、RRMC 三个信息单元都在，ARC 里的有效轮次字段写着这一条还管几个块。`,
        '各个响应方收下它，记住两件事：自己在第几个时隙作答，以及这条配置到第几个块为止有效。',
        `窗口里其后每一个块，标签只发启动消息：${INIT_BYTES} 字节，没有 ARC，也没有 RDM。`,
        '某个响应方在某个块没收到这帧启动消息：手里的控制消息仍然有效，它就在自己的时隙里发一帧 RMNR；从来没收到过控制消息，它不知道自己的时隙在哪里，只能保持沉默。',
        `窗口用完，下一个块重新开始：标签又发一帧完整的轮询帧，有效期从这个块起算。启动消息从不延长有效期——否则这个窗口就会自己续下去，而不是控制消息定的那么长。`,
      ],
    },
    {
      kind: 'watch', jump: 2,
      heading: '窗口翻过一页',
      text: `一直播到第 ${VALIDITY} 块：开场帧又回到 ${RCM_BYTES} 字节。${VALIDITY} 个块一个窗口，第 0 个和第 ${VALIDITY} 个块各有一条控制消息，中间三个块只有启动消息。`,
    },
  ],
  numbers: [
    {
      kind: 'table', heading: `一个窗口的 ${VALIDITY} 个块，开场帧各有多少字节`,
      head: ['块', '每轮一条控制消息', `一条管 ${VALIDITY} 个块`],
      rows: [
        ...WINDOW.map((b) => [
          `第 ${b} 块`, `${openerBytes(b, 1)} 字节`,
          `${openerBytes(b, VALIDITY)} 字节${b === 0 ? '（控制消息）' : '（启动消息）'}`,
        ]),
        ['合计', `${WINDOW_BYTES.every} 字节`, `${WINDOW_BYTES.shared} 字节`],
      ],
    },
    {
      kind: 'formula', text: `省下 = (R − 1) × (${ARC_IE_BYTES + RDM_IE_FIXED_BYTES} + ${RDM_ENTRY_BYTES}A)，每 R 个块`,
      note: `A 是锚点个数，R 是一条控制消息管几个块。省下的正是不再重发的那两个信息单元：ARC ${ARC_IE_BYTES} 字节，RDM ${rdmIeBytes(ANCHORS)} 字节，合起来 ${SAVED_PER_BLOCK} 字节。四个锚点、R = ${VALIDITY} 时每个窗口省 ${VALIDITY - 1} × ${SAVED_PER_BLOCK} = ${SAVED_PER_WINDOW} 字节。最容易弄错的是那个周期：窗口里只有 ${VALIDITY - 1} 个块换了短的开场，所以摊到每个块是 ${SAVED_SPREAD} 字节；把 ${SAVED_PER_WINDOW} 字节算成每个块的，就把节省夸大了四倍。`,
    },
    {
      heading: '省下的是控制开销，不是测量',
      text: `两种设置在同样 ${VALIDITY} 个块里都量出 ${RANGE_ROWS} 条测距结果，而且逐字段相同——距离、品质因数（figure of merit, FoM）、块号、时刻，一个数都没有动。这一条是在时间戳噪声按缺省打开（100 ps）的情况下量的：噪声还在，它带来的差别也还在，只是两种设置里一模一样。这个字段省下的是空口时间（airtime），不是精度。`,
    },
    {
      kind: 'formula', text: `RMNR 帧 = 帧头 ${UWB_MHR_BYTES} + 信息单元头 ${UWB_IE_HDR_BYTES} + 帧校验 ${UWB_FCS_BYTES} = ${RMNR_BYTES} 字节`,
      note: `§10.34.2.1 关于这个信息单元只有一句话：This IE is formatted without any Content field。没有内容字段，于是它的全部宽度就是每个信息单元都有的那个 ${RMNR_IE_BYTES} 字节头部。整帧 ${RMNR_BYTES} 字节，比这一轮里任何一帧都短，比它要替下的那次沉默多出的也就是这 ${RMNR_BYTES} 字节。`,
    },
    {
      heading: '一次沉默能有三种原因，这一帧分出一种',
      text: `响应方不发时，发起方整轮只拿到一次超时，而它分不清三件事：这个锚点没收到开场、它答了但答复丢了、它已经不在了。有一次测量把一台锚点在第 0 块之后移出标签的覆盖范围：关掉这个交互，发起方在 ${VALIDITY} 个块里拿到 ${MOVED.silent} 次无从区分的超时；打开它，同样 ${VALIDITY} 个块里变成 ${MOVED.timeouts} 次超时加 ${MOVED.named} 条写明了原因的记录。而两次运行里每一条测距结果都一模一样：换掉的是一次沉默，不是一次测量。`,
    },
    {
      heading: '那个从未收到过控制消息的锚点',
      text: `同一次测量里还有一台锚点一次开场也没收到过。它始终不发 RMNR，而这是对的：时隙表在 RDM 信息单元里，它一个也没解出来，发出去就是占了别人的时隙。本课的砖墙变体把这件事单独摆出来：墙后那台锚点每个块留下 ${WALLED.timeoutsPerBlock} 次超时、${WALLED.rmnr} 帧 RMNR，而发起方靠剩下 ${WALLED.anchorsInFix} 台照旧每个块解出位置。所以这个交互的前提不是「打开了开关」，是「手里有一条还有效的控制消息」。`,
    },
  ],
  deeper: [
    {
      heading: '为什么它不是一帧更短的轮询帧',
      text: '本仿真器给启动消息单独一个帧类型，而不是给轮询帧加一个标志位，理由在标准那一侧：控制消息和测距启动消息本来是两帧，§10.34 的插图把两帧都画了出来。本引擎只在每个有效期窗口的第一个块把它们合成一帧；再往后那几个块发的，是这两帧之中仍然要发的那一帧——它不是一帧更短的轮询帧，而是另一条消息。复用同一个帧类型会把这件事藏起来：时间线上只剩下四根宽窄不同、名字相同的柱子，而那最容易被读成「速率变了」。',
    },
    {
      heading: '有效期为什么不自我续期',
      text: '收到启动消息不刷新有效期：窗口的长度由那条控制消息里的字段定下，此后只会走完，不会延长。这一条在引擎里是「有效期只记下控制消息所在的那个块号」实现的——一个响应方持有的全部状态就是这个块号，连同配置在第几个块为止有效这个判据。过了窗口，这个块号和从未收到过控制消息没有任何区别，于是那台锚点回到沉默。本引擎里跨轮保留的设备状态只有三处，这是其中之一（另外两处是竞争轮的重试预算和窄带要跳过的那个块号），而让它成为例外而不是泄漏的，正是它会过期。',
    },
  ],
  limits: [
    {
      kind: 'unmodelled',
      text: '本仿真器没有一条 MAC 原语——MCPS 的也好、别的也好，一条都没有建：有效轮次和这个未收到交互都是场景配置（model/scenario.ts 的 rcmValidityRounds 与 rmnr），不是两端在空口上商量出来的结果。真实设备里这两件事由上层通过 MAC 原语设定、再随控制消息发出去，一端改了另一端会从下一条控制消息里知道；这里改的是整个会话共用的那份配置，两端不可能不一致，也因此看不到「一端以为窗口是四个块、另一端以为是一个块」这类错配。',
    },
    {
      kind: 'unmodelled',
      text: 'ARC 信息单元只建了长度，没有建布局：uwb/phy.ts 里它是 ARC_IE_BYTES 一个字节数（头部加 8 字节的控制、块号、轮号、时隙号），有效轮次那 6 位和控制字段里其余的位一位也没有解析，取而代之的是会话上的一个整数。后果是本课那个字段只能取到它该管几个块这一层含义，而标准在同一组控制位里还放着别的请求位：第 15 位是 §10.36 的那个请求位，本课也没有建它。',
    },
    {
      kind: 'unmodelled',
      text: 'RDM 信息单元的条目同样只有宽度，没有内容：时隙表在本引擎里是会话自己的那份锚点名单，两端都从它算出谁在第几个时隙（uwb/session.ts 的 slotAction 与 device.ts 的 r.anchors.indexOf），没有哪一端真的去解析一个 RDM 条目。所以一个响应方在本引擎里始终「知道」时隙表，有效期建的是它有没有资格照着这张表作答——它持有的全部状态就是那条控制消息所在的块号。真实设备里那张表确实要从 RDM 信息单元里读出来，一个没解出它的设备连名单都没有。',
    },
    {
      kind: 'out-of-scope',
      text: '§10.35 的辅助信息交换与 §10.36 的多消息收妥确认都还没建，而没建的理由是一次该做多少，不是举证不足：两节的机理都已经读通——RAICT 信息单元的 Request 与 Frames Remaining 两个字段、RMMRC 信息单元按发起方分列的收妥位图，以及 ARC 控制位里第 15 位那个请求位。它们和本课讲的是同一组条款，排在后面做。把它写成「举证不足」会让读者以为那两节还没读懂，而事实相反。',
    },
    {
      kind: 'model-value',
      text: '本引擎里一个标签相继的测距轮就是相继的块（uwb/network.ts 的双向分派里，块内的轮号标的是这一轮属于哪个标签，对某个标签跨块恒定），所以有效期是按块数的：uwb/session.ts 的判据叫 blockCarriesRcm，参数名就写着块。标准数的是轮（§10.32.9.1），映射是忠实的，只是计数的那一维是本引擎的块。按轮号去数会对某个标签永远给出同一个答案、一次也不轮换，那样这个字段看着做完了，其实什么也没省。',
    },
  ],
  sources: [
    `IEEE Std 802.15.4-2024 §10.32.9.1 是 ARC 信息单元，RCM Validity Rounds 是它 Content Control 字段里的第 9 到 14 位，6 位，所以标准侧的取值是 0 到 63 轮；§10.34 是测距消息未收到交互，§10.34.2.1 是 RMNR 信息单元那一句「formatted without any Content field」。本课完全不依赖任何草案。`,
    `字节宽度是本仿真器的取值，取自 uwb/phy.ts：帧头 ${UWB_MHR_BYTES}、信息单元头 ${UWB_IE_HDR_BYTES}、ARC ${ARC_IE_BYTES}、RDM ${RDM_IE_FIXED_BYTES} + ${RDM_ENTRY_BYTES}A（四个锚点 ${rdmIeBytes(ANCHORS)}）、RRMC ${RRMC_IE_BYTES}、帧校验 ${UWB_FCS_BYTES}，于是一帧完整的轮询帧 ${uwbPollBytes(0)} + ${RDM_ENTRY_BYTES}A、一帧启动消息 ${INIT_BYTES}、一帧 RMNR ${RMNR_BYTES}。2 ms 的测距时隙与 200 ms 的块来自 FiRa 的缺省配置，不是标准正文。`,
    `本课的三个场景是同一个 22 × 8 m 大厅的三种设置：四个锚点一个标签、双边双向测距（double-sided two-way ranging, DS-TWR）、回复时延嵌在帧里、关掉非视距、时间戳噪声按缺省留在 100 ps。「一台锚点移出覆盖范围」那次测量不在其中：本仿真器的场景自己不会移动，而这里的收发判决完全确定，同一个静止场景里每个块的结果都一样，所以那次测量是在两段运行之间挪动那台锚点做的（tests/uwb/rmnr-round.test.ts）。`,
  ],
  scenario: () => uwbRcmValidityScenario(),
  variants: [
    { label: '每轮一条控制消息（今天的行为）', scenario: () => uwbRcmValidityScenario(1) },
    { label: '一台锚点在砖墙后，并打开未收到交互', scenario: () => uwbRcmValidityScenario(VALIDITY, true, true) },
  ],
  jumps: [
    J(`第 0 块的控制消息：ARC + RDM + RRMC，${RCM_BYTES} 字节`, firstUwbPoll),
    J(`第 1 块的启动消息：只有 RRMC，${INIT_BYTES} 字节`, firstUwbInit),
    J(`第 ${VALIDITY} 块：窗口翻页，又一条控制消息`, secondWindowRcm),
    J('第一条测距行', firstUwbRange),
  ],
  observe: [
    `开场帧的字节数按块看：第 0 块 ${RCM_BYTES}，第 1、2、3 块各 ${INIT_BYTES}，第 ${VALIDITY} 块又回到 ${RCM_BYTES}。窄的那三帧里少掉的，正是 ARC 与 RDM。`,
    `点开第 1 块那帧开场的信息单元列：只有 RRMC。帧的名字是测距启动帧，不是轮询帧——这两件事在标准里本来就是两条消息。`,
    `标签这一侧的测距行照旧每个块四条，位置也照旧每个块解出来：开场帧短了 ${SAVED_PER_BLOCK} 字节，没有一次测量因此改变。`,
  ],
  tryThis: [
    `载入「每轮一条控制消息」变体：一个窗口的四帧开场从 ${WINDOW_BYTES.shared} 字节回到 ${WINDOW_BYTES.every} 字节，差 ${SAVED_PER_WINDOW} 字节。再数这四个块里两端各自算出的测距行：两种设置都是 ${RANGE_ROWS} 条，逐字段相同。`,
    `载入「砖墙」变体：墙后那台锚点从未收到过控制消息，所以即使这个交互已经打开，它也一帧 RMNR 都不发，每个块仍然留下 ${WALLED.timeoutsPerBlock} 次超时。把那面墙挪开，它就重新作答——而要让它发出 RMNR，需要的是「收到过控制消息、偏偏这个块没收到启动消息」，这件事在一个静止的场景里出不来。`,
  ],
  quiz: [
    {
      q: '为什么「一条控制消息管几轮」是那个未收到交互的前提？',
      options: [
        '因为管得越多轮，开场帧越短，RMNR 才放得进时隙里',
        '因为每轮一条控制消息时，轮询帧丢了就是配置和开场一起丢，而没有配置的响应方不知道自己的时隙在哪里，发不出 RMNR',
        '因为标准规定这两个字段必须同时出现在 ARC 信息单元里',
      ],
      answer: 1,
      explain: 'RMNR 要报告的是「控制消息我有，本轮的启动消息我没收到」。两件事合在一帧里，这个状态根本不存在；而连时隙表都没有的响应方，连在哪个时隙报告都不知道。',
    },
    {
      q: `一帧 RMNR 只有 ${RMNR_BYTES} 字节、信息单元里一个内容字段也没有，它靠什么说清三件事？`,
      options: [
        '靠帧里的地址字段，把三件事编码进源地址',
        '靠它发在哪个时隙、以及「本该是一次按时的应答却是这一帧」这两点，加上它被发出来这件事本身',
        '它说不清，发起方只能当成一次超时',
      ],
      answer: 1,
      explain: '谁在报告由时隙决定，而时隙来自那条仍然有效的控制消息；「你的控制消息我收到了」由它发得出来这件事本身给出；「本轮启动消息没收到」由它发的是 RMNR 而不是应答给出。',
    },
    {
      q: '一台从未收到过任何控制消息的锚点，在本轮应该做什么？',
      options: [
        '发一帧 RMNR，告诉发起方自己什么都没收到',
        '保持沉默：它没有时隙表，不知道哪个时隙是自己的，发出去就占了别人的时隙',
        '在任意一个空闲时隙发一帧 RMNR，发起方会按地址认出它',
      ],
      answer: 1,
      explain: '这是这个交互的前提，不是边角情况。时隙表在 RDM 信息单元里，没解出过控制消息就没有这张表；发起方因此只能拿到一次超时，而那是诚实的答案。',
    },
    {
      q: `四个锚点、一条控制消息管四个块时，省下的 ${SAVED_PER_WINDOW} 字节是什么周期上的？`,
      options: [
        `每个块 ${SAVED_PER_WINDOW} 字节`,
        `每四个块 ${SAVED_PER_WINDOW} 字节，摊到每个块是 ${SAVED_SPREAD} 字节`,
        `每条测距结果 ${SAVED_PER_WINDOW} 字节`,
      ],
      answer: 1,
      explain: `一个窗口里只有 ${VALIDITY - 1} 个块换成了短的开场，每个块省 ${SAVED_PER_BLOCK} 字节。本引擎里一个标签相继的测距轮就是相继的块，所以周期是块。`,
    },
  ],
}
