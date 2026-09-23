/**
 * UWB Tier 1 · M12 · Ranging sessions and positioning · Blocks, rounds and slots.
 *
 * The lessons before this one measured one distance inside a single round.
 * This one zooms out to the grid that round sits in: a ranging block that
 * repeats, one round to a tag, one frame to a slot, and three phones that
 * never once collide because the timetable was written before the first frame
 * flew. The pay-off is measured rather than asserted — a tag owns a tenth of
 * the block and an anchor serves three tenths of it, yet their radios are on
 * for 0.97 % and 1.22 % of it.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the
 * timetable in plain words first, the exact RSTU counts and the radio bill
 * after it, the slot-length arithmetic in `deeper` and the clauses in
 * `sources`. Every number quoted below is pinned in
 * tests/course/uwb-blocks.test.ts; `npx tsx scripts/lesson-dump.ts uwb-blocks
 * en` prints the section budgets.
 */
import type { Scenario } from '../../model/scenario'
import {
  J, N, anchor, firstUwbPoll, firstUwbPosition, firstUwbRoundEnd, oneRoom, uwbSc, uwbTag,
  type Lesson,
} from '../lessonKit'
import type { TLRecord } from '../../model/records'

/** The second tag's round opening: the moment the block hands the grid to somebody else. */
const secondTagRound = (r: TLRecord): boolean => r.type === 'UWB_ROUND' && r.node === 'uwb-2'
/** The first round of the second block: the whole schedule, repeating. */
const nextBlock = (r: TLRecord): boolean => r.type === 'UWB_ROUND' && r.block === 1

/**
 * Four anchors on a 3.50 m ring around (5, 4) at 2.20 m, serving three phones
 * at desk height: one under the ring's centre and two off to the sides. The
 * anchors are unchanged from the earlier ranging scenes on purpose — what this
 * lesson varies is the session's own grid, not the geometry — and the only
 * knob the variant turns is the ranging slot.
 */
export function uwbBlocksScenario(slotRstu: number): Scenario {
  return uwbSc(oneRoom(), [
    anchor('anchor-1', 'Anchor 1', 8.5, 4, 2.2),
    anchor('anchor-2', 'Anchor 2', 5, 7.5, 2.2),
    anchor('anchor-3', 'Anchor 3', 1.5, 4, 2.2),
    anchor('anchor-4', 'Anchor 4', 5, 0.5, 2.2),
    uwbTag('uwb-1', 'Phone 1', 5, 4, 1.0),
    uwbTag('uwb-2', 'Phone 2', 3, 2.5, 1.0),
    uwbTag('uwb-3', 'Phone 3', 7.5, 6, 1.0),
  ], { method: 'ds', nlos: false, slotRstu })
}

