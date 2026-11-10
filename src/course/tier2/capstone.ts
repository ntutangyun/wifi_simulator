/**
 * Wi-Fi Tier 2 · M8 · Real applications · The closing brief of the Wi-Fi track.
 *
 * Standard-first shape (2026-11-11). ① what IEEE Std 802.11-2024 and 802.11be-2024 give a
 * household that shares one medium: EDCA contention per access category (§10.23.2.1,
 * §10.23.2.4), the priority tools — the user-priority-to-AC mapping (§10.2.3.2, Table 10-1), the
 * advertised parameters and admission control (§9.4.2.27) — downlink multi-user sends
 * (§26.5.1.1) and per-link contention for an MLD (§35.3.16.1), and what the standard leaves to
 * the network: which device to favour and how to group. ② the engine's shortcuts, row by row —
 * including the coherence-time comparison tests/course/fading.test.ts pins. ③ five runs: the
 * baseline, the three candidate edits and the hand-in with its rubric.
 *
 * The audit corrected two things in the old prose: the midamble citation pointed at Table 9-47,
 * which is the Trigger Type encoding — the Doppler and midamble subfields are in §9.3.1.22.1 — and
 * 「the AP has nothing for the tablet at the moment it groups」 was not the engine's reason: the
 * engine groups only within the access category that won, and the tablet's pages are AC_BE while
 * the video is AC_VI.
 *
 * The three candidates are editor edits, not lesson `variants`: the scene is one builder that
 * takes no parameters and the recorded timeline hash in tests/fixtures/lesson-hashes.json is the
 * controller's, so the scenario is byte-identical. Every figure is read back out of this file by
 * tests/course/capstone.test.ts and compared with a run.
 */
import type { TopologySpec } from '../diagram'
import { type Lesson, brick, drywallDoor, node, sc, firstMuDl, firstTrigger, first6g, firstCollision, J } from '../lessonKit'
import type { Scenario } from '../../model/scenario'

/** The flat: three rooms, a door in each inner wall, seven devices. */
export function capstoneScenario(): Scenario {
  return sc({
    rooms: [
      { x: 0, y: 0, w: 5, h: 8, name: 'Living room' },
      { x: 5, y: 0, w: 5, h: 4, name: 'Study' },
      { x: 5, y: 4, w: 5, h: 4, name: 'Bedroom' },
    ],
    walls: [
      brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0),
      drywallDoor(5, 0, 5, 8, 1.5),
      drywallDoor(5, 4, 10, 4, 2.5),
    ],
  }, [
    node('ap', 'AP (Wi-Fi 7)', 'ap', 2.5, 4, 'eht', 'idle'),
    node('sta-1', 'Laptop MLO', 'sta', 7.5, 2, 'eht', 'saturated'),
    node('sta-2', 'TV (Wi-Fi 6)', 'sta', 1.5, 6.5, 'he', 'video'),
    node('sta-3', 'Phone (voice)', 'sta', 3.5, 2, 'he', 'voice'),
    node('sta-4', 'Tablet (Wi-Fi 5)', 'sta', 7.5, 6.5, 'vht', 'browsing'),
    node('sta-5', 'Sensor (legacy)', 'sta', 9.3, 7.3, 'nonht', 'iot'),
    node('sta-6', 'Projector (Wi-Fi 6)', 'sta', 6, 1, 'he', 'video'),
  ])
}

/** What the figure calls each lane, short enough to sit at its own scenario position. */
const DIAGRAM_NAMES: Record<string, string> = {
  ap: '接入点', 'sta-1': '笔记本', 'sta-2': '电视', 'sta-3': '手机',
  'sta-4': '平板', 'sta-5': '传感器', 'sta-6': '投影仪',
}

/**
 * Who is where, and who is holding the air. The positions are the scenario's
 * own metres, so the figure cannot drift from the room the learner loads; the
 * accent path is the backup, the only lane above four per cent.
 */
