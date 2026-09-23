/**
 * Wi-Fi Tier 1 · M1 · The opener of the whole course: a radio is a voice in a
 * room, and everything that follows starts from how loud it arrives compared
 * with everything else the receiver hears.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): a track's
 * first lesson, so at most four new words, no table in the picture, and the
 * whole main path under 1000 words. The decibel arithmetic and the mW-by-mW
 * interference sum are in `deeper`; the model's provenance is in `sources`.
 *
 * Amendment of 2026-09-23: the link budget the engine computes — transmit
 * power, path loss, walls, noise floor, SNR, then the neighbour added to that
 * floor as power — is on the main path as a six-step procedure, in the order
 * `rxPowerDbm`, `noiseDbm` and the channel's interference sum take it. The
 * lesson no longer says margin/余量: it owns SNR and SINR, which are the same
 * height above the noise said with a word the reader has been given.
 *
 * Every number quoted below is pinned in tests/course/radio-primer.test.ts.
 */
import { J, N, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

export const radioPrimer: Lesson = {
  id: 'radio-primer',
  module: 0,
  title: { en: 'How loud a radio arrives', zh: '一个无线信号到达时有多响' },
  why: {
    en: 'A radio is a voice in a room. Whether the other end makes out the words depends on how far away it is, what stands in between, and who else is talking. How fast to send, when to wait, whether to send at all: every one of those starts from one comparison, which this lesson works out end to end.',
    zh: '一个无线信号，就是房间里的一个人声。对面能不能听清，取决于离得多远、中间隔着什么、还有谁在同时说话。发多快、什么时候等、要不要发——每一个决定都从同一个比较开始；这一课就把这个比较从头到尾算一遍。',
  },
  outcomes: [
    { en: 'read how loud a link arrives and how far it stands above the noise', zh: '读出一条链路到达时有多响，以及它比噪声高出多少' },
    { en: 'say which way the signal moves when a laptop walks away or a wall comes between', zh: '说出笔记本走远、或中间隔上一堵墙时，信号往哪个方向变' },
    { en: 'explain why one neighbour costs a link more than the noise does', zh: '解释为什么一个邻居比噪声本身更让一条链路吃亏' },
  ],
  needs: [],
  terms: [
    { term: 'RSSI', plain: {
      en: 'how loud the wanted signal arrives at the receiver',
      zh: '想听的那个信号到达接收端时有多响',
    } },
    { term: 'SNR', plain: {
      en: 'how loud it is above the noise floor the receiver always hears',
      zh: '它比接收端始终听得见的那点噪声（噪声地板）高出多少',
    } },
    { term: 'SINR', plain: {
      en: 'how loud it is above the noise plus everyone else talking',
      zh: '它比噪声、再加上其他人说话的声音，高出多少',
    } },
  ],
  picture: [
    { heading: { en: 'A voice in a room', zh: '房间里的一个人声' }, text: {
      en: 'Two radios in a flat are two people talking. The router speaks; the laptop has to make out the words. Walk to the far end and the voice is fainter; shut a door and fainter still. But loudness alone decides nothing: what decides is whether the voice still stands out from the hum of the room.',
      zh: '屋里的两台设备，就是两个正在说话的人。路由器开口，笔记本得听清它说了什么。走到屋子另一头，声音就轻了；再关上一道门，又轻一层。可光看响度决定不了什么：真正决定的是，这个声音还能不能从屋里的嗡嗡声里冒出来。',
    } },
    { heading: { en: 'Two numbers, not one', zh: '要记两个数，不是一个' }, text: {
      en: 'So the receiver keeps two numbers. The first is how loud the wanted signal arrived — the RSSI, in dBm, a scale where each step of ten means ten times the power. The second takes off the room\'s own hum, the noise floor: signal minus noise is the SNR, and it, not the RSSI, decides what the link can do.',
      zh: '所以接收端要记两个数。第一个是想听的信号到达时有多响——这就是 RSSI，用 dBm 写，这把尺子上每差十格，功率就差十倍。第二个是把屋里那点底噪——也就是噪声地板——减掉之后还剩多少：信号减噪声就是 SNR；真正决定这条链路能做什么的是它，而不是 RSSI。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Go and look', zh: '去看一眼' }, text: {
      en: 'Load the simulation, jump to the laptop\'s first data frame, then switch variants: desk, study, living room, far wall. Nothing about the laptop changes but how loud it arrives, and the rate on the frame follows it down.',
      zh: '载入仿真，跳到笔记本的第一个数据帧，然后切换变体：书桌、书房、客厅、远端墙边。笔记本和它的业务自始至终没变，变的只是它到达时有多响——而帧上的速率，就跟着一路往下走。',
    } },
    { heading: { en: 'What the trip takes', zh: '这一路要被拿走多少' }, text: {
      en: 'Two things eat the signal on the way: distance, because the power spreads in every direction and indoors thins faster than in the open, and whatever the straight line between the antennas passes through — plasterboard a little, brick a lot. Take both off what the sender put out and you have the RSSI.',
      zh: '信号在路上会被两样东西吃掉：一是距离，功率朝各个方向摊开，在室内比在空旷处衰减得更快；二是两根天线之间那条直线穿过的东西——石膏板拿走一点，砖墙拿走很多。把这两样从发射端发出的功率里减掉，剩下的就是 RSSI。',
    } },
    { heading: { en: 'When somebody else is talking', zh: '同时还有别人在说话' }, text: {
      en: 'Noise is the floor of the room and is always there. A neighbour\'s frame is something else: while it is in the air its power piles on top of that floor, and what counts is the signal above noise and interference together — the SINR. A real flat is never quiet, so that is the honest number.',
      zh: '噪声是这个房间的地板，始终都在。邻居发出的一帧则是另一回事：它在空中的这段时间里，功率会叠到那块地板上，真正能用的就成了信号高出“噪声加干扰”的那部分——也就是 SINR。真实的房子从来都不安静，所以这才是诚实的那个数。',
    } },
  ],
  numbers: [
    { kind: 'formula', heading: { en: 'What arrives', zh: '到达的是多少' }, text: {
      en: 'RSSI = P_tx − (46.7 + 30·log10(d / 1 m)) − Σ walls',
      zh: 'RSSI = P_tx − (46.7 + 30·log10(d / 1 m)) − Σ 墙体损耗',
    }, note: {
      en: 'Doubling the distance costs 9.0 dB, so one brick wall is worth moving two and a half times further away.',
      zh: '距离翻倍要付 9.0 dB，所以一堵砖墙相当于把距离拉远到两倍半。',
    } },
    { kind: 'table', heading: { en: 'The same laptop, four places', zh: '同一台笔记本，四个位置' }, head: [
      { en: 'Where it sits', zh: '它在哪儿' }, N('RSSI'), N('SNR'), { en: 'Rate of its frames', zh: '它发帧的速率' },
    ], rows: [
      [{ en: 'Desk, 1 m', zh: '书桌，1 m' }, N('−31.7 dBm'), N('62.3 dB'), N('172.1 Mb/s')],
      [{ en: 'Study, 5 m', zh: '书房，5 m' }, N('−52.7 dBm'), N('41.3 dB'), N('129.0 Mb/s')],
      [{ en: 'Living room, 9 m + brick', zh: '客厅，9 m + 砖墙' }, N('−72.3 dBm'), N('21.7 dB'), N('34.4 Mb/s')],
      [{ en: 'Far wall, 14 m + brick', zh: '远端墙边，14 m + 砖墙' }, N('−78.1 dBm'), N('15.9 dB'), N('17.2 Mb/s')],
    ] },
    { kind: 'formula', heading: { en: 'The floor of the room', zh: '房间的地板' }, text: {
      en: 'N(W) = −174 dBm/Hz + 10·log10(W) + 7 dB   →   N(20 MHz) = −93.99 dBm',
      zh: 'N(W) = −174 dBm/Hz + 10·log10(W) + 7 dB   →   N(20 MHz) = −93.99 dBm',
    }, note: {
      en: 'Each doubling of the channel width takes in twice the noise, 3 dB more: at 160 MHz the floor has risen to −84.96 dBm. The signal does not grow to match, so wide channels reach less far.',
      zh: '信道每宽一倍，收进来的噪声就多一倍，也就是多 3 dB：到 160 MHz 时，地板已抬到 −84.96 dBm。信号却不会跟着长大，所以宽信道覆盖更近。',
    } },
    { kind: 'steps', heading: { en: 'The whole budget, step by step', zh: '整条链路，一步一步算' }, items: [
      { en: 'Start at the sender\'s transmit power: the laptop\'s 15 dBm.',
        zh: '从发送端设定的发射功率出发：笔记本是 15 dBm。' },
      { en: 'Take off the path loss: 46.7 dB in the first metre, 30 dB more for every tenfold — 75.3 dB at 9 m.',
        zh: '减去路径损耗：第一米 46.7 dB，此后距离每涨十倍再减 30 dB——9 m 处一共 75.3 dB。' },
      { en: 'Take off each wall the straight line crosses: plasterboard 5 dB, brick 12, glass 3. One brick wall leaves the RSSI, −72.3 dBm.',
        zh: '减去这条直线穿过的每一堵墙：石膏板 5 dB，砖墙 12，玻璃 3。这里只穿一堵砖墙，剩下的就是 RSSI，−72.3 dBm。' },
      { en: 'Work out the noise floor at the width in use: −174 dBm per hertz, plus the width in hertz, plus the receiver\'s 7 dB — −93.99 dBm at 20 MHz.',
        zh: '算出当前带宽下的噪声地板：每赫兹 −174 dBm，加上带宽的赫兹数，再加接收端自己的 7 dB——20 MHz 下是 −93.99 dBm。' },
      { en: 'RSSI minus that floor is the SNR: −72.3 − (−93.99) = 21.66 dB.',
        zh: 'RSSI 减去这块地板，就是 SNR：−72.3 − (−93.99) = 21.66 dB。' },
      { en: 'While a neighbour is on the air, add it to the floor as power, never as decibels: −85 dBm makes the floor −84.48 dBm, and the SNR becomes a SINR of 12.16 dB.',
        zh: '邻居在空中发帧的这段时间里，把它当功率、而不是当分贝加到地板上：−85 dBm 让地板升到 −84.48 dBm，SNR 也就变成 12.16 dB 的 SINR。' },
    ] },
    { kind: 'widget', widget: 'linkBudget',
      params: { txDbm: 15, distanceM: 9, drywall: 0, brick: 1, glass: 0, mode: 'eht', widthMhz: 20 },
      caption: {
        en: 'The same six steps, preset to the living-room laptop. Drag the distance and add walls; the received level and its height above the noise move together.',
        zh: '同样这六步，预设为客厅里的那台笔记本。拖动距离、加减墙体，看接收电平和它高出噪声的那一截怎样一起变化。',
      } },
  ],
  deeper: [
    { heading: { en: 'Decibels, and why powers never add in dB', zh: '分贝，以及功率为什么不能按 dB 相加' }, text: {
      en: 'A dB is a ratio, 10·log10(P1/P2); a dBm is a power compared with 1 mW, so it is absolute. +3 dB doubles a power, −3 dB halves it, +10 dB multiplies it by ten. dBm − dBm gives dB and dBm + dB gives dBm, but two dBm values are never added directly: convert to mW first. The router transmits 100 mW (20 dBm) and the laptop 31.6 mW (15 dBm); 9 m and one brick wall later that laptop is 5.85 × 10⁻⁸ mW, or −72.3 dBm, at the router.',
      zh: 'dB 是比值，10·log10(P1/P2)；dBm 是相对 1 mW 的功率，是绝对值。+3 dB 是功率翻倍，−3 dB 是减半，+10 dB 是乘以十。dBm − dBm 得 dB，dBm + dB 得 dBm，但两个 dBm 永远不能直接相加，要先换成 mW。路由器发 100 mW（20 dBm），笔记本发 31.6 mW（15 dBm）；隔着 9 m 和一堵砖墙之后，这台笔记本在路由器处只剩 5.85 × 10⁻⁸ mW，也就是 −72.3 dBm。',
    } },
    { kind: 'steps', heading: { en: 'Adding the neighbour, in milliwatts', zh: '把邻居加到地板上：换成毫瓦再算' }, items: [
      { en: 'Noise: −93.99 dBm = 3.99 × 10⁻¹⁰ mW. The neighbour: −85 dBm = 3.16 × 10⁻⁹ mW.', zh: '噪声：−93.99 dBm = 3.99 × 10⁻¹⁰ mW；邻居：−85 dBm = 3.16 × 10⁻⁹ mW。' },
      { en: 'Sum: 3.56 × 10⁻⁹ mW = −84.48 dBm. The stronger term dominates; the noise adds only 0.52 dB to it.', zh: '相加：3.56 × 10⁻⁹ mW = −84.48 dBm。较强的那一项占主导，噪声只让它多了 0.52 dB。' },
      { en: 'SINR = −72.33 − (−84.48) = 12.16 dB, against an SNR of 21.66 dB: 9.5 dB gone.', zh: 'SINR = −72.33 − (−84.48) = 12.16 dB，而 SNR 本是 21.66 dB：少了 9.5 dB。' },
      { en: 'Two equal neighbours at −85 dBm are twice the power, +3 dB: −81.99 dBm, not −170.', zh: '两个同为 −85 dBm 的邻居是两倍功率，即 +3 dB：−81.99 dBm，而不是 −170。' },
    ] },
    { kind: 'table', heading: { en: 'The noise floor of every width', zh: '各种带宽下的噪声地板' }, head: [
      { en: 'Width', zh: '带宽' }, N('20 MHz'), N('40 MHz'), N('80 MHz'), N('160 MHz'), N('320 MHz'),
    ], rows: [
      [{ en: 'Noise floor', zh: '噪声地板' }, N('−93.99 dBm'), N('−90.98 dBm'), N('−87.97 dBm'), N('−84.96 dBm'), N('−81.95 dBm')],
    ] },
    { heading: { en: 'What the router\'s answer does', zh: '路由器的回帧又如何' }, text: {
      en: 'The router\'s answering frame barely notices any of this: 24 Mb/s in the first three variants and 12 Mb/s only at the far wall, 28 µs of air against 32 µs. An answer goes out at a low compulsory rate, so it steps coarsely while the data frames stretch nearly sixfold.',
      zh: '路由器的回帧几乎不受这些影响：前三个变体都是 24 Mb/s，只有到远端墙边才降到 12 Mb/s，空口时间 28 µs 对 32 µs。回帧走的是低速的强制速率，只会粗粒度地跳档，而数据帧的时长已经拉长到近六倍。',
    } },
    { text: {
      en: 'The simulator keeps the worst interference seen at any instant during a reception and judges the whole frame by it. Distance is measured in three dimensions; walls are counted along the two-dimensional floor-plan ray, and a ray through a door or window opening crosses no wall. A 6 GHz link pays a further 1.2 dB, the extra free-space loss of the higher frequency.',
      zh: '仿真器会记下一次接收期间任一瞬间出现过的最强干扰，并据此判定整帧。距离按三维算；穿墙则按平面图上的二维射线判断，射线正好穿过门洞或窗洞时不算穿墙。6 GHz 链路还要再付 1.2 dB，那是更高频率多出来的自由空间损耗。',
    } },
  ],
  sources: [
    { en: 'The path-loss model is a log-distance one: 46.7 dB in the first metre is free space at 5.2 GHz, and the exponent of 3.0 after it is a typical indoor value — both model choices, not standard text.',
      zh: '路径损耗用的是对数距离模型：第一米的 46.7 dB 是 5.2 GHz 的自由空间损耗，其后 3.0 的路径损耗指数是室内典型值——两者都是模型取值，并非标准正文。' },
    { en: 'The per-crossing wall losses (plasterboard 5 dB, brick 12 dB, glass 3 dB) and the 1.2 dB extra for 6 GHz are this simulator\'s constants, in the range the usual indoor measurements report.',
      zh: '每穿一堵墙的损耗（石膏板 5 dB、砖墙 12 dB、玻璃 3 dB）以及 6 GHz 多付的 1.2 dB，都是本仿真器的常数，取值落在常见室内实测的范围内。' },
    { en: 'The noise floor is thermal noise, −174 dBm/Hz at room temperature, times the bandwidth, plus a 7 dB noise figure — the same default ns-3 uses. The standard\'s own sensitivity tables assume 10 dB instead; the next lesson uses that difference.',
      zh: '噪声地板是热噪声：室温下每赫兹 −174 dBm，乘以带宽，再加 7 dB 噪声系数——与 ns-3 的默认值相同。标准自己的灵敏度表假设的是 10 dB；下一课要用到这个差值。' },
  ],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK', '第一个 ACK', firstAck),
  ],
  observe: [
    { en: 'Read the rate of the first data frame in each of the four variants: 172.1, 129.0, 34.4 and 17.2 Mb/s. Same laptop, same router, same traffic; only the distance and one brick wall differ.', zh: '在四个变体里分别读出第一个数据帧的速率：172.1、129.0、34.4、17.2 Mb/s。笔记本、路由器和业务完全一样，差别只有距离和那一堵砖墙。' },
    { en: 'In the first 100 ms the router acknowledges 353 frames from the desk but only 107 from the far wall, under a third. The difference is 46 dB of distance and brick.', zh: '前 100 ms 里，路由器确认了书桌位置的 353 帧，远端墙边却只有 107 帧，不到三分之一。差别全在那 46 dB 的距离与砖墙。' },
  ],
  tryThis: [
    { en: 'In the panel above, walk the laptop from 4.5 m to 9 m to 18 m, brick wall in place. The level reads −63.3, −72.3 and −81.4 dBm: the same step down for each doubling.', zh: '在上面的小部件里，把笔记本从 4.5 m 挪到 9 m，再挪到 18 m，砖墙保持不动。接收电平依次是 −63.3、−72.3、−81.4 dBm：距离每翻一倍，就往下掉同样的一格。' },
    { en: 'In the editor, open the living-room variant and make the brick wall glass. The received level rises to −63.3 dBm — the 4.5 m brick figure — and the frames speed up from 34.4 to 86.0 Mb/s.', zh: '在编辑器里打开客厅变体，把书房与客厅之间那堵砖墙改成玻璃。接收电平升到 −63.3 dBm——正是 4.5 m 隔砖墙时的那个数——帧速率也从 34.4 Mb/s 升到 86.0 Mb/s。' },
  ],
  quiz: [
    {
      q: { en: 'A neighbour arrives at −85 dBm while the router is receiving the living-room laptop at −72.33 dBm. How much is left?', zh: '路由器正在接收客厅那台笔记本（−72.33 dBm），此时邻居以 −85 dBm 到达。还剩多少？' },
      options: [
        { en: 'The same 21.66 dB: another frame is a signal, not noise', zh: '还是那 21.66 dB：别人的帧是信号，不是噪声' },
        { en: 'About 12.16 dB: the neighbour piles on top of the noise floor', zh: '约 12.16 dB：邻居叠到了噪声地板上' },
        { en: 'Nothing: two frames at once always destroy each other', zh: '一点不剩：两帧同时到达一定互相毁掉' },
      ],
      answer: 1,
      explain: { en: 'The SINR counts, not the SNR. At −85 dBm the neighbour is far above the −93.99 dBm floor and dominates the sum, taking 9.5 dB.', zh: '起作用的是 SINR，不是 SNR。−85 dBm 的邻居远高于 −93.99 dBm 的地板，在相加里占主导，一口气拿走 9.5 dB。' },
    },
    {
      q: { en: 'The channel goes from 20 MHz to 160 MHz, nothing else changes. What happens to the RSSI and the floor?', zh: '信道从 20 MHz 换成 160 MHz，其他都不变。RSSI 和噪声地板会怎样？' },
      options: [
        { en: 'Both rise by about 9 dB', zh: '两者都升高约 9 dB' },
        { en: 'The RSSI is unchanged; the floor rises about 9 dB, to −84.96 dBm', zh: 'RSSI 不变；地板升高约 9 dB，到 −84.96 dBm' },
        { en: 'The RSSI falls by about 9 dB; the floor is unchanged', zh: 'RSSI 下降约 9 dB；地板不变' },
      ],
      answer: 1,
      explain: { en: 'The same power is sent, so the same power arrives. Listening eight times as wide takes in eight times the noise, 9.03 dB, and the SNR falls by exactly that.', zh: '发送端发出的功率没变，到达的功率也就不变；而监听带宽是八倍，收进的噪声也是八倍——9.03 dB——SNR 正好掉这么多。' },
    },
  ],
}
