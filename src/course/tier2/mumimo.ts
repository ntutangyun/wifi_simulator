/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · dividing space instead of frequency.
 *
 * **Standard-first shape (2026-11-11).** ① what the standards say about downlink MU-MIMO: the
 * per-RU limits (8 users, 4 spatial streams each, 8 in all; IEEE Std 802.11be-2024 §36.1.1 for
 * EHT, IEEE Std 802.11-2024 §27.1.1 for HE), the sounding the steering matrix needs (§26.7.1,
 * §26.7.3; 802.11be §35.7.1), the capability rules (§26.7.2, §27.3.3.1.2), the EHT-SIG allocation
 * (802.11be §36.3.12.8.1), and what is left to the AP. ② what the engine does — no sounding, no
 * leakage between members, no power split, a group trimmed until its members' streams fit the
 * router's own four, MU-MIMO only over the whole channel. ③ three runs.
 *
 * The figure must not send the reader to watch a sounding exchange: this simulator never runs
 * one, and ② says so in its first row.
 *
 * The scenario builder and the two variants are unchanged, so the recorded timeline hashes in
 * tests/fixtures/lesson-hashes.json stay byte-identical (and `mumimo-choose` still loads the same
 * scene). Every figure printed below, and every node of the figure, is read back out of the
 * lesson in tests/course/mumimo.test.ts; `tests/course/quoted-timestamps.test.ts` keeps its own
 * pins on the same two variants.
 */
import { type Lesson, firstData, firstBa, firstMuDl, J } from '../lessonKit'
import { mumimoScenario } from '../wifiScenes'
import type { TopologySpec } from '../diagram'

/** The Chinese name the figure gives each device of the scene. */
const DIAGRAM_NAMES: Record<string, string> = {
  ap: '路由器', 'sta-1': '手机 1', 'sta-2': '手机 2', 'sta-3': '手机 3', 'sta-4': '笔记本',
}

/**
 * The run's first MU-MIMO send, as who the router is aimed at: phones 2 and 3 share the
 * spectrum, phone 1 was trimmed off the end of the list because a third pair of streams does not
 * fit four antennas. Positions are the scene's own, so a device moved in the scenario moves in
 * the figure.
 */
export function mumimoTopology(): TopologySpec {
  const nodes = mumimoScenario(true).nodes.map((n) => ({
    id: n.id,
    label: DIAGRAM_NAMES[n.id],
    role: n.kind === 'ap' ? ('ap' as const) : ('sta' as const),
    x: n.pos.x,
    y: n.pos.y,
  }))
  return {
    kind: 'topology',
    nodes,
    links: [
      { from: 'ap', to: 'sta-2', tone: 'accent' },
      { from: 'ap', to: 'sta-3', tone: 'accent' },
      { from: 'ap', to: 'sta-1', tone: 'muted' },
      { from: 'ap', to: 'sta-4' },
    ],
    ring: { nodes: ['ap', 'sta-2', 'sta-3'], label: '这一轮的分组' },
  }
}

