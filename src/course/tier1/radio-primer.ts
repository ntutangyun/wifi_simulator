/**
 * Wi-Fi Tier 1 · M1 · lesson 1: the opener of the whole course. One topic, and
 * the gentlest one there is — a transmitter's power, minus the distance, minus
 * every wall on the straight line, is the level that arrives.
 *
 * Re-paced on 2026-09-25 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md,
 * batch A). The lesson used to teach two things: the link budget AND the noise
 * floor with the neighbour on top of it. The second is now `noise-floor`, which
 * loads this lesson's own scene, and the six-step procedure is cut where the
 * two scenes divide: steps 1–4 here end on the RSSI, end to end; the floor, the
 * SNR and the interference sum are that lesson's own procedure.
 *
 * What went with it: the noise formula, the width table, the mW-by-mW sum, the
 * `linkBudget` widget (its payoff is the SINR line) and both quiz questions.
 * What was deleted outright: the two "people talking" restatements §5.2 names —
 * the voice image is kept exactly once, in `why`.
 *
 * The flat is now a `topology` figure built from the scenario itself, and the
 * paragraph that used to describe the walk — "distance spreads the power, and
 * the line crosses plasterboard or brick" — went with it; what is left beside
 * the picture is the one sentence the figure cannot say, that a decibel is a
 * ratio and ten of them are tenfold.
 *
 * Every number quoted below, and every figure inside the diagram, is pinned in
 * tests/course/radio-primer.test.ts.
 */
