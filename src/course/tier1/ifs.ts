import { type Lesson, N, oneRoom, node, sc, firstData, firstAck, firstBackoffDraw, J } from '../lessonKit'

export const ifs: Lesson = {
  id: 'ifs',
  module: 1,
  title: { en: 'SIFS, DIFS and the ACK dance', zh: 'SIFS、DIFS 与 ACK 之舞' },
  body: [
    { text: {
      en: 'Wi-Fi encodes priority as silence lengths: the shorter the gap you are allowed to wait, the earlier you may speak.',
      zh: 'Wi-Fi 用“沉默的长短”来编码优先级：允许你等的间隙越短，你就能越早开口。',
    } },
    { kind: 'table', head: [
      { en: 'Gap', zh: '间隙' }, { en: 'Length', zh: '时长' }, { en: 'Who may transmit after it', zh: '之后谁可以发送' },
    ], rows: [
      [N('SIFS'), N('16 µs'), { en: 'Only the ongoing exchange (ACK, CTS) — an ACK can never be beaten to the channel.', zh: '只有正在进行的帧交换（ACK、CTS）——所以 ACK 永远不会被抢先。' }],
      [N('DIFS'), { en: '34 µs = SIFS + 2 slots', zh: '34 µs = SIFS + 2 个时隙' }, { en: 'A new contender.', zh: '新的竞争者。' }],
      [N('EIFS'), N('94 µs'), { en: 'Anyone who heard a corrupted frame — it must assume an ACK it could not decode may be in flight.', zh: '听到损坏帧的站点——它必须假设有一个自己没解出的 ACK 正在空中。' }],
    ] },
    { kind: 'steps', heading: { en: 'In the simulation', zh: '在仿真里看' }, items: [
      { en: 'Pause on any exchange and step with −µs/+µs through the gap between DATA and ACK: nothing moves for exactly 16 µs.', zh: '在任意一次帧交换处暂停，用 −µs/+µs 步进穿过 DATA 与 ACK 之间的间隙：整整 16 µs 内空口纹丝不动。' },
      { en: 'Find the gap before a new data frame: at least DIFS, often followed by amber backoff slots.', zh: '再看新数据帧之前的间隙：至少一个 DIFS，之后往往还跟着琥珀色的退避时隙。' },
    ] },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Uploader', 'sta', 6.5, 5, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
    J('first ACK', '第一个 ACK', firstAck),
    J('first backoff draw', '第一次退避抽取', firstBackoffDraw),
  ],
  observe: [
    { en: 'DATA→ACK gap is always exactly one SIFS (16 µs) — step through it µs by µs.', zh: 'DATA→ACK 的间隙永远恰好一个 SIFS（16 µs）——逐微秒步进验证。' },
    { en: 'The station waits DIFS after the ACK before its next access attempt (watch the IFS label above the node).', zh: '终端在 ACK 之后要等一个 DIFS 才开始下一次接入（看节点上方的 IFS 标签）。' },
    { en: 'After each success the station still counts down a fresh backoff — post-transmission backoff (§10.3.4.3).', zh: '每次成功之后终端仍要重新倒数一次退避——这叫发送后退避（§10.3.4.3）。' },
  ],
  tryThis: [
    { en: 'Zoom the timeline to ~200 µs span and measure the DIFS gap against the 9 µs slot grid.', zh: '把时间轴缩放到约 200 µs 的窗口，用 9 µs 时隙刻度量一量 DIFS。' },
    { en: 'In the event log, follow one full cycle: ENQUEUE → IFS → backoff → TX → RX_OK → DEQUEUE.', zh: '在事件日志中跟踪一个完整周期：入队 → IFS → 退避 → 发送 → 接收成功 → 出队。' },
  ],
  quiz: [
    {
      q: { en: 'Why is SIFS shorter than DIFS?', zh: '为什么 SIFS 比 DIFS 短？' },
      options: [
        { en: 'To give responses absolute priority: nobody contending (waiting DIFS) can cut into an ongoing exchange', zh: '让响应帧拥有绝对优先权：等待 DIFS 的竞争者不可能插入正在进行的帧交换' },
        { en: 'Because ACK frames are physically shorter', zh: '因为 ACK 帧本身更短' },
        { en: 'It is a historical accident', zh: '这只是历史遗留' },
      ],
      answer: 0,
      explain: { en: 'The gap hierarchy IS the priority mechanism: SIFS < DIFS guarantees the exchange completes before anyone else may start.', zh: '间隔的长短就是优先级机制本身：SIFS < DIFS 保证帧交换先完成，别人才可能开始。' },
    },
    {
      q: { en: 'A station overhears a corrupted frame. Before contending it must wait…', zh: '终端听到一个损坏的帧，再次竞争前它必须等待……' },
      options: [
        { en: 'DIFS as usual', zh: '照常等 DIFS' },
        { en: 'EIFS (94 µs) — the undecodable frame might be answered by an ACK it must not trample', zh: 'EIFS（94 µs）——那个没解出的帧可能正被 ACK 回复，不能踩到' },
        { en: 'One SIFS', zh: '一个 SIFS' },
      ],
      answer: 1,
      explain: { en: 'EIFS = SIFS + DIFS + the time of an ACK at the lowest mandatory rate (§10.3.2.3.7).', zh: 'EIFS = SIFS + DIFS + 以最低强制速率发送一个 ACK 的时间（§10.3.2.3.7）。' },
    },
  ],
}
