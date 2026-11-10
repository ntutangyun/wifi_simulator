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
    label: '一组待发的帧，两台电台',
    layers: [
      { label: '5 GHz 电台', bytes: LANE_FRAMES.g5, note: `${LANE_FRAMES.g5} 帧` },
      { label: '6 GHz 电台', bytes: LANE_FRAMES.g6, note: `${LANE_FRAMES.g6} 帧` },
    ],
    total: `同一组待发的帧，300 ms 内共 ${LANE_FRAMES.g5 + LANE_FRAMES.g6} 个数据帧`,
  }
}

export const mlo: Lesson = {
  id: 'mlo',
  module: 9,
  title: 'MLO——一条队列，两台电台',
  why: '一台电台一旦工作在某个频段上，它的发送就只能受这个频段上正在发生的一切约束。这个频段上的邻居繁忙，你的每一帧就必须排在它们之后——即使相邻的另一个频段一直空闲。Wi-Fi 7 允许一台设备同时让两台电台处于工作状态，分别工作在两个频段上，两台电台从同一组待发的帧里取帧。每台电台是一条链路（link），有自己的信道，各自侦听、各自进行退避（backoff）计数、各自重传（retry），没有一条比它所取代的那一台单电台更快；让两条链路同时运行，就是多链路操作（multi-link operation, MLO）。两条链路共享的只有一样东西：那组待发的帧，归整台设备所有，这一层称为多链路设备（multi-link device, MLD）。一帧只入队一次，入在设备这一层；哪条链路先在自己的信道上将退避计数减到零，就把队首那一批帧取走，取走就是从队列（queue）中移除，另一条链路此后看不到它们。所谓选择链路，全部内容就是这一步：没有任何调度，也没有任何测量。序号（sequence number）随共享的队列分配，所以两条链路绝不会把同一个序号分配给两个不同的帧；一批帧没有收到确认，就退回共享队列的队首，重传由下一个先将计数减到零的链路完成，未必是刚刚失败的那条。在这个房间里，邻居占满了其中一个频段，笔记本每五帧中就有四帧从另一条链路发出。',
  outcomes: [
    '说出一台有两台电台的设备在两者之间共享了什么、又有哪些是各自独立的',
    '在时间轴上读出同一台设备的两条泳道，并说出某一帧是由哪条链路发出的',
    '按引擎的顺序推演一遍：一帧从入队到被某条链路取走、确认、出队',
  ],
  needs: ['retries-queues', 'protect-policies', 'width'],
  terms: [
    { term: 'link', plain: '一个频段上的一台电台，有自己的信道，独立参与信道竞争' },
    { term: 'MLO', plain: '多链路操作：让一台设备的两条链路同时运行，两条链路从同一组待发的帧里取帧' },
    { term: 'MLD', plain: '链路之上的整台设备——那组共享的帧就位于这一层' },
  ],
  picture: [
    { heading: '两台电台，一组待发的帧', text: 'Wi-Fi 7 允许一台设备在同一时刻让两台电台都处于工作状态，各工作在一个频段上。每一台都有自己的信道，也各自在那条信道上参与竞争，每一台就是一条链路（link）；让两条链路同时运行，就是多链路操作（multi-link operation, MLO）。没有一条链路比它所取代的那一台电台更快。这一对链路多带来的，只是“从哪条链路发出”这个选择。' },
    { kind: 'watch', jump: 1, heading: '在时间轴上观察', text: '载入仿真，跳到第一个 6 GHz 数据帧（data frame）。笔记本在时间轴上有两条泳道，第二条标有 ·6G，两条泳道上都不断出现方块。再看它下面那台邻居：一条泳道，一个频段，而这个频段已被占满。' },
    {
      kind: 'diagram', heading: '同一组待发的帧，分别从两条链路发出', spec: mloStack(),
      caption: '方块按数据帧数等比例绘制：最初 300 ms 内，笔记本每五帧中有四帧是从 6 GHz 那条链路发出的。两条链路取的是同一组帧，没有任何调度，也没有任何测量——帧只是由先获得发送机会的那条链路发出。为什么偏向如此明显，是下一课的内容。',
    },
    { heading: '两条链路共享的是什么', text: '它们不共享信道，不共享发送机会，也不共享退避计数：每条链路各自侦听、各自等待、各自重传（retry），与一台只有单电台的设备完全相同。真正位于它们之上的，是一组等待发送的帧，归整台设备所有——也就是多链路设备（multi-link device, MLD）。哪条链路先取得发送机会，就先从这组帧里取走下一批。' },
    { heading: '本仿真器模拟的是哪一种形态', text: '在这里，两台电台可以在同一时刻各自发送——接入点（access point, AP），或者机身内能够容纳两台电台的笔记本，使用的正是这种形态。时间轴上的两条泳道、那个 ·6G 标记，以及 3D 视图里的线框球，只是把这两条链路分开绘制而已；它们本来就是相互独立的。' },
  ],
  numbers: [
    { kind: 'steps', heading: '一帧如何获得发送链路：逐步说明', items: [
      '这一帧——也就是一个 MSDU（MAC service data unit）——只入队一次，入在整台设备这一层，也就是多链路设备。每台设备只有一套四条接入类别（access category, AC）队列（queue），两条链路的电台使用的是同一套。到达记录（ARRIVAL）与入队记录（ENQUEUE）记录的都是这台设备的第一条泳道，也就是 5 GHz 那条，无论最后由哪条链路发出。',
      '接着设备会唤醒另一条链路的电台，于是两条链路都知道有帧要发送，也都开始各自进行退避计数。到这一步为止，还没有进行任何链路选择。',
      '每条链路都在自己的信道上竞争，使用自己的载波侦听（carrier sense）、自己的退避计数、自己的竞争窗口（contention window, CW），与一台只有单电台的设备完全相同。频段被占用的那条链路，在其他设备发送期间暂停计数（不再产生 BACKOFF_DEC），等对方发送结束后再继续计数。',
      '先将计数减到零的那条链路，从共享队列中取走帧并发送（TX_START）：启用聚合时，就按“聚合”那一课的三项上限取走发往同一个接收方的连续帧——64 帧、5.484 ms 的数据、以及这一轮的结束时刻，以先达到者为准；这里取走的是 20 帧。未启用聚合时只取一帧。取走就是从队列中移除，另一条链路此后看不到它们。所谓“选择链路”，全部内容就是这一步——仿真器里没有负责选择的角色，也没有任何测量。',
      '序号（sequence number）取自“每个接收方、每个接入类别”各一个的计数器，它随共享队列分配，而不随某台电台分配，所以两条链路绝不会把同一个序号分配给两个不同的帧。',
      '最后一步是确认。确认成功，这些帧就永久离开队列，发送它们的那条泳道为每一帧记录一条出队记录（DEQUEUE）。没有收到确认时，每一帧的重传计数加一：达到 7 的那一帧被丢弃（DROP，原因 retryLimit）并出队，其余的退回同一条共享队列的队首——于是它们的重传由下一个将计数减到零的链路完成，未必是刚刚失败的那条。',
    ] },
    { kind: 'table', heading: '一帧经历的各个步骤：MSDU 66，6 GHz 上的第一批', head: [
      '什么时候', '记录', '记录内容',
    ], rows: [
      ['4.424 ms', 'ARRIVAL + ENQUEUE · sta-1', '第 66 帧，1500 字节，进入尽力而为队列，深度 1——记录在 5 GHz 那条泳道上，而发送它的并不是这条泳道。'],
      ['4.512 ms', 'TX_START · sta-1#6g', '6 GHz 先将计数减到零，一次取走 20 帧，编号 66–85，30,718 字节，以调制与编码方式（modulation and coding scheme, MCS）的第 13 级发出。'],
      ['4.512 ms', 'BACKOFF_DEC · sta-1', '同一时刻，5 GHz 的退避计数停在 2：它只晚了 88 µs。'],
      ['6.0176 ms', 'TX_START · ap#6g', '接入点的块确认（block acknowledgement, BlockAck），32 字节，一次性确认这 20 帧。'],
      ['6.0496 ms', '20 × DEQUEUE · sta-1#6g', '这 20 帧全部离开共享队列——而编号 66–85 中没有任何一个在 5 GHz 的发送里出现过。'],
    ] },
    { heading: '第六步中的丢弃分支，在这个房间里不会出现', text: '这段 300 ms 内没有发生任何丢弃：链路质量好，邻居再繁忙也总有轮到的时候，没有哪一帧被发送到第七次。所以“达到 7 就丢弃”这条分支是用一个合成场景验证的——把笔记本移到接收不到信号的位置，于是同一帧被发送满七次，七次分布在两条泳道上，第七次之后它被丢弃并出队。本课引用的数字没有一个来自那个场景。' },
  ],
  deeper: [
    { heading: '多数手机采用的那种成本更低的形态', text: '两台电台同时发送，只是 MLO 的一种形态，而且是成本较高的那种。手机上更常见的是 EMLSR：建立并监听多条链路，但任一时刻只有一条在发送，于是设备只需承担一套发射通道的成本，却仍然能在接入点使用的那条链路上应答。频段组合也不一定是 5 GHz 加 6 GHz——低成本硬件上 2.4 + 5 GHz 很常见。本仿真器只模拟双电台同时收发这一种形态，所以本课与下一课的每一个数字，都是第二条链路所能带来的最好情况。' },
    { heading: '为什么一条链路上的失败可以由另一条重传', text: '一帧发出后没有收到确认，它仍然在那组共享的帧里：MLD 这一层并没有把它标记为“属于刚才尝试过的那条链路”。所以下一次重传由哪条链路空闲就由哪条完成——这也正是为什么一台 5 GHz 链路被邻居长时间占满的设备，不会在那条链路上不断积压：那些积压同样可以由另一条链路发送。' },
  ],
  limits: [
    { kind: 'unmodelled', text: '「选择链路」这件事在引擎里没有任何实体负责：哪条链路先将计数减到零就取走下一批，而引擎里既没有 TID 到链路的映射，也没有每条链路各自的块确认协商，接入点也从不向站点推荐使用哪条链路。真实的多链路设备要先协商 TID 到链路的映射，再由厂商的策略在映射允许的范围内选择，而那个策略会考虑两条链路各自的负载与信号质量。所以本课那 67 比 240 的偏斜，是「先获得发送机会者发送」这一条规则的结果，而不是某个厂商的选择。' },
    { kind: 'unmodelled', text: '两台电台之间没有任何相互影响：引擎为每条链路各建一个完全独立的信道（simulation.ts 里那个按链路的循环），一台设备在 6 GHz 上发射时，它自己 5 GHz 接收机的噪声地板完全不会抬高。真实设备内这两副天线距离很近，隔离度不够就无法真正同时收发——这正是多数手机改用增强型单射频形态的原因。所以本仿真器把成本最高的那种形态当成了没有代价的形态。' },
    { kind: 'out-of-scope', text: '形态和频段组合都是固定的：启用 MLO 的节点总是 5 GHz 加 6 GHz 两条链路，不多不少（caps.ts 的 nodeLinks 直接返回这两条），无法配置 2.4 + 5 GHz 这种低成本组合，也无法配置三条链路。课文「深入一步」提到的增强型单射频形态同样无法配置，因为引擎没有「同一时刻只允许一条链路发送」这个状态。所以关于「手机上的 MLO」的任何问题，都不应该用这个场景来回答。' },
    { kind: 'unmodelled', text: '这两条链路从仿真开始时就存在：引擎不发送任何管理帧——帧类型表里没有信标、没有探测、没有关联与认证，也没有多链路建立（model/frames.ts 的 FRAME_KINDS）。于是多链路设备的建立、各链路的能力交换，以及运行中增删一条链路，全都不耗费时间，也不会失败。真实设备要先在一条链路上完成整套建立流程，而这套流程未能成功建立第二条链路的情形并不罕见。' },
  ],
  sources: [
    '多链路操作、MLD 及其共享发送队列见 IEEE Std 802.11be-2024 第 35 章；这里建模的同时收发形态，以及“深入一步”里提到的增强型单射频形态，见 §35.3。',
    '每条链路各自保留自己的信道接入状态——自己的载波侦听、自己的退避、自己的重传计数——见 §35.3.7；标准中没有任何机制把竞争状态在链路之间合并。',
    '笔记本的帧最终从哪个频段发出，标准完全没有规定：本仿真器的做法是，哪条链路获得发送机会，就把共享队列里的下一批帧交给它——这是模型取值，替代真实厂商各自的链路选择策略。',
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
    '笔记本有两条泳道，第二条标有 ·6G，两条泳道上的方块都取自同一组待发的帧。到达记录和入队记录却全都记录在 5 GHz 那条泳道上，即使发送它的是 6 GHz 那条：帧只入队一次，入在整台设备这一层。',
    '在 3D 视图中，6 GHz 的传输显示为线框球，所以观察房间即可知道某一帧是由哪条链路发出的。',
  ],
  tryThis: [
    '在帧解码器中打开 6 GHz 上的第一批（20 帧，编号 66–85），再到 5 GHz 的发送中查找这 20 个编号中的任何一个——找不到。取走就是从共享队列中移除，另一条链路此后不会再看到它们。',
  ],
  quiz: [
    {
      q: '笔记本的两条链路只共享一样东西。是哪一样？',
      options: [
        '发送前的同一个退避计数',
        '那组等待发送的帧——侦听、等待、重传仍由各条链路各自进行',
        '同一个频段上的同一个信道',
      ],
      answer: 1,
      explain: '每条链路都是一台完整的电台，有自己的信道接入状态。只有缓存的帧被汇总到上一层，也就是 MLD。',
    },
    {
      q: '一批帧发出后没有收到确认，而重传次数还未达到上限。下一次重传由哪条链路完成？',
      options: [
        '仍是刚刚失败的那一条——帧被记录在它名下',
        '哪条先将计数减到零就由哪条完成，因为这批帧退回的是同一条共享队列的队首',
        '由接入点指定',
      ],
      answer: 1,
      explain: 'MLD 这一层不给帧加“属于哪条链路”的标记。失败的一批回到共享队列的队首，于是它们的重传由下一个将计数减到零的链路完成。',
    },
  ],
}
