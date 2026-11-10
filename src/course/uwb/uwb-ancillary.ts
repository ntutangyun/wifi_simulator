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
 * by its distance to the 32.5 raw minutes that round to 35 (304 characters), when
 * `curriculum.ts` still refused a lesson past 30 minutes (today that is only the soft
 * `SITTING_MINUTES` guideline, past which a lesson is marked long), and
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
 * whose control message governs `VALIDITY` rounds of one block, and one with the exchange off.
 *
 * Every number is computed, never typed: `raictIeBytes`, `uwbAncillaryBytes`, `uwbPpduNs`,
 * `roundPlan`, `ancillarySlots`, `roundSlots` and `roundCarriesAncillary` are called, and
 * tests/course/uwb-ancillary.test.ts re-measures each figure against whole blocks. `MS` and `NS`
 * are exported for the other half, which prints them rather than recomputing them.
 *
 * `npx tsx scripts/lesson-dump.ts uwb-ancillary` prints it with its length. Measure a length by IMPORTING
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
import { ancillarySlots, roundCarriesAncillary, roundPlan, roundSlots } from '../../uwb/session'

/** Anchors of every scene here. Four: three time differences for the position fix, and the one
 * headcount every other UWB lesson of this hall uses. (The ancillary window is appended after the
 * ranging phase, so the anchor count is not what bounds `FRAMES` — the block is.) */
export const ANCHORS = 4
/** Frames one ancillary message is segmented across. Four, so Frames Remaining runs 3, 2, 1, 0 —
 * the shortest countdown in which a MIDDLE frame can go missing, which is the lesson's own case. */
export const FRAMES = 4
/** `rcmValidityRounds` of the third variant: one control message for four rounds, so the exchange
 * runs in the round that opens the ranging round set and in none of the three after it. The tag runs
 * that many rounds a block (`initiatorRounds`), because a control message governs rounds of its own
 * block only (standard §10.32.9.1) — so the set is one block's four rounds. */
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

/** The third variant: one control message governs `VALIDITY` rounds, and the tag runs that many
 * rounds a block so that the whole ranging round set fits in one block (standard §10.32.9.1). */
export function uwbAncillaryWindowScenario(): Scenario {
  return uwbAncillaryScenario({ rcmValidityRounds: VALIDITY, initiatorRounds: VALIDITY })
}

/** The same hall with the exchange off: the run every «nothing moved» claim is measured against. */
export function uwbAncillaryOffScenario(): Scenario {
  return scene({ ancillary: false, ancillaryFrames: FRAMES })
}

/** The sessions the scenes run, read back off the scenarios rather than restated. */
const SESSIONS = {
  base: uwbAncillaryScenario().uwb!,
  contend: uwbAncillaryScenario({ schedule: 'contention' }).uwb!,
  window: uwbAncillaryWindowScenario().uwb!,
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
  block: roundSlots(PLANS.base, 0),
  contendRanging: PLANS.contend.slots,
  contendWindow: ancillarySlots(PLANS.contend),
  contendBlock: roundSlots(PLANS.contend, 0),
  /** What the same message appends with the exchange off: nothing, at any frame count. */
  off: ancillarySlots(PLANS.off),
} as const

/** Which of the tag's first `VALIDITY + 2` rounds run the exchange when one control message governs
 * `VALIDITY` of them — counted across blocks, the tag's g-th round being round `g mod VALIDITY` of
 * block `⌊g / VALIDITY⌋` (it runs `VALIDITY` rounds a block). The ranging round set, reused rather
 * than reinvented. */
export const WINDOW_ROUNDS: readonly number[] = [0, 1, 2, 3, 4, 5]
  .filter((g) => roundCarriesAncillary(PLANS.window, g % VALIDITY))

