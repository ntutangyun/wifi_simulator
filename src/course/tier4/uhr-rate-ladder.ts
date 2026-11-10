/**
 * Wi-Fi Tier 4 · M13 · 草案里的 Wi-Fi 8 · the finer rate ladder, and the trade it is.
 *
 * Standard-first shape (2026-11-11). ① is what the TGbn specification framework 11-24/0209r19
 * (2025-08-02) records for the four new modulation and code-rate combinations — Motion #42 (add
 * them), #181 (MCS 0–15 identical to 802.11be), #216 (mandatory, 256-QAM 2/3 optional for
 * 20 MHz-only devices), #313 (transmit constellation error), #417 (receiver minimum sensitivity)
 * — together with the IEEE Std 802.11be-2024 ladder they join and §10.6.1 of IEEE Std
 * 802.11-2024 (rate selection is outside the standard). P802.11bn is an unapproved draft: D1.0
 * went to WG letter ballot LB291 in July 2025, D2.0 to LB296 in July 2026, and both drafts are
 * members-only, so the framework is the public record this lesson cites. ② says how the engine
 * implements each point, and is honest about the engine index not being the draft's number, the
 * optional rung the engine always supports, and the EHT numerology it reuses because the
 * framework publishes none. ③ is four guided runs.
 *
 * Every figure the lesson prints is read back out of its own text in
 * tests/course/uhr-rate-ladder.test.ts. Faded figures are means over twenty seeds; a single faded
 * run is not a measurement of the ladder.
 */
import { type Lesson, J } from '../lessonKit'
import { uhrLadderScenario } from '../wifiScenes'

