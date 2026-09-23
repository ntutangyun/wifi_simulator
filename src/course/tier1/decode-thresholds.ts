/**
 * Wi-Fi Tier 1 · M1 · The second radio lesson: what a receiver can actually do
 * with the ratio `radio-primer` built — catch the start of a frame, call the
 * channel busy, or decode what was sent.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). It loads
 * exactly the scene radio-primer loads — same builder, same variants — so the
 * two lessons are one walk through the flat. The sensitivity arithmetic, the
 * wide-channel corner case and the model's simplifications are in `deeper`;
 * the clause numbers are in `sources`.
 *
 * Every number quoted below is pinned in tests/course/decode-thresholds.test.ts.
 */
import { J, N, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

export const decodeThresholds: Lesson = {
  id: 'decode-thresholds',
  module: 0,
  title: { en: 'Fast talk, and when a frame gets through', zh: '说得多快，以及一帧什么时候能过去' },
  why: {
    en: 'A signal that arrives is not the same as a frame that is understood. The faster a sender talks, the more room above the noise its receiver needs, so the same link carries a quick frame at the desk and only a slow one across the flat. And before any of that, a radio has to decide whether the room is quiet enough to start at all. Both answers come out of the ratio the last lesson built.',
    zh: '信号能到，不等于这一帧能被听懂。发送端说得越快，就要求信号比噪声高出越多；所以同一条链路，在书桌旁发得快，隔着半间屋子就只能慢下来。而在这之前，电台还得先拿个主意：屋里是不是安静到可以开口。这两件事要用的，都是上一课算出来的那个比值。',
  },
  outcomes: [
    { en: 'say why the same laptop sends a quick frame at the desk and a slow one at the far wall', zh: '说清同一台笔记本为什么在书桌旁能发得快，到了远端墙边只能发得慢' },
    { en: 'read the top rate a link can hold off its RSSI alone', zh: '仅凭 RSSI 就读出一条链路能撑住的最高速率' },
    { en: 'keep apart the three questions a receiver answers about a signal', zh: '把接收端对一个信号要回答的三个问题分清楚' },
  ],
  needs: ['radio-primer'],
  terms: [
    { term: 'MCS', plain: {
      en: 'modulation and coding scheme: how fast the sender dares talk — one rung of a ladder of rates',
      zh: '调制与编码方式：发送端敢说多快——速率阶梯上的某一级',
    } },
    { term: 'OFDM', plain: {
      en: 'the way Wi-Fi sends: hundreds of narrow sub-carriers side by side, each carrying a little of the frame at once',
      zh: 'Wi-Fi 的发送方式：几百个很窄的子载波并排，每个同时带走这一帧的一小部分',
    } },
    { term: 'CCA', plain: {
      en: 'clear channel assessment: the two power thresholds a radio holds the air against before it may start talking',
      zh: '空闲信道评估：电台开口之前，拿空中的功率去比两条门限，看现在能不能发',
    } },
    { term: 'sensitivity', plain: {
      en: 'the weakest arriving power at which one rung still decodes — one figure per rung, read against the noise floor the standard assumes in its tables',
      zh: '灵敏度：某一级还能被解出来的最弱到达功率——每级一个数，按标准表格假设的噪声地板（接收端始终听得见的那点底噪）给出',
    } },
    { term: 'rate margin', plain: {
      en: 'the 3 dB a sender holds back above what its rung requires, so an ordinary dip in the signal does not break the link',
      zh: '速率余量：发送端在所选那一级的要求之上，多留出的 3 dB，免得信号稍有起伏这条链路就断',
    } },
  ],
  picture: [
    { heading: { en: 'Talking fast needs a better line', zh: '说得快，就要求线路更好' }, text: {
      en: 'Speech again. Close up in a quiet room you can gabble and still be understood; across a noisy one you slow down and over-pronounce. A radio does exactly this. It has a ladder of speeds, and each rung needs the signal to stand a certain distance above everything else. Choose a rung the link cannot support and nothing gets through; choose one far below it and you waste air. The rung is the MCS.',
      zh: '还是拿说话打比方。屋里安静、人又挨得近，你可以连珠炮似的说，对方照样听懂；屋里吵、人又远，你就得放慢、咬清楚。无线电也是这样。它的速率是一级一级的，每升一级，都要求信号比其余一切多高出一截。选了这条链路撑不住的一级，什么也过不去；选得太低，又白白浪费空口时间。这一级，就是 MCS。',
    } },
    { heading: { en: 'Many narrow voices at once', zh: '许多个窄嗓门一起说' }, text: {
      en: 'What does a higher rung change? Wi-Fi does not push one fast stream down the channel. It splits the channel into hundreds of narrow sub-carriers and sends a slow stream on every one of them at the same time — that is OFDM. Going up a rung loads each sub-carrier with more bits, which means more signal levels to tell apart, packed closer together. Telling them apart needs a cleaner signal. That is the whole trade.',
      zh: '往上升一级，到底改变了什么？Wi-Fi 不是把一路高速数据硬塞进信道，而是把信道切成几百个很窄的子载波，每个上面同时发一路慢的数据——这就是 OFDM。升一级，就是让每个子载波多带几个比特；这样一来，要分辨的电平更多、挨得更近，而想分得开，信号就得更干净。这笔买卖，说到底就是这么一回事。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Go and look', zh: '去看一眼' }, text: {
      en: 'Load the simulation, jump to the laptop\'s first data frame and note how long the block is. Then step through the four variants: as the laptop moves away the rung drops, and the very same frame visibly stretches along the timeline.',
      zh: '载入仿真，跳到笔记本的第一个数据帧，先看清这一块有多长。然后依次切过四个变体：笔记本越走越远，级别一路往下掉，同一帧在时间轴上被明显拉长。',
    } },
    { heading: { en: 'Three questions, not one', zh: '是三个问题，不是一个' }, text: {
      en: 'A receiver does not ask one question about a signal but three, and the MAC — the part of the radio that decides when to send — acts differently after each. Did I catch the start of this frame, its preamble, cleanly enough to lock on? Is there too much power in the air for me to start talking? And at the end: was the ratio good enough, for the whole frame, for the rung it was sent at? The first two are CCA. The third is decoding.',
      zh: '接收端对一个信号要问的不是一个问题，而是三个；而 MAC——无线电里决定什么时候开口的那一部分——拿到的答案不同，做法也不同。第一，这一帧开头那段前导，我抓得够不够干净、锁不锁得住？第二，空中的功率是不是已经大到我不该开口？第三，等整帧收完：全程的比值，够不够它所用的那一级？前两个合起来就是 CCA，第三个才叫解码。',
    } },
    { heading: { en: 'Clear channel, and the gap in it', zh: '空闲判断，和中间的那二十分贝' }, text: {
      en: 'A radio that hears a preamble it can lock on to knows a frame is starting and holds off, even when that frame is faint. One that missed the preamble — because it was transmitting at the time, or because the energy was never Wi-Fi — has nothing but raw power to go on, and it takes far more power to stop it. The two thresholds are twenty decibels apart, and much later trouble lives in that gap.',
      zh: '一台电台只要听见自己锁得住的前导，就知道有一帧正在开始，于是按住不发——哪怕这一帧很弱。可要是它错过了前导——也许当时它自己正在发，也许那股能量根本就不是 Wi-Fi——它就只能看功率有多大，而想靠功率把它按住，功率要高得多。这两条门限相差二十分贝；后面很多麻烦事，都出在这二十分贝上。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'The three questions', zh: '三个问题' }, head: [
      { en: 'Question', zh: '问题' }, { en: 'Condition', zh: '条件' }, { en: 'What follows', zh: '接下来会怎样' },
    ], rows: [
      [{ en: 'Did I catch the preamble?', zh: '我抓到前导了吗？' },
       { en: 'RSSI ≥ −82 dBm and SINR ≥ 4 dB as it arrives', zh: '前导到达时 RSSI ≥ −82 dBm 且 SINR ≥ 4 dB' },
       { en: 'A reception starts, CCA busy. Loud enough but under 4 dB: RX_MISS, no reception.', zh: '开始接收，CCA 置忙。够响却不到 4 dB：记为 RX_MISS，根本不产生接收。' }],
      [{ en: 'Is the air too loud anyway?', zh: '空中是不是本来就太吵？' },
       { en: 'Total power on the air ≥ −62 dBm', zh: '空中总功率 ≥ −62 dBm' },
       { en: 'CCA busy, nothing to decode. The one rule left for non-Wi-Fi energy.', zh: 'CCA 置忙，但没有可解的内容。对不是 Wi-Fi 的能量，这是仅剩的判据。' }],
      [{ en: 'Can I decode it?', zh: '我解得出来吗？' },
       { en: 'Worst SINR during the frame ≥ what its MCS requires', zh: '整帧期间最差的 SINR ≥ 该 MCS 的要求' },
       { en: 'RX_OK and an acknowledgement; below it, RX_FAIL and a timeout.', zh: 'RX_OK 并回确认帧；低于要求则 RX_FAIL，发送方等到超时。' }],
    ] },
    { text: {
      en: 'The two figures are not interchangeable. −82 dBm tests a frame whose preamble this radio caught. Without that, only raw energy counts, and it trips at −62 dBm: twenty decibels higher, a hundred times the power.',
      zh: '这两个数不能混着用。−82 dBm 判的是本机抓到了前导的那一帧；没抓到前导，就只能按能量判断，而能量的门限是 −62 dBm：比前一个高二十分贝，也就是一百倍的功率。',
    } },
    { kind: 'table', heading: { en: 'Six of the fourteen rungs, 20 MHz, one stream', zh: '十四级中的六级，20 MHz、单流' }, head: [
      N('MCS'), { en: 'Modulation', zh: '调制' }, { en: 'Bits per sub-carrier', zh: '每子载波比特' }, N('Mb/s'),
      { en: 'Sensitivity', zh: '灵敏度' }, { en: 'Needs', zh: '所需' },
    ], rows: [
      [N('0'), N('BPSK 1/2'), N('0.5'), N('8.6'), N('−82 dBm'), N('8.99 dB')],
      [N('1'), N('QPSK 1/2'), N('1'), N('17.2'), N('−79 dBm'), N('11.99 dB')],
      [N('3'), N('16-QAM 1/2'), N('2'), N('34.4'), N('−74 dBm'), N('16.99 dB')],
      [N('7'), N('64-QAM 5/6'), N('5'), N('86.0'), N('−64 dBm'), N('26.99 dB')],
      [N('10'), N('1024-QAM 3/4'), N('7.5'), N('129.0'), N('−54 dBm'), N('36.99 dB')],
      [N('13'), N('4096-QAM 5/6'), N('10'), N('172.1'), N('−46 dBm'), N('44.99 dB')],
    ] },
    { text: {
      en: 'Each modulation name says how many symbols the sender chooses between: two (BPSK), four (QPSK), then the 16, 64, 1024 and 4096 of the QAM (a grid of signal levels) family. The fraction after it is the coding rate.',
      zh: '调制的名字说的是发送端在多少个符号之间做选择：两个（BPSK）、四个（QPSK），再往后是 QAM（一张信号电平的方格）家族的 16、64、1024 和 4096。名字后面的那个分数，是编码率。',
    } },
    { kind: 'widget', widget: 'mcsLadder', params: { mode: 'eht', snrDb: 21.5 },
      caption: {
        en: 'The whole ladder, marker at the living-room laptop\'s SNR rounded down to 21.5 dB. Lit rungs fit, margin included.',
        zh: '完整的速率阶梯，标记停在客厅那台笔记本的 SNR 上（向下取整到 21.5 dB）。点亮的级就是放得下的，余量已经算进去了。',
      } },
    { kind: 'steps', heading: { en: 'Choosing a rung, step by step', zh: '选级的算法，一步一步' }, items: [
      { en: 'Take the RSSI of this link and subtract the noise floor at the channel width in use. The difference is the SNR.',
        zh: '把这条链路的 RSSI 减去当前信道带宽下的噪声地板，差就是 SNR。' },
      { en: 'Give every rung its required SINR: at 20 MHz that is its sensitivity plus 90.99 dB, which is the noise the standard assumed in those tables, taken back out.',
        zh: '给每一级算出它的所需 SINR：在 20 MHz 上，就是它的灵敏度加 90.99 dB——把标准表格假设的那份噪声再减回去。' },
      { en: 'Walk up the ladder and keep the last rung where required SINR + 3 dB ≤ SNR. Those 3 dB are the rate margin, and they are why a link at its ceiling still survives an ordinary dip.',
        zh: '从底下往上走，留住最后一个满足“所需 SINR + 3 dB ≤ SNR”的级。这 3 dB 就是速率余量，也正是一条顶到上限的链路还能扛住寻常起伏的原因。' },
      { en: 'Send at that rung. While the frame is in the air the receiver holds its worst SINR against the required SINR alone — the margin belongs to the sender, not to the decoder.',
        zh: '就用这一级发。帧在空中时，接收端拿全程最差的那个 SINR 去比所需 SINR——余量是发送端留的，解码时并不算它。' },
      { en: 'At 20 MHz steps 1 to 3 collapse into one look-up: the highest rung whose sensitivity is at or below the RSSI. The shortcut works because this simulator hears 3 dB better than the tables assume, which is exactly the margin.',
        zh: '在 20 MHz 上，第 1 到 3 步可以并成一次查表：灵敏度不高于 RSSI 的那个最高级。这条捷径成立，是因为本仿真器比表格的假设多听见 3 dB，恰好与那份余量相抵。' },
    ] },
    { kind: 'table', heading: { en: 'The living-room laptop, run through the steps', zh: '客厅那台笔记本，照着步骤走一遍' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'Value', zh: '数值' },
    ], rows: [
      [{ en: 'RSSI of the link', zh: '这条链路的 RSSI' }, N('−72.3 dBm')],
      [{ en: 'less the noise floor, 20 MHz', zh: '减去 20 MHz 的噪声地板' }, N('−93.99 dBm')],
      [{ en: '= SNR', zh: '= SNR' }, N('21.7 dB')],
      [{ en: 'MCS 3 requires, with the margin', zh: 'MCS 3 的要求，加上余量' }, N('16.99 + 3 = 19.99 dB ✓')],
      [{ en: 'MCS 7 requires, with the margin', zh: 'MCS 7 的要求，加上余量' }, N('26.99 + 3 = 29.99 dB ✗')],
      [{ en: 'so the frame goes out at', zh: '于是这一帧发出去时用的是' }, N('MCS 3')],
    ] },
    { kind: 'table', heading: { en: 'One 1530-byte frame, by position', zh: '同一个 1530 字节帧，按位置' }, head: [
      { en: 'Where it sits', zh: '它在哪儿' }, N('RSSI'), N('SNR'), N('MCS'), { en: 'Needs + 3 dB', zh: '所需 + 3 dB' }, { en: 'Airtime', zh: '空口时间' },
    ], rows: [
      [{ en: 'Desk, 1 m', zh: '书桌，1 m' }, N('−31.7 dBm'), N('62.3 dB'), N('13'), N('47.99 dB'), N('129.6 µs')],
      [{ en: 'Study, 5 m', zh: '书房，5 m' }, N('−52.7 dBm'), N('41.3 dB'), N('10'), N('39.99 dB'), N('143.2 µs')],
      [{ en: 'Living room, 9 m + brick', zh: '客厅，9 m + 砖墙' }, N('−72.3 dBm'), N('21.7 dB'), N('3'), N('19.99 dB'), N('415.2 µs')],
      [{ en: 'Far wall, 14 m + brick', zh: '远端墙边，14 m + 砖墙' }, N('−78.1 dBm'), N('15.9 dB'), N('1'), N('14.99 dB'), N('768.8 µs')],
    ] },
  ],
  deeper: [
    { heading: { en: 'Where the required ratio comes from', zh: '所需比值是怎么来的' }, text: {
      en: 'The standard publishes no ratio requirements at all. It publishes a minimum input sensitivity per MCS: the weakest signal at which a compliant receiver must still keep the packet error rate under 10%. Those tables assume a 10 dB noise figure and swallow a 5 dB implementation margin for phase noise, channel-estimation error and the rest. Take the noise they assumed back out and what remains is the ratio the frame needs.',
      zh: '标准根本没有直接给出所需比值。它给的是每个 MCS 的最小输入灵敏度：合规接收机在这个最弱的信号下，仍须把误包率压在 10% 以内。这些表假设了 10 dB 的噪声系数，还预先扣掉了 5 dB 的实现余量，用来覆盖相位噪声、信道估计误差之类。把它们假设的噪声再减回去，剩下的才是这一帧真正需要的比值。',
    } },
    { kind: 'formula', text: {
      en: 'required SINR = sensitivity − kTB(20 MHz) − 10 dB = sensitivity + 90.99 dB',
      zh: '所需 SINR = 灵敏度 − kTB(20 MHz) − 10 dB = 灵敏度 + 90.99 dB',
    }, note: {
      en: 'kTB is the thermal-noise formula the numbers section already used, so this is the sensitivity with the noise the tables assumed taken back out: MCS 0 at −82 dBm needs 8.99 dB. The 5 dB implementation margin stays inside the requirement, because an impairment hurts against interference exactly as it does against noise. The requirement never depends on channel width: a wider channel costs range only through its noise floor. And the simulator\'s own 7 dB noise figure beats the assumed 10 dB by 3 dB, which the 3 dB rate margin gives straight back — which is why the 20 MHz shortcut works.',
      zh: 'kTB 就是“现在的数字”一节用过的那条热噪声公式，所以这一步就是把标准假设的噪声从灵敏度里减回去：MCS 0 的灵敏度是 −82 dBm，所需 8.99 dB。5 dB 实现余量留在要求之内，因为接收机损伤对干扰和对噪声一样起作用。这个要求与信道带宽无关：更宽的信道只通过抬高噪声地板来缩短覆盖。另外，仿真器自己的 7 dB 噪声系数比假设的 10 dB 好 3 dB，而 3 dB 的速率余量又原样还了回去——20 MHz 上的那套口算，正是这么来的。',
    } },
    { heading: { en: 'Audible and useless', zh: '听得见，却没有用' }, text: {
      en: 'Put the far-wall laptop on 80 MHz: the noise floor rises to −87.97 dBm and the SNR falls to 9.89 dB — under MCS 0\'s 11.99 dB with the margin, but over its bare 8.99 dB requirement — and every frame is still acknowledged. At 160 MHz the SNR is 6.87 dB. The preamble is still detected, so the receiver starts and waits, but nothing decodes: every reception ends in RX_FAIL and every transmission in a timeout. A link can be perfectly audible and completely useless.',
      zh: '把远端墙边的笔记本换到 80 MHz：噪声地板升到 −87.97 dBm，SNR 掉到 9.89 dB——低于 MCS 0 含余量的 11.99 dB，却仍高于它 8.99 dB 的裸要求——于是每一帧照样被确认。换到 160 MHz，SNR 只剩 6.87 dB：前导依然检测得到，接收照样开始、照样等待，可什么也解不出来，每次接收都以 RX_FAIL 收场，每次发送都以超时收场。一条链路可以听得清清楚楚，却完全不能用。',
    } },
    { heading: { en: 'What the coding rate buys', zh: '编码率买到的是什么' }, text: {
      en: 'The fraction beside each modulation — 1/2, 3/4, 5/6 — is the share of what goes out that is message; the rest is redundancy the receiver uses to repair what the noise damaged. A rung is therefore two choices at once: how many symbols the grid holds, and how much repair rides along. MCS 3 and MCS 7 use the same 16-QAM and 64-QAM families their names give, at different fractions.',
      zh: '每个调制名字旁边的那个分数——1/2、3/4、5/6——是发出去的内容里真正属于消息的那一部分；其余是冗余，接收端靠它修补被噪声打坏的地方。所以一级其实是两个选择合在一起：方格里有多少个符号，以及随行带上多少修补。MCS 3 与 MCS 7 用的就是名字里写着的 16-QAM 与 64-QAM，只是分数不同。',
    } },
    { kind: 'list', heading: { en: 'Simplifications, named plainly', zh: '简化之处，明说' }, items: [
      { en: 'Decoding is a hard threshold: at or above the requirement a frame always decodes, below it never does. A real receiver has an error-rate curve that falls steeply over a few dB.', zh: '解码是一道硬门限：达到要求就一定解得出，低于就一定失败。真实接收机是一条在几个 dB 内陡降的误码率曲线。' },
      { en: 'No fading and no multipath: an RSSI is fixed by geometry and walls, so the same spot always yields the same MCS.', zh: '没有衰落，也没有多径：RSSI 只由几何位置和墙决定，同一个位置永远得到同一个 MCS。' },
      { en: 'One noise figure for every radio, and an aggregate is all-or-nothing. Both change in later tiers.', zh: '所有电台共用一个噪声系数；聚合帧也是整体成败。这两点都会在后面的阶段改变。' },
    ] },
  ],
  sources: [
    { en: 'The minimum input sensitivity tables are §17.3.10.2 for the OFDM PHY, §27.3.19.4 for HE and the EHT counterpart; each states the 10% packet-error-rate condition and the 10 dB noise figure and 5 dB implementation margin behind it.',
      zh: '最小输入灵敏度表：OFDM PHY 见 §17.3.10.2，HE 见 §27.3.19.4，EHT 有对应条款；每一处都写明了 10% 误包率的条件，以及其背后 10 dB 噪声系数与 5 dB 实现余量的假设。' },
    { en: 'The −82 dBm preamble-detection floor and the −62 dBm energy-detection floor are the clear-channel rules of §17.3.10.6, carried into the later PHYs unchanged.',
      zh: '−82 dBm 的前导检测门限与 −62 dBm 的能量检测门限，出自 §17.3.10.6 的空闲信道规则，并原样沿用到后来的各 PHY。' },
    { en: 'The 4 dB preamble-detection ratio and the 3 dB rate margin are this simulator\'s constants, not standard text; so is turning the sensitivity tables into a required SINR, which real receivers only approximately obey.',
      zh: '4 dB 的前导检测比值与 3 dB 的速率余量都是本仿真器的模型取值，并非标准正文；把灵敏度表换算成所需 SINR 同样如此，真实接收机只是近似遵循。' },
  ],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK', '第一个 ACK', firstAck),
  ],
  observe: [
    { en: 'Read the MCS of the first data frame in each of the four variants: 13, 10, 3 and 1 — the rungs the ladder lights for the four ratios in the table above.', zh: '读出四个变体里第一个数据帧的 MCS：13、10、3、1——上表那四个比值在阶梯上点亮的级。' },
    { en: 'Now read the airtime of that frame: 129.6, 143.2, 415.2 and 768.8 µs. Twelve rungs down costs nearly six times the air for the very same 1530 bytes.', zh: '再读这一帧的空口时间：129.6、143.2、415.2、768.8 µs。往下走十二级，同样的 1530 个字节要多花近六倍的空口时间。' },
    { en: 'No variant shows a retry, a timeout or a failed reception. A lone link at its ceiling still keeps 3 dB in hand — against a hard threshold, enough never to lose a frame.', zh: '四个变体里都没有重传、没有超时，也没有接收失败。一条链路独占空口、又停在自己的上限上时，手里仍留着 3 dB；面对一道硬门限，这 3 dB 足以一帧不丢。' },
  ],
  tryThis: [
    { en: 'Open the far-wall variant in the editor and drop the laptop\'s transmit power from 15 to 12 dBm. The received level falls just under the sensitivity of the rung it was using, so the frames drop a rung and stretch from 768.8 to 1476.0 µs.', zh: '在编辑器里打开远端墙边变体，把笔记本的发射功率从 15 dBm 降到 12 dBm。接收电平刚好跌到它原来那一级的灵敏度之下，于是帧下降一级，时长从 768.8 µs 拉到 1476.0 µs。3 dB，几乎让空口时间翻倍。' },
    { en: 'In the ladder above, set the slider to 15.9 dB and then to 62.3 dB: the top usable rung moves from MCS 1 to MCS 13, twelve rungs for 46 dB. Then press the HE (Wi-Fi 6) button: the two fastest rungs disappear.', zh: '在上面的阶梯里，把滑杆先调到 15.9 dB，再调到 62.3 dB：最高可用级从 MCS 1 变成 MCS 13——46 dB 换来十二级。再按下 HE（Wi-Fi 6）那个模式按钮，最快的两级就消失了。' },
  ],
  quiz: [
    {
      q: { en: 'Why does the same 1530-byte frame take 129.6 µs at the desk and 768.8 µs at the far wall?', zh: '同样的 1530 字节帧，为什么在书桌旁只要 129.6 µs，到远端墙边却要 768.8 µs？' },
      options: [
        { en: 'The router is slower to answer from far away', zh: '路由器在远处应答得更慢' },
        { en: 'The far link only supports a low rung, which carries fewer bits per sub-carrier, so the same bytes need more symbols', zh: '远处那条链路只撑得住低的一级，每个子载波驮的比特更少，同样的字节就要用更多符号' },
        { en: 'The brick wall delays the frame on the way', zh: '砖墙让这一帧在路上耽搁了' },
      ],
      answer: 1,
      explain: { en: 'Nothing on the way is slow. The frame leaves at MCS 1 rather than MCS 13 because that is all the ratio allows, and a low rung spends more air.', zh: '路上并没有什么东西被拖慢：这一帧走的是 MCS 1 而不是 MCS 13，因为比值只够到这一级；而级别一低，搬同样的字节就要花更多空口时间。' },
    },
    {
      q: { en: 'A neighbour\'s frame, arriving at −70 dBm, begins while your radio is transmitting. When you finish, it is still sending. Is your CCA busy?', zh: '你的电台正在发送时，邻居开始发一帧，到达功率 −70 dBm。你发完了，邻居还在发。你的 CCA 是忙吗？' },
      options: [
        { en: 'Yes: −70 dBm is above the −82 dBm preamble threshold', zh: '忙：−70 dBm 高于 −82 dBm 的前导门限' },
        { en: 'No: the preamble was missed, so only raw power counts, and −70 dBm is below −62 dBm', zh: '不忙：前导已经错过，只能按功率算，而 −70 dBm 低于 −62 dBm' },
        { en: 'Yes: CCA is always busy for a while after a transmission', zh: '忙：发送结束后 CCA 总要忙上一阵' },
      ],
      answer: 1,
      explain: { en: '−82 dBm applies only to a frame whose preamble the radio detected. One that started during your own transmission counts as energy, and energy has to reach −62 dBm. Had you been listening when it began, −70 dBm would have held you off.', zh: '−82 dBm 只适用于本机检测到了前导的那一帧。在你自己发送期间开始的帧只算能量，而能量要达到 −62 dBm 才算数。如果它开始时你正在侦听，−70 dBm 就足以把你按住。' },
    },
  ],
}
