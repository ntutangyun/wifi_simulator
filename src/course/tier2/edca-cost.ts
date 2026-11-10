/**
 * Wi-Fi Tier 2 · M8 · QoS 与效率 · what the head start costs, and who pays it.
 *
 * The second half of `edca`, on the parent's own scene (`sameSceneAs: 'edca'`), in the
 * standard-first shape (2026-11-11). ① states what IEEE Std 802.11-2024 specifies: an EDCAF acts
 * only at slot boundaries that follow idle medium (§10.23.2.4), so priority never interrupts a
 * transmission; the defaults give AC_BK the longest AIFS (Table 9-194); and after an erroneous
 * reception an EDCAF waits EIFS − DIFS + AIFS[AC], ended early by an error-free reception
 * (§10.3.2.3.7, Equation 10-7). ② says what the engine does with each — `beginIfsAc` in
 * src/engine/mac.ts, `corruptLast ? eifsNs - difsNs + aifs : aifs` — and ③ is four guided runs.
 *
 * The audit found the EIFS arithmetic faithful (fixed EIFS, Equation 10-7; the optional dynamic
 * EIFS of Equation 10-8 is not modelled) and the decode decision a binary threshold the standard
 * does not specify. Every figure below is pinned in tests/course/edca-cost.test.ts against a 300 ms
 * run — re-measured 2026-11-11 (W7b), after the AP took its dot11QAPEDCATable defaults and every
 * MSDU its own UP (the station-class row turned faithful).
 */
import { type Lesson, oneRoom, node, sc, J } from '../lessonKit'

