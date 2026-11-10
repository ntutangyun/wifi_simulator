/**
 * UWB Tier 5 · M24 测距辅助信息 · One message does not fit in one frame.
 *
 * IEEE Std 802.15.4-2024 §10.35 (ranging ancillary information) and its RAICT IE (§10.35.2.1,
 * Figure 10-271). This lesson is the Request = 0 half; Request = 1 (a scheduling request) is
 * `uwb-ancillary-request`, and what the countdown buys when a frame is lost is `uwb-ancillary-loss`,
 * which loads this lesson's scenes unchanged (`sameSceneAs`).
 *
 * **Standard-first shape (2026-11-10).** ① says what §10.35 specifies — the ancillary-information
 * round (ARC Ranging Round Usage = 3, Table 10-164), the inverted roles of §10.35.1, the RAICT
 * Content field and how a controller assigns the slots (RDM §10.32.9.8, RCPS §10.32.9.5). ② says,
 * row by row, what this engine does with each, including where it picks a value or a method the
 * standard leaves open (which device sends, how many frames, the message number, the contention
 * start) and what it does not implement (the upper layer and its retransmissions). ③ is five runs.
 *
 * The scenes. One 22 × 8 m hall, four anchors and one tag, SS-TWR with the reply time on the
 * Response, four runs differing only in session switches: the base (the exchange on, four frames), a
 * contention-scheduled run, a run whose control message governs `VALIDITY` ranging rounds of one
 * block, and one with the exchange off.
 *
 * Every number is computed, never typed: `raictIeBytes`, `uwbAncillaryBytes`, `uwbAncillaryRcmBytes`,
 * `uwbPpduNs`, `roundPlan`, `ancillarySlots` and `roundCarriesAncillary` are called, and
 * tests/course/uwb-ancillary.test.ts reads each figure back out of the lesson text and compares it
 * with a run. `MS`, `NS`, `SLOTS` and `ms` are exported for `uwb-ancillary-loss`.
 */
