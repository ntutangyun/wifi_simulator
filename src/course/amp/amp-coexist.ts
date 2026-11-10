/**
 * Tier 2 · M8 · Ambient power IoT (802.11bp) · AMP and Wi-Fi share 2.4 GHz.
 *
 * The AMP lessons before this one gave the tags a channel to themselves. Here the router
 * polls two tags on AC_BK while a camera uploads flat out on AC_BE in the same
 * 2.4 GHz channel and a phone streams video on 5 GHz: the AIFS gap the round
 * starts behind, the CTS-to-self that keeps the camera out of the slots (and
 * the three rounds it fails to), what the round costs in airtime and in the
 * camera's throughput, and why the 5 GHz lane never notices. Every number
 * quoted below is pinned in tests/course/amp-coexist.test.ts.
 *
 * Migrated to the zero-to-hero contract 2026-10-02 (the readability programme's
 * last AMP hole): why/outcomes/needs/terms/picture/numbers/sources/limits in
 * place of the old flat `body`, every official term bracketed with its English
 * name at first Chinese use, and a `steps` block for how a round tries to keep
 * the rest of the BSS quiet. Every fact, number and the scenario/variants/jumps
 * are unchanged from the pre-migration version, so the recorded timeline hashes
 * in tests/fixtures/lesson-hashes.json did not move.
 */
import type { NodeCfg, Scenario } from '../../model/scenario'
import { J, ampAp, firstAmpLost, longApartment, node, sc, tag, txOf, type Lesson } from '../lessonKit'

/** The camera: an 802.11ax station on the 2.4 GHz link, uploading as hard as the channel allows. */
function camera(x: number, y: number): NodeCfg {
  return { ...node('cam', 'Camera', 'sta', x, y, 'he', 'saturated'), linkId: '2g' }
}

/**
 * The flat: a polling router with a 2.4 GHz and a 5 GHz radio, two tags and a
 * camera on 2.4 GHz, a phone on 5 GHz. `polling: false` is the same flat with
 * the AMP function and the tags removed — the Wi-Fi-only baseline.
 */
export function ampCoexistScenario(o: {
  protection?: 'ctsSelf' | 'none'
  pollIntervalMs?: number
  polling?: boolean
  cam?: { x: number; y: number }
} = {}): Scenario {
  const feats = { edca: true, txop: true, ampdu: true }
  const router = o.polling === false
    ? node('ap', 'Router', 'ap', 3, 4, 'eht', 'idle', feats)
    : ampAp('ap', 'Router', 3, 4, { protection: o.protection ?? 'ctsSelf', pollIntervalMs: o.pollIntervalMs ?? 100 }, feats)
  return sc(longApartment(), [
    router,
    camera(o.cam?.x ?? 6, o.cam?.y ?? 4),
    node('phone', 'Phone', 'sta', 12, 4, 'eht', 'video'),
    ...(o.polling === false ? [] : [tag('tag-1', 'Window tag', 2, 2), tag('tag-2', 'Plant tag', 4, 6)]),
  ])
}

