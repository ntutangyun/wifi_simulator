import { type Lesson, N, oneRoom, node, sc, firstInternal, firstVo, J } from '../lessonKit'

export const edca: Lesson = {
  id: 'edca',
  module: 2,
  title: { en: 'EDCA — four queues, four personalities', zh: 'EDCA——四条队列，四种性格' },
  body: [
    { text: {
      en: 'DCF treats a voice packet and a bulk upload identically. EDCA (802.11e, in every device since Wi-Fi 5) splits traffic into four access categories (ACs), each running its own backoff engine with its own parameters (Table 9-194):',
      zh: 'DCF 对语音包和大文件上传一视同仁。EDCA（802.11e，Wi-Fi 5 起人人都有）把流量分进四个接入类别（AC），每个类别都有一台独立的退避引擎和自己的参数（Table 9-194）：',
    } },
    { kind: 'table', head: [
      N('AC'), N('AIFSN'), N('AIFS'), N('CWmin'), N('CWmax'),
    ], rows: [
      [{ en: 'VO (voice)', zh: 'VO（语音）' }, N('2'), N('34 µs'), N('3'), N('7')],
      [{ en: 'VI (video)', zh: 'VI（视频）' }, N('2'), N('34 µs'), N('7'), N('15')],
      [{ en: 'BE (best effort)', zh: 'BE（尽力而为）' }, N('3'), N('43 µs'), N('15'), N('1023')],
      [{ en: 'BK (background)', zh: 'BK（后台）' }, N('7'), N('79 µs'), N('15'), N('1023')],
    ] },
    { text: {
      en: 'Shorter waits + smaller draws = statistically earlier transmission. Priority in Wi-Fi is not a scheduler’s decree — it is a rigged lottery with two knobs: AIFS and CW.',
      zh: '等得更短 + 抽值更小 = 统计上总能更早发送。Wi-Fi 里的优先级不是调度器的命令，而是一场被做了手脚的抽签，手脚就做在两个旋钮上：AIFS 和 CW。',
    } },
    { heading: { en: 'AIFS — when the waiting itself became the knob', zh: 'AIFS——当“等待”本身成为旋钮' }, text: {
      en: 'AIFS is the Arbitration Interframe Space: the quiet time an access category must observe before its backoff may count.',
      zh: 'AIFS 是仲裁帧间间隔（Arbitration Interframe Space）：一个接入类别在退避计数开始之前必须观察到的静默时长。',
    } },
    { kind: 'formula', text: {
      en: 'AIFS[AC] = SIFS + AIFSN × slot = 16 + n × 9 µs',
      zh: 'AIFS[AC] = SIFS + AIFSN × 时隙 = 16 + n × 9 µs',
    }, note: {
      en: 'n = 2 → 34 µs (VO, VI); n = 3 → 43 µs (BE); n = 7 → 79 µs (BK).',
      zh: 'n = 2 → 34 µs（VO、VI）；n = 3 → 43 µs（BE）；n = 7 → 79 µs（BK）。',
    } },
    { text: {
      en: 'Why was it invented? Because DCF’s DIFS was one-size-fits-all: every station waited exactly the same 34 µs, so the waiting stage was priority-blind and only the random draw decided. 802.11e needed priority without adding a scheduler — so it made the fixed wait programmable per class.',
      zh: '为什么要发明它？因为 DCF 的 DIFS 是“一刀切”：所有站点等待完全相同的 34 µs，等待阶段对优先级视而不见，胜负全靠随机抽取。802.11e 要在不引入调度器的前提下实现优先级——于是把这段固定的等待改成了按类别可调的参数。',
    } },
    { text: {
      en: 'Unlike the CW lottery, which is only a statistical bias, a shorter AIFS is a deterministic head start paid in every single contention round: while BK is still sitting out its 79 µs of mandatory silence, VO has already been counting down for 45 µs — and in those slots BK cannot even begin.',
      zh: '与 CW 抽签只提供统计上的偏向不同，更短的 AIFS 是每一轮竞争都要兑现的确定性抢跑：当 BK 还在熬它那 79 µs 的强制静默时，VO 已经倒数了 45 µs——而在这些时隙里，BK 连开始的资格都没有。',
    } },
    { heading: { en: 'The xIFS family — one ladder, not rivals', zh: 'xIFS 家族——一把梯子，而非对手' }, text: {
      en: 'Every interframe space is built from the same recipe, and the family is best read as one ladder:',
      zh: '每一种帧间间隔都出自同一条配方，整个家族最好读成一把梯子：',
    } },
    { kind: 'formula', text: {
      en: 'xIFS = SIFS + n × slot = 16 + n × 9 µs',
      zh: 'xIFS = SIFS + n × 时隙 = 16 + n × 9 µs',
    } },
    { kind: 'table', head: [
      { en: 'Space', zh: '间隔' }, N('n'), { en: 'Length', zh: '时长' }, { en: 'Role', zh: '角色' },
    ], rows: [
      [N('SIFS'), N('0'), N('16 µs'), { en: 'Glue inside an exchange (before an ACK or CTS); not a contention wait at all.', zh: '交换内部的黏合剂（ACK、CTS 之前的间隙）；根本不是竞争等待。' }],
      [N('PIFS'), N('1'), N('25 µs'), { en: 'Reserved for the AP’s scheduled, contention-free access (not modeled here).', zh: '留给 AP 的免竞争调度接入（本仿真器未建模）。' }],
      [N('DIFS'), N('2'), N('34 µs'), { en: 'DCF’s fixed contention wait — in hindsight simply AIFS with AIFSN 2; this simulator models a legacy station as one pseudo-AC with AIFSN 2.', zh: 'DCF 的固定竞争等待——事后看，它不过是 AIFSN = 2 的 AIFS；本仿真器就是把传统站点建模为一个 AIFSN 为 2 的伪接入类别。' }],
      [N('AIFS'), N('2, 3, 7'), N('34–79 µs'), { en: 'DIFS made per-class.', zh: '把 DIFS 变成按类别可调。' }],
      [N('EIFS'), N('—'), N('94 µs'), { en: 'Not a rung: a penalty overlay after a corrupted reception.', zh: '不是梯子上的一级：收到损坏帧之后叠加的惩罚。' }],
    ] },
    { kind: 'list', heading: { en: 'Do they work together or exclude each other? Together.', zh: '它们是协同工作还是互斥？协同。' }, items: [
      { en: 'The ladder only creates priority because everyone is counting against the same silence at once.', zh: '这把梯子之所以能产生优先级，正是因为所有人同时对着同一段静默计时。' },
      { en: 'A responder waiting SIFS always beats every contender waiting AIFS ≥ 34 µs: the ACK is protected by arithmetic, not by luck.', zh: '等 SIFS 的响应方永远赢过任何等 AIFS ≥ 34 µs 的竞争者：ACK 受算术保护，而不是靠运气。' },
      { en: 'Within one device, all four ACs run their AIFS timers in parallel — the inspector’s IFS row shows them side by side.', zh: '在同一台设备内，四个 AC 的 AIFS 计时器并行运转——检视器的 IFS 一行会把它们并排列出。' },
      { en: 'EIFS does not replace AIFS, it adds to it (§10.23.2.2):', zh: 'EIFS 也不是替换 AIFS，而是与它相加（§10.23.2.2）：' },
    ] },
    { kind: 'formula', text: {
      en: 'wait after a corrupted frame = EIFS − DIFS + AIFS[AC]\nBE: 94 − 34 + 43 = 103 µs\nBK: 94 − 34 + 79 = 139 µs',
      zh: '收到损坏帧后的等待 = EIFS − DIFS + AIFS[AC]\nBE：94 − 34 + 43 = 103 µs\nBK：94 − 34 + 79 = 139 µs',
    }, note: {
      en: 'Penalty and class-wait, composed. The uploader’s BE queue is the one that shows it here — hover its 103 µs defer blocks. The backup never gets one: a corrupted reception needs a preamble the radio actually locked onto, and the collisions in this scene bury both preambles at once.',
      zh: '惩罚与类别等待，叠加而成。本场景里能看到它的是上传终端的 BE 队列——悬停它那些 103 µs 的等待色块。备份终端一次也没有：要有“损坏的接收”，先得有一个真正被锁定的前导码，而这个场景里的碰撞往往把两个前导码同时淹没。',
    } },
    { heading: { en: 'CW — how big the lottery is, and how it doubles', zh: 'CW——抽签区间有多大，碰撞后怎么翻倍' }, text: {
      en: '“CW 3–7” does not mean “draw a number between 3 and 7”. CW is the upper bound of the draw, and 3 and 7 are CWmin and CWmax — the smallest and largest that bound is ever allowed to be (§10.3.3).',
      zh: '“CW 3–7”不是“从 3 到 7 里抽一个数”。CW 是抽取区间的上限，而 3 和 7 是 CWmin 与 CWmax——这个上限所允许的最小值和最大值（§10.3.3）。',
    } },
    { kind: 'formula', text: {
      en: 'backoff = uniform random integer in [0, CW]',
      zh: '退避计数 = [0, CW] 上均匀分布的随机整数',
    } },
    { text: {
      en: 'After a collision the standard never adds one to CW: it takes the next value in the series 2ⁿ − 1. Equivalently, new CW = 2 × old CW + 1. Both say the same thing — the number of candidates doubles:',
      zh: '碰撞之后，标准不是“CW 加一”，而是“CW 取序列中的下一个值”，这个序列是 2ⁿ − 1。等价的算法是新 CW = 2 × 旧 CW + 1。两种说法本质相同——可选值的个数翻倍：',
    } },
    { kind: 'table', head: [
      N('n'), N('CW = 2ⁿ − 1'), { en: 'Draw from', zh: '抽取区间' }, { en: 'Candidates', zh: '可选值个数' },
    ], rows: [
      [N('2'), N('3'), N('0–3'), N('4')],
      [N('3'), N('7'), N('0–7'), N('8')],
      [N('4'), N('15'), N('0–15'), N('16')],
      [N('5'), N('31'), N('0–31'), N('32')],
      [N('…'), N('…'), N('…'), N('…')],
      [N('10'), N('1023'), N('0–1023'), N('1024')],
    ] },
    { text: {
      en: 'Why doubling and not +1? A collision means there are too many contenders. Doubling the interval sharply raises the chance they spread out, whereas adding one value would change almost nothing. That is what “binary exponential backoff” means.',
      zh: '为什么是翻倍而不是加一？碰撞说明竞争者太多。把区间加倍能让大家散开的概率大幅提高，加一的话只多一个值，几乎没用。这就是“二进制指数退避”名字的由来。',
    } },
    { kind: 'steps', heading: { en: 'Voice’s full journey', zh: '语音流量的完整过程' }, items: [
      { en: 'First attempt: CW = 3, draw from 0–3.', zh: '第一次发：CW = 3，从 0~3 抽。' },
      { en: 'Collision: CW = 7, draw from 0–7 — not 0–4.', zh: '碰撞了：CW = 7，从 0~7 抽——不是 0~4。' },
      { en: 'Another collision: the series says 15, but VO’s CWmax is 7, so it is capped and still draws 0–7 — however many collisions follow.', zh: '又碰撞了：按序列该到 15，但 VO 的 CWmax = 7，被封顶，还是从 0~7 抽——之后不管碰撞多少次都停在 7。' },
      { en: 'Success, or a drop at the retry limit: CW resets to 3.', zh: '发成功了，或者重试次数用尽被丢包：CW 重置回 3。' },
    ] },
    { text: {
      en: 'VO has only two rungs, 0–3 and 0–7, and that is deliberate — voice needs low delay and is never allowed to back off for hundreds of slots. Compare BK: it starts at 15 and may climb through 31, 63, 127, 255 and 511 to 1023 — seven rungs.',
      zh: '所以对 VO 来说只有两档：0~3 和 0~7。这是故意设计的，语音要求低延迟，不允许它退避到几百个时隙那么久。对比 BK：从 15 起步，可以一路翻到 1023，中间要经过 31、63、127、255、511，共有七档。',
    } },
    { text: {
      en: 'The four categories contend even inside one device: when two hit zero together, the higher AC transmits and the lower one doubles its CW as if it had collided (internal collision).',
      zh: '四个类别在同一台设备内部也在竞争：若两个同时清零，高优先级类别发送，低优先级类别像真的碰撞了一样把 CW 翻倍（内部碰撞）。',
    } },
  ],
  scenario: () => sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Caller (VO)', 'sta', 3.5, 5, 'he', 'voice'),
    node('sta-2', 'Uploader (BE)', 'sta', 6.5, 5, 'he', 'saturated'),
    node('sta-3', 'Backup (BK)', 'sta', 5, 6.5, 'he', 'backup'),
  ]),
  jumps: [
    J('first VO access', '第一次 VO 接入', firstVo),
    J('first internal collision', '第一次内部碰撞', firstInternal),
  ],
  observe: [
    { en: 'Hover backoff blocks: the caller’s show AC_VO with tiny CW; the backup’s show AC_BK with CW 15+ and a longer AIFS.', zh: '悬停退避块：通话终端显示 AC_VO、CW 极小；备份终端显示 AC_BK、CW ≥ 15 且 AIFS 更长。' },
    { en: 'The inspector’s per-AC table shows each queue contending independently.', zh: '检视器的分 AC 表格显示每条队列独立竞争。' },
    { en: 'Voice frames get through with low delay even while the uploader saturates the channel.', zh: '即使上传终端把信道打满，语音帧的时延依然很低。' },
  ],
  tryThis: [
    { en: 'Turn EDCA off on the caller (features) and compare its delay against the saturated uploader.', zh: '关闭通话终端的 EDCA 功能，再比较它在饱和上传旁的时延。' },
    { en: 'Change the uploader’s traffic to voice too — watch two VO queues collide more often.', zh: '把上传终端的业务也改成语音——观察两条 VO 队列更频繁地相撞。' },
  ],
  quiz: [
    {
      q: { en: 'How does AC_VO actually get priority over AC_BK?', zh: 'AC_VO 究竟是如何压过 AC_BK 的？' },
      options: [
        { en: 'The AP polls voice stations first', zh: 'AP 先轮询语音终端' },
        { en: 'Shorter AIFS and a much smaller contention window make it statistically win the lottery', zh: '更短的 AIFS 和小得多的竞争窗口让它在“抽签”中统计性获胜' },
        { en: 'Voice frames preempt ongoing transmissions', zh: '语音帧可以抢断正在进行的传输' },
      ],
      answer: 1,
      explain: { en: 'EDCA never interrupts a frame in flight — it only biases who wins the next idle slot.', zh: 'EDCA 从不打断空中的帧——它只是让下一个空闲时隙更可能属于谁。' },
    },
    {
      q: { en: 'In an internal collision between AC_VI and AC_BE in one device…', zh: '同一设备内 AC_VI 与 AC_BE 发生内部碰撞时……' },
      options: [
        { en: 'both transmit on different channels', zh: '两者在不同信道上同时发送' },
        { en: 'AC_VI transmits; AC_BE doubles its CW as after a real collision', zh: 'AC_VI 发送；AC_BE 像真碰撞一样把 CW 翻倍' },
        { en: 'the frame queued first wins', zh: '先入队的帧获胜' },
      ],
      answer: 1,
      explain: { en: '§10.23.2.2: the higher AC gets the TXOP; lower ACs invoke their backoff as for an external collision.', zh: '§10.23.2.2：高优先级类别获得 TXOP；低优先级类别按外部碰撞处理进入退避。' },
    },
  ],
}
