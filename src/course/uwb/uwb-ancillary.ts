/**
 * UWB Tier 2 · M22 测距辅助信息 · One message does not fit in one frame.
 *
 * IEEE Std 802.15.4-2024 §10.35 (ranging ancillary information) and its RAICT IE (§10.35.2.1,
 * Figure 10-271), which is `docs/superpowers/specs/2026-10-02-ancillary-design.md` — §2 is the role
 * inversion, §4.2 the segmentation, §4.3 the three granularities and §6 what this cut leaves out.
 * This lesson is the Request = 0 half; Request = 1 (a scheduling request) is a later slice and the
 * fifth `limits` entry says so.
 *
 * **The one sentence this lesson exists for is about WHEN, not about what.** A lost frame is noticed
 * *when the next frame arrives*, not inferred from a timeout, because Frames Remaining counts down
 * in **every** frame: a receiver that reads 3 and then 1 knows the frame that would have said 2
 * never came. Measured on this lesson's own scene (tests/course/uwb-ancillary.test.ts, which moves
 * the sender for the span of one slot the way tests/uwb/ancillary-round.test.ts does):
 * `missing: [2]` at `t = 14 183 291`, the same nanosecond as the receiver's own `RX_OK` for the
 * next frame, against the message's own deadline at `t = 18 000 000` — **3.82 ms early**.
 *
 * **The contrast is what makes it a claim about timing**, and the lesson carries it: lose the LAST
 * frame and there is no next one, so the countdown stops and the only record comes from the
 * deadline — the same loss, 3.82 ms later. **And the limit the mechanism itself has**: lose the
 * FIRST frame and it names nothing at all, because the RAICT IE carries no total and no frame
 * index. That is a property of §10.35.2.1, not a shortcoming of this engine.
 *
 * Two more things the lesson gets across:
 *
 *   1. **The roles are inverted in this clause.** §10.35.1 calls the sender of ancillary
 *      information the *initiator* and the receiver the *responder* — the opposite way round from
 *      ranging. The slot table is still built from the ranging roles (`slotAction` dispatches on
 *      `tx: 'tag' | 'anchor'`), so a device that answers in ranging sends here, and a reader who
 *      does not know this will think it a bug.
 *   2. **Three granularities of "something was lost"**, which a reader will otherwise merge into
 *      one (design §4.3). RMNR (§10.34) is sent by the responder unprompted, per round. The receipt
 *      bitmap (§10.36) is requested by the controller, per validity window. Frames Remaining
 *      (§10.35) is **not a report at all** — the sender states the count in every frame, so the
 *      receiver waits for nothing. The third row is the new one and the difference is its point.
 *
 * The scenes. One 22 × 8 m hall, four anchors and one tag, SS-TWR with the reply time on the
 * Response, four runs differing only in session switches: the base (the exchange on, four frames),
 * a contention-scheduled run, a run whose control message governs `VALIDITY` blocks, and one with
 * the exchange off. The lost-frame measurement is **not** one of them and `sources` says so: this
 * engine's reception is a deterministic power comparison, so a static scene loses every frame or
 * none, and the measurement is made by moving the sender between two stretches of one run.
 *
 * Every number is computed, never typed: `raictIeBytes`, `uwbAncillaryBytes`, `uwbPpduNs`,
 * `roundPlan`, `ancillarySlots`, `blockSlots` and `blockCarriesAncillary` are called, and
 * tests/course/uwb-ancillary.test.ts re-measures each figure against whole blocks.
 *
 * `npx tsx scripts/lesson-dump.ts uwb-ancillary` prints it with its length. Measured, not guessed:
 * 3766 main-path characters, three things to observe and two experiments put it at 31.12 raw
 * minutes, which the formula rounds to the 30-minute bucket — 304 characters below the 32.5 raw
 * minutes that would break the ceiling. **A fourth `observe` line would break it outright**, since
 * the five calls to the simulator already spend 14 of the 30 minutes. Measure the same way before
 * adding a sentence, by IMPORTING `CHARS_PER_MINUTE`/`OBSERVE_MINUTES`/`TRY_MINUTES` from
 * `curriculum.ts` rather than retyping them: the controller retyped all three once and read a
 * 484-character margin where there were four.
 */
