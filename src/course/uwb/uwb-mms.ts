/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · Sixteen milliseconds of energy.
 *
 * The first lesson of the 802.15.4ab tier, and the first that is mostly draft
 * rather than standard. Its room is built so that one 4z frame cannot cross it:
 * a 22 m hall cut into three bays by two full-height brick partitions, three
 * anchors in the first bay and one tag in the third, 13 m and 24 dB away. Every
 * fragment of every train lands at −100.26 dBm, seven decibels under the
 * receiver's own sensitivity, and nothing but the train rescues it.
 *
 * This is the picture half of the old lesson: why one frame cannot cross that
 * room, why a longer one would not help, what a fragment is, how a receiver
 * that cannot hear one adds up eight of them, and what the narrowband radio
 * beside it carries meanwhile. The arithmetic — the millisecond's energy
 * budget, the combining gains, the three decibels between four fragments and
 * eight, the clock ratio a train measures, and the honest share of the
 * 19.57 dB a train beats a 4z Poll by — is the second half, `uwb-mms-numbers`,
 * which loads exactly this scene and these variants, so the split adds no new
 * scenario and the recorded hashes of the two ids are equal.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). Every
 * number quoted below is pinned in tests/course/uwb-mms.test.ts;
 * `npx tsx scripts/lesson-dump.ts uwb-mms` prints it with its length.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import { mmsSet } from '../../uwb/mms'
import { J, anchor, firstNbPoll, firstNbReport, firstUwbRange, firstUwbRsf, firstUwbTrain, twoWallLab, uwbSc, uwbTag, type Lesson } from '../lessonKit'

/**
 * Which scene the lesson runs: the draft's own ranging-cycle default (X = 8) as a **one-to-many**
 * round — one train from the tag, answered by all three anchors — the same cycle with half the
 * train, one of the mandatory parameter sets (X = 16 on a shorter fragment), ordinary 4z two-way
 * ranging in the same room, or the pair round this lesson ran before one-to-many existed.
 *
 * Only `base` is one-to-many. `four`, `rsf1`, `twr` and `pairwise` are pair rounds, and
 * `pairwise` is byte for byte the scene that used to be the base — which is why the recorded
 * hash that moved is the base's alone.
 */
export type UwbMmsVariant = 'base' | 'four' | 'rsf1' | 'twr' | 'pairwise'

/**
 * The three anchors, all in the first bay of the hall and all behind both brick partitions
 * from the tag. They are placed so that the three of them are as nearly equidistant as the bay
 * allows — 13.04, 13.04 and 12.76 m — because the lesson's whole subject is one threshold: at
 * X = 4 every one of the three has to fail, and at X = 8 every one has to succeed. An anchor
 * pushed up against the first partition would be 8.58 m away, 3.6 decibels louder, and would
 * go on ranging on half a train while the other two heard nothing.
 *
 * Each crystal is set rather than drawn, so the ratio the trains measure has a known truth to
 * be checked against: the tag at +20 ppm and the anchors at −20, 0 and +10 give ratios of 40,
 * 20 and 10 ppm at the tag.
 */
export const MMS_ANCHORS: { id: string; name: string; x: number; y: number; ppm: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5, ppm: -20 },
  { id: 'anchor-2', name: 'Anchor 2', x: 0.5, y: 7.5, ppm: 0 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.3, y: 4.0, ppm: 10 },
]
/** Anchors on the ceiling, the tag at chest height — the two planes of every UWB lesson. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0
/** The tag, in the third bay: 12.5 m and two brick walls from the nearest anchor. */
export const TAG_POS = { x: 13.0, y: 4.0, ppm: 20 }

/**
 * Three anchors and one tag on an MMS session, on the 600 RSTU (0.5 ms) slot the draft's
 * §1.1.1 asks for and the simulator's own 200 ms block. `report: 'responder'` puts the range
 * on the tag's lane, where the block fix needs it; `nbChannels: [3]` is the draft's default
 * control channel, in UNII-3, where there is no Wi-Fi in this room to share with and listen
 * before talk is not required. NLOS is on, and the two brick walls charge for it.
 */
