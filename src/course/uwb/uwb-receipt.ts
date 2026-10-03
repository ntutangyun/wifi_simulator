/**
 * UWB Tier 2 · M20 多消息收妥确认 · Who heard me.
 *
 * IEEE Std 802.15.4-2024 §10.36 (multiple message receipt confirmation and its RMMRC IE,
 * §10.36.2.1) plus §10.32.9.1's MMRCR request bit, which is
 * docs/superpowers/specs/2026-10-02-receipt-confirmation-design.md — §2 is the spine, §3.1/§3.3
 * the arithmetic, §4 the grain comparison and §6.1 the correction this lesson exists partly to
 * state out loud.
 *
 * The opening is the question the many-to-many lesson left hanging. There every pair's range is
 * computed by the EARLIER participant only, and the last participant sends the round's longest
 * frame while computing nothing — so it knows what it worked out and **has no way to learn who
 * heard it**. A many-to-many transmission's receipt is only ever echoed forward
 * (`UwbM2mTimes.rxCounters`), never back to the sender. §10.36 is the answer, and the standard
 * draws its own figure for the clause (Figure 10-272) over a many-to-many exchange.
 *
 * Three things the lesson gets across:
 *
 *   1. **Asking is free.** MMRCR is bit 15 of the ARC IE control word every control message
 *      already carries, so the request adds zero octets. Measured: the control message is 36
 *      octets with it on and with it off, IE for IE (tests/uwb/mmrcm-round.test.ts).
 *   2. **Answering costs a frame, and the two counts are not the same count** (design §6.1): the
 *      IE's list entries are one per INITIATOR, the slots and the frames one per RESPONDER. "One
 *      frame per initiator" reads correctly in a two-way round and is impossible in many-to-many
 *      — three participants have three slots and that rule would need six frames. This is the
 *      trap the implementation itself fell into, once in code and once in prose, so the lesson
 *      says it plainly rather than leaving it to the reader.
 *   3. **It is not RMNR** (design §4). RMNR is per round, sent by the responder on its own
 *      initiative, and says "I did not get this round's start". The receipt bitmap is per window,
 *      requested by the controller, and says "here is which of your openers I got". Same subject,
 *      different grain — and a reader who is not told will assume they are one mechanism.
 *
 * The scenes. The base is many-to-many because that is the mode the clause's own figure is drawn
 * over AND the only mode where a static scene can show a partly-zero bitmap: UWB reception here
 * is a deterministic power comparison with no per-frame fading, so a wall takes every opener or
 * none — which is why the acceptance measurement needed a MOVING anchor
 * (tests/uwb/mmrcm-round.test.ts) and why no lesson scenario can reproduce it. Participant `p-3`
 * instead transmits 14 dB down: it hears both others and neither hears it, so one frame carries
 * two entries with different bits in them, and `p-3` learns from both of the others what no other
 * frame in this mode ever tells it. The two variants are the two-way round, with the request on
 * and off, where the window is four blocks wide and the bitmap is therefore four bits.
 *
 * Every number is measured or computed, never typed: `uwbMmrcmBytes`, `uwbMmrcmSlots` /
 * `mmrcmResponders`, `uwbPollBytes`, `uwbInitBytes`, `rmmrcEntryBytes` and `roundPlan` are
 * called, and tests/course/uwb-receipt.test.ts re-measures each figure against whole blocks.
 *
 * `npx tsx scripts/lesson-dump.ts uwb-receipt` prints it with its length. Measured, not guessed:
 * 3498 main-path characters, three things to observe and two experiments put it at 29.90 raw
 * minutes, which the formula rounds to the 30-minute bucket — 572 characters below the 32.5 raw
 * minutes that would break the ceiling. Measure the same way before adding a sentence, by
 * IMPORTING `CHARS_PER_MINUTE`/`OBSERVE_MINUTES`/`TRY_MINUTES` from `curriculum.ts` rather than
 * retyping them: the controller retyped all three once and read a 484-character margin where
 * there were four.
 */
import type { Scenario, UwbSessionCfg, Wall } from '../../model/scenario'
import type { FieldsSpec } from '../diagram'
import {
  J, brick, firstUwbM2m, firstUwbMmrcm, firstUwbRange, rangingLab, txOf, uwbSc, uwbTag, anchor,
  type Lesson,
} from '../lessonKit'
import {
  RMMRC_ADDR_BYTES, RMMRC_FIXED_BYTES, UWB_FCS_BYTES, UWB_IE_HDR_BYTES, UWB_MHR_BYTES,
  UWB_TX_POWER_DBM, rmmrcBitmapBytes, rmmrcEntryBytes, uwbInitBytes, uwbMaxMmrcmInitiators,
  uwbMmrcmBytes, uwbMmrcmSlots, uwbPollBytes,
} from '../../uwb/phy'
import { mmrcmResponders, roundPlan } from '../../uwb/session'

