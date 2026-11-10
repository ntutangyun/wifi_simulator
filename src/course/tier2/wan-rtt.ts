/**
 * Wi-Fi Tier 2 · M11 · 真实应用 · the cloud round trip, and how little of it is the air.
 *
 * **Standard-first shape (2026-11-11).** ① what IEEE Std 802.11-2024 says that bears on a game's
 * round trip: an MSDU's user priority maps to an access category (§10.2.3.2, Table 10-1), each
 * category contends with its own EDCA parameters (§9.4.2.27, Table 9-194; §10.23.2.4), and the
 * one AP-side classification service the standard defines is MSCS (§11.25.3) — everything past
 * the access point (WAN, server, transport) is outside 802.11. ② what the engine does, including
 * the router's game-mode boolean, which moves the phone's own uplink into AC_VI with no frame
 * exchange and so has no counterpart in the standard (differs). ③ four runs.
 *
 * The scene is `cloudGameScenario()` with its four variants, unchanged, so the recorded hashes do
 * not move. Every figure printed below is read back out of the lesson text in
 * tests/course/wan-rtt.test.ts, measured at 5000 ms on seed 7.
 */
import { type Lesson, J } from '../lessonKit'
import { cloudGameScenario } from '../wifiScenes'

export const wanRtt: Lesson = {
  id: 'wan-rtt',
  module: 11,
  title: '云端往返——用户等待的时间中，空口只占千分之四',
  why: 'IEEE 802.11 只规定无线局域网的媒体访问控制（medium access control, MAC）与物理层（physical layer, PHY）：一帧从入队、按它的接入类别（access category, AC）竞争信道，到被接入点（access point, AP）确认为止。玩游戏的人等待的是一次应用往返：手机到路由器的空口，路由器到服务器的广域网（wide area network, WAN）一去一回，再加上服务器的处理时间，后两段都在标准之外。在安静的房间里，空口部分不到整个往返的千分之四；把服务器换到海外，往返时间增加到三倍多，增加的部分全部在广域网上。空口部分只有在出现竞争时才显现：加入两台持续上传的笔记本，手机每一帧从入队到被确认的时间增加到五十倍，往返的最大值延长到原来的两倍多。标准让每个帧带一个用户优先级、按优先级映射到接入类别，但不规定谁来决定一个游戏包的优先级；本仿真器的路由器游戏模式是一个开关，打开后手机的帧移入视频类别，繁忙时排队均值降到约五分之二、最大值降到约五分之一。这个开关在标准里没有对应：标准里由接入点做的分类服务（MSCS）只作用于下行（downlink, DL），而且要由站点（station, STA）发起。安静的房间里打开它，收到的帧数完全相同。',
  outcomes: [
    '说出标准对用户优先级、接入类别与参数规定了什么，以及应用往返中哪些部分在标准之外',
    '把一次应用往返拆成广域网、服务器处理与空口三段，并说明空口那一段在什么条件下才变得可观测',
    '说出路由器游戏模式改的是哪一个字段，它与标准的 MSCS 有什么不同，以及它在安静的房间里为什么不改变结果',
  ],
  needs: ['edca', 'edca-cost', 'queues'],
  terms: [
    { term: 'application round trip', plain: '应用往返：一个包从设备出发、经过路由器与服务器，再回到这台设备的全程时间——游戏里显示的 ping 值测量的就是它' },
    { term: 'WAN', plain: '广域网：路由器对外连接的那一段链路，不在 IEEE 802.11 的范围之内。本仿真器把它建模为一个固定的单向时延加少量随机抖动，两个方向各经过一次' },
    { term: 'game acceleration', plain: '路由器的游戏模式：本仿真器接入点上的一个开关，打开之后游戏流量归入视频那一类；标准里没有这个开关' },
  ],
  standard: [
    { heading: '用户优先级映射到接入类别（§10.2.3.2，表 10-1）', text: '每个 MSDU（MAC service data unit）带一个用户优先级（0 到 7），由上层随帧交给 MAC。增强型分布式信道接入（enhanced distributed channel access, EDCA）定义四个接入类别，用户优先级按表 10-1 映射：1、2 为 AC_BK，0、3 为 AC_BE，4、5 为 AC_VI，6、7 为 AC_VO。表中「用途」一列只是一般指引，各优先级的实际用途由实现决定。' },
    { heading: '每个接入类别的默认参数（§9.4.2.27，表 9-194）', text: '非接入点站点的默认参数：AC_BE 的最小竞争窗口（minimum contention window, CWmin）为 aCWmin，最大竞争窗口（maximum contention window, CWmax）为 aCWmax，决定仲裁帧间间隔（arbitration interframe space, AIFS）长度的仲裁帧间间隔数（arbitration interframe space number, AIFSN）为 3；AC_VI 的 CWmin 为 (aCWmin+1)/2 − 1，CWmax 为 aCWmin，AIFSN 为 2。aCWmin 为 15 时，两类的 CWmin 分别是 15 与 7。接入点自己使用的参数在 dot11QAPEDCATable 中，由管理实体设置（§10.2.3.2）。' },
    { heading: '各类别独立竞争（§10.23.2.4）', text: '每个接入类别有自己的增强型分布式信道接入功能，在介质（medium）空闲满本类别的 AIFS 之后的时隙（slot time）边界上递减自己的退避（backoff）计数。AIFSN 与 CWmin 较小的类别，平均更早获得发送机会；没有其他站点竞争时，先后之分不改变发出什么。' },
    { heading: '由接入点做的分类：MSCS（§11.25.3）', text: '镜像流分类服务（mirrored stream classification service, MSCS）是接入点可以提供的一项可选服务：接入点按站点给出的分类条件，识别发往这台站点的个别寻址 MSDU，并按这台站点上行（uplink, UL）流里 MSDU 的用户优先级为它们设置用户优先级。建立由站点的管理实体发起；怎样发起、怎样选择参数，不在标准范围之内。它作用于下行，不改变站点自己上行帧的优先级。' },
    { heading: '接入点之外不在标准范围之内', text: 'IEEE 802.11 规定无线局域网的媒体访问控制与物理层。帧被接入点收到、交给分发系统（distribution system, DS）之后，经过的广域网、服务器与传输层协议（TCP、抖动缓冲）都不由它规定。' },
    { kind: 'steps', heading: '一个游戏包在无线一侧经过什么，按标准：逐步说明', items: [
      '上层把 MSDU 连同它的用户优先级交给站点的 MAC（§10.2.3.2）。',
      '按表 10-1 把用户优先级映射到接入类别，放入那一类的队列（queue）。',
      '这一类的功能按自己的 AIFSN 与 CWmin 退避、竞争信道（§10.23.2.4，表 9-194）。',
      '发送后，接入点在一个短帧间间隔（short interframe space, SIFS）之后回复确认帧（acknowledgement, ACK），见 §10.3.2.11。',
      '接入点收到这个 MSDU，即把它交给分发系统（§4.5.2.1）；此后的广域网与服务器，以及答复回到接入点之前的一切，都不在 802.11 之内。答复到达接入点后，再按它自己的接入类别发给手机。',
    ] },
  ],
  implementation: [
    { topic: '用户优先级', standard: '每个 MSDU 带一个用户优先级，按表 10-1 映射到接入类别（§10.2.3.2）', sim: '没有用户优先级这一步：每种业务直接指定接入类别。持续上传是尽力而为（1），游戏流在路由器游戏模式关闭时是尽力而为（1），打开时是视频（2）。', kind: 'choice' },
    { topic: 'EDCA 参数', standard: '表 9-194 的默认值（§9.4.2.27）', sim: '照此取值：AC_BE 的 CWmin、CWmax、AIFSN 为 15、1023、3，AC_VI 为 7、15、2。', kind: 'faithful' },
    { topic: '接入点自己的参数', standard: '在 dot11QAPEDCATable 中，由管理实体设置（§10.2.3.2）', sim: '接入点也使用表 9-194 这一组值，与站点相同。', kind: 'value' },
    { topic: '路由器游戏模式', standard: '标准没有这个开关；接入点一侧的分类服务是 MSCS，只作用于发往站点的下行 MSDU，由站点发起建立（§11.25.3）', sim: '接入点上的一个开关：打开之后，这台手机游戏流的上行帧在手机自己的队列里改用视频类别（2），接入点发给它的下行帧也改用视频类别；不交换任何帧。接入点的设置改变站点上行帧的类别，这一点标准里没有对应。真实路由器还要先识别哪一条流是游戏，这里跳过了识别这一步。', kind: 'differs' },
    { topic: '广域网与服务器', standard: '不在 IEEE 802.11 的范围之内', sim: '每个方向一个固定时延加均匀抖动：游戏服务器往返 25 毫秒、抖动 3 毫秒，即单向 12.5 毫秒加 0 到 1.5 毫秒；服务器处理 2 毫秒。海外那一档往返 80 毫秒、抖动 20 毫秒。没有路由上的排队，没有丢包，也没有 TCP 的拥塞控制。', kind: 'value' },
    { topic: '应用往返怎样测量', standard: '不在 IEEE 802.11 的范围之内', sim: '手机每 250 毫秒发一个 64 字节的测量包；接入点收到上行帧时就把它交给广域网，不等手机收到确认帧；上行帧丢失，答复就不会到来。从测量包入队到答复被手机收到的全程，记为一次应用往返。', kind: 'choice' },
    { topic: '游戏业务', standard: '标准不规定上层业务的特征', sim: '取自一次实测的包长与间隔：上行平均每 30 毫秒一个 89 到 131 字节的包，下行 65 毫秒一个状态帧。那是一款游戏在一台手机上的一次采样。', kind: 'value' },
  ],
  labs: [
    {
      heading: '广域网那一段',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一条广域网发送。时间轴上有两类以前没有出现过的记录：答复离开服务器的时刻，与上行包到达服务器的时刻。',
        '运行五秒，读出手机那一栏的「应用往返」与「入队到确认」两个数，再对照下面的验算。',
      ],
      blocks: [
        { kind: 'formula', heading: '第一行那个数可以当场验算', text: '25（广域网往返）+ 2（服务器处理）+ 1.5（抖动的期望：两个方向各在 0 到 1.5 毫秒之间均匀取值，合计期望 1.5）= 28.5 ms', note: '实测 28.644 毫秒，比计算值多 0.144——多出的部分主要是两段空口与手机侧的排队。海外那一档同样可以算出：80 + 2 + 10 = 92，实测 93.148。' },
      ],
      expect: '这个房间里只有这台手机。它的 210 帧从入队到被确认都是 0.106 毫秒；同一轮里应用往返的均值是 28.644 毫秒，两者之比是 0.0037，不到千分之四。',
      meaning: '用户等待的时间几乎全部在标准之外（①）：广域网与服务器的取值是本仿真器的取值（②）。',
    },
    {
      heading: '五种配置',
      more: [0, 1, 2, 3],
      steps: [
        '依次载入本课场景与四个变体，各运行五秒。',
        '对照下表读出每种配置的应用往返与入队到确认。',
      ],
      blocks: [
        { kind: 'table', heading: '五种配置，各运行五秒（基线是一台手机对一台 25/3/2 的游戏服务器）', head: ['配置', '往返 均值', '往返 最大', '入队到确认 均值', '同 最大'], rows: [
          ['只有手机（本课）', '28.644 ms', '29.920 ms', '0.106 ms', '0.106 ms'],
          ['加两台笔记本上传', '44.118 ms', '64.927 ms', '5.301 ms', '48.726 ms'],
          ['同上 + 游戏模式', '32.681 ms', '39.976 ms', '2.166 ms', '10.246 ms'],
          ['海外服务器', '93.148 ms', '98.283 ms', '0.106 ms', '0.106 ms'],
          ['没有服务器', '无法测量', '—', '0.108 ms', '0.348 ms'],
        ] },
      ],
      expect: '加两台笔记本之后，手机那一段从 0.106 毫秒增加到 5.301 毫秒，是原来的五十倍；应用往返只从 28.644 增加到 44.118 毫秒，因为广域网那 25 毫秒保持不变。海外服务器把往返增加到 93.148 毫秒，空口那一段仍是 0.106 毫秒。没有服务器时，应用往返无法测量，入队到确认仍是 0.108 毫秒。',
      meaning: '空口这一段不是「慢」，而是平时不存在、繁忙时才出现：竞争的代价来自各接入类别的退避（①，§10.23.2.4）。没有服务器就没有等待答复的设备，所以没有可测量的往返（②）。',
    },
    {
      heading: '游戏模式改的是一个字段',
      variant: 1,
      more: [0],
      steps: [
        '在「两台笔记本同时上传」与「上传 + 路由器游戏模式」之间来回切换。',
        '看手机每一条入队记录的类别，再读出入队到确认与应用往返的均值和最大值。',
      ],
      expect: '游戏模式打开之后，手机每一条入队记录的类别从 1 变成 2，除此之外没有改动任何内容。入队到确认的均值从 5.301 毫秒降到 2.166 毫秒，最大值从 48.726 毫秒降到 10.246 毫秒；应用往返的最大值从 64.927 毫秒降到 39.976 毫秒。',
      meaning: '视频类别的 CWmin 与 AIFSN 更小，平均更早获得发送机会（①，表 9-194）；尾部降得比均值多。但这个开关由接入点改变手机上行帧的类别，标准里没有这样的机制（②）。',
    },
    {
      heading: '安静的房间里打开游戏模式',
      steps: [
        '点击「在编辑器中打开」，在本课场景（只有手机）里勾选路由器的游戏模式，运行五秒。',
        '与不勾选时比较手机收到确认的帧数，以及它的退避倒计数记录有多少条。',
      ],
      expect: '收到的帧数两边都是 210，完全相同。退避值的随机选取次数也一样多，减少的是倒计数记录：从 1,576 条降到 738 条，因为随机选取的范围从尽力而为那一类的 CWmin 15 变成了视频那一类的 7。',
      meaning: '没有其他站点竞争时，计数先减到零还是后减到零，发出的都是同一帧（①，§10.23.2.4）。一个开关使记录发生变化，并不等于它有用；要看变化的是哪一类记录。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§10.2.3.2 与表 10-1（用户优先级到接入类别的映射；接入点参数在 dot11QAPEDCATable 中）、§9.4.2.27 与表 9-194（非接入点站点的默认 EDCA 参数）、§10.23.2.4（各接入类别在 AIFS 之后的时隙边界上递减退避）、§10.3.2.11（确认帧）、§4.5.2.1（接入点把收到的 MSDU 交给分发系统）、§11.25.3（MSCS）。',
    '本仿真器的取值与取法：四台默认服务器的往返 20/12/40/25 毫秒、游戏服务器的抖动 3 毫秒与处理 2 毫秒、海外那一档的 80/20、每 250 毫秒一个 64 字节测量包、游戏流的包长与间隔直方图（来自一次实测，记在 engine/traffic.ts 的注释里）、路由器游戏模式这个开关。',
    'TCP 的拥塞控制与语音的抖动缓冲由 RFC 规定，不在 IEEE 802.11 之内，本仿真器也没有实现。',
  ],
  limits: [],
  scenario: () => cloudGameScenario(),
  variants: [
    { label: '两台笔记本同时上传', scenario: () => cloudGameScenario({ busy: true }) },
    { label: '上传 + 路由器游戏模式', scenario: () => cloudGameScenario({ busy: true, accel: true }) },
    { label: '海外服务器 80/20/2', scenario: () => cloudGameScenario({ overseas: true }) },
    { label: '同一个房间，没有服务器', scenario: () => cloudGameScenario({ noServers: true }) },
  ],
  jumps: [
    J('第一条广域网发送', (r) => r.type === 'WAN_TX'),
    J('第一条广域网接收', (r) => r.type === 'WAN_RX'),
    J('手机的第一帧', (r) => r.type === 'TX_START' && r.node === 'sta-1' && r.frame.kind === 'data'),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '安静的房间里，这台手机的应用往返是 28.644 毫秒。其中属于空口的是多少？',
      options: [
        '大约一半，另一半是服务器',
        '0.106 毫秒，不到千分之四',
        '全部——应用往返就是空口时间（airtime）的另一个名字',
      ],
      answer: 1,
      explain: '25 毫秒是广域网来回，2 毫秒是服务器处理，1.5 毫秒是抖动的期望。剩下属于空口的只有 0.144 毫秒，而其中入队到确认那一段是 0.106 毫秒。',
    },
    {
      q: '路由器的游戏模式在只有一台手机的安静房间里打开，结果会怎样？',
      options: [
        '应用往返明显下降，因为游戏流量被优先发送了',
        '收到的帧数完全相同，变的只是入队记录的类别与退避倒计数记录的条数',
        '任何记录都不会变，这个开关没有作用',
      ],
      answer: 1,
      explain: '它确实改变了一些内容——每一条入队记录的类别从 1 变成 2，选取范围从 15 变成 7——但没有竞争时，退避计数先减到零还是后减到零，发出的都是同一帧。',
    },
    {
      q: '标准里由接入点为一条流设置优先级的机制是 MSCS。它与本仿真器的游戏模式有什么不同？',
      options: [
        '没有不同，游戏模式就是 MSCS',
        'MSCS 由站点发起建立，只为发往站点的下行 MSDU 设置用户优先级；游戏模式由接入点一个开关直接改变手机上行帧的类别，标准里没有对应',
        'MSCS 只用于语音，不用于游戏',
      ],
      answer: 1,
      explain: '§11.25.3：接入点按站点上行流的用户优先级为下行 MSDU 设置用户优先级，建立由站点的管理实体发起。站点上行帧的优先级由站点自己的上层决定。',
    },
  ],
}
