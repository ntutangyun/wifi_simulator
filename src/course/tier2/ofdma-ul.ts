/**
 * Wi-Fi Tier 2 · M10 · Scheduled Wi-Fi 6/7 · the triggered uplink.
 *
 * **Standard-first shape (2026-11-11).** ① what IEEE Std 802.11-2024 says: the Trigger frame's
 * Common Info and User Info fields (§9.3.1.22), the HE TB PPDU a SIFS later at the length the
 * trigger names (§26.5.2.3.1, §26.5.2.3.3), the energy-detect and NAV check a CS Required
 * trigger asks for (§26.5.2.5), the acknowledgement a SIFS after (§10.3.2.13.3), the buffer
 * status reports the AP schedules from (§26.5.5), the target receive power (Table 9-54) and the
 * MU EDCA parameters a station switches to afterwards (§26.2.7). ② what the engine does — the AP
 * reads the stations' queues, an equal 1/n split, a 2 ms cap, a NAV-only check, no power control
 * and no MU EDCA. ③ four runs.
 *
 * Three corrections that were each wrong once, and must stay:
 *  - the power instruction is not carried out; the uploaders answer at their usual power;
 *  - what a triggered station checks before answering is the NAV only (mac.ts, `case 'trigger'`),
 *    where the standard also asks for energy detection during the SIFS;
 *  - a device given a slice keeps its own stream count (`nssForPeer`).
 *
 * The base scenario builder is unchanged, so the recorded timeline hash in
 * tests/fixtures/lesson-hashes.json stays byte-identical. Every figure printed below, and every
 * instant of the diagram, is read back out of the lesson in tests/course/ofdma-ul.test.ts.
 */
import { type Lesson, oneRoom, node, sc, firstTrigger, firstMba, J } from '../lessonKit'
import type { Scenario } from '../../model/scenario'
import type { SequenceSpec } from '../diagram'

/** The round the figure draws, in µs from the trigger frame's own start. */
export const ROUND = { trigger: 36, gap: 16, answers: 1988.8, mba: 36 }
/** When the answers start, and when the acknowledgement does. */
export const ROUND_AT = {
  answers: ROUND.trigger + ROUND.gap,
  mba: ROUND.trigger + ROUND.gap + ROUND.answers + ROUND.gap,
}

/**
 * One triggered round as an exchange: the access point's two arrows at 0 and at 2057 µs are ONE
 * frame each, naming both uploaders; the two answers start and end in the same instant, side by
 * side in frequency. Read off the constants above, which the test pins against the run.
 */
export function triggeredRound(): SequenceSpec {
  return {
    kind: 'sequence',
    columns: [
      { id: 'sta-1', label: '上传 A' },
      { id: 'ap', label: '接入点' },
      { id: 'sta-2', label: '上传 B' },
    ],
    messages: [
      { from: 'ap', to: 'sta-1', label: '触发帧', at: '0', tone: 'accent' },
      { from: 'ap', to: 'sta-2', label: '同一帧', tone: 'accent' },
      { from: 'sta-1', to: 'ap', label: '应答 A', at: `${ROUND_AT.answers} µs` },
      { from: 'sta-2', to: 'ap', label: '同时应答' },
      { from: 'ap', to: 'sta-1', label: '一帧确认', at: `${Math.round(ROUND_AT.mba)} µs` },
      { from: 'ap', to: 'sta-2', label: '同一帧' },
    ],
  }
}

/**
 * The lesson's room: one access point and two saturated uploaders. `ofdmaOff` names the nodes
 * whose OFDMA capability is switched off — empty for the base scene, which is the scene the
 * lesson always had, value for value.
 */
export function ofdmaUlScenario(ofdmaOff: readonly string[] = []): Scenario {
  const s = sc(oneRoom(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Uploader A', 'sta', 3.5, 5.5, 'he', 'saturated'),
    node('sta-2', 'Uploader B', 'sta', 6.5, 5.5, 'he', 'saturated'),
  ])
  for (const n of s.nodes) {
    if (ofdmaOff.includes(n.id)) n.caps.features = { ...n.caps.features, ofdma: false }
  }
  return s
}

