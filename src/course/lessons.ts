/**
 * Wi-Fi MAC course: bilingual lessons, each with a deterministic preset
 * scenario, jump-to targets over the recorded timeline, an observation
 * checklist, experiments and a self-check quiz.
 *
 * Content is MAC-focused: channel access (DCF), NAV, EDCA, aggregation,
 * TXOP, OFDMA scheduling and MLO. PHY appears only as far as the MAC
 * needs it (frames cost airtime; rate depends on link quality).
 */
import { defaultFeatures, type ChannelWidth, type Nss } from '../model/caps'
import type { NodeCfg, ProfileId, Room, Scenario, Wall } from '../model/scenario'
import type { TLRecord } from '../model/records'
import type { Generation } from '../model/types'

export interface L10n {
  en: string
  zh: string
}

/** A language-neutral cell (numbers, symbols, protocol names). */
const N = (s: string): L10n => ({ en: s, zh: s })

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

/** A block of lesson prose. Every string is bilingual. */
export type Block =
  /** A short paragraph (default kind). */
  | { kind?: 'p'; heading?: L10n; text: L10n }
  /** One monospace formula line, optionally followed by a short note. */
  | { kind: 'formula'; heading?: L10n; text: L10n; note?: L10n }
  /** A small comparison table; every row has head.length cells. */
  | { kind: 'table'; heading?: L10n; head: L10n[]; rows: L10n[][] }
  /** Parallel points. */
  | { kind: 'list'; heading?: L10n; items: L10n[] }
  /** Ordered steps. */
  | { kind: 'steps'; heading?: L10n; items: L10n[] }

export interface Lesson {
  id: string
  module: number
  minutes: number
  title: L10n
  body: Block[]
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
  { en: 'How fast is fast', zh: '快是怎么来的' },
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

/**
 * Room A | brick hallway (AP) | Room B. The stations' ray crosses TWO brick
 * walls (~24 dB) at ~8.4 m, landing below the −82 dBm preamble threshold —
 * genuinely hidden — while each station reaches the AP through one wall.
 */
function hallwayHouse(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [
      { x: 0, y: 0, w: 4, h: 8, name: 'Room A' },
      { x: 4, y: 0, w: 2, h: 8, name: 'Hallway' },
      { x: 6, y: 0, w: 4, h: 8, name: 'Room B' },
    ],
    walls: [
      brick(0, 0, 10, 0), brick(10, 0, 10, 8), brick(10, 8, 0, 8), brick(0, 8, 0, 0),
      brick(4, 0, 4, 8), brick(6, 0, 6, 8),
    ],
  }
}

/**
 * Long 16×8 apartment: a study (0–6) and a far living room (6–16) split by
 * brick. Wide enough that the far station is genuinely far — ~11.5 m plus one
 * wall lands it at ~−75 dBm (12 Mb/s), 40 dB under the near station, so the
 * near frame's capture clears its 30 dB decode threshold by ~10 dB instead of
 * sitting on the edge of it.
 */
function longApartment(): { rooms: Room[]; walls: Wall[] } {
  return {
    rooms: [
      { x: 0, y: 0, w: 6, h: 8, name: 'Study' },
      { x: 6, y: 0, w: 10, h: 8, name: 'Living room' },
    ],
    walls: [
      brick(0, 0, 16, 0), brick(16, 0, 16, 8), brick(16, 8, 0, 8), brick(0, 8, 0, 0),
      brick(6, 0, 6, 8),
    ],
  }
}

/**
 * A router and one laptop on the same desk in the study of a long flat, both
 * at a chosen channel width and stream count. Module 4 is about what one frame
 * costs, so aggregation is off: every data frame is a single 1500-byte MSDU,
 * 1530 octets on the air. MLO is off too, so the pair keeps one 5 GHz lane.
 * The far living room is there for the experiments: it is the only part of the
 * flat where a wide channel runs out of signal.
 */
function widthScenario(widthMhz: ChannelWidth, nss: Nss, apNss: Nss = nss): Scenario {
  const feats = { edca: true, qam4k: true }
  const ap = node('ap', 'Router', 'ap', 3, 4, 'eht', 'idle', feats)
  const sta = node('sta-1', 'Laptop', 'sta', 4, 4, 'eht', 'saturated', feats)
  ap.caps.widthMhz = widthMhz
  ap.caps.nss = apNss
  sta.caps.widthMhz = widthMhz
  sta.caps.nss = nss
  return sc(longApartment(), [ap, sta])
}

/**
 * A four-stream router and three two-stream phones, each pulling its own
 * video stream, in one room. A fourth device — a laptop backing up files flat
 * out — keeps the channel busy: without it the router drains each phone's
 * video packet long before the next one lands, and a queue that never holds
 * more than one destination at a time never gives the AP a second station to
 * group. `mumimoOn` toggles only the phones' and router's MU-MIMO capability;
 * OFDMA stays negotiated throughout, because it is OFDMA capability, not
 * MU-MIMO capability, that lets the AP consider more than one destination at
 * once at all — MU-MIMO only chooses itself over OFDMA once that door is open.
 */
function mumimoScenario(mumimoOn: boolean): Scenario {
  const feats = { edca: true, ampdu: true, txop: true, ofdma: true, qam4k: true, mumimo: mumimoOn }
  const ap = node('ap', 'Router', 'ap', 5, 4, 'eht', 'idle', feats)
  const sta1 = node('sta-1', 'Phone 1', 'sta', 4, 3, 'eht', 'video', feats)
  const sta2 = node('sta-2', 'Phone 2', 'sta', 6, 3, 'eht', 'video', feats)
  const sta3 = node('sta-3', 'Phone 3', 'sta', 5, 5.5, 'eht', 'video', feats)
  const backup = node('sta-4', 'Laptop (backup)', 'sta', 2, 6.5, 'eht', 'saturated', feats)
  ap.caps.widthMhz = 160
  ap.caps.nss = 4
  for (const s of [sta1, sta2, sta3]) {
    s.caps.widthMhz = 160
    s.caps.nss = 2
  }
  backup.caps.widthMhz = 160
  backup.caps.nss = 1
  return sc(oneRoom(), [ap, sta1, sta2, sta3, backup])
}

/**
 * Two saturated uploaders on one AP: one on the desk beside it, one in the
 * far corner of the flat behind a brick wall. Aggregation and TXOP are off,
 * so every exchange is exactly one MSDU — clean, one-for-one accounting of
 * failures against the far station's working MCS.
 */
function rateScenario(): Scenario {
  const feats = { edca: true }
  const ap = node('ap', 'AP', 'ap', 4, 4, 'eht', 'idle', feats)
  const near = node('sta-1', 'Near uploader', 'sta', 4.8, 4.3, 'eht', 'saturated', feats)
  const far = node('sta-2', 'Far uploader', 'sta', 15, 7, 'eht', 'saturated', feats)
  return sc(longApartment(), [ap, near, far])
}

function node(
  id: string, name: string, kind: 'ap' | 'sta', x: number, y: number,
  gen: Generation, profile: ProfileId | ProfileId[],
  features?: Record<string, boolean>, z?: number,
): NodeCfg {
  return {
    id, kind, name, pos: { x, y, z: z ?? (kind === 'ap' ? 2.0 : 1.0) },
    txPowerDbm: kind === 'ap' ? 20 : 15, profiles: Array.isArray(profile) ? profile : [profile],
    caps: { generation: gen, features: features ?? defaultFeatures(gen) },
  }
}