export const uwbBlocks: Lesson = {
  id: 'uwb-blocks',
  module: 12,
  title: { en: 'Blocks, rounds and slots', zh: '块、轮与时隙' },
  why: {
    en: 'A room with several phones in it wants several distances at once. On a Wi-Fi link they would argue for the air: listen, wait, back off, try again. A ranging session does the opposite — it writes a timetable before anybody transmits, and each radio simply reads its own line. This lesson is that timetable: what it is made of, who owns each piece of it, and what it costs a battery.',
    zh: '一个房间里有好几部手机，它们想同时各自测出距离。换成一条 Wi-Fi 链路，它们会为空口争起来：先听、再等、退避、重来。测距会话反其道而行：在任何人开口之前先把时间表写好，每台射频只管读自己那一行。这一课讲的就是这张时间表——它由什么拼成、每一块归谁所有，以及它要让电池付出多少。',
  },
  outcomes: [
    { en: 'read one phone’s turn off the log (the ranging round) and say which phone owns it', zh: '从日志里读出属于某一部手机的那一回合（测距轮），并说出它归谁' },
    { en: 'say why nothing in a ranging session listens first, backs off or retries', zh: '说清为什么测距会话里没有谁需要先听、退避或重传' },
    { en: 'tell what shortening a slot (one line of the timetable) buys, and what it does not', zh: '讲清把时隙（时间表上的一行）缩短能买到什么，又买不到什么' },
  ],
  needs: ['uwb-frame'],
  terms: [
    { term: 'block', plain: {
      en: 'the whole timetable, which repeats for as long as the session lives',
      zh: '整张时间表；只要会话还活着，它就一遍遍重复',
    } },
    { term: 'round', plain: {
      en: 'one phone’s turn inside the block: all the frames of one measurement',
      zh: '块里属于某一部手机的那一轮：一次测量的全部帧都在这里面',
    } },
    { term: 'slot', plain: {
      en: 'one line of the timetable — one frame leaves in it, and nothing else',
      zh: '时间表上的一行——里面只走一帧，别无他物',
    } },
    { term: 'margin', plain: {
      en: 'the spare room a slot keeps beyond the frame it must hold, so what the model leaves out still fits',
      zh: '余量：时隙在必须装下的那一帧之外多留的余地，好让模型略去的那些东西也放得下',
    } },
    { term: 'RSTU', plain: {
      en: 'the unit the timetable is written in: a ranging slot time unit, a good deal shorter than a microsecond',
      zh: '写这张时间表所用的单位：测距时隙时间单元，比一微秒短不少',
    } },
  ],
  picture: [
    { heading: { en: 'A timetable nobody negotiates', zh: '一张无需商量的时间表' }, text: {
      en: 'A ranging session hands out time before anyone transmits. The whole schedule is the block, and it repeats unchanged for as long as the session lasts. Nothing inside it listens for an idle medium, waits out a gap, draws a backoff or retries: every device knows the instant of every frame it will send before the first one flies.',
      zh: '测距会话在任何人发送之前就把时间分配完毕。整张日程就是一个块，只要会话还在，这个块就原样重复下去。它里面没有谁需要先听信道是否空闲、没有谁要等一段间隔、没有谁要取退避值、也没有谁要重传：每台设备在第一帧起飞之前，就已经知道自己要发的每一帧发生在哪一刻。',
    } },
    { text: {
      en: 'Inside the block, each phone gets a round of its own — its turn, and nobody else’s. Inside a round, time is cut into equal slots and each slot carries exactly one frame: the phone’s question first, then each anchor’s answer, each in the place the timetable gave it.',
      zh: '块的内部，每部手机分到属于自己的一轮——它的回合，别人插不进来。而一轮的内部，时间被切成等长的时隙，每个时隙恰好走一帧：先是手机的提问，然后是各个锚点的回答，每一帧都落在时间表分给它的那个位置上。',
    } },
    { kind: 'watch', jump: 4, heading: { en: 'Watch it come round again', zh: '看它又转回来' }, text: {
      en: 'Load the simulation and press play. Every transmission starts exactly on a slot boundary, the three phones take their turns one after another, and then the whole pattern begins again at the top of the next block.',
      zh: '载入仿真，按下播放。每一次发送都恰好压在时隙边界上，三部手机依次轮到自己，然后整个图案又从下一个块的开头重新来过。',
    } },
    { heading: { en: 'The timetable travels in the first frame', zh: '时间表随第一帧一起飞' }, text: {
      en: 'The anchors were not born knowing the grid. It rides in the phone’s opening frame, as two short lists: one says where in the session this round sits, the other names each anchor and the slot it is to answer in.',
      zh: '锚点并不是生来就知道这张网格的，它是随手机那一帧开场帧飞过来的，形式是两张小小的清单：一张说明本轮落在会话的什么位置，另一张逐个点名锚点，并写清它该在哪个时隙作答。',
    } },
    { heading: { en: 'Awake is not the same as allotted', zh: '醒着，和分到手，是两回事' }, text: {
      en: 'A device pays for airtime, not for the time the timetable gave it. It arms its receiver at the start of a slot it expects a frame in, and switches it off the moment that frame lands. So an anchor serving three rounds out of ten still has its radio on for barely one part in a hundred of the block.',
      zh: '一台设备付的是空口时间的账，不是时间表分给它那段时间的账。它只在“预期有帧到来”的时隙起点打开接收机，并在那一帧落地的瞬间关掉。于是，服务着十轮中三轮的锚点，射频开启时长也不过占整块的百分之一上下。',
    } },
    { heading: { en: 'Why a slot is so much longer than a frame', zh: '为什么时隙比帧长这么多' }, text: {
      en: 'A slot must hold the longest frame of its round and that frame’s flight, with a little to spare — that spare room is the margin. Past that the length is a choice, and here a generous one: most of a slot is silence. The margin pays for what this model leaves out — a receiver’s search before it can name an arrival, the turnaround from listening to transmitting, clocks drifting apart.',
      zh: '一个时隙必须装得下本轮最长的那一帧和它的飞行时间，再留一点余地；这点余地就是余量。除此之外，时隙多长是一个选择，而这里选得很宽裕：时隙里大半是静默。这份余量买的是本模型略去的东西——接收机判定一帧到达前的搜索、从收到发的转换时间，还有两端时钟的相互漂移。',
    } },
    { kind: 'watch', jump: 1, heading: { en: 'One fix, once a block', zh: '一个块，一次定位' }, text: {
      en: 'Jump to the first phone’s fix. It lands at the end of its own round, and the next one is a whole block away — this grid sets not only who speaks but how often a phone learns where it is.',
      zh: '跳到第一部手机的那次定位。它落在自己这一轮的末尾，而下一次要等整整一个块——这张网格定下的不只是谁何时说话，还有一部手机多久才知道一次自己在哪儿。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'Three nested clocks', zh: '三重嵌套的节拍' }, head: [
      { en: 'Level', zh: '层级' }, { en: 'RSTU', zh: 'RSTU' }, { en: 'Duration', zh: '时长' },
    ], rows: [
      [{ en: 'Ranging block', zh: '测距块' }, N('240 000'), N('200.0 ms')],
      [{ en: 'Ranging round', zh: '测距轮' }, N('24 000'), N('20.0 ms')],
      [{ en: 'Ranging slot', zh: '测距时隙' }, N('2 400'), N('2 000.0 µs')],
    ] },
    { text: {
      en: 'The seven rounds nobody owns are 140 ms of every block. A fourth phone costs the next empty round; the block breaks at the eleventh.',
      zh: '没有主人的那七轮，合每个块里的 140 ms。再加一部手机，代价不过是下一个空轮；要到第十一部，这个块才装不下。',
    } },
    { kind: 'table', heading: { en: 'What the log says the grid is', zh: '日志是怎么写这张网格的' }, head: [
      { en: 'What', zh: '内容' }, { en: 'It reads', zh: '写的是' },
    ], rows: [
      [{ en: 'The round line', zh: '整轮那一行' }, N('uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs')],
      [{ en: 'Where the rounds of block 0 open', zh: '第 0 块的各轮何时开启' }, N('0, 20 and 40 ms; block 1 at 200, 220 and 240 ms')],
      [{ en: 'Where the three Polls of block 0 leave', zh: '第 0 块的三帧 Poll 何时离开' }, N('0, 20 000 000 and 40 000 000 ns')],
      [{ en: 'The opening frame that carries the grid', zh: '带着这张网格的那帧开场帧' }, N('Poll, 39 octets')],
      [{ en: 'Its first list, 10 octets', zh: '第一张清单，10 字节' }, { en: 'SP1 · DS-TWR · block 0 · round 0 · 4 responders', zh: 'SP1（加扰时间戳序列分组）· DS-TWR · 块 0 · 轮 0 · 4 个应答方' }],
      [{ en: 'Its second list, 15 octets', zh: '第二张清单，15 字节' }, { en: '4 devices: anchor-1 slot 1, anchor-2 slot 2, anchor-3 slot 3, anchor-4 slot 4', zh: '4 台设备：anchor-1 时隙 1、anchor-2 时隙 2、anchor-3 时隙 3、anchor-4 时隙 4' }],
    ] },
    { kind: 'table', heading: { en: 'One fix per phone per block', zh: '每块一部手机一次定位' }, head: [
      { en: 'Phone', zh: '手机' }, { en: 'Its fix in block 0', zh: '它在第 0 块的定位' },
    ], rows: [
      [N('uwb-1'), N('(5.01, 3.99) m at 20 ms')],
      [N('uwb-2'), N('(3.01, 2.52) m at 40 ms')],
      [N('uwb-3'), N('(7.50, 6.01) m at 60 ms')],
    ] },
    { text: {
      en: 'Five fixes a second each, whatever the other two do, and each 2 cm out or better.',
      zh: '每部手机每秒五次定位，另外两部在做什么都不影响，而且每一次的误差都在 2 cm 以内。',
    } },
    { kind: 'table', heading: { en: 'What the radio actually costs', zh: '射频真正的开销' }, head: [
      { en: 'Device', zh: '设备' }, { en: 'Its rounds', zh: '参与的轮次' }, { en: 'Slots it wakes in', zh: '醒来的时隙' },
      { en: 'Radio on in the block', zh: '块内射频开启时长' }, { en: 'Share', zh: '占比' },
    ], rows: [
      [N('uwb-1'), N('1 of 10'), N('10 of 10'), N('1 934 334 ns'), N('0.97 %')],
      [N('anchor-1'), N('3 of 10'), N('4 of 10 × 3'), N('2 448 546 ns'), N('1.22 %')],
    ] },
    { text: {
      en: 'The schedule hands a phone one round in ten and an anchor three; the state lane shows what the radio was on for. The two shares differ tenfold.',
      zh: '时间表分给手机的是十轮中的一轮，分给锚点的是三轮；而状态泳道显示的，是射频真正开着的那点时间。两种占比相差十倍以上。',
    } },
    { kind: 'formula', heading: { en: 'How short a slot may be', zh: '时隙最短能有多短' }, text: {
      en: 'slot ≥ PPDU(Final, N anchors) + 200 ns = 236 603 + 200 = 236 803 ns at N = 4',
      zh: 'slot ≥ PPDU(Final, N anchors) + 200 ns = 236 603 + 200 = 236 803 ns at N = 4',
    }, note: {
      en: 'The editor applies it before a run: a slot must hold the round’s longest frame plus a 200 ns flight guard, 60 m of air. So 2 ms is a profile number, not a computed minimum; that frame uses 11.8 % of its slot.',
      zh: '编辑器在运行之前就会套用它：时隙必须装得下本轮最长的那一帧，再加 200 ns 的飞行余量，相当于 60 m 空气。所以 2 ms 不是算出来的下限，而是规范档案里的取值；它让那一帧只占掉自己时隙的 11.8 %。',
    } },
    { kind: 'table', heading: { en: 'Two slot lengths, one scene', zh: '同一场景，两种时隙长度' }, head: [
      { en: 'Ranging slot', zh: '测距时隙' }, { en: 'Round', zh: '一轮' }, { en: 'Rounds per block', zh: '每块轮数' },
      { en: 'All three phones done', zh: '三部手机全部完成' }, { en: 'Radio on per phone', zh: '每部手机射频开启' },
    ], rows: [
      [N('2 400 RSTU · 2 ms'), N('20.0 ms'), N('10'), N('60 ms'), N('1 934 334 ns')],
      [N('600 RSTU · 0.5 ms'), N('5.0 ms'), N('40'), N('15 ms'), N('1 934 334 ns')],
    ] },
    { text: {
      en: 'The same ten frames, four times closer together — and the radio-on total does not move, to the nanosecond: no frame changed length. A shorter slot buys latency and room for more phones, not battery.',
      zh: '还是那十帧，只是挨得紧了四倍——而射频开启的总时长一纳秒都没动，因为没有任何一帧的长度发生变化。缩短时隙买到的是时延和容纳更多手机的空间，不是电池。',
    } },
    { kind: 'steps', heading: { en: 'How the timetable is written', zh: '这张时间表是怎么写出来的' }, items: [
      { en: 'Two of the three are set before a frame flies and never renegotiated: the block and the slot. The round falls out of them — the method gives the slot count, two per anchor plus two, and the round is that many slots.',
        zh: '三个长度里只有两个是起飞之前就定下、之后再不重议的：块与时隙。轮是从它们里落出来的——测距方法给出时隙数，每个锚点两个再加两个，轮长就是这么多个时隙。' },
      { en: 'Round k goes to phone k in every block, so the three phones take rounds 0, 1 and 2.',
        zh: '第 k 轮归第 k 部手机，每个块都如此；这里的三部手机分到的就是第 0、1、2 轮。' },
      { en: 'A slot’s start is one multiplication, never a negotiation: block number × block, plus round number × round, plus slot number × slot.',
        zh: '一个时隙什么时候开始，是一次乘法，而不是一场商量：块号乘块长，加上轮号乘轮长，再加上时隙号乘时隙长。' },
      { en: 'At each slot start the schedule names the one device that may transmit: slot 0 the phone’s Poll, the next four the anchors’ Responses in order, the sixth the Final, the last four Reports.',
        zh: '每个时隙一开始，时间表就点出唯一有权发送的那台设备：时隙 0 是手机的 Poll，接着四个是各锚点按名单顺序作答的 Response，第六个是 Final，最后四个是各自的 Report。' },
      { en: 'Everyone else compares that name with its own id and listens only for its own; an anchor’s receiver is off through the other anchors’ slots.',
        zh: '其余各台把这个名字与自己的 id 一比，只为属于自己的那几帧开机；在其他锚点的时隙里，一个锚点的接收机是关着的。' },
      { en: 'A device that armed its receiver and heard nothing gets no retry: the wait expires at the slot boundary, the log records the slot and the frame expected, and the round walks on; the Final leaves that anchor out.',
        zh: '打开了接收机却什么也没听到的设备，没有重传可言：等待在时隙边界到期，日志记下是哪个时隙、等的是哪种帧，这一轮照常往下走；随后的 Final 就把那个锚点漏掉了。' },
    ] },
    { kind: 'table', heading: { en: 'Phone 2’s round, located', zh: '第 2 部手机的那一轮，定在时间轴上' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'its block and round', zh: '它的块号与轮号' }, N('0 · 1')],
      [{ en: 'so its round opens at', zh: '于是这一轮开始于' }, N('1 × 20.0 ms = 20 ms')],
      [{ en: 'its Poll leaves in slot 0', zh: '它的 Poll 在时隙 0 发出' }, N('20 000 000 ns')],
      [{ en: 'its Final leaves in slot 5', zh: '它的 Final 在时隙 5 发出' }, N('30 000 000 ns')],
      [{ en: 'its round ends, its fix lands', zh: '这一轮结束，定位随之落下' }, N('40 000 000 ns')],
    ] },
  ],
  deeper: [
    { heading: { en: 'The floor under every slot', zh: '每个时隙脚下的那条下限' }, text: {
      en: 'The fit rule above is not what stops you shortening this slot. The scenario schema also puts a floor of 300 RSTU under any slot: 282 RSTU (235.0 µs) is refused twice, by the floor and by the fit rule, while 285 RSTU (237.5 µs) clears the fit rule by 697 ns and is still refused by the floor. The shortest slot this scene accepts is therefore 300 RSTU, 250.0 µs. The fit rule only overtakes the floor once the Final grows: at six anchors it asks 267 572 ns, which is 324 RSTU.',
      zh: '上面那条容量规则，并不是真正拦住你缩短本场景时隙的东西。场景 schema 还给任何时隙设了 300 RSTU 的下限：282 RSTU（235.0 µs）会被拒绝两次，一次因为下限，一次因为容量规则；而 285 RSTU（237.5 µs）比容量规则还宽出 697 ns，却仍然过不了下限。所以本场景能接受的最短时隙是 300 RSTU，250.0 µs。只有当 Final 变长，容量规则才超过下限：六个锚点时它要 267 572 ns，即 324 RSTU。',
    } },
    { heading: { en: 'Where the 2 ms margin goes', zh: '2 ms 的余量花在哪里' }, text: {
      en: 'A four-anchor Final is 62 octets and 236 603 ns on the air, so a 2 ms slot is nearly nine tenths silence. The margin pays for the leading-edge search a receiver runs before it can call an RMARKER, an anchor’s turnaround from receive to transmit, and schedule drift: here a slot boundary is exact, but 20 ppm across a 200 ms block is 4 µs each way.',
      zh: '四个锚点的 Final 是 62 字节、空口 236 603 ns，所以 2 ms 的时隙里将近九成是静默。这份余量买的是：接收机在判定 RMARKER 之前要做的首径搜索、锚点从收到发的转换时间，以及调度漂移——这里的时隙边界是精确的，但 20 ppm 跨过一个 200 ms 的块就是每边 4 µs。',
    } },
    { heading: { en: 'What the 1 934 334 ns is made of', zh: '1 934 334 ns 是怎么凑出来的' }, text: {
      en: 'The phone takes part in all ten slots of its round, and its 1 934 334 ns is exactly the round’s airtime, 1 934 230 ns, plus 13 ns of flight for each of the eight frames it receives. The anchor is cheaper still: it hears the Poll, sends its Response, hears the Final, sends its Report — four wake-ups in ten slots, 816 180 ns in the first round — and is deaf through the other anchors’ slots. Three rounds, differing by nanoseconds of flight, make 2 448 546 ns.',
      zh: '手机参与自己那一轮的全部十个时隙，它的 1 934 334 ns 恰好是这一轮的空口时间 1 934 230 ns，再加上它接收的八帧、每帧 13 ns 的飞行时间。锚点还要更省：它听 Poll、发 Response、听 Final、发 Report——十个时隙里醒来四次，第一轮 816 180 ns——在其他锚点的时隙里则是聋的。三轮之间因飞行时间差着几纳秒，合计 2 448 546 ns。',
    } },
  ],
  sources: [
    { en: 'IEEE Std 802.15.4-2024 §10.32.2 defines the ranging block, the ranging round and the ranging slot, and counts a block and a slot in whole 3-RSTU units; §10.29.1.5 and Table 10-145 fix the RSTU at 416 chips, which is 833.333 ns at 499.2 Mchip/s.',
      zh: 'IEEE Std 802.15.4-2024 的 §10.32.2 定义了测距块、测距轮与测距时隙，并规定块长与时隙长都以整数个 3 RSTU 计；§10.29.1.5 与表 10-145 把 RSTU 定为 416 个码片，在 499.2 Mchip/s 下即 833.333 ns。' },
    { en: 'The two lists the opening frame carries are information elements: the ARC IE of §10.32.9.1, which places the round in the session, and the RDM IE of §10.32.9.8, which seats each responder.',
      zh: '开场帧携带的那两张清单是信息元素：§10.32.9.1 的 ARC IE 把本轮定位在会话之中，§10.32.9.8 的 RDM IE 则逐一安排每个应答方的座位。' },
    { en: 'The 2 ms ranging slot and the 200 ms ranging block are FiRa profile numbers, not the standard’s.',
      zh: '2 ms 的测距时隙与 200 ms 的测距块是 FiRa 规范档案里的取值，不是标准正文。' },
    { en: 'Two numbers are the simulator’s own model choices: the 200 ns of flight guard the slot-fit rule adds to the longest frame, and the floor of 300 RSTU the scenario schema puts under any slot. The nine anchors one Final can list is neither — a 14 + 12N Final at ten anchors is 134 octets, past the 127-octet limit on a payload.',
      zh: '有两个数字是仿真器自己的模型取值：时隙容量规则在最长帧之外追加的 200 ns 飞行余量，以及场景 schema 给任何时隙设下的 300 RSTU 下限。一帧 Final 最多列九个锚点则不是选出来的：14 + 12N 的 Final 在十个锚点时是 134 字节，超过了负载 127 字节的上限。' },
  ],
  scenario: () => uwbBlocksScenario(2400),
  variants: [
    { label: { en: '0.5 ms slots', zh: '0.5 ms 时隙' }, scenario: () => uwbBlocksScenario(600) },
  ],
  jumps: [
    J('the first Poll, on the slot boundary', '第一帧 Poll，压在时隙边界上', firstUwbPoll),
    J('the first phone’s fix', '第一部手机的定位', firstUwbPosition),
    J('its round ends', '它的轮次结束', firstUwbRoundEnd),
    J('the second phone’s round opens', '第二部手机的轮次开始', secondTagRound),
    J('the block repeats', '整个块重新开始', nextBlock),
  ],
  observe: [
    { en: 'The round line names the phone, its round, the block and the method, then the slots and their length. Rounds open one after another, one per phone, and when the third is done the block starts over.',
      zh: '整轮那一行依次写出手机、它的轮次、所在的块、所用的方法，再写出时隙数和时隙长度。各轮一个接一个开启，一部手机一轮；第三部做完，整个块又从头开始。' },
    { en: 'Every transmission sits on a slot boundary, to the nanosecond. There is no interframe space, no backoff draw and no NAV anywhere on these lanes — and the seven rounds nobody owns never open at all.',
      zh: '每一次发送都压在时隙边界上，精确到纳秒。这些泳道上没有帧间间隔、没有退避取值，也没有 NAV——而那七个没有主人的轮次，从头到尾都不曾开启。' },
  ],
  tryThis: [
    { en: 'Load “0.5 ms slots” and watch the block empty out: the three rounds finish by 15 ms, the fixes land at 5, 10 and 15 ms, and the editor plans 40 rounds per block instead of ten.',
      zh: '载入“0.5 ms 时隙”，看这个块如何空了下来：三个轮次到 15 ms 就做完，定位落在 5、10、15 ms，而编辑器规划出每块 40 轮，不再是十轮。' },
    { en: 'Open the scenario editor, delete an anchor and read the UWB session section: “slots per round 8 · rounds per block 12”, because a round of this method is 2N + 2 slots. Then type 285 into the slot field and leave it: it snaps to 300.',
      zh: '打开场景编辑器，删掉一个锚点，再看 UWB 会话那一栏：“每轮 8 个时隙 · 每块 12 轮”，因为本方法的一轮是 2N + 2 个时隙。然后在时隙那一栏输入 285 再移开焦点：它会跳到 300。' },
  ],
  quiz: [
    {
      q: { en: 'A phone owns a tenth of the block and an anchor three tenths, yet the radio time on their lanes is 0.97 % and 1.22 %. Why?', zh: '一部手机占了块的十分之一，锚点占十分之三，可泳道上实测的射频开启时间只有 0.97 % 与 1.22 %。为什么？' },
      options: [
        { en: 'The state lane samples the radio, so short spans are missed', zh: '状态泳道是对射频采样的，短的区间会被漏掉' },
        { en: 'A device arms its receiver at a slot boundary and switches it off the moment the expected frame lands: it pays for airtime, not for the slots it owns', zh: '设备在时隙边界打开接收机，并在预期的那一帧落地时立刻关掉：它付的是空口时间的账，不是所占时隙的账' },
        { en: 'The block’s seven empty rounds are skipped, and that is where the difference goes', zh: '块里那七个空轮被跳过了，差额就出在那里' },
      ],
      answer: 1,
      explain: { en: 'The phone’s radio time is its round’s whole airtime plus a few nanoseconds of flight per reception. The anchor is deaf through the other anchors’ slots, waking four times in a ten-slot round.', zh: '手机的射频开启时间就是整轮的空口时间，加上每次接收那几纳秒的飞行时间。锚点在其他锚点的时隙里是聋的，十个时隙的一轮里只醒来四次。' },
    },
    {
      q: { en: 'Shortening the ranging slot from 2 ms to 0.5 ms — what does it change?', zh: '把测距时隙从 2 ms 缩到 0.5 ms，改变了什么？' },
      options: [
        { en: 'The radio-on time falls with it, to roughly a quarter', zh: '射频开启时长随之下降，大约变成四分之一' },
        { en: 'Nothing that matters: the rounds and the fixes are identical', zh: '没有什么要紧的改变：轮次和定位都一模一样' },
        { en: 'The round falls to 5.0 ms and the block holds 40 rounds instead of 10 — sooner fixes, more phones — while the radio-on total stays where it was', zh: '一轮缩到 5.0 ms，一个块装 40 轮而不是 10 轮——定位更快、手机更多——而射频开启的总时长原地不动' },
      ],
      answer: 2,
      explain: { en: 'No frame changed length, so no energy changed. Slot length buys latency and capacity, and is bounded below by the longest frame it must carry.', zh: '没有任何一帧的长度发生变化，功耗自然也没变。时隙长度买到的是时延与容量，而它的下界由必须装下的最长一帧决定。' },
    },
  ],
}