/** The tag's running round number of a record of the window variant: block × rounds a block + round. */
export const tagRoundOf = (rec: { block: number; round: number }): number => rec.block * VALIDITY + rec.round

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
  why: '除测距外，两端有时还需要传送其他内容，而一帧的载荷（payload）有上限，这样一条消息可能超过这个上限。标准的办法是分段传送：一条辅助消息分装在一个测距轮（ranging round）里多个测距时隙（ranging slot）的多条消息中。本课的场景把这几帧排在同一轮的测距相位之后，连续占用几个时隙，每个时隙一帧，测距帧的内容不作任何改动；标准里用于辅助信息交换的那些轮由 ARC 信息单元的 Ranging Round Usage 字段标明，「排在测距之后」是本课的安排。每一帧都携带同一个信息单元，其中给出这条消息的编号和这一帧之后还剩几帧（标准的文字还说它传递消息类型，但内容字段里没有单独的类型字段）；剩余帧数从帧数减一逐帧递减到零，接收端读到零即判定消息已全部收到，而不是靠统计自己收到的帧数。编号和剩余帧数各占 0 或 1 个字节：编号是否存在由控制字节里的一个存在位指示，剩余帧数标准没有为它设存在位，本课把它也当作由一个存在位指示（本课的假设）。于是四种组合只有三种长度，因为只携带其中一个时，无论携带的是哪一个，都增加一个字节。本课两个都携带，每帧是最长的那一种。还有一点需要先说明，否则读者会以为角色写反了：这一节按收发方向重新定义了发起方与响应方，发送辅助信息的一端称为发起方，接收的一端称为响应方，与测距角色无关。本课的场景让测距中作答的锚点（anchor）发送这条消息，于是在本课里两套角色正好相反：时隙表仍按测距角色排列，在测距中只负责作答的锚点在这里发出整条消息，发起测距的标签（tag）只负责接收。一条消息分几帧，在本课中是直接给定的数值；在真实设备中，它由上层交付的内容长度决定。',
  outcomes: [
    '说清为什么要分段，以及一条消息分几帧在真实设备里由什么决定',
    '说清这一节的发起方与响应方按什么定义，以及在本课里它们为什么和测距里的同名词正好相反',
  ],
  needs: ['uwb-rcm-validity', 'uwb-receipt'],
  terms: [
    { term: 'ranging ancillary information', plain: '测距之外需要传送的内容；本节规定的是分帧传送用的编号与剩余帧数，内容本身不在标准范围内' },
    { term: 'RAICT IE (Ranging Ancillary Information Message Counter and Type IE)', plain: '每一帧都携带的信息单元：一个控制字节，后接两个可选字段' },
    { term: 'Request', plain: '控制字节里的第一位：置 0 是本课这一半，置 1 是向控制器请求时隙' },
    { term: 'ancillary initiator / ancillary responder', plain: '发送辅助信息的一端与接收辅助信息的一端；这两个词在本节按收发方向定义，与测距角色无关' },
  ],
  picture: [
    {
      heading: '一帧容纳不下，就分段传送',
      text: `一帧的载荷有上限，而一条辅助消息可以比这个上限长。标准给出的办法是把它分装在多条消息里，在一轮之内的几个测距时隙（ranging slot）中发出。本课的场景采用这个办法：一条 ${FRAMES} 帧的消息，在测距相位结束之后连续占用 ${SLOTS.window} 个时隙，每个时隙一帧（排在测距相位之后是本课的安排）。每一帧都携带一个 RAICT 信息单元，里面有这条消息的编号和这一帧之后还剩几帧。`,
    },
    {
      kind: 'watch', jump: 0,
      heading: `测距结束之后，还有 ${SLOTS.window} 个时隙`,
      text: `载入仿真并播放。一块中前 ${SLOTS.ranging} 个时隙仍是一轮常规的单边双向测距（single-sided two-way ranging, SS-TWR）：第 0 个是控制消息，后面 ${ANCHORS} 个是每个锚点（anchor）各作答一次。跳到第一帧辅助信息，它在第 ${SLOTS.ranging} 个时隙，其后还有 ${FRAMES - 1} 帧。每帧 ${BYTES.frame} 字节。点开其中一帧查看信息单元那一列：只有 RAICT 一个，其中给出这条消息的编号与剩余帧数。`,
    },
    {
      heading: '发送消息的一端，在测距中是作答的一端',
      text: `标准为这个交换单独定义了两个词：发出辅助信息的一端称为发起方，接收的一端称为响应方，与测距角色无关。本课让测距中作答的锚点发送消息，所以在本课里两套角色正好相反。而时隙表仍然按测距角色排列：每个时隙属于标签还是锚点，依据的是测距中的角色。于是读者会看到这样的情形：标签（tag）在测距中发起交换，在这里却一帧也不发送；${SENDER_ID} 在测距中只负责作答，在这里却是发出消息的一端。这不是错误：这一节的定义允许这样，而由哪台设备发送是本课的选择。`,
    },
    {
      kind: 'steps', heading: '一条辅助消息，从头到尾',
      items: [
        '控制消息仍然负责确定时隙分配。这个交换使用的窗口就是这条控制消息的有效期窗口，不另设边界。',
        `发送端把这条消息分成 ${FRAMES} 帧，每帧占一个时隙，排在测距相位之后（本课的安排）。测距帧的内容没有任何改动。`,
        '每一帧携带一个 RAICT 信息单元：消息编号与剩余帧数。剩余帧数从帧数减一递减到 0。',
        '接收端每收到一帧就读取一次剩余帧数，因此随时知道这条消息还有几帧尚未到达。',
        '最后一帧的剩余帧数为 0。接收端据此判定这条消息已全部收到，而不是靠统计自己收到的帧数。',
      ],
    },
  ],
  numbers: [
    {
      kind: 'table', heading: '本课的模型：长度由两个存在位决定',
      head: ['是否含消息编号', '是否含剩余帧数', '信息单元', '整帧'],
      rows: IE.bits.map(([n, f]) => [
        n ? '含' : '不含', f ? '含' : '不含', `${IE.ie(n, f)} 字节`, `${IE.frame(n, f)} 字节`,
      ]),
    },
    {
      kind: 'formula',
      text: `整帧 = 帧头（MAC header）${BYTES.mhr} + 单元头 ${BYTES.ieHdr} + 控制 1 + 编号 0 或 1 + 剩余帧数 0 或 1 + 帧校验 ${BYTES.fcs}`,
      note: `帧头（MAC header）与帧校验是每一种帧都有的两段。本课让控制字节中的两位指示后面两个可选字段是否存在（标准只为编号设了存在位，剩余帧数字段是否存在要从信息单元的长度看出），所以这个信息单元的内容是 1 到 3 字节，整帧 ${BYTES.shortest} 到 ${BYTES.frame} 字节。这是本课程里第一个长度由存在位决定的信息单元——前面各课的信息单元要么定长，要么长度随一个计数变化。本课所有场景两位都置 1，所以每帧都是最长的那 ${BYTES.frame} 字节，${ms(NS.frame)} ms 的空口时间（airtime）。`,
    },
    {
      kind: 'diagram', heading: `一帧 ${BYTES.frame} 字节`, spec: uwbAncillaryFields(),
      caption: `图中按字节画出本课每一帧的结构。两个可选字段画成两格，而没有并入信息单元，因为「这两个字段都可以不带」正是这一节的第一个要点；画成一格也不算错，但会掩盖要观察的内容。`,
    },
  ],
  deeper: [
    {
      heading: '同一个窗口的第三种用途',
      text: '§10.35.1 规定这个交换发生在当前这一轮以及控制消息仍然有效的那几轮里，而「有效几轮」正是 ARC 信息单元中的有效轮次字段（§10.32.9.1）。那就是 @uwb-rcm-validity 讲过的那个有效期窗口，所以这里没有新的边界：一条控制消息覆盖同一块里的四轮时，本课让这条辅助消息只在这组轮的第一轮中发送，后面三轮中一帧也没有。这是同一个窗口的第三种用途——前两种是逐轮的未收到交互和本课里覆盖整个窗口的收妥确认——而第三种用法与前两种都不同：前两种用它判定谁有资格作答，这里用它决定这条消息在哪一轮发出。',
    },
    {
      heading: '竞争式排程下，窗口宽度不同',
      text: `§10.35.1 说这个交换可以是排程式的，也可以是竞争式的，本课两种都有场景。差别不在帧上，而在窗口上：排程式按每帧一个时隙排 ${SLOTS.window} 个，因为时隙表指明了每个时隙的归属；竞争式使用的是这一轮本身的竞争时隙段，本课的设置下是 ${SLOTS.contendWindow} 个，因为这种排程不指定任何设备，而宽度恰好只容纳这条消息的窗口里没有随机选取起点的余地（本课取两者中较大的一个）。于是在竞争式排程下，这 ${FRAMES} 帧仍然连续占用 ${FRAMES} 个时隙，而起点由发送端随机选取（本课的取法，标准没有规定），每个块中的位置都可能不同。`,
    },
  ],
  limits: [
    {
      kind: 'unmodelled',
      text: '一条消息分几帧是场景配置，不是上层算出来的。本仿真器没有建任何 MAC 原语，MCPS 的和其他的都没有，所以也没有上层来持有一条「比一帧长」的消息并算出它该分几帧；帧数直接是场景中给定的整数，上限是这一块能否容纳这一轮。这和有效轮次字段属于同一种情形：真实设备中这个数取决于上层交给 MAC 的内容长度，而这里它是配置，所以也看不到「上层交付了一条一帧容纳不下的消息」这类错配。',
    },
    {
      kind: 'model-value',
      text: '消息类型建成了一个常量，不建取值表。§10.35.2.1 的文字说 Request 置 0 时这个信息单元还报这条消息的类型，但 Figure 10-271 的内容字段里没有单独的类型字段，条款也没有给出类型的取值；本课只建一种辅助消息，所以类型始终是同一个数，也不占帧里的任何字节。后果是本课那张长度表只随两个存在位变，类型这一项在任何场景下都是同一个值，读者也无法用它分开两条不同用途的消息。',
    },
    {
      kind: 'model-value',
      text: '发出这条消息的始终是第 0 个响应方，一轮也只有一条消息。条款说的是「辅助信息的发起方发出一条消息」，没有说若干台设备里哪一台成为发起方，而本仿真器没有上层来持有一条要发的消息，所以这个选择是模型定的。后果是读者看不到两台设备在同一个窗口里各发一条消息的情形，而在竞争式排程下那本来是个值得看的局面：两条消息随机选到重合的起点，会真正发生碰撞。',
    },
    {
      kind: 'out-of-scope',
      until: 'uwb-ancillary-request',
      text: 'Request 置 1 的那一半不在本课里（见 @uwb-ancillary-request），因为它是另一个题目——Request 位、剩余帧数那个字段在置 1 时装的是请求的时隙数，以及「只有当发起方不是控制器时这一位才有意义」这个条件。它问的不是「再加一个字段」，而是「排程能不能被请求改变」。需要注意的是，本课里轮的长度本来就随块变化：收妥确认与本课这条消息各自在某些块的轮后追加一批时隙，所以让一个请求改变后续排程，改的是追加那一批有多宽，轮里测距那一段的排布不变。',
    },
  ],
  sources: [
    `IEEE Std 802.15.4-2024 §10.35 是测距辅助信息，§10.35.1 给出这个交换的两个角色名与它的时间范围，§10.35.2.1 连同 Figure 10-271 给出 RAICT 信息单元的内容字段（Request、Ranging Or Ancillary Message Number Present、Ranging Or Ancillary Message Number、Frames Remaining）。本课建的是 Request 置 0 的那一半。窗口读的是 §10.32.9.1 的 ARC 信息单元里那个有效轮次字段；同一个信息单元里的 Ranging Round Usage 字段取值 3 表示所管的测距轮用于辅助信息交换。课文里同一个窗口的另外两种用途是 §10.34 的测距消息未收到交互与 §10.36 的多消息收妥确认。竞争式与排程式两种排法出自 §10.32.2，§10.35.1 说这个交换两种都可以。本课完全不依赖任何草案。`,
    `字节宽度是本仿真器的取值：帧头 ${BYTES.mhr}、信息单元头 ${BYTES.ieHdr}、RAICT 最短 ${BYTES.ieMin}（单元头加一个控制字节）、帧校验 ${BYTES.fcs}。信息单元与整帧的长度、空口时间和时隙数都由这几个宽度与场景的设置算出。本课不给出时隙与块的毫秒数，它们和那条消息的截止时刻一起在下一课里（FiRa 的缺省配置，不是标准正文）。`,
    `本课四个场景是同一个 22 × 8 m 大厅、同样 ${ANCHORS} 个锚点与一个标签、同样的种子，只有会话上的开关不同：基础场景、竞争式排程、一条控制消息管同一块里的 ${VALIDITY} 轮，以及把这个交换关掉。四个场景都关掉非视距，这是本课的取值，时间戳噪声仍然保留——辅助信息帧根本不计时，所以本课的算式完全不涉及它。丢帧与它的三个结局是下一课的题目，那次测量也在那一课。`,
  ],
  scenario: () => uwbAncillaryScenario(),
  variants: [
    { label: `竞争式排程：窗口宽 ${SLOTS.contendWindow} 个时隙，起点抽出来`, scenario: () => uwbAncillaryScenario({ schedule: 'contention' }) },
    { label: `一条控制消息管 ${VALIDITY} 轮：只在第一轮发`, scenario: () => uwbAncillaryWindowScenario() },
    { label: '关闭辅助信息交换', scenario: () => uwbAncillaryOffScenario() },
  ],
  jumps: [
    J(`第一帧辅助信息：${BYTES.frame} 字节，剩余帧数 ${FRAMES - 1}`, firstFragment),
    J('剩余帧数为 0 的那一帧：这条消息的最后一帧', lastFragment),
    J('第一条测距记录', firstUwbRange),
  ],
  observe: [
    `一块中有 ${SLOTS.block} 个时隙：前 ${SLOTS.ranging} 个用于测距，后 ${SLOTS.window} 个各承载一帧 ${BYTES.frame} 字节的辅助信息。点开其中任意一帧的信息单元列：只有 RAICT 一个，而测距帧的内容没有任何改动。`,
    `发送这四帧的是 ${SENDER_ID}，它在测距中只是作答的一端；接收它们的是标签，而标签在测距中才是发起的一端。日志中这四帧都记录在标签一侧，对端为 ${SENDER_ID}。`,
  ],
  tryThis: [
    `载入「竞争式排程」变体：一轮本身从 ${SLOTS.ranging} 个时隙变为 ${SLOTS.contendRanging} 个，这条消息可选起点的窗口从 ${SLOTS.window} 个变为 ${SLOTS.contendWindow} 个，而四帧仍然连续占用四个时隙。逐块查看它们位于窗口中的第几个时隙：各块的结果不同，这就是随机选取的含义；而在排程式下，每个块都从第 0 个时隙开始。`,
  ],
  quiz: [
    {
      q: '一条辅助消息分成几帧，是由什么决定的？',
      options: [
        '由标准固定：每一条辅助消息都分成同样多的帧，和内容多长无关',
        '由上层交付的内容长度决定：一帧的载荷有上限，超过上限就分装；本课的帧数是直接给定的，不是这样算出来的',
        '由控制消息里那个有效轮次字段算出来，一轮一帧',
      ],
      answer: 1,
      explain: '这正是本课第一条限制说的那件事：真实设备中这个数取决于上层交付的内容长度，而本课中它是场景给定的整数，所以也看不到「上层交付了一条一帧容纳不下的消息」这类错配。',
    },
    {
      q: '为什么一台在测距里只负责作答的设备，在这里却是发消息的那一端？',
      options: [
        '因为辅助信息附带在测距的应答帧中发送，所以只能由作答的一端发送',
        '因为这一节按收发方向为这个交换单独定义了发起方与响应方，与测距角色无关，而本课让作答的锚点发送消息；时隙表仍然按测距角色排列',
        '因为辅助信息总是从锚点流向标签，标准里没有反方向的情形',
      ],
      answer: 1,
      explain: `§10.35.1 把发出辅助信息的一端称为发起方，接收的一端称为响应方。时隙表仍按测距角色排列，所以 ${SENDER_ID} 在同一张表上既是测距的响应方，又是这个交换的发起方。`,
    },
  ],
}
