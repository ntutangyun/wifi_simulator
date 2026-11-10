/**
 * Wi-Fi Tier 1 · M1 · lesson 1: the opener of the whole course — how strong a
 * signal arrives.
 *
 * Standard-first shape (2026-11-11, the Wi-Fi pass after the UWB one; see
 * docs/superpowers/plans/2026-11-10-uwb-standard-alignment.md for the rule). ① is what
 * IEEE Std 802.11-2024 says about the received level: RSSI is a relative 0–255 RXVECTOR
 * parameter (§17.2.3, Table 27-1), the absolute indicator is RCPI (§17.3.10.7, §9.4.2.36),
 * transmit power is chosen under TPC (§4.5.5.2, §11.7), and propagation is not specified at
 * all. ② is where this simulator's own link budget lives — the log-distance law, the wall
 * table, the fixed transmit powers, the exact dBm level with no RSSI coding — each marked
 * against ①. ③ walks the four variants and two editor changes; every figure is read back
 * out of the lesson text and compared with the engine in tests/course/radio-primer.test.ts.
 *
 * The flat is still a `topology` figure built from the scenario itself, now in lab 1.
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
  why: '这个房间里的每一个决定——以什么速率发送、是否等待、是否重新发送——都从同一个量开始：信号到达接收端时的强度。IEEE Std 802.11-2024 对这个量规定了两种报告方式：接收信号强度指示（received signal strength indicator, RSSI）是接收机在接收前导码（preamble）期间测得的一个 0 到 255 的相对值，只要求随接收功率单调增加，没有单位；以 dBm 为基准、误差不超过 ±5 dB 的是接收信道功率指示（received channel power indicator, RCPI）。发射功率（transmit power）由设备在法规与接入点（access point, AP）通告的最大值之内自行选择。信号从发送天线（antenna）到接收天线损失多少，标准完全不规定，任何仿真器都必须自己选一个传播模型。本仿真器直接用 dBm 表示到达电平，并且只用减法计算：发射功率减去路径损耗（path loss）——第一米 46.7 dB，此后距离每增加一倍再增加 9.0 dB——再按材质减去两根天线之间那条直线穿过的每一堵墙；一堵砖墙的 12 dB 相当于把距离增大到两倍半。同一台笔记本从书桌移到隔着砖墙的远端墙边，到达电平下降四十多分贝，它发送数据帧（data frame）的速率降到原来的十分之一；路由器回复的确认帧（acknowledgement, ACK）以低速发送，几乎不受影响。到达电平还必须高于接收端的噪声，这是下一课的内容。',
  outcomes: [
    '说出标准里的 RSSI 与 RCPI 各是什么，哪一个以 dBm 为基准',
    '分清标准规定了什么（功率的选择与报告），没有规定什么（传播）',
    '按本仿真器的模型，从发射功率逐步算出一条链路（link）的接收电平',
  ],
  needs: [],
  terms: [
    { term: 'RSSI', plain: '接收信号强度指示：标准里是接收机报告的 0 到 255 的相对值；本仿真器直接用 dBm 表示到达电平' },
    { term: 'RCPI', plain: '接收信道功率指示：标准里以 dBm 为基准的接收功率报告，0.5 dB 一级，误差不超过 ±5 dB' },
    { term: 'SNR', plain: '信号比接收端固有的噪声高出多少；这种噪声在下一课讲' },
  ],
  standard: [
    { heading: 'RSSI 是一个相对值（§17.2.3，表 27-1）', text: 'RSSI 是接收向量（RXVECTOR）里的一个参数：物理层（physical layer, PHY）在接收前导码期间测得的天线接口处的功率，取值 0 到 255；HE 格式的 PPDU（PHY protocol data unit）在接收 HE-LTF 期间测量。标准只要求它是接收功率的单调递增函数，并说明它用于相对比较；它没有单位，标准也不要求把它换算成 dBm。' },
    { heading: '以 dBm 为基准的是 RCPI（§17.3.10.7，§9.4.2.36）', text: 'RCPI 是对一个接收到的 PPDU、在所选信道内测得的接收射频功率。在接收机的动态范围内，它与实际功率（dBm）的误差不超过 ±5 dB（95% 置信区间）。RCPI 元素用一个八位组承载它：0 表示低于 −109.5 dBm，220 表示 0 dBm 及以上，其间以 0.5 dB 为一级。开启无线测量时，物理层在接收结束的 PHY-RXEND.indication 原语里报告 RCPI（§8.3.5.15）。' },
    { heading: '发射功率怎样选择（§4.5.5.2，§11.7）', text: '标准不规定一台设备用多大的发射功率，它规定的是发射功率控制（transmit power control, TPC）服务。站点（station, STA）按接入点在 Country 元素与 Power Constraint 元素里通告的值，确定当前信道的法规最大发射功率与本地最大发射功率（§11.7.5）；在这两个最大值之内，站点可以选择任意发射功率（§11.7.6）；它可以依据路径损耗与链路余量（link margin）的估计动态调整功率，调整的方法不在标准范围之内（§11.7.7）。每一次发送用哪一档功率，由发送向量的 TXPWR_LEVEL_INDEX 参数在设备预设的几档功率中选出（§17.3.11）。' },
    { heading: '传播：标准不规定', text: '信号从发送天线到接收天线损失多少，IEEE Std 802.11-2024 正文不作规定：标准没有路径损耗公式，也没有墙体损耗表。标准只规定两端——发送端怎样选择功率，接收端怎样报告收到的功率。' },
    { kind: 'steps', heading: '一条链路的接收电平，按标准：逐步说明', items: [
      '发送端先确定法规最大功率与本地最大功率（§11.7.5），再在两者之内选一档发射功率（§11.7.6）。',
      '信号经过环境传播；损失多少由环境决定，标准不规定。',
      '接收端在接收前导码期间测得 RSSI，作为相对值交给媒体访问控制（medium access control, MAC）层（§17.2.3）。',
      '开启无线测量时，接收结束时再报告这一帧的 RCPI（§8.3.5.15），以 dBm 为基准，误差不超过 ±5 dB（§17.3.10.7）。',
    ] },
  ],
  implementation: [
    { topic: '到达电平的表示', standard: 'RSSI 是 0 到 255 的相对值，没有单位（§17.2.3）', sim: '直接用 dBm 表示到达电平，没有 0 到 255 的编码，也没有测量误差；日志与面板里的“接收信号强度指示”都是这个精确的 dBm 值。', kind: 'differs' },
    { topic: 'RCPI', standard: '以 dBm 为基准、误差 ±5 dB、0.5 dB 一级（§17.3.10.7，§9.4.2.36）', sim: '未实现：引擎不产生 RCPI，也不发送任何测量报告。', kind: 'absent' },
    { topic: '发射功率', standard: '由设备在 TPC 约束之内选择（§11.7.6）', sim: '每台设备一个固定值，整个运行期间不变：本课的笔记本 15 dBm，路由器 20 dBm。', kind: 'value' },
    { topic: '发射功率控制', standard: '通告法规与本地最大功率，可按路径损耗调整功率（§11.7）', sim: '未实现：没有最大发射功率的通告与检查，功率从不调整。', kind: 'absent' },
    { topic: '路径损耗', standard: '标准不规定', sim: '对数距离模型：损耗 = 46.7 + 30·log10(d / 1 m) dB。46.7 dB 是 5.2 GHz 第一米的自由空间损耗，30 对应路径损耗指数 3.0，距离每增加一倍损耗增加 9.0 dB。距离按三维计算，两端天线都在地面以上 1 m。', kind: 'choice' },
    { topic: '墙体损耗', standard: '标准不规定', sim: '每堵墙按材质取固定值：石膏板 5 dB、砖墙 12 dB、玻璃 3 dB，与入射角度和厚度无关。是否穿墙按平面图上的二维直线判定，穿过门洞或窗洞的不算。', kind: 'value' },
    { topic: '多径与衰落', standard: '标准不规定', sim: '只算直线：没有反射、绕射，也没有沿走廊的波导效应。本课的场景没有打开衰落，同一位置永远得到同一个电平；编辑器的「时变链路（衰落）」一节可以打开它。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '四个位置的到达电平',
      jump: 0,
      more: [0, 1, 2, 3],
      steps: [
        '依次载入书桌、书房、客厅、远端墙边四个变体，每次跳到笔记本的第一个数据帧。',
        '对照下图与下表读出每个位置的损耗、到达电平与这一帧的速率。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '各段路径的损耗', spec: radioPrimerTopology(),
          caption: '本场景的平面图：路由器在书房靠墙的架子上，笔记本沿中线逐渐远离（图中上下错开，只是为了把四个位置区分开）。每条线上的数字是这一段的损耗分贝数；后两条多出的 12，是书房与客厅之间那堵砖墙的损耗。',
        },
        { kind: 'table', heading: '同一台笔记本，四个位置', head: ['位置', '损耗（dB）', '到达电平', '第一个数据帧的速率'], rows: [
          ['书桌，1 m', '46.7', '−31.7 dBm', '172.1 Mb/s'],
          ['书房，5 m', '67.7', '−52.7 dBm', '129.0 Mb/s'],
          ['客厅，9 m + 砖墙', '75.3 + 12', '−72.3 dBm', '34.4 Mb/s'],
          ['远端墙边，14 m + 砖墙', '81.1 + 12', '−78.1 dBm', '17.2 Mb/s'],
        ] },
      ],
      expect: '到达电平从 −31.7 dBm 降到 −78.1 dBm，相差 46.4 dB；第一个数据帧的速率从 172.1 Mb/s 降到 17.2 Mb/s。前 100 ms 里，路由器确认了书桌位置的 353 帧，远端墙边只有 107 帧。',
      meaning: '这些电平全部来自本仿真器的路径损耗与墙体损耗模型（②），标准对传播没有任何规定（①）。速率怎样随电平变化，在后面两课讲。',
    },
    {
      heading: '逐步算出客厅的到达电平',
      jump: 0,
      steps: [
        '载入本课场景（客厅，9 m），跳到笔记本的第一个数据帧。',
        '按下表从发射功率出发逐项相减。',
      ],
      blocks: [
        { kind: 'formula', heading: '本仿真器的链路计算', text: '到达电平 = P_tx − (46.7 + 30·log10(d / 1 m)) − Σ 墙体损耗', note: '这是本仿真器的传播模型，不是标准的规定。' },
        { kind: 'table', heading: '客厅那台笔记本', head: ['项目', '数值'], rows: [
          ['笔记本的发射功率', '15 dBm'],
          ['9 m 的路径损耗', '75.3 dB'],
          ['直线穿过的墙', '一堵砖墙，12 dB'],
          ['到达路由器的电平', '−72.3 dBm'],
        ] },
      ],
      expect: '15 − 75.3 − 12 = −72.3 dBm；反方向上路由器以 20 dBm 发送，到达笔记本的电平是 −67.3 dBm。',
      meaning: '两个方向只差发射功率的 5 dB：本仿真器的传播是对称的，损耗只取决于距离和墙（②）。',
    },
    {
      heading: '距离加倍与换一种墙',
      variant: 3,
      more: [2],
      steps: [
        '载入远端墙边变体（14 m），再在编辑器里把笔记本移到 7 m，两次都隔着同一堵砖墙。',
        '载入客厅变体，在编辑器里把书房与客厅之间那堵砖墙改成玻璃。',
        '每次读出到达电平与第一个数据帧的速率。',
      ],
      blocks: [
        { kind: 'table', heading: '两次修改', head: ['场景', '到达电平', '第一个数据帧的速率'], rows: [
          ['7 m + 砖墙', '−69.1 dBm', '51.6 Mb/s'],
          ['14 m + 砖墙', '−78.1 dBm', '17.2 Mb/s'],
          ['9 m + 砖墙', '−72.3 dBm', '34.4 Mb/s'],
          ['9 m + 玻璃', '−63.3 dBm', '86.0 Mb/s'],
        ] },
      ],
      expect: '7 m 到 14 m，电平下降 9.0 dB；砖墙换成玻璃，电平升高 9.0 dB，速率从 34.4 Mb/s 升到 86.0 Mb/s。',
      meaning: '距离加倍的 9.0 dB 来自路径损耗指数 3.0，砖墙与玻璃之差 12 − 3 = 9 dB 来自墙体损耗表（②），两个数恰好相等。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§17.2.3 与表 27-1（RSSI，0 到 255，相对值）、§17.3.10.7 与 §9.4.2.36（RCPI，±5 dB，0.5 dB 一级）、§8.3.5.15（PHY-RXEND.indication 携带 RCPI）、§4.5.5.2 与 §11.7（发射功率控制）、§17.3.11（TXPWR_LEVEL_INDEX）。',
    '本仿真器的取值与取法：对数距离路径损耗（第一米 46.7 dB，指数 3.0）、墙体损耗（石膏板 5 dB、砖墙 12 dB、玻璃 3 dB）、固定发射功率（笔记本 15 dBm、路由器 20 dBm）、以精确的 dBm 值表示到达电平。',
  ],
  limits: [],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '标准里的 RSSI 与 RCPI，哪一个以 dBm 为基准？',
      options: [
        'RSSI：它就是接收电平的 dBm 值',
        'RCPI：RSSI 只是 0 到 255 的相对值，RCPI 以 dBm 为基准，误差不超过 ±5 dB',
        '两者都不是：标准不报告接收功率',
      ],
      answer: 1,
      explain: '§17.2.3 只要求 RSSI 随接收功率单调增加、用于相对比较；§17.3.10.7 要求 RCPI 与实际 dBm 的误差不超过 ±5 dB。本仿真器两者都不模拟，直接用精确的 dBm 值。',
    },
    {
      q: '笔记本从 7 m 移到 14 m，两次都隔着同一堵砖墙。到达电平下降多少？',
      options: [
        '3 dB：距离翻倍，功率减半',
        '约 9 dB：本仿真器的模型里距离每翻一倍就是 9.0 dB',
        '30 dB：公式里写着 30',
      ],
      answer: 1,
      explain: '30 是距离增大十倍对应的分贝数；距离翻一倍只对应 30·log10(2) = 9.0 dB，−69.1 变成 −78.1 dBm。这是本仿真器的取值，标准不规定传播。',
    },
    {
      q: '客厅那条线上的砖墙换成玻璃，其余不变。到达电平会怎样？',
      options: [
        '不变：墙只挡视线',
        '升高 9 dB：12 dB 的砖墙换成 3 dB 的玻璃',
        '升高 12 dB：相当于那堵墙完全不存在',
      ],
      answer: 1,
      explain: '玻璃在本仿真器里仍有 3 dB 损耗，减少的是 12 − 3 = 9 dB：−72.3 变成 −63.3 dBm。',
    },
  ],
}
