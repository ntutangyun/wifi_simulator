/**
 * Wi-Fi Tier 1 · M1 · lesson 2: the second half of the old `radio-primer` —
 * the floor the signal has to clear, and what a neighbour does to it.
 *
 * Born of the 2026-09-25 re-pacing
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, batch A). The
 * link budget and the noise floor were one lesson teaching two rules; this is
 * the second. It loads `radio-primer`'s own scene — same builder, same four
 * variants — so the recorded timeline hashes are that lesson's run under a
 * second id, and nothing new is simulated.
 *
 * What arrived here from `radio-primer`: the kTB formula and its note, the
 * width table, the mW-by-mW interference sum, the `linkBudget` widget (its
 * payoff is the SINR line) and both quiz questions. The procedure was cut where
 * the scenes divide: `radio-primer` ends on the RSSI, and this lesson's own
 * four steps start from it and end on the SINR.
 *
 * Note what the scene does NOT contain: a second transmitter. Nobody else ever
 * talks in this flat, so the SINR line is arithmetic the reader does rather
 * than a figure they read off the timeline — and the lesson says so, in the
 * second `observe` line, instead of pretending otherwise.
 *
 * Every number quoted below is pinned in tests/course/noise-floor.test.ts.
 */
import { J, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

export const noiseFloor: Lesson = {
  id: 'noise-floor',
  module: 0,
  title: '这段带宽上的噪声地板',
  why: '上一课算出了信号到达时有多强。但仅凭强度还无法判断能否正确接收：接收端始终存在固有的噪声，信号必须高于它才能被正确解码，这一噪声电平称为噪声地板（noise floor）。它是室温下的热噪声加上接收机自身的噪声系数，只取决于一个因素——接收的频谱有多宽：信道带宽（channel width）每加宽一倍，噪声地板就升高约三分贝，与距离无关。到达电平减去噪声地板，就是信噪比（signal-to-noise ratio, SNR）；在同一个信道上，四个位置的噪声地板是同一个值，帧的速率高低实际上就是按这四个 SNR 排列的。信号并不会因为带宽更宽而增大，所以信道加宽到八倍，同一位置的 SNR 就降低约九分贝——宽信道带来的是更高的峰值速率，代价是覆盖范围缩小。邻居一旦开始发送，它的功率就以毫瓦为单位叠加到噪声地板上，两项中较强的一项起主导作用，真正起作用的是信干噪比（signal-to-interference-plus-noise ratio, SINR）。客厅那台笔记本只多了一个邻居，SINR 就降低将近十分贝，比把它再移远五米的损失还大。仿真器按整帧期间最差的那一时刻判定，所以一次很短但很强的干扰，就足以使整帧接收失败。',
  outcomes: [
    '按信道带宽（channel width）算出接收端的噪声地板（noise floor）',
    '用接收电平减去噪声地板，得到一条链路（link）的信噪比（SNR）',
    '算出一个邻居让这条链路的信干噪比（signal-to-interference-plus-noise ratio, SINR）下降多少',
  ],
  needs: ['radio-primer'],
  terms: [
    { term: 'noise floor', plain: '接收端始终存在的噪声电平；只与接收带宽有关，与距离无关' },
    { term: 'SINR', plain: '信号比噪声与其他发送方的干扰之和高出多少' },
  ],
  picture: [
    { heading: '这个房间的噪声地板', text: '任何一个接收机，在没有接收任何信号时输出也不为零：温度本身就会在它的前端产生噪声。这一噪声的电平称为噪声地板（noise floor），它只取决于一个因素——接收带宽有多宽。接收 160 MHz 就收进 20 MHz 的八倍噪声，而信号并不会因为带宽更宽而增大。' },
    { kind: 'watch', jump: 0, heading: '在仿真中观察', text: '载入仿真，跳到笔记本的第一个数据帧（data frame）。四个变体的信道始终是 20 MHz，所以噪声地板始终是同一个值；改变的只有信号。四个位置上信号高出噪声地板的差值依次是 62.3、41.3、21.7、15.9 dB——帧的速率高低实际上就是按这四个数排列的。' },
    { heading: '同时还有其他设备在发送', text: '噪声地板始终存在。邻居发出的一帧则不同：在它占用空口的这段时间里，它的功率会叠加到噪声地板上，因此真正起作用的是信号高出“噪声加干扰”的部分——信干噪比（SINR）。真实的住宅里总有其他设备在发送，所以这个量才反映实际情况。' },
  ],
  numbers: [
    { kind: 'formula', heading: '噪声地板有多高', text: 'N(W) = −174 dBm/Hz + 10·log10(W) + 7 dB   →   N(20 MHz) = −93.99 dBm', note: '前两项是室温下的热噪声，第 3 项是接收机自身的噪声系数。信道每加宽一倍，收进的噪声功率就增加一倍，也就是增加 3.01 dB。' },
    { kind: 'table', heading: '各种带宽下的噪声地板', head: [
      '带宽', '20 MHz', '40 MHz', '80 MHz', '160 MHz', '320 MHz',
    ], rows: [
      ['噪声地板', '−93.99 dBm', '−90.98 dBm', '−87.97 dBm', '−84.96 dBm', '−81.95 dBm'],
    ] },
    { kind: 'steps', heading: '从接收电平到 SINR 的计算步骤', items: [
      '按上面的公式算出当前带宽下的噪声地板：20 MHz 下是 −93.99 dBm。',
      '用上一课算出的接收信号强度指示（RSSI）减去它，就是 SNR：客厅那台笔记本是 −72.33 − (−93.99) = 21.66 dB。',
      '在邻居占用空口的这段时间里，把它按功率、而不是按分贝加到噪声地板上：3.99 × 10⁻¹⁰ mW 加 3.16 × 10⁻⁹ mW 是 3.56 × 10⁻⁹ mW，也就是 −84.48 dBm。',
      '信号减去抬高后的噪声地板，就是 SINR：−72.33 − (−84.48) = 12.16 dB，比上一步低 9.5 dB——而这只是一个邻居造成的。',
    ] },
    { kind: 'table', heading: '同一噪声地板，四个位置', head: [
      '位置', 'RSSI', '噪声地板', 'SNR',
    ], rows: [
      ['书桌，1 m', '−31.7 dBm', '−93.99 dBm', '62.3 dB'],
      ['书房，5 m', '−52.7 dBm', '−93.99 dBm', '41.3 dB'],
      ['客厅，9 m + 砖墙', '−72.3 dBm', '−93.99 dBm', '21.7 dB'],
      ['远端墙边，14 m + 砖墙', '−78.1 dBm', '−93.99 dBm', '15.9 dB'],
    ] },
    { kind: 'widget', widget: 'linkBudget',
      params: { txDbm: 15, distanceM: 9, drywall: 0, brick: 1, glass: 0, mode: 'eht', widthMhz: 20 },
      caption: '上一课的四步加上这一课的两步，预设为客厅里的那台笔记本。拖动距离、增减墙体，接收电平随之变化而噪声地板不变；改变带宽则正好相反。' },
  ],
  deeper: [
    { kind: 'steps', heading: '两个 dBm 为什么不能直接相加', items: [
      'dBm 是对数表示，相加对应的是功率相乘，不是功率相加。要把功率相加，先各自换算成 mW。',
      '噪声 −93.99 dBm = 3.99 × 10⁻¹⁰ mW，邻居 −85 dBm = 3.16 × 10⁻⁹ mW，和是 3.56 × 10⁻⁹ mW = −84.48 dBm。较强的一项起主导作用，噪声只使总和增加 0.52 dB。',
      '两个同为 −85 dBm 的邻居是两倍功率，即 +3.01 dB：−81.99 dBm，而不是 −170。',
    ] },
    { heading: '仿真器的判定方式', text: '它记录一次接收期间任一时刻出现过的最强干扰，并据此判定整帧——不是取平均值，而是取最差值。所以一次很短但很强的干扰，就足以使整帧接收失败；后面讲碰撞时还会讨论这一点。' },
    { heading: '为什么宽信道的覆盖范围更小', text: '噪声地板随带宽升高，而信号不随带宽增大，因此在同一个位置上，信道越宽 SNR 越低。在 20 MHz 上还能使用第 3 级的那条链路，换到 160 MHz 后只有 12.6 dB，降到最低一级——更宽的信道提高的是峰值速率，代价是覆盖范围缩小。' },
  ],
  limits: [
    { kind: 'model-value', text: '接收端噪声系数取 7 dB（与 ns-3 默认值相同），而且全场所有电台共用这一个值。真实设备各不相同，低成本接收机的噪声系数可能高出好几分贝。' },
    { kind: 'threshold', text: '干扰判定取整帧期间最差的那一时刻：只要有一个时刻信干噪比不足就判为失败。真实接收机按整帧累积的误码来判定，一次短暂的干扰尖峰未必导致这一帧接收失败。' },
    { kind: 'unmodelled', text: '没有 Wi-Fi 与 UWB 之外的噪声源：没有微波炉、没有蓝牙、没有邻居家的网络，噪声地板只有热噪声这一项。' },
    { kind: 'unmodelled', text: '这一课里分子也不随时间变化：衰落默认关闭，所以同一条链路的比值是一个定值。编辑器的「时变链路（衰落）」一节可以打开它，让到达电平（信号与干扰都包括在内）随时间起伏；噪声地板本身不受影响，仍然只取决于带宽。场景再加上 selectivity 一节，分子还会按格分别计算：分母在每一格都相同，而分子按 2.03125 MHz 一格各自独立取值一次，于是这一课的那个比值有了与格数相同个数的取值，判决使用的是它们按容量合成后的值。干扰在那里仍然是平坦的——一个重叠的发送在每一格里都记为同一个功率，这对热噪声是精确的，对一个干扰源则是一种简化。多普勒仍然没有建模。' },
  ],
  sources: [
    '噪声地板是热噪声：室温下每赫兹 −174 dBm，乘以带宽的赫兹数，再加接收端自己的噪声系数。本仿真器取 7 dB，与 ns-3 的默认值相同；标准自己的灵敏度表假设的是 10 dB，下一课要用到这个差值。',
    '把同时到达的信号按毫瓦相加，是接收机的物理事实，不是某一条标准条款；而“取整帧期间最差的那一瞬间”是本仿真器的判定方式，真实接收机按整帧的误码累积来判。',
  ],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [
    '切到客厅变体看第一帧：数据帧从 0 持续到 415.2 µs，16 µs 后路由器的确认帧（ACK）开始，到 459.2 µs 结束。这段时间里空口上只有这一对设备在发送——房间里没有其他发送方，所以这里的 SINR 就等于 SNR。',
    '四个变体各跑 100 ms，没有出现任何一次接收失败或重传（retry）：噪声地板是这条链路唯一需要超过的电平。而加入那个 −85 dBm 的邻居后，客厅只有 12.16 dB——比远端墙边独占空口时的 15.9 dB 还低。一个邻居的影响，比距离再增加五米还大。',
  ],
  tryThis: [
    '在上面的小部件里把带宽从 20 MHz 换到 160 MHz，距离和砖墙都不变。接收电平保持在 −72.3 dBm 不变，噪声地板却从 −93.99 升高到 −84.96 dBm，SNR 正好降低 9.03 dB：从 21.7 降到 12.6。',
    '把带宽调回 20 MHz，再把距离从 9 m 增大到 14 m，保留砖墙。接收电平降到 −78.1 dBm，噪声地板没有变化，SNR 为 15.9 dB：噪声地板只取决于带宽，与距离无关。',
  ],
  quiz: [
    {
      q: '路由器正在接收客厅那台笔记本（−72.33 dBm），此时邻居以 −85 dBm 到达。信号还高出多少？',
      options: [
        '仍是 21.66 dB：其他设备的帧是信号，不是噪声',
        '约 12.16 dB：邻居的功率叠加到了噪声地板上',
        '为零：两帧同时到达时一定都无法接收',
      ],
      answer: 1,
      explain: '起作用的是 SINR。−85 dBm 远高于 −93.99 dBm 的噪声地板，在相加中起主导作用，使结果比 SNR 低 9.5 dB。',
    },
    {
      q: '信道从 20 MHz 换成 160 MHz，其他不变。接收电平和地板会怎样？',
      options: [
        '两者都升高约 9 dB',
        '接收电平不变，噪声地板升高约 9 dB 到 −84.96 dBm',
        '接收电平下降约 9 dB，噪声地板不变',
      ],
      answer: 1,
      explain: '发送端的功率没有变，到达电平也就不变；而接收带宽是八倍，收进的噪声也是八倍——即 9.03 dB，SNR 正好降低这么多。',
    },
  ],
}
