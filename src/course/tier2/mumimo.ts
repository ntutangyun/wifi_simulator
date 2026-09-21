/**
 * Wi-Fi Tier 2 · M7 · Scheduled Wi-Fi 6/7 · MU-MIMO against OFDMA.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): dividing
 * space instead of frequency, why the access point has to learn where each
 * phone is before it can, why the group here is never three, and when one beats
 * the other. Where the trimmed phone turns up next and the engine's own
 * grouping rule live in `deeper`; the idealisations live in `sources`.
 *
 * The scenario builder and the two variants are unchanged, so the recorded
 * timeline hashes in tests/fixtures/lesson-hashes.json stay byte-identical.
 * Every number quoted below is pinned in tests/course/mumimo.test.ts and in
 * tests/course/quoted-timestamps.test.ts.
 */
import { type Lesson, N, firstData, firstBa, firstMuDl, J } from '../lessonKit'
import { mumimoScenario } from '../wifiScenes'

export const mumimo: Lesson = {
  id: 'mumimo',
  module: 6,
  title: { en: 'MU-MIMO — splitting by space instead of frequency', zh: 'MU-MIMO——按空间而不是按频率划分' },
  why: {
    en: 'Cutting the channel into slices lets one send reach several phones, but every slice is a fraction of the channel, so each phone is served more slowly the more of them join. There is another way to fit them in, which costs nobody any bandwidth and asks for something else instead. This lesson puts the two side by side in the same house and asks which one you would want.',
    zh: '把信道切成片，一次发送就能照顾到好几部手机，但每一片都只是整条信道的一部分，成员越多，每部手机被服务得越慢。其实还有另一种把大家塞进同一次发送的办法：它不让任何人让出带宽，而是要走别的东西。这一课把两种办法放进同一栋房子里并排比较，看看你会挑哪一种。',
  },
  outcomes: [
    { en: 'say what MU-MIMO divides up, and what it does not', zh: '说出 MU-MIMO 切分的是什么、不切分的又是什么' },
    { en: 'say why a router must measure the room before it can use it', zh: '说出路由器为什么必须先把房间量一遍，才用得了这个办法' },
    { en: 'read both variants off the timeline and say which suits small frames and which suits large ones', zh: '在时间轴上读出两个变体，并说出小帧适合哪一种、大帧适合哪一种' },
  ],
  needs: ['streams', 'ofdma-dl'],
  terms: [
    { term: 'MU-MIMO', plain: {
      en: 'serving several devices in one send by aiming a separate set of spatial streams at each, instead of by giving each a slice of the channel',
      zh: '在一次发送里服务多台设备的另一种办法：给每台瞄准各自的一组空间流，而不是给每台分一片信道',
    } },
    { term: 'beamforming', plain: {
      en: 'sending the same signal from several antennas with small delays, so that it adds up at one place and cancels itself at another',
      zh: '用多根天线发同一个信号，彼此错开一点点，使它在某个位置叠加变强、在另一个位置互相抵消',
    } },
    { term: 'sounding', plain: {
      en: 'the measurement beforehand: the router sends a known pattern and each device reports back what it heard',
      zh: '事先的那次测量：路由器发出一段已知的图案，每台设备把自己听到的样子报回来',
    } },
  ],
  picture: [
    { heading: { en: 'Divide the space, not the channel', zh: '切空间，而不是切信道' }, text: {
      en: 'Slicing hands each member a fraction of the sub-carriers, so each is served at a fraction of the rate. There is another axis to divide. Give every member the whole channel, but aim a different set of spatial streams at each one, and nobody gives up any bandwidth at all: the members are told apart by where they are rather than by which tones they use. That is MU-MIMO.',
      zh: '切片的做法，是把子载波分给每个成员一部分，于是每个成员也只拿到速率的一部分。但可以切的不止这一个维度。换成：每个成员都拿到整条信道，只是给每台瞄准不同的一组空间流——这样谁也不必让出带宽，区分成员靠的是它们在哪儿，而不是它们用哪些音调。这就是 MU-MIMO。',
    } },
    { heading: { en: 'Which means knowing where everyone is', zh: '但这要求知道每个人在哪儿' }, text: {
      en: 'Aiming is not pointing a dish. The same signal leaves several antennas with small delays chosen so that it adds up at one phone and cancels itself at the next — beamforming. To choose those delays the router first has to measure the room: it sends a known pattern and every phone reports back what it heard, which is sounding. Furniture moves, people move, and a stale measurement aims at where a phone used to be.',
      zh: '所谓“瞄准”，并不是转动一口天线锅。同一个信号从多根天线发出去，彼此错开一点点，而这个“一点点”被挑得恰到好处：让它在某部手机处叠加，在另一部手机处互相抵消——这就是波束成形。而要挑出这些延迟，路由器得先把房间量一遍：它发出一段已知的图案，每部手机把听到的样子报回来，这就是探测。家具会挪，人会走动，量得太旧的结果，瞄准的只是手机从前待过的地方。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Go and look', zh: '去看一眼' }, text: {
      en: 'Load the simulation and jump to the first send that carries more than one phone. Step between the two variants above the timeline: the same house, the same traffic, the same phones — and a wide block that holds three parts in one and two in the other.',
      zh: '载入仿真，跳到第一个同时装着多部手机的发送。在时间轴上方的两个变体之间切换：同一栋房子、同样的流量、同样的手机——只是那个宽块在一边装着三份，在另一边只装两份。',
    } },
    { heading: { en: 'Why the group is never three here', zh: '这里的分组为什么永远不是三个' }, text: {
      en: 'Aiming costs antennas. Every member’s spatial streams have to be carried by the router’s own, so a group is capped by the antenna count: this router has four, each phone negotiated two, and two phones already use all four. A third would need six. Slicing has no such limit — all three fit on their own slices — so where space runs out, frequency keeps going.',
      zh: '瞄准是要拿天线换的。每个成员的空间流都得由路由器自己的天线扛着，所以一个组能有多大，上限就是它的天线数：这台路由器有四根，每部手机协商到两条流，两部手机就把四根占满了。第三部还得再要六条。切片没有这道坎——三部手机各占一片都塞得下——所以空间用尽的地方，频率还走得下去。',
    } },
    { heading: { en: 'Which one wins', zh: '谁赢' }, text: {
      en: 'Space multiplies the rate, which only pays when there are enough data symbols to multiply. Frequency divides the fixed opening of a send, which pays most when there are hardly any. So many small frames belong in slices, a few large ones belong in beams — and the fixed opening, which neither trick shortens, quietly dilutes whatever either of them wins.',
      zh: '空间是把速率乘上去，只有当数据符号本来就够多时，这一乘才划算。频率是把一次发送里那段固定开场摊薄，而在数据符号本来就没几个时，这一摊最划算。所以许多小帧该去分片，少数几个大帧该去分波束——而那段谁也缩不短的固定开场，则在背后默默稀释着两边各自赢来的东西。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: {
      en: 'One send of each kind, from the two variants of this house — 160 MHz, two streams each',
      zh: '两种发送各取一次，都来自这栋房子的两个变体——160 MHz，每部手机两条流',
    }, head: [
      { en: 'Variant', zh: '变体' }, { en: 'Members', zh: '成员数' }, { en: 'Payload each', zh: '每成员负载' },
      { en: 'Data symbols', zh: '数据符号' }, { en: 'Send length', zh: '整帧长度' }, { en: 'Rate per member', zh: '单成员速率' },
    ], rows: [
      [N('OFDMA'), N('3'), N('4,306 B'), N('3'), N('92.8 µs'), N('371.2 Mb/s')],
      [N('MU-MIMO'), N('2'), N('4,306 B'), N('1'), N('65.6 µs'), N('525.1 Mb/s')],
    ] },
    { kind: 'formula', heading: { en: 'Where a send’s length comes from', zh: '一次发送的长度是怎么来的' }, text: {
      en: 'send length = 52 µs + 13.6 µs × data symbols',
      zh: '整帧长度 = 52 µs + 13.6 µs × 数据符号数',
    }, note: {
      en: 'The 52 µs is a Wi-Fi 7 frame’s 48 µs front plus the same 4 µs map. On its third of the sub-carriers an OFDMA member needs three data symbols where a MU-MIMO member needs one — exactly the threefold gain of the group MU-MIMO gave up. End to end it is only 1.41 times, because the opening never shrinks.',
      zh: '这里的 52 µs，是 Wi-Fi 7 帧的 48 µs 开场加上同样那张 4 µs 的“这一发里有谁”分配表。OFDMA 的成员只占三分之一子载波，同样的负载要三个数据符号；MU-MIMO 的成员独占整条信道，只要一个——干净的三倍增益，正好等于 MU-MIMO 放弃掉的那个组的大小。可整帧算下来只差 1.41 倍，因为开场那一段从不缩短。',
    } },
    { heading: { en: 'The combined load is the other way round', zh: '合起来交付的量，方向正相反' }, text: {
      en: 'Both sends carry the same payload per member — three video frames the router had saved up for that phone. Three members deliver 12,918 bytes in one send against two members’ 8,612, so the wider group moves more in one go while the narrower one serves each member faster. Which of those you want depends on whether anybody is waiting.',
      zh: '两种发送里，每个成员的负载是一样的——都是路由器给那部手机攒下的三个视频帧。三个成员一次交付 12,918 字节，两个成员是 8,612 字节：成员多的那次一趟运得更多，成员少的那次则让每个成员更快拿到自己的东西。你要哪一个，取决于有没有人在等。',
    } },
  ],
  deeper: [
    { heading: { en: 'Where the trimmed phone turns up next', zh: '被裁掉的那部手机接下来去哪儿了' }, text: {
      en: 'Whenever MU-MIMO is possible the router trims the group to two candidates and serves the third separately — but "separately" is worth measuring rather than guessing. Over the 196 two-member sends of this run, the trimmed phone gets its own single-user send immediately afterwards 122 times (62%), turns up in whichever pairing forms next 65 times (33%), and neither of those 9 times (5%): the router simply reached the other two again first, and it waited another round.',
      zh: '只要 MU-MIMO 可行，路由器就把组裁到两个候选，第三部单独服务——但“单独服务”究竟是怎么个服务法，值得实测而不是猜。这段仿真里的 196 次两成员发送中，被裁掉的那部手机有 122 次（62%）紧接着就拿到属于自己的单用户发送，有 65 次（33%）出现在下一次组成的配对里，还有 9 次（5%）两样都不是：路由器又先轮到了另外那两部，它只好再等一轮。',
    } },
    { kind: 'steps', heading: { en: 'The rule this simulator picks by', zh: '仿真器据以选择的规则' }, items: [
      { en: 'The router and the phone must have negotiated the sliced-channel capability first: without it neither multi-user path can fire at all, and every phone is served one at a time however full the queue gets.', zh: '路由器和手机必须先协商好“切片信道”这项能力：没有它，两条多用户路径都不可能触发，无论队列多满，每部手机都只能一个一个地被服务。' },
      { en: 'Given that, MU-MIMO fires instead only when every candidate also negotiates MU-MIMO and has at least 1,000 bytes queued at its head — a threshold big enough that dividing space is worth the trouble.', zh: '在此基础上，只有当每个候选也都协商了 MU-MIMO、并且队首至少排着 1,000 字节时，才会改用 MU-MIMO——这个门槛足够大，切分空间才值得。' },
      { en: 'The router then trims the group from the end, one member at a time, until the survivors’ stream counts fit its own four; if fewer than two survive, it falls back to slices.', zh: '然后路由器从末尾开始一个一个地裁，直到幸存者的流数之和不超过自己的四条；如果幸存者不足两个，就整个退回切片。' },
    ] },
    { heading: { en: 'What the two variants actually differ in', zh: '两个变体真正的差别' }, text: {
      en: 'Exactly one feature flag: MU-MIMO, on the phones and the router. The sliced-channel capability is never touched, because turning that off would not produce "more slicing" — it would produce no multi-user sends of either kind, and the comparison would have nothing left in it.',
      zh: '只差一个功能开关：MU-MIMO，手机和路由器上都是。“切片信道”那项能力从未被动过，因为把它关掉不会得到“更纯粹的切片”——那会得到两种多用户发送都没有的结果，比较也就无从谈起了。',
    } },
  ],
  sources: [
    { en: 'MU-MIMO is the older of the two ideas compared here: downlink MU-MIMO arrived with Wi-Fi 5 (802.11ac), and Wi-Fi 6 added OFDMA and extended multi-user sends to the uplink. This simulator models multi-user sends for Wi-Fi 6 and 7 only.',
      zh: '这里比较的两个想法里，MU-MIMO 是更老的那个：下行 MU-MIMO 随 Wi-Fi 5（802.11ac）到来，而 Wi-Fi 6 才加入 OFDMA，并把多用户发送扩展到上行。本仿真器只为 Wi-Fi 6 和 7 模拟多用户发送。' },
    { en: 'Downlink MU-MIMO, the sounding sequence it depends on (NDP Announcement, NDP, compressed beamforming report) and the per-user fields of the MU PPDU are Clause 27 of IEEE Std 802.11-2024 for Wi-Fi 6 and Clause 36 for Wi-Fi 7.',
      zh: '下行 MU-MIMO、它所依赖的探测流程（NDP 通告、NDP、压缩波束成形报告）以及 MU PPDU 的每用户字段，Wi-Fi 6 见 IEEE Std 802.11-2024 第 27 章，Wi-Fi 7 见第 36 章。' },
    { en: 'This simulator runs no sounding exchange and charges nothing for one: it assumes the aim is already perfect, which is a model choice. A real transmitter also splits its power across the group and never nulls the other members exactly, so each member’s signal quality — and with it its rate — does fall somewhat.',
      zh: '本仿真器不真的跑探测流程，也不为它计任何开销：它假设瞄准已经完美，这是模型取值。真实的发射机还要把功率分给组内各成员，对其他成员的置零也不可能精确，所以每个成员的信号质量、连带它的速率，实际上都会有所下降。' },
    { en: 'The 48 µs preamble, the extra 4 µs of multi-user signalling and the 13.6 µs symbol are this simulator’s single representative values for an 802.11be PPDU; the 1,000-byte threshold and the four-member cap are the engine’s own (mac.ts), not the standard’s.',
      zh: '48 µs 前导、多用户信令多出的 4 µs 以及 13.6 µs 符号，是本仿真器为 802.11be PPDU 取的代表值；1,000 字节的门槛与四成员上限则是引擎自己的规定（mac.ts），并非标准正文。' },
  ],
  scenario: () => mumimoScenario(false),
  variants: [
    { label: { en: 'OFDMA (split by frequency)', zh: 'OFDMA（按频率划分）' }, scenario: () => mumimoScenario(false) },
    { label: { en: 'MU-MIMO (split by space)', zh: 'MU-MIMO（按空间划分）' }, scenario: () => mumimoScenario(true) },
  ],
  jumps: [
    J('first multi-user send', '第一次多用户发送', firstMuDl),
    J('first data frame', '第一个数据帧', firstData),
    J('first BlockAck', '第一个 BlockAck', firstBa),
  ],
  observe: [
    { en: 'In the first variant, hover the wide blue block: three parts inside, one per phone, each at a third of the channel and 371.2 Mb/s. In the second the same block holds two, each on the whole channel at 525.1 Mb/s.', zh: '在第一个变体里，把鼠标停在那个宽蓝块上：里面三份，每部手机一份，各占三分之一条信道，速率 371.2 Mb/s。第二个变体里，同样的块只装两份，各自独占整条信道，速率 525.1 Mb/s。' },
    { en: 'Follow the phone left out of a pair. Most often a send of its own follows immediately; sometimes it appears in the next pairing instead; now and then neither happens and it waits another round. Which phone is left out is not fixed.', zh: '盯住被排除在配对之外的那部手机。多数时候紧接着就有一个属于它自己的发送；有时它出现在下一次配对里；偶尔两样都没有，它得再等一轮。被排除的是哪一部并不固定。' },
    { en: 'In both variants every member’s part ends in the same instant, and one gap later a single round of acknowledgement settles the whole group — unless the laptop talked over the send, which happens to a few of them.', zh: '两个变体里，每个成员的那一份都在同一瞬间结束，隔一小段，一轮确认就把整组了结——除非笔记本压着这次发送说了话，这样的情况只有几次。' },
  ],
  tryThis: [
    { en: 'Add a fourth phone in the editor. The slicing variant absorbs it and the groups become four members on quarter-width slices; add a fifth and the group stops growing, because this engine caps a group at four. The MU-MIMO variant never grows past two whatever you add.', zh: '在编辑器里加上第四部手机。切片那个变体会把它吸收进来，分组变成四个成员、每人四分之一片；再加第五部，分组就不再长大了，因为本引擎把一组封顶在四个。而无论你加多少部，MU-MIMO 那个变体都长不过两个。' },
    { en: 'Turn the laptop’s backup traffic off and reload. The router now drains each phone’s video before the next one lands, and multi-user sends of either kind become rare: there is nothing left to group.', zh: '关掉笔记本的备份流量再重新载入。路由器现在能在下一个视频包到达之前就把当前这部手机的包送完，于是两种多用户发送都变得罕见——已经没有什么可以凑成一组了。' },
  ],
  quiz: [
    {
      q: { en: 'Three phones, one send. Under slicing, what happens to each phone’s rate when a fourth joins?', zh: '三部手机，一次发送。在切片的办法下，再加入第四部之后，每部手机的速率会怎样？' },
      options: [
        { en: 'It falls — the channel is divided one way further', zh: '下降——信道又被多分了一份' },
        { en: 'It stays the same — every member gets the whole channel', zh: '不变——每个成员都拿到整条信道' },
        { en: 'It rises — more members mean less overhead each', zh: '上升——成员越多，每人分摊的开销越少' },
      ],
      answer: 0,
      explain: { en: 'Slicing members share the sub-carriers, not the time: a fourth member makes everybody’s slice thinner. That is exactly the cost MU-MIMO refuses to pay, and it pays in antennas instead.', zh: '切片的成员分享的是子载波，而不是时间：多一个成员，每个人的那一片都更薄。这正是 MU-MIMO 不肯付的代价，它改用天线来付。' },
    },
    {
      q: { en: 'Why can a four-antenna router not serve three two-stream phones with MU-MIMO at once?', zh: '为什么一台四天线的路由器不能用 MU-MIMO 同时服务三部两流手机？' },
      options: [
        { en: 'Three aimed signals would collide with each other in the air', zh: '三路瞄准的信号会在空口里互相碰撞' },
        { en: 'Their streams would sum to six, half as many again as the router has', zh: '它们的流数加起来是六条，比路由器拥有的多出一半' },
        { en: 'A MU-MIMO group is always limited to two members', zh: 'MU-MIMO 分组永远只能有两个成员' },
      ],
      answer: 1,
      explain: { en: 'Each phone negotiated two streams and two phones already use all four. The group is trimmed until it fits, which here lands on two — and the third phone is served on its own.', zh: '每部手机协商到两条流，两部手机就用满了全部四条。分组会一直被裁到塞得下为止，这里正好落在两个——第三部手机则被单独服务。' },
    },
  ],
}