/** Participants of the base many-to-many round — the N every count below is per. */
export const PARTICIPANTS = 3
/** Anchors of the two-way variants: three, so their control message is `uwbPollBytes(3)` octets. */
export const ANCHORS = 3
/** `rcmValidityRounds` of the two-way variants: one control message for four blocks, so the
 * bitmap there is four bits wide — the dimension many-to-many cannot show (see `limits`). */
export const VALIDITY = 4
/** The blocks of one two-way window, plus the one that opens the next: where the reader sees the
 * window turn over, and the span the ranging-unchanged claim is measured over. */
export const BLOCKS = VALIDITY + 1
/** How far below the others `p-3` transmits, in dB. 14 dB is the margin tests/uwb/mmrcm-round.ts
 * measured this engine's link budget with: enough that nothing decodes it at these distances,
 * while its own receiver still decodes everybody at full power. */
export const QUIET_DB = 14

/** Where the three participants stand, in metres: no two pairwise distances alike. */
export const PLACES: readonly { x: number; y: number }[] = [
  { x: 1, y: 1 }, { x: 7, y: 2 }, { x: 3, y: 6 },
]

/** Participant i's id. Ids decide the slot order (`session.ts#m2mParticipants` sorts them), so
 * `p-1`…`p-3` is also the order the round transmits in. */
export const idOf = (i: number): string => `p-${i + 1}`

/** The participant nobody hears: the last to transmit, which in this mode is also the one that
 * computes no distance at all — so it is the device the many-to-many lesson ended on. */
export const QUIET_ID = idOf(PARTICIPANTS - 1)

/** The hall of the base scene: 20 × 16 m inside one brick shell, no partition inside it. */
function m2mHall(): { rooms: { x: number; y: number; w: number; h: number; name: string }[]; walls: Wall[] } {
  return {
    rooms: [{ x: 0, y: 0, w: 20, h: 16, name: 'Hall' }],
    walls: [brick(0, 0, 20, 0), brick(20, 0, 20, 16), brick(20, 16, 0, 16), brick(0, 16, 0, 0)],
  }
}

/**
 * The base scene: three many-to-many participants, the last of them `QUIET_DB` below the other
 * two, with the receipt request on.
 *
 * `quiet` is what makes the bitmap worth drawing. Everything else about the scene is the
 * many-to-many lesson's own setting — no excess delay, no timestamp noise — so the only reason a
 * bit is zero here is that a transmission was not decoded.
 */
export function uwbReceiptScenario(mmrcr = true, quiet = true): Scenario {
  return uwbSc(
    m2mHall(),
    PLACES.map((p, i) => {
      const n = uwbTag(idOf(i), `P${i + 1}`, p.x, p.y)
      return quiet && idOf(i) === QUIET_ID ? { ...n, txPowerDbm: UWB_TX_POWER_DBM - QUIET_DB } : n
    }),
    { mode: 'm2m', method: 'ss', nlos: false, tsNoisePs: 0, rcmValidityRounds: 1, mmrcr },
  )
}

/**
 * The two-way variant: three anchors and one tag in the 22 × 8 m hall, DS-TWR with embedded reply
 * times so both ends of every block produce a range, and one control message for `VALIDITY`
 * blocks — which is what makes the bitmap four bits wide here.
 *
 * `mmrcr` is the one knob the two variants differ in, which is what lets the reader read the
 * request's cost off two runs of the same room.
 */
export function uwbReceiptTwrScenario(mmrcr = true): Scenario {
  return uwbSc(
    rangingLab(),
    [
      anchor('anchor-1', 'A1', 0.5, 0.5),
      anchor('anchor-2', 'A2', 21.5, 0.5),
      anchor('anchor-3', 'A3', 11, 7.5),
      uwbTag('uwb-1', 'Tag', 11, 4),
    ],
    { method: 'ds', replyTime: 'embedded', nlos: false, rcmValidityRounds: VALIDITY, mmrcr },
  )
}

/** The sessions the two scenes run, read back off the scenarios rather than restated. */
const M2M_SESSION: UwbSessionCfg = uwbReceiptScenario().uwb!
const TWR_SESSION: UwbSessionCfg = uwbReceiptTwrScenario().uwb!

/** The round plans both ends of each scene read their slot tables from. */
const M2M_PLAN = roundPlan(M2M_SESSION, PARTICIPANTS)
const TWR_PLAN = roundPlan(TWR_SESSION, ANCHORS)

/**
 * The slot arithmetic of both scenes, asked of the engine rather than counted off the device
 * lists: how long a round is, and how many slots the receipt request adds to a window-closing
 * block. One per responder in both modes — which in many-to-many is every participant, and in a
 * two-way round every anchor.
 */
