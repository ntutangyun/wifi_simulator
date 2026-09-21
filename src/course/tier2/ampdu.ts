import { type Lesson, oneRoom, node, sc, firstBa, firstAmpdu, J } from '../lessonKit'

export const ampdu: Lesson = {
  id: 'ampdu',
  module: 2,
  title: { en: 'A-MPDU — pay contention once', zh: 'A-MPDU——竞争一次，发一批' },
  body: [
    { text: {
      en: 'Every channel win costs the same overhead whether you send 100 bytes or 60 000:',
      zh: '每赢一次信道，代价都一样——不管你发 100 字节还是 60000 字节：',
    } },
    { kind: 'formula', text: {
      en: 'one win = IFS + backoff + preamble + payload + SIFS + ACK',
      zh: '赢一次 = IFS + 退避 + 前导 + 数据 + SIFS + ACK',
    }, note: {
      en: 'Only the payload term grows with what you send.',
      zh: '只有“数据”这一项随发送量增长。',
    } },
    { text: {
      en: 'As PHY rates grew, that fixed cost began to dwarf the payload: a 1500-byte frame at high MCS spends more time on ceremony than on data.',
      zh: '物理层速率越来越快之后，这笔固定开销开始盖过数据本身：高 MCS 下发一个 1500 字节的帧，“仪式”花的时间比数据还多。',
    } },
    { kind: 'list', heading: { en: 'Aggregation fixes the ratio', zh: '聚合改变了这个比例' }, items: [
      { en: 'Pack up to 64 MPDUs into one PPDU.', zh: '把最多 64 个 MPDU 打包进一个 PPDU。' },
      { en: 'Answer them with a single 32-byte BlockAck whose bitmap can acknowledge each subframe individually. (This simulator currently treats the aggregate as a whole: a collision anywhere in it loses all of it.)', zh: '再用一个 32 字节的 BlockAck，其位图可以逐个确认每个子帧。（本仿真器目前把整个聚合帧当作一个整体：其中任何位置发生碰撞，整批都会丢失。）' },
    ] },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Uploader', 'sta', 6.5, 5, 'vht', 'saturated'),
  ]),
  variants: [
    {
      label: { en: 'Aggregation OFF (same device)', zh: '关闭聚合（同一设备）' },
      scenario: () => sc(oneRoom(), [
        node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
        node('sta-1', 'Uploader', 'sta', 6.5, 5, 'vht', 'saturated', { edca: true, txop: true }),
      ]),
    },
  ],
  jumps: [
    J('first A-MPDU', '第一个 A-MPDU', firstAmpdu),
    J('first BlockAck', '第一个 BlockAck', firstBa),
  ],
  observe: [
    { en: 'Aggregated blocks carry ×n badges; hover to see the MPDU count and total bytes.', zh: '聚合块带有 ×n 角标；悬停可见 MPDU 数量与总字节数。' },
    { en: 'One lilac BlockAck replaces what would have been n separate ACKs.', zh: '一个淡紫色 BlockAck 取代了原本 n 个独立的 ACK。' },
    { en: 'Compare BSS throughput between the two variants — same PHY rate, ~1.5× the goodput here. (The gap is “only” 1.5× because the no-aggregation variant still has TXOP, so it too pays contention once per burst — take the comparison as aggregation’s share alone.)', zh: '比较两个变体的 BSS 吞吐量——物理速率相同，有效吞吐约为 1.5 倍。（差距“只有”1.5 倍，是因为不聚合的变体仍开着 TXOP，同样只在每次突发时付一次竞争——这组对比反映的仅是聚合本身的贡献。）' },
  ],
  tryThis: [
    { en: 'Watch the queue in the inspector drain 14 frames per channel win instead of 1 (14 is what fits under the AC_BE TXOP limit here once the RTS/CTS that opens it and the BlockAck are counted, not the 64-MPDU A-MPDU ceiling).', zh: '在检视器里观察队列每赢一次信道就清掉 14 帧，而不是 1 帧（14 是算上开场的 RTS/CTS 和 BlockAck 之后，AC_BE 的 TXOP 限值所容纳的数量，并非 A-MPDU 的 64 帧上限）。' },
  ],
  quiz: [
    {
      q: { en: 'Where does most of A-MPDU’s throughput gain come from?', zh: 'A-MPDU 的吞吐量收益主要来自哪里？' },
      options: [
        { en: 'Higher modulation', zh: '更高的调制阶数' },
        { en: 'Amortizing the fixed per-win overhead (contention, preamble, ACK) over many frames', zh: '把每次获胜的固定开销（竞争、前导、确认）摊到许多帧上' },
        { en: 'Shorter MAC headers', zh: '更短的 MAC 头' },
      ],
      answer: 1,
      explain: { en: 'The PHY rate is unchanged — only the ceremony-to-data ratio improves.', zh: '物理速率没变——变的只是“仪式与数据”的比例。' },
    },
  ],
}
