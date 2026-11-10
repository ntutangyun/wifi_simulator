/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · EDCA: four access categories, and the parameters that
 * decide between them.
 *
 * **Standard-first shape (2026-11-11).** ① states what IEEE Std 802.11-2024 specifies — the four
 * EDCAFs and the UP-to-AC table (§10.23.2.1, §10.2.3.2, Table 10-1), AIFS[AC] and the slot
 * boundaries (§10.23.2.4), the default parameters (Table 9-194 for a non-AP STA, the MIB's
 * dot11QAPEDCATable for an AP) and internal collisions (§10.23.2.2 item d, §10.23.2.12.1). ② says,
 * row by row, what this engine does with each; ③ is three guided runs of the lesson's own scene.
 *
 * Re-measured 2026-11-11 (W7b): the AP now contends with the dot11QAPEDCATable defaults (VO/VI
 * AIFSN 1, BE CWmax 63) and every MSDU carries a user priority whose AC follows by Table 10-1, so
 * both rows turned faithful. The row that said the internal-collision retry count "differs" was
 * wrong: §10.23.2.12.1 says the frame retry counts of the MSDUs involved in an internal collision
 * are incremented. What still differs: the parameters are an engine constant table, never
 * advertised (no Beacon), and the backoff value is drawn at the end of AIFS, which moves no
 * transmission.
 *
 * The scenario builder and the jump predicates are unchanged (`edca-cost` loads the same scene).
 * Every figure below is pinned in tests/course/edca.test.ts against a 400 ms run.
 */
import type { TimingSpec } from '../diagram'
import { type Lesson, oneRoom, node, sc, firstVo, firstInternal, J } from '../lessonKit'

/**
 * The four categories' AIFS, drawn from one frame end to scale.
 *
 * The zero point is a real instant of this run — 23.0816 ms, the moment the air goes idle before
 * the caller's first voice frame — and the first lane is the frame that ended there: the access
 * point's 32 µs BlockAck, from 23.0496. 34 µs and 43 µs are records at that instant (the caller's
 * VO and the uploader's BE); 79 µs is the same sum, `aifsNs(AIFSN)`, for the category that had
 * nothing to send just then, and the caption says which is which. The lanes are a non-AP
 * station's (Table 9-194); the AP's own VO waits 25 µs, which the caption says.
 */
export function edcaAifsTiming(): TimingSpec {
  return {
    kind: 'timing',
    lanes: [
      { label: '空口', spans: [{ fromUs: -32, toUs: 0, label: '应答' }] },
      { label: 'VO 语音', spans: [{ fromUs: 0, toUs: 34, label: '34 µs', tone: 'accent' }] },
      { label: 'VI 视频', spans: [{ fromUs: 0, toUs: 34, label: '34 µs' }] },
      { label: 'BE 尽力', spans: [{ fromUs: 0, toUs: 43, label: '43 µs' }] },
      { label: 'BK 后台', spans: [{ fromUs: 0, toUs: 79, label: '79 µs' }] },
    ],
    axis: { fromUs: -40, toUs: 110, ticks: [0, 50, 100], unit: 'µs（0 是帧尾）' },
  }
}

