/**
 * Wi-Fi Tier 2 · M11 · 真实应用 · the cloud round trip, and how little of it is the air.
 *
 * The first lesson in this course with an application layer above the MAC. The
 * engine has had one since the cloud-servers slice of 2026-09-08 —
 * `ServerCfg{rttMs, jitterMs, processMs}`, the `WAN_TX` / `WAN_RX` records and
 * the `stats.appRtt` accumulator — and `src/course/wifiScenes.ts`'s `sc()`
 * turned it off for every scene in the course with one line. Four lessons said
 * in their `limits` that 「引擎之上什么都没有」 because of that line; this lesson is
 * what their `until` now points at (design doc
 * docs/superpowers/specs/2026-10-05-built-but-untaught-design.md §5.3 and §6).
 *
 * It sits before `capstone` because the capstone asks the reader to rank a
 * household's problems, and 「这段时延里有多少是空口的」 is the prerequisite for that
 * question rather than a refinement of it.
 *
 * The scene is `cloudGameScenario()` — quiet by default, four variants off one
 * axis each. Why quiet is the base, why there is only one server in the list,
 * and why the game-mode variant has to carry the two uploading laptops with it
 * are all written out beside the builder. Every number below is pinned in
 * tests/course/wan-rtt.test.ts, measured at 5000 ms on seed 7.
 */
import { type Lesson, J } from '../lessonKit'
import { cloudGameScenario } from '../wifiScenes'

