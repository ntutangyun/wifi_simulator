/**
 * Wi-Fi MAC course: bilingual lessons, each with a deterministic preset
 * scenario, jump-to targets over the recorded timeline, an observation
 * checklist, experiments and a self-check quiz.
 *
 * Content is MAC-focused: channel access (DCF), NAV, EDCA, aggregation,
 * TXOP, OFDMA scheduling and MLO. PHY appears only as far as the MAC
 * needs it (frames cost airtime; rate depends on link quality).
 */
import { defaultFeatures } from '../model/caps'
import type { NodeCfg, ProfileId, Room, Scenario, Wall } from '../model/scenario'
import type { TLRecord } from '../model/records'
import type { Generation } from '../model/types'

export interface L10n {
  en: string
  zh: string
}

export interface Quiz {
  q: L10n
  options: L10n[]
  answer: number
  explain: L10n
}

export interface JumpTarget {
  label: L10n
  find: (r: TLRecord) => boolean
}

export interface LessonVariant {
  label: L10n
  scenario: () => Scenario
}

export interface Lesson {
  id: string
  module: number
  minutes: number
  title: L10n
  body: { heading?: L10n; text: L10n }[]
  scenario: () => Scenario
  variants?: LessonVariant[]
  jumps: JumpTarget[]
  observe: L10n[]
  tryThis: L10n[]
  quiz: Quiz[]
}

export const MODULES: L10n[] = [
  { en: 'Channel-access foundations (DCF)', zh: '信道接入基础（DCF）' },
  { en: 'QoS & efficiency (Wi-Fi 5 era)', zh: 'QoS 与效率（Wi-Fi 5 时代）' },
  { en: 'Scheduled Wi-Fi (Wi-Fi 6/7)', zh: '被调度的 Wi-Fi（Wi-Fi 6/7）' },
]

// ---------------------------------------------------------------------------
// scenario building blocks
// ---------------------------------------------------------------------------

const brick = (x1: number, y1: number, x2: number, y2: number): Wall =>
  ({ x1, y1, x2, y2, material: 'brick', openings: [] })
const drywallDoor = (x1: number, y1: number, x2: number, y2: number, from: number): Wall =>
  ({ x1, y1, x2, y2, material: 'drywall', openings: [{ from, to: from + 0.9 }] })

/** Single 10×8 room with a brick shell. */
function oneRoom(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [{ x: 0, y: 0, w: 10, h: 8, name: 'Lab' }],
    walls: [brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0)],
  }
}

/** Two rooms; solid brick divider (hidden-node) or drywall with a door. */
function twoRooms(solidDivider: boolean): { rooms: Room[]; walls: Wall[] } {
  const divider = solidDivider ? brick(5, 0, 5, 8) : drywallDoor(5, 0, 5, 8, 3.5)
  return {
    rooms: [
      { x: 0, y: 0, w: 5, h: 8, name: 'Room A' },
      { x: 5, y: 0, w: 5, h: 8, name: 'Room B' },
    ],
    walls: [brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0), divider],
  }
}

function node(
  id: string, name: string, kind: 'ap' | 'sta', x: number, y: number,
  gen: Generation, profile: ProfileId,
  features?: Record<string, boolean>, z?: number,
): NodeCfg {
  return {
    id, kind, name, pos: { x, y, z: z ?? (kind === 'ap' ? 2.0 : 1.0) },
    txPowerDbm: kind === 'ap' ? 20 : 15, profile,
    caps: { generation: gen, features: features ?? defaultFeatures(gen) },
  }
}

