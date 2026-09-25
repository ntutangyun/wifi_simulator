/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · A second radio does the talking.
 *
 * The first half of the old `uwb-nba`: what the narrowband control radio is for,
 * what it says in one round, and what that costs in airtime. The coexistence
 * half — the listen-before-talk rule, the channel plan, the hop and the price
 * the Wi-Fi link pays — is next door in `uwb-nba-coexist`, which loads exactly
 * this scene and these four variants, so the split adds no new scenario and the
 * recorded hashes of the two ids are equal, value for value. Since the lesson task
 * the base is a one-to-many round over three of the four corner anchors, and the
 * pair round it used to run is the last variant, "One anchor at a time".
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the two
 * radios and the poll/response/report cycle in plain words first, the message
 * sizes and the block-0 timeline after them, the compressed formats in `deeper`,
 * the clause, the contributions and the model's own constants in `sources`.
 * Every number quoted below is pinned in tests/course/uwb-nba.test.ts;
 * `npx tsx scripts/lesson-dump.ts uwb-nba` prints it with its length.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import { J, LESSON_6G_WIDTH_MHZ, anchor, firstNbPoll, firstNbReport, firstUwbRange, firstUwbTrain, node, oneRoom, uwbSc, uwbTag, wifi6g, type Lesson } from '../lessonKit'

/** Which scene the lesson runs: one control channel inside the router's 80 MHz, one outside,
 * an allow list of four, or the inside channel with the listen-before-talk rule switched off. */
export type UwbNbaVariant = 'base' | 'outside' | 'hop' | 'noLbt' | 'pairwise'

/** Channel 71 of the 6 GHz plan — the coexistence lesson's Wi-Fi 7 router, 80 MHz over
 * 6265–6345 MHz. The channelization is the 6 GHz one the lesson names, not a generation. */
export const WIFI_6G_CENTER_MHZ = 6305
/** The narrowband allow list each scene runs: 200 is 6301.25 MHz (inside the router's channel),
 * 100 is 6051.25 MHz (outside), and the hop list mixes two of each — 210 is 6326.25 MHz, also
 * inside, and 150 is 6176.25 MHz, also outside. */
export const NBA_CHANNELS: Record<UwbNbaVariant, number[]> = {
  base: [200], outside: [100], hop: [100, 150, 200, 210], noLbt: [200], pairwise: [200],
}

/**
 * How many of the four corner anchors a scene uses. A one-to-many round holds every anchor of
 * the session at once, and two narrowband slots have to hold its POLL, which grows by three
 * octets per responder: at the 600 RSTU slot — the shortest an MMS round may use — that stops
 * at three responders, and the schema refuses a fourth. So the one-to-many base leaves the
 * fourth corner empty and says so in its numbers; every pair-round variant keeps all four,
 * which is why their recorded hashes do not move.
 */
export const NBA_ANCHOR_COUNT = (variant: UwbNbaVariant): number => (variant === 'base' ? 3 : 4)

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
      ...NBA_ANCHORS.slice(0, NBA_ANCHOR_COUNT(variant)).map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z)),
      uwbTag('uwb-1', 'Phone', TAG_POS.x, TAG_POS.y, TAG_Z),
    ],
    {
      mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: true, channel: 9,
      mms: {
        ...DEFAULT_UWB_SESSION.mms, nbChannels: NBA_CHANNELS[variant],
        nbLbt: variant === 'noLbt' ? 'off' : 'auto', report: 'bi',
        oneToMany: variant === 'base',
      },
    },
    { sixGhzCenterMhz: WIFI_6G_CENTER_MHZ },
  )
}

