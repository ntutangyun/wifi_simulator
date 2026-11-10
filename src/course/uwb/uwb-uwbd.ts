/**
 * UWB Tier 3 · M15 · The other control plane · Config 1, the UWB-driven control plane: doing
 * without the narrowband radio.
 *
 * Standard-first shape (2026-11-10): ① what the P802.15.4ab draft and the TG4ab contribution
 * 15-25/0194r0 say about the two control-plane configurations, the SP0 packet and the proposed
 * zero-length control phase; ② how this simulator implements each point — including the one place
 * it departs from the proposal it cites (audit #17: the SP0 peak-power loss is counted twice, once
 * as 10.54 dB of transmit power and once as a 4 dB threshold); ③ three guided runs.
 *
 * The scene is a 22 m hall with one anchor at 10 m and one at 20 m. Measured: Config 2 ranges both
 * anchors, Config 1 with SP0 never reaches the far anchor, and Config 1 with a zero-length control
 * phase detects the far anchor's train and still produces no range, because this scene's REPORT is
 * an SP0 packet on the same threshold.
 *
 * Every figure the lesson prints is read back out of its text and compared with a run in
 * tests/course/uwb-uwbd.test.ts.
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
 * The head of a UWB-driven round, in the proposal's own order: the SP0 control packet segment by
 * segment — straight off `MMS_SP0_SEGMENT_NS`, which is the short-packet column of the acquisition
 * table in 15-25/0194r0 — and then the ranging packet's own leading SYNC+SFD fragment, which the
 * engine cuts to the RSF fragment length.
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
  why: 'P802.15.4ab 草案为多毫秒（multi-millisecond, MMS）测距规定了两套控制面配置：窄带辅助配置（Config 2）用另一部窄带（narrowband, NB）射频传送控制消息，超宽带（ultra-wideband, UWB）驱动配置（Config 1）则把轮询与应答改为超宽带信道上的 SP0 包，设备可以省去窄带射频。草案正在审议，提案 15-25/0194r0 引述了这两套配置，并据脉冲数之比估计：SP0 比测距包包头那个由同步字段（SYNC field, SYNC）与帧起始定界符（start-of-frame delimiter, SFD）组成的 SYNC+SFD 片段（fragment）更长、峰值功率更低，捕获（acquisition）性能约差 4 dB；这个数是提案的估计，不是草案规定的门限。同一份提案还建议允许把控制阶段的两个时隙数置零，由测距包包头的 SYNC+SFD 片段充当轮询与应答，这一建议是否被采纳，公开材料无法确认。本仿真器实现了这两套配置与零长控制阶段，但在 SP0 的代价上与提案不同：它让 SP0 按设备通常的发射功率（transmit power）发送、比片段低 10.54 dB，又把那约 4 dB 计为接收门限的提高，同一项损失计了两次，合计 14.54 dB；这是待改正的偏差。在这个取值下，本课走廊上十米处的锚点（anchor）能完成测距，二十米处的锚点收不到 SP0 轮询，一个片段也不发送；改用零长控制阶段后，远处锚点的整列片段被检出，但本课场景的报告仍是 SP0 包，距离仍然送不回来。',
  outcomes: [
    '说出草案的两套控制面配置分别在哪条信道上传送轮询、应答与报告',
    '说出提案 15-25/0194r0 对 SP0 与零长控制阶段说了什么，以及它们的采纳状态',
    '分清本仿真器在 SP0 代价上的取值与提案的估计有何不同，并预测三种控制面各自能否得出距离',
  ],
  needs: ['uwb-mms', 'uwb-nba'],
  terms: [
    { term: 'UWBD-MMS', plain: 'UWB 驱动的多毫秒配置（Config 1）：控制阶段的消息不经窄带射频传送，改由超宽带信道传送' },
    { term: 'SP0', plain: 'STS 包配置 0：IEEE 802.15.4-2024 HRP UWB 物理层中不带 STS 的包结构（同步字段、帧起始定界符、物理头与载荷），UWB 驱动配置用它承载控制消息' },
    { term: 'acquisition', plain: '捕获：接收机首次检测到这个包、并由此获得时基的那一步；标准与草案都没有规定接收机怎样判定捕获' },
    { term: 'zero-length control phase', plain: '零长控制阶段：提案 15-25/0194r0 的建议，两个时隙数都置零，控制阶段取消，由测距包包头的 SYNC+SFD 片段充当轮询与应答；是否被采纳无法确认' },
  ],
  standard: [
    { heading: '两套控制面配置（P802.15.4ab 草案，15-25/0194r0 引述）', text: '开始测距（start of ranging, SOR）消息里描述物理层（physical layer, PHY）配置的 Management PHY Configuration 字段（草案 §10.39.11.1.3.13）给出 MMS UWB 包配置：取值 1–8 是窄带辅助配置（NBA-MMS，Config 2），控制阶段的轮询与应答经窄带传送；取值 14–15 是 UWB 驱动配置（UWBD-MMS，Config 1），控制阶段使用超宽带；这个字段还分别指明控制阶段与报告阶段使用窄带还是超宽带。同一条消息里描述媒体访问控制（medium access control, MAC）配置的 Management MAC Configuration 字段（草案 §10.39.11.1.3.9）给出控制阶段的轮询时隙数与应答时隙数（macMmsRcpPollNSlots、macMmsRcpRespNSlots）、测距阶段时长与报告阶段时长，以及交织或非交织模式。' },
    { heading: 'SP0 包（IEEE Std 802.15.4-2024 §16.2.1，图 16-3）', text: 'SP0 是 HRP UWB 物理层里不带加扰时间戳序列（scrambled timestamp sequence, STS）的那种包，即 STS 包配置 0：同步字段、帧起始定界符、物理头（PHY header, PHR）与载荷（payload）。按 15-25/0194r0，UWB 驱动配置的控制阶段用 SP0 包承载轮询与应答。提案的对照表给出两种 SP0 时长：短包 117.6 µs，由 SYNC 46.7 µs、SFD 5.8 µs、PHR 12.8 µs 与 PSDU（PHY service data unit）52.3 µs 组成，PSDU 是按 1.95 Mbit/s 发送的 12 字节；长包 170.1 µs。' },
    { heading: '提案对 SP0 代价的估计（15-25/0194r0）', text: 'SP0 包更长、峰值功率更低；接收机靠它的 SYNC 与 SFD 估计载波频偏与定时，所以使用 SP0 控制时，链路（link）能达到多远由这个更长、峰值更低的包决定。提案按脉冲数之比比较 SP0 与测距包包头的 SYNC+SFD：在 91 长码上，两者都取短包时 SP0 的脉冲多 4.3 倍，都取长包时多 3.4 倍，都取 PSR 64 时多 2.4 倍，对应 6.3、5.3 与 3.8 dB 的功率电平差；结论句是 SP0 会使 UWB 驱动配置的同步性能明显受限，约 4 dB。这是一份提案的估计，草案没有据此规定任何接收门限。' },
    { heading: '零长控制阶段（15-25/0194r0 的提案，采纳状态未确认）', text: '提案建议把 macMmsRcpPollNSlots 与 macMmsRcpRespNSlots 的取值范围从 1–15 改为 0–15：两者都为零时控制阶段长度为零，不发送 SP0 包，SOR 的 Time Offset 直接指向测距包的 SYNC+SFD 片段，由它充当轮询与应答；这一做法只适用于 UWB 驱动配置。提案也写明何时仍应使用 SP0：轮询或应答的 Message Control 字段非零、需要可解析私有地址、公开地址或安全、要设置短期或长期的操作参数；只需要一问一答、要让链路达到最远时不用 SP0。之后的公开文稿中找不到这一建议被采纳的记录。' },
    { kind: 'steps', heading: 'UWB 驱动配置的一轮测距，按草案与提案：逐步说明', items: [
      '双方先通过 SOR 消息约定配置：Management PHY Configuration 取 14–15（UWB 驱动），Management MAC Configuration 给出控制阶段的时隙数、测距阶段与报告阶段的时长。',
      '控制阶段：发起方在 SOR 指定的时刻发出 SP0 轮询，应答方随后发出 SP0 应答，各占 macMmsRcpPollNSlots 与 macMmsRcpRespNSlots 个时隙。',
      '按提案，两个时隙数都为零时，上一步不存在，测距包包头的 SYNC+SFD 片段充当轮询与应答。',
      '测距阶段：双方发送 MMS 测距包——包头一个 SYNC+SFD 片段，其后是测距序列片段（ranging sequence fragment, RSF）。',
      '报告阶段：按 SOR 约定的配置（窄带或超宽带）交换测量结果。',
      '接收机怎样判定捕获、捕获失败之后怎么办，草案与提案都没有规定。',
    ] },
  ],
  implementation: [
    { topic: '两套配置', standard: 'Config 2 经窄带、Config 1 经超宽带传送控制阶段（草案 §10.39.11.1.3.13）', sim: '照此实现：Config 1 的场景不带任何窄带设置，编辑器拒绝在 Config 1 里保留窄带信道列表或先听后发（listen before talk, LBT）设置；Config 2 用窄带传送 Poll、Resp 与 Report。', kind: 'faithful' },
    { topic: 'SOR 消息', standard: '双方经 SOR 消息约定配置与各阶段时长（草案 §10.39.11.1.3.9、§10.39.11.1.3.13）', sim: '未实现：两端使用哪一套配置、各阶段多长，在场景里事先给定，空口上不交换 SOR 消息。', kind: 'absent' },
    { topic: 'SP0 包的时长', standard: '提案的对照表给出短包 117.6 µs 与长包 170.1 µs 两列', sim: '三条 SP0 消息都取短包那一列，117.6 µs，PSDU 固定 12 字节，不随应答方个数变长。', kind: 'value' },
    { topic: '控制阶段的时隙数', standard: '草案只把时隙数作为参数（1–15，提案建议 0–15）', sim: '一个 SP0 窗口占一个测距时隙（ranging slot），一个窄带窗口占两个（最长的窄带消息放不进一个 600 RSTU（ranging scheduling time unit）的时隙）；零长控制阶段不占时隙。', kind: 'value' },
    { topic: '零长控制阶段', standard: '提案 15-25/0194r0：两个时隙数都为零时不发 SP0，由 SYNC+SFD 片段充当轮询与应答，只用于 Config 1', sim: '照提案实现，只在 Config 1 下可选；报告阶段的时隙数不随之置零。', kind: 'faithful' },
    { topic: 'SP0 的功率与门限', standard: '提案估计 SP0 因峰值功率较低而捕获性能差约 4 dB；草案没有规定门限', sim: '本仿真器与提案不同：片段按每毫秒 37 nJ 的能量定额发射（82.051 µs 的片段为 −3.46 dBm），SP0 却按设备通常的发射功率 −14.00 dBm 发射，相差 10.54 dB；又把约 4 dB 计为门限的提高（SP0 −89 dBm，片段 −93 dBm）。提案的约 4 dB 本身就是峰值功率较低造成的损失，所以同一项被计了两次，合计 14.54 dB。这是待改正的偏差。', kind: 'differs' },
    { topic: '捕获判定', standard: '标准与草案都未规定', sim: '按单个包判定，不允许累加：SP0 包不低于 −89 dBm、或零长控制阶段时包头片段不低于 −93 dBm 才算捕获；捕获失败则这一轮不产生任何距离。', kind: 'choice' },
    { topic: '报告', standard: '报告阶段经窄带或超宽带，由 SOR 约定', sim: 'Config 1 的报告是 SP0 包：每个锚点报告自己的回复时延（reply time），标签（tag）报告往返时间，由取得两个数的一端算出距离；判定门限与 SP0 控制包相同。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '一轮开头的 SP0 包',
      jump: 0,
      more: [0, 1],
      steps: [
        '载入本课场景，跳到第一个 SP0 包，读出它的时刻与时长。',
        '再载入「窄带辅助（Config 2）」与「零长控制阶段」，对照下表读出每一轮的长度。',
      ],
      blocks: [
        { kind: 'diagram', heading: '一轮开头的两种包，按同一时间刻度绘制', spec: uwbUwbdHeadFields(), caption: '前四格是 SP0 包，最后一格是测距包包头的片段；零长控制阶段时前四格不发送，最后一格充当轮询。' },
        { kind: 'table', heading: '同一轮，三种控制面', head: ['控制面', '一个窗口', '控制阶段', '报告阶段', '一轮'], rows: [
          ['窄带辅助（Config 2）', '2 时隙', '4', '4', '28 时隙 · 14 ms'],
          ['UWB 驱动 + SP0', '1 时隙', '2', '2', '24 时隙 · 12 ms'],
          ['UWB 驱动 + 零长', '0 时隙', '0', '2', '22 时隙 · 11 ms'],
        ] },
      ],
      expect: '0.000 ms 标签发出一个 SP0 包，0.500 ms 锚点回复一个，各 117.6 µs，这一轮没有任何窄带消息；Config 2 的同一位置是 NBPOLL 与 NBRESP，各 576 µs，收尾的 NBREPORT 各 608 µs。三种控制面一轮分别为 14 ms、12 ms 与 11 ms。',
      meaning: '两套配置用哪条信道传送控制消息是草案的内容（①）；一个窗口占几个时隙是本仿真器的取值（②），所以 UWB 驱动配置的一轮更短。',
    },
    {
      heading: '二十米处的锚点收不到轮询',
      jump: 4,
      steps: [
        '跳到远处锚点没有收到任何消息的那个窗口。',
        '对照下表，比较 SP0 包与单个片段在两个距离上的到达电平。',
      ],
      blocks: [
        { kind: 'formula', heading: '本仿真器计入的 14.54 dB', text: '片段 10·log10(37 nJ / 82.051 µs) = −3.46 dBm\nSP0 发射功率 = −14.00 dBm  →  相差 10.54 dB\n门限：片段 −93 dBm，SP0 −89 dBm  →  再差 4 dB', note: '两项相加 14.54 dB。提案只估计了约 4 dB，而且这 4 dB 就是峰值功率较低造成的；这里把它计了两次（②）。' },
        { kind: 'table', heading: '这条走廊上的两个锚点', head: ['量', '十米处的锚点', '二十米处的锚点'], rows: [
          ['路径损耗（path loss）', '70.50 dB', '76.52 dB'],
          ['一个片段到达时', '−73.95 dBm', '−79.98 dBm'],
          ['SP0 包到达时', '−84.50 dBm', '−90.52 dBm'],
          ['相对 SP0 门限 −89 dBm', '高出 4.50 dB', '低了 1.52 dB'],
        ] },
      ],
      expect: '12.500 ms 写着 “anchor-2 UWB slot 0: no sp0 from tag-1”，13.000 ms 标签在自己的窗口里也没有收到消息；远处锚点没有收到轮询，一个片段也没有发送。按本仿真器的取值，SP0 包的作用距离是 16.80 m，单个片段是 89.59 m。',
      meaning: '失败来自本仿真器对 SP0 的取值（②，differs）：若只按提案的约 4 dB 计算，SP0 按片段的功率发送，二十米处到达 −79.98 dBm，比 −89 dBm 的门限高出 9.02 dB，这个锚点就能完成测距。',
    },
    {
      heading: '零长控制阶段：捕获通过，报告送不回',
      variant: 1,
      more: [0],
      steps: [
        '载入「零长控制阶段」，看远处锚点的两条片段列判定，再看随后的报告窗口。',
        '对照下表读出三种控制面每个 200 ms 测距块（ranging block）得到的距离数。',
      ],
      blocks: [
        { kind: 'table', heading: '三种控制面各自的测距结果', head: ['控制面', '十米处', '二十米处', '每块的距离数'], rows: [
          ['窄带辅助（Config 2）', '测得', '测得', '4'],
          ['UWB 驱动 + SP0', '测得', '没有发送任何片段', '2'],
          ['UWB 驱动 + 零长', '测得', '整列检出，报告未送达', '2'],
        ] },
      ],
      expect: '18.500 ms 与 19.000 ms 两条判定都是 8/8 收到、余量 22.1 dB、检出；而 21.500 ms 是 “tag-1 UWB slot 20: no sp0 from anchor-2”。窄带辅助每块 4 个距离，两种 UWB 驱动形态各 2 个。',
      meaning: '零长控制阶段让包头片段充当轮询，捕获按单个片段判定（①的提案，②的判定方法），所以远处锚点的片段被检出；但本课场景的报告仍是 SP0 包（②），受同一门限限制。',
    },
  ],
  sources: [
    'P802.15.4ab 草案（正在审议，仅对会员开放）：两套控制面配置与 SOR 消息的字段，按 TG4ab 文稿 15-25/0194r0 的引述（草案 §10.39.11.1.3.9、§10.39.11.1.3.13）。',
    '15-25/0194r0（提案，针对草案意见 266–270）：SP0 两列时长、按脉冲数之比的 6.3／5.3／3.8 dB 与「约 4 dB」的结论、何时使用 SP0、零长控制阶段；零长控制阶段是否被采纳无法确认。',
    'IEEE Std 802.15.4-2024：§16.2.1 与图 16-3（STS 包配置 0，即 SP0）；第 13 章的 O-QPSK 窄带物理层（physical layer, PHY）。',
    '本仿真器的取值与取法：SP0 一律取短包 117.6 µs、按 −14.00 dBm 发射、门限 −89 dBm（与提案不同，待改正）；片段按每毫秒 37 nJ 发射、门限 −93 dBm；一个 SP0 窗口一个时隙、一个窄带窗口两个时隙；捕获按单个包判定、失败则整轮作废；这条走廊的自由空间路径损耗。',
  ],
  limits: [],
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
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '提案 15-25/0194r0 说 SP0 的捕获性能约差 4 dB。这个数是什么？',
      options: [
        '草案规定的 SP0 接收门限',
        '提案按脉冲数之比估计的、SP0 因峰值功率较低而损失的功率电平差',
        'SP0 与片段发射功率之差',
      ],
      answer: 1,
      explain: '提案按 4.3、3.4、2.4 倍的脉冲数之比算出 6.3、5.3 与 3.8 dB，结论句概括为约 4 dB；草案没有据此规定门限。本仿真器把它当门限，又另外让 SP0 低 10.54 dB 发射，同一项计了两次。',
    },
    {
      q: '零长控制阶段下，二十米处那个锚点的整列片段被检出了，为什么还是没有距离？',
      options: [
        '片段没有打上时间戳',
        '本课场景的报告也是 SP0 包，按 −89 dBm 判定，而在那个距离上它只有 −90.52 dBm',
        '零长控制阶段不发送报告',
      ],
      answer: 1,
      explain: '捕获已经通过。报告用 SP0 包、门限 −89 dBm 都是本仿真器的取法与取值；提案并没有说零长控制阶段之后的报告必须是 SP0。',
    },
  ],
}
