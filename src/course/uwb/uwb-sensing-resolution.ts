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
      { label: `贴线 ${ECHO_NEAR_LINE.offM} m 的回波`, spans: [{ ...peak(ECHO_NEAR_LINE.propNs), label: `${ECHO_NEAR_LINE.pathM} m` }] },
      { label: `衣柜 ${ECHO_OFF_LINE.offM} m 的回波`, spans: [{ ...peak(ECHO_OFF_LINE.propNs), label: `${ECHO_OFF_LINE.pathM} m` }] },
    ],
    axis: { fromUs: 6, toUs: 12.5, ticks: [6, 8, 10, 12], unit: 'ns' },
  }
}

export const uwbSensingResolution: Lesson = {
  id: 'uwb-sensing-resolution',
  module: 24,
  title: '贴着连线站的人看不见',
  why: `上一课那个衣柜离连线 1 米，它的回波比直达路径多走 ${ECHO_OFF_LINE.excessM} 米，记录里写得明明白白。现在把一个一模一样的物体摆到离连线 ${ECHO_NEAR_LINE.offM} 米：它成了房间里电平最高的回波，比直达路径还高出几个分贝——可同一台接收机报告说，它分不开。这一课讲的就是这条门槛：它从哪里来，怎么算，以及为什么一个东西「看不见」往往跟它强不强毫无关系。`,
  outcomes: [
    '算出这台接收机要多走多少路才分得开一个回波，并说出这个长度从哪来',
    '读同一次发送留下的两条记录，指出更响的那一条为什么反而看不见',
    '把物体一点一点挪出去，找到判决翻转的那个位置',
  ],
  needs: ['uwb-sensing', 'uwb-frame'],
  terms: [
    { term: 'resolution', plain: '分辨率：两个到达要相差多少，这台接收机才认得出它们是两个' },
    { term: 'correlation peak', plain: '相关峰：接收机把收到的波形与它已知的序列比对，对上的地方鼓起来的那个包' },
    { term: 'chip', plain: '码片：扩频序列里的一格；它的宽度决定了那个包有多宽' },
  ],
  picture: [
    { heading: '接收机凭什么说「这是两个到达」', text: `接收机手里并没有一张写着「到达」的清单。它拿收到的波形去和自己已知的那串序列比对，对得上的时刻就鼓起一个包，这个包叫相关峰（correlation peak）。包不是无限细的：它的宽度由带宽定，大约是 1/B。两个到达如果相差远大于这个宽度，就是两个分得开的包；如果相差远小于它，两个包叠在一起，看上去只有一个——而且这一个的位置就落在先到的那个上。` },
    { heading: '于是分辨率是一个长度', text: `高速率脉冲重复（HRP）超宽带（ultra-wideband, UWB）物理层（physical layer, PHY）的 B 是 499.2 Mchip/s，1/B 就是一个码片（chip），${CHIP_NS} 纳秒。乘以光速，折成路程约 ${ECHO_RESOLUTION_M} 米。所以「分得开」这件事可以写成一行算术：回波比直达路径多走的路，要大于 ${ECHO_RESOLUTION_M} 米。分辨率不是一个形容词，它就是 c/B 这个长度——把同一行算术代到一部只有几兆赫兹带宽的电台上，这个长度会变成上百米，那房间里任何物体都分不开。` },
    { kind: 'watch', jump: 1, heading: '看那条分不开的记录', text: `载入本课场景，跳到第一条分不开的回波。它多走了 ${ECHO_NEAR_LINE.excessM} 米，而门槛是 ${ECHO_RESOLUTION_M} 米——判决所依据的两个长度都印在同一行里，所以这道算术你自己就能验，不必信它。` },
    {
      kind: 'diagram', heading: '三个到达，两个包',
      spec: threePeaks(),
      caption: `每个到达在接收机里是一个约 ${CHIP_NS} 纳秒宽的包。第二个几乎整个压在第一个上，于是只看得见一个；第三个整条落在后面，于是是两个。`,
    },
    { heading: '更响的那个反而看不见', text: `本课场景里两个物体一样大、一样反射，同一次发送留下两条记录。离连线 ${ECHO_OFF_LINE.offM} 米的那个多走 ${ECHO_OFF_LINE.excessM} 米，分得开，电平 ${ECHO_OFF_LINE.dbm} dBm；离连线 ${ECHO_NEAR_LINE.offM} 米的那个只多走 ${ECHO_NEAR_LINE.excessM} 米，分不开，电平却有 ${ECHO_NEAR_LINE.dbm} dBm——它是两者中电平更高的那一个，因为它两段路径都更短。把这句话记住：它看不见，不是因为它弱；恰恰相反，它是最响的那个。它看不见，纯粹是因为它分不开。` },
    { heading: '所以最难被察觉的位置，就是两台设备之间那条线', text: '这不是本仿真器的简化，真实设备面对的是同一件事。一个人站在两台设备的连线上，他绕出来的那条路几乎和直线一样长，回波并进直达路径，从记录上看就等于不存在。想察觉他，只有三条路：把带宽做大（门槛变短）、把设备挪开让他偏离连线、或者再加一台设备从另一个方向看同一个房间。' },
  ],
  numbers: [
    {
      kind: 'formula', heading: '判决就是这一行',
      text: '(|发→物| + |物→收|) − |发→收|  >  c × 1/B',
      note: `左边是回波多走的路，右边是这台接收机的分辨率；1/B 在这里是一个码片，c × 1/B = ${ECHO_RESOLUTION_M} 米。反过来解一次：在 2 米的连线上，物体要站到离连线 ${ECHO_FLIP_OFFSET_M} 米开外，回波才分得开。`,
    },
    {
      kind: 'table', heading: '同一个物体，四个站位', head: [
        '离连线多远', '双站距离', '多走了', `对 ${ECHO_RESOLUTION_M} m 的门槛`, '电平',
      ], rows: [
        [`${ECHO_NEAR_LINE.offM} m`, `${ECHO_NEAR_LINE.pathM} m`, `${ECHO_NEAR_LINE.excessM} m`, '分不开', `${ECHO_NEAR_LINE.dbm} dBm`],
        [`${ECHO_FLIP_UNDER.offM} m`, `${ECHO_FLIP_UNDER.pathM} m`, `${ECHO_FLIP_UNDER.excessM} m`, '分不开', `${ECHO_FLIP_UNDER.dbm} dBm`],
        [`${ECHO_FLIP_OVER.offM} m`, `${ECHO_FLIP_OVER.pathM} m`, `${ECHO_FLIP_OVER.excessM} m`, '分得开', `${ECHO_FLIP_OVER.dbm} dBm`],
        [`${ECHO_OFF_LINE.offM} m`, `${ECHO_OFF_LINE.pathM} m`, `${ECHO_OFF_LINE.excessM} m`, '分得开', `${ECHO_OFF_LINE.dbm} dBm`],
      ],
    },
    { text: `这张表要横着读。判决在第二行与第三行之间翻转，而物体只挪了 10 厘米；电平那一列则从头到尾单调地降——越往外，两段路径越长。别把两个 ${ECHO_FLIP_OFFSET_M} 混了：一个是「物体离连线多远」的翻转位置，另一个是最后一行里「回波多走了多远」，它们恰好是同一个数字，却是两件事。` },
    {
      kind: 'steps', heading: '一条回波的判决是怎么下的', items: [
        '按场景坐标算两段路程之和，也就是双站距离；再减去发收之间那条直线，得到多走的路。',
        '按这一帧所在的物理层取 1/B：超宽带帧取一个码片，旁边那部窄带（narrowband, NB）电台取它自己的信道宽度的倒数——同一个物体，两种电台，判决可以完全相反。',
        '把多走的时间和 1/B 比一次：严格大于就是两个到达，否则并进直达路径。',
        '两边的长度都写进记录：多走了多少米，以及这台接收机需要多少米。所以读者看到的是比较本身，不只是结论。',
        '无论判决是什么，测距那一路都不受影响——它锁的是先到的那个包，后面有什么都与它无关。',
      ],
    },
    { text: `再提醒一件事：判决与电平是两件独立的事。这四行里最响的是最分不开的那一行，而最分得开的那一行最弱。所有跟「弱」有关的限制另有一条——${SCATTERER_DEFAULT_DB} dB 的物体在两米的连线上绰绰有余，换成一平方米的理想反射面放到十米连线的中点，就比灵敏度（sensitivity）还低 ${ECHO_IDEAL_10M_UNDER_FLOOR_DB} dB，那才是真正的「太弱了」。` },
  ],
  deeper: [
    { heading: '为什么峰宽就是 1/B', text: '一段带宽为 B 的信号，它的自相关函数主瓣宽度大约是 1/B——这是傅里叶变换的直接后果，时域越窄要的频域越宽，反过来也一样。所以「分辨率 = c/B」不是某个接收机的实现细节，而是任何用相关来定位到达时刻的接收机都绕不过去的。499.2 Mchip/s 之所以是 4z 测距的基础，正是因为它把这个长度压到了半米量级；蓝牙、Wi-Fi 的相位测距做不到厘米级，根子也在同一行式子上。' },
    { heading: '翻转点是解出来的，不是搜出来的', text: `2·√((s/2)² + d²) − s = c × 1/B，其中 s 是两台设备的间距、d 是物体离连线的垂直距离。对 d 解一次就得到 ${ECHO_FLIP_OFFSET_M} 米（s = 2 米时）。注意它跟着 s 走：连线越长，同一个门槛要求物体偏得越多——十米的连线上，物体要偏出将近一米八才分得开。所以「贴着连线看不见」这块盲区不是固定大小的，它随两台设备拉开而变宽。` },
    { heading: '真实接收机没有这条硬门槛', text: '本仿真器给的是一个布尔值：大于门槛就是两个到达，否则就是一个。真实的相关峰是连续地并拢的——差 0.9 个码片时两个峰还能看出是个双峰、只是位置有偏；差 0.3 个码片时它就是一个被拉宽、拉偏的峰，而这个偏差正好是测距误差的主要来源之一。所以表里 0.56 米与 0.69 米之间并没有一道墙，真实设备在那一带是「越来越难、而且越来越偏」。' },
  ],
  sources: [
    '门槛的唯一标准依据是码片速率：IEEE Std 802.15.4-2024 §16.2.4 给出 HRP 超宽带物理层的 499.2 Mchip/s，一个码片 2.003205 ns。乘以光速得到的 0.60 米是几何，不是标准正文里的数。',
    '「相关峰宽约 1/B」是信号处理的常识，不是 802.15.4 的规定；标准正文并没有说接收机必须用相关，也没有规定它分得开多少。把这条写成一个布尔判决是本仿真器的取舍，deeper 里说明了真实设备与它的差别。',
    '窄带那一句只是把同一条式子里的 B 换掉，本课不引用任何具体的窄带参数。',
    '表里的四行都由 src/engine/scatter.ts 的几何与 UwbChannel 的电平算出，与运行时写进记录的是同一段代码；场景本身是两米的连线加上反射强度为模型取值的物体。',
  ],
  limits: [
    {
      kind: 'threshold',
      text: '「分得开」在这里是一条硬门槛，真实世界里是一段渐变。本仿真器比一次大小就给出一个布尔值；真实的相关峰是连续并拢的，0.56 米与 0.69 米之间没有一道墙，而是越来越难分、并且位置越来越偏。所以表里那一次翻转是模型的翻转，不是物理的翻转。',
    },
    {
      kind: 'out-of-scope',
      text: '「分不开」不等于「拿它没办法」。真实系统会靠多台设备从不同方向看同一个房间、靠前后多次测量、靠更宽的带宽把并进去的到达分离出来。本仿真器只对单次到达报一个判决，这三条路一条也没建模，所以这里的「看不见」是这一次、这一对设备的看不见。',
    },
    {
      kind: 'out-of-scope',
      text: `回波的作用距离很短。${SCATTERER_DEFAULT_DB} dB 的衣柜级物体在两米的连线上才听得见；一面理想的一平方米反射面放到十米连线的中点，比接收灵敏度还低 ${ECHO_IDEAL_10M_UNDER_FLOOR_DB} dB，根本不会被交到接收端手里。所以本课的场景只有两米宽——场景小是因为物理如此，不是为了让判决好看。`,
    },
    {
      kind: 'threshold',
      text: '记录里永远不会有「有个回波，但太弱了」这一类。介质（medium）对回波用的是直达路径自己那一道灵敏度门限，这个引擎没有单独的感知噪声地板，去发明一个就是发明一个数字。所以过不了门限的回波是沉默——而沉默和「分不开」在日志上长得一模一样，都是什么也没有。这两种「看不见」本课区分得开，是因为场景是你自己摆的。',
    },
    {
      kind: 'unmodelled',
      text: '墙不是散射体，所以本课的房间四面是砖墙，却只有你摆的那两个物体会产生回波。墙仍然只对直达路径加固定的时延与损耗。真实房间里墙面本身就是最大的反射体之一，把它建进来需要镜像法与可见性判断，那是另一件事。',
    },
    {
      kind: 'out-of-scope',
      text: '物体不动，也没有多普勒。所以这一课给的是「对一个静止的被动物体量出一个双站距离」，不是靠前后两帧相减发现「有人走过」。真实的存在检测多半根本不需要分得开——它比较的是前后两帧的差别，而这个仿真器里没有「前后两帧不一样」这回事。',
    },
    {
      kind: 'model-value',
      text: '物体反射多强是场景写的一个 dB 数，代码里没有以平方米计的雷达截面。所以表里那一列电平是「这个场景声明的物体」的电平；换一个反射强度，四行一起平移，而四行的判决一个都不会变——判决只看几何。这一条正是本课想让人记住的：强弱与分不分得开，是两件独立的事。',
    },
    {
      kind: 'unmodelled',
      text: '同一套几何、同一条判决式，换一条路径损耗律就是 Wi-Fi 的多径，但这一步只接了超宽带这一侧。所以 Wi-Fi 那边的课里写着「没有建模多径」，现在仍然是真的。',
    },
  ],
  scenario: () => uwbResolutionScenario('pair'),
  variants: [
    { label: `只留贴线那个：${ECHO_FLIP_UNDER.offM} 米`, scenario: () => uwbResolutionScenario('under') },
    { label: `再往外 10 厘米：${ECHO_FLIP_OVER.offM} 米`, scenario: () => uwbResolutionScenario('over') },
  ],
  jumps: [
    J('第一条回波', firstUwbEcho),
    J('分不开的那一条', firstUwbEchoMerged),
    J('分得开的那一条', firstUwbEchoResolved),
    J('这一轮算出的距离', firstUwbRange),
  ],
  observe: [
    '每一次发送后面跟着两条回波，相差三纳秒：前一条是贴线那个物体的，写着「分不开」，电平更高；后一条是远处衣柜的，写着「分得开」，电平更低。两行紧挨着，对比就在眼前。',
    '再看测距那几行：距离、真值、时刻，与房间里空无一物时完全一样。判决是分得开还是分不开，对测距一点影响都没有。',
  ],
  tryThis: [
    `依次载入两个变体：${ECHO_FLIP_UNDER.offM} 米时记录还写着「分不开」，多走 ${ECHO_FLIP_UNDER.excessM} 米；${ECHO_FLIP_OVER.offM} 米时就翻成「分得开」，多走 ${ECHO_FLIP_OVER.excessM} 米。物体只挪了 10 厘米，判决却换了一个。`,
    `打开编辑模式，用 🪞 把贴线那个物体沿垂直于连线的方向一格一格往外拖，每拖一格跑一遍，自己找出判决翻转的那一格；再把两台设备拉到四米远，重做一次——翻转的位置会往外跑，因为 ${ECHO_FLIP_OFFSET_M} 米这个数是跟着连线长度走的。`,
  ],
  quiz: [
    {
      q: '两个一样大的物体，贴线那个的回波更响，却报告「分不开」。为什么？',
      options: [
        '电平高的信号更容易饱和接收机',
        '它多走的路只有几厘米，远小于一个码片折成的长度，两个包叠在一起',
        '贴线的位置反射角不好，相位乱了',
      ],
      answer: 1,
      explain: '判决只看多走了多远，与电平毫无关系。它电平高，恰恰是因为它两段路径都短。',
    },
    {
      q: '把接收机的带宽做大十倍，这条门槛会怎样？',
      options: [
        '不变，门槛由码片序列的长度决定',
        '变短到十分之一：门槛就是 c/B，带宽越大分得越细',
        '变长，因为带宽大了噪声也大',
      ],
      answer: 1,
      explain: '这正是超宽带能做厘米级测距的原因，也是窄带电台在房间里什么物体都分不开的原因。',
    },
    {
      q: '在两米的连线上，物体要站到离连线多远，回波才分得开？',
      options: [
        '只要不在连线上就行',
        `约 ${ECHO_FLIP_OFFSET_M} 米——把判决式对垂直距离反解一次就得到，而且这个数随连线拉长而变大`,
        '半个码片，也就是约 0.30 米',
      ],
      answer: 1,
      explain: '所以「贴着连线看不见」这块盲区不是固定大小的：两台设备拉得越开，它越宽。',
    },
  ],
}