function sc(house: { rooms: Room[]; walls: Wall[] }, nodes: NodeCfg[], extra: Partial<Scenario> = {}): Scenario {
  return {
    ...house, nodes,
    seed: 7, rtsThresholdBytes: 3000, snapshotIntervalMs: 10,
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// jump-target predicates
// ---------------------------------------------------------------------------

const txOf = (pred: (r: Extract<TLRecord, { type: 'TX_START' }>) => boolean) =>
  (r: TLRecord): boolean => r.type === 'TX_START' && pred(r)

const firstData = txOf((r) => r.frame.kind === 'data')
const firstAck = txOf((r) => r.frame.kind === 'ack')
const firstBa = txOf((r) => r.frame.kind === 'ba')
const firstRts = txOf((r) => r.frame.kind === 'rts')
const firstAmpdu = txOf((r) => r.frame.ampdu !== undefined)
const firstMuDl = txOf((r) => r.frame.kind === 'data' && r.frame.muParts !== undefined)
const firstTrigger = txOf((r) => r.frame.kind === 'trigger')
const firstMba = txOf((r) => r.frame.kind === 'mba')
const first6g = txOf((r) => r.node.includes('#6g') && r.frame.kind === 'data')
const firstCollision = (r: TLRecord): boolean => r.type === 'COLLISION'
const firstRetry = (r: TLRecord): boolean => r.type === 'RETRY'
const firstNav = (r: TLRecord): boolean => r.type === 'NAV_SET'
const firstBackoffDraw = (r: TLRecord): boolean => r.type === 'BACKOFF_DRAW'
const firstFreeze = (r: TLRecord): boolean => r.type === 'BACKOFF_FREEZE'
const firstTxop = (r: TLRecord): boolean => r.type === 'TXOP_START'
const firstInternal = (r: TLRecord): boolean => r.type === 'INTERNAL_COLLISION'
const firstVo = (r: TLRecord): boolean =>
  (r.type === 'BACKOFF_DRAW' || r.type === 'IFS_START') && r.ac === 3

const J = (en: string, zh: string, find: (r: TLRecord) => boolean): JumpTarget =>
  ({ label: { en, zh }, find })

// ---------------------------------------------------------------------------
// lessons
// ---------------------------------------------------------------------------

export const LESSONS: Lesson[] = [
  // ======================= MODULE 1 =======================
  {
    id: 'airtime',
    module: 0,
    minutes: 10,
    title: { en: '1 · Frames cost airtime', zh: '1 · 帧要花“空口时间”' },
    body: [
      { text: {
        en: 'The MAC manages one shared, half-duplex medium. Its currency is airtime: while any frame is in the air, nobody else in range can use the channel. A frame’s airtime = a fixed preamble + payload symbols, so it grows with size and shrinks with data rate (MCS). Everything the MAC does — waiting, backing off, aggregating, scheduling — exists to spend this airtime well.',
        zh: 'MAC 管理的是一条共享的半双工介质，它的“货币”就是空口时间：只要有帧在空中，范围内的其他设备都用不了信道。一个帧的空口时间 = 固定的前导 + 数据符号，因此帧越大耗时越长、速率（MCS）越高耗时越短。MAC 做的一切——等待、退避、聚合、调度——都是为了把空口时间花得值。',
      } },
      { text: {
        en: 'Load the simulation: one AP streams video to one station. Hover a blue block in the timeline: you can read its size, MCS and exact duration. Note how the white ACK is tiny but never optional — the sender cannot hear collisions, so only the ACK proves delivery.',
        zh: '载入仿真：一个 AP 向一台终端推送视频流。将鼠标悬停在时间轴的蓝色块上，可以看到帧大小、MCS 与精确时长。注意白色的 ACK 很小却必不可少——发送方听不到碰撞，只有 ACK 能证明帧已送达。',
      } },
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
      { en: 'Between exchanges the channel is idle — video at this rate barely uses the medium.', zh: '两次交换之间信道是空闲的——这个码率的视频几乎用不满介质。' },
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
  },

  {
    id: 'ifs',
    module: 0,
    minutes: 12,
    title: { en: '2 · SIFS, DIFS and the ACK dance', zh: '2 · SIFS、DIFS 与 ACK 之舞' },
    body: [
      { text: {
        en: 'Wi-Fi encodes priority as silence lengths. SIFS (16 µs) is the shortest gap — only the ongoing exchange may continue after it, which is why an ACK can never be beaten to the channel. DIFS (34 µs = SIFS + 2 slots) is what a new contender must observe. EIFS (94 µs) punishes anyone who heard a corrupted frame: they must assume an ACK they could not decode may be in flight.',
        zh: 'Wi-Fi 用“沉默的长短”来编码优先级。SIFS（16 µs）最短——只有正在进行的帧交换才能在它之后继续，所以 ACK 永远不会被抢先。DIFS（34 µs = SIFS + 2 个时隙）是新竞争者必须观察到的静默。EIFS（94 µs）则是对听到损坏帧者的“惩罚”：它必须假设有一个自己没解出的 ACK 正在空中。',
      } },
      { text: {
        en: 'Load the simulation and pause on any exchange, then step with −µs/+µs through the gap between DATA and ACK: nothing moves for exactly 16 µs. Then find the gap before a new data frame: at least DIFS, often followed by amber backoff slots.',
        zh: '载入仿真后在任意一次帧交换处暂停，用 −µs/+µs 步进穿过 DATA 与 ACK 之间的间隙：整整 16 µs 内空口纹丝不动。再看新数据帧之前的间隙：至少一个 DIFS，之后往往还跟着琥珀色的退避时隙。',
      } },
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
          { en: 'To give responses absolute priority: nobody contending (waiting DIFS) can cut into an ongoing exchange', zh: '让响应帧拥有绝对优先权：等待 DIFS 的竞争者不可能插入正在进行的交换' },
          { en: 'Because ACK frames are physically shorter', zh: '因为 ACK 帧本身更短' },
          { en: 'It is a historical accident', zh: '这只是历史遗留' },
        ],
        answer: 0,
        explain: { en: 'The gap hierarchy IS the priority mechanism: SIFS < DIFS guarantees the exchange completes before anyone else may start.', zh: '间隔的长短就是优先级机制本身：SIFS < DIFS 保证交换先完成，别人才可能开始。' },
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
  },

  {
    id: 'backoff',
    module: 0,
    minutes: 15,
    title: { en: '3 · Random backoff & collisions', zh: '3 · 随机退避与碰撞' },
    body: [
      { text: {
        en: 'When two stations both want the channel, silence alone cannot break the tie — both would finish DIFS at the same instant. So each draws a random count from [0, CW] and decrements once per idle 9 µs slot; the lower draw wins. Equal draws mean both hit zero in the same slot and transmit on top of each other: a collision. Neither notices until the 45 µs ACK timeout expires; then each doubles its CW (15→31→…→1023) and redraws — collisions get rapidly less likely.',
        zh: '当两台终端都想要信道时，仅靠静默无法决出胜负——它们会在同一瞬间等完 DIFS。因此每台都从 [0, CW] 抽一个随机数，介质每空闲一个 9 µs 时隙就减一，抽得小的先发。若抽到相同值，双方会在同一时隙同时清零、同时发送：碰撞。双方都要等到 45 µs 的 ACK 超时才察觉，然后各自把 CW 翻倍（15→31→…→1023）并重抽——碰撞概率随之骤降。',
      } },
      { text: {
        en: 'This scenario saturates two legacy stations. Use “first collision”: the red tick marks two overlapping transmissions. Step backwards from it and watch both backoff counters reach zero in the same slot — the collision was fully determined a moment earlier.',
        zh: '本场景让两台传统终端处于饱和状态。点“第一次碰撞”：红色刻度处两次传输重叠。从那里往回步进，会看到两个退避计数器在同一时隙同时清零——碰撞在片刻之前就已注定。',
      } },
    ],
    scenario: () => sc(oneRoom(), [
      node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
      node('sta-1', 'STA-1', 'sta', 3.5, 5, 'nonht', 'saturated'),
      node('sta-2', 'STA-2', 'sta', 6.5, 5, 'nonht', 'saturated'),
    ]),
    jumps: [
      J('first collision', '第一次碰撞', firstCollision),
      J('first retry', '第一次重传', firstRetry),
      J('first backoff freeze', '第一次退避冻结', firstFreeze),
      J('first CW doubling', '第一次 CW 翻倍', (r) => r.type === 'CW_CHANGE' && r.cw > 15),
    ],
    observe: [
      { en: 'Backoff counters (bo:n) decrement only while the medium is idle; they freeze when the other station transmits and resume at the same value.', zh: '退避计数（bo:n）只在介质空闲时递减；对方发送时冻结，之后从同一数值继续。' },
      { en: 'After a collision, both stations show CW → 31 in the inspector, and the retry frame carries the Retry flag.', zh: '碰撞后检视器里双方的 CW 都变成 31，重传帧带有 Retry 标志。' },
      { en: 'Retries draw from the doubled window: gaps before retransmissions are visibly longer on average.', zh: '重传从翻倍后的窗口抽取：重传前的等待间隙平均明显更长。' },
    ],
    tryThis: [
      { en: 'Count the idle slots between DIFS end and TX start — it always equals the drawn backoff value.', zh: '数一数 DIFS 结束到发送开始之间的空闲时隙数——永远等于抽到的退避值。' },
      { en: 'Change the seed in the editor and reload: different draws, different collision times, same physics.', zh: '在编辑器中改个种子再载入：抽值不同、碰撞时刻不同，但规律完全一致。' },
    ],
    quiz: [
      {
        q: { en: 'How does a station discover that its frame collided?', zh: '终端如何发现自己的帧发生了碰撞？' },
        options: [
          { en: 'It hears the interference while transmitting', zh: '发送时听到了干扰' },
          { en: 'The ACK never arrives (timeout after 45 µs)', zh: 'ACK 一直没来（45 µs 后超时）' },
          { en: 'The AP broadcasts a collision notification', zh: 'AP 广播碰撞通知' },
        ],
        answer: 1,
        explain: { en: 'Half-duplex radios cannot listen while talking — collision *avoidance*, not detection.', zh: '半双工的无线电边说边听做不到——所以是碰撞“避免”而非“检测”。' },
      },
      {
        q: { en: 'Why double CW after each failure?', zh: '为什么每次失败后 CW 都要翻倍？' },
        options: [
          { en: 'To punish misbehaving stations', zh: '惩罚行为不端的终端' },
          { en: 'More contenders ⇒ more collisions ⇒ spreading draws over a wider range separates them', zh: '竞争者越多碰撞越多⇒把抽值范围拉大能把它们分开' },
          { en: 'To save battery', zh: '为了省电' },
        ],
        answer: 1,
        explain: { en: 'Binary exponential backoff adapts the contention window to the (unknown) number of active stations.', zh: '二进制指数退避让竞争窗口自适应于（未知的）活跃终端数量。' },
      },
    ],
  },

  {
    id: 'nav',
    module: 0,
    minutes: 10,
    title: { en: '4 · NAV — reserving with a promise', zh: '4 · NAV——用“预告”预约信道' },
    body: [
      { text: {
        en: 'Physical carrier sense only tells you the channel is busy *now*. But an exchange is longer than one frame: after the data comes SIFS, then the ACK. The Duration field in every MAC header announces how much longer the exchange needs, and every overhearer loads it into a countdown timer — the NAV. While NAV > 0 the station treats the medium as busy even in perfect silence. That is virtual carrier sense: the SIFS gap is protected not by energy, but by a promise everyone heard.',
        zh: '物理载波侦听只能告诉你“此刻”信道忙。但一次交换比一个帧长：数据之后还有 SIFS 和 ACK。每个 MAC 头里的 Duration 字段都会预告本次交换还需要多久，每个侦听到的终端把它装入一个倒数计时器——NAV。只要 NAV > 0，即使空口一片寂静，终端也视介质为忙。这就是虚拟载波侦听：SIFS 间隙靠的不是能量，而是所有人都听到的一句承诺。',
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
  },

  {
    id: 'hidden',
    module: 0,
    minutes: 15,
    title: { en: '5 · Hidden nodes & RTS/CTS', zh: '5 · 隐藏节点与 RTS/CTS' },
    body: [
      { text: {
        en: 'Carrier sense assumes everyone can hear everyone. Put a thick wall between two stations and that breaks: each senses an idle channel while the other is mid-frame, and their transmissions meet — and die — at the AP. This is the hidden-node problem, and no amount of backoff fixes it, because the contenders never see each other contend.',
        zh: '载波侦听默认所有人都能互相听见。在两台终端之间放一堵厚墙，这个假设就碎了：一方正在发帧，另一方却侦听到“空闲”，两股信号在 AP 处相遇、同归于尽。这就是隐藏节点问题——多少退避都治不了它，因为竞争双方根本看不见彼此在竞争。',
      } },
      { text: {
        en: 'The cure is to make the *AP* announce the reservation: a short RTS asks, the AP answers CTS, and the CTS — audible to both rooms — sets everyone’s NAV. Now only a tiny RTS can ever collide, not a long data frame. Compare the two variants below.',
        zh: '解法是让 AP 来宣布预约：终端先发一个很短的 RTS，AP 回一个 CTS——两个房间都听得到 CTS，于是所有人的 NAV 都被设置。这样可能碰撞的只剩小小的 RTS，而不是长长的数据帧。对比下面两个场景变体。',
      } },
    ],
    scenario: () => sc(twoRooms(true), [
      node('ap', 'AP', 'ap', 5, 1.2, 'eht', 'idle'),
      node('sta-1', 'Hidden A', 'sta', 1.5, 6, 'nonht', 'saturated'),
      node('sta-2', 'Hidden B', 'sta', 8.5, 6, 'nonht', 'saturated'),
    ]),
    variants: [
      {
        label: { en: 'RTS/CTS ON (threshold 500 B)', zh: '开启 RTS/CTS（门限 500 B）' },
        scenario: () => sc(twoRooms(true), [
          node('ap', 'AP', 'ap', 5, 1.2, 'eht', 'idle'),
          node('sta-1', 'Hidden A', 'sta', 1.5, 6, 'nonht', 'saturated'),
          node('sta-2', 'Hidden B', 'sta', 8.5, 6, 'nonht', 'saturated'),
        ], { rtsThresholdBytes: 500 }),
      },
    ],
    jumps: [
      J('first collision', '第一次碰撞', firstCollision),
      J('first RTS', '第一个 RTS', firstRts),
    ],
    observe: [
      { en: 'Base scenario: stations transmit straight through each other’s frames — the red collision ticks pile up.', zh: '基础场景：两台终端径直在对方的帧中间开始发送——红色碰撞刻度不断累积。' },
      { en: 'Neither hidden station ever freezes its backoff for the other: they cannot hear each other at all.', zh: '两台隐藏终端的退避从不因对方而冻结：它们完全听不到彼此。' },
      { en: 'RTS variant: after a CTS, the other room’s station shows NAV and waits — data frames stop colliding.', zh: 'RTS 变体：CTS 之后另一个房间的终端出现 NAV 并等待——数据帧不再碰撞。' },
    ],
    tryThis: [
      { en: 'Count COLLISION ticks per 100 ms in both variants (inspector → BSS totals).', zh: '分别统计两个变体每 100 ms 的碰撞数（检视器 → BSS 总览）。' },
      { en: 'In the editor, punch a door in the divider — the stations partially hear each other again.', zh: '在编辑器里给隔墙开一扇门——两台终端又能部分听到彼此了。' },
    ],
    quiz: [
      {
        q: { en: 'Why doesn’t CW doubling solve hidden-node collisions?', zh: '为什么 CW 翻倍解决不了隐藏节点碰撞？' },
        options: [
          { en: 'CW cannot exceed 1023', zh: '因为 CW 不能超过 1023' },
          { en: 'The stations never sense each other, so they keep transmitting into each other’s frames regardless of backoff', zh: '双方根本侦听不到彼此，不管怎么退避都会撞进对方的帧里' },
          { en: 'It does solve it, just slowly', zh: '其实能解决，只是慢' },
        ],
        answer: 1,
        explain: { en: 'Backoff only avoids collisions among stations that can hear each other’s transmissions.', zh: '退避只能避免“互相听得见”的终端之间的碰撞。' },
      },
      {
        q: { en: 'What makes CTS effective against hidden nodes?', zh: 'CTS 为什么能治隐藏节点？' },
        options: [
          { en: 'It is transmitted at higher power', zh: '它用更大的功率发送' },
          { en: 'It comes from the AP, which both hidden stations can hear — its Duration sets their NAVs', zh: '它由 AP 发出，两台隐藏终端都听得到——其 Duration 字段设置了它们的 NAV' },
          { en: 'It encrypts the channel', zh: '它对信道加密' },
        ],
        answer: 1,
        explain: { en: 'The receiver-side reservation is audible where the transmitter is not (§10.3.2.9).', zh: '接收方的预约在发送方听不到的地方也能被听到（§10.3.2.9）。' },
      },
    ],
  },

  {
    id: 'anomaly',
    module: 0,
    minutes: 10,
    title: { en: '6 · Rate anomaly — fairness gone wrong', zh: '6 · 速率异常——“公平”的反面' },
    body: [
      { text: {
        en: 'DCF is fair in transmission opportunities: on average every saturated station wins the channel equally often. But a win is measured in frames, not microseconds. A distant station that only decodes a low MCS holds the medium many times longer per frame — so “fair” wins translate into wildly unfair airtime, and the slow station drags down everyone’s throughput. This is the famous performance anomaly of 802.11.',
        zh: 'DCF 的公平是“传输机会公平”：平均而言每台饱和终端赢得信道的次数相同。但赢一次的单位是“帧”，不是“微秒”。远处的终端只能用低 MCS，每一帧都要占用长得多的空口时间——于是“公平的次数”换来的是极不公平的空口占用，慢终端拖垮了所有人的吞吐量。这就是 802.11 著名的性能异常。',
      } },
    ],
    scenario: () => sc(twoRooms(true), [
      node('ap', 'AP', 'ap', 4.5, 4, 'eht', 'idle'),
      node('sta-1', 'Near & fast', 'sta', 3.5, 4.5, 'nonht', 'saturated'),
      node('sta-2', 'Far & slow', 'sta', 9.5, 7.5, 'nonht', 'saturated'),
    ]),
    jumps: [
      J('first data frame', '第一个数据帧', firstData),
    ],
    observe: [
      { en: 'The far station’s green blocks are much longer than the near one’s — same bytes, lower MCS.', zh: '远端终端的绿色块比近端的长得多——字节数相同，MCS 更低。' },
      { en: 'Inspector: both have similar “frames delivered”, but wildly different airtime share.', zh: '检视器：两者“成功交付帧数”相近，但空口占比天差地别。' },
      { en: 'The near station’s throughput is far below what it would get alone.', zh: '近端终端的吞吐量远低于它独占信道时的水平。' },
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
  },

  // ======================= MODULE 2 =======================
  {
    id: 'edca',
    module: 1,
    minutes: 15,
    title: { en: '7 · EDCA — four queues, four personalities', zh: '7 · EDCA——四条队列，四种性格' },
    body: [
      { text: {
        en: 'DCF treats a voice packet and a bulk upload identically. EDCA (802.11e, in every device since Wi-Fi 5) splits traffic into four access categories, each running its own backoff engine with its own parameters (Table 9-194): VO waits AIFSN 2 and draws from CW 3–7; BK waits AIFSN 7 and draws from 15–1023. Shorter waits + smaller draws = statistically earlier transmission. Priority in Wi-Fi is not a scheduler’s decree — it is a rigged lottery.',
        zh: 'DCF 对语音包和大文件上传一视同仁。EDCA（802.11e，Wi-Fi 5 起人人都有）把流量分进四个接入类别，每个类别都有一台独立的退避引擎和自己的参数（Table 9-194）：VO 只等 AIFSN 2、从 CW 3–7 抽取；BK 要等 AIFSN 7、从 15–1023 抽取。等得更短 + 抽值更小 = 统计上总能更早发送。Wi-Fi 里的优先级不是调度器的命令，而是一场被做了手脚的抽签。',
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
  },

  {
    id: 'ampdu',
    module: 1,
    minutes: 12,
    title: { en: '8 · A-MPDU — pay contention once', zh: '8 · A-MPDU——竞争一次，发一批' },
    body: [
      { text: {
        en: 'Every channel win costs the same overhead — IFS, backoff, preamble, ACK — whether you send 100 bytes or 60 000. As PHY rates grew, that fixed cost began to dwarf the payload: a 1500-byte frame at high MCS spends more time on ceremony than on data. Aggregation fixes the ratio: pack up to 64 MPDUs into one PPDU, and answer them with a single 32-byte BlockAck whose bitmap acknowledges each subframe individually.',
        zh: '每赢一次信道，代价都一样——IFS、退避、前导、ACK——不管你发 100 字节还是 60000 字节。物理层速率越来越快之后，这笔固定开销开始盖过数据本身：高 MCS 下发一个 1500 字节的帧，“仪式”花的时间比数据还多。聚合改变了这个比例：把最多 64 个 MPDU 打包进一个 PPDU，再用一个 32 字节的 BlockAck 用位图逐个确认。',
      } },
    ],
    scenario: () => sc(oneRoom(), [
      node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
      node('sta-1', 'Uploader', 'sta', 6.5, 5, 'vht', 'saturated'),
    ]),
    variants: [
      {
        label: { en: 'Aggregation OFF (same device)', zh: '关闭聚合（同一设备）' },
        scenario: () => sc(oneRoom(), [
          node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
          node('sta-1', 'Uploader', 'sta', 6.5, 5, 'vht', 'saturated', { edca: true, txop: true }),
        ]),
      },
    ],
    jumps: [
      J('first A-MPDU', '第一个 A-MPDU', firstAmpdu),
      J('first BlockAck', '第一个 BlockAck', firstBa),
    ],
    observe: [
      { en: 'Aggregated blocks carry ×n badges; hover to see the MPDU count and total bytes.', zh: '聚合块带有 ×n 角标；悬停可见 MPDU 数量与总字节数。' },
      { en: 'One lilac BlockAck replaces what would have been n separate ACKs.', zh: '一个淡紫色 BlockAck 取代了原本 n 个独立的 ACK。' },
      { en: 'Compare BSS throughput between the two variants — same PHY rate, several × the goodput.', zh: '比较两个变体的 BSS 吞吐量——物理速率相同，有效吞吐却相差数倍。' },
    ],
    tryThis: [
      { en: 'Watch the queue in the inspector drain 20 frames per channel win instead of 1.', zh: '在检视器里观察队列每赢一次信道就清掉 20 帧，而不是 1 帧。' },
    ],
    quiz: [
      {
        q: { en: 'Where does most of A-MPDU’s throughput gain come from?', zh: 'A-MPDU 的吞吐量收益主要来自哪里？' },
        options: [
          { en: 'Higher modulation', zh: '更高的调制阶数' },
          { en: 'Amortizing the fixed per-win overhead (contention, preamble, ACK) over many frames', zh: '把每次获胜的固定开销（竞争、前导、确认）摊到许多帧上' },
          { en: 'Shorter MAC headers', zh: '更短的 MAC 头' },
        ],
        answer: 1,
        explain: { en: 'The PHY rate is unchanged — only the ceremony-to-data ratio improves.', zh: '物理速率没变——变的只是“仪式与数据”的比例。' },
      },
    ],
  },

  {
    id: 'txop',
    module: 1,
    minutes: 10,
    title: { en: '9 · TXOP — own the channel, briefly', zh: '9 · TXOP——短暂地拥有信道' },
    body: [
      { text: {
        en: 'An EDCA win grants not one exchange but a transmit opportunity: a bounded interval (4.096 ms for video, 2.528 ms for best-effort) in which the winner may chain multiple exchanges separated only by SIFS. No re-contention between them — and the standard requires every PPDU plus its acknowledgement to fit inside the limit. TXOP turns the lottery into a lease.',
        zh: 'EDCA 赢一次拿到的不是一次交换，而是一个传输机会（TXOP）：一段有上限的时间（视频 4.096 ms、尽力而为 2.528 ms），获胜者可以在其中用仅隔 SIFS 的方式串联多次交换，中间无需再竞争——而且标准要求每个 PPDU 连同它的确认都必须装进上限之内。TXOP 把“抽签”变成了“短租”。',
      } },
    ],
    scenario: () => sc(oneRoom(), [
      node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
      node('sta-1', 'TV 1', 'sta', 3.5, 5.5, 'vht', 'video'),
      node('sta-2', 'TV 2', 'sta', 6.5, 5.5, 'vht', 'video'),
    ]),
    jumps: [
      J('first TXOP start', '第一次 TXOP 开始', firstTxop),
      J('first BlockAck', '第一个 BlockAck', firstBa),
    ],
    observe: [
      { en: 'Inside a TXOP the AP sends to TV 1, gets its BA, then after one SIFS sends to TV 2 — no backoff in between.', zh: '在一个 TXOP 内，AP 发给电视 1、收到 BA 后仅隔一个 SIFS 就发给电视 2——中间没有退避。' },
      { en: 'The inspector shows “TXOP: AC_VI, n µs left” while the burst runs.', zh: '突发进行中，检视器显示“TXOP：AC_VI，剩余 n µs”。' },
    ],
    tryThis: [
      { en: 'Turn TXOP off on the AP and compare: every exchange now pays AIFS + backoff again.', zh: '关闭 AP 的 TXOP 功能再比较：每次交换都得重新付出 AIFS + 退避。' },
    ],
    quiz: [
      {
        q: { en: 'What separates two exchanges inside one TXOP?', zh: '同一个 TXOP 内两次交换之间隔着什么？' },
        options: [
          { en: 'AIFS + a fresh backoff', zh: 'AIFS + 新的退避' },
          { en: 'Exactly one SIFS', zh: '恰好一个 SIFS' },
          { en: 'A PIFS', zh: '一个 PIFS' },
        ],
        answer: 1,
        explain: { en: 'That is the whole point: contention is paid once at the TXOP boundary.', zh: '这正是 TXOP 的意义：竞争的代价只在边界上付一次。' },
      },
    ],
  },

  // ======================= MODULE 3 =======================
  {
    id: 'ofdma-dl',
    module: 2,
    minutes: 15,
    title: { en: '10 · OFDMA downlink — one PPDU, many stations', zh: '10 · OFDMA 下行——一个 PPDU，多个终端' },
    body: [
      { text: {
        en: 'Until Wi-Fi 6, one transmission served one receiver — small frames for many stations meant many contentions. OFDMA lets the AP split the channel into resource units (RUs) and address several stations inside a single MU PPDU: each decodes only its own RU. The acknowledgements come back simultaneously too, on the same RU split. Contention happens once per group, and the MAC starts to look like a scheduler.',
        zh: '在 Wi-Fi 6 之前，一次传输只服务一个接收者——要给许多终端发小帧，就要竞争许多次。OFDMA 让 AP 把信道切成资源单元（RU），在一个 MU PPDU 里同时向多台终端发送：每台只解调自己的 RU。确认帧也在同样的 RU 划分上同时返回。整组只需竞争一次，MAC 开始有了“调度器”的样子。',
      } },
    ],
    scenario: () => sc(oneRoom(), [
      node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
      node('sta-1', 'TV 1', 'sta', 3, 5.5, 'he', 'video'),
      node('sta-2', 'TV 2', 'sta', 5, 6.5, 'he', 'video'),
      node('sta-3', 'TV 3', 'sta', 7, 5.5, 'he', 'video'),
    ]),
    jumps: [
      J('first DL MU PPDU', '第一个下行 MU PPDU', firstMuDl),
      J('simultaneous BlockAcks', '同时发出的 BlockAck', txOf((r) => r.frame.kind === 'ba' && r.frame.orthogonalGroup !== undefined)),
    ],
    observe: [
      { en: 'Hover the wide blue block: “DL MU PPDU → n stations”, with per-user parts inside.', zh: '悬停宽蓝块：“下行 MU PPDU → n 个终端”，内部含每用户的分片。' },
      { en: 'After one SIFS, several BA blocks start at the *same instant* on different lanes — RU-orthogonal, no collision.', zh: '一个 SIFS 之后，多个 BA 块在不同泳道的同一瞬间开始——RU 正交，互不碰撞。' },
      { en: 'Compare with lesson 9: the same three flows needed three separate contentions there.', zh: '对比第 9 课：同样的三路流量在那里需要三次独立竞争。' },
    ],
    tryThis: [
      { en: 'Turn OFDMA off on one TV: it drops out of MU groups and is served separately.', zh: '关闭其中一台电视的 OFDMA：它会退出 MU 分组，被单独服务。' },
    ],
    quiz: [
      {
        q: { en: 'Why don’t the simultaneous BlockAcks collide?', zh: '同时发出的多个 BlockAck 为什么不会碰撞？' },
        options: [
          { en: 'They are very short', zh: '因为它们很短' },
          { en: 'Each occupies a different RU (subcarrier set) — orthogonal, not overlapping', zh: '每个占用不同的 RU（子载波集合）——正交而不重叠' },
          { en: 'The AP cancels the interference', zh: 'AP 消除了干扰' },
        ],
        answer: 1,
        explain: { en: 'OFDMA divides frequency, not time: parallel transmissions share the channel without interfering.', zh: 'OFDMA 分的是频率而不是时间：并行传输共享信道而互不干扰。' },
      },
    ],
  },

  {
    id: 'ofdma-ul',
    module: 2,
    minutes: 15,
    title: { en: '11 · Trigger frames — the AP conducts the uplink', zh: '11 · 触发帧——AP 指挥上行' },
    body: [
      { text: {
        en: 'Uplink OFDMA is stranger: multiple stations must start transmitting at the same microsecond, at coordinated power, for the same duration. Only the AP can arrange that. It sends a Trigger frame naming the participants and their RUs; one SIFS later they all fire simultaneously (padded to equal length), and the AP answers everything with a single Multi-STA BlockAck. The stations surrender contention to a conductor — inside these bubbles, Wi-Fi is no longer CSMA at all.',
        zh: '上行 OFDMA 更奇妙：多台终端必须在同一微秒、以协调的功率、发送同样长的时间。只有 AP 能安排这一切。它先发一个触发帧（Trigger），点名参与者及其 RU；一个 SIFS 之后所有人同时开火（填充到等长），AP 再用一个多站点 BlockAck 一次性确认。终端把竞争权交给了指挥家——在这些“泡泡”里，Wi-Fi 已经不再是 CSMA。',
      } },
    ],
    scenario: () => sc(oneRoom(), [
      node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
      node('sta-1', 'Uploader A', 'sta', 3.5, 5.5, 'he', 'saturated'),
      node('sta-2', 'Uploader B', 'sta', 6.5, 5.5, 'he', 'saturated'),
    ]),
    jumps: [
      J('first Trigger', '第一个触发帧', firstTrigger),
      J('first Multi-STA BlockAck', '第一个多站点 BlockAck', firstMba),
    ],
    observe: [
      { en: 'The yellow Trigger comes from the AP; one SIFS later both uploaders’ green blocks start at the same instant.', zh: '黄色触发帧来自 AP；一个 SIFS 后两台上传终端的绿色块在同一瞬间开始。' },
      { en: 'Both TB PPDUs end together (padding) and one Multi-STA BA answers both.', zh: '两个 TB PPDU 同时结束（填充对齐），一个多站点 BA 同时确认两者。' },
      { en: 'Between triggered bursts the stations still contend normally via EDCA.', zh: '在两次触发之间，终端仍照常通过 EDCA 竞争。' },
    ],
    tryThis: [
      { en: 'Watch the Trigger’s Duration field in the decoder: it protects the entire triggered sequence.', zh: '在帧解码器中查看触发帧的 Duration 字段：它保护整个被触发的序列。' },
    ],
    quiz: [
      {
        q: { en: 'Why can’t stations do UL OFDMA without a Trigger?', zh: '没有触发帧，终端为什么无法自行完成上行 OFDMA？' },
        options: [
          { en: 'They lack the RF hardware', zh: '它们缺少射频硬件' },
          { en: 'Independent stations cannot align start time, duration and RU choice by themselves', zh: '相互独立的终端无法自行对齐开始时刻、持续时间与 RU 分配' },
          { en: 'Regulations forbid it', zh: '法规禁止' },
        ],
        answer: 1,
        explain: { en: 'Simultaneity requires central coordination — that is exactly what the Trigger provides.', zh: '“同时”需要中心协调——触发帧提供的正是这一点。' },
      },
    ],
  },

  {
    id: 'mlo',
    module: 2,
    minutes: 12,
    title: { en: '12 · MLO — one queue, two radios', zh: '12 · MLO——一条队列，两台电台' },
    body: [
      { text: {
        en: 'Wi-Fi 7’s Multi-Link Operation runs complete, independent MACs on two bands at once (here 5 and 6 GHz). The trick is above them: a single MLD-level queue feeds both links. Each link contends on its own channel with its own backoff; whichever wins airtime first claims the next frames from the shared queue. If a set fails on one link, the other may retry it. Congestion on one band simply shifts traffic to the other — latency stops depending on any single channel’s luck.',
        zh: 'Wi-Fi 7 的多链路操作（MLO）在两个频段上同时运行两套完整独立的 MAC（这里是 5 GHz 和 6 GHz）。妙处在它们之上：一条 MLD 级共享队列同时喂给两条链路。每条链路在自己的信道上独立退避、独立竞争；谁先赢得空口，谁就从共享队列领走下一批帧。一条链路上失败的帧，另一条可以代为重传。某个频段拥塞，流量会自然流向另一个——时延不再取决于任何单一信道的运气。',
      } },
    ],
    scenario: () => sc(oneRoom(), [
      node('ap', 'AP (MLO)', 'ap', 5, 4, 'eht', 'idle'),
      node('sta-1', 'Laptop (MLO)', 'sta', 6.5, 5, 'eht', 'saturated'),
      node('sta-2', 'Neighbor (5G only)', 'sta', 3.5, 5, 'he', 'saturated', { edca: true, ampdu: true, txop: true }),
    ]),
    jumps: [
      J('first 5 GHz data', '第一个 5 GHz 数据帧', txOf((r) => !r.node.includes('#6g') && r.frame.kind === 'data' && r.frame.src === 'sta-1')),
      J('first 6 GHz data', '第一个 6 GHz 数据帧', first6g),
    ],
    observe: [
      { en: 'The laptop has two lanes (·6G marked); both carry data blocks drawn from one queue.', zh: '笔记本有两条泳道（标 ·6G）；两条都在发送来自同一条队列的数据块。' },
      { en: 'The 5 GHz-only neighbor congests that band — watch the laptop’s traffic lean toward 6 GHz.', zh: '只在 5 GHz 的邻居把该频段挤满——看笔记本的流量偏向 6 GHz。' },
      { en: '6 GHz transmissions render as wireframe spheres in the 3D view.', zh: '在 3D 视图中，6 GHz 的传输显示为线框球。' },
    ],
    tryThis: [
      { en: 'Turn MLO off on the laptop: it falls back to one lane and shares 5 GHz with the neighbor.', zh: '关闭笔记本的 MLO：它退回单泳道，与邻居挤在 5 GHz。' },
    ],
    quiz: [
      {
        q: { en: 'In STR MLO, what do the two links share?', zh: '在 STR 模式的 MLO 中，两条链路共享的是什么？' },
        options: [
          { en: 'One backoff counter', zh: '同一个退避计数器' },
          { en: 'The transmit queue — contention and retries stay per-link', zh: '发送队列——竞争与重传仍各自独立' },
          { en: 'The same radio channel', zh: '同一个射频信道' },
        ],
        answer: 1,
        explain: { en: 'Each link is a full MAC with its own CSMA state; only the buffered frames are pooled at the MLD level.', zh: '每条链路都是带完整 CSMA 状态的 MAC；只有缓存的帧汇聚在 MLD 层。' },
      },
    ],
  },

  {
    id: 'capstone',
    module: 2,
    minutes: 20,
    title: { en: '13 · Capstone — the busy household', zh: '13 · 结业课——热闹的一家人' },
    body: [
      { text: {
        en: 'Everything at once: a Wi-Fi 7 MLO laptop backing up, a Wi-Fi 6 TV and projector both streaming, a phone on a voice call, a Wi-Fi 5 tablet browsing, and a legacy IoT sensor — across three rooms with real walls. Your task is analysis, not reading: use the tools you now know. Who wins airtime and why? Where do EDCA priorities visibly act? When does the AP choose MU transmission over TXOP bursts? Which device is the whole network’s bottleneck?',
        zh: '一次上齐所有元素：一台 Wi-Fi 7 MLO 笔记本在备份、一台 Wi-Fi 6 电视和一台投影仪都在推流、一部手机在通话、一台 Wi-Fi 5 平板在上网、还有一个传统 IoT 传感器——分布在三个房间、隔着真实的墙。这一课的任务是分析而不是阅读：用你已掌握的工具回答——谁赢得了空口，为什么？EDCA 的优先级在哪里清晰可见？AP 什么时候选择 MU 传输而不是 TXOP 突发？哪台设备是整个网络的瓶颈？',
      } },
    ],
    scenario: () => sc({
      rooms: [
        { x: 0, y: 0, w: 5, h: 8, name: 'Living room' },
        { x: 5, y: 0, w: 5, h: 4, name: 'Study' },
        { x: 5, y: 4, w: 5, h: 4, name: 'Bedroom' },
      ],
      walls: [
        brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0),
        drywallDoor(5, 0, 5, 8, 1.5),
        drywallDoor(5, 4, 10, 4, 2.5),
      ],
    }, [
      node('ap', 'AP (Wi-Fi 7)', 'ap', 2.5, 4, 'eht', 'idle'),
      node('sta-1', 'Laptop MLO', 'sta', 7.5, 2, 'eht', 'saturated'),
      node('sta-2', 'TV (Wi-Fi 6)', 'sta', 1.5, 6.5, 'he', 'video'),
      node('sta-3', 'Phone (voice)', 'sta', 3.5, 2, 'he', 'voice'),
      node('sta-4', 'Tablet (Wi-Fi 5)', 'sta', 7.5, 6.5, 'vht', 'browsing'),
      node('sta-5', 'Sensor (legacy)', 'sta', 9.3, 7.3, 'nonht', 'iot'),
      node('sta-6', 'Projector (Wi-Fi 6)', 'sta', 6, 1, 'he', 'video'),
    ]),
    jumps: [
      J('first MU PPDU', '第一个 MU PPDU', firstMuDl),
      J('first Trigger', '第一个触发帧', firstTrigger),
      J('first collision', '第一次碰撞', firstCollision),
      J('first 6 GHz data', '第一个 6 GHz 数据帧', first6g),
    ],
    observe: [
      { en: 'Rank all devices by airtime share (inspector) — does the ranking match throughput?', zh: '按空口占比给所有设备排序（检视器）——排名和吞吐量一致吗？' },
      { en: 'Find one moment where the phone’s VO access beats a longer-waiting BE queue.', zh: '找到一个手机 VO 接入抢在等得更久的 BE 队列前面的时刻。' },
      { en: 'The legacy sensor rarely transmits, yet look at the airtime of each of its frames.', zh: '传统传感器很少发送，但看看它每一帧的空口时间。' },
    ],
    tryThis: [
      { en: 'Move the sensor behind two brick walls and measure the damage to everyone else.', zh: '把传感器移到两堵砖墙之后，测量它对其他所有设备的拖累。' },
      { en: 'Upgrade the tablet to Wi-Fi 6 with OFDMA — does the AP start grouping it with the TV?', zh: '把平板升级为支持 OFDMA 的 Wi-Fi 6——AP 会开始把它和电视编成 MU 组吗？' },
      { en: 'Design your own house in the editor and predict, before simulating, where collisions will occur.', zh: '在编辑器里设计你自己的房子，并在仿真之前预测碰撞会发生在哪里。' },
    ],
    quiz: [
      {
        q: { en: 'The single highest-leverage upgrade for this network would be…', zh: '对这个网络而言，收益最大的单项升级是……' },
        options: [
          { en: 'Raising the AP transmit power', zh: '提高 AP 的发射功率' },
          { en: 'Replacing/isolating the slowest legacy device — it consumes airtime far out of proportion to its traffic', zh: '替换或隔离最慢的传统设备——它消耗的空口时间远超其流量应得的份额' },
          { en: 'Adding a second saturated uploader', zh: '再加一台饱和上传的终端' },
        ],
        answer: 1,
        explain: { en: 'Lesson 6 in the wild: airtime, not bytes, is the shared resource.', zh: '这正是第 6 课的现实版：共享的资源是空口时间，不是字节。' },
      },
    ],
  },
]

export function lessonIndex(id: string): number {
  return LESSONS.findIndex((l) => l.id === id)
}
