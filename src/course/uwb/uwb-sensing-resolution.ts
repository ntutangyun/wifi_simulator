/**
 * UWB Tier 2 · M20 · Sensing · The one the slice exists for.
 *
 * Resolution, turned from an adjective into a length a reader can measure: two
 * arrivals are two arrivals only when the later one is more than 1/B behind the
 * earlier, and 1/B for the HRP UWB PHY is one chip — 2.003205 ns, about 0.60 m
 * of extra path (design §4).
 *
 * **The measured pair is the lesson.** One anchor, one tag, two metres apart,
 * and two wardrobe-sized objects between them. The one 0.2 m off the line adds
 * 0.04 m of extra path against the 0.60 m needed, so the receiver cannot tell
 * its echo from the direct ray — and it is the **louder** of the two echoes, at
 * −65.8 dBm against −71.5 dBm, because both of its legs are short. The one 1 m
 * off adds 0.83 m and is a separate arrival, 5.7 dB quieter for the privilege.
 * A reader who thinks "invisible" means "faint" has the causality backwards, and
 * both records are in the same log, one line apart, to prove it.
 *
 * The two variants walk the near object out to 0.8 m (0.56 m of excess, still
 * merged) and then to 0.9 m (0.69 m, separable), so the verdict flips in front
 * of the reader over ten centimetres of floor. The exact turning point is
 * `ECHO_FLIP_OFFSET_M`, the condition inverted rather than searched for.
 *
 * Every figure comes from `src/ui/echoFacts.ts`, computed the way `UwbChannel`
 * computes an arrival; tests/course/uwb-sensing-resolution.test.ts pins each one
 * against the run that produces it.
 */
