/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · one device, two radios, two bands.
 *
 * Re-paced 2026-09-26 (docs/superpowers/plans/2026-09-25-course-repacing-proposal.md,
 * §2 M10): this half is the mechanism — one pile of frames above, two radios
 * that contend on their own below — and the procedure by which a frame gets a
 * link. What the second link buys its owner and its neighbour, and what is left
 * of that once the neighbour has two radios too, is `mlo-gain`, which was three
 * tables each followed by a paragraph restating it (§5.3).
 *
 * The door metaphor is gone with §5.2 (「从一扇门变成两扇门」,「第二扇门买到了什么」,
 * 「那扇安静的门」,「当所有人都有两扇门」): the `stack` figure draws it instead.
 *
 * The procedure is read out of src/engine/ — the shared AcQueues of
 * src/engine/simulation.ts, the sibling wake of WifiMac.pokeAccess, the
 * claim/restore pair and the sequence counter of src/engine/queues.ts, and the
 * MAX_AMPDU_MPDUS / SHORT_RETRY_LIMIT constants of src/engine/phy.ts. Step 6
 * keeps BOTH branches of the failure path: at seven retries the frame is dropped
 * with reason `retryLimit` and dequeued; below it the set goes back to the front
 * of the shared queue. This scene's own 300 ms never reaches the drop, so that
 * branch is pinned against a synthetic copy of the scene — and the lesson says
 * so rather than implying the reader can watch it here.
 *
 * The scenario builder is unchanged and there are no variants, so the recorded
 * timeline hash in tests/fixtures/lesson-hashes.json stays byte-identical.
 * Every number quoted below is pinned in tests/course/mlo.test.ts.
 */
import { type Lesson, oneRoom, node, sc, txOf, first6g, J } from '../lessonKit'
import { linkOfVirtual } from '../../model/caps'
import type { StackSpec } from '../diagram'

/** The first 300 ms of this scene, per lane: what the figure is drawn to scale from. */
export const LANE_FRAMES = { g5: 67, g6: 240 }

/**
 * One pile of frames, two radios. The boxes are the two lanes' share of the
 * laptop's 307 data frames, so the figure says what the first table says: the
 * work went where the band was empty, and it went there without anyone
 * scheduling it.
 */
export function mloStack(): StackSpec {
  return {
    kind: 'stack',
    mode: 'sequential',
    label: '一堆帧，两台电台',
    layers: [
      { label: '5 GHz 电台', bytes: LANE_FRAMES.g5, note: `${LANE_FRAMES.g5} 帧` },
      { label: '6 GHz 电台', bytes: LANE_FRAMES.g6, note: `${LANE_FRAMES.g6} 帧` },
    ],
    total: `同一堆帧，300 ms 里共 ${LANE_FRAMES.g5 + LANE_FRAMES.g6} 个数据帧`,
  }
}