export function uwbMmsScenario(variant: UwbMmsVariant = 'base'): Scenario {
  const phy = variant === 'four' ? { rsfs: 4 as const } : variant === 'rsf1' ? mmsSet('rsf-1') : {}
  return uwbSc(
    twoWallLab(),
    [
      ...MMS_ANCHORS.map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z, a.ppm)),
      uwbTag('tag-1', 'Tag', TAG_POS.x, TAG_POS.y, TAG_Z, TAG_POS.ppm),
    ],
    variant === 'twr'
      ? { mode: 'twr', method: 'ss', slotRstu: 600, aoa: false, nlos: true }
      : {
        mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: true,
        mms: {
          ...DEFAULT_UWB_SESSION.mms, ...phy, nbChannels: [3], report: 'responder',
          oneToMany: variant === 'base',
        },
      },
  )
}

export const uwbMms: Lesson = {
  id: 'uwb-mms',
  module: 15,
  title: '十六毫秒的能量',
  why: '把同样的标签（tag）和同样的锚点（anchor）摆好，中间隔上两道砖墙。每一帧测距帧其实都到了——只是到达时比接收机能听见的还轻，于是什么也量不出来。这一课讲的就是仍然把测量做成的那个办法：不发一帧，改发一串短的、摊在好几毫秒里的片段（fragment），让对端把它们加起来。',
  outcomes: [
    '说清为什么把帧拉长没用，而一串短片段管用',
    '把一轮从窄带（narrowband, NB）开场一路跟到末尾那次测距',
    '说出一轮里哪些部分承载时间、哪些承载话语',
  ],
  needs: ['uwb-blocks', 'uwb-dstwr', 'uwb-geometry'],
  terms: [
    { term: 'MMS', plain: '多毫秒：把一个测距分组摊到好几毫秒里发，而不是一次发完' },
    { term: 'fragment', plain: '这个分组在某一毫秒里的那一片，单独发出，事后再累加进来' },
    { term: 'RSF', plain: '测距序列片段：里面除了用来取时间戳的那段序列，什么也不装' },
    { term: 'RIF', plain: '测距完整性片段：用来校验结果的可选附加片段——本场景一个也不发' },
    { term: 'sensitivity', plain: '灵敏度：接收机自己的门限，本课是 −93 dBm，即它还能从中取出时间戳的最弱电平' },
    { term: 'margin', plain: '余量：一串片段落在灵敏度之上多少；为正就是检出，为负就什么也没有' },
  ],
  picture: [
    { heading: '一个帧过不去的房间', text: '场景是一条长厅，被两道通顶砖墙切成三个隔间。三个锚点立在第一个隔间里，一个标签在第三个隔间里，于是它们之间的每一条射线都要穿过两道墙。帧还是照样到达——房间没那么大——只是到达时比接收机能检出的门限低了好几分贝；而检不出一帧，也就没法给它打时间戳。' },
    { kind: 'watch', jump: 2, heading: '看一串片段被判定', text: '载入仿真，跳到对第一串片段的判定。一行字写着收到了几个片段、每个多响、加起来是多少，以及这有没有越过接收机的门限。本课要讲的一切都在这一行里。' },
    { heading: '能量是有的，只是不在同一瞬间', text: '最顺手的办法——喊得更响——用不了。法规限住的不是总量，而是在每一毫秒上取的平均，所以任何单独的一瞬都不能更响。它没有限住的，是你用掉多少个毫秒。一台把这一毫秒的额度花掉、再花下一毫秒、再花下一毫秒的发射机，和一台只花一毫秒就收手的，同样合规。' },
    { heading: '一个片段，再来一个', text: '于是把这个分组拆开。一个片段就是其中一毫秒的那一片，而且被剥得只剩骨头：没有要搜索的前导码（preamble）、没有头、没有地址、没有数据——只有用来取时间戳的那段序列，所以它的全名叫测距序列片段（RSF）。每台设备每轮到一次就发一个，标签和它的锚点交错着来，谁都用得上别人留下的空隙。' },
    { heading: '把听不见的东西加起来', text: '这些片段单独拿出来，一个也听不见。但接收机事先已经知道这一串的形状——每个片段什么时候来、里面装的是什么——所以它根本不需要先检出什么才能开始：它盲目地累加，一毫秒又一毫秒，直到最后才下判断。片段数量翻一番，累加起来的量也翻一番，而这个和可以越过其中任何一片都越不过的门限。' },
    { heading: '谁来说话', text: '事先知道这一串的形状，总得有个来处，而它不是从宽带那台射频来的。旁边还有一台小小的窄带射频，由它承载话语：一帧 Poll 打开这一轮，并点名它要问的每一个锚点；每个锚点各回一帧 Response 表示接受；末尾再各发一帧 Report。在这两头之间，宽带射频只承载时间，别的什么也不载。' },
    { heading: '够得着不等于测得准', text: '这一串片段买来的是距离，而且只有距离。穿过砖墙的首径（first path）依旧迟到，于是每次测距都偏长，而且每轮偏得一样多——这是固定的偏移，不是噪声，附在每条距离上的品质因数（figure of merit, FoM）字节会把它标成被遮挡的路径。这里没有任何东西让测量变得更准，它只是让测量得以存在。' },
  ],
  numbers: [
    { kind: 'table', heading: '这个房间，以及什么能穿过去', head: [
      '场景', '取值',
    ], rows: [
      ['大厅', '22 × 8 m'],
      ['砖墙位于', 'x = 5 m, x = 10 m'],
      ['锚点到标签', '13.04, 13.04, 12.76 m'],
      ['两道砖墙', '24 dB'],
      ['一个片段到达时', '−100.26 / −100.07 dBm'],
      ['接收机需要的门限', '−93 dBm'],
    ] },
    { text: '每个片段到达时比接收机门限低了约七个分贝；而三个锚点与标签几乎等距：三个都听见，或者一个也听不见。' },
    { kind: 'table', heading: '一轮，日志怎么印', head: [
      '何时', '那一行',
    ], rows: [
      ['0 ms', 'tag-1 UWB round 0 of block 0 (MMS): 52 slots × 500.0 µs'],
      ['0 ms', 'tag-1 → * NBPOLL 23 B @0.25 Mbps (928.0 µs)'],
      ['1.000 ms', 'anchor-1 → tag-1 NBRESP 12 B @0.25 Mbps (576.0 µs)'],
      ['4.000 ms', 'tag-1 → * UWBRSF 0 B @0 Mbps (82.1 µs)'],
      ['18.500 ms', 'anchor-1 RSF train ← tag-1: 8/8 heard, -100.3 dBm + 9.0 dB = margin 1.8 dB → detected, ratio -39.997 ppm · responders: anchor-1, anchor-2, anchor-3'],
      ['20.000 ms', 'anchor-1 → tag-1 NBREPORT 13 B @0.25 Mbps (608.0 µs)'],
      ['20.608 ms', 'tag-1 range → anchor-1 (SS): 14.26 m (true 13.04 m, raw 17.25 m)'],
      ['26.000 ms', 'tag-1 position (14.24, 4.08) m, true (13.00, 4.00), error 1.24 m, GDOP 2.93, 3 anchors'],
    ] },
    { kind: 'table', heading: '一轮问三个，还是三轮各问一个', head: [
      '量', '一轮问遍三个',
      '一次只问一个', '出处',
    ], rows: [
      ['一轮的时隙数', '52', '28', 'UWB_ROUND'],
      ['一轮的时长', '26 ms', '14 ms', '52 × 500 µs'],
      ['每块的轮数', '1', '3', '每个标签—锚点对一轮'],
      ['到本块定位为止', '26 ms', '42 ms', 'UWB_POSITION'],
      ['窄带消息数', '7', '9', 'NBPOLL, NBRESP, NBREPORT'],
      ['Poll 窗口装得下的应答者', '3', '1', '两个 600 RSTU 时隙要装下 Poll，而 Poll 每多一个应答者就长 3 字节'],
    ] },
    { text: '慢的依旧是窄带那一侧。它那七条消息占掉整轮 7.106 ms 空口时间（airtime）里的 4.480 ms，而三十二个片段加起来才 2.626 ms。' },
    { heading: '墙加进来多少', text: '每一次测距都偏长同样的 1.199 m：砖墙给首径添 2 ns，而射线来回各穿两道墙，这一份双向测距留了下来。' },
    { text: '定位把它整个继承过去。检视面板显示的是最后一个块的结果：(14.22, 4.05) m，真值 (13.00, 4.00)；而旁边那个只认识噪声的椭圆，仍停在厘米量级。' },
    { kind: 'steps', heading: '一轮，一步一步来', items: [
      '这个块先从允许列表（allow list）里抽出自己的窄带信道；随后一轮在它的第一个时隙里开场：标签广播一帧 Poll，把它要问的每个锚点都点上名。',
      '被点到名的锚点，各自在属于自己的 Response 窗口里作答。只有一来一回都走完的那一对才算就绪；也只有就绪的接收机才知道这一串的形状。',
      '接着是测距阶段。标签一个时隙、每个锚点各一个时隙，于是几串片段彼此交错，而同一台设备自己的两个相邻片段，相隔四个时隙，也就是两毫秒。',
      '一个片段就是一个短符号（symbol）重复若干遍，而它把整整一毫秒的能量，花在自己短得多的那段长度里。接收机在一串里只打两个时间戳——听到的第一个片段和最后一个——各取在它的第一个脉冲上。',
      '阶段末尾，每个接收机把自己听到的片段加起来，再从这个和里减去自己的灵敏度（sensitivity）；剩下的不为负，就判这一串检出。',
      '再往后是报告窗口，每个锚点两个：锚点发出自己掉头所用的回复时延（reply time），标签回话报出它量到的往返时间，然后由标签把这一对时间变成一个距离。',
      '而这一切都得先过三关，否则这个时隙根本跑不起来：它要是 300 RSTU（ranging slot time unit）的整数倍；一个时隙要装得下最长的那个片段再加飞行余隙；两个时隙要装得下最长的那条窄带消息——也就是那帧 Poll，而它每多点一个锚点就长一截。',
    ] },
    { kind: 'table', heading: '同样这七步，落在本场景上', head: [
      '步骤', '这一轮',
    ], rows: [
      ['Poll，三个锚点', 'slot 0 · 23 B · 928.0 µs'],
      ['Response，每锚点一条', 'slots 2, 4, 6 · 12 B · 576.0 µs'],
      ['测距阶段', 'slots 8–39 · 4 per 2 ms · 8 fragments'],
      ['一个片段', '40 × 1 024 = 40 960 chips · 82.051 µs · 37 nJ'],
      ['锚点处的那个和', '−100.26 + 9.03 = −91.23 dBm · +1.77 dB'],
      ['Report，每锚点一条', 'slots 40, 44, 48 · 13 B · 608.0 µs'],
      ['三关，600 RSTU', '600 % 300 = 0 · 82.3 < 500.0 · 928.2 < 1000.0 µs'],
      ['添到第四个锚点——驳回', '1024.2 > 1000.0 µs'],
    ] },
  ],
  deeper: [
    { heading: '为什么没有前导偏移要减', text: '普通的测距帧带着前导，接收机得先找到它才谈得上计时，而时间戳定义在帧内某个已知位置的标记上。片段完全没有这一套：接收机本来就知道它什么时候来，于是时间戳就是这一串里第一个片段的第一个脉冲。每串一个 RMARKER，取在串的开头——发送记录和接收记录里存的都是它。' },
    { heading: '本场景没有发的那些完整性片段', text: '在测距片段之后，一串还可以带上第二种片段：完整性片段。它们的序列从不在窄带控制交互里传出去，所以事后重放的录音复现不出这段序列。本仿真器并不做这件事：它不生成这段序列，也不做任何比对。在本仿真器里，完整性判定只是一次检出结果——那串完整性片段有没有越过灵敏度；而且多毫秒轮次根本没法被中继，因为这类接收压根进不了攻击者那条分支。本课的会话一个也不要，所以整段运行里没有任何一次测距带有完整性判定——日志里干脆就没有这个字段可印。它们在阶段里的位置是定死的，不必商量：设 X 个测距片段，最后一个之后空出 Z 毫秒，那么第 y 个完整性片段（y 从零数起）落在第 X + Z + y − 1 毫秒上。这里要解决的问题是够得着；完整性是另一张账单，用时隙来付。' },
    { heading: '锚点为什么站在那里', text: '三个锚点到标签分别是 13.04、13.04 与 12.76 m——在第一个隔间里能做到的最接近等距。这是有意为之：整堂课都系在同一个临界点上，而若把一个锚点贴到第一道砖墙上，它就只有 8.58 m 远、响 3.6 个分贝，于是它会在半串片段上照常测距，而另外两个什么也听不见。让三者一起失败，才让这个临界点看得见。' },
  ],
  sources: [
    '本课几乎没有一处出自 IEEE Std 802.15.4-2024。单位是标准的：RSTU、RCTU、块与它的时隙；那台窄带射频本身也是标准的，即第 12 章、250 kb/s 的 O-QPSK PHY。',
    '多毫秒分组、片段，以及把那台窄带射频变成 UWB 控制射频的一切，都来自 P802.15.4ab：它处于 Sponsor 投票再循环阶段，版本为 D5.0。该草案仅对会员开放，所以这里改写自 TG4ab 的四篇提案文稿：15-22/0381r5（测距周期）、15-23/0100r2（片段与窄带 PHY）、15-23/0502r3（参数集）与 15-22/0205r0（能量预算）。已投票的草案可能与此不同。',
    '房间是仿真器自己的模型取值：22 × 8 m 的大厅、两道各 12 dB 的砖墙、每道砖墙 2.0 ns 的非视距额外时延，以及一个跑在草案默认测距周期上的会话，窄带控制信道落在 UNII-3，而本场景里那里没有别人在说话。',
  ],
  scenario: () => uwbMmsScenario('base'),
  variants: [
    { label: '四个片段', scenario: () => uwbMmsScenario('four') },
    { label: '参数集 rsf-1', scenario: () => uwbMmsScenario('rsf1') },
    { label: '拿 4z 作对照', scenario: () => uwbMmsScenario('twr') },
    { label: '一次只问一个锚点', scenario: () => uwbMmsScenario('pairwise') },
  ],
  jumps: [
    J('打开轮次的那帧窄带 Poll', firstNbPoll),
    J('第一串片段里的第一个', firstUwbRsf),
    J('对端如何判定这一串片段', firstUwbTrain),
    J('收尾的那帧窄带 Report', firstNbReport),
    J('两者共同得出的那次测距', firstUwbRange),
  ],
  observe: [
    '一开始空口上没有任何宽带动静。标签用一帧窄带 Poll 打开这一轮，而这一帧是同时说给每个锚点听的；它们各自在自己的时隙里作答，到这时才有人算就绪、才去听片段。',
    '接着是片段：四串交错着来，每半毫秒一帧，每一帧零字节、没有速率——片段里什么也不装。在最后一个片段之后的那个时隙里，各方对自己累加到的东西下判断，而接收时间戳直到这时才出现。',
    '读一读 18.500 ms 处那条判定：它末尾跟着一串应答者名单。片段只发了一次，而三个锚点听的都是这一次。',
  ],
  tryThis: [
    '载入“拿 4z 作对照”：同样的房间、同样的节点，改用普通的双向测距。一次测距也回不来。锚点在等一帧它们永远听不到的 Poll，标签把每个响应时隙都等空，于是日志里填满的是超时。',
    '载入“一次只问一个锚点”。回来的还是那三个距离，只不过是三轮而不是一轮，本块的定位也从 26 ms 推迟到 42 ms。任何单个距离本身都没有变。',
  ],
  quiz: [
    {
      q: '为什么不干脆发一帧更长的测距帧，而要发一串片段？',
      options: [
        '更长的帧塞不进一个时隙',
        '限制是按每毫秒取的平均，所以帧更长并不更响；而一串片段是把每一毫秒的额度一次次重新花掉',
        '接收机没法给长帧打时间戳',
      ],
      answer: 1,
      explain: '任何一瞬都不能更响，但用掉多少毫秒并不受限——而对端可以把它们加起来。',
    },
    {
      q: '既然测量是宽带射频做的，那窄带射频是干什么的？',
      options: [
        '它再粗略地量一次距离，用来相互校验',
        '它承载话语——开场、接受、报出回复时间——好让接收机在片段到来之前就知道这一串的形状',
        '它在块与块之间把锚点唤醒',
      ],
      answer: 1,
      explain: '盲目累加的前提，是你已经知道每个片段何时到、里面装什么。这份知识是由那台小射频送来的。',
    },
  ],
}