export const ampCoexist: Lesson = {
  id: 'amp-coexist',
  module: 10,
  title: 'AMP 与 Wi-Fi 共享 2.4 GHz',
  why: 'AMP 的标签之前独占一条信道，不必和任何人竞争。这里把它们搬进一间真实的公寓：同一条 2.4 GHz 链路（link）上还有一台持续上传的摄像头，5 GHz 上另有一部手机在看视频。路由器的轮询没有专用信道，它和任何别的发送一样，要通过增强型分布式信道接入（enhanced distributed channel access, EDCA）竞争，而且使用四个接入类别（access category, AC）中最低的那个，开始退避（backoff）计数前要等待的时间比摄像头长，所以到了预定时刻往往还要推迟几毫秒才能发出；换来的是标签永远不会拖慢其他设备的视频。每一轮先发一帧写给自己的允许发送（clear to send, CTS），解出它的设备在这一轮期间不发送。但这一帧本身也要竞争，在摄像头恰好同时发送的那几轮，摄像头没有收到它，于是仍然在时隙内发送。标签的上行（uplink, UL）信号 Wi-Fi 解不出，到达摄像头时又弱到连能量检测（energy detection, ED）都无法检出，摄像头的载波侦听（carrier sense）完全检测不到这些时隙内的信号，所以这份保护只是通告，不是强制。去掉它，标签的读数确认率从七成多降到不到两成，摄像头也没有因此获益：它的帧一次次在轮询期间发出、得不到回应，吞吐反而更低。保护开启时，一轮实际发送的帧只占百分之三左右的空口时间（airtime），摄像头损失的吞吐却更多，因为空时隙和有回应的时隙一样使它停止发送；轮询频率提高到五倍，损失还不止五倍。5 GHz 上的手机送达的帧数完全相同：两条链路共享的是一台路由器，不是一条信道。',
  outcomes: [
    '说清轮为什么要在 AC_BK 上和别的流量一起竞争，而不是另开一条专用信道',
    '解释 CTS-to-self（CTS to self）能做到什么、做不到什么——它是通告，不是强制',
    '读出保护这一轮要付出多少吞吐，不加保护又要付出多少',
    '判断轮询频率的变化怎样影响摄像头和标签各自的代价',
  ],
  needs: ['amp-slots'],
  terms: [
    { term: 'AC_BK', plain: '四个接入类别里最低的那一个，用于可以让其他流量优先的流量；AMP 的轮使用的就是这一类' },
    { term: 'AC_BE', plain: '默认的那个接入类别；本课里摄像头的上传使用这一类，比 AC_BK 优先' },
    { term: 'CTS-to-self', plain: '路由器发给自己的一帧 CTS，用来预留信道——能解出它的设备会按 Duration 避让，解不出的设备不会' },
    { term: 'AIFS', plain: '每个接入类别各自的等待时间；优先级越低的类别，等待时间越长' },
  ],
  picture: [
    { heading: '场景：一台路由器，两个频段', text: '路由器在书房的 (3, 4)，带两套射频。两个标签——(2, 2) 的窗磁和 (4, 6) 的植物传感器——每 100 ms 回应一次轮询，用的是 2.4 GHz 链路（link）：标签、摄像头和路由器的第二套射频都工作在这条链路上。(6, 4) 有一台摄像头，在 2.4 GHz 上以 AC_BE 持续满负荷上传；客厅里还有一部手机，在 5 GHz 上看视频。下文每个数字都是在前两秒内测得的。这台摄像头是一个压力负载：它始终有下一帧待发，所以轮的代价会直接表现为吞吐损失。换成一台负载轻的摄像头，同样这些微秒就会变成时延。' },
    { kind: 'watch', jump: 0, heading: '这一轮如何保护自己', text: '载入仿真，跳到第一帧 CTS-to-self：路由器发给自己的一帧允许发送（clear to send, CTS），提前把信道预留下来。' },
    { heading: 'AC_BK：轮的优先级低于摄像头', text: 'AMP 的一个轮就是一次帧交换序列，接入点（access point, AP）获得它的方式和获得任何其他发送机会一样：通过增强型分布式信道接入（enhanced distributed channel access, EDCA）功能。PAR 把 2.4 GHz 里的 AMP 通信安排在 AC_BK 上——四个接入类别（access category, AC）里最低的那个，专门用于“应当让其他流量优先”的流量。摄像头的上传在 AC_BE，比它高一级。' },
    { kind: 'formula', text: 'AIFS[AC] = SIFS + AIFSN[AC] × 时隙        2.4 GHz：SIFS 10 µs，时隙 9 µs', note: '2.4 GHz 下时隙是 9 µs，短帧间间隔（short interframe space, SIFS）是 10 µs，于是轮所在的 AC_BK 要等 10 + 7 × 9 = 73 µs 才能开始退避计数，而摄像头的 AC_BE 只等 10 + 3 × 9 = 37 µs。每一段空闲都是一次竞争，而这个轮一开始就落后 36 µs。' },
    { text: '两秒里该发二十个轮，也确实发出了二十个，但轮询间隔不是时间表：CTS-to-self 平均比预定时刻晚 5.17 ms 才发出，最晚的一次晚了 12.86 ms。二十个轮里只有两个恰好在预定时刻发出：第一个轮，因为 t = 0 时谁都还没有退避（backoff）值，路由器的 CTS-to-self 和摄像头的请求发送（request to send, RTS）都在 0 µs 开始发送；还有 1.8 s 那个轮，恰好遇上信道空闲、退避也已经计数完毕。AC_BK 换来的是另一种保证：标签永远不会是视频通话卡顿的原因。' },
    { heading: 'CTS-to-self 只能通告，不能强制', text: '标签的上行（uplink, UL）是 250 kb/s 的 OOK。没有任何 Wi-Fi 终端能解出它，而解不出 PPDU（PHY protocol data unit）就拿不到 Duration 字段，也就无从设置网络分配向量（network allocation vector, NAV）——它只能检测到能量，而且只在能量持续期间检测到。标签的发射功率（transmit power）是 0 dBm，于是在书房另一头的摄像头那里，植物标签只有 −65.7 dBm，窗磁只有 −71.7 dBm，都低于 −62 dBm 的能量检测门限（energy detection threshold）。摄像头的载波侦听（carrier sense）完全检测不到这些时隙内的信号。' },
    { kind: 'steps', heading: '一个轮如何让其他设备停止发送', items: [
      '路由器先发一帧 CTS-to-self，把 Duration 字段覆盖到这一轮结束。',
      '能解出这帧 CTS-to-self 的 Wi-Fi 设备据此设置 NAV，在 Duration 到期之前不再发送。',
      '解不出的设备——恰好在这一时刻也在发送的设备——不会设置任何倒计时，仍然可能在轮询期间发送。',
      '路由器完成轮询、读取回应，全程不理会其他设备的帧：它正在执行一个轮，而轮是不可中断的。',
      '这些帧的发送方要么等到 CTS 超时，要么因轮中一帧意外收到的 Ack 而提前结束等待——两种结局都要把竞争窗口（contention window, CW）翻一倍。',
    ] },
  ],
  numbers: [
    { text: '所以每个轮开始之前，路由器先给自己发一帧 CTS：14 个字节、6 Mb/s、占空口 50 µs，使用的是基本服务集（basic service set, BSS）中所有设备都能解调的速率。轮本身和最初那一课一样——50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs——其中 CTS-to-self 的 Duration 字段覆盖了它之后的 4140 µs。摄像头解出了二十帧里的十七帧，并按 Duration 的要求把 NAV 设了 4140 µs。' },
    { text: '值得注意的是漏收的那三帧。这三次，摄像头自己的 RTS 都和 CTS-to-self 在同一纳秒开始发送：半双工的射频在发送期间无法接收，而从未收到 Duration 的终端自然不会设 NAV。802.11 的保护机制向来是尽力而为——保护帧和别的帧一样要参与竞争，而它要让其停止发送的那个终端，很可能恰好也在发送。' },
    { text: '整个运行里只有九帧摄像头的帧落在了上行时隙内——无一例外都是 RTS，无一例外都发生在它没有收到通告的那三个轮里。路由器一帧也没有回应：它正在执行一个轮，而轮是不可中断的。九次里有八次以 CTS 超时告终；第九次结束得更早：一帧 AMP Ack 落在超时窗口之内，摄像头当场就判定这次尝试失败。两种结局一样，都要把竞争窗口翻一倍。' },
    { kind: 'table', heading: '两秒，四种运行配置', head: [
      '运行配置', '读数被确认',
      '落在时隙内的摄像头帧',
      '摄像头', '5 GHz 手机',
    ], rows: [
      ['只有 Wi-Fi（没有标签）', '—', '—', '105.29 Mb/s', '13.24 Mb/s'],
      ['轮询 + CTS-to-self', '29 / 40 (72.5 %)', '9', '99.89 Mb/s', '13.24 Mb/s'],
      ['轮询 + 无保护', '7 / 40 (17.5 %)', '79', '94.08 Mb/s', '13.24 Mb/s'],
      ['CTS-to-self，每 20 ms 轮询', '139 / 200 (69.5 %)', '33', '77.41 Mb/s', '13.24 Mb/s'],
    ] },
    { text: '标签一共送出 40 帧回应，29 帧得到了确认——72.5 %。丢失的十一帧里，八帧是两个标签抽到了同一个时隙，二十轮里发生了四次；另外三帧与摄像头的帧发生碰撞而丢失，三次都发生在摄像头没有收到通告的那几个轮里。两个标签分享四个时隙，大部分时隙是空的：80 个时隙里 44 个为空，32 个含一帧回应，4 个含两帧。' },
    { heading: '这个轮占用多少空口时间（airtime）', text: '每个轮都要在每 100 ms 里预留 4190 µs——4.19 %——但其中实际有调制（modulation）信号在空口上传送的只有 3044 µs：每秒 30 440 µs，占信道的 3.044 %。差额就是那些空时隙：同样被预留、同样占用时间。' },
    { kind: 'formula', text: '每轮：50（CTS）+ 618（触发帧）+ 4 × 330（Ack）= 1988 µs，再加 2 × 528（两帧回应）= 3044 µs' },
    { text: '轮询开着时摄像头能送出 99.89 Mb/s，把标签从同一个房间中移除后是 105.29 Mb/s：为了一个只占 3.044 % 空口时间的轮，它付出了 5.13 % 的吞吐。多出来的那部分来自两处：一是预留——空时隙和满时隙一样让摄像头停止发送——二是它的帧直接在轮询期间发出的那三个轮。' },
    { heading: '去掉保护', text: '去掉 CTS-to-self，摄像头就完全无法得知轮的存在：整个运行里一次 NAV 都没有设置，落在上行时隙内的摄像头帧从九帧增加到 79 帧。40 帧回应只有 7 帧成功——17.5 %，而有 CTS-to-self 时是 72.5 %——路由器记录了 25 次原因为 collision 的接收失败，而此前只有 3 次。' },
    { text: '标签损失的，摄像头并没有得到。它无人应答的 RTS 从八次增加到 78 次，自己的吞吐反而降到 94.08 Mb/s——比受 NAV 约束时的 99.89 Mb/s 还低。' },
    { heading: '把轮询频率提高到五倍', text: '轮询间隔改成 20 ms，同样 4190 µs 的轮就要预留信道的 20.95 %，其中 3044 µs 的 PPDU 变成每秒 152 200 µs，占 15.22 %。摄像头降到 77.41 Mb/s——比只有 Wi-Fi 时的 105.29 Mb/s 低 26.49 %——而标签每轮的确认率还略有下降：200 帧回应里确认了 139 帧，69.5 %。读数变成五倍，空口时间就变成五倍，吞吐损失还不止五倍。' },
    { heading: '另一个频段不受影响', text: '手机关联在路由器的 5 GHz 射频上。基础场景、无保护、20 ms 轮询、完全没有 AMP——四种运行配置下它送达的视频帧都是 2365 帧，13.24 Mb/s，完全相同。两条链路共享的是一台路由器，不是一条信道，AP 在每套射频上分别竞争。' },
    { kind: 'list', heading: '在哪里查看', items: [
      '泳道：ap#2g 和 ap 是路由器的两套射频；摄像头和两个标签在第一条下面，手机在第二条下面。',
      '日志里：每个轮之前会输出仲裁帧间间隔（arbitration interframe space, AIFS）的等待，格式是“AIFS wait until … [AC_BK]”；摄像头上是“NAV set until …（cts:ap）”，在轮询期间发送时是“CTS timeout”。',
      'CTS-to-self：打开它读取 Duration 字段——4140 µs，正好覆盖后面那个轮。',
    ] },
  ],
  sources: [
    'IEEE P802.11bp 仍是草案：D0.5 于 2026 年 5 月发布，D1.0 将于 2026 年 9 月进入 letter ballot。本课拆解的轮来自提案草案文本 11-26/1889r4 第 39.4 节与 11-26/1519r5；AP 用 AC_BK 发起这个轮出自 PAR。',
    '轮前面那帧 CTS-to-self 是仿真器的模型选择，不是草案强制要求：规范框架 11-24/1613r20 的 FM-48 只对双基地反向散射模式强制要求保护。',
  ],
  limits: [
    { kind: 'model-value', text: 'CTS-to-self 保护这个轮是本仿真器的设计选择（scenario.ts 的 AmpApCfg.protection），不是标准强制要求：规范框架 11-24/1613r20 的 FM-48 只对双基地反向散射模式强制要求保护，Active Tx 的轮本可以完全不发这帧 CTS，或者换一种更窄的预留方式。' },
    { kind: 'unmodelled', text: '传播模型完全确定，不含任何快衰落（propagation.ts 不含任何随机项）：摄像头与 CTS-to-self 同时开始发送的那三个轮，是伪随机种子与轮询时钟共同决定的确定性结果，同一个种子每次重跑都复现同样的三轮。真实世界里每一次这样的碰撞，具体时刻都会因时钟抖动而略有不同，但“发送时无法接收”这条半双工约束本身没有被简化。' },
    { kind: 'threshold', text: '一次接收是否失败，引擎按整个接收过程中干扰最强的那一时刻判定（channel.ts 的 maxInterfMw 与它的门限），所以摄像头的 RTS 只要有一个时刻受到的干扰超过门限，整帧就判为失败。真实系统中纠错编码配合交织，短暂的重叠往往仍能被纠正，碰撞因此是一条概率曲线；这里它是一个硬判决，本课测得的 3 次 collision 比真实链路更确定、更容易复现。' },
    { kind: 'unmodelled', text: '本仿真器把轮固定在 AC_BK 上，没有让 AP 根据观测到的时延或碰撞情况切换接入类别的机制（ampAp.ts 的轮固定走 AC_BK，没有可配置的替代项）。真实实现若把轮换到优先级更高的 AC，摄像头与手机受到的影响会和本课测得的数字完全不同。' },
  ],
  scenario: () => ampCoexistScenario(),
  variants: [
    { label: '不加保护', scenario: () => ampCoexistScenario({ protection: 'none' }) },
    { label: '每 20 ms 轮询一次', scenario: () => ampCoexistScenario({ pollIntervalMs: 20 }) },
    { label: '只有 Wi-Fi：没有标签，也没有轮询', scenario: () => ampCoexistScenario({ polling: false }) },
  ],
  jumps: [
    J('第一帧 CTS-to-self', txOf((r) => r.frame.kind === 'cts' && r.frame.dst === r.frame.src)),
    J('摄像头第一次据此设置 NAV', (r) => r.type === 'NAV_SET' && r.node === 'cam#2g' && r.source === 'cts:ap'),
    J('第一帧路由器没有回应的摄像头 RTS', (r) => r.type === 'CTS_TIMEOUT' && r.node === 'cam#2g'),
    J('第一帧路由器无法确认的标签回应', firstAmpLost),
    J('第一帧 5 GHz 视频', txOf((r) => r.node === 'ap' && r.frame.kind === 'data')),
  ],
  observe: [
    '跳到 0 µs 的第一帧 CTS-to-self：摄像头的 RTS 在同一时刻开始，所以它根本没有解出这份通告。再跳到摄像头第一次设置 NAV 的时刻，111.914 ms——对应第二个轮——看它完整等待 4140 µs。',
    '载入“不加保护”变体，跳到第一帧路由器没有回应的摄像头 RTS，时间是 73 µs：它在 0 µs 开始，与触发帧（Trigger frame）同一时刻，而路由器当时正在发送。再前进到下一次超时，890 µs——它的 RTS 从 817 µs 开始，正落在时隙 1 内、与标签的回应重叠，于是路由器在 1156 µs 记录一条原因为 collision 的 RX_FAIL，随后的 Ack 标明的是路由器自己。',
    '选中手机，在四种运行配置之间来回切换。它那条泳道每次都完全相同——2365 帧，第一帧在 883.111 µs。两套射频各自独立竞争，这个轮对不在 2.4 GHz 上接收的设备完全不可见。',
  ],
  tryThis: [
    '在编辑器的 AMP 轮询设置里把 protection 改成 “none”，或者直接载入“不加保护”变体，然后对比两次运行。确认率从 72.5 % 降到 17.5 %，落在时隙内的摄像头帧从 9 帧增加到 79 帧——但也要查看摄像头本身：无人应答的 RTS 从 8 次增加到 78 次，吞吐从 99.89 Mb/s 降到 94.08 Mb/s。然后想一想：为什么保护这个轮，反而使未受保护的那个终端吞吐更高？',
    '把摄像头拖到 (4, 5.6)，离植物标签只有 40 cm，再载入“不加保护”变体：摄像头现在能检测到标签的信号，而且远高于 −62 dBm，于是按规则退避，路由器记录的碰撞从 25 次降为零，被确认的读数从 7 个增加到 26 个。代价是有七个轮里，某个标签因为身旁的摄像头正在发送而解不出触发帧，整轮都没有作答——载波侦听只能保护那些能检测到对方发送的设备。',
  ],
  quiz: [
    {
      q: '为什么 AMP 的轮平均要比轮询时钟的预定时刻晚 5.17 ms 才发出？',
      options: [
        '250 kb/s 下构造触发帧本身就要 5.17 ms',
        '它在 AC_BK 上竞争，AIFS 是 73 µs，而摄像头是 37 µs；信道忙时它和其他设备一样必须等待',
        'AP 故意推迟，好让标签有时间收集能量',
      ],
      answer: 1,
      explain: 'AC_BK 要等 10 + 7 × 9 = 73 µs，AC_BE 只等 37 µs，信道一旦忙，摄像头就一次次先把退避计数减到零。轮询间隔是一个目标，不是一张时间表。',
    },
    {
      q: '二十个轮前面都发了 CTS-to-self，摄像头却只设了十七次 NAV。为什么？',
      options: [
        '它的 NAV 仍停留在上一个轮中、尚未到期',
        '那三次摄像头恰好在同一时刻发送自己的 RTS，而半双工的射频在发送时无法解调',
        'CTS-to-self 用 6 Mb/s 发送，802.11ax 终端解不出来',
      ],
      answer: 1,
      explain: '漏掉的三帧 CTS-to-self，每一帧都和摄像头的一帧 RTS 在同一纳秒开始。保护帧也是帧：它要参与竞争，也完全可能被它本想保护的那个终端错过。',
    },
    {
      q: '把轮询从 100 ms 改成 20 ms，摄像头损失了 26.49 % 的吞吐。5 GHz 的手机损失了多少？',
      options: [
        '没有损失：四种运行配置下它都送达同样的 2365 帧',
        '大约是摄像头损失的五分之一，因为 AP 的队列（queue）是共享的',
        '同样是 26.49 %：AP 一次只能用一套射频发送',
      ],
      answer: 0,
      explain: 'AP 同时是两条链路的成员，在每条上分别竞争。AMP 的轮只占用 2.4 GHz；手机的 5 GHz 泳道在基础场景、无保护、20 ms 轮询和完全没有 AMP 时都完全相同。',
    },
  ],
}
