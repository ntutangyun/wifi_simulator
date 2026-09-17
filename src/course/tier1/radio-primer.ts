/**
 * Tier 1, M1, lesson 1: how strong the signal is. dB and dBm, transmit power,
 * the log-distance path loss and wall losses, the noise floor per width, and
 * SNR/SINR — the first half of the PHY contract the MAC depends on. Every
 * number is pinned by tests/course/tier1-radio-primer.test.ts.
 */
import { J, N, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

export const radioPrimer: Lesson = {
  id: 'radio-primer',
  module: 0,
  title: { en: 'How strong is the signal — the link budget', zh: '信号有多强——链路预算' },
  body: [
    { text: {
      en: 'This course trains MAC engineers, so the physical layer is treated as a contract. The MAC hands the radio a frame and an MCS; the receiver reports whether it heard the frame and whether it decoded it, and the frame costs a known airtime. Every one of those answers starts from one number: how strong the wanted signal is compared with everything else the receiver hears. This lesson builds that number, with the simulator’s own formulas and constants.',
      zh: '这门课培养的是 MAC 工程师，所以物理层在这里被当作一份“契约”：MAC 把一帧和一个 MCS 交给射频，接收端报告有没有听到这一帧、能否解出来，而这一帧要花掉一段确定的空口时间。所有这些答案都从同一个数出发：目标信号与接收机听到的其他一切相比有多强。本课就用仿真器自己的公式和常数把这个数算出来。',
    } },

    { heading: { en: 'Decibels: ratios and absolute power', zh: '分贝：比值与绝对功率' }, text: {
      en: 'Radio powers span many orders of magnitude, from 100 mW leaving a router to a few hundred-millionths of a milliwatt across the flat, so engineers use logarithms. A ratio in decibels is 10·log10(P1/P2); a dBm value is a power compared with 1 mW, so it is absolute.',
      zh: '射频功率跨越许多个数量级：路由器发出 100 mW，到了房子另一头的接收机只剩几亿分之一毫瓦，所以工程上用对数。两个功率的比值用分贝（dB）表示：10·log10(P1/P2)；dBm 则是相对 1 mW 的功率，是一个绝对值。',
    } },
    { kind: 'formula', text: {
      en: 'P[dBm] = 10·log10(P / 1 mW)        P[mW] = 10^(P[dBm] / 10)',
      zh: 'P[dBm] = 10·log10(P / 1 mW)        P[mW] = 10^(P[dBm] / 10)',
    }, note: {
      en: '+3 dB doubles a power and −3 dB halves it; +10 dB multiplies it by ten. dBm − dBm gives dB, and dBm + dB gives dBm. Two dBm values are never added directly: convert to mW first.',
      zh: '+3 dB 是功率翻倍，−3 dB 是减半，+10 dB 是乘以十。dBm − dBm 得到 dB，dBm + dB 得到 dBm；两个 dBm 永远不能直接相加，要先换成 mW。',
    } },
    { kind: 'table', head: [
      { en: 'Power', zh: '功率' }, N('dBm'), { en: 'Where you meet it', zh: '在哪里见到' },
    ], rows: [
      [N('100 mW'), N('20'), { en: 'Transmit power of the router in these lessons', zh: '本课程中路由器的发射功率' }],
      [N('31.6 mW'), N('15'), { en: 'Transmit power of a laptop or phone', zh: '笔记本或手机的发射功率' }],
      [N('1 mW'), N('0'), { en: 'The reference', zh: '参考点' }],
      [N('5.85 × 10⁻⁸ mW'), N('−72.3'), { en: 'The laptop, heard 9 m away through a brick wall', zh: '9 m 外隔一堵砖墙收到的笔记本信号' }],
    ] },

    { heading: { en: 'Path loss and walls', zh: '路径损耗与墙体损耗' }, text: {
      en: 'Received power is transmit power minus losses. The simulator uses a log-distance model: 46.7 dB in the first metre (free space at 5.2 GHz), then an exponent of 3.0, typical indoors. Every wall the straight line between the antennas crosses adds a fixed loss, unless that line passes through a door or window opening. Distance is 3D; walls are counted along the 2D floor-plan ray.',
      zh: '接收功率 = 发射功率 − 各项损耗。仿真器用的是对数距离模型：第一米损耗 46.7 dB（5.2 GHz 的自由空间损耗），此后路径损耗指数为 3.0，这是室内的典型值。两根天线之间的直线每穿过一堵墙，就再加一份固定损耗；如果直线正好穿过门洞或窗洞，这堵墙不计。距离按三维计算，穿墙按平面图上的二维射线判断。',
    } },
    { kind: 'formula', text: {
      en: 'RSSI = P_tx − (46.7 + 30·log10(d / 1 m)) − Σ walls',
      zh: 'RSSI = P_tx − (46.7 + 30·log10(d / 1 m)) − Σ 墙体损耗',
    }, note: {
      en: 'Walls: drywall 5 dB, brick 12 dB, glass 3 dB per crossing. With exponent 3, doubling the distance costs 9.0 dB and ten times the distance costs 30 dB. A brick wall costs 12 dB, the same as moving 2.5 times further away.',
      zh: '每穿过一次：石膏板墙 5 dB，砖墙 12 dB，玻璃 3 dB。指数为 3 时，距离翻倍多损耗 9.0 dB，距离乘以十多损耗 30 dB。一堵砖墙的 12 dB，相当于把距离拉远到 2.5 倍。',
    } },
    { kind: 'widget', widget: 'linkBudget',
      params: { txDbm: 15, distanceM: 9, drywall: 0, brick: 1, glass: 0, mode: 'eht', widthMhz: 20 },
      caption: {
        en: 'Preset to the laptop in the living room: 15 dBm, 9 m, one brick wall. Path loss 75.3 dB plus 12 dB of brick gives an RSSI of −72.3 dBm, and with a noise floor of −94.0 dBm the SNR is 21.7 dB.',
        zh: '预设为客厅里的笔记本：15 dBm、9 m、一堵砖墙。路径损耗 75.3 dB 加砖墙 12 dB，RSSI 为 −72.3 dBm；噪声底 −94.0 dBm，所以 SNR 为 21.7 dB。',
      } },

    { heading: { en: 'The noise floor', zh: '噪声底' }, text: {
      en: 'A receiver never hears silence. Thermal noise has a power of kTB: −174 dBm in every hertz at room temperature, times the bandwidth. The receiver’s own electronics add a noise figure (NF), 7 dB here, the same default as ns-3. Noise grows with the width of the PPDU being received, so each doubling of the channel adds 3 dB of noise; the signal does not grow, because the same transmit power is spread over the wider channel.',
      zh: '接收机永远听不到真正的安静。热噪声功率为 kTB：室温下每赫兹 −174 dBm，乘以带宽。接收机自身的电路再叠加一个噪声系数（NF），这里取 7 dB，与 ns-3 的默认值相同。噪声随所接收 PPDU 的带宽增长，带宽每翻一倍多 3 dB；信号却不会跟着变大，因为同样的发射功率被摊到了更宽的信道上。',
    } },
    { kind: 'formula', text: {
      en: 'N(W) = −174 dBm/Hz + 10·log10(W) + NF   →   N(20 MHz) = −100.99 + 7 = −93.99 dBm',
      zh: 'N(W) = −174 dBm/Hz + 10·log10(W) + NF   →   N(20 MHz) = −100.99 + 7 = −93.99 dBm',
    } },
    { kind: 'table', head: [
      { en: 'Width', zh: '带宽' }, N('20 MHz'), N('40 MHz'), N('80 MHz'), N('160 MHz'), N('320 MHz'),
    ], rows: [
      [{ en: 'Noise floor', zh: '噪声底' }, N('−93.99 dBm'), N('−90.98 dBm'), N('−87.97 dBm'), N('−84.96 dBm'), N('−81.95 dBm')],
    ] },

    { heading: { en: 'SNR and SINR', zh: 'SNR 与 SINR' }, text: {
      en: 'SNR is the wanted signal over the noise, in dB: subtract the noise floor from the RSSI. When other transmitters are on the air, their power adds to the noise and the ratio becomes the signal-to-interference-plus-noise ratio, SINR. Powers add in milliwatts, never in dB. Take the living-room laptop at −72.33 dBm with a neighbour’s frame arriving at −85 dBm during it:',
      zh: 'SNR 是目标信号与噪声之比（dB）：用 RSSI 减去噪声底。空中还有别的发射机时，它们的功率叠加到噪声上，比值就成了信干噪比 SINR。功率要按毫瓦相加，绝不能按 dB 相加。以客厅里的笔记本为例：信号 −72.33 dBm，期间邻居的一帧以 −85 dBm 到达：',
    } },
    { kind: 'steps', items: [
      { en: 'Noise: −93.99 dBm = 3.99 × 10⁻¹⁰ mW. Interference: −85 dBm = 3.16 × 10⁻⁹ mW.', zh: '噪声：−93.99 dBm = 3.99 × 10⁻¹⁰ mW；干扰：−85 dBm = 3.16 × 10⁻⁹ mW。' },
      { en: 'Sum: 3.56 × 10⁻⁹ mW = −84.48 dBm. The stronger term dominates, and the noise adds only 0.52 dB to it.', zh: '相加：3.56 × 10⁻⁹ mW = −84.48 dBm。较强的一项占主导，噪声只让它多了 0.52 dB。' },
      { en: 'SINR = −72.33 − (−84.48) ≈ 12.16 dB, down from an SNR of 21.66 dB. One neighbour cost this link 9.5 dB.', zh: 'SINR = −72.33 − (−84.48) ≈ 12.16 dB，而 SNR 本来是 21.66 dB：一个邻居就吃掉了 9.5 dB。' },
    ] },
    { text: {
      en: 'Two equal powers add to +3 dB, so two interferers at −85 dBm sum to −81.99 dBm. The simulator keeps the worst interference seen at any instant during a reception and judges the whole frame by it. What the receiver then does with this SINR — detect, decode, or neither — is the next lesson.',
      zh: '两个相等的功率相加是 +3 dB，所以两个 −85 dBm 的干扰合起来是 −81.99 dBm。仿真器会记录一次接收过程中任一时刻出现过的最强干扰，并用它来判定整帧。接收机拿到这个 SINR 之后能做什么——检测、解码，还是都做不到——是下一课的内容。',
    } },

    { kind: 'list', heading: { en: 'In the simulation', zh: '在仿真里看' }, items: [
      { en: 'A router and a laptop, both 1 m above the floor, Wi-Fi 7 at 20 MHz. The laptop uploads as fast as it can, one 1500-byte MSDU per frame, and nothing else is on the air.', zh: '一台路由器和一台笔记本，天线都离地 1 m，Wi-Fi 7、20 MHz。笔记本全速上传，每帧一个 1500 字节的 MSDU，空中没有别的发射机。' },
      { en: 'The four variants move the laptop along the flat’s centre line: 1, 5, 9 and 14 m from the router, the last two behind the brick wall. The lesson opens at 9 m, the geometry preset in the widget.', zh: '四个变体沿房子中线移动笔记本：距路由器 1、5、9、14 m，后两个位置隔着砖墙。本课打开时位于 9 m，也就是小部件预设的几何位置。' },
    ] },
  ],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK', '第一个 ACK', firstAck),
  ],
  observe: [
    { en: 'Jump to the first data frame in each variant and read its rate: 172.1, 129.0, 34.4 and 17.2 Mbps. Type the same four geometries into the widget — 1 m, 5 m, 9 m + one brick, 14 m + one brick, all at 15 dBm — and it names exactly those rates. The link budget is the whole explanation.', zh: '在每个变体里跳到第一个数据帧，读出速率：172.1、129.0、34.4、17.2 Mbps。把同样四种几何位置输入小部件——1 m、5 m、9 m + 一堵砖墙、14 m + 一堵砖墙，都是 15 dBm——它给出的正是这四个速率。链路预算就是全部解释。' },
    { en: 'In the first 100 ms the router acknowledges 353 frames from the desk but only 107 from the far wall, fewer than a third as many. The MAC is identical in both; 46 dB of path loss and brick is the entire difference.', zh: '前 100 ms 里，路由器确认了书桌位置的 353 帧，远端墙边却只有 107 帧，不到三分之一。两边的 MAC 完全一样，差别全在那 46 dB 的路径与砖墙损耗上。' },
    { en: 'The white ACK barely notices the link budget. It goes out at 24 Mbps and 28 µs in the first three variants and only at the far wall drops to 12 Mbps and 32 µs: control frames use a low, mandatory rate, so they change in coarse steps while the data blocks stretch fivefold.', zh: '白色的 ACK 几乎不受链路预算影响：前三个变体里都是 24 Mbps、28 µs，只有到了远端墙边才降到 12 Mbps、32 µs。控制帧使用低速的强制速率，只会粗粒度地变化，而数据块的时长已经拉长到五倍。' },
  ],
  tryThis: [
    { en: 'In the widget, walk the distance slider 4.5 → 9 → 18 m with one brick wall: the RSSI reads −63.3, −72.3 and −81.4 dBm. Each doubling costs 9.0 dB, exactly as the exponent-3 model says.', zh: '在小部件里把距离滑杆依次调到 4.5 → 9 → 18 m（保留一堵砖墙）：RSSI 依次是 −63.3、−72.3、−81.4 dBm。每翻一倍距离要付 9.0 dB，与指数 3 的模型完全一致。' },
    { en: 'Open the living-room variant in the editor, select the brick wall between study and living room and change its material to glass. The wall loss falls from 12 dB to 3 dB, the RSSI rises to −63.3 dBm — the same value the 4.5 m brick case gives — and the frames speed up from 34.4 to 86.0 Mbps.', zh: '在编辑器里打开客厅变体，选中书房与客厅之间的砖墙，把材质改成玻璃。墙体损耗从 12 dB 降到 3 dB，RSSI 升到 −63.3 dBm（正好与 4.5 m 隔砖墙的情形相同），帧速率从 34.4 Mbps 提高到 86.0 Mbps。' },
  ],
  quiz: [
    {
      q: { en: 'A frame arrives with two interferers, each at −85 dBm. What is the total interference?', zh: '一帧到达时有两个干扰源，各为 −85 dBm。总干扰是多少？' },
      options: [
        { en: '−170 dBm', zh: '−170 dBm' },
        { en: 'About −82 dBm', zh: '约 −82 dBm' },
        { en: '−85 dBm, because equal interferers do not add', zh: '−85 dBm——相等的干扰不会叠加' },
      ],
      answer: 1,
      explain: { en: 'Powers add in milliwatts. Two equal powers make twice the power, which is +3 dB: −81.99 dBm. Adding dBm values directly, as in −170, has no physical meaning.', zh: '功率按毫瓦相加：两个相等的功率就是两倍，即 +3 dB，得到 −81.99 dBm。直接把 dBm 相加（−170）没有任何物理意义。' },
    },
    {
      q: { en: 'The channel goes from 20 MHz to 160 MHz and nothing else changes. What happens to the RSSI and to the noise floor?', zh: '信道从 20 MHz 换成 160 MHz，其他都不变。RSSI 和噪声底会怎样？' },
      options: [
        { en: 'Both rise by 9 dB', zh: '两者都升高 9 dB' },
        { en: 'The RSSI is unchanged; the noise floor rises by about 9 dB, from −93.99 to −84.96 dBm', zh: 'RSSI 不变；噪声底升高约 9 dB，从 −93.99 到 −84.96 dBm' },
        { en: 'The RSSI falls by 9 dB; the noise floor is unchanged', zh: 'RSSI 下降 9 dB；噪声底不变' },
      ],
      answer: 1,
      explain: { en: 'The transmitter sends the same total power, so the received power is the same; the receiver takes in eight times the noise bandwidth, which is three doublings, 9.03 dB. That is why wide channels reach less far.', zh: '发射机发出的总功率没变，收到的功率也就不变；而接收机收进的噪声带宽是八倍，相当于翻三倍，即 9.03 dB。这就是宽信道覆盖更近的原因。' },
    },
  ],
}
