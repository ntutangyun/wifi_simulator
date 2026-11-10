/**
 * Wi-Fi Tier 1 · M1 · lesson 4: the fourteen rungs, and the algorithm that
 * picks one. The second half of the old `decode-thresholds`.
 *
 * Born of the 2026-09-25 re-pacing
 * (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md, batch A). It
 * loads `decode-thresholds`'s own scene — which is `radio-primer`'s — so the
 * recorded timeline hashes are that run under a third id and nothing new is
 * simulated.
 *
 * The rate-picking procedure came here WHOLE, all five steps, together with
 * everything that demonstrates it: the ladder widget, the six printed rungs,
 * the worked living-room column and the four-position table. That was the one
 * thing the split had to get right — half a procedure in one lesson and half in
 * another is the failure mode the plan names by name — and it is why the
 * requirement itself (a rung's SINR, the hard threshold) stayed in
 * `decode-thresholds` while everything about CHOOSING a rung came here.
 *
 * Deleted on the way: the 连珠炮/许多个窄嗓门 restatements of the voice image,
 * which `radio-primer` now carries exactly once (§5.2 of the plan).
 *
 * Every number quoted below is pinned in tests/course/mcs-ladder.test.ts.
 */
import { J, firstAck, firstData, type Lesson } from '../lessonKit'
import { primerScenario, primerVariants } from './radioLink'

