/**
 * UWB Tier 2 · M20 · Sensing · An echo is a second way home.
 *
 * Every lesson before this one rests on an answer: the tag asks, the anchor
 * replies, and two timestamps make a distance. This one is about the things in
 * the room that never reply. A reflecting object gives the same transmission a
 * **second arrival** at the same receiver, and that arrival carries a length —
 * the bistatic range |TX→S| + |S→RX| — which is a measurement of something that
 * was never part of the conversation.
 *
 * Two claims carry the lesson, and they are not the same kind of claim:
 *
 *  - **Later, always.** The triangle inequality, so it is a theorem and there is
 *    no scene that breaks it. The engine clamps a negative excess to zero for
 *    floating-point noise alone (`echoExcessM`).
 *  - **Weaker — measured, and it can fail.** The echo pays the path-loss law on
 *    each leg, gets back the receive aperture the two-leg sum double-charged,
 *    and then adds whatever the scenario says the object reflects like. In this
 *    lesson's own scene the answer is 1.0 dB under the direct ray; move the same
 *    wardrobe to 0.2 m off the line and it arrives 4.7 dB **above** it, because
 *    both legs shrink to about a metre while the direct ray is still two, and
 *    the 🪞 tool's −10 dB object is ten dB louder than a perfect square metre.
 *    So the lesson states "later" as a theorem and "weaker" as a bill — with the
 *    counterexample printed, because a reader who moves the object in the next
 *    lesson will see it.
 *
 * Every figure quoted below comes from `src/ui/echoFacts.ts`, which computes it
 * the way `UwbChannel` computes an arrival, so no number here was typed by hand;
 * tests/course/uwb-sensing.test.ts pins each one against the run.
 */
import type { Scenario } from '../../model/scenario'
import type { ScattererCfg } from '../../engine/scatter'
import type { TopologySpec } from '../diagram'
import {
  DIRECT_2M, ECHO_IDEAL_10M_UNDER_FLOOR_DB, ECHO_IDEAL_2M_OVER_FLOOR_DB,
  ECHO_NEAR_LINE, ECHO_OFF_LINE, ECHO_RESOLUTION_M, SCATTERER_DEFAULT_DB,
} from '../../ui/echoFacts'
import {
  J, anchor, firstUwbEcho, firstUwbPoll, firstUwbRange, firstUwbRoundEnd, oneRoom, uwbSc, uwbTag,
  type Lesson,
} from '../lessonKit'

/** Which scene the lesson runs: one object out in the room, one hugging the line, or none. */
export type UwbSensingVariant = 'base' | 'nearLine' | 'empty'

/**
 * The pair, and why it is only two metres apart and only a metre off the floor.
 *
 * **Two metres** because the reach is genuinely short. An echo pays a spreading
 * loss on each leg and gets back only the aperture the two-leg sum charged
 * twice, so a perfect square metre halfway along a ten-metre line lands about
 * ten dB under this receiver's sensitivity and is never handed over at all. A
 * scene that wanted a longer line would have to invent a louder object.
 *
 * **One metre for all three**, anchor included, because then every length in the
 * lesson is a length on the floor plan: the reader can measure 1.41 m off the
 * plan with a ruler and get the leg the record quotes. An anchor on the ceiling
 * would make each leg a slant and every arithmetic step in the lesson a
 * three-dimensional one, for no gain — the geometry is the same either way.
 */
export const PAIR_X = 4
export const PAIR_Y = 4
export const PAIR_Z = 1
/** The tag stands two metres along +x from the anchor; every object sits halfway between them. */
export const PAIR_SPAN_M = 2

/**
 * One reflecting object, `offM` metres off the line, at its midpoint.
 *
 * `extraLossDb` is the 🪞 tool's own −10 dB — a wardrobe — and it is stated here
 * rather than defaulted because the schema requires it: 0 dB is not "neutral",
 * it is the claim that this object reflects exactly like a perfect square metre.
 */
export function sensingObject(id: string, offM: number): ScattererCfg {
  return { id, pos: { x: PAIR_X + PAIR_SPAN_M / 2, y: PAIR_Y + offM, z: PAIR_Z }, extraLossDb: -10 }
}

