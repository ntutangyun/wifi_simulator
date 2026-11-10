/**
 * Wi-Fi Tier 1 · M5 · 隐藏节点与帧丢失 · two stations deaf to each other.
 *
 * Standard-first shape (2026-11-11): ① IEEE Std 802.11-2024's hidden station (§3.1, §4.2.3), the
 * two CCA requirements of §17.3.10.6.1, the DCF backoff (§10.3.3, §10.3.4.3), the AckTimeout
 * (§10.3.2.11, Table 17-24) and the zero Duration of a closing Ack (§9.3.1.4); ② what this simulator
 * does with each — including that it turns the −82 dBm requirement, which the standard states as a
 * detection probability, into a hard threshold; ③ four runs of the unchanged corridor scene.
 *
 * The RTS/CTS variant stays declared here because `rts-cts` loads this scene unchanged
 * (`sameSceneAs: 'hidden'`) and the kit requires both lessons to carry the same variant list.
 *
 * Every figure the labs print is read back out of this file by tests/course/hidden.test.ts. The
 * scenario builder and its variant are unchanged, so the recorded timeline hashes in
 * tests/fixtures/lesson-hashes.json stay byte-identical.
 */
import type { Scenario } from '../../model/scenario'
import type { TopologySpec } from '../diagram'
import { type Lesson, hallwayHouse, node, sc, firstCollision, J } from '../lessonKit'

/**
 * The corridor house, shared with `rts-cts` so the two halves replay one
 * timeline: an access point in the hallway and one saturated legacy station in
 * each end room. `rtsThresholdBytes` is what the variant changes and nothing
 * else.
 */
export function hiddenScenario(extra: Partial<Scenario> = {}): Scenario {
  return sc(hallwayHouse(), [
    node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'nonht', 'saturated'),
    node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'nonht', 'saturated'),
  ], extra)
}

/** The Chinese name the figure gives each device of the scene. */
const DIAGRAM_NAMES: Record<string, string> = {
  ap: '接入点', 'sta-1': 'Hidden A', 'sta-2': 'Hidden B',
}

/**
 * Who hears whom, read out of the lesson's own scenario: the ids, the roles and
 * the positions all come from `hiddenScenario()`, so a station moved in the
 * scene moves in the figure, and the test compares the two node for node.
 *
 * The dashed line is the whole lesson: the path the run refuses. Both arrows to
 * the hallway cross one wall and work; the line along the bottom crosses two and
 * arrives below the level a radio calls a signal at all, which is why neither
 * station ever freezes for the other.
 */