export const wanRtt: Lesson = {
  id: 'wan-rtt',
  module: 11,
  title: '云端往返——用户等的那段时间里，空口只占千分之四',
  why: '到这里为止，这门课量过的每一个数都停在这个房间里：一帧等了多久、抽了几次、占了多少空口时间（airtime）。可没有人在意一帧。打游戏的人在意的是按下技能到画面响应之间那段时间，而那段时间里有一截根本不在这个房间里——它在路由器朝外的那条线上，在机房里那台服务器上。这一课把那一截打开，然后把两段时间并排放着看：读者多半会发现自己一直怪错了对象。',
  outcomes: [
    '把一次应用往返拆成广域网、服务器处理与空口三段，并说出各自占多少',
    '说清空口那一段在什么条件下才第一次变得看得见',
    '读出路由器游戏模式改的是哪一个字段，以及它在安静的房间里为什么什么都不改',
  ],
  needs: ['edca', 'edca-cost', 'queues'],
  terms: [
    { term: 'application round trip', plain: '应用往返：一个包从设备出发、经过路由器与服务器，再回到这台设备的全程时间——游戏里那个 ping 数字量的就是它' },
    { term: 'WAN', plain: '广域网：路由器朝外的那一段路。本仿真器把它建成一个固定的单向时延加一点随机抖动，两个方向各走一次' },
    { term: 'game acceleration', plain: '路由器的游戏模式：一个开关，打开之后路由器把游戏流量归进视频那一类，而不是让它跟着普通流量走' },
  ],
  picture: [
    { heading: '一个包要走的三段路', text: '手机每隔大约 30 毫秒向服务器送一个状态包，服务器隔一会儿答复。这一来一回要走三段：手机到路由器的那一段空口；路由器到服务器那一段广域网（wide area network, WAN），本仿真器把它建成单向 12.5 毫秒的固定时延再加一点抖动；以及服务器自己算答案的 2 毫秒。那两段广域网走的是上行（uplink, UL）与下行（downlink, DL）各一次。前面十几课全部在量第一段，而这一课第一次把三段放在一起。' },
    { kind: 'watch', jump: 0, heading: '去看那一段广域网', text: '载入仿真，跳到第一条广域网发送。时间轴上会多出两类以前从没出现过的记录：一条是答复离开服务器的时刻，一条是上行包到达服务器的时刻。把鼠标悬在它们上面，看那个跨越用了多久——这段时间里，这个房间里一帧也没有发。' },
    { heading: '空口那一段，安静时小得量不出来', text: '这个房间里只有这台手机。它的每一帧入队到被确认，花的都是 0.106 毫秒，二百一十帧一帧不差。而同一轮里，应用往返的均值是 28.688 毫秒。两个数相除是 0.0037——不到千分之四。读者以为的「Wi-Fi 慢」，在这一行里一分钱也不是 Wi-Fi 的。' },
    { heading: '空口要到有人跟它抢的时候才出现', text: '房间里加两台笔记本，让它们一直往外传东西，手机那一段立刻从 0.106 毫秒涨到 10.717 毫秒——涨了一百倍。而应用往返只从 28.688 涨到 44.483 毫秒，因为广域网那 25 毫秒一点没变。空口这一段不是「慢」，它是「平时不存在、忙起来才存在」。' },
  ],
  numbers: [
    { kind: 'table', heading: '五种配置，各跑五秒（基线是一台手机对一台 25/3/2 的游戏服务器）', head: [
      '配置', '往返 均值', '往返 最大', '入队到确认 均值', '同 最大',
    ], rows: [
      ['只有手机（本课）', '28.688 ms', '29.964 ms', '0.106 ms', '0.106 ms'],
      ['加两台笔记本上传', '44.483 ms', '94.223 ms', '10.717 ms', '129.324 ms'],
      ['同上 + 游戏模式', '33.114 ms', '39.976 ms', '2.339 ms', '13.057 ms'],
      ['海外服务器', '93.783 ms', '99.714 ms', '0.106 ms', '0.106 ms'],
      ['没有服务器', '量不出来', '—', '0.108 ms', '0.348 ms'],
    ] },
    { kind: 'formula', heading: '第一行那个数可以当场验算', text: '25（广域网往返）+ 2（服务器处理）+ 1.5（抖动的期望：两个方向各从 0 到 1.5 毫秒均匀抽，合起来期望 1.5）= 28.5 ms', note: '实测 28.688 毫秒，比算出来的多 0.188——多出来的那一点，就是两段空口加上手机侧的排队。第四行同样算得出：80 + 2 + 10 = 92，实测 93.783。' },
    { kind: 'steps', heading: '一次应用往返，引擎是怎么拼出来的', items: [
      '手机的业务源生成一个状态包，交给媒体访问控制（medium access control, MAC）层，记一次入队。',
      '这一帧按它的接入类别（access category, AC）去竞争，发出去、被接入点（access point, AP）确认。「入队到确认」这个数量的就是这一步，而且只有这一步。',
      '被确认之后，接入点才把它交给广域网，走单向 12.5 毫秒（海外那一档是 40 毫秒）。上行丢了，这一步就不会发生——答复也就不会来。',
      '服务器收到，等 2 毫秒处理，发回答复。',
      '答复再走一次 12.5 毫秒的广域网，进接入点的下行队列（queue），排队、竞争、发给手机。',
      '手机收到，引擎把从第一步到这一步的全程记进应用往返。每 250 毫秒的那个 64 字节小包走的正是这一条路，五秒钟得二十个样本。',
    ] },
    { heading: '路由器那个开关改的是一个字段', text: '游戏模式打开之后，手机排的那些帧从尽力而为那一类挪进了视频那一类——时间轴上每一条入队记录的类别从 1 变成 2，别的什么都没写。可就这一个字段，把忙起来时的排队从 10.717 毫秒压到 2.339 毫秒，最大值从 129.324 毫秒压到 13.057 毫秒。尾巴收得比均值狠得多，而这正是打游戏的人唯一在意的那一头。' },
    { heading: '而在安静的房间里，同一个开关什么都不改', text: '把两台笔记本撤掉再打开游戏模式：收到的帧数两边都是 254，一帧不差，只有退避（backoff）的抽签记录少了一些——因为视频那一类的最小竞争窗口（minimum contention window, CWmin）是 7，而尽力而为那一类是 15。一个开关「打开之后记录流变了」并不等于它有用，要看变的是哪一类记录。没有人跟它抢的时候，先发和后发是同一个结果。' },
  ],
  limits: [
    { kind: 'out-of-scope', text: '这一课把应用往返量出来了，可它仍然不是「用户感受到的东西」：引擎里没有 TCP 的拥塞窗口，也没有传输层的超时重发，更没有语音的抖动缓冲。服务器会因为上行没送达而不答复，却不会因为往返变长而降速——真实的连接会。所以这里的 44.483 毫秒是一个被动等出来的数，而真实网络里，等得久本身就会让发送方退让，于是那个数不会这样涨上去。' },
    { kind: 'model-value', text: '广域网那一段是一个固定时延加一次均匀抽取，没有别的：没有路由上的排队，没有丢包，没有中途换路。25 毫秒、3 毫秒抖动、2 毫秒处理这三个数是本仿真器选的（定在云端服务器那一次设计决定里），后来一次实测从侧面支持了它们——腾讯服务器中位往返 49 毫秒、散布约 20 毫秒，落在 25 毫秒的国内预设与 80 毫秒的海外预设之间，所以两个预设都没有动。海外那一档的 80/20 同样是选的，不是量的。' },
    { kind: 'unmodelled', text: '游戏流的包长与间隔来自一次实测：用 USB 包镜像抓的十分钟一局王者荣耀（采集的日期与方法记在 engine/traffic.ts 的注释里），上行平均每 30 毫秒一个 89 到 131 字节的包，下行 65 毫秒一个状态帧。那是一款游戏的一种模式在一台手机上的一次采样，换一款游戏、换一个版本，这张直方图就不是这张了。标准里没有任何一条规定游戏流量长什么样。' },
    { kind: 'unmodelled', text: '路由器的游戏模式在这里是接入点上的一个布尔，打开就把游戏流归进视频那一类。真实路由器要先认出哪一条流是游戏，靠的是端口、流量形态或者包自己带的标记，而且认错是常事。引擎跳过了「认出来」这一整步，直接从「已经认出来了」开始，所以这里的效果是这类开关的上限，不是它的日常表现。' },
  ],
  sources: [
    '用户优先级到接入类别的映射见 IEEE Std 802.11-2024 的 Table 10-1（§10.2.3.2），四类的默认参数见 Table 9-194（EDCA 参数集元素，§9.4.2.27）。',
    '广域网时延、抖动与服务器处理时间都不在 IEEE 语料里，它们是本仿真器的模型取值：四台默认服务器的 20/12/40/25 毫秒定于云端服务器那一次设计决定，王者荣耀的包长与间隔直方图来自一次实测（engine/traffic.ts 的 WZRY_UL_GAPS 与 WZRY_UL_SIZES，注释里记着采集的日期与方法）。',
    '每 250 毫秒一个 64 字节小包这件事写在 engine/traffic.ts 的 PING_PERIOD_NS 旁边，理由是注释自己说的：它量的就是一款游戏的 ping 计数器量的那个数。',
    'TCP 的拥塞窗口与语音的抖动缓冲不在本课范围内，它们的取值在 RFC 里而不在 IEEE 语料里。',
  ],
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
  observe: [
    '手机那一栏的「应用往返」读 28.688 毫秒，「入队到确认」读 0.106 毫秒。把两个数相除：0.0037。',
    '换到「没有服务器」那个变体：应用往返那一栏空了，而入队到确认仍然是 0.108 毫秒。引擎没有少量什么，它是没有东西可量——这个场景里根本没有一个人在等答复。',
    '换到「两台笔记本同时上传」：入队到确认涨到 10.717 毫秒，应用往返涨到 44.483 毫秒。两个数涨的幅度差了一个数量级，因为广域网那 25 毫秒一动不动。',
  ],
  tryThis: [
    '在「两台笔记本同时上传」和「上传 + 路由器游戏模式」之间来回切换，只盯着应用往返的最大值：94.223 毫秒对 39.976 毫秒。均值降了三分之一，最大值降了六成——一个开关对尾部的作用比对平均数大得多。',
    '把服务器的往返改成 0 再载入，猜猜看会不会退回「没有服务器」那一行。不会：应用往返那一栏仍然有数，广域网那两类记录仍然在发。零时延的服务器不是没有服务器，它是一台在隔壁房间的服务器——下行帧仍然要先过一次广域网才进队列。',
  ],
  quiz: [
    {
      q: '安静的房间里，这台手机的应用往返是 28.688 毫秒。其中属于空口的是多少？',
      options: [
        '大约一半，另一半是服务器',
        '0.106 毫秒，不到千分之四',
        '全部——应用往返就是空口时间的另一个名字',
      ],
      answer: 1,
      explain: '25 毫秒是广域网来回，2 毫秒是服务器算答案，1.5 毫秒是抖动的期望。剩下给空口的只有 0.188 毫秒，而其中入队到确认那一段是 0.106 毫秒。',
    },
    {
      q: '路由器的游戏模式在只有一台手机的安静房间里打开，结果会怎样？',
      options: [
        '应用往返明显下降，因为游戏流量被优先发送了',
        '收到的帧数一帧不差，只有退避的抽签记录变了',
        '什么记录都不会变，这个开关是装饰',
      ],
      answer: 1,
      explain: '它确实改了东西——每一条入队记录的类别从 1 变成 2，抽签范围从 15 变成 7——但没有人跟它抢的时候，先数到零和后数到零发出的是同一帧。要让这个开关产生后果，房间里得有第二个竞争者。',
    },
  ],
}