import type { Scenario } from '../../model/scenario'
import type { ScattererCfg } from '../../engine/scatter'
import type { TimingSpec } from '../diagram'
import { UWB_CHIP_NS } from '../../uwb/phy'
import {
  DIRECT_2M, ECHO_FLIP_OFFSET_M, ECHO_FLIP_OVER, ECHO_FLIP_UNDER,
  ECHO_IDEAL_10M_UNDER_FLOOR_DB, ECHO_NEAR_LINE, ECHO_OFF_LINE, ECHO_RESOLUTION_M,
  SCATTERER_DEFAULT_DB,
} from '../../ui/echoFacts'
import {
  J, anchor, firstUwbEcho, firstUwbEchoMerged, firstUwbEchoResolved, firstUwbRange,
  oneRoom, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'
import { PAIR_SPAN_M, PAIR_X, PAIR_Y, PAIR_Z, sensingObject } from './uwb-sensing'

/** Where the near object stands: the measured pair, or one step either side of the turn. */
export type UwbResolutionVariant = 'pair' | 'under' | 'over'

/**
 * The same two-metre pair the previous lesson used, and the objects between them.
 *
 * `pair` is the measured pair the whole lesson turns on — 0.2 m and 1 m off the
 * line at once, so the two records land in one log a few nanoseconds apart and
 * the reader compares them without reloading anything. The two other scenes hold
 * **one** object, the one being walked outwards, because at 0.8 and 0.9 m it
 * would otherwise be standing inside its own reference.
 */
export function uwbResolutionScenario(variant: UwbResolutionVariant = 'pair'): Scenario {
  const list: ScattererCfg[] =
    variant === 'pair' ? [sensingObject('poster', 0.2), sensingObject('wardrobe', 1)]
      : variant === 'under' ? [sensingObject('poster', 0.8)]
        : [sensingObject('poster', 0.9)]
  return uwbSc(
    oneRoom(),
    [
      anchor('anc-1', 'Anchor', PAIR_X, PAIR_Y, PAIR_Z),
      uwbTag('tag-1', 'Badge', PAIR_X + PAIR_SPAN_M, PAIR_Y, PAIR_Z),
    ],
    { method: 'ds', mode: 'twr', channel: 9, nlos: false },
    { scatterers: list },
  )
}

/** One chip, in nanoseconds: the width of a correlation peak, and the whole of the threshold. */
const CHIP_NS = UWB_CHIP_NS.toFixed(2)

/**
 * The three arrivals of one transmission, each drawn one chip wide — which is
 * what a correlation peak is. The picture is then the rule: two peaks are two
 * peaks only if the second one starts after the first one ends.
 */
function threePeaks(): TimingSpec {
  const peak = (fromNs: string) => ({ fromUs: Number(fromNs), toUs: Number(fromNs) + UWB_CHIP_NS })
  return {
    kind: 'timing',
    lanes: [
      { label: '直达路径', spans: [{ ...peak(DIRECT_2M.propNs), label: `${DIRECT_2M.pathM} m`, tone: 'accent' }] },
      { label: `距连线 ${ECHO_NEAR_LINE.offM} m 的回波`, spans: [{ ...peak(ECHO_NEAR_LINE.propNs), label: `${ECHO_NEAR_LINE.pathM} m` }] },
      { label: `衣柜 ${ECHO_OFF_LINE.offM} m 的回波`, spans: [{ ...peak(ECHO_OFF_LINE.propNs), label: `${ECHO_OFF_LINE.pathM} m` }] },
    ],
    axis: { fromUs: 6, toUs: 12.5, ticks: [6, 8, 10, 12], unit: 'ns' },
  }
}

export const uwbSensingResolution: Lesson = {
  id: 'uwb-sensing-resolution',
  module: 27,
  title: '紧靠连线的人无法被察觉',
  why: '上一课那个衣柜离连线较远，它的回波比直达路径多经过的路程，在记录中写得很清楚。把一个完全相同的物体移到紧靠连线的位置，它成为房间里电平最高的回波，比直达路径还强——而同一台接收机却报告它不可分辨。原因在于接收机如何识别一个到达：它把收到的波形与已知的序列做相关运算，在相关的位置形成一个相关峰（correlation peak），峰宽约为带宽的倒数，在这里就是一个码片（chip），折合路程半米多。回波比直达路径多经过的路程超过这个长度，就形成两个峰，可以分辨；否则两个峰合并成一个，位于先到达的直达路径处。所以分辨率（resolution）是一个长度，判决只取决于额外路程，与电平毫无关系：紧靠连线的物体电平高，是因为它两段路径都短，而它不可分辨，也正是因为路径短、额外路程太小。在两米长的连线上，物体要偏离连线大半米才可分辨，在翻转点附近只移动十厘米，判决就会改变；连线越长，连线附近的这块盲区越宽。要察觉站在连线上的人，只能增大带宽、移动设备，或者从另一个方向再增加一台设备。',
  outcomes: [
    '算出这台接收机分辨一个回波所需的额外路程，并说明这个长度的来源',
    '读取同一次发送产生的两条记录，指出电平更高的那一条为什么反而不可分辨',
    '把物体逐步向外移动，找到判决翻转的位置',
  ],
  needs: ['uwb-sensing', 'uwb-frame'],
  terms: [
    { term: 'resolution', plain: '分辨率：两个到达至少相差多少，这台接收机才能把它们识别为两个到达' },
    { term: 'correlation peak', plain: '相关峰：接收机把收到的波形与已知序列做相关运算时，在相关位置出现的峰值' },
    { term: 'chip', plain: '码片：扩频序列中的一个单元；它的宽度决定了相关峰的宽度' },
  ],
  picture: [
    { heading: '接收机依据什么判定「这是两个到达」', text: `接收机并没有一份列出各个「到达」的清单。它把收到的波形与自己已知的序列做相关运算，在相关的时刻形成一个峰，称为相关峰（correlation peak）。峰并不是无限窄的：它的宽度由带宽决定，大约是 1/B。两个到达如果相差远大于这个宽度，就是两个可以分辨的峰；如果相差远小于它，两个峰叠加在一起，看上去只有一个——而且这个峰的位置就在先到达的那个上。` },
    { heading: '因此分辨率是一个长度', text: `高速率脉冲重复（HRP）超宽带（ultra-wideband, UWB）物理层（physical layer, PHY）的 B 是 499.2 Mchip/s，1/B 就是一个码片（chip），${CHIP_NS} 纳秒。乘以光速，折合路程约 ${ECHO_RESOLUTION_M} 米。所以「可分辨」这一条件可以写成一行算术：回波比直达路径多经过的路程，要大于 ${ECHO_RESOLUTION_M} 米。分辨率不是一个定性的描述，它就是 c/B 这个长度——把同一行算术代入一部只有几兆赫兹带宽的无线电设备，这个长度会变成上百米，那么房间里任何物体都无法分辨。` },
    { kind: 'watch', jump: 1, heading: '查看那条不可分辨的记录', text: `载入本课场景，跳到第一条不可分辨的回波。它的额外路程为 ${ECHO_NEAR_LINE.excessM} 米，而门限是 ${ECHO_RESOLUTION_M} 米——判决所依据的两个长度都在同一行中给出，所以这项计算可以自行验证，无需凭信任接受。` },
    {
      kind: 'diagram', heading: '三个到达，两个峰',
      spec: threePeaks(),
      caption: `每个到达在接收机中是一个约 ${CHIP_NS} 纳秒宽的峰。第二个几乎完全与第一个叠合，于是只能看到一个；第三个完全位于后方，于是可以看到两个。`,
    },
    { heading: '电平更高的那个反而不可分辨', text: `本课场景中两个物体大小相同、反射强度相同，同一次发送产生两条记录。离连线 ${ECHO_OFF_LINE.offM} 米的那个额外路程为 ${ECHO_OFF_LINE.excessM} 米，可分辨，电平 ${ECHO_OFF_LINE.dbm} dBm；离连线 ${ECHO_NEAR_LINE.offM} 米的那个额外路程只有 ${ECHO_NEAR_LINE.excessM} 米，不可分辨，电平却有 ${ECHO_NEAR_LINE.dbm} dBm——它是两者中电平更高的那一个，因为它两段路径都更短。请记住：它无法被察觉，不是因为它弱；恰恰相反，它的电平最高。它无法被察觉，完全是因为它不可分辨。` },
    { heading: '所以最难被察觉的位置，就是两台设备之间的连线', text: '这不是本仿真器的简化，真实设备面临同样的问题。一个人站在两台设备的连线上，经他反射的路径几乎与直线一样长，回波并入直达路径，从记录上看就等于不存在。要察觉他，只有三种办法：增大带宽（门限变短）、移动设备使他偏离连线，或者再增加一台设备从另一个方向观测同一个房间。' },
  ],
  numbers: [
    {
      kind: 'formula', heading: '判决式',
      text: '(|发→物| + |物→收|) − |发→收|  >  c × 1/B',
      note: `左边是回波的额外路程，右边是这台接收机的分辨率；1/B 在这里是一个码片，c × 1/B = ${ECHO_RESOLUTION_M} 米。反解一次：在 2 米的连线上，物体要位于离连线 ${ECHO_FLIP_OFFSET_M} 米以外，回波才可分辨。`,
    },
    {
      kind: 'table', heading: '同一个物体，四个位置', head: [
        '离连线距离', '双站距离', '额外路程', `与 ${ECHO_RESOLUTION_M} m 门限比较`, '电平',
      ], rows: [
        [`${ECHO_NEAR_LINE.offM} m`, `${ECHO_NEAR_LINE.pathM} m`, `${ECHO_NEAR_LINE.excessM} m`, '不可分辨', `${ECHO_NEAR_LINE.dbm} dBm`],
        [`${ECHO_FLIP_UNDER.offM} m`, `${ECHO_FLIP_UNDER.pathM} m`, `${ECHO_FLIP_UNDER.excessM} m`, '不可分辨', `${ECHO_FLIP_UNDER.dbm} dBm`],
        [`${ECHO_FLIP_OVER.offM} m`, `${ECHO_FLIP_OVER.pathM} m`, `${ECHO_FLIP_OVER.excessM} m`, '可分辨', `${ECHO_FLIP_OVER.dbm} dBm`],
        [`${ECHO_OFF_LINE.offM} m`, `${ECHO_OFF_LINE.pathM} m`, `${ECHO_OFF_LINE.excessM} m`, '可分辨', `${ECHO_OFF_LINE.dbm} dBm`],
      ],
    },
    { text: `这张表应横向阅读。判决在第二行与第三行之间翻转，而物体只移动了 10 厘米；电平那一列则自始至终单调下降——越往外，两段路径越长。不要混淆两个 ${ECHO_FLIP_OFFSET_M}：一个是「物体离连线距离」的翻转位置，另一个是最后一行中「回波的额外路程」，它们恰好是同一个数字，却是两回事。` },
    {
      kind: 'steps', heading: '一条回波的判决是怎么下的', items: [
        '两段路程之和就是双站距离；再减去收发之间的直线距离，得到额外路程。',
        '1/B 由这一帧所用的物理层决定：超宽带帧取一个码片，旁边那部窄带（narrowband, NB）设备取它自身信道宽度的倒数——同一个物体，两种无线电设备，判决可以完全相反。',
        '把额外时延与 1/B 比较一次：本课取严格大于时判为两个到达，否则判为并入直达路径。',
        '两边的长度都写入记录：额外路程是多少米，以及这台接收机需要多少米。所以读者看到的是比较过程本身，而不只是结论。',
        '无论判决结果如何，测距都不受影响——它锁定的是先到达的那个峰，之后的到达都与它无关。',
      ],
    },
    { text: `还需注意：判决与电平是彼此独立的两件事。这四行中电平最高的是额外路程最小、最不可分辨的那一行，而额外路程最大的那一行电平最低。与「弱」有关的限制另有一条——${SCATTERER_DEFAULT_DB} dB 的物体在两米的连线上电平充裕，而换成一平方米的理想反射面放到十米连线的中点，就比灵敏度（sensitivity）还低 ${ECHO_IDEAL_10M_UNDER_FLOOR_DB} dB，那才是真正的「太弱」。` },
  ],
  deeper: [
    { heading: '为什么峰宽就是 1/B', text: '一段带宽为 B 的信号，它的自相关函数主瓣宽度大约是 1/B——这是傅里叶变换的直接结果，时域越窄，所需的频域越宽，反之亦然。所以「分辨率 = c/B」不是某个接收机的实现细节，而是任何用相关来确定到达时刻的接收机都无法回避的限制。499.2 Mchip/s 之所以是 4z 测距的基础，正是因为它把这个长度缩小到半米量级；蓝牙、Wi-Fi 的相位测距达不到厘米级，根本原因也在这同一个式子上。' },
    { heading: '翻转点是解析求出的，而不是搜索得到的', text: `2·√((s/2)² + d²) − s = c × 1/B，其中 s 是两台设备的间距、d 是物体离连线的垂直距离。对 d 求解即得到 ${ECHO_FLIP_OFFSET_M} 米（s = 2 米时）。注意它随 s 变化：连线越长，同一个门限要求物体偏离得越多——十米的连线上，物体要偏离将近一米八才可分辨。所以「紧靠连线无法分辨」这块盲区的大小不是固定的，它随两台设备间距增大而变宽。` },
    { heading: '真实接收机没有这样的硬门限', text: '本课给出的是一个是或否的判决：大于门限就是两个到达，否则就是一个。真实的相关峰是连续合并的——相差 0.9 个码片时仍能看出是双峰，只是位置有偏差；相差 0.3 个码片时它就是一个被展宽、发生偏移的峰，而这个偏差正是测距误差的主要来源之一。所以表中 0.56 米与 0.69 米之间并不存在截然的分界，真实设备在这一范围内「越来越难分辨，而且偏差越来越大」。' },
  ],
  sources: [
    '门限的唯一标准依据是码片速率：IEEE Std 802.15.4-2024 §16.2.4 给出 HRP 超宽带物理层的 499.2 Mchip/s，一个码片 2.003205 ns。乘以光速得到的 0.60 米是几何，不是标准正文里的数。',
    '「相关峰宽约 1/B」是信号处理的常识，不是 802.15.4 的规定；标准正文并没有说接收机必须用相关，也没有规定它的分辨能力。把这一点写成是或否的判决是本课的取舍，「真实接收机没有这样的硬门限」一节说明了真实设备与它的差别。',
    '窄带那一句只是替换了同一个式子中的 B，本课不引用任何具体的窄带参数。',
    '表里的四行都由双站几何与两段路径损耗算出，与运行时日志里的记录一致；场景本身是两米的连线加上反射强度为模型取值的物体。',
  ],
  limits: [
    {
      kind: 'threshold',
      text: '「可分辨」在这里是一条硬门限，在真实世界中是一个渐变过程。本课只比较一次大小就给出是或否；真实的相关峰是连续合并的，0.56 米与 0.69 米之间并不存在截然的分界，而是越来越难分辨、并且位置偏差越来越大。所以表中那一次翻转是模型的翻转，而不是物理的翻转。',
    },
    {
      kind: 'out-of-scope',
      text: '「不可分辨」不等于「无法处理」。真实系统会依靠多台设备从不同方向观测同一个房间、依靠前后多次测量、依靠更宽的带宽，把并入的到达分离出来。本课只对单次到达给出一个判决，这三种办法都没有计入，所以这里的「无法察觉」仅限于这一次测量、这一对设备。',
    },
    {
      kind: 'out-of-scope',
      text: `回波的作用距离很短。${SCATTERER_DEFAULT_DB} dB 的衣柜级物体在两米的连线上才能被接收；一面理想的一平方米反射面放到十米连线的中点，比接收灵敏度还低 ${ECHO_IDEAL_10M_UNDER_FLOOR_DB} dB，接收端根本收不到它。所以本课的场景只有两米宽——场景小是由物理决定的，而不是为了使判决结果好看。`,
    },
    {
      kind: 'threshold',
      text: '记录中永远不会出现「有回波，但太弱」这一类。本课对回波使用的是直达路径本身的灵敏度门限，没有另设感知专用的噪声地板，另设一个就需要自行确定一个没有依据的数值。所以低于门限的回波在日志中不留下任何记录——而这与「不可分辨」一样，都没有给出第二个目标。本课能够区分这两种「无法察觉」，是因为场景是读者自己布置的。',
    },
    {
      kind: 'unmodelled',
      text: '墙不是散射体，所以本课的房间四面是砖墙，却只有场景中放置的那两个物体会产生回波。墙仍然只对直达路径附加固定的时延与损耗。真实房间里墙面本身就是最大的反射体之一，要对它建模需要镜像法与可见性判断，那是另一个课题。',
    },
    {
      kind: 'out-of-scope',
      text: '物体静止，也没有多普勒。所以这一课给出的是「测出一个静止被动物体的双站距离」，而不是依靠前后两帧相减发现「有人经过」。真实的存在检测通常根本不需要分辨回波——它比较的是前后两帧的差别，而本仿真器中不存在「前后两帧不同」的情况。',
    },
    {
      kind: 'model-value',
      text: '物体的反射强度是场景设定的一个 dB 数，本课不使用以平方米计的雷达截面。所以表中那一列电平是「这个场景声明的物体」的电平；换一个反射强度，四行电平一起平移，而四行的判决都不会改变——判决只取决于几何。这正是本课希望读者记住的：电平强弱与能否分辨，是彼此独立的两件事。',
    },
    {
      kind: 'unmodelled',
      text: `同一套几何关系、同一个判决式，只需更换路径损耗模型，在 Wi-Fi 上也能算出一个「可分辨」，但这个布尔值在 Wi-Fi 一侧不决定任何事：1/B 是感知的门限——可分辨才有第二个目标——而一帧能否解调的门限是保护间隔，它在本课程的 Wi-Fi 一侧甚至不是一个独立的数，每一代的符号时长是一个固定值。所以本课这个判决式是一个感知原语，不是一个多径原语，${ECHO_RESOLUTION_M} 米也是感知的长度。Wi-Fi 那边的课程也没有说「没有建模多径」：那里写的是「仍然没有的是时延扩展本身与多普勒」，而频率选择性在 Wi-Fi 那一部分已经是完整的一课。`,
    },
  ],
  scenario: () => uwbResolutionScenario('pair'),
  variants: [
    { label: `只留贴线那个：${ECHO_FLIP_UNDER.offM} 米`, scenario: () => uwbResolutionScenario('under') },
    { label: `再往外 10 厘米：${ECHO_FLIP_OVER.offM} 米`, scenario: () => uwbResolutionScenario('over') },
  ],
  jumps: [
    J('第一条回波', firstUwbEcho),
    J('不可分辨的那一条', firstUwbEchoMerged),
    J('可分辨的那一条', firstUwbEchoResolved),
    J('这一轮算出的距离', firstUwbRange),
  ],
  observe: [
    '每一次发送之后有两条回波记录，相差三纳秒：前一条来自紧靠连线的物体，判定为不可分辨，电平更高；后一条来自远处的衣柜，判定为可分辨，电平更低。两行相邻，便于直接对比。',
    '再查看测距那几行：距离、真值、时刻，与房间里没有任何物体时完全相同。无论判决是否可分辨，对测距都没有任何影响。',
  ],
  tryThis: [
    `依次载入两个变体：${ECHO_FLIP_UNDER.offM} 米时记录仍判定为不可分辨，额外路程 ${ECHO_FLIP_UNDER.excessM} 米；${ECHO_FLIP_OVER.offM} 米时就翻转为可分辨，额外路程 ${ECHO_FLIP_OVER.excessM} 米。物体只移动了 10 厘米，判决却随之改变。`,
    `打开编辑模式，用 🪞 把紧靠连线的那个物体沿垂直于连线的方向逐格向外拖动，每拖动一格运行一遍，自行找出判决翻转的那一格；再把两台设备拉开到四米远，重做一次——翻转位置会向外移动，因为 ${ECHO_FLIP_OFFSET_M} 米这个数随连线长度变化。`,
  ],
  quiz: [
    {
      q: '两个大小相同的物体，紧靠连线的那个回波电平更高，却被判定为不可分辨。为什么？',
      options: [
        '电平高的信号更容易使接收机饱和',
        '它的额外路程只有几厘米，远小于一个码片折合的长度，两个峰叠加在一起',
        '紧靠连线的位置反射角不佳，相位发生紊乱',
      ],
      answer: 1,
      explain: '判决只取决于额外路程，与电平毫无关系。它电平高，恰恰是因为它两段路径都短。',
    },
    {
      q: '把接收机的带宽增大到十倍，这个门限会怎样变化？',
      options: [
        '不变，门限由码片序列的长度决定',
        '缩短到十分之一：门限就是 c/B，带宽越大分辨率越高',
        '变长，因为带宽增大后噪声也增大',
      ],
      answer: 1,
      explain: '这正是超宽带能做厘米级测距的原因，也是窄带设备在房间里无法分辨任何物体的原因。',
    },
    {
      q: '在两米的连线上，物体要位于离连线多远处，回波才可分辨？',
      options: [
        '只要不在连线上即可',
        `约 ${ECHO_FLIP_OFFSET_M} 米——把判决式对垂直距离反解即可得到，而且这个数随连线变长而增大`,
        '半个码片，也就是约 0.30 米',
      ],
      answer: 1,
      explain: '所以「紧靠连线无法分辨」这块盲区的大小不是固定的：两台设备间距越大，它越宽。',
    },
  ],
}
