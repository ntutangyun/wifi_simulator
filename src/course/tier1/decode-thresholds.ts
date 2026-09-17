/**
 * Tier 1, M1, lesson 2: what a receiver can do with a signal. Preamble
 * detection, energy detection, the per-MCS required SINR derived from the
 * standard's minimum-sensitivity tables, and the rate ceiling — the second
 * half of the PHY contract. Pinned by tests/course/tier1-decode-thresholds.test.ts.
 */
import { J, N, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

export const decodeThresholds: Lesson = {
  id: 'decode-thresholds',
  module: 0,
  title: { en: 'What a receiver can do with a signal', zh: '接收机拿一个信号能做什么' },
  body: [
    { text: {
      en: 'The previous lesson produced an SINR. A receiver answers three separate questions with it, and the MAC behaves differently after each. Keeping them apart is the most useful thing a MAC engineer knows about the PHY.',
      zh: '上一课算出了 SINR。接收机接下来要用它回答三个彼此独立的问题，而 MAC 在每种答案之后的行为都不一样。把这三者分清楚，是 MAC 工程师关于 PHY 最该掌握的一件事。',
    } },
    { kind: 'table', head: [
      { en: 'Question', zh: '问题' }, { en: 'Condition', zh: '条件' }, { en: 'What the MAC gets', zh: 'MAC 得到什么' },
    ], rows: [
      [{ en: 'Did I catch the preamble?', zh: '我抓到前导码了吗？' }, { en: 'RSSI ≥ −82 dBm and SINR ≥ 4 dB when the preamble arrives', zh: '前导码到达时 RSSI ≥ −82 dBm 且 SINR ≥ 4 dB' }, { en: 'A reception starts, CCA goes busy. A preamble ≥ −82 dBm failing the 4 dB test is an RX_MISS: no reception, no EIFS.', zh: '开始接收，CCA 置忙。功率达到 −82 dBm 却没通过 4 dB 检验的前导码记为 RX_MISS：不产生接收，也没有 EIFS。' }],
      [{ en: 'Is the channel busy anyway?', zh: '信道无论如何是不是忙？' }, { en: 'Total power on the air ≥ −62 dBm (energy detection)', zh: '空中总功率 ≥ −62 dBm（能量检测）' }, { en: 'CCA busy, nothing to decode. The only rule left for non-Wi-Fi energy and for a frame that began during our own transmission.', zh: 'CCA 置忙，但没有可解码的内容。对非 Wi-Fi 能量，以及在本机发送期间开始的帧，这是唯一适用的规则。' }],
      [{ en: 'Can I decode it?', zh: '我能解出来吗？' }, { en: 'Worst SINR during the frame ≥ the required SINR of its MCS', zh: '整帧期间最差的 SINR ≥ 该 MCS 的所需 SINR' }, { en: 'RX_OK and an ACK. Below it: RX_FAIL, an ACK timeout at the sender, EIFS at the receiver.', zh: 'RX_OK 并回 ACK；低于要求则 RX_FAIL：发送方 ACK 超时，接收方退避一个 EIFS。' }],
    ] },
    { text: {
      en: 'The two carrier-sense numbers are not interchangeable: −82 dBm applies only to a PPDU whose preamble this radio was listening for, and −62 dBm, 20 dB higher, is what is left when it was not. That gap is where hidden nodes live.',
      zh: '两个载波侦听门限不能混用：−82 dBm 只适用于本机正在侦听并抓到前导码的 PPDU；高 20 dB 的 −62 dBm，则是抓不到前导码时仅剩的判据。隐藏节点与空间复用的故事就发生在这 20 dB 的缝隙里。',
    } },

    { heading: { en: 'Required SINR, from the standard’s sensitivity table', zh: '所需 SINR：从标准的灵敏度表推出' }, text: {
      en: 'The standard publishes no SINR requirements. It publishes a minimum input sensitivity per MCS: the weakest signal at which a receiver must still reach a 10% packet error rate (§17.3.10.2 for OFDM, §27.3.19.4 for HE, and the EHT counterpart). Those tables assume a 10 dB noise figure and a 5 dB implementation margin for impairments such as phase noise. Remove the noise they assumed:',
      zh: '标准并不直接给出所需 SINR，给出的是每个 MCS 的最小输入灵敏度：合规接收机在这个最弱信号下仍须做到 10% 以内的误包率（OFDM PHY 见 §17.3.10.2，HE 见 §27.3.19.4，EHT 有对应条款）。这些表假设了 10 dB 噪声系数和 5 dB 实现余量，余量代表相位噪声、信道估计误差等真实损伤。把标准假设的噪声去掉，剩下的就是所需 SINR：',
    } },
    { kind: 'formula', text: {
      en: 'required SINR = sensitivity − kTB(20 MHz) − 10 dB = sensitivity + 90.99 dB',
      zh: '所需 SINR = 灵敏度 − kTB(20 MHz) − 10 dB = 灵敏度 + 90.99 dB',
    }, note: {
      en: 'MCS 0 at −82 dBm needs 8.99 dB. The 5 dB margin stays inside the requirement, because an impairment hurts against interference exactly as against noise. The requirement never depends on channel width: a wider channel costs range only through its noise floor.',
      zh: 'MCS 0 灵敏度 −82 dBm，所需 8.99 dB。5 dB 实现余量留在要求之内，因为接收机损伤面对干扰和面对噪声时同样起作用。这个要求与信道带宽无关：更宽的信道只通过更高的噪声底来缩短覆盖。',
    } },
    { kind: 'table', heading: { en: 'Six of the fourteen EHT rungs, 20 MHz, one stream', zh: 'EHT 十四级中的六级，20 MHz、单流' }, head: [
      N('MCS'), { en: 'Modulation', zh: '调制' }, { en: 'Bits per data tone', zh: '每数据子载波比特' }, N('Mbps'), { en: 'Sensitivity', zh: '灵敏度' }, { en: 'Required SINR', zh: '所需 SINR' },
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
        en: 'The 14 EHT rungs, 20 MHz, one stream. The marker sits at the living-room laptop’s SNR rounded down to 21.5 dB: MCS 0–3 are usable (MCS 3 needs 16.99 + 3 = 19.99 dB), MCS 4 would need 23.99 dB. MCS 0 carries half a bit per data tone, MCS 13 carries ten — for 36 dB more.',
        zh: 'EHT 的 14 级阶梯，20 MHz、单空间流。标记放在客厅笔记本的 SNR 上（向下取整为 21.5 dB）：MCS 0–3 可用（MCS 3 需要 16.99 + 3 = 19.99 dB），MCS 4 则需要 23.99 dB。MCS 0 每个数据子载波只承载半个比特，MCS 13 承载十个——代价是多要 36 dB。',
      } },

    { heading: { en: 'The ladder as a contract', zh: '把阶梯当作契约' }, text: {
      en: 'Each rung up carries more bits per symbol — fewer symbols, less airtime — and needs a higher SINR. The simulator turns that into a rate ceiling: the highest MCS whose required SINR plus a 3 dB margin fits the SNR. At 20 MHz it is head arithmetic: the 7 dB noise figure beats the standard’s assumption by 3 dB, the margin gives that back, so the ceiling is the highest MCS whose sensitivity the RSSI meets.',
      zh: '阶梯每上一级，每个符号承载的比特更多，同一帧需要的符号更少、空口时间更短；同时所需 SINR 也更高。仿真器据此给出速率上限：所需 SINR 加 3 dB 余量仍不超过链路 SNR 的最高 MCS。在 20 MHz 上这套算术可以口算：7 dB 的噪声系数比标准假设好 3 dB，3 dB 余量又原样还回去，于是上限就是 RSSI 达到其灵敏度的最高 MCS。',
    } },
    { kind: 'table', heading: { en: 'One 1530-octet frame from the laptop, by position', zh: '笔记本发出的同一个 1530 字节帧，按位置' }, head: [
      { en: 'Position', zh: '位置' }, N('RSSI'), N('SNR'), N('MCS'), { en: 'Required + 3 dB', zh: '所需 + 3 dB' }, { en: 'Airtime', zh: '空口时间' },
    ], rows: [
      [{ en: 'Desk, 1 m', zh: '书桌，1 m' }, N('−31.7 dBm'), N('62.3 dB'), N('13'), N('47.99 dB'), N('129.6 µs')],
      [{ en: 'Study, 5 m', zh: '书房，5 m' }, N('−52.7 dBm'), N('41.3 dB'), N('10'), N('39.99 dB'), N('143.2 µs')],
      [{ en: 'Living room, 9 m + brick', zh: '客厅，9 m + 砖墙' }, N('−72.3 dBm'), N('21.7 dB'), N('3'), N('19.99 dB'), N('415.2 µs')],
      [{ en: 'Far wall, 14 m + brick', zh: '远端墙边，14 m + 砖墙' }, N('−78.1 dBm'), N('15.9 dB'), N('1'), N('14.99 dB'), N('768.8 µs')],
    ] },
    { text: {
      en: 'The margin only picks the rung; decoding compares the SINR with the bare requirement. Put the far-wall laptop on 80 MHz: the noise floor rises to −87.97 dBm and the SNR falls to 9.89 dB — under MCS 0’s 11.99 dB with the margin, over its 8.99 dB requirement — and every frame is still acknowledged. At 160 MHz the SNR is 6.87 dB: the preamble is still detected, but nothing decodes, so every reception ends in RX_FAIL and every transmission in an ACK timeout. A link can be perfectly audible and completely useless. Following a moving SINR up and down this ladder is rate adaptation, later in the course.',
      zh: '余量只决定选哪一级，解码时 SINR 比的是不含余量的要求。把远端墙边的笔记本换到 80 MHz：噪声底升到 −87.97 dBm，SNR 降到 9.89 dB，低于含余量的 11.99 dB，却高于 8.99 dB 的要求——每一帧仍然收到 ACK。换到 160 MHz，SNR 只剩 6.87 dB：前导码依然能被检测到（高于 4 dB，也高于 −82 dBm），但一帧也解不出来——每次接收都是 RX_FAIL，每次发送都以 ACK 超时收场。一条链路可以听得清清楚楚，却完全不能用。空口时间由“帧要花空口时间”一课展开；随 SINR 变化在阶梯上上下移动，则是后面“速率自适应”的内容。',
    } },

    { kind: 'list', heading: { en: 'Simplifications, named plainly', zh: '简化之处，明确说明' }, items: [
      { en: 'Decoding is a deterministic threshold: at or above the requirement a frame always decodes, below it never does. A real receiver has a packet-error-rate curve falling steeply over a few dB, and the PHY tier replaces the threshold with measured-style PER curves and a seeded draw.', zh: '解码是确定性的门限：达到所需 SINR 就一定解出，低于就一定失败。真实接收机是一条在几个 dB 内陡降的误包率曲线；PHY 阶段会用实测风格的误包率曲线加带种子的随机抽样取代这道门限。' },
      { en: 'No fading and no multipath: an RSSI is fixed by geometry and walls, so the same spot always yields the same MCS.', zh: '没有衰落，也没有多径：RSSI 只由几何位置和墙决定，同一个位置永远得到同一个 MCS。' },
      { en: 'One noise figure (7 dB) for every radio, and an A-MPDU is all-or-nothing. Both change in later tiers.', zh: '所有电台共用一个噪声系数（7 dB）；A-MPDU 也是整体成败。这两点都会在后面的阶段改变。' },
    ] },
  ],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK', '第一个 ACK', firstAck),
  ],
  observe: [
    { en: 'Read the MCS of the first data frame in each variant: 13, 10, 3 and 1 — the rungs the ladder widget marks for SNRs of 62.3, 41.3, 21.7 and 15.9 dB. The airtime follows: 129.6, 143.2, 415.2 and 768.8 µs. Twelve rungs down costs six times the airtime.', zh: '读出每个变体第一个数据帧的 MCS：13、10、3、1——正是阶梯小部件在 62.3、41.3、21.7、15.9 dB 上标出的那几级。一个 1530 字节帧的空口时间随之而来：129.6、143.2、415.2、768.8 µs。从最高级往下走十二级，空口时间变成六倍。' },
    { en: 'No variant produces a retry, an ACK timeout or a failed reception. A lone link at its ceiling keeps 3 dB in hand, and against a deterministic threshold that is enough to never lose a frame.', zh: '所有变体都没有重传、没有 ACK 超时、也没有接收失败。单独一条链路停在上限时至少还留着 3 dB，而在确定性门限下这就足以一帧不丢——本课程的第一次碰撞，要等第二台终端出现才会到来。' },
    { en: 'Every run starts its first data frame at t = 0 and never changes MCS afterwards. Nothing pushes the station off its ceiling here: the rate controller steps down only after losses, and with no second radio on the air there are none.', zh: '每次运行的第一个数据帧都从 t = 0 开始，此后 MCS 再不变化。这里没有任何东西能把终端推离上限：速率控制器只在失败之后才降级，而空中没有第二台设备，也就没有失败。' },
  ],
  tryThis: [
    { en: 'Open the far-wall variant in the editor and lower the laptop’s Tx power from 15 to 12 dBm. The RSSI falls to −81.1 dBm, below MCS 1’s −79 dBm but above MCS 0’s −82 dBm: the frames drop a rung and stretch from 768.8 to 1476.0 µs. Three decibels nearly doubled the airtime.', zh: '在编辑器里打开远端墙边变体，把笔记本的发射功率从 15 dBm 调到 12 dBm。RSSI 降到 −81.1 dBm：低于 MCS 1 的 −79 dBm，但仍高于 MCS 0 的 −82 dBm，于是帧下降一级到 MCS 0，时长从 768.8 µs 拉长到 1476.0 µs。3 dB 让空口时间几乎翻倍。' },
    { en: 'In the ladder widget, set the SNR slider to 15.9 dB (far wall), then 62.3 dB (desk): the top usable rung goes from MCS 1 to MCS 13 — twelve rungs for 46 dB. Switch the mode to HE and the two 4096-QAM rungs disappear.', zh: '在阶梯小部件里把 SNR 滑杆调到 15.9 dB（远端墙边），再调到 62.3 dB（书桌）：最高可用级从 MCS 1 变成 MCS 13——46 dB 换来十二级。再把模式切到 HE，会看到阶梯少了 4096-QAM 的两级。' },
  ],
  quiz: [
    {
      q: { en: 'At the far wall the laptop works at 20 MHz but gets nothing through at 160 MHz. Why does the wide channel reach less far?', zh: '在远端墙边，笔记本用 20 MHz 能通，用 160 MHz 却一帧都过不去。为什么宽信道覆盖更近？' },
      options: [
        { en: 'The required SINR of MCS 0 is higher at 160 MHz', zh: 'MCS 0 在 160 MHz 上的所需 SINR 更高' },
        { en: 'Walls attenuate more at 160 MHz', zh: '160 MHz 时墙的衰减更大' },
        { en: 'The receiver takes in eight times the noise, 9 dB more, while the signal stays the same', zh: '接收机收进的噪声是八倍，多 9 dB，而信号不变' },
      ],
      answer: 2,
      explain: { en: 'The noise floor goes from −93.99 to −84.96 dBm, so a −78.08 dBm signal drops from 15.91 to 6.87 dB SNR — below MCS 0’s 8.99 dB, which is the same at every width. The preamble is still detected, so frames end in RX_FAIL.', zh: '噪声底从 −93.99 升到 −84.96 dBm，−78.08 dBm 信号的 SNR 从 15.91 dB 跌到 6.87 dB，低于 MCS 0 的 8.99 dB 要求；这个要求在任何带宽下都一样。前导码（≥ 4 dB）仍能被检测到，所以每一帧的结局是 RX_FAIL，而不是毫无动静。' },
    },
    {
      q: { en: 'A neighbour’s frame, arriving at −70 dBm, begins while your radio is transmitting. Your transmission ends; the neighbour is still on the air. Is your CCA busy?', zh: '你的电台正在发送时，邻居开始发一帧，到达功率 −70 dBm。你发完时邻居还在发。你的 CCA 是忙吗？' },
      options: [
        { en: 'Yes: −70 dBm is above the −82 dBm preamble-detection threshold', zh: '忙：−70 dBm 高于 −82 dBm 的前导码检测门限' },
        { en: 'No: the preamble was missed, so only energy detection applies, and −70 dBm is below −62 dBm', zh: '不忙：你错过了那个前导码，只能靠能量检测判断，而 −70 dBm 低于 −62 dBm' },
        { en: 'Yes: CCA is always busy for a while after a transmission', zh: '忙：发送结束后 CCA 总会忙上一段时间' },
      ],
      answer: 1,
      explain: { en: '−82 dBm applies only to a PPDU whose preamble the radio detected; a frame that started during your own transmission counts as energy, and energy must reach −62 dBm (§17.3.10.6). Had the radio been listening, −70 dBm would have held CCA busy.', zh: '−82 dBm 只适用于电台检测到了前导码的 PPDU。在你自己发送期间开始的帧只算能量，而能量必须达到 −62 dBm 才能让 CCA 置忙（§17.3.10.6）。如果它开始时电台正在侦听，−70 dBm 就足以让 CCA 置忙。' },
    },
  ],
}
