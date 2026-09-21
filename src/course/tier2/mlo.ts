import { type Lesson, oneRoom, node, sc, txOf, first6g, J } from '../lessonKit'
import { linkOfVirtual } from '../../model/caps'

export const mlo: Lesson = {
  id: 'mlo',
  module: 6,
  title: { en: 'MLO — one queue, two radios', zh: 'MLO——一条队列，两台电台' },
  body: [
    { text: {
      en: 'Wi-Fi 7’s Multi-Link Operation can run complete, independent MACs on two bands at once — here 5 and 6 GHz, the simultaneous two-radio form this simulator models. (MLO also comes as single-radio EMLSR, common in phones, which listens on several links but transmits on one at a time, and it can pair other bands such as 2.4 + 5 GHz.) The trick is above the links: a single MLD-level queue feeds both.',
      zh: 'Wi-Fi 7 的多链路操作（MLO）可以在两个频段上同时运行两套完整独立的 MAC——这里是 5 GHz 和 6 GHz，也就是本模拟器所模拟的双射频同时收发形态。（MLO 还有手机上常见的单射频 EMLSR 形态：在多条链路上监听，但同一时刻只在一条上发送；也可以组合 2.4 + 5 GHz 等其他频段。）妙处在链路之上：一条 MLD 级共享队列同时喂给两条链路。',
    } },
    { kind: 'list', items: [
      { en: 'Each link contends on its own channel with its own backoff.', zh: '每条链路在自己的信道上独立退避、独立竞争。' },
      { en: 'Whichever wins airtime first claims the next frames from the shared queue.', zh: '谁先赢得空口，谁就从共享队列领走下一批帧。' },
      { en: 'If a set fails on one link, the other may retry it.', zh: '一条链路上失败的帧，另一条可以代为重传。' },
    ] },
    { text: {
      en: 'Congestion on one band simply shifts traffic to the other — latency stops depending on any single channel’s luck.',
      zh: '某个频段拥塞，流量会自然流向另一个——时延不再取决于任何单一信道的运气。',
    } },
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
    { en: 'The laptop has two lanes (·6G marked); both carry data blocks drawn from one queue.', zh: '笔记本有两条泳道（标 ·6G）；两条都在发送来自同一条队列的数据块。' },
    { en: 'The 5 GHz-only neighbor congests that band — watch the laptop’s traffic lean toward 6 GHz.', zh: '只在 5 GHz 的邻居把该频段挤满——看笔记本的流量偏向 6 GHz。' },
    { en: '6 GHz transmissions render as wireframe spheres in the 3D view.', zh: '在 3D 视图中，6 GHz 的传输显示为线框球。' },
  ],
  tryThis: [
    { en: 'Turn MLO off on the laptop: it falls back to one lane and shares 5 GHz with the neighbor.', zh: '关闭笔记本的 MLO：它退回单泳道，与邻居挤在 5 GHz。' },
  ],
  quiz: [
    {
      q: { en: 'In STR MLO, what do the two links share?', zh: '在 STR 模式的 MLO 中，两条链路共享的是什么？' },
      options: [
        { en: 'One backoff counter', zh: '同一个退避计数器' },
        { en: 'The transmit queue — contention and retries stay per-link', zh: '发送队列——竞争与重传仍各自独立' },
        { en: 'The same radio channel', zh: '同一个射频信道' },
      ],
      answer: 1,
      explain: { en: 'Each link is a full MAC with its own CSMA state; only the buffered frames are pooled at the MLD level.', zh: '每条链路都是带完整 CSMA 状态的 MAC；只有缓存的帧汇聚在 MLD 层。' },
    },
  ],
}
