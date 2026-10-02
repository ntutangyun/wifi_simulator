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
    ring: { nodes: ['tag-1', 'anc-1'], label: '会互相回话的只有这两个' },
  }
}

export const uwbSensing: Lesson = {
  id: 'uwb-sensing',
  module: 23,
  title: '不回话的物体留下的回波',
  why: '到这里为止，每一次测量都靠「问一句、答一句」：标签（tag）发出 Poll，锚点（anchor）回话，两边的时间戳凑出一个距离。可房间里绝大多数东西是不会回话的——柜子、门板、站在那里的人。它们不发射也不接收，却把信号弹回来，于是同一次发送在同一个接收端多出第二个到达。这一课就读这第二个到达：它走了哪条路，为什么不可能比直达路径更早，以及为什么测距从头到尾看不见它。',
  outcomes: [
    '说清回波走的是哪两段路，以及三角不等式为什么让它不可能更早',
    '从一条记录里读出双站距离，并用平面图上的坐标自己验一遍',
    '说出为什么房间里摆了会反射的物体之后，测距结果逐字段不变',
  ],
  needs: ['uwb-dstwr', 'uwb-geometry'],
  terms: [
    { term: 'scatterer', plain: '散射体：房间里一个会反射的物体，它不发射、不接收，也不算一台设备' },
    { term: 'echo', plain: '回波：同一次发送绕过物体之后到达的第二个信号' },
    { term: 'bistatic range', plain: '双站距离：发→物 与 物→收 两段路程之和，也就是回波真正走过的路' },
    { term: 'sensing', plain: '感知：不靠对方回话，只靠回波去判断房间里有什么' },
  ],
  picture: [
    { heading: '房间里不回话的那些东西', text: '一次发送并不是只朝着对方去的：它朝各个方向铺开，碰到衣柜、门板、人体，就被弹回来一部分。被弹回来的那一份照样会落到接收端，只是它绕了一圈。于是接收端在同一次发送里听到两回——先是直着过来的那一份，再是绕过物体的那一份。这个会反射的物体叫散射体（scatterer），它绕出来的第二个到达叫回波（echo）。' },
    { heading: '两条路，一次发送', text: '直达路径是一条直线：从发送端到接收端。回波是两段：从发送端到物体，再从物体到接收端。回波真正走过的长度就是这两段之和，叫双站距离（bistatic range）——「双站」是因为发和收不在一处，和把发射机与接收机装在一起的雷达不是一回事。这个仿真器里没有后者：物体的回波只交给别的设备，从不交回给发它的那一台。' },
    { kind: 'watch', jump: 1, heading: '看第一条回波记录', text: '载入本课场景，跳到第一条回波。它落在第 10 纳秒，而同一次发送的直达路径落在第 7 纳秒。一次发送，两个到达，两行记录——而且这一行里已经写着它走了多远、多走了多少。' },
    {
      kind: 'diagram', heading: '两条回家的路',
      spec: twoPaths(),
      caption: `锚点与胸牌之间那条 ${DIRECT_2M.pathM} 米是直达路径；绕过衣柜的两段各 ${LEG_M} 米，加起来 ${ECHO_OFF_LINE.pathM} 米，就是回波走的双站距离。会互相回话的只有锚点和胸牌，衣柜什么也不做——它只是让信号多一条路可走。`,
    },
    { heading: '「更晚」是定理', text: `两段路之和不可能短于那条直线——这是三角不等式，不是本仿真器的取舍。所以回波只有两种可能：物体恰好站在连线上，两者同时到达；物体不在连线上，回波更晚。没有第三种。工程上这一条很有用：任何一个到达，只要它比首径（first path）更早，那一定是量错了，而不是发现了新物体。` },
    { heading: '「更弱」是算出来的，而且可能不成立', text: `电平就没有这么干脆了。回波要按路径损耗（path loss）承受两段路的扩散，再把两段和里多收的那一次接收孔径退回来，最后加上这个物体自己的反射强度。本课的衣柜离连线 1 米，算下来是 ${ECHO_OFF_LINE.dbm} dBm，比直达路径的 ${DIRECT_2M.dbm} dBm 低 ${ECHO_OFF_LINE.underDirectDb} dB。可把同一个衣柜挪到离连线 ${ECHO_NEAR_LINE.offM} 米，它反而比直达路径高 ${NEAR_LINE_OVER_DIRECT_DB} dB：两段路径各缩到一米出头，而直线还是两米。所以「回波更弱」是量出来的结果，不是定理——它可以不成立，下一课正是从这里开始。` },
    { heading: '测距从头到尾看不见它', text: '这一切对测距完全没有影响：摆上物体之后，每一条测距记录逐字段不变。这不是为了省事划的界，而是先有物理才有的建模——4z 的测距接收机锁的是首径，后面的多径正是它要抑制的东西；把回波当成首径去打时间戳，量出来的距离就假了。所以带回波标记的到达根本进不了接收那一路：时间戳、两帧碰撞时的捕获效应（capture effect）判决、接收成不成功，一个都不看它。只有感知（sensing）这一路消费者读它。' },
  ],
  numbers: [
    {
      kind: 'formula', heading: '全部的几何',
      text: '双站距离 = |发→物| + |物→收|\n回波时延 = 双站距离 / c\n多走的路 = 双站距离 − |发→收|',
      note: '三行里没有一个量与载波、波形或帧格式有关，所以这套几何换一条路径损耗律就能给另一种电台用。',
    },
    {
      kind: 'table', heading: '本课场景，一次发送的两个到达', head: [
        '到达', '走了多远', '什么时候到', '电平',
      ], rows: [
        ['直达路径', `${DIRECT_2M.pathM} m`, `${DIRECT_2M.propNs} ns`, `${DIRECT_2M.dbm} dBm`],
        ['绕衣柜的回波', `${ECHO_OFF_LINE.pathM} m`, `${ECHO_OFF_LINE.propNs} ns`, `${ECHO_OFF_LINE.dbm} dBm`],
        ['两者之差', `${ECHO_OFF_LINE.excessM} m`, `${(Number(ECHO_OFF_LINE.propNs) - Number(DIRECT_2M.propNs)).toFixed(2)} ns`, `${ECHO_OFF_LINE.underDirectDb} dB`],
      ],
    },
    { text: `这张表自己就能验：衣柜站在连线中点往外 1 米处，两段腿各是 √(1² + 1²) = ${LEG_M} 米，加起来 ${ECHO_OFF_LINE.pathM} 米，比 ${DIRECT_2M.pathM} 米的直线多走 ${ECHO_OFF_LINE.excessM} 米。除以光速，正好是记录里那 ${ECHO_OFF_LINE.propNs} 纳秒。` },
    {
      kind: 'steps', heading: '一条回波记录是怎么来的', items: [
        '胸牌发出一帧。介质（medium）先像往常一样，给每个接收端排好直达路径的到达——一个不多，一个不少，顺序也和没有物体时一模一样。',
        '排完之后，它再为每一对（接收端，物体）多排一个到达：时延按双站距离除以光速，电平按两段路径损耗算，两段路上的墙各算各的。',
        '这个多出来的到达带着一个标记。接收那一路见到标记就直接绕开：不开接收、不打时间戳、不参与捕获判决——所以测距那一路连一个「要忽略的东西」都没见到。',
        '它转而交给感知这一路消费者，前提是接收端正在听，而且它没有低于这一帧的灵敏度（sensitivity）门限。',
        '消费者把这个到达写成一行记录：哪个物体、双站距离、时延、比直达路径多走了多少、这台接收机需要多走多少才分得开，以及分不分得开。',
      ],
    },
    { text: `记录里那句「需要多走多少」是下一课的全部内容，这里只先记住那个数：${ECHO_RESOLUTION_M} 米。它来自 499.2 Mchip/s 的码片（chip）宽度，与物体、与距离都无关，只与这台接收机的带宽有关。` },
  ],
  deeper: [
    { heading: '为什么两段损耗要退回一次接收孔径', text: '把调用方的路径损耗法每段收一次，看着天经地义，其实会把接收孔径算两次——一条路径损耗里本来就含着接收天线（antenna）接下多少能量这一项，而一个回波只有一个接收机。多算的这一项是精确的，正好是 10·log10(4π/λ²)，只跟波长有关，所以它被单独算出来退回去（apertureCorrectionDb）。不退的话，回波会比该有的弱三十多分贝，在普通室内距离上全部落到灵敏度之下——这个功能会变成「什么也听不见」。' },
    { heading: '那个 10·log10(4π/λ²) 是从哪里来的', text: '它是两段路径损耗之和与双站雷达关系之间的全部差别：两段和 − 雷达 = 10·log10(σ · 4π / λ²)。这个差拆成两半，几何那一半只含波长，由代码算；截面那一半就是物体自己的反射强度，由场景写。拼回去，双站雷达关系精确重现。所以这个仿真器里一个雷达截面数值都没有，而它算出来的电平仍然是雷达方程给的那个。' },
    { heading: '贴着连线的物体为什么电平更高', text: '两段路径越短，两段扩散损耗就越小；而直达路径的长度不随物体动。物体贴到连线上时，两段之和趋近于那条直线本身，于是回波的两段各只有一米，而直达仍要走完整的两米——在这套只按距离算扩散的模型里，两段短路径的总损耗小于那一段长路径。再加上 🪞 工具写的 −10 dB 比一平方米还强十个分贝，结果就是贴线的那个物体成了房间里电平最高的回波。真实世界里还有朝向、材质、遮挡把这件事拉回去，本仿真器一概不建模。' },
  ],
  sources: [
    '回波的几何不依赖任何标准：双站距离除以光速，与载波、波形、帧格式都无关。src/engine/scatter.ts 里就是这几行，而且它不引用任何一种电台的常量——这也是为什么同一套几何将来能直接给 Wi-Fi 用。',
    '「多走多远才分得开」那条门槛来自 IEEE Std 802.15.4-2024 §16.2.4 的 499.2 Mchip/s：一个码片 2.003205 ns，乘以光速约 0.60 米。下一课专讲它。',
    '反射强度是场景自己写的一个 dB 数，属于模型取值：0 dB 定义为一面理想的一平方米反射面，半平方米是 +3.01 dB，🪞 工具放置时写 −10 dB（一个衣柜）。这个仓库里没有任何一处出现以平方米计的雷达截面，因为物理这一层不对「物体是什么做的」发表意见。',
    '直达路径的电平仍是 UwbChannel.rssiDbm 的老算法：中心频率上的自由空间损耗，加上路上的墙。本课两点之间没有墙，所以它就是 2 米上的自由空间那一项。',
  ],
  limits: [
    {
      kind: 'out-of-scope',
      text: `回波的作用距离很短，而且短得具体：一面理想的一平方米反射面站在 10 米连线的中点，比接收灵敏度还低 ${ECHO_IDEAL_10M_UNDER_FLOOR_DB} dB，根本不会被交到接收端手里，连一条记录都没有；同一个物体放在 2 米连线的中点则高出 ${ECHO_IDEAL_2M_OVER_FLOOR_DB} dB。所以本课与下一课的场景都只有 2 米宽，用的也是 ${SCATTERER_DEFAULT_DB} dB 的衣柜而不是一平方米——场景小是因为物理如此，不是为了让某个数好看。`,
    },
    {
      kind: 'unmodelled',
      text: '墙不是散射体。墙仍然只对直达路径加固定的时延与损耗，不会把信号弹回来。把墙变成反射面需要镜像法与可见性判断，路径数会爆炸，那是另一件事。所以本课「房间里会反射的东西」指的只有场景明确摆出来的那些物体。',
    },
    {
      kind: 'out-of-scope',
      text: '什么都不动。散射体是静止的，也没有多普勒。所以这一步给的是「对一个被动物体量出一个双站距离」，而不是靠前后两帧相减来发现「有人进来了」的存在检测——后者需要运动，而运动这里根本没有建模。',
    },
    {
      kind: 'model-value',
      text: '反射强度是一个 dB 数，不是雷达截面。代码里没有以平方米计的 σ，因为一个物体反射多强该由场景来规定：0 dB 是一平方米，−10 dB 是 🪞 工具默认的衣柜。真实回波强度随物体大小、材质、朝向变化，本仿真器一项都不建模，所以这里的电平是「这个场景声明的物体」的电平，不是「一个衣柜」的电平。',
    },
    {
      kind: 'threshold',
      text: '记录里永远不会有「有个回波，但太弱了」这一类。介质对回波用的是直达路径自己那一道灵敏度门限，而这个引擎没有单独的感知噪声地板——去发明一个就是发明一个数字。过不了门限的回波是沉默，不是一条关于沉默的记录。',
    },
    {
      kind: 'out-of-scope',
      text: '只有双站，没有单站。介质给每一个别的接收端排回波，唯独跳过发送方自己，所以没有任何一台设备听得见自己的反射。真实的单站雷达（发收同处）要面对完全不同的问题——自发自收的隔离、近场盲区——本仿真器一个也没有。',
    },
    {
      kind: 'unmodelled',
      text: '这还不是多径。同一套几何换一条路径损耗律就是 Wi-Fi 的多径，接口也留好了，但这一步只接了超宽带（ultra-wideband, UWB）这一侧。所以 Wi-Fi 那边的课里写着「没有建模多径」，现在仍然是真的。',
    },
  ],
  scenario: () => uwbSensingScenario('base'),
  variants: [
    { label: '把它挪到连线边上', scenario: () => uwbSensingScenario('nearLine') },
    { label: '房间里空无一物', scenario: () => uwbSensingScenario('empty') },
  ],
  jumps: [
    J('胸牌用来开场的 Poll', firstUwbPoll),
    J('第一条回波', firstUwbEcho),
    J('这一轮算出的距离', firstUwbRange),
    J('一轮测距的结束', firstUwbRoundEnd),
  ],
  observe: [
    '事件日志里，每一次发送后面都跟着一条回波：一轮双边测距发四帧，于是一轮留下四条。每一条都写着同一个双站距离，因为衣柜没有动。',
    '载入「房间里空无一物」，再看同样的时间段：回波一条也没有，而测距那几行——时刻、距离、真值——与刚才逐字不差。',
  ],
  tryThis: [
    '打开编辑模式，用 🪞 把衣柜沿着垂直于连线的方向往外拖，一次 0.5 米，每拖一次跑一遍。看双站距离怎么涨，看电平怎么降；再把它拖到连线上去，看时延如何贴上直达路径。',
    '把衣柜的反射损耗从 −10 dB 改成 0 dB（也就是一面理想的一平方米反射面），跑一遍：回波弱了整整 10 dB，但仍然听得见。再把两台设备拖到房间两端、相距九米左右：0 dB 的物体一条回波都不剩，而 −10 dB 的衣柜刚好卡在门限上还能进来。回波的作用距离，就是这么短。',
  ],
  quiz: [
    {
      q: '为什么回波不可能比直达路径先到？',
      options: [
        '因为它更弱，弱信号解得慢',
        '因为两段路之和不可能短于那条直线——三角不等式',
        '因为接收机要先处理完直达路径才看得见它',
      ],
      answer: 1,
      explain: '这是几何，不是取舍。物体恰好站在连线上时两者同时到达，此外回波一定更晚。',
    },
    {
      q: '房间里摆上一个会反射的衣柜之后，测距结果会怎样？',
      options: [
        '逐字段不变：带回波标记的到达根本进不了接收那一路',
        '略有偏差，因为回波把时间戳拖晚了',
        '偏大，因为接收端把双站距离也算了进去',
      ],
      answer: 0,
      explain: '4z 的接收机锁的是首径。把回波当成首径去打时间戳，量出来的距离才会假。',
    },
    {
      q: `本课场景里的衣柜离连线 1 米，回波比直达路径低 ${ECHO_OFF_LINE.underDirectDb} dB。把它挪到离连线 ${ECHO_NEAR_LINE.offM} 米，会发生什么？`,
      options: [
        '更弱，因为它离连线更近，反射角更差',
        `还是低 ${ECHO_OFF_LINE.underDirectDb} dB，电平只跟物体本身有关`,
        `反而比直达路径高 ${NEAR_LINE_OVER_DIRECT_DB} dB：两段路径各缩到一米出头，而直线还是两米`,
      ],
      answer: 2,
      explain: '「回波更弱」是算出来的结果，不是定理。这一条在下一课会变成整堂课的关键。',
    },
  ],
}