import type { Scenario, UwbSessionCfg } from '../../model/scenario'
import {
  J, anchor, firstUwbRange, rangingLab, txOf, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'
import {
  RAICT_IE_MIN_BYTES, UWB_FCS_BYTES, UWB_IE_HDR_BYTES, UWB_MHR_BYTES,
  raictIeBytes, uwbAncillaryBytes, uwbAncillaryRcmBytes, uwbPpduNs,
} from '../../uwb/phy'
import { ancillarySlots, roundCarriesAncillary, roundPlan, roundsPerInitiator } from '../../uwb/session'

/** Anchors of every scene here: three time differences for the position fix, plus one. */
export const ANCHORS = 4
/** Frames one ancillary message is segmented across. Four, so Frames Remaining runs 3, 2, 1, 0 —
 * the shortest countdown in which a MIDDLE frame can go missing (`uwb-ancillary-loss`). */
export const FRAMES = 4
/** `rcmValidityRounds` of the third variant: one control message for four ranging rounds of one block
 * (standard §10.32.9.1); the ancillary exchange still has its own round, with its own RCM. */
export const VALIDITY = 4

/** Where the anchors stand, in metres: no two distances to the tag alike. */
export const PLACES: readonly { x: number; y: number }[] = [
  { x: 1, y: 1 }, { x: 21, y: 1 }, { x: 21, y: 7 }, { x: 11, y: 7 },
]
/** Where the tag stands. In ranging it opens every round; in this exchange it is the receiver. */
export const TAG = { x: 7, y: 3 } as const

/** Anchor i's id. Ids decide the slot order, so `anc-1` is the first responder — and, by
 * `ANCILLARY_SENDER_INDEX`, the device that sends the ancillary message. */
export const idOf = (i: number): string => `anc-${i + 1}`
/** The tag's id. */
export const TAG_ID = 'uwb-1'
/** The device that sends the ancillary message: ranging responder 0, which §10.35.1 calls this
 * exchange's *initiator*. */
export const SENDER_ID = idOf(0)

const devices = () => [
  ...PLACES.map((p, i) => anchor(idOf(i), `A${i + 1}`, p.x, p.y)),
  uwbTag(TAG_ID, 'Tag', TAG.x, TAG.y),
]

/** One scene: SS-TWR with the reply time on the Response, non-line-of-sight off. */
const scene = (session: Partial<UwbSessionCfg>): Scenario =>
  uwbSc(rangingLab(), devices(), { method: 'ss', replyTime: 'embedded', nlos: false, ...session })

/** The base scene: the exchange on, one message of `FRAMES` frames, time-scheduled. */
export function uwbAncillaryScenario(
  over: Partial<UwbSessionCfg> = {},
): Scenario {
  return scene({ ancillary: true, ancillaryFrames: FRAMES, ...over })
}

/** The third variant: one control message governs `VALIDITY` rounds, and the tag runs that many
 * ranging rounds a block so that the whole set fits in one block (standard §10.32.9.1). */
export function uwbAncillaryWindowScenario(): Scenario {
  return uwbAncillaryScenario({ rcmValidityRounds: VALIDITY, initiatorRounds: VALIDITY })
}

/** The same hall with the exchange off. */
export function uwbAncillaryOffScenario(): Scenario {
  return scene({ ancillary: false, ancillaryFrames: FRAMES })
}

const SESSIONS = {
  base: uwbAncillaryScenario().uwb!,
  contend: uwbAncillaryScenario({ schedule: 'contention' }).uwb!,
  window: uwbAncillaryWindowScenario().uwb!,
  off: uwbAncillaryOffScenario().uwb!,
} as const

const PLANS = {
  base: roundPlan(SESSIONS.base, ANCHORS),
  contend: roundPlan(SESSIONS.contend, ANCHORS),
  window: roundPlan(SESSIONS.window, ANCHORS),
  off: roundPlan(SESSIONS.off, ANCHORS),
} as const

/**
 * The slot arithmetic of each scene, asked of the engine. Every round of a block-based session is one
 * length (standard §10.32.3.3); slot 0 of the ancillary round is its RCM and the message starts at
 * slot 1. `used` is the tag's share of the block: its ranging round plus the ancillary round.
 */
export const SLOTS = {
  ranging: PLANS.base.rangingSlots,
  round: PLANS.base.slots,
  window: ancillarySlots(PLANS.base),
  /** The ancillary round's index in the block, and the slot its first frame rides in. */
  ancRound: PLANS.base.initiatorRounds,
  firstSlot: 1,
  used: roundsPerInitiator(PLANS.base) * PLANS.base.slots,
  contendRanging: PLANS.contend.rangingSlots,
  contendRound: PLANS.contend.slots,
  contendWindow: ancillarySlots(PLANS.contend),
  /** The window with the exchange off: none. */
  off: ancillarySlots(PLANS.off),
} as const

/** Rounds the window variant's tag owns per block: its `VALIDITY` ranging rounds and the ancillary one. */
export const WINDOW_ROUNDS_PER_BLOCK = roundsPerInitiator(PLANS.window)
/** Which of the tag's first two blocks' rounds run the exchange in the window variant, counted across
 * blocks. One per block: the ancillary round after the four ranging rounds. */
export const WINDOW_ROUNDS: readonly number[] = Array.from({ length: 2 * WINDOW_ROUNDS_PER_BLOCK }, (_v, g) => g)
  .filter((g) => roundCarriesAncillary(PLANS.window, g % WINDOW_ROUNDS_PER_BLOCK))
/** The tag's running round number of a record of the window variant: block × rounds a block + round. */
export const tagRoundOf = (rec: { block: number; round: number }): number =>
  rec.block * WINDOW_ROUNDS_PER_BLOCK + rec.round

/** The RAICT IE at each of the four combinations of its two optional fields, and the frame each builds. */
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
  /** The ancillary round's RCM under a time schedule: ARC + RR + an RDM IE assigning `FRAMES` slots. */
  rcm: uwbAncillaryRcmBytes('time', FRAMES),
  /** …and under contention: ARC + RR + an RCPS IE with one initiators' phase. */
  rcmContend: uwbAncillaryRcmBytes('contention', FRAMES),
} as const