export const SLOTS = {
  m2mRound: M2M_PLAN.slots,
  m2mExtra: mmrcmResponders(M2M_PLAN),
  twrRound: TWR_PLAN.slots,
  twrExtra: mmrcmResponders(TWR_PLAN),
  /** What the same request adds when it is off: nothing, in either mode. */
  off: uwbMmrcmSlots('m2m', PARTICIPANTS, false),
} as const

/** Entries one many-to-many participant's frame carries: every other participant. */
export const M2M_ENTRIES = PARTICIPANTS - 1
/** Entries one two-way anchor's frame carries: the round's single initiator. */
export const TWR_ENTRIES = 1

/** The two frames, in octets, as `uwbMmrcmBytes` sizes them. */
export const BYTES = {
  m2m: uwbMmrcmBytes(M2M_ENTRIES, M2M_SESSION.rcmValidityRounds),
  twr: uwbMmrcmBytes(TWR_ENTRIES, VALIDITY),
} as const

/** The frame-length law's own pieces: the fixed part, and what one initiator costs. */
export const ENTRY_BYTES = {
  m2m: rmmrcEntryBytes(M2M_SESSION.rcmValidityRounds),
  twr: rmmrcEntryBytes(VALIDITY),
} as const

/** The law at the four list lengths the lesson prints, and the longest list one frame can hold. */
export const LIST = [1, 2, 3, 6] as const
export const CAP = uwbMaxMmrcmInitiators(VALIDITY)

/** Openers of the two-way variants, which the request does not change by one octet. */
export const RCM_BYTES = uwbPollBytes(ANCHORS)
export const INIT_BYTES = uwbInitBytes()

/** Bitmap width in each scene: one bit per window block, rounded up to an octet. */
export const BITS = {
  m2m: M2M_SESSION.rcmValidityRounds,
  twr: VALIDITY,
  octets: rmmrcBitmapBytes(VALIDITY),
} as const

/**
 * What the base scene measures, re-measured in tests/course/uwb-receipt.test.ts from whole blocks.
 *
 * `frameFrom` is the participant whose own frame the figure draws and the prose reads — the first
 * one, which is also what the lesson's first jump lands on. Its confirmation carries an entry for
 * `p-2` set and an entry for `p-3` clear, which a receipt state keyed by nothing at all could not
 * produce. `confirmations` is how many of the nine possible answers actually arrive: `p-3`'s own
 * frame reaches nobody, so three of them never land.
 */
export const M2M = {
  frames: PARTICIPANTS,
  confirmations: 4,
  frameFrom: idOf(0),
  unheard: QUIET_ID,
  /** Distances the round produces: three pairs, and only the one between the two audible
   * participants is ever computed — by the earlier of them. */
  pairs: (PARTICIPANTS * (PARTICIPANTS - 1)) / 2,
  ranges: 1,
} as const

/** What the two-way variants measure over `BLOCKS` blocks, with the request on and off. */
export const TWR = {
  /** Ranging records, field for field identical either way: both ends of every block. */
  ranges: 2 * ANCHORS * BLOCKS,
  /** Confirmations, all of them from the one window-closing block in this span. */
  confirmations: ANCHORS,
  block: VALIDITY - 1,
} as const

/** The last participant's transmission: the round's longest frame, and the one nobody decodes. */
const quietFrame = txOf((r) => r.frame.kind === 'uwbM2m' && r.node === QUIET_ID)
/** The quiet participant's own confirmation slot — the frame that answers the other two. */
const quietConfirmation = txOf((r) => r.frame.kind === 'uwbMmrcm' && r.node === QUIET_ID)

/**
 * The base scene's confirmation frame — participant 0's, the one the first jump lands on — field by
 * field, drawn to scale in octets. Its two entries are for the two participants after it, so the
 * labels count from P2.
 *
 * The two list entries are drawn as two boxes rather than one, because the whole of §10.36's first
 * count is that there is one of them per initiator: a single box labelled "列表" would draw the
 * frame correctly and hide the thing the figure is for. Every width comes from `phy.ts`, so a
 * figure of this frame cannot drift from the frame the engine builds.
 */
export function uwbReceiptFields(): FieldsSpec {
  const entry = ENTRY_BYTES.m2m
  const fields = [
    { label: '帧头', size: UWB_MHR_BYTES },
    { label: '单元头', size: UWB_IE_HDR_BYTES },
    { label: '标志', size: 1 },
    { label: '列表长', size: 1 },
    ...Array.from({ length: M2M_ENTRIES }, (_v, i) => ({
      label: `条目 P${i + 2}`, size: entry,
    })),
    { label: '帧校验', size: UWB_FCS_BYTES },
  ]
  const total = fields.reduce((n, f) => n + f.size, 0)
  return {
    kind: 'fields',
    fields,
    unit: 'B',
    total: `整帧 ${total} 字节：固定部分 ${total - M2M_ENTRIES * entry}，两个条目 ${M2M_ENTRIES * entry}`,
  }
}