export const edcaCost: Lesson = {
  id: 'edca-cost',
  module: 7,
  title: '优先接入的代价，以及由谁承担',
  why: '增强型分布式信道接入（enhanced distributed channel access, EDCA）的参数只决定介质（medium）空闲之后谁先开始发送，不增加任何空口时间（airtime），也不能中断已经开始的发送：标准规定每个接入类别（access category, AC）只在介质空闲之后的时隙（slot time）边界上操作。所以本课房间里通话的平均排队时延很短，但最长的一次仍是平均值的两倍多。语音少等的时间由其他类别承担，代价最大的是后台：运行后台流量的备份站点（station, STA）仲裁帧间间隔（arbitration interframe space, AIFS）最长、窗口最宽，整轮只抽取了 10 次退避（backoff）值，第一帧等了 55 ms，帧的平均排队时间约为通话的七倍。规则里还有一个分支：接收的帧出错之后，下一次竞争前等待扩展帧间间隔（extended interframe space, EIFS）减分布式帧间间隔（DCF interframe space, DIFS）再加本类的 AIFS，多出的部分留给其他站点为那一帧回确认帧（acknowledgement, ACK）；在此期间正确收到一帧，这段等待就结束。这个房间里上传站点两次等满这段时间，每次 103 µs；通话站点有一次开始这段等待（VO 为 94 µs），随即被一次新的接收结束。',
  outcomes: [
    '说明 EDCA 不能做什么：已经开始的发送不会被中断',
    '读出三台站点的抽取次数与排队时延，说明优先级最低的一类承担了什么',
    '写出接收出错之后那段等待的计算式，算出 103 µs，并说出哪台站点遇到过它',
  ],
  needs: ['edca'],
  terms: [
    { term: 'EIFS', plain: '扩展帧间间隔：接收的帧出错之后使用的较长等待，留出其他站点为那一帧回确认帧的时间' },
  ],
  standard: [
    { heading: '只在介质空闲之后竞争（§10.23.2.4）', text: '每个 EDCAF 的时隙边界都定义在介质空闲之后：空闲满 AIFS[AC] 是第一个边界，之后每空闲一个 aSlotTime 是下一个。介质忙时没有时隙边界，计数不递减，任何一类都不能发起传输机会（transmit opportunity, TXOP）。所以优先级只决定介质空闲之后谁先发送，不能中断正在进行的发送；另一台站点的 TXOP 有多长，由 TXOP 上限（TXOP limit）约束（§10.23.2.9）。' },
    { heading: '后台的参数（表 9-194）', text: '表 9-194 给出接入点（access point, AP）以外的站点的默认参数：AC_BK 的仲裁帧间间隔数（arbitration interframe space number, AIFSN）为 7（79 µs），比 AC_BE 的 3（43 µs）多四个时隙，比 AC_VO 的 2（34 µs）多五个时隙；它的竞争窗口（contention window, CW）与 AC_BE 相同，最小竞争窗口（minimum contention window, CWmin）为 15、最大竞争窗口（maximum contention window, CWmax）为 1023，而 AC_VO 为 3 与 7。' },
    { heading: '接收出错之后的等待（§10.3.2.3.7）', text: '站点收到一个物理层（physical layer, PHY）报告出错的 PPDU（PHY protocol data unit）或帧校验序列（frame check sequence, FCS）不正确的帧之后，介质变为空闲时，分布式协调功能（distributed coordination function, DCF）使用 EIFS，EDCA 使用 EIFS − DIFS + AIFS[AC]。这段时间从物理层报告介质空闲开始计算，不考虑虚拟载波侦听（virtual carrier sense）；它的作用是留出时间，让另一台站点为本站没有收对的那一帧发送确认帧。在此期间正确收到一帧，站点就重新与介质的实际忙闲同步，这段等待随即结束。' },
    { kind: 'formula', heading: 'EIFS 的长度（§10.3.7，式 10-7）', text: 'EIFS = aSIFSTime + AckTxTime + DIFS', note: 'AckTxTime 是以最低的强制速率（mandatory rate）发送一个确认帧所需的时间，含前导码（preamble）与物理层头。dot11DynamicEIFSActivated 为真时，可以改用按出错 PPDU 的调制（modulation）估计的应答时间（式 10-8、表 10-8）。' },
    { kind: 'steps', heading: '一个 EDCAF 在接收出错之后，按标准：逐步说明', items: [
      '站点开始接收一个 PPDU，物理层报告接收出错，或者帧校验序列不正确。',
      '物理层报告介质空闲时，这一类开始等待 EIFS − DIFS + AIFS[AC]，不考虑网络分配向量（network allocation vector, NAV）（§10.3.2.3.7）。',
      '这段时间结束时是这一类的第一个时隙边界，之后照常每个时隙递减计数（§10.23.2.4 第 b) 项）。',
      '在等待期间正确收到一帧，这段等待结束，按正常的 AIFS[AC] 继续（§10.3.2.3.7）。',
    ] },
  ],
  implementation: [
    { topic: '不能中断正在进行的发送', standard: '时隙边界只在介质空闲之后出现（§10.23.2.4）', sim: '照此处理：介质忙时 AIFS 作废、计数冻结，介质空闲后重新开始等待。', kind: 'faithful' },
    { topic: '三台站点的参数', standard: '表 9-194 的默认值', sim: 'VO 34 µs、窗口 3 到 7；BE 43 µs、15 到 1023；BK 79 µs、15 到 1023。', kind: 'faithful' },
    { topic: '每台站点运行哪一类', standard: '按每个数据单元的优先级映射（表 10-1）', sim: '照此映射：每个数据单元带业务档位给出的用户优先级——通话 6、上传 0、备份 1——按表 10-1 分别归入 VO、BE、BK；每台站点只有一类流量。', kind: 'faithful' },
    { topic: 'EIFS 的长度', standard: 'aSIFSTime + AckTxTime + DIFS，AckTxTime 以最低强制速率计算（式 10-7）', sim: '16 + 44 + 34 = 94 µs，44 µs 是 6 Mb/s 下一个确认帧的时间。', kind: 'faithful' },
    { topic: '动态 EIFS', standard: '可选：按出错 PPDU 的调制估计应答时间（式 10-8，表 10-8）', sim: '不使用，EIFS 固定为 94 µs。', kind: 'choice' },
    { topic: '出错之后的等待', standard: 'EIFS − DIFS + AIFS[AC]（§10.3.2.3.7）', sim: '照此计算：上传站点属于 BE，94 − 34 + 43 = 103 µs；通话站点属于 VO，94 − 34 + 34 = 94 µs。', kind: 'faithful' },
    { topic: '这段等待何时结束', standard: '正确收到一帧即结束（§10.3.2.3.7）', sim: '开始一次新的接收时清除，由这次接收的结果重新决定；本站自己发送一帧时也清除。', kind: 'faithful' },
    { topic: '什么算接收出错', standard: '标准不规定接收机的判决方法', sim: '按信干噪比（signal-to-interference-plus-noise ratio, SINR）与门限的二值判决：达到门限一定解出，达不到一定失败；另有碰撞、本站正在发送、改为同步到更强的前导码几种原因。', kind: 'choice' },
    { topic: '公共时钟', standard: '时隙中包含空中传播时间与空闲信道评估（clear channel assessment, CCA）时间（§10.3.7 式 10-3）', sim: '全场共用一个时钟，没有传播时延与侦听时延，所以各站点的时隙边界是同一时刻，AIFS 之差恰好是整数个时隙。', kind: 'differs' },
  ],
  labs: [
    {
      heading: '后台排在最后',
      jump: 0,
      steps: [
        '载入本课场景，跳到备份站点的第一帧。',
        '对照三台站点各自第一帧数据的发送时刻。',
      ],
      expect: '你应该看到：上传站点从 0.088 ms 起就在发送，通话站点的第一帧在 23.3690 ms，备份站点的第一帧到 54.8100 ms 才发出。',
      meaning: '这说明：AIFS 最长、窗口最宽的一类最晚取得发送机会（①）。三台站点使用同一套规则，只有参数不同（②）。',
    },
    {
      heading: '三台站点的表现',
      steps: [
        '运行 300 ms。',
        '统计每台站点的退避抽取次数与平均抽到的值，再统计每一帧从入队到离开队列（queue）的时间。',
      ],
      blocks: [
        { kind: 'table', heading: '300 ms 里三台站点的表现', head: ['站点', '类别', 'AIFS', '抽取次数', '平均抽到', '平均排队时延', '最长排队时延'], rows: [
          ['通话站点', 'VO', '34 µs', '26', '1.9', '1.23 ms', '2.64 ms'],
          ['上传站点', 'BE', '43 µs', '103', '7.6', '2.25 ms', '7.25 ms'],
          ['备份站点', 'BK', '79 µs', '10', '6.2', '9.02 ms', '20.86 ms'],
        ] },
      ],
      expect: '你应该看到：备份站点 300 ms 里只抽取了 10 次退避值，平均排队时延 9.02 ms，约为通话站点 1.23 ms 的七倍。通话站点最长的一次排队是 2.64 ms，是它平均值的两倍多。',
      meaning: '这说明：语音少等的时间取自其他类别，代价最大的是后台（①）。通话的最长时延来自介质忙时无法发送：EDCA 不能中断别人已经开始的发送（①、②）。',
    },
    {
      heading: '上传站点的 EIFS',
      jump: 1,
      steps: [
        '跳到上传站点的第一次 EIFS。',
        '向前查看：这段等待之前，上传站点的哪一次接收失败了。',
        '运行 300 ms，统计三台站点各等过几次 EIFS。',
      ],
      expect: '你应该看到：169.9196 ms 接入点与通话站点同时发送语音帧，上传站点收到的是两帧相叠，在 169.9924 ms 接收失败，随即开始一段 103 µs 的等待，而不是平时的 43 µs。300 ms 里上传站点共有 2 次 EIFS，每次都是 103 µs。通话站点有 2 次接收失败：129.9060 ms 那一次之后它开始一段 94 µs 的等待（VO 的 AIFS 与 DIFS 相等，94 − 34 + 34），接入点重发的语音帧在 129.9890 ms 开始，这次新的接收结束了这段等待；另一次之后在下一次竞争之前就开始了新的接收，没有 EIFS。备份站点为零。',
      meaning: '这说明：出错之后的等待是 EIFS − DIFS + AIFS[AC]，正确接收会结束它（①）；本仿真器照此计算，EIFS 固定为 94 µs（②）。',
    },
    {
      heading: '关掉通话站点的 EDCA',
      steps: [
        '在功能面板里关掉通话站点的增强型分布式信道接入，再载入并运行 300 ms。',
        '查看它的等待记录与抽取时的窗口，统计平均排队时延。',
      ],
      expect: '你应该看到：通话站点改用 DIFS，长度为 34 µs，与 VO 的 AIFS 相同；窗口从 15 开始，不再是 3。它的平均排队时延变为 3.46 ms，约为开启时 1.23 ms 的 2.8 倍。',
      meaning: '这说明：VO 的 AIFSN 为 2，AIFS 与 DIFS 相等（①），所以在这个房间里语音的收益全部来自较窄的竞争窗口。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.23.2.4（时隙边界在介质空闲之后、第 b) 项出错之后的边界）、§10.23.2.9（TXOP 上限）、表 9-194（非 AP 站点的默认参数）、§10.3.2.3.7（EIFS 与 EIFS − DIFS + AIFS[AC]，正确接收结束等待）、§10.3.7 式 10-7 与式 10-8、表 10-8（EIFS 的长度与动态 EIFS）。',
    '本仿真器的取值与取法：固定 EIFS、二值的接收判决与捕获（capture effect）余量、全场共用的时钟。三台站点、它们的业务模型、随机种子以及每一个时刻都是本仿真器的场景，可以复现。',
  ],
  limits: [],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Caller (VO)', 'sta', 3.5, 5, 'he', 'voice'),
    node('sta-2', 'Uploader (BE)', 'sta', 6.5, 5, 'he', 'saturated'),
    node('sta-3', 'Backup (BK)', 'sta', 5, 6.5, 'he', 'backup'),
  ]),
  jumps: [
    J('后台站点的第一帧', (r) => r.type === 'TX_START' && r.node === 'sta-3' && r.frame.kind === 'data'),
    J('上传站点的第一次 EIFS', (r) => r.type === 'IFS_START' && r.node === 'sta-2' && r.kind === 'EIFS'),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一帧语音入队时，另一台站点的一串长突发正好发送到一半。按标准，它会怎样？',
      options: [
        '中断那串突发，因为语音的优先级高',
        '等介质空闲之后，以较短的 AIFS 参与下一轮竞争',
        '被丢弃，因为介质忙',
      ],
      answer: 1,
      explain: '§10.23.2.4：时隙边界只在介质空闲之后出现，介质忙时任何一类都不能发起 TXOP。',
    },
    {
      q: '为了其他类别较短的等待，后台这一类付出了什么？',
      options: [
        '更低的数据速率',
        '最长的 AIFS 和较宽的窗口，它的帧在队列中停留的时间长得多',
        '没有代价：四个类别互不影响',
      ],
      answer: 1,
      explain: '本课的房间里备份站点的平均排队时延约为通话站点的七倍；空口时间只有这么多，给了一类就要从别的类别取。',
    },
    {
      q: '一台 BE 站点接收的帧出错了。按标准，它下一次竞争前要等多久？',
      options: [
        '和平常一样，43 µs',
        'EIFS − DIFS + AIFS[BE]，这里是 103 µs；期间正确收到一帧就提前结束',
        '不必等待，因为它没有收到任何帧',
      ],
      answer: 1,
      explain: '§10.3.2.3.7：多出的部分留给另一台站点为那一帧回确认帧，以免本站的发送与之碰撞。',
    },
  ],
}
