import { type Lesson, oneRoom, node, sc, txOf, firstMuDl, J } from '../lessonKit'

export const ofdmaDl: Lesson = {
  id: 'ofdma-dl',
  module: 6,
  title: { en: 'OFDMA downlink — one PPDU, many stations', zh: 'OFDMA 下行——一个 PPDU，多个终端' },
  body: [
    { text: {
      en: 'Wi-Fi 5 (802.11ac) could already reach several receivers at once on the downlink with MU-MIMO, splitting them by space. Wi-Fi 6 adds OFDMA, which splits the channel by frequency, and extends multi-user transmission to the uplink — so small frames for many stations no longer each cost a contention. This simulator models multi-user transmission for Wi-Fi 6 and 7 only.',
      zh: 'Wi-Fi 5（802.11ac）已经能用 MU-MIMO 在下行同时发给多个接收者（按空间区分）。Wi-Fi 6 又加入了 OFDMA（按频率切分信道），并把多用户传输扩展到上行——给许多终端的小帧不必再各自竞争一次。本模拟器只对 Wi-Fi 6 和 7 模拟多用户传输。',
    } },
    { kind: 'list', heading: { en: 'OFDMA downlink', zh: 'OFDMA 下行' }, items: [
      { en: 'The AP splits the channel into resource units (RUs) and addresses several stations inside a single MU PPDU.', zh: 'AP 把信道切成资源单元（RU），在一个 MU PPDU 里同时向多台终端发送。' },
      { en: 'Each station decodes only its own RU.', zh: '每台终端只解调自己的 RU。' },
      { en: 'The acknowledgements can come back simultaneously too. In the standard the AP solicits them (with a Trigger, or the TRS field in each station’s part) and they return as trigger-based PPDUs; the simulator draws them as BlockAcks on each station’s share.', zh: '确认帧也可以同时返回。标准里由 AP 发起征询（Trigger 帧，或各终端数据里的 TRS 字段），终端以基于触发的 PPDU 返回；模拟器把它们画成各终端所占份额上的 BlockAck。' },
    ] },
    { text: {
      en: 'Contention happens once per group, and the MAC starts to look like a scheduler.',
      zh: '整组只需竞争一次，MAC 开始有了“调度器”的样子。',
    } },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV 1', 'sta', 3, 5.5, 'he', 'video'),
    node('sta-2', 'TV 2', 'sta', 5, 6.5, 'he', 'video'),
    node('sta-3', 'TV 3', 'sta', 7, 5.5, 'he', 'video'),
  ]),
  jumps: [
    J('first DL MU PPDU', '第一个下行 MU PPDU', firstMuDl),
    J('simultaneous BlockAcks', '同时发出的 BlockAck', txOf((r) => r.frame.kind === 'ba' && r.frame.orthogonalGroup !== undefined)),
  ],
  observe: [
    { en: 'Hover the wide blue block: “DL MU PPDU → n stations”, with per-user parts inside.', zh: '悬停宽蓝块：“下行 MU PPDU → n 个终端”，内部含每用户的分片。' },
    { en: 'After one SIFS, several BA blocks start at the *same instant* on different lanes — RU-orthogonal, no collision.', zh: '一个 SIFS 之后，多个 BA 块在不同泳道的同一瞬间开始——RU 正交，互不碰撞。' },
    { en: 'Compare with lesson 9: there every frame to a TV was its own exchange with its own ACK, one after another; here one PPDU carries frames for two TVs at once and their BlockAcks come back together.', zh: '对比第 9 课：那里发给电视的每一帧都是一次独立的交换、各回各的 ACK、一个接一个；这里一个 PPDU 同时装着发给两台电视的帧，它们的 BlockAck 也一起返回。' },
  ],
  tryThis: [
    { en: 'Turn OFDMA off on one TV: it drops out of MU groups and is served separately.', zh: '关闭其中一台电视的 OFDMA：它会退出 MU 分组，被单独服务。' },
  ],
  quiz: [
    {
      q: { en: 'Why don’t the simultaneous BlockAcks collide?', zh: '同时发出的多个 BlockAck 为什么不会碰撞？' },
      options: [
        { en: 'They are very short', zh: '因为它们很短' },
        { en: 'Each occupies a different RU (subcarrier set) — orthogonal, not overlapping', zh: '每个占用不同的 RU（子载波集合）——正交而不重叠' },
        { en: 'The AP cancels the interference', zh: 'AP 消除了干扰' },
      ],
      answer: 1,
      explain: { en: 'OFDMA divides frequency, not time: parallel transmissions share the channel without interfering.', zh: 'OFDMA 分的是频率而不是时间：并行传输共享信道而互不干扰。' },
    },
  ],
}
