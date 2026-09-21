import { type Lesson, brick, drywallDoor, node, sc, firstMuDl, firstTrigger, first6g, firstCollision, J } from '../lessonKit'

export const capstone: Lesson = {
  id: 'capstone',
  module: 8,
  title: { en: 'Capstone — the busy household', zh: '结业课——热闹的一家人' },
  body: [
    { text: {
      en: 'Everything at once, across three rooms with real walls:',
      zh: '一次上齐所有元素，分布在三个房间、隔着真实的墙：',
    } },
    { kind: 'list', items: [
      { en: 'A Wi-Fi 7 MLO laptop backing up.', zh: '一台 Wi-Fi 7 MLO 笔记本在备份。' },
      { en: 'A Wi-Fi 6 TV and a projector, both streaming.', zh: '一台 Wi-Fi 6 电视和一台投影仪都在推流。' },
      { en: 'A phone on a voice call.', zh: '一部手机在通话。' },
      { en: 'A Wi-Fi 5 tablet browsing.', zh: '一台 Wi-Fi 5 平板在上网。' },
      { en: 'A legacy IoT sensor.', zh: '一个传统 IoT 传感器。' },
    ] },
    { text: {
      en: 'Your task is analysis, not reading — use the tools you now know:',
      zh: '这一课的任务是分析而不是阅读——用你已掌握的工具回答：',
    } },
    { kind: 'list', items: [
      { en: 'Who wins airtime and why?', zh: '谁赢得了空口，为什么？' },
      { en: 'Where do EDCA priorities visibly act?', zh: 'EDCA 的优先级在哪里清晰可见？' },
      { en: 'When does the AP choose MU transmission over TXOP bursts?', zh: 'AP 什么时候选择 MU 传输而不是 TXOP 突发？' },
      { en: 'Which device is the whole network’s bottleneck?', zh: '哪台设备是整个网络的瓶颈？' },
    ] },
  ],
  scenario: () => sc({
    rooms: [
      { x: 0, y: 0, w: 5, h: 8, name: 'Living room' },
      { x: 5, y: 0, w: 5, h: 4, name: 'Study' },
      { x: 5, y: 4, w: 5, h: 4, name: 'Bedroom' },
    ],
    walls: [
      brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0),
      drywallDoor(5, 0, 5, 8, 1.5),
      drywallDoor(5, 4, 10, 4, 2.5),
    ],
  }, [
    node('ap', 'AP (Wi-Fi 7)', 'ap', 2.5, 4, 'eht', 'idle'),
    node('sta-1', 'Laptop MLO', 'sta', 7.5, 2, 'eht', 'saturated'),
    node('sta-2', 'TV (Wi-Fi 6)', 'sta', 1.5, 6.5, 'he', 'video'),
    node('sta-3', 'Phone (voice)', 'sta', 3.5, 2, 'he', 'voice'),
    node('sta-4', 'Tablet (Wi-Fi 5)', 'sta', 7.5, 6.5, 'vht', 'browsing'),
    node('sta-5', 'Sensor (legacy)', 'sta', 9.3, 7.3, 'nonht', 'iot'),
    node('sta-6', 'Projector (Wi-Fi 6)', 'sta', 6, 1, 'he', 'video'),
  ]),
  jumps: [
    J('first MU PPDU', '第一个 MU PPDU', firstMuDl),
    J('first Trigger', '第一个触发帧', firstTrigger),
    J('first collision', '第一次碰撞', firstCollision),
    J('first 6 GHz data', '第一个 6 GHz 数据帧', first6g),
  ],
  observe: [
    { en: 'Rank all devices by airtime share (inspector) — does the ranking match throughput?', zh: '按空口占比给所有设备排序（检视器）——排名和吞吐量一致吗？' },
    { en: 'Find one moment where the phone’s VO access beats a longer-waiting BE queue.', zh: '找到一个手机 VO 接入抢在等得更久的 BE 队列前面的时刻。' },
    { en: 'The legacy sensor is the slowest radio in the house, yet it sends a couple of short frames in five seconds. Before blaming the slowest device (the rate-anomaly lesson), check who actually holds the air: the MLO laptop’s backup takes well over half of 5 GHz and most of 6 GHz.', zh: '传统传感器是屋里最慢的无线电，但五秒里只发了两三个短帧。在把问题归咎于最慢的设备（速率异常那一课）之前，先看看究竟是谁占着空口：MLO 笔记本的备份占了 5 GHz 的一半以上、6 GHz 的大部分。' },
  ],
  tryThis: [
    { en: 'Turn MLO off on the laptop and reload. The backup loses its second radio and moves 37.7 MB instead of 78.0 MB in the five seconds, while the video streams on 5 GHz see the same average latency as before (2.22 ms against 2.26 ms) — the second link bought the laptop throughput, not its neighbours relief. Then stop the backup altogether and watch every other device’s latency collapse to under a millisecond.', zh: '关闭笔记本的 MLO 后重新加载。备份少了一台电台，五秒里只传 37.7 MB 而不是 78.0 MB，而 5 GHz 上视频流的平均时延几乎不变（2.22 ms 对 2.26 ms）——第二条链路买到的是笔记本自己的吞吐量，不是邻居的解脱。再把备份整个停掉，看其他所有设备的时延都降到一毫秒以下。' },
    { en: 'Upgrade the tablet to Wi-Fi 6 with OFDMA — does the AP start grouping it with the TV?', zh: '把平板升级为支持 OFDMA 的 Wi-Fi 6——AP 会开始把它和电视编成 MU 组吗？' },
    { en: 'Design your own house in the editor and predict, before simulating, where collisions will occur.', zh: '在编辑器里设计你自己的房子，并在仿真之前预测碰撞会发生在哪里。' },
  ],
  quiz: [
    {
      q: { en: 'The single highest-leverage upgrade for this network would be…', zh: '对这个网络而言，收益最大的单项升级是……' },
      options: [
        { en: 'Raising the AP transmit power', zh: '提高 AP 的发射功率' },
        { en: 'Replacing the slow legacy sensor', zh: '替换慢速的传统传感器' },
        { en: 'Taming the laptop’s saturated backup — scheduling or rate-limiting it, or keeping it on 6 GHz', zh: '管住笔记本的饱和备份——错峰、限速，或者让它只走 6 GHz' },
      ],
      answer: 2,
      explain: { en: 'Airtime, not bytes or radio age, is the shared resource — so find who holds it. The sensor is the slowest radio but sends a couple of short frames in five seconds; moving it changes nothing measurable. The backup holds most of the air: with it stopped, the video streams fall from 2.26 ms to 0.21 ms, the voice call from 1.90 ms to 0.83 ms and the tablet’s pages from 39 ms to half a millisecond. Note what MLO does and does not do here: it doubles the backup’s own throughput (37.7 MB to 78.0 MB) while the 5 GHz neighbours keep the same average latency — a second link helps its owner, not the band it left behind.', zh: '共享的资源是空口时间，不是字节，也不是设备新旧——所以要找出谁占着它。传感器是最慢的无线电，但五秒里只发两三个短帧，挪动它测不出任何变化。备份占了大部分空口：把它停掉，视频流从 2.26 ms 降到 0.21 ms，语音通话从 1.90 ms 降到 0.83 ms，平板的网页从 39 ms 降到半毫秒。也要看清 MLO 在这里做了什么、没做什么：它让备份自己的吞吐量翻倍（37.7 MB → 78.0 MB），而 5 GHz 上邻居的平均时延几乎不变——第二条链路帮的是它自己，不是它离开的那个频段。' },
    },
  ],
}
