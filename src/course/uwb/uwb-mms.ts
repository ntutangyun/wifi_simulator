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
  module: 28,
  title: '十六毫秒的能量',
  why: '放置同样的标签（tag）和同样的锚点（anchor），中间隔着两道砖墙。每一帧测距帧其实都到达了——只是到达电平低于接收机能够检出的门限，于是无法完成任何测量。草案中的多毫秒（multi-millisecond, MMS）测距仍然完成了测量：不发送一帧，而是发送一串分布在若干毫秒中的短片段（fragment），由对端把它们累加起来。发射电平之所以无法提高，是因为法规限制的是每一毫秒内的平均功率——任何瞬间的功率都不能更高，但占用多少个毫秒不受限制。每个片段只承载用于取时间戳的那段序列，称为测距序列片段（RSF），单独一个片段无法被检出；而接收机事先知道这一串何时到达、承载什么内容，于是进行盲累加，直到最后才判决，片段数翻一番，累加和也翻一番，最终达到接收机能够检出的电平，而任何单个片段都达不到。这些先验信息来自旁边一台窄带（narrowband, NB）射频：它承载开始时的 Poll、每个锚点的 Response 和末尾的 Report，宽带射频只承载时间。普通双向测距在这个房间里一次也无法完成，这一串片段却使三个锚点都测得了距离。但测得距离不等于测得准确：穿墙的首径（first path）仍然延迟到达，每条距离都偏长同样的一米多，这是固定偏移而不是噪声，定位结果会完全继承这一偏移。',
  outcomes: [
    '说清为什么加长帧无效，而一串短片段有效',
    '从窄带（narrowband, NB）交互开始，完整跟踪一轮直到末尾那次测距',
    '说明一轮中哪些部分承载时间、哪些承载控制消息',
  ],
  needs: ['uwb-blocks', 'uwb-dstwr', 'uwb-geometry'],
  terms: [
    { term: 'MMS', plain: '多毫秒：把一个测距分组分散到若干毫秒中发送，而不是一次发完' },
    { term: 'fragment', plain: '这个分组在某一毫秒内发送的部分，单独发出，之后再累加' },
    { term: 'RSF', plain: '测距序列片段：其中只包含用于取时间戳的那段序列，不含其他内容' },
    { term: 'RIF', plain: '测距完整性片段：用来校验结果的可选附加片段——本场景一个也不发' },
    { term: 'sensitivity', plain: '灵敏度：接收机自身的门限，本课是 −93 dBm，即它仍能从中取出时间戳的最弱电平' },
    { term: 'margin', plain: '余量：一串片段的累加电平高出灵敏度多少；为正即检出，为负则没有任何结果' },
  ],
  picture: [
    { heading: '单帧无法完成测距的房间', text: '场景是一条长厅，被两道通顶砖墙分隔成三个隔间。三个锚点位于第一个隔间，一个标签位于第三个隔间，于是它们之间的每一条射线都要穿过两道墙。帧仍然会到达——房间并不大——只是到达电平比接收机能够检出的门限低几个分贝；而检不出一帧，也就无法为它打时间戳。' },
    { kind: 'watch', jump: 2, heading: '观察一串片段的判定', text: '载入仿真，跳到对第一串片段的判定。这一行记录给出收到了几个片段、每个片段的电平、累加结果，以及是否超过接收机的门限。本课要讲的全部内容都在这一行中。' },
    { heading: '能量是存在的，只是不集中在同一瞬间', text: '最直接的办法——提高发射电平——行不通。法规限制的不是总能量，而是每一毫秒内的平均功率，所以任何瞬间的功率都不能更高。它没有限制的，是占用多少个毫秒。一台用完这一毫秒的额度、再用下一毫秒的额度、再用下一毫秒额度的发射机，与一台只用一毫秒就停止发送的发射机，同样合规。' },
    { heading: '一个片段接一个片段', text: '于是把这个分组拆开。一个片段就是其中一毫秒内发送的部分，而且只保留必需的内容：没有需要搜索的前导码（preamble）、没有头部字段、没有地址、没有数据——只有用于取时间戳的那段序列，所以它的全称是测距序列片段（RSF）。每台设备每轮到一次就发送一个，标签和它的锚点交错发送，各自利用其他设备留下的空闲间隔。' },
    { heading: '把无法单独检出的片段累加起来', text: '这些片段单独来看，一个也无法检出。但接收机事先已经知道这一串的结构——每个片段何时到达、承载什么内容——所以它不需要先检出任何信号就能开始：它进行盲累加，逐毫秒累加，直到最后才判决。片段数量翻一番，累加量也翻一番，而这个累加和可以超过任何单个片段都无法超过的门限。' },
    { heading: '控制消息由哪台射频承载', text: '接收机事先掌握这一串的结构，这些信息必须有来源，而它并非来自宽带射频。旁边还有一台小型窄带射频，由它承载控制消息：一帧 Poll 开启这一轮，并逐一指定它要询问的每一个锚点；每个锚点各回一帧 Response 表示接受；末尾再各发一帧 Report。在开始与结束之间，宽带射频只承载时间，不承载其他任何内容。' },
    { heading: '测得距离不等于测得准确', text: '这一串片段带来的是距离，而且只有距离。穿过砖墙的首径（first path）仍然延迟到达，于是每次测距都偏长，而且每轮偏长的量相同——这是固定偏移，不是噪声，附在每条距离上的品质因数（figure of merit, FoM）字节会把它标记为被遮挡的路径。这里没有任何机制能使测量更准确，它只是使测量得以完成。' },
  ],
  numbers: [
    { kind: 'table', heading: '房间参数与穿墙损耗', head: [
      '场景', '取值',
    ], rows: [
      ['大厅', '22 × 8 m'],
      ['砖墙位于', 'x = 5 m, x = 10 m'],
      ['锚点到标签', '13.04, 13.04, 12.76 m'],
      ['两道砖墙', '24 dB'],
      ['一个片段到达时', '−100.26 / −100.07 dBm'],
      ['接收机需要的门限', '−93 dBm'],
    ] },
    { text: '每个片段的到达电平比接收机门限低约七个分贝；而三个锚点与标签几乎等距：要么三个都能检出，要么一个也检不出。' },
    { kind: 'table', heading: '一轮的日志输出', head: [
      '时刻', '日志行',
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
    { kind: 'table', heading: '一轮询问三个锚点，还是三轮各询问一个', head: [
      '量', '一轮询问全部三个',
      '每次只询问一个', '出处',
    ], rows: [
      ['一轮的时隙数', '52', '28', 'UWB_ROUND'],
      ['一轮的时长', '26 ms', '14 ms', '52 × 500 µs'],
      ['每块的轮数', '1', '3', '每个标签—锚点对一轮'],
      ['到本块完成定位为止', '26 ms', '42 ms', 'UWB_POSITION'],
      ['窄带消息数', '7', '9', 'NBPOLL, NBRESP, NBREPORT'],
      ['Poll 窗口可容纳的应答者数', '3', '1', '两个 600 RSTU 时隙要容纳 Poll，而 Poll 每增加一个应答者就增长 3 字节'],
    ] },
    { text: '耗时较长的仍是窄带一侧。它那七条消息占用了整轮 7.106 ms 空口时间（airtime）中的 4.480 ms，而三十二个片段加起来只有 2.626 ms。' },
    { heading: '墙体引入的偏差', text: '每一次测距都偏长同样的 1.199 m：每道砖墙使首径延迟 2 ns，而射线往返各穿过两道墙，双向测距无法消除这部分延迟。' },
    { text: '定位完全继承了这一偏差。检视面板显示的是最后一个块的结果：(14.22, 4.05) m，真值 (13.00, 4.00)；而旁边那个只按噪声算出的误差椭圆，仍保持在厘米量级。' },
    { kind: 'steps', heading: '一轮的各个步骤', items: [
      '这个块先从允许列表（allow list）中随机选取自己的窄带信道；随后一轮在它的第一个时隙开始：标签广播一帧 Poll，逐一指定它要询问的每个锚点。',
      '被指定的锚点，各自在属于自己的 Response 窗口中作答。只有完成一次往返交互的那一对才算就绪；也只有就绪的接收机才知道这一串的结构。',
      '接着是测距阶段。标签一个时隙、每个锚点各一个时隙，于是几串片段相互交错，而同一台设备的两个相邻片段相隔四个时隙，也就是两毫秒。',
      '一个片段就是一个短符号（symbol）重复若干次，它把整整一毫秒的能量集中在自身短得多的时长内。重复多少次、符号本身多长，由这一串采用的参数集（parameter set）规定——变体菜单中「参数集 rsf-1」那一项更换的就是这组参数，而计算它带来多少余量是下一课的内容。接收机在一串中只打两个时间戳——收到的第一个片段和最后一个片段——各取在该片段的第一个脉冲上。',
      '阶段末尾，每个接收机把自己收到的片段累加起来，再从这个累加和中减去自身的灵敏度（sensitivity）；差值不为负，就判定这一串已检出。',
      '之后是报告窗口，每个锚点两个：锚点发出自己从接收到发送所用的回复时延（reply time），标签应答并报告它测得的往返时间，然后由标签把这一对时间换算为一个距离。',
      '而这一切都必须先满足三条约束，否则这个时隙长度无法使用：它必须是 300 RSTU（ranging slot time unit）的整数倍；一个时隙要能容纳最长的片段加上飞行余隙；两个时隙要能容纳最长的窄带消息——也就是那帧 Poll，而它每多指定一个锚点就会变长。',
    ] },
    { kind: 'table', heading: '这七个步骤在本场景中的取值', head: [
      '步骤', '这一轮',
    ], rows: [
      ['Poll，三个锚点', 'slot 0 · 23 B · 928.0 µs'],
      ['Response，每锚点一条', 'slots 2, 4, 6 · 12 B · 576.0 µs'],
      ['测距阶段', 'slots 8–39 · 4 per 2 ms · 8 fragments'],
      ['一个片段', '40 × 1 024 = 40 960 chips · 82.051 µs · 37 nJ'],
      ['锚点处的累加和', '−100.26 + 9.03 = −91.23 dBm · +1.77 dB'],
      ['Report，每锚点一条', 'slots 40, 44, 48 · 13 B · 608.0 µs'],
      ['三条约束，600 RSTU', '600 % 300 = 0 · 82.3 < 500.0 · 928.2 < 1000.0 µs'],
      ['增加第四个锚点——被拒绝', '1024.2 > 1000.0 µs'],
    ] },
  ],
  deeper: [
    { heading: '为什么不需要扣除前导偏移', text: '普通的测距帧带有前导，接收机必须先检测到前导才能计时，而时间戳定义在帧内某个已知位置的标记上。片段完全没有这些：接收机事先就知道它何时到达，于是时间戳就取在这一串中第一个片段的第一个脉冲上。每串一个 RMARKER，位于串的开头——发送时间戳和接收时间戳都以它为准。' },
    { heading: '本场景未发送的完整性片段', text: '在测距片段之后，一串还可以附带第二种片段：完整性片段。它们的序列从不在窄带控制交互中传送，所以事后重放的录音无法复现这段序列。本课并不演示这一点：这里不生成这段序列，也不做任何比对。在本课中，完整性判定只是一次检出结果——那串完整性片段是否超过灵敏度；而且本课的多毫秒轮次不会遇到中继攻击，所以这项校验在这里没有经过检验。本课的会话不使用任何完整性片段，所以整段运行中没有任何一次测距带有完整性判定——日志中根本没有这个字段。它们在阶段中的位置是预先规定的，无需协商：设有 X 个测距片段，最后一个之后空出 Z 毫秒，那么第 y 个完整性片段（y 从零数起）落在第 X + Z + y − 1 毫秒上。这里要解决的问题是能否测得距离；完整性是另一项开销，代价是更多的时隙。' },
    { heading: '锚点为什么放在那里', text: '三个锚点到标签分别是 13.04、13.04 与 12.76 m——这是在第一个隔间里能做到的最接近等距的布置。这是有意为之：整课都围绕同一个临界点，而如果把一个锚点紧靠第一道砖墙放置，它就只有 8.58 m 远、电平高 3.6 个分贝，于是它用半串片段就能正常测距，而另外两个什么也检不出。让三者同时失败，这个临界点才能清楚地显现。' },
  ],
  limits: [
    { kind: 'threshold', text: '那条判定是硬判决，而且每个块的判决点相同。本课的判定只检查余量是否不小于零：差 0.1 dB 整串就判为未检出，一个时间戳也打不出。而本课中 UWB 链路的电平只由几何与墙体决定，不含衰落——这是本课的一项简化——所以 +1.77 dB 这个余量七个块都是同一个数，三个锚点也一致地同时成功或同时失败。真实的两墙隔断会使电平上下波动几个分贝，于是「X = 8 成、X = 4 败」在现实中是一条成功率曲线。' },
    { kind: 'model-value', text: '本课的合成是一个算术公式，而不是逐片段的累加。它取收到的第一个片段的电平作为整串的电平，再加 10·log10(N)，N 是收到的片段数：各片段实际到达电平不同时（有人经过、有一段被遮挡），后面的片段仍按第一个片段的电平同等计入。真实的相干累加还要求整串之内相位一致，逐毫秒累加会因残余时钟漂移与前端相位噪声损失几个分贝，所以现实中 X 个片段达不到完整的 10·log10(X) 增益。' },
    { kind: 'unmodelled', text: '「接收机事先知道这一串的结构」在本课中只有知道与不知道两种情形。窄带的一问一答完成之后，接收机对每个片段所在的时隙就毫无误差地掌握。而真实的盲累加要把每个片段对齐到远小于一个符号的精度，窄带一问一答本身的定时误差正是限制「一串最长能有多长」的因素。本课把这项误差取为零，所以这里的一串可以任意长。' },
    { kind: 'unmodelled', text: '完整性片段在本课中只是第二次检出。本课不生成 STS 序列、也不做任何比对：完整性判定就是这串 RIF 是否超过灵敏度而已。所以「事后重放的录音无法复现这段序列」这一点在本课中不是经过验证的，而是假定的——多毫秒轮次在这里不会遇到中继攻击。本课的会话一个完整性片段也不发送，所以这一条在日志中没有任何体现。' },
  ],
  sources: [
    '本课几乎没有一处出自 IEEE Std 802.15.4-2024。单位是标准的：RSTU、RCTU、块与它的时隙；那台窄带射频本身也是标准的，即第 12 章、250 kb/s 的 O-QPSK PHY。',
    '多毫秒分组、片段，以及把那台窄带射频变成 UWB 控制射频的一切，都来自 P802.15.4ab：截至 2026 年 9 月，它的投票稿是 D05，仍处于 Sponsor 投票复审阶段。该草案仅对会员开放，所以这里改写自 TG4ab 的四篇提案文稿：15-22/0381r5（测距周期）、15-23/0100r2（片段与窄带 PHY）、15-23/0502r3（参数集）与 15-22/0205r0（能量预算）。已投票的 D05 可能与此不同。',
    '房间是本仿真器的模型取值：22 × 8 m 的大厅、两道各 12 dB 的砖墙、每道砖墙 2.0 ns 的非视距额外时延，以及一个采用草案默认测距周期的会话，窄带控制信道位于 UNII-3，而本场景中该频段没有其他设备发送。',
  ],
  scenario: () => uwbMmsScenario('base'),
  variants: [
    { label: '四个片段', scenario: () => uwbMmsScenario('four') },
    { label: '参数集 rsf-1', scenario: () => uwbMmsScenario('rsf1') },
    { label: '以 4z 作对照', scenario: () => uwbMmsScenario('twr') },
    { label: '每次只与一个锚点测距', scenario: () => uwbMmsScenario('pairwise') },
  ],
  jumps: [
    J('开启这一轮的窄带 Poll 帧', firstNbPoll),
    J('第一串片段里的第一个', firstUwbRsf),
    J('对端如何判定这一串片段', firstUwbTrain),
    J('结束这一轮的窄带 Report 帧', firstNbReport),
    J('两者共同得出的那次测距', firstUwbRange),
  ],
  observe: [
    '开始时空口上没有任何宽带信号。标签用一帧窄带 Poll 开启这一轮，而这一帧同时发给每个锚点；它们各自在自己的时隙中作答，到这时才有锚点进入就绪状态、开始接收片段。',
    '接着是片段：四串交错发送，每半毫秒一帧，每一帧零字节、没有速率——片段中不承载任何数据。在最后一个片段之后的那个时隙中，各方对自己的累加结果作出判决，而接收时间戳直到这时才出现。',
    '查看 18.500 ms 处那条判定：它的末尾附有一份应答者名单。片段只发送了一次，而三个锚点接收的都是这一次。',
  ],
  tryThis: [
    '载入“以 4z 作对照”：同样的房间、同样的节点，改用普通的双向测距。没有任何一次测距成功。锚点在等待一帧它们永远收不到的 Poll，标签在每个响应时隙都等不到应答，于是日志中全是超时记录。',
    '载入“每次只与一个锚点测距”。得到的仍是那三个距离，只不过用了三轮而不是一轮，本块的定位也从 26 ms 推迟到 42 ms。任何单个距离本身都没有变化。',
  ],
  quiz: [
    {
      q: '为什么不直接发送一帧更长的测距帧，而要发送一串片段？',
      options: [
        '更长的帧无法放入一个时隙',
        '限制针对的是每毫秒内的平均功率，所以帧更长并不能使电平更高；而一串片段是逐毫秒地使用每一毫秒的额度',
        '接收机无法为长帧打时间戳',
      ],
      answer: 1,
      explain: '任何瞬间的功率都不能更高，但占用多少毫秒并不受限——而对端可以把它们累加起来。',
    },
    {
      q: '既然测量由宽带射频完成，窄带射频的作用是什么？',
      options: [
        '它再粗略测量一次距离，用于相互校验',
        '它承载控制消息——开启轮次、接受、报告回复时间——使接收机在片段到达之前就知道这一串的结构',
        '它在块与块之间唤醒锚点',
      ],
      answer: 1,
      explain: '盲累加的前提，是已经知道每个片段何时到达、承载什么内容。这些信息由那台小型窄带射频提供。',
    },
  ],
}
