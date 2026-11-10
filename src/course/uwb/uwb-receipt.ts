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
 *      already carries, so the request adds zero octets. Measured: the control message is 39
 *      octets with it on and with it off, IE for IE (tests/uwb/mmrcm-round.test.ts).
 *   2. **Answering costs a frame, and the two counts are not the same count** (design §6.1): the
 *      IE's list entries are one per INITIATOR, the slots and the frames one per RESPONDER. "One
 *      frame per initiator" reads correctly in a two-way round and is impossible in many-to-many
 *      — three participants have three slots and that rule would need six frames. This is the
 *      trap the implementation itself fell into, once in code and once in prose, so the lesson
 *      says it plainly rather than leaving it to the reader.
 *   3. **It is not RMNR** (design §4). RMNR is per round, sent by the responder on its own
 *      initiative, and says "I did not get this round's start". The receipt bitmap is per ranging round set,
 *      requested by the controller, and says "here is which slots' messages I got". Same subject,
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
 * and off, where one set is four rounds wide and the bitmap is one bit per slot of them.
 *
 * 2026-11-10 (W2, audit #11/#24): the bitmap is one bit per slot of the ranging round set, and each
 * list element carries its 1-octet bitmap length (standard §10.36.2.1, Figure 10-274); every round is
 * one fixed length, so the confirmations sit in the set-closing round's own tail slots.
 *
 * Every number is measured or computed, never typed: `uwbMmrcmBytes`, `uwbMmrcmSlots` /
 * `mmrcmResponders`, `uwbPollBytes`, `uwbInitBytes`, `rmmrcEntryBytes` and `roundPlan` are
 * called, and tests/course/uwb-receipt.test.ts re-measures each figure against whole blocks.
 *
 * `npx tsx scripts/lesson-dump.ts uwb-receipt` prints it with its length. Measure a length by
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
  RMMRC_ADDR_BYTES, RMMRC_BITMAP_LEN_BYTES, RMMRC_FIXED_BYTES, UWB_FCS_BYTES, UWB_IE_HDR_BYTES,
  UWB_MHR_BYTES, UWB_TX_POWER_DBM, rmmrcBitmapBytes, rmmrcEntryBytes, uwbInitBytes,
  uwbMaxMmrcmInitiators, uwbMmrcmBytes, uwbMmrcmSlots, uwbPollBytes,
} from '../../uwb/phy'
import { mmrcmAckSlots, mmrcmResponders, roundPlan } from '../../uwb/session'

/** Participants of the base many-to-many round — the N every count below is per. */
export const PARTICIPANTS = 3
/** Anchors of the two-way variants: three, so their control message is `uwbPollBytes(3)` octets. */
export const ANCHORS = 3
/** `rcmValidityRounds` of the two-way variants: one control message for four rounds, so the
 * bitmap there is four bits wide — the dimension many-to-many cannot show (see `limits`). The tag
 * runs that many rounds a block (`initiatorRounds`), since a ranging round set never leaves its block
 * (standard §10.32.9.1); until 2026-11-10 this was four one-round blocks (audit #23). */
export const VALIDITY = 4
/** The rounds of one two-way set, plus the one that opens the next (block 1's first round): where
 * the reader sees the set turn over, and the span the ranging-unchanged claim is measured over. The
 * name is kept from when the span was counted in blocks; it counts rounds now. */
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
 * times so both ends of every round produce a range, and one control message for `VALIDITY`
 * rounds of one block — which is what makes the bitmap four bits wide here.
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
    { method: 'ds', replyTime: 'embedded', nlos: false, rcmValidityRounds: VALIDITY, initiatorRounds: VALIDITY, mmrcr },
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
  m2mRound: M2M_PLAN.rangingSlots,
  m2mExtra: mmrcmResponders(M2M_PLAN),
  twrRound: TWR_PLAN.rangingSlots,
  twrExtra: mmrcmResponders(TWR_PLAN),
  /** The fixed round length with the request on (standard §10.32.3.3: one round duration). */
  twrFixedRound: TWR_PLAN.slots,
  /** What the same request adds when it is off: nothing, in either mode. */
  off: uwbMmrcmSlots('m2m', PARTICIPANTS, false),
} as const

