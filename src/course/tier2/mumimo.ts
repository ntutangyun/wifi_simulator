import { type Lesson, N, firstData, firstBa, firstMuDl, J } from '../lessonKit'
import { mumimoScenario } from '../wifiScenes'

export const mumimo: Lesson = {
  id: 'mumimo',
  module: 6,
  title: { en: 'MU-MIMO — splitting by space instead of frequency', zh: 'MU-MIMO——按空间而不是按频率划分' },
  body: [
    { text: {
      en: 'Both variants below are the same house: one router, three phones each pulling video, one laptop backing up files to keep the channel honestly busy. Both are one PPDU carrying data for several phones at once, and both end together, which is why one BlockAck round settles the whole group. The difference is what gets divided to fit them all in.',
      zh: '下面两个变体是同一栋房子：一台路由器，三部手机各自在拉视频流，一台笔记本在后台备份文件，好让信道真的忙起来。两个变体都是用一个 PPDU 同时给好几部手机送数据，也都同时结束——所以一轮 BlockAck 就能了结整组。区别在于：为了把大家都塞进同一个 PPDU，被切分的到底是什么。',
    } },
    { text: {
      en: 'OFDMA divides the channel: each member gets a fraction of the tones, so each member’s data rate falls as more members join. What that buys back is the contention and the preamble, paid once for the whole group instead of once per member. It is at its best serving many small frames.',
      zh: 'OFDMA 切分的是信道：每个成员只分到一部分子载波，成员越多，每个人的速率就越低。换回来的是竞争和前导码只需要为整组付一次，而不是每个成员各付一次。它最适合服务许多小帧。',
    } },
    { text: {
      en: 'MU-MIMO divides the antennas: each member gets the whole channel and its own spatial streams, so nobody’s rate falls — but the group can only be as large as the router’s own stream count allows. It is at its best serving a few large frames. (That “nobody’s rate falls” is this simulator’s idealisation: a real MU-MIMO transmitter splits its power across the group and never nulls the other members perfectly, so each member’s signal quality, and with it its rate, does fall somewhat.)',
      zh: 'MU-MIMO 切分的是天线：每个成员都拿到整段信道和自己的空间流，谁的速率都不会下降——但这个组能有多大，上限是路由器自己的流数。它最适合服务少数几个大帧。（“谁的速率都不会下降”是本仿真器的理想化：真实的 MU-MIMO 发射机要把功率分给组内各成员，对其他成员的置零也不可能完美，所以每个成员的信号质量、连带它的速率，实际上都会有所下降。）',
    } },
    { kind: 'table', heading: { en: 'One MU PPDU, real numbers from this house', zh: '一个 MU PPDU，来自这栋房子的真实数据' }, head: [
      { en: 'Variant', zh: '变体' }, { en: 'Members', zh: '成员数' },
      { en: 'Duration', zh: '时长' }, { en: 'Rate/member', zh: '单成员速率' },
    ], rows: [
      [N('OFDMA'), N('3'), N('92.8 µs'), N('371.2 Mb/s')],
      [N('MU-MIMO'), N('2'), N('65.6 µs'), N('525.1 Mb/s')],
    ] },
    { text: {
      en: 'Same 4,306-byte payload per member either way — three A-MPDU’d video frames the router had backed up for that phone, so OFDMA’s three members deliver 12,918 B combined in that one PPDU against MU-MIMO’s 8,612 B from two. On the data alone the two variants are worlds apart: OFDMA’s one-third share of the tones needs exactly 3 data symbols (40.8 µs) to carry it; MU-MIMO’s full share needs exactly 1 (13.6 µs) — a clean threefold gain, precisely the group size MU-MIMO gave up. But every PPDU also pays a fixed 52 µs preamble (48 µs of EHT preamble plus 4 µs of multi-user SIG overhead) that does not shrink with the data, so end to end it is 92.8 µs against 65.6 µs — only about 1.4×, not 3×. This is lesson 15’s preamble-amortisation point again, on the other axis: the fixed cost dilutes whatever the tones or the antennas buy you, and it dilutes it hardest on the smallest frames.',
      zh: '两边每个成员的负载都一样，都是 4,306 字节——路由器给那部手机攒下的三个已聚合视频帧，所以 OFDMA 那三个成员在同一个 PPDU 里合计交付 12,918 字节，MU-MIMO 两个成员合计 8,612 字节。只看数据部分，两个变体天差地别：OFDMA 分到三分之一子载波，要整整 3 个数据符号（40.8 µs）才能载完；MU-MIMO 独享全部子载波，只要 1 个（13.6 µs）——干净利落的三倍增益，正好是 MU-MIMO 放弃的那个组的大小。但每个 PPDU 还要付一段固定的 52 µs 前导码（48 µs 的 EHT 前导码加 4 µs 的多用户 SIG 开销），它不会随数据一起缩短，所以整帧算下来是 92.8 µs 对 65.6 µs——只有约 1.4 倍，不是 3 倍。这正是第 15 课“前导码摊薄”那个道理换了个轴再讲一遍：无论子载波还是天线买来的好处，都会被这笔固定成本摊薄，帧越小摊薄得越狠。',
    } },
    { heading: { en: 'Three candidates, but the MU-MIMO group is never three', zh: '三个候选人，但 MU-MIMO 分组从来不是三个' }, text: {
      en: 'The router has four streams; each phone negotiates two. Two phones already use all four — a third would need six. So whenever MU-MIMO is possible at all, this AP trims the group down to two candidates and serves the third separately. Where the trimmed phone turns up next is worth measuring rather than guessing: over the 196 two-member PPDUs in this run it gets its own single-user PPDU immediately after 122 times (62%), turns up in whichever MU-MIMO pairing forms next 65 times (33%), and neither of those 9 times (5%) — the router simply reached the other two again first and the trimmed phone waited another round. OFDMA has no such ceiling here: the same three phones fit together in one PPDU, each on its own slice of tones. Frequency divides among everyone who shows up; space is capped by how many antennas paid for it.',
      zh: '路由器有四条流；每部手机协商到两条。两部手机就已经用满四条——第三部还需要再要六条。所以只要 MU-MIMO 可行，这台 AP 就会把组裁到两个候选人，第三个另外单独服务。被裁掉的那部手机接下来会在哪里出现，值得实测而不是猜：这段仿真里 196 个两成员 PPDU 中，122 次（62%）它紧接着拿到一个属于自己的单用户 PPDU，65 次（33%）出现在下一次组成的 MU-MIMO 配对里，还有 9 次（5%）两样都不是——路由器又先轮到了另外那两部，被裁的手机只好再等一轮。OFDMA 在这里没有这个天花板：同样这三部手机能挤进同一个 PPDU，每人占一片子载波。频率是分给所有到场的人；空间的上限则是有多少天线为它买了单。',
    } },
    { kind: 'steps', heading: { en: 'The simulator’s rule for choosing between them', zh: '仿真器在两者之间做选择的规则' }, items: [
      { en: 'OFDMA capability has to be negotiated between the router and a phone before either multi-user path can fire at all — this is why both variants below keep it on. Without it every phone is served one at a time, no matter how full the queue gets.', zh: '路由器与手机之间必须先协商好 OFDMA 能力，两条多用户路径才有可能触发——所以下面两个变体都开着它。没有它，无论队列多满，每部手机都只能一个一个被服务。' },
      { en: 'Given that, MU-MIMO fires instead of OFDMA only when every candidate also negotiates MU-MIMO and has at least 1,000 B queued at its head — a threshold big enough that space is worth dividing.', zh: '在此基础上，只有当每个候选人也都协商了 MU-MIMO、并且队首至少排着 1,000 字节时，MU-MIMO 才会取代 OFDMA 被触发——这个门槛足够大，才值得去切分空间。' },
      { en: 'The router then trims that MU-MIMO group from the end, one member at a time, until the survivors’ stream counts fit its own four — and if fewer than two survive, it falls back to OFDMA instead.', zh: '之后路由器会从末尾开始，一个一个地裁减这个 MU-MIMO 分组，直到幸存者的流数总和不超过自己的四条——如果幸存者不足两个，就整个退回 OFDMA。' },
    ] },
    { text: {
      en: 'So the OFDMA / MU-MIMO variants below differ in exactly one feature flag — MU-MIMO, on the phones and the router. OFDMA capability is never touched: turning it off would not produce “more OFDMA”, it would produce no multi-user PPDUs at all.',
      zh: '所以下面 OFDMA / MU-MIMO 两个变体只有一个功能开关不同——MU-MIMO，手机和路由器上都是。OFDMA 能力从未被动过：关掉它不会得到“更纯粹的 OFDMA”，只会得到根本没有多用户 PPDU。',
    } },
    { text: {
      en: 'Lesson 11 showed OFDMA splitting one PPDU by frequency; lesson 16 showed a link’s rate capped by the smaller of two stream counts. This lesson is what happens when both ideas share one router: OFDMA still divides by frequency, but now MU-MIMO is there dividing by space instead, capped by the router’s own stream count rather than the link’s.',
      zh: '第 11 课展示了 OFDMA 按频率切分一个 PPDU；第 16 课展示了链路速率被两端流数中较小的那个卡住。这一课讲的是当这两个想法共处一台路由器时会发生什么：OFDMA 依然按频率切分，但现在多了 MU-MIMO 按空间切分——它的上限是路由器自己的流数，而不是某条链路的流数。',
    } },
  ],
  scenario: () => mumimoScenario(false),
  variants: [
    { label: { en: 'OFDMA (split by frequency)', zh: 'OFDMA（按频率划分）' }, scenario: () => mumimoScenario(false) },
    { label: { en: 'MU-MIMO (split by space)', zh: 'MU-MIMO（按空间划分）' }, scenario: () => mumimoScenario(true) },
  ],
  jumps: [
    J('first MU PPDU', '第一个 MU PPDU', firstMuDl),
    J('first data frame', '第一个数据帧', firstData),
    J('first BlockAck', '第一个 BlockAck', firstBa),
  ],
  observe: [
    { en: 'OFDMA variant: hover the wide blue block — three parts inside, one per phone, each at a fraction of the router’s full rate.', zh: 'OFDMA 变体：悬停那个宽的蓝色块——里面有三份，每部手机一份，各自只拿到路由器满速的一小部分。' },
    { en: 'MU-MIMO variant: the same block now carries only two parts, each at the phone’s full negotiated rate. Follow the phone that got trimmed: 62% of the time a third, separate block follows immediately for it; 33% of the time it turns up in the next MU-MIMO pairing instead; and 5% of the time neither happens — the other two are paired again first, and it waits another round.', zh: 'MU-MIMO 变体：同一个块现在只装两份，各自都是那部手机协商到的满速率。盯住被裁掉的那部手机：62% 的情况下它紧接着有一个独立的块；33% 的情况下它出现在下一次的 MU-MIMO 配对里；还有 5% 两样都不是——另外两部又先被配到了一起，它得再等一轮。' },
    { en: 'Both variants end every member’s part at the same instant, and one BlockAck (or one round of simultaneous BAs) settles the whole group a SIFS later.', zh: '两个变体里，所有成员的那一份都在同一瞬间结束，一个 SIFS 之后一轮 BlockAck（或几个同时发出的 BA）就了结了整组。' },
    { en: 'Which phone gets trimmed from the MU-MIMO group is not fixed — it depends on which two happened to be queued together when the router last had a chance to transmit.', zh: '哪部手机会被裁出 MU-MIMO 组并不固定——取决于路由器上次有机会发送时，恰好是哪两部手机的数据排在了一起。' },
  ],
  tryThis: [
    { en: 'Add a fourth phone in the editor: OFDMA absorbs it, and the groups become four-member ones on quarter-width slices. Add a fifth and the group stops growing — this engine caps a multi-user group at four members, so the fifth phone waits for a later PPDU and no slice is ever thinner than a quarter of the channel. MU-MIMO never grows past two however many you add: the router’s four streams are already spoken for.', zh: '在编辑器里加上第四部手机：OFDMA 会把它吸收进来，分组变成四个成员，每人四分之一的子载波。再加第五部，分组就不再长大了——本引擎把一个多用户分组的成员数封顶在四个，所以第五部手机只能等后面的 PPDU，任何一片都不会比四分之一条信道更薄。而无论你加多少部，MU-MIMO 都长不过两个：路由器的四条流早就被占满了。' },
    { en: 'Turn the laptop’s backup traffic off and reload. The router now drains each phone’s video packet before the next one lands, and multi-user PPDUs — of either kind — become rare: there is nothing to group.', zh: '关掉笔记本的备份流量再重新加载。路由器现在能在下一个视频包到达之前就送完当前这部手机的包，无论哪一种多用户 PPDU 都变得罕见——因为根本没什么可分组的。' },
  ],
  quiz: [
    {
      q: { en: 'Three phones, one PPDU. Under OFDMA, what happens to each phone’s rate as you add a fourth?', zh: '三部手机，一个 PPDU。在 OFDMA 下，再加一部手机之后，每部手机的速率会怎样？' },
      options: [
        { en: 'It falls — the channel is divided one way further', zh: '下降——信道又被多分了一份' },
        { en: 'It stays the same — OFDMA reuses the whole channel per member', zh: '不变——OFDMA 对每个成员都复用整条信道' },
        { en: 'It rises — more members mean less contention overhead per member', zh: '上升——成员越多，每个人分摊的竞争开销越少' },
      ],
      answer: 0,
      explain: { en: 'OFDMA members share tones, not time: a fourth member means everyone’s slice of the channel gets thinner.', zh: 'OFDMA 的成员们分享的是子载波，而不是时间：多一个成员，意味着每个人分到的那一片信道都更薄。' },
    },
    {
      q: { en: 'Why can a four-stream router not serve three two-stream phones with MU-MIMO at once?', zh: '为什么一台四流路由器不能用 MU-MIMO 同时服务三部两流手机？' },
      options: [
        { en: 'Three streams would collide with each other in the air', zh: '三条流会在空口中互相碰撞' },
        { en: 'Their streams would sum to six, one and a half times what the router has', zh: '它们的流数加起来是六条，是路由器拥有的一倍半' },
        { en: 'MU-MIMO groups are always limited to two members', zh: 'MU-MIMO 分组永远只能有两个成员' },
      ],
      answer: 1,
      explain: { en: 'Each phone negotiates two streams; two phones already use all four the router has. A third would need six — the group is trimmed until it fits, here landing at two.', zh: '每部手机协商到两条流；两部手机就已经用满路由器的四条。第三部还需要六条——分组会被裁到能塞下为止，这里正好落在两个。' },
    },
  ],
}
