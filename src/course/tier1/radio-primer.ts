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
  title: '一个无线信号到达时有多响',
  why: '一个无线信号，就是房间里的一个人声：走远一点就轻了，中间再关上一道门，又轻一层。这个房间里的每一个决定——发多快、要不要等、要不要重来——都从同一个数开始：信号到达对面时还剩多响。这一课把它算出来。',
  outcomes: [
    '读出一条链路（link）到达接收端时有多响',
    '说出笔记本走远、或中间隔上一堵墙时，这个数往哪个方向变、变多少',
    '从发射功率（transmit power）出发，一步一步算到接收电平',
  ],
  needs: [],
  terms: [
    { term: 'RSSI', plain: '想听的那个信号到达接收端时有多响；这一课算的就是它' },
    { term: 'SNR', plain: '它比接收端始终听得见的那点噪声高出多少；那点噪声是下一课的事' },
  ],
  picture: [
    { heading: '要记的第一个数', text: '接收端记下的第一个数，是想听的那个信号到达时有多响——这就是接收信号强度指示（RSSI）。它用 dBm 写，是一把对数尺：每差十格，功率就差十倍。−30 dBm 是贴着路由器说话，−80 dBm 是隔着半间屋子，这中间的五十格是一百万倍。' },
    { kind: 'watch', jump: 0, heading: '去看一眼', text: '载入仿真，跳到笔记本的第一个数据帧（data frame），然后依次切换变体：书桌、书房、客厅、远端墙边。笔记本、路由器和业务自始至终没变，变的只是这一帧到达时有多响——而帧上的速率跟着一路往下走。' },
    {
      kind: 'diagram', heading: '这一路要被拿走多少', spec: radioPrimerTopology(),
      caption: '本场景的平面图：路由器在书房靠墙的架子上，笔记本沿中线越走越远（图里上下错开，只为把四个位置分得开）。每条线上的数字是这一段扣掉的分贝；后两条多出来的 12，就是书房与客厅之间那堵砖墙。',
    },
    { heading: '还有第二个数', text: '可光知道到达时有多响还不够：屋里始终有一层噪声，信号得从它上面冒出来才算数。信号高出这层噪声的那一截叫信噪比（SNR）；它有多厚，是下一课的事。' },
  ],
  numbers: [
    { kind: 'formula', heading: '到达的是多少', text: 'RSSI = P_tx − (46.7 + 30·log10(d / 1 m)) − Σ 墙体损耗', note: '距离翻倍要付 9.0 dB，所以一堵砖墙相当于把距离拉远到两倍半。' },
    { kind: 'steps', heading: '从发射功率到接收电平，一步一步算', items: [
      '从发送端的发射功率出发：这台笔记本 15 dBm，路由器 20 dBm。',
      '减去路径损耗（path loss）：第一米 46.7 dB，此后距离每涨十倍再减 30 dB——9 m 处共 75.3 dB。',
      '看两根天线（antenna）之间那条直线穿过哪几堵墙：按平面图上的二维射线判定，穿过门洞或窗洞的不算。',
      '按材质减掉每堵墙：石膏板 5 dB、砖墙 12、玻璃 3。客厅这条线只穿一堵砖墙，剩下 −72.3 dBm，就是 RSSI。',
    ] },
    { kind: 'table', heading: '同一台笔记本，四个位置', head: [
      '它在哪儿', '扣掉的分贝', 'RSSI', '它发帧的速率',
    ], rows: [
      ['书桌，1 m', '46.7', '−31.7 dBm', '172.1 Mb/s'],
      ['书房，5 m', '67.7', '−52.7 dBm', '129.0 Mb/s'],
      ['客厅，9 m + 砖墙', '75.3 + 12', '−72.3 dBm', '34.4 Mb/s'],
      ['远端墙边，14 m + 砖墙', '81.1 + 12', '−78.1 dBm', '17.2 Mb/s'],
    ] },
  ],
  deeper: [
    { heading: '分贝，以及功率为什么不能按 dB 相加', text: 'dB 是比值，10·log10(P1/P2)；dBm 是相对 1 mW 的功率，是绝对值。+3 dB 是功率翻倍，−3 dB 是减半，+10 dB 是乘以十。dBm − dBm 得 dB，dBm + dB 得 dBm，但两个 dBm 永远不能直接相加，要先换成 mW。路由器发 100 mW（20 dBm），笔记本发 31.6 mW（15 dBm）；隔着 9 m 和一堵砖墙之后，这台笔记本在路由器处只剩 5.85 × 10⁻⁸ mW，也就是 −72.3 dBm。' },
    { heading: '路由器的回帧又如何', text: '路由器的回帧几乎不受这些影响：前三个变体都是 24 Mb/s，只有到远端墙边才降到 12 Mb/s，空口时间 28 µs 对 32 µs。回帧走的是低速的强制速率，只会粗粒度地跳档，而数据帧的时长已经拉长到近六倍。' },
    { text: '距离按三维算，两端的天线都在地面以上 1 m；穿墙则按平面图上的二维射线判断。6 GHz 链路还要再付 1.2 dB，那是更高频率多出来的自由空间损耗。' },
  ],
  sources: [
    '路径损耗用的是对数距离模型：第一米的 46.7 dB 是 5.2 GHz 的自由空间损耗，其后 3.0 的路径损耗指数是室内典型值——两者都是模型取值，并非标准正文。',
    '每穿一堵墙的损耗（石膏板 5 dB、砖墙 12 dB、玻璃 3 dB）以及 6 GHz 多付的 1.2 dB，都是本仿真器的常数，取值落在常见室内实测的范围内。',
  ],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [
    '在四个变体里分别读出第一个数据帧的速率：172.1、129.0、34.4、17.2 Mb/s。笔记本、路由器和业务完全一样，差别只有距离和那一堵砖墙。',
    '前 100 ms 里，路由器确认了书桌位置的 353 帧，远端墙边却只有 107 帧，不到三分之一。差别全在那 46 dB 的距离与砖墙。',
  ],
  tryThis: [
    '在编辑器里把笔记本沿中线从 4.5 m 挪到 9 m，再挪到 18 m，砖墙保持不动。接收电平依次是 −63.3、−72.3、−81.4 dBm：距离每翻一倍，就往下掉同样的一格。',
    '在编辑器里打开客厅变体，把书房与客厅之间那堵砖墙改成玻璃。接收电平升到 −63.3 dBm——正是 4.5 m 隔砖墙时的那个数——帧速率也从 34.4 Mb/s 升到 86.0 Mb/s。',
  ],
  quiz: [
    {
      q: '笔记本从 4.5 m 挪到 9 m，砖墙不动。接收电平掉多少？',
      options: [
        '3 dB：距离翻倍，功率减半',
        '约 9 dB：这个模型里距离每翻一倍就是 9.0 dB',
        '30 dB：公式里写着 30',
      ],
      answer: 1,
      explain: '30 是距离涨十倍要付的分贝；翻一倍只是 30·log10(2) = 9.03 dB，−63.3 变成 −72.3 dBm。',
    },
    {
      q: '客厅那条线上的砖墙换成玻璃，其余不动。RSSI 会怎样？',
      options: [
        '不变：墙只挡视线',
        '升高 9 dB：12 dB 的砖墙换成 3 dB 的玻璃',
        '升高 12 dB：那堵墙整个没了',
      ],
      answer: 1,
      explain: '玻璃仍要拿走 3 dB，省下的是 12 − 3 = 9 dB：−72.3 变成 −63.3 dBm。',
    },
  ],
}
