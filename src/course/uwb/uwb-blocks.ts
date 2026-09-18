/**
 * UWB Tier 1 · M12 · Ranging sessions and positioning · Blocks, rounds and slots.
 *
 * The first three lessons measured one distance, then four, inside a single
 * round. This one zooms out to the grid that round sits in: a ranging block of
 * 200 ms, ten rounds inside it, ten slots inside each round, and three tags
 * that never once collide because the schedule was fixed before the first frame
 * flew. The pay-off is measured rather than asserted — a tag owns 10 % of the
 * block and an anchor serves 30 % of it, yet their radios are on for 0.97 % and
 * 1.22 % of it. Every number quoted below is pinned in
 * tests/course/uwb-blocks.test.ts.
 *
 * CAUTION — word budget: `lessonMinutes` rounds to 25 minutes anywhere between
 * 975 and 1724 English words across body + observe + tryThis + quiz (4 observe
 * items and 2 experiments already account for 16 of those minutes). At 1725 the
 * rounding tips to 30, and the study-time test pins that ceiling. The prose
 * below totals 1714 words, so there is room for ten more and no more:
 * adding a sentence means deleting one.
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
 * Lesson 2's four anchors, on the same 3.50 m ring around (5, 4) at 2.20 m, now
 * serving three phones at desk height: one under the ring's centre and two off
 * to the sides. The anchors are unchanged on purpose — what this lesson varies
 * is the session's own grid, not the geometry — and the only knob the variant
 * turns is the ranging slot.
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
  body: [
    { text: {
      en: 'IEEE Std 802.15.4-2024 is the source for the shape of this lesson. §10.32.2 defines the ranging block, the ranging round and the ranging slot, and counts a block and a slot in whole 3-RSTU units; §10.29.1.5 and Table 10-145 fix the RSTU at 416 chips, which is 833.333 ns at 499.2 Mchip/s. The schedule rides in two elements: the ARC IE of §10.32.9.1 and the RDM IE of §10.32.9.8, which seats each responder. The 2 ms slot and the 200 ms block are FiRa profile numbers. Three are the model’s own: the 200 ns of flight guard the slot-fit rule adds to the longest frame, the floor of 300 RSTU the schema puts under any slot, and the nine anchors one Final can list.',
      zh: 'IEEE Std 802.15.4-2024 是本课内容的依据。§10.32.2 定义了测距块、测距轮与测距时隙，并规定块长与时隙长都以整数个 3 RSTU 计；§10.29.1.5 与表 10-145 则把 RSTU 定为 416 个码片，在 499.2 Mchip/s 下即 833.333 ns。调度表随两个信息元素一起飞：§10.32.9.1 的 ARC IE，以及 §10.32.9.8 的 RDM IE——后者逐一点名应答方及分配给它的时隙。2 ms 的时隙与 200 ms 的块来自 FiRa 的规范档案。另有三个数字是仿真器自己的模型取值：时隙容量规则在最长帧之外追加的 200 ns 飞行余量、schema 给任何时隙设下的 300 RSTU 下限，以及一帧 Final 最多能列出的九个锚点。',
    } },
    { heading: { en: 'Three nested clocks', zh: '三重嵌套的节拍' }, text: {
      en: 'A scheduled ranging session is a grid fixed before the first frame flies: a ranging block that repeats for the session’s life, rounds inside the block, slots inside a round, one frame each. Nothing contends for the medium — no backoff, no NAV, no retry — so every device knows the instant of every frame it will send before the session starts.',
      zh: '一次被调度的测距会话就是一张在第一帧起飞之前便已钉死的网格：一个只要会话还活着就不断循环的测距块，块里装着轮，轮里装着时隙，一个时隙一帧。这里没有任何东西要竞争信道——没有退避、没有 NAV、没有重传——所以会话开始之前，每台设备就已经知道自己要发的每一帧发生在哪一刻。',
    } },
    { kind: 'table', head: [
      { en: 'Level', zh: '层级' }, { en: 'RSTU', zh: 'RSTU' }, { en: 'Duration', zh: '时长' }, { en: 'What owns it', zh: '归谁所有' },
    ], rows: [
      [{ en: 'Ranging block', zh: '测距块' }, N('240 000'), N('200.0 ms'), { en: 'the session; it repeats forever', zh: '整个会话；无限循环' }],
      [{ en: 'Ranging round', zh: '测距轮' }, N('24 000'), N('20.0 ms'), { en: 'one tag: tag k owns round k', zh: '一个标签：第 k 个标签占用第 k 轮' }],
      [{ en: 'Ranging slot', zh: '测距时隙' }, N('2 400'), N('2 000.0 µs'), { en: 'one device, one frame', zh: '一台设备，一帧' }],
    ] },
    { text: {
      en: 'Ten rounds fit inside the block and this scene holds three tags, so rounds 0, 1 and 2 belong to uwb-1, uwb-2 and uwb-3 while rounds 3 to 9 — 140 ms of every block — stay empty. Each phone gets exactly one fix per block, five a second, whatever the other two do. A fourth tag would cost nothing but round 3; the block breaks only at the eleventh.',
      zh: '一个块里装得下十轮，而本场景有三个标签，于是第 0、1、2 轮分别属于 uwb-1、uwb-2、uwb-3，第 3 到 9 轮——每个块里的 140 ms——空着。因此每部手机每个块恰好得到一次定位，每秒五次，另外两部在做什么都不影响。再加一个标签，代价不过是第 3 轮；要到第十一个标签，这个块才装不下。',
    } },
    { heading: { en: 'The schedule travels in the Poll', zh: '调度表随 Poll 一起飞' }, text: {
      en: 'The grid is not something the anchors were born knowing: it rides in the tag’s Poll, 39 octets, in two information elements. The ARC IE, 10 octets, says where in the session the frame sits — “SP1 · DS-TWR · block 0 · round 0 · 4 responders”. The RDM IE, 15 octets, is the seating plan — “4 devices: anchor-1 slot 1, anchor-2 slot 2, anchor-3 slot 3, anchor-4 slot 4” — three octets per device, a short address and a slot index. One Poll tells an anchor which slots to answer in, and which six to sleep through.',
      zh: '这张网格并不是锚点与生俱来的配置，它随标签的 Poll 一起飞过来：39 字节，两个信息元素。10 字节的 ARC IE 说明本帧落在会话的什么位置——“SP1 · DS-TWR · block 0 · round 0 · 4 responders”。15 字节的 RDM IE 则是座位表——“4 devices: anchor-1 slot 1, anchor-2 slot 2, anchor-3 slot 3, anchor-4 slot 4”——每台设备三个字节：一个短地址加一个时隙序号。一帧 Poll 就告诉了锚点该在哪几个时隙作答，以及可以安睡过哪六个时隙。',
    } },
    { text: {
      en: 'And every frame leaves at the top of its slot. The standard allows a transmission offset inside the slot; this model uses none, so a TX_START timestamp is its slot’s start to the nanosecond — the three Polls of block 0 at 0, 20 000 000 and 40 000 000 ns. Nothing here waits for an idle medium.',
      zh: '而且每一帧都在自己时隙的起点离开。标准允许在时隙内设置发送偏移；本模型取零偏移，于是 TX_START 的时间戳精确到纳秒就是它那个时隙的起点——第 0 个块的三帧 Poll 分别在 0、20 000 000 与 40 000 000 ns。这里没有谁需要等待信道空闲。',
    } },
    { heading: { en: 'What the radio actually costs', zh: '射频真正的开销' }, text: {
      en: 'Two different shares of the block both get called a duty cycle, and here they differ tenfold and more. The schedule share is what the grid hands a device: a tag owns one round of ten, 20 ms of 200 ms, 10 %, and the anchors serve every round that has a tag — three of them, 60 ms, 30 %. The radio share is what the MAC_STATE lane shows: uwbWait, rx and tx, and nothing else.',
      zh: '有两种很不一样的“占块比例”都被叫作占空比，而在这里它们相差十倍以上。调度占比是网格分给一台设备的份额：标签占十轮中的一轮，200 ms 里的 20 ms，10 %；锚点则要服务每一个有标签的轮次——一共三轮，60 ms，30 %。射频占比则是 MAC_STATE 泳道上真正显示的东西：uwbWait、rx 与 tx，别的都不算。',
    } },
    { kind: 'table', head: [
      { en: 'Device', zh: '设备' }, { en: 'Its rounds', zh: '参与的轮次' }, { en: 'Slots it wakes in', zh: '醒来的时隙' },
      { en: 'Radio on in the block', zh: '块内射频开启时长' }, { en: 'Share', zh: '占比' },
    ], rows: [
      [N('uwb-1'), N('1 of 10'), N('10 of 10'), N('1 934 334 ns'), N('0.97 %')],
      [N('anchor-1'), N('3 of 10'), N('4 of 10 × 3'), N('2 448 546 ns'), N('1.22 %')],
    ] },
    { text: {
      en: 'The receiver is armed at the start of a slot the device expects a frame in and switched off the moment that frame lands, so a slot costs its frame’s airtime and nothing else. The tag takes part in all ten slots of its round, and its 1 934 334 ns is exactly the round’s airtime, 1 934 230 ns, plus 13 ns of flight for each of the eight frames it receives. The anchor is cheaper still: it hears the Poll, sends its Response, hears the Final, sends its Report — four wake-ups in ten slots, 816 180 ns in the first — and is deaf through the other anchors’ slots. Three rounds, differing by nanoseconds of flight, make 2 448 546 ns.',
      zh: '设备只在“预期有帧到来”的时隙起点打开接收机，并在该帧落地的那一刻关掉它，因此一个时隙的代价就是那一帧的空口时间，别无其他。标签参与自己那一轮的全部十个时隙，它的 1 934 334 ns 恰好就是这一轮的空口时间 1 934 230 ns，再加上它所接收的八帧、每帧 13 ns 的飞行时间。锚点还要更省：它听 Poll、发 Response、听 Final、发 Report——十个时隙里醒来四次，第一轮 816 180 ns——而在其他锚点的时隙里是聋的。三轮之间因飞行时间差着几纳秒，合计 2 448 546 ns。',
    } },
    { heading: { en: 'Why a 2 ms slot for a 237 µs frame', zh: '为什么 237 µs 的帧要配 2 ms 的时隙' }, text: {
      en: 'A slot has to hold the round’s longest frame plus its flight. In a DS round that is the Final — 62 octets for four anchors, 236 603 ns on the air — and the model adds a 200 ns guard, which is 60 m of flight.',
      zh: '一个时隙必须装得下本轮最长的那一帧，外加它的飞行时间。在 DS 轮里那就是 Final——四个锚点时 62 字节，空口 236 603 ns——模型再加 200 ns 的余量，相当于 60 m 的飞行距离。',
    } },
    { kind: 'formula', text: {
      en: 'slot ≥ PPDU(Final, N anchors) + 200 ns = 236 603 + 200 = 236 803 ns at N = 4',
      zh: 'slot ≥ PPDU(Final, N anchors) + 200 ns = 236 603 + 200 = 236 803 ns at N = 4',
    }, note: {
      en: 'That is the schema’s slot-fit rule, and it is not what stops you shortening this slot. The schema also puts a floor of 300 RSTU under every slot: 282 RSTU (235.0 µs) is refused twice, by the floor and by the fit rule, while 285 RSTU (237.5 µs) clears the fit rule by 697 ns and is still refused by the floor. The shortest slot this scene accepts is 300 RSTU, 250.0 µs. The fit rule only binds once the Final grows: at six anchors it asks 267 572 ns, which is 324 RSTU, past the floor. A slot too short is caught before the run because at run time nobody can report it: the deadline fires before the frame lands, and the log says only that nobody answered.',
      zh: '这就是 schema 的时隙容量规则；不过真正拦住你缩短本场景时隙的并不是它。schema 还给每个时隙设了 300 RSTU 的下限：282 RSTU（235.0 µs）会被拒绝两次，一次因为下限，一次因为容量规则；而 285 RSTU（237.5 µs）比容量规则还宽出 697 ns，却仍然过不了下限。本场景能接受的最短时隙是 300 RSTU，250.0 µs。只有当 Final 变长，容量规则才真正起作用：六个锚点时它要 267 572 ns，即 324 RSTU，已经越过下限。时隙太短必须在运行之前就被拦下，因为到了运行时它根本不是谁能报出来的错误——截止时刻先于帧的到达触发，而日志只会说“没人应答”。',
    } },
    { text: {
      en: 'So 2 ms is not a computed minimum but a profile number, and it leaves the Final on 11.8 % of its own slot. The margin pays for what this model leaves out: the leading-edge search a receiver runs before it can call an RMARKER, an anchor’s turnaround from receive to transmit, and schedule drift — here a slot boundary is exact, but 20 ppm across 200 ms is 4 µs each way.',
      zh: '所以 2 ms 并不是算出来的下限，而是一个规范档案里的取值，它让 Final 只占掉自己时隙的 11.8 %。这份余量买的是本模型略去的那些东西：接收机在判定 RMARKER 之前要做的首径搜索、锚点从收到发的转换时间，以及调度本身的漂移——这里的时隙边界是精确的，但 20 ppm 跨 200 ms 是每边 4 µs。',
    } },
    { heading: { en: 'Shorter slots', zh: '把时隙缩短' }, text: {
      en: 'Load “0.5 ms slots”. At 600 RSTU the round falls to 5.0 ms, all three tags are finished 15 ms into a 200 ms block, and 40 rounds fit where 10 did. The fixes arrive at 5, 10 and 15 ms instead of 20, 40 and 60 — the same ten frames, closer together. The radio-on total does not move — 1 934 334 ns, 0.97 % of the block, to the nanosecond — because no frame changed length. Shortening a slot buys latency and room for more tags, not battery.',
      zh: '载入“0.5 ms 时隙”。600 RSTU 让一轮缩到 5.0 ms，三个标签在 200 ms 的块里 15 ms 就全部做完，原本只装得下 10 轮的地方现在能装 40 轮。定位结果落在 5、10、15 ms，而不再是 20、40、60 ms——同样十帧，只是挨得更紧。射频开启时长纹丝不动——1 934 334 ns，占块的 0.97 %，一纳秒都不差——因为没有任何一帧的长度发生变化。缩短时隙买到的是时延和更多标签的容纳空间，不是电池。',
    } },
  ],
  scenario: () => uwbBlocksScenario(2400),
  variants: [
    { label: { en: '0.5 ms slots', zh: '0.5 ms 时隙' }, scenario: () => uwbBlocksScenario(600) },
  ],
  jumps: [
    J('the first Poll, on the slot boundary', '第一帧 Poll，压在时隙边界上', firstUwbPoll),
    J('the first tag’s fix', '第一个标签的定位', firstUwbPosition),
    J('its round ends', '它的轮次结束', firstUwbRoundEnd),
    J('the second tag’s round opens', '第二个标签的轮次开始', secondTagRound),
    J('the block repeats', '整个块重新开始', nextBlock),
  ],
  observe: [
    { en: 'The round line reads “uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs”. Rounds open at 0, 20 and 40 ms, one per tag, and then the block repeats: uwb-1 at 200 ms, uwb-2 at 220, uwb-3 at 240. Rounds 3 to 9 never open.',
      zh: '整轮那一行写着 “uwb-1 UWB round 0 of block 0 (DS-TWR): 10 slots × 2000.0 µs”。轮次在 0、20、40 ms 依次开启，一个标签一轮，然后整个块重来一遍：uwb-1 在 200 ms、uwb-2 在 220 ms、uwb-3 在 240 ms。第 3 到 9 轮从未开启。' },
    { en: 'Every transmission sits on a slot boundary: the three Polls of block 0 leave at 0, 20 000 000 and 40 000 000 ns exactly, and there is no IFS, no backoff draw and no NAV on these lanes.',
      zh: '每一次发送都压在时隙边界上：第 0 个块的三帧 Poll 恰好在 0、20 000 000 与 40 000 000 ns 离开，而这些泳道上没有 IFS、没有退避取值，也没有 NAV。' },
    { en: 'Open the Poll — 39 octets. The ARC IE, 10 octets, reads “SP1 · DS-TWR · block 0 · round 0 · 4 responders”; the RDM IE, 15 octets, reads “4 devices: anchor-1 slot 1, anchor-2 slot 2, anchor-3 slot 3, anchor-4 slot 4”. One frame, the whole round’s schedule.',
      zh: '打开这帧 Poll——39 字节。10 字节的 ARC IE 写着 “SP1 · DS-TWR · block 0 · round 0 · 4 responders”；15 字节的 RDM IE 写着 “4 devices: anchor-1 slot 1, anchor-2 slot 2, anchor-3 slot 3, anchor-4 slot 4”。一帧，装下整轮的调度表。' },
    { en: 'Each tag’s lane carries one fix at the end of its own round and nothing in between: uwb-1 at (5.01, 3.99) m at 20 ms, GDOP 1.06; uwb-2 at (3.01, 2.52) m at 40 ms, 1.08; uwb-3 at (7.50, 6.01) m at 60 ms, 1.06. Each phone is 2 cm out or better, once per block.',
      zh: '每个标签的泳道上只在自己轮次的末尾有一次定位，中间什么也没有：uwb-1 在 20 ms 给出 (5.01, 3.99) m、GDOP 1.06；uwb-2 在 40 ms 给出 (3.01, 2.52) m、1.08；uwb-3 在 60 ms 给出 (7.50, 6.01) m、1.06。每部手机的误差都在 2 cm 以内，每块一次。' },
  ],
  tryThis: [
    { en: 'Load “0.5 ms slots” and watch the block empty out: the three rounds finish by 15 ms, the fixes land at 5, 10 and 15 ms, and the editor’s session section plans 40 rounds per block instead of 10. Compare the lanes with the base run — the same ten frames, four times closer together, and each tag’s radio-on still 1 934 334 ns.',
      zh: '载入“0.5 ms 时隙”，看这个块如何空了下来：三个轮次到 15 ms 就做完，定位落在 5、10、15 ms，编辑器里会话那一栏现在规划出每块 40 轮而不是 10 轮。再把泳道与基准运行对照——还是那十帧，只是紧凑了四倍，而每个标签的射频开启时长依旧是 1 934 334 ns。' },
    { en: 'Open the scenario editor, delete anchor-4 and read the UWB session section: “slots per round 8 · rounds per block 12”, because a DS round is 2N + 2 slots — a 16 ms round, and a Final 12 octets shorter. Then type 285 into the slot field and leave it: it snaps to 300, the floor under every slot.',
      zh: '打开场景编辑器，删掉 anchor-4，再看 UWB 会话那一栏：“slots per round 8 · rounds per block 12”，因为一个 DS 轮是 2N + 2 个时隙——一轮 16 ms，Final 也短了 12 字节。然后在时隙那一栏里输入 285 再移开焦点：它会跳到 300，也就是每个时隙的那条下限。' },
  ],
  quiz: [
    {
      q: { en: 'A tag owns 10 % of the block and the anchors 30 %, yet the radio time measured on their lanes is 0.97 % and 1.22 %. Why?', zh: '标签占了块的 10 %，锚点占 30 %，可泳道上实测的射频开启时间只有 0.97 % 与 1.22 %。为什么？' },
      options: [
        { en: 'The MAC_STATE lane samples the radio, so short spans are missed', zh: 'MAC_STATE 泳道是对射频采样的，短的区间会被漏掉' },
        { en: 'A device arms its receiver at a slot boundary and switches it off the moment the expected frame lands: it pays for airtime, not for the slots it owns', zh: '设备在时隙边界打开接收机，并在预期的那一帧落地时立刻关掉：它付的是空口时间的账，不是所占时隙的账' },
        { en: 'The block’s seven empty rounds are skipped, and that is where the difference goes', zh: '块里那七个空轮被跳过了，差额就出在那里' },
      ],
      answer: 1,
      explain: { en: 'The tag’s 1 934 334 ns is its round’s whole airtime plus 13 ns of flight per reception. The anchor is deaf through the other anchors’ slots, waking four times in a ten-slot round.', zh: '标签的 1 934 334 ns 就是整轮的空口时间，加上每次接收 13 ns 的飞行时间。锚点在其他锚点的时隙里是聋的，十个时隙的一轮里只醒来四次。' },
    },
    {
      q: { en: 'Shortening the ranging slot from 2 ms to 0.5 ms — what does it change?', zh: '把测距时隙从 2 ms 缩到 0.5 ms，改变了什么？' },
      options: [
        { en: 'The radio-on time falls with it, to roughly a quarter', zh: '射频开启时长随之下降，大约变成四分之一' },
        { en: 'Nothing that matters: the rounds and the fixes are identical', zh: '没有什么要紧的改变：轮次和定位都一模一样' },
        { en: 'The round falls to 5.0 ms and the block holds 40 rounds instead of 10 — sooner fixes, more tags — while the radio-on stays at 1 934 334 ns', zh: '一轮缩到 5.0 ms，一个块装 40 轮而不是 10 轮——定位更快、标签更多——而射频开启时长仍是 1 934 334 ns' },
      ],
      answer: 2,
      explain: { en: 'No frame changed length, so no energy changed. Slot length buys latency and capacity, and is bounded below by the longest frame it must carry.', zh: '没有任何一帧的长度发生变化，功耗自然也没变。时隙长度买到的是时延与容量，而它的下界由必须装下的最长一帧决定。' },
    },
    {
      q: { en: 'A four-anchor Final plus its guard needs 236 803 ns. Why does the schema refuse a 285 RSTU slot, which is 237 500 ns?', zh: '四个锚点的 Final 加上余量需要 236 803 ns。285 RSTU 的时隙是 237 500 ns，schema 为什么还是拒绝它？' },
      options: [
        { en: 'Because 285 is not a whole number of 3-RSTU units', zh: '因为 285 不是 3 RSTU 的整数倍' },
        { en: 'Because the fit rule is computed from the Poll, not the Final', zh: '因为容量规则是按 Poll 而不是 Final 算的' },
        { en: 'Because the fit rule is not the only one: the schema puts a floor of 300 RSTU under every slot', zh: '因为容量规则不是唯一的一条：schema 给每个时隙设了 300 RSTU 的下限' },
      ],
      answer: 2,
      explain: { en: '285 is 95 × 3, and it clears the fit rule by 697 ns; the floor is what refuses it, while 282 fails both. The fit rule only overtakes the floor at six anchors, where the Final asks 324 RSTU.', zh: '285 是 95 × 3，而且比容量规则还宽出 697 ns；拒绝它的是那条下限，282 则两条都不过。只有到六个锚点、Final 要 324 RSTU 时，容量规则才超过下限。' },
    },
  ],
}
