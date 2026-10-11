/**
 * UWB Tier 2 · M24 测距辅助信息 · One message does not fit in one frame.
 *
 * IEEE Std 802.15.4-2024 §10.35 (ranging ancillary information) and its RAICT IE (§10.35.2.1,
 * Figure 10-271), which is `docs/superpowers/specs/2026-10-02-ancillary-design.md` — §2 is the role
 * inversion, §4.2 the segmentation, §4.3 the three granularities and §6 what this cut leaves out.
 * This lesson is the Request = 0 half; Request = 1 (a scheduling request) is a later slice and the
 * fourth `limits` entry says so, with the `until` that names the lesson which lifted it.
 *
 * **SPLIT 2026-10-11.** This file used to be both halves of the clause at 3 766 main-path
 * characters and 31.12 raw minutes — the widest lesson in the course by scaffold and the narrowest
 * by its distance to the 32.5 raw minutes that round to 35 (304 characters). The answer
 * `curriculum.ts` gives to a lesson past 30 minutes is to split it, and
 * `docs/superpowers/specs/2026-10-11-no-room-design.md` §2.1 and §5.2 are the case for doing it
 * here first: the four `outcomes` already divided 2 + 2, the two halves' blocks each ran
 * continuously, and the ratchet, the module index and the minute sum all cost nothing.
 * **What stayed here is the carriage: how one message becomes several frames, how long one frame
 * is and what decides that, and the role inversion.** What left is `uwb-ancillary-loss` — what the
 * count in every frame BUYS, which is a claim about an instant and is measured three ways there.
 *
 * So the one sentence this file now exists for is **「一条消息装不进一帧」**, and it has three
 * parts:
 *
 *   1. **Segmentation.** One payload has a ceiling and one ancillary message may exceed it, so the
 *      message is carried across `FRAMES` frames in as many slots appended after the ranging
 *      phase — and in this engine the frame count is a scenario field, which the first `limits`
 *      entry owns.
 *   2. **The length is decided by two presence bits.** Four combinations, three lengths: the two
 *      middle ones are distinct inputs that cost the same octet, which is the half a 「just add 2」
 *      reading gets wrong. `raictIeBytes` and `uwbAncillaryBytes` answer every cell.
 *   3. **The roles are inverted in this clause.** §10.35.1 calls the sender of ancillary
 *      information the *initiator* and the receiver the *responder* — the opposite way round from
 *      ranging. The slot table is still built from the ranging roles (`slotAction` dispatches on
 *      `tx: 'tag' | 'anchor'`), so a device that answers in ranging sends here, and a reader who
 *      does not know this will think it a bug.
 *
 * The scenes, which `uwb-ancillary-loss` loads unchanged (`sameSceneAs`). One 22 × 8 m hall, four
 * anchors and one tag, SS-TWR with the reply time on the Response, four runs differing only in
 * session switches: the base (the exchange on, four frames), a contention-scheduled run, a run
 * whose control message governs `VALIDITY` blocks, and one with the exchange off.
 *
 * Every number is computed, never typed: `raictIeBytes`, `uwbAncillaryBytes`, `uwbPpduNs`,
 * `roundPlan`, `ancillarySlots`, `blockSlots` and `blockCarriesAncillary` are called, and
 * tests/course/uwb-ancillary.test.ts re-measures each figure against whole blocks. `MS` and `NS`
 * are exported for the other half, which prints them rather than recomputing them.
 *
 * `npx tsx scripts/lesson-dump.ts uwb-ancillary` prints it with its length. Measured, not guessed:
 * 1 917 main-path characters, two things to observe and one experiment put it at 16.71 raw minutes,
 * which the formula rounds to the 15-minute bucket — 174 characters below the 17.5 raw minutes that
 * would round to 20 and break the course's minute-sum equality (NOT the one-sitting ceiling, which
 * is now 15 minutes away). Measure the same way before adding a sentence, by IMPORTING
 * `CHARS_PER_MINUTE`/`OBSERVE_MINUTES`/`TRY_MINUTES` from `curriculum.ts` rather than retyping
 * them: the controller retyped all three once and read a 484-character margin where there were
 * four.
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
  why: '测距之外，两端有时还要带一份别的内容过去，而标准为这件事留的那一节要先解决一个很直接的问题：一帧的载荷（payload）有上限，一条这样的消息可以比它长。于是它被分装在几帧里，占掉一轮测距之后连着的几个时隙。这一课只管它怎么被载送：分成几帧、一帧多长、长度由什么决定。还有一件事要先说，否则读者会以为是实现错了：这一节把发起方与响应方的意思换了，发消息的那一端在测距里恰恰是作答的那一端。每一帧还都写着这条消息还剩几帧，而那个写法换来了什么，是下一课的题目。',
  outcomes: [
    '说清为什么要分段，以及一条消息分几帧在本仿真器里由谁给出',
    '说清这一节的发起方与响应方为什么和测距里的同名词相反',
  ],
  needs: ['uwb-rcm-validity', 'uwb-receipt'],
  terms: [
    { term: 'ranging ancillary information', plain: '测距之外要送过去的那一份内容；本节只管它的编号、还剩几帧与类型，内容本身不在标准里' },
    { term: 'RAICT IE (Ranging Ancillary Information Message Counter and Type IE)', plain: '每一帧都带的那个信息单元：一个控制字节，后面跟着两个可选字段' },
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
      text: `载入仿真并播放。一块里前 ${SLOTS.ranging} 个时隙是照旧的一轮单边双向测距（single-sided two-way ranging, SS-TWR）：第 0 个是控制消息，后面 ${ANCHORS} 个是每个锚点（anchor）各作答一次。跳到第一帧辅助信息，它在第 ${SLOTS.ranging} 个时隙，后面还跟着 ${FRAMES - 1} 帧。每帧 ${BYTES.frame} 字节。点开其中一帧看信息单元那一列：只有 RAICT 一个，里面写着这条消息的编号、还剩几帧与类型。`,
    },
    {
      heading: '发消息的那一端，在测距里是作答的那一端',
      text: `标准为这个交换单独定义了两个词，而它们和测距里的同名词反着用：发出辅助信息的那一端叫发起方，接收的那一端叫响应方。而时隙表仍然是按测距角色排的（uwb/session.ts 的 slotAction 按「这一格归标签还是归锚点」分派），本仿真器也没有改它。于是读者会看到这样一幕：标签（tag）在测距里开场，在这里却一帧也不发；${SENDER_ID} 在测距里只是作答，在这里却是把消息发出去的那一端。这不是 bug，是这一节自己的定义。`,
    },
    {
      kind: 'steps', heading: '一条辅助消息，从头到尾',
      items: [
        '控制消息照旧把时隙的分配讲定。这个交换用的窗口就是这条控制消息的有效期窗口，不另立一个边界。',
        `发送端把这条消息分成 ${FRAMES} 帧，一帧占一个时隙，排在测距相位之后。测距那几帧一个字节也没动。`,
        '每一帧带一个 RAICT 信息单元：消息编号、剩余帧数、消息类型。剩余帧数从帧数减一数到 0。',
        '接收端每收到一帧就读一次剩余帧数，于是它随时知道这条消息还剩几帧没来。',
        '最后一帧写 0。接收端据此判定这条消息收齐了，而不是靠数自己收到了几帧。',
      ],
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
  ],
  deeper: [
    {
      heading: '第三次用同一个窗口',
      text: '§10.35.1 说这个交换发生在当前这一轮以及控制消息还管得着的那几轮里，而「管得着几轮」正是 ARC 信息单元里有效轮次那个字段（§10.32.9.1）。那就是本仿真器已经建好的那个窗口（uwb/session.ts 的 blockCarriesRcm），所以这一刀没有发明新的边界：一条控制消息管四个块时，这条辅助消息只在窗口的头一个块里发，后面三个块一帧也没有（uwb/session.ts 的 blockCarriesAncillary）。这是同一个窗口的第三处用处——前两处是逐轮那个未收到交互和整窗口那次收妥确认——而第三处用它的方式和前两处都不同：前两处用它判定谁有资格作答，这里用它决定这条消息在哪一块发出去。',
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
    `字节宽度是本仿真器的取值，取自 uwb/phy.ts：帧头 ${BYTES.mhr}、信息单元头 ${BYTES.ieHdr}、RAICT 最短 ${BYTES.ieMin}（单元头加一个控制字节）、帧校验 ${BYTES.fcs}。信息单元与整帧的长度都由 raictIeBytes 与 uwbAncillaryBytes 算出，空口时间由 uwbPpduNs 算出，时隙数由 roundPlan 与 ancillarySlots 算出，课文里一个字面量也没有写。时隙与块的毫秒数本课不印，它们和那条消息的截止时刻一起在下一课里（FiRa 的缺省配置，不是标准正文）。`,
    `本课四个场景是同一个 22 × 8 m 大厅、同样 ${ANCHORS} 个锚点与一个标签、同样的种子，只有会话上的开关不同：基础场景、竞争式排程、一条控制消息管 ${VALIDITY} 个块，以及把这个交换关掉。四个场景都关掉非视距，这是本课的取值，时间戳噪声照旧留着——辅助信息那几帧根本不计时，所以本课的算式一处也不碰它。丢帧与它的三个结局是下一课的题目，那次测量也在那一课（tests/course/uwb-ancillary-loss.test.ts）。`,
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
    J('第一条测距行', firstUwbRange),
  ],
  observe: [
    `一块里 ${SLOTS.block} 个时隙：前 ${SLOTS.ranging} 个是测距，后 ${SLOTS.window} 个一帧 ${BYTES.frame} 字节的辅助信息。点开其中任意一帧的信息单元列：只有 RAICT 一个，而测距那几帧一个字节也没动。`,
    `发这四帧的是 ${SENDER_ID}，它在测距里只是作答的一端；收下它们的是标签，而标签在测距里才是开场的那一端。日志里这四帧都落在标签这一侧的记录上，对端写的是 ${SENDER_ID}。`,
  ],
  tryThis: [
    `载入「竞争式排程」变体：一轮本身从 ${SLOTS.ranging} 个时隙变成 ${SLOTS.contendRanging} 个，这条消息可抽的窗口从 ${SLOTS.window} 个变成 ${SLOTS.contendWindow} 个，而四帧仍然连着占四个时隙。逐块看它们落在窗口里第几格：几个块不是同一个答案，这就是抽出来的意思，而排程式那一种每个块都从第 0 格开始。`,
  ],
  quiz: [
    {
      q: '一条辅助消息分成几帧，在本仿真器里是谁给出的？',
      options: [
        '上层把一条比一帧长的消息交下来，本仿真器按一帧的载荷上限算出要分几帧',
        '是会话上的一个整数：本仿真器没有建任何上层来持有这条消息，所以帧数直接是配置，而上限只是这一块装不装得下这一轮',
        '由控制消息里那个有效轮次字段算出来，一轮一帧',
      ],
      answer: 1,
      explain: '这正是本课第一条限制说的那件事：真实设备里这个数来自上层交下来的那份内容有多长，而这里它是场景里的一个整数，所以也看不到「上层给了一条装不下的消息」这类错配。',
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
