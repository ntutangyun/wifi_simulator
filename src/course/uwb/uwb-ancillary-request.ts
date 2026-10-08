/**
 * UWB Tier 5 · M22 测距辅助信息 · The schedule can be asked to change.
 *
 * IEEE Std 802.15.4-2024 §10.35.1's last sentence and §10.35.2.1's Request field, which is
 * `docs/superpowers/specs/2026-10-05-ancillary-request-design.md`. The Request = 0 half is
 * `uwb-ancillary`, and this lesson is the other half of the same clause and the same module — the
 * split is the design's §8, measured rather than argued: that lesson's raw figure is 31.12 minutes
 * against a 30-minute ceiling, so it had 303 main-path characters of room and this material does not
 * fit in 303 characters.
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
  module: 23,
  title: '一台设备要求，控制器答不答应',
  why: '上一课的时隙表是在会话开场前一次算定的：一轮几个时隙、一块几轮，算一次，整场不动。这一课是同一节标准的另一半，而它要讲的事只有一件——这张表可以被一台设备要求改掉。办法就在上一课那枚信息单元里：把它的第一位置 1，同一个「还剩几帧」的字段装的就不再是剩余帧数，而是「请为下一次交换排这么多个测距时隙（ranging slot）」。提出要求的是在测距（ranging）里只负责作答的那一端，而答复它的是开场的那一端。标准到这里就停了：它定义了这个要求，没有定义批复、没有定义拒绝，也没有定义任何一条回话。所以「批不批」是本仿真器自己定的，而「怎么知道批没批」在本引擎里反倒是现成的。',
  outcomes: [
    '说清同一个字段在两种用法下装的是两个不同的量，以及为什么一帧不能同时做两件事',
    '说出批复到底改了什么：下一次交换的消息有几帧，而不只是窗口有多宽',
    '说清为什么「拒绝」在这里没有帧，而请求方仍然知道答案',
    '指出这一课里哪些数是标准给的、哪些是本仿真器定的',
  ],
  needs: ['uwb-ancillary'],
  terms: [
    { term: 'Request', plain: '那枚信息单元控制字节里的第一位：置 0 是上一课，置 1 是向控制器要时隙' },
    { term: 'slot request', plain: '向控制器提出的要求：请为下一次交换排这么多个时隙。标准只定义了这个要求本身' },
    { term: 'controller', plain: '把时隙分配讲定的那一端；在这个交换里它是收消息的一方，也是答复要求的一方' },
    { term: 'grant', plain: '控制器答应下来的那个宽度。标准里没有这个词的定义，本仿真器把它定成「这一块装不装得下」' },
  ],
  picture: [
    {
      heading: '同一个字段，两个不同的量',
      text: `上一课那枚信息单元里有一位叫 Request。置 0 时，「还剩几帧」说的是这条消息还有几帧没发；置 1 时，同一个字段说的是「请为下一次交换排这么多个时隙」。标准把这两种用法并列成两种不同的用法，所以一帧不能同时做这两件事——那一个字节只装得下一个量。于是这个要求自己占一帧、自己占一格，排在这条消息那几帧的后面。要几个时隙这个数由场景给出，不是算出来的：本仿真器一条媒体访问控制（MAC）原语都没有，也就没有上层来定下一条消息该有多长。本课的第一条消息是 ${FIRST_FRAMES} 帧，所以窗口是 ${SLOTS.window} 个测距时隙（ranging slot）：${FIRST_FRAMES} 格消息，1 格要求。`,
    },
    {
      kind: 'watch', jump: 0,
      heading: `窗口最后那一格，${BYTES.request} 字节`,
      text: `载入仿真并播放。一个测距块（ranging block）里前 ${SLOTS.ranging} 个时隙是照旧的一轮测距（ranging）：第 0 格是控制消息，后面 ${ANCHORS} 格是每个锚点（anchor）各作答一次。再往后 ${SLOTS.window} 格是这个交换的窗口。跳到提要求那一帧，它在窗口的最后一格。点开它的信息单元那一列，和前面两帧比一比：它不报消息编号——一个要求不是哪条消息的一部分——所以它比一帧消息短一个字节，${BYTES.request} 字节对 ${BYTES.fragment} 字节，${ms(MS.requestFrame)} ms 的空口时间（airtime）。`,
    },
    {
      heading: '轮得到它来要，是因为它不是控制器',
      text: `上一课讲过这一节把两个角色名反过来用：发消息的那一端在测距里恰恰是作答的那一端。这一课是那次反转第一次换来一个具体的权利。标准给 Request 这一位加了一个条件——只有当发消息的那一端不是控制器时，这一位才有意义。本引擎里这个条件是构造上成立的：发消息的是 ${ASKER_ID}，它在测距里是作答的一端；收消息的是标签（tag），而标签正是把时隙表讲定的那一端。所以没有哪一行代码去检查这个条件，它不是一个需要判断的前提。`,
    },
    {
      kind: 'steps', heading: '一次要求，从发出到生效',
      items: [
        `${ASKER_ID} 把这条 ${FIRST_FRAMES} 帧的消息发完，然后在窗口最后一格再发一帧：Request 置 1，字段里写 ${REQUEST}。`,
        '标签在同一格收到它。它读出这个数，按「这一块装不装得下」判一次，把答应下来的宽度记在自己这边。这一步不发任何东西回去。',
        '这一块剩下的事照旧走完。下一块的时隙表要到这一块结束的时候才铺——本引擎一直是一块一块铺的，所以不必为这一刀发明任何时序。',
        `铺下一块时，排程器问一次标签答应了多少，拿到 ${REQUEST} 就按 ${REQUEST} 铺：窗口从 ${SLOTS.window} 格变成 ${SLOTS.windowGranted} 格，一块从 ${SLOTS.block} 格变成 ${SLOTS.blockGranted} 格。`,
        `${ASKER_ID} 在下一块发的这条消息就是 ${REQUEST} 帧。它和标签读的是同一张时隙表，所以它不需要收到任何答复就知道要求成了。`,
      ],
    },
    {
      heading: '批到的不是更宽的窗口，是更长的消息',
      text: `这一点要说准，否则这个开关就白开了。如果批复只把窗口拉宽，而消息仍然是 ${FIRST_FRAMES} 帧，那么多出来的那几格全是空的：排程变长了，空口上一个字节也没多。于是「这个要求换来了什么」的答案是「什么也没换来」。所以本仿真器把它定成：批到几个时隙，下一次交换的消息就是几帧。读者在时间线上看得见的就是倒数的头一个数——块 0 的消息从 ${FIRST_FRAMES - 1} 数到 0，块 1 起从 ${REQUEST - 1} 数到 0。`,
    },
    {
      heading: '拒绝没有帧，而请求方照样知道',
      text: '标准既没有定义批复，也没有定义拒绝，更没有定义任何回话。所以本仿真器不发明一条拒绝帧——那会往仓库里塞一条标准没有的语义。控制器拒绝的时候，它什么也不做：下一次交换仍然按会话自己的帧数铺。而请求方和它读的是同一张时隙表，所以请求方从自己拿到的窗口有多宽，就知道没批到。这是本引擎的结构带来的便宜，不是这一节里写着的东西，两者要分清。',
    },
  ],
  numbers: [
    {
      kind: 'table', heading: '两种帧，差一个字节',
      head: ['哪一帧', '报消息编号', '那个字段装的是', '信息单元', '整帧'],
      rows: [
        ['一帧消息', '报', '这条消息还剩几帧', `${BYTES.fragmentIe} 字节`, `${BYTES.fragment} 字节`],
        ['提要求那一帧', '不报', '请求的时隙数', `${BYTES.requestIe} 字节`, `${BYTES.request} 字节`],
      ],
    },
    {
      kind: 'table', heading: '倒数的头一个数，就是这一刀的全部效果',
      head: ['哪一块', '消息几帧', '倒数', '窗口', '一块共几格'],
      rows: [
        ['块 0', `${FIRST_FRAMES}`, `${FIRST_FRAMES - 1} → 0`, `${SLOTS.window} 格`, `${SLOTS.block} 格`],
        ['块 1 及以后', `${REQUEST}`, `${REQUEST - 1} → 0`, `${SLOTS.windowGranted} 格`, `${SLOTS.blockGranted} 格`],
      ],
    },
    {
      heading: '「装不装得下」是算出来的，不是定出来的',
      text: `控制器按这一块装不装得下判，而这件事本引擎与方案检查本来就各算一遍：一块 ${MS.block} ms、一个时隙 ${MS.slot} ms，所以一块装得下 ${CAPS.perBlock} 格；测距那一轮占 ${SLOTS.ranging} 格，要求自己占 1 格，于是能批的最大宽度是 ${CAPS.grant}。这里没有一个新数：它是块长、时隙长和轮长算出来的。把时隙加宽十倍（${MS.wideSlot} ms）而块一动不动，同一块就只装得下 ${CAPS.widePerBlock} 格，能批的最大宽度掉到 ${CAPS.wideGrant}——于是同一个 ${REQUEST} 在这个大厅里被拒。`,
    },
    {
      kind: 'table', heading: '竞争式：窗口一格不动，消息照样变长',
      head: ['哪一种排程', '测距轮（ranging round）', '窗口', '消息'],
      rows: [
        ['排程式，批复前', `${SLOTS.ranging} 格`, `${SLOTS.window} 格`, `${FIRST_FRAMES} 帧`],
        ['排程式，批复后', `${SLOTS.ranging} 格`, `${SLOTS.windowGranted} 格`, `${REQUEST} 帧`],
        ['竞争式，批复前', `${SLOTS.contendRanging} 格`, `${SLOTS.contendWindow} 格`, `${FIRST_FRAMES} 帧`],
        ['竞争式，批复后', `${SLOTS.contendRanging} 格`, `${SLOTS.contendWindowGranted} 格`, `${REQUEST} 帧`],
      ],
    },
    {
      heading: '最后那一行不是 bug',
      text: `竞争式那一种里，窗口宽度在批复前后是同一个数。原因在上一课：竞争式的窗口取「消息要几格」与「这一轮自己的竞争时隙有几格」里较大的那一个，而本课的设置下后者是 ${SLOTS.contendWindow}，消息加上要求一共 ${REQUEST + 1} 格还是没超过它。所以窗口不动——而消息真的从 ${FIRST_FRAMES} 帧变成了 ${REQUEST} 帧。这就是「这个要求换来了什么」在竞争式下的准确答案：换来的是消息的长度，管窗口宽度的是竞争时隙的预算，不是这个要求。`,
    },
    {
      heading: '测距结果一个数也没动',
      text: '打开这个要求前后，测距结果逐字段相同——距离、块号、时刻，一个数都没变。原因和上一课一样：提要求那一帧坐在测距相位之后追加的那段窗口里，不插进轮里，也不带任何时间量，所以测距那一轮走的随机数流一点没动。这一节换来的是「下一次给我多排几格」这件事，不是更准的距离。',
    },
  ],
  deeper: [
    {
      heading: '每块重算一次，其实早就在了',
      text: '立这一刀的案时写着：要让一个要求改变后续排程，就得把轮的排布变成每块重算一次。查完代码才发现这件事上一课与它前面那一课已经各自做了一半——收妥确认在窗口收尾那一块给每一轮加几格，辅助信息消息在窗口开头那一块给每一轮加几格，所以「这一块的轮有几格」这个函数早就带着块号。实测：一条控制消息管四块时，同一个会话的块 0 与块 4 是九格，块 1、2、3 是五格。所以这一刀要改的不是轮的排布，是追加那一批有多宽——而块是一块一块铺的，上一块最后一帧与下一块铺表之间有一百八十多毫秒的余量。',
    },
    {
      heading: '为什么不把要求搭在最后一帧上',
      text: '还有一条更省的路：不单发一帧，把要求搭在这条消息的最后一帧上，同一帧里放两枚信息单元。那样连空口时间都省下来了。本仿真器不走这条路，理由只有一条：标准正文没有说一帧里可以放两枚这样的单元。本仓库的口径是不发明标准没给的语义，哪怕发明出来更省——于是这个要求自己占一帧，代价写在上面那张表里。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 §10.35.1 的最后一句与 §10.35.2.1 一起给出这一半的全部语义：Request 这一位置 1 表示这枚信息单元是在向控制器要时隙，这时「还剩几帧」那个字段装的是请求的时隙数，而这一位只有在发消息的那一端不是控制器时才有意义。本课完全不依赖任何草案。',
    '正文到此为止：批复、拒绝、应答一个字都没有，所以「按这一块装不装得下批」是本仿真器的取值（uwb/session.ts 的 ancillaryGrantFits），而它只用块长、时隙长与轮长算，没有引入任何新常数。请求的时隙数本身也是本仿真器的取值（model/scenario.ts 的 ancillaryRequestSlots），理由和上一课的帧数一样：本仿真器一条媒体访问控制（MAC）原语都没有，没有上层来算下一条消息该有多长。',
    `字节宽度与空口时间都由 uwb/phy.ts 的 raictIeBytes、uwbAncillaryBytes 与 uwbPpduNs 算出，时隙数由 roundPlan、ancillarySlots 与 blockSlots 算出，能批的最大宽度由 ancillaryGrantFits 逐个走出来，课文里一个字面量也没有写。本课四个场景是同一个 22 × 8 m 大厅、同样 ${ANCHORS} 个锚点与一个标签、同样的种子，只有会话上的开关不同：基础场景、竞争式排程、时隙加宽到 ${MS.wideSlot} ms（于是同一个请求被拒），以及把这个要求关掉。四个场景都关掉非视距。`,
  ],
  limits: [
    {
      kind: 'unmodelled',
      text: '请求几个时隙是场景配置，不是上层算出来的。这和上一课那条帧数是同一种情形：本仿真器没有一条媒体访问控制（MAC）原语，也没有上层来持有一条「下一次我要发这么长」的内容并算出它需要几格，所以这个数直接是会话上的一个整数（model/scenario.ts 的 ancillaryRequestSlots）。后果是读者看不到「上层的内容变长了，于是请求的数也跟着变」这条因果，只能自己把它改大改小。',
    },
    {
      kind: 'model-value',
      text: '批不批、按什么批，都是本仿真器定的，因为标准正文到请求为止。§10.35 通篇只定义这个要求本身：控制器收到之后做什么、能不能不做、要不要告诉对方它做了什么，一个字都没有，所以一台把要求丢掉的控制器也是合规的。本仿真器定的是「这一块装不装得下就批」（uwb/session.ts 的 ancillaryGrantFits），而它只用块长、时隙长与轮长算。后果是读者看不到别的策略——按优先级分配、按历史用量分配、批一个比请求小的数——而真实实现完全可以是其中任何一种。',
    },
    {
      kind: 'model-value',
      text: '一轮只有一个请求方，一个会话也只有一个控制器。发消息的始终是第 0 个响应方（uwb/device.ancillary.ts 的 ANCILLARY_SENDER_INDEX，上一课那条限制已经记着），所以也只有它会提要求；而两个标签就是两个控制器，批到的宽度却是每块一个数，于是方案检查直接拒掉两个标签加这个要求的组合。后果是读者看不到两台设备在同一个窗口里各提一个要求、而控制器只装得下其中一个的情形——那是这一节之外的后续工作。',
    },
  ],
  scenario: () => uwbAncillaryRequestScenario(),
  variants: [
    { label: `竞争式排程：窗口 ${SLOTS.contendWindow} 格不动，消息仍从 ${FIRST_FRAMES} 帧变成 ${REQUEST} 帧`, scenario: () => uwbAncillaryRequestScenario({ schedule: 'contention' }) },
    { label: `时隙加宽到 ${MS.wideSlot} ms：一块只装得下 ${CAPS.widePerBlock} 格，同一个请求被拒`, scenario: () => uwbAncillaryRequestScenario({ slotRstu: WIDE_SLOT_RSTU }) },
    { label: '把这个要求关掉：每一块都是会话自己的帧数', scenario: () => uwbAncillaryRequestOffScenario() },
  ],
  jumps: [
    J(`提要求那一帧：${BYTES.request} 字节，Request 置 1`, requestFrame),
    J(`控制器批下来的那一条记录：${REQUEST} 格`, grantRecord),
    J(`下一块的第一帧消息：倒数从 ${REQUEST - 1} 开始`, grantedFirstFrame),
    J('第一条测距行', firstUwbRange),
  ],
  observe: [
    `块 0 的窗口是 ${SLOTS.window} 格：前 ${FIRST_FRAMES} 格是消息，倒数 ${FIRST_FRAMES - 1}、0，最后一格是提要求那一帧。块 1 的窗口是 ${SLOTS.windowGranted} 格，倒数从 ${REQUEST - 1} 开始。整块一次超时也没有——这个要求不等任何答复。`,
    `提要求那一帧的对端是标签，而批复那一条记录落在标签这一侧：它写着请求了 ${REQUEST} 格、批了 ${REQUEST} 格。再看块 1 那一条：请求的数没变，批的数也没变，所以每一块都在重新要求一次同一个宽度。`,
  ],
  tryThis: [
    `载入「时隙加宽」变体，按块数一遍倒数的头一个数：每一块都是 ${FIRST_FRAMES - 1}，一块也没变长。再看批复那条记录——请求了 ${REQUEST} 格，批的那一栏是空的。这一块只装得下 ${CAPS.widePerBlock} 格，测距那一轮占 ${SLOTS.ranging} 格、要求占 1 格，所以能批的最大宽度是 ${CAPS.wideGrant}。把请求改成 ${CAPS.wideGrant} 再跑一遍：这一次批了。`,
    `载入「竞争式排程」变体，先量窗口：批复前后都是 ${SLOTS.contendWindow} 格，一格没动。再量消息：从 ${FIRST_FRAMES} 帧变成了 ${REQUEST} 帧。最后载入「把这个要求关掉」变体：窗口回到 ${SLOTS.off} 格，没有提要求那一帧，每一块的倒数都从 ${FIRST_FRAMES - 1} 开始，而测距结果和基础场景逐字段相同。`,
  ],
  quiz: [
    {
      q: '为什么这个要求要自己占一帧，不能搭在消息的最后一帧上？',
      options: [
        '因为一帧的长度不够再放一个字段',
        '因为那一个字段在两种用法下装的是两个不同的量，标准把两种用法并列成两种，所以一帧只能做其中一件事',
        '因为控制器只在窗口的最后一格才开着接收机',
      ],
      answer: 1,
      explain: `置 0 时它是「这条消息还剩几帧」，置 1 时它是「请排这么多个时隙」。一个字节装不下两个量。至于「同一帧里放两枚这样的单元」——标准正文没说这件事，所以本仓库不这么做，代价是多一帧 ${BYTES.request} 字节。`,
    },
    {
      q: '控制器批下来之后，下一次交换变了什么？',
      options: [
        '只有窗口变宽，消息还是原来那么多帧',
        '窗口变宽，消息也变成批到的那么多帧——倒数的头一个数就从那里开始',
        '什么也没变，批复只是记录下来备查',
      ],
      answer: 1,
      explain: `如果只有窗口变宽，多出来的格全是空的，这个开关就等于什么也没做。所以本仿真器把批到的时隙数定成下一次交换的消息帧数：块 0 的倒数从 ${FIRST_FRAMES - 1} 开始，块 1 起从 ${REQUEST - 1} 开始。`,
    },
    {
      q: '控制器拒绝的时候，请求方是怎么知道的？',
      options: [
        '控制器回一帧拒绝消息，里面写着它能给几格',
        '请求方等不到批复就超时，按超时判定被拒',
        '它从下一次交换的窗口有多宽就知道了：两端读的是同一张时隙表，而窗口仍然是会话自己的宽度',
      ],
      answer: 2,
      explain: '标准没有定义拒绝，也没有定义任何回话，所以本仿真器不发明一条拒绝帧。而本引擎的结构让这件事不必发明：时隙表由排程器铺，两端读的是同一张，所以窗口宽度本身就是答复。',
    },
  ],
}
