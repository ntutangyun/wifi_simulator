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
 * Mechanism before metaphor (2026-09-23): `numbers` closes with the procedure
 * by which a frame gets a link, read out of src/engine/ — the shared AcQueues
 * of src/engine/simulation.ts, the sibling wake of WifiMac.pokeAccess, the
 * claim/restore pair and the sequence counter of src/engine/queues.ts, and the
 * MAX_AMPDU_MPDUS / SHORT_RETRY_LIMIT constants of src/engine/phy.ts — with one
 * worked example running MSDU 66 through those steps, record by record.
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
    zh: '一台电台一旦落在某个频段上，就只能认命于这个频段上正在发生的一切。这个频段上的邻居忙，你的每一帧就得排在人家后面——哪怕隔壁那个频段一直空着。Wi-Fi 7 允许一台设备同时让两台电台醒着，分别待在两个频段上，并且由同一堆待发的帧一起喂它们：哪扇门先开，帧就从哪扇门出去。这一课讲清楚：这第二扇门买到了什么、没买到什么，以及本仿真器是怎么把它画出来的。',
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
      en: 'Wi-Fi 7 lets one device hold two radios awake at the same moment, on two different bands. Each of them has its own channel and takes its turn on that channel by itself, and each is a link; running the pair together is MLO. Neither link is quicker than the single radio it replaces. What the pair has is a choice of queue.',
      zh: 'Wi-Fi 7 让一台设备可以在同一时刻让两台电台都醒着，各待在一个频段上。每一台都有自己的信道，也自己在那条信道上排队，每一台就是一条链路；把两条链路一起跑起来，就是 MLO。哪一条链路都不比它所取代的那一台电台更快。这一对多出来的，是“去哪条队”的选择。',
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
    { heading: { en: 'What this simulator models', zh: '本仿真器模拟的是哪一种' }, text: {
      en: 'Here both radios may transmit at the same instant, which is the arrangement an access point (AP), or a laptop with room for two radios inside it, actually uses. The two lanes, the ·6G mark and the wireframe spheres of the 3D view are simply those two links drawn apart, because apart is what they are.',
      zh: '在这里，两台电台可以在同一瞬间各自发送——接入点（AP），或者机箱里塞得下两台电台的笔记本，用的正是这种形态。时间轴上的两条泳道、那个 ·6G 标记，以及 3D 视图里的线框球，不过是把这两条链路分开画出来而已；它们本来就是分开的。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: {
      en: 'The laptop’s work, first 300 ms',
      zh: '最初 300 ms 里，笔记本的活儿去了哪边',
    }, head: [
      { en: 'Lane', zh: '泳道' }, { en: 'Data frames', zh: '数据帧' },
      { en: 'Airtime', zh: '占用的空口时间' }, { en: 'Share of that band’s clock', zh: '占该频段时钟的比例（含回答）' },
    ], rows: [
      [N('5 GHz'), N('67'), N('53.9 ms'), N('18.3%')],
      [N('6 GHz'), N('240'), N('249.6 ms'), N('84.2%')],
    ] },
    { heading: { en: 'Not faster — emptier', zh: '不是更快的那台电台，是更空的那个频段' }, text: {
      en: 'Both links run at MCS 13 and 172.1 Mb/s: the second radio is not quicker, only emptier. Four of every five of the laptop’s frames leave that way, taking almost five times the air.',
      zh: '两条链路跑的是同一级：MCS 13，172.1 Mb/s。第二台电台并不更快，它只是那个没有别人的频段。笔记本每五帧里有四帧从那边走，带走的空口时间差不多是留下那些帧的五倍。',
    } },
    { kind: 'table', heading: { en: 'The same 300 ms, MLO off', zh: '同样的 300 ms，把 MLO 关掉' }, head: [
      { en: 'Measured on', zh: '测量对象' }, { en: 'MLO on', zh: 'MLO 开' }, { en: 'MLO off', zh: 'MLO 关' },
    ], rows: [
      [{ en: 'Laptop data frames', zh: '笔记本的数据帧' }, N('307'), N('116')],
      [{ en: 'Laptop mean wait, 5 GHz / 6 GHz', zh: '笔记本发送前的平均等待（5 GHz / 6 GHz）' }, N('1.29 / 1.54 ms'), N('3.25 ms')],
      [{ en: 'Neighbour data frames', zh: '邻居的数据帧' }, N('185'), N('116')],
      [{ en: 'Neighbour mean wait', zh: '邻居发送前的平均等待' }, N('2.58 ms'), N('4.18 ms')],
    ] },
    { heading: { en: 'The neighbour gained too', zh: '邻居也跟着占了便宜' }, text: {
      en: 'Switching the second link off does not give the neighbour its band back; it takes air from it. With one lane the laptop fights for 5 GHz frame by frame, and the two stations (STA) end up level: the second radio had moved a heavy uploader aside.',
      zh: '把第二条链路关掉，并不是把频段还给邻居，反而是从邻居那里抢走了空口时间。只剩一条泳道，笔记本就得在 5 GHz 上一帧一帧地抢，最后两台站点（STA）各自发出的帧数一样多。第二台电台把一个重载上传的家伙从大家的路上挪开了。',
    } },
    { kind: 'table', heading: { en: 'The neighbour gets two radios too', zh: '把两台电台也给邻居装上' }, head: [
      { en: 'Lane', zh: '泳道' }, { en: 'Laptop frames', zh: '笔记本的帧' }, { en: 'Neighbour frames', zh: '邻居的帧' },
    ], rows: [
      [N('5 GHz'), N('122'), N('132')],
      [N('6 GHz'), N('136'), N('106')],
    ] },
    { heading: { en: 'When everybody has two doors', zh: '当所有人都有两扇门' }, text: {
      en: 'The lean vanishes: the laptop splits its work almost evenly, its total falling from 307 to 258. A second link is worth what the second band is empty.',
      zh: '那种“偏向”消失了：笔记本把活儿几乎平均地分在两个频段上，总量从 307 帧掉到 258 帧。第二条链路值多少钱，完全取决于第二个频段有多空——这句话说的是邻居，不是这台设备。',
    } },
    { kind: 'steps', heading: { en: 'How a frame gets a link, step by step', zh: '一帧是怎么拿到链路的，一步一步' }, items: [
      { en: 'The frame is queued once, at the device as a whole — the MLD, whose four access-category queues both links’ radios hold. The arrival (ARRIVAL) and queue (ENQUEUE) records name the device’s first lane, 5 GHz, whichever link carries it.',
        zh: '这一帧只入队一次，入在整台设备这一层——也就是 MLD。每台设备只有一套四条接入类别队列，两条链路的电台拿到的是同一套。到达记录（ARRIVAL）与入队记录（ENQUEUE）写的都是这台设备的第一条泳道，也就是 5 GHz 那条，不管最后是哪条链路把它送出去。' },
      { en: 'The device wakes the other link’s radio: both links now know there is work and both begin counting down. Nothing has picked a link.',
        zh: '接着设备会把另一条链路的电台叫醒，于是两条链路都知道有活儿了，也都开始各自倒数。到这一步为止，还没有谁挑过链路。' },
      { en: 'Each link contends on its own channel with its own carrier sense, countdown and contention window, just as a single-radio device does; a link whose band is occupied stops counting down (BACKOFF_DEC) while the other device talks.',
        zh: '每条链路都在自己的信道上竞争，用自己的载波侦听、自己的倒数、自己的竞争窗口，和一台只有单电台的设备一模一样。频段被占住的那条链路，在别人说话期间就停住不数（不再出 BACKOFF_DEC），等对方停了再接着数。' },
      { en: 'The first link to reach zero takes frames off the shared queue and sends (TX_START): up to 64 consecutive frames for one receiver with aggregation on, one without. Taking them removes them, so the other link can no longer see them. That is the whole of the link decision — no chooser, no measurement.',
        zh: '先数到零的那条链路，从共享队列里把帧领走并发出（TX_START）：开了聚合就一次领走发往同一个接收方的至多 64 个连续帧，没开就领一个。领走就是从队列里拿掉，另一条链路从此看不见它们。所谓“挑链路”，全部内容就是这一下——仿真器里没有一个负责挑的角色，也没有任何测量。' },
      { en: 'Sequence numbers come from one counter per receiver and access category, kept with the shared queue, not with either radio, so the links never number two frames alike.',
        zh: '序号取自“每个接收方、每个接入类别”一个的计数器，它跟着共享队列走，而不是跟着哪台电台走，所以两条链路绝不会把同一个序号发给两个不同的帧。' },
      { en: 'The acknowledgement closes it. Acknowledged, the frames leave the queue and the sending lane logs a dequeue (DEQUEUE) apiece. Unacknowledged, each frame counts one more retry: one that has reached 7 is dropped (DROP) with reason retryLimit and dequeued, the rest return to the front of the shared queue — so their retry falls to whichever link reaches zero next, not necessarily the one that failed.',
        zh: '确认到来，这件事就结束了。确认成功，这些帧就永远离开队列，发送它们的那条泳道为每一帧记一条出队记录（DEQUEUE）。没等到确认，每一帧的重传计数加一：加到 7 的那一帧被丢弃（DROP，原因 retryLimit）并出队，其余的退回同一条共享队列的队首——于是它们的重传落在下一个数到零的链路头上，未必是刚刚失败的那条。' },
    ] },
    { kind: 'table', heading: {
      en: 'MSDU 66 through those steps',
      zh: '一帧走完这几步：MSDU 66，6 GHz 上的第一批',
    }, head: [
      { en: 'When', zh: '什么时候' }, { en: 'Record', zh: '记录' }, { en: 'What it says', zh: '它说了什么' },
    ], rows: [
      [N('4.424 ms'), N('ARRIVAL + ENQUEUE · sta-1'), { en: 'Frame 66, 1500 bytes, best-effort queue, depth 1 — on the 5 GHz lane, which will not send it.', zh: '第 66 帧，1500 字节，进入尽力而为队列，深度 1——记在 5 GHz 那条泳道上，而送它出去的并不是这条泳道。' }],
      [N('4.512 ms'), N('TX_START · sta-1#6g'), { en: '6 GHz reached zero first and claimed 20 frames, ids 66–85, 30,718 bytes, MCS 13.', zh: '6 GHz 先数到零，一次领走 20 帧，编号 66–85，30,718 字节，用 MCS 13 发出。' }],
      [N('4.512 ms'), N('BACKOFF_DEC · sta-1'), { en: '5 GHz stands at 2 that instant: it lost by 88 µs.', zh: '同一瞬间，5 GHz 的倒数停在 2：它只是晚了 88 µs。' }],
      [N('6.0176 ms'), N('TX_START · ap#6g'), { en: 'The AP’s BlockAck, 32 bytes, answers all 20.', zh: '接入点的 BlockAck，32 字节，一次性回答这 20 帧。' }],
      [N('6.0496 ms'), N('20 × DEQUEUE · sta-1#6g'), { en: 'All 20 leave the shared queue — and no id of 66–85 ever appears on 5 GHz.', zh: '这 20 帧全部离开共享队列——而编号 66–85 中没有任何一个在 5 GHz 的发送里出现过。' }],
    ] },
  ],
  deeper: [
    { heading: { en: 'The cheaper arrangement most phones use', zh: '多数手机用的那种更便宜的形态' }, text: {
      en: 'Two radios transmitting at once is only one form of MLO, and the expensive one. A phone more often runs EMLSR: several links are set up and listened on, but only one of them transmits at any instant, so the device pays for one transmit chain and still gets to answer on whichever link the access point used. The pairing need not be 5 and 6 GHz either — 2.4 + 5 GHz is common on cheaper hardware. This simulator models the simultaneous two-radio form only, so every number above is the best case a second link can give.',
      zh: '两台电台同时发送，只是 MLO 的一种形态，而且是贵的那种。手机上更常见的是 EMLSR：建立并监听多条链路，但任一时刻只有一条在发送，于是设备只需为一套发射通道买单，却仍然能在接入点用的那条链路上作答。配对也不一定是 5 GHz 加 6 GHz——便宜的硬件上 2.4 + 5 GHz 很常见。本仿真器只模拟双电台同时收发这一种形态，所以上面每一个数字，都是第二条链路所能给出的最好情况。',
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
      zh: '笔记本的帧最终落在哪个频段，标准完全没有规定：本仿真器的做法是，哪条链路赢得空口，就把共享队列里的下一批帧交给它——这是模型取值，替代真实厂商各自的链路选择策略。' },
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
        { en: 'The access point refuses the second device a second link', zh: '接入点会拒绝给第二台设备开第二条链路' },
      ],
      answer: 1,
      explain: { en: 'A second link buys access to an emptier band, not more air. Once the neighbour is in that band too, both devices spread across both and each carries less than the lone MLO device did.', zh: '第二条链路买到的是进入一个更空频段的资格，不是更多的空口时间。邻居也进了那个频段之后，两台设备都摊在两个频段上，各自拿到的都比当初那台独苗 MLO 设备少。' },
    },
  ],
}
