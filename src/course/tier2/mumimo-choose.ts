/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · which of the two ways this turn takes.
 *
 * Standard-first shape (2026-11-11). ① what the standard specifies for a downlink multi-user
 * send: OFDMA, MU-MIMO or both in one PPDU (IEEE Std 802.11-2024 §26.5.1.1, applied to EHT by
 * IEEE Std 802.11be-2024 §35.5.1.1), the RU floor and user cap for MU-MIMO (§36.3.3.1.1,
 * §36.3.3.3), the sounding MU-MIMO depends on (§26.7.1), the fixed RU grid (§36.3.2.1), the EHT
 * symbol and coding (Table 36-18, §36.3.13.3) and the TXTIME computation (§36.4.3) — and that it
 * says nothing about how an AP chooses between the two; ② the engine's choice rule and its PHY
 * shortcuts, row by row; ③ three runs of `mumimo`'s scene and its two variants.
 *
 * The audit found the old lesson's central claim — 「a head frame under 1,000 bytes means
 * frequency」 — true of the engine and inert in this scene: every member of every send here
 * carries an A-MPDU of at least 1,438 bytes, so the two variants differ only in whether MU-MIMO was
 * negotiated. Lab 3 says so.
 *
 * It loads `mumimo`'s own scene and its two variants unchanged (`sameSceneAs`), so the recorded
 * timeline hashes are the same run twice. Every figure is read back out of this file by
 * tests/course/mumimo-choose.test.ts and compared with a run.
 */
import { type Lesson, firstData, firstBa, firstMuDl, J } from '../lessonKit'
import { mumimoScenario } from '../wifiScenes'

