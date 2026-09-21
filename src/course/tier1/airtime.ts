import { type Lesson, oneRoom, node, sc, firstData, firstAck, J } from '../lessonKit'

export const airtime: Lesson = {
  id: 'airtime',
  module: 0,
  title: { en: 'Frames cost airtime', zh: '帧要花“空口时间”' },
  body: [
    { text: {
      en: 'The MAC manages one shared, half-duplex medium. Its currency is airtime: while any frame is in the air, nobody else in range can use the channel.',
      zh: 'MAC 管理的是一条共享的半双工介质，它的“货币”就是空口时间：只要有帧在空中，范围内的其他设备都用不了信道。',
    } },
    { kind: 'formula', text: {
      en: 'airtime = fixed preamble + payload symbols (bytes ÷ data rate)',
      zh: '空口时间 = 固定前导 + 数据符号（字节数 ÷ 速率）',
    }, note: {
      en: 'A bigger frame costs more; a higher MCS costs less.',
      zh: '帧越大耗时越长，MCS 越高耗时越短。',
    } },
    { text: {
      en: 'Everything the MAC does — waiting, backing off, aggregating, scheduling — exists to spend this airtime well.',
      zh: 'MAC 做的一切——等待、退避、聚合、调度——都是为了把空口时间花得值。',
    } },
    { kind: 'list', heading: { en: 'In the simulation', zh: '在仿真里看' }, items: [
      { en: 'One AP streams video to one station.', zh: '一个 AP 向一台终端推送视频流。' },
      { en: 'Hover a blue block in the timeline: you can read its size, MCS and exact duration.', zh: '将鼠标悬停在时间轴的蓝色块上，可以看到帧大小、MCS 与精确时长。' },
      { en: 'The white ACK is tiny but never optional — the sender cannot hear collisions, so only the ACK proves delivery.', zh: '白色的 ACK 很小却必不可少——发送方听不到碰撞，只有 ACK 能证明帧已送达。' },
    ] },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV', 'sta', 7, 5.5, 'he', 'video'),
  ]),
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK', '第一个 ACK', firstAck),
  ],
  observe: [
    { en: 'Each blue block’s length equals its real duration — hover to read bytes, MCS, µs.', zh: '每个蓝色块的长度就是真实时长——悬停可读出字节数、MCS 与微秒数。' },
    { en: 'The ACK follows exactly 16 µs (one SIFS) after the data block ends.', zh: 'ACK 恰好在数据块结束后 16 µs（一个 SIFS）出现。' },
    { en: 'Between exchanges the channel is idle — video at this rate uses under a fifth of the airtime.', zh: '两次帧交换（数据帧 + 紧随其后的 ACK）之间信道是空闲的——这个码率的视频占用的空口时间不到五分之一。' },
  ],
  tryThis: [
    { en: 'Open the scenario in the editor, set the TV to 802.11a (legacy), and compare frame durations.', zh: '在编辑器中打开场景，把电视改成 802.11a（传统模式），比较帧时长的变化。' },
    { en: 'Drag the TV far from the AP: the MCS drops, and the same frames get longer.', zh: '把电视拖到离 AP 很远的位置：MCS 下降，同样的帧变得更长。' },
  ],
  quiz: [
    {
      q: { en: 'Why does Wi-Fi need ACK frames at all?', zh: 'Wi-Fi 为什么必须要有 ACK 帧？' },
      options: [
        { en: 'To tell other stations to stay silent', zh: '通知其他终端保持沉默' },
        { en: 'The transmitter cannot detect collisions itself — the ACK is its only proof of delivery', zh: '发送方自己检测不到碰撞——ACK 是唯一的送达证明' },
        { en: 'To carry the receiver’s data rate preferences', zh: '携带接收方的速率偏好' },
      ],
      answer: 1,
      explain: { en: 'Radios are half-duplex: while transmitting they cannot listen, so a missing ACK is the only sign of failure (§10.3.2.9).', zh: '无线电是半双工的：发送时无法侦听，所以“没收到 ACK”是唯一的失败信号（§10.3.2.9）。' },
    },
    {
      q: { en: 'Two frames carry the same payload; one uses a higher MCS. Which occupies the medium longer?', zh: '两个帧载荷相同，其中一个用了更高的 MCS。哪个占用介质更久？' },
      options: [
        { en: 'The higher-MCS frame', zh: '高 MCS 的帧' },
        { en: 'The lower-MCS frame', zh: '低 MCS 的帧' },
        { en: 'Identical — airtime depends only on bytes', zh: '一样——空口时间只取决于字节数' },
      ],
      answer: 1,
      explain: { en: 'More bits per symbol means fewer symbols: higher MCS = shorter airtime for the same bytes.', zh: '每符号承载更多比特意味着符号更少：同样字节数下，MCS 越高空口时间越短。' },
    },
  ],
}
