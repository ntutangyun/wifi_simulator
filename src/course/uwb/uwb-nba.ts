/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · A second radio does the talking.
 *
 * The first half of the old `uwb-nba`: what the narrowband control radio is for,
 * what it says in one round, and what that costs in airtime. The coexistence
 * half — the listen-before-talk rule, the channel plan, the hop and the price
 * the Wi-Fi link pays — is next door in `uwb-nba-coexist`, which loads exactly
 * this scene and these three variants, so the split adds no new scenario and the
 * recorded hashes of the two ids are equal, value for value.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the two
 * radios and the poll/response/report cycle in plain words first, the message
 * sizes and the block-0 timeline after them, the compressed formats in `deeper`,
 * the clause, the contributions and the model's own constants in `sources`.
 * Every number quoted below is pinned in tests/course/uwb-nba.test.ts;
 * `npx tsx scripts/lesson-dump.ts uwb-nba en` prints the section budgets.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import {
  J, LESSON_6G_WIDTH_MHZ, N, anchor, firstNbPoll, firstNbReport, firstUwbRange,
  firstUwbTrain, node, oneRoom, uwbSc, uwbTag, wifi6g, type Lesson,
} from '../lessonKit'

/** Which scene the lesson runs: one control channel inside the router's 80 MHz, one outside,
 * an allow list of four, or the inside channel with the listen-before-talk rule switched off. */
export type UwbNbaVariant = 'base' | 'outside' | 'hop' | 'noLbt'

/** Channel 71 of the 6 GHz plan — the coexistence lesson's Wi-Fi 7 router, 80 MHz over
 * 6265–6345 MHz. The channelization is the 6 GHz one the lesson names, not a generation. */
export const WIFI_6G_CENTER_MHZ = 6305
/** The narrowband allow list each scene runs: 200 is 6301.25 MHz (inside the router's channel),
 * 100 is 6051.25 MHz (outside), and the hop list mixes two of each — 210 is 6326.25 MHz, also
 * inside, and 150 is 6176.25 MHz, also outside. */
export const NBA_CHANNELS: Record<UwbNbaVariant, number[]> = {
  base: [200], outside: [100], hop: [100, 150, 200, 210], noLbt: [200],
}

/** Anchors on the ceiling, the tag at chest height — the two planes of every UWB lesson. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0
/** The four corners of the 10 × 8 m room, as the positioning and coexistence lessons place them. */
export const NBA_ANCHORS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5 },
  { id: 'anchor-2', name: 'Anchor 2', x: 9.5, y: 0.5 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.5, y: 7.5 },
  { id: 'anchor-4', name: 'Anchor 4', x: 9.5, y: 7.5 },
]
/** The tag, 1.50 m from the router in three dimensions — the distance the whole lesson turns on. */
export const TAG_POS = { x: 4, y: 3.5 }
/** The router, at the middle of the room and 2 m up. */
export const ROUTER_POS = { x: 5, y: 4, z: 2.0 }
/** The laptop backing up flat out, 3.35 m from the tag. */
export const LAPTOP_POS = { x: 7, y: 5 }

/**
 * The coexistence lesson's room and its two Wi-Fi devices — a Wi-Fi 7 router on 6 GHz
 * channel 71 and a saturated laptop — with an MMS session on top: four
 * corner anchors, one tag, UWB **channel 9** so the ranging frames themselves cannot meet
 * 6 GHz Wi-Fi, and `report: 'bi'` so both ends of a pair round have a narrowband message of
 * their own to get out. Only the narrowband control radio couples with Wi-Fi here, which is
 * the point: everything that goes wrong in `uwb-nba-coexist` goes wrong on 2.5 MHz.
 *
 * The Wi-Fi nodes are listed first, so the 6 GHz link is built — and its mediator decided —
 * before the ranging session asks for one.
 */