/** Entries one many-to-many participant's frame carries: every other participant. */
export const M2M_ENTRIES = PARTICIPANTS - 1
/** Entries one two-way anchor's frame carries: the round's single initiator. */
export const TWR_ENTRIES = 1

/** Slots one confirmation acknowledges in each scene — one bitmap bit each (standard §10.36.2.1):
 * every slot of the ranging round set before the confirmations themselves. */
export const ACK_SLOTS = {
  m2m: mmrcmAckSlots(M2M_PLAN, 0),
  twr: mmrcmAckSlots(TWR_PLAN, VALIDITY - 1),
} as const

/** The two frames, in octets, as `uwbMmrcmBytes` sizes them. */
export const BYTES = {
  m2m: uwbMmrcmBytes(M2M_ENTRIES, ACK_SLOTS.m2m),
  twr: uwbMmrcmBytes(TWR_ENTRIES, ACK_SLOTS.twr),
} as const

/** The frame-length law's own pieces: the fixed part, and what one initiator costs. */
export const ENTRY_BYTES = {
  m2m: rmmrcEntryBytes(ACK_SLOTS.m2m),
  twr: rmmrcEntryBytes(ACK_SLOTS.twr),
} as const

/** The law at the four list lengths the lesson prints, and the longest list one frame can hold. */
export const LIST = [1, 2, 3, 6] as const
export const CAP = uwbMaxMmrcmInitiators(ACK_SLOTS.twr)

/** Openers of the two-way variants, which the request does not change by one octet. */
export const RCM_BYTES = uwbPollBytes(ANCHORS)
export const INIT_BYTES = uwbInitBytes()

