/**
 * Wi-Fi Tier 2 · M7 · Scheduled Wi-Fi 6/7 · One device, two radios, two bands.
 *
 * Rewritten to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md): a second
 * door on a second band, what the two links keep apart and what they share,
 * what the second door buys its owner and its neighbour, and what happens the
 * moment the neighbour has one too. The single-radio form of MLO and the other
 * band pairings are in `deeper`; the clause numbers are in `sources`.
 *
 * The scenario builder is unchanged and there are no variants, so the recorded
 * timeline hash in tests/fixtures/lesson-hashes.json stays byte-identical.
 * Every number quoted below is pinned in tests/course/mlo.test.ts.
 */
import { type Lesson, oneRoom, node, sc, txOf, first6g, N, J } from '../lessonKit'
import { linkOfVirtual } from '../../model/caps'

export const mlo: Lesson = {
  id: 'mlo',
  module: 6,
  title: { en: 'MLO — one queue, two radios', zh: 'MLO——一条队列，两台电台' },
  why: {
    en: 'A radio that has joined a band is stuck with whatever is happening on it. If the neighbours on that band are busy, every frame of yours waits behind theirs, however quiet the band next door happens to be. Wi-Fi 7 lets one device keep two radios awake on two bands at the same moment and feed both from a single pile of waiting frames, so a frame leaves by whichever door opens first. This lesson shows what that second door buys, what it does not, and how this simulator draws it.',
    zh: '一台电台一旦落在某个频段上，就只能认命于这个频段上正在发生的一切。这个频段上的邻居忙，你的每一帧就得排在人家后面——哪怕隔壁那个频段一直空着。Wi-Fi 7 允许一台设备同时让两台电台醒着，分别待在两个频段上，并且由同一堆待发的帧一起喂它们：哪扇门先开，帧就从哪扇门出去。这一课讲清楚：这第二扇门买到了什么、没买到什么，以及本模拟器是怎么把它画出来的。',
  },
  outcomes: [
    { en: 'say what a device with two radios shares between them and what it keeps apart', zh: '说出一台有两台电台的设备，在两者之间共享了什么、又把什么各管各的' },
    { en: 'read one device’s two lanes off the timeline and say which band carried the work', zh: '在时间轴上读出同一台设备的两条泳道，并说出活儿是哪个频段干的' },
    { en: 'price the second radio: who it helps, and for how long', zh: '给第二台电台标价：它帮了谁，又能帮多久' },
  ],
  needs: ['retries-queues', 'txop-protect', 'width'],
  terms: [
    { term: 'link', plain: {
      en: 'one radio on one band, with its own channel and its own turn-taking',
      zh: '一个频段上的一台电台，有自己的信道，自己排自己的队',
    } },
    { term: 'MLO', plain: {
      en: 'multi-link operation: running two links of one device together, fed from one pile of frames',
      zh: '多链路操作：把一台设备的两条链路一起跑起来，由同一堆帧来喂',
    } },
    { term: 'MLD', plain: {
      en: 'the device as a whole, above its links — where that shared pile of frames lives',
      zh: '链路之上的整台设备——那堆共享的帧就放在这一层',
    } },
  ],
  picture: [
    { heading: { en: 'Two doors instead of one', zh: '从一扇门变成两扇门' }, text: {
      en: 'A radio that has joined a band is tied to it. When the neighbours on that band are busy, every frame of yours queues behind theirs, however quiet the band next door happens to be. Wi-Fi 7 lets one device hold two radios awake at the same moment, on two different bands. Each radio, with its own channel and its own turn-taking, is a link; running the pair of them together is MLO.',
      zh: '一台电台加入了哪个频段，就被拴在哪个频段上。这个频段的邻居一忙，你的每一帧都得排在人家后面——隔壁那个频段再空也没用。Wi-Fi 7 让一台设备可以在同一时刻让两台电台都醒着，各待在一个频段上。每一台电台都有自己的信道、自己的排队过程，这就是一条链路；把两条链路一起跑起来，就是 MLO。',
    } },
    { kind: 'watch', jump: 1, heading: { en: 'Go and look', zh: '去看一眼' }, text: {
      en: 'Load the simulation and jump to the first 6 GHz data frame. The laptop has two lanes on the timeline, the second of them marked ·6G, and blocks are landing on both at once. Then look at the neighbour below it: one lane, one band, and that band is full.',
      zh: '载入仿真，跳到第一个 6 GHz 数据帧。笔记本在时间轴上有两条泳道，第二条标着 ·6G，两条上同时都在落方块。再看它下面那台邻居：一条泳道，一个频段，而这个频段是满的。',
    } },
    { heading: { en: 'What the two links share', zh: '两条链路共享的是什么' }, text: {
      en: 'They do not share a channel, a turn or a countdown: each link listens, waits and retries entirely on its own, exactly as a single-radio device would. What sits above them is one pile of frames waiting to be sent, held by the device as a whole — the MLD. Whichever link wins the air first takes the next frames off that pile.',
      zh: '它们不共享信道，不共享发送机会，也不共享那个倒数：每条链路自己听、自己等、自己重传，和一台只有单电台的设备完全一样。真正放在它们之上的，是一堆等着发的帧，归整台设备所有——也就是 MLD。哪条链路先抢到空口，就先从这堆帧里领走下一批。',
    } },
    { heading: { en: 'What the second door buys', zh: '第二扇门买到了什么' }, text: {
      en: 'Because the pile is shared, the work flows to whichever band is free. In this flat the neighbour fills 5 GHz and nobody at all is using 6 GHz, so the laptop’s frames drift across: most of them leave by the quiet door. Nothing was scheduled and nothing was measured. The frames simply went where a turn came up first.',
      zh: '因为这堆帧是共享的，活儿就自然流向哪个频段空着。在这个房间里，邻居把 5 GHz 占满了，而 6 GHz 上一个人也没有，于是笔记本的帧就往那边漂：大部分都从那扇安静的门出去了。没有谁去调度，也没有谁去测量，帧只是去了先轮到它的那一边。',
    } },
    { heading: { en: 'What it does not buy', zh: '它没有买到什么' }, text: {
      en: 'A second link does not create air. It only lets its owner reach a band the neighbours are not in — and only for as long as they stay out of it. Give the neighbour the same pair of radios and the quiet door fills up: both devices then spread their work across both bands, and each carries less than the single MLO device carried on its own.',
      zh: '第二条链路并不会凭空造出空口时间。它只是让自己的主人够得着一个邻居还没进去的频段——而且只在邻居还没进去的这段时间里有效。把同样的两台电台也给邻居装上，那扇安静的门就被填满了：两台设备都把活儿摊到两个频段上，于是每一台拿到的，都比当初那台独苗 MLO 设备拿到的少。',
    } },
    { heading: { en: 'What this simulator models', zh: '本模拟器模拟的是哪一种' }, text: {
      en: 'Here both radios may transmit at the same instant, which is the arrangement a router, or a laptop with room for two radios inside it, actually uses. The two lanes, the ·6G mark and the wireframe spheres of the 3D view are simply those two links drawn apart, because apart is what they are.',
      zh: '在这里，两台电台可以在同一瞬间各自发送——路由器，或者机箱里塞得下两台电台的笔记本，用的正是这种形态。时间轴上的两条泳道、那个 ·6G 标记，以及 3D 视图里的线框球，不过是把这两条链路分开画出来而已；它们本来就是分开的。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: {
      en: 'Where the laptop’s work went, in the first 300 ms',
      zh: '最初 300 ms 里，笔记本的活儿去了哪边',
    }, head: [
      { en: 'Lane', zh: '泳道' }, { en: 'Data frames', zh: '数据帧' },
      { en: 'Airtime of those frames', zh: '这些帧占用的空口时间' }, { en: 'Share of that band’s clock', zh: '占该频段时钟的比例' },
    ], rows: [
      [N('5 GHz'), N('67'), N('53.9 ms'), N('18.3%')],
      [N('6 GHz'), N('240'), N('249.6 ms'), N('84.2%')],
    ] },
    { heading: { en: 'Not the faster radio — the emptier one', zh: '不是更快的那台电台，是更空的那个频段' }, text: {
      en: 'Both links run at the same rung, MCS 13, and the same 172.1 Mb/s. The second radio is not quicker than the first; it is the one with nobody else on it. Four of every five of the laptop’s frames leave that way, and they take almost five times as much air with them as the frames that stayed behind.',
      zh: '两条链路跑的是同一级：MCS 13，同样的 172.1 Mb/s。第二台电台并不比第一台快，它只是那个没有别人的频段。笔记本每五帧里有四帧从那边走，带走的空口时间差不多是留在原地那些帧的五倍。',
    } },
    { kind: 'table', heading: { en: 'The same 300 ms with MLO switched off', zh: '同样的 300 ms，把 MLO 关掉' }, head: [
      { en: 'Measured on', zh: '测量对象' }, { en: 'MLO on', zh: 'MLO 开' }, { en: 'MLO off', zh: 'MLO 关' },
    ], rows: [
      [{ en: 'Laptop data frames', zh: '笔记本的数据帧' }, N('307'), N('116')],
      [{ en: 'Laptop mean wait before sending (5 GHz / 6 GHz)', zh: '笔记本发送前的平均等待（5 GHz / 6 GHz）' }, N('1.29 / 1.54 ms'), N('3.25 ms')],
      [{ en: 'Neighbour data frames', zh: '邻居的数据帧' }, N('185'), N('116')],
      [{ en: 'Neighbour mean wait before sending', zh: '邻居发送前的平均等待' }, N('2.58 ms'), N('4.18 ms')],
    ] },
    { heading: { en: 'The neighbour gained too', zh: '邻居也跟着占了便宜' }, text: {
      en: 'Switching the second link off does not hand the neighbour its band back — it takes air away from it. With one lane the laptop has to fight for 5 GHz frame by frame, and the two stations end up on the same count apiece. The second radio was the cheapest thing in this room: it moved a heavy uploader out of everybody’s way.',
      zh: '把第二条链路关掉，并不是把频段还给邻居，反而是从邻居那里抢走了空口时间。只剩一条泳道，笔记本就得在 5 GHz 上一帧一帧地抢，最后两台站点各自发出的帧数一样多。第二台电台是这个房间里最便宜的东西：它把一个重载上传的家伙从大家的路上挪开了。',
    } },
    { kind: 'table', heading: { en: 'Give the neighbour two radios as well', zh: '把两台电台也给邻居装上' }, head: [
      { en: 'Lane', zh: '泳道' }, { en: 'Laptop frames', zh: '笔记本的帧' }, { en: 'Neighbour frames', zh: '邻居的帧' },
    ], rows: [
      [N('5 GHz'), N('122'), N('132')],
      [N('6 GHz'), N('136'), N('106')],
    ] },
    { heading: { en: 'When everybody has two doors', zh: '当所有人都有两扇门' }, text: {
      en: 'The lean vanishes: the laptop now splits its work almost evenly between the bands, and its own total falls from 307 frames to 258. A second link is worth exactly as much as the second band is empty — which is a statement about the neighbours, not about the device.',
      zh: '那种“偏向”消失了：笔记本现在把活儿几乎平均地分在两个频段上，而它自己的总量从 307 帧掉到 258 帧。第二条链路值多少钱，完全取决于第二个频段有多空——这句话说的是邻居，不是这台设备。',
    } },
  ],
  deeper: [
    { heading: { en: 'The cheaper arrangement most phones use', zh: '多数手机用的那种更便宜的形态' }, text: {
      en: 'Two radios transmitting at once is only one form of MLO, and the expensive one. A phone more often runs EMLSR: several links are set up and listened on, but only one of them transmits at any instant, so the device pays for one transmit chain and still gets to answer on whichever link the router used. The pairing need not be 5 and 6 GHz either — 2.4 + 5 GHz is common on cheaper hardware. This simulator models the simultaneous two-radio form only, so every number above is the best case a second link can give.',
      zh: '两台电台同时发送，只是 MLO 的一种形态，而且是贵的那种。手机上更常见的是 EMLSR：建立并监听多条链路，但任一时刻只有一条在发送，于是设备只需为一套发射通道买单，却仍然能在路由器用的那条链路上作答。配对也不一定是 5 GHz 加 6 GHz——便宜的硬件上 2.4 + 5 GHz 很常见。本模拟器只模拟双电台同时收发这一种形态，所以上面每一个数字，都是第二条链路所能给出的最好情况。',
    } },
    { heading: { en: 'Why a failure on one link can be retried on the other', zh: '为什么一条链路上的失败可以由另一条重传' }, text: {
      en: 'A frame that has been sent but not acknowledged is still in the shared pile: nothing at the MLD level marks it as belonging to the link that tried it. So the next retry is taken by whichever link is free, which is why a device whose 5 GHz link is being hammered by a neighbour does not accumulate a backlog there — the backlog is the other link’s work too.',
      zh: '一帧发出去了却没等到确认，它依然在那堆共享的帧里：MLD 这一层并没有把它标记成“属于刚才试过的那条链路”。所以下一次重传由哪条链路空着就由哪条来做——这也正是为什么一台 5 GHz 链路正被邻居压着打的设备，不会在那边越积越多：那些积压同样是另一条链路的活儿。',
    } },
  ],
  sources: [
    { en: 'Multi-link operation, the MLD and its shared transmit queues are Clause 35 of IEEE Std 802.11be-2024; the simultaneous transmit-and-receive form modelled here, and the enhanced multi-link single-radio form named in "Going deeper", are §35.3.',
      zh: '多链路操作、MLD 及其共享发送队列见 IEEE Std 802.11be-2024 第 35 章；这里建模的同时收发形态，以及“深入一步”里提到的增强型单射频形态，见 §35.3。' },
    { en: 'That each link keeps its own channel access state — its own carrier sense, its own backoff and its own retry counters — is §35.3.7; nothing in the standard pools contention across links.',
      zh: '每条链路各自保留自己的信道接入状态——自己的载波侦听、自己的退避、自己的重传计数——见 §35.3.7；标准中没有任何机制把竞争状态在链路之间合并。' },
    { en: 'Which band the laptop’s frames end up on is not standardised at all: the simulator hands each link the next frames from the shared queue as it wins the air, which is a model choice standing in for a real vendor’s link-selection policy.',
      zh: '笔记本的帧最终落在哪个频段，标准完全没有规定：本模拟器的做法是，哪条链路赢得空口，就把共享队列里的下一批帧交给它——这是模型取值，替代真实厂商各自的链路选择策略。' },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP (MLO)', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Laptop (MLO)', 'sta', 6.5, 5, 'eht', 'saturated'),
    node('sta-2', 'Neighbor (5G only)', 'sta', 3.5, 5, 'he', 'saturated', { edca: true, ampdu: true, txop: true }),
  ]),
  jumps: [
    J('first 5 GHz data', '第一个 5 GHz 数据帧', txOf((r) => linkOfVirtual(r.node) === '5g' && r.frame.kind === 'data' && r.frame.src === 'sta-1')),
    J('first 6 GHz data', '第一个 6 GHz 数据帧', first6g),
  ],
  observe: [
    { en: 'The laptop has two lanes, the second marked ·6G, and both carry blocks drawn from the same pile: 67 data frames on 5 GHz against 240 on 6 GHz in the first 300 ms.', zh: '笔记本有两条泳道，第二条标着 ·6G，两条上跑的方块都取自同一堆帧：最初 300 ms 里，5 GHz 上 67 个数据帧，6 GHz 上 240 个。' },
    { en: 'The neighbour has 5 GHz and nothing else, and it holds that band for 69.9% of the clock. Watch the laptop’s blocks thin out there and pile up on the quiet band.', zh: '邻居只有 5 GHz，别无其他，而它占着这个频段 69.9% 的时钟。看笔记本的方块在这边越来越稀，在那个安静的频段上越堆越多。' },
    { en: '6 GHz transmissions render as wireframe spheres in the 3D view, so one glance at the room tells you which door a frame left by.', zh: '在 3D 视图里，6 GHz 的传输画成线框球，所以看一眼房间就知道某一帧是从哪扇门出去的。' },
  ],
  tryThis: [
    { en: 'Turn MLO off on the laptop and reload. It falls back to one lane: 116 data frames in the 300 ms instead of 307, and its mean wait before sending more than doubles. The neighbour does not gain — it drops from 185 frames of its own to 116.', zh: '关掉笔记本的 MLO 再重新加载。它退回单泳道：同样的 300 ms 里只有 116 个数据帧，而不是 307，发送前的平均等待涨到两倍以上。邻居并没有因此得利——它自己也从 185 帧掉到 116 帧。' },
    { en: 'Open the editor and give the neighbour a Wi-Fi 7 radio with MLO as well, then reload. The quiet door is no longer quiet: the laptop’s work splits almost evenly, 122 frames on 5 GHz against 136 on 6 GHz, and its total falls to 258.', zh: '打开编辑器，把邻居也换成带 MLO 的 Wi-Fi 7 电台，然后重新加载。那扇安静的门不再安静：笔记本的活儿几乎平分，5 GHz 上 122 帧，6 GHz 上 136 帧，总量掉到 258。' },
  ],
  quiz: [
    {
      q: { en: 'The laptop’s two links share exactly one thing. Which?', zh: '笔记本的两条链路只共享一样东西。是哪一样？' },
      options: [
        { en: 'One countdown before sending', zh: '发送前的同一个倒数' },
        { en: 'The pile of frames waiting to be sent — listening, waiting and retrying stay separate per link', zh: '那堆等着发的帧——听、等、重传仍然各条链路各管各的' },
        { en: 'The same channel on the same band', zh: '同一个频段上的同一个信道' },
      ],
      answer: 1,
      explain: { en: 'Each link is a complete radio with its own channel access state. Only the buffered frames are pooled, one level up, at the MLD.', zh: '每条链路都是一台完整的电台，有自己的信道接入状态。只有缓存的帧被汇总到上一层，也就是 MLD。' },
    },
    {
      q: { en: 'Give the neighbour two radios as well, and what happens to the laptop?', zh: '把两台电台也给邻居装上，笔记本会怎么样？' },
      options: [
        { en: 'Nothing: it keeps its lead, because it reached the quiet band first', zh: '没事：它保住了领先，因为它先到了那个安静的频段' },
        { en: 'Its work splits almost evenly and its total falls from 307 frames to 258 — the second band was worth only its emptiness', zh: '它的活儿几乎平分，总量从 307 帧掉到 258——第二个频段值钱的地方只在于它空着' },
        { en: 'The router refuses the second device a second link', zh: '路由器会拒绝给第二台设备开第二条链路' },
      ],
      answer: 1,
      explain: { en: 'A second link buys access to an emptier band, not more air. Once the neighbour is in that band too, both devices spread across both and each carries less than the lone MLO device did.', zh: '第二条链路买到的是进入一个更空频段的资格，不是更多的空口时间。邻居也进了那个频段之后，两台设备都摊在两个频段上，各自拿到的都比当初那台独苗 MLO 设备少。' },
    },
  ],
}