export const uwbNba: Lesson = {
  id: 'uwb-nba',
  module: 21,
  title: '另一部射频负责开口说话',
  why: '测距设备做的是量时间，它并不商量事情。可总得有人说清楚：是谁在问谁，对方到底有没有听见。若把这些话交给那部宽带测距射频去说，它的空口时间（airtime）就会花在字句上，而不是花在测量上。于是设备在它旁边又带了一部小得多的射频。这一课要跟着这部小射频，听它在一轮测距里究竟说了些什么。',
  outcomes: [
    '按顺序说出小射频在一轮里发的那三条消息',
    '说清为什么“计时”和“说话”要分在两部射频上走',
    '从时间线上读出其中一条消息，并说出它占了多少微秒',
  ],
  needs: ['uwb-mms'],
  terms: [
    { term: 'narrowband', plain: '只占一薄片频谱的射频：速率很低，但传得远，也几乎不花什么成本' },
    { term: 'NB', plain: '日志里凡是属于那部小射频的东西，都用这两个字母打头' },
    { term: 'NB Poll', plain: '开启一轮的那条消息：手机点名说它要和谁量距离' },
    { term: 'NB Response', plain: '回说“我听见了”的那条消息，两端由此都确认这一轮真的开始了' },
    { term: 'NB Report', plain: '收尾的那条消息：它捎回用来算距离的那段回复时延——与 DS-TWR 里那帧宽带 Report 不是一回事' },
  ],
  picture: [
    { heading: '两部射频，两份差事', text: '一帧测距帧生来是为了在时间上占住一个位置，而不是为了捎话。若还要它顺便把话也说了，每一句都要吃掉本该留给测量的空口时间。于是设备在那部宽带射频旁边又放了一部：只占一薄片频谱，速率低，却便宜、传得远——这就是窄带射频。宽带那部管计时，小的这部管说话；日志里凡是它的东西，都以这两个字母（NB）打头。' },
    { kind: 'steps', heading: '一轮里小射频说的话', items: [
      'Poll——手机开启这一轮，并点名该由谁作答',
      'Response——被点名的一方说自己听见了，两端于是都知道这一轮成立',
      '接着是那串片段（fragment），走宽带射频：整轮里唯一被真正测量的部分',
      'Report——作答的一方把自己的回复时延（reply time）捎回来，手机据此把两个时间戳变成一个距离',
    ] },
    { kind: 'watch', jump: 0, heading: '听这一轮怎么开场', text: '载入仿真、按下播放，然后跳到第一条窄带消息。它出现在任何一帧测距帧之前：一轮测距总是先在小射频上谈妥，之后才在宽带射频上量出来。' },
    { heading: '为什么不干脆在宽带射频上说', text: '也不是不行。只是一帧测距帧的价值，在于两端都能把它的某一道边沿说到码片（chip）的零头；而往里塞进去的每一个字节，只会让帧更长，却半点也不会让那道边沿更锐利。窄带射频论字节更慢，可它反而更便宜——因为它的字节不是从测量里扣出来的。' },
    { heading: '从外面看一个块', text: '盯住一个测距块（ranging block）看，形状就很清楚了。Poll 在最开头出发，并在里面点名它要问的每一个锚点（anchor）；一个时隙之后，它们各自作答；片段在这期间穿过房间；大约第二十毫秒上，第一条收尾消息到达，手机这才终于拿到一个距离。一个块里就装这么一轮，余下的大半时间是空的。' },
    { heading: '然后房间就安静了', text: '在本课的场景里，七个块里只有两个走完了这件事。那部小射频与头顶的 Wi-Fi 路由器共用着同一薄片频谱，而这个频段附带的规则，把其余五个块从它手里拿走了。两边的测量都没毛病，只是话说不出去了。这正是下一课《窄带射频也共享 6 GHz》要讲的事。' },
  ],
  numbers: [
    { kind: 'table', heading: '一轮里的三条消息', head: [
      '消息', '大小', '占用空口',
      '捎的是什么',
    ], rows: [
      ['Poll，三个应答者', '23 B', '928.0 µs', '谁在问，以及问的是哪几个'],
      ['Poll，一个应答者', '12 B', '576.0 µs', '成对轮次自己的 Poll'],
      ['Response', '12 B', '576.0 µs', 'Poll 已经听到了；每个应答者一条'],
      ['Report', '13 B', '608.0 µs', '回复时延，占其中五个字节'],
      ['这一轮容得下的应答者', '3 of 4', '—', 'Poll 每多一个应答者就长 3 字节，而两个 600 RSTU（ranging slot time unit）时隙必须装得下它，于是第四个角落这一轮不参加'],
    ] },
    { kind: 'formula', heading: '576 µs 是怎么来的', text: '(10 + 2 + 2 × 字节数) 个符号 × 16 µs\n12 字节 → 36 × 16 = 576 µs\n13 字节 → 38 × 16 = 608 µs      23 字节 → 58 × 16 = 928 µs', note: '每个符号（symbol）载四个比特，一个符号持续 16 µs，也就是 250 kb/s。一个字节要两个符号，而消息前面还有十二个符号的头部。于是这部射频哪怕说最短的一句话，也要占住空口半毫秒有余。' },
    { text: '第一个块，逐条消息看过去：Poll 在零时刻出发，第一条 Response 在 1.000 ms 处作答，第一条 Report 在 20.000 ms 处发出，而距离紧随其后 608 µs 出现，落在 20.608 ms。' },
    { heading: '底下那张格子', text: '底下那张格子铺得很宽：一轮是 52 个时隙、每个 500 µs，合 26 ms；一个块只装一轮，而每个锚点都在这一轮里。这段 1.3 秒的运行里，整整齐齐放得下七个块。' },
    { text: '在这里，宽带那一侧从来不是问题所在。两个作答的锚点都是 8 个片段收到 8 个，两串片段分别比接收端所需的电平高出 34.5 dB 与 33.4 dB。' },
    { heading: '“说话”不是零头', text: '而“说话”这件事，绝不是个可以忽略的零头。一条 Poll 加一条 Response 合起来占住空口 1.504 ms，而它们所安排的那串片段里，任何一个片段单拿出来都比它们中的任何一条更短。' },
    { kind: 'steps', heading: '两部射频怎么分一轮的活', items: [
      '先开口的是小射频。在一轮开头的那个窗口里，手机发出一帧 Poll，点名说它要和谁、或和哪几个量距离。此时还没有任何一帧测距帧出去过。',
      '被点到名的设备，各自在属于自己的 Response 窗口里作答。这声回答一面让两端都确认这一轮当真开始，一面也让接收端就绪，可以开始累加。',
      '到这时才轮到宽带射频。它那个阶段只承载片段，别的什么也不载——没有地址、没有数据、没有话语，只有一道用来取时间戳的边沿；而且整串只取一个发送时间戳。',
      '两部射频跑在同一张格子上。一个窄带窗口，正是两个“片段那么长”的时隙，所以“说话”和“计时”是用同一把尺子量出来的——而一条塞不进自己那两个时隙的消息，会让这一轮还没开始就不成立。',
      '收尾的窗口又交回小射频：作答的一方报出自己掉头所用的回复时延，手机则报出它量到的往返时间。',
      '手机把回复时延从往返时间里减掉，把余下的折半，这就是距离。而在那条收尾消息落地之前，它手里只有半个答案，一个距离也算不出。',
    ] },
    { kind: 'table', heading: '同一轮，换成微秒', head: [
      '步骤', '这一轮',
    ], rows: [
      ['Poll，点名三个应答者', 'slot 0 · 23 B · 928.0 µs'],
      ['Response，每应答者一条', 'slots 2, 4, 6 · 12 B · 576.0 µs'],
      ['片段，走宽带射频', 'slots 8–39 · 0 B · 0 Mbps'],
      ['两部射频共用的格子', '52 × 500.0 µs = 26 ms'],
      ['Report，每应答者一条', 'slots 40, 44, 48 · 13 B · 608.0 µs'],
      ['第一个距离', '20.608 ms'],
    ] },
  ],
  deeper: [
    { heading: '那十二个字节里究竟装了什么', text: '这三条消息都不带完整的 802.15.4 帧头。每一条都是一份压缩过的载荷：一个字节的消息 ID（Poll 是 0x04，Response 是 0x05，Report 的两个方向分别是 0x06 与 0x07），加上这条消息真正需要的那几个字段，末尾再跟两个字节的 CRC。一条 Report 把十三个字节里的五个花在时间本身上——应答方的回复时延，或发起方的转向时间——而应答方那一份还多带一个“载荷长度”字节，后面却并没有载荷，这就是它比 Poll 多出一个字节的原因。' },
    { heading: '为什么慢的那部才是对的那部', text: '和一条 499.2 MHz 宽的测距信道摆在一起，250 kb/s 听上去荒唐。可控制面要的是距离和可靠，而不是速率：模型里的接收端能听到 −100 dBm，发射端则发 10 dBm，于是一条控制消息能穿过整栋楼，而一个测距片段做不到。何况这样一来，设备在两个块之间还能让宽带前端继续睡着——测距设备靠一颗纽扣电池撑上一年，多半就是这么来的。' },
  ],
  sources: [
    '射频本身出自标准：IEEE Std 802.15.4-2024 第 12 章那部 250 kb/s 的 O-QPSK PHY，一个符号 32 个码片、每个码片 0.5 µs，每个符号载四个比特。一条 12 字节消息的 576 µs，正是从这几个数里直接算出来的。',
    '而把它变成一部测距控制射频的那些东西——轮询/响应/报告的周期，以及压缩后的消息格式——都来自 P802.15.4ab：截至 2026 年 9 月仍处于 Sponsor 投票再循环阶段，版本 D5.0。该草案仅对会员开放，所以这里是改写自 TG4ab 的两篇提案文稿：15-22/0381r5（周期与消息字段表）与 15-23/0100r2（PHY 配置）。已投票的草案可能与之不同。',
    '以下是模型取值：每条消息前面那十个前导与标记符号、两个头部符号；接收端 −100 dBm 的灵敏度（标准对这部 PHY 给出的底线是 −85 dBm）；以及一次控制发射所用的 10 dBm。52 个时隙一轮、200 ms 一个块，则是本会话的参数设置，并非标准规定。',
  ],
  scenario: () => uwbNbaScenario('base'),
  variants: [
    { label: '避开路由器的信道', scenario: () => uwbNbaScenario('outside') },
    { label: '在四个信道间跳变', scenario: () => uwbNbaScenario('hop') },
    { label: '不先听后发', scenario: () => uwbNbaScenario('noLbt') },
    { label: '一次只问一个锚点', scenario: () => uwbNbaScenario('pairwise') },
  ],
  jumps: [
    J('打开轮次的那帧窄带 Poll', firstNbPoll),
    J('对端如何判定这一串片段', firstUwbTrain),
    J('收尾的那帧窄带 Report', firstNbReport),
    J('整段运行里第一个发得出去的距离', firstUwbRange),
  ],
  observe: [
    '这一轮是在另一部射频上开场的：“uwb-1 → * NBPOLL 23 B @0.25 Mbps (928.0 µs)”。它是整段运行里的第一件事——那时还没有任何一帧测距帧发出去。',
    '第一个作答的锚点为自己这半轮收尾：20.000 ms 处的 “anchor-1 → uwb-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)”。直到这条消息落地，手机手里才有了算距离的材料。',
    '距离紧跟在它后面：“uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)”。顺手打开手机的检视面板：那几行片段写着，每一个片段都收到了，也都检出了。',
  ],
  tryThis: [
    '载入“一次只问一个锚点”，把一个块一步步走完。同样的周期跑了四遍，每个锚点一遍：一条 Poll、一条 Response、一串片段、一条 Report、一个距离，各自占一整轮。',
    '跳到“对端如何判定这一串片段”，读一读那行判定，再往后跳到紧随其后的那条 Report。判定是宽带射频做出的，而把它捎回家的，是那部小射频。',
  ],
  quiz: [
    {
      q: '用来算距离的那段回复时延，是哪部射频捎回来的？',
      options: [
        '宽带测距射频，装在最后一个片段里',
        '窄带射频，装在收尾的那条 Report 里',
        '两部都不是——两端各自留着自己的时间戳，从不发出来',
      ],
      answer: 1,
      explain: '片段是被“量”的，不是被“读”的：它们捎的是一道边沿，不是一个数。回复时延走的是 Report，在它到达之前，手机手里只有半个答案。',
    },
    {
      q: '一条十二字节的消息，在这部射频上要 576 µs。这么几个字节，为什么要这么久？',
      options: [
        '它被重发了三遍，每个锚点一遍',
        '一个 16 µs 的符号只载四个比特——250 kb/s——前面还要加十二个头部符号',
        '它必须等到下一个时隙边界才能开始发',
      ],
      answer: 1,
      explain: '总共三十六个符号：每个字节两个，再加十二个头部符号。论字节慢，正是换来“几乎不费功率就能穿过整栋楼”的代价。',
    },
  ],
}
