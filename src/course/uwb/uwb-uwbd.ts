/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · Config 1, the UWB-driven control
 * plane: doing without the narrowband radio.
 *
 * Every MMS scene in this course so far has run Config 2: the POLL, the RESP and the REPORT ride a
 * 250 kb/s narrowband radio, and that exchange is what primes both ends before a fragment goes
 * out. The draft's other configuration puts those three messages on the HRP UWB PHY itself as SP0
 * packets — or, with both of its control-phase slot counts zeroed, has no control phase at all and
 * lets the packet's own leading SYNC+SFD fragment do their work.
 *
 * The lesson is what that costs. An SP0 packet is sent at the node's own burst power rather than
 * out of the millisecond's energy allowance a fragment spends, so it leaves the antenna 10.54 dB
 * quieter than a fragment; and it is judged 4 dB *higher* than a fragment, because it is longer and
 * at a lower peak power and therefore the harder thing to acquire. 14.54 dB of link, gone — and in
 * this hall that is the difference between reaching 20 m and reaching 16.80 m.
 *
 * The scene is a 22 m hall with one anchor at 10 m and one at 20 m, and the three control planes
 * are the base and its two variants. Measured: Config 2 ranges both anchors, Config 1 with SP0
 * never even tells the far anchor there is a peer, and Config 1 with a zero-length control phase
 * gets the *acquisition* back — the far anchor's train is detected with 22.06 dB of margin — and
 * still produces no range, because the REPORT that would carry the time back is an SP0 packet on
 * the same threshold. That last row is the lesson's own finding and it is stated as one.
 *
 * Every number quoted below is pinned in tests/course/uwb-uwbd.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import type { FieldsSpec } from '../diagram'
import {
  MMS_SP0_SEGMENT_NS, MMS_SP0_NS, rsfNs,
} from '../../uwb/mms'
import {
  J, anchor, firstUwbRange, firstUwbRsf, firstUwbSp0, firstUwbTimeout, firstUwbTrain,
  rangingLab, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'

/** Which control plane the scene runs: Config 1 with an SP0 control phase, Config 2's narrowband
 * trio, or Config 1 with no control phase at all. */
export type UwbUwbdVariant = 'base' | 'nba' | 'none'

/** The two anchors, on the tag's own line and at its own height so that 10 m is 10 m: the lesson
 * is about one threshold along one distance, and a ceiling mount would put 1.2 m of height into
 * every figure for nothing. */
export const UWBD_ANCHORS: { id: string; name: string; x: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 11 },
  { id: 'anchor-2', name: 'Anchor 2', x: 21 },
]
/** One plane, tag and anchors alike — see {@link UWBD_ANCHORS}. */
export const UWBD_Z = 1.0
export const UWBD_TAG_X = 1

/**
 * Config 1 carries no narrowband settings at all: there is no radio on that side for a channel
 * list or a listen-before-talk rule to act on, and `UwbMmsSchema` refuses a plan that keeps them.
 * 4ab draft 15-25/0194r0
 */
const UWBD = { control: 'uwbd', nbChannels: [] as number[], nbLbt: 'off' } as const

/**
 * The empty 22 m hall with a tag at one end and two anchors down the line, ranging in MMS mode on
 * the draft's own 600 RSTU slot and the session's default train (X = 8 RSFs, no RIF). Pairwise, so
 * each anchor gets its own round and each round is one control plane's shape end to end. NLOS is
 * off: nothing in this lesson is about a wall.
 */
export function uwbUwbdScenario(variant: UwbUwbdVariant = 'base'): Scenario {
  const mms = variant === 'nba'
    ? { nbChannels: [3] }
    : { ...UWBD, uwbdControl: variant === 'none' ? ('none' as const) : ('sp0' as const) }
  return uwbSc(
    rangingLab(),
    [
      ...UWBD_ANCHORS.map((a) => anchor(a.id, a.name, a.x, 4, UWBD_Z)),
      uwbTag('tag-1', 'Tag', UWBD_TAG_X, 4, UWBD_Z),
    ],
    {
      mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: false,
      mms: { ...DEFAULT_UWB_SESSION.mms, ...mms },
    },
  )
}

/**
 * The head of a UWB-driven round, in the draft's own order: the SP0 control packet segment by
 * segment — straight off `MMS_SP0_SEGMENT_NS`, which is the short-packet column of the draft's own
 * acquisition table — and then the ranging packet's own leading SYNC+SFD fragment, which the engine
 * cuts to the RSF fragment length.
 *
 * Both of the things a Config 1 receiver might be asked to find are therefore in one row on one
 * scale: the SP0 packet's first two boxes, or the last box on its own when the control phase is
 * zero-length and the first four are simply not there.
 */
