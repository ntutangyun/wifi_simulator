/**
 * UWB Tier 5 · M24 测距辅助信息 · The next exchange's slots can be asked for.
 *
 * IEEE Std 802.15.4-2024 §10.35.1's last sentence and §10.35.2.1's Request field. The Request = 0 half
 * is `uwb-ancillary`; this lesson is the other half of the same clause and the same module.
 *
 * **Standard-first shape (2026-11-10).** ① says what the clause specifies: with Request = 1 the
 * Frames Remaining field carries the number of slots the initiator asks the controller to schedule
 * for the next exchange, and only an initiator that is not the controller uses it; the clause defines
 * no grant, no refusal and no response at all. Slots are assigned by the RCM (RDM §10.32.9.8, RCPS
 * §10.32.9.5), and every round of a block is one length (§10.32.3.3). ② says what this engine does:
 * where the request rides and how long it is, whether and when it is granted (`ancillaryGrantFits`:
 * grant when the ancillary round holds the window), and that the grant travels in the next ancillary
 * round's RDM IE — the standard's own element. ③ is five runs.
 *
 * The scenes. The same 22 × 8 m hall as `uwb-ancillary`, four anchors and one tag, SS-TWR with the
 * reply time on the Response. Four runs differing only in session switches: the base (a two-frame
 * first message asking for `REQUEST` slots), a contention-scheduled run, a run that asks for one slot
 * more than the ancillary round holds and is therefore refused, and one with the request off.
 *
 * Every number is computed or read back by tests/course/uwb-ancillary-request.test.ts from a run.
 */
