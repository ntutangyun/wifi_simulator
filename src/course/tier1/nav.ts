import { type Lesson, N, oneRoom, node, sc, firstNav, J } from '../lessonKit'

export const nav: Lesson = {
  id: 'nav',
  module: 1,
  title: { en: 'NAV — reserving with a promise', zh: 'NAV——用“预告”预约信道' },
  body: [
    { text: {
      en: 'Physical carrier sense only tells you the channel is busy *now*. But an exchange is longer than one frame: after the data comes SIFS, then the ACK.',
      zh: '物理载波侦听只能告诉你“此刻”信道忙。但一次帧交换比一个帧长：数据之后还有 SIFS 和 ACK。',
    } },
    { text: {
      en: 'The Duration field in every MAC header announces how much longer the exchange needs, and every overhearer loads it into a countdown timer — the NAV. While NAV > 0 the station treats the medium as busy even in perfect silence. That is virtual carrier sense: the SIFS gap is protected not by energy, but by a promise everyone heard.',
      zh: '每个 MAC 头里的 Duration 字段都会预告本次帧交换还需要多久，每个侦听到的终端把它装入一个倒数计时器——NAV。只要 NAV > 0，即使空口一片寂静，终端也视介质为忙。这就是虚拟载波侦听：SIFS 间隙靠的不是能量，而是所有人都听到的一句承诺。',
    } },
    { heading: { en: 'Why NAV at all, when CCA already works?', zh: '有了 CCA，为什么还要 NAV？' }, text: {
      en: 'Duration is measured from the instant the current frame ends, and covers only the remainder of the exchange. The frame itself needs no announcement: while it is in the air, everyone’s physical carrier sense already reports busy.',
      zh: 'Duration 从当前帧结束的那一瞬间起算，只覆盖交换的剩余部分。帧本身不需要预告：它还在空中时，所有人的物理载波侦听本来就报告“忙”。',
    } },
    { kind: 'table', head: [
      { en: 'Frame', zh: '帧' }, { en: 'Its Duration announces', zh: '它的 Duration 预告' },
    ], rows: [
      [{ en: 'Data expecting an ACK', zh: '期待 ACK 的数据帧' }, N('SIFS + ACK')],
      [N('RTS'), { en: 'The whole planned exchange: CTS + data + ACK', zh: '整场对话：CTS + 数据 + ACK' }],
      [{ en: 'CTS and each following frame', zh: 'CTS 及后续每一帧' }, { en: 'The shrinking remainder', zh: '不断缩短的剩余量' }],
    ] },
    { kind: 'list', heading: { en: 'The announcement matters for two reasons', zh: '这个预告之所以重要，有两个原因' }, items: [
      { en: 'The gaps are silent: SIFS is 16 µs of genuine silence, and a countdown timer is the only thing standing between that silence and an eager contender.', zh: '间隙是安静的：SIFS 是 16 µs 的真正寂静，能挡住急切竞争者的只有一个倒计时。' },
      { en: 'The response comes from the *other* end. The ACK is sent by the receiver, which may be far away: a station close enough to hear the data may be too far to hear the ACK. For it the ACK is invisible to CCA — the channel measures idle while a frame is actually on the air — and only its NAV keeps it quiet.', zh: '响应来自“另一端”：ACK 由接收方发出，而接收方可能离你很远——你听得到数据帧，却未必听得到 ACK。对这样的终端来说，ACK 在 CCA 眼里是隐形的：空口上明明有帧，信道却测得“空闲”，全靠 NAV 让它保持安静。' },
    ] },
    { text: {
      en: 'One sentence to keep: CCA protects the frame; Duration/NAV protects everything after it.',
      zh: '记住一句话：CCA 保护帧本身；Duration/NAV 保护帧之后的一切。',
    } },
    { heading: { en: 'Reading the long “waiting (DIFS)” block', zh: '读懂那段长长的“等待（DIFS）”' }, text: {
      en: 'Around t ≈ 498–824 µs you can watch all of this inside a single block. Talker A is mid-countdown (backoff at 3) when Talker B’s frame starts: A freezes, and its lane shows one long “waiting (DIFS)” block. That block is not a DIFS — it is everything A must sit through before its countdown may resume:',
      zh: '在 t ≈ 498–824 µs 附近，这一切可以在同一个色块里看完。Talker B 的帧开始时，Talker A 正数到退避 3：A 冻结，泳道上出现一段长长的“等待（DIFS）”色块。这段并不是一个 DIFS——它是 A 在倒数恢复之前必须熬过的全部时间：',
    } },
    { kind: 'table', head: [
      { en: 'Ingredient', zh: '组成' }, N('µs'), { en: 'What A is waiting through', zh: 'A 在熬什么' },
    ], rows: [
      [{ en: 'Rest of B’s data frame', zh: 'B 数据帧的剩余部分' }, N('248'), { en: 'CCA busy', zh: 'CCA 忙' }],
      [{ en: 'NAV loaded from B’s Duration', zh: '从 B 的 Duration 装入的 NAV' }, N('44'), N('SIFS + ACK')],
      [{ en: 'One real DIFS', zh: '一个货真价实的 DIFS' }, N('34'), { en: 'Idle', zh: '空闲' }],
      [{ en: 'Total', zh: '合计' }, N('326'), { en: 'Then A resumes at 3', zh: '之后 A 从 3 继续' }],
    ] },
    { text: {
      en: 'The label names only the final ingredient — the thing A is waiting *for* — while the length is the whole wait. When it ends, A resumes counting at 3, exactly where it froze.',
      zh: '标签只写了最后一味原料——那是 A 正在“等”的东西——而长度是整段等待。结束时，A 从退避 3 继续倒数，正是它冻结时的数值。',
    } },
    { kind: 'steps', heading: { en: 'When does A learn how long the wait is?', zh: 'A 什么时候才知道要等多久？' }, items: [
      { en: '498 µs: A knows only “busy *now*”. It freezes at 3 — end of knowledge.', zh: '498 µs：A 只知道“此刻忙”，冻结在 3——认知到此为止。' },
      { en: '≈ 518 µs: the PHY header reveals the frame’s length. Now A knows this frame ends at 746, plus something unknown after it.', zh: '约 518 µs：PHY 头揭示了帧长。A 这才知道这帧将在 746 结束，之后还有一段未知。' },
      { en: '746 µs: the frame completes and its checksum passes, so the Duration field can be trusted: NAV until 790, then a 34 µs DIFS, resume at 824.', zh: '746 µs：帧完整收下、校验通过，Duration 字段才可信：NAV 到 790，再一个 34 µs 的 DIFS，824 恢复。' },
    ] },
    { text: {
      en: 'So the total of 326 µs first becomes computable at 746, by which point 248 µs — about three quarters of the wait — has already passed. A spends most of the wait not knowing how long the wait is. And even then the figure is conditional: another preamble during the DIFS would simply extend it.',
      zh: '所以最早能算出总共要等 326 µs 的时刻是 746——那时等待本身已经过去了 248 µs，约四分之三。A 在这段等待的大部分时间里，并不知道自己要等多久。而且这个数字仍是有条件的：若 DIFS 期间又冒出一个前导码，等待只会继续变长。',
    } },
    { text: {
      en: 'A station never holds a schedule — only one constantly revised belief, “the earliest I might resume is ___”, re-derived at every event, with a single number carried through the fog: the frozen counter.',
      zh: '终端手里从来没有一张时刻表，只有一个不断修正的信念——“我最早可能在 ___ 恢复”——每来一个事件就重算一次；穿过这团迷雾时，它随身携带的只有一个数字：冻结的退避计数。',
    } },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Talker A', 'sta', 3.5, 5, 'nonht', 'saturated'),
    node('sta-2', 'Talker B', 'sta', 6.5, 5, 'nonht', 'saturated'),
    node('sta-3', 'Listener', 'sta', 5, 6.5, 'nonht', 'browsing'),
  ]),
  jumps: [
    J('first NAV set', '第一次设置 NAV', firstNav),
  ],
  observe: [
    { en: 'Thin purple bars under a lane = NAV; they end exactly when the ACK ends.', zh: '泳道下方细紫条 = NAV；它恰好在 ACK 结束的瞬间到期。' },
    { en: 'During the SIFS gap the medium is silent, yet the Listener stays deferred — its NAV covers it.', zh: 'SIFS 间隙里空口是安静的，但旁听者依然按兵不动——它的 NAV 覆盖了这段时间。' },
    { en: 'Hover a data block: its Duration field equals SIFS + the ACK’s airtime.', zh: '悬停数据块：其 Duration 字段恰为 SIFS + ACK 的空口时间。' },
  ],
  tryThis: [
    { en: 'Pause inside a SIFS gap and check the Listener’s inspector: CCA idle, NAV counting.', zh: '在 SIFS 间隙里暂停，看旁听者的检视器：CCA 空闲、NAV 在倒数。' },
  ],
  quiz: [
    {
      q: { en: 'What exactly does a station load into its NAV?', zh: '终端装入 NAV 的到底是什么？' },
      options: [
        { en: 'The measured signal strength', zh: '测得的信号强度' },
        { en: 'The Duration field of any correctly decoded frame not addressed to it', zh: '任何解码成功、且不是发给自己的帧中的 Duration 字段' },
        { en: 'A random hold-off time', zh: '一个随机等待时间' },
      ],
      answer: 1,
      explain: { en: '§10.3.2.4: overheard Duration ⇒ NAV = max(NAV, frame end + Duration).', zh: '§10.3.2.4：侦听到的 Duration ⇒ NAV = max(当前 NAV, 帧结束 + Duration)。' },
    },
  ],
}