export function uwbUwbdHeadFields(): FieldsSpec {
  const s = MMS_SP0_SEGMENT_NS
  const us = (ns: number): number => ns / 1000
  const frag = rsfNs(DEFAULT_UWB_SESSION.mms.nMsr, DEFAULT_UWB_SESSION.mms.gap) / 1000
  return {
    kind: 'fields',
    unit: 'µs',
    fields: [
      { label: 'SYNC', size: us(s.sync) },
      { label: `SFD ${us(s.sfd).toFixed(1)}`, size: us(s.sfd) },
      { label: `PHR ${us(s.phr).toFixed(1)}`, size: us(s.phr) },
      { label: 'PSDU', size: us(s.psdu) },
      { label: '片段 0', size: frag },
    ],
    total: `SP0 包 ${us(MMS_SP0_NS).toFixed(1)} µs，其后是 ${frag.toFixed(3)} µs 的片段`,
  }
}

export const uwbUwbd: Lesson = {
  id: 'uwb-uwbd',
  module: 21,
  title: '不靠那部窄带电台',
  why: '这一层课里说话的一直是旁边那部窄带（narrowband, NB）电台：它开场、它接受、它报告。草案还给了另一套配置，把这三件事搬回超宽带（ultra-wideband, UWB）自己这条信道上，设备于是可以少带一部电台。这一课要算清这笔账：省掉那部电台以后，谁来告诉接收机这一列片段（fragment）长什么样——以及为什么这个问题会把一段本来够得着的链路（link）砍掉一大半。',
  outcomes: [
    '说出两套控制面配置各把开场、接受与报告放在哪条信道上',
    '解释为什么去掉窄带之后，接收机必须先自己找到这个包',
    '预测同一段距离上，三种控制面各能不能得出一个距离',
  ],
  needs: ['uwb-mms', 'uwb-nba'],
  terms: [
    { term: 'UWBD-MMS', plain: 'UWB 驱动的多毫秒配置：控制消息不走窄带电台，改走超宽带自己这条信道' },
    { term: 'SP0', plain: '超宽带上最简单的那种短包，草案拿它承载 UWB 驱动配置的三条控制消息' },
    { term: 'acquisition', plain: '捕获：接收机第一次找到这个包、由此拿到时基的那一步' },
    { term: 'zero-length control phase', plain: '零长控制阶段：两个时隙数都置零，控制阶段整个消失，测距包自己当开场' },
  ],
  picture: [
    { heading: '同样三句话，两条信道', text: '一轮测距要说三句话：标签（tag）开场问，锚点（anchor）接受，末尾各自报出自己量到的时间。草案把这三句话放在哪里，分成两套配置。窄带辅助那套——也就是前面几课跑的那套——把它们交给旁边那部小电台。UWB 驱动那套里没有这部电台，三句话改成超宽带自己信道上的短包，草案管它叫 SP0。' },
    { kind: 'watch', jump: 0, heading: '看那句开场话换了信道', text: '载入仿真，跳到第一个 SP0 包。它在超宽带这条信道上，长 117.6 µs；而窄带那一帧 Poll 长 576 µs，走的是另一段频谱。这一轮里再也找不到任何一条窄带消息。' },
    { heading: '控制阶段还可以干脆不要', text: '草案还留了第三种写法：把控制阶段的两个时隙数同时置零，这个阶段就整个消失，SP0 包一个也不发。那三句话由谁来说？由测距包自己——它包首本来就带着一段让接收机锁住信号的图案，即同步字段（SYNC field, SYNC）加上帧起始定界符（start-of-frame delimiter, SFD）。这段图案既是开场，也是接受。顺带把 SP0 包自己也拆开看一眼：一段 SYNC、一个 SFD、一个物理头（PHY header, PHR），最后是那条消息本身，也就是 PSDU（PHY service data unit）。' },
    { heading: '没有人预热，就得自己找', text: '这才是真正换掉的东西。窄带那一问一答，把这一列片段的形状事先交到了接收机手上——每个片段什么时候来、里面装什么——所以它可以闭着眼睛一毫秒一毫秒地累加，谁也不必单独听得见。没有那一问一答，时基只能从包里来：接收机得先真正找到某一个片段，才谈得上累加后面的。这一步叫捕获，而它按单个片段判定，不许累加。' },
    {
      kind: 'diagram', heading: '一轮开头的两种包，同一把尺子', spec: uwbUwbdHeadFields(),
      caption: '按草案给的次序画：前四格是 SP0 包，最后一格是测距包自己那个开场片段。SP0 那四格里只有头两格用来捕获，后两格是它捎带的消息；控制阶段置零时前四格整个消失，最后那一格就成了开场。注意两者的功率不同——片段把整整一毫秒的能量花在自己这 82 µs 里，SP0 用的是平时那个突发功率。',
    },
    { heading: 'SP0 是更难找的那一个', text: '两件事叠在一起。第一，SP0 包不按毫秒预算发射，它用的是设备平时那个突发功率，于是离开天线（antenna）时就比一个片段轻 10.54 dB。第二，它更长、峰值更低，所以接收机找它比找那段短而高的图案更吃力——草案为此把它的门限抬高约 4 dB。一段链路上少了十四个多分贝，这就是那部电台省下来的真实价钱。' },
    { heading: '一轮却短了', text: '账不是单方向的。一个窄带窗口要占两个测距时隙（ranging slot），因为那条最长的窄带消息装不进一个；SP0 包只有 117.6 µs，任何合法的时隙都装得下，于是一个窗口只占一个。控制阶段与报告阶段因此各省一半，零长那种连控制阶段都不占——同一轮测距，28 个时隙、24 个、22 个。' },
  ],
  numbers: [
    { kind: 'table', heading: '同一轮，三种控制面', head: [
      '控制面', '一个窗口',
      '控制阶段', '报告阶段', '一轮',
    ], rows: [
      ['窄带辅助（Config 2）', '2 时隙', '4', '4', '28 时隙 · 14 ms'],
      ['UWB 驱动 + SP0', '1 时隙', '2', '2', '24 时隙 · 12 ms'],
      ['UWB 驱动 + 零长', '0 时隙', '0', '2', '22 时隙 · 11 ms'],
    ] },
    { text: '报告阶段没有跟着控制阶段一起消失，这是有意的：草案给这两个阶段各配了一对自己的时隙数，把控制那一对置零，并不说明报告那一对也是零。' },
    { kind: 'formula', heading: '那十四个多分贝', text: '片段 10·log10(37 nJ / 82.051 µs) = −3.46 dBm\nSP0 发射功率 = −14.00 dBm  →  相差 10.54 dB\n门限：片段 −93 dBm，SP0 −89 dBm  →  再差 4 dB', note: '上面一行是发射端的差，下面一行是接收端的差；两者相加 14.54 dB，就是同一条信道上 SP0 比片段少走的那一段。' },
    { kind: 'table', heading: '这条走廊上的两个锚点', head: [
      '量', '十米处那个',
      '二十米处那个',
    ], rows: [
      ['路径损耗（path loss）', '70.50 dB', '76.52 dB'],
      ['一个片段到达时', '−73.95 dBm', '−79.98 dBm'],
      ['整列八个加起来', '−64.92 dBm', '−70.94 dBm'],
      ['SP0 包到达时', '−84.50 dBm', '−90.52 dBm'],
      ['SP0 的门限 −89 dBm', '高出 4.50 dB', '低了 1.52 dB'],
    ] },
    { text: '解出那条分界线：SP0 包在这条走廊上走到 16.80 m 就到顶了，而一个片段单独走得到 89.59 m，八个片段加起来走得到 253.41 m。二十米处那个锚点落在第一个数字之外、第二个之内——整堂课就系在这一段上。' },
    { kind: 'table', heading: '三种控制面，各测出了什么', head: [
      '控制面', '十米处',
      '二十米处', '每块的距离数',
    ], rows: [
      ['窄带辅助（Config 2）', '测得', '测得', '4'],
      ['UWB 驱动 + SP0', '测得', '一个片段也没发出去', '2'],
      ['UWB 驱动 + 零长', '测得', '整列检出，却报不回来', '2'],
    ] },
    { text: '第二行的失败发生在开口之前：SP0 那句开场话没有到达，远处那个锚点根本不知道有人在问它，于是它一个片段也没发。第三行的失败换了位置——两端都找到了对方的包，整列片段以 22.06 dB 的余量检出，可这一轮的报告也是一个 SP0 包，它压在同一条门限上。去掉窄带以后，整轮的射程由包里最难找的那一个决定，而不是由片段决定。' },
    { kind: 'steps', heading: 'UWB 驱动的一轮，一步一步来', items: [
      '这一轮不抽窄带信道，也不先听后发（listen before talk, LBT）：那一侧没有电台，场景校验会直接拒绝留着这两项设置的计划。',
      '控制阶段：控制面为 SP0 时，标签在第一个时隙发一个 SP0 开场包，锚点在下一个时隙发一个 SP0 接受包，每个窗口一个时隙。两个时隙数都置零时，这个阶段长度为零，下面一步直接从本轮第一个时隙开始。',
      '测距阶段：两端各按自己的节奏发片段，和窄带辅助那套一字不差。变的只是接收机在此之前是否已经被预热。',
      '捕获判定，只在 UWB 驱动下才有。控制阶段在用时，时基来自那个 SP0 包，它按 −89 dBm 判定收没收到；控制阶段为零时，时基来自包首那个片段，它按 −93 dBm 判定，而且只许单个片段自己够得着，不许把几个加起来。',
      '判不过这一关，整轮就废：片段都在那儿，一个也打不了时间戳，所以这一轮不产生任何距离。',
      '报告阶段：每个锚点一个 SP0 包报出自己的回复时延（reply time），标签回一个报出往返时间，然后由拿到两个数的那一端算出距离。这个阶段不随控制阶段消失。',
    ] },
    { kind: 'table', heading: '这六步，落在本场景上', head: [
      '步骤', '本场景',
    ], rows: [
      ['窄带信道与先听后发', '空列表 · off'],
      ['控制阶段，SP0 与零长', '2 时隙 · 0 时隙'],
      ['一个片段', '40 × 4 × (128 + 2 × 64) = 40 960 chips · 82.051 µs'],
      ['捕获门限，SP0 与片段', '−89 dBm · −93 dBm'],
      ['二十米处，SP0 与片段到达时', '−90.52 dBm · −79.98 dBm'],
      ['报告阶段', '2 时隙 · 每个 SP0 包 117.6 µs'],
    ] },
  ],
  deeper: [
    { heading: '草案自己那张表，和引擎取的那个数', text: '提案把两种开场并排算了一遍，比的是脉冲数而不是时长，因为捕获吃的是脉冲。典型的 91 长码上：短包 SP0 比同为短包的 SYNC+SFD 长 4 倍、脉冲多 4.3 倍，10·log10(4.3) = 6.33 dB；长包是 3.3 倍与 3.4 倍，10·log10(3.4) = 5.31 dB；两边都取 PSR 64 时是 2.3 倍与 2.4 倍，10·log10(2.4) = 3.80 dB。提案的结论句把这三个数收成一句“约 4 dB”，引擎取的就是这 4 dB 并标为模型取值，三个精确值只进这张表。方向别弄反：SP0 更长、峰值更低，所以它更难找；不用 SP0 时，那段更短、峰值更高的图案定链路预算，而且定得更好。' },
    { heading: '什么时候该带上 SP0', text: '提案把取舍写得很实在，而且不是“哪个更好”。要带上它的情形：开场或接受消息的 message control 字段非零；用例需要可解析私有地址、公开地址或安全；要设置短期或长期的操作参数。不带的情形只有一个——只需要一问一答，为了把链路预算拿到最大。也就是说，这个开关问的是“你还需不需要顺便捎点别的东西”。顺带一句：零长控制阶段只属于 UWB 驱动配置；窄带辅助那套的窗口由窄带一侧排定，在那里选零长什么也不改变，所以场景校验直接拒绝。' },
    { heading: '一条长度服务三条消息', text: 'SP0 包的 PSDU 在草案那张表里是 52.3 µs，按 1.95 Mbit/s 算是 102 比特，也就是十二个整字节——正好是草案那三条压缩控制消息的大小（开场与接受十二字节，报告十三字节）。所以本引擎用同一个时长服务全部三条 SP0 消息，也不让它随应答方个数变长：表只给了一个 PSDU 长度，硬要拉长就是本模型自己的发明了。两列之中取的是短包那一列（117.6 µs，另一列是 170.1 µs），这也是保守的一头：它把一轮拉长得尽可能少。' },
    { heading: '草案里那两个编号', text: '管理帧里有一个 SOR Management PHY Configuration 字段，取值 1–8 指窄带辅助那套配置，14–15 指 UWB 驱动那套。本引擎不逐位编码管理帧，建模的是行为，所以这两个区间只记在词汇表里，不进代码。包首那段图案的长度也不是自由的：它由 RSF 片段长度那个字段决定，哪怕这个包一个测距序列片段（ranging sequence fragment, RSF）也不发。' },
  ],
  sources: [
    '两套控制面配置、SP0 包的四段时长与它的 PSDU 速率、那张按脉冲数算的捕获对比表、以及零长控制阶段的规则，全部来自 P802.15.4ab：截至 2026 年 9 月仍处于 Sponsor 投票复审阶段。该草案仅对会员开放，所以这里改写自 TG4ab 提案文稿 15-25/0194r0。已投票的草案可能与之不同。一轮的阶段划分、时隙与块的默认值出自 15-22/0381r5，片段本身出自 15-23/0100r2。',
    '单位、块与时隙出自 IEEE Std 802.15.4-2024；那部窄带电台本身也是标准的，即第 12 章、250 kb/s 的 O-QPSK 物理层（physical layer, PHY）。按毫秒平均的 −41.3 dBm/MHz 来自法规，正是它把片段的功率变成一份能量预算。',
    '以下是模型取值：4 dB 这个数（草案给的是三个精确值与一句“约 4 dB”）；SP0 包按设备自己的突发功率发射，而片段按毫秒预算发射，两者相差 10.54 dB；SP0 窗口一个时隙、窄带窗口两个时隙；−93 dBm 的接收机与这条走廊的自由空间路径损耗；以及“捕获失败则整轮失败”这条后果。',
  ],
  scenario: () => uwbUwbdScenario('base'),
  variants: [
    { label: '窄带辅助（Config 2）', scenario: () => uwbUwbdScenario('nba') },
    { label: '零长控制阶段', scenario: () => uwbUwbdScenario('none') },
  ],
  jumps: [
    J('第一个 SP0 包', firstUwbSp0),
    J('第一列片段里的第一个', firstUwbRsf),
    J('对端如何判定这一列片段', firstUwbTrain),
    J('第一个得出的距离', firstUwbRange),
    J('远处那个锚点等空的那个窗口', firstUwbTimeout),
  ],
  observe: [
    '整轮里一条窄带消息也没有。0.000 ms 标签发出一个 SP0 包，0.500 ms 锚点回一个，两者都在超宽带这条信道上，各 117.6 µs；到 8.500 ms 才出现第一条判定。换到“窄带辅助（Config 2）”那个场景，同样的位置印的是 NBPOLL 与 NBRESP，各 576 µs，而收尾那两帧 NBREPORT 各 608 µs。',
    '第二轮从 12.000 ms 起是二十米处那个锚点，而它从头到尾一声不吭：12.500 ms 写着 “anchor-2 UWB slot 0: no sp0 from tag-1”，紧接着 13.000 ms 标签也等空了自己那个窗口。它不是没听见片段——是没听见那句开场话。',
    '载入“零长控制阶段”，再看同一个锚点。18.500 ms 与 19.000 ms 两条判定都写着 8/8 收到、余量 22.1 dB、检出；而 21.500 ms 是 “tag-1 UWB slot 20: no sp0 from anchor-2”。捕获这一关过了，报告这一关没过。',
  ],
  tryThis: [
    '把三个场景依次载入，只盯住一件事：每 200 ms 一块里各得出几个距离。窄带辅助四个、SP0 两个、零长两个。再把每一轮的长度读出来——14 ms、12 ms、11 ms——就能看清这笔账的两面：UWB 驱动那套在时隙上更省，在分贝上更贵。',
  ],
  quiz: [
    {
      q: '零长控制阶段下，二十米处那个锚点的整列片段以 22.06 dB 的余量检出了，为什么还是一个距离也没有？',
      options: [
        '片段没打上时间戳',
        '这一轮的报告也是一个 SP0 包，它按 −89 dBm 判定，而在那个距离上它只有 −90.52 dBm',
        '锚点超出了会话的作用范围',
      ],
      answer: 1,
      explain: '捕获这一关是过了的。去掉窄带以后，整轮的射程由包里最难找的那一个定，而报告恰好也是那一个。',
    },
    {
      q: '为什么 SP0 包比同一个包里那段 SYNC+SFD 更难找？',
      options: [
        '它更短，所以脉冲更少',
        '它更长、峰值功率更低：脉冲多了，每个脉冲却轻了，捕获吃的是这两者的比',
        '它走在另一条信道上',
      ],
      answer: 1,
      explain: '草案按脉冲数之比算出 6.3、5.3 与 3.8 dB 三个值，结论句收成一句“约 4 dB”。本引擎另外还让它按设备的突发功率发射，于是再轻 10.54 dB。',
    },
  ],
}
