/**
 * UWB Tier 2 · M20 · Sensing · Resolution, in the standard-first shape (2026-11-10).
 *
 * ① gives what IEEE Std 802.15.4-2024 actually fixes that bears on resolution: the 499.2 MHz peak
 * PRF and the chip duration Tc = 1/peak PRF (§16.2.4, with its NOTE that the bandwidth is not
 * necessarily 1/Tc), channel 9's 499.2 MHz band (Table 16-27), the transmit pulse's
 * cross-correlation mask (§16.4.4, Table 16-28), and the STS correlation that gives a receiver its
 * channel impulse response (§10.29.1.1) — and that it specifies no receiver resolution at all.
 * ② says the one-chip threshold and the yes/no verdict are the simulator's own. ③ guides three
 * runs.
 *
 * Every figure comes from `src/ui/echoFacts.ts`, computed the way `UwbChannel` computes an
 * arrival; tests/course/uwb-sensing-resolution.test.ts reads each one back out of the lesson and
 * compares it with the run that produces it.
 */
import type { Scenario } from '../../model/scenario'
import type { ScattererCfg } from '../../engine/scatter'
import type { TimingSpec } from '../diagram'
import { UWB_CHIP_NS } from '../../uwb/phy'
import {
  DIRECT_2M, ECHO_FLIP_OFFSET_M, ECHO_FLIP_OVER, ECHO_FLIP_UNDER, ECHO_NEAR_LINE, ECHO_OFF_LINE, ECHO_RESOLUTION_M,
} from '../../ui/echoFacts'
import { J, anchor, firstUwbEcho, firstUwbEchoMerged, firstUwbEchoResolved, firstUwbRange, oneRoom, uwbSc, uwbTag, type Lesson } from '../lessonKit'
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
  why: `IEEE 802.15.4-2024 规定了高脉冲重复频率（high rate pulse repetition frequency, HRP）超宽带（ultra-wideband, UWB）物理层（physical layer, PHY）的峰值脉冲重复频率为 499.2 MHz，码片（chip）时长取它的倒数，约 2 ns（§16.2.4），并特意注明脉冲带宽不一定等于码片时长的倒数；它还用与参考脉冲的互相关约束发射脉冲的形状（§16.4.4）。接收机怎样分辨两条相隔很近的路径，标准没有规定，也没有给出分辨率（resolution）。本仿真器把一个码片当作分辨门限：回波比直达路径多经过的路程超过 c × 1 个码片 = ${ECHO_RESOLUTION_M} 米，才判为第二个到达，否则并入直达路径。这个判决只看几何，与电平无关：本课场景里离连线 ${ECHO_NEAR_LINE.offM} 米的物体额外路程只有 ${ECHO_NEAR_LINE.excessM} 米，判为不可分辨，电平却是 ${ECHO_NEAR_LINE.dbm} dBm，比离连线 ${ECHO_OFF_LINE.offM} 米、可分辨的那一个高 5.7 dB——它两段路径都短，所以既更强又不可分辨。在 2 米长的连线上，物体要偏离连线 ${ECHO_FLIP_OFFSET_M} 米以上才可分辨，从 ${ECHO_FLIP_UNDER.offM} 米移到 ${ECHO_FLIP_OVER.offM} 米，判决就会改变；连线越长，这块盲区越宽。真实接收机没有这样的硬门限，相关峰是逐渐合并的。`,
  outcomes: [
    '说出标准对码片时长、带宽与脉冲形状规定了什么，以及没有规定什么',
    '读取同一次发送产生的两条回波记录，指出电平更高的那一条为什么反而不可分辨',
    '把物体逐步向外移动，找到本仿真器的判决翻转的位置',
  ],
  needs: ['uwb-sensing', 'uwb-frame'],
  terms: [
    { term: 'resolution', plain: '分辨率：两个到达至少相差多少，接收机才能把它们识别为两个到达。标准没有给出它' },
    { term: 'correlation peak', plain: '相关峰：接收机把收到的波形与已知序列做相关运算时，在相关位置出现的峰值' },
    { term: 'chip', plain: '码片：扩频序列中的一个单元；HRP 超宽带物理层的码片时长是 499.2 MHz 的倒数' },
  ],
  standard: [
    { heading: '码片时长与带宽（§16.2.4，表 16-27）', text: '在每个 HRP 超宽带（ultra-wideband, UWB）信道里，峰值脉冲重复频率都是 499.2 MHz，这是发射机发出脉冲的最高频率；码片时长 Tc 由它得出，Tc = 1/峰值脉冲重复频率，约 2 ns。表里的带宽指脉冲的 3 dB 带宽；标准注明，带宽不一定等于码片时长的倒数。信道 9 的中心频率是 7987.2 MHz，带宽 499.2 MHz，是高频段的必选信道（表 16-27）。' },
    { heading: '发射脉冲的形状（§16.4.4，表 16-28）', text: '发射脉冲的形状由它与一个参考脉冲的互相关来约束：参考脉冲是滚降系数 0.5 的根升余弦脉冲，Tp 取码片频率的倒数。互相关幅度的主瓣不小于 0.8 的时长至少为 Tw，任何旁瓣不大于 0.3；信道 9 的 Tp 为 2.00 ns、Tw 为 0.5 ns。这是对发射机的要求。' },
    { kind: 'steps', heading: '检验一个发射脉冲是否合格，按标准：逐步说明（§16.4.4）', items: [
      '取滚降系数 0.5 的根升余弦脉冲作参考脉冲，Tp 取码片频率的倒数（表 16-28）。',
      '计算发射脉冲与参考脉冲的归一化互相关，取其实部的幅度。',
      '找出互相关幅度的主瓣：它不小于 0.8 的时长至少要达到 Tw。',
      '检查每一个旁瓣：幅度都不得大于 0.3。',
      '两项都满足，这个脉冲才符合标准。标准没有对应的接收端检验，也没有规定接收机的分辨率。',
    ] },
    { heading: '接收端怎样确定到达时刻（§10.29.1.1）', text: '带加扰时间戳序列（scrambled timestamp sequence, STS）的设备，接收端把 STS 做相关与累加，得到信道冲激响应的估计，再从中确定接收时刻。接收机用什么算法、能把相隔多近的两条路径分开，标准都没有规定。' },
    { heading: '感知不在标准里（P802.15.4ab）', text: '超宽带感知作为一项协议功能只出现在 P802.15.4ab 草案中（第 10.40 条，见 15-26/0179r1 的协议实现一致性声明插入项）；IEEE 802.15.4-2024 没有定义它。' },
  ],
  implementation: [
    { topic: '分辨门限', standard: '标准没有给出接收机的分辨率；带宽不一定等于 1/Tc（§16.2.4）', sim: `取 1/B 等于一个码片 ${UWB_CHIP_NS.toFixed(6)} ns，乘以光速得 ${ECHO_RESOLUTION_M} m：回波的额外路程超过这个长度才可分辨。`, kind: 'value' },
    { topic: '判决方法', standard: '标准不规定接收机的算法', sim: '把额外时延与 1/B 比较一次，严格大于时判为两个到达，否则判为并入直达路径。这是一个硬门限；真实的相关峰是逐渐合并的，相差不到一个码片时，峰会展宽、位置偏移。', kind: 'choice' },
    { topic: '判决与电平', standard: '标准未规定', sim: '判决只取决于几何，电平不参与；回波电平只决定这条记录是否出现（不低于灵敏度（sensitivity）门限）。', kind: 'choice' },
    { topic: '测距', standard: '以 RMARKER（ranging marker）为准；从多径中取哪一条，标准不规定（§10.29.1.1）', sim: '测距锁定先到达的峰，未分辨的回波不会使它偏移，所以无论判决如何，测得的距离都与空房间相同。', kind: 'choice' },
    { topic: '回波的电平', standard: '标准不涉及传播', sim: '与上一课相同：两段路径损耗（path loss），扣一次接收孔径，再加物体的反射强度；两个物体都取 −10 dB。', kind: 'value' },
    { topic: '感知过程', standard: 'P802.15.4ab 草案第 10.40 条', sim: '未实现草案的感知过程；回波记录是本仿真器自己的输出，不是任何帧或信息单元。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '电平更高的那个反而不可分辨',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一条不可分辨的回波，再看紧接着的那条可分辨的回波。',
        '对照下表比较两条记录的额外路程、判决与电平。',
      ],
      blocks: [
        {
          kind: 'table', heading: '同一次发送，两条回波记录', head: ['离连线距离', '额外路程', `与 ${ECHO_RESOLUTION_M} m 门限比较`, '电平'], rows: [
            [`${ECHO_NEAR_LINE.offM} m`, `${ECHO_NEAR_LINE.excessM} m`, '不可分辨', `${ECHO_NEAR_LINE.dbm} dBm`],
            [`${ECHO_OFF_LINE.offM} m`, `${ECHO_OFF_LINE.excessM} m`, '可分辨', `${ECHO_OFF_LINE.dbm} dBm`],
          ],
        },
        {
          kind: 'diagram', heading: '三个到达，两个峰',
          spec: threePeaks(),
          caption: `每个到达画成约 ${CHIP_NS} 纳秒宽的峰。第二个几乎与第一个重合；第三个完全位于第一个之后。`,
        },
      ],
      expect: '每一次发送之后有两条回波记录，相差 3 ns；紧靠连线的那一条不可分辨，电平却比远处那一条高 5.7 dB。',
      meaning: '判决只看额外路程，这是本仿真器的取法（②）；标准只规定了码片时长，没有规定接收机的分辨率（①）。',
    },
    {
      heading: '移动十厘米，判决翻转',
      variant: 0,
      more: [1],
      steps: [
        `依次载入「离连线 ${ECHO_FLIP_UNDER.offM} 米」与「离连线 ${ECHO_FLIP_OVER.offM} 米」两个变体，各跳到第一条回波。`,
        '对照下表，横向阅读每一行。',
      ],
      blocks: [
        {
          kind: 'formula', heading: '本仿真器的判决式',
          text: '(|发→物| + |物→收|) − |发→收|  >  c × 1/B',
          note: `1/B 取一个码片，c × 1/B = ${ECHO_RESOLUTION_M} 米。物体位于 2 米连线的中垂线上时，反解得翻转位置为离连线 ${ECHO_FLIP_OFFSET_M} 米。`,
        },
        {
          kind: 'table', heading: '同一个物体，四个位置', head: ['离连线距离', '额外路程', '判决', '电平'], rows: [
            [`${ECHO_NEAR_LINE.offM} m`, `${ECHO_NEAR_LINE.excessM} m`, '不可分辨', `${ECHO_NEAR_LINE.dbm} dBm`],
            [`${ECHO_FLIP_UNDER.offM} m`, `${ECHO_FLIP_UNDER.excessM} m`, '不可分辨', `${ECHO_FLIP_UNDER.dbm} dBm`],
            [`${ECHO_FLIP_OVER.offM} m`, `${ECHO_FLIP_OVER.excessM} m`, '可分辨', `${ECHO_FLIP_OVER.dbm} dBm`],
            [`${ECHO_OFF_LINE.offM} m`, `${ECHO_OFF_LINE.excessM} m`, '可分辨', `${ECHO_OFF_LINE.dbm} dBm`],
          ],
        },
      ],
      expect: `判决在第二行与第三行之间翻转，物体只移动了 10 厘米；电平那一列自始至终单调下降。十米长的连线上，翻转位置在离连线约 1.8 米处。`,
      meaning: '翻转位置由本仿真器的门限与几何决定（②）；真实接收机在这一范围内是逐渐难以分辨，而不是一次翻转。',
    },
    {
      heading: '测距不受判决影响',
      jump: 3,
      steps: [
        '在本课场景里跳到这一轮算出的距离。',
        '与上一课「房间里空无一物」的同一时刻对照。',
      ],
      expect: '本课的三个场景里，14 个距离都与空房间逐字相同。',
      meaning: '这是本仿真器假定测距锁定首径（first path）的结果（②）；真实接收机测得的到达时刻会受未分辨回波的影响。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§16.2.4（峰值脉冲重复频率 499.2 MHz，Tc = 1/峰值脉冲重复频率，带宽不一定等于 1/Tc）、表 16-27（信道 9：7987.2 MHz，带宽 499.2 MHz，高频段必选）、§16.4.4 与表 16-28（发射脉冲与根升余弦参考脉冲的互相关约束）、§10.29.1.1（STS 相关得到信道冲激响应的估计）。0.60 米是一个码片乘以光速，不是标准正文里的数；标准没有规定接收机的分辨率。',
    'P802.15.4ab：感知列为草案第 10.40 条（15-26/0179r1，MLF9.40），本课不涉及其中任何帧或流程。本仿真器的取法与取值：以一个码片为分辨门限、一次比较给出是或否、判决与电平无关、测距锁定先到的峰、反射强度 −10 dB。',
  ],
  limits: [],
  scenario: () => uwbResolutionScenario('pair'),
  variants: [
    { label: `离连线 ${ECHO_FLIP_UNDER.offM} 米`, scenario: () => uwbResolutionScenario('under') },
    { label: `离连线 ${ECHO_FLIP_OVER.offM} 米`, scenario: () => uwbResolutionScenario('over') },
  ],
  jumps: [
    J('第一条回波', firstUwbEcho),
    J('不可分辨的那一条', firstUwbEchoMerged),
    J('可分辨的那一条', firstUwbEchoResolved),
    J('这一轮算出的距离', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: 'IEEE 802.15.4-2024 对接收机的分辨率规定了什么？',
      options: [
        '规定为一个码片',
        '没有规定；它只规定了码片时长、带宽与发射脉冲的形状，并注明带宽不一定等于码片时长的倒数',
        '规定为 0.60 米',
      ],
      answer: 1,
      explain: '一个码片的门限是本仿真器的取值；0.60 米是一个码片乘以光速，不是标准里的数。',
    },
    {
      q: '两个大小相同的物体，紧靠连线的那个回波电平更高，却被判定为不可分辨。为什么？',
      options: [
        '电平高的信号更容易使接收机过载',
        '它的额外路程只有几厘米，远小于一个码片折合的长度，本仿真器的判决只看额外路程',
        '紧靠连线的位置反射角不佳，相位发生紊乱',
      ],
      answer: 1,
      explain: '判决只取决于额外路程，与电平无关。它电平高，恰恰是因为它两段路径都短。',
    },
    {
      q: '在两米的连线上，物体要位于离连线多远处，本仿真器才判为可分辨？',
      options: [
        '只要不在连线上即可',
        `约 ${ECHO_FLIP_OFFSET_M} 米——把判决式对垂直距离反解即可得到，而且这个数随连线变长而增大`,
        '半个码片，也就是约 0.30 米',
      ],
      answer: 1,
      explain: '所以紧靠连线的盲区大小不是固定的：两台设备间距越大，它越宽。',
    },
  ],
}