import type { TopologySpec } from '../diagram'
import { WALL_LOSS_DB, pathLossDb, wallsCrossed } from '../../engine/propagation'
import { J, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

/**
 * The four places the variants walk the laptop through, with the room name the
 * figure prints. `d` is the metre mark on the flat's centre line, which is
 * where the variant puts the laptop and where the figure puts its box.
 */
const PLACES: readonly { id: string; label: string; d: number }[] = [
  { id: 'desk', label: '书桌', d: 1 },
  { id: 'study', label: '书房', d: 5 },
  { id: 'living', label: '客厅', d: 9 },
  { id: 'far', label: '墙边', d: 14 },
]

/** The lane the router is drawn on; chosen so no label of the figure lands on another. */
const RADIO_PRIMER_AP_LANE = 2

/**
 * The flat, as the run sees it: the router where the scenario puts it, the four
 * laptop positions at their own metre marks, and on each line what that leg
 * takes off — the engine's own path loss, plus the wall the engine's own ray
 * test finds on the two far legs.
 *
 * The four places lie on one straight line in the flat, so the figure spreads
 * them down the lanes to keep the boxes apart; the horizontal axis is the real
 * distance, and `radio-primer.test.ts` compares every x with the scenario and
 * every label with `pathLossDb` and `WALL_LOSS_DB`.
 */
export function radioPrimerTopology(): TopologySpec {
  const base = primerScenario(9)
  const ap = base.nodes.find((n) => n.id === 'ap')!
  const legLabel = (d: number): string => {
    const s = primerScenario(d)
    const sta = s.nodes.find((n) => n.id === 'sta-1')!
    const walls = wallsCrossed(sta.pos, ap.pos, s.walls)
    const wallDb = walls.reduce((n, m) => n + WALL_LOSS_DB[m], 0)
    return wallDb ? `${pathLossDb(d).toFixed(1)}+${wallDb}` : pathLossDb(d).toFixed(1)
  }
  return {
    kind: 'topology',
    nodes: [
      // `y` is a lane, not a metre: the four places are collinear in the flat, so the
      // figure spreads them down four lanes and keeps the router clear of all of them.
      { id: 'ap', label: '路由器', role: 'ap', x: ap.pos.x, y: RADIO_PRIMER_AP_LANE },
      ...PLACES.map((p, i) => ({
        id: p.id,
        label: p.label,
        role: 'sta' as const,
        x: primerScenario(p.d).nodes.find((n) => n.id === 'sta-1')!.pos.x,
        y: i,
      })),
    ],
    links: PLACES.map((p) => ({ from: 'ap', to: p.id, label: legLabel(p.d) })),
  }
}

export const radioPrimer: Lesson = {
  id: 'radio-primer',
  module: 0,
  title: '信号到达接收端时有多强',
  why: '一个无线信号的功率，随距离增加而减小，每穿过一堵墙又再衰减一部分——这相当于房间里的人声：走远一些，声音就变小；中间再关上一道门，声音又小一些。这个房间里的每一个决定——以什么速率发送、是否等待、是否重新发送——都从同一个量开始：信号到达接收端时的强度，也就是接收信号强度指示（received signal strength indicator, RSSI）。它以 dBm 为单位，采用对数刻度：每相差十分贝，功率相差十倍。计算它只需要减法：从发射功率（transmit power）出发，减去路径损耗（path loss）——第一米的损耗最大，此后距离每增加一倍，损耗再增加约九分贝——再按材质减去两根天线（antenna）之间那条直线穿过的每一堵墙的损耗；一堵砖墙造成的损耗，相当于把距离增大到两倍半。同一台笔记本从书桌移到隔着砖墙的远端墙边，电平下降四十多分贝，它发送数据帧（data frame）的速率也随之降到原来的十分之一；路由器回复的确认帧（acknowledgement, ACK）本来就以低速发送，几乎不受影响。但到达电平只是第一个量：信号还必须高于接收端固有的噪声，这是下一课的内容。',
  outcomes: [
    '读出一条链路（link）到达接收端时的电平',
    '说出笔记本移远、或中间隔一堵墙时，这个数如何变化、变化多少',
    '从发射功率（transmit power）出发，逐步算出接收电平',
  ],
  needs: [],
  terms: [
    { term: 'RSSI', plain: '目标信号到达接收端时的功率电平；这一课算的就是它' },
    { term: 'SNR', plain: '信号比接收端固有的噪声高出多少；这种噪声在下一课讲' },
  ],
  picture: [
    { heading: '要记的第一个数', text: '接收端记下的第一个数，是目标信号到达时的功率电平——这就是接收信号强度指示（RSSI）。它以 dBm 为单位，采用对数刻度：每相差十分贝，功率相差十倍。−30 dBm 相当于紧挨着路由器发送，−80 dBm 相当于隔着半个房间，两者相差的五十分贝就是十万倍。' },
    { kind: 'watch', jump: 0, heading: '在仿真中观察', text: '载入仿真，跳到笔记本的第一个数据帧（data frame），然后依次切换变体：书桌、书房、客厅、远端墙边。笔记本、路由器和业务始终不变，改变的只是这一帧到达时的电平——而帧的速率随之逐级下降。紧跟在每个数据帧之后的那一小段，是路由器收到后回复的确认帧（acknowledgement, ACK），第二个跳转按钮跳转到的就是它。' },
    {
      kind: 'diagram', heading: '各段路径的损耗', spec: radioPrimerTopology(),
      caption: '本场景的平面图：路由器在书房靠墙的架子上，笔记本沿中线逐渐远离（图中上下错开，只是为了把四个位置区分开）。每条线上的数字是这一段的损耗分贝数；后两条多出的 12，就是书房与客厅之间那堵砖墙的损耗。',
    },
    { heading: '还有第二个数', text: '但只知道到达电平还不够：环境中始终存在噪声，信号必须高于噪声才能被正确解码。信号高出噪声的部分称为信噪比（SNR）；噪声有多高，在下一课讲。' },
  ],
  numbers: [
    { kind: 'formula', heading: '到达的是多少', text: 'RSSI = P_tx − (46.7 + 30·log10(d / 1 m)) − Σ 墙体损耗', note: '距离每翻一倍，损耗增加 9.0 dB，所以一堵砖墙相当于把距离增大到两倍半。' },
    { kind: 'steps', heading: '从发射功率到接收电平的计算步骤', items: [
      '从发送端的发射功率出发：这台笔记本 15 dBm，路由器 20 dBm。',
      '减去路径损耗（path loss）：第一米 46.7 dB，此后距离每增大十倍，再减去 30 dB——9 m 处共 75.3 dB。',
      '看两根天线（antenna）之间那条直线穿过哪几堵墙：按平面图上的二维射线判定，穿过门洞或窗洞的不算。',
      '按材质减去每堵墙的损耗：石膏板 5 dB、砖墙 12、玻璃 3。客厅这条线只穿过一堵砖墙，结果为 −72.3 dBm，即 RSSI。',
    ] },
    { kind: 'table', heading: '同一台笔记本，四个位置', head: [
      '位置', '损耗（dB）', 'RSSI', '发送速率',
    ], rows: [
      ['书桌，1 m', '46.7', '−31.7 dBm', '172.1 Mb/s'],
      ['书房，5 m', '67.7', '−52.7 dBm', '129.0 Mb/s'],
      ['客厅，9 m + 砖墙', '75.3 + 12', '−72.3 dBm', '34.4 Mb/s'],
      ['远端墙边，14 m + 砖墙', '81.1 + 12', '−78.1 dBm', '17.2 Mb/s'],
    ] },
  ],
  deeper: [
    { heading: '分贝，以及功率为什么不能按 dB 相加', text: 'dB 是比值，10·log10(P1/P2)；dBm 是相对 1 mW 的功率，是绝对值。+3 dB 是功率翻倍，−3 dB 是减半，+10 dB 是乘以十。dBm − dBm 得 dB，dBm + dB 得 dBm，但两个 dBm 永远不能直接相加，要先换成 mW。路由器发 100 mW（20 dBm），笔记本发 31.6 mW（15 dBm）；隔着 9 m 和一堵砖墙之后，这台笔记本的信号到达路由器时只有 5.85 × 10⁻⁸ mW，也就是 −72.3 dBm。' },
    { heading: '路由器的回复帧', text: '路由器的回复帧几乎不受这些影响：前三个变体都是 24 Mb/s，只有到远端墙边才降到 12 Mb/s，空口时间分别为 28 µs 和 32 µs。回复帧使用低速的强制速率，速率只按较大的档位变化，而数据帧的时长已经增大到近六倍。' },
    { text: '距离按三维计算，两端的天线都在地面以上 1 m；穿墙则按平面图上的二维射线判断。6 GHz 链路的损耗还要多 1.2 dB，这是更高频率增加的自由空间损耗。' },
  ],
  limits: [
    // `out-of-scope` rather than `unmodelled`: the engine models both fading layers
    // (`engine/fading.ts`) and has since the selectivity slice — what this limit really names is
    // 「本课的场景没有打开」, a property of this scene. Corrected when the `fading` lesson landed
    // the scene that does open it; criterion A in `tests/course/limits.test.ts` is the rule.
    { kind: 'out-of-scope', text: '默认没有衰落：到达电平只由几何距离和穿过的墙决定，同一个位置永远得到同一个值。真实室内链路即使两端不动，电平也会随环境变化起伏若干分贝。编辑器的「时变链路（衰落）」一节可以把阴影衰落与小尺度衰落打开，本课的场景没有打开。', until: 'fading' },
    { kind: 'unmodelled', text: '场景再加上 selectivity 这一节，衰落就不再是整条信道一个值：信道按 2.03125 MHz 一格——标准自己给信道质量指示（channel quality indicator, CQI）用的那个 26 音调资源单元——各自独立取值一次，因此同一时刻一部分格处于深度衰落、一部分不受影响。仍然没有的是时延扩展本身与多普勒：格与格之间在这里是独立的，没有任何时延参数把它们关联起来，而独立正是分集偏多的那一边。本课的场景两节都没有写，所以整个信道带宽共用同一个衰落值，所有子载波同时增强、同时减弱。' },
    { kind: 'model-value', text: '第一米的 46.7 dB 与其后 3.0 的路径损耗指数都是模型取值：前者是 5.2 GHz 的自由空间损耗，后者是室内典型值，标准对两者都没有规定。' },
    { kind: 'model-value', text: '墙的损耗按类型取固定值（石膏板 5 dB、砖墙 12 dB、玻璃 3 dB），与入射角度、厚度和材料含水量都无关。真实墙体这三样都影响损耗。' },
    { kind: 'unmodelled', text: '信号只走直线穿墙：没有绕射，没有沿走廊的波导效应，也没有从天花板与家具的反射。' },
  ],
  sources: [
    '路径损耗用的是对数距离模型：第一米的 46.7 dB 是 5.2 GHz 的自由空间损耗，其后 3.0 的路径损耗指数是室内典型值——两者都是模型取值，并非标准正文。',
    '每穿一堵墙的损耗（石膏板 5 dB、砖墙 12 dB、玻璃 3 dB）以及 6 GHz 多出的 1.2 dB，都是本仿真器的常数，取值落在常见室内实测的范围内。',
  ],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [
    '在四个变体里分别读出第一个数据帧的速率：172.1、129.0、34.4、17.2 Mb/s。笔记本、路由器和业务完全一样，差别只有距离和那一堵砖墙。',
    '前 100 ms 里，路由器确认了书桌位置的 353 帧，远端墙边却只有 107 帧，不到三分之一。差别完全来自距离与砖墙造成的 46 dB 损耗。',
  ],
  tryThis: [
    '在编辑器里把笔记本沿中线从 4.5 m 移到 9 m，再移到 18 m，砖墙位置不变。接收电平依次是 −63.3、−72.3、−81.4 dBm：距离每增加一倍，电平下降的幅度相同。',
    '在编辑器里打开客厅变体，把书房与客厅之间那堵砖墙改成玻璃。接收电平升到 −63.3 dBm——正是 4.5 m 隔砖墙时的那个数——帧速率也从 34.4 Mb/s 升到 86.0 Mb/s。',
  ],
  quiz: [
    {
      q: '笔记本从 4.5 m 移到 9 m，砖墙位置不变。接收电平下降多少？',
      options: [
        '3 dB：距离翻倍，功率减半',
        '约 9 dB：这个模型里距离每翻一倍就是 9.0 dB',
        '30 dB：公式里写着 30',
      ],
      answer: 1,
      explain: '30 是距离增大十倍对应的分贝数；距离翻一倍只对应 30·log10(2) = 9.03 dB，−63.3 变成 −72.3 dBm。',
    },
    {
      q: '客厅那条线上的砖墙换成玻璃，其余不变。RSSI 会怎样？',
      options: [
        '不变：墙只挡视线',
        '升高 9 dB：12 dB 的砖墙换成 3 dB 的玻璃',
        '升高 12 dB：相当于那堵墙完全不存在',
      ],
      answer: 1,
      explain: '玻璃仍有 3 dB 损耗，减少的损耗是 12 − 3 = 9 dB：−72.3 变成 −63.3 dBm。',
    },
  ],
}
