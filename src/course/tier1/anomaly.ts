import { type Lesson, N, longApartment, node, sc, firstData, J } from '../lessonKit'

export const anomaly: Lesson = {
  id: 'anomaly',
  module: 1,
  title: { en: 'Rate anomaly — fairness gone wrong', zh: '速率异常——“公平”的反面' },
  body: [
    { text: {
      en: 'DCF is fair in transmission opportunities: on average every saturated station wins the channel equally often. But a win is measured in frames, not microseconds.',
      zh: 'DCF 的公平是“传输机会公平”：平均而言每台饱和终端赢得信道的次数相同。但赢一次的单位是“帧”，不是“微秒”。',
    } },
    { text: {
      en: 'A distant station that only decodes a low MCS holds the medium many times longer per frame — so “fair” wins translate into wildly unfair airtime, and the slow station drags down everyone’s throughput. This is the famous performance anomaly of 802.11.',
      zh: '远处的终端只能用低 MCS，每一帧都要占用长得多的空口时间——于是“公平的次数”换来的是极不公平的空口占用，慢终端拖垮了所有人的吞吐量。这就是 802.11 著名的性能异常。',
    } },
    { heading: { en: 'The near station also wins every collision (capture effect)', zh: '近端终端还赢下了每一次碰撞（捕获效应）' }, text: {
      en: 'Watch the very first microsecond. Both stations find the medium idle from the start, so neither needs a backoff, and both transmit at t = 0 — a textbook collision. Yet the AP decodes the near station’s frame perfectly and acknowledges it, while the far station gets nothing. That is the capture effect.',
      zh: '看第一个微秒。两台终端一开始就发现介质空闲，都无需退避，于是都在 t = 0 开始发送——一次教科书式的碰撞。可是 AP 完好地解出了近端终端的帧并回了 ACK，远端终端却颗粒无收。这就是捕获效应。',
    } },
    { kind: 'table', head: [
      { en: 'Reception', zh: '接收' }, { en: 'Wanted signal', zh: '目标信号' }, { en: 'Interferer', zh: '干扰' }, { en: 'Margin', zh: '余量' }, { en: 'Needed', zh: '所需' },
    ], rows: [
      [{ en: 'Near data at the AP', zh: 'AP 收近端数据' }, N('−35 dBm'), { en: 'far station, −75 dBm', zh: '远端终端，−75 dBm' }, N('40 dB'), { en: '26 dB for 54 Mb/s', zh: '54 Mb/s 需 26 dB' }],
      [{ en: 'ACK at the near station', zh: '近端收 ACK' }, N('−30 dBm'), { en: 'far station still on air, −74 dBm', zh: '远端仍在发，−74 dBm' }, N('44 dB'), { en: '17 dB for the 24 Mb/s ACK', zh: '24 Mb/s 的 ACK 需 17 dB' }],
    ] },
    { text: {
      en: 'The 40 dB gap is opened by 11 m of apartment and one brick wall. Before a receiver can decode anything it must detect the preamble, and a preamble is detected only if it stands at least 4 dB above everything else on the air. The near preamble clears that with 40 dB to spare, so the AP locks onto it; the far one sits 40 dB under it, is never detected, and only adds interference to the reception in progress. A locked receiver treats everything arriving afterwards as noise — and while it is still acquiring, a preamble markedly stronger than the one it holds makes it abandon that reception and re-sync to the newcomer. A simultaneous start is won by the stronger signal, never by the earlier one.',
      zh: '这 40 dB 是 11 m 的房长加一道砖墙拉开的。接收机要解出任何东西，先得检测到前导码，而前导码只有比空中其他一切信号至少高出 4 dB 才会被检测到。近端的前导码以 40 dB 的富余越过了这道门槛，于是 AP 锁定了它；远端的前导码比它低 40 dB，根本没被检测到，只是给正在进行的接收添了一份干扰。接收机锁定一个前导后，把此后到达的一切都当作噪声——但在它还处于前导捕获阶段时，一个明显强于当前信号的新前导会让它丢弃手头的接收、改而同步到新来者。所以同时起跑的胜负取决于信号强弱，而不是谁先开口。',
    } },
    { text: {
      en: 'The far station’s 704 µs frame is destroyed in full. It learns nothing until its ACK timeout at 749 µs, then retries with a doubled contention window. Nothing on the timeline is drawn as a collision, because from the AP’s point of view no reception failed — the only visible trace is that unexplained retry on the far lane.',
      zh: '远端终端那 704 µs 的帧被整帧毁掉。它要等到 749 µs 的 ACK 超时才知情，然后带着翻倍的竞争窗口重传。时间轴上不会画出任何碰撞标记，因为在 AP 看来没有任何一次接收失败——唯一可见的痕迹，是远端泳道上那次没有来由的重传。',
    } },
    { kind: 'table', head: [
      { en: 'Station', zh: '终端' }, { en: 'ACK timeouts in 200 ms', zh: '200 ms 内的 ACK 超时次数' },
    ], rows: [
      [{ en: 'Near', zh: '近端' }, N('0')],
      [{ en: 'Far', zh: '远端' }, N('15')],
    ] },
    { text: {
      en: 'So the anomaly cuts deeper than airtime: the distant station pays twice, holding the medium far longer per frame and losing every simultaneous start it takes part in.',
      zh: '所以性能异常比“空口时间”更深一层：远端终端要付两遍代价——每帧占用长得多的空口，还输掉它参与的每一次同时起跑。',
    } },
  ],
  scenario: () => sc(longApartment(), [
    node('ap', 'AP', 'ap', 4, 4, 'eht', 'idle'),
    node('sta-1', 'Near & fast', 'sta', 4.8, 4.3, 'nonht', 'saturated'),
    node('sta-2', 'Far & slow', 'sta', 15, 7, 'nonht', 'saturated'),
  ]),
  jumps: [
    J('first data frame', '第一个数据帧', firstData),
  ],
  observe: [
    { en: 'The far station’s green blocks are much longer than the near one’s — same bytes, lower MCS.', zh: '远端终端的绿色块比近端的长得多——字节数相同，MCS 更低。' },
    { en: 'Inspector: both deliver a comparable number of frames (209 and 135 in the first 200 ms), yet the far station holds more than twice the airtime.', zh: '检视器：两者“成功交付帧数”相当（前 200 ms 里分别是 209 和 135），远端终端占用的空口时间却是近端的两倍多。' },
    { en: 'The near station’s throughput is far below what it would get alone: 209 frames in 200 ms here, 510 with the far station gone.', zh: '近端终端的吞吐量远低于它独占信道时的水平：这里 200 ms 送出 209 帧，去掉远端终端后是 510 帧。' },
    { en: 'At t = 0 both stations transmit at once, yet only the near one is acknowledged — capture. The far lane’s only clue is an ACK timeout at 749 µs.', zh: 't = 0 两台终端同时开始发送，却只有近端收到 ACK——这就是捕获。远端泳道上唯一的线索，是 749 µs 处的 ACK 超时。' },
  ],
  tryThis: [
    { en: 'Delete the far station in the editor and reload: watch the near one’s throughput jump.', zh: '在编辑器中删除远端终端后重新载入：看近端吞吐量飙升。' },
    { en: 'Give both stations A-MPDU (Wi-Fi 5): aggregation partially compensates by paying the contention cost less often.', zh: '给两台终端都开启 A-MPDU（Wi-Fi 5）：聚合能摊薄竞争开销，部分缓解异常。' },
  ],
  quiz: [
    {
      q: { en: 'DCF gives each saturated station roughly equal…', zh: 'DCF 给每台饱和终端大致相等的是……' },
      options: [
        { en: 'airtime', zh: '空口时间' },
        { en: 'throughput', zh: '吞吐量' },
        { en: 'number of transmission opportunities', zh: '传输机会次数' },
      ],
      answer: 2,
      explain: { en: 'Equal win-probability per contention round ⇒ equal opportunities; airtime then depends on each station’s rate.', zh: '每轮竞争获胜概率相等 ⇒ 机会相等；而空口时间取决于各自的速率。' },
    },
  ],
}
