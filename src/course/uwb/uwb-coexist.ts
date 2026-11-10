/**
 * UWB Tier 2 · M18 · Coexistence · Sharing 6 GHz — in the standard-first shape (2026-11-10).
 *
 * ① what the standards actually say about this (IEEE Std 802.15.4-2024: the HRP UWB channel table
 * and bandwidth, Table 16-27; the CCA modes an HRP UWB PHY implements and NOTE 1 that they are for
 * cooperation, not regulation, §11.2.8; the transmit PSD mask, §16.4.5; the −45 dBm/MHz maximum
 * input, §16.4.10, and no interference-rejection requirement at all in §16.4; IEEE Std 802.11-2024:
 * the 6 GHz band, Equation (27-148), and −62 dBm energy detection on the primary 20 MHz,
 * §27.3.22.6.3); ② that everything that decides a loss here is this simulator's model (flat
 * in-band power, the path-loss laws, the −12 dB SIR floor, the worst instant per frame, no CCA, no
 * blocking, ED over the whole channel); ③ five guided runs, every figure of which is read back out
 * of this file and compared with a run in tests/course/uwb-coexist.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import type { TLRecord } from '../../model/records'
import { J, LESSON_6G_WIDTH_MHZ, anchor, first6g, node, oneRoom, sc, uwbSc, uwbTag, wifi6g, type Lesson } from '../lessonKit'

/** The scene the lesson runs: the base room, or one of its four variants. */
export type UwbCoexistVariant = 'base' | 'ch9' | 'wifi7' | 'saturated' | 'noUwb'

/** 802.11ax 6 GHz channel 71: 6265–6345 MHz, wholly inside UWB channel 5's band. */
export const WIFI_6G_CENTER_MHZ = 6305
/** 802.11ax 6 GHz channel 7 (the engine's own default): 5945–6025 MHz, clear of every UWB band. */
export const CLEAR_6G_CENTER_MHZ = 5985

/** The first UWB frame a receiver loses to Wi-Fi. */
const firstInterfered = (r: TLRecord): boolean => r.type === 'UWB_INTERFERED'
/** The first fix the tag has to make without one of its four anchors. */
const firstThreeAnchorFix = (r: TLRecord): boolean => r.type === 'UWB_POSITION' && r.anchors.length === 3

/**
 * The four corner anchors and the tag of "From four ranges to a point", DS-TWR
 * with NLOS on, moved to UWB **channel 5** and given company: a Wi-Fi 7 router
 * at (5, 0.7, 2.0) on an 80 MHz 6 GHz channel and a laptop at (7, 5, 1.0)
 * backing up files to it. The UWB nodes are listed last, so the Wi-Fi link is
 * built — and its mediator decided — before the ranging session asks for one.
 *
 * The laptop is 3.35 m from the tag and the router 3.14 m: close enough that
 * either one's PPDU buries a ranging frame, far enough that the tag's own
 * frames are nothing but a little noise at the router. That is the lesson.
 *
 * 'ch9' moves the session to UWB channel 9 (7737.6–8236.8 MHz); 'wifi7' moves
 * the Wi-Fi channel down to 5985 MHz; either way the bands stop meeting and no
 * mediator is built at all. 'saturated' turns the backup into a flood, and
 * 'noUwb' is the Wi-Fi link alone — the reference its throughput is read against.
 */
export function uwbCoexistScenario(variant: UwbCoexistVariant = 'base'): Scenario {
  const ap = node('ap', 'Router', 'ap', 5, 0.7, 'eht', 'idle', { edca: true, txop: true, ampdu: true }, 2.0)
  ap.caps.widthMhz = LESSON_6G_WIDTH_MHZ
  const laptop = wifi6g('laptop', 'Laptop', 7, 5, variant === 'saturated' ? 'saturated' : 'backup')
  const uwbNodes = [
    anchor('anchor-1', 'Anchor 1', 0.5, 0.5, 2.2),
    anchor('anchor-2', 'Anchor 2', 9.5, 0.5, 2.2),
    anchor('anchor-3', 'Anchor 3', 0.5, 7.5, 2.2),
    anchor('anchor-4', 'Anchor 4', 9.5, 7.5, 2.2),
    uwbTag('uwb-1', 'Phone', 4, 3.5, 1.0),
  ]
  const extra = { sixGhzCenterMhz: variant === 'wifi7' ? CLEAR_6G_CENTER_MHZ : WIFI_6G_CENTER_MHZ }
  if (variant === 'noUwb') return sc(oneRoom(), [ap, laptop], extra)
  return uwbSc(
    oneRoom(), [ap, laptop, ...uwbNodes],
    { method: 'ds', nlos: true, channel: variant === 'ch9' ? 9 : 5 }, extra,
  )
}