export const uwbReceipt: Lesson = {
  id: 'uwb-receipt',
  module: 20,
  title: '谁听见了我',
  why: '多对多测距那一课的结尾留下一个问题。一轮里每一对的距离只有排在前面的那个参与者算得出来，排在最后的那个发出全轮最长的一帧，自己一条距离也算不到。更要紧的是另一半：它知道自己算出了什么，却没有任何一帧告诉过它有谁听见了它——那一发是被收下了，还是根本没人解出来，在这个模式里它无从知道，因为一次发送的收妥情况只会被往后转达给排在它后面的人，从不回到发送者自己手里。标准为这件事专门留了一节：发起方在控制消息里置一位请求收方作答，收方用一帧回来，里面按发起方分条目，每个条目一张收妥位图（bitmap），说明「你发来的那几条我收到了哪几条」。这一课要算清代价落在哪一侧，以及那两个「每个……一个」数的为什么不是同一样东西。',
  outcomes: [
    '说清请求为什么一个字节也不多花，而回答为什么要一整帧',
    '分清两个计数：信息单元的列表条目按发起方数，时隙与帧按响应方数',
    '读出一张收妥位图，并说出它覆盖的是本仿真器选的哪几条消息',
    '说出它和测距消息未收到交互的差别：逐轮还是整窗口，谁主动发',
  ],
  needs: ['uwb-m2m', 'uwb-rcm-validity'],
  terms: [
    { term: 'multiple message receipt confirmation message (MMRCM)', plain: '响应方用来回答「你发的那几条我收到了哪几条」的那一帧' },
    { term: 'RMMRC IE', plain: '那一帧里唯一的信息单元：一个标志字节、一个列表长度，后面每个发起方一个条目' },
    { term: 'MMRCR', plain: 'ARC 信息单元控制字段里的第 15 位：置 1 就是请求对方回一次收妥确认' },
    { term: 'receipt bitmap', plain: '一个条目里的那几位：窗口的第一条开场消息在最左，一位一条，收到记 1' },
  ],
  picture: [
    {
      heading: '收妥情况只往后传，从不回头',
      text: '多对多的一帧里装着自己的发送时刻，加上它收到的、排在它前面每个人的到达时刻。所以一次发送的收妥情况确实在空口上传了出去——但只传给排在发送者后面的人：谁在它之后发送，谁才会把「我收到了你」捎进自己那一帧。排在最后的那个人之后没有人再发送，于是它那一发有没有被听见，这一轮里没有任何一帧说得出。这不是实现上的偏向，是时间顺序的结果，和「只有排在前面的那个算得出距离」是同一件事的另一面。',
    },
    {
      kind: 'watch', jump: 0,
      heading: `三次发送之后，多出 ${SLOTS.m2mExtra} 个时隙`,
      text: `载入仿真并播放。前 ${SLOTS.m2mRound} 个时隙是三个参与者各发一次，和前一课一样；跳到第一帧收妥确认，时间线上它在第 ${SLOTS.m2mRound} 个时隙，后面还跟着两帧。三个响应方各发一帧，每帧 ${BYTES.m2m} 字节。点开其中一帧看信息单元那一列：只有 RMMRC 一个，里面是两个条目，各带一个发起方的名字和一张位图。`,
    },
    {
      heading: '一帧回答由什么组成',
      text: `这一帧没有一个时间量，所以它也不进测距的算式。帧头（MAC header）${UWB_MHR_BYTES} 字节之后是唯一那个信息单元：两字节的单元头、一个标志字节（说明条目里带不带地址、地址多长）、一个字节写明列表里有几个条目，然后一个条目一个发起方——短地址 ${RMMRC_ADDR_BYTES} 字节，加上那张位图。本仿真器的位图按窗口的块数算，一块一位，不足一字节补满，所以多对多里它 ${BITS.octets} 字节、${BITS.m2m} 位。最后是 ${UWB_FCS_BYTES} 字节帧校验。`,
    },
    {
      kind: 'diagram', heading: `一帧 ${BYTES.m2m} 字节，两个条目`, spec: uwbReceiptFields(),
      caption: `按字节画的是基础场景里 ${M2M.frameFrom} 发出的那一帧：固定部分 ${RMMRC_FIXED_BYTES + UWB_MHR_BYTES + UWB_FCS_BYTES} 字节，之后每个发起方 ${ENTRY_BYTES.m2m} 字节。两个条目画成两格而不是一格，因为「一个条目对应一个发起方」正是这一节的第一个计数——画成一格「列表」也不算错，但会把要看的东西盖掉。`,
    },
    {
      kind: 'table', heading: '两个计数，数的不是同一样东西',
      head: ['数什么', '一个什么'],
      rows: [
        ['信息单元里的列表条目', '每个发起方一个——一个响应方可能听到好几个发起方'],
        ['时隙，以及帧', '每个响应方一个——各自发自己那一帧'],
      ],
    },
    {
      heading: '「每个发起方一帧」在双向轮里看着是对的',
      text: `双向轮里一个响应方只听到一个发起方，也就是这一轮的那个标签（tag），所以它那一帧只有一个条目——于是「每个发起方一帧」和「每个响应方一帧」给出同一个数，分不出谁错。多对多把它拆穿：${PARTICIPANTS} 个参与者只有 ${SLOTS.m2mExtra} 个时隙，而按「每个发起方一帧」要发 ${PARTICIPANTS * M2M_ENTRIES} 帧，装不下。正确的说法是每个响应方一帧，帧里装它听到的那些发起方。这个仓库在代码里和文字里各错过一次，所以这一句值得明说。`,
    },
    {
      kind: 'steps', heading: '一次收妥确认，从头到尾',
      items: [
        '发起方在控制消息的 ARC 信息单元里把第 15 位置 1。这一位和有效轮次那六位在同一个控制字段里，所以这一帧的字节数一点没变。',
        '每个响应方照旧收开场消息、照旧作答测距。它多做一件事：把「这个发起方的第几块开场我解出来了」记在自己手里，一个发起方一张位图。',
        '窗口的最后一块，轮走完之后多排几个时隙，一个响应方一个。',
        '每个响应方在自己那个时隙发一帧：它有权作答的每个发起方各占一个条目，条目里是那个发起方的地址和它那张位图。双向轮里有权作答的条件和测距消息未收到交互一样——手里得有一条仍然有效的控制消息，否则这个时隙本来就不属于它。',
        '发起方收下这一帧，从自己那个条目里读出哪几位是 0。位图不会跨窗口留下来：换了窗口而手里只有上个窗口的记录，那就全部按没收到算，因为上个窗口的位图不是一个弱一点的答案，是一个错的答案。',
      ],
    },
    {
      kind: 'table', heading: '和「我没收到」是两件事',
      head: ['比的是什么', '测距消息未收到交互', '收妥位图'],
      rows: [
        ['粒度', '逐轮', '整个有效期窗口'],
        ['谁发起', '响应方自己决定发', '发起方在控制消息里请求'],
        ['说的是什么', '本轮的启动消息我没收到', '你那几条开场消息我收到了哪几条'],
        ['什么时候发', '缺了开场的那一轮，在自己的时隙里', '窗口的最后一块，在多排出来的时隙里'],
      ],
    },
    {
      heading: '同一个题目，两种粒度',
      text: '两者回答的是同一件事：发起方的开场有没有到。差别在粒度和由谁开口请求，而两者都不是「哪一边更好」。逐轮那一种当场就说，代价是每一个缺了开场的轮里都要发一帧；整窗口那一种一个窗口只发一帧，代价是要等到窗口走完。真正只有位图做得到的是多对多：那里没有一条控制消息可以持有，也没有「本轮启动消息」这回事，而一个参与者除了位图之外没有任何一帧会告诉它自己被谁听见过。',
    },
  ],
  numbers: [
    {
      kind: 'table', heading: '请求与回答，代价落在哪一侧',
      head: ['量什么', '请求位关掉', '请求位打开'],
      rows: [
        ['窗口第一块的开场消息', `${RCM_BYTES} 字节`, `${RCM_BYTES} 字节`],
        ['窗口其余各块的开场消息', `${INIT_BYTES} 字节`, `${INIT_BYTES} 字节`],
        ['窗口最后一块多出的时隙', `${SLOTS.off} 个`, `${SLOTS.twrExtra} 个`],
        ['回来的 MMRCM', '0 帧', `${TWR.confirmations} 帧，各 ${BYTES.twr} 字节`],
      ],
    },
    {
      heading: '请求不花空口时间（airtime）',
      text: `上面那张表是三个锚点（anchor）、一条控制消息管 ${VALIDITY} 个块的双向轮变体量出来的。两次运行里开场消息逐帧相同：第一块 ${RCM_BYTES} 字节、其余各块 ${INIT_BYTES} 字节，信息单元那一列也一样。原因是请求本来就在既有的字段里——有效轮次占控制字段的第 9 到 14 位，这个请求位是紧接着的第 15 位，那两个字节本来就在每一条控制消息里。所以请求一次收妥确认，请求这一侧一个字节也不多花；花掉的是回答那几帧。`,
    },
    {
      kind: 'formula',
      text: `MMRCM = 帧头 ${UWB_MHR_BYTES} + 单元固定部分 ${RMMRC_FIXED_BYTES} + N × (地址 ${RMMRC_ADDR_BYTES} + 位图 ⌈R/8⌉) + 帧校验 ${UWB_FCS_BYTES}`,
      note: `N 是这一帧里的条目数，也就是它回答几个发起方；R 是窗口有几块。R 不超过 8 时位图一个字节，于是一个发起方 ${ENTRY_BYTES.twr} 字节，整帧 ${uwbMmrcmBytes(0, VALIDITY)} + ${ENTRY_BYTES.twr}N：${LIST.map((n) => `${n} 个发起方 ${uwbMmrcmBytes(n, VALIDITY)} 字节`).join('、')}。一帧装不下无限多个条目，上限和别处一样是算出来的：R = ${VALIDITY} 时最多 ${CAP} 个发起方，再多就超过一帧的载荷（payload）上限。`,
    },
    {
      kind: 'table', heading: '两个维度，没有哪个场景同时撑开',
      head: ['场景', '条目数', '位图宽度'],
      rows: [
        [`多对多，${PARTICIPANTS} 个参与者`, `${M2M_ENTRIES} 个`, `${BITS.m2m} 位`],
        [`双向轮，${ANCHORS} 个锚点，一条控制消息管 ${VALIDITY} 块`, `${TWR_ENTRIES} 个`, `${BITS.twr} 位`],
      ],
    },
    {
      heading: '基础场景里那两位',
      text: `基础场景把最后那个参与者的发射功率（transmit power）压低 ${QUIET_DB} dB：它听得见另外两个，另外两个听不见它。于是 ${M2M.frameFrom} 那一帧里两个条目一个是 1、一个是 0——同一帧、同一份记录、两个不同的答案。而 ${M2M.unheard} 从另外两帧里各读到一个 0，这就是它这一轮唯一能得到的那个消息：没有人听见我。三对参与者本该有 ${M2M.pairs} 条距离，这一轮只算出 ${M2M.ranges} 条；少掉的两条和那两个 0 说的是同一件事，而在上一课里，它只能看到距离没出来。`,
    },
    {
      heading: '回答是一条额外的消息，不是测量的一部分',
      text: `双向轮变体在 ${BLOCKS} 个块里量出 ${TWR.ranges} 条测距结果，而打开和关掉这个请求，这 ${TWR.ranges} 条逐字段相同——距离、品质因数（figure of merit, FoM）、块号、时刻，一个数都没有动。多出来的时隙排在一轮之后，不插进轮里；多出来的帧不带任何时间量，也不进任何算式。所以这一节换来的是「谁听见了我」这条消息，不是更准的距离。`,
    },
  ],
  deeper: [
    {
      heading: '双向轮里一个块的窗口不值一帧',
      text: '本仿真器拒绝「双向轮 + 一条控制消息只管一块 + 请求收妥确认」这个组合，理由不是实现不了，是那一帧说不出新东西：窗口只有一块，位图就只有一位，而那一位的内容发起方早就知道了——响应方在自己的时隙里作答，这件事本身就说明它收到了这一块的开场；它沉默，发起方拿到一次超时。一位的位图在那里是一帧白占的空口时间。多对多里同一个判断反过来：那里窗口也只有一块、位图也只有一位，但一个参与者的发送只会被往后转达，所以这一位是整个模式里唯一会回头告诉它「你被听见了」的东西。同一个字段在两个模式里一个该拒一个该留，分界线不在位数上，在「有没有别的帧已经说过这件事」。',
    },
    {
      heading: '位图过期比位图不全更要紧',
      text: '响应方手里一个发起方只存一张位图，连着它属于哪个窗口。进了新窗口而手里那张是上个窗口的，引擎不是把它接着用，而是整张按没收到算（uwb/device.ts 的 noteOpener 与 receiptIn 都按块号算出窗口起点，窗口一变就整张换掉）。这一步看着像清理，实际上是正确性：一张来自上个窗口的位图，位数一样、读起来一样有道理，而它说的是别的几条消息收没收到。跨轮保留的设备状态在这个引擎里就是这么处理的——它可以存在，但必须会过期，而且过期要表现成「我什么也不知道」，不是表现成「还是上次那样」。',
    },
  ],
  limits: [
    {
      kind: 'model-value',
      text: '位图覆盖哪几条消息是本仿真器定的，不是标准定的。标准只说响应方可以确认「来自同一个发起方的多条消息」，没有指定是哪几条；本引擎取当前控制消息有效期窗口里该发起方发出的那几条开场消息，一块一位（uwb/phy.ts 的 rmmrcBitmapBytes 按 rcmValidityRounds 算宽度，uwb/device.ts 的 noteOpener 与 receiptIn 按块号算窗口起点）。这样取的理由是这个边界两端本来就都同意，不必再商量一个新的；代价是真实设备可以按别的范围确认，比如最近 n 条、或者上层指定的一段，而本引擎的位图宽度永远等于窗口的块数。',
    },
    {
      kind: 'unmodelled',
      text: '条目里的地址只建了短的那一种。标准用标志字节里的 Address Size 那一位区分两种地址长度，而 uwb/phy.ts 的 RMMRC_ADDR_BYTES 恒为 2 字节的短地址，标志字节里那两位（有没有地址、地址多长）在本引擎里一位也没有解析——它们只贡献了固定部分的那一个字节。后果是算出来的帧长只对短地址那一种成立：真实设备用长地址时每个条目要宽 6 个字节，而本课的 15 + 3N 这条式子算不出那一种。',
    },
    {
      kind: 'out-of-scope',
      text: '标准允许用多播或多节点消息把一帧回给多个发起方，本引擎没有建多播的收发，所以这里只有「每个响应方一帧」这一种下发：双向轮里那一帧单播给本轮唯一的那个发起方，多对多里它沿用整轮本来就有的广播地址，因为那个模式里每一帧都是广播（uwb/device.ts 的 onMmrcmSlot）。差别在于本引擎没有一个「这一帧发给这几台」的地址形式可用，所以读者看到的条目数永远等于这一帧的发送者听到过的发起方个数，而不是某个被选定的收方名单。',
    },
    {
      kind: 'out-of-scope',
      text: '§10.35 的测距辅助信息建了 Request 置 0 的那一半（@uwb-ancillary），没建的是 Request 置 1 的那一半，而它单独排一刀的理由不是举证不足——机理已经读通，RAICT 信息单元的 Request 位、消息编号与 Frames Remaining 都读过了。它真正的题目也不是「再加一个信息单元」，而是「排程能不能被请求改变」：Request 置 1 时那一帧是向控制器请求下一次交互排几个时隙，而本引擎的轮排布在会话构造时一次算定（uwb/network.ts 的构造函数里调一次 roundPlan，整场共用），要让一个请求真的改变后续排程，就得把轮的排布变成每块重算一次，而那是多对多、下行到达时间差、多毫秒片段全都共用的结构。把这条写成「举证不足」会让读者以为那一节还没读懂，而事实相反——这个仓库写错过一次。',
    },
    {
      kind: 'model-value',
      text: '没有哪一种配置能同时撑开这个信息单元的两个维度。多对多里本引擎把有效期窗口钉在一块（model/scenario.ts 的校验规则：这个模式没有独立的控制消息，rcmValidityRounds 只能是 1），所以那里位图永远只有一位——撑开的是列表那一维，一帧里 N−1 个条目。双向轮反过来：窗口可以有四块，位图四位，而一个响应方只听得到一个发起方，列表永远只有一个条目。所以本课那张「两个维度」的表是两个场景各出一半，而不是一个场景的两列；一帧既装着好几个条目、每个条目又有好几位的情形，本仿真器今天跑不出来。',
    },
  ],
  sources: [
    `IEEE Std 802.15.4-2024 §10.36 是多消息收妥确认，§10.36.2.1 是 RMMRC 信息单元的内容字段（Address Present、Address Size、MMRC List Length、MMRC List）；请求位是 §10.32.9.1 的 ARC 信息单元控制字段里的第 15 位，和 §10.34 的那个有效轮次字段在同一个字段里。标准为这一节画的图（Figure 10-272）标题是 Many-to-Many Messages，这也是本课接在多对多之后的原因。本课完全不依赖任何草案。`,
    `字节宽度是本仿真器的取值，取自 uwb/phy.ts：帧头 ${UWB_MHR_BYTES}、信息单元头 ${UWB_IE_HDR_BYTES}、RMMRC 固定部分 ${RMMRC_FIXED_BYTES}（单元头加标志与列表长各一字节）、条目里的地址 ${RMMRC_ADDR_BYTES}、位图 ⌈R/8⌉、帧校验 ${UWB_FCS_BYTES}。帧长与条目上限都由 uwbMmrcmBytes 与 uwbMaxMmrcmInitiators 算出，课文里一个字面量也没有写。2 ms 的测距时隙与 200 ms 的块来自 FiRa 的缺省配置，不是标准正文。`,
    `本课三个场景：基础场景是 20 × 16 m 大厅里 ${PARTICIPANTS} 个多对多参与者，最后那个发射功率低 ${QUIET_DB} dB；两个变体是 22 × 8 m 大厅里 ${ANCHORS} 个锚点一个标签的双边双向测距（double-sided two-way ranging, DS-TWR），回复时延嵌在帧里，一条控制消息管 ${VALIDITY} 块，请求位一开一关。位图里出现 0 的那一位必须来自真实的未收到，而本仿真器的收发判决完全确定、没有逐帧的衰落起伏，同一个静止场景里要么每条开场都收到、要么一条也收不到——所以墙后那种做法在这里出不来一张部分为 0 的位图。验收那次测量是在两段运行之间挪动一台锚点做的（tests/uwb/mmrcm-round.test.ts），它不是本课的场景；本课改用发射功率的差别，让一帧里两个条目给出两个不同的答案。`,
  ],
  scenario: () => uwbReceiptScenario(),
  variants: [
    { label: `双向轮：一个条目，${VALIDITY} 位的位图`, scenario: () => uwbReceiptTwrScenario(true) },
    { label: '同一个双向轮，把请求位关掉', scenario: () => uwbReceiptTwrScenario(false) },
  ],
  jumps: [
    J(`第一帧收妥确认：${BYTES.m2m} 字节，两个条目`, firstUwbMmrcm),
    J('多对多的第一帧：只有问，没有答', firstUwbM2m),
    J('全轮最长的那一帧，也是没人收到的那一帧', quietFrame),
    J('没人听见的那一个，自己也在作答', quietConfirmation),
    J('第一条测距行', firstUwbRange),
  ],
  observe: [
    `一块里先是 ${SLOTS.m2mRound} 次发送，再是 ${SLOTS.m2mExtra} 帧 ${BYTES.m2m} 字节的回答，一个参与者一帧。多对多里每一块都自成一个窗口，所以每一块都带这 ${SLOTS.m2mExtra} 个时隙。`,
    `点开 ${M2M.frameFrom} 那一帧的信息单元列：两个条目，P2 那一个写着 1，P3 那一个写着 0。同一帧、同一份记录，两个不同的答案——位图是这台设备自己的经历，不是对记录的复述。`,
    `${M2M.unheard} 这一侧收到两帧回答，位图都是 0；而它自己那一帧发了出去，没有任何一台设备收到。整块只有 ${M2M.ranges} 条测距行，不是 ${M2M.pairs} 条。`,
  ],
  tryThis: [
    `载入「双向轮」变体，跳到第 ${TWR.block} 块的末尾：轮走完之后多出 ${SLOTS.twrExtra} 个时隙，一个锚点一帧 ${BYTES.twr} 字节，每帧只有一个条目，而那一个条目的位图有 ${BITS.twr} 位。再看前面三块：一个时隙也没多，一帧也没多。`,
    `载入「把请求位关掉」变体，和上一个变体逐项对一遍：开场消息还是 ${RCM_BYTES} 和 ${INIT_BYTES} 字节，测距结果还是 ${TWR.ranges} 条且逐字段相同，少掉的只有那 ${SLOTS.twrExtra} 个时隙和那 ${TWR.confirmations} 帧。请求不收费，回答才收费。`,
  ],
  quiz: [
    {
      q: '为什么说请求一次收妥确认不花空口时间？',
      options: [
        '因为请求是用单独一帧很短的消息发出去的',
        '因为请求就是控制消息里本来就有的那两个字节里的一位，置 1 与不置 1 的控制消息字节数完全相同',
        '因为请求随测距结果一起上报，不走空口',
      ],
      answer: 1,
      explain: `有效轮次占那个控制字段的第 9 到 14 位，这个请求位是第 15 位。两次运行里控制消息都是 ${RCM_BYTES} 字节，信息单元那一列也一样。`,
    },
    {
      q: `${PARTICIPANTS} 个参与者的一轮里，为什么「每个发起方一帧」是错的？`,
      options: [
        '因为帧太长了，装不进一帧的载荷上限',
        `因为那样要 ${PARTICIPANTS * M2M_ENTRIES} 帧，而多出来的时隙只有 ${SLOTS.m2mExtra} 个——时隙是每个响应方一个，帧也是；一个条目才对应一个发起方`,
        '因为多对多里没有发起方这个角色',
      ],
      answer: 1,
      explain: '这一节有两个计数：列表条目按发起方数，时隙与帧按响应方数。双向轮里一个响应方只听到一个发起方，两种说法给出同一个数，所以那里看不出错。',
    },
    {
      q: '收妥位图和测距消息未收到交互的差别是什么？',
      options: [
        '一个用在双向轮，一个用在多对多，彼此不重合',
        '一个是逐轮、由响应方自己决定发；一个是整个窗口、由发起方在控制消息里请求',
        '一个说距离，一个说开场消息',
      ],
      answer: 1,
      explain: '两者回答的是同一件事——发起方的开场有没有到——差别在粒度和由谁请求。逐轮那一种当场就说，整窗口那一种一个窗口只发一帧。',
    },
    {
      q: '一个响应方进了新窗口，手里只有上个窗口的那张位图，它该怎么答？',
      options: [
        '把上个窗口那张接着用，位数反正一样',
        '整张按没收到算：上个窗口的位图说的是别的几条消息，它不是一个弱一点的答案，是一个错的答案',
        '不作答，这个时隙留空',
      ],
      answer: 1,
      explain: '引擎按块号算出窗口起点，窗口一变就整张换掉（uwb/device.ts 的 noteOpener 与 receiptIn）。跨轮保留的状态可以存在，但过期要表现成「我什么也不知道」。',
    },
  ],
}