export const mlo: Lesson = {
  id: 'mlo',
  module: 9,
  title: 'MLO——一条队列，两台电台',
  why: '一台电台一旦落在某个频段上，就只能认命于这个频段上正在发生的一切。这个频段上的邻居忙，你的每一帧就得排在人家后面——哪怕隔壁那个频段一直空着。Wi-Fi 7 允许一台设备同时让两台电台醒着，分别待在两个频段上，并且由同一堆待发的帧一起喂它们。这一课讲清楚：这两台电台之间什么是共享的、什么是各管各的，以及一帧究竟是怎么拿到其中一条链路（link）的。',
  outcomes: [
    '说出一台有两台电台的设备，在两者之间共享了什么、又把什么各管各的',
    '在时间轴上读出同一台设备的两条泳道，并说出某一帧是哪条链路送出去的',
    '按引擎的顺序走一遍：一帧从入队到被某条链路领走、确认、出队',
  ],
  needs: ['retries-queues', 'protect-policies', 'width'],
  terms: [
    { term: 'link', plain: '一个频段上的一台电台，有自己的信道，自己排自己的队' },
    { term: 'MLO', plain: '多链路操作：把一台设备的两条链路一起跑起来，由同一堆帧来喂' },
    { term: 'MLD', plain: '链路之上的整台设备——那堆共享的帧就放在这一层' },
  ],
  picture: [
    { heading: '两台电台，一堆帧', text: 'Wi-Fi 7 让一台设备可以在同一时刻让两台电台都醒着，各待在一个频段上。每一台都有自己的信道，也自己在那条信道上排队，每一台就是一条链路（link）；把两条链路一起跑起来，就是多链路操作（multi-link operation, MLO）。哪一条链路都不比它所取代的那一台电台更快。这一对多出来的东西，只是“从哪条链路出去”这个选择。' },
    { kind: 'watch', jump: 1, heading: '去看一眼', text: '载入仿真，跳到第一个 6 GHz 数据帧（data frame）。笔记本在时间轴上有两条泳道，第二条标着 ·6G，两条上同时都在落方块。再看它下面那台邻居：一条泳道，一个频段，而这个频段是满的。' },
    {
      kind: 'diagram', heading: '同一堆帧，去了两边', spec: mloStack(),
      caption: '方块按数据帧数画到比例：最初 300 ms 里，笔记本每五帧里有四帧是从 6 GHz 那条链路出去的。两条链路取的是同一堆帧，没有谁去调度，也没有谁去测量——帧只是去了先轮到它的那一边。为什么偏得这么厉害，是下一课的事。',
    },
    { heading: '两条链路共享的是什么', text: '它们不共享信道，不共享发送机会，也不共享那个倒数：每条链路自己听、自己等、自己重传（retry），和一台只有单电台的设备完全一样。真正放在它们之上的，是一堆等着发的帧，归整台设备所有——也就是多链路设备（multi-link device, MLD）。哪条链路先抢到空口，就先从这堆帧里领走下一批。' },
    { heading: '本仿真器模拟的是哪一种', text: '在这里，两台电台可以在同一瞬间各自发送——接入点（access point, AP），或者机箱里塞得下两台电台的笔记本，用的正是这种形态。时间轴上的两条泳道、那个 ·6G 标记，以及 3D 视图里的线框球，不过是把这两条链路分开画出来而已；它们本来就是分开的。' },
  ],
  numbers: [
    { kind: 'steps', heading: '一帧是怎么拿到链路的，一步一步', items: [
      '这一帧——也就是一个 MSDU（MAC service data unit）——只入队一次，入在整台设备这一层，也就是多链路设备。每台设备只有一套四条接入类别（access category, AC）队列（queue），两条链路的电台拿到的是同一套。到达记录（ARRIVAL）与入队记录（ENQUEUE）写的都是这台设备的第一条泳道，也就是 5 GHz 那条，不管最后是哪条链路把它送出去。',
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
      ['4.512 ms', 'TX_START · sta-1#6g', '6 GHz 先数到零，一次领走 20 帧，编号 66–85，30,718 字节，用调制与编码方式（modulation and coding scheme, MCS）的第 13 级发出。'],
      ['4.512 ms', 'BACKOFF_DEC · sta-1', '同一瞬间，5 GHz 的倒数停在 2：它只是晚了 88 µs。'],
      ['6.0176 ms', 'TX_START · ap#6g', '接入点的块确认（block acknowledgement, BlockAck），32 字节，一次性回答这 20 帧。'],
      ['6.0496 ms', '20 × DEQUEUE · sta-1#6g', '这 20 帧全部离开共享队列——而编号 66–85 中没有任何一个在 5 GHz 的发送里出现过。'],
    ] },
    { heading: '第六步那条丢弃的分支，这个房间里看不到', text: '这段 300 ms 里一次丢弃也没有发生：链路好、邻居再忙也总有轮到的时候，没有哪一帧被试到第七次。所以“加到 7 就丢弃”这条分支是拿一个合成的场景钉住的——把笔记本挪到收不到的地方，于是同一帧被试满七次、七次分落在两条泳道上，第七次之后它被丢弃并出队。本课引用的数字没有一个来自那个场景。' },
  ],
  deeper: [
    { heading: '多数手机用的那种更便宜的形态', text: '两台电台同时发送，只是 MLO 的一种形态，而且是贵的那种。手机上更常见的是 EMLSR：建立并监听多条链路，但任一时刻只有一条在发送，于是设备只需为一套发射通道买单，却仍然能在接入点用的那条链路上作答。配对也不一定是 5 GHz 加 6 GHz——便宜的硬件上 2.4 + 5 GHz 很常见。本仿真器只模拟双电台同时收发这一种形态，所以本课与下一课的每一个数字，都是第二条链路所能给出的最好情况。' },
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
    '笔记本有两条泳道，第二条标着 ·6G，两条上跑的方块都取自同一堆帧。到达记录和入队记录却全都记在 5 GHz 那条泳道上，哪怕送它出去的是 6 GHz 那条：帧只入队一次，入在整台设备这一层。',
    '在 3D 视图里，6 GHz 的传输画成线框球，所以看一眼房间就知道某一帧是哪条链路送出去的。',
  ],
  tryThis: [
    '在帧解码器里打开 6 GHz 上的第一批（20 帧，编号 66–85），再去 5 GHz 的那些发送里找这 20 个编号中的任何一个——找不到。领走就是从共享队列里拿掉，另一条链路从此再也看不见它们。',
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
      q: '一批帧发出去没等到确认，而重传次数还没到上限。下一次重传由哪条链路来做？',
      options: [
        '还是刚刚失败的那一条——帧被记在了它名下',
        '哪条先数到零就哪条，因为这批帧退回的是同一条共享队列的队首',
        '由接入点指定',
      ],
      answer: 1,
      explain: 'MLD 这一层不给帧贴“属于哪条链路”的标记。失败的一批回到共享队列的队首，于是它们的重传落在下一个数到零的链路头上。',
    },
  ],
}