export const uwbCoexist: Lesson = {
  id: 'uwb-coexist',
  module: 18,
  title: '共享 6 GHz',
  why: '到目前为止，测距会话一直独占着整个房间。真实的房间里有一台 6 GHz 的 Wi-Fi 路由器，它的信道可以完全落在超宽带（ultra-wideband, UWB）5 号信道之内。IEEE 802.15.4-2024 对这种共存规定得很少：它给出每条 UWB 信道的中心频率与 499.2 MHz 的带宽；要求 HRP UWB 实现一种空闲信道评估（clear channel assessment, CCA）方式，其中包括始终判为空闲的 ALOHA 方式，并注明这些方式用于 802.15.4 设备之间的协作，不是为了满足法规；要求接收机能承受不低于 −45 dBm/MHz 的最大输入，却不规定接收机在干扰下的解调能力。所以干扰怎样判定，全是本仿真器的模型：每一路功率在发射方自己的频带内均匀分布，只有重叠（overlap）的部分进入对方的接收机；一帧测距帧的信干比（SIR）低于本仿真器取的 −12 dB 门限就丢失。在这个模型里损失只发生在一个方向上：路由器的发射功率（transmit power）高出几千倍，测距帧在手机处比笔记本的上传弱几十分贝而丢失，不重传（retry），时隙超时；反过来，一帧测距帧只把 Wi-Fi 的噪声地板（noise floor）抬高几个分贝，远不到 Wi-Fi 靠能量检测（energy detection, ED）判忙所需的 −62 dBm。一次后台备份每隔几个块造成一帧丢失，定位却一次也没有缺失——四个锚点（anchor）少了一个，三个仍可解算；上传达到饱和时，一次定位也解不出来。拉大设备间距，房间不够大；让信道部分重叠，丢失的仍是同样那几帧；在这个模型里只有使重叠为零才有效，最可靠的是改用 9 号信道，任何 6 GHz Wi-Fi 信道都无法与它重叠。',
  outcomes: [
    '说出 802.15.4 与 802.11 对两种射频共存各规定了什么，哪些判定是本仿真器的模型',
    '从日志里读出一帧丢失的测距帧，并指出是哪台设备的干扰造成了这次丢失',
    '在“移动设备”“更换 Wi-Fi 信道”和“更换会话信道”之间做出选择',
  ],
  needs: ['uwb-blocks', 'uwb-geometry'],
  terms: [
    { term: 'overlap', plain: '一种射频的频带有多少落进了另一种的频带：全部、一部分，或者一点也没有' },
    { term: 'SIR', plain: '信干比：有用帧的电平减去干扰信号的电平' },
    { term: 'threshold', plain: '门限：一次读数要与之比较的那个电平——高于它得出一种结论，低于它得出另一种' },
    { term: 'noise floor', plain: '噪声地板：信道上没有信号时接收机收到的功率，任何信号都要高于它才能被检测到' },
    { term: 'energy detect', plain: '802.11 的一种信道忙判据：对无法解调的信号，只要主 20 MHz 信道上的功率达到门限（−62 dBm）就判忙、暂缓发送' },
  ],
  standard: [
    { heading: '信道与带宽（§16.4.1 表 16-27，§11.1.3.5）', text: 'HRP UWB 的 5 号信道中心频率 6489.6 MHz，9 号信道 7987.2 MHz，带宽都是 499.2 MHz：5 号信道占 6240.0 至 6739.2 MHz，9 号信道占 7737.6 至 8236.8 MHz。高频段里 9 号信道是必须支持的，其余信道可选。' },
    { heading: '空闲信道评估（§11.2.8）', text: 'HRP UWB 的物理层（physical layer, PHY）应实现 CCA 方式 1 至 4 之一——能量高于门限、只做载波侦听（carrier sense）、两者组合、始终判为空闲的 ALOHA——或方式 5、6 之一，即检测 UWB 的前导码（preamble）。NOTE 1 说明，这些方式用于 802.15.4 网络内对介质（medium）的协作使用，不是为满足法规而设计的。' },
    { heading: '发射频谱模板（§16.4.5）', text: '在 0.65/Tp < |f − fc| < 0.8/Tp 处，发射频谱要比信号的最大谱密度低 10 dB；在 |f − fc| > 0.8/Tp 处低 18 dB（Tp 是脉冲宽度）。模板只规定频带外功率最多是多少，频带之外仍允许有功率。' },
    { heading: '接收机的射频要求（§16.4）', text: 'HRP UWB 接收机的最大输入应不低于 −45 dBm/MHz（§16.4.10）；接收机能量检测的平均时间由实现决定，可以分频段多次测量，为检测非 HRP UWB 业务、实施检测与避让提供信息（§16.4.11）。§16.4 的射频要求里没有接收机抗干扰能力这一项：一帧在干扰下能否解出，标准不作规定。' },
    { heading: 'Wi-Fi 一侧（IEEE Std 802.11-2024）', text: '6 GHz 频段是 5.925 至 7.125 GHz（第 3 章的定义）；信道中心频率 = 信道起始频率 + 5 × 信道号（式 27-148），80 MHz 信道的中心编号是 7、23、39、55、71……。对无法解调的信号，接收机对主 20 MHz 信道上达到 −62 dBm 的任何信号都要判忙（§27.3.22.6.3）。' },
  ],
  implementation: [
    { topic: '信道与带宽', standard: '5 号与 9 号信道，带宽 499.2 MHz（表 16-27）', sim: '照此：5 号信道 6240.0 至 6739.2 MHz，9 号信道 7737.6 至 8236.8 MHz。', kind: 'faithful' },
    { topic: 'Wi-Fi 信道编号', standard: '中心频率 = 起始频率 + 5 × 信道号（802.11 式 27-148）', sim: '照此：本课路由器的 6305 MHz 是 71 号信道，变体的 5985 MHz 是 7 号信道。', kind: 'faithful' },
    { topic: '功率在频带内怎样分布', standard: '发射频谱模板只规定频带外功率最多是多少（§16.4.5）', sim: '每一路功率在发射方自己的频带内均匀分布，频带之外为零，接收机也没有选择性；只有重叠的那部分进入对方的接收机。', kind: 'choice' },
    { topic: '发射功率', standard: '最大允许输出功率谱密度按法规机构的规定（§16.4.3）', sim: '测距设备 −14 dBm，分布在 499.2 MHz 上；路由器 20 dBm，笔记本 15 dBm。', kind: 'value' },
    { topic: '路径损耗', standard: '传播模型不属于标准的内容', sim: '每一路发射沿用自己发射端的路径损耗（path loss）公式：Wi-Fi 按室内衰减指数 3，一米处 46.7 dB，6 GHz 再加 1.2 dB；UWB 按自由空间指数 2，5 号信道一米处 48.69 dB。', kind: 'choice' },
    { topic: '干扰下能否解出', standard: '§16.4 没有抗干扰能力一项，标准不作规定', sim: '信干比达到或高于 −12 dB 才解出，否则整帧丢失；理由是 499.2 MHz 码片（chip）率带来的相关增益大致相当于这个数值。', kind: 'value' },
    { topic: '一帧怎样判定', standard: '标准不作规定（同上）', sim: '整帧收完时只判一次，取这段时间里最坏的一次外来功率；一次 1 µs 的猝发与一次占满整帧的猝发代价相同。', kind: 'choice' },
    { topic: '时间戳精度', standard: '标准不规定时间戳噪声随干扰怎样变化', sim: '每个接收时间戳 100 ps 的噪声是下限：信干噪比（signal-to-interference-plus-noise ratio, SINR）降到 20 dB 以下时，最多乘上十倍。本课房间里这个倍数始终在 1.0 上下。', kind: 'choice' },
    { topic: '空闲信道评估', standard: 'HRP UWB 实现 CCA 方式 1 至 6 之一，其中方式 4 始终判为空闲（§11.2.8）', sim: '测距会话按时间调度发送，不做空闲信道评估，效果与始终判为空闲的方式 4 相同；所以它从不为其他设备推迟发送。', kind: 'choice' },
    { topic: '最大输入', standard: '接收机最大输入不低于 −45 dBm/MHz（§16.4.10）', sim: '未建模：再强的干扰也只进入信干比的计算，前端不饱和、不阻塞。', kind: 'absent' },
    { topic: 'Wi-Fi 的能量检测', standard: '主 20 MHz 信道上达到 −62 dBm 即判忙（802.11 §27.3.22.6.3）', sim: '拿整条 80 MHz 信道内的功率与 −62 dBm 比较；这样算只会高估测距帧的影响。', kind: 'differs' },
    { topic: '丢失之后', standard: '§10.34 的测距消息未收到交互是可选的，本课的场景不使用', sim: '这个块之内不重传：那个时隙超时，写 UWB_TIMEOUT，定位用已经到齐的距离解算。', kind: 'choice' },
    { topic: '衰落与其他干扰源', standard: '传播模型不属于标准的内容', sim: 'UWB 链路（link）的电平只由距离与墙决定，不含衰落；房间里只有这一条 Wi-Fi 链路与这一个测距会话。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '两侧各自接收到的电平',
      jump: 0,
      steps: [
        '载入本课场景并播放，跳到笔记本发出的第一个 6 GHz 数据帧（data frame）。',
        '对照下面三张表：先看两种信道各占哪一段频率，再看每一路功率进入对方频带的有多少，最后看两侧各自接收到的电平。',
      ],
      blocks: [
        { kind: 'table', heading: '各信道的频率范围', head: ['信道', '占据', '落进测距信道的部分'], rows: [
          ['本会话所用的 UWB 5 号', '6240.0 to 6739.2 MHz', '499.2 MHz wide'],
          ['本路由器所用的 Wi-Fi 71 号', '6265 to 6345 MHz', '80 of 80 MHz · overlap 1.00'],
          ['变体所用的 Wi-Fi 7 号', '5945 to 6025 MHz', '0 MHz · overlap 0.00'],
          ['此前几课所用的 UWB 9 号', '7737.6 to 8236.8 MHz', '6 GHz Wi-Fi 无法覆盖'],
        ] },
        { kind: 'formula', heading: '只计入重叠部分的功率', text: 'in-band EIRP = EIRP + 10·log10(W_overlap / W_own)      Wi-Fi: 20 + 10·log10(80/80) = 20 dBm      UWB: −14 + 10·log10(80/499.2) = −21.95 dBm', note: '这是本仿真器的功率模型（②）。路由器的信道整个落在测距信道里，没有损失；一帧测距帧的功率分布在 499.2 MHz 上，进入 80 MHz 接收机的只有其中 80 MHz，在计入路径损耗之前就已损失 7.95 dB。' },
        { kind: 'table', heading: '两侧各自接收到的电平', head: ['接收方', '信号来源', '电平'], rows: [
          ['uwb-1', '路由器，相距 3.14 m', '−42.79 dBm'],
          ['uwb-1', '笔记本，相距 3.35 m', '−48.67 dBm'],
          ['uwb-1', '四个锚点，相距 4.76 至 6.91 m', '−76.25 to −79.48 dBm'],
          ['uwb-1', '最弱的锚点相对笔记本', 'SIR −30.81 dB · floor −12 dB'],
          ['ap', '手机，相距 3.14 m', '−80.57 dBm'],
          ['ap', '它自己 80 MHz 上的噪声', '−87.97 dBm · rise 8.12 dB'],
          ['ap', '能量检测门限（energy detection threshold）', '−62 dBm · 18.57 dB above'],
        ] },
      ],
      expect: '手机处，路由器的电平比最强的锚点高 33.46 dB；最弱的锚点相对笔记本的信干比是 −30.81 dB，距 −12 dB 的门限还差 18.8 dB。路由器处，最强的一路测距帧只把噪声抬高 8.12 dB，比 −62 dBm 低 18.57 dB；要把一台 Wi-Fi 收发机放到离 UWB 发射机约 40 cm（计算得 0.37 m）以内，测距帧才会达到这条门限。',
      meaning: '两侧的电平都按本仿真器的功率模型与路径损耗计算（②）；−62 dBm 出自 802.11（①），本仿真器拿整条信道内的功率与它比较，这样算只会高估（②）。',
    },
    {
      heading: '一个应答如何丢失',
      jump: 1,
      steps: [
        '跳到第一个被 Wi-Fi 干扰丢失的测距帧。',
        '读这一条日志与它前后的记录，再对照下面的逐步说明与逐项数值。',
      ],
      blocks: [
        { kind: 'steps', heading: '本仿真器怎样判定一帧受干扰而丢失：逐步说明', items: [
          '两种射频都无法解调对方的帧，彼此之间也没有协调；一方发射时，另一方的接收机收到的只是一份功率。',
          '这份功率 = 发射功率 + 10·log10(重叠带宽 ÷ 自身带宽) − 这段距离上的路径损耗与墙的损耗；多路功率按毫瓦相加，不按分贝相加。',
          '测距帧到达期间，手机在自己的 6240.0 至 6739.2 MHz 上收到的外来功率随 Wi-Fi 猝发的起止而变，取其中最大的那个值。',
          '这一帧接收完毕时计算 SIR = 本帧到达电平 − 最坏的外来电平：达到或高于 −12 dB 则解出；低于则丢弃，写一条 RX_FAIL，再写一条 UWB_INTERFERED，注明锚点、外来电平与 SIR。外来电平同时会增大时间戳噪声。',
          '这个块之内不重传：那个时隙超时，写 UWB_TIMEOUT；定位用已经到齐的距离解算。',
          '反方向按同样的方法计算，测距帧只给 Wi-Fi 接收机增加少量噪声；测距会话本身也不做空闲信道评估。',
        ] },
        { kind: 'table', heading: '第一次丢失的逐项数值', head: ['步骤', '数值'], rows: [
          ['anchor-4 的报告帧到达电平', '−79.48 dBm'],
          ['其间最坏的外来电平', '−48.67 dBm'],
          ['比值为', '−79.48 − (−48.67) = −30.81 dB'],
          ['低于 −12 dB 门限，因此', 'RX_FAIL · UWB_INTERFERED · UWB_TIMEOUT'],
          ['而这个块仍然解出定位', 'GDOP 1.26, 3 anchors'],
        ] },
      ],
      expect: '418.188 ms 处日志写着 “uwb-1 UWB frame from anchor-4 lost to Wi-Fi: SIR -30.8 dB (foreign -48.7 dBm)”，紧跟在手机的一条 RX_FAIL 之后；1.8 ms 之后那个时隙超时。外来电平来自笔记本，这一对记录每 600 ms 出现一次，丢失的都是最远那个锚点的报告帧。',
      meaning: '−12 dB 的门限与“取最坏的一瞬间”都是本仿真器的取法，标准不规定接收机在干扰下的解调能力（①、②）；块内不重传也是本仿真器的行为（②）。',
    },
    {
      heading: '只用三个锚点的那次定位',
      jump: 2,
      steps: [
        '跳到手机第一次在缺少第四个锚点的情况下解出的位置。',
        '与两个块之前那一行比较，再看运行结束时手机与各锚点的检视面板。',
      ],
      blocks: [
        { kind: 'table', heading: '相隔两个块的两行定位', head: ['内容', '日志行'], rows: [
          ['四个锚点的定位', 'uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors'],
          ['三个锚点的定位', 'uwb-1 position (4.01, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.26, 3 anchors'],
        ] },
      ],
      expect: '定位照常给出，误差仍是 0.01 m；唯一的痕迹是行末的锚点数从 4 变为 3，GDOP 从 1.05 升到 1.26。运行结束时，手机检视面板的“被 Wi-Fi 干扰丢失”是 8，与它的超时次数相同；每个锚点的这一行都是 0。',
      meaning: '本仿真器的解算器有三个距离就能定位（②），所以冗余的第四个锚点弥补了这次丢失；干扰只在手机处构成问题，因为笔记本在那里电平最高，而锚点在那里最弱。',
    },
    {
      heading: '五秒，四种运行',
      more: [0, 1, 2, 3],
      steps: [
        '依次运行本课场景、「UWB 使用 9 号信道」「Wi-Fi 使用 7 号信道（5 985 MHz）」「饱和上传」与「没有 UWB」，各运行五秒。',
        '对照下表读出每种运行的 Wi-Fi 占空、丢失的帧数、测距与定位次数。',
      ],
      blocks: [
        { kind: 'table', heading: '五秒，二十五个块', head: ['运行', 'Wi-Fi 占空', '被 Wi-Fi 干扰丢失', '手机测距', '定位'], rows: [
          ['后台备份', '3.07 %', '8', '92 / 100', '25'],
          ['UWB 使用 9 号信道', '3.07 %', '0', '100 / 100', '25'],
          ['Wi-Fi 使用 7 号信道', '3.07 %', '0', '100 / 100', '25'],
          ['饱和上传', '91.40 %', '100', '0 / 100', '0'],
        ] },
      ],
      expect: '后台备份每三个块丢失一帧；二十五次定位一次也不少，其中八次只用三个锚点，误差都在 4.2 cm 以内。9 号信道与 7 号信道两次运行的测距记录逐字段相同。饱和上传时一次定位也解不出来。Wi-Fi 一侧，备份的吞吐与没有 UWB 时相同，都是 9.960 Mb/s；饱和上传的吞吐比去掉测距会话的同一场景低 0.24 %（276.158 对 276.816 Mb/s）。',
      meaning: '没有重叠，就没有功率进入对方的频带，结果与完全没有对方时相同——这是本仿真器功率模型的直接结论（②）。',
    },
    {
      heading: '三种办法的定量比较',
      steps: [
        '在编辑器里把笔记本拖到房间最远的角落，重新载入。',
        '恢复笔记本的位置，把 6 GHz 中心频率设为 6225 MHz，重新载入；再设为 6185 MHz，重新载入。',
      ],
      blocks: [
        { kind: 'table', heading: '三种办法的定量比较', head: ['办法', '效果', '是否足够'], rows: [
          ['把笔记本移到最远的角落，7.50 m', 'foreign −59.15 dBm · best SIR −17.10 dB',
            '不够——需要 11.09 m，若要保证最远的锚点也能解出则需要 14.21 m'],
          ['Wi-Fi 中心移到 6225 MHz，55 号信道', '25 of 80 MHz · 31 % · 5.05 dB',
            '不够——信干比 −25.76 dB，仍是那八次丢失'],
          ['Wi-Fi 中心移到 6185 MHz，47 号信道（编辑器允许的取值；802.11 的 80 MHz 信道中心编号是 7、23、39、55、71……，47 只用作 160 MHz 信道的中心）', '0 MHz overlap',
            '足够——丢失完全消失'],
          ['会话改用 UWB 9 号信道', '0 MHz overlap · any Wi-Fi width',
            '足够——而且没有任何 Wi-Fi 信道能与它重叠'],
        ] },
      ],
      expect: '拉大间距与部分重叠都不够，重叠为零的两种做法都使丢失完全消失。9 号信道之所以最可靠：编辑器允许的最高中心频率 7115 MHz 开一条 320 MHz 的信道，上边沿也只到 7275 MHz，距 9 号信道的下边沿还有 462.6 MHz。',
      meaning: '在本仿真器的功率模型里只有重叠为零才有效（②）；真实的发射频谱在 §16.4.5 的模板之内仍有旁瓣（①），而模型里频带之外的功率为零（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§16.4.1 与表 16-27（HRP UWB 各信道的中心频率与 499.2 MHz 带宽，9 号信道在高频段必须支持）、§11.1.3.5（HRP UWB 信道编号）、§11.2.8（CCA 方式 1 至 6，NOTE 1：用于协作而非法规）、§16.4.3（最大输出功率谱密度按法规）、§16.4.5（发射频谱模板）、§16.4.10（接收机最大输入不低于 −45 dBm/MHz）、§16.4.11（接收机能量检测）；§16.4 没有接收机抗干扰能力的要求。',
    'IEEE Std 802.11-2024：第 3 章（6 GHz 频段 5.925–7.125 GHz）、式 (27-148) 与表 E-4（6 GHz 信道编号，最早由 802.11ax 引入）、§27.3.22.6.3（主 20 MHz 信道上 −62 dBm 的能量检测）。',
    '本仿真器的取值与取法：功率在发射方频带内均匀分布、−14 dBm 与 20／15 dBm 的发射功率、两条路径损耗公式、−12 dB 的信干比门限、整帧只按最坏一瞬间判定一次、时间戳噪声随信干噪比增大、测距会话不做空闲信道评估、不建模接收机阻塞、能量检测按整条信道比较、块内不重传、UWB 链路不含衰落；窄带那一侧另有一条 0 dB 的门限，同样是本仿真器的取值。',
  ],
  limits: [],
  scenario: () => uwbCoexistScenario('base'),
  variants: [
    { label: 'UWB 使用 9 号信道', scenario: () => uwbCoexistScenario('ch9') },
    { label: 'Wi-Fi 使用 7 号信道（5 985 MHz）', scenario: () => uwbCoexistScenario('wifi7') },
    { label: '饱和上传', scenario: () => uwbCoexistScenario('saturated') },
    { label: '没有 UWB', scenario: () => uwbCoexistScenario('noUwb') },
  ],
  jumps: [
    J('笔记本的第一个 6 GHz 数据帧', first6g),
    J('第一个被 Wi-Fi 干扰丢失的测距帧', firstInterfered),
    J('用三个锚点解出的定位', firstThreeAnchorFix),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '路由器在手机处造成 −42.79 dBm，手机在路由器处只造成 −80.57 dBm。在本仿真器的模型里，为什么如此悬殊？',
      options: [
        '路由器发射得频繁得多，所以平均功率更高',
        '34 dB 的发射功率差距，再加上 UWB 帧有 7.95 dB 落在这 80 MHz 信道之外',
        'UWB 接收机的噪声系数更低',
      ],
      answer: 1,
      explain: '20 dBm 对 −14 dBm，起点就相差 34 dB；接着这 −14 dBm 又分布在 499.2 MHz 上，只有其中 80 MHz 落进 Wi-Fi 信道。',
    },
    {
      q: '后台备份让会话在 100 次测距里丢失了 8 次，却没有缺失 25 次定位中的任何一次。是什么弥补了这次损失？',
      options: [
        '手机在同一个块内重发了丢失的那次测距',
        '三个距离仍能解出两个未知数：定位改用三个锚点，GDOP 从 1.05 升到 1.26',
        '解算器通过品质因数（figure of merit, FoM）字节把受干扰的那次测距降权了',
      ],
      answer: 1,
      explain: '丢失之后 1.8 ms 该时隙超时，这个块就以少一个锚点的状态继续。二十五次定位里有八次是三锚点定位，误差仍在 4.2 cm 以内。',
    },
    {
      q: '标准对 HRP UWB 接收机在 Wi-Fi 干扰下能否解出一帧规定了什么？',
      options: [
        '信干比不低于 −12 dB 即可解出',
        '没有规定：§16.4 的射频要求里没有抗干扰能力一项，−12 dB 是本仿真器取的值',
        '必须先做空闲信道评估，信道空闲才接收',
      ],
      answer: 1,
      explain: '§16.4 只规定了最大输入（§16.4.10）、能量检测等，没有接收机抗干扰能力；本仿真器为它取了 −12 dB。',
    },
  ],
}