function sc(house: { rooms: Room[]; walls: Wall[] }, nodes: NodeCfg[], extra: Partial<Scenario> = {}): Scenario {
  return {
    ...house, nodes,
    // Lessons are about the Wi-Fi MAC: no cloud servers, so no WAN delay and
    // every quoted timestamp stays where it is.
    servers: [],
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
const firstCfEnd = txOf((r) => r.frame.kind === 'cfend')
const firstCfEndRelay = txOf((r) => r.frame.kind === 'cfend' && r.node === 'ap')
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
        en: 'The MAC manages one shared, half-duplex medium. Its currency is airtime: while any frame is in the air, nobody else in range can use the channel.',
        zh: 'MAC 管理的是一条共享的半双工介质，它的“货币”就是空口时间：只要有帧在空中，范围内的其他设备都用不了信道。',
      } },
      { kind: 'formula', text: {
        en: 'airtime = fixed preamble + payload symbols (bytes ÷ data rate)',
        zh: '空口时间 = 固定前导 + 数据符号（字节数 ÷ 速率）',
      }, note: {
        en: 'A bigger frame costs more; a higher MCS costs less.',
        zh: '帧越大耗时越长，MCS 越高耗时越短。',
      } },
      { text: {
        en: 'Everything the MAC does — waiting, backing off, aggregating, scheduling — exists to spend this airtime well.',
        zh: 'MAC 做的一切——等待、退避、聚合、调度——都是为了把空口时间花得值。',
      } },
      { kind: 'list', heading: { en: 'In the simulation', zh: '在仿真里看' }, items: [
        { en: 'One AP streams video to one station.', zh: '一个 AP 向一台终端推送视频流。' },
        { en: 'Hover a blue block in the timeline: you can read its size, MCS and exact duration.', zh: '将鼠标悬停在时间轴的蓝色块上，可以看到帧大小、MCS 与精确时长。' },
        { en: 'The white ACK is tiny but never optional — the sender cannot hear collisions, so only the ACK proves delivery.', zh: '白色的 ACK 很小却必不可少——发送方听不到碰撞，只有 ACK 能证明帧已送达。' },
      ] },
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
      { en: 'Between exchanges the channel is idle — video at this rate barely uses the medium.', zh: '两次帧交换（数据帧 + 紧随其后的 ACK）之间信道是空闲的——这个码率的视频几乎用不满介质。' },
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
  },

  {
    id: 'backoff',
    module: 0,
    minutes: 15,
    title: { en: '3 · Random backoff & collisions', zh: '3 · 随机退避与碰撞' },
    body: [
      { text: {
        en: 'When two stations both want the channel, silence alone cannot break the tie — both would finish DIFS at the same instant. So each one plays a lottery:',
        zh: '当两台终端都想要信道时，仅靠静默无法决出胜负——它们会在同一瞬间等完 DIFS。于是每台终端都要抽一次签：',
      } },
      { kind: 'steps', items: [
        { en: 'Draw a random integer from [0, CW].', zh: '从 [0, CW] 里抽一个随机整数。' },
        { en: 'Decrement it once per idle 9 µs slot; the lower draw transmits first.', zh: '介质每空闲一个 9 µs 时隙就减一，抽得小的先发。' },
        { en: 'Equal draws hit zero in the same slot and transmit on top of each other: a collision.', zh: '若抽到相同值，双方在同一时隙同时清零、同时发送：碰撞。' },
        { en: 'Neither notices until the 45 µs ACK timeout expires; then each doubles its CW (15→31→…→1023) and redraws — collisions get rapidly less likely.', zh: '双方都要等到 45 µs 的 ACK 超时才察觉，然后各自把 CW 翻倍（15→31→…→1023）并重抽——碰撞概率随之骤降。' },
      ] },
      { heading: { en: 'Why exactly 45 µs?', zh: '为什么恰好是 45 µs？' }, text: {
        en: 'A transmitter cannot hear a collision — while sending, its own signal drowns out everything else, so the only evidence of failure is silence: the ACK never arrives. But silence needs a deadline, and 45 µs is the sum of three physically motivated pieces:',
        zh: '发送方听不到碰撞——发送时自己的信号会盖过一切，所以失败的唯一证据是沉默：ACK 迟迟不来。但“沉默”需要一个期限，而 45 µs 是三段有物理含义的时间之和：',
      } },
      { kind: 'table', head: [
        { en: 'Piece', zh: '组成' }, N('µs'), { en: 'Meaning', zh: '含义' },
      ], rows: [
        [N('SIFS'), N('16'), { en: 'The gap the receiver legitimately takes before starting its ACK.', zh: '接收方在开始回 ACK 前理应等待的间隔。' }],
        [{ en: '1 slot', zh: '1 个时隙' }, N('9'), { en: 'Margin.', zh: '余量。' }],
        [N('RxPHYStartDelay'), N('20'), { en: 'The time a radio needs to detect that an incoming preamble has started.', zh: '电台检测到一个前导码已经开始所需的时间。' }],
      ] },
      { kind: 'formula', text: {
        en: 'ACK timeout = 16 + 9 + 20 = 45 µs',
        zh: 'ACK 超时 = 16 + 9 + 20 = 45 µs',
      } },
      { text: {
        en: 'If an ACK were really on its way, its preamble would have been detected within those 45 µs. Silence past that point is proof of death — the station doubles its CW and redraws.',
        zh: '如果 ACK 真的在路上，它的前导码一定会在这 45 µs 之内被检测到。过了这个期限仍是沉默，就等于宣告帧已阵亡——终端随即把 CW 翻倍并重新抽取。',
      } },
      { text: {
        en: 'Notice: no extra DIFS appears before the new countdown. The rule is “medium idle for a DIFS”, measured from the moment the medium went quiet — the end of the collided transmission. The 45 µs of silence already contains the required 34 µs, so the countdown may begin the instant the timeout expires.',
        zh: '注意：新一轮倒数之前并没有额外的 DIFS。规则要求的是“介质空闲满一个 DIFS”，而这段空闲从介质安静下来的那一刻——碰撞传输结束时——就开始计了。45 µs 的沉默本身已经包含了所需的 34 µs，所以超时一到，倒数立即开始。',
      } },
      { heading: { en: 'And the AP? It waits even longer — EIFS', zh: '那 AP 呢？它等得更久——EIFS' }, text: {
        en: 'The AP experienced this collision differently. It was not transmitting — it actually received the garbled overlap, and a station that hears a corrupted frame must stay quiet for EIFS instead of DIFS before its next access.',
        zh: 'AP 经历这场碰撞的方式不一样。它当时并没有发送，而是实实在在收到了那段互相重叠的乱码——凡是收到损坏帧的站点，下一次接入前必须保持安静一个 EIFS，而不是一个 DIFS。',
      } },
      { kind: 'formula', text: {
        en: 'EIFS = SIFS + ACK at the lowest rate + DIFS = 16 + 44 + 34 = 94 µs',
        zh: 'EIFS = SIFS + 以最低速率发完一个 ACK + DIFS = 16 + 44 + 34 = 94 µs',
      } },
      { text: {
        en: 'The logic: that broken frame may have been meant for someone else who is about to answer it with an ACK. Having failed to decode the frame, the listener also missed its Duration field, so it holds back long enough not to trample a reply it cannot anticipate.',
        zh: '道理在于：那帧损坏的数据也许本来是发给别人的，对方马上就要回 ACK。侦听者既然没解出这帧，也就错过了它的 Duration 字段，所以多等这一段，才不会踩到那个自己“预料不到”的 ACK。',
      } },
      { text: {
        en: 'You will not see an EIFS block on the AP’s lane here: a defer block is drawn only when a station is waiting in order to send, and this AP has nothing to transmit. A real, visible EIFS appears in lesson 6 — hovering the far station’s defer block even shows the EIFS being cut short into a DIFS the moment a healthy frame arrives (§10.3.2.3.7).',
        zh: '不过在本场景里，你不会在 AP 的泳道上看到 EIFS 色块：只有当站点是“为了发送”而等待时才会画出等待色块，而这台 AP 无东西可发。想看真实可见的 EIFS，请到第 6 课——悬停远处终端的等待色块，还能看到 EIFS 在一帧健康的帧到来时被截短成 DIFS（§10.3.2.3.7）。',
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
        en: 'Around t ≈ 464–790 µs you can watch all of this inside a single block. Talker A is mid-countdown (backoff at 3) when Talker B’s frame starts: A freezes, and its lane shows one long “waiting (DIFS)” block. That block is not a DIFS — it is everything A must sit through before its countdown may resume:',
        zh: '在 t ≈ 464–790 µs 附近，这一切可以在同一个色块里看完。Talker B 的帧开始时，Talker A 正数到退避 3：A 冻结，泳道上出现一段长长的“等待（DIFS）”色块。这段并不是一个 DIFS——它是 A 在倒数恢复之前必须熬过的全部时间：',
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
        { en: '464 µs: A knows only “busy *now*”. It freezes at 3 — end of knowledge.', zh: '464 µs：A 只知道“此刻忙”，冻结在 3——认知到此为止。' },
        { en: '≈ 484 µs: the PHY header reveals the frame’s length. Now A knows this frame ends at 712, plus something unknown after it.', zh: '约 484 µs：PHY 头揭示了帧长。A 这才知道这帧将在 712 结束，之后还有一段未知。' },
        { en: '712 µs: the frame completes and its checksum passes, so the Duration field can be trusted: NAV until 756, then a 34 µs DIFS, resume at 790.', zh: '712 µs：帧完整收下、校验通过，Duration 字段才可信：NAV 到 756，再一个 34 µs 的 DIFS，790 恢复。' },
      ] },
      { text: {
        en: 'So the total of 326 µs first becomes computable at 712, by which point 248 µs — about three quarters of the wait — has already passed. A spends most of the wait not knowing how long the wait is. And even then the figure is conditional: another preamble during the DIFS would simply extend it.',
        zh: '所以最早能算出总共要等 326 µs 的时刻是 712——那时等待本身已经过去了 248 µs，约四分之三。A 在这段等待的大部分时间里，并不知道自己要等多久。而且这个数字仍是有条件的：若 DIFS 期间又冒出一个前导码，等待只会继续变长。',
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
  },

  {
    id: 'hidden',
    module: 0,
    minutes: 15,
    title: { en: '5 · Hidden nodes & RTS/CTS', zh: '5 · 隐藏节点与 RTS/CTS' },
    body: [
      { text: {
        en: 'Carrier sense assumes everyone can hear everyone. Put enough brick between two stations and that breaks: here A and B sit in opposite rooms, their signals crossing two walls of a hallway and arriving below the −82 dBm detection threshold — pure noise to each other.',
        zh: '载波侦听默认所有人都能互相听见。在两台终端之间隔上足够多的砖墙，这个假设就碎了：本场景中 A 和 B 分处两端的房间，信号要穿过走廊的两堵墙，到达对方时已低于 −82 dBm 的检测门限——彼此听来只是噪声。',
      } },
      { text: {
        en: 'Each senses an idle channel while the other is mid-frame, and their transmissions meet — and die — at the AP in the hallway, which hears both. This is the hidden-node problem, and no amount of backoff fixes it, because the contenders never see each other contend.',
        zh: '于是一方正在发帧，另一方却侦听到“空闲”，两股信号在走廊里的 AP 处相遇、同归于尽——AP 两边都听得到。这就是隐藏节点问题——多少退避都治不了它，因为竞争双方根本看不见彼此在竞争。',
      } },
      { heading: { en: 'B freezes for the receipt, not the payload', zh: 'B 为回执停步，却听不见正文' }, text: {
        en: 'Around t ≈ 2.7 ms you can watch the asymmetry directly. Of A’s entire exchange, the only fragment B ever perceives is the 28 µs receipt at the end:',
        zh: '在 t ≈ 2.7 ms 附近可以直接看到这种不对称。A 的整场交换里，B 能感知到的唯一片段，就是结尾这张 28 µs 的回执：',
      } },
      { kind: 'table', head: [
        { en: 'Frame', zh: '帧' }, { en: 'Time', zh: '时间' }, { en: 'Walls from B', zh: '与 B 之间的墙' }, { en: 'What B does', zh: 'B 的反应' },
      ], rows: [
        [{ en: 'A’s 1528 B data', zh: 'A 的 1528 B 数据帧' }, N('≈ 2.19–2.72 ms'), { en: 'Two', zh: '两堵' }, { en: 'Counts straight through it — 106, 105, … 47 — as if the channel were empty.', zh: '倒数径直穿过它——106、105、……47——仿佛信道空无一物。' }],
        [{ en: 'AP’s ACK', zh: 'AP 的 ACK' }, N('2735–2763 µs'), { en: 'One', zh: '一堵' }, { en: 'Freezes at 46, sits out the 28 µs ACK plus a 34 µs DIFS, resumes at 46.', zh: '冻结在 46，等完 28 µs 的 ACK 加 34 µs 的 DIFS，再从 46 继续。' }],
      ] },
      { text: {
        en: 'And that freeze protects nothing: a final ACK carries Duration = 0, so it sets no NAV — moments later A starts its next frame and B, deaf again, counts right through it. This is exactly the gap the CTS closes: it too comes from the AP, audible to B, but it carries a nonzero Duration covering the whole upcoming data frame — turning B’s 28 µs twitch into a reservation that lasts the entire exchange.',
        zh: '而且这次冻结保护不了任何东西：收尾 ACK 的 Duration = 0，不设任何 NAV——片刻之后 A 的下一帧开始，重新“失聪”的 B 又径直数了过去。这正是 CTS 补上的缺口：CTS 同样来自 AP、B 也听得见，但它带着覆盖整个后续数据帧的非零 Duration——把 B 那 28 µs 的一哆嗦，变成一场贯穿整次交换的预约。',
      } },
      { kind: 'steps', heading: { en: 'The cure: let the AP announce the reservation', zh: '解法：让 AP 来宣布预约' }, items: [
        { en: 'The station sends a short RTS.', zh: '终端先发一个很短的 RTS。' },
        { en: 'The AP answers CTS — audible to both rooms — and the CTS sets everyone’s NAV.', zh: 'AP 回一个 CTS——两个房间都听得到——于是所有人的 NAV 都被设置。' },
        { en: 'Now it is almost always the tiny RTS that collides instead of a long data frame. In this scene data collisions drop by about 95%; a few stragglers remain where a data frame meets an RTS.', zh: '此后碰撞的几乎总是小小的 RTS，而不再是长长的数据帧。本场景中数据帧碰撞减少约 95%，剩下的零星几次是数据帧撞上 RTS。' },
      ] },
      { text: {
        en: 'Compare the two variants below.',
        zh: '对比下面两个场景变体。',
      } },
    ],
    scenario: () => sc(hallwayHouse(), [
      node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
      node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'nonht', 'saturated'),
      node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'nonht', 'saturated'),
    ]),
    variants: [
      {
        label: { en: 'RTS/CTS ON (threshold 500 B)', zh: '开启 RTS/CTS（门限 500 B）' },
        scenario: () => sc(hallwayHouse(), [
          node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
          node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'nonht', 'saturated'),
          node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'nonht', 'saturated'),
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
      { en: 'Each station does freeze for the AP’s ACKs — the only audible fragment of the other’s exchange.', zh: '但每台终端都会为 AP 的 ACK 冻结——那是对方整场交换中它唯一听得见的片段。' },
      { en: 'RTS variant: after a CTS, the other room’s station shows NAV and waits — data-frame collisions all but vanish.', zh: 'RTS 变体：CTS 之后另一个房间的终端出现 NAV 并等待——数据帧碰撞几乎绝迹。' },
    ],
    tryThis: [
      { en: 'Count COLLISION ticks per 100 ms in both variants (inspector → BSS totals).', zh: '分别统计两个变体每 100 ms 的碰撞数（检视器 → BSS 总览）。' },
      { en: 'In the editor, punch a door near the top of a hallway wall, on the stations’ line of sight (y ≈ 7.2) — the ray between them now crosses only one wall, and they start hearing each other again. A door elsewhere changes nothing: RF “holes” only matter if the straight path passes through them.', zh: '在编辑器里给走廊的一堵墙靠上端、也就是两台终端连线经过处（y ≈ 7.2）开一扇门——它们之间的射线只剩一堵墙，于是又能听到彼此。门开在别处则毫无作用：射频“孔洞”只有在直线路径恰好穿过时才起作用。' },
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
        en: 'DCF is fair in transmission opportunities: on average every saturated station wins the channel equally often. But a win is measured in frames, not microseconds.',
        zh: 'DCF 的公平是“传输机会公平”：平均而言每台饱和终端赢得信道的次数相同。但赢一次的单位是“帧”，不是“微秒”。',
      } },
      { text: {
        en: 'A distant station that only decodes a low MCS holds the medium many times longer per frame — so “fair” wins translate into wildly unfair airtime, and the slow station drags down everyone’s throughput. This is the famous performance anomaly of 802.11.',
        zh: '远处的终端只能用低 MCS，每一帧都要占用长得多的空口时间——于是“公平的次数”换来的是极不公平的空口占用，慢终端拖垮了所有人的吞吐量。这就是 802.11 著名的性能异常。',
      } },
      { heading: { en: 'The near station also wins every collision (capture effect)', zh: '近端终端还赢下了每一次碰撞（捕获效应）' }, text: {
        en: 'Watch the very first microsecond. Both stations end DIFS together, both have counted down to zero, and both transmit at t = 0 — a textbook collision. Yet the AP decodes the near station’s frame perfectly and acknowledges it, while the far station gets nothing. That is the capture effect.',
        zh: '看第一个微秒。两台终端同时结束 DIFS，同时把退避数到零，于是都在 t = 0 开始发送——一次教科书式的碰撞。可是 AP 完好地解出了近端终端的帧并回了 ACK，远端终端却颗粒无收。这就是捕获效应。',
      } },
      { kind: 'table', head: [
        { en: 'Reception', zh: '接收' }, { en: 'Wanted signal', zh: '目标信号' }, { en: 'Interferer', zh: '干扰' }, { en: 'Margin', zh: '余量' }, { en: 'Needed', zh: '所需' },
      ], rows: [
        [{ en: 'Near data at the AP', zh: 'AP 收近端数据' }, N('−35 dBm'), { en: 'far station, −75 dBm', zh: '远端终端，−75 dBm' }, N('40 dB'), { en: '30 dB for 54 Mb/s', zh: '54 Mb/s 需 30 dB' }],
        [{ en: 'ACK at the near station', zh: '近端收 ACK' }, N('−30 dBm'), { en: 'far station still on air, −74 dBm', zh: '远端仍在发，−74 dBm' }, N('44 dB'), N('21 dB')],
      ] },
      { text: {
        en: 'The 40 dB gap is opened by 11 m of apartment and one brick wall. A receiver locks a preamble and treats everything arriving afterwards as noise — and while it is still acquiring, a signal markedly stronger than the one it holds makes it abandon that reception and re-sync to the newcomer. A simultaneous start is won by the stronger signal, never by the earlier one.',
        zh: '这 40 dB 是 11 m 的房长加一道砖墙拉开的。接收机锁定一个前导后，把此后到达的一切都当作噪声——但在它还处于前导捕获阶段时，一个明显强于当前信号的新前导会让它丢弃手头的接收、改而同步到新来者。所以同时起跑的胜负取决于信号强弱，而不是谁先开口。',
      } },
      { text: {
        en: 'The far station’s 1044 µs frame is destroyed in full. It learns nothing until its ACK timeout at 1089 µs, then retries with a doubled contention window. Nothing on the timeline is drawn as a collision, because from the AP’s point of view no reception failed — the only visible trace is that unexplained retry on the far lane.',
        zh: '远端终端那 1044 µs 的帧被整帧毁掉。它要等到 1089 µs 的 ACK 超时才知情，然后带着翻倍的竞争窗口重传。时间轴上不会画出任何碰撞标记，因为在 AP 看来没有任何一次接收失败——唯一可见的痕迹，是远端泳道上那次没有来由的重传。',
      } },
      { kind: 'table', head: [
        { en: 'Station', zh: '终端' }, { en: 'ACK timeouts in 200 ms', zh: '200 ms 内的 ACK 超时次数' },
      ], rows: [
        [{ en: 'Near', zh: '近端' }, N('0')],
        [{ en: 'Far', zh: '远端' }, N('12')],
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
      { en: 'Inspector: both have similar “frames delivered”, but wildly different airtime share.', zh: '检视器：两者“成功交付帧数”相近，但空口占比天差地别。' },
      { en: 'The near station’s throughput is far below what it would get alone.', zh: '近端终端的吞吐量远低于它独占信道时的水平。' },
      { en: 'At t = 0 both stations transmit at once, yet only the near one is acknowledged — capture. The far lane’s only clue is an ACK timeout at 1089 µs.', zh: 't = 0 两台终端同时开始发送，却只有近端收到 ACK——这就是捕获。远端泳道上唯一的线索，是 1089 µs 处的 ACK 超时。' },
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
        en: 'wait after a corrupted frame = EIFS − DIFS + AIFS[AC]\nBK: 94 − 34 + 79 = 139 µs',
        zh: '收到损坏帧后的等待 = EIFS − DIFS + AIFS[AC]\nBK：94 − 34 + 79 = 139 µs',
      }, note: {
        en: 'Penalty and class-wait, composed.',
        zh: '惩罚与类别等待，叠加而成。',
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
  },

  {
    id: 'ampdu',
    module: 1,
    minutes: 12,
    title: { en: '8 · A-MPDU — pay contention once', zh: '8 · A-MPDU——竞争一次，发一批' },
    body: [
      { text: {
        en: 'Every channel win costs the same overhead whether you send 100 bytes or 60 000:',
        zh: '每赢一次信道，代价都一样——不管你发 100 字节还是 60000 字节：',
      } },
      { kind: 'formula', text: {
        en: 'one win = IFS + backoff + preamble + payload + SIFS + ACK',
        zh: '赢一次 = IFS + 退避 + 前导 + 数据 + SIFS + ACK',
      }, note: {
        en: 'Only the payload term grows with what you send.',
        zh: '只有“数据”这一项随发送量增长。',
      } },
      { text: {
        en: 'As PHY rates grew, that fixed cost began to dwarf the payload: a 1500-byte frame at high MCS spends more time on ceremony than on data.',
        zh: '物理层速率越来越快之后，这笔固定开销开始盖过数据本身：高 MCS 下发一个 1500 字节的帧，“仪式”花的时间比数据还多。',
      } },
      { kind: 'list', heading: { en: 'Aggregation fixes the ratio', zh: '聚合改变了这个比例' }, items: [
        { en: 'Pack up to 64 MPDUs into one PPDU.', zh: '把最多 64 个 MPDU 打包进一个 PPDU。' },
        { en: 'Answer them with a single 32-byte BlockAck whose bitmap acknowledges each subframe individually.', zh: '再用一个 32 字节的 BlockAck，用位图逐个确认每个子帧。' },
      ] },
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
      { en: 'Compare BSS throughput between the two variants — same PHY rate, ~1.5× the goodput here. (The gap is “only” 1.5× because the no-aggregation variant still has TXOP, so it too pays contention once per burst — take the comparison as aggregation’s share alone.)', zh: '比较两个变体的 BSS 吞吐量——物理速率相同，有效吞吐约为 1.5 倍。（差距“只有”1.5 倍，是因为不聚合的变体仍开着 TXOP，同样只在每次突发时付一次竞争——这组对比反映的仅是聚合本身的贡献。）' },
    ],
    tryThis: [
      { en: 'Watch the queue in the inspector drain 15 frames per channel win instead of 1 (15 is what fits under the AC_BE TXOP limit here, not the 64-MPDU A-MPDU ceiling).', zh: '在检视器里观察队列每赢一次信道就清掉 15 帧，而不是 1 帧（15 是 AC_BE 的 TXOP 限值所容纳的数量，并非 A-MPDU 的 64 帧上限）。' },
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
      { en: 'The “first TXOP start” jump (≈ 0.88 ms) lands on a two-receiver burst: inside one TXOP the AP sends to TV 2, gets its ACK, then after one SIFS sends to TV 1 — no AIFS, no backoff in between. Later TXOPs often hold a single exchange: with only two 15 Mbps streams the AP rarely has frames for both TVs waiting at once.', zh: '“第一次 TXOP 开始”跳转（≈ 0.88 ms）落在一个发往两台接收机的突发上：在同一个 TXOP 内，AP 发给电视 2、收到 ACK 后仅隔一个 SIFS 就发给电视 1——中间没有 AIFS、没有退避。之后的 TXOP 常常只有一次交换：只有两路 15 Mbps 的视频流时，AP 很少同时攒下发给两台电视的帧。' },
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
  },

  {
    id: 'txop-protect',
    module: 1,
    minutes: 12,
    title: { en: '10 · Protecting the burst — one CTS for the whole TXOP', zh: '10 · 保护整个突发——一个 CTS 预约整个 TXOP' },
    body: [
      { text: {
        en: 'Lesson 9 showed a holder chaining exchanges one SIFS apart. Anyone who can hear the holder cannot break in: SIFS is shorter than every AIFS. But lesson 5’s hidden station hears only the receiver. Under single protection each frame’s Duration covers just its own ACK, so a hidden station freezes for the ACK, then counts straight into the next frame of the burst.',
        zh: '第 9 课里，持有者以一个 SIFS 的间隔串联多次交换。听得到持有者的站点插不进来：SIFS 比任何 AIFS 都短。但第 5 课那种隐藏站点只听得到接收方。在单次保护下，每个帧的 Duration 只覆盖自己的 ACK，于是隐藏站点为 ACK 停一下，随后就径直数进了突发的下一帧。',
      } },
      { kind: 'table', heading: { en: 'Three ways to announce a burst (§9.2.5.2)', zh: '预告突发的三种方式（§9.2.5.2）' }, head: [
        { en: 'Policy', zh: '策略' }, { en: 'Opens the burst with', zh: '突发以什么开头' }, { en: 'Data frames carry', zh: '数据帧携带' }, { en: 'Ends early with', zh: '提前结束时' },
      ], rows: [
        [{ en: 'single', zh: '单次' }, { en: 'the data frame (RTS only above the threshold)', zh: '数据帧本身（超过门限才有 RTS）' }, N('SIFS + ACK'), { en: 'nothing to give back', zh: '无需归还' }],
        [{ en: 'boundary', zh: '边界' }, { en: 'RTS/CTS whose Duration reaches the end of the TXOP', zh: 'Duration 直达 TXOP 末尾的 RTS/CTS' }, N('SIFS + ACK'), N('CF-End')],
        [{ en: 'multiple', zh: '多重' }, { en: 'the same RTS/CTS', zh: '同样的 RTS/CTS' }, { en: 'the TXOP remainder', zh: 'TXOP 剩余时间' }, N('CF-End')],
      ] },
      { heading: { en: 'What the CTS does that the RTS cannot', zh: 'CTS 能做到而 RTS 做不到的事' }, text: {
        en: 'The RTS is heard only by the holder’s neighbourhood; the hidden station cannot decode it. The CTS comes from the receiver — here the AP — and repeats the reservation minus itself. That is the frame the hidden station loads into its NAV, and with boundary protection that NAV lasts to the end of the TXOP, not just one exchange.',
        zh: 'RTS 只有持有者周围的站点能听到，隐藏站点解不出它。CTS 来自接收方——这里是 AP——把预约减去自身后再广播一遍。隐藏站点装进 NAV 的正是这一帧；在边界保护下，这个 NAV 一直持续到 TXOP 结束，而不只是一次交换。',
      } },
      { kind: 'formula', text: {
        en: 'CTS Duration = RTS Duration − SIFS − CTS time\nNAV at hidden B = CTS end + CTS Duration = end of A’s TXOP',
        zh: 'CTS 的 Duration = RTS 的 Duration − SIFS − CTS 时长\n隐藏站 B 的 NAV = CTS 结束 + CTS 的 Duration = A 的 TXOP 末尾',
      } },
      { heading: { en: 'Giving time back — CF-End', zh: '把时间还回去——CF-End' }, text: {
        en: 'A reservation to the end of the TXOP is usually more than the burst needs. When the burst ends before it — the queue ran dry, or the next exchange no longer fits — the holder sends a CF-End one SIFS after the last ACK, and every station that decodes it resets its NAV. A hidden station cannot decode the holder’s CF-End — so the standard has the AP repeat it one SIFS later (§10.23.2.9): the same trick as the CTS, in reverse.',
        zh: '预约到 TXOP 末尾通常比突发实际需要的更长。突发提前结束时——队列空了，或者下一次交换已经装不下——持有者就在最后一个 ACK 之后一个 SIFS 发出 CF-End，所有解出它的站点清零 NAV。隐藏站点解不出持有者的 CF-End——所以标准让 AP 在一个 SIFS 后重复一遍（§10.23.2.9）：和 CTS 一样的手法，方向相反。',
      } },
      { kind: 'table', heading: { en: 'This scenario, 300 ms', zh: '本场景，300 ms' }, head: [
        { en: 'Metric', zh: '指标' }, { en: 'single', zh: '单次' }, { en: 'boundary', zh: '边界' },
      ], rows: [
        [{ en: 'collisions', zh: '碰撞' }, N('99'), N('8')],
        [{ en: 'frames delivered', zh: '送达帧数' }, N('31'), N('610')],
        [{ en: 'retries', zh: '重传' }, N('184'), N('19')],
        [{ en: 'frames dropped', zh: '丢弃帧数' }, N('18'), N('0')],
      ] },
      { text: {
        en: 'Of the 8 collisions that remain, 6 are RTS meeting RTS — two hidden stations still starting in the same slot, but now each loses 20 bytes instead of a burst of 1500-byte frames — and 2 catch a data frame already under way. That is lesson 5’s bargain, extended from one frame to a whole TXOP.',
        zh: '剩下的 8 次碰撞里，6 次是 RTS 撞 RTS——两台隐藏站点仍可能在同一时隙起跑，但现在各自只损失 20 字节，而不是一整串 1500 字节的帧——另外 2 次撞上了正在进行中的数据帧。这正是第 5 课的那笔交易，从一帧扩展到了整个 TXOP。',
      } },
      { text: {
        en: 'The price is airtime: an RTS/CTS per burst, a CF-End (twice, with the relay), and anyone who misses the CF-End waits until the announced end. Real Wi-Fi 6/7 gear pays it this way: data frames keep single protection, and the RTS/CTS — or its multi-user form, MU-RTS — at the TXOP boundary carries the burst.',
        zh: '代价是空口时间：每个突发一次 RTS/CTS、一次 CF-End（加上 AP 的重复是两次），而错过 CF-End 的站点要等到预告的末尾。真实的 Wi-Fi 6/7 设备正是这样付账的：数据帧保持单次保护，由 TXOP 边界处的 RTS/CTS——或其多用户形式 MU-RTS——来承载整个突发的预约。',
      } },
    ],
    scenario: () => sc(hallwayHouse(), [
      node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
      { ...node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'boundary' },
      { ...node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'boundary' },
    ]),
    variants: [
      {
        label: { en: 'single protection (per exchange)', zh: '单次保护（逐次交换）' },
        scenario: () => sc(hallwayHouse(), [
          node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
          node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }),
          node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }),
        ]),
      },
      {
        label: { en: 'multiple protection (data frames carry the remainder)', zh: '多重保护（数据帧携带剩余时间）' },
        scenario: () => sc(hallwayHouse(), [
          node('ap', 'AP', 'ap', 5, 4, 'eht', 'idle'),
          { ...node('sta-1', 'Hidden A', 'sta', 0.8, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'multiple' },
          { ...node('sta-2', 'Hidden B', 'sta', 9.2, 7.2, 'vht', 'saturated', { edca: true, txop: true }), txopProtection: 'multiple' },
        ]),
      },
    ],
    jumps: [
      J('first RTS', '第一个 RTS', firstRts),
      J('first CF-End', '第一个 CF-End', firstCfEnd),
      J('first CF-End relayed by the AP', '第一个由 AP 重复的 CF-End', firstCfEndRelay),
      J('first collision', '第一次碰撞', firstCollision),
    ],
    observe: [
      { en: '“first RTS”: A and B both open with an RTS at t = 0 — and collide, 20 bytes each. A’s third try at 0.65 ms gets through: hover its RTS (Duration 2500 µs, reaching the end of its 2.528 ms TXOP) and the AP’s CTS at 0.694 ms (2456 µs — the same minus one SIFS and the CTS itself). Hidden B’s lane turns NAV-purple until 3.178 ms, although B never hears A.', zh: '“第一个 RTS”：A 和 B 都在 t = 0 以 RTS 开场——然后撞在一起，各损失 20 字节。A 在 0.65 ms 的第三次尝试成功了：悬停它的 RTS（Duration 2500 µs，直达它 2.528 ms TXOP 的末尾）和 AP 在 0.694 ms 的 CTS（2456 µs——相同数值减去一个 SIFS 和 CTS 自身）。隐藏站 B 的泳道一直到 3.178 ms 都是 NAV 紫色，尽管 B 从来听不到 A。' },
      { en: '“first CF-End” (≈ 2.82 ms): after five exchanges 376 µs of A’s reservation remain — too little for another 1500-byte frame and its ACK. A sends CF-End, the AP repeats it one SIFS later, and B’s NAV ends at 2.890 ms instead of 3.178 ms.', zh: '“第一个 CF-End”（≈ 2.82 ms）：五次交换之后，A 的预约还剩 376 µs——不够再发一个 1500 字节的帧加 ACK。A 发出 CF-End，AP 在一个 SIFS 后重复一遍，B 的 NAV 在 2.890 ms 结束，而不是 3.178 ms。' },
      { en: '“first collision” (28 µs) is an RTS meeting an RTS — 20 bytes lost each, not a burst. Then load the “single protection” variant: B freezes only for each ACK and collides into A’s next frame, and the red ticks pile up as in lesson 5.', zh: '“第一次碰撞”（28 µs）是 RTS 撞 RTS——各损失 20 字节，而不是一整个突发。再载入“单次保护”变体：B 只为每个 ACK 停一下，随即撞进 A 的下一帧，红色刻度像第 5 课那样堆积起来。' },
    ],
    tryThis: [
      { en: 'Load the “multiple protection” variant and hover a data frame inside a burst: its Duration now reaches the end of the TXOP, so even a station that missed the CTS learns the reservation from the data itself.', zh: '载入“多重保护”变体，悬停突发内部的一个数据帧：它的 Duration 现在直达 TXOP 末尾，于是错过 CTS 的站点也能从数据帧本身得知预约。' },
      { en: 'Open the scenario in the editor, turn TXOP off on both stations and compare: every frame contends again, and there is no burst left to protect.', zh: '在编辑器中打开本场景，关闭两台终端的 TXOP 再比较：每一帧都要重新竞争，也就没有突发可保护了。' },
    ],
    quiz: [
      {
        q: { en: 'Hidden B never hears A. Which frame silences B for A’s whole burst?', zh: '隐藏站 B 从来听不到 A。哪一帧让 B 在 A 的整个突发期间保持安静？' },
        options: [
          { en: 'A’s RTS', zh: 'A 的 RTS' },
          { en: 'The AP’s CTS', zh: 'AP 的 CTS' },
          { en: 'A’s first data frame', zh: 'A 的第一个数据帧' },
        ],
        answer: 1,
        explain: { en: 'Only the AP is audible to B. The CTS repeats A’s reservation from the AP’s side, and with boundary protection that reservation reaches the end of A’s TXOP.', zh: 'B 只听得到 AP。CTS 从 AP 一侧重复 A 的预约，而在边界保护下这段预约直达 A 的 TXOP 末尾。' },
      },
      {
        q: { en: 'A burst ends 1.5 ms before its announced reservation. What happens?', zh: '一个突发比预告的预约提前 1.5 ms 结束。会发生什么？' },
        options: [
          { en: 'Nothing — everyone waits out the reservation', zh: '什么都不发生——所有人把预约等完' },
          { en: 'The holder sends CF-End and the AP repeats it', zh: '持有者发出 CF-End，AP 重复一遍' },
          { en: 'The holder sends a new RTS', zh: '持有者再发一个 RTS' },
        ],
        answer: 1,
        explain: { en: 'CF-End truncates the TXOP (§10.23.2.9). Stations that decode either copy reset their NAV; the rest wait until the announced end.', zh: 'CF-End 截断 TXOP（§10.23.2.9）。解出任一份的站点清零 NAV，其余站点等到预告的末尾。' },
      },
    ],
  },

  // ======================= MODULE 3 =======================
  {
    id: 'ofdma-dl',
    module: 2,
    minutes: 15,
    title: { en: '11 · OFDMA downlink — one PPDU, many stations', zh: '11 · OFDMA 下行——一个 PPDU，多个终端' },
    body: [
      { text: {
        en: 'Until Wi-Fi 6, one transmission served one receiver — small frames for many stations meant many contentions.',
        zh: '在 Wi-Fi 6 之前，一次传输只服务一个接收者——要给许多终端发小帧，就要竞争许多次。',
      } },
      { kind: 'list', heading: { en: 'OFDMA downlink', zh: 'OFDMA 下行' }, items: [
        { en: 'The AP splits the channel into resource units (RUs) and addresses several stations inside a single MU PPDU.', zh: 'AP 把信道切成资源单元（RU），在一个 MU PPDU 里同时向多台终端发送。' },
        { en: 'Each station decodes only its own RU.', zh: '每台终端只解调自己的 RU。' },
        { en: 'The acknowledgements come back simultaneously too, on the same RU split.', zh: '确认帧也在同样的 RU 划分上同时返回。' },
      ] },
      { text: {
        en: 'Contention happens once per group, and the MAC starts to look like a scheduler.',
        zh: '整组只需竞争一次，MAC 开始有了“调度器”的样子。',
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
    title: { en: '12 · Trigger frames — the AP conducts the uplink', zh: '12 · 触发帧——AP 指挥上行' },
    body: [
      { text: {
        en: 'Uplink OFDMA is stranger: multiple stations must start transmitting at the same microsecond, at coordinated power, for the same duration. Only the AP can arrange that.',
        zh: '上行 OFDMA 更奇妙：多台终端必须在同一微秒、以协调的功率、发送同样长的时间。只有 AP 能安排这一切。',
      } },
      { kind: 'steps', items: [
        { en: 'The AP sends a Trigger frame naming the participants and their RUs.', zh: 'AP 先发一个触发帧（Trigger），点名参与者及其 RU。' },
        { en: 'One SIFS later they all fire simultaneously, padded to equal length.', zh: '一个 SIFS 之后所有人同时开火，填充到等长。' },
        { en: 'The AP answers everything with a single Multi-STA BlockAck.', zh: 'AP 再用一个多站点 BlockAck 一次性确认。' },
      ] },
      { text: {
        en: 'What the stations send back is a TB PPDU — TB for trigger-based. It is the one PPDU format a station may only transmit in answer to a Trigger, because the station decides nothing about it. The Trigger dictates:',
        zh: '终端回应的那一帧叫 TB PPDU——TB 即 trigger-based（基于触发）。这是终端只能在应答触发帧时才允许发送的 PPDU 格式，因为关于这一帧的一切都不由终端自己决定。触发帧规定了：',
      } },
      { kind: 'list', heading: { en: 'TB PPDU — set by the Trigger, not the sender', zh: 'TB PPDU——由触发帧而非发送者决定' }, items: [
        { en: 'Which RU to transmit on, so several stations’ PPDUs sit side by side in one channel.', zh: '在哪个 RU 上发送，使多个终端的 PPDU 在同一信道里并排。' },
        { en: 'The MCS and number of spatial streams.', zh: 'MCS 与空间流数。' },
        { en: 'The length: every station pads to the duration the Trigger names, so all TB PPDUs end at the same instant and one Multi-STA BlockAck can answer them after one SIFS.', zh: '长度：每个终端都填充到触发帧指定的时长，所有 TB PPDU 同一瞬间结束，一个 SIFS 后一个多站点 BlockAck 就能统一确认。' },
        { en: 'The transmit power, corrected per station so signals from near and far arrive at the AP at similar levels — the AP has to decode them together.', zh: '发射功率：按终端逐个校正，让远近终端的信号到达 AP 时强度相近——AP 要把它们一起解码。' },
        { en: 'The start: SIFS after the Trigger, aligned in time and frequency to the AP.', zh: '开始时刻：触发帧之后一个 SIFS，在时间与频率上都对齐到 AP。' },
      ] },
      { text: {
        en: 'The stations surrender contention to a conductor — inside these bubbles, Wi-Fi is no longer CSMA at all.',
        zh: '终端把竞争权交给了指挥家——在这些“泡泡”里，Wi-Fi 已经不再是 CSMA。',
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
      { en: 'Both TB PPDUs (trigger-based PPDUs) end together — padded to the length the Trigger named — and one Multi-STA BA answers both. Hover a green block: its duration equals the other’s even though their queues differ.', zh: '两个 TB PPDU（基于触发的 PPDU）同时结束——都填充到触发帧指定的长度——一个多站点 BA 同时确认两者。悬停绿色块：两者时长相同，尽管它们的队列并不一样。' },
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
    title: { en: '13 · MLO — one queue, two radios', zh: '13 · MLO——一条队列，两台电台' },
    body: [
      { text: {
        en: 'Wi-Fi 7’s Multi-Link Operation runs complete, independent MACs on two bands at once (here 5 and 6 GHz). The trick is above them: a single MLD-level queue feeds both links.',
        zh: 'Wi-Fi 7 的多链路操作（MLO）在两个频段上同时运行两套完整独立的 MAC（这里是 5 GHz 和 6 GHz）。妙处在它们之上：一条 MLD 级共享队列同时喂给两条链路。',
      } },
      { kind: 'list', items: [
        { en: 'Each link contends on its own channel with its own backoff.', zh: '每条链路在自己的信道上独立退避、独立竞争。' },
        { en: 'Whichever wins airtime first claims the next frames from the shared queue.', zh: '谁先赢得空口，谁就从共享队列领走下一批帧。' },
        { en: 'If a set fails on one link, the other may retry it.', zh: '一条链路上失败的帧，另一条可以代为重传。' },
      ] },
      { text: {
        en: 'Congestion on one band simply shifts traffic to the other — latency stops depending on any single channel’s luck.',
        zh: '某个频段拥塞，流量会自然流向另一个——时延不再取决于任何单一信道的运气。',
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
    title: { en: '14 · Capstone — the busy household', zh: '14 · 结业课——热闹的一家人' },
    body: [
      { text: {
        en: 'Everything at once, across three rooms with real walls:',
        zh: '一次上齐所有元素，分布在三个房间、隔着真实的墙：',
      } },
      { kind: 'list', items: [
        { en: 'A Wi-Fi 7 MLO laptop backing up.', zh: '一台 Wi-Fi 7 MLO 笔记本在备份。' },
        { en: 'A Wi-Fi 6 TV and a projector, both streaming.', zh: '一台 Wi-Fi 6 电视和一台投影仪都在推流。' },
        { en: 'A phone on a voice call.', zh: '一部手机在通话。' },
        { en: 'A Wi-Fi 5 tablet browsing.', zh: '一台 Wi-Fi 5 平板在上网。' },
        { en: 'A legacy IoT sensor.', zh: '一个传统 IoT 传感器。' },
      ] },
      { text: {
        en: 'Your task is analysis, not reading — use the tools you now know:',
        zh: '这一课的任务是分析而不是阅读——用你已掌握的工具回答：',
      } },
      { kind: 'list', items: [
        { en: 'Who wins airtime and why?', zh: '谁赢得了空口，为什么？' },
        { en: 'Where do EDCA priorities visibly act?', zh: 'EDCA 的优先级在哪里清晰可见？' },
        { en: 'When does the AP choose MU transmission over TXOP bursts?', zh: 'AP 什么时候选择 MU 传输而不是 TXOP 突发？' },
        { en: 'Which device is the whole network’s bottleneck?', zh: '哪台设备是整个网络的瓶颈？' },
      ] },
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

  // ======================= MODULE 4 =======================
  {
    id: 'width',
    module: 3,
    minutes: 6,
    title: { en: '15 · Channel width — twice the tones, half the time', zh: '15 · 信道带宽——子载波翻倍，时间减半' },
    body: [
      { text: {
        en: 'Every lesson so far has been about sharing the air. This module is about how much one frame gets out of it. A 20 MHz channel is not one carrier: it is 234 narrow data subcarriers, each holding a few bits per symbol. Double the channel and you get at least double the tones — 234 at 20 MHz, 468 at 40, 980 at 80, 1960 at 160, 3920 at 320. The step to 80 MHz gives a little more than double, because the guard band at the channel edges is paid once, not once per 20 MHz. More tones, more bits in every symbol, fewer symbols for the same frame.',
        zh: '到目前为止的每一课讲的都是如何分享空口。这一模块讲的是一帧能从空口里拿到多少。20 MHz 的信道并不是一根载波，而是 234 根很窄的数据子载波，每根在每个符号里装几个比特。带宽翻一倍，子载波至少也翻一倍——20 MHz 是 234 根，40 MHz 468 根，80 MHz 980 根，160 MHz 1960 根，320 MHz 3920 根。其中到 80 MHz 那一步还多给了一点，因为信道两端的保护带只付一次，不是每 20 MHz 付一次。子载波越多，每个符号装的比特越多，同一帧需要的符号就越少。',
      } },
      { kind: 'formula', text: {
        en: 'symbols = ⌈(16 + 8·bytes + 6) / (N_DBPS × tone ratio × streams)⌉',
        zh: '符号数 = ⌈(16 + 8·字节数 + 6) / (N_DBPS × 子载波倍数 × 空间流数)⌉',
      }, note: {
        en: 'Only the data part shrinks. In front of it sits a preamble the receivers must sync on — a fixed 48 µs for a Wi-Fi 7 PPDU, at any width — and a symbol cannot be cut in half: a leftover fraction always rounds up to a whole 13.6 µs symbol.',
        zh: '缩短的只有数据部分。它前面还有一段供各电台同步的前导码——Wi-Fi 7 的 PPDU 固定 48 µs，任何带宽下都一样——而且符号不能切一半：除不尽时总要向上取整到完整的 13.6 µs 符号。',
      } },
      { kind: 'table', heading: {
        en: 'One 1500-byte frame (1530 octets on the air), Wi-Fi 7, one stream',
        zh: '同一个 1500 字节的帧（空口上 1530 字节），Wi-Fi 7，单流',
      }, head: [
        { en: 'Width', zh: '带宽' }, { en: 'Data tones', zh: '数据子载波' },
        { en: 'MCS', zh: 'MCS' }, { en: 'Airtime', zh: '空口时间' },
      ], rows: [
        [N('20 MHz'), N('234'), N('13'), N('129.6 µs')],
        [N('40 MHz'), N('468'), N('13'), N('88.8 µs')],
        [N('80 MHz'), N('980'), N('13'), N('75.2 µs')],
        [N('160 MHz'), N('1960'), N('12'), N('61.6 µs')],
      ] },
      { heading: { en: 'What width costs', zh: '带宽的代价' }, text: {
        en: 'A wider channel is a wider door, and noise comes through it too. Each doubling takes in twice the noise power — 3 dB — so every modulation needs 3 dB more signal to survive at 40 MHz than at 20 MHz, 6 dB at 80, about 9 dB at 160. The last row of the table is that bill arriving: the same laptop, on the same desk, drops from MCS 13 to MCS 12 the moment the channel goes to 160 MHz. Beside the router that is small change. In the far corner of the flat it is the whole link.',
        zh: '信道越宽，门开得越大，噪声也一起进来。带宽每翻一倍，收进来的噪声功率也翻一倍——3 dB——所以同一种调制在 40 MHz 上要比 20 MHz 多 3 dB 信号才活得下来，80 MHz 多 6 dB，160 MHz 多约 9 dB。表格最后一行就是这张账单：同一台笔记本、同一个桌面位置，信道一换成 160 MHz，MCS 就从 13 掉到 12。在路由器旁边，这点代价不值一提；在房子另一头的角落里，它就是整条链路。',
      } },
      { heading: { en: 'When wider is slower', zh: '更宽反而更慢的时候' }, text: {
        en: 'That bill can grow larger than the goods. Move the same laptop just under eight metres out, into the living room, and every width still delivers — no retries, no drops — but the airtimes read 415.2 µs at 20 MHz, 292.8 at 40, and then back up to 401.6 at 80. The extra 3 dB an 80 MHz channel asks for over a 40 MHz one costs two modulation steps at that spot — MCS 2 down to MCS 0, because the sensitivity ladder has a 2 dB rung in it — and a little over double the tones cannot pay back a threefold cut in bits per symbol. Against 20 MHz the wider channel still wins, just barely: 401.6 µs against 415.2. It is 40 MHz it cannot beat. At 160 MHz the modulation cannot fall any further — MCS 0 is the bottom — so its extra tones are all profit: 224.8 µs.',
        zh: '这张账单有时会大过货品本身。把同一台笔记本挪到将近八米之外的客厅里，四种带宽仍然都送得到——没有重传，也没有丢帧——但空口时间是这样的：20 MHz 415.2 µs，40 MHz 292.8 µs，到 80 MHz 反而涨回 401.6 µs。80 MHz 相对 40 MHz 要多付的那 3 dB，在那个位置要用两级调制去换：MCS 2 直接掉到 MCS 0——因为灵敏度阶梯上有一档只有 2 dB 的窄阶——而每符号比特数掉到三分之一，子载波那一倍出头的增益补不回来。跟 20 MHz 比，更宽的信道仍然险胜：401.6 µs 对 415.2 µs。它赢不了的是 40 MHz。到了 160 MHz，调制已经掉无可掉（MCS 0 就是底），多出来的子载波便全是净赚：224.8 µs。',
      } },
      { kind: 'list', heading: { en: 'In the simulation', zh: '在仿真里看' }, items: [
        { en: 'Load opens the widest case, 160 MHz. The four width buttons step it down and back up; the laptop and the router never move.', zh: '“载入”打开的是最宽的一档，160 MHz。上面四个按钮逐档切换带宽，笔记本和路由器始终不动。' },
        { en: 'Click a blue data block: the airtime line in the frame inspector is where the width shows up.', zh: '点开一个蓝色数据块：带宽的效果体现在帧检视器的“空口时间”一行。' },
        { en: 'The rate line is not. It names the MCS and what that MCS carries on one 20 MHz stream, so it reads 172.1 Mbps at 20, 40 and 80 MHz and 154.9 Mbps at 160 MHz — it goes down as the channel widens, while the frame is getting shorter.', zh: '“速率”一行则不是。它给出的是 MCS 以及该 MCS 在单条 20 MHz 流上的速率，所以 20/40/80 MHz 都显示 172.1 Mbps，160 MHz 显示 154.9 Mbps——信道越宽这个数字反而越小，而帧本身正在变短。' },
      ] },
    ],
    scenario: () => widthScenario(160, 1),
    variants: [
      { label: N('20 MHz'), scenario: () => widthScenario(20, 1) },
      { label: N('40 MHz'), scenario: () => widthScenario(40, 1) },
      { label: N('80 MHz'), scenario: () => widthScenario(80, 1) },
      { label: N('160 MHz'), scenario: () => widthScenario(160, 1) },
    ],
    jumps: [
      J('first data frame', '第一个数据帧', firstData),
      J('first ACK', '第一个 ACK', firstAck),
    ],
    observe: [
      { en: 'Step 20 → 40 → 80 → 160 MHz and watch one data block: 129.6 µs, 88.8, 75.2, 61.6. Doubling the width never halves the frame — the 48 µs preamble inside every one of them scales with nothing.', zh: '按 20 → 40 → 80 → 160 MHz 逐档切换，盯住一个数据块：129.6 µs、88.8、75.2、61.6。带宽翻倍从来不会让整帧减半——每一帧里那 48 µs 的前导码不随任何东西缩短。' },
      { en: 'Subtract the fixed 48 µs preamble from each and you get 81.6, 40.8, 27.2 and 13.6 µs of data — 6, 3, 2 and 1 symbols. That is the whole mechanism.', zh: '每个数字都减掉固定的 48 µs 前导码，剩下 81.6、40.8、27.2、13.6 µs 的数据——正好是 6、3、2、1 个符号。机制就这么简单。' },
      { en: 'At 160 MHz the preamble is 48 µs of the 61.6: more than three quarters of the frame is now the part that never got shorter.', zh: '在 160 MHz 上，61.6 µs 里有 48 µs 是前导码：整帧四分之三以上，是那段从来没有变短的部分。' },
      { en: 'The white ACK is identical in all four variants — control frames go out at a low, robust rate, and width buys them nothing.', zh: '四个变体里白色的 ACK 完全一样——控制帧用低速稳健的速率发送，带宽对它毫无帮助。' },
    ],
    tryThis: [
      { en: 'Open in editor — the lesson opens at 160 MHz — and walk the laptop out of the study. Seven and a half squares right of the router and two down, half way into the living room, it still delivers everything, 224.8 µs a frame; the paragraph above is what that same spot costs at the narrower widths. Keep going into the far corner and not one ACK comes back: 160 MHz needs about 9 dB more than 20 MHz, and that corner does not have it, so every frame becomes a retry and then a drop.', zh: '点“在编辑器中打开”——这一课打开的是 160 MHz——然后把笔记本一步步挪出书房。挪到路由器右边七格半、下面两格的位置，大约在客厅正中，它仍然一帧不落地送达，每帧 224.8 µs；上面那段讲的就是同一个位置在更窄带宽下的代价。继续挪到最远的角落，就一个 ACK 也回不来了：160 MHz 比 20 MHz 多要约 9 dB，那个角落给不起，于是每一帧都变成重传，最后被丢弃。' },
      { en: 'With the laptop still in that corner, switch it to 802.11a (legacy) in the editor. A legacy radio has no wide mode, so the link falls back to 20 MHz — and the ACKs come back, at over a millisecond per frame.', zh: '让笔记本留在那个角落，在编辑器里把它改成 802.11a（传统模式）。传统电台没有宽信道模式，链路只能退回 20 MHz——ACK 就回来了，代价是每帧超过一毫秒。' },
    ],
    quiz: [
      {
        q: { en: 'At 20 MHz this frame takes 129.6 µs. At 160 MHz, with eight times the tones, it takes 61.6 µs. Why not an eighth of the time?', zh: '这个帧在 20 MHz 上要 129.6 µs；到了 160 MHz，子载波是八倍，却仍要 61.6 µs。为什么不是八分之一？' },
        options: [
          { en: 'The ACK grows as the data frame shrinks', zh: '数据帧变短，ACK 就会变长' },
          { en: 'A fixed 48 µs preamble sits in front of the data, and the data itself cannot be shorter than one whole symbol', zh: '数据前面有固定的 48 µs 前导码，而数据本身最短也不能少于一个完整符号' },
          { en: 'Wide channels are transmitted at lower power', zh: '宽信道的发射功率更低' },
        ],
        answer: 1,
        explain: { en: 'Only the data part scales: 81.6 µs of symbols at 20 MHz becomes a single 13.6 µs symbol at 160 MHz. The 48 µs preamble does not move, and it is now more than three quarters of the frame.', zh: '按比例缩短的只有数据部分：20 MHz 上的 81.6 µs 符号，到 160 MHz 只剩一个 13.6 µs 的符号。48 µs 的前导码纹丝不动，此时已占了整帧四分之三以上。' },
      },
      {
        q: { en: 'Your phone is at the edge of range. Does moving it from a 160 MHz channel to a 40 MHz one make it faster or slower?', zh: '手机在覆盖边缘。把它从 160 MHz 换到 40 MHz，是更快还是更慢？' },
        options: [
          { en: 'Slower — a quarter of the tones is a quarter of the speed', zh: '更慢——子载波只剩四分之一，速度也只剩四分之一' },
          { en: 'Usually faster: once the signal is marginal, 6 dB of sensitivity is worth more than the tones it gives up', zh: '通常更快：信号已经勉强时，6 dB 的灵敏度比让出去的那些子载波更值钱' },
          { en: 'No difference — width does not affect range', zh: '没区别——带宽不影响覆盖' },
        ],
        answer: 1,
        explain: { en: 'Two doublings of width cost 6 dB. From the far corner of this lesson’s flat the 80 and 160 MHz variants deliver nothing at all, while 20 and 40 MHz still get frames through.', zh: '带宽翻两倍要付 6 dB。在这一课户型的最远角落，80 MHz 和 160 MHz 一帧也送不到，而 20 MHz 和 40 MHz 依然能把帧送出去。' },
      },
    ],
  },

  {
    id: 'streams',
    module: 3,
    minutes: 5,
    title: { en: '16 · Spatial streams — several conversations in the same air', zh: '16 · 空间流——同一片空气里的多路对话' },
    body: [
      { text: {
        en: 'Width buys more tones. Streams buy the same tones twice. With two antennas at each end, the radio sends two different signals on the same subcarriers in the same instant, and the receiver pulls them apart by the different paths they took through the room. Each stream multiplies the bits per symbol exactly as more tones do.',
        zh: '带宽买来的是更多子载波，空间流买来的是同一批子载波用上两遍。两端各有两根天线时，电台就能在同一时刻、同一批子载波上发出两路不同的信号，接收方再靠它们在房间里走过的不同路径把它们分开。每加一条流，每个符号装的比特数就翻一番——和子载波变多的效果一模一样。',
      } },
      { text: {
        en: 'The difference is the price. A wider channel makes the receiver listen to more noise; a second stream does not — the channel is still 20 MHz wide, so the noise floor and every sensitivity threshold stay where they were. Streams are the multiplier you get for free. Width is the one that costs 3 dB.',
        zh: '区别在价钱。信道变宽会让接收方听进更多噪声，而加一条流不会——信道还是 20 MHz 宽，噪声底和各档灵敏度门限一动不动。空间流是白送的倍数，带宽那个倍数要花 3 dB 去买。',
      } },
      { kind: 'table', heading: {
        en: 'The same 1500-byte frame, 20 MHz, MCS 13',
        zh: '同一个 1500 字节的帧，20 MHz，MCS 13',
      }, head: [
        { en: 'Streams', zh: '空间流' }, { en: 'Bits per symbol', zh: '每符号比特数' },
        { en: 'Symbols', zh: '符号数' }, { en: 'Airtime', zh: '空口时间' },
      ], rows: [
        [N('1'), N('2340'), N('6'), N('129.6 µs')],
        [N('2'), N('4680'), N('3'), N('88.8 µs')],
        [N('4'), N('9360'), N('2'), N('75.2 µs')],
      ] },
      { heading: { en: 'Both ends have a vote', zh: '两端都有发言权' }, text: {
        en: 'A link runs at the smaller stream count of its two ends. A four-stream router talking to a two-stream phone is a two-stream link: the Router 4 · Phone 2 variant is exactly that pairing, and it lands on 88.8 µs — the two-stream time, not the four-stream 75.2 µs. The router’s other two streams are not wasted, though. It can point them at a second phone in the very same instant; that is MU-MIMO, and it is lesson 17.',
        zh: '链路按两端里较小的流数运行。四流的路由器对上两流的手机，就是一条两流链路：“路由器 4 · 手机 2”这个变体正是这种搭配，结果落在 88.8 µs——两流的时间，而不是四流的 75.2 µs。不过路由器多出来的两条流并没有浪费：它可以在同一瞬间把这两条流指向另一部手机。这就是 MU-MIMO，也就是第 17 课。',
      } },
      { heading: { en: 'Where the multipliers stop', zh: '倍数到头的地方' }, text: {
        en: 'A multiplier only helps while something is left to divide. The 160 MHz · 4 streams variant runs the widest channel and the most streams together, and it takes 61.6 µs — exactly what 160 MHz alone took in lesson 15. That frame was already down to a single symbol, and one symbol is the floor. The four streams buy nothing there, while the wide channel still charges its 9 dB: that variant runs at MCS 12, the step down lesson 15 showed.',
        zh: '倍数只在还有东西可分的时候才有用。“160 MHz · 4 条流”这个变体把最宽的信道和最多的流一起用上，结果是 61.6 µs——和第 15 课里单靠 160 MHz 得到的完全一样。那一帧当时就已经只剩一个符号了，而一个符号就是地板。在那里四条流什么也没买到，而宽信道该收的 9 dB 一分不少：这个变体跑在 MCS 12——正是第 15 课里掉的那一档。',
      } },
    ],
    scenario: () => widthScenario(20, 1),
    variants: [
      { label: { en: '1 stream', zh: '1 条流' }, scenario: () => widthScenario(20, 1) },
      { label: { en: '2 streams', zh: '2 条流' }, scenario: () => widthScenario(20, 2) },
      { label: { en: '4 streams', zh: '4 条流' }, scenario: () => widthScenario(20, 4) },
      { label: { en: 'Router 4 · Phone 2', zh: '路由器 4 · 手机 2' }, scenario: () => widthScenario(20, 2, 4) },
      { label: { en: '160 MHz · 4 streams', zh: '160 MHz · 4 条流' }, scenario: () => widthScenario(160, 4) },
    ],
    jumps: [
      J('first data frame', '第一个数据帧', firstData),
      J('first ACK', '第一个 ACK', firstAck),
    ],
    observe: [
      { en: 'One stream to two: the data part halves exactly, 81.6 µs to 40.8 µs. Two to four would halve it again to 20.4 µs, but frames are sent in whole symbols, so it stops at 27.2 µs.', zh: '从 1 条流到 2 条流：数据部分正好减半，81.6 µs 变成 40.8 µs。从 2 条到 4 条本该再减半到 20.4 µs，但帧只能按整数个符号发送，所以停在 27.2 µs。' },
      { en: 'The rate line reads MCS 13 in all four 20 MHz variants: one stream or four, the modulation never moves. Only the 160 MHz variant drops to MCS 12 — and that is the width doing it, not the streams.', zh: '四个 20 MHz 变体里“速率”一行都是 MCS 13：一条流也好四条流也好，调制一档都不动。只有 160 MHz 那个变体掉到 MCS 12——那是带宽干的，不是空间流干的。' },
      { en: 'Router 4 · Phone 2 is indistinguishable from 2 streams: the same 88.8 µs, the same blocks in the same places.', zh: '“路由器 4 · 手机 2”和“2 条流”看不出区别：同样是 88.8 µs，同样的块出现在同样的位置。' },
    ],
    tryThis: [
      { en: 'Put 2 streams and Router 4 · Phone 2 side by side and hunt for a difference on the timeline. There is none — the router’s extra pair has nobody to talk to.', zh: '把“2 条流”和“路由器 4 · 手机 2”放在一起对比，在时间轴上找不同。找不到——路由器多出来的那对流没有对象可说话。' },
      { en: 'Compare 2 streams here with 40 MHz in lesson 15: both take 88.8 µs for the same frame. Only one of them asked the laptop for 3 dB more signal.', zh: '把这里的“2 条流”和第 15 课的 40 MHz 比一比：同一个帧都是 88.8 µs。但只有其中一个向笔记本多要了 3 dB 的信号。' },
      { en: 'Click 160 MHz · 4 streams, then 4 streams: 61.6 µs against 75.2 µs. Eight times the tones on top of four streams buys exactly one symbol.', zh: '先点“160 MHz · 4 条流”，再点“4 条流”：61.6 µs 对 75.2 µs。在四条流之上再加八倍的子载波，只换来一个符号。' },
    ],
    quiz: [
      {
        q: { en: 'Why does adding a spatial stream cost no sensitivity, when doubling the channel width does?', zh: '为什么加一条空间流不用付灵敏度的代价，而带宽翻倍就要付？' },
        options: [
          { en: 'Streams are transmitted at higher power', zh: '空间流的发射功率更高' },
          { en: 'The channel is still the same width, so the receiver takes in the same noise — the streams are separated by space, not by frequency', zh: '信道宽度没变，接收方收进的噪声也没变——两条流靠空间区分，不靠频率' },
          { en: 'The extra streams are sent on a second channel', zh: '多出来的那些流是在另一条信道上发的' },
        ],
        answer: 1,
        explain: { en: 'Noise power follows bandwidth. Doubling the width doubles it (3 dB); a second stream reuses the same subcarriers, so the noise floor and the MCS thresholds do not move at all.', zh: '噪声功率跟着带宽走。带宽翻倍，噪声也翻倍（3 dB）；而第二条流复用的是同一批子载波，噪声底和各档 MCS 门限完全不动。' },
      },
      {
        q: { en: 'A four-stream router serves a two-stream phone. How many streams does that link use?', zh: '一台四流路由器服务一部两流手机。这条链路用几条流？' },
        options: [
          { en: 'Four — the router decides', zh: '四条——路由器说了算' },
          { en: 'Two — a link runs at the smaller stream count of its two ends', zh: '两条——链路按两端里较小的流数运行' },
          { en: 'Three — the average', zh: '三条——取平均' },
        ],
        answer: 1,
        explain: { en: 'Every capability is negotiated down to the weaker end. The link uses two, and the frame takes 88.8 µs: the two-stream time, not the four-stream 75.2 µs.', zh: '所有能力都要按较弱的一端协商。链路用两条流，帧要 88.8 µs——两流的时间，而不是四流的 75.2 µs。' },
      },
    ],
  },

  {
    id: 'mumimo',
    module: 3,
    minutes: 7,
    title: { en: '17 · MU-MIMO — splitting by space instead of frequency', zh: '17 · MU-MIMO——按空间而不是按频率划分' },
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
        [N('OFDMA'), N('3'), N('92.8 µs'), N('371.4 Mb/s')],
        [N('MU-MIMO'), N('2'), N('65.6 µs'), N('525.4 Mb/s')],
      ] },
      { text: {
        en: 'Same 4,308-byte payload per member either way — three A-MPDU’d video frames the router had backed up for that phone, so OFDMA’s three members deliver 12,924 B combined in that one PPDU against MU-MIMO’s 8,616 B from two. On the data alone the two variants are worlds apart: OFDMA’s one-third share of the tones needs exactly 3 data symbols (40.8 µs) to carry it; MU-MIMO’s full share needs exactly 1 (13.6 µs) — a clean threefold gain, precisely the group size MU-MIMO gave up. But every PPDU also pays a fixed 52 µs preamble (48 µs of EHT preamble plus 4 µs of multi-user SIG overhead) that does not shrink with the data, so end to end it is 92.8 µs against 65.6 µs — only about 1.4×, not 3×. This is lesson 15’s preamble-amortisation point again, on the other axis: the fixed cost dilutes whatever the tones or the antennas buy you, and it dilutes it hardest on the smallest frames.',
        zh: '两边每个成员的负载都一样，都是 4,308 字节——路由器给那部手机攒下的三个已聚合视频帧，所以 OFDMA 那三个成员在同一个 PPDU 里合计交付 12,924 字节，MU-MIMO 两个成员合计 8,616 字节。只看数据部分，两个变体天差地别：OFDMA 分到三分之一子载波，要整整 3 个数据符号（40.8 µs）才能载完；MU-MIMO 独享全部子载波，只要 1 个（13.6 µs）——干净利落的三倍增益，正好是 MU-MIMO 放弃的那个组的大小。但每个 PPDU 还要付一段固定的 52 µs 前导码（48 µs 的 EHT 前导码加 4 µs 的多用户 SIG 开销），它不会随数据一起缩短，所以整帧算下来是 92.8 µs 对 65.6 µs——只有约 1.4 倍，不是 3 倍。这正是第 15 课“前导码摊薄”那个道理换了个轴再讲一遍：无论子载波还是天线买来的好处，都会被这笔固定成本摊薄，帧越小摊薄得越狠。',
      } },
      { heading: { en: 'Three candidates, but the MU-MIMO group is never three', zh: '三个候选人，但 MU-MIMO 分组从来不是三个' }, text: {
        en: 'The router has four streams; each phone negotiates two. Two phones already use all four — a third would need six. So whenever MU-MIMO is possible at all, this AP trims the group down to two candidates and serves the third separately. Where the trimmed phone turns up next is worth measuring rather than guessing: over the 184 two-member PPDUs in this run it gets its own single-user PPDU immediately after 125 times (68%), turns up in whichever MU-MIMO pairing forms next 45 times (24%), and neither of those 14 times (8%) — the router simply reached the other two again first and the trimmed phone waited another round. OFDMA has no such ceiling here: the same three phones fit together in one PPDU, each on its own slice of tones. Frequency divides among everyone who shows up; space is capped by how many antennas paid for it.',
        zh: '路由器有四条流；每部手机协商到两条。两部手机就已经用满四条——第三部还需要再要六条。所以只要 MU-MIMO 可行，这台 AP 就会把组裁到两个候选人，第三个另外单独服务。被裁掉的那部手机接下来会在哪里出现，值得实测而不是猜：这段仿真里 184 个两成员 PPDU 中，125 次（68%）它紧接着拿到一个属于自己的单用户 PPDU，45 次（24%）出现在下一次组成的 MU-MIMO 配对里，还有 14 次（8%）两样都不是——路由器又先轮到了另外那两部，被裁的手机只好再等一轮。OFDMA 在这里没有这个天花板：同样这三部手机能挤进同一个 PPDU，每人占一片子载波。频率是分给所有到场的人；空间的上限则是有多少天线为它买了单。',
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
      { en: 'MU-MIMO variant: the same block now carries only two parts, each at the phone’s full negotiated rate. Follow the phone that got trimmed: 68% of the time a third, separate block follows immediately for it; 24% of the time it turns up in the next MU-MIMO pairing instead; and 8% of the time neither happens — the other two are paired again first, and it waits another round.', zh: 'MU-MIMO 变体：同一个块现在只装两份，各自都是那部手机协商到的满速率。盯住被裁掉的那部手机：68% 的情况下它紧接着有一个独立的块；24% 的情况下它出现在下一次的 MU-MIMO 配对里；还有 8% 两样都不是——另外两部又先被配到了一起，它得再等一轮。' },
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
  },

  {
    id: 'rate',
    module: 3,
    minutes: 7,
    title: { en: '18 · Rate adaptation — the loop that picks the speed', zh: '18 · 速率自适应——选择速率的那个回路' },
    body: [
      { text: {
        en: 'Two stations upload flat out to the same AP: one on the desk beside it, one in the far corner of the flat behind a brick wall. Signal strength sets a ceiling on how dense the far station’s modulation can be — here MCS 1, decided purely by distance and the wall. Everything below that ceiling is a choice, and the driver makes it from what actually happened to its own frames, not from the signal it measures.',
        zh: '两台终端都在向同一个 AP 满速上传：一台在它旁边的桌上，一台在公寓另一头、隔着一堵砖墙的角落里。信号强度给远端终端的调制密度定了一个上限——这里是 MCS 1，纯粹由距离和那堵墙决定。低于这个上限的一切都是“选择”，而驱动程序做这个选择靠的是自己的帧究竟发生了什么，而不是它测到的信号强度。',
      } },
      { kind: 'steps', heading: { en: 'The simulator’s rule', zh: '仿真器的规则' }, items: [
        { en: 'Start at the ceiling.', zh: '从上限开始。' },
        { en: 'Two failed attempts in a row step the working rate down one MCS.', zh: '连续两次尝试失败，就把当前速率降一档 MCS。' },
        { en: 'Ten successful attempts in a row step it back up one MCS.', zh: '连续十次尝试成功，就把它升回一档 MCS。' },
        { en: 'It is never allowed above the ceiling, however long the success streak.', zh: '无论连续成功多少次，都不允许超过上限。' },
      ] },
      { text: {
        en: 'That two-down/ten-up ladder is Auto Rate Fallback — the textbook algorithm, chosen here because every step it takes is legible on the timeline. Production drivers do not run it. They estimate a packet error rate over a moving window of recent attempts and pick the rate with the best expected throughput, which lets them jump several indices at once instead of climbing one rung per ten successes. Read the four rules as this simulator’s rule, not as what your laptop is doing.',
        zh: '“两次降一档、十次升一档”这个阶梯是自动速率回退（ARF）——教科书上的算法，这里选它是因为它走的每一步都能在时间轴上看清楚。真实的产品驱动并不跑它：它们在最近若干次尝试的滑动窗口上估计丢包率，再挑期望吞吐最高的那一档，因此可以一次跳好几档，而不必十次成功爬一级。请把上面四条读作本仿真器的规则，而不是你笔记本正在做的事。',
      } },
      { text: {
        en: 'Note also what the four rules do not say. Only single-user exchanges report an outcome at all: an ACK arrives or its timeout does, and that is what moves the rate. A multi-user downlink reports nothing. Over lesson 17’s OFDMA run the router sends 176 multi-user PPDUs carrying 514 parts addressed to phones, and the rate controller is told about none of them — all 132 of its outcome reports for those phones come from ordinary single-user frames. A rate that is only ever used inside multi-user PPDUs therefore never adapts; it simply carries whatever the single-user traffic last established.',
        zh: '还要注意这四条规则没说的部分。只有单用户交换才会上报结果：ACK 回来了，或者它的超时到了——推动速率的就是这个。多用户下行什么都不上报。在第 17 课的 OFDMA 那段仿真里，路由器发出 176 个多用户 PPDU、其中有 514 份是发给手机的，而速率控制器一份都不知道——它为这些手机记下的 132 次结果上报，全部来自普通的单用户帧。所以一档只在多用户 PPDU 里用到的速率永远不会自适应，它只是沿用单用户流量最后确定下来的那个值。',
      } },
      { text: {
        en: 'Alone, the far station would sit at MCS 1 forever: nothing ever fails, so it never has a reason to drop, and the ceiling gives it nowhere higher to climb. What actually happens on this timeline is a station that shares the channel with another saturated uploader, and that is where the loop becomes visible: a collision costs an attempt, two lost attempts in a row lower the rate, and only an unbroken run of ten successes wins the step back. The loop is real and asymmetric — two draws of bad luck to fall, ten of good luck to recover — which is why the far station spends whole stretches of this run below a ceiling it could have been using.',
        zh: '如果只有它自己，远端终端会永远停在 MCS 1：从没有失败过，也就没有理由降速，而上限又让它没有更高的地方可爬。这条时间轴上真正发生的，是一台和另一台饱和上传终端共享信道的终端——回路正是在这里变得看得见：一次碰撞耗掉一次尝试，连续丢两次尝试就降一档速率，而想升回去只有一条路：不间断地连成十次成功。这个回路是真实存在的，而且不对称——两次坏运气就掉下去，要十次好运气才爬得回来——所以远端终端在这段仿真里会有整段整段的时间跑在它本可以用的上限之下。',
      } },
      { text: {
        en: 'On this run the far station’s frames take 768.8 µs at MCS 1 and 1,476.0 µs at MCS 0 — the same 1,530 octets, almost exactly double the airtime one step down, because MCS 0 carries half the bits per symbol that MCS 1 does. The rate line says the same thing: 17.2 Mb/s becomes 8.6 Mb/s. Every fall is expensive twice over: once in the failed attempts that caused it, and again in every frame afterwards until it climbs back.',
        zh: '在这段仿真里，远端终端的帧在 MCS 1 上要 768.8 µs，掉到 MCS 0 就要 1,476.0 µs——同样的 1,530 字节，降一档空口时间几乎正好翻倍，因为 MCS 0 每符号能装的比特数只有 MCS 1 的一半。速率一行说的是同一件事：17.2 Mb/s 变成 8.6 Mb/s。每一次跌落都要付两遍代价：一遍是导致它的那些失败尝试本身，另一遍是此后每一帧，直到它爬回来为止。',
      } },
      { heading: { en: 'What a lower rate actually costs: airtime', zh: '低速率真正的代价：空口时间' }, text: {
        en: 'Airtime is the scarce thing in a room, and a lower rate spends more of it for the same payload. Over these three seconds the far station’s 222 MCS-0 frames are only 8.9% of the frames it sends but 15.8% of the air it occupies: 327.7 ms, where the same 222 frames at MCS 1 would have taken 170.7 ms. The excursions cost 157.0 ms of extra channel time — 5.2% of the whole three seconds, spent carrying nothing extra. The bill does not stop at the far station either. Every one of those frames pins its neighbour: the near station’s backoff is held for 859.8 µs behind an MCS-1 frame and 1,579.0 µs behind an MCS-0 one, so each drop makes the station on the desk wait 719.2 µs longer, per frame, for a turn it has already earned. That is the real penalty of a lower rate, and it is exactly lesson 6’s rate anomaly: one slow station taxing everybody through airtime.',
        zh: '房间里稀缺的东西是空口时间，而速率越低，同样的负载就要花掉越多的空口时间。这三秒里，远端终端的 222 个 MCS 0 帧只占它发出帧数的 8.9%，却占了它空口时间的 15.8%：327.7 ms——而同样这 222 帧若跑在 MCS 1 上只需 170.7 ms。也就是说，这些跌落多花掉了 157.0 ms 的信道时间——相当于整整三秒里的 5.2%，而且没有多送出一个比特。账单还不止落在远端终端头上。它的每一帧都把邻居钉住：近端终端的退避在一个 MCS 1 帧后面被冻结 859.8 µs，在一个 MCS 0 帧后面则是 1,579.0 µs——每掉一档，桌上那台终端每帧就要为自己早就挣到的那次机会多等 719.2 µs。这才是低速率真正的代价，而它正是第 6 课的速率异常：一台慢终端用空口时间向所有人收税。',
      } },
      { heading: { en: 'The intuition that is wrong here', zh: '在这里说不通的那个直觉' }, text: {
        en: 'It is tempting to close the loop the other way and make it a death spiral: a longer frame sits on the air longer, so surely it is more exposed, so the slow station collides more, so it gets slower still. Measure it and the spiral is not there. Over these three seconds the far station makes 2,276 attempts at MCS 1, of which 259 collide — 11.4% — and 222 attempts at MCS 0, of which 19 collide: 8.6%. Nineteen collisions is a thin sample and the honest reading of 8.6% against 11.4% is “no increase” rather than “a decrease”, but the direction the spiral needs is simply not in the data.',
        zh: '很容易把这个回路反过来接成一个死亡螺旋：帧越长，在空口上待得越久，那想必更容易被撞上，于是慢的终端碰撞更多，于是更慢。可一测就会发现，这个螺旋并不存在。这三秒里，远端终端在 MCS 1 上尝试了 2,276 次，其中 259 次碰撞——11.4%；在 MCS 0 上尝试了 222 次，其中 19 次碰撞——8.6%。19 次碰撞样本很薄，把 8.6% 对 11.4% 老实地读作“没有升高”而不是“下降了”更稳妥，但螺旋所需要的那个方向，数据里根本没有。',
      } },
      { text: {
        en: 'The reason is a rule from lesson 3. A backoff counter does not tick down during someone else’s frame. The moment the medium goes busy every counter freezes where it stands, and it resumes at exactly the same value when the medium clears (IEEE 802.11-2024 §10.23.2.4) — all 2,218 of the near station’s freezes in this run come back at the value they went in at. So a longer frame does not give anyone else’s counter more time to reach zero; it gives them no time at all. What sets the chance an attempt collides is the contention window that attempt was drawn from — how many slots the two stations are choosing between — not the airtime of the frame that follows. Split the same attempts that way and the effect is sharp: attempts drawn from CW 15 collide 11.8% of the time (261 of 2,217), attempts drawn from the doubled CW 31 only 5.7% (15 of 264). MCS-0 frames are the ones that follow failures, so they are drawn from the widened windows — which is why, if anything, the slow frames collide less.',
        zh: '原因是第 3 课里的一条规则：退避计数器在别人发帧期间是不倒数的。介质一转为忙，每个计数器就原地冻结，等介质空下来再从同一个数值继续（IEEE 802.11-2024 §10.23.2.4）——这段仿真里近端终端的 2,218 次冻结，无一例外都是以进去时的那个值出来的。所以更长的帧并不会给别人的计数器更多时间走到零，而是根本不给时间。真正决定一次尝试会不会碰撞的，是这次尝试是从多大的竞争窗口里抽出来的——两台终端是在多少个时隙之间做选择——而不是随后那一帧要占多久空口。把同一批尝试按这个口径拆开，效果非常清楚：从 CW 15 抽出的尝试有 11.8% 碰撞（2,217 次里的 261 次），从翻倍后的 CW 31 抽出的只有 5.7%（264 次里的 15 次）。而 MCS 0 的帧恰恰是跟在失败后面的那些，抽签用的正是被撑大的窗口——这就是为什么慢帧真要说的话，反而撞得更少。',
      } },
      { heading: { en: 'Back to lesson 3: where the failures come from', zh: '回到第 3 课：失败从何而来' }, text: {
        en: 'Every one of those lost attempts is lesson 3’s collision, replayed on a saturated pair of uploaders: two backoff counters reach zero in the same slot, both frames are destroyed, and each sender learns only from the 45 µs ACK timeout it never gets. Lesson 3 stopped there — the contention window doubles and the station redraws. This lesson is what happens once enough of those redraws land badly in a row: the failures no longer cost just one retry each, they start moving the working MCS.',
        zh: '这里丢掉的每一次尝试，都是第 3 课那种碰撞，只是发生在一对饱和上传的终端之间：两个退避计数器在同一个时隙同时清零，两个帧同归于尽，双方都只能从那个等不到的 45 µs ACK 超时里知情。第 3 课讲到这里就停了——竞争窗口翻倍，终端重新抽签。这一课接着讲：当足够多次重抽连续不走运时会发生什么——这些失败不再只是各自赔上一次重传，它们开始推着当前速率走。',
      } },
      { heading: { en: 'Back to lesson 6', zh: '回到第 6 课' }, text: {
        en: 'Lesson 6’s rate anomaly assumed a station simply parked at a low, fixed rate by distance. This loop is where that low rate can come from even when distance alone would allow better: a run of bad luck at contention drags the working rate down, and until ten successes in a row buy it back, every frame it sends occupies the channel for twice as long — a station stuck slow, holding the air while it transmits, exactly as lesson 6 described. Two things are different here. The slowness is now a state the driver can climb back out of, rather than a fixed property of the distance. And the harm travels the same way it did in lesson 6 — through airtime, one station making everyone else wait — not through any extra collisions of its own.',
        zh: '第 6 课的速率异常假设的是一台因为距离而被钉死在低速、固定速率上的终端。而这个回路展示了：即便距离本身还允许更高的速率，低速也可能是这样来的——竞争中一连串的坏运气把速率拖了下去，而在连成十次成功把它买回来之前，它发的每一帧都要占用两倍长的信道时间——一台卡在低速的终端，发送时占着空口不放，和第 6 课描述的一模一样。这里有两点不同：一是这份“慢”现在是一个驱动程序能爬出来的状态，而不是距离带来的固定属性；二是危害传递的路径和第 6 课完全相同——通过空口时间，一台终端让所有人都多等——而不是靠它自己多制造了什么碰撞。',
      } },
    ],
    scenario: () => rateScenario(),
    jumps: [
      J('first data frame', '第一个数据帧', firstData),
      J('first collision', '第一次碰撞', firstCollision),
      J('first retry', '第一次重传', firstRetry),
    ],
    observe: [
      { en: 'The far station’s green blocks change length over the run: short ones at MCS 1, roughly twice as long at MCS 0 — the rate is visibly moving, not fixed.', zh: '远端终端的绿色块在整个过程里长度会变：MCS 1 上是短的，MCS 0 上大约长一倍——速率明显在变化，不是固定的。' },
      { en: 'Thirteen times in this run the far station falls to MCS 0. More than half of those last exactly ten frames — the fastest possible climb back — but a few last up to 41, because a fresh collision reset the success count partway through the climb.', zh: '这段仿真里远端终端一共跌到 MCS 0 十三次。其中过半恰好持续十帧——这是能爬回去的最短时间——但也有几次拖到长达 41 帧，因为爬升途中又撞上了一次碰撞，把成功计数清零重来。' },
      { en: 'The near station, one metre from the AP, ranges over MCS 9–11 but spends almost the whole run (about 88% of its frames) at the ceiling, MCS 11 — it fails often enough from the far station’s collisions to dip occasionally, but never for long.', zh: '离 AP 只有一米的近端终端在 MCS 9–11 之间波动，但几乎全程（约 88% 的帧）都停在它的上限 MCS 11 上——远端终端引发的碰撞也会让它偶尔失败几次，但从不会掉太久。' },
    ],
    tryThis: [
      { en: 'Move the far station two metres closer to the AP in the editor. One metre does nothing at all — a metre does not cross a modulation threshold, and the run comes back frame for frame identical. Two metres does: the ceiling rises from MCS 1 to MCS 2, the bottom rung falls from 8.9% of its frames to 3.4%, and it delivers 3,226 frames in the three seconds instead of 2,498. At four metres MCS 0 never occurs at all. Put it back, then add a third saturated uploader and watch the far station sink onto the bottom rung far more often: 51.4% of its frames with the newcomer beside the near station, and 43–56% at every other spot tried.', zh: '在编辑器里把远端终端朝 AP 挪近两米。挪一米什么也不会发生——一米跨不过任何一档调制门限，整段仿真会一帧不差地重现。两米才管用：上限从 MCS 1 抬到 MCS 2，最底下那一档从占它 8.9% 的帧降到 3.4%，三秒里交付的帧数也从 2,498 涨到 3,226。挪到四米，MCS 0 干脆一次都不出现。再把它挪回原处，加一台饱和上传终端，看远端终端落到最底一档的频率大幅升高：把新终端放在近端终端旁边时占它 51.4% 的帧，换到试过的其他位置也都在 43%–56% 之间。' },
    ],
    quiz: [
      {
        q: { en: 'The far station’s signal has not changed, but its modulation dropped two steps. What happened?', zh: '远端终端的信号强度没有变化，但它的调制降了两档。发生了什么？' },
        options: [
          { en: 'The ceiling itself fell by two MCS indices', zh: '上限本身降了两档 MCS' },
          { en: 'Four failed attempts in a row — the controller stepped down at the second failure, and again at the fourth', zh: '连续四次尝试失败——控制器在第二次失败时降了一档，第四次失败时又降了一档' },
          { en: 'The AP requested a lower rate to save power', zh: 'AP 为了省电要求降低速率' },
        ],
        answer: 1,
        explain: { en: 'Two consecutive failures step the rate down one; the signal-based ceiling never moves on its own. Two steps down means two pairs of failures, four in total.', zh: '连续两次失败会让速率降一档；基于信号的上限本身不会自己变动。降两档意味着两对失败，一共四次。' },
      },
      {
        q: { en: 'The far station’s MCS 0 frames last almost twice as long as its MCS 1 frames. Which of the two collides more often per attempt?', zh: '远端终端的 MCS 0 帧几乎是 MCS 1 帧的两倍长。这两种帧里，哪一种每次尝试的碰撞率更高？' },
        options: [
          { en: 'The MCS 0 frames — they sit on the air longer, so more backoff counters have time to reach zero while they do', zh: 'MCS 0 的帧——它们在空口上待得更久，其间有更多退避计数器有时间走到零' },
          { en: 'The MCS 1 frames, if anything: 11.4% against 8.6% here. Frame length is not what sets the per-attempt collision rate', zh: 'MCS 1 的帧，真要说的话：这里是 11.4% 对 8.6%。决定每次尝试碰撞率的不是帧长' },
          { en: 'Exactly the same rate for both — collisions depend only on how many stations there are', zh: '两者完全一样——碰撞只取决于有多少台终端' },
        ],
        answer: 1,
        explain: { en: 'A backoff counter does not tick down during someone else’s frame: it freezes when the medium goes busy and resumes at the same value (IEEE 802.11-2024 §10.23.2.4, and all 2,218 of the near station’s freezes in this run do exactly that). So a longer frame gives no one else’s counter extra time to expire — it gives them none. What sets the per-attempt rate is the contention window the attempt was drawn from: here attempts drawn from CW 15 collide 11.8% of the time, attempts drawn from the doubled CW 31 only 5.7%. MCS 0 frames follow failures, so they are drawn from the widened windows — which is why they do not collide more. The third answer has the right instinct but overshoots: the two rates are not identical, and the number of stations is not the only thing that matters.', zh: '退避计数器在别人发帧期间是不倒数的：介质转忙时它冻结，之后从同一数值继续（IEEE 802.11-2024 §10.23.2.4——这段仿真里近端终端的 2,218 次冻结全都如此）。所以更长的帧不会给别人的计数器多出任何时间走到零，而是根本不给。决定每次尝试碰撞率的是这次尝试抽签时的竞争窗口：这里从 CW 15 抽出的尝试有 11.8% 碰撞，从翻倍后的 CW 31 抽出的只有 5.7%。MCS 0 的帧跟在失败后面，抽的正是被撑大的窗口——这就是它们不会撞得更多的原因。第三个选项方向是对的，但说过头了：两者的碰撞率并不相同，终端数量也不是唯一起作用的因素。' },
      },
    ],
  },
]

export function lessonIndex(id: string): number {
  return LESSONS.findIndex((l) => l.id === id)
}