import type { Scenario, UwbSessionCfg } from '../../model/scenario'
import {
  J, anchor, firstUwbRange, rangingLab, txOf, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'
import type { TLRecord } from '../../model/records'
import { raictIeBytes, uwbAncillaryBytes, uwbAncillaryRcmBytes, uwbPpduNs } from '../../uwb/phy'
import { ancillaryGrantFits, ancillarySlots, roundPlan, roundsPerInitiator } from '../../uwb/session'

/** Anchors of every scene here — the same hall `uwb-ancillary` uses. */
export const ANCHORS = 4
/** Frames the **first** message is segmented across: the shortest countdown that still counts. */
export const FIRST_FRAMES = 2
/** Slots the request asks for: one more than the first message, and the most the ancillary round of
 * this hall holds beside the request frame (`CAPS.grant`). A scenario value, for want of an upper layer. */
export const REQUEST = 3

/** Where the anchors stand, in metres — `uwb-ancillary`'s own places. */
export const PLACES: readonly { x: number; y: number }[] = [
  { x: 1, y: 1 }, { x: 21, y: 1 }, { x: 21, y: 7 }, { x: 11, y: 7 },
]
/** Where the tag stands. In this exchange it is the receiver, and the controller that gets the request. */
export const TAG = { x: 7, y: 3 } as const

/** Anchor i's id. `anc-1` is the first responder — the device that sends the message and asks. */
export const idOf = (i: number): string => `anc-${i + 1}`
/** The tag's id. */
export const TAG_ID = 'uwb-1'
/** The device that asks: responder 0. It is not the controller — §10.35.1's condition. */
export const ASKER_ID = idOf(0)

const devices = () => [
  ...PLACES.map((p, i) => anchor(idOf(i), `A${i + 1}`, p.x, p.y)),
  uwbTag(TAG_ID, 'Tag', TAG.x, TAG.y),
]

const scene = (session: Partial<UwbSessionCfg>): Scenario =>
  uwbSc(rangingLab(), devices(), {
    method: 'ss', replyTime: 'embedded', nlos: false,
    ancillary: true, ancillaryFrames: FIRST_FRAMES,
    ...session,
  })

/** The base scene: the exchange on, a two-frame first message, and a request for `REQUEST` slots. */
export function uwbAncillaryRequestScenario(over: Partial<UwbSessionCfg> = {}): Scenario {
  return scene({ ancillaryRequest: true, ancillaryRequestSlots: REQUEST, ...over })
}

/** The same hall with the request off; the exchange itself is still on. */
export function uwbAncillaryRequestOffScenario(): Scenario {
  return scene({})
}

const SESSIONS = {
  base: uwbAncillaryRequestScenario().uwb!,
  contend: uwbAncillaryRequestScenario({ schedule: 'contention' }).uwb!,
  off: uwbAncillaryRequestOffScenario().uwb!,
} as const

const PLANS = {
  base: roundPlan(SESSIONS.base, ANCHORS),
  contend: roundPlan(SESSIONS.contend, ANCHORS),
  off: roundPlan(SESSIONS.off, ANCHORS),
} as const

/**
 * The slot arithmetic of each scene. `round` is every round's one length (standard §10.32.3.3) and
 * does not move with a grant; `window` is the slots the ancillary round's RCM assigns the sender (its
 * message and its request frame), `windowGranted` the same once `REQUEST` has been granted.
 */
export const SLOTS = {
  ranging: PLANS.base.rangingSlots,
  round: PLANS.base.slots,
  window: ancillarySlots(PLANS.base),
  windowGranted: ancillarySlots(PLANS.base, REQUEST),
  used: roundsPerInitiator(PLANS.base) * PLANS.base.slots,
  off: ancillarySlots(PLANS.off),
  contendRanging: PLANS.contend.rangingSlots,
  contendRound: PLANS.contend.slots,
  contendWindow: ancillarySlots(PLANS.contend),
  contendWindowGranted: ancillarySlots(PLANS.contend, REQUEST),
} as const

/** The largest request each hall grants, walked out of `ancillaryGrantFits`. */
const grantCap = (p: typeof PLANS.base): number => {
  let last = 0
  for (let w = 1; w <= p.slots; w++) if (ancillaryGrantFits(p, w)) last = w
  return last
}

/** What the ancillary round holds, and what it therefore grants. */
export const CAPS = {
  grant: grantCap(PLANS.base),
  contendGrant: grantCap(PLANS.contend),
} as const

/** The request of the refusal variant: one slot more than the ancillary round holds. */
export const OVER_REQUEST = CAPS.grant + 1

/** Every length the lesson prints, in octets. */
export const BYTES = {
  request: uwbAncillaryBytes(false, true),
  fragment: uwbAncillaryBytes(true, true),
  requestIe: raictIeBytes(false, true),
  fragmentIe: raictIeBytes(true, true),
  /** The ancillary round's RCM before and after the grant: its RDM IE lists one element per slot. */
  rcm: uwbAncillaryRcmBytes('time', SLOTS.window),
  rcmGranted: uwbAncillaryRcmBytes('time', SLOTS.windowGranted),
  rcmOff: uwbAncillaryRcmBytes('time', SLOTS.off),
} as const

/** Milliseconds: the slot and the block, and the airtime of the request frame. */
export const MS = {
  slot: PLANS.base.slotNs / 1e6,
  block: PLANS.base.blockNs / 1e6,
  requestFrame: uwbPpduNs(uwbAncillaryBytes(false, true)) / 1e6,
} as const

/** Milliseconds, two decimals. */
export const ms = (n: number): string => n.toFixed(2)

const requestFrame = txOf((r) => r.frame.kind === 'uwbAncillary' && r.frame.uwb?.raict?.request === true)
const grantRecord = (r: TLRecord): boolean =>
  r.type === 'UWB_ANCILLARY' && r.grantedSlots !== undefined && r.grantedSlots !== null
const grantedFirstFrame = txOf((r) => r.frame.kind === 'uwbAncillary'
  && r.frame.uwb?.raict?.framesRemaining === REQUEST - 1)

/** A countdown from n − 1 to 0, as the table prints it. */
const down = (n: number): string => `${n - 1} → 0`

export const uwbAncillaryRequest: Lesson = {
  id: 'uwb-ancillary-request',
  module: 24,
  title: '设备请求时隙，控制器是否批准',
  why: `IEEE 802.15.4-2024 §10.35 规定：发送辅助信息的发起方不是控制器时，可以把 RAICT 信息单元的 Request 位置 1，这时剩余帧数字段承载的不再是「还剩几帧」，而是「请为下一次交换安排这么多个测距时隙（ranging slot）」。一个字段只能承载一个量，所以一个信息单元只能承担其中一种用途。标准只定义了这个请求本身：没有批复、没有拒绝，也没有任何应答；时隙仍由控制器的控制消息分配，按时间调度时用 RDM 信息单元逐个指定。本仿真器让请求单独占用一帧，排在消息之后、不带消息编号，比一帧消息短一个字节；辅助信息轮放得下就批准，块式结构中各轮一样长，所以可批准的最大宽度由轮长算出，本课为 ${CAPS.grant}；批准从下一块生效，由下一块辅助信息轮控制消息里的 RDM 信息单元多指定时隙，发送方按它收到的控制消息发送，消息随之变长。拒绝时不发送任何帧，下一条控制消息仍按原来的数目指定时隙。测距结果在打开这个请求前后完全相同。`,
  outcomes: [
    '说出标准对 Request 位规定了什么：同一个字段在两种用法下承载两个不同的量，以及谁可以发出请求',
    '说出标准没有规定什么：批复、拒绝与应答，以及本仿真器在这些地方的取法',
    '在日志里找到请求帧、批准记录，以及下一块里变长的消息与变长的控制消息',
  ],
  needs: ['uwb-ancillary'],
  terms: [
    { term: 'Request', plain: '该信息单元控制字节中的第一位：置 0 是上一课的用法，置 1 是向控制器请求时隙' },
    { term: 'slot request', plain: '向控制器提出的请求：请为下一次交换安排这么多个时隙。这是本课的叫法，标准里它就是 Request 位置 1 的那个信息单元；标准只定义了这个请求本身' },
    { term: 'controller', plain: '分配时隙的一端；在本课的场景里它是接收消息的一方，也是处理请求的一方（标准没有规定它如何答复）' },
    { term: 'grant', plain: '控制器批准的宽度。标准中没有这个词的定义，本课把它规定为「辅助信息轮能否放下」' },
  ],
  standard: [
    { heading: '谁可以请求（§10.35.1）', text: '发起方（发送辅助信息的一端）不是控制器时，可以用 RAICT 信息单元的 Request 字段请求控制器：为下一次交换安排剩余帧数字段给出的那么多个时隙。' },
    { heading: '同一个字段，两个量（§10.35.2.1）', text: 'Request 置 1 表示这个 RAICT 信息单元用于向控制器请求时隙，否则置 0。剩余帧数字段在 Request 置 0 时给出完成当前这条消息还剩几帧，在 Request 置 1 时给出请求控制器为下一次交换安排的时隙数。标准把这两种用法分开列出：置 0 时报告消息的进度，置 1 时请求时隙。' },
    { heading: '只定义了请求本身（§10.35）', text: '这一节没有定义控制器收到请求之后怎样处理：没有批复、没有拒绝，也没有任何应答帧。请求帧放在哪个时隙、带不带消息编号，标准也没有规定。' },
    { heading: '时隙由控制消息分配（§10.32.9.8，§10.32.9.5，§10.32.3.3）', text: '控制器用控制消息里的 RDM 信息单元分配时隙：SIU 字段置 1 时，每个列表元素给一台设备指定一个时隙；设备收到控制消息就知道自己有没有被选中参加这几轮。基于竞争时，RCPS（ranging contention phase structure IE）信息单元给出竞争阶段（contention phase）的起止时隙。块式结构中各轮一样长。' },
    { kind: 'steps', heading: '一次请求，按标准：逐步说明', items: [
      '发起方在发送辅助信息时，发出一个 Request 置 1 的 RAICT 信息单元，剩余帧数字段写入它请求的时隙数（§10.35.2.1）。',
      '控制器收到这个请求。它是否满足、何时满足，标准没有规定，也没有规定任何应答。',
      '下一次交换的时隙仍由控制器的控制消息分配：按时间调度时由 RDM 信息单元逐个指定，基于竞争时由 RCPS 信息单元给出竞争阶段（§10.32.9.8、§10.32.9.5）。',
      '发起方从收到的控制消息得知自己被安排了哪些时隙。',
    ] },
  ],
  implementation: [
    { topic: '请求的编码', standard: 'Request 置 1，剩余帧数字段是请求的时隙数（§10.35.2.1）', sim: `照此编码：请求帧的 RAICT 信息单元 Request 置 1，剩余帧数字段写 ${REQUEST}。`, kind: 'faithful' },
    { topic: '谁发出请求', standard: '发起方不是控制器时（§10.35.1）', sim: `发出请求的是发送辅助信息的 ${ASKER_ID}；分配时隙的是标签（tag）${TAG_ID}，它也是接收方。条件成立。`, kind: 'faithful' },
    { topic: '请求帧的位置与长度', standard: '标准未规定', sim: `请求单独占用一帧，排在消息各帧之后，位于指定给发送方的最后一个时隙；不带消息编号，信息单元 ${BYTES.requestIe} 字节，整帧 ${BYTES.request} 字节，比一帧消息（${BYTES.fragment} 字节）短一个字节。不把请求附带在消息的最后一帧上。`, kind: 'choice' },
    { topic: '请求几个时隙', standard: '由发起方的上层决定，标准未给出取值', sim: `本仿真器没有上层，请求的数是场景给定的值，本课为 ${REQUEST}，每一块都重新请求一次。`, kind: 'value' },
    { topic: '是否批准', standard: '标准未规定', sim: `辅助信息轮放得下就批准：每一轮 ${SLOTS.round} 个时隙，第 0 个是控制消息，请求帧占 1 个，所以最多批准 ${CAPS.grant} 个；请求 ${OVER_REQUEST} 个就不批准。轮长不因请求而改变。`, kind: 'choice' },
    { topic: '批准何时生效', standard: '标准未规定', sim: '从下一块的辅助信息轮开始。', kind: 'choice' },
    { topic: '批准怎样传达', standard: '时隙由控制消息的 RDM 信息单元指定（§10.32.9.8）', sim: `下一块辅助信息轮的控制消息里，RDM 给发送方指定 ${SLOTS.windowGranted} 个时隙（批准的 ${REQUEST} 个用于消息，再加 1 个给下一次的请求帧），而不是 ${SLOTS.window} 个；控制消息从 ${BYTES.rcm} 字节变为 ${BYTES.rcmGranted} 字节。不另发任何批复帧。`, kind: 'faithful' },
    { topic: '消息长度', standard: '标准未规定', sim: `发送方按收到的控制消息发送：指定的时隙减去请求帧的 1 个，就是这一次消息的帧数。所以批准之后消息从 ${FIRST_FRAMES} 帧变为 ${REQUEST} 帧。`, kind: 'choice' },
    { topic: '拒绝', standard: '标准没有定义拒绝，也没有定义应答', sim: '不发送任何帧；下一条控制消息仍按会话原来的数目指定时隙，请求方从中即可得知结果。', kind: 'choice' },
    { topic: '竞争式的阶段宽度', standard: 'RCPS 给出起止时隙（§10.32.9.5），宽度标准未规定', sim: `阶段宽度取所需时隙数与会话竞争时隙数中较大的一个，本课批准前后都是 ${SLOTS.contendWindow} 个时隙；发送方看到阶段放得下，就发送批准的帧数。`, kind: 'choice' },
    { topic: '请求方的数目', standard: '标准未限定', sim: '只有第一个测距应答方发送辅助信息，所以一轮只有一个请求方；编辑器不接受两个标签同时启用请求的配置。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '请求帧：Request 置 1',
      jump: 0,
      steps: [
        '载入本课场景并播放，跳到请求帧。',
        '点开它与前面两帧的信息单元列，比较 Request 位、消息编号与剩余帧数。',
      ],
      blocks: [
        { kind: 'table', heading: '块 0 的辅助信息轮', head: ['时隙', '发送方', '帧', '字节', 'RAICT 的内容'], rows: [
          ['0', TAG_ID, '控制消息：ARC、RR、RDM', String(BYTES.rcm), '—'],
          ...Array.from({ length: FIRST_FRAMES }, (_v, i) => [String(1 + i), ASKER_ID, '消息帧', String(BYTES.fragment), `Request 0，消息编号 0，剩余帧数 ${FIRST_FRAMES - 1 - i}`]),
          [String(1 + FIRST_FRAMES), ASKER_ID, '请求帧', String(BYTES.request), `Request 1，剩余帧数 ${REQUEST}`],
        ] },
      ],
      expect: `控制消息给 ${ASKER_ID} 指定 ${SLOTS.window} 个时隙：前 ${FIRST_FRAMES} 个是消息帧，剩余帧数为 ${down(FIRST_FRAMES).replace(' → ', '、')}；最后一个是请求帧，${BYTES.request} 字节，空口时间（airtime）${ms(MS.requestFrame)} ms，不带消息编号，剩余帧数字段写 ${REQUEST}。整块没有一次超时。`,
      meaning: 'Request 置 1 时同一个字段承载请求的时隙数，照标准（①）；请求单独成帧、放在最后、不带编号，是本仿真器的取法（②）。',
    },
    {
      heading: '批准之后，下一块的消息变长',
      jump: 2,
      steps: [
        '找到标签一侧的批准记录：请求的时隙数与批准的时隙数。',
        '跳到下一块的第一帧消息，再看那一块辅助信息轮的控制消息。',
      ],
      blocks: [
        { kind: 'table', heading: '请求的全部效果', head: ['块', 'RDM 指定的时隙', '控制消息', '消息帧数', '剩余帧数'], rows: [
          ['块 0', `${SLOTS.window} 个`, `${BYTES.rcm} 字节`, String(FIRST_FRAMES), down(FIRST_FRAMES)],
          ['块 1 及以后', `${SLOTS.windowGranted} 个`, `${BYTES.rcmGranted} 字节`, String(REQUEST), down(REQUEST)],
        ] },
      ],
      expect: `块 0 的批准记录写着请求 ${REQUEST} 个、批准 ${REQUEST} 个；从块 1 起，控制消息的 RDM 指定 ${SLOTS.windowGranted} 个时隙，控制消息长 ${BYTES.rcmGranted} 字节，消息变为 ${REQUEST} 帧。每一轮仍是 ${SLOTS.round} 个时隙。`,
      meaning: '批准用标准的 RDM 信息单元传达（①），没有另加批复帧；批不批、何时生效、消息随之变长，是本仿真器的取法（②）。',
    },
    {
      heading: '请求超过轮长：不批准',
      variant: 1,
      steps: [
        `载入「请求 ${OVER_REQUEST} 个时隙」变体，查看每一块的批准记录与控制消息。`,
      ],
      expect: `每一块都请求 ${OVER_REQUEST} 个，批准一栏为空；每一块的控制消息都是 ${BYTES.rcm} 字节、指定 ${SLOTS.window} 个时隙，消息始终是 ${FIRST_FRAMES} 帧。没有任何拒绝帧。`,
      meaning: `标准没有定义拒绝（①）；本仿真器按轮长判定，每一轮 ${SLOTS.round} 个时隙放不下 ${OVER_REQUEST} 帧消息加控制消息与请求帧，于是不批准，请求方从下一条控制消息得知结果（②）。`,
    },
    {
      heading: '竞争式：阶段宽度不变，消息仍然变长',
      variant: 0,
      steps: [
        '载入「竞争式」变体，比较块 0 与块 1 辅助信息轮控制消息里的 RCPS。',
        '再比较两块的消息帧数。',
      ],
      expect: `每一轮 ${SLOTS.contendRound} 个时隙；两块的 RCPS 都给出第 1 到第 ${SLOTS.contendWindow} 个时隙的发起方竞争阶段，控制消息都是 ${uwbAncillaryRcmBytes('contention', SLOTS.contendWindow)} 字节；消息从块 0 的 ${FIRST_FRAMES} 帧变为块 1 的 ${REQUEST} 帧。`,
      meaning: '阶段宽度由会话的竞争时隙数决定，而不是由这个请求决定，这是本仿真器的取法（②）；请求带来的是消息长度的变化。',
    },
    {
      heading: '关闭请求，测距结果不变',
      more: [2],
      steps: [
        '依次载入本课场景与「关闭这个请求」，比较两次运行的测距记录与辅助信息轮。',
      ],
      expect: `关闭请求后，控制消息只指定 ${SLOTS.off} 个时隙（${BYTES.rcmOff} 字节），没有请求帧，每一块的消息都是 ${FIRST_FRAMES} 帧；两次运行的测距记录逐条相同。`,
      meaning: '请求帧在单独的辅助信息轮里，不带时间量，不进入测距的算式（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.35.1 的最后一句（发起方不是控制器时可以请求时隙）、§10.35.2.1 与图 10-271（Request 字段；剩余帧数字段在 Request 置 1 时是请求的时隙数）、§10.32.9.8（RDM 信息单元，SIU 置 1 时每个列表元素指定一个时隙）、§10.32.9.5（RCPS 信息单元）、§10.32.3.3（块式结构，各轮一样长）。标准没有定义批复、拒绝或应答。本课不依赖任何草案。',
    `本仿真器的取值与取法：请求单独成帧、排在消息之后、不带消息编号；请求 ${REQUEST} 个时隙（场景给定）；辅助信息轮放得下就批准、从下一块生效；批准的数目加 1 个请求帧写进下一条控制消息的 RDM；竞争式阶段宽度取所需时隙数与竞争时隙数中较大的一个。四个场景是同一个 22 × 8 m 大厅、${ANCHORS} 个锚点（anchor）与一个标签（tag）、同样的种子，只有会话开关不同，都关闭非视距。`,
  ],
  limits: [],
  scenario: () => uwbAncillaryRequestScenario(),
  variants: [
    { label: `竞争式：竞争阶段 ${SLOTS.contendWindow} 格不动，消息仍变成 ${REQUEST} 帧`, scenario: () => uwbAncillaryRequestScenario({ schedule: 'contention' }) },
    { label: `请求 ${OVER_REQUEST} 个时隙：放不下，被拒`, scenario: () => uwbAncillaryRequestScenario({ ancillaryRequestSlots: OVER_REQUEST }) },
    { label: '关闭这个请求：每个块都采用会话自身的帧数', scenario: () => uwbAncillaryRequestOffScenario() },
  ],
  jumps: [
    J(`请求帧：${BYTES.request} 字节，Request 置 1`, requestFrame),
    J(`控制器批准的那条记录：${REQUEST} 个时隙`, grantRecord),
    J(`下一块的第一帧消息：倒数从 ${REQUEST - 1} 开始`, grantedFirstFrame),
    J('第一条测距记录', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '为什么一个 RAICT 信息单元不能同时报告消息进度又请求时隙？',
      options: [
        '因为一帧放不下更多字节',
        '因为剩余帧数这一个字段在 Request 置 0 时是还剩几帧，置 1 时是请求的时隙数，一个字段只能承载一个量',
        '因为控制器只在最后一个时隙接收',
      ],
      answer: 1,
      explain: `§10.35.2.1 把两种用法分开列出。本仿真器让请求单独占用一帧（${BYTES.request} 字节），这是它的取法。`,
    },
    {
      q: '按标准，控制器收到请求后必须做什么？',
      options: [
        '回送一帧批复，写明批准的时隙数',
        '标准没有规定：没有批复、没有拒绝，也没有任何应答；下一次交换的时隙仍由控制消息分配',
        '在下一块里把每一轮加长',
      ],
      answer: 1,
      explain: `批不批是本仿真器的取法（辅助信息轮放得下就批准）；批准的结果写在下一条控制消息的 RDM 信息单元里，控制消息从 ${BYTES.rcm} 字节变为 ${BYTES.rcmGranted} 字节。`,
    },
    {
      q: '本课里控制器拒绝时，请求方怎样得知？',
      options: [
        '控制器回送一帧拒绝消息',
        '请求方等不到批复而超时',
        '从下一次辅助信息轮的控制消息得知：RDM 指定给它的时隙仍是原来的数目',
      ],
      answer: 2,
      explain: '标准没有定义拒绝，本仿真器也不另加拒绝帧；分配时隙本来就由控制消息完成。',
    },
  ],
}
