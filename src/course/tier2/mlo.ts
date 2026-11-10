/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · one device, two radios, two bands.
 *
 * Standard-first shape (2026-11-11, after lesson 70's template): ① what IEEE Std 802.11be-2024
 * specifies for multi-link operation — the MLD and its affiliated STAs (§35.3.1, §5.1.5.1),
 * independent channel access per link (§35.3.16.1, §35.3.16.3), the default TID-to-link mapping
 * (§35.3.7.2), MLD-level sequence numbers and the one block ack agreement per TID (§10.3.2.14.2,
 * §35.3.8), and retransmission on any mapped link (§35.3.16.9); ② how this engine does each of
 * those, row by row; ③ three guided runs of the lesson's own scene.
 *
 * The audit of this lesson found one wrong citation in the old prose: the per-link channel access
 * was attributed to §35.3.7, which is link management (TTLM); the clause is §35.3.16.1.
 *
 * The procedure is read out of src/engine/ — the shared AcQueues of src/engine/simulation.ts, the
 * sibling wake of WifiMac.pokeAccess, the claim/restore pair and the sequence counter of
 * src/engine/queues.ts, and the MAX_AMPDU_MPDUS / SHORT_RETRY_LIMIT constants of
 * src/engine/phy.ts. The scenario builder is unchanged and there are no variants, so the recorded
 * timeline hash in tests/fixtures/lesson-hashes.json stays byte-identical. Every number quoted
 * below is read back out of this file by tests/course/mlo.test.ts and compared with a run.
 */
import { type Lesson, oneRoom, node, sc, txOf, first6g, J } from '../lessonKit'
import { linkOfVirtual } from '../../model/caps'
import type { StackSpec } from '../diagram'

/** The first 300 ms of this scene, per lane: what the figure is drawn to scale from. */
export const LANE_FRAMES = { g5: 27, g6: 235 }

/**
 * One pile of frames, two radios. The boxes are the two lanes' share of the laptop's 262 data
 * frames: the work went where the band was empty, without anyone scheduling it.
 */
export function mloStack(): StackSpec {
  return {
    kind: 'stack',
    mode: 'sequential',
    label: '一组待发的帧，两台电台',
    layers: [
      // 2026-11-11: the 5 GHz box is a tenth of the stack now, too small for a note beside it.
      { label: `5 GHz 电台 ${LANE_FRAMES.g5} 帧`, bytes: LANE_FRAMES.g5 },
      { label: '6 GHz 电台', bytes: LANE_FRAMES.g6, note: `${LANE_FRAMES.g6} 帧` },
    ],
    total: `同一组待发的帧，300 ms 内共 ${LANE_FRAMES.g5 + LANE_FRAMES.g6} 个数据帧`,
  }
}

export const mlo: Lesson = {
  id: 'mlo',
  module: 9,
  title: 'MLO——一条队列，两台电台',
  why: 'IEEE 802.11be-2024 定义了多链路操作（multi-link operation, MLO）：一台多链路设备（multi-link device, MLD）下挂几个站点（station, STA），每个站点工作在一条链路（link）上，即一个频段里的一条信道。标准规定了四件事。第一，每个站点在自己的链路上独立竞争信道，各用各的退避（backoff）计数，另一条链路上发生什么都不影响它（§35.3.16）。第二，没有协商过映射时，所有业务标识（traffic identifier, TID）都映射到所有已建立的链路，设备可以用其中任何一条发送；用哪一条，标准没有规定（§35.3.7.2）。第三，序号（sequence number）由整台设备分配，每个 TID 只有一个块确认（block acknowledgement, BlockAck）协议，跨所有链路共用一个发送缓存（§10.3.2.14.2，§35.3.8）。第四，一帧在某条链路上发送失败，可以在映射到的任何一条链路上重传（retry）（§35.3.16.9）。本仿真器按这四条实现：两台电台从同一组队列（queue）取帧，哪条链路先把退避计数减到零，就取走队首那一批，另一条链路从此看不到它们。标准留给实现的链路选择，在这里就是这一条规则，没有任何调度与测量。在本课的房间里，邻居占满了 5 GHz，笔记本最初 300 ms 的 307 个数据帧（data frame）中，240 个从 6 GHz 发出；一批帧在 5 GHz 上没有取得发送权，下一次可能由 6 GHz 发出。',
  outcomes: [
    '说出标准规定一台多链路设备在各条链路之间共享什么、又有哪些是各条链路独立进行的',
    '分清本仿真器的哪些做法照标准、哪些是标准留给实现而本仿真器自己取的',
    '在时间轴上读出同一台设备的两条泳道，并跟踪一帧从入队到被某条链路取走、确认、出队',
  ],
  needs: ['retries-queues', 'protect-policies', 'width'],
  terms: [
    { term: 'link', plain: '一个频段上的一台电台，有自己的信道，独立参与信道竞争' },
    { term: 'MLO', plain: '多链路操作：让一台设备的两条链路同时运行，两条链路从同一组待发的帧里取帧' },
    { term: 'MLD', plain: '链路之上的整台设备——那组共享的帧就位于这一层' },
  ],
  standard: [
    { heading: '多链路设备与它下挂的站点（§35.3.1，§35.3.2，§5.1.5.1）', text: 'MLD 分为接入点（access point, AP）一侧的 AP MLD 与非 AP MLD。MLD 下挂一个或多个站点，每个站点都是 EHT 站点，各自工作在一条链路上；除另有规定外，各站点独立选择自己的能力与工作参数。MLD 有一个唯一标识它的媒体访问控制（medium access control, MAC）地址，称为 MLD MAC 地址；下挂的各站点使用互不相同的 MAC 地址。发送时，一个 MSDU（MAC service data unit）先经过整台设备这一层的处理，再由 TID 到链路的映射（TID-to-link mapping, TTLM）按 MPDU（MAC protocol data unit）的 TID 交给一条或几条链路各自的 MAC 实体，最后到对应链路的物理层（physical layer, PHY）。' },
    { heading: '每条链路各自竞争（§35.3.16.1，§35.3.16.3）', text: '下挂于 MLD 的站点在自己的链路上独立于同一 MLD 的其他站点竞争介质（medium），除非另有明文规定。一对链路是同时收发（simultaneous transmit and receive, STR）链路对时，每条链路上的站点按 §10.3 的分布式协调与 §10.23.2 的增强型分布式信道接入（enhanced distributed channel access, EDCA）接入介质，不论另一条链路上发生什么。不是移动 AP MLD 的接入点 MLD，其所有链路对都必须是 STR 链路对。' },
    { heading: 'TID 到链路的映射（§35.3.7.2.1，§35.3.7.2.2）', text: '默认映射下，所有 TID 在上行（uplink, UL）和下行（downlink, DL）都映射到所有已建立的链路，所有已建立的链路都处于启用状态；没有通告映射、也没有协商成功的其他映射时，设备按默认映射工作。上行方向上，一个 TID 映射到一组启用的链路时，非 AP MLD 可以用这组链路中的任何一条发送这个 TID 的单播 MPDU。标准没有规定在这组链路中选哪一条。' },
    { heading: '序号与块确认归整台设备（§10.3.2.14.2，表 10-5，§35.3.8）', text: 'MLD 向另一台 MLD 发送单播服务质量（quality of service, QoS）数据帧时，序号取自 MLD 维护的序号空间；单播 QoS 数据帧的序号空间按〈Address 1，TID〉区分（表 10-5 的 SNS2）。两台 MLD 之间每个 TID 最多只有一个块确认协议，适用于这个 TID 映射到的所有链路；发起方 MLD 为每个协议维护一个跨链路共用的发送缓存，收到表明某个 MPDU 已被接收的块确认后释放它。接收方在哪条链路上收到 MPDU，就由这条链路上的站点向同一链路上的发起方站点报告接收状态；接收方 MLD 为每个〈对端 MLD，TID〉维护一个共用的重排序缓存。' },
    { heading: '失败的帧可以换一条链路重传（§35.3.16.9）', text: '两台 MLD 之间对某个 TID 已建立块确认协议，而这个 TID 的一个 QoS 数据帧在某条链路上发送失败时，MLD 可以在这个 TID 映射到的任何一条链路上重传它，受这一帧的生存期（MSDU lifetime）限制以及重传所在链路的其他限制约束。' },
    { kind: 'steps', heading: '一帧在多链路操作下的经历，按标准：逐步说明', items: [
      '非 AP MLD 通过一条链路上的站点发出带基本多链路元素的（重新）关联请求，与 AP MLD 建立一条或多条链路（§35.3.5.1）。',
      '没有协商其他映射时，所有 TID 映射到所有已建立的链路（§35.3.7.2.2）。',
      '一个 MSDU 在整台设备这一层取得序号（§10.3.2.14.2），进入这个 TID 的发送缓存（§35.3.8）。',
      '每条链路上的站点各自按 EDCA 竞争；可以用映射到的任何一条链路发送，选哪一条由实现决定（§35.3.16.1，§35.3.7.2.1）。',
      '接收方在同一条链路上回块确认；发起方收到确认后释放对应的帧（§35.3.8）。',
      '发送失败的帧可以在映射到的任何一条链路上重传（§35.3.16.9）。',
    ] },
    { heading: '另外两种形态（§35.3.16.4，§35.3.17）', text: '一对链路如果不能同时收发，就是非同时收发（NSTR）链路对：一条链路上的站点取得发送权后，可以因为会干扰另一条链路上的接收而放弃这次发送。增强型多链路单射频（EMLSR）模式下，非 AP MLD 在几条链路上监听接入点发来的初始控制帧（control frame），然后只在收到这一帧的那条链路上进行帧交换。' },
  ],
  implementation: [
    { topic: '共享的帧在设备这一层', standard: 'MSDU 先经整台设备处理，再按 TID 交给各条链路（§5.1.5.1）', sim: '每台物理设备只有一套四条接入类别（access category, AC）队列，两条链路的 MAC 共用；帧到达时只入队一次，到达与入队记录都写在设备的第一条泳道，即 5 GHz 那条。', kind: 'faithful' },
    { topic: '每条链路各自竞争', standard: '独立竞争，STR 链路对互不影响（§35.3.16.1，§35.3.16.3）', sim: '每条链路各有自己的信道、载波侦听（carrier sense）、退避计数与竞争窗口（contention window, CW）；6 GHz 上发送时，5 GHz 的计数照常进行。', kind: 'faithful' },
    { topic: '链路对的形态', standard: '非 AP MLD 的链路对可以是 STR 或 NSTR，另有 EMLSR 模式（§35.3.16.4，§35.3.17）', sim: '启用 MLO 的节点总是 5 GHz 加 6 GHz 两条 STR 链路，两台电台之间没有任何相互干扰；NSTR 与 EMLSR 都没有实现。', kind: 'absent' },
    { topic: 'TID 到链路的映射', standard: '默认映射：所有 TID 映射到所有链路（§35.3.7.2.2）', sim: '相当于默认映射：任何帧都可以由任何一条链路发出。', kind: 'faithful' },
    { topic: '映射的协商与通告', standard: '可以协商或由接入点通告其他映射（§35.3.7.2.3，§35.3.7.2.4）', sim: '没有实现。', kind: 'absent' },
    { topic: '选哪一条链路', standard: '标准未规定', sim: '有帧到达时唤醒另一条链路，两条链路都开始退避计数；哪条先把计数减到零，就从共享队列取走队首那一批，取走即从队列中移除。', kind: 'choice' },
    { topic: '一次取走多少帧', standard: '标准规定聚合 MPDU（aggregate MPDU, A-MPDU）的上限，具体取多少由发送方决定', sim: '取发往同一个接收方的连续帧，最多 64 帧、5.484 ms 的数据，并且不越过这一轮的结束时刻。', kind: 'value' },
    { topic: '序号空间', standard: '由 MLD 维护，按〈Address 1，TID〉区分（§10.3.2.14.2，表 10-5）', sim: '照此：计数器随共享队列，由整台设备持有，QoS 数据帧按〈Address 1，TID〉各用一个计数器，两条链路不会把同一个序号分配给两个帧。本课的数据帧都属于尽力而为一类，用同一个 TID。', kind: 'faithful' },
    { topic: '块确认协议', standard: '每个 TID 一个协议，经 ADDBA 请求与响应建立（§35.3.8）', sim: '不发 ADDBA，协议视为一开始就存在；块确认由接入点在收到这批帧的同一条链路上发出。', kind: 'absent' },
    { topic: '换链路重传', standard: '可以在映射到的任何一条链路上重传（§35.3.16.9）', sim: '块确认的位图（bitmap）里没有确认的那些帧（整个块确认丢失时是整批）退回共享队列的队首，由下一个先把计数减到零的链路发出。', kind: 'faithful' },
    { topic: '重传次数的上限', standard: 'dot11ShortRetryLimit 的默认值为 7（附录 C）', sim: '一帧重传计数达到 7 就被丢弃并出队；本课 300 ms 内没有发生。', kind: 'value' },
    { topic: '多链路建立', standard: '经（重新）关联请求与响应建立（§35.3.5.1）', sim: '引擎不发任何管理帧（management frame），两条链路从仿真开始时就存在。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '一帧经历的各个步骤',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一个 6 GHz 数据帧。',
        '在日志里往前找到第 66 帧的到达记录，再往后找到 6 GHz 上的块确认与出队记录。',
      ],
      blocks: [
        { kind: 'table', heading: 'MSDU 66，6 GHz 上的第一批', head: ['什么时候', '记录', '记录内容'], rows: [
          ['4.4458 ms', 'ARRIVAL + ENQUEUE · sta-1', '第 66 帧，1500 字节，进入尽力而为队列，深度 1，记录在 5 GHz 那条泳道上。'],
          ['4.5338 ms', 'TX_START · sta-1#6g', '6 GHz 先把计数减到零，一次取走 20 帧，编号 66–85，30,718 字节，调制与编码方式（modulation and coding scheme, MCS）第 13 级。'],
          ['4.5338 ms', 'BACKOFF_DEC · sta-1', '同一时刻，5 GHz 的退避计数还剩 2，即还要再空闲两个时隙（slot time）。'],
          ['6.0468 ms', 'TX_START · ap#6g', '接入点的块确认，32 字节，一次确认这 20 帧。'],
          ['6.0788 ms', '20 × DEQUEUE · sta-1#6g', '这 20 帧离开共享队列。'],
        ] },
      ],
      expect: '第 66 帧在 5 GHz 那条泳道上入队，却由 6 GHz 发出；6 GHz 取走它时，5 GHz 的计数还差 2。块确认也在 6 GHz 上。',
      meaning: '帧只在设备这一层入队一次（①），由先把计数减到零的链路取走，这是本仿真器的选法（②）；块确认在收到这批帧的同一条链路上发回，与 §35.3.8 一致。',
    },
    {
      heading: '两条链路取的是同一组帧',
      jump: 0,
      steps: [
        '运行完 300 ms，数一数笔记本两条泳道上的数据帧。',
        '在帧解码器里打开 6 GHz 上的第一批，记下编号 66–85，再到 5 GHz 的发送里查找这 20 个编号。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '同一组待发的帧，分别从两条链路发出', spec: mloStack(),
          caption: '方块按数据帧数等比例绘制：最初 300 ms 内，笔记本每十帧中有九帧从 6 GHz 那条链路发出。',
        },
      ],
      expect: '5 GHz 上 27 个数据帧，6 GHz 上 235 个；编号 66–85 在 5 GHz 的发送里一个也找不到，两条泳道的序号也没有重复。',
      meaning: '取走即从共享队列中移除，序号由整台设备分配（①）；偏向 6 GHz 不是调度的结果，而是 6 GHz 上没有竞争者，下一课专门测量这一点。',
    },
    {
      heading: '失败的一批由另一条链路发出',
      jump: 2,
      steps: [
        '跳到第 1 帧的重传记录：笔记本在 5 GHz 上发出的请求发送（request to send, RTS）帧与邻居的同时开始，没有等到允许发送（clear to send, CTS）帧。',
        '往后看这一批帧下一次是由哪条泳道发出的；再把场景运行到 1 s，把笔记本的几次失败都找出来，第 16845 帧那一批由另一条链路发出。',
      ],
      blocks: [
        { kind: 'table', heading: '1 s 内笔记本的四次失败', head: ['重传记录', '失败的链路', '这一批下一次由谁发出'], rows: [
          ['0.077 ms，第 1 帧', '5 GHz', '5 GHz，2.9008 ms'],
          ['802.6886 ms，第 16754 帧', '5 GHz', '5 GHz，802.9006 ms'],
          ['808.0264 ms，第 16845 帧', '5 GHz', '6 GHz，808.1826 ms'],
          ['815.9278 ms，第 17010 帧', '5 GHz', '5 GHz，831.4776 ms'],
        ] },
      ],
      expect: '四次失败都发生在 5 GHz，都是笔记本与邻居同时发出 RTS；其中一次，这一批帧下一次由 6 GHz 发出。',
      meaning: '没有收到确认的帧退回共享队列的队首，不带「属于哪条链路」的标记，下一次由先把计数减到零的链路发出（②），这在标准允许的范围之内（①，§35.3.16.9）。',
    },
  ],
  sources: [
    'IEEE Std 802.11be-2024：§35.3.1 与 §35.3.2（MLD 与下挂站点）、§5.1.5.1（MLO 的 MAC 数据面）、§35.3.16.1 与 §35.3.16.3（各链路独立竞争，STR 链路对）、§35.3.7.2.1 与 §35.3.7.2.2（TID 到链路的映射与默认映射）、§10.3.2.14.2（MLD 的序号空间）、§35.3.8（MLO 中的块确认）、§35.3.16.9（换链路重传）、§35.3.5.1（多链路建立）、§35.3.16.4 与 §35.3.17（NSTR 与 EMLSR）。',
    'IEEE Std 802.11-2024：表 10-5（发送方的序号空间）、附录 C 的 dot11ShortRetryLimit。',
    '本仿真器的取法与取值：先把计数减到零的链路取走下一批、一次最多 64 帧、固定的 5 GHz 加 6 GHz 两条 STR 链路、按接收方与接入类别区分的序号计数器、不建立块确认协议。',
  ],
  limits: [],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP (MLO)', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Laptop (MLO)', 'sta', 6.5, 5, 'eht', 'saturated'),
    node('sta-2', 'Neighbor (5G only)', 'sta', 3.5, 5, 'he', 'saturated', { edca: true, ampdu: true, txop: true }),
  ]),
  jumps: [
    J('第一个 5 GHz 数据帧', txOf((r) => linkOfVirtual(r.node) === '5g' && r.frame.kind === 'data' && r.frame.src === 'sta-1')),
    J('第一个 6 GHz 数据帧', first6g),
    J('第 1 帧的重传记录', (r) => r.type === 'RETRY' && r.msduId === 1),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '按标准，笔记本的两条链路之间共享的是什么？',
      options: [
        '发送前的同一个退避计数',
        '序号空间与每个 TID 的块确认发送缓存；信道接入由各条链路独立进行',
        '同一个频段上的同一个信道',
      ],
      answer: 1,
      explain: '§35.3.16.1 要求各站点独立竞争；§10.3.2.14.2 与 §35.3.8 把序号空间和块确认的发送缓存放在整台设备这一层。',
    },
    {
      q: '一批帧没有发送成功，重传次数还未达到上限。下一次由哪条链路发出？',
      options: [
        '标准要求仍由刚刚失败的那一条发出',
        '标准允许映射到的任何一条；本仿真器里由先把计数减到零的那条发出',
        '由接入点指定',
      ],
      answer: 1,
      explain: '§35.3.16.9 允许在映射到的任何链路上重传；本仿真器把失败的一批退回共享队列的队首，由下一个先把计数减到零的链路取走。',
    },
    {
      q: '哪一项是本仿真器自己的取法，而不是标准的规定？',
      options: [
        '默认映射下所有 TID 映射到所有链路',
        '哪条链路先把退避计数减到零，就由哪条发出下一批',
        '每个 TID 只有一个跨链路的块确认协议',
      ],
      answer: 1,
      explain: '标准只说可以用映射到的任何一条链路发送，没有规定选哪一条；「先减到零者发送」是本仿真器的选法。',
    },
  ],
}