/** Milliseconds: the slot and the block of every scene. */
export const MS = {
  slot: PLANS.base.slotNs / 1e6,
  block: PLANS.base.blockNs / 1e6,
} as const

/**
 * Nanoseconds, closed form and geometry-free: one frame's airtime, and how much earlier the countdown
 * names a missing middle frame than the end of the ancillary round does (two slots less the airtime
 * of the frame that names the gap). `uwb-ancillary-loss` prints both.
 */
export const NS = {
  frame: uwbPpduNs(uwbAncillaryBytes(true, true)),
  lead: 2 * PLANS.base.slotNs - uwbPpduNs(uwbAncillaryBytes(true, true)),
} as const

/** Milliseconds, two decimals: how every instant in this module is printed. */
export const ms = (ns: number): string => (ns / 1e6).toFixed(2)

/** The start slots the contention variant's sender drew in blocks 0–6, as the run produced them;
 * tests/course/uwb-ancillary.test.ts compares this with a run. */
export const CONTEND_STARTS: readonly number[] = [5, 1, 3, 5, 4, 3, 3]

const firstFragment = txOf((r) => r.frame.kind === 'uwbAncillary')
const lastFragment = txOf((r) =>
  r.frame.kind === 'uwbAncillary' && r.frame.uwb?.raict?.framesRemaining === 0)

const countdown = Array.from({ length: FRAMES }, (_v, i) => String(FRAMES - 1 - i))

