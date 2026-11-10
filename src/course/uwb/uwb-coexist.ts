/**
 * UWB Tier 2 · M13 · Coexistence · Sharing 6 GHz.
 *
 * The first UWB tier ran its sessions in an empty room. This one opens the door
 * and lets a Wi-Fi 7 router in on the same megahertz: UWB channel 5 occupies
 * 6240.0–6739.2 MHz, and a 6 GHz Wi-Fi channel can sit wholly inside it. The
 * lesson is about the asymmetry that follows — a −14 dBm ranging frame and a
 * 20 dBm PPDU do not damage each other equally — and about why the practical
 * answer is not separation, nor a narrower overlap, but channel 9.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): the shout
 * and the whisper in plain words first, the level ledger and the measured runs
 * after it, the three cures priced in `deeper`, the clauses and the model's own
 * constants in `sources`. Every number quoted below is pinned in
 * tests/course/uwb-coexist.test.ts; `npx tsx scripts/lesson-dump.ts uwb-coexist
 *` prints it with its length.
 */
import type { Scenario } from '../../model/scenario'
import type { TLRecord } from '../../model/records'
import { J, LESSON_6G_WIDTH_MHZ, anchor, first6g, firstUwbPoll, firstUwbTimeout, node, oneRoom, sc, uwbSc, uwbTag, wifi6g, type Lesson } from '../lessonKit'

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
  why: '到目前为止，测距会话一直独占着整个房间。可真实的房间里有一台 Wi-Fi 路由器，而在最新的那个 Wi-Fi 频段上，它和超宽带（UWB）完全可能使用同一段频谱。两者都无法解调对方的帧：在路由器的接收机看来，一帧测距帧只是微弱的噪声；而在手机的接收机处，一次 Wi-Fi 猝发的电平要高出几十分贝。损失只发生在一个方向上。路由器的发射功率（transmit power）高出几千倍，又全部集中在一条窄信道里；测距帧的功率本就微小，还分布在宽得多的频带上，只有重叠（overlap）的那一部分进入 Wi-Fi 接收机，把它的噪声地板（noise floor）抬高几个分贝，远不到 Wi-Fi 靠能量检测（energy detection, ED）判忙所需的电平，所以 Wi-Fi 从不因它推迟发送，自身几乎不受影响。手机这边，笔记本的上传一旦与远处锚点（anchor）的应答在时间上重叠，信干比（SIR）就是一个很深的负数：在本课的场景里那一帧丢失，不重传（retry），时隙超时。一次后台备份每隔几个块造成一帧丢失，定位却一次也没有缺失——四个锚点少了一个，三个仍然可以解算，只是误差略大，日志上的痕迹只有那一行末尾的锚点数；上传达到饱和时，一次定位也解不出来。拉大设备间距，房间不够大；把 Wi-Fi 信道移到部分重叠的位置，丢失的仍是同样那几帧。在本课的功率模型里，只有使重叠为零才有效，最可靠的是把会话移到整个 Wi-Fi 频段之上的那条测距信道，任何 Wi-Fi 信道都无法与它重叠。',
  outcomes: [
    '说出一种射频的频带有多少落进了另一种的频带',
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
  picture: [
    { heading: '两种射频，同一片频谱', text: '此前几课把测距会话放在一条无人使用的信道上。把它移入 6 GHz 路由器工作的那个频段，两者就共用频谱。在本课的房间里，路由器的整条信道都位于测距信道之内：一个频带落进另一个频带的那一部分叫重叠（overlap），而这里的重叠是全部，每一次 Wi-Fi 猝发都整个落在会话所用的频带之内。' },
    { heading: '发射功率与带宽都不对称', text: '路由器的发射功率（transmit power）比测距设备高出好几千倍，而且全部集中在一条窄信道里。测距设备正相反：它把本就微小的功率分布在宽出许多倍的信道上，能真正落入路由器信道的只是其中一小部分。再考虑几何位置：路由器和笔记本都离手机很近，锚点（anchor）却远在四角。' },
    { kind: 'watch', jump: 2, heading: '观察一个应答如何丢失', text: '载入仿真、按下播放，然后跳到手机丢失的第一帧测距帧。远处那个锚点确实发出了应答，只是笔记本的上传恰好在那一刻占用空口，于是这个应答没有被成功接收。日志会写明这次丢失，以及那一路外来信号的电平。' },
    { heading: '手机接收到了什么', text: '在手机这一侧，有用信号来自远在房间四角作答的锚点，最弱的一路来自对角那个最远的锚点；电平最高的干扰来自几步之外的那台笔记本。两者之间的差值就是信干比（SIR），这里它是一个很深的负数，远低于接收机仍能解调所需的那个值，这个值就是门限——本课取 −12 dB，标准不规定接收机在干扰下的解调能力。' },
    { heading: '路由器接收到了什么', text: '反过来看。一帧测距帧到达路由器时比路由器自身的噪声还弱：它把信道空闲时路由器收到的功率——噪声地板（noise floor）——抬高几个分贝，除此之外没有其他影响。Wi-Fi 无法解调测距帧，对这种信号判断信道忙闲只看信道上的原始功率，这就是能量检测（energy detection, ED）：802.11 规定在主 20 MHz 信道上以 −62 dBm 为门限（§27.3.22.6.3），本课把这条门限与整条信道内的功率比较，这样算只会高估。而在这样的距离上，测距帧的电平远低于它的门限。于是路由器从不因它推迟发送：这个会话只影响解调器，不影响信道忙闲的判断。' },
    { heading: '冗余的第四个锚点弥补了这次丢失', text: '测距会话之所以能承受办公室里的一次后台备份，是因为它多出一个锚点：本课的解算器有三个锚点就足以解算，而这里有四个作答，丢失又全部发生在同一个最远的锚点上。于是手机每个块仍然能解出位置，只是条件数稍差、误差稍大。' },
    { kind: 'watch', jump: 4, heading: '只用三个锚点的那次定位', text: '跳到手机第一次在缺少第四个锚点的情况下解出的位置。日志里看不出异常：定位照常给出，时刻不变，误差仍在两三厘米之内。唯一的痕迹，是那一行末尾的锚点数，以及旁边的 GDOP。' },
    { kind: 'list', heading: '三个办法，以及“部分重叠”能带来什么', items: [
      '拉大设备间距——房间太小。即使移到最远的角落，手机仍然解不出那个应答。',
      '把 Wi-Fi 信道移开一些，使它只部分重叠——部分重叠并不等于部分保护：丢失的仍然是同样那几帧，发生在同样那几个块里。',
      '把会话移到整个 Wi-Fi 频段之上的那条测距信道——在那里，任何带宽的 Wi-Fi 信道都无法与它重叠，此前几课的会话用的就是它。',
    ] },
  ],
  numbers: [
    { kind: 'table', heading: '各信道的频率范围', head: [
      '信道', '占据', '落进测距信道的部分',
    ], rows: [
      ['本会话所用的 UWB 5 号', '6240.0 to 6739.2 MHz', '499.2 MHz wide'],
      ['本路由器所用的 Wi-Fi 71 号', '6265 to 6345 MHz', '80 of 80 MHz · overlap 1.00'],
      ['变体所用的 Wi-Fi 7 号', '5945 to 6025 MHz', '0 MHz · overlap 0.00'],
      ['此前几课所用的 UWB 9 号', '7737.6 to 8236.8 MHz', '6 GHz Wi-Fi 无法覆盖'],
    ] },
    { kind: 'formula', heading: '只计入重叠部分的功率', text: 'in-band EIRP = EIRP + 10·log10(W_overlap / W_own)      Wi-Fi: 20 + 10·log10(80/80) = 20 dBm      UWB: −14 + 10·log10(80/499.2) = −21.95 dBm', note: '这是本课的功率模型：每一路功率在发射者自己的频带内均匀分布。路由器这一侧没有任何损失：它的信道整个落在测距信道里面。而一帧测距帧的功率分布在 499.2 MHz 上，进入 80 MHz 接收机的只有其中 80 MHz——在计入路径损耗（path loss）之前，就已损失 7.95 dB。' },
    { kind: 'table', heading: '两侧各自接收到的电平', head: [
      '接收方', '信号来源', '电平',
    ], rows: [
      ['uwb-1', '路由器，相距 3.14 m', '−42.79 dBm'],
      ['uwb-1', '笔记本，相距 3.35 m', '−48.67 dBm'],
      ['uwb-1', '四个锚点，相距 4.76 至 6.91 m', '−76.25 to −79.48 dBm'],
      ['uwb-1', '最弱的锚点相对笔记本', 'SIR −30.81 dB · floor −12 dB'],
      ['ap', '手机，相距 3.14 m', '−80.57 dBm'],
      ['ap', '它自己 80 MHz 上的噪声', '−87.97 dBm · rise 8.12 dB'],
      ['ap', '能量检测门限', '−62 dBm · 18.57 dB above'],
    ] },
    { text: '这一差距是单向的。相对于笔记本的干扰，最弱的那个锚点距可解调的门限还差 18.8 dB。' },
    { kind: 'table', heading: '五秒，二十五个块', head: [
      '运行', 'Wi-Fi 占空', '被 Wi-Fi 干扰丢失',
      '手机测距', '定位',
    ], rows: [
      ['后台备份', '3.07 %', '8', '92 / 100', '25'],
      ['UWB 使用 9 号信道', '3.07 %', '0', '100 / 100', '25'],
      ['Wi-Fi 使用 7 号信道', '3.07 %', '0', '100 / 100', '25'],
      ['饱和上传', '91.28 %', '200', '0 / 100', '0'],
    ] },
    { text: '备份那次运行每三个块丢失一帧测距帧，每次丢失的都是最远那个锚点的报告，而 1.8 ms 之后那个时隙超时。一百次测距丢失八次——而二十五次定位一次也没有缺失，其中八次只用三个锚点，误差依然在 4.2 cm 以内。' },
    { kind: 'steps', heading: '本课的场景里两种射频如何相互作用（门限与功率模型都是本课的）', items: [
      '两种射频都无法解调对方的帧，在本课里它们之间也没有任何协调机制。一方发射时，另一方的接收机收到的只是一份功率，除此之外没有任何影响。',
      '这份功率有多大：发射功率加上“重叠带宽比自身带宽”的对数的十倍，减去这段距离上的路径损耗和中间的墙。多路功率按毫瓦相加，不按分贝相加。',
      '测距帧到达期间，手机在自己的 6240.0 至 6739.2 MHz 上收到的外来功率随 Wi-Fi 猝发的起止而变，这里取其中最大的那个值。',
      '这一帧接收完毕时计算 SIR = 本帧到达电平 − 上述最坏的外来电平。达到或高于 −12 dB（本课取的门限）则正常解出；低于则丢弃，记录一条 RX_FAIL，再记录一条 UWB_INTERFERED，写明锚点、外来电平与 SIR。那个外来电平同时会增大时间戳噪声，所以即使成功解出的帧，时间戳精度也会下降。',
      '本课在这个块之内不做任何重传（retry）。那个时隙超时，记录 UWB_TIMEOUT，而定位就用已经到齐的距离来解算：三条仍可解算，那一行末尾写的是三个锚点。',
      '反方向按同样的方法计算，但在更早的一步就结束：一帧测距帧只给 Wi-Fi 接收机增加少量噪声，而这里没有任何一帧能达到 −62 dBm 这条能量检测门限（energy detection threshold）的 18.57 dB 以内（802.11 在主 20 MHz 信道上使用这条门限，本课把它与整条信道内的功率比较）。结论就在这里——Wi-Fi 的载波侦听（carrier sense）检测不到测距帧，本课的测距会话本身也不做空闲信道评估（clear channel assessment, CCA），相互影响的只有功率。',
    ] },
    { kind: 'table', heading: '第一次丢失的逐项数值', head: [
      '步骤', '数值',
    ], rows: [
      ['anchor-4 的报告帧到达电平', '−79.48 dBm'],
      ['其间最坏的外来电平', '−48.67 dBm'],
      ['比值为', '−79.48 − (−48.67) = −30.81 dB'],
      ['低于 −12 dB 门限，因此', 'RX_FAIL · UWB_INTERFERED · UWB_TIMEOUT'],
      ['而这个块仍然解出定位', 'GDOP 1.26, 3 anchors'],
    ] },
  ],
  deeper: [
    { heading: '余量用尽的时候', text: '上传达到饱和时，这点余量就用尽了。每一帧测距帧都会与一次猝发重叠，五秒里丢失 200 帧，一次定位也解不出来。这一次 Wi-Fi 链路确实受到了影响——吞吐从 276.816 Mb/s 降到 274.128 Mb/s——但那只是 0.97 %，而另一侧的测距会话已经完全无法工作。' },
    { kind: 'table', heading: '三种办法的定量比较', head: [
      '办法', '效果', '是否足够',
    ], rows: [
      ['把笔记本移到最远的角落，7.50 m', 'foreign −59.15 dBm · best SIR −17.10 dB',
        '不够——需要 11.09 m，若要保证最远的锚点也能解出则需要 14.21 m'],
      ['Wi-Fi 中心移到 6225 MHz，55 号信道', '25 of 80 MHz · 31 % · 5.05 dB',
        '不够——信干比 −25.76 dB，仍是那八次丢失'],
      ['Wi-Fi 中心移到 6185 MHz，47 号信道（编辑器允许的取值；802.11 的 80 MHz 信道中心编号是 7、23、39、55、71……，47 只用作 160 MHz 信道的中心）', '0 MHz overlap',
        '足够——丢失完全消失'],
      ['会话改用 UWB 9 号信道', '0 MHz overlap · any Wi-Fi width',
        '足够——而且没有任何 Wi-Fi 信道能与它重叠'],
    ] },
    { heading: '9 号信道与 Wi-Fi 频段之间的间隔', text: 'UWB 9 号信道占据 7737.6 至 8236.8 MHz。6 GHz 的 Wi-Fi 频段到 7125 MHz 为止；即便用编辑器允许的最高中心频率 7115 MHz 开一条 320 MHz 的信道，其上边沿也只到 7275 MHz——距 9 号信道的下边沿还有 462.6 MHz 的间隔。所以任何带宽的 Wi-Fi 信道都无法与它重叠：没有任何功率进入它的频带，而上表最后两行其实是同一个答案的两种写法。重叠为零时，会话给出的记录与它在 9 号信道上给出的完全相同。' },
    { heading: '那 40 cm 的由来', text: '这个门限并非无法达到。把一帧测距帧的带内电平与 −62 dBm 的能量检测门限解一个等式，交叉点落在 0.37 m，正文里向上取整到十厘米：把一台 Wi-Fi 收发机放到离 UWB 发射机约 40 cm 以内，它就会被触发。只是本房间里最近的那台 Wi-Fi 收发机——离手机 3.14 m 的路由器——远远没有那么近。即使在手机造成的 8.12 dB 噪声抬升之下，路由器自己的上行仍然保有 26 dB 的信干噪比。' },
    { text: '这八次时间重叠没有对 Wi-Fi 链路造成任何影响：它的吞吐与一次没有 UWB 设备的运行相同——两边都是 9.960 Mb/s。' },
    { kind: 'table', heading: '相隔两个块的两行定位', head: [
      '内容', '日志行',
    ], rows: [
      ['四个锚点的定位', 'uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors'],
      ['三个锚点的定位', 'uwb-1 position (4.01, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.26, 3 anchors'],
    ] },
    { heading: '为什么那八次重叠时 Wi-Fi 帧仍能解出', text: '五秒之内，恰好有八帧 UWB 帧与 Wi-Fi 猝发同时在空中，且八次全来自 anchor-4——它离路由器 8.16 m，到达时只有 −88.87 dBm，把噪声抬高 2.58 dB。笔记本的上行以 −53.46 dBm 到达，于是还剩 31.92 dB 的信干噪比，而它所用的 MCS 7 只需要 26.99 dB（本课速率表里的门限）。八帧全部解出，整段运行里没有一次 Wi-Fi 接收失败。整个会话在这五秒里占用空口 48.8 ms。' },
  ],
  limits: [
    { kind: 'threshold', text: '干扰的裁决是一条硬门限，而且一帧只判一次：本课等整帧收完，取这段时间里最坏的一次外来功率，比较 SIR 是否达到 −12 dB——达到就整帧解出，略低一点就整帧丢弃。真实的性能损失是渐变的，而且与干扰落在帧的哪一段有关：与 SYNC 重叠和与 PSDU 尾部重叠后果完全不同。这里「最坏的那一瞬间」决定整帧的结果，于是一次 1 µs 的猝发和一次占满整帧的猝发代价一样。' },
    { kind: 'model-value', text: '−12 dB 这条线是本课选的（理由是码片率带来的相关增益大致相当于这个数值），标准从不规定接收机在干扰下的解调能力；窄带那一侧另有一条 0 dB，同样是本课程选的。两个数都不是测量得到的，而本课「一百次测距丢失八次」那张表完全取决于第一个数——把它改变 3 dB，这批数字就要重新运行得出。' },
    { kind: 'unmodelled', text: '每一路发射的功率在自己的频带里是一个平铺的矩形，没有频谱模板、没有带外泄漏，接收机也没有选择性。所以「重叠 0 MHz」在这里是完全干净的：一点外来功率也没有，会话的结果与 9 号信道那一次完全相同。真实的 80 MHz 猝发有旁瓣，真实的超宽带前端也不是理想滤波器，所以「移开就完全不受影响」是这个模型的简化，不是真实部署的结论。' },
    { kind: 'unmodelled', text: '强干扰只进入那个比值的计算，从不使接收机阻塞：−45 dBm/MHz 的最大输入（§16.4.10）在本课只是引用，超过它也不产生任何后果。于是把路由器移到离手机十厘米处，前端也不会饱和、自动增益不会失控、时间戳也不会因此系统性偏移，而真实接收机在那种情况下早已无法接收任何信号。「那 40 cm 的由来」算的是 Wi-Fi 是否会推迟发送，不是 UWB 是否还能正常接收。' },
    { kind: 'out-of-scope', text: '相互影响的只有功率，而且只在这一条 Wi-Fi 链路与这一个测距会话之间：本课只算 Wi-Fi 与 UWB 彼此之间的功率，场景里也只有一个测距会话。别人家的 UWB、蓝牙、雷达、微波炉都不存在；本课的测距会话也从不先侦听信道（标准要求 HRP UWB 实现一种空闲信道评估方式，其中包括始终判为空闲的 ALOHA 方式，见 §11.2.8；本课的调度式测距不做这一步），所以这条会话从不为其他设备推迟发送。此外本课 UWB 链路的电平只由距离与墙决定，不含衰落，于是本课那些余量在每个块里都是同一个数，而真实链路的电平会随衰落逐帧起伏。' },
  ],
  sources: [
    '本课出自标准的有：IEEE Std 802.15.4-2024 §16.4.10 规定 UWB 接收机的最大输入至少要达到 −45 dBm/MHz，超过它，标准不再作任何保证；UWB 5 号与 9 号信道的中心频率（6489.6 MHz、7987.2 MHz）出自同一标准 §11.1.3.5 的 HRP UWB 信道表；6 GHz 频段的范围（5925–7125 MHz）、信道编号与能量检测门限出自 IEEE Std 802.11-2024（见最后一条）。其余都是模型。',
    '标准从未规定接收机在干扰下的解调能力，于是本课为它取了一个值——−12 dB 的信干比门限，理由是 499.2 MHz 码片率带来的相关增益大致相当于这个数值。',
    '两条路径损耗公式都是模型的取值，而且每一路发射都沿用自己发射端的那一条：Wi-Fi 按室内衰减指数 3 传播——一米处 46.7 dB，加 30·log10 d，6 GHz 再加 1.2 dB；UWB 按自由空间、指数 2 传播——5 号信道一米处 48.69 dB，加 20·log10 d。',
    '每一课都引用的“每个接收时间戳 100 ps 的 1σ 噪声”是一个下限，不是一个常数：当信干噪比降到 20 dB 以下时，本课的模型最多会把它乘上十倍。在这个房间里，这个倍数始终在 1.0 上下，所以上面的数字一个都没受影响。',
    '“功率在发射者自己的带内均匀铺开”这一假设属于模型。−62 dBm 的能量检测门限出自 IEEE Std 802.11-2024 §27.3.22.6.3，标准把它用在主 20 MHz 信道上，本课把它与整条信道内的功率比较，这一用法是模型；6 GHz 的信道编号（最早由 802.11ax 引入）见 IEEE Std 802.11-2024 的式 (27-148) 与表 E-4。',
  ],
  scenario: () => uwbCoexistScenario('base'),
  variants: [
    { label: 'UWB 使用 9 号信道', scenario: () => uwbCoexistScenario('ch9') },
    { label: 'Wi-Fi 使用 7 号信道（5 985 MHz）', scenario: () => uwbCoexistScenario('wifi7') },
    { label: '饱和上传', scenario: () => uwbCoexistScenario('saturated') },
    { label: '没有 UWB', scenario: () => uwbCoexistScenario('noUwb') },
  ],
  jumps: [
    J('手机的 Poll 开启这一轮', firstUwbPoll),
    J('笔记本的第一个 6 GHz 数据帧', first6g),
    J('第一个被 Wi-Fi 干扰丢失的测距帧', firstInterfered),
    J('随后超时的那个时隙', firstUwbTimeout),
    J('用三个锚点解出的定位', firstThreeAnchorFix),
  ],
  observe: [
    '418.191 ms 处日志写着 “uwb-1 UWB frame from anchor-4 lost to Wi-Fi: SIR -30.8 dB (foreign -48.7 dBm)”，就跟在这一帧接收失败之后。那个外来电平是笔记本的；这一对记录每 600 ms 出现一次。',
    '手机的检视面板多出一行“被 Wi-Fi 干扰丢失”，最终增加到 8——与它的超时次数一样。每个锚点的这一行都是 0：干扰只在手机处构成问题，因为笔记本在那里电平最高，而锚点在那里最弱。',
  ],
  tryThis: [
    '载入“Wi-Fi 使用 7 号信道”。测距记录变得与 9 号信道那次运行逐字段相同，而 Wi-Fi 这一侧保持不变：没有重叠，也就没有功率进入对方的频带。',
    '在编辑器里把笔记本拖到房间最远的角落并重新载入，再把 6 GHz 中心频率设为 6225 MHz 重新载入一次。两次都不能消除丢失——把它们对照“三种办法的定量比较”来看。',
  ],
  quiz: [
    {
      q: '路由器在手机处造成 −42.79 dBm，手机在路由器处只造成 −80.57 dBm。为什么如此悬殊？',
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
  ],
}
