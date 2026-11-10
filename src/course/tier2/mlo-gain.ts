/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · what the second link is worth.
 *
 * Standard-first shape (2026-11-11). ① what IEEE Std 802.11be-2024 says that bears on what a
 * second link buys — independent contention per link (§35.3.16.1), any mapped link may carry a
 * frame and the standard does not say which (§35.3.7.2.1), and the two tools it gives an AP MLD to
 * steer that choice, a negotiated or advertised TTLM (§35.3.7.2.3, §35.3.7.2.4) and link
 * recommendation for load balancing (§35.3.7.1, §35.3.7.4); ② how this engine fills the gap the
 * standard leaves; ③ the three runs that price the second link — the base scene, the laptop with
 * MLO off and the neighbour with two radios too.
 *
 * It loads `mlo`'s own scene unchanged (`sameSceneAs`) and has no variants: the two comparison runs
 * are editor edits, as before, so the recorded timeline hash is the same run twice. Every figure is
 * read back out of this file by tests/course/mlo-gain.test.ts and compared with a run.
 */
import { type Lesson, oneRoom, node, sc, txOf, first6g, J } from '../lessonKit'
import { linkOfVirtual } from '../../model/caps'

export const mloGain: Lesson = {
  id: 'mlo-gain',
  module: 9,
  title: '第二条链路的价值取决于那个频段有多空闲',
  why: 'IEEE 802.11be-2024 的多链路操作（multi-link operation, MLO）让多链路设备（multi-link device, MLD）的每条链路（link）独立竞争信道，并允许设备用映射到的任何一条链路发送，但没有规定选哪一条；接入点（access point, AP）可以用业务标识（traffic identifier, TID）到链路的映射或链路推荐来引导这一选择，标准把后者明确说成为了在各条链路之间平衡负载。本仿真器不实现这两种引导，由先把退避（backoff）计数减到零的链路发送。于是第二条链路的价值完全取决于它所在的频段有多空闲：在这个房间里，邻居占满了 5 GHz，6 GHz 上只有笔记本和接入点，两条链路的速率相同，笔记本最初 300 ms 的数据帧（data frame）却每五帧中有四帧从 6 GHz 发出。关闭第二条链路，笔记本发出的帧从 307 个降到 116 个，发送前的平均等待增加到两倍以上；没有第二条链路的邻居也从 185 帧降到 116 帧，因为笔记本把发送转移到 6 GHz，为它让出了 5 GHz 的空口时间（airtime）。给邻居也配备两条链路，6 GHz 不再空闲，笔记本的发送在两个频段之间几乎平分，总量降到 258 帧。',
  outcomes: [
    '说出标准对「用哪条链路发送」规定了什么、没有规定什么，以及接入点可以用哪两种办法引导这一选择',
    '测量第二条链路的收益：拥有它的设备多发了多少帧，发送前的等待缩短了多少',
    '说出关闭第二条链路之后邻居为什么反而更差，以及给邻居也配备两条链路之后收益为什么变小',
  ],
  needs: ['mlo'],
  terms: [
    { term: 'link', plain: '一个频段上的一台电台，有自己的信道，独立参与信道竞争' },
    { term: 'MLO', plain: '多链路操作：让一台设备的两条链路同时运行，两条链路从同一组待发的帧里取帧' },
  ],
  standard: [
    { heading: '每条链路各自竞争（§35.3.16.1）', text: '下挂于 MLD 的站点（station, STA）在自己的链路上独立于同一 MLD 的其他站点竞争介质（medium），除非另有明文规定。一条链路上的竞争者有多少、有多忙，只影响这条链路上的站点。' },
    { heading: '可以用任何一条，标准不规定用哪一条（§35.3.7.2.1）', text: '一个 TID 在上行（uplink, UL）方向映射到一组启用的链路时，非 AP MLD 可以用这组链路中的任何一条发送这个 TID 的单播 MPDU（MAC protocol data unit）。默认映射下，所有 TID 映射到所有已建立的链路（§35.3.7.2.2）。标准没有规定在这组链路中选哪一条。' },
    { heading: '接入点引导链路使用的两种办法（§35.3.7.1，§35.3.7.2.3，§35.3.7.4）', text: '链路管理一节列出了影响链路使用的机制。其一是协商或由接入点通告 TID 到链路的映射（TID-to-link mapping, TTLM），把某些 TID 限制在部分链路上，甚至禁用某条链路。其二是链路推荐：AP MLD 可以发送链路推荐帧，为一组非 AP MLD 标出建议使用的链路，收到推荐的非 AP MLD 应当在这些链路上收发；标准把这一机制说成是为了在 AP MLD 下挂的各个接入点之间平衡负载。' },
    { kind: 'steps', heading: '接入点用链路推荐引导负载，按标准：逐步说明', items: [
      'AP MLD 下挂的一个接入点发送链路推荐帧，地址 1（Address 1）为广播地址（§35.3.7.4）。',
      '帧中的 AID 位图（bitmap）标出要给哪些非 AP MLD 推荐；每个被标出的 MLD 对应一个按链路编号排列的位图，置 1 的位就是推荐的链路。',
      '被禁用的链路不得被推荐。',
      '收到推荐的非 AP MLD 应当在推荐的启用链路上进行上行与下行（downlink, DL）的帧交换，同时遵守 TID 到链路的映射。',
    ] },
  ],
  implementation: [
    { topic: '选哪一条链路', standard: '标准未规定（§35.3.7.2.1）', sim: '哪条链路先把退避计数减到零，就取走共享队列（queue）里的下一批帧；没有任何测量，也不比较两条链路的负载。', kind: 'choice' },
    { topic: 'TID 到链路的映射', standard: '可以协商或通告非默认映射（§35.3.7.2.3，§35.3.7.2.4）', sim: '只有默认映射，所有帧都可以由任何一条链路发出。', kind: 'absent' },
    { topic: '链路推荐', standard: 'AP MLD 可以为非 AP MLD 推荐链路，以平衡负载（§35.3.7.4）', sim: '没有实现；接入点不会把笔记本引向哪条链路。', kind: 'absent' },
    { topic: '6 GHz 上的其他网络', standard: '同一信道上可以有别的基本服务集（basic service set, BSS），标准称之为重叠 BSS（OBSS，§3.1）',sim: '场景校验要求恰好一个接入点，所以 6 GHz 上除了笔记本和接入点不可能有第三台设备；本课测得的收益是一个没有邻近网络的频段上的收益。', kind: 'differs' },
    { topic: '两个频段的传播差别', standard: '标准不规定传播模型', sim: '6 GHz 的路径损耗（path loss）一律比 5 GHz 多计 1.2 dB，与距离、墙体无关；在本课的距离上，两条链路使用同一级调制与编码方式（modulation and coding scheme, MCS）。', kind: 'choice' },
    { topic: '多链路的省电', standard: '多链路设备有专门的省电规定（§35.3.12）', sim: '没有任何能量模型，多一台电台在这里没有功耗代价。', kind: 'absent' },
    { topic: '运行的随机性', standard: '标准不涉及', sim: '每张表都来自同一个随机种子的一次 300 ms 运行；同一个场景每次给出同一组数，所以表中的数不带误差范围。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '帧流向空闲的那个频段',
      jump: 1,
      steps: [
        '载入本课场景，跳到第一个 6 GHz 数据帧，运行完 300 ms。',
        '在检视器里读出笔记本两条泳道的数据帧数、占用的空口时间与占该频段时间的比例，再读邻居的同一组数。',
      ],
      blocks: [
        { kind: 'table', heading: '最初 300 ms 内，笔记本的帧从哪个频段发出', head: ['泳道', '数据帧', '占用的空口时间', '占该频段时间的比例（含应答）'], rows: [
          ['5 GHz', '67', '53.9 ms', '18.3%'],
          ['6 GHz', '240', '249.6 ms', '84.2%'],
        ] },
      ],
      expect: '两条链路都以 MCS 13、172.1 Mb/s 发送；6 GHz 上 240 帧，5 GHz 上 67 帧，每五帧中有四帧从 6 GHz 发出。邻居发出 185 帧，占用 5 GHz 69.9% 的时间。',
      meaning: '速率相同，偏向只来自竞争：6 GHz 上没有其他竞争者，先把计数减到零的多半是那条链路。标准允许用任何一条链路（①），「先减到零者发送」是本仿真器的选法（②）。',
    },
    {
      heading: '关闭第二条链路',
      steps: [
        '在编辑器里关闭笔记本的 MLO，重新载入，运行完同样的 300 ms。',
        '对照下表读出两台设备的数据帧数与发送前的平均等待。',
      ],
      blocks: [
        { kind: 'table', heading: '同样的 300 ms，关闭 MLO', head: ['测量对象', 'MLO 开', 'MLO 关'], rows: [
          ['笔记本的数据帧', '307', '116'],
          ['笔记本发送前的平均等待（5 GHz / 6 GHz）', '1.29 / 1.54 ms', '3.25 ms'],
          ['邻居的数据帧', '185', '116'],
          ['邻居发送前的平均等待', '2.58 ms', '4.18 ms'],
        ] },
      ],
      expect: '笔记本只剩一条泳道，116 帧，平均等待增加到两倍以上；邻居也降到 116 帧，两台设备发出的帧数相同。',
      meaning: '两台设备在同一条信道上按同一套增强型分布式信道接入（enhanced distributed channel access, EDCA）规则竞争，长期平均下来各得一半。第二条链路把笔记本的大部分发送移到另一条信道上，也为邻居让出了空口时间；收益要关闭再运行一次才能测出，只看一次运行无法区分这是链路带来的，还是频段本来就空闲。',
    },
    {
      heading: '给邻居也配备两条链路',
      steps: [
        '把笔记本改回原样，在编辑器里把邻居换成支持 MLO 的 Wi-Fi 7 电台，重新载入，运行完 300 ms。',
        '读出两台设备在两个频段上各发出多少帧。',
      ],
      blocks: [
        { kind: 'table', heading: '邻居也有两条链路时，各自的帧落在哪个频段', head: ['泳道', '笔记本的帧', '邻居的帧'], rows: [
          ['5 GHz', '122', '132'],
          ['6 GHz', '136', '106'],
        ] },
      ],
      expect: '笔记本的发送在两个频段之间几乎平分，总量从 307 帧降到 258 帧。',
      meaning: '第二条链路带来的是进入一个更空闲频段的机会，而不是更多的空口时间；邻居也进入那个频段之后，两台设备在两个频段上都相互竞争。标准里能让接入点主动分配两条链路负载的是链路推荐与 TTLM（①），本仿真器都没有实现（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.11be-2024：§35.3.16.1（各链路独立竞争）、§35.3.7.2.1 与 §35.3.7.2.2（可以用映射到的任何一条链路，默认映射）、§35.3.7.1（链路管理的各项机制）、§35.3.7.2.3 与 §35.3.7.2.4（映射的协商与通告）、§35.3.7.4（链路推荐）、§35.3.12（多链路的省电）。IEEE Std 802.11-2024：§3.1（OBSS 的定义）。',
    '本仿真器的取法与取值：先把计数减到零的链路发送、6 GHz 一律多计 1.2 dB 的路径损耗、恰好一个接入点的场景校验、确定性的随机种子；平均等待是每一帧从入队到开始发送的时间，按泳道统计。',
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
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '关闭笔记本的 MLO，只剩 5 GHz 那条链路。邻居会怎样？',
      options: [
        '变好——笔记本让出了 6 GHz，5 GHz 上只有它们两台',
        '变差——笔记本现在每一帧都要在 5 GHz 上竞争，邻居从 185 帧降到 116 帧',
        '没有变化——两台设备本来就互不相干',
      ],
      answer: 1,
      explain: '第二条链路把一台重载上传的设备从这条共享信道上移开了。关闭它不是把频段还给邻居，而是让邻居失去空口时间。',
    },
    {
      q: '给邻居也配备两条链路，笔记本会怎样？',
      options: [
        '不变：它保持原有的优势，因为它先使用了那个空闲的频段',
        '它的发送几乎平分，总量从 307 帧降到 258——第二个频段的价值只在于它空闲',
        '接入点会拒绝为第二台设备建立第二条链路',
      ],
      answer: 1,
      explain: '第二条链路带来的是进入一个更空闲频段的机会，而不是更多的空口时间。邻居也进入那个频段之后，两台设备在两个频段上都相互竞争。',
    },
    {
      q: '按标准，接入点可以用什么办法引导笔记本把负载放到某一条链路上？',
      options: [
        '标准没有任何办法，只能由笔记本自己决定',
        'TID 到链路的映射与链路推荐',
        '调高那条链路的发射功率（transmit power）',
      ],
      answer: 1,
      explain: '§35.3.7 的链路管理给出了这两种机制，§35.3.7.4 的链路推荐明确用于平衡负载；本仿真器都没有实现。',
    },
  ],
}