export const ofdmaUl: Lesson = {
  id: 'ofdma-ul',
  module: 9,
  title: '触发帧——接入点调度上行',
  why: '几台站点（station, STA）要同时向接入点（access point, AP）发送，就必须在同一时刻开始、占用互不重叠的频段，而它们之间无法自行商定这些，所以 IEEE 802.11-2024 让接入点调度，同样用正交频分多址（orthogonal frequency-division multiple access, OFDMA）把信道分给几台站点，这是一种多用户（multi-user, MU）发送。从站点到接入点的方向称为上行（uplink, UL）。接入点发一个触发帧（Trigger frame），为每台被邀请的站点指定资源单元（resource unit, RU）、调制与编码方式（modulation and coding scheme, MCS）和期望的接收电平，并为整组指定同一个应答长度和带宽。被指定的站点在一个短帧间间隔（short interframe space, SIFS）之后同时发出基于触发的 PPDU（trigger-based PPDU, TB PPDU），各自填充（padding）到同一长度，接入点再用一个多站点块确认（multi-STA BlockAck）确认整组。触发帧要求侦听时，站点应答前要在那个 SIFS 里对自己资源单元所在的 20 MHz 信道做能量检测（energy detection, ED），并查看网络分配向量（network allocation vector, NAV），但不计入自己的接入点设置的那一份。接入点依据站点报告的缓存状态决定邀请谁。本仿真器的接入点直接读取站点的队列（queue），站点应答前只查 NAV、不做能量检测，也不执行功率指令。触发交换并不取代站点自己的竞争：在本课 100 ms 的运行里，触发交换只传送了约三分之一的上行字节，其余仍靠普通竞争发送。',
  outcomes: [
    '说出触发帧为整组规定了什么、为每台站点规定了什么',
    '说出被触发的站点按标准在应答前要检查什么，以及本仿真器省去了哪些',
    '在时间轴上读出一次触发交换，并说出触发交换之外站点怎样发送',
  ],
  needs: ['ofdma-dl'],
  terms: [
    { term: 'uplink', plain: '从设备到接入点的方向；反方向就是下行' },
    { term: 'trigger frame', plain: '接入点发出的一个短帧，规定接下来由哪些设备应答、各用哪一部分信道、用哪一级调制、应答多长' },
    { term: 'TB', plain: '基于触发：TB PPDU 是一种应答，设备只有在被触发帧或 TRS Control 指定时才可以发送' },
  ],
  standard: [
    { heading: '触发帧（§9.3.1.22）', text: '触发帧为一个或多个 HE TB PPDU 分配资源并征询它们。公共信息字段（Common Info）对整组有效，其中有 UL Length、CS Required、UL BW、GI And HE-LTF Type 与 AP Tx Power：UL Length 是应答里 L-SIG（legacy signal field）字段的长度值，UL BW 是应答的带宽；每台被邀请的站点有一个用户信息字段（User Info），其中有 AID12（站点关联标识的低 12 位）、RU Allocation（按表 9-53 与表 27-8 至表 27-10 指定资源单元）、UL HE-MCS、SS Allocation 与 UL Target Receive Power。帧尾可以加一个填充字段，给站点留出准备应答的时间。' },
    { heading: '应答（§26.5.2.3.1，§26.5.2.3.3）', text: '站点只有被明确触发时才可以发 HE TB PPDU；含触发帧的 PPDU（PHY protocol data unit）与 HE TB PPDU 之间隔一个 SIFS。HE TB PPDU 的 L-SIG 长度取触发帧的 UL Length，所以同一组的应答一样长；聚合 MPDU（aggregate MPDU, A-MPDU）装不满的部分要填充（§26.6.2.3）。触发帧里有站点不支持或无法满足的取值时，站点可以不应答（§26.5.2.3.2）。' },
    { heading: '应答前的侦听（§26.5.2.5）', text: 'CS Required 为 1 时，站点在触发帧之后的那个 SIFS 里用能量检测侦听，至少覆盖自己资源单元所在的 20 MHz 信道，并查看 NAV；这些信道都空闲才可以发送，否则不得发送。站点不计入自己关联的接入点设置的基本服务集（basic service set, BSS）内 NAV，但要计入基本 NAV。UL Length 超过 418 的 Basic 触发帧必须把 CS Required 置 1。' },
    { heading: '确认整组（§10.3.2.13.3，§9.3.1.8.6）', text: '接入点收到上行多用户帧后，在一个 SIFS 之后发确认，不管介质（medium）忙闲；可以是一个多站点块确认，也可以是放在一个 HE 多用户 PPDU（multi-user PPDU, MU PPDU）里的几个块确认（block acknowledgement, BlockAck）。多站点块确认同时确认几台站点时，接收端地址（receiver address, RA）设为广播地址。' },
    { heading: '接入点怎样知道谁有数据（§26.5.5）', text: '站点通过缓存状态报告告诉接入点自己有多少数据：写在服务质量（quality of service, QoS）控制字段的 Queue Size 子字段或 BSR Control 子字段里随帧捎带，或在接入点发出 BSRP 触发帧后专门回报。接入点据此分配上行多用户资源。' },
    { heading: '功率（§9.3.1.22，表 9-54）', text: 'UL Target Receive Power 给出接入点期望在自己天线（antenna）接口处收到的电平：取值 0 至 90 表示 −110 + 取值 dBm，127 表示站点以所分配的 HE-MCS 允许的最大功率发送。公共信息里的 AP Tx Power 给出接入点自己的发射功率（transmit power）。' },
    { heading: '之后的竞争（§26.2.7）', text: '站点在某个接入类别（access category, AC）上通过 HE TB PPDU 成功发出 QoS 数据帧（data frame）之后，要把这个接入类别的增强型分布式信道接入（enhanced distributed channel access, EDCA）竞争参数换成接入点通告的 MU EDCA 参数，并启动 MUEDCATimer。' },
    { kind: 'steps', heading: '一次上行多用户交换，按标准：逐步说明', items: [
      '站点随帧捎带缓存状态，或应接入点的 BSRP 触发帧回报（§26.5.5）。',
      '接入点按 EDCA 的规则赢得传输机会（transmit opportunity, TXOP）（§26.5.2.2.5）。',
      '接入点发 Basic 触发帧：公共信息给出 UL Length、UL BW 与 CS Required，每个用户信息给出资源单元、HE-MCS 与期望的接收电平（§9.3.1.22）。',
      'CS Required 为 1 时，每台被指定的站点在 SIFS 里做能量检测并查看 NAV（§26.5.2.5）。',
      '介质空闲的站点在 SIFS 之后发 HE TB PPDU，长度取 UL Length，装不满的部分填充（§26.5.2.3.1，§26.5.2.3.3）。',
      '接入点在 SIFS 之后发多站点块确认（§10.3.2.13.3）。',
      '成功发出数据的站点改用 MU EDCA 参数竞争（§26.2.7）。',
    ] },
  ],
  implementation: [
    { topic: '触发帧的长度', standard: '帧头（MAC header）16 字节、公共信息 8 字节、帧校验序列（frame check sequence, FCS）4 字节，Basic 触发帧每个用户信息 6 字节，可选填充字段（§9.3.1.22）', sim: '按 28 + 6 × 用户数计字节，不加填充字段；以 24 Mb/s 发送，24 Mb/s 是本仿真器的取值。帧里记录应答长度、带宽、格式和每个用户的份额与 MCS，不逐位填写各子字段。', kind: 'faithful' },
    { topic: '邀请谁', standard: '接入点依据站点报告的缓存状态分配资源（§26.5.5）', sim: '接入点直接读取各站点的发送队列，没有缓存状态报告，也就没有报告的时延与量化。', kind: 'differs' },
    { topic: '一组几台', standard: '触发帧可以只有一个用户信息字段（§9.3.1.22.1）；20 MHz 最多九个资源单元（表 27-7）', sim: '有积压、协商过 OFDMA 的站点不少于两台才发触发帧，按顺序取前四台；只剩一台时不发。', kind: 'choice' },
    { topic: '资源单元', standard: 'RU Allocation 从表 9-53 的固定尺寸里选（§9.3.1.22）', sim: '每台分到信道的 1/n；应答带宽取被邀请站点协商带宽中最小的；每台仍按自己协商的空间流（spatial stream）数应答。', kind: 'differs' },
    { topic: '应答长度', standard: '所有应答的 L-SIG 长度都取 UL Length（§26.5.2.3.3）', sim: '整组只有一个长度：取各站点积压所需空口时间（airtime）中最长的；各站点按这个长度发送，装不满的用填充补齐。', kind: 'faithful' },
    { topic: '长度上限', standard: 'aPPDUMaxTime 5.484 ms（表 27-61）', sim: '一个应答最长 2 ms，是本仿真器的取值；下行（downlink, DL）多用户发送用的是 5.484 ms。', kind: 'value' },
    { topic: '应答间隔', standard: 'SIFS（§26.5.2.3.1）', sim: '触发帧结束后 16 µs 开始应答。', kind: 'faithful' },
    { topic: '应答前的侦听', standard: 'SIFS 里对所在 20 MHz 信道做能量检测，并查看基本 NAV，不计本接入点设置的 BSS 内 NAV（§26.5.2.5）', sim: '只查一个 NAV：它有效、又不是这个接入点设置的，就不应答；不做能量检测。', kind: 'differs' },
    { topic: '功率', standard: 'UL Target Receive Power 与 AP Tx Power（§9.3.1.22，表 9-54）', sim: '没有这两个字段：站点按自己原有的功率应答；接收端也没有自动增益模型，同时到达的几路强弱相差多少都不影响判决。', kind: 'absent' },
    { topic: '多站点块确认', standard: '收到之后一个 SIFS 发送，不管介质忙闲（§10.3.2.13.3）', sim: '应答结束后 16 µs 发出，按 32 字节加每多一台 8 字节计，以 24 Mb/s 发送；字节数是代表值，不按字段逐项相加。', kind: 'value' },
    { topic: '无人应答', standard: '侦听为忙时站点不得应答（§26.5.2.5）；无法满足的触发帧站点可以不应答（§26.5.2.3.2）', sim: '触发帧结束后 45 µs 内没有任何应答开始，接入点就作废这一轮、收回空口；45 µs 是本仿真器的确认超时。', kind: 'choice' },
    { topic: 'MU EDCA', standard: '成功参与之后改用 MU EDCA 参数（§26.2.7）', sim: '没有实现：站点在两次触发交换之间仍按原来的 EDCA 参数竞争。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '一次触发交换',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一个触发帧。',
        '依次读出触发帧、两个应答和最后那个确认的开始时刻、时长与字节数；对照下图与下表。',
      ],
      blocks: [
        { kind: 'diagram', heading: '一次触发交换的结构', spec: triggeredRound(), caption: '接入点的两次发送各是一帧，每一帧同时指定两台上传设备；两个应答在频率上并列，同时开始、同时结束。' },
        { kind: 'table', heading: '第一次触发交换，按本仿真器的规则算一遍', head: ['步骤', '数值'], rows: [
          ['有积压的上传设备', '2'],
          ['每台分到的信道', '1/2'],
          ['一个 2 ms 的应答最多容纳', '17,425 B'],
          ['这些字节需要的符号（symbol）数', '143'],
          ['因此应答长度', '44 + 13.6 × 143 = 1988.8 µs'],
          ['每个应答实际承载', '11 帧，16,894 B；其余 531 B 是填充'],
          ['触发帧', '28 + 6 × 2 = 40 B，24 Mb/s，36 µs'],
          ['多站点块确认', '32 + 8 = 40 B，36 µs'],
          ['整次交换', '36 + 16 + 1988.8 + 16 + 36 = 2092.8 µs，上行 33,788 B'],
        ] },
      ],
      expect: '你应该看到：7857.2 µs 接入点发出 36 µs 的触发帧，它的 Duration 字段是 2056.8 µs，覆盖后面的应答和确认；7909.2 µs 两台上传设备同时开始应答，各 1988.8 µs、各 16,894 字节，分别在信道的前一半和后一半；9914.0 µs 接入点发出 36 µs 的多站点块确认。',
      meaning: '这说明：两个应答同一时刻开始、同一时刻结束，是因为触发帧指定了同一个长度、站点用填充补齐（①）；17,425 B 这个上限来自本仿真器取的 2 ms（②）。',
    },
    {
      heading: '一帧确认整组',
      jump: 1,
      steps: [
        '跳到第一个多站点块确认，看它确认了哪几台上传设备。',
        '回到触发帧与应答之间，查看两台上传设备在应答之前有没有退避（backoff）记录。',
      ],
      expect: '你应该看到：这一帧 40 字节、36 µs，同时确认两台上传设备；两台上传设备在触发帧结束与应答开始之间没有任何退避记录。',
      meaning: '这说明：一帧确认覆盖整组（①）；站点应答前不退避，只查 NAV，不做标准要求的能量检测（②，与标准不同）。',
    },
    {
      heading: '100 ms 里的上行',
      steps: [
        '载入本课场景，运行 100 ms。',
        '统计触发帧、无人应答的触发帧、HE TB PPDU 与普通竞争发送的次数和字节。',
      ],
      blocks: [
        { kind: 'table', heading: '两台上传设备，100 ms', head: ['项目', '次数', '上行字节'], rows: [
          ['触发帧', '16', '—'],
          ['其中无人应答', '2', '0'],
          ['HE TB PPDU', '28', '473,032'],
          ['普通竞争发送', '54', '996,756'],
        ] },
      ],
      expect: '你应该看到：触发交换只传送了约三分之一的上行字节，其余靠普通竞争发送；期间碰撞 6 次，全部发生在触发交换之外；有 2 个触发帧无人应答，接入点等 45 µs 后收回空口。',
      meaning: '这说明：触发帧是接入点的一种发送，不取代站点自己的竞争（①）；本仿真器没有实现 MU EDCA，站点在两次触发交换之间仍按原参数竞争（②）。',
    },
    {
      heading: '只剩一台协商了 OFDMA',
      variant: 0,
      steps: [
        '载入「上传设备 A 关闭 OFDMA」，运行 100 ms。',
        '统计触发帧的个数。',
      ],
      expect: '你应该看到：一个触发帧也没有，上传设备 B 也只靠普通竞争发送。',
      meaning: '这说明：「至少两台才发触发帧」是本仿真器的取法（②）；标准允许只带一个用户信息字段的触发帧（①）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§9.3.1.22 与图 9-91、图 9-93、表 9-53、表 9-54（触发帧的公共信息、用户信息、RU Allocation 与 UL Target Receive Power）、§26.5.2.3.1 至 §26.5.2.3.3（何时可以发 HE TB PPDU、何时可以不应答、L_LENGTH 取 UL Length）、§26.5.2.5（CS Required 时的能量检测与 NAV）、§26.6.2.3（HE TB PPDU 里 A-MPDU 的填充）、§10.3.2.13.3 与 §9.3.1.8.6（上行多用户的确认、多站点块确认）、§26.5.5（缓存状态报告）、§26.2.7（MU EDCA 参数）、表 27-61（aPPDUMaxTime 5.484 ms）。',
    '本仿真器的取值与取法：触发帧以 24 Mb/s 发送；一组二至四台、信道等分；应答最长 2 ms；接入点直接读取站点队列；站点只查 NAV；功率指令与 MU EDCA 都没有实现；多站点块确认 32 + 8 字节；无人应答时 45 µs 作废。16、28、54、6 等计数来自本课场景 100 ms 的运行，可以复现。',
  ],
  limits: [],
  scenario: () => ofdmaUlScenario(),
  variants: [
    { label: '上传设备 A 关闭 OFDMA', scenario: () => ofdmaUlScenario(['sta-1']) },
  ],
  jumps: [
    J('第一个触发帧', firstTrigger),
    J('第一个多站点块确认', firstMba),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '两台设备为什么无法自行协商完成一次共享的上行发送？',
      options: [
        '它们的电台无法只在信道的一部分上发射',
        '没有任何机制能为它们提供共同的起始时刻、共同的长度和互不重叠的资源单元——而且它们也无法得知对方的打算',
        '法规禁止两台设备同时发射',
      ],
      answer: 1,
      explain: '在彼此收不到的设备之间，无法协商出「同时」。它可以由所有设备都能收到的那台设备来指定，触发帧的作用正是如此。',
    },
    {
      q: '有一台上传设备排队的数据比另一台少得多。它的 HE TB PPDU 会是什么样的？',
      options: [
        '更短，因此整次交换结束得更早',
        '长度相同，其余部分用填充补齐——同一组的应答都取触发帧给出的长度',
        '它根本不被允许应答',
      ],
      answer: 1,
      explain: '§26.5.2.3.3 让每个 HE TB PPDU 的 L-SIG 长度都取触发帧的 UL Length。同时结束，一个确认才能确认整组。',
    },
    {
      q: '触发帧的 CS Required 为 1 时，被触发的站点按标准在应答前要做什么？',
      options: [
        '什么都不做，直接应答',
        '在那个 SIFS 里对自己资源单元所在的 20 MHz 信道做能量检测，并查看 NAV（不计本接入点设置的 BSS 内 NAV）',
        '像普通发送一样完成一次退避',
      ],
      answer: 1,
      explain: '§26.5.2.5 的规定。本仿真器只查 NAV，不做能量检测，这是它与标准不同的地方。',
    },
  ],
}