import type { Scenario, UwbSessionCfg } from '../../model/scenario'
import type { FieldsSpec } from '../diagram'
import {
  J, anchor, firstUwbRange, rangingLab, txOf, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'
import {
  RAICT_IE_MIN_BYTES, UWB_FCS_BYTES, UWB_IE_HDR_BYTES, UWB_MHR_BYTES,
  raictIeBytes, uwbAncillaryBytes, uwbPpduNs,
} from '../../uwb/phy'
import { ancillarySlots, blockCarriesAncillary, blockSlots, roundPlan } from '../../uwb/session'

/** Anchors of every scene here. Four: three time differences for the position fix, and the one
 * headcount every other UWB lesson of this hall uses. (The ancillary window is appended after the
 * ranging phase, so the anchor count is not what bounds `FRAMES` — the block is.) */
export const ANCHORS = 4
/** Frames one ancillary message is segmented across. Four, so Frames Remaining runs 3, 2, 1, 0 —
 * the shortest countdown in which a MIDDLE frame can go missing, which is the lesson's own case. */
export const FRAMES = 4
/** `rcmValidityRounds` of the third variant: one control message for four blocks, so the exchange
 * runs in the block that opens the window and in none of the three after it. */
export const VALIDITY = 4

/** Where the anchors stand, in metres: no two distances to the tag alike, so a measurement filed
 * under the wrong anchor disagrees with its own `trueDistM`. */
export const PLACES: readonly { x: number; y: number }[] = [
  { x: 1, y: 1 }, { x: 21, y: 1 }, { x: 21, y: 7 }, { x: 11, y: 7 },
]
/** Where the tag stands. In ranging it opens every round; in this exchange it is the receiver. */
export const TAG = { x: 7, y: 3 } as const

/** Anchor i's id. Ids decide the slot order, so `anc-1` is also the first responder — and
 * therefore, by `ANCILLARY_SENDER_INDEX`, the device that sends the ancillary message. */
export const idOf = (i: number): string => `anc-${i + 1}`
/** The tag's id. */
export const TAG_ID = 'uwb-1'
/** The device that sends the ancillary message: responder 0, which §10.35.1 calls this exchange's
 * *initiator*. The inversion the lesson is partly about. */
export const SENDER_ID = idOf(0)

/** The devices of every scene: `ANCHORS` anchors off `PLACES`, then the tag. */
const devices = () => [
  ...PLACES.map((p, i) => anchor(idOf(i), `A${i + 1}`, p.x, p.y)),
  uwbTag(TAG_ID, 'Tag', TAG.x, TAG.y),
]

/**
 * One scene: SS-TWR with the reply time on the Response, non-line-of-sight off, and whichever
 * session switches `session` names.
 *
 * `nlos: false` is this lesson's one knob, and the reason is that the only thing a reader is asked
 * to check about the distances here is that they still come out and still match the geometry when
 * the exchange is on. Timestamp noise is left at its default, because nothing in this lesson's
 * arithmetic touches it — an ancillary frame is not timed at all.
 */
const scene = (session: Partial<UwbSessionCfg>): Scenario =>
  uwbSc(rangingLab(), devices(), { method: 'ss', replyTime: 'embedded', nlos: false, ...session })

/** The base scene: the exchange on, one message of `FRAMES` frames, time-scheduled. */
export function uwbAncillaryScenario(
  over: Partial<UwbSessionCfg> = {},
): Scenario {
  return scene({ ancillary: true, ancillaryFrames: FRAMES, ...over })
}

/** The same hall with the exchange off: the run every «nothing moved» claim is measured against. */
export function uwbAncillaryOffScenario(): Scenario {
  return scene({ ancillary: false, ancillaryFrames: FRAMES })
}

/** The sessions the scenes run, read back off the scenarios rather than restated. */
const SESSIONS = {
  base: uwbAncillaryScenario().uwb!,
  contend: uwbAncillaryScenario({ schedule: 'contention' }).uwb!,
  window: uwbAncillaryScenario({ rcmValidityRounds: VALIDITY }).uwb!,
  off: uwbAncillaryOffScenario().uwb!,
} as const

/** The round plans both ends read their slot tables from. */
const PLANS = {
  base: roundPlan(SESSIONS.base, ANCHORS),
  contend: roundPlan(SESSIONS.contend, ANCHORS),
  window: roundPlan(SESSIONS.window, ANCHORS),
  off: roundPlan(SESSIONS.off, ANCHORS),
} as const

/**
 * The slot arithmetic of each scene, asked of the engine rather than counted off the device list:
 * the ranging phase's own slots, the slots the message appends, and the whole block's count.
 *
 * The contention row is a genuinely different width: a time-scheduled round appends exactly one
 * slot per frame, because the slot table names their owner; a contention round appends the round's
 * own contention-phase slots, because §10.32.2's schedule mode 0 names nobody and a window exactly
 * as wide as the message would leave nothing to draw from.
 */
export const SLOTS = {
  ranging: PLANS.base.slots,
  window: ancillarySlots(PLANS.base),
  block: blockSlots(PLANS.base, 0),
  contendRanging: PLANS.contend.slots,
  contendWindow: ancillarySlots(PLANS.contend),
  contendBlock: blockSlots(PLANS.contend, 0),
  /** What the same message appends with the exchange off: nothing, at any frame count. */
  off: ancillarySlots(PLANS.off),
} as const

/** Which of the first `VALIDITY + 2` blocks run the exchange when one control message governs
 * `VALIDITY` of them — the window the slice before built, reused rather than reinvented. */
export const WINDOW_BLOCKS: readonly number[] = [0, 1, 2, 3, 4, 5]
  .filter((b) => blockCarriesAncillary(PLANS.window, b))

/** The RAICT IE at each of the four combinations of its two presence bits, and the frame each one
 * builds. Both bits are set in every scene here, which is the longest of the four. */
export const IE = {
  bits: [[false, false], [true, false], [false, true], [true, true]] as const,
  ie: (n: boolean, f: boolean): number => raictIeBytes(n, f),
  frame: (n: boolean, f: boolean): number => uwbAncillaryBytes(n, f),
} as const

/** Every length the lesson prints, in octets. */
export const BYTES = {
  frame: uwbAncillaryBytes(true, true),
  shortest: uwbAncillaryBytes(false, false),
  ieMin: RAICT_IE_MIN_BYTES,
  ieFull: raictIeBytes(true, true),
  mhr: UWB_MHR_BYTES,
  ieHdr: UWB_IE_HDR_BYTES,
  fcs: UWB_FCS_BYTES,
} as const

/** Milliseconds: the slot and the block of every scene, read off the plan the engine lays out. */
export const MS = {
  slot: PLANS.base.slotNs / 1e6,
  block: PLANS.base.blockNs / 1e6,
} as const

/**
 * The two instants the lesson's own claim is about, as nanoseconds — closed form, geometry-free.
 *
 * `lead` is how much earlier the countdown names a missing middle frame than the message's own
 * deadline does: the message still had two slots to run, less the time the frame that names the gap
 * spent in the air. The flight time between the two devices is deliberately left out, so this
 * figure is a property of the slot length and the frame length rather than of where anything
 * stands; the real run agrees with it to within the flight time (22 ns in this lesson's hall) and
 * to the same two decimals in milliseconds, which tests/course/uwb-ancillary.test.ts measures.
 */
export const NS = {
  frame: uwbPpduNs(uwbAncillaryBytes(true, true)),
  lead: 2 * PLANS.base.slotNs - uwbPpduNs(uwbAncillaryBytes(true, true)),
} as const

/** Milliseconds, two decimals: how every instant in this lesson is printed. */
export const ms = (ns: number): string => (ns / 1e6).toFixed(2)

/** The first frame of the message: Frames Remaining `FRAMES − 1`, in the first appended slot. */
const firstFragment = txOf((r) => r.frame.kind === 'uwbAncillary')
/** The frame that says zero: the last one, after which the receiver has the whole message. */
const lastFragment = txOf((r) =>
  r.frame.kind === 'uwbAncillary' && r.frame.uwb?.raict?.framesRemaining === 0)
/** The record the receiver writes when the countdown reaches zero: the message, complete. */
const messageComplete = (r: { type: string }): boolean =>
  r.type === 'UWB_ANCILLARY' && (r as { complete?: boolean }).complete === true

/**
 * One ancillary frame, field by field, drawn to scale in octets — the longest of the four shapes,
 * which is the one every scene here sends.
 *
 * The two optional fields are drawn as their own boxes rather than folded into the information
 * unit, because the whole of §10.35.2.1's first point is that each of them is there only when a
 * presence bit in the control octet says so: a single box labelled 「信息单元」 would draw the frame
 * correctly and hide the thing the figure is for. Every width comes from `phy.ts`.
 */
export function uwbAncillaryFields(): FieldsSpec {
  const fields = [
    { label: '帧头', size: BYTES.mhr },
    { label: '单元头', size: BYTES.ieHdr },
    { label: '控制', size: 1 },
    { label: '消息编号', size: 1 },
    { label: '剩余帧数', size: 1 },
    { label: '帧校验', size: BYTES.fcs },
  ]
  const total = fields.reduce((n, f) => n + f.size, 0)
  return {
    kind: 'fields',
    fields,
    unit: 'B',
    total: `整帧 ${total} 字节，两个可选字段都不带时 ${BYTES.shortest} 字节`,
  }
}

export const uwbAncillary: Lesson = {
  id: 'uwb-ancillary',
  module: 24,
  title: '一条消息装不进一帧',
  why: '测距之外，两端有时还要带一份别的内容过去。标准为这件事留了一节，而它要解决的第一个问题很直接：一帧的载荷（payload）有上限，一条这样的消息可以比它长。于是这条消息被分装在几帧里，占掉一轮测距之后连着的几个时隙。每一帧都带一个信息单元，里面写着这条消息还剩几帧——注意是每一帧都写，不是最后一帧才写。这一课要讲清这个写法换来了什么：接收端读到的数从 3 跳到 1，它当场就知道本该写 2 的那一帧没有来，不必等任何超时。还有一件事要先说在前面，否则读者会以为是实现错了：这一节把发起方与响应方的意思换了，发消息的那一端在测距里恰恰是作答的那一端。',
  outcomes: [
    '说清为什么要分段，以及一条消息分几帧在本仿真器里由谁给出',
    '说出缺的那一帧是在哪一刻被发现的，以及它比这条消息的截止时刻早多少',
    '分开三种「丢了」的粒度：逐轮、整个有效期窗口、一条消息之内',
    '说清这一节的发起方与响应方为什么和测距里的同名词相反',
  ],
  needs: ['uwb-rcm-validity', 'uwb-receipt'],
  terms: [
    { term: 'ranging ancillary information', plain: '测距之外要送过去的那一份内容；本节只管它的编号、还剩几帧与类型，内容本身不在标准里' },
    { term: 'RAICT IE (Ranging Ancillary Information Message Counter and Type IE)', plain: '每一帧都带的那个信息单元：一个控制字节，后面跟着两个可选字段' },
    { term: 'Frames Remaining', plain: '那个单元里的一个字节：这条消息还剩几帧没发，最后一帧写 0' },
    { term: 'Request', plain: '控制字节里的第一位：置 0 是本课这一半，置 1 是向控制器请求时隙' },
    { term: 'ancillary initiator / ancillary responder', plain: '发辅助信息的那一端与收的那一端；这两个词在本节里和测距里反着用' },
  ],
  picture: [
    {
      heading: '一帧装不下，就分着装',
      text: `一帧的载荷有上限，而一条辅助消息可以比这个上限长。标准给的办法是把它分装在多条消息里，跨一轮之内的几个测距时隙（ranging slot）发出去。本仿真器照这个办法建：一条 ${FRAMES} 帧的消息，在测距相位走完之后连着占 ${SLOTS.window} 个时隙，一帧一个。每一帧都带一个 RAICT 信息单元，里面有这条消息的编号、这一帧之后还剩几帧，以及这条消息的类型。`,
    },
    {
      kind: 'watch', jump: 0,
      heading: `测距走完之后，还有 ${SLOTS.window} 个时隙`,
      text: `载入仿真并播放。一块里前 ${SLOTS.ranging} 个时隙是照旧的一轮单边双向测距（single-sided two-way ranging, SS-TWR）：第 0 个是控制消息，后面 ${ANCHORS} 个是每个锚点（anchor）各作答一次。跳到第一帧辅助信息，它在第 ${SLOTS.ranging} 个时隙，后面还跟着 ${FRAMES - 1} 帧。每帧 ${BYTES.frame} 字节。点开其中一帧看信息单元那一列：只有 RAICT 一个，里面的剩余帧数写着 ${FRAMES - 1}；后面三帧依次写 ${FRAMES - 2}、1、0。`,
    },
    {
      heading: '发消息的那一端，在测距里是作答的那一端',
      text: `标准为这个交换单独定义了两个词，而它们和测距里的同名词反着用：发出辅助信息的那一端叫发起方，接收的那一端叫响应方。而时隙表仍然是按测距角色排的（uwb/session.ts 的 slotAction 按「这一格归标签还是归锚点」分派），本仿真器也没有改它。于是读者会看到这样一幕：标签（tag）在测距里开场，在这里却一帧也不发；${SENDER_ID} 在测距里只是作答，在这里却是把消息发出去的那一端。这不是 bug，是这一节自己的定义。`,
    },
    {
      kind: 'steps', heading: '一条辅助消息，从头到尾',
      items: [
        '控制消息照旧把时隙的分配讲定。这个交换用的窗口就是这条控制消息的有效期窗口，不另立一个边界——本仿真器里这已经是第三处用到同一个窗口。',
        `发送端把这条消息分成 ${FRAMES} 帧，一帧占一个时隙，排在测距相位之后。测距那几帧一个字节也没动。`,
        '每一帧带一个 RAICT 信息单元：消息编号、剩余帧数、消息类型。剩余帧数从帧数减一数到 0。',
        '接收端每收到一帧就读一次剩余帧数。这一次读到的比上一次少超过 1，中间那几个数就是没来的那几帧——这一步不等任何东西，就在这一次接收里完成。',
        '最后一帧写 0。接收端据此判定这条消息收齐了，而不是靠数自己收到了几帧。',
      ],
    },
    {
      heading: '缺的那一帧是被下一帧发现的',
      text: '剩余帧数在每一帧里都写一遍，所以它既说明这一帧排在哪里，也说明后面还有多少。接收端读到 3，再读到 1，这两次读数之间少掉的那个 2 就是没来的那一帧的名字，不需要推测。它手里没有定时器，也没有和时隙表对照过，只是把这一次读到的数和上一次相减。',
    },
    {
      kind: 'table', heading: '三种「丢了」，粒度各不相同',
      head: ['哪一种', '谁发出', '粒度', '回答的问题'],
      rows: [
        ['测距消息未收到交互（§10.34）', '响应方自己决定发', '逐轮', '本轮的启动消息我没收到'],
        ['收妥位图（bitmap，§10.36）', '发起方在控制消息里请求', '整个有效期窗口', '你那几条开场消息我收到了哪几条'],
        ['剩余帧数（§10.35）', '发送端在每一帧里都带着', '一条消息之内', '这条消息还有几帧没来'],
      ],
    },
    {
      heading: '第三行不是一次回报',
      text: '前两行都是回报：一方把自己的经历整理好，在一个约定的时隙里发回去，所以另一方要等到那个时隙。第三行不是——没有谁为它多发一帧，发送端只是在本来就要发的每一帧里多写一个字节。于是接收端不必等任何约定的时刻，缺帧这件事和收到那一帧是同一个时刻的事。三者放在一起，读者才看得出「丢了」在标准里有三个不同的层次，而不是同一件事的三种说法。',
    },
  ],
  numbers: [
    {
      kind: 'table', heading: '长度由两个存在位决定',
      head: ['消息编号在不在', '剩余帧数在不在', '信息单元', '整帧'],
      rows: IE.bits.map(([n, f]) => [
        n ? '在' : '不在', f ? '在' : '不在', `${IE.ie(n, f)} 字节`, `${IE.frame(n, f)} 字节`,
      ]),
    },
    {
      kind: 'formula',
      text: `整帧 = 帧头（MAC header）${BYTES.mhr} + 单元头 ${BYTES.ieHdr} + 控制 1 + 编号 0 或 1 + 剩余帧数 0 或 1 + 帧校验 ${BYTES.fcs}`,
      note: `帧头（MAC header）与帧校验是每一种帧都有的两段。控制那一个字节里有两位专门说明后面两个可选字段在不在，所以这个信息单元的内容是 1 到 3 字节，整帧 ${BYTES.shortest} 到 ${BYTES.frame} 字节。这是本仿真器第一个长度由存在位决定的信息单元——别处的要么定长，要么长度随一个计数走。本课所有场景两位都置 1，所以每帧都是最长的那 ${BYTES.frame} 字节，${ms(NS.frame)} ms 的空口时间（airtime）。`,
    },
    {
      kind: 'diagram', heading: `一帧 ${BYTES.frame} 字节`, spec: uwbAncillaryFields(),
      caption: `按字节画的是本课每一帧的样子。两个可选字段画成两格而不是并进单元里，因为「它在不在由控制字节里的一位说明」正是这一节的第一件事；画成一格也不算错，但会把要看的东西盖掉。`,
    },
    {
      heading: '这条消息在一块里占多少',
      text: `一个测距时隙 ${MS.slot} ms，一个测距块（ranging block）${MS.block} ms。测距那一轮 ${SLOTS.ranging} 个时隙，这条消息再占 ${SLOTS.window} 个，于是带着这个交换的块是 ${SLOTS.block} 个时隙、${SLOTS.block * MS.slot} ms；关掉它就回到 ${SLOTS.ranging} 个时隙，一个也不多排（${SLOTS.off} 个）。这条消息的截止时刻就是它那一轮的末尾，也就是这 ${SLOTS.block} 个时隙全部走完的那一刻。`,
    },
    {
      kind: 'table', heading: `丢掉中间那一帧：三个时刻`,
      head: ['哪一刻', '发生了什么'],
      rows: [
        [`第 ${SLOTS.ranging + 1} 个时隙`, `本该写 ${FRAMES - 2} 的那一帧发了出去，而接收端没有收到`],
        [`第 ${SLOTS.ranging + 2} 个时隙的那一次接收`, `记录里写下「缺的是 ${FRAMES - 2} 号」——就在这一次接收里，不早不晚`],
        ['这一轮的末尾', `这条消息的截止时刻，比上面那一刻晚 ${ms(NS.lead)} ms`],
      ],
    },
    {
      heading: `早 ${ms(NS.lead)} ms，而这个数是算得出来的`,
      text: `这条消息还剩两个时隙要走，也就是 ${2 * MS.slot} ms，减去发现它的那一帧自己在空口上花掉的 ${ms(NS.frame)} ms，就是 ${ms(NS.lead)} ms。式子里没有任何一台设备的位置，所以这个提前量是时隙长度和帧长的性质，不是这个大厅的性质；真实运行里两者只差一次飞行时间。而这 ${ms(NS.lead)} ms 的对照物是接收端手里唯一的另一把尺子：这条消息的截止时刻。没有剩余帧数这个字段，接收端就只能等到那一刻，才发现这条消息始终没有收齐。`,
    },
    {
      heading: '丢掉最后一帧，这个办法就只剩那把尺子',
      text: `同一条消息，这次丢掉写 0 的那一帧：倒数停在 1，而后面没有下一帧了，所以没有任何一次接收能发现它。接收端这一侧唯一的记录出现在截止时刻，而且那条记录里没有时隙号——它不是一次接收。同一次丢失，晚了 ${ms(NS.lead)} ms 才知道。这正是这个办法的边界，而把它量出来，才使上面那一条成为一个关于时刻的主张，而不是一句关于「有个数不见了」的话。`,
    },
    {
      heading: '丢掉第一帧，它连名字都说不出',
      text: `还有一种情形这个办法什么也说不出：丢掉的是第一帧。接收端第一次读到的是 ${FRAMES - 2}，而它手里没有可以相减的上一次读数，也就无从知道 ${FRAMES - 1} 曾经发出过。原因在字段本身：RAICT 只报还剩几帧，既不带总帧数，也不带这一帧的序数。所以它点得出两次读数之间的缺口，点不出第一次读数之前的缺口——而这条消息照旧会被判为收齐，因为收齐的判据是读到 0。这是 §10.35.2.1 这个字段的性质，不是本仿真器少建了什么，而一个明白这一点的读者才算明白了这个字段。`,
    },
    {
      heading: '测距结果一个数也没动',
      text: `打开这个交换前后，测距结果逐字段相同——距离、块号、时刻，一个数都没变。原因是辅助信息那几帧不带任何时间量：接收端不为它记时间戳，也就不为它抽一次时间戳噪声，测距那一轮走的随机数流一点没动；多出来的时隙排在一轮之后，不插进轮里。所以这一节换来的是「还剩几帧」这件事，不是更准的距离。`,
    },
  ],
  deeper: [
    {
      heading: '第三次用同一个窗口',
      text: '§10.35.1 说这个交换发生在当前这一轮以及控制消息还管得着的那几轮里，而「管得着几轮」正是 ARC 信息单元里有效轮次那个字段（§10.32.9.1）。那就是本仿真器已经建好的那个窗口（uwb/session.ts 的 blockCarriesRcm），所以这一刀没有发明新的边界：一条控制消息管四个块时，这条辅助消息只在窗口的头一个块里发，后面三个块一帧也没有（uwb/session.ts 的 blockCarriesAncillary）。这是同一个窗口的第三处用处——前两处是逐轮那个未收到交互和整窗口那张收妥位图——而第三处用它的方式和前两处都不同：前两处用它判定谁有资格作答，这里用它决定这条消息在哪一块发出去。',
    },
    {
      heading: '竞争式那一种，窗口是另一个宽度',
      text: `正文说这个交换可以是排程式的，也可以是竞争式的，本仿真器两种都跑。差别不在帧里，在窗口上：排程式按一帧一个时隙排 ${SLOTS.window} 个，因为时隙表写明了每一格归谁；竞争式排的是这一轮自己那一段竞争时隙，本课的设置下是 ${SLOTS.contendWindow} 个，因为那种排程谁也不指名，而一段刚好只装得下这条消息的窗口里没有可抽的余地（uwb/phy.ts 的 uwbAncillarySlots 取两者的较大值）。于是竞争式那一种里，这 ${FRAMES} 帧仍然连着占 ${FRAMES} 个时隙，而起点由发送端自己抽出来，每个块都可能落在不同的位置。`,
    },
  ],
  limits: [
    {
      kind: 'unmodelled',
      text: '一条消息分几帧是场景配置，不是上层算出来的。本仿真器没有一条 MAC 原语——MCPS 的也好、别的也好，一条都没有建，所以也没有一个上层来持有一条「比一帧长」的消息并算出它该分几帧；帧数直接是会话上的一个整数（model/scenario.ts 的 ancillaryFrames，上限是这一块装不装得下这一轮，由 uwb/phy.ts 的 uwbSlotsPerTag 与 uwbAncillarySlots 一起算出）。这和有效轮次那个字段是同一种情形：真实设备里这个数来自上层交给 MAC 的那份内容有多长，而这里它是配置，所以也看不到「上层给了一条装不下的消息」这类错配。',
    },
    {
      kind: 'model-value',
      text: '消息类型建成了一个常量，不建取值表。Request 置 0 时这个信息单元还报这条消息的类型，而本仿真器只建一种辅助消息，所以类型是 uwb/device.ancillary.ts 里的 ANCILLARY_MESSAGE_KIND 一个数，不是一张可取的值表——条款的那些类型值描述的是上层的内容，而本引擎没有上层来产生它。后果是本课那张长度表只随两个存在位变，类型这一项在任何场景下都是同一个值，读者也无法用它分开两条不同用途的消息。',
    },
    {
      kind: 'model-value',
      text: '发出这条消息的始终是第 0 个响应方，一轮也只有一条消息。条款说的是「辅助信息的发起方发出一条消息」，没有说若干台设备里哪一台成为发起方，而本引擎没有上层来持有一条要发的消息，所以这个选择是模型定的（uwb/device.ancillary.ts 的 ANCILLARY_SENDER_INDEX）。后果是读者看不到两台设备在同一个窗口里各发一条消息的情形，而在竞争式排程下那本来是个值得看的局面：两条消息抽到重合的起点，会真的撞在一起。',
    },
    {
      kind: 'out-of-scope',
      until: 'uwb-ancillary-request',
      text: 'Request 置 1 的那一半不在本课里，而不在的理由是一课该教多少，不是举证不足：机理已经读通——Request 位、剩余帧数那个字段在置 1 时装的是请求的时隙数，以及「只有当发起方不是控制器时这一位才有意义」这个条件。它真正的题目也不是「再加一个字段」，而是「排程能不能被请求改变」——而这是两个题目，按公式算下来也装不进一课。还要改正一句这条限制曾经写错的机理：轮的长度本来就已经随块号变（uwb/session.ts 的 blockSlots，收妥确认与本课这条消息各自追加一批），所以让一个请求改变后续排程改的是追加那一批有多宽，不是把整张排布重建；会话构造时那一次 roundPlan（uwb/network.ts）仍然只调一次。',
    },
  ],
  sources: [
    `IEEE Std 802.15.4-2024 §10.35 是测距辅助信息，§10.35.1 给出这个交换的两个角色名与它的时间范围，§10.35.2.1 连同 Figure 10-271 给出 RAICT 信息单元的内容字段（Request、Ranging Or Ancillary Message Number Present、Ranging Or Ancillary Message Number、Frames Remaining）。本课建的是 Request 置 0 的那一半。窗口读的是 §10.32.9.1 的 ARC 信息单元里那个有效轮次字段；课文那张三行的表里，另外两行是 §10.34 的测距消息未收到交互与 §10.36 的多消息收妥确认。竞争式与排程式两种排法出自 §10.32.2。本课完全不依赖任何草案。`,
    `字节宽度是本仿真器的取值，取自 uwb/phy.ts：帧头 ${BYTES.mhr}、信息单元头 ${BYTES.ieHdr}、RAICT 最短 ${BYTES.ieMin}（单元头加一个控制字节）、帧校验 ${BYTES.fcs}。信息单元与整帧的长度都由 raictIeBytes 与 uwbAncillaryBytes 算出，空口时间由 uwbPpduNs 算出，时隙数由 roundPlan 与 ancillarySlots 算出，课文里一个字面量也没有写。${MS.slot} ms 的测距时隙与 ${MS.block} ms 的测距块来自 FiRa 的缺省配置，不是标准正文。`,
    `本课四个场景是同一个 22 × 8 m 大厅、同样 ${ANCHORS} 个锚点与一个标签、同样的种子，只有会话上的开关不同：基础场景、竞争式排程、一条控制消息管 ${VALIDITY} 个块，以及把这个交换关掉。四个场景都关掉非视距，这是本课的取值，时间戳噪声照旧留着——辅助信息那几帧根本不计时，所以本课的算式一处也不碰它。「丢掉一帧」那次测量不在这四个场景里：本仿真器的场景自己不会移动，而这里的收发判决完全确定、没有逐帧的衰落起伏，同一个静止场景里要么每一帧都收到、要么一帧也收不到。那次测量是在一段运行的中途把发送端挪开一个时隙的工夫做的（tests/course/uwb-ancillary.test.ts，手法取自 tests/uwb/ancillary-round.test.ts），测出来的提前量与课文那个算式只差一次飞行时间。`,
  ],
  scenario: () => uwbAncillaryScenario(),
  variants: [
    { label: `竞争式排程：窗口宽 ${SLOTS.contendWindow} 个时隙，起点抽出来`, scenario: () => uwbAncillaryScenario({ schedule: 'contention' }) },
    { label: `一条控制消息管 ${VALIDITY} 个块：只有窗口的头一块发`, scenario: () => uwbAncillaryScenario({ rcmValidityRounds: VALIDITY }) },
    { label: '把辅助信息交换关掉', scenario: () => uwbAncillaryOffScenario() },
  ],
  jumps: [
    J(`第一帧辅助信息：${BYTES.frame} 字节，剩余帧数 ${FRAMES - 1}`, firstFragment),
    J('写 0 的那一帧：这条消息的最后一帧', lastFragment),
    J('接收端判定收齐的那一条记录', messageComplete),
    J('第一条测距行', firstUwbRange),
  ],
  observe: [
    `一块里 ${SLOTS.block} 个时隙：前 ${SLOTS.ranging} 个是测距，后 ${SLOTS.window} 个一帧 ${BYTES.frame} 字节的辅助信息。点开其中任意一帧的信息单元列：只有 RAICT 一个，整块一次超时也没有——缺不缺帧这件事不走超时。`,
    `四帧的剩余帧数依次是 ${FRAMES - 1}、${FRAMES - 2}、1、0。写 0 那一帧到达之后，接收端这一侧这条消息记为收齐；在那之前每一条记录都写着「还没齐」。`,
    `发这四帧的是 ${SENDER_ID}，它在测距里只是作答的一端；收下它们的是标签，而标签在测距里才是开场的那一端。日志里这四帧都落在标签这一侧的记录上，对端写的是 ${SENDER_ID}。`,
  ],
  tryThis: [
    `载入「竞争式排程」变体：一轮本身从 ${SLOTS.ranging} 个时隙变成 ${SLOTS.contendRanging} 个，这条消息可抽的窗口从 ${SLOTS.window} 个变成 ${SLOTS.contendWindow} 个，而四帧仍然连着占四个时隙。逐块看它们落在窗口里第几格：几个块不是同一个答案，这就是抽出来的意思，而排程式那一种每个块都从第 0 格开始。`,
    `载入「一条控制消息管 ${VALIDITY} 个块」变体，按块数一遍辅助信息的帧数：第 ${WINDOW_BLOCKS[0]} 块有 ${FRAMES} 帧，第 1、2、3 块一帧也没有，到第 ${WINDOW_BLOCKS[1]} 块又来 ${FRAMES} 帧。再载入「把辅助信息交换关掉」变体：时隙从 ${SLOTS.block} 个回到 ${SLOTS.ranging} 个，一帧辅助信息也没有，而测距结果和基础场景逐字段相同。`,
  ],
  quiz: [
    {
      q: '为什么说缺的那一帧不是被超时猜出来的？',
      options: [
        '因为接收端为每一帧都设了一个定时器，哪个定时器响了就是哪一帧缺了',
        '因为剩余帧数在每一帧里都写一遍，所以读到的数少掉几个，中间那几帧就是没来的那几帧——这件事在收到下一帧的同一时刻就完成了',
        '因为发送端在最后一帧里报出总共发了几帧，接收端拿它和自己收到的帧数相减',
      ],
      answer: 1,
      explain: `接收端手里没有定时器，也没有和时隙表对照，它只是把这一次读到的数和上一次相减。本课那次测量里，这一刻比这条消息的截止时刻早 ${ms(NS.lead)} ms。`,
    },
    {
      q: '丢掉的是写 0 的那一帧，接收端什么时候知道？',
      options: [
        '和丢中间那一帧一样快，倒数本来就是逐帧的',
        '到这条消息的截止时刻才知道：后面没有下一帧，没有任何一次接收能发现这个缺口',
        '永远不知道，因为写 0 的那一帧才是收齐的判据',
      ],
      answer: 1,
      explain: `倒数停在 1 之后就没有下一次读数了，所以这一次缺失只能由截止时刻报出来，比丢中间那一帧晚 ${ms(NS.lead)} ms。接收端仍然知道消息没齐，只是晚了。`,
    },
    {
      q: '丢掉的是第一帧，这个办法为什么连它的名字都说不出？',
      options: [
        '因为第一帧里的剩余帧数字段不在，那一位是置 0 的',
        '因为 RAICT 只报还剩几帧，既不带总帧数也不带这一帧的序数，所以第一次读数之前的缺口没有可以相减的对象',
        '因为第一帧丢了之后整条消息都会被丢掉',
      ],
      answer: 1,
      explain: '它点得出两次读数之间的缺口，点不出第一次读数之前的缺口。而这条消息照旧会被判为收齐，因为收齐的判据是读到 0。这是这个字段自己的性质。',
    },
    {
      q: '为什么一台在测距里只负责作答的设备，在这里却是发消息的那一端？',
      options: [
        '因为本仿真器的时隙表排错了，这是一处已知的实现偏差',
        '因为这一节为这个交换单独定义了发起方与响应方，而它们和测距里的同名词反着用；时隙表仍然按测距角色排',
        '因为辅助信息总是从锚点流向标签，标准里没有反方向的情形',
      ],
      answer: 1,
      explain: `§10.35.1 把发出辅助信息的那一端叫发起方，接收的那一端叫响应方。本仿真器的 slotAction 仍按测距角色分派时隙，所以 ${SENDER_ID} 在同一张表上既是测距的响应方，又是这个交换的发起方。`,
    },
  ],
}
