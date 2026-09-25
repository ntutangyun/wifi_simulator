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
 * CAUTION — this lesson sits close to the minute at which `lessonMinutes` rounds
 * up from 25 to 30. Adding a section means checking the estimate again
 * (`npx tsx scripts/lesson-dump.ts amp-coexist`), or the study-time test fails.
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
  module: 7,
  title: 'AMP 与 Wi-Fi 共享 2.4 GHz',
  body: [
    { text: 'IEEE P802.11bp 仍是草案：D0.5 于 2026 年 5 月发布，D1.0 将于 2026 年 9 月进入 letter ballot。本课拆解的轮来自提案草案文本 11-26/1889r4 第 39.4 节与 11-26/1519r5；AP 用 AC_BK 发起这个轮出自 PAR，而轮前面那帧 CTS-to-self 是仿真器的模型选择——规范框架 11-24/1613r20 只对双基地反向散射强制要求保护（FM-48）。前面几课里标签独占一条信道。这一课给它们安排了邻居。' },
    { heading: '场景：一台路由器，两个频段', text: '路由器在书房的 (3, 4)，带两套射频。两个标签——(2, 2) 的窗磁和 (4, 6) 的植物传感器——每 100 ms 回应一次轮询，用的是 2.4 GHz 这条链路：标签、摄像头和路由器的第二套射频都挤在上面。(6, 4) 有一台摄像头，在 2.4 GHz 上以 AC_BE 拼命上传；客厅里还有一部手机，在 5 GHz 上看视频。下文每个数字都是在头两秒里量出来的。' },
    { text: '这台摄像头是一个压力负载：它手里永远有下一帧待发，所以轮的代价会直接表现为吞吐损失。换成一台负载轻的摄像头，同样这些微秒就会变成时延。' },
    { heading: 'AC_BK：轮排在摄像头后面', text: 'AMP 的一个轮就是一次帧交换序列，AP 获得它的方式和获得任何别的发送机会一样：走 EDCA 功能。PAR 把 2.4 GHz 里的 AMP 通信放在 AC_BK 上——四个接入类别里最低的那个，专门留给“应该给别人让路”的流量。摄像头的上传在 AC_BE，比它高一级。' },
    { kind: 'formula', text: 'AIFS[AC] = SIFS + AIFSN[AC] × 时隙        2.4 GHz：SIFS 10 µs，时隙 9 µs', note: '2.4 GHz 下时隙是 9 µs，SIFS 是 10 µs，于是轮所在的 AC_BK 要等 10 + 7 × 9 = 73 µs 才有资格开始倒数，而摄像头的 AC_BE 只等 10 + 3 × 9 = 37 µs。每一段空闲都是一场赛跑，而这个轮起跑就落后 36 µs。' },
    { text: '两秒里该发二十个轮，也确实发出了二十个，但轮询间隔不是时间表：CTS-to-self 平均比“到点”晚 5.17 ms 才出去，最晚的一次晚了 12.86 ms。二十个轮里只有两个正好卡在点上：第一个轮，因为 t = 0 时谁都还没有退避值，路由器的 CTS-to-self 和摄像头的 RTS 都在 0 µs 开始发送；还有 1.8 s 那个轮，恰好赶上信道空闲、退避也已经数完。AC_BK 换来的是另一种保证：标签永远不会是视频通话卡顿的原因。' },
    { heading: 'CTS-to-self 是一份公告，不是一道围墙', text: '标签的上行是 250 kb/s 的 OOK。没有任何 Wi-Fi 终端能解出它，而解不出 PPDU 就拿不到 Duration 字段，也就无从设置 NAV——它只能看见能量，而且只在能量持续的那段时间里看见。标签的发射功率是 0 dBm，于是在书房另一头的摄像头那里，植物标签只有 −65.7 dBm，窗磁只有 −71.7 dBm，都低于 −62 dBm 的能量检测门限。摄像头的载波侦听根本看不见这些时隙。' },
    { text: '所以每个轮开始之前，路由器先给自己发一帧 CTS：14 个字节、6 Mb/s、占空口 50 µs，用的是 BSS 里人人都读得懂的速率。轮本身和最初那一课一样——50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs——其中 CTS-to-self 的 Duration 字段覆盖了它之后的 4140 µs。摄像头解出了二十帧里的十七帧，并按 Duration 的要求把 NAV 设了 4140 µs。' },
    { text: '有意思的是漏掉的那三帧。这三次，摄像头自己的 RTS 都和 CTS-to-self 在同一纳秒开始发送：半双工的射频在说话时就聋了，而从未听见 Duration 的终端自然不会设 NAV。802.11 的保护机制向来是尽力而为——保护帧和别的帧一样要参与竞争，而它想让其安静的那个终端，很可能正好也在发。' },
    { text: '整个运行里只有九帧摄像头的帧落进了上行时隙——无一例外都是 RTS，无一例外都发生在它没听见公告的那三个轮里。路由器一帧也没回应：它正在跑一个轮，而轮是不可打断的。九次里有八次以 CTS 超时收场；第九次结束得更早：一帧 AMP Ack 落在超时窗口之内，摄像头当场就把这次尝试判了死刑。两种结局一样，都要把竞争窗口翻一倍。' },
    { kind: 'table', heading: '两秒，四种跑法', head: [
      '跑法', '读数被确认',
      '落进时隙的摄像头帧',
      '摄像头', '5 GHz 手机',
    ], rows: [
      ['只有 Wi-Fi（没有标签）', '—', '—', '105.29 Mb/s', '13.24 Mb/s'],
      ['轮询 + CTS-to-self', '29 / 40 (72.5 %)', '9', '99.89 Mb/s', '13.24 Mb/s'],
      ['轮询 + 无保护', '7 / 40 (17.5 %)', '79', '94.08 Mb/s', '13.24 Mb/s'],
      ['CTS-to-self，每 20 ms 轮询', '139 / 200 (69.5 %)', '33', '77.41 Mb/s', '13.24 Mb/s'],
    ] },
    { text: '标签一共送出 40 帧回应，29 帧拿到了确认——72.5 %。丢掉的十一帧里，八帧是两个标签抽到了同一个时隙，二十轮里发生了四次；另外三帧输给了摄像头，而且三次都落在它没听见公告的那几个轮里。两个标签分四个时隙，大部分时隙是空的：80 个时隙里 44 个安静无声，32 个装着一帧回应，4 个装着两帧。' },
    { heading: '这个轮要花多少', text: '每个轮都要在每 100 ms 里预留 4190 µs——4.19 %——但其中真正被调制到空口上的只有 3044 µs：每秒 30 440 µs，占信道的 3.044 %。差额就是那些空时隙：一样被预留、一样要付钱。' },
    { kind: 'formula', text: '每轮：50（CTS）+ 618（触发帧）+ 4 × 330（Ack）= 1988 µs，再加 2 × 528（两帧回应）= 3044 µs' },
    { text: '轮询开着时摄像头能送出 99.89 Mb/s，把标签从同一间屋子里拿掉后是 105.29 Mb/s：为了一个只占 3.044 % 空口时间的轮，它付出了 5.13 % 的吞吐。多出来的那部分来自两处：一是预留——空时隙和满时隙一样让摄像头闭嘴——二是它一头撞进去的那三个轮。' },
    { heading: '把保护拿掉', text: '把 CTS-to-self 拿掉，摄像头就彻底不知道轮的存在了：整个运行里一次 NAV 都没设，落进上行时隙的摄像头帧从九帧涨到 79 帧。40 帧回应只活下来 7 帧——17.5 %，而有 CTS-to-self 时是 72.5 %——路由器记下了 25 次原因为 collision 的接收失败，而此前只有 3 次。' },
    { text: '标签丢掉的，摄像头并没有赚到。它的 RTS 从八次无人应答变成 78 次，自己的吞吐反而跌到 94.08 Mb/s——比被“挡在门外”时的 99.89 Mb/s 还低。' },
    { heading: '把轮询频率提高到五倍', text: '轮询间隔改成 20 ms，同样 4190 µs 的轮就要预留信道的 20.95 %，其中 3044 µs 的 PPDU 变成每秒 152 200 µs，占 15.22 %。摄像头跌到 77.41 Mb/s——比只有 Wi-Fi 时的 105.29 Mb/s 低 26.49 %——而标签每轮的成绩还略有下滑：200 帧回应里确认了 139 帧，69.5 %。读数变成五倍，空口时间就变成五倍，吞吐损失还不止五倍。' },
    { heading: '另一个频段毫无察觉', text: '手机挂在路由器的 5 GHz 射频上。基础场景、无保护、20 ms 轮询、完全没有 AMP——四种跑法下它送达的视频帧都是 2365 帧，13.24 Mb/s，一帧不差。两条链路共享的是一台路由器，不是一条信道，AP 在每套射频上分别竞争。' },
    { kind: 'list', heading: '在哪里看', items: [
      '泳道：ap#2g 和 ap 是路由器的两套射频；摄像头和两个标签在第一条下面，手机在第二条下面。',
      '日志里：每个轮之前的“AIFS wait until … [AC_BK]”，摄像头上的“NAV set until …（cts:ap）”，以及它撞进轮里时的“CTS timeout”。',
      'CTS-to-self：点开它读 Duration 字段——4140 µs，正好是后面那个轮。',
    ] },
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
    '跳到 0 µs 的第一帧 CTS-to-self：摄像头的 RTS 在同一瞬间开始，所以这份公告它压根没解出来。再跳到摄像头第一次设 NAV 的时刻，111.914 ms——那是第二个轮的——看它老老实实地空等完整整 4140 µs。',
    '载入“不加保护”变体，跳到第一帧路由器没有回应的摄像头 RTS，时间是 73 µs：它在 0 µs 开始，和触发帧同一瞬间，而路由器当时正在发送。再走到下一次超时，890 µs——它的 RTS 从 817 µs 开始，正落在时隙 1 里、压在标签的回应上，于是路由器在 1156 µs 记下一条原因为 collision 的 RX_FAIL，收尾的 Ack 点名的是路由器自己。',
    '选中手机，在四种跑法之间来回切换。它那条泳道每次都一模一样——2365 帧，第一帧在 883.111 µs。两套射频各自独立竞争，这个轮对不在 2.4 GHz 上收听的设备完全不可见。',
  ],
  tryThis: [
    '在编辑器的 AMP 轮询设置里把 protection 改成 “none”，或者直接载入“不加保护”变体，然后对比两次运行。确认率从 72.5 % 掉到 17.5 %，落进时隙的摄像头帧从 9 帧涨到 79 帧——但也别忘了看摄像头自己：无人应答的 RTS 从 8 次变成 78 次，吞吐从 99.89 Mb/s 掉到 94.08 Mb/s。然后想一想：为什么保护这个轮，反而让没被保护的那个终端更快了？',
    '把摄像头拖到 (4, 5.6)，离植物标签只有 40 cm，再载入“不加保护”变体：摄像头现在能听见标签的信号，而且远高于 −62 dBm，于是乖乖退避，路由器记下的碰撞从 25 次变成一次也没有，被确认的读数从 7 个涨到 26 个。代价是有七个轮里，某个标签被身旁的摄像头吵聋，干脆一声不吭——载波侦听只能保护那些听得见的人。',
  ],
  quiz: [
    {
      q: '为什么 AMP 的轮平均要比轮询时钟“到点”晚 5.17 ms 才发出去？',
      options: [
        '250 kb/s 下构造触发帧本身就要 5.17 ms',
        '它在 AC_BK 上竞争，AIFS 是 73 µs，而摄像头是 37 µs；信道忙时它和别人一样得等',
        'AP 故意推迟，好让标签有时间收集能量',
      ],
      answer: 1,
      explain: 'AC_BK 要等 10 + 7 × 9 = 73 µs，AC_BE 只等 37 µs，信道一忙，摄像头就一次次先把退避数到零。轮询间隔是愿望，不是时间表。',
    },
    {
      q: '二十个轮前面都发了 CTS-to-self，摄像头却只设了十七次 NAV。为什么？',
      options: [
        '它的 NAV 还停留在上一个轮里没有到期',
        '那三次摄像头正好在同一瞬间发自己的 RTS，而半双工的射频在发送时无法解调',
        'CTS-to-self 用 6 Mb/s 发送，802.11ax 终端解不出来',
      ],
      answer: 1,
      explain: '漏掉的三帧 CTS-to-self，每一帧都和摄像头的一帧 RTS 在同一纳秒开始。保护帧也是帧：它要参与竞争，也完全可能被它本想保护的那个终端错过。',
    },
    {
      q: '把轮询从 100 ms 改成 20 ms，摄像头损失了 26.49 % 的吞吐。5 GHz 的手机损失了多少？',
      options: [
        '一点也没有：四种跑法下它都送达同样的 2365 帧',
        '大约是摄像头损失的五分之一，因为 AP 的队列是共享的',
        '同样是 26.49 %：AP 一次只能用一套射频发送',
      ],
      answer: 0,
      explain: 'AP 同时是两条链路的成员，在每条上分别竞争。AMP 的轮只占用 2.4 GHz；手机的 5 GHz 泳道在基础场景、无保护、20 ms 轮询和完全没有 AMP 时都一模一样。',
    },
  ],
}
