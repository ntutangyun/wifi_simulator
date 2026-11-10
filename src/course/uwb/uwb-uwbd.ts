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
  module: 30,
  title: '不依赖窄带射频',
  why: '前面几课中，控制消息一直由另一部窄带（narrowband, NB）射频传送：发起、接受、报告都由它完成。草案还给出另一套配置，把这三条消息移回超宽带（ultra-wideband, UWB）自身的信道上，改用一种称为 SP0 的短包传送，设备因此可以省去一部射频。但省去的不只是一部射频，还有那一问一答为接收机提供的先验信息：它事先告知接收机这一列片段（fragment）何时到达、内容是什么，接收机才能直接累加，而不需要任何单个片段能被单独检出。没有这些信息，时基只能从包中获得，接收机必须先检测到信号，这一步称为捕获（acquisition）；本课规定它只能凭单个包判定、不允许累加，这是本课的模型规则。SP0 是最难捕获的包：一份提案估算，它更长、峰值功率更低，捕获性能比包头那段同步序列差约 4 dB。本课又假设 SP0 不按毫秒能量预算发射、而使用设备通常的发射功率（transmit power），从天线（antenna）发出时比一个片段低十个多分贝，再把那约 4 dB 计为接收门限的提高；两项并不独立，一条链路（link）合计少了十四个多分贝是本课的取值，比提案的估算大得多，作用距离不到单个片段的五分之一。在本课的走廊上，十米处的锚点（anchor）仍能完成测距，二十米处的锚点连发起消息都没有收到，一个片段也没有发送。同一份提案还建议把控制阶段完全置零、让测距包包头的同步序列充当发起消息（是否已纳入草案无法确认）；这样捕获能通过，整列片段也被检出，但本课场景里收尾的报告仍是 SP0 包，仍然无法送达。所以在本课的取值下，去掉窄带射频以后，整轮的作用距离由最难捕获的那个包决定，而不是由片段决定。这一代价也有另一面：SP0 短，一个窗口只占一个时隙，零长控制阶段则完全不占时隙，同一轮测距比窄带辅助配置更短。',
  outcomes: [
    '说出两套控制面配置分别在哪条信道上传送发起、接受与报告消息',
    '解释为什么去掉窄带射频之后，接收机必须先自行捕获这个包',
    '预测在同一距离上，三种控制面各自能否得出距离',
  ],
  needs: ['uwb-mms', 'uwb-nba'],
  terms: [
    { term: 'UWBD-MMS', plain: 'UWB 驱动的多毫秒配置：控制消息不经窄带射频传送，改由超宽带自身的信道传送' },
    { term: 'SP0', plain: '标准 HRP UWB 物理层中不带 STS 的包结构（STS 包配置 0：同步字段、帧起始定界符、物理头与载荷），草案用它承载 UWB 驱动配置的控制消息' },
    { term: 'acquisition', plain: '捕获：接收机首次检测到这个包、并由此获得时基的那一步；本课按单个包或单个片段判定，这是本课的模型规则' },
    { term: 'zero-length control phase', plain: '零长控制阶段：一份提案（15-25/0194r0）的建议，两个时隙数都置零，控制阶段完全取消，由测距包本身充当发起消息；是否已纳入草案无法确认' },
  ],
  picture: [
    { heading: '同样三条消息，两条信道', text: '一轮测距要发送三条消息：标签（tag）发起询问，锚点（anchor）接受，最后各自报告自己测得的时间。草案按这三条消息在哪条信道上传送，分为两套配置。窄带辅助配置——也就是前面几课运行的配置——把它们交给另一部窄带射频。UWB 驱动配置中没有这部射频，三条消息改为超宽带自身信道上的短包，草案称之为 SP0。' },
    { kind: 'watch', jump: 0, heading: '观察发起消息改用的信道', text: '载入仿真，跳到第一个 SP0 包。它在超宽带信道上，长 117.6 µs；而窄带的 Poll 帧长 576 µs，使用的是另一段频谱。这一轮中没有任何窄带消息。' },
    { heading: '控制阶段也可以完全取消', text: '一份针对草案的意见决议提案（15-25/0194r0）还建议了第三种方式：把控制阶段的两个时隙数同时置零，这个阶段就完全取消，不发送任何 SP0 包。这一建议是否已纳入草案，公开材料无法确认；本课按提案实现它。那么发起与接受由什么承担？由测距包本身——它的包头本来就带有一段供接收机锁定信号的序列，即同步字段（SYNC field, SYNC）加上帧起始定界符（start-of-frame delimiter, SFD）。这段序列既充当发起，也充当接受。再看 SP0 包本身的结构：一段 SYNC、一个 SFD、一个物理头（PHY header, PHR），最后是消息本身，也就是 PSDU（PHY service data unit）。' },
    { heading: '没有先验信息，接收机必须自行捕获', text: '这才是真正改变的地方。窄带的那一问一答，事先把这一列片段的结构告知了接收机——每个片段何时到达、内容是什么——所以接收机可以直接累加，一毫秒接一毫秒，而不需要任何单个片段能被单独检出。没有那一问一答，时基只能从包中获得：接收机必须先检测到某一个片段，才能累加后续片段。这一步称为捕获（acquisition）。本课把它建模为一条按单个片段判定、不允许累加的门限判据——这是本课的模型规则，草案没有规定捕获怎样判定。' },
    {
      kind: 'diagram', heading: '一轮开头的两种包，按同一时间刻度绘制', spec: uwbUwbdHeadFields(),
      caption: '按提案 15-25/0194r0 给出的顺序绘制：前四格是 SP0 包，最后一格是测距包本身的起始片段。SP0 的四格中只有前两格用于捕获，后两格是它携带的消息；控制阶段置零时前四格完全取消，最后一格就成为发起。本课还假设两者的功率不同——片段把整整一毫秒的能量集中在自身这 82 µs 内，SP0 使用的是通常的突发功率；后一条是本课的假设，草案没有这样规定。',
    },
    { heading: 'SP0 是更难捕获的那一个', text: '提案 15-25/0194r0 的论证是：SP0 更长、峰值功率更低，所以接收机捕获它比捕获那段短而峰值高的序列更困难，它按脉冲数之比估算出的差距约为 4 dB。本课的场景把这件事计成两项。第一，本课假设 SP0 包不按毫秒预算发射，而是使用设备通常的突发功率（这是本课的模型取值，草案没有这样规定），于是从天线（antenna）发出时的功率就比一个片段低 10.54 dB。第二，本课把提案的约 4 dB 计为接收门限的提高。提案的约 4 dB 本身就是峰值功率较低造成的，所以这两项并不独立：一条链路上少了十四个多分贝，是本课取值下的代价，比提案的估算大得多。若只计提案的约 4 dB，二十米处的 SP0 包仍高于门限，那个锚点就能完成测距。' },
    { heading: '一轮反而更短', text: '这一代价并非只有一面。草案只把控制阶段的时隙数作为参数，占几个时隙由会话配置决定；在本课的排法里，一个窄带窗口占两个测距时隙（ranging slot），因为最长的那条窄带消息无法容纳在一个时隙内；SP0 包只有 117.6 µs，任何合法的时隙都能容纳，于是一个窗口只占一个时隙。控制阶段与报告阶段因此各节省一半，零长配置连控制阶段都不占用——同一轮测距，分别为 28 个时隙、24 个、22 个。' },
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
    { text: '报告阶段没有随控制阶段一起取消，这是有意的：草案为这两个阶段各配置了一对时隙数，把控制阶段的那一对置零，并不意味着报告阶段的那一对也为零。' },
    { kind: 'formula', heading: '那十四个多分贝', text: '片段 10·log10(37 nJ / 82.051 µs) = −3.46 dBm\nSP0 发射功率 = −14.00 dBm  →  相差 10.54 dB\n门限：片段 −93 dBm，SP0 −89 dBm  →  再差 4 dB', note: '上面一行是发射端的差值，下面一行是接收端的差值；两者相加 14.54 dB，就是本课计入的 SP0 相对于片段的功率损失。−14.00 dBm 的突发功率、−93 dBm 的接收机与 4 dB 的门限提高都是本课的取值，不是草案的规定。' },
    { kind: 'table', heading: '这条走廊上的两个锚点', head: [
      '量', '十米处的锚点',
      '二十米处的锚点',
    ], rows: [
      ['路径损耗（path loss）', '70.50 dB', '76.52 dB'],
      ['一个片段到达时', '−73.95 dBm', '−79.98 dBm'],
      ['整列八个片段累加', '−64.92 dBm', '−70.94 dBm'],
      ['SP0 包到达时', '−84.50 dBm', '−90.52 dBm'],
      ['SP0 的门限 −89 dBm', '高出 4.50 dB', '低了 1.52 dB'],
    ] },
    { text: '求出分界距离：SP0 包在这条走廊上的最大作用距离是 16.80 m，单个片段可达 89.59 m，八个片段累加后可达 253.41 m。二十米处的锚点位于第一个距离之外、第二个距离之内——本课的全部结论都取决于这一区间。' },
    { kind: 'table', heading: '三种控制面各自的测距结果', head: [
      '控制面', '十米处',
      '二十米处', '每块的距离数',
    ], rows: [
      ['窄带辅助（Config 2）', '测得', '测得', '4'],
      ['UWB 驱动 + SP0', '测得', '未发送任何片段', '2'],
      ['UWB 驱动 + 零长', '测得', '整列检出，但报告未送达', '2'],
    ] },
    { text: '第二行的失败发生在发送之前：SP0 发起消息没有到达，远处的锚点无从得知有设备在询问它，于是它没有发送任何片段。第三行的失败发生在另一个环节——两端都捕获了对方的包，整列片段以 22.06 dB 的余量检出，但在本课的场景里这一轮的报告也是一个 SP0 包，受同一门限限制。在本课的取值下，去掉窄带射频以后，整轮的作用距离由最难捕获的那个包决定，而不是由片段决定。' },
    { kind: 'steps', heading: 'UWB 驱动配置下一轮的步骤', items: [
      '这一轮不选取窄带信道，也不执行先听后发（listen before talk, LBT）：没有窄带射频，这两项设置在这套配置中没有作用对象。',
      '控制阶段：控制面为 SP0 时，标签发送一个 SP0 发起包，锚点随后发送一个 SP0 接受包；每个窗口占一个时隙是本课的排法。两个时隙数都置零时（提案 15-25/0194r0 的建议），这个阶段长度为零，下面一步直接从本轮第一个时隙开始。',
      '测距阶段：两端各按自己的时序发送片段，与窄带辅助配置完全相同。不同的只是接收机在此之前是否已经获得先验信息。',
      '（本课的模型规则，草案没有规定这样的判据）捕获判定，仅在 UWB 驱动配置下进行。使用控制阶段时，时基来自那个 SP0 包，按 −89 dBm 判定是否收到；控制阶段为零时，时基来自包头的那个片段，按 −93 dBm 判定，而且必须由单个片段达到门限，不允许累加多个片段。',
      '（本课的模型规则）捕获判定未通过，整轮即作废：片段都已到达，但一个也无法打上时间戳，所以这一轮不产生任何距离。',
      '报告阶段：在本课的场景里，每个锚点用一个 SP0 包报告自己的回复时延（reply time），标签回复一个报告往返时间，然后由获得这两个数的一端算出距离；报告用哪种包、携带哪些字段是本课的取法。这个阶段不随控制阶段取消。',
    ] },
    { kind: 'table', heading: '这六步在本场景中的取值', head: [
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
    { heading: '草案中的对比表与本课的取值', text: '提案对两种起始方式做了并列计算，比较的是脉冲数而不是时长，因为捕获性能取决于脉冲数。在典型的 91 长码上：短包 SP0 比同为短包的 SYNC+SFD 长 4 倍、脉冲多 4.3 倍，10·log10(4.3) = 6.33 dB；长包是 3.3 倍与 3.4 倍，10·log10(3.4) = 5.31 dB；两边都取 PSR 64 时是 2.3 倍与 2.4 倍，10·log10(2.4) = 3.80 dB。提案的结论句把这三个数概括为“约 4 dB”，本课取的就是这 4 dB，它是模型取值，三个精确值只在这里列出。注意方向：SP0 更长、峰值更低，所以它更难捕获；不用 SP0 时，由那段更短、峰值更高的序列决定链路预算，而且链路预算更好。还要注意这几个数的含义：它们是脉冲数之比换算出的功率电平差，也就是 SP0 因峰值功率较低而损失的那部分。本课把它们计为接收门限，同时又假设 SP0 只按设备通常的突发功率发射、比片段再低 10.54 dB——峰值较低这件事因此被计了两次，这是本课的取法，不是提案的结论。' },
    { heading: '何时应使用 SP0', text: '提案对取舍的表述很具体，而且不是“哪个更好”的问题。应使用 SP0 的情形：发起或接受消息的 message control 字段非零；用例需要可解析私有地址、公开地址或安全；要设置短期或长期的操作参数。不使用的情形只有一个——只需要一问一答，以获得最大的链路预算。也就是说，这个选项取决于是否还需要附带传送其他信息。另外，提案写明零长控制阶段只适用于 UWB 驱动配置（Config 1），所以本课也不提供窄带辅助配置加零长的组合。' },
    { heading: '同一长度适用于三条消息', text: 'SP0 包的 PSDU 在草案那张表里是 52.3 µs，按 1.95 Mbit/s 算是 102 比特，也就是十二个整字节——正好是草案那三条压缩控制消息的大小（发起与接受十二字节，报告十三字节）。所以本课对全部三条 SP0 消息取同一个时长，也不随应答方个数增加而变长：表中只给出一个 PSDU 长度，没有更长的取值。两列之中取的是短包那一列（117.6 µs，另一列是 170.1 µs），这也是保守的选择：它使一轮的时长增加得最少。' },
    { heading: '草案中的两个编号区间', text: '按提案 15-25/0194r0 的描述，开始测距（start of ranging, SOR）消息里有一个 Management PHY Configuration 字段，取值 1–8 指窄带辅助那套配置，14–15 指 UWB 驱动那套。本课不展开管理帧的逐位编码，两端使用哪一套配置是预先给定的，所以这两个区间只在这里提及一次。包头那段序列的长度也不能任意选择：它由 RSF 片段长度字段决定，即使这个包一个测距序列片段（ranging sequence fragment, RSF）也不发。' },
  ],
  limits: [
    { kind: 'model-value', text: '那 4 dB 是一个数代替了三个。本课只取这一个值，而草案自己按脉冲数之比给的是 6.33、5.31 与 3.80 dB，取哪一个要看码长与前导重复数——而本课的模型里没有 SP0 包的前导重复数这个量。于是「SP0 的最大作用距离 16.80 m」这条分界线随这一个取值移动：换成 6.33 dB，它落在更近的地方，而二十米处那个锚点的结论不变，只是因为它距离足够远。反过来，这条分界线也取决于本课另一项假设（SP0 按设备通常的突发功率发射）：提案的那几个分贝数本身就是峰值功率较低造成的差距，本课把两项叠加，SP0 的代价被计了两次。只计提案的估算时，二十米处的 SP0 包仍高于门限。' },
    { kind: 'model-value', text: 'SP0 包始终取短包那一列。本课取 117.6 µs，从不使用另一列的 170.1 µs，PSDU 也固定在十二个字节、不随应答者名单变长——所以一对多的 SP0 Poll 只能广播，包里不带应答方的地址，本课假定每个应答方事先知道自己参与这一轮。真实的一对多控制面要携带地址，包就更长、也更难捕获，而本课无法测出这一代价。' },
    { kind: 'threshold', text: '捕获是一条硬门限，只判定一次，没有第二次机会。本课的判据只检查单个包或单个片段是否达到 −89 / −93 dBm，未达到就整轮作废；没有更宽的搜索窗、没有跨片段的非相干累加，也没有找到时基之后再继续跟踪。真实接收机在门限附近的捕获概率是一条连续曲线，在同一距离上有时能捕获、有时不能，而这里 16.80 m 之内必然成功、之外必然失败。' },
    { kind: 'unmodelled', text: '两套配置在本课里是事先给定的，不是空口上的一次商定。SOR 消息里那个 Management PHY Configuration 字段（1–8 指窄带辅助，14–15 指 UWB 驱动）在本课的运行中不出现，两端不交换它。同理，包头那段序列的长度在本课中固定等于 RSF 片段的长度，SP0 包那四段的时长固定取草案那张表里短包一列的值，两者都不随 PHY 配置变化。所以「两端如何协商使用哪一套配置、协商失败会怎样」这一整部分在本课中无法观察。' },
  ],
  sources: [
    '两套控制面配置、SP0 包的四段时长与它的 PSDU 速率、那张按脉冲数算的捕获对比表、以及零长控制阶段的规则，全部来自 P802.15.4ab：截至 2026 年 9 月，它的投票稿是 D05，仍处于 Sponsor 投票复审阶段。该草案仅对会员开放，所以这里改写自 TG4ab 提案文稿 15-25/0194r0。其中两套配置与 SP0 控制包是那份文稿引述的草案内容；零长控制阶段则是那份文稿自己作为意见决议提出的修改建议，之后的文稿里找不到它被采纳的记录，所以它是否在草案中无法确认。已投票的 D05 可能与之不同。一轮的阶段划分、时隙与块的默认值出自 15-22/0381r5，片段本身出自 15-23/0100r2。',
    '单位、块与时隙出自 IEEE Std 802.15.4-2024；那部窄带射频本身也出自标准，即第 13 章、250 kb/s 的 O-QPSK 物理层（physical layer, PHY）。按毫秒平均的 −41.3 dBm/MHz 来自法规，正是它把片段的功率变成一份能量预算。',
    '以下是模型取值：4 dB 这个数（提案给的是三个精确值与一句“约 4 dB”），以及把它计为接收门限的提高；SP0 包按设备自己的突发功率发射，而片段按毫秒预算发射，两者相差 10.54 dB（与前一项叠加，峰值较低这一点被计了两次）；SP0 窗口一个时隙、窄带窗口两个时隙；−93 dBm 的接收机与这条走廊的自由空间路径损耗；以及“捕获失败则整轮失败”这条后果。',
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
    J('远处锚点未收到任何消息的那个窗口', firstUwbTimeout),
  ],
  observe: [
    '整轮中没有任何窄带消息。0.000 ms 标签发出一个 SP0 包，0.500 ms 锚点回复一个，两者都在超宽带信道上，各 117.6 µs；到 8.500 ms 才出现第一条判定。换到“窄带辅助（Config 2）”场景，同样位置显示的是 NBPOLL 与 NBRESP，各 576 µs，而收尾的两帧 NBREPORT 各 608 µs。',
    '第二轮从 12.000 ms 开始，对象是二十米处的锚点，而它自始至终没有发送任何内容：12.500 ms 写着 “anchor-2 UWB slot 0: no sp0 from tag-1”，紧接着 13.000 ms 标签在自己的窗口中也没有收到任何消息。它并非没有收到片段——而是没有收到那条发起消息。',
    '载入“零长控制阶段”，再看同一个锚点。18.500 ms 与 19.000 ms 两条判定都写着 8/8 收到、余量 22.1 dB、检出；而 21.500 ms 是 “tag-1 UWB slot 20: no sp0 from anchor-2”。捕获判定通过了，报告却未能送达。',
  ],
  tryThis: [
    '依次载入三个场景，只关注一件事：每个 200 ms 的块中各得出几个距离。窄带辅助四个、SP0 两个、零长两个。再读出每一轮的长度——14 ms、12 ms、11 ms——就能看清这一取舍的两面：UWB 驱动配置更节省时隙，但在功率上代价更大。',
  ],
  quiz: [
    {
      q: '零长控制阶段下，二十米处那个锚点的整列片段以 22.06 dB 的余量检出了，为什么还是一个距离也没有？',
      options: [
        '片段没有打上时间戳',
        '这一轮的报告也是一个 SP0 包，它按 −89 dBm 判定，而在那个距离上它只有 −90.52 dBm',
        '锚点超出了会话的作用范围',
      ],
      answer: 1,
      explain: '捕获判定已经通过。在本课的场景里报告也是 SP0 包，−89 dBm 是本课给它取的门限；去掉窄带射频以后，整轮的作用距离由最难捕获的那个包决定，而报告恰好就是这样的包。',
    },
    {
      q: '为什么 SP0 包比同一个包里那段 SYNC+SFD 更难捕获？',
      options: [
        '它更短，所以脉冲更少',
        '它更长、峰值功率更低：脉冲数增加了，但每个脉冲更弱，捕获性能取决于两者之比',
        '它使用另一条信道',
      ],
      answer: 1,
      explain: '提案 15-25/0194r0 按脉冲数之比算出 6.3、5.3 与 3.8 dB 三个值，结论句概括为“约 4 dB”，这几个数本身就是峰值功率较低造成的差距。本课另外还假定它按设备的突发功率发射（本课的模型取值，草案没有这样规定），于是功率再低 10.54 dB——同一件事在本课里计了两次。',
    },
  ],
}
