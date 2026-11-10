/**
 * UWB Tier 2 · M20 · Sensing · An echo is a second way home, in the standard-first shape
 * (2026-11-10).
 *
 * ① says what the standards hold for this topic: IEEE Std 802.15.4-2024 defines no sensing; the
 * P802.15.4ab draft adds UWB sensing as clause 10.40 (PICS insertion in 15-26/0179r1); the TG4ab
 * consensus proposal 15-23/0284r1 defined sensing packets; and on the ranging side §10.29.1.1 and
 * §10.29.5 give one RMARKER receive time per RFRAME without saying how a receiver picks it out of
 * the multipath. ② says the echo model is the simulator's own channel model and implements none of
 * the draft's sensing procedure. ③ guides three runs.
 *
 * Every figure comes from `src/ui/echoFacts.ts`, computed the way `UwbChannel` computes an arrival;
 * tests/course/uwb-sensing.test.ts reads each one back out of the lesson and compares it with a run.
 */
import type { Scenario } from '../../model/scenario'
import type { ScattererCfg } from '../../engine/scatter'
import type { TopologySpec } from '../diagram'
import { DIRECT_2M, ECHO_NEAR_LINE, ECHO_OFF_LINE, ECHO_RESOLUTION_M } from '../../ui/echoFacts'
import { J, anchor, firstUwbEcho, firstUwbPoll, firstUwbRange, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'

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
  why: 'IEEE 802.15.4-2024 没有定义感知（sensing）。超宽带（ultra-wideband, UWB）感知只出现在 P802.15.4ab 草案里：草案的协议实现一致性声明把「UWB Sensing」列为第 10.40 条（15-26/0179r1）；TG4ab 的共识提案 15-23/0284r1 为双站与多站感知定义了专门的感知分组。标准对这一课有用的只有测距一侧的规定：开启测距后，收到的每一帧测距帧都给出一个以 RMARKER（ranging marker）为准的接收时刻，接收机怎样从多条路径中确定这个时刻，标准不规定。本仿真器的回波模型不对应草案里的任何机制，是它自己的信道模型：房间里不发射也不接收的物体称为散射体（scatterer），同一次发送经它反射，在同一个接收端多出第二个到达，称为回波（echo）；回波经过的两段路程之和称为双站距离（bistatic range）。两段之和不可能短于那条直线，这是三角不等式，所以回波最多与直达路径同时到达，通常更晚。电平却没有这样的定理：按本仿真器的模型，离连线 1 米的衣柜比直达路径低 1.0 dB，同一个衣柜移到离连线 0.2 米处反而高 4.7 dB。本仿真器假定测距接收机锁定首径（first path），回波不打时间戳、不参与捕获效应（capture effect）判决，所以放置物体前后测得的每一个距离都不变；读取回波的只有它自己的回波记录。',
  outcomes: [
    '说出 IEEE 802.15.4-2024 与 P802.15.4ab 草案各自对感知规定了什么',
    '从一条回波记录中读出双站距离，并用平面图上的坐标自行验证',
    '说明为什么在本仿真器里放置反射物体之后，测距结果不变',
  ],
  needs: ['uwb-dstwr', 'uwb-geometry'],
  terms: [
    { term: 'scatterer', plain: '散射体：房间里一个会反射信号的物体，它不发射、不接收，也不属于设备' },
    { term: 'echo', plain: '回波：同一次发送经物体反射后到达的第二个信号' },
    { term: 'bistatic range', plain: '双站距离：发→物 与 物→收 两段路程之和，也就是回波实际经过的路径长度' },
    { term: 'sensing', plain: '感知：不依靠对方应答，只依靠回波判断房间里有什么。IEEE 802.15.4-2024 没有定义它，相关机制目前只在 P802.15.4ab 草案中' },
  ],
  standard: [
    { heading: '标准里没有感知（IEEE 802.15.4-2024，P802.15.4ab）', text: 'IEEE 802.15.4-2024 没有定义感知功能。超宽带感知出现在 P802.15.4ab 草案中：草案对协议实现一致性声明的插入项把「UWB Sensing」列为第 10.40 条（15-26/0179r1，条目 MLF9.40）。草案正文不在本课核对过的资料里，它的具体规定这里不作介绍。' },
    { heading: 'TG4ab 的共识提案（15-23/0284r1）', text: '2023 年 7 月的共识提案 15-23/0284r1 为双站与多站感知定义了三种感知分组：SENS0（必选，同步头之后接感知字段）、SENS1（感知字段之后接数据）与 SENS2（数据之后接感知字段）；感知分组只有一个 RMARKER，位于帧起始定界符（start-of-frame delimiter, SFD）之后第一个脉冲的峰值处；接收端对感知字段的每一段各给出一份信道冲激响应报告。这是提案，是否原样进入草案，本课没有核实。' },
    { heading: '测距的接收时刻（§10.29.1.1）', text: '测距报告的时刻都以 RMARKER 为准：对超宽带物理层（physical layer, PHY），它是帧起始定界符之后第一个码片（chip）对应的峰值脉冲位置。带加扰时间戳序列（scrambled timestamp sequence, STS）的设备，接收端把 STS 做相关与累加，得到信道冲激响应的估计，再从中确定接收时刻。从多条路径中取哪一条作为到达时刻，标准没有给出算法。' },
    { kind: 'steps', heading: '一次测距接收，按标准：逐步说明', items: [
      '上层用 MLME-RX-ENABLE.request 原语开启测距，其中 RangingControl 为 RANGING_ON（§10.29.5）。',
      '此后收到的每一帧测距帧都产生一份接收测距计数值报告（§10.29.5）。',
      '报告的时刻以 RMARKER 为准，并按 phyRxRmarkerOffset 扣除接收机内部采样点与天线（antenna）之间的时间差（§10.29.1.1）。',
      '这个时刻放在 MCPS-DATA.indication 原语的 RangingReportDescriptor 参数里交给上层（§10.29.1.1，表 8-28）。',
    ] },
  ],
  implementation: [
    { topic: '感知过程', standard: 'IEEE 802.15.4-2024 未定义；P802.15.4ab 草案第 10.40 条', sim: '未实现草案的感知过程：没有感知分组，没有信道冲激响应报告，也没有感知用的控制消息。', kind: 'absent' },
    { topic: '回波记录', standard: '标准与草案里都没有这种记录', sim: '回波是本仿真器信道模型的输出，在日志里记为一行：物体、双站距离、时延、额外路程、分辨所需的最小额外路程，以及能否分辨。它不是任何帧或信息单元。', kind: 'choice' },
    { topic: '回波的几何', standard: '标准不涉及传播', sim: '本课场景里锚点（anchor）与胸牌相距 2 米，衣柜位于连线中点向外 1 米处。时延 = 双站距离 ÷ 光速；额外路程 = 双站距离 − 直线距离。只计发送方以外的接收端：发送那一帧的设备不接收自己那一帧的回波。', kind: 'choice' },
    { topic: '回波的电平', standard: '标准不涉及传播', sim: '两段路程各按路径损耗（path loss）计算，扣除两段之和中重复计入的一次接收孔径 10·log10(4π/λ²)，再加上物体的反射强度。反射强度是场景里的一个 dB 数：0 dB 定义为一面理想的一平方米反射面，本课的衣柜取 −10 dB。', kind: 'value' },
    { topic: '测距的到达时刻', standard: '以 RMARKER 为准；从多径中取哪一条，标准不规定（§10.29.1.1）', sim: '测距接收机锁定首径：回波不启动接收、不打时间戳、不参与两帧重叠（overlap）时的捕获效应判决，所以测距结果与房间里有没有物体无关。', kind: 'choice' },
    { topic: '能读到回波的条件', standard: '标准未规定', sim: '接收端当时处于接收状态，而且回波电平不低于这一帧的灵敏度（sensitivity）门限；低于门限的回波不留下任何记录。没有另设感知专用的噪声地板（noise floor）。', kind: 'value' },
    { topic: '分辨门限', standard: '码片时长 Tc 为峰值脉冲重复频率 499.2 MHz 的倒数；带宽不一定等于 1/Tc（§16.2.4）', sim: `把一个码片当作能否分辨的门限：额外路程超过 ${ECHO_RESOLUTION_M} m 才判为可分辨。下一课专讲它。`, kind: 'value' },
    { topic: '墙与运动', standard: '标准不涉及', sim: '墙只对直达路径附加时延与损耗，不反射；物体静止，没有多普勒。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '一次发送，两个到达',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一条回波。',
        '读出回波记录里的双站距离与额外路程，再用平面图上的坐标自行验证。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '到达接收端的两条路径',
          spec: twoPaths(),
          caption: `锚点与胸牌之间那条 ${DIRECT_2M.pathM} 米的直线是直达路径；经衣柜反射的两段各 ${LEG_M} 米，合计 ${ECHO_OFF_LINE.pathM} 米。`,
        },
        {
          kind: 'table', heading: '本课场景，一次发送的两个到达', head: ['到达', '路径长度', '到达时刻', '电平'], rows: [
            ['直达路径', `${DIRECT_2M.pathM} m`, `${DIRECT_2M.propNs} ns`, `${DIRECT_2M.dbm} dBm`],
            ['经衣柜反射的回波', `${ECHO_OFF_LINE.pathM} m`, `${ECHO_OFF_LINE.propNs} ns`, `${ECHO_OFF_LINE.dbm} dBm`],
            ['两者之差', `${ECHO_OFF_LINE.excessM} m`, `${(Number(ECHO_OFF_LINE.propNs) - Number(DIRECT_2M.propNs)).toFixed(2)} ns`, `${ECHO_OFF_LINE.underDirectDb} dB`],
          ],
        },
      ],
      expect: `回波记录落在第 10 纳秒，同一次发送的直达路径落在第 7 纳秒；衣柜位于连线中点向外 1 米处，两段各 √(1² + 1²) = ${LEG_M} 米，合计 ${ECHO_OFF_LINE.pathM} 米，比直线长 ${ECHO_OFF_LINE.excessM} 米。一轮双边测距发送四帧，每一帧之后有一条回波记录，七个块共 28 条。`,
      meaning: '回波的几何与记录方式都是本仿真器的取法（②），标准与草案里都没有这种记录（①）。',
    },
    {
      heading: '更晚是定理，更弱不是',
      variant: 0,
      steps: [
        '载入「把它移到连线附近」，跳到第一条回波。',
        '对照下表比较两个位置的额外路程与电平。',
      ],
      blocks: [
        {
          kind: 'table', heading: '同一个衣柜，两个位置', head: ['离连线距离', '额外路程', '电平', '与直达路径相比'], rows: [
            [`${ECHO_OFF_LINE.offM} m`, `${ECHO_OFF_LINE.excessM} m`, `${ECHO_OFF_LINE.dbm} dBm`, `低 ${ECHO_OFF_LINE.underDirectDb} dB`],
            [`${ECHO_NEAR_LINE.offM} m`, `${ECHO_NEAR_LINE.excessM} m`, `${ECHO_NEAR_LINE.dbm} dBm`, `高 ${NEAR_LINE_OVER_DIRECT_DB} dB`],
          ],
        },
      ],
      expect: `两个位置的回波都比直达路径晚到；离连线 ${ECHO_NEAR_LINE.offM} 米时，两段路程各缩短到一米多，回波反而比直达路径高 ${NEAR_LINE_OVER_DIRECT_DB} dB。`,
      meaning: '「更晚」来自三角不等式，与模型无关；「更弱」是本仿真器电平模型的计算结果（②），可以不成立。',
    },
    {
      heading: '测距不受回波影响',
      variant: 1,
      jump: 2,
      steps: [
        '载入「房间里空无一物」，跳到这一轮算出的距离。',
        '与本课场景的同一时刻对照：时刻、距离、真值。',
      ],
      expect: '空房间里没有任何回波记录，而两个场景的 14 个距离逐字相同；放置物体也没有增加任何一次接收。',
      meaning: '这是本仿真器假定测距锁定首径的结果（②）；标准没有规定接收机怎样从多径中确定到达时刻（①）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.29.1.1（RMARKER 的定义、STS 相关得到信道冲激响应的估计、测距报告的时刻）、§10.29.5（开启测距后每一帧测距帧产生测距计数值报告）、§16.2.4（峰值脉冲重复频率 499.2 MHz，码片时长取其倒数，带宽不一定等于码片时长的倒数）。IEEE 802.15.4-2024 没有定义感知。',
    'P802.15.4ab：15-26/0179r1 的协议实现一致性声明插入项把「UWB Sensing」列为草案第 10.40 条（MLF9.40）；15-23/0284r1 是 2023 年 7 月的共识提案（SENS0/1/2 感知分组、感知字段每一段一份信道冲激响应报告），是否原样进入草案未核实。本课的回波模型不对应其中任何机制。',
    '本仿真器的取法与取值：双站几何、两段路径损耗与接收孔径修正、以 dB 给出的反射强度（0 dB 为一平方米，衣柜 −10 dB）、测距锁定首径、以灵敏度为回波门限、以一个码片为分辨门限、墙不反射、物体静止。',
  ],
  limits: [],
  scenario: () => uwbSensingScenario('base'),
  variants: [
    { label: '把它移到连线附近', scenario: () => uwbSensingScenario('nearLine') },
    { label: '房间里空无一物', scenario: () => uwbSensingScenario('empty') },
  ],
  jumps: [
    J('胸牌发起这一轮的 Poll', firstUwbPoll),
    J('第一条回波', firstUwbEcho),
    J('这一轮算出的距离', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: 'IEEE 802.15.4-2024 对感知规定了什么？',
      options: [
        '规定了回波记录的格式',
        '没有定义感知；超宽带感知只出现在 P802.15.4ab 草案里',
        '规定了测距接收机必须锁定首径',
      ],
      answer: 1,
      explain: '感知在草案的第 10.40 条；IEEE 802.15.4-2024 只规定测距的接收时刻以 RMARKER 为准，没有规定接收机怎样从多径中确定它。',
    },
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
      q: '在本仿真器里，房间里放置一个会反射信号的衣柜之后，测距结果会怎样？',
      options: [
        '不变：本仿真器假定测距接收机锁定首径，回波不进入测距',
        '略有偏差，因为回波使时间戳延后',
        '偏大，因为接收端把双站距离也计入了',
      ],
      answer: 0,
      explain: '标准没有规定接收机怎样确定到达时刻；锁定首径是本仿真器的取法。只有把回波当作首径打时间戳，测得的距离才会出错。',
    },
  ],
}
