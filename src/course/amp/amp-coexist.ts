/**
 * Tier 2 · M8 · Ambient power IoT (802.11bp) · AMP and Wi-Fi share 2.4 GHz.
 *
 * The first two lessons gave the tags a channel to themselves. Here the router
 * polls two tags on AC_BK while a camera uploads flat out on AC_BE in the same
 * 2.4 GHz channel and a phone streams video on 5 GHz: the AIFS gap the round
 * starts behind, the CTS-to-self that keeps the camera out of the slots (and
 * the three rounds it fails to), what the round costs in airtime and in the
 * camera's throughput, and why the 5 GHz lane never notices. Every number
 * quoted below is pinned in tests/course/amp-coexist.test.ts.
 */
import type { NodeCfg, Scenario } from '../../model/scenario'
import {
  J, N, ampAp, firstAmpLost, longApartment, node, sc, tag, txOf,
  type Lesson,
} from '../lessonKit'

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
  title: { en: 'AMP and Wi-Fi share 2.4 GHz', zh: 'AMP 与 Wi-Fi 共享 2.4 GHz' },
  body: [
    { text: {
      en: 'IEEE P802.11bp is still a draft: D0.5 in May 2026, D1.0 to letter ballot in September 2026. The round taken apart here is proposed draft text 11-26/1889r4 §39.4 and 11-26/1519r5; that the AP runs it on AC_BK comes from the PAR, and the CTS-to-self in front of it is a model choice — the Specification Framework 11-24/1613r20 mandates protection only for bistatic backscatter (FM-48). The first two lessons gave the tags a channel to themselves. This one gives them neighbours.',
      zh: 'IEEE P802.11bp 仍是草案：D0.5 于 2026 年 5 月发布，D1.0 将于 2026 年 9 月进入 letter ballot。本课拆解的轮来自提案草案文本 11-26/1889r4 第 39.4 节与 11-26/1519r5；AP 用 AC_BK 发起这个轮出自 PAR，而轮前面那帧 CTS-to-self 是仿真器的模型选择——规范框架 11-24/1613r20 只对双基地反向散射强制要求保护（FM-48）。前两课里标签独占一条信道。这一课给它们安排了邻居。',
    } },
    { heading: { en: 'The scene: one router, two bands', zh: '场景：一台路由器，两个频段' }, text: {
      en: 'The router sits in the study at (3, 4) with two radios. Two tags — a window sensor at (2, 2) and a plant sensor at (4, 6) — answer its poll every 100 ms on the 2.4 GHz link the tags, the camera and the router’s second radio all share. A camera at (6, 4) uploads on 2.4 GHz as hard as the channel will let it, on AC_BE, and a phone in the living room streams video on 5 GHz. Every number below is measured over the first two seconds.',
      zh: '路由器在书房的 (3, 4)，带两套射频。两个标签——(2, 2) 的窗磁和 (4, 6) 的植物传感器——每 100 ms 回应一次轮询，用的是 2.4 GHz 这条链路：标签、摄像头和路由器的第二套射频都挤在上面。(6, 4) 有一台摄像头，在 2.4 GHz 上以 AC_BE 拼命上传；客厅里还有一部手机，在 5 GHz 上看视频。下文每个数字都是在头两秒里量出来的。',
    } },
    { heading: { en: 'AC_BK: the round queues behind the camera', zh: 'AC_BK：轮排在摄像头后面' }, text: {
      en: 'An AMP round is one frame exchange sequence, and the AP obtains it the way it obtains any other: through an EDCA function. The PAR puts AMP communication in 2.4 GHz on AC_BK, the lowest of the four access categories — the one for traffic that should yield to everything else. The camera’s upload sits on AC_BE, one category above it.',
      zh: 'AMP 的一个轮就是一次帧交换序列，AP 获得它的方式和获得任何别的发送机会一样：走 EDCA 功能。PAR 把 2.4 GHz 里的 AMP 通信放在 AC_BK 上——四个接入类别里最低的那个，专门留给“应该给别人让路”的流量。摄像头的上传在 AC_BE，比它高一级。',
    } },
    { kind: 'formula', text: {
      en: 'AIFS[AC] = SIFS + AIFSN[AC] × slot        2.4 GHz: SIFS 10 µs, slot 9 µs',
      zh: 'AIFS[AC] = SIFS + AIFSN[AC] × 时隙        2.4 GHz：SIFS 10 µs，时隙 9 µs',
    }, note: {
      en: 'On 2.4 GHz a slot is 9 µs and SIFS is 10 µs, so the round’s AC_BK waits 10 + 7 × 9 = 73 µs before it may even start counting down, and the camera’s AC_BE waits 10 + 3 × 9 = 37 µs. Every idle period is a race the round starts 36 µs behind.',
      zh: '2.4 GHz 下时隙是 9 µs，SIFS 是 10 µs，于是轮所在的 AC_BK 要等 10 + 7 × 9 = 73 µs 才有资格开始倒数，而摄像头的 AC_BE 只等 10 + 3 × 9 = 37 µs。每一段空闲都是一场赛跑，而这个轮起跑就落后 36 µs。',
    } },
    { text: {
      en: 'Twenty rounds are due in the two seconds and twenty go out, but the poll clock is not a schedule: the CTS-to-self leaves on average 5.17 ms after the round fell due, and once 12.86 ms after. Only the first round is on time, and only because at t = 0 nothing has a backoff yet: the router’s CTS-to-self and the camera’s RTS both start at 0 µs. What AC_BK buys instead is the promise that the tags will never be why a video call stutters.',
      zh: '两秒里该发二十个轮，也确实发出了二十个，但轮询间隔不是时间表：CTS-to-self 平均比“到点”晚 5.17 ms 才出去，最晚的一次晚了 12.86 ms。只有第一个轮准时，而且只是因为 t = 0 时谁都还没有退避值：路由器的 CTS-to-self 和摄像头的 RTS 都在 0 µs 开始发送。AC_BK 换来的是另一种保证：标签永远不会是视频通话卡顿的原因。',
    } },
    { heading: { en: 'CTS-to-self is an announcement, not a fence', zh: 'CTS-to-self 是一份公告，不是一道围墙' }, text: {
      en: 'A tag’s uplink is OOK at 250 kb/s. No Wi-Fi station can decode it, and a station that cannot decode a PPDU has no Duration field to take a NAV from — it sees energy, and only while the energy lasts. A tag transmits at 0 dBm, so from the camera’s corner of the study the plant tag arrives at −65.7 dBm and the window tag at −71.7 dBm, both under the −62 dBm energy-detection threshold. The camera’s carrier sense does not see the slot at all.',
      zh: '标签的上行是 250 kb/s 的 OOK。没有任何 Wi-Fi 终端能解出它，而解不出 PPDU 就拿不到 Duration 字段，也就无从设置 NAV——它只能看见能量，而且只在能量持续的那段时间里看见。标签的发射功率是 0 dBm，于是在书房另一头的摄像头那里，植物标签只有 −65.7 dBm，窗磁只有 −71.7 dBm，都低于 −62 dBm 的能量检测门限。摄像头的载波侦听根本看不见这些时隙。',
    } },
    { text: {
      en: 'So before each round the router sends itself a CTS: 14 octets at 6 Mb/s, 50 µs on the air, in a rate every station in the BSS can read. The round itself has not changed since lesson 1 — 50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs — of which the CTS-to-self’s Duration field covers the 4140 µs that follow it. The camera decodes 17 of the 20 and sets its NAV for the 4140 µs the Duration field asks for.',
      zh: '所以每个轮开始之前，路由器先给自己发一帧 CTS：14 个字节、6 Mb/s、占空口 50 µs，用的是 BSS 里人人都读得懂的速率。轮本身和第一课一样——50 + 10 + 618 + 4 × (10 + 528 + 10 + 330) = 4190 µs——其中 CTS-to-self 的 Duration 字段覆盖了它之后的 4140 µs。摄像头解出了二十帧里的十七帧，并按 Duration 的要求把 NAV 设了 4140 µs。',
    } },
    { text: {
      en: 'The other three are the interesting ones. In all three the camera’s own RTS starts at the same nanosecond as the CTS-to-self: a half-duplex radio that is talking cannot hear, and a station that never heard the Duration never sets a NAV. Protection in 802.11 is best-effort: the protecting frame contends like any other, and the station it is meant to silence may be mid-frame when it goes out.',
      zh: '有意思的是漏掉的那三帧。这三次，摄像头自己的 RTS 都和 CTS-to-self 在同一纳秒开始发送：半双工的射频在说话时就聋了，而从未听见 Duration 的终端自然不会设 NAV。802.11 的保护机制向来是尽力而为——保护帧和别的帧一样要参与竞争，而它想让其安静的那个终端，很可能正好也在发。',
    } },
    { text: {
      en: 'Nine camera frames start inside an uplink slot in the whole run — every one of them an RTS, every one of them in a round the camera never heard announced. The router answers none of them: it is running a round, and a round is not interruptible. That is eight CTS timeouts at the camera in the two seconds, and it doubles its contention window at each one.',
      zh: '整个运行里只有九帧摄像头的帧落进了上行时隙——无一例外都是 RTS，无一例外都发生在它没听见公告的那三个轮里。路由器一帧也没回应：它正在跑一个轮，而轮是不可打断的。于是两秒里摄像头记下了八次 CTS 超时，每一次都把自己的竞争窗口翻一倍。',
    } },
    { kind: 'table', heading: { en: 'Two seconds, four runs', zh: '两秒，四种跑法' }, head: [
      { en: 'Run', zh: '跑法' }, { en: 'Readings acked', zh: '读数被确认' },
      { en: 'Camera frames in a slot', zh: '落进时隙的摄像头帧' },
      { en: 'Camera', zh: '摄像头' }, { en: '5 GHz phone', zh: '5 GHz 手机' },
    ], rows: [
      [{ en: 'Wi-Fi only (no tags)', zh: '只有 Wi-Fi（没有标签）' }, N('—'), N('—'), N('105.29 Mb/s'), N('13.24 Mb/s')],
      [{ en: 'Polling, CTS-to-self', zh: '轮询 + CTS-to-self' }, N('29 / 40 (72.5 %)'), N('9'), N('99.89 Mb/s'), N('13.24 Mb/s')],
      [{ en: 'Polling, no protection', zh: '轮询 + 无保护' }, N('7 / 40 (17.5 %)'), N('79'), N('94.08 Mb/s'), N('13.24 Mb/s')],
      [{ en: 'CTS-to-self, poll every 20 ms', zh: 'CTS-to-self，每 20 ms 轮询' }, N('139 / 200 (69.5 %)'), N('33'), N('77.41 Mb/s'), N('13.24 Mb/s')],
    ] },
    { text: {
      en: 'Of the 40 responses the tags send, 29 come back acknowledged — 72.5 %. Eight are lost because both tags drew the same slot, four times in twenty rounds; the other three are lost to the camera, and all three fall in the rounds it never heard announced. Two tags in four slots leave most of the round empty: of the 80 slots, 44 are silent, 32 carry one response and 4 carry both.',
      zh: '标签一共送出 40 帧回应，29 帧拿到了确认——72.5 %。丢掉的十一帧里，八帧是两个标签抽到了同一个时隙，二十轮里发生了四次；另外三帧输给了摄像头，而且三次都落在它没听见公告的那几个轮里。两个标签分四个时隙，大部分时隙是空的：80 个时隙里 44 个安静无声，32 个装着一帧回应，4 个装着两帧。',
    } },
    { heading: { en: 'What the round costs', zh: '这个轮要花多少' }, text: {
      en: 'Each round reserves 4190 µs of every 100 ms — 4.19 % — but only 3044 µs of that is ever modulated: 30 440 µs a second, 3.044 % of the channel. The difference is the empty slots, reserved and paid for like the full ones.',
      zh: '每个轮都要在每 100 ms 里预留 4190 µs——4.19 %——但其中真正被调制到空口上的只有 3044 µs：每秒 30 440 µs，占信道的 3.044 %。差额就是那些空时隙：一样被预留、一样要付钱。',
    } },
    { kind: 'formula', text: {
      en: 'per round: 50 (CTS) + 618 (trigger) + 4 × 330 (Acks) = 1988 µs, + 2 × 528 (two responses) = 3044 µs',
      zh: '每轮：50（CTS）+ 618（触发帧）+ 4 × 330（Ack）= 1988 µs，再加 2 × 528（两帧回应）= 3044 µs',
    }, note: {
      en: 'The reservation is fixed by the slot plan; the air is what the tags actually use.',
      zh: '预留量由时隙规划决定，空口时间则取决于标签实际用了多少。',
    } },
    { text: {
      en: 'The camera gets 99.89 Mb/s through with the polling running and 105.29 Mb/s in the same flat with the tags taken away: it pays 5.13 % of its throughput for a round that spends 3.044 % of the air. The extra is the reservation, which silences the camera through the empty slots as well as the full ones, and the three rounds it walked into.',
      zh: '轮询开着时摄像头能送出 99.89 Mb/s，把标签从同一间屋子里拿掉后是 105.29 Mb/s：为了一个只占 3.044 % 空口时间的轮，它付出了 5.13 % 的吞吐。多出来的部分，一半来自预留——空时隙和满时隙一样让摄像头闭嘴——一半来自它一头撞进去的那三个轮。',
    } },
    { heading: { en: 'Take the protection away', zh: '把保护拿掉' }, text: {
      en: 'Take the CTS-to-self away and the camera never hears about the round at all: no NAV in the whole run, and 79 camera frames start inside an uplink slot instead of nine. Seven of the 40 responses survive — 17.5 %, against 72.5 % with the CTS-to-self — and the router records 25 receptions that failed with reason collision, against 3.',
      zh: '把 CTS-to-self 拿掉，摄像头就彻底不知道轮的存在了：整个运行里一次 NAV 都没设，落进上行时隙的摄像头帧从九帧涨到 79 帧。40 帧回应只活下来 7 帧——17.5 %，而有 CTS-to-self 时是 72.5 %——路由器记下了 25 次原因为 collision 的接收失败，而此前只有 3 次。',
    } },
    { text: {
      en: 'The camera does not win what the tags lose. Its RTS goes unanswered 78 times instead of 8, and its own throughput falls to 94.08 Mb/s — below the 99.89 Mb/s it managed while it was being kept out. Every RTS that lands in a slot buys the camera nothing and costs it a doubled contention window; the protection frame it resents was also keeping it from wasting its own airtime.',
      zh: '标签丢掉的，摄像头并没有赚到。它的 RTS 从八次无人应答变成 78 次，自己的吞吐反而跌到 94.08 Mb/s——比被“挡在门外”时的 99.89 Mb/s 还低。每一帧落进时隙的 RTS 都换不来任何东西，却要付出竞争窗口翻倍的代价；那帧看似碍事的保护帧，其实也在替它省下白白浪费的空口时间。',
    } },
    { heading: { en: 'Polling five times as often', zh: '把轮询频率提高五倍' }, text: {
      en: 'At 20 ms the same 4190 µs round reserves 20.95 % of the channel and its 3044 µs of PPDU become 152 200 µs a second, 15.22 %. The camera drops to 77.41 Mb/s — 26.49 % below the 105.29 Mb/s of the Wi-Fi-only run — while the tags do slightly worse per round than before: 139 of 200 responses acknowledged, 69.5 %. Five times the readings cost five times the airtime and rather more than five times the throughput.',
      zh: '轮询间隔改成 20 ms，同样 4190 µs 的轮就要预留信道的 20.95 %，其中 3044 µs 的 PPDU 变成每秒 152 200 µs，占 15.22 %。摄像头跌到 77.41 Mb/s——比只有 Wi-Fi 时的 105.29 Mb/s 低 26.49 %——而标签每轮的成绩还略有下滑：200 帧回应里确认了 139 帧，69.5 %。读数多五倍，空口时间就多五倍，吞吐损失还不止五倍。',
    } },
    { heading: { en: 'The other band never notices', zh: '另一个频段毫无察觉' }, text: {
      en: 'The phone is on the router’s 5 GHz radio, and it delivers exactly 2365 video frames — 13.24 Mb/s — in the base run, with no protection, at a 20 ms poll clock and with no AMP at all. Not one frame of difference: the two links share a router, not a channel, and the AP contends separately on each radio.',
      zh: '手机挂在路由器的 5 GHz 射频上。基础场景、无保护、20 ms 轮询、完全没有 AMP——四种跑法下它送达的视频帧都是 2365 帧，13.24 Mb/s，一帧不差。两条链路共享的是一台路由器，不是一条信道，AP 在每套射频上分别竞争。',
    } },
    { kind: 'list', heading: { en: 'Where to read it', zh: '在哪里看' }, items: [
      { en: 'The lanes: ap#2g and ap are the router’s two radios; cam#2g and the tags sit under the first, phone under the second.', zh: '泳道：ap#2g 和 ap 是路由器的两套射频；cam#2g 和两个标签在第一条下面，phone 在第二条下面。' },
      { en: 'The log: “AIFS wait until … [AC_BK]” before every round, “NAV set until … (cts:ap)” at the camera, “CTS timeout” when it walks into one.', zh: '日志里：每个轮之前的“AIFS wait until … [AC_BK]”，摄像头上的“NAV set until …（cts:ap）”，以及它撞进轮里时的“CTS timeout”。' },
      { en: 'The CTS-to-self: open it and read the Duration field — 4140 µs, exactly the round that follows.', zh: 'CTS-to-self：点开它读 Duration 字段——4140 µs，正好是后面那个轮。' },
    ] },
  ],
  scenario: () => ampCoexistScenario(),
  variants: [
    { label: { en: 'No protection', zh: '不加保护' }, scenario: () => ampCoexistScenario({ protection: 'none' }) },
    { label: { en: 'Poll every 20 ms', zh: '每 20 ms 轮询一次' }, scenario: () => ampCoexistScenario({ pollIntervalMs: 20 }) },
    { label: { en: 'Wi-Fi only: no tags, no polling', zh: '只有 Wi-Fi：没有标签，也没有轮询' }, scenario: () => ampCoexistScenario({ polling: false }) },
  ],
  jumps: [
    J('first CTS-to-self', '第一帧 CTS-to-self', txOf((r) => r.frame.kind === 'cts' && r.frame.dst === r.frame.src)),
    J('the camera’s first NAV from one', '摄像头第一次据此设置 NAV',
      (r) => r.type === 'NAV_SET' && r.node === 'cam#2g' && r.source === 'cts:ap'),
    J('first camera RTS the router never answers', '第一帧路由器没有回应的摄像头 RTS',
      (r) => r.type === 'CTS_TIMEOUT' && r.node === 'cam#2g'),
    J('first tag response the router could not acknowledge', '第一帧路由器无法确认的标签回应', firstAmpLost),
    J('first 5 GHz video frame', '第一帧 5 GHz 视频', txOf((r) => r.node === 'ap' && r.frame.kind === 'data')),
  ],
  observe: [
    { en: 'Jump to the first CTS-to-self at 0 µs and look at the camera’s lane: its RTS starts at the same instant, so it never decodes the announcement. Then jump to the camera’s first NAV, at 111.914 ms — the CTS-to-self of the second round — and watch it sit out the whole 4140 µs.', zh: '跳到 0 µs 的第一帧 CTS-to-self，看摄像头那条泳道：它的 RTS 在同一瞬间开始，所以这份公告它压根没解出来。再跳到摄像头第一次设 NAV 的时刻，111.914 ms——那是第二个轮的 CTS-to-self——看它老老实实地空等完整整 4140 µs。' },
    { en: 'Load the no-protection variant and jump to the first camera RTS the router never answers. Its RTS starts at 817 µs, inside slot 1 while a tag is answering; the router records an RX_FAIL with reason collision and the closing Ack names the router itself. Step forward: this now happens in nearly every slot of the run.', zh: '载入“不加保护”变体，跳到第一帧路由器没有回应的摄像头 RTS。它在 817 µs 开始发送，正落在时隙 1 里，而那时标签正在回应；路由器记下一条原因为 collision 的 RX_FAIL，收尾的 Ack 点名的是路由器自己。继续单步：整个运行里几乎每个时隙都在重演这一幕。' },
    { en: 'Select the phone and switch between the four runs. Its lane is byte-for-byte identical every time — 2365 frames, the first at 883.111 µs. The AP’s 2.4 GHz and 5 GHz radios contend separately, and the AMP round is invisible to anything not listening on 2.4 GHz.', zh: '选中手机，在四种跑法之间来回切换。它那条泳道每次都一模一样——2365 帧，第一帧在 883.111 µs。AP 的 2.4 GHz 与 5 GHz 射频各自独立竞争，AMP 的轮对不在 2.4 GHz 上收听的设备完全不可见。' },
  ],
  tryThis: [
    { en: 'Set protection to “none” in the editor’s AMP polling section, or load the no-protection variant, and compare the two runs. The acknowledged share falls from 72.5 % to 17.5 % and the camera frames landing inside a slot go from 9 to 79 — but look at the camera too: 78 unanswered RTS instead of 8, and 94.08 Mb/s instead of 99.89. Then work out why protecting the round made the unprotected station faster.', zh: '在编辑器的 AMP 轮询设置里把 protection 改成 “none”，或者直接载入“不加保护”变体，然后对比两次运行。确认率从 72.5 % 掉到 17.5 %，落进时隙的摄像头帧从 9 帧涨到 79 帧——但也别忘了看摄像头自己：无人应答的 RTS 从 8 次变成 78 次，吞吐从 99.89 Mb/s 掉到 94.08 Mb/s。然后想一想：为什么保护这个轮，反而让没被保护的那个终端更快了？' },
    { en: 'Drag the camera to (4, 5.6), 40 cm from the plant tag, and reload the no-protection variant: the camera now hears the tag’s own signal well above −62 dBm, defers on it, and the router records not one collision instead of 25. 26 readings are acknowledged where 7 were. The price is five rounds in which a tag, deafened by the camera beside it, never answers at all — carrier sense protects the slot only for whoever can hear it.', zh: '把摄像头拖到 (4, 5.6)，离植物标签只有 40 cm，再载入“不加保护”变体：摄像头现在能听见标签的信号，而且远高于 −62 dBm，于是乖乖退避，路由器记下的碰撞从 25 次变成一次也没有，被确认的读数从 7 个涨到 26 个。代价是有五个轮里，某个标签被身旁的摄像头吵聋，干脆一声不吭——载波侦听只能保护那些听得见的人。' },
  ],
  quiz: [
    {
      q: { en: 'Why does the AMP round go out on average 5.17 ms after the poll clock says it is due?', zh: '为什么 AMP 的轮平均要比轮询时钟“到点”晚 5.17 ms 才发出去？' },
      options: [
        { en: 'The trigger frame takes 5.17 ms to build at 250 kb/s', zh: '250 kb/s 下构造触发帧本身就要 5.17 ms' },
        { en: 'It contends on AC_BK, whose AIFS is 73 µs against the camera’s 37 µs, and it must wait for a busy channel like anything else', zh: '它在 AC_BK 上竞争，AIFS 是 73 µs，而摄像头是 37 µs；信道忙时它和别人一样得等' },
        { en: 'The AP delays it deliberately so the tags have time to harvest energy', zh: 'AP 故意推迟，好让标签有时间收集能量' },
      ],
      answer: 1,
      explain: { en: 'AC_BK waits 10 + 7 × 9 = 73 µs where AC_BE waits 37 µs, so on a busy channel the camera reaches zero first again and again. The poll interval is a wish, not a schedule.', zh: '这个轮就是 EDCA 功能争到的一次帧交换序列。AC_BK 要等 10 + 7 × 9 = 73 µs，AC_BE 只等 37 µs，信道一忙，摄像头就一次次先把退避数到零。轮询间隔是愿望，不是时间表。' },
    },
    {
      q: { en: 'The CTS-to-self goes out before all 20 rounds, yet the camera sets a NAV for only 17. Why?', zh: '二十个轮前面都发了 CTS-to-self，摄像头却只设了十七次 NAV。为什么？' },
      options: [
        { en: 'Its NAV was already running from the previous round', zh: '它的 NAV 还停留在上一个轮里没有到期' },
        { en: 'In those three rounds the camera was transmitting its own RTS at that instant, and a half-duplex radio cannot decode while it talks', zh: '那三次摄像头正好在同一瞬间发自己的 RTS，而半双工的射频在发送时无法解调' },
        { en: 'The CTS-to-self is sent at 6 Mb/s, which an 802.11ax station cannot decode', zh: 'CTS-to-self 用 6 Mb/s 发送，802.11ax 终端解不出来' },
      ],
      answer: 1,
      explain: { en: 'All three start at the same nanosecond as an RTS from the camera. Protection is a frame like any other: it contends, and it can be missed by the very station it was meant for.', zh: '漏掉的三帧 CTS-to-self，每一帧都和摄像头的一帧 RTS 在同一纳秒开始。保护帧也是帧：它要参与竞争，也完全可能被它本想保护的那个终端错过。' },
    },
    {
      q: { en: 'Polling every 20 ms instead of every 100 ms costs the camera 26.49 % of its throughput. What did the 5 GHz phone lose?', zh: '把轮询从 100 ms 改成 20 ms，摄像头损失了 26.49 % 的吞吐。5 GHz 的手机损失了多少？' },
      options: [
        { en: 'Nothing at all: it delivers the same 2365 frames in every run', zh: '一点也没有：四种跑法下它都送达同样的 2365 帧' },
        { en: 'About a fifth of the camera’s loss, because the AP’s queues are shared', zh: '大约是摄像头损失的五分之一，因为 AP 的队列是共享的' },
        { en: '26.49 % as well: the AP can only transmit on one radio at a time', zh: '同样是 26.49 %：AP 一次只能用一套射频发送' },
      ],
      answer: 0,
      explain: { en: 'The AP is a member of both links and contends on each separately, so the phone’s 5 GHz lane is identical in all four runs.', zh: 'AP 同时是两条链路的成员，在每条上分别竞争。AMP 的轮只占用 2.4 GHz；手机的 5 GHz 泳道在基础场景、无保护、20 ms 轮询和完全没有 AMP 时都一模一样。' },
    },
  ],
}
