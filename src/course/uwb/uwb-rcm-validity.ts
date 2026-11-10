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
 * `npx tsx scripts/lesson-dump.ts uwb-rcm-validity` prints it with its length. Measure a length
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
  module: 21,
  title: '一个零内容的信息单元，不是一条空消息',
  why: '前面每一课里，标签（tag）每开一个测距轮（ranging round）都先发一帧轮询帧：这一帧既告诉各个锚点（anchor）本轮谁在哪个测距时隙（ranging slot）作答，又产生本轮计时所用的第一个时间戳。两件事合在一帧里，于是同一张时隙表每一轮都要重发一遍。标准里这本来是两条消息（控制器与发起方是同一台设备时可以合并），而且控制消息里的有效轮次字段给出它一共管连续几轮（含它所在的这一轮），这个数不能超过当前块里剩余的轮数，也就是说一条控制消息不能跨块（§10.32.9.1）；本课的场景每个块只有一轮，却让一条控制消息管连续四个块——这是本课场景的简化，标准不允许，在标准下同样的节省出现在一个块里有多轮的场景中。这几轮里后面各轮的开场只剩一帧不带时隙表的启动消息，长度不到完整轮询帧的一半。省下的是空口时间（airtime），不是测量——两种做法测得的每条距离完全相同；而且节省量是按整个有效期窗口计算的，把它当成每个块的，就夸大了好几倍。更要紧的是它带来的新状态：锚点持有的配置仍然有效，却没收到本轮的启动消息。这时标准允许它在自己的时隙里发一帧带测距消息未收到（ranging message non-receipt, RMNR）信息单元的帧，这个信息单元没有内容字段，却能表达三项信息：帧头（MAC header）的源地址和它所在的时隙表明发送者是谁，能够发送表明控制消息已收到，发送的不是应答表明启动消息未收到。发起方原本只得到一次无法区分原因的超时，现在得到一帧说明原因的报告。从未收到过控制消息的锚点不知道自己的时隙在哪里，只能沉默。标准里控制消息和启动消息在同一轮里也可以是两帧，那时同一轮就会出现「收到控制消息、没收到启动消息」；本课把每个窗口第一块的两条消息合成一帧，所以在本课的场景里，有效期是这种状态出现的前提。',
  outcomes: [
    '说清测距消息未收到交互的前提——控制消息与启动消息是两条消息——以及在本课的场景里为什么只有有效期能造成这种情形',
    '读出一个有效期窗口里两种开场帧各有多少字节，并算出每几个块节省多少',
    '说出一个没有内容字段的信息单元为什么仍能携带三项信息',
    '指出一个从未收到过控制消息的响应方为什么必须保持沉默',
  ],
  needs: ['uwb-frame', 'uwb-blocks', 'uwb-dstwr'],
  terms: [
    { term: 'ranging control message (RCM)', plain: '把一轮的配置发给各响应方的那一帧：谁在哪个时隙作答，这一轮要求什么' },
    { term: 'RCM Validity Rounds', plain: 'ARC 信息单元里的一个 6 位字段：这一条控制消息一共管连续几轮，包括它所在的这一轮，且不能超过当前块里剩余的轮数' },
    { term: 'ranging initiation message', plain: '发起方发出的测距交互的第一条消息，产生本轮第一个时间戳；在本课里它不带配置' },
    { term: 'RMNR IE', plain: '测距消息未收到信息单元：没有内容字段，全部宽度就是一个信息单元头' },
  ],
  picture: [
    {
      heading: '标准里这本来是两帧',
      text: '标准把开一轮测距分成两条消息：一条控制消息把本轮的时隙表与要求发给各个响应方，一条测距启动消息产生计时的第一个时间戳，§10.34 的插图画的正是两帧。控制器与发起方是同一台设备时，标准允许把控制相位与启动相位合并（§10.32.2），前面几课就把它们合成了一帧轮询帧，所以在那里「配置」和「开场」总是同时到达、同时丢失。ARC 信息单元里的有效轮次字段改变的就是这一点：它规定这一条控制消息一共管连续几轮，后面那几轮的开场只发启动消息——没有 ARC，没有 RDM，时隙表不再重发，因为上一条还有效。',
    },
    {
      kind: 'watch', jump: 1,
      heading: `第 0 块 ${RCM_BYTES} 字节，第 1 块 ${INIT_BYTES} 字节`,
      text: `载入仿真并播放，跳到第 1 块的开场帧。时间线上它比第 0 块那一帧窄得多：${RCM_BYTES} 字节对 ${INIT_BYTES} 字节。打开它查看信息单元那一列，只剩 RRMC 一个；第 0 块那一帧里的 ARC 与 RDM 都不在了。帧的名称也不同——它不是一帧更短的轮询帧，而是标准中另有名称的另一帧。`,
    },
    {
      kind: 'diagram', heading: '同一张时隙表，两个块', spec: uwbRcmValidityTiming(),
      caption: `按比例画的相邻两个块：唯一的差别在第 0 个时隙里——第 0 块是 ${RCM_BYTES} 字节的控制消息，第 1 块是 ${INIT_BYTES} 字节的启动消息。后面每一个时隙的归属都没有变化，这正是「有效期」的含义。图里「四个应答」与「四个报告」各是一个锚点一个时隙，为了容纳文字才合并画成一段；两段之间没有字的那一格，是标签自己发的 Final。`,
    },
    {
      heading: '在本课里，先有有效期，才谈得上「我没收到」',
      text: '§10.34 讲的是这样一个响应方：它收到过控制消息，却没收到本轮的测距启动消息。它不在自己的时隙里保持沉默，而是发一帧带 RMNR 信息单元的帧，报告「本轮的启动消息我没收到」，同时也就表明控制消息已收到。标准的插图里，控制消息和启动消息是同一轮里先后发出的两帧，所以这种状态在一轮之内就可能出现，并不要求有效期跨越多轮。本课的情形不同：本课在每个窗口的第一块把两条消息合成一帧轮询帧，轮询帧丢失就意味着配置和开场同时丢失，而一个连轮询帧都没收到的锚点没有本轮的时隙表，也就不知道自己该在第几个时隙发送。所以在本课的场景里，只有窗口里后面那几块——控制消息仍然有效、开场只发启动消息——才会出现可以发 RMNR 的状态。',
    },
    {
      kind: 'table', heading: '三条信息，一条也不在信息单元的内容里',
      head: ['这一帧报告了什么', '从哪里读出来'],
      rows: [
        ['是哪个响应方在报告', '帧头里的源地址；它发在哪个测距时隙也与此对应——那张时隙表来自那条仍然有效的控制消息'],
        ['「你的控制消息我收到了」', '它发送了这一帧这一事实本身'],
        ['「本轮的启动消息我没收到」', '它发的是 RMNR，而不是一次按时的应答'],
      ],
    },
    {
      kind: 'steps', heading: '一个有效期窗口的完整过程',
      items: [
        `标签在窗口的第一个块发完整的轮询帧：ARC、RDM、RRMC 三个信息单元都在，ARC 里的有效轮次字段写明这一条对几轮有效（本课的场景每块一轮，于是等于几个块；标准不允许跨块，这是本课场景的简化）。`,
        '各个响应方接收它，并记录两项信息：自己在第几个时隙作答，以及这条配置到第几个块为止有效。',
        `窗口里其后每一个块，标签只发启动消息：${INIT_BYTES} 字节，没有 ARC，也没有 RDM。`,
        '某个响应方在某个块没收到这帧启动消息：持有的控制消息仍然有效，它就在自己的时隙里发一帧 RMNR（标准允许、但不强制这样做）；从来没收到过控制消息，它不知道自己的时隙在哪里，只能保持沉默。',
        `窗口结束后，下一个块重新开始：标签又发一帧完整的轮询帧，有效期从这个块起算。启动消息从不延长有效期——否则这个窗口就会自行延续，而不是保持控制消息规定的长度。`,
      ],
    },
    {
      kind: 'watch', jump: 2,
      heading: '进入下一个窗口',
      text: `一直播放到第 ${VALIDITY} 块：开场帧又回到 ${RCM_BYTES} 字节。${VALIDITY} 个块一个窗口，第 0 个和第 ${VALIDITY} 个块各有一条控制消息，中间三个块只有启动消息。`,
    },
  ],
  numbers: [
    {
      kind: 'table', heading: `一个窗口的 ${VALIDITY} 个块，开场帧各有多少字节`,
      head: ['块', '每轮一条控制消息', `一条对 ${VALIDITY} 个块有效`],
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
      note: `A 是锚点个数，R 是一条控制消息有效的块数。节省的正是不再重发的那两个信息单元：ARC ${ARC_IE_BYTES} 字节，RDM ${rdmIeBytes(ANCHORS)} 字节，合起来 ${SAVED_PER_BLOCK} 字节。四个锚点、R = ${VALIDITY} 时每个窗口节省 ${VALIDITY - 1} × ${SAVED_PER_BLOCK} = ${SAVED_PER_WINDOW} 字节。最容易出错的是那个周期：窗口里只有 ${VALIDITY - 1} 个块换了短的开场，所以平均到每个块是 ${SAVED_SPREAD} 字节；把 ${SAVED_PER_WINDOW} 字节算成每个块的，就把节省夸大了四倍。`,
    },
    {
      heading: '省下的是控制开销，不是测量',
      text: `两种设置在同样 ${VALIDITY} 个块里都测得 ${RANGE_ROWS} 条测距结果，而且每一条都相同——距离、品质因数（figure of merit, FoM）、块号、时刻，没有任何一个数发生变化。这一结论是在时间戳噪声按缺省值开启（100 ps）的情况下测得的：噪声仍然存在，它带来的差别也仍然存在，只是在两种设置里完全相同。这个字段省下的是空口时间（airtime），不是精度。`,
    },
    {
      kind: 'formula', text: `RMNR 帧 = 帧头 ${UWB_MHR_BYTES} + 信息单元头 ${UWB_IE_HDR_BYTES} + 帧校验 ${UWB_FCS_BYTES} = ${RMNR_BYTES} 字节`,
      note: `§10.34.2.1 规定这个信息单元没有内容字段。没有内容字段，于是它的全部宽度就是每个信息单元都有的那个 ${RMNR_IE_BYTES} 字节头部。整帧 ${RMNR_BYTES} 字节，比这一轮里任何一帧都短，比它所替代的那次沉默多占用的也就是这 ${RMNR_BYTES} 字节。`,
    },
    {
      heading: '一次沉默可能有三种原因，这一帧区分出其中一种',
      text: `响应方不发送时，发起方整轮只得到一次超时，而它无法区分三种情况：这个锚点没收到开场、它应答了但应答丢失、它已经离开覆盖范围。有一次测量在第 0 块之后把一台锚点移出标签的覆盖范围：关闭这个交互，发起方在 ${VALIDITY} 个块里得到 ${MOVED.silent} 次无法区分原因的超时；开启它，同样 ${VALIDITY} 个块里变成 ${MOVED.timeouts} 次超时加 ${MOVED.named} 条写明了原因的记录。而两次运行里每一条测距结果都完全相同：被替代的是一次沉默，不是一次测量。`,
    },
    {
      heading: '那个从未收到过控制消息的锚点',
      text: `同一次测量里还有一台锚点一次开场也没收到过。它始终不发 RMNR，而这是对的：本课的时隙表只由控制消息里的 RDM 信息单元给出，它一次也没有解出，若发送就会占用其他锚点的时隙。本课的砖墙变体单独展示了这一情况：墙后那台锚点每个块留下 ${WALLED.timeoutsPerBlock} 次超时、${WALLED.rmnr} 帧 RMNR，而发起方依靠其余 ${WALLED.anchorsInFix} 台锚点仍然每个块解出位置。所以这个交互的前提不是「开启了开关」，而是「持有一条仍然有效的控制消息」。`,
    },
  ],
  deeper: [
    {
      heading: '为什么它不是一帧更短的轮询帧',
      text: '时间线上启动消息有自己的名字，而不是一帧带标志位的轮询帧，理由在标准那一侧：控制消息和测距启动消息本来是两条消息，§10.34 的插图把两帧都画了出来。本课只在每个有效期窗口的第一个块把它们合成一帧；再往后那几个块发的，是这两帧之中仍然要发的那一帧——它不是一帧更短的轮询帧，而是另一条消息。两者若用同一个名称，这一点就无法体现：时间线上只剩下四根宽窄不同、名称相同的柱子，而这最容易被误读为「速率变了」。',
    },
    {
      heading: '有效期为什么不自我续期',
      text: '收到启动消息不刷新有效期：启动消息不带 ARC 信息单元，窗口的长度由那条控制消息里的字段定下，此后只会到期，不会延长。本课的响应方为此要记录的只有两项：控制消息是在哪个块收到的，以及这份配置到第几个块为止有效。过了窗口，它的处境和从未收到过控制消息没有任何区别，于是那台锚点重新保持沉默。',
    },
  ],
  limits: [
    {
      kind: 'unmodelled',
      text: '本课没有涉及任何一条 MAC 原语——MCPS 的也好、别的也好：有效轮次和这个未收到交互在本课都是事先给定的设置，不是两端在空口上协商得出的结果。真实设备里这两件事由上层通过 MAC 原语设定、再随控制消息发出去，一端修改后，另一端会从下一条控制消息中得知；本课里两端用的是同一份设置，不可能不一致，也因此看不到「一端以为窗口是四个块、另一端以为是一个块」这类错配。',
    },
    {
      kind: 'unmodelled',
      text: 'ARC 信息单元在本课只计入长度，不含逐位的内容：它只算一个字节数（头部加 8 字节的控制、块号、轮号、时隙号——这个划分是本课的取值；§10.32.9.1 的内容字段是两个八位组的控制位、一个八位组的 Content Control，再加可选的块、轮、时隙时长与会话标识），有效轮次那 6 位和控制字段里其余的位都没有逐位编码，有效轮次在本课直接是一个给定的整数。后果是本课那个字段只能表达它对几个块有效这一层含义，而标准在同一组控制位里还放着别的请求位：第 15 位是 §10.36 的多消息收妥确认请求位，下一课讲它，做法和有效轮次一样——一个事先给定的开关，不是从控制字里解出来的一位。',
    },
    {
      kind: 'unmodelled',
      text: 'RDM 信息单元的条目同样只有宽度，没有内容：时隙表在本课是事先给定的一份锚点名单，两端都按它知道谁在第几个时隙，没有哪一端真的从 RDM 条目里读出它。所以一个响应方在本课始终「知道」时隙表，有效期决定的只是它是否有资格按照这张表作答。真实设备里那张表确实要从 RDM 信息单元里读出来，一个没解出它的设备连名单都没有。',
    },
    {
      kind: 'out-of-scope',
      text: '§10.35 的辅助信息交换不在本课里。Request 置 0 的那一半见 @uwb-ancillary（一条消息分装在几帧里，每一帧都带着还剩几帧，所以缺失的那一帧在下一帧到达时就能被发现）。Request 置 1 的那一半见 @uwb-ancillary-request：RAICT 信息单元的 Request 位，以及 Frames Remaining 在那一位置 1 时携带的是请求的时隙数。后一半的题目不是「再加一个信息单元」，而是「排程能不能被请求改变」：Request 置 1 时那一帧向控制器请求下一次交互安排几个时隙，而本课里一轮的时隙排布从头到尾固定不变。同一组条款里的另一节 §10.36 的多消息收妥确认——RMMRC 信息单元按发起方分列的收妥位图，加上 ARC 控制位里第 15 位那个请求位——是紧接着这一课的那一课的题目。',
    },
    {
      kind: 'model-value',
      text: '本课里一个标签相继的测距轮就是相继的块，所以有效期在本课是按块数的。标准数的是轮（§10.32.9.1），两者一一对应，只是本课计数用的单位是块。',
    },
  ],
  sources: [
    `IEEE Std 802.15.4-2024 §10.32.9.1 是 ARC 信息单元，RCM Validity Rounds 在它内容字段里的第 9 到 14 位，6 位，所以标准侧的取值是 0 到 63 轮（它在开头两个八位组的控制位里，不在其后的 Content Control 字段里）；它表示这条控制消息管的连续轮数，§10.32.3.2 用它规定一个测距轮集合有几轮。§10.32.2 允许控制器兼任发起方时合并控制相位与启动相位。§10.34 是测距消息未收到交互，§10.34.2.1 规定 RMNR 信息单元没有内容字段。本课完全不依赖任何草案。`,
    `字节宽度是本仿真器的取值：帧头 ${UWB_MHR_BYTES}、信息单元头 ${UWB_IE_HDR_BYTES}、ARC ${ARC_IE_BYTES}、RDM ${RDM_IE_FIXED_BYTES} + ${RDM_ENTRY_BYTES}A（四个锚点 ${rdmIeBytes(ANCHORS)}）、RRMC ${RRMC_IE_BYTES}、帧校验 ${UWB_FCS_BYTES}，于是一帧完整的轮询帧 ${uwbPollBytes(0)} + ${RDM_ENTRY_BYTES}A、一帧启动消息 ${INIT_BYTES}、一帧 RMNR ${RMNR_BYTES}。2 ms 的测距时隙与 200 ms 的块来自 FiRa 的缺省配置，不是标准正文。`,
    `本课的三个场景是同一个 22 × 8 m 大厅的三种设置：四个锚点一个标签、双边双向测距（double-sided two-way ranging, DS-TWR）、回复时延嵌在帧里、关掉非视距、时间戳噪声按缺省留在 100 ps。「一台锚点移出覆盖范围」那次测量不在其中：本课的场景自己不会移动，而这里一帧能否被接收不含随机性，同一个静止场景里每个块的结果都一样，所以那次测量是在两段运行之间移动那台锚点完成的。`,
  ],
  scenario: () => uwbRcmValidityScenario(),
  variants: [
    { label: '每轮一条控制消息（今天的行为）', scenario: () => uwbRcmValidityScenario(1) },
    { label: '一台锚点在砖墙后，并打开未收到交互', scenario: () => uwbRcmValidityScenario(VALIDITY, true, true) },
  ],
  jumps: [
    J(`第 0 块的控制消息：ARC + RDM + RRMC，${RCM_BYTES} 字节`, firstUwbPoll),
    J(`第 1 块的启动消息：只有 RRMC，${INIT_BYTES} 字节`, firstUwbInit),
    J(`第 ${VALIDITY} 块：进入下一个窗口，又一条控制消息`, secondWindowRcm),
    J('第一条测距行', firstUwbRange),
  ],
  observe: [
    `按块查看开场帧的字节数：第 0 块 ${RCM_BYTES}，第 1、2、3 块各 ${INIT_BYTES}，第 ${VALIDITY} 块又回到 ${RCM_BYTES}。较窄的那三帧中缺少的，正是 ARC 与 RDM。`,
    `打开第 1 块开场帧的信息单元列：只有 RRMC。帧的名字是测距启动帧，不是轮询帧——这两件事在标准里本来就是两条消息。`,
    `标签这一侧的测距行仍然每个块四条，位置也仍然每个块都能解出：开场帧短了 ${SAVED_PER_BLOCK} 字节，没有一次测量因此改变。`,
  ],
  tryThis: [
    `载入「每轮一条控制消息」变体：一个窗口的四帧开场从 ${WINDOW_BYTES.shared} 字节恢复为 ${WINDOW_BYTES.every} 字节，相差 ${SAVED_PER_WINDOW} 字节。再统计这四个块里两端各自算出的测距行：两种设置都是 ${RANGE_ROWS} 条，逐字段相同。`,
    `载入「砖墙」变体：墙后那台锚点从未收到过控制消息，所以即使这个交互已经打开，它也一帧 RMNR 都不发，每个块仍然留下 ${WALLED.timeoutsPerBlock} 次超时。把那面墙移开，它就恢复作答——而要让它发出 RMNR，需要的是「收到过控制消息、偏偏这个块没收到启动消息」，这种情况在一个静止的场景里不会出现。`,
  ],
  quiz: [
    {
      q: '在本课的场景里，为什么「一条控制消息对几轮有效」是那个未收到交互的前提？',
      options: [
        '因为有效轮数越多，开场帧越短，RMNR 才能放入时隙',
        '因为每轮一条控制消息时，轮询帧丢失就意味着配置和开场同时丢失，而没有配置的响应方不知道自己的时隙在哪里，发不出 RMNR',
        '因为标准规定只有有效轮次大于 1 时才可以发 RMNR',
      ],
      answer: 1,
      explain: 'RMNR 要报告的是「控制消息我有，本轮的启动消息我没收到」。本课在每个窗口第一块把两件事合在一帧里，那一块里这个状态根本不存在；而连时隙表都没有的响应方，连在哪个时隙报告都不知道。标准本身并不要求有效期跨越多轮：控制消息与启动消息在同一轮里分成两帧时，同样会出现这个状态。',
    },
    {
      q: `一帧 RMNR 只有 ${RMNR_BYTES} 字节、信息单元里一个内容字段也没有，它依靠什么表达三项信息？`,
      options: [
        '依靠帧里的地址字段，把三项信息编码进源地址',
        '依靠帧头的源地址与它所在的时隙、「本该是一次按时的应答却是这一帧」，加上它被发送出来这一事实本身',
        '它无法表达，发起方只能当作一次超时',
      ],
      answer: 1,
      explain: '谁在报告由帧头的源地址给出，也与它所在的时隙对应，而时隙来自那条仍然有效的控制消息；「你的控制消息我收到了」由它能够发送这一事实本身给出；「本轮启动消息没收到」由它发的是 RMNR 而不是应答给出。三项都不在信息单元的内容里。',
    },
    {
      q: '一台从未收到过任何控制消息的锚点，在本轮应该做什么？',
      options: [
        '发一帧 RMNR，告诉发起方自己什么都没收到',
        '保持沉默：它没有时隙表，不知道哪个时隙是自己的，若发送就会占用其他设备的时隙',
        '在任意一个空闲时隙发一帧 RMNR，发起方会按地址认出它',
      ],
      answer: 1,
      explain: '这是这个交互的前提，不是特殊情况。本课的时隙表只在 RDM 信息单元里，没解出过控制消息就没有这张表；发起方因此只能得到一次超时，而那是如实的结果。',
    },
    {
      q: `四个锚点、一条控制消息管四个块时，省下的 ${SAVED_PER_WINDOW} 字节是什么周期上的？`,
      options: [
        `每个块 ${SAVED_PER_WINDOW} 字节`,
        `每四个块 ${SAVED_PER_WINDOW} 字节，平均到每个块是 ${SAVED_SPREAD} 字节`,
        `每条测距结果 ${SAVED_PER_WINDOW} 字节`,
      ],
      answer: 1,
      explain: `一个窗口里只有 ${VALIDITY - 1} 个块换成了短的开场，每个块节省 ${SAVED_PER_BLOCK} 字节。本课里一个标签相继的测距轮就是相继的块，所以周期是块。`,
    },
  ],
}
