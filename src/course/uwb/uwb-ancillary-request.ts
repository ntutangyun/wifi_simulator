/**
 * UWB Tier 5 · M22 测距辅助信息 · The schedule can be asked to change.
 *
 * IEEE Std 802.15.4-2024 §10.35.1's last sentence and §10.35.2.1's Request field, which is
 * `docs/superpowers/specs/2026-10-05-ancillary-request-design.md`. The Request = 0 half is
 * `uwb-ancillary`, and this lesson is the other half of the same clause and the same module — the
 * split is the design's §8: that lesson's raw figure was already 31.12 minutes, past the length
 * (`SITTING_MINUTES`, a soft guideline past which a lesson is marked long rather than refused) that
 * one sitting is meant to hold, so this material got its own lesson.
 *
 * **The one sentence this lesson exists for is that a device can change the schedule.** Every other
 * lesson of this tier teaches a grid that is settled before the session starts: `roundPlan` is
 * called once, in `UwbNetwork`'s constructor, and both file headers used to say so in their first
 * paragraph. Here a ranging *responder* asks the controller for the next exchange's slots, and from
 * the next block the message really is that long. Measured on this lesson's own scene: block 0's
 * Frames Remaining counts 1, 0 and every block after it counts 5, 4, 3, 2, 1, 0.
 *
 * **Why that is the right thing to measure, and the trap it was built to avoid.** A grant that only
 * widened the *window* would buy empty slots — the schedule would get longer and not one octet more
 * would go on the air, which is `docs/inert-config-contract.md`'s own failure shape. So the granted
 * slot count **is** the next message's frame count, and the reader sees it as the first number of
 * the next block's countdown rather than as a slot total they have to trust.
 *
 * **The clause defines no grant, no refusal and no response at all**, so the controller's policy is
 * `model` and the lesson says so twice: in the prose and in its own `limits`. The policy invents no
 * constant — it is the block-fit arithmetic the engine and the scenario schema already each do
 * (`uwb/session.ts#ancillaryGrantFits`), which in this hall grants up to 94 and in the wide-slot
 * variant grants up to 4. And a refusal has **no frame**: both ends read one slot table, so the
 * asker learns the answer from the width of the window it is given. That is a property of this
 * engine rather than of the clause, and the lesson is explicit about which.
 *
 * The scenes. The same 22 × 8 m hall as `uwb-ancillary`, four anchors and one tag, SS-TWR with the
 * reply time on the Response. Four runs differing only in session switches: the base (a two-frame
 * first message asking for `REQUEST` slots), a contention-scheduled run (where the window width
 * provably does not move while the message length does), a wide-slot run whose block cannot hold
 * the same request and therefore refuses it, and one with the request off.
 *
 * Every number is computed, never typed: `raictIeBytes`, `uwbAncillaryBytes`, `uwbPpduNs`,
 * `roundPlan`, `ancillarySlots`, `blockSlots` and `ancillaryGrantFits` are called, and
 * tests/course/uwb-ancillary-request.test.ts re-measures each figure against whole blocks.
 */