export function capstoneTopology(): TopologySpec {
  return {
    kind: 'topology',
    nodes: capstoneScenario().nodes.map((n) => ({
      id: n.id,
      label: DIAGRAM_NAMES[n.id],
      role: n.kind === 'ap' ? ('ap' as const) : ('sta' as const),
      x: n.pos.x,
      y: n.pos.y,
    })),
    links: [
      { from: 'sta-1', to: 'ap', label: '备份', tone: 'accent', both: true },
      { from: 'sta-6', to: 'ap', both: true },
      { from: 'sta-3', to: 'ap', both: true },
      { from: 'sta-2', to: 'ap', both: true },
      { from: 'sta-4', to: 'ap', both: true },
      { from: 'sta-5', to: 'ap', both: true },
    ],
  }
}

export const capstone: Lesson = {
  id: 'capstone',
  module: 11,
  title: '结业课——找出这个家庭网络的瓶颈',
  why: '一个家庭网络里所有机制同时起作用，而它们共享同一份资源：空口时间（airtime）。IEEE 802.11-2024 规定了每一帧怎样竞争这份时间——按接入类别（access category, AC）退避（backoff）、在传输机会（transmit opportunity, TXOP）的时长上限内连续发送，接入点（access point, AP）可以把几台设备编入一次多用户（multi-user, MU）发送，支持多链路操作（multi-link operation, MLO）的多链路设备（multi-link device, MLD）可以在几条链路（link）上各自竞争——也规定了区分优先级的手段：每一帧按它的优先级映射到四个接入类别之一，接入点在信标（Beacon）里通告各类的参数，并可以要求某一类先经准入控制；标准不规定一个家庭网络该优先照顾哪台设备。所以一台设备是不是瓶颈（bottleneck），要看它占用了多少空口时间，等于它想发送的量乘以每一帧的占用时长，与电台是哪一代无关。在这个家里，笔记本的备份占用了 5 GHz 57.2%、6 GHz 90.7% 的时间，其余设备都不到 4%，屋里最旧的传感器五秒只发两帧。三个候选改动都没有改变电视和平板收到的数据量，改变的是一帧要等多久：停止备份，其他设备的等待全部降到一毫秒以下，代价是备份一个字节也送不出去；关闭笔记本的第二台电台，备份自身的送达量减少一半多，视频的等待基本不变，平板反而要多等一倍多；给平板换一台 Wi-Fi 6 电台几乎没有效果，因为接入点从不把它编入多用户发送，它慢的原因是每一帧都要单独与一个满负荷的上传者竞争。真实部署中更好的做法是给备份限速，或把它放进更低的接入类别；本仿真器没有限速手段，笔记本始终有帧待发的上传的用户优先级也固定为 0，归入尽力而为一类。',
  outcomes: [
    '说出标准为共享空口时间规定了哪些规则与哪些优先级手段，以及它没有规定什么',
    '按照共享的那一项资源，给一个设备混杂的家庭里的设备排序',
    '用仿真结果算出三个候选改动各自的代价与收益，说出你会否决哪个改动、依据的是哪个测量',
    '提交一份写明「它没有测量什么」的报告',
  ],
  needs: ['edca', 'txop', 'width', 'rate', 'anomaly', 'tier1-project', 'ofdma-dl', 'ofdma-ul', 'mumimo-choose', 'mlo-gain'],
  terms: [
    { term: 'bottleneck', plain: '无论其他部分优化得多好，都由它决定其他设备能获得多少资源的那一台设备或那一项选择' },
    { term: 'offered load', plain: '一台设备“想发送多少”，区别于它最终“实际发送了多少”' },
  ],
  standard: [
    { heading: '所有设备竞争同一份时间（§10.23.2.1，§10.23.2.4）', text: '支持服务质量（quality of service, QoS）的站点（station, STA）有四个相互独立的增强型分布式信道接入（enhanced distributed channel access, EDCA）功能，每个接入类别一个，各有自己的发送队列（queue）。每个功能在介质（medium）空闲满仲裁帧间间隔（arbitration interframe space, AIFS）之后逐个时隙（slot time）递减退避计数，介质变忙时计数停在当前值，计数为零且有帧待发时发起一个 TXOP。一台设备占用介质的时间越长，其他设备的计数停住的时间就越长。' },
    { heading: '区分优先级的手段（§10.2.3.2，表 10-1，§9.4.2.27）', text: '每个上层数据单元带一个 0 到 7 的优先级，按表 10-1 映射到接入类别：1、2 映射到 AC_BK，0、3 映射到 AC_BE，4、5 映射到 AC_VI，6、7 映射到 AC_VO。接入点在信标与 Probe Response 帧的 EDCA 参数集（parameter set）元素中通告各类的仲裁帧间间隔数（arbitration interframe space number, AIFSN）、最小竞争窗口（minimum contention window, CWmin）、最大竞争窗口（maximum contention window, CWmax）与 TXOP 上限（TXOP limit）；每一类还有一个 ACM 子字段，置 1 时这一类必须先经准入控制才能使用。' },
    { heading: '多用户发送与多链路（IEEE 802.11-2024 §26.5.1.1，IEEE 802.11be-2024 §35.3.16.1）', text: '下行（downlink, DL）多用户操作让接入点在一次发送里同时向几个站点发送，方式可以是正交频分多址（orthogonal frequency-division multiple access, OFDMA）、多用户 MIMO（multi-user MIMO, MU-MIMO）或两者并用；编入哪几个站点由接入点决定。MLD 的每条链路在自己的信道上独立竞争。' },
    { kind: 'steps', heading: '一帧怎样取得空口时间，按标准：逐步说明', items: [
      '上层交下来的数据单元带一个优先级，按表 10-1 归入一个接入类别（§10.2.3.2）。',
      '这一类的 EDCA 功能用接入点通告的参数退避；类别的 ACM 置 1 时，先要经过准入控制（§9.4.2.27，§10.23.2.4）。',
      '计数为零时发起 TXOP，在这一类的 TXOP 上限内可以连续发送（§10.23.2.8，§10.23.2.9）。',
      '接入点的帧可以与发往其他站点的帧编入同一次多用户发送（§26.5.1.1）。',
      '多链路设备的帧可以由映射到的任何一条链路发出（IEEE 802.11be-2024 §35.3.7.2.1）。',
    ] },
    { heading: '标准没有规定的', text: '标准规定了每一帧怎样竞争、各类参数怎样通告，以及接入点可以怎样把几台设备编入一次发送；它不规定一个网络该优先照顾哪台设备，也不规定接入点按什么策略编组。' },
  ],
  implementation: [
    { topic: '帧归入哪一类', standard: '按每个数据单元的优先级查表 10-1（§10.2.3.2）', sim: '照表 10-1 由每个数据单元的用户优先级查出类别；优先级由设备的流量档位给出，这是本仿真器的取法，场景不能为某条流另设优先级。笔记本的档位叫作饱和档位，始终有帧待发；饱和上传为 AC_BE（优先级 0），视频为 AC_VI（5），语音为 AC_VO（6），浏览为 AC_BE（0）；传感器是不支持 EDCA 的旧电台，不分类别。所以笔记本的饱和上传无法改放到更低的一类。', kind: 'choice' },
    { topic: '参数的通告与准入控制', standard: '接入点通告参数；ACM 可要求准入控制（§9.4.2.27）', sim: '没有信标，参数是引擎里的常量表；准入控制没有实现。', kind: 'absent' },
    { topic: '给一条流限速', standard: '标准未规定限速的具体办法', sim: '没有任何限速手段；本课排出的三个候选都是编辑器里可以直接做的改动。', kind: 'absent' },
    { topic: '流量', standard: '标准不定义流量模型', sim: '备份、视频、语音、浏览与传感器都是本仿真器内置的流量发生器，包长与间隔都是本仿真器的取值。饱和档位始终保持 20 帧待发，每出队一帧就补充一帧，网络再慢也不降低速率；真实的备份运行在 TCP 上，往返时间变长就会降速。', kind: 'choice' },
    { topic: '编组的策略', standard: '标准未规定（§26.5.1.1）', sim: '接入点赢得竞争的那一类队列里，有数据、协商过 OFDMA 的站点有两个以上，才组成一次多用户发送，最多四个；不同接入类别的下行帧从不编入同一次发送。平板的网页在 AC_BE，电视与投影仪的视频在 AC_VI，所以平板从未被编入，换了电台也一样。', kind: 'choice' },
    { topic: '判忙的能量门限', standard: '能量检测（energy detection, ED）：HE 站点对主 20 MHz 信道内不低于 −62 dBm 的信号报忙（§27.3.22.6.3）', sim: '按整条信道带宽（channel width）内的总能量与门限比较，而不是只看主 20 MHz 信道。', kind: 'differs' },
    { topic: '其他网络', standard: '同一信道上可以有别的基本服务集（basic service set, BSS），称为重叠 BSS（OBSS，§3.1）', sim: '场景校验要求恰好一个接入点，所有 Wi-Fi 节点都在同一个 BSS 里；同信道的邻近网络无法表达。', kind: 'differs' },
    { topic: '入网与省电', standard: '关联、认证与省电都有专门的规定', sim: '引擎不发任何管理帧（management frame），所有设备从第一纳秒起就已入网并始终处于唤醒状态。', kind: 'absent' },
    { topic: '移动与多普勒', standard: '触发帧（Trigger frame）Common Info 字段的 Doppler 子字段为 1 时，HE 的基于触发的 PPDU（trigger-based PPDU, TB PPDU）每 10 或 20 个符号（symbol）插入一次中间训练符号（§9.3.1.22.1，§26.16）', sim: '节点位置在整段仿真里不变，衰落即使打开也只在固定的均值上下起伏，没有多普勒；相干时间是一个配置值，不由任何物体的移动速度推导。10 个与 20 个符号折成 136 µs 与 272 µs，而本仿真器较慢的那一层取 100 ms，是前者的 735 倍。', kind: 'absent' },
    { topic: '墙体衰减', standard: '标准不规定传播模型', sim: '砖墙与石膏板的衰减是按常见实测数据标定的取值。', kind: 'value' },
    { topic: '运行的随机性', standard: '标准不涉及', sim: '每个数都来自同一个随机种子的一次五秒运行，同一个场景每次给出同一组数，表中不带误差范围；真实的评测要换种子、跑很多次，并报出离散程度。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '先看是谁占用了空口',
      jump: 2,
      steps: [
        '载入本课场景，跳到第一次碰撞，然后运行完五秒。',
        '打开检视器，把七台设备按空口占比排序，记下这个排名；再数一数传感器发出了几帧。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '三个房间，七台设备', spec: capstoneTopology(),
          caption: '位置即场景中的坐标（单位为米）：三个房间之间隔着砖墙，每道内墙上开一扇门，平板和传感器都位于两堵墙之后的远角。加粗的那条是笔记本的备份，也是屋里唯一占比超过百分之四的一条。',
        },
        { kind: 'table', heading: '五秒内的空口占比', head: ['泳道', '空口占比'], rows: [
          ['笔记本 5 GHz（sta-1）', '57.2%'],
          ['笔记本 6 GHz（sta-1#6g）', '90.7%'],
          ['其余五台站点', '都不到 4%'],
        ] },
      ],
      expect: '笔记本占了 5 GHz 的 57.2%、6 GHz 的 90.7%，其余没有一台达到百分之四；传感器五秒只发了两帧，共 256 字节。',
      meaning: '每一帧都按 EDCA 竞争同一份时间（①），占用多少取决于想发送的量乘以每帧的时长；屋里最旧的电台不是瓶颈。',
    },
    {
      heading: '停止备份',
      steps: [
        '在编辑器里把笔记本的流量设为空闲，重新载入，运行完五秒。',
        '按下表每一行写明的泳道读出四个数，写在基线旁边；再读电视与平板各收到多少字节。做完把笔记本改回原样。',
      ],
      blocks: [
        { kind: 'table', heading: '同样的五秒钟，四种方案', head: ['指标及读取位置', '原样', '停止备份', '关闭第二台电台', '平板换 Wi-Fi 6'], rows: [
          ['备份送达量（兆字节）——泳道 ap 与 ap#6g 的已送达字节', '77.2', '0', '37.0', '77.0'],
          ['视频等待——泳道 sta-2 的平均接收等待', '1.83 ms', '0.20 ms', '1.79 ms', '1.78 ms'],
          ['平板等待——泳道 sta-4 的平均接收等待', '4.36 ms', '0.41 ms', '10.57 ms', '4.40 ms'],
          ['语音等待——泳道 sta-3 的平均发送等待', '2.18 ms', '0.58 ms', '2.07 ms', '2.10 ms'],
        ] },
      ],
      expect: '其他所有等待都降到一毫秒以下：视频从 1.83 ms 降到 0.20，语音从 2.18 降到 0.58，平板从 4.36 降到 0.41；备份一个字节也送不出去。四个方案里，电视收到的都是大约 8.3 兆字节，平板收到的都恰好是 88,200 字节。',
      meaning: '没有哪个改动改变了它们收到的数据，改变的是一帧要等多久才轮到发送。标准的优先级手段是把备份放进 AC_BK 或给它的类别加准入控制（①），本仿真器两者都不支持（②），所以这里只能整个停掉。',
    },
    {
      heading: '关闭笔记本的第二台电台',
      steps: [
        '在编辑器里取消笔记本的 MLO，重新载入，运行完五秒，对照上表第三列。做完改回原样。',
      ],
      expect: '备份自身的送达量从 77.2 兆字节降到 37.0，视频的等待从 1.83 ms 变成 1.79 ms，基本不变；平板的等待却从 4.36 ms 升到 10.57 ms。',
      meaning: '第二条链路在 6 GHz 上独立竞争（①），带来的是本机自身的送达量；它所在的频段上没有其他设备，关掉它，备份的帧全部挤到 5 GHz，与平板的网页争同一条信道，所以别人不会因此少等。',
    },
    {
      heading: '给平板换一台 Wi-Fi 6 电台',
      jump: 0,
      steps: [
        '在编辑器里把平板换成启用 OFDMA 的 Wi-Fi 6 电台，重新载入，运行完五秒，对照上表第四列。',
        '在多用户发送里看接入点编入了哪几台设备。',
      ],
      expect: '备份仍然送达 77.0 兆字节，平板的等待从 4.36 ms 变成 4.40 ms，几乎不变（相差约 1%）；换电台前后，接入点的多用户发送都只编入电视与投影仪。',
      meaning: '编组策略由实现决定（①）：本仿真器只在同一个接入类别里编组（②），平板的网页与视频不在同一类，所以从未被编入；它的每一帧仍要单独与满负荷的上传者竞争。',
    },
    {
      heading: '排序并提交',
      steps: [
        '按「腾出了多少等待」给三个方案排序，而不是按「哪台设备的数字看起来最差」。',
        '提交四句话：瓶颈是谁、由哪个数字说明；你会选哪个方案、它改变了什么；你否决了哪个方案、依据的是哪个测量；这个场景没有建模什么。',
      ],
      blocks: [
        { kind: 'table', heading: '好的答案包含什么', head: ['判断', '好的答案是什么样的'], rows: [
          ['瓶颈是谁', '指出那个备份，而不是传感器：笔记本占了 5 GHz 的 57.2%、6 GHz 的 90.7%，而传感器五秒里只发两帧。'],
          ['停止备份', '指出其他所有等待都降到一毫秒以下，同时指出备份自身从此一个字节也送不出去。说清楚用什么交换了什么。'],
          ['第二台电台', '说明它让备份自身的送达量翻倍，而视频的等待时间基本不变；关掉它，平板反而要多等。'],
          ['那台平板', '认识到这次升级几乎没有效果：接入点从未把平板与其他设备编入同一组，它的等待几乎不变（相差约 1%）。'],
          ['没有测到的东西', '明确说明：没有人走动，没有门被打开，没有邻近的网络，整段仿真只有五秒。'],
        ] },
      ],
      expect: '停止备份腾出的等待最多；换平板的电台几乎什么也没有腾出；关闭第二台电台排在最后，因为它让平板多等，腾出的等待是负的。',
      meaning: '标准不规定该优先照顾哪台设备（①），答案要由测量给出；本仿真器缺少的限速与改放接入类别（②），正是真实部署里更好的做法。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.23.2.1 与 §10.23.2.4（EDCA 的四个信道接入功能与退避）、§10.2.3.2 与表 10-1（优先级到接入类别的映射）、§9.4.2.27（EDCA 参数集元素与 ACM 子字段）、§10.23.2.8 与 §10.23.2.9（TXOP）、§26.5.1.1（下行多用户操作）、§27.3.22.6.3（HE 的空闲信道评估）、§3.1（OBSS 的定义）、§9.3.1.22.1 与 §26.16（Doppler 子字段与中间训练符号）。',
    'IEEE Std 802.11be-2024：§35.3.16.1（各链路独立竞争）、§35.3.7.2.1（可以用映射到的任何一条链路）。',
    '本仿真器的取值与取法：内置的流量发生器及其包长与间隔、按流量档位给出的用户优先级、饱和档位保持 20 帧待发、墙体衰减、只在同一个接入类别里编组的策略、确定性的随机种子；所以这些五秒钟的数字属于这个场景，而不属于某个真实家庭。',
  ],
  limits: [],
  scenario: capstoneScenario,
  jumps: [
    J('第一个 MU PPDU', firstMuDl),
    J('第一个触发帧', firstTrigger),
    J('第一次碰撞', firstCollision),
    J('第一个 6 GHz 数据帧', first6g),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '对这个家庭而言，收益最大的单项改动是……',
      options: [
        '提高接入点的发射功率（transmit power）',
        '替换慢速的传统传感器',
        '控制笔记本的备份——错峰、限速，或者降低它的优先级',
      ],
      answer: 2,
      explain: '大家共享的是空口时间，不是字节，也不是电台的新旧。传感器五秒只发两个短帧，改动它测不出任何变化；备份占用了大部分空口，停止它，其他所有等待都降到一毫秒以下。',
    },
    {
      q: '按标准，要降低备份的优先级，应当怎样做？',
      options: [
        '让上层给备份的数据单元标上 1 或 2 的优先级，它们就按表 10-1 归入 AC_BK',
        '关闭笔记本的第二条链路',
        '标准没有任何区分优先级的手段',
      ],
      answer: 0,
      explain: '§10.2.3.2 与表 10-1 把优先级 1、2 映射到 AC_BK；本仿真器的优先级由流量档位给出，饱和上传固定为 0、归入 AC_BE，所以这一步在这里做不到。',
    },
    {
      q: '你给平板换了一台更新的电台。会发生什么？',
      options: [
        '接入点开始把它和电视编成一组，它的网页很快就能加载完成',
        '几乎没有变化：它仍然从未被编入组，等待从 4.36 ms 变成 4.40 ms',
        '笔记本的备份会降低速率，为它让出信道',
      ],
      answer: 1,
      explain: '更新的电台只是让平板自己的帧变短；它并不会让平板更早获得发送机会。本仿真器只在同一个接入类别里编组，平板的网页属于 AC_BE，没有可以同组的对象。',
    },
  ],
}