/**
 * An anchor and a tag two metres apart in an empty room, ranging with double-sided
 * two-way ranging on channel 9, and — except in the `empty` variant — one object
 * between them.
 *
 * The scatterers key is spread in only when there is an object, never as
 * `scatterers: []`: absence and an empty list are two different statements, and
 * the absence is what makes a run byte-for-byte the run it was before this
 * feature existed (src/model/scenario.ts).
 */
export function uwbSensingScenario(variant: UwbSensingVariant = 'base'): Scenario {
  const list: ScattererCfg[] =
    variant === 'base' ? [sensingObject('wardrobe', 1)]
      : variant === 'nearLine' ? [sensingObject('poster', 0.2)]
        : []
  return uwbSc(
    oneRoom(),
    [
      anchor('anc-1', 'Anchor', PAIR_X, PAIR_Y, PAIR_Z),
      uwbTag('tag-1', 'Badge', PAIR_X + PAIR_SPAN_M, PAIR_Y, PAIR_Z),
    ],
    { method: 'ds', mode: 'twr', channel: 9, nlos: false },
    list.length ? { scatterers: list } : {},
  )
}

/**
 * One leg of the base scene's echo, metres: half the span across, one metre out.
 * Written as the arithmetic rather than as `1.41` so the figure in the picture and
 * the figure in the record cannot come apart if the scene ever moves.
 */
const LEG_M = Math.hypot(PAIR_SPAN_M / 2, 1).toFixed(2)

/**
 * How far **above** the direct ray the near-line echo lands, dB — the sign flipped out of
 * `underDirectDb`, which is negative exactly when an echo is the louder of the two. This is
 * the counterexample the lesson prints rather than hides.
 */
const NEAR_LINE_OVER_DIRECT_DB = (-Number(ECHO_NEAR_LINE.underDirectDb)).toFixed(1)

/** The two ways home, at the scene's own coordinates: one straight, one round the wardrobe. */
function twoPaths(): TopologySpec {
  return {
    kind: 'topology',
    nodes: [
      { id: 'tag-1', label: '胸牌 tag-1', role: 'sta', x: PAIR_X + PAIR_SPAN_M, y: PAIR_Y },
      { id: 'anc-1', label: '锚点 anc-1', role: 'ap', x: PAIR_X, y: PAIR_Y },
      { id: 'wardrobe', label: '衣柜 wardrobe', role: 'sta', x: PAIR_X + PAIR_SPAN_M / 2, y: PAIR_Y + 1 },
    ],
    links: [
      { from: 'tag-1', to: 'anc-1', label: `${DIRECT_2M.pathM} m`, tone: 'accent' },
      { from: 'tag-1', to: 'wardrobe', label: `${LEG_M} m` },
      { from: 'wardrobe', to: 'anc-1', label: `${LEG_M} m` },
    ],
    ring: { nodes: ['tag-1', 'anc-1'], label: '相互收发帧的只有这两台设备' },
  }
}