export function hiddenTopology(): TopologySpec {
  const nodes = hiddenScenario().nodes.map((n) => ({
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
      { from: 'sta-1', to: 'ap', label: '一堵墙', tone: 'accent', both: true },
      { from: 'sta-2', to: 'ap', label: '一堵墙', tone: 'accent', both: true },
      { from: 'sta-1', to: 'sta-2', label: '两堵墙，收不到', tone: 'muted' },
    ],
  }
}

export const hidden: Lesson = {
  id: 'hidden',
  module: 4,
  title: '两台相互收不到信号的站点',
  why: '“先侦听后发送”的前提是每台站点（station, STA）都能侦听到同一网络里的其他站点，而 IEEE Std 802.11-2024 明确指出这一前提并不成立：一台站点的发送不能被另一台站点的载波侦听（carrier sense）检测到，却会干扰后者发往第三方的发送，它就是隐藏节点（hidden station）。标准对载波侦听只规定了两条最低要求：前导码（preamble）的起始电平不低于 −82 dBm 时，以大于 90% 的概率报忙；任何信号不低于 −62 dBm 时报忙。本课把两台站点放在房子两端，接入点（access point, AP）放在中间的走廊：两台站点各隔一堵墙即可与接入点通信，彼此之间隔着两堵墙。对面房间的数据帧（data frame）到达时比 −82 dBm 还低 1.4 dB，本仿真器把这条门限当作硬门限，于是每一次都判为空闲，退避（backoff）计数照常递减，减到零就发送，与对方正在发送的帧在接入点处重叠。发送方要等 ACK 超时（ACK timeout）到期才得知失败；远端站点唯一能收到的是接入点的确认帧（acknowledgement, ACK），它来得比要保护的那一帧晚，Duration 又为零。增大竞争窗口（contention window, CW）只能使能够相互侦听的站点错开，所以这个房间里碰撞几乎持续不断：300 ms 内 126 次碰撞，只送达 45 帧。标准为这种情况给出的机制，是下一课的请求发送（request to send, RTS）与允许发送（clear to send, CTS）交换。',
  outcomes: [
    '说出标准怎样定义隐藏节点，以及对载波侦听规定了哪两条门限',
    '分清本仿真器的哪些做法照标准、哪些是它自己的取法',
    '在时间轴上找出一次隐藏节点碰撞，并说出发生碰撞的是哪两帧',
  ],
  needs: ['collisions-cw', 'nav', 'cca'],
  terms: [
    { term: 'hidden node', plain: '同一个网络中的一台站点，本机的载波侦听检测不到它的发送，它的发送却会干扰本机发往第三方的帧' },
  ],
  standard: [
    { heading: '隐藏节点（§3.1，§4.2.3）', text: '一台站点的发送不能被第二台站点的载波侦听检测到，却会干扰第二台站点发往第三台站点的发送，这台站点称为隐藏节点。§4.2.3 指出，无线介质（medium）不保证全连通，「每台站点都能收到其他所有站点」这一假设并不成立。' },
    { heading: '物理载波侦听的两条门限（§17.3.10.6.1）', text: '20 MHz 信道上，正交频分复用（orthogonal frequency-division multiplexing, OFDM）传输的起始电平不低于 −82 dBm，即最低速率的灵敏度（sensitivity）时，空闲信道评估（clear channel assessment, CCA）必须在 4 µs 内以大于 90% 的概率报忙；任何信号的电平不低于 −62 dBm，即灵敏度加 20 dB 时，CCA 必须在 4 µs 内报忙。前者通常称为前导检测（preamble detection），后者称为能量检测（energy detection, ED）。' },
    { heading: '先侦听后发送（§10.3.3，§10.3.4.3）', text: '有帧待发的站点先用载波侦听判断介质忙闲；介质忙过之后，等介质连续空闲一个分布式帧间间隔（DCF interframe space, DIFS），再从 0 到 CW 之间均匀抽取一个退避数，每经过一个空闲的时隙（slot time）减一，减到 0 才发送。CW 从 aCWmin 开始，每次发送失败后按 2 的幂减 1 递增，直到 aCWmax；20 MHz 的 OFDM 物理层（physical layer, PHY）分别是 15 与 1023（表 17-24）。' },
    { heading: '发送方怎样得知失败（§10.3.2.11）', text: '发出一个需要确认的帧之后，发送方等待一段 ACK 超时，长度为 aSIFSTime + aSlotTime + aRxPHYStartDelay；20 MHz 的 OFDM 物理层分别是 16、9、20 µs（表 17-24）。这段时间内物理层没有报告开始接收，发送方就判定发送失败，启动退避。' },
    { heading: '确认帧不预告（§9.3.1.4）', text: '回复一个「更多分片」位为 0 的数据帧时，确认帧的 Duration 为 0，不为后续传输预约介质。' },
    { heading: '标准给出的补救（§10.3.1）', text: '§10.3.1 指出，RTS/CTS 机制可以改善一种典型情况：所有站点都能收到接入点，但不一定能收到同一网络里的其他所有站点。下一课讲这一机制。' },
    { kind: 'steps', heading: '两台隐藏节点之间的一次碰撞，按标准：逐步说明', items: [
      '站点 B 退避结束，开始发送。它的帧到达站点 A 处的电平低于两条门限，标准不要求 A 的 CCA 报忙（§17.3.10.6.1）。',
      'A 的载波侦听报空闲，退避计数照常递减，减到 0 就发送（§10.3.4.3）。',
      '两帧在接入点处重叠。标准不规定接收机怎样处理相叠的帧；接入点可能一帧也解不出，于是不回复确认帧。',
      '两台站点各自在 ACK 超时到期时判定失败，按 §10.3.3 增大 CW，重新退避（§10.3.2.11）。',
    ] },
  ],
  implementation: [
    { topic: '前导检测', standard: 'OFDM 传输的起始电平不低于 −82 dBm 时，4 µs 内以大于 90% 的概率报忙（§17.3.10.6.1）', sim: '本仿真器把它当作硬门限：电平不低于 −82 dBm 的前导码一定报忙，低于则一定不报。本课一台站点的帧到达另一台站点处是 −83.4 dBm，比门限低 1.4 dB，每一次都检测不到。', kind: 'differs' },
    { topic: '能量检测', standard: '任何信号的电平不低于 −62 dBm 时，4 µs 内报忙（§17.3.10.6.1）', sim: '照此：空中所有信号的电平之和不低于 −62 dBm 就报忙。本仿真器对整个工作信道宽度内的能量作比较；本课信道为 20 MHz，与标准的要求一致。', kind: 'faithful' },
    { topic: 'ACK 超时', standard: 'aSIFSTime + aSlotTime + aRxPHYStartDelay，16 + 9 + 20 µs（§10.3.2.11，表 17-24）', sim: '照此：发送方在帧结束 45 µs 后判定失败。', kind: 'faithful' },
    { topic: '退避与 CW', standard: '均匀抽取，CW 从 15 起按 2 的幂减 1 递增到 1023（§10.3.3，表 17-24）', sim: '照此。', kind: 'faithful' },
    { topic: '确认帧的 Duration', standard: '0（§9.3.1.4）', sim: '照此写 0，远端站点收到确认帧也不设置网络分配向量（network allocation vector, NAV）。', kind: 'faithful' },
    { topic: '相叠帧的接收', standard: '标准不规定接收机怎样处理相叠的帧', sim: '接入点锁定先到达的那一帧；另一帧在它接收期间开始时，按信干噪比（signal-to-interference-plus-noise ratio, SINR）判定整帧成败。本课两台站点到达接入点的电平相同，都是 −65.6 dBm，所以重叠的两帧都失败。', kind: 'choice' },
    { topic: '传播与墙体', standard: '标准不规定', sim: '只计算两点之间的直射路径，每穿过一堵墙扣除一份损耗：砖 12 dB、石膏板 5 dB、玻璃 3 dB；射线穿过门窗洞口时这堵墙不计。没有反射与绕射，所以「隔两堵砖墙就收不到」比真实房间理想得多。', kind: 'choice' },
    { topic: '衰落', standard: '标准不规定', sim: '默认关闭：到达电平只由几何位置与墙体决定，所以 1.4 dB 的差距每次都成立。编辑器可以开启衰落，默认阴影标准差 4 dB，足以使电平反复越过门限。', kind: 'choice' },
    { topic: '业务', standard: '标准不规定', sim: '两台站点都是饱和业务，始终有帧待发；真实设备的队列（queue）时常为空，同时有帧待发的机会少得多。', kind: 'choice' },
  ],
  labs: [
    {
      heading: '第一次碰撞',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一次碰撞。',
        '读出两帧开始与结束的时刻、长度与速率，再找出两台站点判定失败的时刻。',
      ],
      expect: '两台站点都在 0 µs 开始发送 1528 字节的数据帧，速率 48 Mb/s，各 276 µs；接入点在 276 µs 记录一次碰撞。两台站点都在 321 µs，即帧结束 45 µs 之后，因 ACK 超时判定失败。',
      meaning: 'ACK 超时照标准（② ACK 超时）。这一次两帧同时开始，能相互侦听的站点也会这样碰撞；隐藏节点特有的碰撞是下一次。',
    },
    {
      heading: '一方发送到一半，另一方开始发送',
      jump: 0,
      steps: [
        '从第一次碰撞继续播放，到第二次碰撞为止。',
        '读出两帧各自开始的时刻，以及 Hidden A 开始发送之前它的侦听结果。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '走廊户型：哪些设备之间能收到信号',
          spec: hiddenTopology(),
          caption: '接入点与两端的房间各隔一堵墙，两台站点之间隔着两堵砖墙。虚线这条路径不通，而两台站点使用的是同一条信道。',
        },
        { kind: 'table', heading: '对方的帧到达本机处的电平', head: ['帧', '到达电平', '与门限比较'], rows: [
          ['对面房间的数据帧', '−83.4 dBm', '比 −82 dBm 低 1.4 dB，比 −62 dBm 低二十多分贝'],
          ['接入点的确认帧', '−60.6 dBm', '高于 −82 dBm'],
        ] },
      ],
      expect: 'Hidden B 在 526 µs 开始发送，接入点锁定这一帧；27 µs 之后，即 553 µs，Hidden A 的侦听仍为空闲，它也开始发送。B 的帧在 802 µs 结束时接收失败，接入点记录碰撞；A 的帧也没有被解出。',
      meaning: 'B 的帧到达 A 处低于两条门限（① §17.3.10.6.1），本仿真器的硬门限使 A 每一次都检测不到（② 前导检测）。这就是 §3.1 定义的隐藏节点。',
    },
    {
      heading: '远端站点能收到什么',
      steps: [
        '载入本课场景，运行到 3.3 ms。',
        '看 Hidden A 在 1.95 ms 开始的那一帧：Hidden B 的计数在这段时间里怎样变化，接入点的确认帧到来时又怎样变化。',
      ],
      blocks: [
        { kind: 'table', heading: '整个交换过程中远端站点能收到什么', head: ['帧', '何时', '隔墙', '远端站点的反应'], rows: [
          ['近端的 1528 字节数据帧', '1.95 – 2.31 ms', '两堵', '计数持续递减：106、105、……66，其后那段间隔也照常计完'],
          ['接入点的确认帧', '2325 – 2353 µs', '一堵', '在 64 冻结，经过 28 µs 的确认帧和 34 µs 的等待后，2387 µs 从 64 继续'],
        ] },
      ],
      expect: 'A 的数据帧在空中期间，B 的计数从 106 递减到 66，一次也没有冻结。B 只为接入点的确认帧冻结；确认帧的 Duration 为 0，B 没有设置 NAV，A 的下一帧开始后 B 又照常递减。',
      meaning: '远端站点能收到的只有确认帧，它来得比要保护的那一帧晚，又不预约任何时间（① §9.3.1.4）。',
    },
    {
      heading: '300 ms 的统计',
      steps: [
        '载入本课场景，运行 300 ms。',
        '在检视器里读出碰撞次数、送达的帧数，并检查两台站点的每一次冻结是因为哪一帧。',
      ],
      expect: '300 ms 内两台站点共发出 216 个数据帧，碰撞 126 次，每一次都涉及一个数据帧，其中 125 次两帧开始的时刻不同；只有 45 帧被确认。两台站点共冻结 45 次，每一次都是因为接入点的确认帧，没有一次是因为另一个房间的帧。',
      meaning: '退避只能使能够相互侦听的站点错开（① §10.3.3）；增大 CW 无济于事。两台站点都能收到的只有接入点，下一课利用它。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：§3.1（隐藏节点的定义）、§4.2.3（无线介质不保证全连通）、§17.3.10.6.1（CCA 的两条门限）、§10.3.3 与 §10.3.4.3（退避）、§10.3.2.11 与表 17-24（ACK 超时及其三个参数、aCWmin 与 aCWmax）、§9.3.1.4（确认帧的 Duration）、§10.3.1（RTS/CTS 改善隐藏节点的情况）。',
    '本仿真器的取值与取法：两条门限作硬门限，墙体损耗常数表（src/engine/propagation.ts），默认无衰落，饱和业务。上面每一个计数、时刻与电平都来自本课场景的运行，可由随机种子复现，并非取自标准正文。',
  ],
  limits: [],
  scenario: () => hiddenScenario(),
  variants: [
    {
      label: '开启 RTS/CTS（门限 500 B）',
      scenario: () => hiddenScenario({ rtsThresholdBytes: 500 }),
    },
  ],
  jumps: [
    J('第一次碰撞', firstCollision),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '为什么增大竞争窗口（CW）无法解决隐藏节点的碰撞？',
      options: [
        '因为 CW 不能超过它的上限',
        '因为两台站点根本侦听不到彼此，无论等待多久，仍会与对方的帧重叠',
        '其实能解决，只是较慢',
      ],
      answer: 1,
      explain: '退避只能使能够相互侦听的站点错开；对于本机侦听不到的站点，根本无法与之轮流发送。',
    },
    {
      q: '远端站点判定信道空闲，是因为没有检测到什么？',
      options: [
        '没有收到接入点的许可',
        '收到的电平既未达到 −82 dBm 的前导检测门限，也未达到能量检测的 −62 dBm',
        '没有收到任何前导码',
      ],
      answer: 1,
      explain: '两条门限都未达到，CCA 就不报忙。标准只要求不低于门限时报忙；本仿真器把门限当作硬门限，低于门限一定不报忙。',
    },
    {
      q: '哪一项是本仿真器与标准不同的地方？',
      options: [
        'ACK 超时为 45 µs',
        '−82 dBm 的前导检测门限是一条硬门限，而标准要求的是以大于 90% 的概率检测',
        '确认帧的 Duration 为 0',
      ],
      answer: 1,
      explain: '§17.3.10.6.1 规定的是一个检测概率；本仿真器在门限上下作确定的判决。另外两项都照标准。',
    },
  ],
}