export const edca: Lesson = {
  id: 'edca',
  module: 7,
  title: 'EDCA——四条队列，两个数',
  why: 'IEEE 802.11-2024 的增强型分布式信道接入（enhanced distributed channel access, EDCA）把一台支持服务质量（quality of service, QoS）的站点（station, STA）的发送分成四个接入类别（access category, AC）：语音 VO、视频 VI、尽力而为 BE、后台 BK。每一类有自己的队列（queue）和自己的退避（backoff）计数器，各自独立倒数，先数到零的那一类取得传输机会（transmit opportunity, TXOP）。四类之间只有几个参数不同：倒数开始之前必须侦听到介质（medium）空闲的时间，即仲裁帧间间隔（arbitration interframe space, AIFS），由仲裁帧间间隔数（arbitration interframe space number, AIFSN）决定；以及抽取退避值的范围，即竞争窗口（contention window, CW），它从最小竞争窗口（minimum contention window, CWmin）开始，最大不超过最大竞争窗口（maximum contention window, CWmax）。按接入点（access point, AP）以外的站点的默认参数，语音的 AIFS 为 34 µs、首次抽取范围为 0 到 3，后台为 79 µs、0 到 15。两种差别的作用不同：抽取范围窄只提高先数到零的概率；AIFS 短则使语音每一轮都比后台早五个时隙（slot time）开始倒数。接入点自己的缺省参数是另一组：语音与视频的 AIFSN 为 1，所以接入点的语音比站点的语音早一个时隙开始倒数，本课场景里两者同时有语音待发时，接入点先发。同一台站点的两类在同一个时隙边界同时数到零时，优先级高的一类发送，低的一类按一次失败处理、窗口加倍，所涉及的帧记一次重传（retry），这叫内部碰撞（internal collision），不占用空口时间（airtime）。本仿真器照这些规则与缺省值运行，只是参数不随信标（Beacon）下发。',
  outcomes: [
    '说出 AIFS 的计算式与四个接入类别的默认参数，以及它们出自标准的哪一处',
    '按标准的时隙边界规则，从日志里推算出一帧语音的发送时刻',
    '说明内部碰撞的处理规则，并指出本仿真器的参数在哪几处与标准不同',
  ],
  needs: ['ifs', 'backoff', 'collisions-cw'],
  terms: [
    { term: 'EDCA', plain: '增强型分布式信道接入：一台站点有四个接入类别，每一类各有一条队列、一个退避计数器，各自参与竞争' },
    { term: 'access category', plain: '一帧被归入的那一类：语音、视频、尽力而为、后台' },
    { term: 'AIFS', plain: '仲裁帧间间隔：一类开始倒数之前必须侦听到介质空闲的时间，按类别取不同的值' },
  ],
  standard: [
    { heading: '四个接入类别（§10.23.2.1，§10.2.3.2，表 10-1）', text: 'EDCA 在分布式协调功能（distributed coordination function, DCF）的基础上增加四个相互独立的信道接入功能（EDCAF），每个接入类别一个，各有自己的发送队列，以此区分发送的优先级。每个上层数据单元带一个 0 到 7 的优先级，按表 10-1 映射到接入类别：1、2 映射到 AC_BK，0、3 映射到 AC_BE，4、5 映射到 AC_VI，6、7 映射到 AC_VO。' },
    { kind: 'formula', heading: '仲裁帧间间隔（§10.23.2.4）', text: 'AIFS[AC] = AIFSN[AC] × aSlotTime + aSIFSTime', note: '非 AP 站点的 AIFSN 不得小于 2，接入点的不得小于 1。在 20 MHz 的正交频分复用（orthogonal frequency-division multiplexing, OFDM）信道上 aSIFSTime 为 16 µs、aSlotTime 为 9 µs（表 17-24），AIFSN 取 2、3、7 时 AIFS 分别为 34、43、79 µs。AIFSN 为 2 时 AIFS 与分布式帧间间隔（DCF interframe space, DIFS）相等。' },
    { kind: 'table', heading: '非 AP 站点的默认参数（表 9-194，OFDM 物理层（physical layer, PHY）aCWmin = 15、aCWmax = 1023）', head: ['接入类别', 'CWmin', 'CWmax', 'AIFSN', 'AIFS'], rows: [
      ['AC_VO', '(aCWmin+1)/4 − 1 = 3', '(aCWmin+1)/2 − 1 = 7', '2', '34 µs'],
      ['AC_VI', '(aCWmin+1)/2 − 1 = 7', 'aCWmin = 15', '2', '34 µs'],
      ['AC_BE', 'aCWmin = 15', 'aCWmax = 1023', '3', '43 µs'],
      ['AC_BK', 'aCWmin = 15', 'aCWmax = 1023', '7', '79 µs'],
    ] },
    { heading: '参数从哪里来（§10.23.2.4，§9.4.2.27，附录 C）', text: '在基础设施网络里，接入点在信标与 Probe Response 帧的 EDCA 参数集（parameter set）元素中通告各类的 AIFSN、CWmin、CWmax 与 TXOP 上限（TXOP limit），站点按最近收到的值更新；元素中每一类还有一个 ACM 子字段，置 1 时这一类必须先经准入控制才能使用。表 9-194 是非 AP 站点的默认值。接入点自己的默认值在 MIB 的 dot11QAPEDCATable 里，与站点不同：VO、VI 的 AIFSN 为 1，BE 的 AIFSN 为 3、CWmax 为 63，BK 的 AIFSN 为 7。' },
    { kind: 'steps', heading: '一个 EDCAF 怎样取得 TXOP，按标准：逐步说明', items: [
      '退避过程被触发时（例如帧到达时介质忙），EDCAF 在 0 到 CW[AC] 之间均匀地抽取一个整数作为退避计数；CW[AC] 的初值为 CWmin[AC]（§10.23.2.2、§10.23.2.4）。',
      '介质空闲满 AIFS[AC] 之后是这一类的第一个时隙边界，此后每过一个 aSlotTime 的空闲时间是下一个边界（§10.23.2.4）。',
      '在每个时隙边界上，EDCAF 只做一件事：计数非零就减一；计数为零且有帧待发，就发起一个 TXOP；计数为零而没有帧，就什么也不做。',
      '介质变忙时计数停在当前值，下一次介质空闲满 AIFS[AC] 后继续。',
      '同一台站点的两个 EDCAF 在同一个时隙边界都可以发起 TXOP 时，优先级高的一类发起；低的一类报告一次内部碰撞，调用退避过程（§10.23.2.2 第 d) 项）：QSRC[AC] 加一，CW[AC] 取 CWmax[AC] 与 2^QSRC[AC] × (CWmin[AC] + 1) − 1 中较小的值，再抽取一个新的计数。',
    ] },
  ],
  implementation: [
    { topic: '四个 EDCAF', standard: '每个接入类别一个 EDCAF，各有一条发送队列（§10.23.2.1）', sim: '开启 EDCA 的设备有四个独立的 EDCAF，各有自己的队列、计数器与竞争窗口。', kind: 'faithful' },
    { topic: '帧归入哪一类', standard: '按每个数据单元的优先级查表 10-1（§10.2.3.2）', sim: '照此处理：每个数据单元带一个用户优先级，类别按表 10-1 查得——语音 UP 6 归入 VO，上传 UP 0 归入 BE，备份 UP 1 归入 BK。本场景里三台站点各只有一类流量；接入点的 VO 发语音，BE 一类发征求上行（uplink, UL）传输的触发帧（Trigger frame），两类都参与竞争。', kind: 'faithful' },
    { topic: '数据单元的优先级从哪里来', standard: '由上层随数据单元一同交给媒体访问控制（medium access control, MAC）层；表 10-1 的「用途」一栏只是一般性的指引', sim: '由业务档位给出：语音 6、视频 5、上传与浏览 0、备份 1。', kind: 'choice' },
    { topic: 'AIFS 的计算', standard: 'AIFSN × aSlotTime + aSIFSTime（§10.23.2.4）', sim: '16 + AIFSN × 9 µs：VO、VI 为 34 µs，BE 为 43 µs，BK 为 79 µs。', kind: 'faithful' },
    { topic: '站点的参数', standard: '非 AP 站点的默认值（表 9-194）', sim: '四类的 CWmin、CWmax、AIFSN 与表 9-194 相同，见上表。', kind: 'faithful' },
    { topic: '接入点的参数', standard: '接入点用 dot11QAPEDCATable：VO、VI 的 AIFSN 为 1，BE 的 CWmax 为 63（附录 C）', sim: '照此取值：接入点 VO 的 AIFS 为 16 + 1 × 9 = 25 µs，BE 的窗口最大到 63。', kind: 'faithful' },
    { topic: '参数的通告与准入控制', standard: '接入点在信标与 Probe Response 帧的 EDCA 参数集元素中通告；ACM 子字段可要求准入控制（§9.4.2.27）', sim: '没有信标，也没有任何管理帧（management frame）；参数是引擎里的一张常量表，场景不能改动，只有篡改配置能改变它。准入控制没有实现，语音总是可以直接使用 AC_VO。', kind: 'absent' },
    { topic: '何时抽取退避计数', standard: '退避过程被触发时抽取（§10.23.2.2）', sim: '介质空闲满 AIFS、到达第一个时隙边界时才抽取。计数在此之前不会递减，所以发送时刻与标准相同。', kind: 'differs' },
    { topic: '时隙边界上的操作', standard: 'AIFS 结束是第一个边界，此后每个 aSlotTime 一个；每个边界上只做一件事（§10.23.2.4）', sim: '照此处理：AIFS 结束的那一刻计数先减一；计数已经是零的 EDCAF 在下一个边界发送。没有收发转换时间，帧在边界那一纳秒开始。', kind: 'faithful' },
    { topic: '内部碰撞的仲裁', standard: '优先级高的一类发起 TXOP；低的一类 QSRC 加一、CW 按式加倍、重新抽取（§10.23.2.2 第 d) 项，§10.23.2.4）', sim: '照此处理，CW 的取值与标准的计算式一致。', kind: 'faithful' },
    { topic: '内部碰撞与帧的重传（retry）计数', standard: '内部碰撞所涉及的 MSDU（MAC service data unit），其帧重传计数递增（§10.23.2.12.1）', sim: '照此处理：低的一类给队头那一帧记一次重传，这一帧仍在队头，重传计数达到 dot11ShortRetryLimit 时丢弃。', kind: 'faithful' },
  ],
  labs: [
    {
      heading: '通话站点的第一帧语音',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一次 VO 接入：接入点 32 µs 的块确认（block acknowledgement, BlockAck）刚刚结束，介质重新空闲。',
        '依次查看通话站点的 AIFS、退避抽取与每一次递减，对照下表推算发送时刻。',
        '同时查看接入点：它的语音队列也在这一刻开始等待，但 AIFS 只有 25 µs。',
      ],
      blocks: [
        { kind: 'table', heading: '通话站点的第一帧语音，按步骤计算', head: ['步骤', '数值'], rows: [
          ['介质重新空闲', '23.0816 ms'],
          ['VO 的 AIFS = 16 + 2 × 9', '34 µs'],
          ['第一个时隙边界，在 0 与 CWmin 3 之间抽取', '23.1156 ms · 抽到 2'],
          ['同一个边界上计数减一', '23.1156 ms · 2 → 1'],
          ['再过一个 9 µs 的空闲时隙', '23.1246 ms · 1 → 0'],
          ['接入点的语音帧在同一时刻开始，计数停在 0', '23.1246 ms'],
          ['介质再次空闲满 34 µs，在这个边界发起 TXOP', '23.2602 ms'],
        ] },
      ],
      expect: '你应该看到：通话站点在 23.1156 ms 抽到 2，计数在 23.1246 ms 减到 0；接入点语音队列的 AIFS 为 16 + 1 × 9 = 25 µs，早一个时隙在 23.1066 ms 同样抽到 2，在 23.1246 ms 先发送。通话站点的计数停在 0，等这一次交换结束、介质再空闲 34 µs，于 23.2602 ms 发送。两帧语音都收到了确认。',
      meaning: '这说明：时隙边界上的操作照标准进行（①、②）。两个 VO 队列抽到了同一个数，但接入点的 AIFSN 为 1，比站点早一个时隙开始倒数，所以先数到零的是它，两帧没有在空中碰撞（dot11QAPEDCATable，②）。同一类别的两台站点之间仍然只靠随机抽取。',
    },
    {
      heading: '四类各等多久',
      jump: 0,
      steps: [
        '在同一时刻查看各站点的 AIFS 记录，对照下图。',
        '运行 400 ms，统计每台站点 AIFS 的长度与抽取时所用的窗口。',
      ],
      blocks: [
        { kind: 'diagram', heading: '从同一个帧尾开始，四类各等多久', spec: edcaAifsTiming(), caption: '零点是本轮的 23.0816 ms：接入点（access point, AP）那个 32 µs 的块确认刚刚结束。四条是非 AP 站点的取值；此刻实际在等待的是 34 µs（通话站点）与 43 µs（上传站点）两条，79 µs 那条是按同一个计算式、以后台的 AIFSN 算出的。最上与最下相差 45 µs，正好五个时隙。接入点自己的语音同一时刻只等 25 µs（AIFSN 1）。' },
        { kind: 'table', heading: '400 ms 里三台站点的 AIFS 与窗口', head: ['站点', '类别', '非零 AIFS 的长度', '抽取时的窗口'], rows: [
          ['通话站点', 'VO', '34 µs', '3、7'],
          ['上传站点', 'BE', '43 µs', '15、31'],
          ['备份站点', 'BK', '79 µs', '15、31'],
        ] },
      ],
      expect: '你应该看到：三台站点的完整 AIFS 分别是 34、43、79 µs；备份站点另有一段较短的等待，那是它的帧到达时介质已经空闲了一段时间，已经空闲的部分计入 AIFS。通话站点的窗口只出现过 3 和 7，上传与备份站点只出现过 15 和 31。上传站点另有几段 103 µs 的等待，那是接收出错之后的等待，下一课讲。',
      meaning: '这说明：三台站点照表 9-194 取参数（②）。窗口从 CWmin 开始、失败一次加倍一次，VO 的 CWmax 是 7，所以通话站点的窗口不会超过 7。',
    },
    {
      heading: '接入点上的内部碰撞',
      jump: 1,
      steps: [
        '跳到接入点上的内部碰撞。',
        '查看同一时刻接入点的记录：哪一类发送了，哪一类的窗口变了。',
      ],
      expect: '你应该看到：128.9604 ms 处接入点的 VO 与 BE 两个计数同时为零。VO 发送一帧语音给通话站点；BE 记一次内部碰撞，QSRC 从 0 变为 1，窗口从 15 加倍到 31，重新抽到 26。BE 这一类此时要发的是一帧触发帧，队列里没有数据单元，所以没有帧记重传。整轮 400 ms 共有两次内部碰撞，第二次在 169.9196 ms，窗口从 31 加倍到 63，这已是接入点 BE 的 CWmax。',
      meaning: '这说明：仲裁规则、窗口计算式与重传计数都照标准（①、②）：2^1 × (15 + 1) − 1 = 31。接入点 BE 的窗口不会超过 63，因为它用 dot11QAPEDCATable 的缺省值。内部碰撞只能发生在接入点上，因为本场景里只有它同时有两类要发。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.23.2.1（四个 EDCAF）、§10.2.3.2 与表 10-1（优先级到接入类别的映射）、§10.23.2.4（AIFS[AC] 的计算式、AIFSN 的下限、时隙边界上的操作、内部碰撞的判定）、§10.23.2.2（退避过程、第 d) 项内部碰撞、CW 的更新式）、§9.4.2.27（EDCA 参数集元素与 ACM 子字段）、表 9-194（非 AP 站点的默认参数）、附录 C 的 dot11QAPEDCATable（接入点的默认参数）、表 17-24（aSIFSTime、aSlotTime、aCWmin、aCWmax）、§10.23.2.12.1（帧重传计数）。',
    '本仿真器的取值与取法：业务档位给出用户优先级、参数为常量表、在 AIFS 结束时抽取。三台站点、它们的业务模型、随机种子以及每一个时刻都是本仿真器的场景，可以复现。',
  ],
  limits: [],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Caller (VO)', 'sta', 3.5, 5, 'he', 'voice'),
    node('sta-2', 'Uploader (BE)', 'sta', 6.5, 5, 'he', 'saturated'),
    node('sta-3', 'Backup (BK)', 'sta', 5, 6.5, 'he', 'backup'),
  ]),
  // Jump 1 is the first INTERNAL_COLLISION of the run, at 128.9604 ms (re-measured 2026-11-11);
  // the test runs 400 ms, which also holds the second one.
  jumps: [
    J('第一次 VO 接入', firstVo),
    J('接入点上的内部碰撞', firstInternal),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '后台这一类的 AIFSN 是 7。它每一轮必须先侦听到多长时间的介质空闲？',
      options: ['7 µs', '63 µs', '79 µs'],
      answer: 2,
      explain: '§10.23.2.4：AIFS = AIFSN × aSlotTime + aSIFSTime = 7 × 9 + 16 = 79 µs。语音的 AIFSN 为 2，得到 34 µs。',
    },
    {
      q: '同一台站点的 VO 与 BE 在同一个时隙边界都可以发起 TXOP。按标准会怎样？',
      options: [
        '两类同时发送，在空中碰撞',
        'VO 发起 TXOP；BE 报告一次内部碰撞，QSRC 加一、窗口加倍、重新抽取',
        '两类都放弃这一次，重新抽取',
      ],
      answer: 1,
      explain: '§10.23.2.4 与 §10.23.2.2 第 d) 项：优先级高的一类发起，低的一类调用退避过程；内部碰撞不占用空口时间。',
    },
    {
      q: '哪一项是本仿真器与标准不同的地方？',
      options: [
        'AIFS 按 AIFSN × aSlotTime + aSIFSTime 计算',
        'EDCA 参数是一张常量表，不在信标里通告',
        '计数为零的 EDCAF 在时隙边界上发起 TXOP',
      ],
      answer: 1,
      explain: '标准由接入点在信标与 Probe Response 帧的 EDCA 参数集元素中通告参数（§9.4.2.27）；本仿真器没有管理帧，参数是引擎里的常量表。接入点与站点各自的缺省值都照标准取。',
    },
  ],
}