/** Bitmap width in each scene: one bit per acknowledged slot, in whole octets on the air. */
export const BITS = {
  m2m: ACK_SLOTS.m2m,
  twr: ACK_SLOTS.twr,
  octets: rmmrcBitmapBytes(ACK_SLOTS.m2m),
  twrOctets: rmmrcBitmapBytes(ACK_SLOTS.twr),
  /** Ones in a two-way anchor's bitmap: the initiator's opener and Final in each of the set's rounds. */
  twrOnes: 2 * VALIDITY,
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

/** What the two-way variants measure over `BLOCKS` rounds, with the request on and off. */
export const TWR = {
  /** Ranging records, field for field identical either way: both ends of every round. */
  ranges: 2 * ANCHORS * BLOCKS,
  /** Confirmations, all of them from the one set-closing round in this span. */
  confirmations: ANCHORS,
  /** The set-closing round: round `VALIDITY − 1` of block 0. */
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
  module: 22,
  title: '谁收到了我的帧',
  why: '多对多测距那一课的结尾留下一个问题。一轮里每一对的距离只有排在前面的那个参与者算得出来，排在最后的那个发送全轮最长的一帧，自己一条距离也算不出。更重要的是另一半：它不知道有哪些设备收到了它的帧。在本课的多对多排法里，一次发送的收妥情况只会被排在它后面的参与者写入各自的帧，从不返回发送者，而最后那个参与者之后再没有设备发送。标准里有一节可以回答这个问题（§10.36）：控制器在控制消息的 ARC 信息单元里置一位，请求接收方确认；接收方回复一帧多消息收妥确认，帧中按发起方分条目，每个条目一张收妥位图（bitmap），一位对应一个时隙，收到那个时隙里发给它的消息记 1（§10.36.2.1）。本仿真器照此实现，回复安排在这组轮次最后一轮测距之后的时隙里，一个接收方一个；时隙放在哪里是本仿真器的安排。代价全部在回复一侧：请求位就在控制消息原有的字段里，开场消息一个字节也不增加；消耗的是那几帧回复，而它们不带任何时间量，算出的距离完全相同。两个计数要分开：条目按发起方计数，时隙和帧按响应方计数——双向轮里一个响应方只收到一个发起方的帧，两种计数给出同一个数，多对多里按发起方计数则时隙不够用。基础场景里最后那个参与者的发射功率（transmit power）被调低，它从其他参与者的回复里读到的全是零：没有任何设备收到它的帧。这和测距消息未收到交互回答的是同一个问题，差别在粒度和由谁发起：那一种逐轮、由响应方自行发送，这一种每个轮次组一帧、由控制器请求。',
  outcomes: [
    '说清请求为什么一个字节也不额外占用，而回复为什么需要一整帧',
    '分清两个计数：信息单元的列表条目按发起方数，时隙与帧按响应方数',
    '读出一张收妥位图：一位对应一个时隙，按时间先后排列',
    '说出它和测距消息未收到交互的差别：逐轮还是整个轮次组，由谁主动发送',
  ],
  needs: ['uwb-m2m', 'uwb-rcm-validity'],
  terms: [
    { term: 'multiple message receipt confirmation message (MMRCM)', plain: '响应方用来回答「你发的那几条我收到了哪几条」的那一帧' },
    { term: 'RMMRC IE', plain: '那一帧里唯一的信息单元：一个标志字节、一个列表长度，后面每个发起方一个条目' },
    { term: 'MMRCR', plain: 'ARC 信息单元控制字段里的第 15 位：置 1 就是请求对方回一次收妥确认' },
    { term: 'receipt bitmap', plain: '一个条目里的那几位：一位对应一个时隙、按时间先后排列，收到那个时隙里发给它的消息记 1（§10.36.2.1）' },
  ],
  picture: [
    {
      heading: '收妥情况只向后传递，从不返回',
      text: '本课多对多排法的一帧里携带自己的发送时刻，加上它收到的、排在它前面每个参与者的帧的到达时刻。所以一次发送的收妥情况确实通过空口传递了出去——但只传递给排在发送者后面的参与者：在它之后发送的参与者，才会把「我收到了你」写入自己的帧。排在最后的那个参与者之后没有设备再发送，于是它的那次发送是否被接收，这一轮里没有任何一帧能够说明。这不是实现上的偏向，是时间顺序的结果，和「只有排在前面的那个算得出距离」是同一件事的另一面。',
    },
    {
      kind: 'watch', jump: 0,
      heading: `三次发送之后，多出 ${SLOTS.m2mExtra} 个时隙`,
      text: `载入仿真并播放。前 ${SLOTS.m2mRound} 个时隙是三个参与者各发送一次，和前一课一样；跳到第一帧收妥确认，时间线上它在第 ${SLOTS.m2mRound} 个时隙，后面还有两帧——这一轮共 ${SLOTS.m2mRound + SLOTS.m2mExtra} 个时隙。三个响应方各发送一帧，每帧 ${BYTES.m2m} 字节。打开其中一帧查看信息单元那一列：只有 RMMRC 一个，里面是两个条目，各带一个发起方的名字和一张位图。`,
    },
    {
      heading: '一帧回答由什么组成',
      text: `这一帧没有一个时间量，所以它也不进测距的算式。帧头（MAC header）${UWB_MHR_BYTES} 字节之后是唯一的信息单元：两字节的单元头、一个标志字节（说明条目里带不带地址、地址多长）、一个字节写明列表里有几个条目，然后一个条目一个发起方——短地址 ${RMMRC_ADDR_BYTES} 字节、${RMMRC_BITMAP_LEN_BYTES} 个字节的位图长度，再加上那张位图。位图一位对应一个时隙，长度是被确认的时隙数除以 8 向上取整的字节数（§10.36.2.1）；本仿真器确认的是这组轮次里回复之前的全部时隙，多对多里就是那一轮的 ${BITS.m2m} 个时隙，位图 ${BITS.octets} 字节。最后是 ${UWB_FCS_BYTES} 字节帧校验。`,
    },
    {
      kind: 'diagram', heading: `一帧 ${BYTES.m2m} 字节，两个条目`, spec: uwbReceiptFields(),
      caption: `按字节画的是基础场景里 ${M2M.frameFrom} 发出的那一帧：固定部分 ${RMMRC_FIXED_BYTES + UWB_MHR_BYTES + UWB_FCS_BYTES} 字节，之后每个发起方 ${ENTRY_BYTES.m2m} 字节（地址、位图长度、位图）。两个条目画成两格而不是一格，因为「一个条目对应一个发起方」正是这一节的第一个计数——画成一格「列表」也不算错，但会掩盖需要观察的内容。`,
    },
    {
      kind: 'table', heading: '两个计数，统计的对象不同',
      head: ['计数对象', '对应关系'],
      rows: [
        ['信息单元里的列表条目', '每个发起方一个——一个响应方可能收到多个发起方的帧'],
        ['时隙，以及帧', '每个响应方一个——各自发自己那一帧'],
      ],
    },
    {
      heading: '「每个发起方一帧」在双向轮里看似正确',
      text: `双向轮里一个响应方只收到一个发起方的帧，也就是这一轮的那个标签（tag），所以它那一帧只有一个条目——于是「每个发起方一帧」和「每个响应方一帧」给出同一个数，无法区分哪个错误。多对多揭示了这一错误：${PARTICIPANTS} 个参与者只有 ${SLOTS.m2mExtra} 个时隙，而按「每个发起方一帧」要发送 ${PARTICIPANTS * M2M_ENTRIES} 帧，时隙不够用。正确的说法是每个响应方一帧，帧中包含它收到过的那些发起方。两种说法在双向轮里分不开，很容易记混，所以这一句值得明说。`,
    },
    {
      kind: 'steps', heading: '一次收妥确认的完整过程',
      items: [
        '控制器在控制消息的 ARC 信息单元里把第 15 位置 1。这一位和有效轮次那六位在同一个控制字段里，所以这一帧的字节数没有任何变化。本课的双向轮里控制器就是发起方；本课的多对多场景里没有控制消息，这一位是场景事先给定的设置。',
        '每个响应方仍然接收开场消息、仍然进行测距应答。它额外做一件事：记录在这组轮次的哪几个时隙里收到了这个发起方发给它的消息——开场消息、Final 都算——一个时隙一位，一个发起方一张位图（§10.36.2.1）。',
        '（本仿真器的安排，标准没有规定回复在哪个时隙）这组最后一轮在测距之后留出几个时隙，一个响应方一个。块式结构只有一个轮长（§10.32.3.3），所以每一轮都留着这几个时隙，其余各轮里它们空着。',
        '每个响应方在自己的时隙发送一帧：它有权作答的每个发起方各占一个条目，条目里是那个发起方的地址和它那张位图。本课双向轮里有权作答的条件和测距消息未收到交互一样——必须持有一条仍然有效的控制消息，否则这个时隙本来就不属于它。',
        '发起方接收这一帧，从自己那个条目里读出哪几位是 0。本仿真器的位图不跨轮次组保留：进入新的一组而只有上一组的记录时，全部按未收到处理，因为上一组的位图不是一个不够准确的答案，而是一个错误的答案。',
      ],
    },
    {
      kind: 'table', heading: '和「我没收到」是两件事',
      head: ['比的是什么', '测距消息未收到交互', '收妥位图'],
      rows: [
        ['粒度', '逐轮', '整个轮次组，一个时隙一位'],
        ['谁发起', '响应方自行决定发送', '控制器在控制消息里请求'],
        ['表达的内容', '本轮的启动消息我没收到', '你在哪几个时隙发给我的消息我收到了'],
        ['何时发送', '缺少开场消息的那一轮，在自己的时隙里', '这组最后一轮里、测距之后的时隙里'],
      ],
    },
    {
      heading: '同一个题目，两种粒度',
      text: '两者回答的是同一个问题：发起方的开场消息是否到达。差别在粒度和由谁发起请求，而两者之间不存在「哪一种更好」的问题。逐轮的那一种立即报告，代价是每一个缺少开场消息的轮里都要发送一帧；整个窗口的那一种每个窗口只发送一帧，代价是要等到窗口结束。真正只有位图能够做到的是本课的多对多排法：那一轮没有控制消息，也没有「本轮启动消息」这一概念，而除了位图之外，没有任何一帧会告诉一个参与者它的帧被哪些设备收到过。',
    },
  ],
  numbers: [
    {
      kind: 'table', heading: '请求与回复，代价在哪一侧',
      head: ['量什么', '请求位关闭', '请求位开启'],
      rows: [
        ['这组第一轮的开场消息', `${RCM_BYTES} 字节`, `${RCM_BYTES} 字节`],
        ['这组其余各轮的开场消息', `${INIT_BYTES} 字节`, `${INIT_BYTES} 字节`],
        ['每一轮留给回复的时隙', `${SLOTS.off} 个`, `${SLOTS.twrExtra} 个`],
        ['回复的 MMRCM', '0 帧', `${TWR.confirmations} 帧，各 ${BYTES.twr} 字节`],
      ],
    },
    {
      heading: '请求不花空口时间（airtime）',
      text: `上面那张表是在三个锚点（anchor）、一条控制消息对同一块里 ${VALIDITY} 轮有效的双向轮变体中测得的。两次运行里开场消息逐帧相同：第一轮 ${RCM_BYTES} 字节、其余各轮 ${INIT_BYTES} 字节，信息单元那一列也一样。原因是请求位本来就在既有的字段里——有效轮次占控制字段的第 9 到 14 位，这个请求位是紧接着的第 15 位，那两个字节本来就在每一条控制消息里。所以请求一次收妥确认，请求这一侧一个字节也不额外占用；占用空口的是那几帧回复。`,
    },
    {
      kind: 'formula',
      text: `MMRCM = 帧头 ${UWB_MHR_BYTES} + 单元固定部分 ${RMMRC_FIXED_BYTES} + N × (地址 ${RMMRC_ADDR_BYTES} + 位图长度 ${RMMRC_BITMAP_LEN_BYTES} + 位图 ⌈S/8⌉) + 帧校验 ${UWB_FCS_BYTES}`,
      note: `N 是这一帧里的条目数，也就是它回复几个发起方；S 是被确认的时隙数（§10.36.2.1）。双向轮变体里一组 ${VALIDITY} 轮、每轮 ${SLOTS.twrFixedRound} 个时隙，回复之前共 S = ${ACK_SLOTS.twr} 个时隙，位图 ${BITS.twrOctets} 字节，于是一个发起方 ${ENTRY_BYTES.twr} 字节，整帧 ${uwbMmrcmBytes(0, ACK_SLOTS.twr)} + ${ENTRY_BYTES.twr}N：${LIST.map((n) => `${n} 个发起方 ${uwbMmrcmBytes(n, ACK_SLOTS.twr)} 字节`).join('、')}。一帧装不下无限多个条目，上限和别处一样是算出来的：S = ${ACK_SLOTS.twr} 时最多 ${CAP} 个发起方，再多就超过一帧的载荷（payload）上限。`,
    },
    {
      kind: 'table', heading: '两个维度，没有哪个场景同时取到较大值',
      head: ['场景', '条目数', '位图宽度'],
      rows: [
        [`多对多，${PARTICIPANTS} 个参与者`, `${M2M_ENTRIES} 个`, `${BITS.m2m} 位`],
        [`双向轮，${ANCHORS} 个锚点，一条控制消息对 ${VALIDITY} 轮有效`, `${TWR_ENTRIES} 个`, `${BITS.twr} 位`],
      ],
    },
    {
      heading: '基础场景里那两位',
      text: `基础场景把最后那个参与者的发射功率（transmit power）调低 ${QUIET_DB} dB：它能收到另外两个参与者的帧，另外两个收不到它的帧。于是 ${M2M.frameFrom} 那一帧里两个条目一个在 P2 发送的那个时隙记了 1、一个全是 0——同一帧、同一份记录、两个不同的答案。而 ${M2M.unheard} 从另外两帧里各读到一张全 0 的位图，这就是它这一轮唯一能得到的信息：没有任何设备收到它的帧。三对参与者本应有 ${M2M.pairs} 条距离，这一轮只算出 ${M2M.ranges} 条；缺少的两条和那两张全 0 的位图说明的是同一件事，而在上一课里，它只能看到距离没有算出。`,
    },
    {
      heading: '回复是一条额外的消息，不是测量的一部分',
      text: `双向轮变体在 ${BLOCKS} 轮里测得 ${TWR.ranges} 条测距结果，开启和关闭这个请求，第 0 轮的 ${2 * ANCHORS} 条逐字段相同——距离、品质因数（figure of merit, FoM）、块号、时刻都不变。之后各轮整体推后：请求开启时每一轮长 ${SLOTS.twrFixedRound} 个时隙而不是 ${SLOTS.twrRound} 个；这几轮的距离相差不到 3 mm，那是时间戳计数器在不同时刻取整的差别，与请求本身无关。回复所在的时隙在测距之后，不插入测距中间；回复的帧不带任何时间量，也不参与任何计算。所以这一节带来的是「谁收到了我的帧」这条信息，不是更准确的距离。`,
    },
  ],
  deeper: [
    {
      heading: '双向轮里只有一轮的轮次组不值得占用一帧',
      text: '本仿真器不接受「双向轮 + 一条控制消息只对一轮有效 + 请求收妥确认」这个组合。这是本仿真器的取舍，标准没有这条限制，理由是那一帧提供的新信息很少：这组只有一轮，单边测距时发起方发给响应方的只有那一条开场消息，而响应方在自己的时隙里作答，这件事本身就说明它收到了；它沉默，发起方得到一次超时。（双边测距时位图里还有 Final 那一位，这条理由在那里较弱。）多对多里同一个判断的结论相反：那里一组也只有一轮，但一个参与者的发送只会向后转达，所以位图是整个模式里唯一会反过来告诉它「你的帧已被接收」的信息。同一个字段在两个模式里一个拒绝、一个保留，分界线不在位数上，而在「是否已有其他帧表达过这件事」。',
    },
    {
      heading: '位图过期比位图不完整更重要',
      text: '响应方对每个发起方只保存一张位图，同时记录它属于哪个轮次组。进入新的一组而保存的那张属于上一组时，本仿真器的做法不是继续使用它，而是整张按未收到处理：轮次组的起点由块号与轮号算出，组一变就整张更换。这一步看似清理，实际上关系到答案是否正确：一张来自上一组的位图，位数相同、读起来同样合理，而它表达的是另外几个时隙的消息是否收到。凡是跨轮保留的状态都有同样的要求——它可以存在，但必须会过期，而且过期要表现为「我什么也不知道」，而不是表现为「仍和上次相同」。',
    },
  ],
  limits: [
    {
      kind: 'model-value',
      text: '位图按标准逐时隙确认：每一位对应所确认的那几轮里的一个时隙，按时间先后排列，收到那个时隙里发给它的消息记 1，没收到或那条消息不是发给它的记 0，位图长度是时隙数除以 8 向上取整（§10.36.2.1）。确认哪几个时隙，标准只说是「使用这个信息单元确认的那几轮」；本仿真器取这组轮次里回复之前的全部时隙，所以双向轮变体的位图有 ' + String(ACK_SLOTS.twr) + ' 位，其中大多数是别的锚点发送的时隙，恒为 0。',
    },
    {
      kind: 'unmodelled',
      text: '条目里的地址只建了短的那一种。标准用标志字节里的 Address Size 那一位区分两种地址长度，而本课的条目地址恒为 2 字节的短地址，标志字节里那两位（是否带地址、地址长度）本课一位也不读取——它们只占用了固定部分的那一个字节。后果是算出来的帧长只对短地址那一种成立：真实设备用长地址时每个条目要宽 6 个字节，而本课的 ' + `${uwbMmrcmBytes(0, ACK_SLOTS.twr)} + ${ENTRY_BYTES.twr}N` + ' 这条式子算不出那一种。',
    },
    {
      kind: 'out-of-scope',
      text: '标准允许用多播或多节点消息把一帧回给多个发起方，本仿真器没有多播的收发，所以这里只有「每个响应方一帧」这一种下发：双向轮里那一帧单播给本轮唯一的那个发起方，多对多里它沿用整轮本来就有的广播地址，因为那个模式里每一帧都是广播。差别在于本课没有一个「这一帧发给这几台」的地址形式可用，所以读者看到的条目数永远等于这一帧的发送者收到过的发起方个数，而不是某个被选定的收方名单。',
    },
    {
      kind: 'out-of-scope',
      text: '§10.35 的测距辅助信息不在本课里：Request 置 0 的那一半见 @uwb-ancillary，Request 置 1 的那一半见 @uwb-ancillary-request，后者用到 RAICT 信息单元的 Request 位、消息编号与 Frames Remaining。后一半的题目不是「再加一个信息单元」，而是「排程能不能被请求改变」：Request 置 1 时那一帧是向控制器请求下一次交互安排几个时隙，而本课的时隙排布在会话开始前一次定好、整场不变，所以本课的数字里看不到一个请求改变后续排程的情形。',
    },
    {
      kind: 'model-value',
      text: '没有哪一种配置能使这个信息单元的两个维度同时取到较大值。多对多里本课把有效期窗口固定为一轮（本课的这个模式没有独立的控制消息，有效轮次只能是 1，每块也只有一轮），所以那里位图只有一轮的 ' + String(BITS.m2m) + ' 位——取到较大值的是列表那一维，一帧里 N−1 个条目。双向轮则相反：一组可以有四轮，位图 ' + String(BITS.twr) + ' 位，而一个响应方只收得到一个发起方的帧，列表永远只有一个条目。所以本课那张「两个维度」的表是两个场景各出一半，而不是一个场景的两列；一帧既包含多个条目、每个条目又有多位的情形，本仿真器目前无法产生。',
    },
  ],
  sources: [
    `IEEE Std 802.15.4-2024 §10.36 是多消息收妥确认，§10.36.2.1 是 RMMRC 信息单元的内容字段（Address Present、Address Size、MMRC List Length、MMRC List）；请求位（MMRCR）是 §10.32.9.1 的 ARC 信息单元内容字段开头控制位里的第 15 位，紧挨着同一节定义的有效轮次字段。位图逐时隙确认的规则在 §10.36.2.1。标准为这一节画的示例图（Figure 10-272）里，多台设备先各自发出多条消息（图中标作 Many-to-Many Messages），再由接收方回复 MMRCM，这也是本课接在多对多之后的原因。本课完全不依赖任何草案。`,
    `字节宽度按标准（§10.36.2.1，图 10-273、10-274）：信息单元头 ${UWB_IE_HDR_BYTES}、RMMRC 固定部分 ${RMMRC_FIXED_BYTES}（单元头加标志与列表长各一字节）、条目里的位图长度 ${RMMRC_BITMAP_LEN_BYTES}、位图 ⌈S/8⌉、帧校验 ${UWB_FCS_BYTES}；帧头 ${UWB_MHR_BYTES} 与条目里的短地址 ${RMMRC_ADDR_BYTES} 是本仿真器的取值。帧长与条目上限都由这几个宽度算出。2 ms 的测距时隙与 200 ms 的块来自 FiRa 的缺省配置，不是标准正文。`,
    `本课三个场景：基础场景是 20 × 16 m 大厅里 ${PARTICIPANTS} 个多对多参与者，最后那个发射功率低 ${QUIET_DB} dB；两个变体是 22 × 8 m 大厅里 ${ANCHORS} 个锚点一个标签的双边双向测距（double-sided two-way ranging, DS-TWR），回复时延嵌在帧里，一条控制消息对同一块里的 ${VALIDITY} 轮有效，请求位一开一关。位图里出现 0 的那一位必须来自真实的未收到，而本课的收发判决只比较功率、没有逐帧的衰落起伏（真实信道有），同一个静止场景里要么每条开场消息都收到、要么一条也收不到——所以把设备放到墙后在这里无法得到一张部分为 0 的位图。本课改用发射功率的差别，让一帧里两个条目给出两个不同的答案。`,
  ],
  scenario: () => uwbReceiptScenario(),
  variants: [
    { label: `双向轮：一个条目，${VALIDITY} 位的位图`, scenario: () => uwbReceiptTwrScenario(true) },
    { label: '同一个双向轮，把请求位关闭', scenario: () => uwbReceiptTwrScenario(false) },
  ],
  jumps: [
    J(`第一帧收妥确认：${BYTES.m2m} 字节，两个条目`, firstUwbMmrcm),
    J('多对多的第一帧：只有问，没有答', firstUwbM2m),
    J('全轮最长的那一帧，也是没有设备收到的那一帧', quietFrame),
    J('帧未被任何设备收到的那个参与者，自己也在作答', quietConfirmation),
    J('第一条测距行', firstUwbRange),
  ],
  observe: [
    `一块里先是 ${SLOTS.m2mRound} 次发送，再是 ${SLOTS.m2mExtra} 帧 ${BYTES.m2m} 字节的回复，一个参与者一帧。多对多里每一块都自成一个窗口，所以每一块都带这 ${SLOTS.m2mExtra} 个时隙。`,
    `打开 ${M2M.frameFrom} 那一帧的信息单元列：两个条目，P2 那一个写着 010（第二位是 P2 发送的时隙），P3 那一个写着 000。同一帧、同一份记录，两个不同的答案——位图反映的是这台设备自己的接收情况，不是对记录的复述。`,
    `${M2M.unheard} 这一侧收到两帧回复，位图都是 0；而它自己的那一帧发送了出去，没有任何一台设备收到。整块只有 ${M2M.ranges} 条测距行，不是 ${M2M.pairs} 条。`,
  ],
  tryThis: [
    `载入「双向轮」变体，跳到第 0 块第 ${TWR.block} 轮测距之后的 ${SLOTS.twrExtra} 个时隙：一个锚点一帧 ${BYTES.twr} 字节，每帧只有一个条目，而那一个条目的位图有 ${BITS.twr} 位，其中 ${BITS.twrOnes} 位是 1——每一轮的开场消息与 Final。再看前面三轮：这 ${SLOTS.twrExtra} 个时隙空着，没有任何帧。`,
    `载入「把请求位关闭」变体，和上一个变体逐项对照：开场消息仍是 ${RCM_BYTES} 和 ${INIT_BYTES} 字节，测距结果仍是 ${TWR.ranges} 条，第 0 轮逐字段相同；减少的是那 ${TWR.confirmations} 帧，每一轮也短了 ${SLOTS.twrExtra} 个时隙。请求不占用空口，占用空口的是回复。`,
  ],
  quiz: [
    {
      q: '为什么说请求一次收妥确认不花空口时间？',
      options: [
        '因为请求是用单独一帧很短的消息发送的',
        '因为请求就是控制消息里本来就有的那两个字节里的一位，置 1 与不置 1 的控制消息字节数完全相同',
        '因为请求随测距结果一起上报，不经过空口',
      ],
      answer: 1,
      explain: `有效轮次占那个控制字段的第 9 到 14 位，这个请求位是第 15 位。两次运行里控制消息都是 ${RCM_BYTES} 字节，信息单元那一列也一样。`,
    },
    {
      q: `${PARTICIPANTS} 个参与者的一轮里，为什么「每个发起方一帧」是错的？`,
      options: [
        '因为帧太长了，超过一帧的载荷上限',
        `因为那样要 ${PARTICIPANTS * M2M_ENTRIES} 帧，而额外的时隙只有 ${SLOTS.m2mExtra} 个——时隙是每个响应方一个，帧也是；一个条目才对应一个发起方`,
        '因为多对多里没有发起方这个角色',
      ],
      answer: 1,
      explain: '这一节有两个计数：列表条目按发起方数，时隙与帧按响应方数。双向轮里一个响应方只收到一个发起方的帧，两种计数给出同一个数，所以那里看不出错误。',
    },
    {
      q: '收妥位图和测距消息未收到交互的差别是什么？',
      options: [
        '一个用在双向轮，一个用在多对多，彼此不重合',
        '一个是逐轮、由响应方自行决定发送；一个覆盖整个轮次组、由控制器在控制消息里请求',
        '一个说距离，一个说开场消息',
      ],
      answer: 1,
      explain: '两者回答的是同一个问题——发起方的消息是否到达——差别在粒度和由谁请求。逐轮的那一种立即报告，整个轮次组的那一种每组只发送一帧。',
    },
    {
      q: '按本仿真器的规则，一个响应方进入新的轮次组，只有上一组的那张位图，它应如何回复？',
      options: [
        '继续使用上一组那张，位数反正相同',
        '整张按未收到处理：上一组的位图表达的是另外几个时隙的消息，它不是一个不够准确的答案，而是一个错误的答案',
        '不作答，这个时隙留空',
      ],
      answer: 1,
      explain: '轮次组的起点由块号与轮号算出，组一变就整张更换。跨轮保留的状态可以存在，但过期要表现为「我什么也不知道」。',
    },
  ],
}
