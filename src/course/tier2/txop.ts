import { type Lesson, N, oneRoom, node, sc, firstTxop, J } from '../lessonKit'

export const txop: Lesson = {
  id: 'txop',
  module: 2,
  title: { en: 'TXOP — own the channel, briefly', zh: 'TXOP——短暂地拥有信道' },
  body: [
    { text: {
      en: 'An EDCA win grants not one exchange but a transmit opportunity (TXOP): a bounded interval in which the winner may chain multiple exchanges separated only by SIFS, with no re-contention between them.',
      zh: 'EDCA 赢一次拿到的不是一次交换，而是一个传输机会（TXOP）：一段有上限的时间，获胜者可以在其中用仅隔 SIFS 的方式串联多次帧交换，中间无需再竞争。',
    } },
    { kind: 'table', head: [
      N('AC'), { en: 'TXOP limit', zh: 'TXOP 上限' },
    ], rows: [
      [{ en: 'VO (voice)', zh: 'VO（语音）' }, N('2.080 ms')],
      [{ en: 'VI (video)', zh: 'VI（视频）' }, N('4.096 ms')],
      [N('BE / BK'), N('2.528 ms')],
    ] },
    { text: {
      en: 'The standard requires every PPDU plus its acknowledgement to fit inside the limit. TXOP turns the lottery into a lease.',
      zh: '标准要求每个 PPDU 连同它的确认都必须装进上限之内。TXOP 把“抽签”变成了“短租”。',
    } },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'TV 1', 'sta', 3.5, 5.5, 'vht', 'video'),
    node('sta-2', 'TV 2', 'sta', 6.5, 5.5, 'vht', 'video'),
  ]),
  jumps: [
    J('first TXOP start', '第一次 TXOP 开始', firstTxop),
  ],
  observe: [
    { en: 'The “first TXOP start” jump (≈ 0.88 ms) lands on a two-receiver burst: inside one TXOP the AP sends to TV 2, gets its ACK, then after one SIFS sends to TV 1 — no AIFS, no backoff in between. Later TXOPs hold a single exchange about as often as two: with only two 15 Mbps streams the AP has frames for both TVs waiting at once only about half the time.', zh: '“第一次 TXOP 开始”跳转（≈ 0.88 ms）落在一个发往两台接收机的突发上：在同一个 TXOP 内，AP 发给电视 2、收到 ACK 后仅隔一个 SIFS 就发给电视 1——中间没有 AIFS、没有退避。之后的 TXOP 只含一次交换和含两次交换的情况差不多一样多：只有两路 15 Mbps 的视频流时，AP 大约只有一半的时候会同时攒下发给两台电视的帧。' },
    { en: 'The inspector shows “TXOP: AC_VI, n µs left” while the burst runs.', zh: '突发进行中，检视器显示“TXOP：AC_VI，剩余 n µs”。' },
  ],
  tryThis: [
    { en: 'Turn TXOP off on the AP and compare: every exchange now pays AIFS + backoff again.', zh: '关闭 AP 的 TXOP 功能再比较：每次帧交换都得重新付出 AIFS + 退避。' },
  ],
  quiz: [
    {
      q: { en: 'What separates two exchanges inside one TXOP?', zh: '同一个 TXOP 内两次帧交换之间隔着什么？' },
      options: [
        { en: 'AIFS + a fresh backoff', zh: 'AIFS + 新的退避' },
        { en: 'Exactly one SIFS', zh: '恰好一个 SIFS' },
        { en: 'A PIFS', zh: '一个 PIFS' },
      ],
      answer: 1,
      explain: { en: 'That is the whole point: contention is paid once at the TXOP boundary.', zh: '这正是 TXOP 的意义：竞争的代价只在边界上付一次。' },
    },
  ],
}
