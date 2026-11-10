/**
 * Wi-Fi Tier 2 · M9 · 容量参数与速率控制 · Channel width.
 *
 * Standard-first shape (2026-11-11). ① is what IEEE Std 802.11be-2024 (on top of IEEE Std
 * 802.11-2024) says about channel width: the widths an EHT STA must and may support (§36.1.1),
 * the subcarrier counts of Table 36-19, N_DBPS and the symbol of Table 36-18 / §36.5, TXTIME
 * (§36.4.3, Eq. 36-110), the symbol count (§36.3.13.3.5) with LDPC-only MCSs 10–13
 * (§36.3.13.3.3), the 3 dB-per-doubling sensitivity table (Table 36-67), how wide a TXOP's
 * PPDU may be (§10.23.2.5 as amended) and CCA on the primary 20 MHz channel (§36.3.21.6). ②
 * marks the engine against each point — including the four places it departs: one width per
 * link for the whole run, a single 48 µs preamble constant, the BCC symbol count on LDPC-only
 * rungs, and energy detection over the whole channel instead of per 20 MHz. ③ four runs.
 *
 * The scenario builder and the four variants are unchanged, so the recorded timeline hashes in
 * tests/fixtures/lesson-hashes.json stay byte-identical. Every figure printed below is read back
 * out of the lesson text in tests/course/width.test.ts and compared with the engine or a run.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, firstData, firstAck, J } from '../lessonKit'
import { widthScenario } from '../wifiScenes'

/**
 * The same 1530-octet frame at the four widths, to scale. Every span is this lesson's own run:
 * a fixed 48 µs preamble (`PHY_MODES.eht.preambleNs`) and then the data, which is all that
 * moves — 81.6, 40.8, 27.2 and 13.6 µs, the four airtimes of lab 1 less that opening.
 */
export function widthAirtimeTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '20 MHz', spans: [
        { fromUs: 0, toUs: 48, label: '前导码 48' },
        { fromUs: 48, toUs: 129.6, label: '数据 81.6', tone: 'accent' },
      ] },
      { label: '40 MHz', spans: [
        { fromUs: 0, toUs: 48 },
        { fromUs: 48, toUs: 88.8, label: '40.8', tone: 'accent' },
      ] },
      { label: '80 MHz', spans: [
        { fromUs: 0, toUs: 48 },
        { fromUs: 48, toUs: 75.2, label: '27.2', tone: 'accent' },
      ] },
      { label: '160 MHz', spans: [
        { fromUs: 0, toUs: 48 },
        { fromUs: 48, toUs: 61.6, label: '13.6', tone: 'accent' },
      ] },
    ],
    axis: { fromUs: 0, toUs: 136, ticks: [0, 48, 100], unit: 'µs' },
  }
}

