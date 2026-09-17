/**
 * Tier 1, M1, lesson 1: the radio primer. The PHY taught as the contract the
 * MAC depends on — dBm, path loss and walls, the noise floor, SINR, detection
 * thresholds and the MCS ladder as a table of SINR requirements — with the
 * simulator's own numbers. Every number quoted here is pinned by
 * tests/course/tier1-radio-primer.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { J, N, firstAck, firstData, longApartment, node, sc, type Lesson } from '../lessonKit'

/**
 * A router on a shelf against the study's left wall and one laptop uploading
 * flat out, both antennas 1 m above the floor, Wi-Fi 7 at 20 MHz. Aggregation
 * is off, so every data frame is one 1500-byte MSDU (1530 octets on the air).
 * The laptop sits on the flat's centre line `distanceM` metres from the router;
 * beyond 5.5 m the direct ray crosses the brick wall between study and living room.
 */
export function primerScenario(distanceM: number): Scenario {
  const feats = { edca: true, qam4k: true }
  const ap = node('ap', 'Router', 'ap', 0.5, 4, 'eht', 'idle', feats, 1)
  const sta = node('sta-1', 'Laptop', 'sta', 0.5 + distanceM, 4, 'eht', 'saturated', feats, 1)
  ap.caps.widthMhz = 20
  sta.caps.widthMhz = 20
  return sc(longApartment(), [ap, sta])
}