import type { Scenario, UwbSessionCfg } from '../../model/scenario'
import {
  J, anchor, firstUwbRange, rangingLab, txOf, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'
import type { TLRecord } from '../../model/records'
import { raictIeBytes, uwbAncillaryBytes, uwbPpduNs } from '../../uwb/phy'
import { ancillaryGrantFits, ancillarySlots, blockSlots, roundPlan } from '../../uwb/session'

/** Anchors of every scene here, and the tag — the same hall `uwb-ancillary` uses, so a reader
 * arriving from it is looking at the same floor plan with one switch added. */
export const ANCHORS = 4
/** Frames the **first** message is segmented across. Two, deliberately the shortest countdown that
 * still counts: the whole point is that the next message is longer, and a first message as long as
 * the grant would hide the change. */
export const FIRST_FRAMES = 2
/** Slots the request asks for. Six: three times the first message, well inside what this block
 * holds (`GRANT_CAP`), and far enough from `FIRST_FRAMES` that the countdown's first number cannot
 * be mistaken for the one before it. model — the scenario states it, for want of an upper layer. */
export const REQUEST = 6
/** The wide-slot variant's ranging slot, in RSTU: ten times the session default, so the same 200 ms
 * block holds ten slots instead of a hundred and the same request no longer fits. The block is left
 * alone on purpose — one number moves, and it is the one the capacity is divided by. */
export const WIDE_SLOT_RSTU = 24_000

/** Where the anchors stand, in metres — `uwb-ancillary`'s own places, so the two lessons' scenes
 * differ in session switches alone. */
export const PLACES: readonly { x: number; y: number }[] = [
  { x: 1, y: 1 }, { x: 21, y: 1 }, { x: 21, y: 7 }, { x: 11, y: 7 },
]
/** Where the tag stands. In ranging it opens every round; in this exchange it is the receiver, and
 * therefore the controller that answers the request. */
export const TAG = { x: 7, y: 3 } as const

/** Anchor i's id. Ids decide the slot order, so `anc-1` is the first responder — and therefore, by
 * `ANCILLARY_SENDER_INDEX`, the device that sends the message and asks for the slots. */
export const idOf = (i: number): string => `anc-${i + 1}`
/** The tag's id. */
export const TAG_ID = 'uwb-1'
/** The device that asks: responder 0. It is not the controller, which is exactly the condition
 * §10.35.1 attaches to the Request bit. */
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

/** The same hall with the request off: the run every «nothing asked, nothing changed» claim is
 * measured against. The exchange itself is still on — what this lesson adds is the request. */
export function uwbAncillaryRequestOffScenario(): Scenario {
  return scene({})
}

/** The sessions the scenes run, read back off the scenarios rather than restated. */
const SESSIONS = {
  base: uwbAncillaryRequestScenario().uwb!,
  contend: uwbAncillaryRequestScenario({ schedule: 'contention' }).uwb!,
  wide: uwbAncillaryRequestScenario({ slotRstu: WIDE_SLOT_RSTU }).uwb!,
  off: uwbAncillaryRequestOffScenario().uwb!,
} as const

/** The round plans both ends read their slot tables from. */
const PLANS = {
  base: roundPlan(SESSIONS.base, ANCHORS),
  contend: roundPlan(SESSIONS.contend, ANCHORS),
  wide: roundPlan(SESSIONS.wide, ANCHORS),
  off: roundPlan(SESSIONS.off, ANCHORS),
} as const

/**
 * The slot arithmetic of each scene, asked of the engine rather than counted off the device list.
 *
 * `windowGranted` is the width the same plan lays out once `REQUEST` has been granted — the one
 * number in this lesson that a `roundPlan` built from the session alone cannot answer, which is why
 * it is asked with the granted width as an argument.
 */
export const SLOTS = {
  ranging: PLANS.base.slots,
  window: ancillarySlots(PLANS.base),
  windowGranted: ancillarySlots(PLANS.base, REQUEST),
  block: blockSlots(PLANS.base, 0),
  blockGranted: blockSlots(PLANS.base, 1, REQUEST),
  /** The window with no request at all: the message's own frames and nothing else. */
  off: ancillarySlots(PLANS.off),
  contendRanging: PLANS.contend.slots,
  contendWindow: ancillarySlots(PLANS.contend),
  contendWindowGranted: ancillarySlots(PLANS.contend, REQUEST),
} as const

/** How many ranging slots a block holds, per scene — the divisor the controller's answer comes out
 * of, and the only thing the wide-slot variant changes. */
const perBlock = (p: typeof PLANS.base): number => Math.floor(p.blockNs / p.slotNs)

/**
 * The largest request each hall grants, walked rather than subtracted: `ancillaryGrantFits` is
 * asked about every width from 1 upwards and the last `true` is the answer.
 *
 * Walked because the closed form is a subtraction that is easy to get wrong by one — the request's
 * own slot is in it — and because what the lesson claims is 「this width is granted and that one is
 * not」, which is the predicate's own answer rather than a rearrangement of it.
 */
const grantCap = (p: typeof PLANS.base): number => {
  let last = 0
  for (let w = 1; w <= perBlock(p); w++) if (ancillaryGrantFits(p, w)) last = w
  return last
}

/** What each hall holds, and what it therefore grants. */
export const CAPS = {
  perBlock: perBlock(PLANS.base),
  grant: grantCap(PLANS.base),
  widePerBlock: perBlock(PLANS.wide),
  wideGrant: grantCap(PLANS.wide),
} as const

/** Every length the lesson prints, in octets, and the airtime of the request's own frame. */
export const BYTES = {
  request: uwbAncillaryBytes(false, true),
  fragment: uwbAncillaryBytes(true, true),
  requestIe: raictIeBytes(false, true),
  fragmentIe: raictIeBytes(true, true),
} as const

/** Milliseconds: the slot and the block of each hall, read off the plans the engine lays out. */
export const MS = {
  slot: PLANS.base.slotNs / 1e6,
  block: PLANS.base.blockNs / 1e6,
  wideSlot: PLANS.wide.slotNs / 1e6,
  requestFrame: uwbPpduNs(uwbAncillaryBytes(false, true)) / 1e6,
} as const

/** Milliseconds, two decimals: how every instant in this lesson is printed. */
export const ms = (n: number): string => n.toFixed(2)

/** The frame that asks: the one ancillary frame of block 0 whose Request bit is set. */
const requestFrame = txOf((r) => r.frame.kind === 'uwbAncillary' && r.frame.uwb?.raict?.request === true)
/** The record the controller writes when it grants: the request, and the width it will schedule. */
const grantRecord = (r: TLRecord): boolean =>
  r.type === 'UWB_ANCILLARY' && r.grantedSlots !== undefined && r.grantedSlots !== null
/** The first frame of the **granted** message: block 1, counting down from `REQUEST − 1`. */
const grantedFirstFrame = txOf((r) => r.frame.kind === 'uwbAncillary'
  && r.frame.uwb?.raict?.framesRemaining === REQUEST - 1)

export const uwbAncillaryRequest: Lesson = {
  id: 'uwb-ancillary-request',
  module: 24,
  title: '设备请求时隙，控制器是否批准',
  why: '上一课的时隙表是在会话开始前一次性确定的：一轮几个时隙、一块几轮，确定之后在整个会话中保持不变。这一课是同一节标准的另一半：一台设备可以请求修改这张表。办法就在上一课那个信息单元里：把它的第一位置 1，同一个「还剩几帧」的字段承载的就不再是剩余帧数，而是「请为下一次交换安排这么多个测距时隙（ranging slot）」。一个字节容纳不下两个量，所以这个请求单独占用一帧，排在消息之后，不带消息编号，比一帧消息短一个字节。发出请求的是在测距（ranging）中只负责作答的一端，接收请求的是确定时隙表的标签（tag），所以「只有不是控制器的一端才能请求」这个条件在这里自然成立。标准只规定到这里：没有批复、没有拒绝，也没有任何应答。因此批准规则是本课自行选取的——这一块能容纳就批准，而可批准的最大宽度完全由块长、时隙长和轮长算出；时隙一加宽，同一个请求就被拒绝。批准带来的不只是更宽的窗口，而是下一次交换的消息确实变为相应的帧数，否则增加的时隙全是空的。拒绝时不发送任何帧，请求方同样知道结果：两端读取的是同一张时隙表，窗口宽度本身就是答复。竞争式排程下窗口宽度保持不变，消息仍然变长；测距结果在打开这个请求前后完全相同。',
  outcomes: [
    '说清同一个字段在两种用法下承载两个不同的量，以及为什么一帧不能同时承担两种用途',
    '说明批复究竟改变了什么：下一次交换的消息帧数，而不只是窗口宽度',
    '说清为什么「拒绝」在这里没有对应的帧，而请求方仍然知道结果',
    '指出这一课中哪些数是标准给定的、哪些是本仿真器设定的',
  ],
  needs: ['uwb-ancillary'],
  terms: [
    { term: 'Request', plain: '该信息单元控制字节中的第一位：置 0 是上一课的用法，置 1 是向控制器请求时隙' },
    { term: 'slot request', plain: '向控制器提出的请求：请为下一次交换安排这么多个时隙。标准只定义了这个请求本身' },
    { term: 'controller', plain: '确定时隙分配的一端；在这个交换中它是接收消息的一方，也是答复请求的一方' },
    { term: 'grant', plain: '控制器批准的宽度。标准中没有这个词的定义，本课把它规定为「这一块能否容纳」' },
  ],
  picture: [
    {
      heading: '同一个字段，两个不同的量',
      text: `上一课那个信息单元中有一位称为 Request。置 0 时，「还剩几帧」表示这条消息还有几帧未发送；置 1 时，同一个字段表示「请为下一次交换安排这么多个时隙」。标准把这两种用法并列为两种不同的用法，所以一帧不能同时承担这两种用途——那一个字节只能容纳一个量。于是这个请求单独占用一帧、单独占用一个时隙，排在这条消息各帧之后。请求的时隙数在本课中是直接给定的：真实设备中它取决于上层下一条消息的长度，而本课没有媒体访问控制（MAC）之上的那一层。本课的第一条消息是 ${FIRST_FRAMES} 帧，所以窗口是 ${SLOTS.window} 个测距时隙（ranging slot）：${FIRST_FRAMES} 个用于消息，1 个用于请求。`,
    },
    {
      kind: 'watch', jump: 0,
      heading: `窗口的最后一个时隙，${BYTES.request} 字节`,
      text: `载入仿真并播放。一个测距块（ranging block）中前 ${SLOTS.ranging} 个时隙仍是一轮常规测距（ranging）：第 0 个时隙是控制消息，后面 ${ANCHORS} 个时隙是每个锚点（anchor）各作答一次。再往后 ${SLOTS.window} 个时隙是这个交换的窗口。跳到请求帧，它位于窗口的最后一个时隙。点开它的信息单元那一列，与前面两帧比较：它不带消息编号——请求不属于任何一条消息——所以它比一帧消息短一个字节，${BYTES.request} 字节对 ${BYTES.fragment} 字节，${ms(MS.requestFrame)} ms 的空口时间（airtime）。`,
    },
    {
      heading: '它能发出请求，是因为它不是控制器',
      text: `上一课讲过，这一节中两个角色名的含义与测距相反：发送消息的一端在测距中恰恰是作答的一端。这一课中，这种角色反转第一次带来一项具体的权利。标准给 Request 这一位附加了一个条件——只有当发送消息的一端不是控制器时，这一位才有意义。本课的场景中这个条件始终成立：发送消息的是 ${ASKER_ID}，它在测距中是作答的一端；接收消息的是标签（tag），而标签正是确定时隙表的一端，也就是控制器。所以在本课中这一位始终有意义，无需另行判断。`,
    },
    {
      kind: 'steps', heading: '一次请求，从发出到生效',
      items: [
        `${ASKER_ID} 发完这条 ${FIRST_FRAMES} 帧的消息，然后在窗口的最后一个时隙再发送一帧：Request 置 1，字段中写入 ${REQUEST}。`,
        '标签在同一时隙收到这一帧。它读出这个数，按「这一块能否容纳」判定一次，并在本端记录批准的宽度。这一步不回送任何内容。',
        '这一块的其余部分照常进行。批准的宽度不改变这一块的时隙表，从下一块开始才生效，所以两端都来得及按新的宽度排列。',
        `下一块的时隙表按标签批准的宽度排列，批准了 ${REQUEST} 就按 ${REQUEST} 排列：窗口从 ${SLOTS.window} 个时隙变为 ${SLOTS.windowGranted} 个，一块从 ${SLOTS.block} 个时隙变为 ${SLOTS.blockGranted} 个。`,
        `${ASKER_ID} 在下一块发送的这条消息就是 ${REQUEST} 帧。它与标签读取的是同一张时隙表，所以无需收到任何答复就知道请求已获批准。`,
      ],
    },
    {
      heading: '批准带来的不是更宽的窗口，而是更长的消息',
      text: `这一点必须说准确，否则这个请求就没有意义。如果批复只是把窗口加宽，而消息仍然是 ${FIRST_FRAMES} 帧，那么增加的那几个时隙全是空的：排程变长了，空口上传送的数据却一个字节也没有增加。于是「这个请求带来了什么」的答案是「什么也没有」。所以本课的取法是：批准几个时隙，下一次交换的消息就是几帧。读者在时间线上能看到的就是倒数的第一个数——块 0 的消息从 ${FIRST_FRAMES - 1} 递减到 0，块 1 起从 ${REQUEST - 1} 递减到 0。`,
    },
    {
      heading: '拒绝没有对应的帧，而请求方同样知道结果',
      text: '标准既没有定义批复，也没有定义拒绝，更没有定义任何应答。所以本课不另加拒绝帧——那是标准中没有的语义。控制器拒绝时不采取任何动作：下一次交换仍然按会话原来的帧数排列。而请求方与控制器读取的是同一张时隙表，所以请求方从自己得到的窗口宽度，就知道请求未获批准。两端共用一张时隙表是本课的设定，而不是这一节规定的内容，两者要区分清楚。',
    },
  ],
  numbers: [
    {
      kind: 'table', heading: '两种帧，相差一个字节',
      head: ['帧类型', '是否带消息编号', '该字段承载的量', '信息单元', '整帧'],
      rows: [
        ['消息帧', '带', '这条消息还剩几帧', `${BYTES.fragmentIe} 字节`, `${BYTES.fragment} 字节`],
        ['请求帧', '不带', '请求的时隙数', `${BYTES.requestIe} 字节`, `${BYTES.request} 字节`],
      ],
    },
    {
      kind: 'table', heading: '倒数的第一个数，就是这个请求的全部效果',
      head: ['块', '消息帧数', '倒数', '窗口', '每块时隙数'],
      rows: [
        ['块 0', `${FIRST_FRAMES}`, `${FIRST_FRAMES - 1} → 0`, `${SLOTS.window} 个时隙`, `${SLOTS.block} 个时隙`],
        ['块 1 及以后', `${REQUEST}`, `${REQUEST - 1} → 0`, `${SLOTS.windowGranted} 个时隙`, `${SLOTS.blockGranted} 个时隙`],
      ],
    },
    {
      heading: '「能否容纳」是计算出来的，不是人为规定的',
      text: `控制器按这一块能否容纳来判定，这个判据是本课选取的，而它用到的量都是已有的：一块 ${MS.block} ms、一个时隙 ${MS.slot} ms，所以一块能容纳 ${CAPS.perBlock} 个时隙；测距那一轮占 ${SLOTS.ranging} 个，请求本身占 1 个，于是可批准的最大宽度是 ${CAPS.grant}。这里没有引入任何新数：它由块长、时隙长和轮长算出。把时隙加宽十倍（${MS.wideSlot} ms）而块长保持不变，同一块就只能容纳 ${CAPS.widePerBlock} 个时隙，可批准的最大宽度降至 ${CAPS.wideGrant}——于是同一个 ${REQUEST} 在这个大厅里被拒绝。`,
    },
    {
      kind: 'table', heading: '竞争式：窗口宽度不变，消息仍然变长',
      head: ['排程方式', '测距轮（ranging round）', '窗口', '消息'],
      rows: [
        ['排程式，批复前', `${SLOTS.ranging} 个时隙`, `${SLOTS.window} 个时隙`, `${FIRST_FRAMES} 帧`],
        ['排程式，批复后', `${SLOTS.ranging} 个时隙`, `${SLOTS.windowGranted} 个时隙`, `${REQUEST} 帧`],
        ['竞争式，批复前', `${SLOTS.contendRanging} 个时隙`, `${SLOTS.contendWindow} 个时隙`, `${FIRST_FRAMES} 帧`],
        ['竞争式，批复后', `${SLOTS.contendRanging} 个时隙`, `${SLOTS.contendWindowGranted} 个时隙`, `${REQUEST} 帧`],
      ],
    },
    {
      heading: '最后一行没有写错',
      text: `在竞争式排程下，窗口宽度在批复前后相同。原因见上一课：竞争式的窗口取「消息所需的时隙数」与「这一轮本身的竞争时隙数」中较大的一个，而本课的设置下后者是 ${SLOTS.contendWindow}，消息加上请求一共 ${REQUEST + 1} 个时隙，仍未超过它。所以窗口宽度不变——而消息确实从 ${FIRST_FRAMES} 帧变为 ${REQUEST} 帧。这就是「这个请求带来了什么」在竞争式下的准确答案：带来的是消息长度的变化，决定窗口宽度的是竞争时隙的预算，而不是这个请求。`,
    },
    {
      heading: '测距结果没有任何变化',
      text: '打开这个请求前后，测距结果完全相同——距离、块号、时刻，没有一个数值改变。原因与上一课相同：请求帧排在测距相位之后追加的窗口中，不插入轮中，也不带任何时间量，所以它不进入测距的任何算式。这一节带来的是「下一次为我多安排几个时隙」这项能力，而不是更准确的距离。',
    },
  ],
  deeper: [
    {
      heading: '轮的长度本来就随块变化',
      text: '让一个请求改变后续排程，听上去需要把整张时隙表重新排列，其实不必。前面的课中已经有两处使某些块比其他块长——收妥确认在窗口的最后一块为每一轮增加几个时隙，辅助信息消息在窗口的第一块为每一轮增加几个时隙，所以「这一块的轮有几个时隙」本来就是一个随块号变化的量。实测结果：一条控制消息覆盖四块时，同一个会话的块 0 与块 4 是九个时隙，块 1、2、3 是五个时隙。所以这个请求改变的不是轮中测距那一段的排布，而是追加部分的宽度——而上一块最后一帧与下一块开头之间有一百八十多毫秒的余量。',
    },
    {
      heading: '为什么不把请求附带在最后一帧上',
      text: '还有一种更节省的做法：不单独发送一帧，而是把请求附带在这条消息的最后一帧上，在同一帧中放两个信息单元。这样连空口时间都节省了。本课不采用这种做法，理由只有一条：标准正文没有说明一帧中可以放两个这样的信息单元。本课的原则是不添加标准没有给出的语义，即使添加之后更节省——于是这个请求单独占用一帧，代价列在上面那张表中。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 §10.35.1 的最后一句与 §10.35.2.1 一起给出这一半的全部语义：Request 这一位置 1 表示这个信息单元是在向控制器请求时隙，这时「还剩几帧」那个字段承载的是请求的时隙数，而这一位只有在发送消息的一端不是控制器时才有意义。本课完全不依赖任何草案。',
    '正文到此为止：批复、拒绝、应答都没有任何规定，所以「按这一块能否容纳来批准」是本仿真器的取值，而它只用块长、时隙长与轮长计算，没有引入任何新常数。请求的时隙数本身也是本仿真器的取值，理由与上一课的帧数相同：本仿真器没有任何媒体访问控制（MAC）原语，也就没有上层来计算下一条消息应有多长。',
    `字节宽度与空口时间沿用上一课的取值，时隙数与能批的最大宽度都由块长、时隙长与轮长算出。本课四个场景是同一个 22 × 8 m 大厅、同样 ${ANCHORS} 个锚点与一个标签、同样的种子，只有会话上的开关不同：基础场景、竞争式排程、时隙加宽到 ${MS.wideSlot} ms（于是同一个请求被拒绝），以及关闭这个请求功能。四个场景都关掉非视距。`,
  ],
  limits: [
    {
      kind: 'unmodelled',
      text: '请求几个时隙是场景配置，不是上层算出来的。这和上一课的帧数属于同一种情形：本仿真器没有任何媒体访问控制（MAC）原语，也没有上层来持有「下一次要发送这么长」的内容并算出它需要几个时隙，所以这个数直接是场景中给定的整数。后果是读者看不到「上层的内容变长，于是请求的时隙数也随之改变」这一因果关系，只能自己调大或调小这个数。',
    },
    {
      kind: 'model-value',
      text: '是否批准、按什么规则批准，都由本仿真器设定，因为标准正文只规定到请求为止。§10.35 通篇只定义这个请求本身：控制器收到之后做什么、能否不处理、是否要告知对方处理结果，都没有任何规定，所以一台丢弃请求的控制器也是合规的。本仿真器设定的是「这一块能容纳就批准」，而它只用块长、时隙长与轮长计算。后果是读者看不到其他策略——按优先级分配、按历史用量分配、批准一个比请求值小的数——而真实实现完全可以采用其中任何一种。',
    },
    {
      kind: 'model-value',
      text: '一轮只有一个请求方，一个会话也只有一个控制器。发消息的始终是第 0 个响应方（上一课那条限制已经说明），所以也只有它会发出请求；而两个标签就是两个控制器，批准的宽度却是每块一个数，于是本仿真器不接受两个标签与这个请求同时启用的配置。后果是读者看不到两台设备在同一个窗口中各发出一个请求、而控制器只能容纳其中一个的情形——那是这一节之外的后续工作。',
    },
  ],
  scenario: () => uwbAncillaryRequestScenario(),
  variants: [
    { label: `竞争式排程：窗口 ${SLOTS.contendWindow} 格不动，消息仍从 ${FIRST_FRAMES} 帧变成 ${REQUEST} 帧`, scenario: () => uwbAncillaryRequestScenario({ schedule: 'contention' }) },
    { label: `时隙加宽到 ${MS.wideSlot} ms：一块只装得下 ${CAPS.widePerBlock} 格，同一个请求被拒`, scenario: () => uwbAncillaryRequestScenario({ slotRstu: WIDE_SLOT_RSTU }) },
    { label: '关闭这一要求：每个块都采用会话自身的帧数', scenario: () => uwbAncillaryRequestOffScenario() },
  ],
  jumps: [
    J(`请求帧：${BYTES.request} 字节，Request 置 1`, requestFrame),
    J(`控制器批准的那条记录：${REQUEST} 个时隙`, grantRecord),
    J(`下一块的第一帧消息：倒数从 ${REQUEST - 1} 开始`, grantedFirstFrame),
    J('第一条测距记录', firstUwbRange),
  ],
  observe: [
    `块 0 的窗口是 ${SLOTS.window} 个时隙：前 ${FIRST_FRAMES} 个是消息帧，倒数为 ${FIRST_FRAMES - 1}、0，最后一个是请求帧。块 1 的窗口是 ${SLOTS.windowGranted} 个时隙，倒数从 ${REQUEST - 1} 开始。整块中没有发生一次超时——这个请求不等待任何答复。`,
    `请求帧的对端是标签，而批复记录位于标签一侧：其中记录请求了 ${REQUEST} 个时隙、批准了 ${REQUEST} 个时隙。再看块 1 的那一条：请求的数没有变，批准的数也没有变，所以每一块都重新请求一次同一个宽度。`,
  ],
  tryThis: [
    `载入「时隙加宽」变体，逐块查看倒数的第一个数：每一块都是 ${FIRST_FRAMES - 1}，没有一块变长。再看批复记录——请求了 ${REQUEST} 个时隙，批准一栏为空。这一块只能容纳 ${CAPS.widePerBlock} 个时隙，测距那一轮占 ${SLOTS.ranging} 个、请求占 1 个，所以可批准的最大宽度是 ${CAPS.wideGrant}。把请求改为 ${CAPS.wideGrant} 再运行一遍：这一次获得批准。`,
    `载入「竞争式排程」变体，先查看窗口：批复前后都是 ${SLOTS.contendWindow} 个时隙，没有变化。再查看消息：从 ${FIRST_FRAMES} 帧变为 ${REQUEST} 帧。最后载入「把这个要求关掉」变体：窗口恢复为 ${SLOTS.off} 个时隙，没有请求帧，每一块的倒数都从 ${FIRST_FRAMES - 1} 开始，而测距结果与基础场景逐字段相同。`,
  ],
  quiz: [
    {
      q: '为什么这个请求要单独占用一帧，而不能附带在消息的最后一帧上？',
      options: [
        '因为一帧的长度不足以再容纳一个字段',
        '因为那一个字段在两种用法下承载两个不同的量，标准把这两种用法并列，所以一帧只能承担其中一种用途',
        '因为控制器只在窗口的最后一个时隙才打开接收机',
      ],
      answer: 1,
      explain: `置 0 时它表示「这条消息还剩几帧」，置 1 时它表示「请安排这么多个时隙」。一个字节容纳不下两个量。至于「在同一帧中放两个这样的信息单元」——标准正文没有说明，所以本课不这样做，代价是多一帧 ${BYTES.request} 字节。`,
    },
    {
      q: '控制器批准之后，下一次交换有什么变化？',
      options: [
        '只有窗口变宽，消息仍是原来的帧数',
        '窗口变宽，消息也变为批准的帧数——倒数的第一个数随之改变',
        '没有任何变化，批复只是记录下来备查',
      ],
      answer: 1,
      explain: `如果只有窗口变宽，增加的时隙全是空的，这个请求就等于没有带来任何效果。所以本课把批准的时隙数规定为下一次交换的消息帧数：块 0 的倒数从 ${FIRST_FRAMES - 1} 开始，块 1 起从 ${REQUEST - 1} 开始。`,
    },
    {
      q: '控制器拒绝时，请求方如何得知？',
      options: [
        '控制器回送一帧拒绝消息，其中写明它能分配几个时隙',
        '请求方等不到批复即超时，并据此判定被拒绝',
        '它根据下一次交换的窗口宽度即可得知：两端读取的是同一张时隙表，而窗口仍然是会话原有的宽度',
      ],
      answer: 2,
      explain: '标准没有定义拒绝，也没有定义任何应答，所以本课不另加拒绝帧。而本课的设定使拒绝帧没有必要：两端读取的是同一张时隙表，所以窗口宽度本身就是答复。',
    },
  ],
}
