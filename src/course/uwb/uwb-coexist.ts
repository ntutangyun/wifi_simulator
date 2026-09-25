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
  module: 16,
  title: '共享 6 GHz',
  why: '到目前为止，测距会话一直独占着整个房间。可真实的房间里有一台 Wi-Fi 路由器，而在最新的那个 Wi-Fi 频段上，它和超宽带（UWB）完全可能用着同一段兆赫。它们谁也听不懂对方：在路由器耳里，一帧测距帧只是微弱的噪声；在手机耳里，一次 Wi-Fi 猝发却是一声吼。这一课要算清两个方向上各自的损失，并看看那几个一眼就能想到的办法里，究竟哪一个真的管用。',
  outcomes: [
    '说出一种射频的频带有多少落进了另一种的频带',
    '从日志里读出一帧丢失的测距帧，并点出是哪台设备把它淹掉的',
    '在“挪设备”“挪 Wi-Fi 信道”和“挪会话”之间做出选择',
  ],
  needs: ['uwb-blocks', 'uwb-geometry'],
  terms: [
    { term: 'overlap', plain: '一种射频的频带有多少落进了另一种的频带：全部、一部分，或者一点也没有' },
    { term: 'SIR', plain: '信干比：想要的那一帧的电平，减去闯进来那一路的电平' },
    { term: 'threshold', plain: '门限：一次读数要与之比较的那个电平——高过它是一种答案，低于它是另一种' },
    { term: 'noise floor', plain: '噪声地板：没人说话时接收机听到的那份功率，任何信号都要高过它才会被听见' },
    { term: 'energy detect', plain: 'Wi-Fi 那条粗放的“忙”判据：信道上功率太大，就先别发' },
  ],
  picture: [
    { heading: '两种射频，同一片频谱', text: '此前几课把测距会话放在了一条没人用的信道上。把它挪进 6 GHz 路由器工作的那个频段，两者就共用起频谱来。在本课的房间里，路由器的整条信道都躺在测距信道之内：一个频带落进另一个频带的那一部分叫重叠（overlap），而这里的重叠是全部，每一次 Wi-Fi 猝发都不偏不倚地压在会话头上。' },
    { heading: '一声吼，一声耳语', text: '路由器的发射功率（transmit power）比测距设备高出好几千倍，而且全部塞进一条窄信道里。测距设备正相反：它把本就微小的功率摊在宽出许多倍的信道上，能真正到达路由器的只是其中一小片。再把几何摆进来：路由器和笔记本都离手机很近，锚点（anchor）却远在四角。' },
    { kind: 'watch', jump: 2, heading: '看一个回答怎么死掉', text: '载入仿真、按下播放，然后跳到手机丢掉的第一帧测距帧。远处那个锚点确实作答了，只是笔记本的上传恰好在那一刻占着空口，于是这个回答根本没能到达。日志会写明这次丢失，以及那路外来信号有多强。' },
    { heading: '手机听到了什么', text: '在手机这一侧，最强的“想要”是从房间对角作答的那个锚点，最响的“不想要”是几步之外的那台笔记本。两者之间的差距就是信干比（SIR），这里的它是一个很深的负数，远远低于接收机还解得出来的那个电平，这就是门限。' },
    { heading: '路由器听到了什么', text: '反过来看。一帧测距帧到达路由器时比路由器自己的噪声还弱：它把没人说话时路由器听到的那份功率——噪声地板（noise floor）——抬高几个分贝，除此之外什么也没做。Wi-Fi 在这里判忙只看信道上的原始功率，这就是能量检测（energy detection, ED），而这样距离上的测距帧离它的门限差得很远。于是路由器从不为它退让，与这个会话打照面的只有解调器。' },
    { heading: '一个备用锚点把损失吃了下来', text: '测距会话之所以能扛住办公室里的一次后台备份，是因为它带了个备份件：三个锚点就够解，而这里有四个作答，丢失又全部落在同一个最远的锚点身上。于是手机每个块仍然解得出位置，只是条件数差一点、误差大一点。' },
    { kind: 'watch', jump: 4, heading: '只用三个锚点的那次定位', text: '跳到手机第一次在缺了第四个锚点的情况下解出的位置。日志里看不出哪里不对：定位就在那儿，时刻照旧，误差仍在两三厘米之内。唯一的痕迹，是那一行末尾的锚点数，以及旁边的 GDOP。' },
    { kind: 'list', heading: '三个办法，以及“部分重叠”买得到什么', items: [
      '把设备拉开——房间太小。哪怕挪到最远的角落，手机照样被震得听不见。',
      '把 Wi-Fi 信道挪一点，只让它一部分重叠——部分重叠并不等于部分保护：丢的仍然是同样那几帧，丢在同样那几个块里。',
      '把会话挪到整个 Wi-Fi 频段之上的那条测距信道——在那里，任何带宽的 Wi-Fi 信道都够不到它，仿真器默认选的就是它。',
    ] },
  ],
  numbers: [
    { kind: 'table', heading: '几条信道各在哪里', head: [
      '信道', '占据', '落进测距信道的部分',
    ], rows: [
      ['本会话所用的 UWB 5 号', '6240.0 to 6739.2 MHz', '499.2 MHz wide'],
      ['本路由器所用的 Wi-Fi 71 号', '6265 to 6345 MHz', '80 of 80 MHz · overlap 1.00'],
      ['引擎默认的 Wi-Fi 7 号', '5945 to 6025 MHz', '0 MHz · overlap 0.00'],
      ['会话默认的 UWB 9 号', '7737.6 to 8236.8 MHz', '6 GHz Wi-Fi 够不到'],
    ] },
    { kind: 'formula', heading: '只有重叠的那一片算数', text: 'in-band EIRP = EIRP + 10·log10(W_overlap / W_own)      Wi-Fi: 20 + 10·log10(80/80) = 20 dBm      UWB: −14 + 10·log10(80/499.2) = −21.95 dBm', note: '路由器这一侧一点也没损失：它的信道整个落在测距信道里面。而一帧测距帧的功率摊在 499.2 MHz 上，进到 80 MHz 接收机里的只有 80 MHz——路径损耗（path loss）还没开始，就先丢掉 7.95 dB。' },
    { kind: 'table', heading: '两边各自听到什么', head: [
      '谁听到', '听到的是', '电平',
    ], rows: [
      ['uwb-1', '路由器，相距 3.14 m', '−42.79 dBm'],
      ['uwb-1', '笔记本，相距 3.35 m', '−48.67 dBm'],
      ['uwb-1', '四个锚点，相距 4.76 至 6.91 m', '−76.25 to −79.48 dBm'],
      ['uwb-1', '最弱的锚点盖过笔记本', 'SIR −30.81 dB · floor −12 dB'],
      ['ap', '手机，相距 3.14 m', '−80.57 dBm'],
      ['ap', '它自己 80 MHz 上的噪声', '−87.97 dBm · rise 8.12 dB'],
      ['ap', '能量检测门限', '−62 dBm · 18.57 dB above'],
    ] },
    { text: '这条鸿沟是单向的。对上笔记本，最弱的那个锚点让手机差了 18.8 dB 才够得着可解调的程度。' },
    { kind: 'table', heading: '五秒，二十五个块', head: [
      '运行', 'Wi-Fi 占空', '被 Wi-Fi 干扰丢失',
      '手机测距', '定位',
    ], rows: [
      ['后台备份', '3.07 %', '8', '92 / 100', '25'],
      ['UWB 使用 9 号信道', '3.07 %', '0', '100 / 100', '25'],
      ['Wi-Fi 使用 7 号信道', '3.07 %', '0', '100 / 100', '25'],
      ['饱和上传', '91.28 %', '200', '0 / 100', '0'],
    ] },
    { text: '备份那次运行每三个块丢一帧测距帧，每次都是最远那个锚点的报告丢了，而 1.8 ms 之后那个时隙超时。一百次测距丢了八次——可二十五次定位一次也没少，其中八次只用三个锚点，误差依然在 4.2 cm 以内。' },
    { kind: 'steps', heading: '两种射频之间究竟发生了什么，一步一步', items: [
      '两种射频的每一次在发传输，都向同一个中介登记：在自己频带上均匀铺开的功率、发射端的位置、发射端自己的路径损耗公式。别的什么也不越界。',
      '测距帧到达期间，中介每报一次变动，手机就在自己的 6240.0 至 6739.2 MHz 上重读外来功率，并保留其中最大的读数。',
      '某一次传输在这个读数里占的份额：功率加上“重叠带宽比自身带宽”的对数的十倍，减去这段距离上的路径损耗和中间的墙。多路相加按毫瓦，不按分贝。',
      '这一帧收完时取 SIR = 本帧到达电平 − 刚才那个最坏的外来电平。达到或高于 −12 dB 就照常解出；低于就丢，记一条 RX_FAIL，再记一条 UWB_INTERFERED，写明锚点、外来电平与 SIR。那个外来电平同时会把时间戳噪声拉宽，所以活下来的那些帧，时间戳也没那么准了。',
      '这个块之内不做任何重传（retry）。那个时隙超时，打印出 UWB_TIMEOUT，而定位就用已经到齐的距离来解：三条仍然解得出，那一行末尾写的是三个锚点。',
      '反方向读的是同一个中介，而故事早一步就结束：一帧测距帧只给 Wi-Fi 接收机添点噪声，而这里没有哪一帧能摸到 −62 dBm 这条能量检测门限（energy detection threshold）的 18.57 dB 以内。界线就在这里——两种射频的载波侦听（carrier sense）都看不见对方，越界的只有功率。',
    ] },
    { kind: 'table', heading: '第一次丢失，逐值走一遍', head: [
      '步骤', '数值',
    ], rows: [
      ['anchor-4 的报告帧到达电平', '−79.48 dBm'],
      ['其间最坏的外来电平', '−48.67 dBm'],
      ['于是比值是', '−79.48 − (−48.67) = −30.81 dB'],
      ['低于 −12 dB 门限，于是', 'RX_FAIL · UWB_INTERFERED · UWB_TIMEOUT'],
      ['而这个块照样解出定位', 'GDOP 1.26, 3 anchors'],
    ] },
  ],
  deeper: [
    { heading: '余量用尽的时候', text: '把上传灌满，这个备份件就用尽了。每一帧测距帧都会撞上一次猝发，五秒里丢掉 200 帧，一次定位也解不出来。这回链路确实察觉到了——吞吐从 276.816 Mb/s 掉到 274.128 Mb/s——但那只是 0.97 %，而对面那个会话已经不存在了。' },
    { kind: 'table', heading: '三种办法，各自量一量', head: [
      '办法', '换来什么', '够不够？',
    ], rows: [
      ['把笔记本挪到最远的角落，7.50 m', 'foreign −59.15 dBm · best SIR −17.10 dB',
        '不够——要 11.09 m，若要护住最远的锚点则要 14.21 m'],
      ['Wi-Fi 中心挪到 6225 MHz，55 号信道', '25 of 80 MHz · 31 % · 5.05 dB',
        '不够——信干比 −25.76 dB，还是那八次丢失'],
      ['Wi-Fi 中心挪到 6185 MHz，47 号信道', '0 MHz overlap',
        '够——丢失戛然而止'],
      ['会话改用 UWB 9 号信道', '0 MHz overlap · any Wi-Fi width',
        '够——而且没有任何 Wi-Fi 信道能跟过去'],
    ] },
    { heading: '9 号信道上头有多少净空', text: 'UWB 9 号信道占据 7737.6 至 8236.8 MHz。6 GHz 的 Wi-Fi 频段到 7125 MHz 为止；即便用编辑器允许的最高中心频率 7115 MHz 开一条 320 MHz 的信道，其上边沿也只到 7275 MHz——距 9 号信道的下边沿还有 462.6 MHz 的净空。所以任何带宽的 Wi-Fi 信道都无法与它重叠：中介根本不会建立，而上表最后两行其实是同一个答案的两种写法。重叠为零时，会话给出的记录与它在 9 号信道上给出的一模一样。' },
    { heading: '那 40 cm 是怎么算出来的', text: '这个门限并非遥不可及。把一帧测距帧的带内电平与 −62 dBm 的能量检测门限解一个等式，交叉点落在 0.37 m，正文里向上取整到十厘米：把一台 Wi-Fi 收发机放到离 UWB 发射机约 40 cm 以内，它就会被触发。只是本房间里最近的那台 Wi-Fi 收发机——离手机 3.14 m 的路由器——远远没有那么近。即使在手机造成的 8.12 dB 噪声抬升之下，路由器自己的上行仍然保有 26 dB 的信干噪比。' },
    { text: '这八次相遇没有让 Wi-Fi 链路付出任何代价：它的记录流与一次没有 UWB 节点的运行逐字段相同，只差共用的那个序号——两边都是 9.960 Mb/s。' },
    { kind: 'table', heading: '相隔两个块的两行定位', head: [
      '内容', '写的是',
    ], rows: [
      ['四个锚点的定位', 'uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors'],
      ['三个锚点的定位', 'uwb-1 position (4.01, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.26, 3 anchors'],
    ] },
    { heading: '为什么那八次相遇照样解得出来', text: '五秒之内，恰好有八帧 UWB 帧与 Wi-Fi 猝发同时在空中，且八次全来自 anchor-4——它离路由器 8.16 m，到达时只有 −88.87 dBm，把噪声抬高 2.58 dB。笔记本的上行以 −53.46 dBm 到达，于是还剩 31.92 dB 的信干噪比，而它所用的 MCS 7 只需要 26.99 dB。八帧全部解出，整段运行里没有一次 Wi-Fi 接收失败。整个会话在这五秒里占用空口 48.6 ms。' },
  ],
  sources: [
    '本课只有一处出自标准：IEEE Std 802.15.4-2024 §16.4.10 规定 UWB 接收机的最大输入为 −45 dBm/MHz，超过它标准什么也不再保证。其余都是模型。',
    '标准从未规定接收机在干扰下的解调能力，于是引擎给了它一个数——−12 dB 的信干比门限，理由是 499.2 MHz 码片率带来的相关增益大致值这么多。',
    '两条路径损耗公式都是模型的取值，而且每一路发射都沿用自己发射端的那一条：Wi-Fi 按室内衰减指数 3 传播——一米处 46.7 dB，加 30·log10 d，6 GHz 再加 1.2 dB；UWB 按自由空间、指数 2 传播——5 号信道一米处 48.69 dB，加 20·log10 d。',
    '每一课都引用的“每个接收时间戳 100 ps 的 1σ 噪声”是一个下限，不是一个常数：当信干噪比跌到 20 dB 以下时，引擎最多会把它乘上十倍。在这个房间里，这个倍数始终在 1.0 上下，所以上面的数字一个都没受影响。',
    '“功率在发射者自己的带内均匀铺开”这一假设、−62 dBm 的能量检测门限，以及 6 GHz 的信道编号（这一条出自 802.11ax），也都属于模型。',
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
    '418.191 ms 处日志写着 “uwb-1 UWB frame from anchor-4 lost to Wi-Fi: SIR -30.8 dB (foreign -48.7 dBm)”，就跟在这一帧接收失败之后。那个外来电平是笔记本的；这一对记录每 600 ms 回来一次。',
    '手机的检视面板多出一行“被 Wi-Fi 干扰丢失”，最终爬到 8——与它的超时次数一样。每个锚点的这一行都是 0：干扰是在手机处被感受到的，因为笔记本在那里最响，而锚点在那里最弱。',
  ],
  tryThis: [
    '载入“Wi-Fi 使用 7 号信道”。测距记录变得与 9 号信道那次运行逐字段相同，而 Wi-Fi 这一侧纹丝不动：没有重叠，也就没有什么要去中介的。',
    '在编辑器里把笔记本拖到房间最远的角落并重新载入，再把 6 GHz 中心频率设为 6225 MHz 重新载入一次。两次都止不住丢失——把它们对照“三种办法，各自量一量”来看。',
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
      explain: '20 dBm 对 −14 dBm，一上来就是 34 dB；接着这 −14 dBm 又摊在 499.2 MHz 上，只有其中 80 MHz 落进 Wi-Fi 信道。',
    },
    {
      q: '后台备份让会话在 100 次测距里丢了 8 次，却没丢掉 25 次定位中的任何一次。是什么吸收了这笔损失？',
      options: [
        '手机在同一个块内重发了丢失的那次测距',
        '三个距离仍能解出两个未知数：定位改用三个锚点，GDOP 从 1.05 升到 1.26',
        '解算器通过品质因数（figure of merit, FoM）字节把受干扰的那次测距降权了',
      ],
      answer: 1,
      explain: '丢失之后 1.8 ms 该时隙超时，这个块就少一个锚点继续下去。二十五次定位里有八次是三锚点定位，误差仍在 4.2 cm 以内。',
    },
  ],
}