export const uhrRateLadder: Lesson = {
  id: 'uhr-rate-ladder',
  module: 13,
  title: '十八档速率阶梯——细分一档确实能多升一级，而电平一旦起伏，收益大幅缩小，最窄处完全消失',
  why: 'Wi-Fi 8 的草案 P802.11bn 尚未批准。TGbn 的规范框架 11-24/0209r19 记录了已经通过的动议：Motion #42 在 Wi-Fi 7 的调制与编码方式（modulation and coding scheme, MCS）之外加入四种调制（modulation）与码率的组合——QPSK（quadrature phase-shift keying）2/3、16-QAM（quadrature amplitude modulation）2/3、16-QAM 5/6 与 256-QAM 2/3，Motion #216 把它们定为必选，草案给它们编号 MCS 17、19、20、23。这四档的灵敏度（sensitivity）落在已有各档之间，所以它们插在阶梯中间，而不是接在顶端。选用哪一档不在标准范围之内。本仿真器把四档按灵敏度插入，得到一条十八档的阶梯；只按平均电平选档且电平不变时，细阶梯在同一位置比粗阶梯高一档，增加的吞吐恰好等于两档每符号（symbol）数据比特数之比，本课房间里是 +6.71 %、+11.11 % 与 +33.33 %。新档与相邻档的灵敏度间隔大多只有 1 dB，在地板上只有 0.25 到 0.60 米宽；一旦接收电平开始起伏，细阶梯被提高的那一档更常解不出，+33.33 % 缩小到 +11.64 %，+6.71 % 则完全消失。在路由器旁边的桌上，两代设备的时间轴逐条相同，只有模式与档号两个字段不同。',
  outcomes: [
    '说出规范框架为四个新档规定了什么（组合、必选资格、编号、灵敏度），以及 P802.11bn 目前处在哪一步',
    '分清引擎索引与草案档号，以及本仿真器的哪些做法照草案、哪些是它自己的取法',
    '在同一间房的四个位置上读出两条阶梯选中的档，并说明电平起伏为什么使大部分收益消失',
  ],
  needs: ['mcs-ladder', 'rate', 'rate-fallback', 'fading'],
  terms: [
    { term: 'N_DBPS', plain: '每符号数据比特数：一个符号携带的数据比特数，等于数据子载波数 × 每子载波编码比特数 × 编码率；20 MHz 单流时数据子载波为 234 个' },
    { term: 'mandatory MCS', plain: '必选的那几档：每台设备都必须支持的档。四个新档由 Motion #216 定为必选，同一条动议规定 256-QAM 2/3 对只支持 20 MHz 的设备是可选的' },
    { term: 'log-normal shadowing', plain: '对数正态阴影：本仿真器给整条链路叠加的一个服从正态分布的随机分贝值，在一段相干时间内保持不变；起伏中较慢的那一层，较快的那一层是按每一帧单独抽取的瑞利衰落' },
  ],
  standard: [
    { heading: 'P802.11bn 现在在哪一步（TGbn 状态页；11-24/0209r19）', text: 'P802.11bn 是尚未批准的草案，条款与取值都可能变动。D1.0 于 2025 年 7 月进入工作组信函投票 LB291，D2.0 于 2026 年 7 月进入 LB296；草案正文只对工作组成员开放。公开的记录是 TGbn 的规范框架 11-24/0209r19（2025 年 8 月 2 日）：它列出已经通过的动议及其采纳的文字，草案据此起草。本课 ① 中关于新档的每一条都出自这份规范框架。' },
    { heading: '新档加入的那条阶梯（IEEE Std 802.11be-2024 §36.5.6 表 36-76，§36.3.21.2 表 36-67）', text: 'EHT 在 242 音调的资源单元（resource unit, RU）、单空间流（spatial stream）上有 EHT-MCS 0 到 13，从 BPSK（binary phase-shift keying）1/2 到 4096-QAM 5/6；数据子载波（sub-carrier）为 234 个，N_DBPS = 234 × 每子载波编码比特数 × 编码率（coding rate）。表 36-67 给出各档的接收最小输入灵敏度：在该电平上，误包率须小于 10%。' },
    { heading: '四个新组合与必选资格（Motion #42，Motion #216）', text: 'Motion #42 加入四种调制与码率的组合，作为 11bn 的新 MCS：码率 2/3 的 QPSK、16-QAM、256-QAM，以及码率 5/6 的 16-QAM。Motion #216 规定这四档为必选；只支持 20 MHz 的设备对 256-QAM 2/3 的支持是可选的。' },
    { heading: '编号（Motion #181，以及规范框架中的 5 比特 MCS 表）', text: 'UHR-SIG 用户字段中的 MCS 字段为 5 比特，其配置仍待定。5 比特 MCS 表的前 16 项（MCS 0 到 15）与 11be 相同（Motion #181）。在这张表里，MCS 17 表示 QPSK 2/3，MCS 19 表示 16-QAM 2/3，MCS 20 表示 16-QAM 5/6，MCS 23 表示 256-QAM 2/3。' },
    { kind: 'table', heading: '接收最小输入灵敏度，20 MHz 的 PPDU（PHY protocol data unit）（Motion #417）', head: ['MCS', '调制', '码率', '灵敏度'], rows: [
      ['1', 'QPSK', '1/2', '−79 dBm'],
      ['17', 'QPSK', '2/3', '−78 dBm'],
      ['2', 'QPSK', '3/4', '−77 dBm'],
      ['3', '16-QAM', '1/2', '−74 dBm'],
      ['19', '16-QAM', '2/3', '−71 dBm'],
      ['4', '16-QAM', '3/4', '−70 dBm'],
      ['20', '16-QAM', '5/6', '−69 dBm'],
      ['5', '64-QAM', '2/3', '−66 dBm'],
      ['7', '64-QAM', '5/6', '−64 dBm'],
      ['23', '256-QAM', '2/3', '−60 dBm'],
      ['8', '256-QAM', '3/4', '−59 dBm'],
    ] },
    { heading: '选哪一档，标准不规定（IEEE Std 802.11-2024 §10.6.1）', text: '有些物理层（physical layer, PHY）支持多种速率，实现可以动态切换速率以改善性能；速率切换的算法不在标准范围之内。' },
    { kind: 'steps', heading: '规范框架对四个新档逐步作出的规定', items: [
      'Motion #42：加入四种调制与码率的组合，作为 11bn 的新 MCS。',
      'Motion #181：5 比特 MCS 表的前 16 项与 11be 相同；新组合编为 MCS 17、19、20、23。',
      'Motion #216：四档为必选，256-QAM 2/3 对只支持 20 MHz 的设备可选。',
      'Motion #313：规定四档的发射星座误差，依次为 −12、−18、−20、−29 dB。',
      'Motion #417：规定四档的接收最小输入灵敏度（上表）；Motion #418 规定邻道与非邻道抑制。',
    ] },
  ],
  implementation: [
    { topic: '十八档阶梯', standard: '前 16 项与 11be 相同，新档编为 MCS 17、19、20、23（Motion #181）', sim: '「uhr」这一代用一个十八项的数组：EHT 的 MCS 0 到 13 加四个新档，按灵敏度插入，使灵敏度与 N_DBPS 都随索引严格递增。四个新档的引擎索引是 2、5、7、11，时间轴与帧详情显示的是引擎索引，不是草案档号；同一个「7」在 eht 上是 64-QAM 5/6，在 uhr 上是 16-QAM 5/6。', kind: 'differs' },
    { topic: '新档的灵敏度', standard: '−78、−71、−69、−60 dBm（Motion #417，20 MHz）', sim: '照此取值；同一张表里另外七档的灵敏度与引擎原有的 EHT 取值逐项一致。', kind: 'faithful' },
    { topic: '新档的 N_DBPS', standard: '规范框架未给出新档的 N_DBPS', sim: '按 EHT 的算法计算：234 × 每子载波编码比特数 × 编码率，四档依次为 312、624、780、1 248。', kind: 'choice' },
    { topic: '前导码与符号时长', standard: '规范框架未给出 UHR 的前导码（preamble）长度与符号时长', sim: '直接用 Wi-Fi 7 的值，所以两条阶梯每个符号的空口时间（airtime）完全相同，对照只测量阶梯本身。', kind: 'choice' },
    { topic: '256-QAM 2/3 的必选资格', standard: '只支持 20 MHz 的设备可选（Motion #216）', sim: '每一台 uhr 设备都支持它，不区分 20 MHz 设备；本课的速率表正是 20 MHz 那一列。', kind: 'differs' },
    { topic: '接收判决', standard: '在灵敏度电平上误包率小于 10%（802.11be-2024 §36.3.21.2）', sim: '每一档一条硬门限：所需信干噪比（signal-to-interference-plus-noise ratio, SINR）= 灵敏度减去噪声（噪声系数取 10 dB）；不低于门限就解出，低于就丢失。', kind: 'choice' },
    { topic: '选档', standard: '速率切换算法不在标准范围之内（§10.6.1）', sim: '上限取静态链路（link）表平均信噪比（signal-to-noise ratio, SNR）减去 3 dB 后仍满足的最高索引；连续两次失败降一个索引，连续十次成功升一个索引，不超过上限。起伏不参与上限的计算。', kind: 'choice' },
    { topic: '信道起伏', standard: '标准不定义信道模型', sim: '阴影 σ = 4 dB、相干时间 100 ms；快变的一层按每一帧抽取瑞利衰落，是按（种子、发端、收端、帧）做的哈希，不是随时间相关的随机过程。', kind: 'value' },
    { topic: 'MCS 字段与发射星座误差', standard: 'UHR-SIG 中 5 比特的 MCS 字段（Motion #190）；四档的发射星座误差（Motion #313）', sim: '未实现：帧只记录模式与档号，不建模信令比特，也不建模发射误差。', kind: 'absent' },
    { topic: 'Wi-Fi 8 的其他机制', standard: '规范框架还记录了多接入点（access point, AP）协调、非主信道接入、不等调制等动议', sim: '未实现：uhr 设备的能力与 Wi-Fi 7 完全相同，多出的只有这四档。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '同一位置，两条阶梯各选哪一档',
      jump: 0,
      more: [0],
      steps: [
        '载入本课场景（客厅中段那台持续上传的笔记本，两端都是 Wi-Fi 8），跳到第一帧数据，读出帧详情里的模式与 MCS。',
        '切换到「Wi-Fi 7 · 同一位置」，读出同样两项。',
        '对照下表：四个新档的引擎索引、草案档号与被取代的档。',
      ],
      blocks: [
        { kind: 'table', heading: '四个新档，以及它们各自取代的那一档（20 MHz、单流）', head: ['引擎索引', '草案档号', '星座与码率', '灵敏度', 'N_DBPS', '被取代的档'], rows: [
          ['2', 'MCS 17', 'QPSK 2/3', '−78 dBm', '312', '1（234）'],
          ['5', 'MCS 19', '16-QAM 2/3', '−71 dBm', '624', '3（468）'],
          ['7', 'MCS 20', '16-QAM 5/6', '−69 dBm', '780', '4（702）'],
          ['11', 'MCS 23', '256-QAM 2/3', '−60 dBm', '1 248', '7（1 170）'],
        ] },
        { kind: 'widget', widget: 'mcsLadder', params: { mode: 'eht', snrDb: 26.8 },
          caption: 'Wi-Fi 7 的十四档阶梯，标记位于客厅中段那台笔记本的信噪比处，点亮的最高一级是索引 4。细阶梯在 4 和 5 之间还多一档，这个控件不显示草案中的阶梯。' },
      ],
      expect: 'Wi-Fi 8 是 uhr、MCS 7，Wi-Fi 7 是 eht、MCS 4，整轮各只用这一档；两边的吞吐是 49.000 对 44.100 Mb/s。',
      meaning: 'uhr 的 MCS 7 是草案的 MCS 20（16-QAM 5/6），不是 eht 的 MCS 7：时间轴显示的是引擎索引（②）。选中哪一档是本仿真器的选档取法（②），标准不规定（①）。',
    },
    {
      heading: '四个位置的定点实测',
      jump: 3,
      more: [1, 2, 3, 4, 5, 6],
      steps: [
        '依次载入四个位置的 Wi-Fi 8 与 Wi-Fi 7 变体，各运行 600 ms，读出选中的档与吞吐。',
        '对照下表与下面的比值。',
      ],
      blocks: [
        { kind: 'table', heading: '这个房间的四个位置，定点实测（600 ms，笔记本持续上传）', head: ['笔记本位置', '距离 · 电平', 'Wi-Fi 7', 'Wi-Fi 8', '吞吐'], rows: [
          ['书房桌上', '1.41 m · −36.22 dBm', '13（2 340）', '17（2 340）', '140.740 → 140.740 Mb/s'],
          ['墙后一步', '3.35 m · −59.46 dBm', '7（1 170）', '11（1 248）', '73.920 → 78.880 Mb/s'],
          ['客厅中段', '6.08 m · −67.22 dBm', '4（702）', '7（780）', '44.100 → 49.000 Mb/s'],
          ['客厅深处', '7.81 m · −70.49 dBm', '3（468）', '5（624）', '29.400 → 39.200 Mb/s'],
        ] },
        { kind: 'formula', heading: '定点上的三个差就是 N_DBPS 之比', text: '1248 / 1170 = 1.0667、780 / 702 = 1.1111、624 / 468 = 1.3333；实测吞吐比是 1.0671、1.1111、1.3333。', note: '两条阶梯每个符号的空口时间相同，定点上又没有随机性：档是电平的函数，电平是位置的函数，一条满负荷的单站链路不会发生碰撞。' },
      ],
      expect: '三个有窗口的位置上 Wi-Fi 8 都高一档，吞吐比等于两档 N_DBPS 之比；书房桌上两边都在顶档（2 340），没有差别。三个窗口在地板上分别只有 0.25、1.45 与 0.60 米宽。',
      meaning: '这是只按平均电平选档、电平又不变时的上界（②的选档取法）；两条阶梯的空口时间相同，是因为本仿真器为 uhr 复用了 Wi-Fi 7 的前导码与符号时长（②）。',
    },
    {
      heading: '书房桌上两代相同',
      variant: 1,
      jump: 2,
      more: [2],
      steps: [
        '载入「Wi-Fi 8 · 书房桌上」，跳到第一次退避（backoff）抽取，再切换到「Wi-Fi 7 · 书房桌上」，比较两边的时间轴。',
      ],
      expect: '两边都是 20 122 条记录，逐条相同，只有帧的「模式」与「MCS」两个字段不同；两边的顶档都是 4096-QAM 5/6。',
      meaning: '在这个位置，一台 Wi-Fi 8 设备与一台 Wi-Fi 7 设备除名称外完全相同：本仿真器的 uhr 只多出四档（②），而这里用不到它们。',
    },
    {
      heading: '打开起伏之后',
      variant: 7,
      jump: 1,
      more: [8, 9, 10],
      steps: [
        '载入「Wi-Fi 8 · 开启阴影」，跳到第一个聚合，统计这一轮出现过几个不同的 MCS；切换到「Wi-Fi 7 · 开启阴影」再统计。',
        '再看两个「阴影＋瑞利」变体，对照下表的二十个种子均值。',
      ],
      blocks: [
        { kind: 'table', heading: '二十个种子的均值（300 ms；括号内是二十个种子中 Wi-Fi 8 更好的个数）', head: ['位置', '窗口宽', '定点', '仅开启阴影', '阴影＋按帧瑞利'], rows: [
          ['墙后一步', '1 dB', '+6.71 %', '−0.04 %（8/20）', '−0.03 %（10/20）'],
          ['客厅中段', '3 dB', '+11.11 %', '+8.18 %（19/20）', '+6.88 %（16/20）'],
          ['客厅深处', '1 dB', '+33.33 %', '+20.12 %（19/20）', '+11.64 %（14/20）'],
        ] },
      ],
      expect: '种子 2 下，Wi-Fi 8 用过四个 MCS（4、5、6、7），Wi-Fi 7 只用过两个（3、4），吞吐 39.760 对 37.200 Mb/s，高 6.9 %。二十个种子的均值都比定点小：窗口 3 dB 宽的客厅中段仍稳定获益，客厅深处剩下不到一半，墙后一步完全消失，那里两条阶梯的接收失败是 32 对 135。',
      meaning: '上限按平均电平确定、每一帧各自衰落（②），细阶梯被提高的那一档更常解不出；降档要连续两次失败、一次只降一个索引，档位多了要更多步才降下来。「细阶梯在信道变化快的地方没有收益」是这套选档算法下的结论，不是草案的结论。',
    },
  ],
  sources: [
    'TGbn 规范框架 11-24/0209r19（2025 年 8 月 2 日）：Motion #42（四个新组合）、Motion #181（MCS 0–15 与 11be 相同）、Motion #190（5 比特 MCS 字段）、Motion #216（必选，20 MHz 设备的例外）、Motion #313（发射星座误差 −12 / −18 / −20 / −29 dB）、Motion #417（接收最小输入灵敏度，20 MHz 一列）、Motion #418（邻道抑制）；5 比特 MCS 表一节给出 MCS 17 / 19 / 20 / 23 的编号。P802.11bn 的进度出自 TGbn 状态页（2026 年 9 月 8 日的快照）：D1.0 的 LB291 于 2025 年 7 月、D2.0 的 LB296 于 2026 年 7 月。P802.11bn 是未批准的草案，条号与取值都可能变动。',
    'IEEE Std 802.11be-2024：§36.5.6 表 36-76（242 音调 RU 的 EHT-MCS）、§36.3.21.2 表 36-67（接收最小输入灵敏度）。IEEE Std 802.11-2024：§10.6.1（速率切换算法不在标准范围之内）。',
    '本仿真器的取值与取法：按灵敏度插入的十八档索引、新档 N_DBPS 按 EHT 算法计算、uhr 复用 Wi-Fi 7 的前导码与符号时长、选档时 3 dB 的余量与两次降一次十次升的规则、阴影 σ = 4 dB 与 100 ms 相干时间、按帧抽取的瑞利衰落。',
  ],
  limits: [],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '时间轴上一台 Wi-Fi 8 设备的帧详情写着 MCS 7。它用的是哪种调制与码率？',
      options: [
        '64-QAM 5/6，和 Wi-Fi 7 的 MCS 7 一样',
        '16-QAM 5/6：时间轴显示的是本仿真器的引擎索引，uhr 的索引 7 是草案的 MCS 20',
        '256-QAM 2/3，因为草案把它编为 MCS 23',
      ],
      answer: 1,
      explain: '本仿真器把四个新档按灵敏度插入十八档的数组，索引 2、5、7、11 依次是草案的 MCS 17、19、20、23；比较两条阶梯时能比的是 N_DBPS，不是索引。',
    },
    {
      q: '「墙后一步」那个位置上，定点实测细阶梯快 6.71 %，打开起伏之后均值是 −0.04 %。最贴近机理的解释是哪一个？',
      options: [
        '起伏使两条阶梯的空口时间不再相同，所以对照不再成立',
        '上限按平均电平确定，而每一帧各自衰落：被提高的那一档更频繁地解不出，这一格的接收失败数是 32 对 135',
        '草案规定起伏时不得使用新档',
      ],
      answer: 1,
      explain: '两条阶梯每个符号的空口时间相同，草案也不规定选档。真正发生的是上限按均值确定而每一帧各自衰落，加上降档要两次连续失败、一次只退一个索引。',
    },
    {
      q: '下面哪一项出自 TGbn 的规范框架，而不是本仿真器的取法？',
      options: [
        '四个新档按灵敏度插在十八档阶梯中间',
        '四个新档是必选的，但 256-QAM 2/3 对只支持 20 MHz 的设备可选',
        '新档的前导码与符号时长与 Wi-Fi 7 相同',
      ],
      answer: 1,
      explain: 'Motion #216 规定了必选资格与那个例外。十八档的排列方式是本仿真器为选档算法所做的安排；前导码与符号时长规范框架没有给出，本仿真器复用了 Wi-Fi 7 的值。',
    },
  ],
  scenario: () => uhrLadderScenario('uhr', 'mid'),
  variants: [
    { label: 'Wi-Fi 7 · 同一位置', scenario: () => uhrLadderScenario('eht', 'mid') },
    { label: 'Wi-Fi 8 · 书房桌上', scenario: () => uhrLadderScenario('uhr', 'desk') },
    { label: 'Wi-Fi 7 · 书房桌上', scenario: () => uhrLadderScenario('eht', 'desk') },
    { label: 'Wi-Fi 8 · 墙后一步', scenario: () => uhrLadderScenario('uhr', 'near') },
    { label: 'Wi-Fi 7 · 墙后一步', scenario: () => uhrLadderScenario('eht', 'near') },
    { label: 'Wi-Fi 8 · 客厅深处', scenario: () => uhrLadderScenario('uhr', 'far') },
    { label: 'Wi-Fi 7 · 客厅深处', scenario: () => uhrLadderScenario('eht', 'far') },
    { label: 'Wi-Fi 8 · 开启阴影', scenario: () => uhrLadderScenario('uhr', 'mid', 'shadow', { seed: 2 }) },
    { label: 'Wi-Fi 7 · 开启阴影', scenario: () => uhrLadderScenario('eht', 'mid', 'shadow', { seed: 2 }) },
    { label: 'Wi-Fi 8 · 阴影＋瑞利', scenario: () => uhrLadderScenario('uhr', 'mid', 'both', { seed: 2 }) },
    { label: 'Wi-Fi 7 · 阴影＋瑞利', scenario: () => uhrLadderScenario('eht', 'mid', 'both', { seed: 2 }) },
  ],
  jumps: [
    J('第一帧数据', (r) => r.type === 'TX_START' && r.frame.kind === 'data'),
    J('第一个聚合', (r) => r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.ampdu !== undefined),
    J('第一次退避抽取', (r) => r.type === 'BACKOFF_DRAW'),
    J('第一次成功接收', (r) => r.type === 'RX_OK' && r.frame.kind === 'data'),
  ],
}
