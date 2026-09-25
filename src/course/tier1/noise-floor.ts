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
  why: '上一课算出了信号到达时有多响。可只有响度说明不了什么：接收端的耳朵里始终有一层嗡嗡声，信号要从它上面冒出来才算数。这层声音有多厚，只由一件事决定——你在听多宽的一段频谱。而邻居一开口，它还会被垫高。',
  outcomes: [
    '按信道带宽（channel width）算出接收端的噪声地板（noise floor）',
    '用接收电平减去这块地板，得到一条链路（link）的信噪比（SNR）',
    '算出一个邻居让这条链路吃掉多少亏',
  ],
  needs: ['radio-primer'],
  terms: [
    { term: 'noise floor', plain: '接收端始终听得见的那点底噪；只跟听多宽有关，跟离得多远无关' },
    { term: 'SINR', plain: '信号比噪声、再加上其他人说话的声音，高出多少' },
  ],
  picture: [
    { heading: '这个房间的地板', text: '任何一个接收机，什么也没收的时候也不是静悄悄的：温度本身就在它的前端里搅出一片噪声。这片噪声的高度叫噪声地板（noise floor），而它只跟一件事走——你把耳朵张多宽。听 160 MHz 就收进 20 MHz 的八倍，而信号并不会因为你听得宽而变大。' },
    { kind: 'watch', jump: 0, heading: '去看一眼', text: '载入仿真，跳到笔记本的第一个数据帧（data frame）。四个变体的信道始终是 20 MHz，所以地板自始至终是同一个数；变的只有信号。四个位置上信号高出地板的那一截，依次是 62.3、41.3、21.7、15.9 dB——帧上的速率排的其实就是这四个数。' },
    { heading: '同时还有别人在说话', text: '噪声是地板，始终都在。邻居发出的一帧则是另一回事：它在空中的这段时间里，功率会叠到地板上，于是真正能用的是信号高出“噪声加干扰”的那一截——信干噪比（SINR）。真实的房子从不安静，所以这才是诚实的那个数。' },
  ],
  numbers: [
    { kind: 'formula', heading: '地板有多高', text: 'N(W) = −174 dBm/Hz + 10·log10(W) + 7 dB   →   N(20 MHz) = −93.99 dBm', note: '前两项是室温下的热噪声，第 3 项是接收机自己的噪声系数。信道每宽一倍，收进来的噪声就多一倍，也就是多 3.01 dB。' },
    { kind: 'table', heading: '各种带宽下的噪声地板', head: [
      '带宽', '20 MHz', '40 MHz', '80 MHz', '160 MHz', '320 MHz',
    ], rows: [
      ['噪声地板', '−93.99 dBm', '−90.98 dBm', '−87.97 dBm', '−84.96 dBm', '−81.95 dBm'],
    ] },
    { kind: 'steps', heading: '从接收电平到 SINR，一步一步算', items: [
      '按上面的公式算出当前带宽下的噪声地板：20 MHz 下是 −93.99 dBm。',
      '用上一课算出的接收信号强度指示（RSSI）减去它，就是 SNR：客厅那台笔记本是 −72.33 − (−93.99) = 21.66 dB。',
      '邻居在空中的这段时间里，把它当功率、而不是当分贝加到地板上：3.99 × 10⁻¹⁰ mW 加 3.16 × 10⁻⁹ mW 是 3.56 × 10⁻⁹ mW，也就是 −84.48 dBm。',
      '信号减去这块垫高了的地板，就是 SINR：−72.33 − (−84.48) = 12.16 dB，比刚才少 9.5 dB——而这只是一个邻居。',
    ] },
    { kind: 'table', heading: '同一块地板，四个位置', head: [
      '它在哪儿', 'RSSI', '噪声地板', 'SNR',
    ], rows: [
      ['书桌，1 m', '−31.7 dBm', '−93.99 dBm', '62.3 dB'],
      ['书房，5 m', '−52.7 dBm', '−93.99 dBm', '41.3 dB'],
      ['客厅，9 m + 砖墙', '−72.3 dBm', '−93.99 dBm', '21.7 dB'],
      ['远端墙边，14 m + 砖墙', '−78.1 dBm', '−93.99 dBm', '15.9 dB'],
    ] },
    { kind: 'widget', widget: 'linkBudget',
      params: { txDbm: 15, distanceM: 9, drywall: 0, brick: 1, glass: 0, mode: 'eht', widthMhz: 20 },
      caption: '上一课的四步加上这一课的两步，预设为客厅里的那台笔记本。拖动距离、加减墙体，接收电平跟着动而地板不动；换带宽则正好相反。' },
  ],
  deeper: [
    { kind: 'steps', heading: '两个 dBm 为什么不能直接相加', items: [
      'dBm 是对数写法，相加对应的是功率相乘，不是功率相加。要把功率加起来，先各自换回 mW。',
      '噪声 −93.99 dBm = 3.99 × 10⁻¹⁰ mW，邻居 −85 dBm = 3.16 × 10⁻⁹ mW，和是 3.56 × 10⁻⁹ mW = −84.48 dBm。较强的那一项占主导，噪声只让它多了 0.52 dB。',
      '两个同为 −85 dBm 的邻居是两倍功率，即 +3.01 dB：−81.99 dBm，而不是 −170。',
    ] },
    { heading: '仿真器是怎么判的', text: '它会记下一次接收期间任一瞬间出现过的最强干扰，并据此判定整帧——不是取平均，而是取最坏。所以一次很短但很响的打断，足以毁掉一整帧；后面讲碰撞时会再回到这件事。' },
    { heading: '为什么宽信道覆盖更近', text: '地板随带宽抬高，而信号不随带宽变大，于是同一个位置上，信道越宽 SNR 越低。20 MHz 上还能用第 3 级的那条链路，换到 160 MHz 只剩 12.6 dB，掉到最低那一级——更宽的信道买到的是更高的峰值速率，卖掉的是覆盖。' },
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
    '切到客厅变体看第一帧：数据帧从 0 走到 415.2 µs，16 µs 后路由器的确认帧（ACK）开始，到 459.2 µs 结束。这段时间里空中只有这一台设备——房间里没有第二个说话的人，所以这里的 SINR 就等于 SNR。',
    '四个变体各跑 100 ms，一次接收失败、一次重传（retry）都没有：地板是这条链路唯一要越过的东西。而把那个 −85 dBm 的邻居放进来，客厅只剩 12.16 dB——比远端墙边独享空口的 15.9 dB 还低。一个邻居，比再走五米更狠。',
  ],
  tryThis: [
    '在上面的小部件里把带宽从 20 MHz 换到 160 MHz，距离和砖墙都不动。接收电平纹丝不动停在 −72.3 dBm，地板却从 −93.99 抬到 −84.96 dBm，SNR 正好少 9.03 dB：21.7 掉到 12.6。',
    '把带宽调回 20 MHz，再把距离从 9 m 拉到 14 m，砖墙留着。接收电平掉到 −78.1 dBm，地板一点没动，SNR 15.9 dB：地板只跟带宽走，跟距离无关。',
  ],
  quiz: [
    {
      q: '路由器正在接收客厅那台笔记本（−72.33 dBm），此时邻居以 −85 dBm 到达。还剩多少？',
      options: [
        '还是 21.66 dB：别人的帧是信号，不是噪声',
        '约 12.16 dB：邻居叠到了噪声地板上',
        '一点不剩：两帧同时到达一定同归于尽',
      ],
      answer: 1,
      explain: '起作用的是 SINR。−85 dBm 远高于 −93.99 dBm 的地板，在相加里占主导，一口气拿走 9.5 dB。',
    },
    {
      q: '信道从 20 MHz 换成 160 MHz，其他不变。接收电平和地板会怎样？',
      options: [
        '两者都升高约 9 dB',
        '接收电平不变，地板升高约 9 dB 到 −84.96 dBm',
        '接收电平下降约 9 dB，地板不变',
      ],
      answer: 1,
      explain: '发出的功率没变，到达的也就不变；而监听带宽是八倍，收进的噪声也是八倍——9.03 dB，SNR 正好掉这么多。',
    },
  ],
}
