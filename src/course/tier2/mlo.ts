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
import { type Lesson, oneRoom, node, sc, txOf, first6g, J } from '../lessonKit'
import { linkOfVirtual } from '../../model/caps'

export const mlo: Lesson = {
  id: 'mlo',
  module: 9,
  title: 'MLO——一条队列，两台电台',
  why: '一台电台一旦落在某个频段上，就只能认命于这个频段上正在发生的一切。这个频段上的邻居忙，你的每一帧就得排在人家后面——哪怕隔壁那个频段一直空着。Wi-Fi 7 允许一台设备同时让两台电台醒着，分别待在两个频段上，并且由同一堆待发的帧一起喂它们：哪扇门先开，帧就从哪扇门出去。这一课讲清楚：这第二扇门买到了什么、没买到什么，以及本仿真器是怎么把它画出来的。',
  outcomes: [
    '说出一台有两台电台的设备，在两者之间共享了什么、又把什么各管各的',
    '在时间轴上读出同一台设备的两条泳道，并说出活儿是哪个频段干的',
    '给第二台电台标价：它帮了谁，又能帮多久',
  ],
  needs: ['retries-queues', 'txop-protect', 'width'],
  terms: [
    { term: 'link', plain: '一个频段上的一台电台，有自己的信道，自己排自己的队' },
    { term: 'MLO', plain: '多链路操作：把一台设备的两条链路一起跑起来，由同一堆帧来喂' },
    { term: 'MLD', plain: '链路之上的整台设备——那堆共享的帧就放在这一层' },
  ],
  picture: [
    { heading: '从一扇门变成两扇门', text: 'Wi-Fi 7 让一台设备可以在同一时刻让两台电台都醒着，各待在一个频段上。每一台都有自己的信道，也自己在那条信道上排队，每一台就是一条链路（link）；把两条链路一起跑起来，就是多链路操作（multi-link operation, MLO）。哪一条链路都不比它所取代的那一台电台更快。这一对多出来的，是“去哪条队”的选择。' },
    { kind: 'watch', jump: 1, heading: '去看一眼', text: '载入仿真，跳到第一个 6 GHz 数据帧（data frame）。笔记本在时间轴上有两条泳道，第二条标着 ·6G，两条上同时都在落方块。再看它下面那台邻居：一条泳道，一个频段，而这个频段是满的。' },
    { heading: '两条链路共享的是什么', text: '它们不共享信道，不共享发送机会，也不共享那个倒数：每条链路自己听、自己等、自己重传（retry），和一台只有单电台的设备完全一样。真正放在它们之上的，是一堆等着发的帧，归整台设备所有——也就是多链路设备（multi-link device, MLD）。哪条链路先抢到空口，就先从这堆帧里领走下一批。' },
    { heading: '第二扇门买到了什么', text: '因为这堆帧是共享的，活儿就自然流向哪个频段空着。在这个房间里，邻居把 5 GHz 占满了，而 6 GHz 上一个人也没有，于是笔记本的帧就往那边漂：大部分都从那扇安静的门出去了。没有谁去调度，也没有谁去测量，帧只是去了先轮到它的那一边。' },
    { heading: '它没有买到什么', text: '第二条链路并不会凭空造出空口时间（airtime）。它只是让自己的主人够得着一个邻居还没进去的频段——而且只在邻居还没进去的这段时间里有效。把同样的两台电台也给邻居装上，那扇安静的门就被填满了：两台设备都把活儿摊到两个频段上，于是每一台拿到的，都比当初那台独苗 MLO 设备拿到的少。' },
    { heading: '本仿真器模拟的是哪一种', text: '在这里，两台电台可以在同一瞬间各自发送——接入点（AP），或者机箱里塞得下两台电台的笔记本，用的正是这种形态。时间轴上的两条泳道、那个 ·6G 标记，以及 3D 视图里的线框球，不过是把这两条链路分开画出来而已；它们本来就是分开的。' },
  ],
  numbers: [
    { kind: 'table', heading: '最初 300 ms 里，笔记本的活儿去了哪边', head: [
      '泳道', '数据帧',
      '占用的空口时间', '占该频段时钟的比例（含回答）',
    ], rows: [
      ['5 GHz', '67', '53.9 ms', '18.3%'],
      ['6 GHz', '240', '249.6 ms', '84.2%'],
    ] },
    { heading: '不是更快的那台电台，是更空的那个频段', text: '两条链路跑的是同一级调制与编码方式（modulation and coding scheme, MCS）：MCS 13，172.1 Mb/s。第二台电台并不更快，它只是那个没有别人的频段。笔记本每五帧里有四帧从那边走，带走的空口时间差不多是留下那些帧的五倍。' },
    { kind: 'table', heading: '同样的 300 ms，把 MLO 关掉', head: [
      '测量对象', 'MLO 开', 'MLO 关',
    ], rows: [
      ['笔记本的数据帧', '307', '116'],
      ['笔记本发送前的平均等待（5 GHz / 6 GHz）', '1.29 / 1.54 ms', '3.25 ms'],
      ['邻居的数据帧', '185', '116'],
      ['邻居发送前的平均等待', '2.58 ms', '4.18 ms'],
    ] },
    { heading: '邻居也跟着占了便宜', text: '把第二条链路关掉，并不是把频段还给邻居，反而是从邻居那里抢走了空口时间。只剩一条泳道，笔记本就得在 5 GHz 上一帧一帧地抢，最后两台站点（STA）各自发出的帧数一样多。第二台电台把一个重载上传的家伙从大家的路上挪开了。' },
    { kind: 'table', heading: '把两台电台也给邻居装上', head: [
      '泳道', '笔记本的帧', '邻居的帧',
    ], rows: [
      ['5 GHz', '122', '132'],
      ['6 GHz', '136', '106'],
    ] },
    { heading: '当所有人都有两扇门', text: '那种“偏向”消失了：笔记本把活儿几乎平均地分在两个频段上，总量从 307 帧掉到 258 帧。第二条链路值多少钱，完全取决于第二个频段有多空。' },
    { kind: 'steps', heading: '一帧是怎么拿到链路的，一步一步', items: [
      '这一帧——也就是一个 MSDU（MAC service data unit）——只入队一次，入在整台设备这一层，也就是多链路设备。每台设备只有一套四条接入类别（access category, AC）队列，两条链路的电台拿到的是同一套。到达记录（ARRIVAL）与入队记录（ENQUEUE）写的都是这台设备的第一条泳道，也就是 5 GHz 那条，不管最后是哪条链路把它送出去。',
      '接着设备会把另一条链路的电台叫醒，于是两条链路都知道有活儿了，也都开始各自倒数。到这一步为止，还没有谁挑过链路。',
      '每条链路都在自己的信道上竞争，用自己的载波侦听（carrier sense）、自己的倒数、自己的竞争窗口（contention window, CW），和一台只有单电台的设备一模一样。频段被占住的那条链路，在别人说话期间就停住不数（不再出 BACKOFF_DEC），等对方停了再接着数。',
      '先数到零的那条链路，从共享队列里把帧领走并发出（TX_START）：开了聚合，就按“聚合”那一课的三道上限领走发往同一个接收方的连续帧——64 帧、5.484 ms 的数据、以及这一轮的结束时刻，哪一道先顶到算哪一道；这里领走的是 20 帧。没开聚合就领一帧。领走就是从队列里拿掉，另一条链路从此看不见它们。所谓“挑链路”，全部内容就是这一下——仿真器里没有一个负责挑的角色，也没有任何测量。',
      '序号（sequence number）取自“每个接收方、每个接入类别”一个的计数器，它跟着共享队列走，而不是跟着哪台电台走，所以两条链路绝不会把同一个序号发给两个不同的帧。',
      '确认到来，这件事就结束了。确认成功，这些帧就永远离开队列，发送它们的那条泳道为每一帧记一条出队记录（DEQUEUE）。没等到确认，每一帧的重传计数加一：加到 7 的那一帧被丢弃（DROP，原因 retryLimit）并出队，其余的退回同一条共享队列的队首——于是它们的重传落在下一个数到零的链路头上，未必是刚刚失败的那条。',
    ] },
    { kind: 'table', heading: '一帧走完这几步：MSDU 66，6 GHz 上的第一批', head: [
      '什么时候', '记录', '它说了什么',
    ], rows: [
      ['4.424 ms', 'ARRIVAL + ENQUEUE · sta-1', '第 66 帧，1500 字节，进入尽力而为队列，深度 1——记在 5 GHz 那条泳道上，而送它出去的并不是这条泳道。'],
      ['4.512 ms', 'TX_START · sta-1#6g', '6 GHz 先数到零，一次领走 20 帧，编号 66–85，30,718 字节，用 MCS 13 发出。'],
      ['4.512 ms', 'BACKOFF_DEC · sta-1', '同一瞬间，5 GHz 的倒数停在 2：它只是晚了 88 µs。'],
      ['6.0176 ms', 'TX_START · ap#6g', '接入点的块确认（block acknowledgement, BlockAck），32 字节，一次性回答这 20 帧。'],
      ['6.0496 ms', '20 × DEQUEUE · sta-1#6g', '这 20 帧全部离开共享队列——而编号 66–85 中没有任何一个在 5 GHz 的发送里出现过。'],
    ] },
  ],
  deeper: [
    { heading: '多数手机用的那种更便宜的形态', text: '两台电台同时发送，只是 MLO 的一种形态，而且是贵的那种。手机上更常见的是 EMLSR：建立并监听多条链路，但任一时刻只有一条在发送，于是设备只需为一套发射通道买单，却仍然能在接入点用的那条链路上作答。配对也不一定是 5 GHz 加 6 GHz——便宜的硬件上 2.4 + 5 GHz 很常见。本仿真器只模拟双电台同时收发这一种形态，所以上面每一个数字，都是第二条链路所能给出的最好情况。' },
    { heading: '为什么一条链路上的失败可以由另一条重传', text: '一帧发出去了却没等到确认，它依然在那堆共享的帧里：MLD 这一层并没有把它标记成“属于刚才试过的那条链路”。所以下一次重传由哪条链路空着就由哪条来做——这也正是为什么一台 5 GHz 链路正被邻居压着打的设备，不会在那边越积越多：那些积压同样是另一条链路的活儿。' },
  ],
  sources: [
    '多链路操作、MLD 及其共享发送队列见 IEEE Std 802.11be-2024 第 35 章；这里建模的同时收发形态，以及“深入一步”里提到的增强型单射频形态，见 §35.3。',
    '每条链路各自保留自己的信道接入状态——自己的载波侦听、自己的退避、自己的重传计数——见 §35.3.7；标准中没有任何机制把竞争状态在链路之间合并。',
    '笔记本的帧最终落在哪个频段，标准完全没有规定：本仿真器的做法是，哪条链路赢得空口，就把共享队列里的下一批帧交给它——这是模型取值，替代真实厂商各自的链路选择策略。',
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP (MLO)', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Laptop (MLO)', 'sta', 6.5, 5, 'eht', 'saturated'),
    node('sta-2', 'Neighbor (5G only)', 'sta', 3.5, 5, 'he', 'saturated', { edca: true, ampdu: true, txop: true }),
  ]),
  jumps: [
    J('第一个 5 GHz 数据帧', txOf((r) => linkOfVirtual(r.node) === '5g' && r.frame.kind === 'data' && r.frame.src === 'sta-1')),
    J('第一个 6 GHz 数据帧', first6g),
  ],
  observe: [
    '笔记本有两条泳道，第二条标着 ·6G，两条上跑的方块都取自同一堆帧：最初 300 ms 里，5 GHz 上 67 个数据帧，6 GHz 上 240 个。',
    '邻居只有 5 GHz，别无其他，而它占着这个频段 69.9% 的时钟。看笔记本的方块在这边越来越稀，在那个安静的频段上越堆越多。',
    '在 3D 视图里，6 GHz 的传输画成线框球，所以看一眼房间就知道某一帧是从哪扇门出去的。',
  ],
  tryThis: [
    '关掉笔记本的 MLO 再重新加载。它退回单泳道：同样的 300 ms 里只有 116 个数据帧，而不是 307，发送前的平均等待涨到两倍以上。邻居并没有因此得利——它自己也从 185 帧掉到 116 帧。',
    '打开编辑器，把邻居也换成带 MLO 的 Wi-Fi 7 电台，然后重新加载。那扇安静的门不再安静：笔记本的活儿几乎平分，5 GHz 上 122 帧，6 GHz 上 136 帧，总量掉到 258。',
  ],
  quiz: [
    {
      q: '笔记本的两条链路只共享一样东西。是哪一样？',
      options: [
        '发送前的同一个倒数',
        '那堆等着发的帧——听、等、重传仍然各条链路各管各的',
        '同一个频段上的同一个信道',
      ],
      answer: 1,
      explain: '每条链路都是一台完整的电台，有自己的信道接入状态。只有缓存的帧被汇总到上一层，也就是 MLD。',
    },
    {
      q: '把两台电台也给邻居装上，笔记本会怎么样？',
      options: [
        '没事：它保住了领先，因为它先到了那个安静的频段',
        '它的活儿几乎平分，总量从 307 帧掉到 258——第二个频段值钱的地方只在于它空着',
        '接入点会拒绝给第二台设备开第二条链路',
      ],
      answer: 1,
      explain: '第二条链路买到的是进入一个更空频段的资格，不是更多的空口时间。邻居也进了那个频段之后，两台设备都摊在两个频段上，各自拿到的都比当初那台独苗 MLO 设备少。',
    },
  ],
}