export const mumimo: Lesson = {
  id: 'mumimo',
  module: 9,
  title: 'MU-MIMO——按空间而不是按频率划分',
  why: '多用户 MIMO（multi-user MIMO, MU-MIMO）把几台站点（station, STA）编入同一次发送时，每台站点都得到整条信道：接入点（access point, AP）用几根天线（antenna）发送，经过波束成形（beamforming），给每台站点定向发送各自的空间流（spatial stream），成员之间靠空间而不是频率区分。按 IEEE 802.11be-2024，一个资源单元（resource unit, RU）上的 MU-MIMO 最多 8 个用户、每个用户最多 4 条空间流、合计不超过 8 条。要算出加在发送信号上的导向矩阵，接入点先要探测（channel sounding）：发出 NDP 通告帧和一个探测用的 NDP，站点测量信道后回报压缩波束成形报告。接入点怎样挑选成员、怎样由报告算出导向矩阵，标准都不规定。本仿真器不做探测，也不计算导向矩阵，直接假定成员之间没有泄漏；它把成员的空间流数之和限制在接入点自己的流数以内。本课的路由器有四根天线，三部手机各要两条流，所以按空间划分的一组永远只有两部手机，第三部被裁掉；按频率划分时，同一时刻三部手机可以同时编入。',
  outcomes: [
    '说出标准对 MU-MIMO 规定的上限，以及发送之前必须完成的探测',
    '分清本仿真器省去了什么、哪些是它自己的取法',
    '按天线数算出本课的一组最多几部手机，并在时间轴上验证',
  ],
  needs: ['streams', 'ofdma-dl'],
  terms: [
    { term: 'MU-MIMO', plain: '在一次发送中服务多台设备的另一种办法：给每台设备定向发送各自的一组空间流，而不是给每台分配一部分信道' },
    { term: 'beamforming', plain: '用多根天线发送同一个信号，按导向矩阵调整各天线的相位与幅度，使它在某个位置叠加增强、在另一个位置相互抵消' },
    { term: 'sounding', plain: '预先进行的信道测量：接入点发出一段已知的训练信号，每台设备把测得的信道状态回报给它' },
  ],
  standard: [
    { heading: 'MU-MIMO 的上限（802.11be-2024 §36.1.1；802.11-2024 §27.1.1）', text: '极高吞吐量（extremely high throughput, EHT）物理层（physical layer, PHY）支持下行（downlink, DL）和上行（uplink, UL）MU-MIMO，可以占整个 PPDU（PHY protocol data unit）带宽，也可以占不小于 242 音调的资源单元；一个使用 MU-MIMO 的资源单元最多 8 个用户，每个用户最多 4 条空间流，合计不超过 8 条。HE 物理层的上限相同，只是资源单元不小于 106 音调。' },
    { heading: '探测（802.11be-2024 §35.7.1；802.11-2024 §26.7.1、§26.7.3）', text: '发射波束成形和下行 MU-MIMO 需要知道信道状态，才能算出加在发送信号上的导向矩阵。探测时，波束成形的发起方发出一个探测用的 NDP，接收方测量信道，把估计结果以压缩波束成形报告送回，发起方用它推导导向矩阵。多用户（multi-user, MU）反馈只能在基于触发的探测序列里征询（§26.7.2）：广播的 NDP 通告帧列出两个及以上站点，一个短帧间间隔（short interframe space, SIFS）之后发 NDP，再隔一个 SIFS 发 BFRP 触发帧（Trigger frame），每个站点在 SIFS 之后用基于触发的 PPDU（trigger-based PPDU, TB PPDU）回报（§26.7.3）。' },
    { heading: '能力（802.11-2024 §26.7.2、§27.3.3.1.2）', text: '能发 4 条及以上空间流的 HE 接入点必须置位 MU Beamformer 能力，并支持占满整个带宽的下行 MU-MIMO；非接入点的 HE 站点必须支持作为 MU 波束成形的接收方。' },
    { heading: '信令（802.11be-2024 §36.3.12.8.1）', text: 'EHT 多用户 PPDU（multi-user PPDU, MU PPDU）的 EHT-SIG 字段包含资源分配信息，站点据此找到自己在 EHT 部分里使用的资源。' },
    { heading: '同时结束与确认（802.11-2024 §26.5.1.1、§10.3.2.13.2）', text: '下行多用户发送可以用正交频分多址（orthogonal frequency-division multiple access, OFDMA）、MU-MIMO 或两者兼用；各资源单元的数据填充（padding）到同一时刻结束。成员回复确认的规则与 OFDMA 相同：由触发帧或 TRS Control 子字段征询，没有被征询就不回复。' },
    { heading: '标准没有规定什么', text: '标准没有规定接入点挑选哪些站点组成一组，也没有规定怎样由反馈推导导向矩阵、怎样在用户之间分配发射功率（transmit power）。' },
    { kind: 'steps', heading: '一次下行 MU-MIMO 发送，按标准：逐步说明', items: [
      '接入点用基于触发的探测序列取得各站点的压缩波束成形报告（§26.7.3）。',
      '接入点由报告推导导向矩阵（§26.7.1）。',
      '接入点选定成员，使每个用户不超过 4 条、合计不超过 8 条空间流（802.11be-2024 §36.1.1）。',
      '在 EHT-SIG 里写明资源分配，发出多用户 PPDU，各成员的数据同时结束（802.11be-2024 §36.3.12.8.1，802.11-2024 §26.5.1.1）。',
      '用触发帧或 TRS Control 征询各成员的块确认（block acknowledgement, BlockAck）（§10.3.2.13.2）。',
    ] },
  ],
  implementation: [
    { topic: '探测', standard: 'NDP 通告帧、NDP、BFRP 触发帧与压缩波束成形报告（§26.7.3；802.11be §35.7）', sim: '没有实现：不发这些帧，也不计入它们的空口时间（airtime）；引擎里一对节点之间只有一个电平值，没有信道矩阵。', kind: 'absent' },
    { topic: '成员之间的泄漏', standard: '导向矩阵由反馈推导（§26.7.1），标准不规定残余泄漏', sim: '理想隔离：同一次发送的各成员互不计入干扰，每个成员的信噪比（signal-to-noise ratio, SNR）与单独发送时相同。', kind: 'choice' },
    { topic: '功率分配', standard: '标准未规定', sim: '不分配：每个成员的调制与编码方式（modulation and coding scheme, MCS）按它单独存在时的电平选。真实发射机要把同一份总功率分给各成员，两个成员各少 3 dB。', kind: 'choice' },
    { topic: '流数约束', standard: '每个用户不超过 4 条、合计不超过 8 条（802.11be §36.1.1）', sim: '成员协商的流数之和不超过接入点自己的流数（本课 4 条），超出时从名单末尾逐个裁掉；没有「每个用户 4 条」「合计 8 条」两项检查，本课的设备也到不了这两个数。', kind: 'choice' },
    { topic: '成员数上限', standard: '一个资源单元最多 8 个用户（802.11be §36.1.1）', sim: '至多四个成员。', kind: 'value' },
    { topic: '何时用 MU-MIMO', standard: '标准未规定', sim: '所有候选成员都协商过 MU-MIMO、且各自队首的数据不少于 1000 字节，才按空间划分；否则按频率划分。', kind: 'choice' },
    { topic: '资源单元内的 MU-MIMO', standard: 'EHT 可以在不小于 242 音调的资源单元上做 MU-MIMO，与 OFDMA 同时使用（802.11be §36.1.1）', sim: '没有实现：MU-MIMO 只占满整条信道，不与 OFDMA 混用。', kind: 'absent' },
    { topic: '同时结束', standard: '各资源单元的数据填充到同一时刻结束（§26.5.1.1）', sim: '整次发送的时长取所需最长的成员，各成员同时结束。', kind: 'faithful' },
    { topic: '确认', standard: '须由触发帧或 TRS Control 征询（§10.3.2.13.2）', sim: '照此：每个 MPDU（MAC protocol data unit）的 HT Control 字段带一个 TRS Control 子字段；各成员在一个 SIFS 之后，在各自的资源单元上用 EHT TB PPDU 同时回一个块确认。TB PPDU 的前导码（preamble）含 8 µs 的 EHT-STF、没有 EHT-SIG，包扩展取接入点通告的缺省包扩展时长（本仿真器取 16 µs），时长按式 (36-110) 取整到整微秒，本课每个 93.0 µs。没有被征询的成员不回复。', kind: 'faithful' },
    { topic: '信令开销', standard: 'EHT-SIG 携带资源分配信息，所占符号（symbol）数随用户与资源分配而定（802.11be §36.3.12.8.1）', sim: '多用户发送的前导码固定比单用户多 4 µs，不随成员数变化；4 µs 是代表值。', kind: 'differs' },
  ],
  labs: [
    {
      heading: '第一次按空间划分的发送',
      variant: 1,
      jump: 0,
      steps: [
        '载入「MU-MIMO（按空间划分）」，跳到第一次多用户发送。',
        '把鼠标悬停在这一帧上，读出成员、每个成员的空间流数和带宽；对照下图与下表。',
      ],
      blocks: [
        { kind: 'diagram', heading: '这一轮，路由器的波束对准哪些手机', spec: mumimoTopology(), caption: '路由器同时对准手机 2 和手机 3；虚线所示的手机 1 这一轮被裁掉。被裁掉的是哪一部并不固定，取决于那一时刻谁排在名单后面。' },
        { kind: 'table', heading: '三部手机都有数据排队的那一轮，按本仿真器的规则裁减', head: ['步骤', '数值'], rows: [
          ['队列中有数据的手机', '3'],
          ['都协商过 MU-MIMO，且队首都不少于 1000 字节', '是'],
          ['三部所需的流数，与路由器的四条相比', '6 > 4'],
          ['裁减后的成员', '2'],
          ['每个成员得到的信道', '整条 160 MHz'],
          ['每个成员的流数', '2'],
        ] },
      ],
      expect: '你应该看到：2595.0 µs 路由器发出一个 107.0 µs 的 MU-MIMO 发送，成员是手机 2 和手机 3，各用两条流、各占整条 160 MHz；手机 1 不在其中，而那一刻路由器的队列（queue）里有发给它的帧。',
      meaning: '这说明：按空间划分时成员不分频率（①）；手机 1 被裁掉，是因为三部手机要六条流，而本仿真器把流数之和限制在路由器的四条以内（②）。',
    },
    {
      heading: '同一时刻按频率划分',
      jump: 0,
      more: [1],
      steps: [
        '载入「OFDMA（按频率划分）」，跳到第一次多用户发送。',
        '和上一个实验的同一时刻对比：成员、每个成员的份额和这一帧的时长。',
      ],
      expect: '你应该看到：同样在 2595.0 µs，路由器把三部手机都编进一个 116.0 µs 的 OFDMA 发送，每部占三分之一条信道；按空间划分时同一时刻只编进两部，发送长 107.0 µs。',
      meaning: '这说明：空间流用完时，按频率划分仍然可以容纳更多成员。标准允许两种方式在一次发送里并用（①），本仿真器只能二选一（②）。',
    },
    {
      heading: '500 ms 里的分组',
      more: [1],
      steps: [
        '依次载入两个变体，各运行 500 ms。',
        '统计多用户发送的次数和成员数；在按空间划分的变体里，再看每次被裁掉的手机接下来怎样。',
      ],
      blocks: [
        { kind: 'table', heading: '500 ms，两种划分', head: ['测量项', 'OFDMA（按频率划分）', 'MU-MIMO（按空间划分）'], rows: [
          ['多用户发送', '182', '278'],
          ['其中三个成员', '149', '0'],
          ['其中两个成员', '33', '278'],
          ['16 µs 后一轮确认完成', '182', '278'],
          ['与笔记本的发送碰撞', '0', '0'],
        ] },
        { kind: 'table', heading: '按空间划分时，被裁掉的手机接下来', head: ['去向', '次数'], rows: [
          ['紧接着得到自己的单用户发送', '100（36%）'],
          ['出现在下一次组成的配对里', '172（62%）'],
          ['两者都不是，要再等一轮', '6（2%）'],
        ] },
      ],
      expect: '你应该看到：按空间划分的 278 次发送全部只有两个成员；按频率划分的 182 次里有 149 次三个成员。两种划分的每一次多用户发送都在 16 µs 后得到一轮确认，没有一次与笔记本的发送碰撞。被裁掉的手机多数出现在下一次组成的配对里，约三分之一紧接着得到自己的单用户发送。',
      meaning: '这说明：天线数是本仿真器裁减分组的唯一规则（②）；标准的上限（每个用户 4 条、合计 8 条、8 个用户）在本课从未起作用（①）。',
    },
  ],
  sources: [
    'IEEE Std 802.11be-2024：§36.1.1（EHT 的 MU-MIMO 上限，资源单元不小于 242 音调）、§35.7.1（EHT 探测）、§36.3.12.8.1（EHT-SIG 的资源分配信息）。IEEE Std 802.11-2024：§27.1.1（HE 的 MU-MIMO 上限，资源单元不小于 106 音调）、§26.7.1 至 §26.7.3（HE 探测、MU 反馈只在基于触发的探测序列里征询）、§27.3.3.1.2（四条流以上的接入点支持全带宽下行 MU-MIMO）、§26.5.1.1（下行多用户发送同时结束）、§10.3.2.13.2（确认的征询）。',
    '本仿真器的取值与取法：不做探测、成员之间理想隔离、不分配发射功率；流数之和不超过接入点自己的流数、从名单末尾裁减；一组至多四个成员；队首不少于 1000 字节才按空间划分；MU-MIMO 只占满整条信道；多用户发送的前导码固定多 4 µs。182、278、172 等计数来自本课两个变体 500 ms 的运行，可以复现。',
  ],
  limits: [],
  scenario: () => mumimoScenario(false),
  variants: [
    { label: 'OFDMA（按频率划分）', scenario: () => mumimoScenario(false) },
    { label: 'MU-MIMO（按空间划分）', scenario: () => mumimoScenario(true) },
  ],
  jumps: [
    J('第一次多用户发送', firstMuDl),
    J('第一个数据帧', firstData),
    J('第一个块确认', firstBa),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '为什么本课四天线的路由器不能用 MU-MIMO 同时服务三部两流手机？',
      options: [
        '三路定向发送的信号会在空口中相互碰撞',
        '它们的流数加起来是六条，比路由器拥有的多出一半；本仿真器把流数之和限制在路由器的流数以内',
        '标准规定 MU-MIMO 分组只能有两个成员',
      ],
      answer: 1,
      explain: '每部手机协商到两条流，两部手机就占满了全部四条。标准允许一个资源单元上最多 8 个用户，限制本课分组的是路由器自己的天线数。',
    },
    {
      q: '按空间划分的那次发送里，每个成员拿到多宽的信道？',
      options: [
        '一半——两个成员平分',
        '整条——成员之间分开的是空间，不是频率',
        '看它排了多少字节',
      ],
      answer: 1,
      explain: '任何成员都不让出带宽，区分成员依靠的是路由器的波束指向。代价由天线承担，而不是由带宽承担。',
    },
    {
      q: '按标准，接入点发 MU-MIMO 之前要先做什么？',
      options: [
        '什么都不用做',
        '探测：发 NDP 通告帧与 NDP，收回各站点的压缩波束成形报告，再推导导向矩阵',
        '把信道等分给各成员',
      ],
      answer: 1,
      explain: '§26.7.1 与 §26.7.3 的规定。本仿真器省去了这一步，也不计入它的空口时间，是一项没有实现的内容。',
    },
  ],
}
