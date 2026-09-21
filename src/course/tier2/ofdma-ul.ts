import { type Lesson, oneRoom, node, sc, firstTrigger, firstMba, J } from '../lessonKit'

export const ofdmaUl: Lesson = {
  id: 'ofdma-ul',
  module: 6,
  title: { en: 'Trigger frames — the AP conducts the uplink', zh: '触发帧——AP 指挥上行' },
  body: [
    { text: {
      en: 'Uplink OFDMA is stranger: multiple stations must start transmitting at the same microsecond, at coordinated power, for the same duration. Only the AP can arrange that.',
      zh: '上行 OFDMA 更奇妙：多台终端必须在同一微秒、以协调的功率、发送同样长的时间。只有 AP 能安排这一切。',
    } },
    { kind: 'steps', items: [
      { en: 'The AP sends a Trigger frame naming the participants and their RUs.', zh: 'AP 先发一个触发帧（Trigger），点名参与者及其 RU。' },
      { en: 'One SIFS later they all fire simultaneously, padded to equal length.', zh: '一个 SIFS 之后所有人同时开火，填充到等长。' },
      { en: 'The AP answers everything with a single Multi-STA BlockAck.', zh: 'AP 再用一个多站点 BlockAck 一次性确认。' },
    ] },
    { text: {
      en: 'What the stations send back is a TB PPDU — TB for trigger-based. It is the one PPDU format a station may only transmit in answer to a Trigger, because the station decides nothing about it. The Trigger dictates:',
      zh: '终端回应的那一帧叫 TB PPDU——TB 即 trigger-based（基于触发）。这是终端只能在应答触发帧时才允许发送的 PPDU 格式，因为关于这一帧的一切都不由终端自己决定。触发帧规定了：',
    } },
    { kind: 'list', heading: { en: 'TB PPDU — set by the Trigger, not the sender', zh: 'TB PPDU——由触发帧而非发送者决定' }, items: [
      { en: 'Which RU to transmit on, so several stations’ PPDUs sit side by side in one channel.', zh: '在哪个 RU 上发送，使多个终端的 PPDU 在同一信道里并排。' },
      { en: 'The MCS and number of spatial streams.', zh: 'MCS 与空间流数。' },
      { en: 'The length: every station pads to the duration the Trigger names, so all TB PPDUs end at the same instant and one Multi-STA BlockAck can answer them after one SIFS.', zh: '长度：每个终端都填充到触发帧指定的时长，所有 TB PPDU 同一瞬间结束，一个 SIFS 后一个多站点 BlockAck 就能统一确认。' },
      { en: 'The transmit power, corrected per station so signals from near and far arrive at the AP at similar levels — the AP has to decode them together.', zh: '发射功率：按终端逐个校正，让远近终端的信号到达 AP 时强度相近——AP 要把它们一起解码。' },
      { en: 'The start: SIFS after the Trigger, aligned in time and frequency to the AP.', zh: '开始时刻：触发帧之后一个 SIFS，在时间与频率上都对齐到 AP。' },
    ] },
    { text: {
      en: 'The stations surrender contention to a conductor — inside these bubbles nobody runs a backoff. Carrier sense is not gone, though: when the Trigger requires it, a station still checks the medium and its NAV before it answers, and stays silent if another BSS has reserved the air.',
      zh: '终端把竞争权交给了指挥家——在这些“泡泡”里没有人做退避。但载波侦听并没有消失：只要 Trigger 要求，终端在回应前仍会检查介质和自己的 NAV，如果别的 BSS 已预约了空口，它就保持沉默。',
    } },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Uploader A', 'sta', 3.5, 5.5, 'he', 'saturated'),
    node('sta-2', 'Uploader B', 'sta', 6.5, 5.5, 'he', 'saturated'),
  ]),
  jumps: [
    J('first Trigger', '第一个触发帧', firstTrigger),
    J('first Multi-STA BlockAck', '第一个多站点 BlockAck', firstMba),
  ],
  observe: [
    { en: 'The yellow Trigger comes from the AP; one SIFS later both uploaders’ green blocks start at the same instant.', zh: '黄色触发帧来自 AP；一个 SIFS 后两台上传终端的绿色块在同一瞬间开始。' },
    { en: 'Both TB PPDUs (trigger-based PPDUs) end together — padded to the length the Trigger named — and one Multi-STA BA answers both. Hover a green block: its duration equals the other’s even though their queues differ.', zh: '两个 TB PPDU（基于触发的 PPDU）同时结束——都填充到触发帧指定的长度——一个多站点 BA 同时确认两者。悬停绿色块：两者时长相同，尽管它们的队列并不一样。' },
    { en: 'Between triggered bursts the stations still contend normally via EDCA.', zh: '在两次触发之间，终端仍照常通过 EDCA 竞争。' },
  ],
  tryThis: [
    { en: 'Watch the Trigger’s Duration field in the decoder: it protects the entire triggered sequence.', zh: '在帧解码器中查看触发帧的 Duration 字段：它保护整个被触发的序列。' },
  ],
  quiz: [
    {
      q: { en: 'Why can’t stations do UL OFDMA without a Trigger?', zh: '没有触发帧，终端为什么无法自行完成上行 OFDMA？' },
      options: [
        { en: 'They lack the RF hardware', zh: '它们缺少射频硬件' },
        { en: 'Independent stations cannot align start time, duration and RU choice by themselves', zh: '相互独立的终端无法自行对齐开始时刻、持续时间与 RU 分配' },
        { en: 'Regulations forbid it', zh: '法规禁止' },
      ],
      answer: 1,
      explain: { en: 'Simultaneity requires central coordination — that is exactly what the Trigger provides.', zh: '“同时”需要中心协调——触发帧提供的正是这一点。' },
    },
  ],
}
