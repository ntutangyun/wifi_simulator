/**
 * UWB Tier 2 · M21 控制消息的有效期 · A zero-content IE is not an empty message — in the
 * standard-first shape (2026-11-10).
 *
 * ① what IEEE Std 802.15.4-2024 specifies: the RCM and the ranging initiation message are two
 * messages that may be merged when the controller is the initiator (§10.32.2); RCM Validity Rounds,
 * the consecutive rounds an RCM controls, this one included, no more than remain in the block
 * (§10.32.9.1); the ranging round set (§10.32.3.2); the ranging message non-receipt exchange and
 * its content-less RMNR IE (§10.34, §10.34.2.1). ② where this simulator follows that (the merged
 * first round, the initiation message alone after it, the field read off the received ARC IE, the
 * responders' slots read off the received RDM IE, the RMNR frame) and the choices it makes (the two
 * messages always merged in a set's first round, so the non-receipt state arises only in the set's
 * later rounds). ③ five guided runs, every figure of which is read back out of this file and
 * compared with a run in tests/course/uwb-rcm-validity.test.ts.
 *
 * The scenes are three settings of one room (`rangingLab`, four anchors and one tag, DS-TWR with
 * embedded reply times, NLOS off, the default 100 ps timestamp noise left on): validity 4 with the
 * tag running four rounds a block, the same room at validity 1, and the same room with one anchor
 * behind a brick partition, a laptop's Wi-Fi backup on a channel that overlaps UWB channel 5, and
 * `rmnr` on (2026-11-11, W2b: the laptop is what lets an RMNR frame actually go out).
 */
import type { Scenario, UwbSessionCfg, Wall } from '../../model/scenario'
import type { TimingSpec } from '../diagram'
import {
  J, LESSON_6G_WIDTH_MHZ, brick, firstUwbInit, firstUwbPoll, firstUwbRange, node, rangingLab, txOf, uwbSc, uwbTag,
  wifi6g, anchor, type Lesson,
} from '../lessonKit'
import { rstuNs } from '../../uwb/phy'
import { roundPlan, slotAction } from '../../uwb/session'

/** Anchors of every scene below. */
export const ANCHORS = 4
/** `rcmValidityRounds` of the base scene: one control message for four rounds. */
export const VALIDITY = 4
/** Rounds the tag runs in every block (`initiatorRounds`): exactly one ranging round set. */
export const ROUNDS = VALIDITY

/** Where the four anchors stand, in metres: the corners of the hall. */
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
 * anchor's path to the tag.
 */
function closet(): Wall[] {
  return [brick(19, 8, 22, 5.5)]
}

/** 802.11ax 6 GHz channel 71 (6265–6345 MHz), wholly inside UWB channel 5 — the overlap
 * `uwb-coexist` measures, used here only to make a frame go missing now and then. */
export const WIFI_CENTER_MHZ = 6305

/**
 * The lesson's scene: four anchors and one tag in the 22 × 8 m hall, DS-TWR with embedded reply
 * times so that both ends of every round produce a range. `rcmValidityRounds` is the one knob the
 * first two scenes differ in; the third adds the partition (`walled`), switches the non-receipt
 * exchange on (`rmnr`) and puts a laptop running a background backup on a 6 GHz Wi-Fi channel that
 * overlaps UWB channel 5 (`wifi`, which also moves the session to channel 5). The Wi-Fi traffic is
 * what now and then drowns an initiation message at an anchor that holds the set's control message —
 * the one state in which §10.34's RMNR frame goes out (2026-11-11, W2b; until then no scene of this
 * lesson could reach it, and the `rmnr` switch sat in the variant doing nothing).
 */
export function uwbRcmValidityScenario(
  rcmValidityRounds: number = VALIDITY, walled = false, rmnr = false, wifi = false,
): Scenario {
  const hall = rangingLab()
  const house = walled ? { rooms: hall.rooms, walls: [...hall.walls, ...closet()] } : hall
  const uwbNodes = [
    ...PLACES.map((p, i) => anchor(p.id, `A${i + 1}`, p.x, p.y)),
    uwbTag('uwb-1', 'Tag', 11, 4),
  ]
  const session = {
    method: 'ds' as const, replyTime: 'embedded' as const, nlos: false, rcmValidityRounds, rmnr,
    initiatorRounds: ROUNDS, ...(wifi ? { channel: 5 as const } : {}),
  }
  if (!wifi) return uwbSc(house, uwbNodes, session)
  const ap = node('ap', 'Router', 'ap', 11, 7.5, 'eht', 'idle', { edca: true, txop: true, ampdu: true }, 2.0)
  ap.caps.widthMhz = LESSON_6G_WIDTH_MHZ
  const laptop = wifi6g('laptop', 'Laptop', 3, 2, 'backup')
  return uwbSc(house, [ap, laptop, ...uwbNodes], session, { sixGhzCenterMhz: WIFI_CENTER_MHZ })
}