export const uwbSensing: Lesson = {
  id: 'uwb-sensing',
  module: 27,
  title: '不作应答的物体产生的回波',
  why: '到目前为止，每一次测量都依靠「一问一答」：标签（tag）发出 Poll，锚点（anchor）应答，两端的时间戳共同算出一个距离。而房间里绝大多数物体不会应答——柜子、门板、站在那里的人。它们不发射也不接收，却会反射信号，于是同一次发送在同一个接收端多出第二个到达。这样的物体称为散射体（scatterer），经它反射形成的第二个到达称为回波（echo），回波经过的是「发送端到物体」与「物体到接收端」两段，这两段之和称为双站距离（bistatic range）。两段之和不可能短于那条直线，这是三角不等式，所以回波最多与直达路径同时到达，通常更晚——任何比首径（first path）更早的到达，一定是测量错误。电平却没有这样的定理：回波按两段路径损耗（path loss）计算，物体离连线较远时比直达路径略弱，靠近连线时两段都变短，反而比直达路径更强。而在本课的场景里，测距自始至终不受它影响。标准规定测距时间戳以 RMARKER（ranging marker）为准，但没有规定接收机怎样在多径中确定到达时刻；本课按常见做法假定测距接收机锁定首径，带回波标记的到达不打时间戳、不参与捕获判决，放置物体前后，测得的每一个距离都不变；读取回波的只有感知（sensing）这一功能。IEEE 802.15.4-2024 没有定义感知，本课的回波模型也不对应任何标准机制。',
  outcomes: [
    '说清回波经过哪两段路径，以及三角不等式为什么决定它不可能更早到达',
    '从一条记录中读出双站距离，并用平面图上的坐标自行验证',
    '说明为什么房间里放置了反射物体之后，测距结果不变',
  ],
  needs: ['uwb-dstwr', 'uwb-geometry'],
  terms: [
    { term: 'scatterer', plain: '散射体：房间里一个会反射信号的物体，它不发射、不接收，也不属于设备' },
    { term: 'echo', plain: '回波：同一次发送经物体反射后到达的第二个信号' },
    { term: 'bistatic range', plain: '双站距离：发→物 与 物→收 两段路程之和，也就是回波实际经过的路径长度' },
    { term: 'sensing', plain: '感知：不依靠对方应答，只依靠回波判断房间里有什么。IEEE 802.15.4-2024 没有定义它，相关机制目前只在 TG4ab 的草案中' },
  ],
  picture: [
    { heading: '房间里不作应答的物体', text: '一次超宽带（ultra-wideband, UWB）发送并不只朝向对端：它向各个方向传播，遇到衣柜、门板、人体，就有一部分被反射回来。被反射的那一部分同样会到达接收端，只是经过了更长的路径。于是接收端对同一次发送收到两次——先是直达的那一份，再是经物体反射的那一份。这个会反射信号的物体称为散射体（scatterer），经它反射形成的第二个到达称为回波（echo）。' },
    { heading: '两条路径，一次发送', text: '直达路径是一条直线：从发送端到接收端。回波是两段：从发送端到物体，再从物体到接收端。回波实际经过的长度就是这两段之和，称为双站距离（bistatic range）——「双站」是因为发射与接收不在同一处，与发射机和接收机装在一起的雷达不同。本课只讲前一种：在本课的模型里，物体的回波只计入其他设备，发送那一帧的设备不接收自身那一帧的回波。' },
    { kind: 'watch', jump: 1, heading: '查看第一条回波记录', text: '载入本课场景，跳到第一条回波。它落在第 10 纳秒，而同一次发送的直达路径落在第 7 纳秒。一次发送，两个到达，两行记录——而且这一行中已经给出它经过的距离，以及比直达路径多经过的距离。' },
    {
      kind: 'diagram', heading: '到达接收端的两条路径',
      spec: twoPaths(),
      caption: `锚点与胸牌之间那条 ${DIRECT_2M.pathM} 米的直线是直达路径；经衣柜反射的两段各 ${LEG_M} 米，合计 ${ECHO_OFF_LINE.pathM} 米，就是回波经过的双站距离。相互收发帧的只有锚点和胸牌，衣柜不做任何事——它只是为信号多提供了一条路径。`,
    },
    { heading: '「更晚」是定理', text: `两段路径之和不可能短于那条直线——这是三角不等式，而不是本课的设定。所以回波只有两种可能：物体恰好位于连线上，两者同时到达；物体不在连线上，回波更晚。没有第三种。这一点在工程上很有用：任何一个到达，只要它比首径（first path）更早，那一定是测量错误，而不是发现了新物体。` },
    { heading: '「更弱」是计算结果，而且可能不成立', text: `电平就没有这么简单了。回波要按路径损耗（path loss）计入两段路径的扩散损耗，再扣除两段之和中重复计入的一次接收孔径，最后加上这个物体自身的反射强度。本课的衣柜离连线 1 米，计算结果是 ${ECHO_OFF_LINE.dbm} dBm，比直达路径的 ${DIRECT_2M.dbm} dBm 低 ${ECHO_OFF_LINE.underDirectDb} dB。而把同一个衣柜移到离连线 ${ECHO_NEAR_LINE.offM} 米处，它反而比直达路径高 ${NEAR_LINE_OVER_DIRECT_DB} dB：两段路径各缩短到一米多，而直线仍是两米。所以「回波更弱」是计算得出的结果，而不是定理——它可能不成立，下一课正是从这里开始。` },
    { heading: '测距自始至终不受它影响', text: '在本课里这一切对测距完全没有影响：放置物体之后，本课测得的每一个距离都不变。这是本课的假设，依据是常见的接收机做法：标准规定测距时间戳以 RMARKER 为准，却没有规定接收机怎样在多径中确定到达时刻；实际的测距接收机通常锁定首径，后续的多径正是它要抑制的对象，把回波当作首径打时间戳，测得的距离就是错误的。所以本课中回波完全不进入测距：时间戳、两帧碰撞时的捕获效应（capture effect）判决、接收是否成功，都不受它影响。使用它的只有感知（sensing）：感知读取的正是测距要抑制的那个后到达的信号。' },
  ],
  numbers: [
    {
      kind: 'formula', heading: '全部几何关系',
      text: '双站距离 = |发→物| + |物→收|\n回波时延 = 双站距离 / c\n额外路程 = 双站距离 − |发→收|',
      note: '三行中没有一个量与载波、波形或帧格式有关，所以这套几何关系只需更换路径损耗模型，就能用于另一种无线电技术。',
    },
    {
      kind: 'table', heading: '本课场景，一次发送的两个到达', head: [
        '到达', '路径长度', '到达时刻', '电平',
      ], rows: [
        ['直达路径', `${DIRECT_2M.pathM} m`, `${DIRECT_2M.propNs} ns`, `${DIRECT_2M.dbm} dBm`],
        ['经衣柜反射的回波', `${ECHO_OFF_LINE.pathM} m`, `${ECHO_OFF_LINE.propNs} ns`, `${ECHO_OFF_LINE.dbm} dBm`],
        ['两者之差', `${ECHO_OFF_LINE.excessM} m`, `${(Number(ECHO_OFF_LINE.propNs) - Number(DIRECT_2M.propNs)).toFixed(2)} ns`, `${ECHO_OFF_LINE.underDirectDb} dB`],
      ],
    },
    { text: `这张表可以自行验证：衣柜位于连线中点向外 1 米处，两段路径各为 √(1² + 1²) = ${LEG_M} 米，合计 ${ECHO_OFF_LINE.pathM} 米，比 ${DIRECT_2M.pathM} 米的直线长 ${ECHO_OFF_LINE.excessM} 米。${ECHO_OFF_LINE.pathM} 米除以光速，正好是记录中的 ${ECHO_OFF_LINE.propNs} 纳秒。` },
    {
      kind: 'steps', heading: '一条回波记录是怎么来的（本课的模型，标准没有规定这些步骤）', items: [
        '胸牌发出一帧。它沿直线到达每个接收端，这就是直达路径的到达——时刻和电平都与房间里没有物体时完全相同。',
        '同一帧还会经房间里的每个物体到达每个接收端，各多出一个到达：时延按双站距离除以光速，电平按两段路径损耗计算，两段路径上的墙体损耗分别计算。',
        '这个额外的到达不进入测距：接收端不为它启动一次接收，不用它打时间戳，它也不参与捕获判决——测距锁定的是首径，后到的回波对测距而言是需要抑制的多径。',
        '本课规定感知能够读取它有两个前提：接收端当时处于接收状态，而且它的电平不低于这一帧的灵敏度（sensitivity）门限。',
        '读取到的到达在日志中记为一行：对应的物体、双站距离、时延、比直达路径多经过的距离、这台接收机能够分辨所需的最小额外路程，以及能否分辨。',
      ],
    },
    { text: `记录中那一项「分辨所需的最小额外路程」是下一课的全部内容，这里只需先记住那个数：${ECHO_RESOLUTION_M} 米。码片速率 499.2 Mchip/s 是标准给出的，本课把一个码片（chip）的宽度取作能否分辨的门限（这是本课的判据，标准没有规定），所以它与物体、与距离都无关，只与这台接收机的带宽有关。` },
  ],
  deeper: [
    { heading: '为什么两段损耗要扣除一次接收孔径', text: '把路径损耗按两段各算一次，看似理所当然，实际上会把接收孔径计算两次——一条路径损耗中本来就包含接收天线（antenna）截获多少能量这一项，而一个回波只有一个接收机。多算的这一项可以精确给出，正好是 10·log10(4π/λ²)，只与波长有关，所以要把它单独算出并扣除。如果不扣除，回波会比应有的电平弱三十多分贝，在普通室内距离上全部低于灵敏度，完全无法接收。' },
    { heading: '那个 10·log10(4π/λ²) 是从哪里来的', text: '它是两段路径损耗之和与双站雷达关系之间的全部差别：两段和 − 雷达 = 10·log10(σ · 4π / λ²)。这个差值分为两部分：几何部分只含波长；截面部分就是物体自身的反射强度，本课用场景中的一个 dB 数给出。两部分合起来，就精确重现了双站雷达关系。所以本课不使用任何以平方米计的雷达截面，而算出的电平仍与雷达方程给出的结果一致。' },
    { heading: '靠近连线的物体为什么电平更高', text: '两段路径越短，两段扩散损耗就越小；而直达路径的长度不随物体位置改变。物体靠近连线时，两段之和趋近于那条直线本身，于是回波的两段各只有一米，而直达路径仍是完整的两米——在这种只按距离计算扩散的模型中，两段短路径的总损耗小于那一段长路径的损耗。再加上 🪞 工具设定的 −10 dB 比一平方米还强十个分贝，结果就是靠近连线的那个物体成为房间里电平最高的回波。真实世界中，朝向、材质、遮挡会削弱这一效应，本课都不计入。' },
  ],
  sources: [
    '回波的几何不依赖任何标准：双站距离除以光速，与载波、波形、帧格式都无关，也不含任何一种电台的参数——所以这套几何关系换成另一种无线电技术同样成立。',
    '「额外路程达到多少才能分辨」这一门限用到 IEEE Std 802.15.4-2024 §16.2.4 的 499.2 Mchip/s：一个码片 2.003205 ns，乘以光速约 0.60 米；把一个码片当作分辨门限是本课的判据，标准没有规定。下一课专讲它。IEEE Std 802.15.4-2024 没有定义感知；超宽带感知目前只出现在 IEEE 802.15 TG4ab 的草案中（15-26/0179r1 的 PICS 把它记在草案第 10.40 条下），本课的回波模型不对应草案里的任何具体机制。',
    '反射强度是场景自行设定的一个 dB 数，属于模型取值：0 dB 定义为一面理想的一平方米反射面，半平方米是 +3.01 dB，🪞 工具放置时设为 −10 dB（一个衣柜）。本课不使用以平方米计的雷达截面，也不对「物体是什么做的」作任何假设。',
    '直达路径的电平按原有方法计算：中心频率上的自由空间损耗，加上路上的墙。本课两点之间没有墙，所以它就是 2 米上的自由空间那一项。',
  ],
  limits: [
    {
      kind: 'out-of-scope',
      text: `回波的作用距离很短，而且可以具体给出：一面理想的一平方米反射面位于 10 米连线的中点时，比接收灵敏度还低 ${ECHO_IDEAL_10M_UNDER_FLOOR_DB} dB，接收端根本收不到它，日志中没有任何记录；同一个物体放在 2 米连线的中点时则高出 ${ECHO_IDEAL_2M_OVER_FLOOR_DB} dB。所以本课与下一课的场景都只有 2 米宽，使用的也是 ${SCATTERER_DEFAULT_DB} dB 的衣柜而不是一平方米——场景小是由物理决定的，而不是为了使某个数值好看。`,
    },
    {
      kind: 'unmodelled',
      text: '墙不是散射体。本课中墙仍然只对直达路径附加固定的时延与损耗，不会反射信号。真实房间里墙面本身也会反射，本课不计入这一项。所以本课中「房间里会反射信号的物体」只指场景中明确放置的那些物体。',
    },
    {
      kind: 'out-of-scope',
      text: '所有物体都静止。散射体是静止的，也没有多普勒。所以这一步给出的是「测出一个被动物体的双站距离」，而不是依靠前后两帧相减来发现「有人进入」的存在检测——后者需要运动，而这里根本没有对运动建模。',
    },
    {
      kind: 'model-value',
      text: '反射强度是一个 dB 数，不是雷达截面。本课不使用以平方米计的 σ，一个物体的反射强度由场景规定：0 dB 是一平方米，−10 dB 是 🪞 工具默认的衣柜。真实回波强度随物体大小、材质、朝向变化，本课都不计入，所以这里的电平是「这个场景声明的物体」的电平，而不是「一个衣柜」的电平。',
    },
    {
      kind: 'threshold',
      text: '记录中永远不会出现「有回波，但太弱」这一类。本课对回波使用的是直达路径本身的灵敏度门限，没有另设感知专用的噪声地板——另设一个就需要自行确定一个没有依据的数值。低于门限的回波在日志中不留下任何记录，也没有任何说明它太弱的记录。',
    },
    {
      kind: 'out-of-scope',
      text: '只有双站，没有单站。本课的回波只到达发送方以外的接收端，所以没有任何一台设备能接收到自身发送信号的反射。真实的单站雷达（发射与接收同处）面临完全不同的问题——收发隔离、近场盲区——本课都不涉及。',
    },
    {
      kind: 'unmodelled',
      text: '这还不是多径。只需更换路径损耗模型，前四项——双站距离、额外路程、两段时延、电平——在 Wi-Fi 上同样可以算出，几何关系与载波无关；不成立的是第五项，也就是那个判决。「能否分辨」比较的是 1/B，那是感知一侧的门限：能够分辨才有第二个目标。而一帧 Wi-Fi 能否解调，门限不是 1/B，而是保护间隔，而保护间隔在本课程的 Wi-Fi 一侧甚至不是一个可选项，每一代的符号时长是一个固定值。所以这套几何关系是一个感知原语，不是一个多径原语。Wi-Fi 那边的课程也没有说「没有建模多径」：那里写的是「仍然没有的是时延扩展本身与多普勒」，而频率选择性在 Wi-Fi 那一部分已经是完整的一课。',
    },
  ],
  scenario: () => uwbSensingScenario('base'),
  variants: [
    { label: '把它移到连线附近', scenario: () => uwbSensingScenario('nearLine') },
    { label: '房间里空无一物', scenario: () => uwbSensingScenario('empty') },
  ],
  jumps: [
    J('胸牌发起这一轮的 Poll', firstUwbPoll),
    J('第一条回波', firstUwbEcho),
    J('这一轮算出的距离', firstUwbRange),
    J('一轮测距的结束', firstUwbRoundEnd),
  ],
  observe: [
    '事件日志中，每一次发送之后都有一条回波记录：一轮双边测距发送四帧，于是一轮产生四条。每一条的双站距离都相同，因为衣柜没有移动。',
    '载入「房间里空无一物」，再查看同样的时间段：没有任何回波，而测距那几行——时刻、距离、真值——与刚才逐字相同。',
  ],
  tryThis: [
    '打开编辑模式，用 🪞 把衣柜沿垂直于连线的方向向外拖动，每次 0.5 米，每拖动一次运行一遍。观察双站距离如何增大、电平如何降低；再把它拖到连线上，观察时延如何趋近直达路径。',
    '把衣柜的反射损耗从 −10 dB 改为 0 dB（即一面理想的一平方米反射面），运行一遍：回波减弱了整整 10 dB，但仍然可以接收。再把两台设备拖到房间两端、相距九米左右：0 dB 的物体没有留下任何回波，而 −10 dB 的衣柜恰好处于门限之上，仍能被接收。回波的作用距离就是这么短。',
  ],
  quiz: [
    {
      q: '为什么回波不可能比直达路径先到？',
      options: [
        '因为它更弱，弱信号解调更慢',
        '因为两段路径之和不可能短于那条直线——三角不等式',
        '因为接收机要先处理完直达路径才能检测到它',
      ],
      answer: 1,
      explain: '这是几何关系，而不是设定。物体恰好位于连线上时两者同时到达，除此之外回波一定更晚。',
    },
    {
      q: '房间里放置一个会反射信号的衣柜之后，测距结果会怎样？',
      options: [
        '在本课里不变：本课假定测距接收机锁定首径，回波不进入测距',
        '略有偏差，因为回波使时间戳延后',
        '偏大，因为接收端把双站距离也计入了',
      ],
      answer: 0,
      explain: '标准没有规定接收机怎样确定到达时刻；本课按常见做法假定接收机锁定首径。只有把回波当作首径打时间戳，测得的距离才会出错。',
    },
    {
      q: `本课场景里的衣柜离连线 1 米，回波比直达路径低 ${ECHO_OFF_LINE.underDirectDb} dB。把它移到离连线 ${ECHO_NEAR_LINE.offM} 米处，会发生什么？`,
      options: [
        '更弱，因为它离连线更近，反射角更差',
        `仍然低 ${ECHO_OFF_LINE.underDirectDb} dB，电平只与物体本身有关`,
        `反而比直达路径高 ${NEAR_LINE_OVER_DIRECT_DB} dB：两段路径各缩短到一米多，而直线仍是两米`,
      ],
      answer: 2,
      explain: '「回波更弱」是计算得出的结果，而不是定理。这一点在下一课中将成为整课的关键。',
    },
  ],
}