export const uwbAncillary: Lesson = {
  id: 'uwb-ancillary',
  module: 24,
  title: '一条消息装不进一帧',
  why: `一帧的载荷（payload）有上限，一条辅助消息可能超过这个上限。IEEE 802.15.4-2024 §10.35 的办法是分段传送：一个测距块（ranging block）里可以有一个或多个专门用于辅助信息交换的测距轮（ranging round），由 ARC 信息单元的测距轮用途（Ranging Round Usage）字段取值 3 标明；一条消息分装在这一轮的几个测距时隙（ranging slot）里，每一帧都携带一个 RAICT 信息单元，给出消息编号与这一帧之后还剩几帧。RAICT 的控制字节只有 Request 与「消息编号存在」两位，剩余帧数字段没有存在位，带不带由信息单元的长度看出，所以四种组合只有三种长度。这一节按收发方向定义角色：发送辅助信息的一端称为发起方，接收的一端称为响应方，与测距角色无关。本仿真器在标签（tag）的测距轮之后为它安排一个辅助信息轮，由测距中作答的第一个锚点（anchor）发送一条 ${FRAMES} 帧的消息，所以本课里两套角色正好相反；一条消息分几帧，标准交给上层决定，本仿真器没有上层，帧数是场景给定的值。`,
  outcomes: [
    '说出标准为辅助信息交换规定了什么：辅助信息轮、两个角色的定义、RAICT 信息单元的字段与时隙分配',
    '分清本仿真器哪些做法照标准、哪些是它自己的取值或取法、哪些没有实现',
    '在日志里找到辅助信息轮、它的控制消息与逐帧递减的剩余帧数，并说明为什么两套角色在本课里正好相反',
  ],
  needs: ['uwb-rcm-validity', 'uwb-receipt'],
  terms: [
    { term: 'ranging ancillary information', plain: '测距之外需要传送的内容；本节规定的是分帧传送用的编号与剩余帧数，内容本身不在标准范围内' },
    { term: 'RAICT IE (Ranging Ancillary Information Message Counter and Type IE)', plain: '每一帧都携带的信息单元：一个控制字节，后接两个可选字段' },
    { term: 'Request', plain: '控制字节里的第一位：置 0 是本课这一半，置 1 是向控制器请求时隙' },
    { term: 'ancillary initiator / ancillary responder', plain: '发送辅助信息的一端与接收辅助信息的一端；这两个词在本节按收发方向定义，与测距角色无关' },
  ],
  standard: [
    { heading: '辅助信息轮（§10.35.1，§10.32.9.1，表 10-164）', text: '一个测距块里可以有一个或多个测距轮用于交换测距辅助信息。ARC 信息单元的测距轮用途字段取值 3 表示「测距辅助信息交换」；这个字段管当前这一轮，以及控制消息之后由有效轮数字段给出的那几轮。交换可以按时间调度，也可以基于竞争。' },
    { heading: '两个角色按收发方向定义（§10.35.1）', text: '在辅助信息交换里，发起方（initiator）是发送辅助信息的测距设备，响应方（responder）是接收辅助信息的测距设备。这一定义与测距中谁发起、谁应答无关。' },
    { heading: '一条消息分装在多帧里（§10.35.1）', text: '上层可以用 RAICT 信息单元的字段，把一条信息分装在一轮之内跨越多个测距时隙的多条媒体访问控制（medium access control, MAC）消息里发送，并用这些字段管理重传（retry）；消息编号字段用来区分多条消息。一条消息分几帧，标准没有给出取值，由上层决定。' },
    { kind: 'table', heading: 'RAICT 信息单元的内容字段（§10.35.2.1，图 10-271）', head: ['字段', '长度', '含义'], rows: [
      ['Request', '第 0 位', '置 1 表示这个信息单元用于向控制器请求时隙，否则置 0'],
      ['Ranging Or Ancillary Message Number Present', '第 1 位', '置 1 表示消息编号字段存在，置 0 表示不存在'],
      ['保留', '第 2–7 位', '—'],
      ['Ranging Or Ancillary Message Number', '0 或 1 字节', '消息编号'],
      ['Frames Remaining', '0 或 1 字节', '完成当前这条消息还剩几帧；Request 置 1 时是请求的时隙数'],
    ] },
    { heading: '剩余帧数没有存在位（§10.35.2.1）', text: '控制字节只给出消息编号的存在位，剩余帧数字段没有存在位，带不带要从信息单元的长度看出。正文还说 Request 置 0 时这个信息单元传递消息类型，但图 10-271 里没有类型字段，两者不一致。' },
    { heading: '时隙由控制消息分配（§10.32.9.8，§10.32.9.5，§10.32.3.3）', text: '按时间调度时，控制器用 RDM 信息单元分配时隙：SIU 字段置 1 时，每个列表元素给一台设备指定一个测距时隙号。基于竞争时，RCPS（ranging contention phase structure IE）信息单元给出竞争阶段（contention phase）的起止时隙，阶段指示为 0 表示这一阶段供发起方竞争（表 10-170）。块式结构中，一块的轮数由块长除以轮长得出，一轮的时隙数由轮长除以时隙长得出，所以各轮一样长。' },
    { kind: 'steps', heading: '一次辅助信息交换，按标准：逐步说明', items: [
      '控制器发出控制消息，其中 ARC 信息单元的测距轮用途为 3（§10.32.9.1）。',
      '按时间调度时，控制消息用 RDM 信息单元给发起方逐个指定时隙；基于竞争时，用 RCPS 信息单元给出发起方竞争阶段（§10.32.9.8、§10.32.9.5）。',
      '发起方（发送辅助信息的一端）在这些时隙里逐帧发送，每帧带一个 RAICT 信息单元，Request 置 0（§10.35.2.1）。',
      '每一帧的剩余帧数给出完成这条消息还剩几帧，最后一帧为 0；响应方（接收的一端）据此得知还差几帧。',
      '上层可以用这些字段管理重传（§10.35.1）。发起方不是控制器时，还可以把 Request 置 1，请求控制器为下一次交换安排时隙（见 @uwb-ancillary-request）。',
    ] },
  ],
  implementation: [
    { topic: '辅助信息轮', standard: 'ARC 信息单元的测距轮用途为 3（§10.32.9.1，表 10-164）', sim: `辅助信息轮的第 0 个时隙是标签发出的控制消息（${BYTES.rcm} 字节：ARC、RR 与 RDM 三个信息单元），ARC 的测距轮用途为 3、有效轮数为 1。`, kind: 'faithful' },
    { topic: '辅助信息轮的位置与数目', standard: '一个块里可以有一个或多个，位置标准未规定（§10.35.1）', sim: '每块为每个标签安排一个，排在它的测距轮之后。', kind: 'choice' },
    { topic: '时隙分配', standard: 'RDM 信息单元，SIU 置 1 时每个列表元素指定一个时隙（§10.32.9.8）', sim: `按时间调度时，RDM 把第 ${SLOTS.firstSlot} 到第 ${SLOTS.firstSlot + FRAMES - 1} 个时隙逐个指定给发送方，共 ${FRAMES} 个元素；没有解出这条控制消息的设备，这一轮不发送。`, kind: 'faithful' },
    { topic: '轮长', standard: '各轮一样长（§10.32.3.3）', sim: `每一轮 ${SLOTS.round} 个时隙，辅助信息轮与测距轮同长；控制消息与全部帧放不下时，所有轮一起变长。`, kind: 'faithful' },
    { topic: '由哪台设备发送', standard: '标准未规定哪台设备成为发起方', sim: `始终是测距中的第一个应答方 ${SENDER_ID}，每块一条消息，接收的是标签。所以本课里辅助信息的发起方是测距中的应答方，响应方是测距中的发起方。`, kind: 'choice' },
    { topic: '一条消息分几帧', standard: '由上层决定，标准未给出取值（§10.35.1）', sim: `本仿真器没有上层，也没有 MCPS-DATA 原语；帧数是场景给定的值，本课为 ${FRAMES}。`, kind: 'value' },
    { topic: 'RAICT 的格式', standard: 'Request 位、编号存在位、可选的消息编号与剩余帧数（图 10-271）', sim: `照此编码。本课两个可选字段都带，信息单元 ${BYTES.ieFull} 字节（头 ${BYTES.ieHdr} 字节，内容 ${BYTES.ieFull - BYTES.ieHdr} 字节）；剩余帧数带不带由长度看出。`, kind: 'faithful' },
    { topic: '消息类型', standard: '正文提到，图 10-271 没有这个字段（§10.35.2.1）', sim: '按图 10-271 实现：帧里与记录里都没有消息类型。', kind: 'faithful' },
    { topic: '消息编号', standard: '用于区分多条消息，取值标准未规定', sim: '取块号除以 256 的余数，每块一条新消息。', kind: 'value' },
    { topic: '帧头（MAC header）', standard: '帧头长度随所选的寻址方式而变', sim: `取 ${BYTES.mhr} 字节（16 位短地址），加上帧校验 ${BYTES.fcs} 字节，一帧辅助信息 ${BYTES.frame} 字节，空口时间（airtime）${ms(NS.frame)} ms。`, kind: 'value' },
    { topic: '竞争式的阶段宽度与起点', standard: 'RCPS 给出起止时隙（§10.32.9.5）；发起方从哪里开始发送，标准未规定', sim: `阶段宽度取消息帧数与会话竞争时隙数中较大的一个，本课为 ${SLOTS.contendWindow} 个时隙；发送方在阶段内均匀随机地选取起点，${FRAMES} 帧连续发送。`, kind: 'choice' },
    { topic: '重传', standard: '上层可以用这些字段管理重传（§10.35.1）', sim: '未实现：接收端只记录收到了哪几帧，不请求重传（见 @uwb-ancillary-loss）。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '测距轮之后的辅助信息轮',
      jump: 0,
      steps: [
        '载入本课场景并播放，跳到第一帧辅助信息。',
        '向前找到同一轮第 0 个时隙的控制消息，点开它的信息单元列；再逐帧点开四帧辅助信息。',
      ],
      blocks: [
        { kind: 'table', heading: '块 0 的辅助信息轮', head: ['时隙', '发送方', '帧', '字节', '剩余帧数'], rows: [
          ['0', TAG_ID, '控制消息：ARC、RR、RDM', String(BYTES.rcm), '—'],
          ...countdown.map((c, i) => [String(SLOTS.firstSlot + i), SENDER_ID, '辅助信息：RAICT', String(BYTES.frame), c]),
        ] },
      ],
      expect: `一块里第一轮是 ${SLOTS.ranging} 个时隙的测距轮；第二轮是辅助信息轮，第 0 个时隙是 ${TAG_ID} 发出的 ${BYTES.rcm} 字节控制消息，ARC 的测距轮用途为 3；第 ${SLOTS.firstSlot} 到第 ${SLOTS.firstSlot + FRAMES - 1} 个时隙是 ${SENDER_ID} 发出的 ${FRAMES} 帧，每帧 ${BYTES.frame} 字节，剩余帧数依次为 ${countdown.join('、')}。整块没有一次超时。`,
      meaning: '辅助信息轮由测距轮用途 3 标明、时隙由 RDM 信息单元指定，这两点照标准（①）；这一轮排在测距轮之后、每块一条消息，是本仿真器的取法（②）。',
    },
    {
      heading: '帧长由两个可选字段决定',
      jump: 0,
      steps: [
        '点开任意一帧辅助信息，查看信息单元列：只有 RAICT 一个。',
        '对照下表：控制字节之后的两个字段各占 0 或 1 字节。',
      ],
      blocks: [
        { kind: 'table', heading: '四种组合，三种长度', head: ['消息编号', '剩余帧数', '信息单元', '整帧'], rows: IE.bits.map(([n, f]) => [
          n ? '带' : '不带', f ? '带' : '不带', `${IE.ie(n, f)} 字节`, `${IE.frame(n, f)} 字节`,
        ]) },
      ],
      expect: `本课每一帧两个字段都带，信息单元 ${BYTES.ieFull} 字节、整帧 ${BYTES.frame} 字节；只带其中任意一个时整帧 ${IE.frame(true, false)} 字节，都不带时 ${BYTES.shortest} 字节。`,
      meaning: '只带编号与只带剩余帧数一样长，因为剩余帧数没有存在位，接收端只能从长度判断带了哪一个（①）。',
    },
    {
      heading: '发送辅助信息的是测距中的应答方',
      jump: 1,
      steps: [
        '跳到剩余帧数为 0 的那一帧，看它的发送方与接收方。',
        '再看日志里的辅助信息记录写在哪台设备一侧、对端是谁。',
      ],
      expect: `四帧都由 ${SENDER_ID} 发出，辅助信息记录都写在 ${TAG_ID}（标签）一侧，对端为 ${SENDER_ID}；标签在这一轮里只发出控制消息。剩余帧数为 0 的那一帧到达时，记录标为收齐。`,
      meaning: '按 §10.35.1 的定义，这里的发起方是发送辅助信息的 anc-1，响应方是标签（①）；由哪台设备发送是本仿真器的取法（②），于是两套角色正好相反。',
    },
    {
      heading: '竞争式：起点由发送方选取',
      variant: 0,
      steps: [
        '载入「竞争式排程」变体，找到每一块辅助信息轮的控制消息，查看它的信息单元。',
        '逐块记下第一帧辅助信息位于第几个时隙。',
      ],
      blocks: [
        { kind: 'table', heading: '七个块的起点', head: ['块', '0', '1', '2', '3', '4', '5', '6'], rows: [
          ['第一帧所在时隙', ...CONTEND_STARTS.map(String)],
        ] },
      ],
      expect: `每一轮变为 ${SLOTS.contendRound} 个时隙；辅助信息轮的控制消息为 ${BYTES.rcmContend} 字节，带 ARC、RR 与 RCPS，RCPS 给出第 1 到第 ${SLOTS.contendWindow} 个时隙的发起方竞争阶段。七个块的起点依次是第 ${CONTEND_STARTS.join('、')} 个时隙，${FRAMES} 帧总是连续的。`,
      meaning: 'RCPS 的阶段指示 0 表示发起方竞争阶段，这一点照标准（①）；阶段宽度与均匀随机的起点是本仿真器的取法（②）。',
    },
    {
      heading: `一条控制消息管 ${VALIDITY} 个测距轮`,
      variant: 1,
      steps: [
        `载入「一条控制消息管 ${VALIDITY} 轮」变体，查看块 0 第 0 轮的轮询帧里 ARC 的有效轮数。`,
        `再看第 ${VALIDITY} 轮第 0 个时隙的控制消息。`,
      ],
      expect: `块 0 的第 0 到第 ${VALIDITY - 1} 轮是测距轮，第 0 轮的轮询帧有效轮数为 ${VALIDITY}，其余三轮只有起始帧；第 ${VALIDITY} 轮是辅助信息轮，有自己的控制消息（测距轮用途 3，有效轮数 1），${FRAMES} 帧在它的第 ${SLOTS.firstSlot} 到第 ${SLOTS.firstSlot + FRAMES - 1} 个时隙。`,
      meaning: '测距轮用途管的是一条控制消息所管的全部轮次（①），所以用途不同的辅助信息轮需要另一条控制消息；本仿真器照此安排（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.35.1（辅助信息交换的轮次、两个角色的定义、分帧传送与重传由上层负责、Request 位的用途）、§10.35.2.1 与图 10-271（RAICT 信息单元的内容字段）、§10.32.9.1 与表 10-164（ARC 信息单元，测距轮用途取值 3）、§10.32.9.8（RDM 信息单元）、§10.32.9.5 与表 10-170（RCPS 信息单元，阶段指示 0）、§10.32.3.3（块式结构，各轮一样长）。本课不依赖任何草案。',
    `本仿真器的取值与取法：每块每个标签一个辅助信息轮、排在测距轮之后；由第一个测距应答方发送；一条消息 ${FRAMES} 帧；消息编号取块号除以 256 的余数；帧头 ${BYTES.mhr} 字节（16 位短地址）；竞争式下阶段宽度取帧数与竞争时隙数中较大的一个、起点均匀随机。四个场景是同一个 22 × 8 m 大厅、${ANCHORS} 个锚点与一个标签、同样的种子，只有会话开关不同，都关闭非视距。`,
  ],
  limits: [],
  scenario: () => uwbAncillaryScenario(),
  variants: [
    { label: `竞争式排程：窗口宽 ${SLOTS.contendWindow} 个时隙，起点抽出来`, scenario: () => uwbAncillaryScenario({ schedule: 'contention' }) },
    { label: `一条控制消息管 ${VALIDITY} 轮：辅助信息另有一轮`, scenario: () => uwbAncillaryWindowScenario() },
    { label: '关闭辅助信息交换', scenario: () => uwbAncillaryOffScenario() },
  ],
  jumps: [
    J(`第一帧辅助信息：${BYTES.frame} 字节，剩余帧数 ${FRAMES - 1}`, firstFragment),
    J('剩余帧数为 0 的那一帧：这条消息的最后一帧', lastFragment),
    J('第一条测距记录', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一条辅助消息分成几帧，按标准由什么决定？',
      options: [
        '由标准固定：每一条辅助消息都分成同样多的帧',
        '由上层决定，标准没有给出取值；本仿真器没有上层，帧数是场景给定的值',
        '由控制消息里的有效轮数算出，一轮一帧',
      ],
      answer: 1,
      explain: '§10.35.1 说上层可以用 RAICT 的字段把一条信息分装在多条消息里发送，没有规定分几帧。本课的帧数是场景给定的值（②）。',
    },
    {
      q: '为什么一台在测距里只负责作答的设备，在这里却是发送消息的一端？',
      options: [
        '因为辅助信息附带在测距的应答帧中发送',
        '因为 §10.35.1 按收发方向定义发起方与响应方，与测距角色无关；本仿真器让测距中的第一个应答方发送消息',
        '因为标准规定辅助信息总是从锚点发往标签',
      ],
      answer: 1,
      explain: `发送辅助信息的一端是发起方，接收的一端是响应方。由哪台设备发送，标准没有规定，本仿真器选了 ${SENDER_ID}。`,
    },
    {
      q: '只带消息编号与只带剩余帧数的两帧一样长。接收端怎样知道带的是哪一个？',
      options: [
        '看控制字节里的两个存在位',
        '看控制字节里消息编号的存在位：置 1 就是带编号；剩余帧数没有存在位，它带不带要从信息单元的长度看出',
        '看帧里的消息类型字段',
      ],
      answer: 1,
      explain: '图 10-271 的控制字节只有 Request 与消息编号存在两位，也没有消息类型字段。',
    },
  ],
}
