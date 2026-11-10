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
  module: 29,
  title: '控制消息走另一部射频',
  why: '测距设备的任务是测量时间，而不是交换控制信息。但总要有消息说明：由谁向谁发起测距，对方是否已经收到。若由宽带测距射频传送这些消息，它的空口时间（airtime）就会消耗在传送数据上，而不是用于测量：在一帧测距帧里每多加一个字节，只会使帧更长，并不能使它用于计时的那道边沿更陡峭。因此设备另配一部窄带（narrowband, NB）射频，专门传送控制消息。一轮里它先发 Poll，指定要与哪些设备测距；被指定的一方回复一条 Response，两端由此确认这一轮成立；接着宽带射频只传一串片段（fragment），没有地址也没有内容，只有一道用于取时间戳的边沿；最后窄带射频再传一条 Report，带回应答方的回复时延（reply time）——在收到这条消息之前，手机只掌握一半的信息，无法算出任何距离。窄带射频的数据速率很低，最短的一条消息也要占用空口半毫秒以上，比任何一个片段都长，所以控制消息的开销不可忽略；但它成本低、覆盖距离远，而且它传送的字节不占用测量所需的空口时间。两部射频使用同一套时隙网格，一条消息必须容纳在分配给它的两个时隙内，否则这一轮不成立——因此一条 Poll 无法同时指定房间里的全部四个锚点（anchor），总有一个角落的锚点不参加这一轮。',
  outcomes: [
    '按顺序说出窄带射频在一轮里发送的三条消息',
    '说明为什么计时和控制消息要分别由两部射频承担',
    '在时间线上找到其中一条消息，并说出它占用多少微秒',
  ],
  needs: ['uwb-mms'],
  terms: [
    { term: 'narrowband', plain: '只占用很窄一段频谱的射频：速率很低，但覆盖距离远，成本也低' },
    { term: 'NB', plain: '日志中凡属于窄带射频的记录，都以这两个字母开头' },
    { term: 'NB Poll', plain: '开启一轮的消息：手机在其中指定要与哪些设备测距' },
    { term: 'NB Response', plain: '确认已收到 Poll 的消息，两端由此确认这一轮已经开始' },
    { term: 'NB Report', plain: '结束一轮的消息：它带回用于计算距离的回复时延——与 DS-TWR 里那帧宽带 Report 不是一回事' },
  ],
  picture: [
    { heading: '两部射频，各司其职', text: '测距帧的作用是标定一个时间位置，而不是传送信息。若还要它附带传送消息，每一条消息都会占用本应留给测量的空口时间。因此设备在宽带射频之外又配置了一部：只占用很窄一段频谱，速率低，但成本低、覆盖距离远——这就是窄带射频。宽带射频负责计时，窄带射频负责控制消息；日志中凡属于它的记录，都以这两个字母（NB）开头。' },
    { kind: 'steps', heading: '一轮中依次传送的消息', items: [
      'Poll——手机开启这一轮，并指定由哪些设备应答',
      'Response——被指定的一方确认已收到 Poll，两端由此确认这一轮成立',
      '接着是那串片段（fragment），由宽带射频发送：整轮中唯一被实际测量的部分',
      'Report——应答方发回自己的回复时延（reply time），手机据此由两个时间戳算出一个距离',
    ] },
    { kind: 'watch', jump: 0, heading: '观察一轮如何开始', text: '载入仿真、按下播放，然后跳到第一条窄带消息。它出现在任何一帧测距帧之前：一轮测距总是先在窄带射频上完成协商，然后才在宽带射频上进行测量。' },
    { heading: '为什么不直接用宽带射频传送控制消息', text: '这在技术上可行。但测距帧的价值在于两端都能把它的某一道边沿定位到码片（chip）以下的精度；在帧中每加入一个字节，只会使帧更长，丝毫不会使那道边沿更陡峭。窄带射频传送每个字节更慢，代价反而更小——因为它传送的字节不占用测量所需的空口时间。' },
    { heading: '从整体看一个块', text: '观察一个测距块（ranging block），结构就很清楚了。Poll 在块的开头发出，其中列出它要询问的每一个锚点（anchor）；一个时隙之后，它们各自应答；片段在此期间在房间内传播；大约在第二十毫秒，第一条收尾消息到达，手机这时才得到一个距离。一个块里只容纳这一轮，其余大部分时间空闲。' },
    { heading: '其余的块里没有测距', text: '在本课的场景里，七个块中只有两个完成了整轮测距。窄带射频与上方的 Wi-Fi 路由器共用同一段窄频谱，而这个频段的使用规则使它在其余五个块里无法发送。两侧的测量本身都没有问题，只是控制消息发不出去。这正是下一课《窄带射频也共享 6 GHz》要讲的事。本课与那一课共用同一份变体菜单，所以菜单里有三项是那一课的题目，而不是本课的：避开路由器用着的那个信道、在四个信道间跳变（channel hopping）、以及关掉先听后发（listen before talk, LBT）。选择这些变体后场景确实会改变，但改变的原因以及结果数值的解读，都在下一课讲解；本课自己只用第四项「每次只与一个锚点测距」。' },
  ],
  numbers: [
    { kind: 'table', heading: '一轮里的三条消息', head: [
      '消息', '大小', '占用空口',
      '携带的内容',
    ], rows: [
      ['Poll，三个应答者', '23 B', '928.0 µs', '发起方，以及被询问的应答者'],
      ['Poll，一个应答者', '12 B', '576.0 µs', '成对轮次自己的 Poll'],
      ['Response', '12 B', '576.0 µs', '确认已收到 Poll；每个应答者一条'],
      ['Report', '13 B', '608.0 µs', '回复时延，占其中五个字节'],
      ['这一轮容得下的应答者', '3 of 4', '—', 'Poll 每多一个应答者就增加 3 字节，而两个 600 RSTU（ranging slot time unit）时隙必须容纳得下它，因此第四个角落的锚点不参加这一轮'],
    ] },
    { kind: 'formula', heading: '576 µs 是怎么来的', text: '(10 + 2 + 2 × 字节数) 个符号 × 16 µs\n12 字节 → 36 × 16 = 576 µs\n13 字节 → 38 × 16 = 608 µs      23 字节 → 58 × 16 = 928 µs', note: '每个符号（symbol）载四个比特，一个符号持续 16 µs，也就是 250 kb/s。一个字节要两个符号，而消息前面还有十二个符号的头部。因此这部射频即使发送最短的消息，也要占用空口半毫秒以上。' },
    { text: '逐条查看第一个块中的消息：Poll 在零时刻发出，第一条 Response 在 1.000 ms 处应答，第一条 Report 在 20.000 ms 处发出，距离在其后 608 µs 得出，即 20.608 ms。' },
    { heading: '底层的时隙网格', text: '底层的时隙网格跨度很大：一轮是 52 个时隙、每个 500 µs，合计 26 ms；一个块只容纳一轮，场景中的每个锚点都在这一轮里。这段 1.3 秒的运行里，恰好容纳七个块。' },
    { text: '在这里，问题从来不在宽带一侧。两个应答的锚点都是 8 个片段收到 8 个，两串片段分别比接收端所需的电平高出 34.5 dB 与 33.4 dB。' },
    { heading: '控制消息的开销不可忽略', text: '控制消息的开销不可忽略。一条 Poll 加一条 Response 合计占用空口 1.504 ms，而它们所安排的那串片段中，任何一个片段都比其中任何一条消息更短。' },
    { kind: 'steps', heading: '两部射频如何分担一轮中的工作', items: [
      '首先发送的是窄带射频。在一轮开头的窗口里，手机发出一帧 Poll，指定要与哪一个或哪几个设备测距。此时还没有发出任何测距帧。',
      '被指定的设备各自在分配给自己的 Response 窗口中应答。这条应答一方面使两端确认这一轮确实已经开始，另一方面也使接收端进入就绪状态，可以开始累加。',
      '此时才轮到宽带射频。在这一阶段它只承载片段，不承载其他任何内容——没有地址、没有数据、没有消息内容，只有一道用来取时间戳的边沿；而且整串只取一个发送时间戳。',
      '两部射频使用同一套时隙网格。一个窄带窗口恰好是两个片段时隙，所以控制消息和计时采用同一时间基准——而一条无法容纳在自己那两个时隙内的消息，会使这一轮在开始之前就不成立。',
      '收尾的窗口又交回窄带射频：应答方报告自己从接收到发送所用的回复时延，手机则报告它测得的往返时间。',
      '手机从往返时间中减去回复时延，再将差值折半，由此得到距离。而在收到那条收尾消息之前，手机只掌握一半的信息，无法算出任何距离。',
    ] },
    { kind: 'table', heading: '同一轮，换成微秒', head: [
      '步骤', '这一轮',
    ], rows: [
      ['Poll，指定三个应答者', 'slot 0 · 23 B · 928.0 µs'],
      ['Response，每应答者一条', 'slots 2, 4, 6 · 12 B · 576.0 µs'],
      ['片段，由宽带射频发送', 'slots 8–39 · 0 B · 0 Mbps'],
      ['两部射频共用的时隙网格', '52 × 500.0 µs = 26 ms'],
      ['Report，每应答者一条', 'slots 40, 44, 48 · 13 B · 608.0 µs'],
      ['第一个距离', '20.608 ms'],
    ] },
  ],
  deeper: [
    { heading: '那十二个字节的内容', text: '这三条消息都不带完整的 802.15.4 帧头。每一条都是一份压缩过的载荷：一个字节的消息 ID（Poll 是 0x04，Response 是 0x05，Report 的两个方向分别是 0x06 与 0x07），加上这条消息真正需要的那几个字段，末尾再跟两个字节的 CRC。一条 Report 把十三个字节里的五个用于时间值本身——应答方的回复时延，或发起方的转向时间——而应答方那一份还多带一个“载荷长度”字节，其后却没有载荷，这就是它比 Poll 多出一个字节的原因。' },
    { heading: '为什么低速射频才是合适的选择', text: '与一条 499.2 MHz 宽的测距信道相比，250 kb/s 似乎低得不合理。但控制面需要的是覆盖距离和可靠性，而不是速率：模型中的接收端可以接收 −100 dBm 的信号，发射端以 10 dBm 发射，因此一条控制消息能覆盖整栋楼，而一个测距片段做不到。此外，设备在两个块之间还可以让宽带前端保持休眠——测距设备能靠一颗纽扣电池工作一年，主要原因就在于此。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '本课的那部窄带射频只有一个物理层，没有任何链路层。它只有符号长度与几个消息大小，消息不带真正的 CRC（那两个字节只计入长度），接收端也从不校验；没有确认、没有重传、没有退避。因此一条 Response 丢失就会直接使这一轮作废——对端在这一轮里始终没有就绪——而真实的控制面会重试，也会因重试而占用更多空口时间。' },
    { kind: 'model-value', text: '「一条控制消息能覆盖整栋楼，而一个测距片段做不到」整句话依赖两个模型取值：窄带发射功率 10 dBm 与接收灵敏度 −100 dBm，而标准第 12 章给这部 PHY 的底线是 −85。它的路径损耗沿用 UWB 的模型：本课对窄带只替换了 1 m 处的自由空间项，指数与每道墙的损耗仍沿用宽带一侧的取值。所以这部射频的覆盖距离优势是本课选定的一个比值，而不是测得的。' },
    { kind: 'unmodelled', text: '「宽带前端在块之间保持休眠」这件事本课从未测量过。本课不算功率、不算电流、不算能量，一切代价都以空口时间与时隙来衡量，没有任何一个数字涉及电池或功耗。所以「靠一颗纽扣电池工作一年」是课文代读者做出的推论；而两部射频真正的取舍——多一部射频的物料、静态功耗与体积——在本课的数字中都没有体现。' },
  ],
  sources: [
    '射频本身出自标准：IEEE Std 802.15.4-2024 第 12 章那部 250 kb/s 的 O-QPSK PHY，一个符号 32 个码片、每个码片 0.5 µs，每个符号载四个比特。一条 12 字节消息的 576 µs，正是从这几个数里直接算出来的。',
    '而把它变成一部测距控制射频的那些东西——轮询/响应/报告的周期，以及压缩后的消息格式——都来自 P802.15.4ab：截至 2026 年 9 月，它的投票稿是 D05，仍处于 Sponsor 投票复审阶段。该草案仅对会员开放，所以这里是改写自 TG4ab 的两篇提案文稿：15-22/0381r5（周期与消息字段表）与 15-23/0100r2（PHY 配置）。已投票的 D05 可能与之不同。',
    '以下是模型取值：每条消息前面那十个前导与标记符号、两个头部符号；接收端 −100 dBm 的灵敏度（标准对这部 PHY 给出的底线是 −85 dBm）；以及一次控制发射所用的 10 dBm。52 个时隙一轮、200 ms 一个块，则是本会话的参数设置，并非标准规定。',
  ],
  scenario: () => uwbNbaScenario('base'),
  variants: [
    { label: '避开路由器的信道', scenario: () => uwbNbaScenario('outside') },
    { label: '在四个信道间跳变', scenario: () => uwbNbaScenario('hop') },
    { label: '不先听后发', scenario: () => uwbNbaScenario('noLbt') },
    { label: '每次只与一个锚点测距', scenario: () => uwbNbaScenario('pairwise') },
  ],
  jumps: [
    J('开启这一轮的窄带 Poll', firstNbPoll),
    J('对端如何判定这一串片段', firstUwbTrain),
    J('收尾的那帧窄带 Report', firstNbReport),
    J('整段运行中得出的第一个距离', firstUwbRange),
  ],
  observe: [
    '这一轮由另一部射频开启：“uwb-1 → * NBPOLL 23 B @0.25 Mbps (928.0 µs)”。它是整段运行里的第一件事——那时还没有任何一帧测距帧发出去。',
    '第一个应答的锚点发出它这一部分的收尾消息：20.000 ms 处的 “anchor-1 → uwb-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)”。直到收到这条消息，手机才具备计算距离所需的数据。',
    '距离紧随其后：“uwb-1 range → anchor-1 (SS): 4.74 m (true 4.76 m, raw 7.51 m)”。再打开手机的检视面板：片段记录显示，每一个片段都已收到，也都已检出。',
  ],
  tryThis: [
    '载入“每次只与一个锚点测距”，逐步查看一个块。同样的周期执行了四遍，每个锚点一遍：一条 Poll、一条 Response、一串片段、一条 Report、一个距离，各自占一整轮。',
    '跳到“对端如何判定这一串片段”，阅读那条判定记录，再跳到紧随其后的那条 Report。判定由宽带射频做出，而把结果传回的是窄带射频。',
  ],
  quiz: [
    {
      q: '用来计算距离的那段回复时延，由哪部射频传回？',
      options: [
        '宽带测距射频，装在最后一个片段里',
        '窄带射频，装在收尾的那条 Report 里',
        '两部都不是——两端各自保存自己的时间戳，从不发送',
      ],
      answer: 1,
      explain: '片段是被测量的，而不是被读取内容的：它们携带的是一道边沿，而不是一个数值。回复时延由 Report 传送，在它到达之前，手机只掌握一半的信息。',
    },
    {
      q: '一条十二字节的消息，在这部射频上要 576 µs。只有这几个字节，为什么需要这么长时间？',
      options: [
        '它被重发了三遍，每个锚点一遍',
        '一个 16 µs 的符号只载四个比特——250 kb/s——前面还要加十二个头部符号',
        '它必须等到下一个时隙边界才能开始发送',
      ],
      answer: 1,
      explain: '总共三十六个符号：每个字节两个，再加十二个头部符号。传送字节慢，正是换取“以很低的功率覆盖整栋楼”的代价。',
    },
  ],
}