export function uwbNbaScenario(variant: UwbNbaVariant = 'base'): Scenario {
  const ap = node('ap', 'Router', 'ap', ROUTER_POS.x, ROUTER_POS.y, 'eht', 'idle',
    { edca: true, txop: true, ampdu: true }, ROUTER_POS.z)
  ap.caps.widthMhz = LESSON_6G_WIDTH_MHZ
  const laptop = wifi6g('laptop', 'Laptop', LAPTOP_POS.x, LAPTOP_POS.y, 'saturated')
  return uwbSc(
    oneRoom(),
    [
      ap, laptop,
      ...NBA_ANCHORS.map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z)),
      uwbTag('uwb-1', 'Phone', TAG_POS.x, TAG_POS.y, TAG_Z),
    ],
    {
      mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: true, channel: 9,
      mms: {
        ...DEFAULT_UWB_SESSION.mms, nbChannels: NBA_CHANNELS[variant],
        nbLbt: variant === 'noLbt' ? 'off' : 'auto', report: 'bi',
      },
    },
    { sixGhzCenterMhz: WIFI_6G_CENTER_MHZ },
  )
}

export const uwbNba: Lesson = {
  id: 'uwb-nba',
  module: 15,
  title: { en: 'A second radio does the talking', zh: '另一部电台负责开口说话' },
  why: {
    en: 'A ranging device measures time; it does not negotiate. Somebody still has to say who is asking whom, and whether the answer was heard at all. Doing that on the wide ranging radio would spend its airtime on words instead of on measurements. So the device carries a second, much smaller radio beside it, and this lesson follows what that radio says in one round.',
    zh: '测距设备做的是量时间，它并不商量事情。可总得有人说清楚：是谁在问谁，对方到底有没有听见。若把这些话交给那部宽带测距电台去说，它的空口时间就会花在字句上，而不是花在测量上。于是设备在它旁边又带了一部小得多的电台。这一课要跟着这部小电台，听它在一轮测距里究竟说了些什么。',
  },
  outcomes: [
    { en: 'name the three messages the small radio sends in one round, in order',
      zh: '按顺序说出小电台在一轮里发的那三条消息' },
    { en: 'say why the timing and the talking travel on two different radios',
      zh: '说清为什么“计时”和“说话”要分在两部电台上走' },
    { en: 'read one of those messages off the timeline and give its length in microseconds',
      zh: '从时间线上读出其中一条消息，并说出它占了多少微秒' },
  ],
  needs: ['uwb-mms'],
  terms: [
    { term: 'narrowband', plain: {
      en: 'a radio using a thin slice of spectrum: slow, but it reaches far and costs almost nothing',
      zh: '只占一薄片频谱的电台：速率很低，但传得远，也几乎不花什么成本',
    } },
    { term: 'NB', plain: {
      en: 'how the log labels anything belonging to that second radio',
      zh: '日志里凡是属于那部小电台的东西，都用这两个字母打头',
    } },
    { term: 'Poll', plain: {
      en: 'the message that opens a round: the asker names the device it wants to measure against',
      zh: '开启一轮的那条消息：发问的一方点名说它要和谁量距离',
    } },
    { term: 'Response', plain: {
      en: 'the answer that says the poll was heard, so both ends know the round is really on',
      zh: '回说“我听见了”的那条消息，两端由此都确认这一轮真的开始了',
    } },
    { term: 'Report', plain: {
      en: 'the closing message: it carries the reply time the distance is computed from',
      zh: '收尾的那条消息：它捎回用来算距离的那段回复时延',
    } },
  ],
  picture: [
    { heading: { en: 'Two radios, two jobs', zh: '两部电台，两份差事' }, text: {
      en: 'A ranging frame is built to be placed in time, not to carry words. Ask it to hold a conversation as well and every sentence eats airtime the measurement wanted. So the device carries a second radio beside the wide one: a narrowband radio, on a thin slice of spectrum, slow but cheap and far-reaching. The wide radio keeps the timing; the small one does the talking, and the log marks everything of its own with NB.',
      zh: '一帧测距帧生来是为了在时间上占住一个位置，而不是为了捎话。若还要它顺便把话也说了，每一句都要吃掉本该留给测量的空口时间。于是设备在那部宽带电台旁边又放了一部：一部窄带电台，只占一薄片频谱，速率低，却便宜、传得远。宽带那部管计时，小的这部管说话；日志里凡是它的东西，都以 NB 打头。',
    } },
    { kind: 'steps', heading: { en: 'What the small radio says in one round', zh: '一轮里小电台说的话' }, items: [
      { en: 'Poll — the asker opens the round and names the device that should answer',
        zh: 'Poll——发问的一方开启这一轮，并点名该由谁作答' },
      { en: 'Response — the named device says it heard, so both ends know the round is on',
        zh: 'Response——被点名的一方说自己听见了，两端于是都知道这一轮成立' },
      { en: 'then the fragments, on the wide radio: the only part of the round that is measured',
        zh: '接着是那串片段，走宽带电台：整轮里唯一被真正测量的部分' },
      { en: 'Report — the answering device sends back its reply time, and the asker turns the pair of stamps into a distance',
        zh: 'Report——作答的一方把自己的回复时延捎回来，发问的一方据此把两个时间戳变成一个距离' },
    ] },
    { kind: 'watch', jump: 0, heading: { en: 'Hear the round open', zh: '听这一轮怎么开场' }, text: {
      en: 'Load the simulation and press play, then jump to the first narrowband message. It goes out before any ranging frame does: a round is arranged on the small radio first and only then measured on the wide one.',
      zh: '载入仿真、按下播放，然后跳到第一条窄带消息。它出现在任何一帧测距帧之前：一轮测距总是先在小电台上谈妥，之后才在宽带电台上量出来。',
    } },
    { heading: { en: 'Why not simply say it on the wide radio', zh: '为什么不干脆在宽带电台上说' }, text: {
      en: 'It could. But a ranging frame’s value is that both ends can name one edge of it to a fraction of a chip, and every byte of conversation pushed into it lengthens the frame without making that edge any sharper. The narrowband radio is slower per byte and still cheaper, because its bytes are not paid for out of the measurement.',
      zh: '也不是不行。只是一帧测距帧的价值，在于两端都能把它的某一道边沿说到码片的零头；而往里塞进去的每一个字节，只会让帧更长，却半点也不会让那道边沿更锐利。窄带电台论字节更慢，可它反而更便宜——因为它的字节不是从测量里扣出来的。',
    } },
    { heading: { en: 'One block, from the outside', zh: '从外面看一个块' }, text: {
      en: 'Watch one ranging block and the shape is easy to see. The poll leaves at the very start; the answer follows a slot later; the fragments cross the room in between; and about twelve milliseconds in the closing message arrives and the asker finally has a distance. Four rounds like that fill a block, one for each anchor in the room.',
      zh: '盯住一个测距块看，形状就很清楚了。Poll 在最开头出发；一个时隙之后，作答的那条消息跟上；片段在这期间穿过房间；大约第十二毫秒上，收尾的那条消息到达，发问的一方这才终于拿到一个距离。四轮这样的对话填满一个块，房间里每个锚点各占一轮。',
    } },
    { heading: { en: 'And then the room goes quiet', zh: '然后房间就安静了' }, text: {
      en: 'In this scene that happens exactly once. The small radio is sharing its slice of spectrum with the Wi-Fi router overhead, and the rule that comes with that band takes the rest of the run away from it. Nothing is wrong with either measurement; the talking simply stops. That is the next lesson, “The narrowband radio shares 6 GHz too”.',
      zh: '在本课的场景里，这件事只发生了一次。那部小电台与头顶的 Wi-Fi 路由器共用着同一薄片频谱，而这个频段附带的规则，把这段运行余下的时间全从它手里拿走了。两边的测量都没毛病，只是话说不出去了。这正是下一课《窄带电台也共享 6 GHz》要讲的事。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'The three messages of a round', zh: '一轮里的三条消息' }, head: [
      { en: 'Message', zh: '消息' }, { en: 'Size', zh: '大小' }, { en: 'On the air', zh: '占用空口' },
      { en: 'What it carries', zh: '捎的是什么' },
    ], rows: [
      [N('Poll'), N('12 B'), N('576.0 µs'), { en: 'who is asking, and of whom', zh: '谁在问，问的是谁' }],
      [N('Response'), N('12 B'), N('576.0 µs'), { en: 'the poll was heard', zh: 'Poll 已经听到了' }],
      [N('Report'), N('13 B'), N('608.0 µs'), { en: 'the reply time, five octets of it', zh: '回复时延，占其中五个字节' }],
    ] },
    { kind: 'formula', heading: { en: 'Where 576 µs comes from', zh: '576 µs 是怎么来的' }, text: {
      en: '(10 + 2 + 2 × octets) symbols × 16 µs\n12 octets → 36 × 16 = 576 µs      13 octets → 38 × 16 = 608 µs',
      zh: '(10 + 2 + 2 × 字节数) 个符号 × 16 µs\n12 字节 → 36 × 16 = 576 µs      13 字节 → 38 × 16 = 608 µs',
    }, note: {
      en: 'Four bits ride on each symbol and a symbol lasts 16 µs, which is 250 kb/s. Two symbols carry an octet, and twelve symbols of header go in front of the message. So the shortest thing this radio can say still holds the air for more than half a millisecond.',
      zh: '每个符号载四个比特，一个符号持续 16 µs，也就是 250 kb/s。一个字节要两个符号，而消息前面还有十二个符号的头部。于是这部电台哪怕说最短的一句话，也要占住空口半毫秒有余。',
    } },
    { text: {
      en: 'The first block, message by message: the poll leaves at zero, the response answers at 1.000 ms, the anchor’s report goes out at 12.000 ms, and the distance appears 608 µs behind it, at 12.608 ms.',
      zh: '第一个块，逐条消息看过去：Poll 在零时刻出发，Response 在 1.000 ms 处作答，锚点的 Report 在 12.000 ms 处发出，而距离紧随其后 608 µs 出现，落在 12.608 ms。',
    } },
    { text: {
      en: 'The grid underneath is wide: a round is 28 slots of 500 µs, so 14 ms, and a block holds four of them, one per anchor. Seven whole blocks fit in the 1.3 seconds of this run.',
      zh: '底下那张格子铺得很宽：一轮是 28 个时隙、每个 500 µs，合 14 ms；一个块装得下四轮，每个锚点一轮。这段 1.3 秒的运行里，整整齐齐放得下七个块。',
    } },
    { text: {
      en: 'The wide radio is never the problem here. Both listening anchors hear 8 fragments of 8, and the two trains clear what the receiver needs by 34.5 dB and 32.0 dB.',
      zh: '在这里，宽带那一侧从来不是问题所在。两个在听的锚点都是 8 个片段收到 8 个，两串片段分别高出接收端所需的门限 34.5 dB 与 32.0 dB。',
    } },
    { text: {
      en: 'And the talking is not a rounding error. A poll and a response together hold the air for 1.152 ms, while any single fragment of the train they set up is shorter than either of them on its own.',
      zh: '而“说话”这件事，绝不是个可以忽略的零头。一条 Poll 加一条 Response 合起来占住空口 1.152 ms，而它们所安排的那串片段里，任何一个片段单拿出来都比它们中的任何一条更短。',
    } },
  ],
  deeper: [
    { heading: { en: 'What is actually in those twelve bytes', zh: '那十二个字节里究竟装了什么' }, text: {
      en: 'None of the three messages carries a full 802.15.4 header. Each is a compressed payload: one message-ID octet (0x04 for a poll, 0x05 for a response, 0x06 and 0x07 for the two directions of a report), the fields that message needs, and a two-octet CRC. A report spends five of its thirteen octets on the time itself — the responder’s reply time, or the initiator’s turnaround time — and the responder’s copy adds a payload-length octet with no payload behind it, which is why it is thirteen octets against the poll’s twelve.',
      zh: '这三条消息都不带完整的 802.15.4 帧头。每一条都是一份压缩过的载荷：一个字节的消息 ID（Poll 是 0x04，Response 是 0x05，Report 的两个方向分别是 0x06 与 0x07），加上这条消息真正需要的那几个字段，末尾再跟两个字节的 CRC。一条 Report 把十三个字节里的五个花在时间本身上——应答方的回复时延，或发起方的转向时间——而应答方那一份还多带一个“载荷长度”字节，后面却并没有载荷，这就是它比 Poll 多出一个字节的原因。',
    } },
    { heading: { en: 'Why a slow radio is the right radio', zh: '为什么慢的那部才是对的那部' }, text: {
      en: '250 kb/s sounds absurd next to a ranging channel 499.2 MHz wide. But the control plane needs range and reliability, not rate: the modelled receiver hears down to −100 dBm and the transmitter puts out 10 dBm, so a control message crosses a building where a ranging fragment would not. The device also gets to keep the wideband front end asleep between blocks, which is most of why a ranging tag lasts a year on a coin cell.',
      zh: '和一条 499.2 MHz 宽的测距信道摆在一起，250 kb/s 听上去荒唐。可控制面要的是距离和可靠，而不是速率：模型里的接收端能听到 −100 dBm，发射端则发 10 dBm，于是一条控制消息能穿过整栋楼，而一个测距片段做不到。何况这样一来，设备在两个块之间还能让宽带前端继续睡着——测距标签靠一颗纽扣电池撑上一年，多半就是这么来的。',
    } },
  ],
  sources: [
    { en: 'The radio itself is the standard’s: the 250 kb/s O-QPSK PHY of IEEE Std 802.15.4-2024 Clause 12, 32 chips to a symbol at 0.5 µs each and four bits on every symbol. The 576 µs of a 12-octet message falls straight out of those numbers.',
      zh: '电台本身出自标准：IEEE Std 802.15.4-2024 第 12 章那部 250 kb/s 的 O-QPSK PHY，一个符号 32 个码片、每个码片 0.5 µs，每个符号载四个比特。一条 12 字节消息的 576 µs，正是从这几个数里直接算出来的。' },
    { en: 'Everything that turns it into a control radio for ranging — the poll/response/report cycle and the compressed message formats — is P802.15.4ab, at D5.0 in Sponsor-ballot recirculation in September 2026. That draft is members-only, so this is paraphrased from two TG4ab contributions: 15-22/0381r5 (the cycle and the message tables) and 15-23/0100r2 (the PHY configuration). The balloted draft may differ.',
      zh: '而把它变成一部测距控制电台的那些东西——轮询/响应/报告的周期，以及压缩后的消息格式——都来自 P802.15.4ab：截至 2026 年 9 月仍处于 Sponsor 投票再循环阶段，版本 D5.0。该草案仅对会员开放，所以这里是改写自 TG4ab 的两篇提案文稿：15-22/0381r5（周期与消息字段表）与 15-23/0100r2（PHY 配置）。已投票的草案可能与之不同。' },
    { en: 'Model choices: the ten preamble-and-marker symbols and two header symbols in front of every message, the receiver’s −100 dBm sensitivity (the standard’s own floor for this PHY is −85 dBm) and the 10 dBm a control transmission goes out at. The 28-slot round and the 200 ms block are the session’s settings, not the standard’s.',
      zh: '以下是模型取值：每条消息前面那十个前导与标记符号、两个头部符号；接收端 −100 dBm 的灵敏度（标准对这部 PHY 给出的底线是 −85 dBm）；以及一次控制发射所用的 10 dBm。28 个时隙一轮、200 ms 一个块，则是本会话的参数设置，并非标准规定。' },
  ],
  scenario: () => uwbNbaScenario('base'),
  variants: [
    { label: { en: 'Outside the router’s channel', zh: '避开路由器的信道' }, scenario: () => uwbNbaScenario('outside') },
    { label: { en: 'Hop over four channels', zh: '在四个信道间跳变' }, scenario: () => uwbNbaScenario('hop') },
    { label: { en: 'No LBT', zh: '不先听后发' }, scenario: () => uwbNbaScenario('noLbt') },
  ],
  jumps: [
    J('the narrowband poll that opens the round', '打开轮次的那帧窄带 Poll', firstNbPoll),
    J('what the far end made of the train', '对端如何判定这一串片段', firstUwbTrain),
    J('the narrowband report that closes it', '收尾的那帧窄带 Report', firstNbReport),
    J('the one distance of the whole run', '整段运行里唯一的一个距离', firstUwbRange),
  ],
  observe: [
    { en: 'The round opens on the other radio: “uwb-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)”. It is the first thing in the whole run — no ranging frame has been sent yet.',
      zh: '这一轮是在另一部电台上开场的：“uwb-1 → anchor-1 NBPOLL 12 B @0.25 Mbps (576.0 µs)”。它是整段运行里的第一件事——那时还没有任何一帧测距帧发出去。' },
    { en: 'The answering anchor closes the round: “anchor-1 → uwb-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)” at 12.000 ms. Only after that last message does the asker have anything to compute a distance from.',
      zh: '作答的锚点为这一轮收尾：12.000 ms 处的 “anchor-1 → uwb-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)”。直到这最后一条消息落地，发问的一方手里才有了算距离的材料。' },
    { en: 'The distance follows it: “uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)”. Open the tag’s inspector beside it — its fragment rows say every fragment was heard and detected.',
      zh: '距离紧跟在它后面：“uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)”。顺手打开标签的检视面板：那几行片段写着，每一个片段都收到了，也都检出了。' },
  ],
  tryThis: [
    { en: 'Load “Outside the router’s channel” and step through one block. The cycle runs to the end for every anchor in the room: a poll, a response, a train of fragments, a report and a distance, four times over.',
      zh: '载入“避开路由器的信道”，把一个块一步步走完。房间里每个锚点的周期都跑到了头：一条 Poll、一条 Response、一串片段、一条 Report、一个距离，前后四遍。' },
    { en: 'Jump to “what the far end made of the train”, read the verdict line, then jump on to the report that follows it. The wide radio reached the verdict; the small radio is what carries it home.',
      zh: '跳到“对端如何判定这一串片段”，读一读那行判定，再往后跳到紧随其后的那条 Report。判定是宽带电台做出的，而把它捎回家的，是那部小电台。' },
  ],
  quiz: [
    {
      q: { en: 'Which radio carries the reply time that the distance is computed from?', zh: '用来算距离的那段回复时延，是哪部电台捎回来的？' },
      options: [
        { en: 'The wide ranging radio, inside the last fragment', zh: '宽带测距电台，装在最后一个片段里' },
        { en: 'The narrowband radio, in the Report that closes the round', zh: '窄带电台，装在收尾的那条 Report 里' },
        { en: 'Neither — each end keeps its own stamps and never sends them', zh: '两部都不是——两端各自留着自己的时间戳，从不发出来' },
      ],
      answer: 1,
      explain: { en: 'The fragments are measured, not read: they carry an edge, not a number. The reply time travels in the report, and until it arrives the asker has half of an answer.', zh: '片段是被“量”的，不是被“读”的：它们捎的是一道边沿，不是一个数。回复时延走的是 Report，在它到达之前，发问的一方手里只有半个答案。' },
    },
    {
      q: { en: 'A twelve-byte message takes 576 µs on this radio. Why so long for so few bytes?', zh: '一条十二字节的消息，在这部电台上要 576 µs。这么几个字节，为什么要这么久？' },
      options: [
        { en: 'It is sent three times over, once per anchor', zh: '它被重发了三遍，每个锚点一遍' },
        { en: 'Four bits ride on a 16 µs symbol — 250 kb/s — and twelve header symbols go in front', zh: '一个 16 µs 的符号只载四个比特——250 kb/s——前面还要加十二个头部符号' },
        { en: 'It waits for the next slot boundary before it may start', zh: '它必须等到下一个时隙边界才能开始发' },
      ],
      answer: 1,
      explain: { en: 'Thirty-six symbols in all: two for every octet, plus twelve of header. Slow per byte is the price of a radio that reaches across a building on almost no power.', zh: '总共三十六个符号：每个字节两个，再加十二个头部符号。论字节慢，正是换来“几乎不费功率就能穿过整栋楼”的代价。' },
    },
  ],
}
