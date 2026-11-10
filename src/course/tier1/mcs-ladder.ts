/**
 * Wi-Fi Tier 1 · M1 · lesson 4: the rungs, and how a sender picks one.
 *
 * Standard-first shape (2026-11-11). ① is what the standard specifies: the HE-MCS and
 * EHT-MCS tables (§27.5, Table 27-86; IEEE Std 802.11be-2024 §36.5.6, Table 36-76) — each
 * index a modulation, a coding rate and a data rate — the two BPSK-DCM rungs EHT adds beyond
 * 13, that the rate-switching algorithm is beyond the scope of the standard (§10.6.1), and
 * the link-adaptation feedback it does define (§10.31, §26.13). ② is this simulator's rate
 * choice: the highest rung whose required SINR plus 3 dB fits the SNR, read from the true
 * link level (an omniscient sender), with a failure-driven step below it — each marked
 * against ①. ③ is `radio-primer`'s own scene, and the far wall at 3 dB less transmit power.
 *
 * Every figure is read back out of the lesson text in tests/course/mcs-ladder.test.ts.
 */
import { J, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

export const mcsLadder: Lesson = {
  id: 'mcs-ladder',
  module: 0,
  title: '十四个速率等级，以及发送端如何选择',
  why: '上一课说明了一帧在什么条件下能解码成功：每一级都有一个要求。这些“级”就是调制与编码方式（modulation and coding scheme, MCS）。Wi-Fi 把一帧分配到几百个很窄的子载波（sub-carrier）上并行发送，这称为正交频分复用（orthogonal frequency-division multiplexing, OFDM）；20 MHz 上有 234 个数据子载波。标准的 MCS 表为每一级规定调制（modulation）与编码率（coding rate）：调制决定每个子载波每个符号（symbol）承载几个编码比特，编码率决定其中多少是信息。HE（Wi-Fi 6）有 MCS 0 到 11，EHT（Wi-Fi 7）增加了 4096-QAM（quadrature amplitude modulation）的 MCS 12、13，以及两种采用双载波调制（DCM）的 BPSK（binary phase-shift keying）方式（MCS 14、15）。最高一级的灵敏度（sensitivity）比最低一级高 36 dB。选哪一级，标准明确说不在其范围之内；它只规定了接收方向发送方推荐 MCS 的反馈机制。本仿真器的选法是：到达电平减去噪声地板（noise floor）得到信噪比（signal-to-noise ratio, SNR），选出满足“所需信干噪比（signal-to-interference-plus-noise ratio, SINR）加 3 dB 不超过 SNR”的最高一级；它读取的是对端实际的到达电平，这是一种真实设备得不到的全知视角。选得太高，没有一帧能解码成功；选得太低，这一帧又会无谓地多占用空口时间（airtime）：同样的 1530 个字节，从书桌移到远端墙边，等级下降十二级，空口时间增加到近六倍。',
  outcomes: [
    '说出 MCS 表里一级规定了什么：调制（modulation）、编码率（coding rate）与速率',
    '分清标准规定的 MCS 表与不归标准规定的选级算法',
    '按本仿真器的算法从信噪比（SNR）算出具体的等级，并说出它与真实设备的差别',
  ],
  needs: ['decode-thresholds'],
  terms: [
    { term: 'MCS', plain: '调制与编码方式：MCS 表中的某一级，规定调制、编码率与速率' },
    { term: 'OFDM', plain: 'Wi-Fi 的发送方式：几百个很窄的子载波并行传输，每个子载波同时承载这一帧的一小部分' },
  ],
  standard: [
    { heading: '一级 MCS 规定什么（§27.5，表 27-86；IEEE Std 802.11be-2024 §36.5.6，表 36-76）', text: '每个 HE-MCS 或 EHT-MCS 索引规定调制、编码率 R、每个子载波的编码比特数 N_BPSCS、数据子载波数 N_SD、每个符号的数据比特数 N_DBPS，以及三种保护间隔下的数据速率。20 MHz 即 242 音调的资源单元（resource unit, RU），单空间流（spatial stream）时 N_SD = 234。' },
    { kind: 'table', heading: '20 MHz、单空间流、0.8 µs 保护间隔，十四级中的六级', head: ['MCS', '调制', 'R', 'N_BPSCS', 'N_DBPS', '速率', '灵敏度'], rows: [
      ['0', 'BPSK', '1/2', '1', '117', '8.6 Mb/s', '−82 dBm'],
      ['1', 'QPSK', '1/2', '2', '234', '17.2 Mb/s', '−79 dBm'],
      ['3', '16-QAM', '1/2', '4', '468', '34.4 Mb/s', '−74 dBm'],
      ['7', '64-QAM', '5/6', '6', '1170', '86.0 Mb/s', '−64 dBm'],
      ['10', '1024-QAM', '3/4', '10', '1755', '129.0 Mb/s', '−54 dBm'],
      ['13', '4096-QAM', '5/6', '12', '2340', '172.1 Mb/s', '−46 dBm'],
    ] },
    { heading: '调制与编码率', text: 'BPSK（binary phase-shift keying）每个子载波每个符号承载 1 个编码比特，QPSK（quadrature phase-shift keying）2 个；QAM（quadrature amplitude modulation）的信号点排成方形网格，16、64、256、1024、4096 个点分别承载 4、6、8、10、12 个。编码率 1/2 表示一半是信息、一半是供接收端纠错的冗余。N_DBPS = N_SD × N_BPSCS × R。' },
    { heading: 'HE 与 EHT 的等级（表 27-58，表 36-67，表 36-87）', text: 'HE 有 MCS 0 到 11，最高为 1024-QAM 5/6。EHT 增加了 4096-QAM 3/4 与 5/6（MCS 12、13），以及两种 BPSK-DCM 方式：MCS 15 在各种带宽上都可用，MCS 14 只用于 EHT DUP 方式，80 MHz 及以上。' },
    { heading: '选哪一级，标准不规定（§10.6.1）', text: '有些物理层（physical layer, PHY）支持多种速率，实现可以动态切换速率以改善性能；执行速率切换的算法不在标准范围之内。标准只规定所有站点（station, STA）都要遵守的一组规则，例如控制响应帧用什么速率。' },
    { heading: '链路（link）自适应反馈（§10.31，§26.13）', text: '标准定义了接收方向发送方推荐 MCS 的机制：MFB 请求方在 HT Control 字段里置 MRQ，响应方回送 MCS 反馈（MFB）；HE 站点用 HE 变体 HT Control 字段中的 HLA 控制子字段，并在 HE 能力元素里声明是否支持。发送方怎样使用这些反馈，标准不规定。' },
    { kind: 'steps', heading: '按标准，一台发送端可以怎样得到等级：逐步说明', items: [
      '双方在能力元素里声明各自支持的 MCS 与链路自适应能力。',
      '发送端可以发出 MRQ，请求对方推荐 MCS（§10.31、§26.13）。',
      '接收端测量信道后回送 MFB，给出推荐的 MCS。',
      '发送端按自己的算法决定用哪一级——这一步不在标准范围之内（§10.6.1）。',
    ] },
  ],
  implementation: [
    { topic: 'MCS 表', standard: '表 27-86、表 36-76', sim: '照此存储：EHT 的 MCS 0 到 13、HE 的 MCS 0 到 11，在 20 MHz、单空间流、0.8 µs 保护间隔下的 N_DBPS 与速率逐级相同。', kind: 'faithful' },
    { topic: 'EHT 的 MCS 14、15', standard: '两种 BPSK-DCM 方式（表 36-67，表 36-87）', sim: '未实现：等级表只到 MCS 13。', kind: 'absent' },
    { topic: '选级算法', standard: '不在标准范围之内（§10.6.1）', sim: 'SNR = 到达电平 − 当前带宽下的噪声地板；从 MCS 0 向上逐级检查，选出最后一个满足“所需 SINR + 3 dB ≤ SNR”的等级。所需 SINR = 灵敏度 + 90.99 dB。', kind: 'choice' },
    { topic: '到达电平从哪里来', standard: '发送端只能估计：测量对方发来的帧，或者依靠接收方的 MFB（§10.31）', sim: '发送端直接读取链路表里对端实际收到的电平，这是一种全知视角；接收端的噪声系数与它所在位置的干扰，真实发送端都无法直接得知。', kind: 'differs' },
    { topic: 'MCS 反馈（MRQ、MFB、HLA）', standard: '§10.31，§26.13', sim: '未实现：帧里没有 HT Control 字段，接收方从不推荐 MCS。', kind: 'absent' },
    { topic: '失败之后', standard: '不在标准范围之内', sim: '同一条链路连续两次失败降一级，连续十次成功升一级，永远不超过按电平算出的那一级。本课的四个变体一次失败也没有，所以看不到这一层。', kind: 'choice' },
    { topic: '20 MHz 上的查表捷径', standard: '标准不规定', sim: '20 MHz 上，上面的计算等价于“选出灵敏度不高于到达电平的最高一级”：本仿真器的噪声系数 7 dB 加上 3 dB 余量，恰好等于标准表格假设的 10 dB 噪声系数。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '四个位置，四个等级',
      jump: 0,
      more: [0, 1, 3],
      steps: [
        '依次载入四个变体，每次跳到笔记本的第一个数据帧（data frame），看这一段在时间轴上有多长。',
        '对照下表读出到达电平、SNR、所选等级与这一帧的空口时间。',
      ],
      blocks: [
        { kind: 'table', heading: '同一个 1530 字节帧，按位置', head: ['位置', '到达电平', 'SNR', 'MCS', '所需 + 3 dB', '空口时间'], rows: [
          ['书桌，1 m', '−31.7 dBm', '62.3 dB', '13', '47.99 dB', '129.6 µs'],
          ['书房，5 m', '−52.7 dBm', '41.3 dB', '10', '39.99 dB', '156.8 µs'],
          ['客厅，9 m + 砖墙', '−72.3 dBm', '21.7 dB', '3', '19.99 dB', '415.2 µs'],
          ['远端墙边，14 m + 砖墙', '−78.1 dBm', '15.9 dB', '1', '14.99 dB', '768.8 µs'],
        ] },
      ],
      expect: '四个位置依次选到 MCS 13、10、3、1；同样的 1530 个字节，空口时间从 129.6 µs 增加到 768.8 µs，约为 5.9 倍。',
      meaning: '等级与速率来自标准的 MCS 表（①），选哪一级是本仿真器的算法（②）。',
    },
    {
      heading: '客厅：逐级检查',
      jump: 0,
      steps: [
        '载入本课场景（客厅），跳到第一个数据帧。',
        '在下面的等级表里把滑块放在客厅的 SNR 处，再按下表逐级检查。',
      ],
      blocks: [
        { kind: 'widget', widget: 'mcsLadder', params: { mode: 'eht', snrDb: 21.5 },
          caption: '完整的等级表，标记位于客厅那台笔记本的 SNR 处（向下取整到 21.5 dB）。点亮的等级是本仿真器认为可用的等级，3 dB 余量已经计入。' },
        { kind: 'table', heading: '客厅那台笔记本的计算过程', head: ['步骤', '数值'], rows: [
          ['到达电平', '−72.3 dBm'],
          ['减去 20 MHz 的噪声地板', '−93.99 dBm'],
          ['= SNR', '21.7 dB'],
          ['MCS 3 的要求加余量', '16.99 + 3 = 19.99 dB ✓'],
          ['MCS 4 的要求加余量', '20.99 + 3 = 23.99 dB ✗'],
          ['因此这一帧使用', 'MCS 3'],
        ] },
      ],
      expect: '21.7 dB 满足 MCS 3 的 19.99 dB，不满足 MCS 4 的 23.99 dB；第一个数据帧使用 MCS 3，34.4 Mb/s。',
      meaning: '这是本仿真器的选级算法（②）；标准只规定了每一级是什么（①）。',
    },
    {
      heading: '把发射功率（transmit power）降低 3 dB',
      variant: 3,
      steps: [
        '载入远端墙边变体，跳到第一个数据帧，记下等级与空口时间。',
        '在编辑器里把笔记本的发射功率从 15 dBm 改成 12 dBm，再看第一个数据帧。',
      ],
      blocks: [
        { kind: 'table', heading: '远端墙边，两种发射功率', head: ['发射功率', '到达电平', 'SNR', 'MCS', '空口时间'], rows: [
          ['15 dBm', '−78.1 dBm', '15.9 dB', '1', '768.8 µs'],
          ['12 dBm', '−81.1 dBm', '12.9 dB', '0', '1489.6 µs'],
        ] },
      ],
      expect: '到达电平降到 −81.1 dBm，SNR 12.9 dB 不再满足 MCS 1 的 14.99 dB，降到 MCS 0；同一帧的空口时间从 768.8 µs 增加到 1489.6 µs。',
      meaning: '3 dB 使空口时间几乎翻倍；本仿真器的发送端直接知道对端的到达电平，所以第一帧就选对了等级（②）。真实设备要靠测量或反馈才能得知这一变化（①）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§27.5 与表 27-86（HE-MCS，242 音调资源单元，单空间流）、表 27-58（HE 最小输入灵敏度）、§10.6.1（速率切换算法不在标准范围之内）、§10.31（链路自适应，MRQ 与 MFB）、§26.13（HLA 控制子字段）；IEEE Std 802.11be-2024：§36.5.6 与表 36-76（EHT-MCS）、表 36-67（EHT 最小输入灵敏度，含 MCS 14、15）、表 36-87（EHT DUP 方式的 MCS 14）。',
    '本仿真器的取值与取法：按到达电平选级、3 dB 的速率余量、发送端直接读取对端实际电平、连续两次失败降一级与连续十次成功升一级。',
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
      q: '下面哪一项是标准规定的，而不是本仿真器自己的取法？',
      options: [
        'MCS 3 是 16-QAM 1/2，20 MHz 单空间流时 34.4 Mb/s',
        '选出满足“所需 SINR + 3 dB ≤ SNR”的最高一级',
        '连续两次失败就降一级',
      ],
      answer: 0,
      explain: 'MCS 表是标准的（表 27-86、表 36-76）；§10.6.1 说速率切换算法不在标准范围之内，后两项都是本仿真器的取法。',
    },
    {
      q: '同样的 1530 字节帧，为什么在书桌旁只要 129.6 µs，到远端墙边却要 768.8 µs？',
      options: [
        '路由器在远处应答更慢',
        '远处那条链路只能支持较低的一级，每个子载波承载的比特更少，同样的字节要用更多符号',
        '砖墙使这一帧在传播途中延迟了',
      ],
      answer: 1,
      explain: '传播过程中没有任何延迟：这一帧使用 MCS 1 而不是 MCS 13，每个符号的数据比特从 2340 降到 234。',
    },
    {
      q: '一条 20 MHz 链路的到达电平是 −73 dBm。按查表捷径，本仿真器会选哪一级？',
      options: [
        'MCS 3：灵敏度 −74 dBm，不高于 −73 dBm；MCS 4 要 −70 dBm',
        'MCS 4：与 −70 dBm 只差 3 dB，正好由余量补足',
        '无法确定：不知道噪声地板就无法选择',
      ],
      answer: 0,
      explain: '捷径就是“灵敏度不高于到达电平的最高一级”。MCS 3 满足，MCS 4 不满足；那 3 dB 已经包含在这条捷径里，不能再计入一次。',
    },
  ],
}