export const radioPrimer: Lesson = {
  id: 'radio-primer',
  module: 0,
  minutes: 40,
  title: { en: 'Radio primer for MAC engineers', zh: '写给 MAC 工程师的射频入门' },
  body: [
    { text: {
      en: 'This course trains MAC engineers, so the physical layer is treated as a contract. The MAC hands the radio a frame and an MCS. A receiver reports whether it detected the frame and whether it decoded it, and the frame costs a known airtime. Both answers depend on one number, the SINR. This lesson explains where that number comes from and which thresholds it is compared with. It uses the same formulas and constants as the simulator.',
      zh: '这门课培养的是 MAC 工程师，所以物理层在这里被当作一份“契约”：MAC 把一帧和一个 MCS 交给射频，接收端报告是否检测到了这一帧、能否解出来，而这一帧要花掉一段确定的空口时间。两个答案都取决于同一个数：信干噪比（SINR）。本课讲清这个数从哪里来、要和哪些门限比较，用的公式和常数与仿真器完全一致。',
    } },

    { heading: { en: 'Decibels: ratios and absolute power', zh: '分贝：比值与绝对功率' }, text: {
      en: 'Radio powers span many orders of magnitude, from 100 mW leaving a router to a few hundred-millionths of a milliwatt at a receiver across the flat. Engineers therefore use logarithms. A ratio in decibels is 10·log10(P1/P2). A dBm value is a power compared with 1 mW, so it is absolute.',
      zh: '射频功率跨越许多个数量级：路由器发出 100 mW，到了房子另一头的接收机只剩几亿分之一毫瓦。所以工程上用对数。两个功率的比值用分贝（dB）表示：10·log10(P1/P2)；dBm 则是相对 1 mW 的功率，是一个绝对值。',
    } },
    { kind: 'formula', text: {
      en: 'P[dBm] = 10·log10(P / 1 mW)        P[mW] = 10^(P[dBm] / 10)',
      zh: 'P[dBm] = 10·log10(P / 1 mW)        P[mW] = 10^(P[dBm] / 10)',
    }, note: {
      en: '+3 dB doubles a power and −3 dB halves it. +10 dB multiplies it by ten. dBm − dBm gives dB, and dBm + dB gives dBm. Two dBm values are never added directly; convert to mW first.',
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
      en: 'Received power is transmit power minus losses. The simulator uses a log-distance model: 46.7 dB of loss in the first metre (free space at 5.2 GHz), then an exponent of 3.0, which is typical indoors. Every wall the straight line between the antennas crosses adds a fixed loss, unless the line passes through a door or window opening. Distance is measured in 3D. Walls are counted along the 2D floor-plan ray.',
      zh: '接收功率 = 发射功率 − 各项损耗。仿真器用的是对数距离模型：第一米损耗 46.7 dB（5.2 GHz 的自由空间损耗），此后路径损耗指数为 3.0，这是室内的典型值。两根天线之间的直线每穿过一堵墙，就再加一份固定损耗；如果直线正好穿过门洞或窗洞，这堵墙不计。距离按三维计算，穿墙按平面图上的二维射线判断。',
    } },
    { kind: 'formula', text: {
      en: 'RSSI = P_tx − (46.7 + 30·log10(d / 1 m)) − Σ walls',
      zh: 'RSSI = P_tx − (46.7 + 30·log10(d / 1 m)) − Σ 墙体损耗',
    }, note: {
      en: 'Walls: drywall 5 dB, brick 12 dB, glass 3 dB per crossing. With exponent 3, doubling the distance costs 9.0 dB and ten times the distance costs 30 dB.',
      zh: '每穿过一次：石膏板墙 5 dB，砖墙 12 dB，玻璃 3 dB。指数为 3 时，距离翻倍多损耗 9.0 dB，距离乘以十多损耗 30 dB。',
    } },
    { kind: 'widget', widget: 'linkBudget',
      params: { txDbm: 15, distanceM: 9, drywall: 0, brick: 1, glass: 0, mode: 'eht', widthMhz: 20 },
      caption: {
        en: 'Preset to the laptop in the living room: 15 dBm, 9 m, one brick wall. Path loss 75.3 dB plus 12 dB of brick gives an RSSI of −72.3 dBm. The noise floor is −94.0 dBm, so the SNR is 21.7 dB and the best MCS is 3.',
        zh: '预设为客厅里的笔记本：15 dBm、9 m、一堵砖墙。路径损耗 75.3 dB 加砖墙 12 dB，RSSI 为 −72.3 dBm；噪声底 −94.0 dBm，所以 SNR 为 21.7 dB，最高可用 MCS 3。',
      } },

    { heading: { en: 'The noise floor', zh: '噪声底' }, text: {
      en: 'A receiver never hears silence. Thermal noise has a power of kTB: −174 dBm in every hertz at room temperature, times the bandwidth. The receiver’s own electronics add a noise figure (NF), which is 7 dB here, the same default as ns-3. Noise grows with the width of the PPDU being received, so each doubling of the channel adds 3 dB of noise. The signal does not grow: the transmit power is spread over the wider channel.',
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
      en: 'SNR is signal over noise. When other transmitters are also on the air, their power adds to the noise, and the ratio becomes the signal-to-interference-plus-noise ratio, SINR. Powers add in milliwatts, not in dB. Take the living-room laptop at −72.33 dBm, with a neighbour’s frame arriving at −85 dBm during it:',
      zh: 'SNR 是信号与噪声之比。空中还有别的发射机时，它们的功率叠加到噪声上，比值就成了信干噪比 SINR。功率要按毫瓦相加，而不是按 dB 相加。以客厅里的笔记本为例：信号 −72.33 dBm，期间邻居的一帧以 −85 dBm 到达：',
    } },
    { kind: 'steps', items: [
      { en: 'Noise: −93.99 dBm = 3.99 × 10⁻¹⁰ mW. Interference: −85 dBm = 3.16 × 10⁻⁹ mW.', zh: '噪声：−93.99 dBm = 3.99 × 10⁻¹⁰ mW；干扰：−85 dBm = 3.16 × 10⁻⁹ mW。' },
      { en: 'Sum: 3.56 × 10⁻⁹ mW = −84.48 dBm. The stronger term dominates, and noise adds only 0.52 dB.', zh: '相加：3.56 × 10⁻⁹ mW = −84.48 dBm。较强的一项占主导，噪声只多贡献了 0.52 dB。' },
      { en: 'SINR = −72.33 − (−84.48) ≈ 12.16 dB (unrounded), down from an SNR of 21.66 dB.', zh: 'SINR = −72.33 − (−84.48) ≈ 12.16 dB（按未取整数值计算），而 SNR 本来是 21.66 dB。' },
    ] },
    { text: {
      en: 'Two equal powers add to +3 dB, so two interferers at −85 dBm sum to −81.99 dBm. The simulator also keeps the worst interference seen at any point during a reception and judges the whole frame by it.',
      zh: '两个相等的功率相加是 +3 dB，所以两个 −85 dBm 的干扰合起来是 −81.99 dBm。仿真器还会记录一次接收过程中任何时刻出现过的最强干扰，并用它来判定整帧。',
    } },

    { heading: { en: 'What the receiver reports to the MAC', zh: '接收机向 MAC 报告什么' }, text: {
      en: 'The MAC sees three thresholds. They answer different questions, so do not mix them up:',
      zh: 'MAC 看到的是三道门限。它们回答的是不同的问题，不要混为一谈：',
    } },
    { kind: 'table', head: [
      { en: 'Threshold', zh: '门限' }, { en: 'Condition', zh: '条件' }, { en: 'What the MAC gets', zh: 'MAC 得到什么' },
    ], rows: [
      [{ en: 'Preamble detection (§17.3.10.6)', zh: '前导码检测（§17.3.10.6）' }, { en: 'RSSI ≥ −82 dBm and SINR ≥ 4 dB when the preamble arrives', zh: '前导码到达时 RSSI ≥ −82 dBm 且 SINR ≥ 4 dB' }, { en: 'A reception starts and CCA is busy. If the frame then fails to decode, the MAC waits EIFS. A preamble at or above −82 dBm that fails the 4 dB test is recorded as RX_MISS: no reception and no EIFS.', zh: '开始接收，CCA 置忙；之后若解码失败，MAC 要等 EIFS。功率达到 −82 dBm 却没通过 4 dB 检验的前导码记为 RX_MISS：不产生接收，也没有 EIFS。' }],
      [{ en: 'Energy detection', zh: '能量检测' }, { en: 'Total power on the air ≥ −62 dBm', zh: '空中总功率 ≥ −62 dBm' }, { en: 'CCA busy, with nothing to decode. This is the only rule for a frame whose preamble began while this radio was transmitting (and for non-Wi-Fi energy).', zh: 'CCA 置忙，但没有可解码的内容。对前导码在本机发送期间开始的帧（以及非 Wi-Fi 能量），这是唯一适用的规则。' }],
      [{ en: 'Decoding', zh: '解码' }, { en: 'Worst SINR during the frame ≥ the required SINR of its MCS', zh: '整帧期间最差 SINR ≥ 该 MCS 的所需 SINR' }, { en: 'RX_OK and an ACK. Below the requirement: RX_FAIL (lowSinr).', zh: 'RX_OK 并回 ACK；低于要求则 RX_FAIL（lowSinr）。' }],
    ] },

    { heading: { en: 'Required SINR, from the standard’s sensitivity table', zh: '所需 SINR：从标准的灵敏度表推出' }, text: {
      en: 'The standard does not list SINR requirements. It lists a minimum input sensitivity per MCS: the weakest signal at which a compliant receiver must still reach a 10% packet error rate (§17.3.10.2 for OFDM, §27.3.19.4 for HE, and the matching EHT clause). Those tables assume a 10 dB noise figure and a 5 dB implementation margin. The margin covers real-world impairments such as phase noise and imperfect channel estimation. Removing the noise the standard assumed leaves the SINR requirement:',
      zh: '标准里并没有直接列出所需 SINR，列出的是每个 MCS 的最小输入灵敏度：合规接收机在这个最弱信号下仍须做到 10% 以内的误包率（OFDM 见 §17.3.10.2，HE 见 §27.3.19.4，EHT 有对应条款）。这些表假设了 10 dB 的噪声系数和 5 dB 的实现余量，余量对应相位噪声、信道估计误差等实际损伤。把标准假设的噪声去掉，剩下的就是所需 SINR：',
    } },
    { kind: 'formula', text: {
      en: 'required SINR = sensitivity − kTB(20 MHz) − 10 dB = sensitivity + 90.99 dB',
      zh: '所需 SINR = 灵敏度 − kTB(20 MHz) − 10 dB = 灵敏度 + 90.99 dB',
    }, note: {
      en: 'MCS 0 at −82 dBm needs 8.99 dB. The 5 dB implementation margin stays inside the requirement, because a receiver impairment hurts against interference just as it does against noise. The requirement does not depend on width: a wider channel costs range only through its higher noise floor.',
      zh: 'MCS 0 灵敏度 −82 dBm，所需 8.99 dB。5 dB 实现余量留在要求之内，因为接收机损伤面对干扰和面对噪声时同样存在。这个要求与带宽无关：更宽的信道只通过更高的噪声底来缩短覆盖。',
    } },
    { kind: 'table', heading: { en: 'EHT (Wi-Fi 7) ladder, 20 MHz, one stream', zh: 'EHT（Wi-Fi 7）阶梯，20 MHz，单流' }, head: [
      N('MCS'), { en: 'Modulation', zh: '调制' }, { en: 'Bits per data tone', zh: '每数据子载波比特数' }, N('Mbps'), { en: 'Sensitivity', zh: '灵敏度' }, { en: 'Required SINR', zh: '所需 SINR' },
    ], rows: [
      [N('0'), N('BPSK 1/2'), N('0.5'), N('8.6'), N('−82 dBm'), N('8.99 dB')],
      [N('1'), N('QPSK 1/2'), N('1'), N('17.2'), N('−79 dBm'), N('11.99 dB')],
      [N('3'), N('16-QAM 1/2'), N('2'), N('34.4'), N('−74 dBm'), N('16.99 dB')],
      [N('7'), N('64-QAM 5/6'), N('5'), N('86.0'), N('−64 dBm'), N('26.99 dB')],
      [N('10'), N('1024-QAM 3/4'), N('7.5'), N('129.0'), N('−54 dBm'), N('36.99 dB')],
      [N('13'), N('4096-QAM 5/6'), N('10'), N('172.1'), N('−46 dBm'), N('44.99 dB')],
    ] },
    { kind: 'widget', widget: 'mcsLadder', params: { mode: 'eht', snrDb: 21.5 },
      caption: {
        en: 'All 14 EHT rows. The marker is at the living-room laptop’s SNR, rounded down to 21.5 dB: MCS 0–3 are usable (MCS 3 needs 16.99 + 3 = 19.99 dB), while MCS 4 would need 23.99 dB.',
        zh: 'EHT 全部 14 行。标记放在客厅笔记本的 SNR 上（向下取整为 21.5 dB）：MCS 0–3 可用（MCS 3 需要 16.99 + 3 = 19.99 dB），MCS 4 则需要 23.99 dB。',
      } },

    { heading: { en: 'The MCS ladder as a contract', zh: '把 MCS 阶梯当作契约' }, text: {
      en: 'Each rung up the ladder carries more bits per symbol, so the same frame needs fewer symbols and less airtime. Each rung also needs a higher SINR. The simulator picks a rate ceiling: the highest MCS whose required SINR plus a 3 dB margin fits the link’s SNR. At 20 MHz the numbers line up neatly. The 7 dB noise figure is 3 dB better than the standard assumes, and the 3 dB margin cancels that gain, so the ceiling is simply the highest MCS whose sensitivity the RSSI meets.',
      zh: '阶梯每往上一级，每个符号承载的比特更多，同一帧需要的符号更少、空口时间更短；但所需 SINR 也更高。仿真器据此给出速率上限：所需 SINR 加 3 dB 余量仍不超过链路 SNR 的最高 MCS。在 20 MHz 上数字恰好对齐：7 dB 的噪声系数比标准假设好 3 dB，3 dB 余量又把它抵消，所以上限就是 RSSI 达到其灵敏度的最高 MCS。',
    } },
    { kind: 'table', heading: { en: 'One 1530-octet frame from the laptop, by position', zh: '笔记本发出的同一个 1530 字节帧，按位置' }, head: [
      { en: 'Position', zh: '位置' }, N('RSSI'), N('SNR'), N('MCS'), N('Mbps'), { en: 'Airtime', zh: '空口时间' },
    ], rows: [
      [{ en: 'Desk, 1 m', zh: '书桌，1 m' }, N('−31.7 dBm'), N('62.3 dB'), N('13'), N('172.1'), N('129.6 µs')],
      [{ en: 'Study, 5 m', zh: '书房，5 m' }, N('−52.7 dBm'), N('41.3 dB'), N('10'), N('129.0'), N('143.2 µs')],
      [{ en: 'Living room, 9 m + brick', zh: '客厅，9 m + 砖墙' }, N('−72.3 dBm'), N('21.7 dB'), N('3'), N('34.4'), N('415.2 µs')],
      [{ en: 'Far wall, 14 m + brick', zh: '远端墙边，14 m + 砖墙' }, N('−78.1 dBm'), N('15.9 dB'), N('1'), N('17.2'), N('768.8 µs')],
    ] },
    { text: {
      en: 'The 3 dB margin only affects which MCS is chosen. Decoding compares SINR with the bare requirement. Put the far-wall laptop on an 80 MHz channel: the noise floor rises to −87.97 dBm and the SNR falls to 9.89 dB. That is below MCS 0’s 11.99 dB with the margin, but above its 8.99 dB requirement, so every frame is still acknowledged. At 160 MHz the SNR is 6.87 dB. The preamble is still detected, since it is above 4 dB and above −82 dBm, but no frame decodes: each one ends in RX_FAIL and an ACK timeout. Airtime and rate adaptation, the two things the MAC builds on this contract, get their own lessons: “Frames cost airtime” and “Rate adaptation”.',
      zh: '3 dB 余量只影响选哪个 MCS，解码时 SINR 比的是不含余量的要求。把远端墙边的笔记本放到 80 MHz 信道上：噪声底升到 −87.97 dBm，SNR 降到 9.89 dB，低于 MCS 0 含余量的 11.99 dB，却高于它 8.99 dB 的要求，所以每一帧仍然收到 ACK。到 160 MHz，SNR 只剩 6.87 dB：前导码依然能被检测到（高于 4 dB，也高于 −82 dBm），但没有一帧能解出来，每一帧都以 RX_FAIL 和 ACK 超时告终。MAC 在这份契约之上建立的两件事——空口时间和速率自适应——各有专门的课：“帧要花空口时间”与“速率自适应”。',
    } },

    { kind: 'list', heading: { en: 'Simplifications, named plainly', zh: '简化之处，明确说明' }, items: [
      { en: 'Decoding is a deterministic threshold: at or above the required SINR a frame always decodes, and below it always fails. A real receiver has a packet-error-rate curve that falls steeply over a few dB. The PHY tier replaces the threshold with PER curves and a seeded random draw.', zh: '解码是确定性的门限：达到所需 SINR 就一定解出，低于就一定失败。真实接收机是一条在几个 dB 内陡降的误包率曲线；PHY 部分会用误包率曲线加带种子的随机抽样取代这道门限。' },
      { en: 'There is no fading or multipath. A link’s RSSI is fixed by geometry and walls, so the same spot always gives the same MCS.', zh: '没有衰落，也没有多径：链路的 RSSI 只由几何位置和墙决定，同一个位置永远得到同一个 MCS。' },
      { en: 'One noise figure (7 dB) for every radio, and one path-loss model for every band. The 6 GHz link only adds a fixed 1.2 dB.', zh: '所有电台都用同一个噪声系数（7 dB），所有频段都用同一个路径损耗模型（6 GHz 链路只额外加固定的 1.2 dB）。' },
    ] },
    { kind: 'list', heading: { en: 'In the simulation', zh: '在仿真里看' }, items: [
      { en: 'A router and a laptop, both 1 m above the floor, on Wi-Fi 7 at 20 MHz. The laptop uploads as fast as it can, one 1500-byte MSDU per frame. Nothing else is on the air.', zh: '一台路由器和一台笔记本，天线都离地 1 m，Wi-Fi 7、20 MHz。笔记本全速上传，每帧一个 1500 字节的 MSDU，空中没有别的发射机。' },
      { en: 'The four variants move the laptop along the flat’s centre line: 1, 5, 9 and 14 m from the router. The last two are behind the brick wall. The lesson opens at 9 m, the geometry preset in the link-budget widget.', zh: '四个变体沿房子中线移动笔记本：距路由器 1、5、9、14 m，后两个位置隔着砖墙。本课打开时位于 9 m，也就是链路预算小部件预设的几何位置。' },
    ] },
  ],
  scenario: () => primerScenario(9),
  variants: [
    { label: { en: 'Desk (1 m)', zh: '书桌（1 m）' }, scenario: () => primerScenario(1) },
    { label: { en: 'Study (5 m)', zh: '书房（5 m）' }, scenario: () => primerScenario(5) },
    { label: { en: 'Living room (9 m, brick)', zh: '客厅（9 m，砖墙）' }, scenario: () => primerScenario(9) },
    { label: { en: 'Far wall (14 m, brick)', zh: '远端墙边（14 m，砖墙）' }, scenario: () => primerScenario(14) },
  ],
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK', '第一个 ACK', firstAck),
  ],
  observe: [
    { en: 'Jump to the first data frame in each variant and read its MCS. It is 13, 10, 3 and 1, which are exactly the MCS values the link-budget widget shows for 1 m, 5 m, 9 m + one brick wall and 14 m + one brick wall at 15 dBm and 20 MHz. The airtime reads 129.6, 143.2, 415.2 and 768.8 µs.', zh: '在每个变体里跳到第一个数据帧，读出它的 MCS：13、10、3、1。这正是链路预算小部件在 15 dBm、20 MHz 下对 1 m、5 m、9 m + 一堵砖墙、14 m + 一堵砖墙给出的 MCS。空口时间依次是 129.6、143.2、415.2、768.8 µs。' },
    { en: 'In the first 100 ms the router acknowledges 353 frames from the desk but only 107 from the far wall, fewer than a third as many. The MAC and the contention are identical; only the rung on the ladder changed.', zh: '前 100 ms 里，路由器确认了书桌位置的 353 帧，远端墙边却只有 107 帧，不到三分之一。MAC 和竞争过程完全一样，变的只是阶梯上的那一级。' },
    { en: 'No variant shows a retry or an ACK timeout. A lone link at its rate ceiling has at least 3 dB of SINR to spare, and decoding is a threshold, so it never loses a frame.', zh: '所有变体都没有重传，也没有 ACK 超时：单独一条链路工作在速率上限时至少还有 3 dB 的 SINR 富余，而解码是门限式的，所以一帧也不会丢。' },
  ],
  tryThis: [
    { en: 'Open the living-room variant in the editor, select the brick wall between study and living room, and change its material to glass. The wall loss drops from 12 dB to 3 dB, the RSSI rises to −63.3 dBm, and the data frames jump from MCS 3 to MCS 7 (86.0 Mbps, 197.6 µs). Check the same numbers in the link-budget widget.', zh: '在编辑器里打开客厅变体，选中书房与客厅之间的砖墙，把材质改成玻璃。墙体损耗从 12 dB 降到 3 dB，RSSI 升到 −63.3 dBm，数据帧从 MCS 3 跳到 MCS 7（86.0 Mbps，197.6 µs）。再到链路预算小部件里核对同样的数字。' },
    { en: 'Open the far-wall variant in the editor and lower the laptop’s Tx power from 15 to 12 dBm. The RSSI falls to −81.1 dBm, below MCS 1’s −79 dBm but still above MCS 0’s −82 dBm. The frames drop to MCS 0 and take 1476.0 µs each, almost twice as long.', zh: '在编辑器里打开远端墙边变体，把笔记本的发射功率从 15 dBm 调到 12 dBm。RSSI 降到 −81.1 dBm：低于 MCS 1 的 −79 dBm，但仍高于 MCS 0 的 −82 dBm。数据帧降到 MCS 0，每帧 1476.0 µs，几乎长了一倍。' },
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
      q: { en: 'At the far wall a laptop works at 20 MHz but gets nothing through at 160 MHz. Why does the wide channel reach less far?', zh: '在远端墙边，笔记本用 20 MHz 能通，用 160 MHz 却一帧都过不去。为什么宽信道覆盖更近？' },
      options: [
        { en: 'The required SINR of MCS 0 is higher at 160 MHz', zh: 'MCS 0 在 160 MHz 上的所需 SINR 更高' },
        { en: 'Walls absorb more at 160 MHz', zh: '160 MHz 时墙吸收得更多' },
        { en: 'The receiver takes in eight times the noise, 9 dB more, while the signal stays the same', zh: '接收机收进的噪声是八倍，多 9 dB，而信号不变' },
      ],
      answer: 2,
      explain: { en: 'The noise floor goes from −93.99 to −84.96 dBm, so the SNR at −78.08 dBm drops from 15.91 to 6.87 dB. That is below MCS 0’s 8.99 dB requirement, which is the same at every width. The preamble (≥ 4 dB) is still detected, so each frame ends in RX_FAIL.', zh: '噪声底从 −93.99 升到 −84.96 dBm，−78.08 dBm 信号的 SNR 从 15.91 dB 跌到 6.87 dB，低于 MCS 0 的 8.99 dB 要求；这个要求在任何带宽下都一样。前导码（≥ 4 dB）依然能被检测到，所以每一帧都以 RX_FAIL 告终。' },
    },
    {
      q: { en: 'Your radio is transmitting when a neighbour’s frame begins. The neighbour’s signal arrives at −70 dBm. When your transmission ends and the neighbour is still on the air, is your CCA busy?', zh: '你的电台正在发送时，邻居开始发一帧，信号到达时为 −70 dBm。你发完时邻居还在发，你的 CCA 是忙吗？' },
      options: [
        { en: 'Yes, because −70 dBm is above the −82 dBm preamble-detection threshold', zh: '忙——−70 dBm 高于 −82 dBm 的前导码检测门限' },
        { en: 'No. Your radio missed that preamble, so only energy detection applies, and −70 dBm is below −62 dBm', zh: '不忙——你错过了那个前导码，只能用能量检测判断，而 −70 dBm 低于 −62 dBm' },
        { en: 'Yes, because CCA is always busy right after a transmission', zh: '忙——发送刚结束时 CCA 总是忙' },
      ],
      answer: 1,
      explain: { en: '−82 dBm applies only to a PPDU whose preamble the radio detected. A frame that started during your own transmission is only energy, and it must reach −62 dBm to hold CCA busy (§17.3.10.6). Had your radio been listening when it began, −70 dBm would have held CCA busy.', zh: '−82 dBm 只适用于电台检测到了前导码的 PPDU。在你自己发送期间开始的帧只算能量，必须达到 −62 dBm 才能让 CCA 置忙（§17.3.10.6）。如果它开始时你正在侦听，−70 dBm 就足以让 CCA 置忙。' },
    },
  ],
}
