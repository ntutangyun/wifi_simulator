/**
 * UWB Tier 2 · M13 · Coexistence · Sharing 6 GHz.
 *
 * The first UWB tier ran its sessions in an empty room. This one opens the door
 * and lets a Wi-Fi 7 router in on the same megahertz: UWB channel 5 occupies
 * 6240.0–6739.2 MHz, and a 6 GHz Wi-Fi channel can sit wholly inside it. The
 * lesson is about the asymmetry that follows — a −14 dBm ranging frame and a
 * 20 dBm PPDU do not damage each other equally — and about why the practical
 * answer is not separation, nor a narrower overlap, but channel 9.
 * Every number quoted below is pinned in tests/course/uwb-coexist.test.ts.
 *
 * CAUTION — word budget: `lessonMinutes` rounds to 25 minutes anywhere between
 * 975 and 1724 English words across body + observe + tryThis + quiz (4 observe
 * items and 2 experiments already account for 16 of those minutes). At 1725 the
 * rounding tips to 30, and the study-time test pins that ceiling. The prose
 * below totals 1701 words, leaving room for 23 more and no others.
 */
import type { Scenario } from '../../model/scenario'
import type { TLRecord } from '../../model/records'
import {
  J, LESSON_6G_WIDTH_MHZ, N, anchor, first6g, firstUwbPoll, firstUwbTimeout, node, oneRoom, sc,
  uwbSc, uwbTag, wifi6g, type Lesson,
} from '../lessonKit'

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
 * Lesson 5's four corner anchors and its tag, DS-TWR with NLOS on, moved to UWB
 * **channel 5** and given company: a Wi-Fi 7 router at (5, 0.7, 2.0) on an
 * 80 MHz 6 GHz channel and a laptop at (7, 5, 1.0) backing up files to it. The
 * UWB nodes are listed last, so the Wi-Fi link is built — and its mediator
 * decided — before the ranging session asks for one.
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
  module: 13,
  title: { en: 'Sharing 6 GHz', zh: '共享 6 GHz' },
  body: [
    { text: {
      en: 'One thing here comes from IEEE Std 802.15.4-2024: §16.4.10 sets a UWB receiver’s maximum input at −45 dBm/MHz, above which nothing is promised. The rest is the model. The standard never says how well a receiver decodes under an interferer, so the engine gives it one number: a −12 dB signal-to-interference floor, the correlation gain over a 499.2 MHz chip rate being worth about that. The two path-loss laws, the flat spectral density, and the 6 GHz channel numbering (802.11ax) are the model’s too.',
      zh: '本课只有一处以 IEEE Std 802.15.4-2024 为依据：§16.4.10 规定 UWB 接收机的最大输入为 −45 dBm/MHz，超过它，标准什么也不再保证。其余都是模型。标准从未规定接收机在干扰下的解调能力，于是引擎给了它一个数——−12 dB 的信干比门限，理由是 499.2 MHz 码片率带来的相关增益大致值这么多。两条路径损耗公式、“功率在发射者自己的带内均匀铺开”这一假设，以及 6 GHz 的信道编号（这一条出自 802.11ax），也都属于模型。',
    } },
    { heading: { en: 'Two bands, one place', zh: '两个频段，同一个地方' }, text: {
      en: 'UWB channel 5 is 499.2 MHz wide, centred at 6489.6 MHz: it occupies 6240.0 to 6739.2 MHz, inside the 6 GHz Wi-Fi band. This router runs 80 MHz at 6305 MHz — 802.11ax channel 71, 6265 to 6345 MHz — and all 80 of those megahertz lie inside the UWB channel: an overlap fraction of 1.00. The engine’s default centre, 5985 MHz (channel 7, 5945–6025 MHz), overlaps by 0 MHz; there no mediator is built, and the session produces exactly the records it produces on channel 9, where the bands cannot meet either.',
      zh: 'UWB 5 号信道宽 499.2 MHz，中心在 6489.6 MHz，占据 6240.0 至 6739.2 MHz——这一段正落在 6 GHz Wi-Fi 频段里。本场景的路由器工作在 6305 MHz 的 80 MHz 信道上，即 802.11ax 的 71 号信道，6265 至 6345 MHz，这 80 MHz 全部落在 UWB 信道之内，重叠比例为 1.00。引擎默认的中心频率 5985 MHz（7 号信道，5945–6025 MHz）重叠 0 MHz；那里频谱中介根本不会建立，会话给出的记录，与它在同样无法相遇的 9 号信道上给出的记录一模一样。',
    } },
    { kind: 'formula', text: {
      en: 'in-band EIRP = EIRP + 10·log10(W_overlap / W_own)      Wi-Fi: 20 + 10·log10(80/80) = 20 dBm      UWB: −14 + 10·log10(80/499.2) = −21.95 dBm',
      zh: 'in-band EIRP = EIRP + 10·log10(W_overlap / W_own)      Wi-Fi: 20 + 10·log10(80/80) = 20 dBm      UWB: −14 + 10·log10(80/499.2) = −21.95 dBm',
    }, note: {
      en: 'Only the overlapping slice of an emission lands in the other radio’s band. The router loses nothing, its channel lying entirely inside the UWB one; a UWB frame’s −14 dBm is spread over 499.2 MHz and only 80 of those reach an 80 MHz receiver — 7.95 dB gone before the path loss starts. The laws differ too: Wi-Fi under the indoor exponent 3 (46.7 dB at one metre, plus 30·log10 d, plus 1.2 dB for 6 GHz), UWB under free space, exponent 2 (48.69 dB at one metre on channel 5, plus 20·log10 d). Each keeps its transmitter’s law.',
      zh: '一个发射只有重叠的那一片落进对方的频带。路由器什么也没损失——它的信道整个躺在 UWB 信道里面；而一个 UWB 帧的 −14 dBm 摊在 499.2 MHz 上，能进入 80 MHz 接收机的只有其中 80 MHz：路径损耗还没开始，先丢掉 7.95 dB。接着两条定律也不同。Wi-Fi 的发射按 Wi-Fi 表的室内衰减指数 3 传播（一米处 46.7 dB，加 30·log10 d，6 GHz 再加 1.2 dB）；UWB 的发射按自由空间、指数 2 传播（5 号信道一米处 48.69 dB，加 20·log10 d）。走到哪里，各自都带着发射端的那条定律。',
    } },
    { heading: { en: 'What the tag hears', zh: '标签听到了什么' }, text: {
      en: 'The tag sits at (4, 3.5, 1.0). The router is 3.14 m off at 20 dBm: −42.79 dBm at the tag. The laptop is 3.35 m off at 15 dBm: −48.67 dBm. The other side of the ledger: the anchors are in the corners, 4.76 to 6.91 m away, and a −14 dBm frame from one arrives at −76.25 to −79.48 dBm. Take the weakest, anchor-4, against the laptop: −79.48 − (−48.67) = −30.81 dB of SIR, where the receiver can stand −12. It is 18.8 dB short.',
      zh: '标签在 (4, 3.5, 1.0)。路由器离它 3.14 m，往这段频谱里灌 20 dBm，到标签处是 −42.79 dBm；笔记本离它 3.35 m，发 15 dBm，到标签处是 −48.67 dBm。再看账本的另一边：锚点在四角，距离 4.76 至 6.91 m，从其中一个发来的 −14 dBm 帧到达时只有 −76.25 至 −79.48 dBm。取最弱的 anchor-4 与笔记本相比：−79.48 − (−48.67) = −30.81 dB 的信干比，而接收机只扛得住 −12 dB。差了 18.8 dB。',
    } },
    { heading: { en: 'What the router hears', zh: '路由器听到了什么' }, text: {
      en: 'Reverse it. The loudest UWB signal any Wi-Fi radio here sees is the tag’s own frame at the router, 3.14 m away: −21.95 dBm of in-band EIRP minus 58.62 dB of free-space loss is −80.57 dBm. Against the 80 MHz noise floor of −87.97 dBm that is a noise rise of 8.12 dB — real enough, but 18.57 dB below the −62 dBm energy-detect threshold, so at these distances CCA never reports busy because of a UWB frame. The threshold is not unreachable: a Wi-Fi radio brought within about 40 cm of a UWB transmitter would trip it. Nowhere in this room is one that close, so carrier sense misses the session entirely and only the demodulator meets it.',
      zh: '反过来看。本房间里任何一台 Wi-Fi 收发机能听到的最强 UWB 信号，是标签自己的帧到达路由器时的电平——距离 3.14 m，−21.95 dBm 的带内 EIRP 减去 58.62 dB 的自由空间损耗，等于 −80.57 dBm。对着 80 MHz 下 −87.97 dBm 的噪声底，这是 8.12 dB 的噪声抬升——确实不算小，但仍比 −62 dBm 的能量检测门限低 18.57 dB，所以在这样的距离上，CCA 一次也不会因为 UWB 帧而报忙。这个门限并非遥不可及：把一台 Wi-Fi 收发机放到离 UWB 发射机约 40 cm 以内，它就会被触发。这个房间里没有哪一台靠得这么近，因此载波侦听完全察觉不到这个会话，只有解调器会碰上它。',
    } },
    { text: {
      en: 'And the demodulator copes. In the five seconds below, exactly eight UWB frames share the air with a Wi-Fi PPDU, all eight anchor-4’s — 8.16 m from the router, arriving at −88.87 dBm and lifting the noise 2.58 dB. The laptop’s uplink comes in at −53.46 dBm, leaving 31.92 dB of SINR where its MCS 7 needs 26.99. All eight decode. Those eight encounters cost the session eight frames and the Wi-Fi link nothing: its record stream is identical to the run with no UWB nodes in every field but the shared sequence number — 9.960 Mb/s either way.',
      zh: '而解调器应付得来。在下面这五秒里，恰好有八个 UWB 帧与 Wi-Fi 的 PPDU 同时在空中，且八次全是 anchor-4 的帧——它离路由器 8.16 m，到达时只有 −88.87 dBm，把噪声抬高 2.58 dB。笔记本的上行以 −53.46 dBm 到达，于是还剩 31.92 dB 的信干噪比，而它所用的 MCS 7 只需要 26.99 dB。八个帧全部解出。同样这八次相遇，让会话丢了八个帧，却没让 Wi-Fi 链路丢掉任何东西：它的记录流与没有 UWB 节点的那次运行只差共用的那个序号，其余字段完全相同，两边都是 9.960 Mb/s。',
    } },
    { kind: 'table', heading: { en: 'Five seconds, twenty-five blocks', zh: '五秒，二十五个块' }, head: [
      { en: 'Run', zh: '运行' }, { en: 'Wi-Fi air', zh: 'Wi-Fi 占空' }, { en: 'Lost to Wi-Fi', zh: '被 Wi-Fi 干扰丢失' },
      { en: 'Tag ranges', zh: '标签测距' }, { en: 'Fixes', zh: '定位' },
    ], rows: [
      [{ en: 'Backup running', zh: '后台备份' }, N('3.07 %'), N('8'), N('92 / 100'), N('25')],
      [{ en: 'UWB on channel 9', zh: 'UWB 使用 9 号信道' }, N('3.07 %'), N('0'), N('100 / 100'), N('25')],
      [{ en: 'Wi-Fi on channel 7', zh: 'Wi-Fi 使用 7 号信道' }, N('3.07 %'), N('0'), N('100 / 100'), N('25')],
      [{ en: 'Saturated upload', zh: '饱和上传' }, N('91.28 %'), N('200'), N('0 / 100'), N('0')],
    ] },
    { heading: { en: 'Eight frames, no missing fix', zh: '丢了八个帧，一次定位也没少' }, text: {
      en: 'The backup run loses one ranging frame every third block — 2, 5, 8 and so on to 23 — the tag losing anchor-4’s report at −30.81 dB of SIR, each loss followed 1.8 ms later by the slot timing out. Eight of 100 ranges gone, and yet all 25 fixes are made: eight on three anchors instead of four, GDOP rising from 1.05 to 1.26 exactly as lesson 5 said, the error over the 25 running 0.1 to 4.2 cm against 0.3 to 3.5 cm on channel 9. A fourth anchor is a spare, and this is what it spares you.',
      zh: '备份那次运行每三个块丢一个测距帧——第 2、5、8……直到第 23 个块，每次都是标签在 −30.81 dB 的信干比下丢掉 anchor-4 的报告，每次丢失之后 1.8 ms，那个时隙超时。一百次测距丢了八次，可二十五次定位一次也没少：其中八次用三个锚点而不是四个，GDOP 从 1.05 升到 1.26，与第 5 课所说分毫不差；二十五次的误差在 0.1 cm 到 4.2 cm 之间，而 9 号信道上是 0.3 cm 到 3.5 cm。第四个锚点是备份件——省下的正是这一笔。',
    } },
    { text: {
      en: 'Load “Saturated upload” and the spare runs out. The laptop holds 91.28 % of the air, every ranging frame meets a PPDU, and the tag gets nothing: 200 frames lost in five seconds, 40 a second, 400 timed-out slots, no range and no position. Notice which way the damage runs even here. The Wi-Fi link finally notices — 50 PPDUs fail and throughput falls from 276.816 to 274.128 Mb/s — but that is 0.97 %, against a session that has stopped existing.',
      zh: '载入“饱和上传”，这个备份件就用尽了。笔记本占了 91.28 % 的空口，每一个测距帧都会撞上 PPDU，标签什么也拿不到：五秒丢 200 个帧，每秒 40 个，400 个时隙超时，一次测距、一次定位都没有。请注意即使在这里，损害也是偏的。Wi-Fi 链路这回确实察觉到了这个会话——50 个 PPDU 解调失败，吞吐从 276.816 Mb/s 掉到 274.128 Mb/s——但那是 0.97 %，而对面那个会话已经不存在了。',
    } },
    { heading: { en: 'Why the answer is channel 9', zh: '为什么答案是 9 号信道' }, text: {
      en: 'Three cures suggest themselves and two fail. Move the devices apart: the SIR reaches −12 dB only with the laptop 11.09 m from the tag, 14.21 m to protect the weakest anchor, while the farthest corner of a 10 × 8 m room is 7.50 m away and still leaves −17.10 dB. Slide the Wi-Fi channel a little: at 6225 MHz only 25 of its 80 MHz overlap — 31 %, worth 5.05 dB — taking the SIR to −25.76 and leaving the same eight losses and the same 92 ranges. Partial overlap is not partial protection.',
      zh: '有三种办法自然会被想到，其中两种行不通。把设备拉开：要让信干比升到 −12 dB，笔记本得离标签 11.09 m，若要护住最弱的那个锚点则要 14.21 m；而 10 × 8 m 房间里最远的角落只有 7.50 m，此时仍是 −17.10 dB。把 Wi-Fi 信道挪一点：中心移到 6225 MHz 时，80 MHz 里只有 25 MHz 重叠——31 %，值 5.05 dB——信干比变成 −25.76 dB，仍是那八次丢失、那 92 次测距。部分重叠并不等于部分保护。',
    } },
    { text: {
      en: 'The third works, and it is why channel 9 is the default. It occupies 7737.6 to 8236.8 MHz; the 6 GHz band stops at 7125 MHz, and even a 320 MHz channel at the highest centre the editor accepts, 7115 MHz, reaches only 7275 MHz — 462.6 MHz of clear air below channel 9’s lower edge. No Wi-Fi channel can overlap it, so the mediator is never built and the arithmetic above never runs. Channel 5 is worth reaching for when its place in the spectrum buys you something; beside a 6 GHz access point it costs more than it buys.',
      zh: '第三种办法有效，这也正是 9 号信道成为默认值的理由。9 号信道占据 7737.6 至 8236.8 MHz；6 GHz 频段到 7125 MHz 为止，即便用编辑器允许的最高中心频率 7115 MHz 开一个 320 MHz 的信道，其上边沿也只到 7275 MHz——距 9 号信道的下边沿还有 462.6 MHz 的净空。没有任何 Wi-Fi 信道能与它重叠，于是中介根本不会建立，上面这套算术一次也不会跑。5 号信道值得一用，前提是它在频谱里的位置真能换来什么；而在一台 6 GHz 接入点旁边，它付出的比换来的多。',
    } },
  ],
  scenario: () => uwbCoexistScenario('base'),
  variants: [
    { label: { en: 'UWB on channel 9', zh: 'UWB 使用 9 号信道' }, scenario: () => uwbCoexistScenario('ch9') },
    { label: { en: 'Wi-Fi on channel 7 (5 985 MHz)', zh: 'Wi-Fi 使用 7 号信道（5 985 MHz）' }, scenario: () => uwbCoexistScenario('wifi7') },
    { label: { en: 'Saturated upload', zh: '饱和上传' }, scenario: () => uwbCoexistScenario('saturated') },
    { label: { en: 'No UWB', zh: '没有 UWB' }, scenario: () => uwbCoexistScenario('noUwb') },
  ],
  jumps: [
    J('the tag’s Poll opens the round', '标签的 Poll 开启这一轮', firstUwbPoll),
    J('the laptop’s first 6 GHz data frame', '笔记本的第一个 6 GHz 数据帧', first6g),
    J('the first ranging frame lost to Wi-Fi', '第一个被 Wi-Fi 干扰丢失的测距帧', firstInterfered),
    J('the slot that then times out', '随后超时的那个时隙', firstUwbTimeout),
    J('the fix made on three anchors', '用三个锚点解出的定位', firstThreeAnchorFix),
  ],
  observe: [
    { en: 'At 418.191 ms the log reads “uwb-1 UWB frame from anchor-4 lost to Wi-Fi: SIR -30.8 dB (foreign -48.7 dBm)”, straight after that frame’s RX_FAIL for lowSinr. The foreign level is the laptop’s, and the pair repeats every 600 ms — eight times in five seconds.',
      zh: '418.191 ms 处日志写着 “uwb-1 UWB frame from anchor-4 lost to Wi-Fi: SIR -30.8 dB (foreign -48.7 dBm)”，就跟在这个帧因 lowSinr 而 RX_FAIL 之后。那个外来电平是笔记本的；这一对记录每 600 ms 重复一次，五秒里共八次。' },
    { en: 'The tag’s inspector grows a “lost to Wi-Fi” row and it reaches 8 — the same 8 as its timeouts. Every anchor’s row stays 0: the loss is felt at the tag, where the laptop is loud and the anchors faint.',
      zh: '标签的检视面板多出一行“被 Wi-Fi 干扰丢失”，最终停在 8——与它的超时次数一样。每个锚点的这一行都是 0：干扰是在标签处被感受到的，因为笔记本在那里最响，而锚点在那里最弱。' },
    { en: 'Block 0 prints “uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors”; block 2 prints “(4.01, 3.50) … GDOP 1.26, 3 anchors”. Every third block is a three-anchor fix, and none of the 25 is missing.',
      zh: '第 0 个块印出 “uwb-1 position (3.99, 3.50) m, true (4.00, 3.50), error 0.01 m, GDOP 1.05, 4 anchors”；第 2 个块印出 “(4.01, 3.50) … GDOP 1.26, 3 anchors”。每三个块就有一次三锚点定位，而二十五次一个也没缺。' },
    { en: 'Load “Wi-Fi on channel 7”. The ranging records become those of the channel-9 run to the last field, and the Wi-Fi side does not move: at zero overlap no mediator is built, and the two ways of missing each other look identical from inside.',
      zh: '载入“Wi-Fi 使用 7 号信道”。测距记录变得与 9 号信道那次运行逐字段相同，而 Wi-Fi 这一侧纹丝不动：重叠为零时中介根本不会建立，而这两种“彼此错开”的方式，从里面看是分不出来的。' },
  ],
  tryThis: [
    { en: 'In the editor, drag the laptop as far from the tag as the room allows — the far corner, 7.50 m. The foreign level falls to −59.15 dBm and the best SIR any anchor gets is −17.10 dB, still under the floor, so the losses continue. Then work out what would be enough: 11.09 m for the nearest anchor, 14.21 m for the farthest. Neither fits in the room.',
      zh: '在编辑器里把笔记本拖到房间允许的最远处——对角的那个角落，7.50 m。外来电平降到 −59.15 dBm，任何锚点能拿到的最好信干比是 −17.10 dB，仍在 −12 dB 的门限之下，于是丢失照旧。再算一算多远才够：最近的锚点要 11.09 m，最远的要 14.21 m。这个房间两个都装不下。' },
    { en: 'Set the 6 GHz centre to 6225 MHz (channel 55). Only 25 of the 80 MHz overlap now — 31 %, worth 5.05 dB — and the SIR improves to −25.76 dB, which changes nothing: the same eight losses, the same 92 ranges. Then set 6185 MHz (channel 47), where the overlap is exactly zero, and the losses stop dead.',
      zh: '把 6 GHz 中心频率设为 6225 MHz（55 号信道）。此时 80 MHz 里只有 25 MHz 重叠——31 %，值 5.05 dB——信干比改善到 −25.76 dB，而这毫无作用：还是那八次丢失，还是那 92 次测距。再把它设为 6185 MHz（47 号信道），重叠恰好为零，丢失便戛然而止。' },
  ],
  quiz: [
    {
      q: { en: 'The router puts −42.79 dBm into the tag; the tag puts −80.57 dBm into the router. Why so lopsided?', zh: '路由器在标签处造成 −42.79 dBm，标签在路由器处只造成 −80.57 dBm。为什么如此悬殊？' },
      options: [
        { en: 'The router transmits far more often, so its average power is higher', zh: '路由器发射得频繁得多，所以平均功率更高' },
        { en: '34 dB of EIRP, plus 7.95 dB of the UWB frame falling outside the 80 MHz channel', zh: '34 dB 的 EIRP 差距，再加上 UWB 帧有 7.95 dB 落在这 80 MHz 信道之外' },
        { en: 'The UWB receiver has the lower noise figure', zh: 'UWB 接收机的噪声系数更低' },
      ],
      answer: 1,
      explain: { en: '20 dBm against −14 dBm is 34 dB before anything else; then −14 dBm spread over 499.2 MHz puts only 80 of those into the Wi-Fi channel. The laws differ too, but over 3 m they come to nearly the same number.', zh: '20 dBm 对 −14 dBm，一上来就是 34 dB；接着 −14 dBm 摊在 499.2 MHz 上，只有其中 80 MHz 落进 Wi-Fi 信道。两条路径损耗定律也不同，但在 3 m 上算出来几乎一样。' },
    },
    {
      q: { en: 'A UWB frame raises the router’s noise floor by up to 8.12 dB. Why does no UWB frame in this room ever make CCA call the channel busy?', zh: '一个 UWB 帧最多能把路由器的噪声底抬高 8.12 dB。为什么这个房间里没有哪个 UWB 帧会让 CCA 报信道忙？' },
      options: [
        { en: 'Foreign energy is excluded from the energy-detect sum', zh: '外来能量被排除在能量检测的求和之外' },
        { en: '−80.57 dBm is 18.57 dB below the −62 dBm threshold, and a foreign signal is never a detectable preamble', zh: '−80.57 dBm 比 −62 dBm 的门限还低 18.57 dB，而外来信号永远不会被当作可检测的前导' },
        { en: 'The session is on the air for only 48.6 ms of the five seconds, below the averaging window', zh: '会话在这五秒里只发射了 48.6 ms，低于平均窗口' },
      ],
      answer: 1,
      explain: { en: 'The energy-detect sum does include it — it is simply too small, by 18.57 dB at the nearest Wi-Fi radio in this room, the router 3.14 m from the tag. Come within about 40 cm of a UWB transmitter and it would trip. Otherwise only the demodulator meets the session, and there 8.12 dB of noise rise still leaves 26 dB of SINR.', zh: '能量检测的求和其实是把它算进去的——只是太小：在本房间里最近的那台 Wi-Fi 收发机处，也就是离标签 3.14 m 的路由器，还差 18.57 dB。凑到 UWB 发射机约 40 cm 以内，它就会被触发。否则只有解调器会碰上这个会话，而那里 8.12 dB 的噪声抬升之后仍剩约 26 dB 的信干噪比。' },
    },
    {
      q: { en: 'The backup costs the session 8 of its 100 ranges but not one of its 25 fixes. What absorbed the loss?', zh: '后台备份让会话在 100 次测距里丢了 8 次，却没丢掉 25 次定位中的任何一次。是什么吸收了这笔损失？' },
      options: [
        { en: 'The tag repeats the lost range inside the same block', zh: '标签在同一个块内重发了丢失的那次测距' },
        { en: 'Three ranges still solve two unknowns: the fix is made on three anchors and GDOP rises from 1.05 to 1.26', zh: '三个距离仍能解出两个未知数：定位改用三个锚点，GDOP 从 1.05 升到 1.26' },
        { en: 'The solver weights the interfered range down through its FoM byte', zh: '解算器通过 FoM 字节把受干扰的那次测距降权了' },
      ],
      answer: 1,
      explain: { en: 'The slot times out 1.8 ms after the loss and the block goes on without it. Eight of the 25 fixes are three-anchor fixes, their error inside 4.2 cm — the spare anchor doing exactly the job lesson 5 priced.', zh: '丢失之后 1.8 ms 该时隙超时，这个块就少一个锚点继续下去。二十五次定位里有八次是三锚点定位，误差仍在 4.2 cm 以内——那个备用锚点干的正是第 5 课替它标好价的活。' },
    },
  ],
}