export const mumimoChoose: Lesson = {
  id: 'mumimo-choose',
  module: 9,
  title: '按频率还是按空间：这一轮怎么选',
  why: 'IEEE 802.11-2024 与 802.11be-2024 规定，接入点（access point, AP）可以在一次下行（downlink, DL）多用户（multi-user, MU）发送里按频率划分，即正交频分多址（orthogonal frequency-division multiple access, OFDMA），或按空间划分，即多用户 MIMO（multi-user MIMO, MU-MIMO），也可以两者并用；标准规定了两种发送各自的格式、能力条件和上限，没有规定接入点在两者之间怎样选择，选择属于实现。两种办法的收益方向相反：按空间划分的成员独占整条信道，同一份载荷（payload）所需的数据符号（symbol）更少，每个成员更快收到自己的数据；按频率划分让更多成员共用一段前导码（preamble），一次交付的数据更多。在这栋房子里，每个成员同样是 4,318 字节的聚合 MPDU（aggregate MPDU, A-MPDU），按频率划分需要三个数据符号，按空间划分只需要一个，但整帧只相差 1.08 倍，因为前导码不会缩短，按空间划分的前导码还要为四条流多发两个训练字段；按频率划分一次容纳三部手机、交付 12,954 字节，按空间划分只容纳两部、交付 8,636 字节。本仿真器的选法是：每个候选都协商过 MU-MIMO、队首那一帧都不小于 1,000 字节，才按空间划分，再按天线（antenna）数裁减组；两种划分从不在同一次发送里并用。这栋房子里每个成员都至少有 1,438 字节，1,000 字节的门限从未起作用，两个变体的差别只来自是否协商过 MU-MIMO。',
  outcomes: [
    '说出标准对下行多用户发送规定了什么、没有规定什么',
    '分清本仿真器的选法、组的上限和时长计算中哪些照标准、哪些是它自己的取法',
    '在两个变体中对照同一份载荷的数据段时长，并说明整帧为什么只相差 1.08 倍',
  ],
  needs: ['mumimo'],
  terms: [
    { term: 'symbol', plain: '符号：一次发送里数据段的最小时间单位，本仿真器为 Wi-Fi 7 帧取 13.6 µs' },
    { term: 'MU', plain: '多用户：指一次发送中的各部分分别属于不同的设备' },
    { term: 'OFDMA', plain: '正交频分多址：按频率划分的那种办法，把一条信道划分为几部分分配给几个成员' },
  ],
  standard: [
    { heading: '下行多用户发送（IEEE 802.11-2024 §26.5.1.1，IEEE 802.11be-2024 §35.5.1.1）', text: '下行多用户操作让接入点在一个 PPDU（PHY protocol data unit）里同时向一个或多个站点（station, STA）发送，方式可以是 OFDMA、MU-MIMO，或者两者并用。每个资源单元（resource unit, RU）上的 PSDU（PHY service data unit）都要填充（padding）到同一时刻结束。接入点按增强型分布式信道接入（enhanced distributed channel access, EDCA）取得发送权。HE 多用户 PPDU（multi-user PPDU, MU PPDU）的这些规则同样适用于 EHT MU PPDU，涉及 RU 的地方也适用于多个 RU 的组合（MRU）。' },
    { heading: 'RU 的位置是固定的（§36.3.2.1）', text: 'EHT 的音调规划与 RU 位置在 20 MHz 与 40 MHz 上与 HE 相同；160 MHz 及更宽的 PPDU 由若干 80 MHz 子块组成，每个子块的 RU 划分与 80 MHz 相同。各种 RU 的位置由表 36-5 到表 36-7 固定。' },
    { heading: '在一个 RU 内再按空间划分（§35.5.1.1，§36.3.3.1.1，§36.3.3.3）', text: '一个窄于 PPDU 带宽的 RU 分给多个站点，称为 DL MU-MIMO within OFDMA；只有每个站点都在 EHT 能力元素里把 Partial Bandwidth DL MU-MIMO 子字段置 1，接入点才可以这样发送，这样的 RU 不小于 242 音调。在 HE 中，对应的下限是 106 音调（IEEE 802.11-2024 §27.3.3.1.1）。一个 RU 上最多可以用 MU-MIMO 复用 8 个 EHT 站点，上行（uplink, UL）与下行相同。' },
    { heading: 'MU-MIMO 需要信道状态（IEEE 802.11-2024 §26.7.1）', text: '发射波束成形（beamforming）与 DL MU-MIMO 都要知道信道状态，才能算出加在发射信号上的导向矩阵。HE 站点用探测（channel sounding）协议取得信道状态：波束成形接收方测量发送方发来的探测 NDP，再把信道状态的估计反馈回去。' },
    { heading: '数据段的时长（表 36-18，§36.3.13.3，§36.4.3）', text: '使用基本保护间隔时，EHT 数据段一个正交频分复用（orthogonal frequency-division multiplexing, OFDM）符号长 13.6 µs。数据段用 BCC 或 LDPC 编码；RU 大于 242 音调、或者使用调制与编码方式（modulation and coding scheme, MCS）的第 10 到 14 级时，只能用 LDPC。一次发送的时长按 §36.4.3 的 TXTIME 计算，由前导码各字段与数据段的符号数相加得出。' },
    { kind: 'steps', heading: '一次 EHT 下行多用户发送，按标准：逐步说明', items: [
      '接入点按 EDCA 取得发送权（§26.5.1.1）。',
      '接入点为每个用户分配 RU 或 MRU，位置取自表 36-5 到表 36-7（§36.3.2.1）。',
      '同一个 RU 分给几个站点时就是 MU-MIMO：RU 窄于 PPDU 带宽时，每个站点都要声明支持 Partial Bandwidth DL MU-MIMO，RU 不小于 242 音调；一个 RU 上最多 8 个站点（§35.5.1.1，§36.3.3.1.1，§36.3.3.3）。',
      'MU-MIMO 的导向矩阵依据事先由探测取得的信道状态（§26.7.1）。',
      '每个 RU 上的 PSDU 填充到同一时刻结束，整次发送的时长按 TXTIME 计算（§26.5.1.1，§36.4.3）。',
    ] },
    { heading: '标准没有规定的', text: '标准规定了两种划分各自的格式、能力条件与上限，没有规定接入点在一轮发送里该按频率还是按空间划分、编入哪几个站点。' },
  ],
  implementation: [
    { topic: '选择哪一种划分', standard: '标准未规定', sim: '每个候选都协商过 MU-MIMO、队首那一帧都不小于 1,000 字节，才按空间划分；有一项不成立就按频率划分。门限看的是队首那一帧，而不是整条队列（queue）。', kind: 'choice' },
    { topic: '按空间划分时的组', standard: '一个 RU 上最多 8 个站点（§36.3.3.3）', sim: '各成员协商的流数之和不得超过接入点的天线数，超出就从组尾逐个去掉；剩下不足两部时退回按频率划分。', kind: 'choice' },
    { topic: '一组最多几个成员', standard: '标准未规定一次发送编入几个站点', sim: '最多四个。', kind: 'value' },
    { topic: '两种划分并用', standard: 'DL MU-MIMO within OFDMA，RU 不小于 242 音调（§35.5.1.1，§36.3.3.1.1）', sim: '没有实现：一次发送要么全部按空间划分、每个成员占整条信道，要么全部按频率划分。', kind: 'absent' },
    { topic: '按频率划分的份额', standard: 'RU 的尺寸与位置由表 36-5 到表 36-7 固定（§36.3.2.1）', sim: '每个成员分到信道音调数的 1/n（n 为成员数），不是标准里的某种 RU。', kind: 'differs' },
    { topic: '探测', standard: 'MU-MIMO 依靠探测取得的信道状态（§26.7.1）', sim: '没有实现：按空间划分不付出探测的时间，成员之间也没有相互泄漏，发射功率（transmit power）不分摊。', kind: 'absent' },
    { topic: '前导码的时长', standard: '由前导码各字段相加（§36.4.3）；EHT-LTF 的个数随流数增加（表 36-43）', sim: '逐个字段相加。EHT-LTF 按全组的流数计：按空间划分时两部手机共 4 条流，4 个 EHT-LTF，前导码 72.8 µs；按频率划分时按成员中最多的 2 条流计，2 个 EHT-LTF，前导码 58.4 µs。', kind: 'faithful' },
    { topic: '多用户发送的信令', standard: 'EHT-SIG 的符号数由资源单元分配与用户字段的个数决定（§36.3.12.8）', sim: '多用户发送一律另加 4 µs，即一个 EHT-SIG 符号，不随成员数计算。', kind: 'differs' },
    { topic: '数据符号的时长', standard: '基本保护间隔下 13.6 µs（表 36-18）', sim: '每个数据符号 13.6 µs。', kind: 'faithful' },
    { topic: '数据符号数', standard: '按 BCC 或 LDPC 的编码与填充过程计算；本课的多用户发送都使用 MCS 13，只能用 LDPC（§36.3.13.3）', sim: '照此按 LDPC 的编码与填充过程计算，没有尾比特（tail bits）；按频率划分时每符号比特数乘以分到的份额。整帧再加包扩展（表 36-61，每个接收方声明 16 µs 的名义填充是本仿真器的取值），并按 §6.7.6.2 取整到整微秒。', kind: 'faithful' },
    { topic: '整次发送的时长', standard: '各 RU 上的 PSDU 填充到同一时刻结束（§26.5.1.1）；各成员的 PSDU_LENGTH 由公共的 N_SYM,init 与 a_init 算出（式 36-112、36-113），A-MPDU 的填充方法见 IEEE 802.11-2024 §10.12.6', sim: '照此：取所需时长最长的那个成员，公共的 N_SYM,init 与 a_init 取自这个成员；每个成员的 A-MPDU 按 §10.12.6 填充到由它们算出的 PSDU_LENGTH，同时结束。', kind: 'faithful' },
  ],
  labs: [
    {
      heading: '同一份载荷，两种发送',
      jump: 0,
      more: [1],
      steps: [
        '载入本课场景（按频率划分），跳到第一次多用户发送，再往后找到第一个三个成员各带 3 个 MPDU（MAC protocol data unit）的发送；展开各成员的子帧（subframe）列表核对。',
        '载入「MU-MIMO（按空间划分）」，找到第一个两个成员各带 3 个 MPDU 的发送。悬停在两个宽块上，读出成员数、字节数与时长：成员表里的字节数是填充后的 PSDU 长度，A-MPDU 本身是各子帧之和。',
      ],
      blocks: [
        { kind: 'table', heading: '两种发送各取一次——160 MHz，每部手机两条流', head: ['变体', '成员数', '每成员 A-MPDU', '数据符号', '整帧长度', '单成员速率'], rows: [
          ['按频率划分', '3', '4,318 B', '3', '116.0 µs', '297.8 Mb/s'],
          ['按空间划分', '2', '4,318 B', '1', '107.0 µs', '322.8 Mb/s'],
        ] },
        { kind: 'formula', heading: '一次发送的时长', text: '整帧长度 = 前导码 + 4 µs + 13.6 µs × 数据符号数 + 包扩展，再取整到整微秒', note: '按频率划分是 58.4 + 4 + 13.6 × 3 + 12 = 115.2 µs，取整为 116.0 µs；按空间划分是 72.8 + 4 + 13.6 × 1 + 16 = 106.4 µs，取整为 107.0 µs（②）。数据符号恰好相差三倍，等于按空间划分少编入的那个组的大小；整帧只相差 1.08 倍：前导码不会缩短，按空间划分的前导码还因为四条流要多发两个 EHT-LTF 而更长。' },
      ],
      expect: '按频率划分的成员各占三分之一条信道，4,318 字节需要三个数据符号，整帧 116.0 µs；按空间划分的成员独占整条信道，只需要一个，整帧 107.0 µs。三个成员一次交付 12,954 字节，两个成员是 8,636 字节。每个 MPDU 都带 4 字节的 HT Control 字段，用来征询确认；每个成员的 A-MPDU 再按 §10.12.6 填充到 PSDU_LENGTH，按频率划分是 4,494 字节，按空间划分是 4,898 字节，时长不变。',
      meaning: '两种划分都在标准允许之内（①）；前导码、数据符号数与包扩展都按标准计算（②），但 1/n 的频率份额与 16 µs 的名义填充是本仿真器的取法与取值（②），所以 1.08 这个比值也带着这两项。',
    },
    {
      heading: '同一份 4,318 字节，两种方式各计算一遍',
      more: [1],
      steps: [
        '对照下表，按本仿真器的选法与时长算法，把上一个实验里的两次发送各推算一遍。',
      ],
      blocks: [
        { kind: 'table', heading: '同一份 4,318 字节，两种方式各计算一遍', head: ['步骤', '按频率划分', '按空间划分'], rows: [
          ['队列中有数据的手机', '3', '3'],
          ['都协商过 MU-MIMO，且队首都有 1,000 字节', '否', '是'],
          ['裁减后的成员数', '3', '2'],
          ['每个成员得到的子载波（sub-carrier）', '三分之一', '全部'],
          ['每个成员的符号数', '3', '1'],
          ['前导码（EHT-LTF 按流数计）', '58.4 µs', '72.8 µs'],
          ['包扩展', '12 µs', '16 µs'],
          ['因此这次发送的时长是', '58.4 + 4 + 13.6 × 3 + 12 = 115.2，取整 116.0 µs', '72.8 + 4 + 13.6 × 1 + 16 = 106.4，取整 107.0 µs'],
          ['这一次合计交付', '12,954 B', '8,636 B'],
        ] },
      ],
      expect: '按空间划分的组从三部裁减到两部：接入点有 4 根天线，每部手机协商了 2 条流。两列的符号数分别是 3 与 1。',
      meaning: '裁减依据的是本仿真器的天线数规则（②），标准的上限是一个 RU 上 8 个站点（①）；符号数按 LDPC 的过程计算，EHT-LTF 的个数按表 36-43 随流数增加（①、②）。',
    },
    {
      heading: '这栋房子里起作用的是哪一个条件',
      more: [1],
      steps: [
        '在两个变体里各运行 500 ms，数一数多用户发送的次数和种类。',
        '找出 A-MPDU 最短的一个成员有多少字节：展开它的子帧列表，把各子帧相加，不计末尾的填充。',
      ],
      blocks: [
        { kind: 'table', heading: '500 ms 内的多用户发送', head: ['变体', '多用户发送', '按空间划分', '最小的成员'], rows: [
          ['按频率划分', '182', '0', '1,438 B'],
          ['按空间划分', '278', '278', '1,438 B'],
        ] },
      ],
      expect: '第一个变体从不按空间划分，第二个变体每一次都按空间划分；两个变体里最小的成员都是 1,438 字节，从未低于 1,000 字节。',
      meaning: '在这栋房子里，1,000 字节的门限从未起作用，两个变体的差别只来自是否协商过 MU-MIMO（②）。门限本身是本仿真器的取法，标准没有任何对应的规定（①）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§26.5.1.1（HE 下行多用户操作）、§26.7.1（HE 探测）、§27.3.3.1.1（HE 的 DL MU-MIMO within OFDMA 不小于 106 音调）、§10.12.6（A-MPDU 的填充）。',
    'IEEE Std 802.11be-2024：§35.5.1.1（EHT 下行多用户操作与 Partial Bandwidth DL MU-MIMO）、§36.3.2.1（RU 的位置）、§36.3.3.1.1（不小于 242 音调）、§36.3.3.3（一个 RU 上最多 8 个站点）、表 36-18（符号时长）、表 36-43（EHT-LTF 的个数）、§36.3.13.3（BCC 与 LDPC）、表 36-61（包扩展）、§36.4.3 与式 (36-110)（TXTIME）、式 (36-112)、(36-113)（PSDU_LENGTH）。',
    '本仿真器的取法与取值：1,000 字节的门限（mac.ts 的 MUMIMO_MIN_BYTES）、一组最多四个成员（muDsts.slice(0, 4)）、按天线数裁减组、1/n 的频率份额、多用户发送的信令一律按一个符号（4 µs）计、16 µs 的名义填充。',
  ],
  limits: [],
  scenario: () => mumimoScenario(false),
  variants: [
    { label: 'OFDMA（按频率划分）', scenario: () => mumimoScenario(false) },
    { label: 'MU-MIMO（按空间划分）', scenario: () => mumimoScenario(true) },
  ],
  jumps: [
    J('第一次多用户发送', firstMuDl),
    J('第一个数据帧', firstData),
    J('第一个 BlockAck', firstBa),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '按标准，接入点应该在什么情况下按空间划分、什么情况下按频率划分？',
      options: [
        '队首那一帧不小于 1,000 字节时按空间划分',
        '标准没有规定，这是实现的选择；标准只规定两种发送各自的格式、能力条件与上限',
        '成员数超过四个时必须按频率划分',
      ],
      answer: 1,
      explain: '§26.5.1.1 允许 OFDMA、MU-MIMO 或两者并用，没有给出选择的规则；1,000 字节是本仿真器的门限。',
    },
    {
      q: '三部手机，一次发送。在按频率划分的办法下，再加入第四部之后，每部手机的速率会怎样？',
      options: [
        '下降——信道又被多分了一份',
        '不变——每个成员都得到整条信道',
        '上升——成员越多，每个成员分摊的开销越少',
      ],
      answer: 0,
      explain: '按频率划分的成员共享的是子载波，而不是时间：多一个成员，每个成员分到的部分就更少。',
    },
    {
      q: '在这栋房子里，第一个变体为什么从不按空间划分？',
      options: [
        '有成员的队首那一帧不到 1,000 字节',
        '这个变体里各设备没有协商 MU-MIMO',
        '接入点的天线不够',
      ],
      answer: 1,
      explain: '两个变体里最小的成员都是 1,438 字节，门限从未起作用；差别只在于是否协商过 MU-MIMO。',
    },
  ],
}