export const mcsLadder: Lesson = {
  id: 'mcs-ladder',
  module: 0,
  title: '十四个速率等级，以及发送端如何选择',
  why: '上一课说明了一帧在什么条件下能解码成功：每一级都有一个要求，达到要求就能解码。这些“级”就是调制与编码方式（modulation and coding scheme, MCS）：Wi-Fi 的速率不是连续可调的，而是十四个离散的等级，每一级规定一个符号（symbol）承载多少比特。Wi-Fi 把一帧分配到几百个很窄的子载波（sub-carrier）上并行发送，这称为正交频分复用（orthogonal frequency-division multiplexing, OFDM）；升高一级只改变两项：调制（modulation）使每个子载波承载更多比特，需要分辨的电平更多、间距更小；编码率（coding rate）提高，供接收端纠错的冗余更少。两者都要求更好的信号质量，最高一级所需的比值比最低一级高出三十多分贝。选择等级的算法是：到达电平减去噪声地板（noise floor）得到信噪比（signal-to-noise ratio, SNR），从最低一级向上逐级检查，选出最后一个满足“所需比值加上发送端多留的几分贝，仍不超过 SNR”的等级；在最窄的信道上，这几步可以合并为一次查表——选出灵敏度（sensitivity）不高于到达电平的最高一级。选得太高，没有一帧能解码成功；选得太低，这一帧又会无谓地多占用空口时间（airtime）：同样的字节，从书桌移到远端墙边，等级下降十二级，空口时间增加到近六倍。Wi-Fi 6 没有最高的两级，同一条链路（link）在两代设备上会选到不同的等级，而算法完全相同。',
  outcomes: [
    '说出升高一级改变了什么：调制（modulation）与编码率（coding rate）',
    '仅凭到达电平就读出一条链路（link）能支持的最高一级',
    '按算法完整计算一遍：从信噪比（SNR）算出具体的等级',
  ],
  needs: ['decode-thresholds'],
  terms: [
    { term: 'MCS', plain: '调制与编码方式：速率等级表中的某一级，即发送端选定的速率' },
    { term: 'OFDM', plain: 'Wi-Fi 的发送方式：几百个很窄的子载波并行传输，每个子载波同时承载这一帧的一小部分' },
  ],
  picture: [
    { heading: '等级越高，对信号的要求越高', text: '每升高一级，都要求信号比噪声与干扰再高出一些。选择了这条链路无法支持的等级，没有一帧能解码成功；选得太低，这一帧又会无谓地多占用空口时间（airtime）。这一级，就是调制与编码方式（modulation and coding scheme, MCS）。' },
    { kind: 'watch', jump: 0, heading: '在仿真中观察', text: '载入仿真，跳到笔记本的第一个数据帧（data frame），先看清这一段有多长。然后依次切换四个变体：笔记本越来越远，等级逐级下降，而同样的 1530 个字节在时间轴上明显变长。' },
    { heading: '升高一级改变的两项', text: 'Wi-Fi 不是把一路高速数据直接送入整个信道，而是把它分到几百个很窄的子载波（sub-carrier）上，每个子载波同时传送一路低速数据——这就是正交频分复用（orthogonal frequency-division multiplexing, OFDM）。升高一级，一是使每个子载波承载更多比特，需要分辨的电平更多、间距更小，对信号质量的要求就更高；二是减少供接收端纠错的冗余。' },
  ],
  numbers: [
    { kind: 'table', heading: '十四级中的六级，20 MHz、单流', head: [
      'MCS', '调制', '每子载波比特', 'Mb/s',
      '灵敏度', '所需',
    ], rows: [
      ['0', 'BPSK 1/2', '0.5', '8.6', '−82 dBm', '8.99 dB'],
      ['1', 'QPSK 1/2', '1', '17.2', '−79 dBm', '11.99 dB'],
      ['3', '16-QAM 1/2', '2', '34.4', '−74 dBm', '16.99 dB'],
      ['7', '64-QAM 5/6', '5', '86.0', '−64 dBm', '26.99 dB'],
      ['10', '1024-QAM 3/4', '7.5', '129.0', '−54 dBm', '36.99 dB'],
      ['13', '4096-QAM 5/6', '10', '172.1', '−46 dBm', '44.99 dB'],
    ] },
    { text: '调制的名称表示发送端在多少个符号之间选择：两个电平是 BPSK（binary phase-shift keying），四个是 QPSK（quadrature phase-shift keying），再往后是 QAM（quadrature amplitude modulation，信号点排成方形网格）家族的 16、64、1024 和 4096。后面的分数是编码率：1/2 表示一半是信息、一半是冗余。' },
    { kind: 'widget', widget: 'mcsLadder', params: { mode: 'eht', snrDb: 21.5 },
      caption: '完整的速率等级表，标记位于客厅那台笔记本的信噪比（SNR）处（向下取整到 21.5 dB）。点亮的等级就是可用的等级，余量已经计入。' },
    { kind: 'steps', heading: '选级算法的步骤', items: [
      '把到达电平减去当前信道带宽（channel width）下的噪声地板（noise floor），差值就是 SNR。',
      '给每一级算出所需的信干噪比（SINR）：它的灵敏度（sensitivity）加 90.99 dB，也就是减去标准表格所假设的噪声。',
      '从最低一级向上逐级检查，选出最后一个满足“所需 SINR + 3 dB ≤ SNR”的等级——这 3 dB 就是上一课讲的速率余量。',
      '以这一级发送。接收端用全程最差的 SINR 与所需 SINR 比较——余量是发送端预留的，解码时不计入。',
      '在 20 MHz 上，第 1 到 3 步可合并为一次查表：选出灵敏度不高于到达电平的最高一级。这条捷径成立，是因为本仿真器的接收灵敏度比标准表格的假设好 3 dB，恰好与余量相抵。',
    ] },
    { kind: 'table', heading: '客厅那台笔记本的计算过程', head: [
      '步骤', '数值',
    ], rows: [
      ['这条链路的到达电平', '−72.3 dBm'],
      ['减去 20 MHz 的噪声地板', '−93.99 dBm'],
      ['= SNR', '21.7 dB'],
      ['第 3 级的要求，加上余量', '16.99 + 3 = 19.99 dB ✓'],
      ['第 7 级的要求，加上余量', '26.99 + 3 = 29.99 dB ✗'],
      ['因此这一帧发送时使用', 'MCS 3'],
    ] },
    { kind: 'table', heading: '同一个 1530 字节帧，按位置', head: [
      '位置', '到达电平', 'SNR', 'MCS', '所需 + 3 dB', '空口时间',
    ], rows: [
      ['书桌，1 m', '−31.7 dBm', '62.3 dB', '13', '47.99 dB', '129.6 µs'],
      ['书房，5 m', '−52.7 dBm', '41.3 dB', '10', '39.99 dB', '143.2 µs'],
      ['客厅，9 m + 砖墙', '−72.3 dBm', '21.7 dB', '3', '19.99 dB', '415.2 µs'],
      ['远端墙边，14 m + 砖墙', '−78.1 dBm', '15.9 dB', '1', '14.99 dB', '768.8 µs'],
    ] },
  ],
  deeper: [
    { heading: '编码率的含义与代价', text: '每个调制名称旁边的那个分数——1/2、3/4、5/6——是发送内容中真正属于信息的比例；其余是冗余，接收端用它纠正被噪声破坏的比特。所以一个等级实际上是两个选择的组合：网格中有多少个信号点，以及附带多少冗余。第 3 级与第 7 级分别是 16-QAM 1/2 与 64-QAM 5/6，调制与编码率都不同——每子载波 2 比特对 5 比特，代价是要求高出 10 dB。' },
    { heading: '为什么 Wi-Fi 6 只有十二级', text: '把小部件切换到 HE（Wi-Fi 6）模式，最高的两级就会消失：4096-QAM 是 Wi-Fi 7（802.11be）才加入的。同一条链路在两代设备上会选到不同的等级，而选级算法完全相同。' },
  ],
  limits: [
    { kind: 'model-value', text: '发送端怎么知道到达电平是多少？在本仿真器里，它直接读那张传播链路表（simulation.ts 的 mcsForPeer），也就是把对端实际收到的电平直接提供给发送端，这是一种全知视角。真实设备无法获得这一信息，只能通过三种途径之一去近似：测量自己收到对方帧的电平，再假定反向链路大致相同（互易性推断）；由接收端把测量结果告知发送端（802.11n 起的 MCS 反馈 MFB、ac/ax 的探测与波束成形报告）；或者完全不看电平，只看哪一级的成功率高（纯失败驱动）。而且即使互易性完美也不够：它需要的是接收端处的信噪比，而接收端的噪声系数与接收端位置上的干扰，发送端都无法观测——这正是需要显式反馈的原因。' },
    { kind: 'model-value', text: '“选择哪一级”标准从不规定，速率控制留给实现者。这里用的“灵敏度不高于到达电平，再留 3 dB 余量”的查表法，是本仿真器的算法，不是标准行为。' },
    { kind: 'out-of-scope', text: '本课四个变体一次失败也没有，所以这张查表只给出上限：引擎在它之下还有一层基于失败的反馈——同一条链路连续两次失败就降一级，连续十次成功再升回来，且永远不超过上限，而本课这一层看不见。', until: 'rate-vs-model' },
    { kind: 'unmodelled', text: '真实速率控制的输入还要更多：最近的成功率、信道忙闲，以及主动探测。这一半一课也不解除——引擎里这三项都没有，而每一课运行的是同一个引擎；那一课测量的是这个双计数器控制器使理论答案与实际运行结果相差多少，而不是替换它。', seeAlso: 'rate-vs-model' },
    { kind: 'out-of-scope', text: '本课场景的链路条件不随时间变化，所以这里看不出速率控制真正要解决的问题：每条链路始终处于同一级。要观察这个问题，需要在编辑器的「时变链路（衰落）」一节里打开衰落，让同一条链路在几级之间来回变化。', until: 'fading' },
    { kind: 'unmodelled', text: '“只有一部分子载波严重衰落”现在可以出现——场景在衰落之外再加 selectivity 一节，衰落就按 2.03125 MHz 一格各自独立取值——但“真实设备正是依据它来选择带宽、空间流与信道”这一半仍然没有：选级那一步读取的是链路表的均值（simulation.ts 的 mcsForPeer），频率选择性完全不参与。真实设备依靠的正是标准为此规定的两种反馈——逐 26 音调资源单元的平均信噪比（HE 是 IEEE Std 802.11-2024 §9.4.1.65，EHT 是 IEEE Std 802.11be-2024 §9.4.1.75，两条分别位于两份文档中，基础标准里没有后面那个条号）与逐子载波的信噪比偏差（IEEE Std 802.11-2024 §9.4.1.49，4 比特、−8…+7 dB）。也没有多普勒，相干时间是一个配置值。' },
  ],
  sources: [
    '最小输入灵敏度表：OFDM PHY 见 §17.3.10.2，HE 见 §27.3.19.4，EHT 有对应条款。每一级的调制与编码率见各 PHY 的 MCS 表；本课的 Mb/s 是 20 MHz、单空间流、0.8 µs 保护间隔下的数值。',
    '“选择哪一级”标准从不规定：速率控制留给实现者，所以这里的 3 dB 余量与“灵敏度不高于到达电平”的查表法，都是本仿真器的模型取值。',
  ],
  scenario: () => primerScenario(9),
  variants: primerVariants,
  jumps: [
    J('第一个数据帧', firstData),
    J('第一个 ACK', firstAck),
  ],
  observe: [
    '读出四个变体里第一个数据帧的 MCS：13、10、3、1——即上表那四个比值在等级表上点亮的等级。',
    '再读这一帧的空口时间：129.6、143.2、415.2、768.8 µs。下降十二级后，同样的 1530 个字节所需的空口时间增加到近六倍。',
  ],
  tryThis: [
    '在上面的等级表里，把滑块先调到 15.9 dB，再调到 62.3 dB：最高可用等级从 MCS 1 变为 MCS 13——46 dB 对应十二级。再按下 HE（Wi-Fi 6）那个模式按钮，最快的两级就会消失。',
    '在编辑器里打开远端墙边变体，把笔记本的发射功率（transmit power）从 15 dBm 降到 12 dBm。到达电平恰好降到原来那一级的灵敏度以下，因此降一级，时长从 768.8 µs 增加到 1476.0 µs：3 dB 使空口时间几乎翻倍。',
  ],
  quiz: [
    {
      q: '同样的 1530 字节帧，为什么在书桌旁只要 129.6 µs，到远端墙边却要 768.8 µs？',
      options: [
        '路由器在远处应答更慢',
        '远处那条链路只能支持较低的一级，每个子载波承载的比特更少，同样的字节要用更多符号',
        '砖墙使这一帧在传播途中延迟了',
      ],
      answer: 1,
      explain: '传播过程中没有任何延迟：这一帧使用 MCS 1 而不是 MCS 13，因为比值只能支持到这一级。',
    },
    {
      q: '一条链路的到达电平是 −73 dBm，20 MHz。按第 5 步那条捷径，它能支持哪一级？',
      options: [
        'MCS 3：灵敏度 −74 dBm，不高于 −73 dBm；下一级要 −70 dBm',
        'MCS 4：与 −70 dBm 只差 3 dB，正好由余量补足',
        '无法确定：不知道噪声地板就无法选择',
      ],
      answer: 0,
      explain: '捷径就是“灵敏度不高于到达电平的最高一级”。第 3 级满足，第 4 级不满足；那 3 dB 已经包含在这张表里，不能再计入一次。',
    },
  ],
}