export const width: Lesson = {
  id: 'width',
  module: 8,
  title: '信道带宽——增加的是子载波数，不是信号速率',
  why: 'IEEE Std 802.11be-2024 为 Wi-Fi 7 规定了 20、40、80、160、320 MHz 五种信道带宽（channel width）。带宽越宽，数据子载波（sub-carrier）越多：20 MHz 有 234 根，40、80、160 MHz 分别有 468、980、1960 根；两端的保护子载波对整段频段只计一次，所以 80 MHz 与 160 MHz 略多于整倍数。每个符号（symbol）承载的数据比特与数据子载波数成正比，符号的时长却与带宽无关，所以加宽信道缩短的只有数据部分；前导码（preamble）各字段的时长也与带宽无关。标准的最小输入灵敏度（sensitivity）表规定，带宽每加倍，同一调制与编码方式（modulation and coding scheme, MCS）所需的电平提高 3 dB；本仿真器把噪声地板（noise floor）取为热噪声加噪声系数，带宽每加倍升高 3.01 dB。按标准，一次传输机会（transmit opportunity, TXOP）只在主 20 MHz 信道上竞争获得，这一次发送多宽，取决于各个副信道在此之前是否空闲；本仿真器则让一条链路（link）在整段仿真里始终使用两端配置中较窄的带宽。在书桌上，同一个 1530 字节的帧从 20 MHz 的 129.6 µs 缩短到 160 MHz 的 61.6 µs：数据子载波是 8.38 倍，时间只缩短到 47.5 %。移到客厅中间，160 MHz 降到 MCS 0，一帧比 80 MHz 还慢；在最远的角落，160 MHz 一帧也送不到，较窄的三档仍然每帧送达。',
  outcomes: [
    '说出标准规定的带宽、每种带宽的数据子载波数，以及带宽怎样进入一帧的空口时间（airtime）',
    '分清本仿真器的带宽处理哪些照标准、哪些是它自己的取值或与标准不同',
    '读出同一帧在四种带宽下的空口时间，并解释覆盖边缘的站点（station, STA）为什么应选窄信道',
  ],
  needs: ['mcs-ladder', 'noise-floor', 'airtime'],
  terms: [
    { term: 'channel width', plain: '一次发送占用的频段宽度：20、40、80、160 或 320 MHz' },
    { term: 'sub-carrier', plain: '信道被划分成的许多窄频率分量中的一个；数据子载波承载数据，导频子载波供接收端跟踪相位' },
    { term: 'symbol', plain: '一段固定时长的正交频分复用（orthogonal frequency-division multiplexing, OFDM）信号；一帧的数据部分总是整数个符号' },
    { term: 'primary 20 MHz channel', plain: '主 20 MHz 信道：宽信道里的一个 20 MHz 子信道，竞争接入只看它的忙闲；其余的 20 MHz 子信道是副信道' },
  ],
  standard: [
    { heading: '五种带宽，哪些必须支持（IEEE Std 802.11be-2024 §36.1.1）', text: '极高吞吐量（EHT）物理层（physical layer, PHY）定义 20、40、80、160、320 MHz 五种信道带宽。6 GHz 频段的 EHT 接入点（access point, AP）必须支持 160 MHz。除只支持 20 MHz 的非接入点站点外，EHT 站点在 5 GHz 与 6 GHz 频段必须支持 20、40、80 MHz；160 MHz 对其余站点是可选的；320 MHz 只在 6 GHz 频段使用，也是可选的。' },
    { heading: '每种带宽有多少子载波（表 36-18，表 36-19）', text: 'EHT 数据字段的子载波间隔是 78.125 kHz（表 36-18）。不打孔、整条信道只发给一个用户的 EHT PPDU（PHY protocol data unit）在 20、40、80、160、320 MHz 上分别有 234、468、980、1960、3920 根数据子载波，8、16、16、32、64 根导频子载波，合计 242、484、996、1992、3984 根；其余是信道正中的直流子载波与两端的保护子载波（表 36-19）。40 MHz 及以上各档两端的保护子载波都是 12 根与 11 根，不随带宽增加，所以 80 MHz 与 160 MHz 的数据子载波比 20 MHz 的整倍数略多。' },
    { heading: '每个符号承载多少比特（§36.5，表 36-76）', text: '每个符号的数据比特数 N_DBPS = 数据子载波数 × 每子载波编码比特数 × 码率 × 空间流（spatial stream）数（§36.5，式 36-122）；数据速率 = N_DBPS ÷ (12.8 µs + 保护间隔)（式 36-123）。20 MHz（242 音调资源单元（resource unit, RU））单流时，MCS 13（4096-QAM（quadrature amplitude modulation）5/6）的 N_DBPS 是 2340，0.8 µs 保护间隔下的速率是 172.1 Mb/s（表 36-76）。数据符号长 12.8 µs 加保护间隔，0.8 µs 保护间隔时为 13.6 µs，与带宽无关（表 36-18）。' },
    { heading: '一帧的时长（§36.4.3，§36.3.13.3）', text: 'EHT PPDU 的 TXTIME = 20 µs + T_EHT-PREAMBLE + 数据符号数 × T_SYM + 包扩展 + 信号扩展（式 36-110）。20 µs 是 L-STF（legacy short training field）8 µs、L-LTF（legacy long training field）8 µs 与 L-SIG（legacy signal field）4 µs；其后的 RL-SIG 4 µs、U-SIG（universal signal field）8 µs、每个 EHT-SIG 符号 4 µs、EHT-STF 4 µs 与每个 EHT-LTF 符号的时长都由表 36-18 给出，与带宽无关。数据符号数按 ⌈(8 × 长度 + 服务字段（SERVICE field）16 位 + 尾比特（tail bits）) ÷ N_DBPS⌉ 起算（式 36-49），尾比特在 BCC 编码时为 6 位、LDPC 编码时为 0（表 36-18）；MCS 10 到 13 和大于 242 音调的资源单元只能用 LDPC 编码（§36.3.13.3.3）。' },
    { heading: '灵敏度随带宽提高（§36.3.21.2，表 36-67）', text: '在最小输入灵敏度电平上，4096 字节 PSDU（PHY service data unit）的误包率必须低于 10 %。带宽每加倍，同一 MCS 的灵敏度电平提高 3 dB：BPSK（binary phase-shift keying）1/2 在 20、40、80、160、320 MHz 上是 −82、−79、−76、−73、−70 dBm，MCS 13 是 −46、−43、−40、−37、−34 dBm。' },
    { heading: '一次发送用多宽（IEEE Std 802.11-2024 §10.23.2.5，经 802.11be 修订）', text: '支持多种带宽时，增强型分布式信道接入（enhanced distributed channel access, EDCA）只根据主信道的活动获得传输机会，「介质（medium）空闲」就是主信道空闲。获得传输机会之后，站点按副信道在此前一个 PIFS 内是否空闲，选择发送 160、80、40 还是 20 MHz 的 PPDU；EHT 站点还可以发送打孔的多用户 PPDU（multi-user PPDU, MU PPDU），只要求未打孔的各个 20 MHz 子信道在此前 PIFS 内空闲。所发带宽不得超过接收方支持的带宽（§10.6.5.8）。' },
    { heading: '空闲信道评估看哪一段（§36.3.21.6）', text: '工作带宽大于 20 MHz 时，空闲信道评估（clear channel assessment, CCA）以主 20 MHz 信道为准：主 20 MHz 信道内测得的 VHT、HE 或 EHT PPDU 功率达到 −82 dBm 时报告忙，任何信号在主 20 MHz 信道内超过 −62 dBm 时也报告忙；另外按每个 20 MHz 子信道给出忙闲位图（bitmap）：子信道上的信号达到 −62 dBm，或其中的 PPDU 达到 −72 dBm（或更高的 OBSS_PD 门限），这个子信道即为忙。' },
    { kind: 'steps', heading: '一台 80 MHz 设备发送一帧，按标准：逐步说明', items: [
      '在主 20 MHz 信道上退避（backoff）；计数到零时获得传输机会（§10.23.2.4，§10.23.2.5）。',
      '检查副 20 MHz 与副 40 MHz 信道在此前一个 PIFS 内是否空闲：都空闲就可以发 80 MHz，只有副 20 MHz 空闲就发 40 MHz，否则发 20 MHz；EHT 站点也可以把忙的子信道打孔（§10.23.2.5）。',
      '所选带宽、MCS 与空间流数必须在接收方支持的集合之内（§10.6.5.8，IEEE Std 802.11be-2024 §35.14.4.1）。',
      '按所选带宽的数据子载波数算出 N_DBPS，再算出数据符号数（式 36-49）。',
      '一帧的时长 = 20 µs + EHT 前导码其余部分 + 数据符号数 × 13.6 µs + 包扩展（式 36-110）。',
    ] },
  ],
  implementation: [
    { topic: '带宽怎样确定', standard: '每次传输机会按副信道是否空闲选择，可以打孔（§10.23.2.5）', sim: '一条链路在整段仿真里只用一个带宽：两端配置的较小值，每一帧都用它；没有主信道与副信道之分，也没有打孔。本课四档是四次各自独立的运行，不是一台设备在一次运行里做的四种选择。', kind: 'differs' },
    { topic: '不超过接收方支持的带宽', standard: '所发带宽须为接收方支持（§10.6.5.8）', sim: '取两端配置的较小值，所以从不超过任何一端的带宽；传统电台（802.11a）一律按 20 MHz。', kind: 'faithful' },
    { topic: '数据子载波数', standard: '234、468、980、1960、3920 根（表 36-19）', sim: '照此取值，每符号比特数按「20 MHz 的 N_DBPS × 数据子载波数之比」计算：80 MHz 是 980 ÷ 234 = 4.19 倍。', kind: 'faithful' },
    { topic: '数据符号的时长', standard: '12.8 µs 加保护间隔，0.8 µs 时为 13.6 µs（表 36-18）', sim: '照此取值；本课用 0.8 µs 保护间隔。', kind: 'faithful' },
    { topic: '前导码的时长', standard: '20 µs 加 T_EHT-PREAMBLE，逐个字段相加，EHT-SIG 与 EHT-LTF 的符号数随 PPDU 变化（式 36-110，表 36-18）', sim: '取单一常数 48 µs，不随带宽、空间流数与 EHT-SIG 符号数变化；一个 EHT-SIG 符号、一个 2× EHT-LTF（6.4 µs 加 0.8 µs 保护间隔）时逐个字段相加是 47.2 µs。', kind: 'differs' },
    { topic: '数据符号的个数', standard: 'MCS 10 到 13 只用 LDPC，尾比特为 0，另有前向纠错之前的填充（padding）（§36.3.13.3.3，§36.3.13.3.5）', sim: '一律按 ⌈(16 + 8 × 字节数 + 6) ÷ N_DBPS⌉ 计数，这是 BCC 编码的算法，含 6 个尾比特。本课 1530 字节的帧按 LDPC 的 12256 位或按 BCC 的 12262 位计，四档的符号数都是 6、3、2、1，没有差别。', kind: 'differs' },
    { topic: '包扩展', standard: '式 36-110 含包扩展，0 到 20 µs（表 36-18）', sim: '不加包扩展。', kind: 'absent' },
    { topic: '噪声随带宽', standard: '灵敏度表每加倍提高 3 dB（表 36-67）；标准不规定接收机噪声', sim: '噪声地板 = −174 dBm/Hz + 10·log10(带宽) + 7 dB，带宽每加倍升高 3.01 dB；20 MHz 上是 −93.99 dBm。', kind: 'value' },
    { topic: '每一级所需的信噪比', standard: '标准只给灵敏度电平与 10 % 误包率（§36.3.21.2）', sim: '所需信噪比（signal-to-noise ratio, SNR）= 20 MHz 灵敏度 −（20 MHz 的热噪声 + 10 dB 噪声系数），与带宽无关：MCS 13 是 44.99 dB；选级时再加 3 dB 速率余量。带宽只通过噪声地板起作用。', kind: 'value' },
    { topic: '解调的判决', standard: '标准只规定灵敏度电平上的误包率须低于 10 %（§36.3.21.2）', sim: '非此即彼：整帧期间最差的信干噪比（signal-to-interference-plus-noise ratio, SINR）达到这一级的要求就整帧解出，否则整帧丢失，中间没有过渡带。', kind: 'choice' },
    { topic: '空闲信道评估', standard: '以主 20 MHz 信道为准，另按每个 20 MHz 子信道给出忙闲（§36.3.21.6）', sim: '没有主信道：前导检测（preamble detection）按整个信号的电平与 −82 dBm 比较，能量检测（energy detection, ED）按整条信道收到的总功率与 −62 dBm 比较，不分 20 MHz 子信道。', kind: 'differs' },
    { topic: '信道模型', standard: '标准不规定传播信道', sim: '本课四档的信道是平的：整条信道只有一个电平，带宽只是子载波数的倍数与噪声地板的升高量。各子信道衰落不同的情形在下一课《频率选择性》里打开。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '同一帧，四种带宽',
      jump: 0,
      more: [0, 1, 2, 3],
      steps: [
        '依次载入四个变体，每次跳到笔记本发给路由器的第一个数据帧（data frame），把鼠标悬停在它上面，读出 MCS、速率与时长。',
        '再跳到第一个确认帧（acknowledgement, ACK），读出它的时长。',
      ],
      blocks: [
        { kind: 'table', heading: '1530 字节的帧，Wi-Fi 7，单流，书桌上', head: ['带宽', '数据子载波', 'MCS', '速率一行', '数据符号', '空口时间'], rows: [
          ['20 MHz', '234', '13', '172.1 Mb/s', '6', '129.6 µs'],
          ['40 MHz', '468', '13', '172.1 Mb/s', '3', '88.8 µs'],
          ['80 MHz', '980', '13', '172.1 Mb/s', '2', '75.2 µs'],
          ['160 MHz', '1960', '13', '172.1 Mb/s', '1', '61.6 µs'],
        ] },
        { kind: 'diagram', heading: '同一帧，四种带宽，按比例绘制', spec: widthAirtimeTiming(), caption: '四条道上的前导码都是 48 µs；缩短的只有数据部分：81.6、40.8、27.2、13.6 µs。' },
      ],
      expect: '你应该看到：四档都是 MCS 13，速率一行都是 172.1 Mb/s；空口时间依次是 129.6、88.8、75.2、61.6 µs，即 6、3、2、1 个数据符号加 48 µs 的前导码；四档的确认帧都是 28 µs。',
      meaning: '这说明：速率一行是 20 MHz 单流的速率，带宽体现在每符号比特数里，按 ① 的数据子载波数成比例增加；符号数向上取整，160 MHz 时只剩一个符号，前导码已占整帧的 77.9 %。48 µs 是本仿真器的常数（②）。',
    },
    {
      heading: '书桌上的噪声代价',
      jump: 0,
      more: [0, 1, 2],
      steps: [
        '载入本课场景（160 MHz），跳到第一个数据帧，读出到达电平。',
        '对照下表，按 ② 的噪声地板算出四种带宽下的 SNR，与 MCS 13 的要求比较。',
      ],
      blocks: [
        { kind: 'table', heading: '同一位置，四种带宽', head: ['带宽', '噪声地板', 'SNR', 'MCS 13 的要求（含 3 dB 余量）'], rows: [
          ['20 MHz', '−93.99 dBm', '57.8 dB', '48.0 dB'],
          ['40 MHz', '−90.98 dBm', '54.8 dB', '48.0 dB'],
          ['80 MHz', '−87.97 dBm', '51.8 dB', '48.0 dB'],
          ['160 MHz', '−84.96 dBm', '48.7 dB', '48.0 dB'],
        ] },
      ],
      expect: '你应该看到：到达电平是 −36.22 dBm；带宽每加倍，噪声地板升高 3.01 dB，SNR 随之降低，到 160 MHz 只剩 48.7 dB，仍高于 MCS 13 要求的 48.0 dB，所以四档都用 MCS 13。',
      meaning: '这说明：所需信噪比与带宽无关，加宽信道的代价全在噪声地板上（②），与 ① 灵敏度表每加倍 3 dB 一致。书桌上的余量足以承受 160 MHz 的代价。',
    },
    {
      heading: '客厅中间：更宽反而更慢',
      variant: 3,
      more: [0, 1, 2],
      steps: [
        '载入「160 MHz」，点“在编辑器中打开”，把笔记本移到 x = 10.5、y = 6（路由器右边七格半、下面两格），运行 50 ms。',
        '其余三个变体做同样的移动，读出每一档的 MCS 与空口时间。',
      ],
      blocks: [
        { kind: 'table', heading: '笔记本在客厅中间', head: ['带宽', 'MCS', '空口时间', '重传'], rows: [
          ['20 MHz', '3', '415.2 µs', '0'],
          ['40 MHz', '3', '238.4 µs', '0'],
          ['80 MHz', '2', '170.4 µs', '0'],
          ['160 MHz', '0', '224.8 µs', '0'],
        ] },
        { kind: 'table', heading: '最宽两档，按 ② 逐步计算', head: ['步骤', '80 MHz', '160 MHz'], rows: [
          ['到达电平', '−70.51 dBm', '−70.51 dBm'],
          ['噪声地板', '−87.97 dBm', '−84.96 dBm'],
          ['SNR', '17.46 dB', '14.45 dB'],
          ['可用的最高一级', 'MCS 2', 'MCS 0'],
          ['它的要求（含余量）', '13.99 + 3 = 16.99 dB', '8.99 + 3 = 11.99 dB'],
          ['上一级的要求', '16.99 + 3 = 19.99 dB', '11.99 + 3 = 14.99 dB'],
          ['每符号比特数', '351 × 4.19 = 1470', '117 × 8.38 = 980'],
          ['数据符号：⌈12262 ÷ 每符号比特数⌉', '9', '13'],
          ['空口时间：48 + 13.6 × 符号数', '170.4 µs', '224.8 µs'],
        ] },
      ],
      expect: '你应该看到：四档每帧都送达，没有重传（retry）；MCS 依次是 3、3、2、0，空口时间 415.2、238.4、170.4、224.8 µs。160 MHz 的 SNR 比 MCS 1 的要求差 0.54 dB，比 80 MHz 低了两级：MCS 2 的要求只比 MCS 1 高 2 dB，噪声地板升高的 3.01 dB 把 SNR 从 MCS 2 的要求之上推到了 MCS 1 的要求之下。',
      meaning: '这说明：子载波翻倍弥补不了每符号比特数降到三分之一。倒挂的位置取决于本仿真器取的 3 dB 速率余量和非此即彼的判决（②）；标准只规定灵敏度表每加倍提高 3 dB（①）。',
    },
    {
      heading: '最远的角落',
      variant: 3,
      more: [0, 1, 2],
      steps: [
        '在编辑器里把笔记本移到 x = 15、y = 7，四个变体各运行 200 ms。',
        '数一数每一档收到的确认帧，读出数据帧的 MCS 与时长。',
      ],
      blocks: [
        { kind: 'table', heading: '笔记本在最远的角落', head: ['带宽', 'MCS', '空口时间', '200 ms 内收到的确认帧'], rows: [
          ['20 MHz', '2', '524.0 µs', '293'],
          ['40 MHz', '0', '768.8 µs', '213'],
          ['80 MHz', '0', '401.6 µs', '350'],
          ['160 MHz', '0', '224.8 µs', '0'],
        ] },
      ],
      expect: '你应该看到：到达电平是 −76.51 dBm；160 MHz 的 SNR 只有 8.45 dB，低于 MCS 0 要求的 8.99 dB，一个确认帧也收不到，200 ms 内丢弃了 17 个帧；较窄的三档都每帧送达，其中 80 MHz 最快，40 MHz 停在 MCS 0，比 20 MHz 还慢。',
      meaning: '这说明：在覆盖边缘，窄信道换来的灵敏度比放弃的子载波更有价值。真实的设备逐次按副信道的忙闲选择带宽（①），本仿真器的一条链路只能用配置好的那一档（②），所以要由人改配置。',
    },
  ],
  sources: [
    'IEEE Std 802.11be-2024：§36.1.1（必须与可选的带宽）、表 36-18（子载波间隔、符号与各字段时长、服务字段与尾比特）、表 36-19（各带宽的数据、导频子载波数与保护子载波数）、§36.5 式 36-122 与 36-123、表 36-76（242 音调资源单元的 N_DBPS 与速率）、§36.4.3 式 36-110（TXTIME）、§36.3.13.3.3 与 §36.3.13.3.5（LDPC 与数据符号数）、§36.3.21.2 与表 36-67（最小输入灵敏度）、§36.3.21.6（空闲信道评估）、§35.14.4.1（接收方支持的 EHT-MCS 与空间流集合）。',
    'IEEE Std 802.11-2024：§10.23.2.5（多种带宽下的 EDCA 信道接入，802.11be 增加了 EHT MU PPDU 一项）、§10.6.5.8（数据帧的速率与带宽约束）。',
    '本仿真器的取值与取法：一条链路一个带宽、48 µs 的前导码常数、按 BCC 算法计数符号、不加包扩展、噪声系数 7 dB、所需信噪比按 10 dB 噪声系数从灵敏度反推、3 dB 速率余量、非此即彼的判决、能量检测按整条信道的总功率。',
    '房间、两台设备的位置、客厅中间与最远角落这两个位置，都是本仿真器的场景取值。',
  ],
  limits: [],
  scenario: () => widthScenario(160, 1),
  variants: [
    { label: '20 MHz', scenario: () => widthScenario(20, 1) },
    { label: '40 MHz', scenario: () => widthScenario(40, 1) },
    { label: '80 MHz', scenario: () => widthScenario(80, 1) },
    { label: '160 MHz', scenario: () => widthScenario(160, 1) },
  ],
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '这一帧在 20 MHz 要 129.6 µs；到 160 MHz，数据子载波是 8.38 倍，却仍要 61.6 µs。为什么？',
      options: [
        '160 MHz 的发射功率（transmit power）更低',
        '前导码的时长与带宽无关，而数据部分最少也要一个完整的符号',
        '160 MHz 必须使用更低的 MCS',
      ],
      answer: 1,
      explain: '按比例缩短的只有数据部分：6 个符号压缩到 1 个 13.6 µs 的符号；48 µs 的前导码不变，已占整帧的 77.9 %。',
    },
    {
      q: '按标准，一台支持 80 MHz 的设备每次发送多宽，由什么决定？',
      options: [
        '关联时协商好，以后每一帧都用这个带宽',
        '在主 20 MHz 信道上获得传输机会后，看各个副信道在此前一个 PIFS 内是否空闲',
        '由接入点在每个信标（Beacon）里指定',
      ],
      answer: 1,
      explain: '这是 §10.23.2.5 的规则，EHT 站点还可以把忙的子信道打孔。本仿真器没有实现这一点：一条链路始终用两端配置中较窄的带宽。',
    },
    {
      q: '笔记本在最远的角落。把带宽从 160 MHz 调到较窄的一档，会怎样？',
      options: [
        '更慢：子载波少了，每一帧都更长',
        '能送达了：窄信道的噪声地板更低，SNR 回到 MCS 0 的要求之上',
        '没有区别：带宽不影响覆盖',
      ],
      answer: 1,
      explain: '160 MHz 的 SNR 是 8.45 dB，低于 MCS 0 要求的 8.99 dB；80 MHz 的噪声地板低 3.01 dB，每帧都能送达。',
    },
  ],
}