const SESSION: UwbSessionCfg = uwbRcmValidityScenario().uwb!
const PLAN = roundPlan(SESSION, ANCHORS)

/** The first slot whose action is `kind`, read out of the round's own slot table. */
const firstSlotOf = (kind: string): number => {
  for (let s = 0; s < PLAN.slots; s++) if (slotAction(PLAN, s).kind === kind) return s
  throw new Error(`uwb-rcm-validity: this round has no ${kind} slot`)
}

/** The round as the slot table lays it out, every boundary asked of `slotAction`. */
export const FIG = {
  slotUs: rstuNs(SESSION.slotRstu) / 1000,
  slots: PLAN.slots,
  responseFrom: firstSlotOf('uwbResp'),
  finalAt: firstSlotOf('uwbFinal'),
  reportFrom: firstSlotOf('uwbReport'),
} as const

/** The control message of the second set — block 1's first round. */
const secondSetRcm = txOf((r) => r.frame.kind === 'uwbPoll' && r.frame.uwb?.block === 1 && r.frame.uwb.round === 0)

/**
 * Two rounds of one set on one axis, drawn to scale: the same slot table twice, and the one slot
 * whose content differs. The four response slots and the four report slots are each drawn as one
 * span, because four labels in that stretch would run into one another.
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
      { label: '第 0 轮', spans: [{ label: '控制消息 42 B', fromUs: 0, toUs: s, tone: 'accent' }, ...tail()] },
      { label: '第 1 轮', spans: [{ label: '启动消息 14 B', fromUs: 0, toUs: s, tone: 'accent' }, ...tail()] },
    ],
    axis: { fromUs: 0, toUs: FIG.slots * s, ticks: [0, FIG.finalAt * s, FIG.slots * s], unit: 'µs' },
  }
}

export const uwbRcmValidity: Lesson = {
  id: 'uwb-rcm-validity',
  module: 21,
  title: '一个零内容的信息单元，不是一条空消息',
  why: '前面每一课里，标签（tag）每开始一个测距轮（ranging round）都先发一帧轮询帧：它既是测距控制消息，告诉各个锚点（anchor）本轮谁在哪个测距时隙（ranging slot）作答，又是测距启动消息，产生本轮计时所用的第一个时间戳。标准里这本来是两条消息，控制器与发起方是同一台设备时才可以合并（§10.32.2）；控制消息里 ARC 信息单元的 RCM Validity Rounds 字段给出它一共管连续几轮——含它所在的这一轮，且不超过当前块里剩余的轮数（§10.32.9.1），这几轮叫一个测距轮次组（§10.32.3.2）。组里后面各轮只需要测距启动消息。本课的场景让标签每块连续运行四轮，一条控制消息管这四轮：后三轮的首帧只有 14 字节，不到完整轮询帧的一半。省下的是空口时间（airtime），不是测量——两种做法测得的每条距离完全相同；节省量按整组计算，把它当成每一轮的，就夸大了四倍。两条消息分开之后出现了一种新状态：应答方收到了控制消息，却没收到本轮的启动消息。§10.34 允许它在自己的时隙里发一帧带 RMNR 信息单元的帧，这个信息单元没有内容字段（§10.34.2.1），却能表达三项信息：帧头（MAC header）的源地址与它所在的时隙表明发送者是谁，能够发送表明控制消息已收到，发的不是应答表明启动消息未收到。从未收到过控制消息的应答方不知道自己的时隙，只能保持沉默。本仿真器在每组的第一轮把两条消息合成一帧，所以在本课的场景里，只有组里后面那几轮才可能出现这种状态；第三个场景用一台在后台备份的 Wi-Fi 笔记本制造它：笔记本的上传偶尔淹没某一轮的启动消息，持有控制消息的锚点于是发出 RMNR。',
  outcomes: [
    '说出标准对控制消息、测距启动消息与有效轮数各规定了什么',
    '读出一组轮里两种首帧各有多少字节，并算出每组节省多少',
    '说出一个没有内容字段的信息单元为什么仍能携带三项信息',
    '指出一个从未收到过控制消息的应答方为什么必须保持沉默',
  ],
  needs: ['uwb-frame', 'uwb-blocks', 'uwb-dstwr'],
  terms: [
    { term: 'ranging control message (RCM)', plain: '测距控制消息：控制器在一轮的第 0 个时隙发出，配置测距参数——谁在哪个时隙作答，这一轮要求什么' },
    { term: 'RCM Validity Rounds', plain: 'ARC 信息单元里的一个 6 位字段：这一条控制消息一共管连续几轮，包括它所在的这一轮，且不能超过当前块里剩余的轮数' },
    { term: 'ranging initiation message', plain: '测距启动消息：发起方发出的测距交互的第一条消息，产生本轮第一个时间戳' },
    { term: 'RMNR IE', plain: '测距消息未收到信息单元：没有内容字段，全部宽度就是一个信息单元头' },
  ],
  standard: [
    { heading: '控制消息与启动消息（§10.32.1，§10.32.2）', text: '控制器发出测距控制消息（ranging control message, RCM），把测距参数发给各受控设备；发起方随后发出测距启动消息（ranging initiation message），开始一次测距交互。控制消息在一轮的第 0 个时隙发出；控制器与发起方是同一台设备时，控制阶段与启动阶段可以合并为一个阶段。' },
    { heading: '有效轮数（§10.32.9.1）', text: 'ARC 信息单元控制位的第 9 到 14 位是 RCM Validity Rounds，共 6 位：这条控制消息管辖的连续轮数，包括它所在的这一轮。这个值不能大于当前块里剩余的轮数，所以一条控制消息不跨块。' },
    { heading: '测距轮次组（§10.32.3.2，§10.32.9.8）', text: '一个块里由同一条控制消息管辖的若干轮叫一个测距轮次组，组内各轮首尾相接；组的第一轮里，控制消息配置整组的测距参数，组的轮数就是 RCM Validity Rounds。一个块可以有多个轮次组，每组由它第一轮开头的控制消息定义。RDM 信息单元为同一条控制消息管辖的那组轮交换调度信息。' },
    { heading: '测距消息未收到交互（§10.34.1，图 10-270）', text: '图中两个应答方都收到了控制消息，应答方 2 却没收到预期的测距启动消息。它不在自己分到的时隙里保持空闲，而是可以发一帧带 RMNR 信息单元的帧，表明没有收到启动消息，同时隐含地确认收到了控制消息；控制器收到应答方 1 的应答时，也就知道应答方 1 收到了控制消息。设备按调度向控制器发送消息的场合，都可以使用这一交互。' },
    { heading: 'RMNR 信息单元（§10.34.2.1）', text: 'RMNR 信息单元用来表明预期的一条测距消息没有收到。它没有内容字段。' },
    { kind: 'steps', heading: '一组测距轮与未收到交互，按标准：逐步说明', items: [
      '组的第一轮：控制器在第 0 个时隙发出控制消息，ARC 信息单元的 RCM Validity Rounds 写明这一组有几轮，RDM 信息单元给出各应答方的时隙；控制器兼任发起方时，启动消息可以与它合并（§10.32.2、§10.32.9.1、§10.32.9.8）。',
      '应答方据此知道自己的时隙，以及这组轮到第几轮为止。',
      '组里其后的各轮，发起方只需发测距启动消息；整组的配置来自组首的那条控制消息（§10.32.3.2）。',
      '某个应答方持有这组的控制消息，却没收到某一轮的启动消息：它可以在自己的时隙里发一帧带 RMNR 信息单元的帧（§10.34.1）。从未收到过控制消息的应答方不知道自己的时隙。',
      '一组结束后，下一组由它自己第一轮开头的控制消息定义；一组不跨块（§10.32.9.1）。',
    ] },
  ],
  implementation: [
    { topic: '两条消息合并', standard: '控制器兼任发起方时，控制阶段与启动阶段可以合并（§10.32.2）', sim: '照此：每组第一轮的 Poll 同时是控制消息与启动消息，带 ARC、RR、RDM、RRMC 四个信息单元，42 字节；组里其后各轮只发测距启动消息，只带 RRMC，14 字节。', kind: 'faithful' },
    { topic: '有效轮数的取值', standard: '含本轮的连续轮数，不大于本块剩余的轮数（§10.32.9.1）', sim: '照此：ARC 信息单元里写的是本组的轮数；应答方按收到的 ARC 信息单元里的这个值判断持有的控制消息是否仍然有效。场景校验拒绝大于标签每块轮数的有效轮数，编辑器在调大有效轮数时把每块轮数一并调大。', kind: 'faithful' },
    { topic: '标签每块运行几轮', standard: '一个会话使用块里的哪几轮由上层决定（§10.32.3.3）', sim: '本课取每块四轮，正好容纳一组；一个块也可以容纳好几组。', kind: 'value' },
    { topic: '启动消息与有效期', standard: '整组的配置由组首的控制消息定义（§10.32.3.2）', sim: '照此：启动消息不带 ARC 信息单元，收到它不延长有效期；这组轮结束后，应答方的处境与从未收到过控制消息相同。', kind: 'faithful' },
    { topic: '应答方怎样知道自己的时隙', standard: '由 RDM 信息单元指定，或事先约定（§10.32.1，§10.32.9.8）', sim: '照此：应答方从收到的 RDM 条目读出自己的时隙。没有持有有效控制消息的锚点不作答，也只在第 0 个时隙打开接收机等待控制消息；墙后的锚点每轮只写下第 0 个时隙的一条超时记录。', kind: 'faithful' },
    { topic: 'RMNR 帧', standard: 'RMNR 信息单元没有内容字段（§10.34.2.1）', sim: '照此：一帧 RMNR = 帧头 9 字节 + 信息单元头 2 字节 + 帧校验 2 字节 = 13 字节，在这个锚点自己的应答时隙里发出。', kind: 'faithful' },
    { topic: '是否发送 RMNR', standard: '应答方可以发送（§10.34.1），不强制', sim: '由场景开关决定：打开时，持有有效控制消息、没收到启动消息的锚点一律发送；发起方把它记为一条写明原因的记录，而不是一次超时。', kind: 'choice' },
    { topic: '同一轮里的两帧', standard: '控制消息与启动消息可以是同一轮里先后发出的两帧，控制器兼任发起方时也可以合并（图 10-270，§10.32.2）', sim: '本仿真器总把组首的两条消息合成一帧，所以「收到控制消息、没收到启动消息」只出现在组里其后的几轮：本课第三个场景里，笔记本的上传淹没了其后某一轮的启动消息，持有控制消息的锚点就发出 RMNR。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '两种首帧',
      jump: 0,
      steps: [
        '载入本课场景，跳到第 0 轮的控制消息，打开帧检查器查看信息单元一栏。',
        '再跳到第 1 轮的启动消息，比较两帧的长度与信息单元。',
      ],
      blocks: [
        { kind: 'diagram', heading: '同一张时隙表，两轮', spec: uwbRcmValidityTiming(), caption: '按比例画的相邻两轮：唯一的差别在第 0 个时隙里——第 0 轮是 42 字节的控制消息，第 1 轮是 14 字节的启动消息。后面每一个时隙的归属都没有变化。「四个应答」与「四个报告」各是一个锚点一个时隙，为了容纳文字才合并画成一段；两段之间没有字的那一格，是标签自己发的 Final。' },
        { kind: 'table', heading: '一组里的两种首帧', head: ['轮', '帧', '信息单元', '长度'], rows: [
          ['第 0 轮', 'Poll（控制消息兼启动消息）', 'ARC、RR、RDM、RRMC', '42 字节'],
          ['第 1 轮', '测距启动消息', 'RRMC', '14 字节'],
        ] },
      ],
      expect: '第 0 轮那一帧的 ARC 信息单元写着有效轮数 4；第 1 轮的帧只剩 RRMC 一个信息单元，名称也不同——它不是一帧更短的轮询帧，而是标准中另有名称的另一条消息。',
      meaning: '两条消息合并与否、后面各轮只发启动消息，都照标准（①、②）。',
    },
    {
      heading: '一组四轮的首帧字节',
      more: [0],
      steps: [
        '依次运行本课场景与「每轮一条控制消息（今天的行为）」，读出第 0 块四轮的首帧长度。',
        '对照下表与下面的公式。',
      ],
      blocks: [
        { kind: 'table', heading: '一组的 4 轮，首帧各有多少字节', head: ['轮', '每轮一条控制消息', '一条对 4 轮有效'], rows: [
          ['第 0 轮', '42 字节', '42 字节（控制消息）'],
          ['第 1 轮', '42 字节', '14 字节（启动消息）'],
          ['第 2 轮', '42 字节', '14 字节（启动消息）'],
          ['第 3 轮', '42 字节', '14 字节（启动消息）'],
          ['合计', '168 字节', '84 字节'],
        ] },
        { kind: 'formula', text: '省下 = (R − 1) × (16 + 3A)，每 R 轮', note: 'A 是锚点个数，R 是一条控制消息有效的轮数。节省的正是不再重发的三个信息单元：ARC 5 字节，RR 8 字节，RDM 15 字节，合起来 28 字节。' },
      ],
      expect: '四个锚点、R = 4 时每组节省 3 × 28 = 84 字节；一组里只有 3 轮换了短的首帧，平均到每一轮是 21 字节。把 84 字节算成每一轮的，就把节省夸大了四倍。',
      meaning: '节省来自不再重发的信息单元，周期是一个测距轮次组（①）。',
    },
    {
      heading: '测量没有改变',
      variant: 0,
      jump: 3,
      steps: [
        '载入「每轮一条控制消息（今天的行为）」，跳到第一条测距行。',
        '把第 0 块四轮的测距行与本课场景的逐条比较。',
      ],
      expect: '两种设置在第 0 块的四轮里都测得 32 条测距结果，距离、品质因数（figure of merit, FoM）、块号与时刻逐字段相同；这是在时间戳噪声按缺省值开启（100 ps）的情况下测得的。',
      meaning: '有效轮数省下的是空口时间，不是精度（②）。',
    },
    {
      heading: '进入下一组',
      jump: 2,
      steps: [
        '跳到第 1 块的第一轮，打开它的首帧。',
      ],
      expect: '首帧又是 42 字节：ARC 信息单元写着有效轮数 4，RR 信息单元写着块号 1、轮号 0。第 0 块里只有第一轮有控制消息，其后三轮都只有启动消息。',
      meaning: '一组不跨块，下一组由它自己的控制消息定义（①）；启动消息从不延长有效期（②）。',
    },
    {
      heading: '砖墙后的锚点与一台笔记本',
      variant: 1,
      steps: [
        '载入「一台锚点在砖墙后、一台笔记本在后台备份，并打开未收到交互」，播放到第一帧 RMNR（约 60 ms 处，帧检查器里写作 UWB Ranging Message Non-Receipt）。',
        '往前看这一轮的启动消息在各锚点处的命运，往后看标签怎样记下这几帧；再看 anchor-4 有没有发过任何帧。',
      ],
      expect: '第 0 块第 3 轮的启动消息在 anchor-1、anchor-2、anchor-3 处都被笔记本的上传淹没。三台都持有这组的控制消息，各在自己的时隙发出一帧 13 字节的 RMNR；anchor-2 与 anchor-3 的两帧被标签收到，记为 RMNR 记录，anchor-1 的那一帧本身又被 Wi-Fi 淹没，标签只记下一次超时。前 450 ms 里这样的轮出现 3 次，共发出 9 帧 RMNR。墙后的 anchor-4 从未收到过控制消息，一帧也不发，每轮只在第 0 个时隙等待；没有受干扰的轮里，标签每轮留下 2 次超时，依靠其余 3 个锚点解出位置。',
      meaning: 'RMNR 隐含地确认控制消息已收到（①），所以只有持有有效控制消息的锚点才发它；从未收到控制消息的锚点不知道自己的时隙，保持沉默（①、②）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.32.9.1 是 ARC 信息单元，RCM Validity Rounds 在它内容字段里的第 9 到 14 位，6 位，所以取值是 0 到 63 轮（它在开头两个字节的控制位里，不在其后的 Content Control 字段里），表示这条控制消息管辖的连续轮数（含本轮），不大于当前块里剩余的轮数；§10.32.3.2 定义测距轮次组；§10.32.2 允许控制器兼任发起方时合并控制阶段与启动阶段；§10.32.9.8 是 RDM 信息单元；§10.34.1 与图 10-270 是测距消息未收到交互，§10.34.2.1 规定 RMNR 信息单元没有内容字段。本课不依赖任何草案。',
    '字节宽度：帧头 9、信息单元头 2、ARC 5、RR 8、RDM 3 + 3A（四个锚点 15）、RRMC 3、帧校验 2，于是一帧完整的轮询帧 30 + 3A、一帧启动消息 14、一帧 RMNR 13。',
    '本仿真器的取值与取法：标签每块运行四轮、RMNR 由场景开关决定是否发送、组首的两条消息总是合成一帧。三个场景是同一个 22 × 8 m 大厅的三种设置：四个锚点一个标签、双边双向测距（double-sided two-way ranging, DS-TWR）、回复时延嵌在帧里、关掉非视距、时间戳噪声按缺省留在 100 ps；第三个场景另把会话移到 UWB 5 号信道，加一台路由器与一台在后台备份的笔记本，Wi-Fi 用与之重叠的 6 GHz 71 号信道（6 305 MHz），干扰怎样判定见共存那一课。',
  ],
  limits: [],
  scenario: () => uwbRcmValidityScenario(),
  variants: [
    { label: '每轮一条控制消息（今天的行为）', scenario: () => uwbRcmValidityScenario(1) },
    { label: '一台锚点在砖墙后、一台笔记本在后台备份，并打开未收到交互', scenario: () => uwbRcmValidityScenario(VALIDITY, true, true, true) },
  ],
  jumps: [
    J('第 0 轮的控制消息：ARC + RR + RDM + RRMC，42 字节', firstUwbPoll),
    J('第 1 轮的启动消息：只有 RRMC，14 字节', firstUwbInit),
    J('第 1 块的第一轮：进入下一组，又一条控制消息', secondSetRcm),
    J('第一条测距行', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '在本课的场景里，为什么「一条控制消息对几轮有效」是那个未收到交互的前提？',
      options: [
        '因为有效轮数越多，首帧越短，RMNR 才能放入时隙',
        '因为本仿真器把组首的控制消息与启动消息合成一帧：这一帧丢失就意味着配置和启动消息同时丢失，而没有配置的应答方不知道自己的时隙在哪里，发不出 RMNR',
        '因为标准规定只有有效轮数大于 1 时才可以发 RMNR',
      ],
      answer: 1,
      explain: 'RMNR 要报告的是「控制消息我有，本轮的启动消息我没收到」。标准本身并不要求有效期跨越多轮：控制消息与启动消息在同一轮里分成两帧时，同样会出现这个状态（图 10-270）；只是本仿真器从不把它们分开。',
    },
    {
      q: '一帧 RMNR 只有 13 字节、信息单元里一个内容字段也没有，它依靠什么表达三项信息？',
      options: [
        '依靠帧里的地址字段，把三项信息编码进源地址',
        '依靠帧头的源地址与它所在的时隙、「本该是一次按时的应答却是这一帧」，加上它被发送出来这一事实本身',
        '它无法表达，发起方只能当作一次超时',
      ],
      answer: 1,
      explain: '谁在报告由帧头的源地址给出，也与它所在的时隙对应；「你的控制消息我收到了」由它能够发送这一事实本身给出（§10.34.1 称之为隐含的确认）；「本轮启动消息没收到」由它发的是 RMNR 而不是应答给出。',
    },
    {
      q: '一台从未收到过任何控制消息的锚点，在本轮应该做什么？',
      options: [
        '发一帧 RMNR，告诉发起方自己什么都没收到',
        '保持沉默：它没有时隙表，不知道哪个时隙是自己的，若发送就会占用其他设备的时隙',
        '在任意一个空闲时隙发一帧 RMNR，发起方会按地址认出它',
      ],
      answer: 1,
      explain: 'RMNR 隐含地确认收到了控制消息（§10.34.1），没收到过控制消息的设备无从确认；发起方因此只能得到一次超时，而那是如实的结果。',
    },
    {
      q: '四个锚点、一条控制消息管四轮时，省下的 84 字节是什么周期上的？',
      options: [
        '每一轮 84 字节',
        '每四轮 84 字节，平均到每一轮是 21 字节',
        '每条测距结果 84 字节',
      ],
      answer: 1,
      explain: '一组里只有 3 轮换成了短的首帧，每轮节省 28 字节，所以周期是一个测距轮次组。',
    },
  ],
}
