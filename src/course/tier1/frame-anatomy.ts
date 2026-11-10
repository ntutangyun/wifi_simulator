/**
 * Wi-Fi Tier 1 · M3 · lesson 1: the header of a frame. What the first two
 * bytes say, whom the addresses name, how long the room is spoken for, and
 * where the frame sits in a numbered run.
 *
 * The FIRST half of what was one lesson (re-paced 2026-09-25): the traffic mark
 * and the check at the end are `frame-qos-fcs`, which loads this lesson's own
 * scene.
 *
 * Standard-first shape (2026-11-10): ① IEEE Std 802.11-2024 §9.2 — the general
 * frame format (figure 9-2, drawn by the `fields` figure), Frame Control bit by
 * bit, Duration/ID, the address table 9-60 and the sequence number spaces of
 * table 10-5; ② where this simulator follows it and where not — no real octets,
 * five Frame Control bits always 0, a Duration kept in nanoseconds, no
 * management frames; ③ three runs on the old laptop's frames.
 *
 * 2026-11-11 (W7a): Address 3 now follows Table 9-60, the sequence numbers come from
 * the Table 10-5 spaces and the receiver filters duplicates by <TA, TID, SN> and the
 * Retry bit (§10.3.2.14.3), so those three ② rows are faithful. No figure moved.
 *
 * Every figure the lesson prints is read back out of its text and compared
 * with a run in tests/course/frame-anatomy.test.ts.
 */
import { FCS_BYTES, MAC_HDR_BYTES, QOS_HDR_BYTES } from '../../engine/phy'
import type { TLRecord } from '../../model/records'
import type { FieldsSpec, StackSpec } from '../diagram'
import { J, node, oneRoom, sc, txOf, type Lesson } from '../lessonKit'

/**
 * A router and three very different clients in one room, so the first 21 ms
 * hold one of every frame the lesson dissects: an 802.11a laptop uploading
 * plain Data frames, a Wi-Fi 6 phone on a voice call (EDCA only, so single QoS
 * Data frames in both directions) and a Wi-Fi 5 laptop whose cloud backup goes
 * out in RTS-protected A-MPDUs answered by BlockAcks. Seed 29 keeps each first
 * frame clear of collisions, so the first A-MPDU is a first transmission.
 */
export function frameAnatomyScenario() {
  return sc(oneRoom(), [
    node('ap', 'Router', 'ap', 5, 4, 'eht', 'idle'),
    node('sta-1', 'Old laptop', 'sta', 3, 3, 'nonht', 'saturated'),
    node('sta-2', 'Phone', 'sta', 7, 5, 'he', 'voice', { edca: true }),
    node('sta-3', 'Laptop', 'sta', 6.5, 2.5, 'vht', 'backup'),
  ], { rtsThresholdBytes: 2000, seed: 29 })
}

export const firstLegacyData = txOf((r) => r.frame.kind === 'data' && r.frame.src === 'sta-1')
export const firstQosSingle = txOf((r) => r.frame.kind === 'data' && !r.frame.ampdu && r.frame.src !== 'sta-1')
export const firstRtsFrame = txOf((r) => r.frame.kind === 'rts')
export const firstAmpduFrame = txOf((r) => r.frame.ampdu !== undefined)
export const firstBlockAck = txOf((r) => r.frame.kind === 'ba')
export const firstLegacyRetry = (r: TLRecord): boolean =>
  r.type === 'TX_START' && r.frame.kind === 'data' && r.frame.src === 'sta-1' && r.frame.retryFlag === true


/** The old laptop's payload, in octets: every one of its arrivals carries this many. */
export const FA_PAYLOAD_BYTES = 1500
/** What the MAC makes of it: the header and the check are the engine's own constants. */
export const FA_FRAME_BYTES = MAC_HDR_BYTES + FA_PAYLOAD_BYTES + FCS_BYTES
/** What that frame costs on the air at 54 Mb/s, in microseconds: the run's `frame.txTimeNs`. */
export const FA_PPDU_US = 248

/**
 * The 24 octets of a plain Data header, field by field, drawn to the octet.
 * The sizes are the decoder's own (`dataMpdu` in src/model/frameFields.ts) and
 * the test reads each one back out of this spec and compares it with the
 * decoded first frame of the run, so a box that drifts fails the suite.
 */
export function frameAnatomyHeaderFields(): FieldsSpec {
  return {
    kind: 'fields',
    unit: 'B',
    fields: [
      { label: '帧控制', size: 2 },
      { label: '持续时间', size: 2 },
      { label: '地址 1', size: 6 },
      { label: '地址 2', size: 6 },
      { label: '地址 3', size: 6 },
      { label: '序列控制', size: 2 },
    ],
    total: `帧头 ${MAC_HDR_BYTES} B；带标记的帧多 2 B，共 ${QOS_HDR_BYTES} B`,
  }
}

/**
 * What wraps what, on this lesson's own frame. Not one figure here is typed
 * twice: the header and the check come from `engine/phy`, the payload and the
 * airtime from the recorded run, the overhead is arithmetic over those two.
 *
 * It arrives from `roles-stack`, where the same picture stood one lesson too
 * early; there it was built on a phone's 1400 B payload, here on the old
 * laptop's 1500 B one, which is the frame this lesson takes apart.
 */
export function frameAnatomyStack(): StackSpec {
  const overhead = FA_FRAME_BYTES - FA_PAYLOAD_BYTES
  return {
    kind: 'stack',
    mode: 'nested',
    label: '同一份载荷，三层封装',
    layers: [
      {
        label: '空口上传送的分组（PPDU）',
        bytes: FA_FRAME_BYTES,
        note: `前导码（preamble）在前，54 Mb/s 下共 ${FA_PPDU_US} µs`,
      },
      {
        label: `MAC 生成的帧 ${FA_FRAME_BYTES} B（MPDU）`,
        bytes: FA_FRAME_BYTES,
        note: `${MAC_HDR_BYTES} B 头 + ${FA_PAYLOAD_BYTES} B 载荷 + ${FCS_BYTES} B 校验`,
      },
      {
        label: `上层交下来的载荷 ${FA_PAYLOAD_BYTES} B（MSDU）`,
        bytes: FA_PAYLOAD_BYTES,
        note: '旧笔记本上传的每一份载荷都是这个大小',
      },
    ],
    total: `封装共 ${overhead} B，占载荷的 ${((overhead / FA_PAYLOAD_BYTES) * 100).toFixed(1)} %`,
  }
}


export const frameAnatomy: Lesson = {
  id: 'frame-anatomy',
  module: 2,
  title: '一帧在数据之前包含哪些内容',
  why: '一帧并不只是在数据外面加一个标签。媒体访问控制（medium access control, MAC）在上层交下来的载荷（payload）前面加上帧头（MAC header），后面加上四个字节的帧校验序列（frame check sequence, FCS），构成一帧；物理层（physical layer, PHY）再在最前面加上一段前导码（preamble），然后才送到空口上发送。对于旧笔记本一个满载的数据帧（data frame），帧头和校验合起来还不到载荷的百分之二。IEEE 802.11-2024 §9.2.3 规定了这些字段的固定顺序，也就是接收端做出判断的顺序：帧控制（Frame Control）首先指明这是哪一类帧，以及这一帧是发往还是来自分发系统（distribution system, DS）；持续时间（Duration/ID）指明这一帧结束后信道还要被占用多久——对单独一个数据帧，就是一个短帧间间隔（short interframe space, SIFS）加上随后的确认帧（acknowledgement, ACK）；接着是三个地址：地址 1（Address 1）是必须接收这一帧的那台射频，地址 2 是发出它的那台，地址 3 按传送方向是这份载荷的源或目的；最后是序列控制（Sequence Control）：重发时序号（sequence number）不变，并把重发比特（Retry bit）置 1，接收端依据这两项识别重复帧。本仿真器按标准的字段与长度生成每一帧，但只记录字节数，不生成真实的比特；地址、序号与重发比特都按标准填写，接收端也依据序号与重发比特识别重复帧。',
  outcomes: [
    '按标准说出帧头的字段顺序、各字段的长度与作用',
    '判断哪个地址对应必须接收的射频，哪个对应载荷的源或目的',
    '读出持续时间字段为哪一部分交互预留了时间，以及重发时序号与重发比特怎样变化',
    '分清本仿真器的字段视图哪些照标准、哪些与标准不同',
  ],
  needs: ['roles-stack'],
  terms: [
    { term: 'MSDU', plain: '上层交给媒体访问控制的数据单元，即用户的数据分组' },
    { term: 'MPDU', plain: '两个媒体访问控制实体之间交换的单元，即一个构造完成的帧：帧头、载荷、校验' },
    { term: 'PPDU', plain: '物理层发出的完整信号：先是一段供接收端同步的前导码，然后是帧本身' },
    { term: 'FCS', plain: '帧校验序列：帧尾的四个字节，用于检验这一帧是否完好到达' },
    { term: 'CRC', plain: '计算这四个字节所用的算法' },
  ],
  standard: [
    { heading: '三层数据单元（第 3 章的定义）', text: '上层交给 MAC 的数据单元称为 MSDU（MAC service data unit）；两个 MAC 实体之间交换的单元称为 MPDU（MAC protocol data unit），也就是 MAC 帧；物理层发出的完整信号称为 PPDU（PHY protocol data unit），它在帧的前面加上前导码。' },
    { heading: '通用帧格式（§9.2.3，图 9-2）', text: 'MAC 帧的字段按固定顺序排列：帧控制、持续时间、地址 1、地址 2、地址 3、序列控制、地址 4、服务质量（quality of service, QoS）控制、HT 控制，这些构成帧头；其后是长度可变的帧体（Frame Body），最后是 4 个八位组的 FCS。帧控制、持续时间、地址 1 与 FCS 出现在每一帧中，其余字段只在某些类型的帧中出现。帧分为管理帧（management frame）、控制帧（control frame）、数据帧与扩展帧四类（表 9-1）。' },
    {
      kind: 'diagram', heading: '数据帧的帧头（图 9-2 中地址 4 与 HT 控制不出现的情形）', spec: frameAnatomyHeaderFields(),
      caption: '每个字段的八位组数照图 9-2。带 QoS 控制字段的数据帧在序列控制之后多 2 个八位组。',
    },
    { kind: 'table', heading: '帧控制字段，逐位（§9.2.4.1，图 9-3，表 9-1）', head: ['比特', '子字段', '含义'], rows: [
      ['B0–B1', '协议版本', '本标准的帧为 0。'],
      ['B2–B3', '类型', '00 管理帧，01 控制帧，10 数据帧，11 扩展帧。'],
      ['B4–B7', '子类型', 'Data 0000，QoS Data 1000；RTS 1011，CTS 1100，Ack 1101，Block Ack 1001。'],
      ['B8', 'To DS', '数据帧发往分发系统，即发往接入点（access point, AP）时为 1。'],
      ['B9', 'From DS', '数据帧来自分发系统，即由接入点发出时为 1。'],
      ['B10', '更多分片', '后面还有同一 MSDU 的分片时为 1。'],
      ['B11', '重发', '这一帧是先前某一帧的重发时为 1；接收端据此识别重复帧。'],
      ['B12', '电源管理', '发送站点的省电状态。'],
      ['B13', '更多数据', '接入点还为省电站点缓存了更多帧。'],
      ['B14', '受保护帧', '帧体已加密。'],
      ['B15', '+HTC', '帧头中带有 HT 控制字段。'],
    ] },
    { heading: '持续时间（§9.2.4.2 表 9-9，§9.2.5.1，§9.2.5.2）', text: '这个字段以微秒为单位给出本帧结束之后交互还需要的时间，取值 0 到 32 767；算出的值不是整数时向上取整。QoS 站点（station, STA）在增强型分布式信道接入（enhanced distributed channel access, EDCA）下发送一个需要立即确认的单独数据帧、且它是这次发送机会的最后一帧时，持续时间等于发送一个确认帧所需的时间加上短帧间间隔（short interframe space, SIFS）。非 QoS 站点的取值规则见 §9.3 中各类帧的规定。' },
    { kind: 'table', heading: '数据帧的地址字段（§9.2.4.3.1，§9.3.2.1 表 9-60）', head: ['To DS / From DS', '地址 1', '地址 2', '地址 3', '地址 4'], rows: [
      ['0 / 0', 'RA = DA', 'TA = SA', 'BSSID', '无'],
      ['0 / 1', 'RA = DA', 'TA = BSSID', 'SA', '无'],
      ['1 / 0', 'RA = BSSID', 'TA = SA', 'DA', '无'],
      ['1 / 1', 'RA', 'TA', 'DA', 'SA'],
    ] },
    { heading: '地址的含义（§9.2.4.3）', text: '无论帧的类型如何，地址 1 总是这一帧的接收方，地址 2（存在时）总是发送方：接收端地址（receiver address, RA）与发送端地址（transmitter address, TA）是这一跳的两端，源地址 SA 与目的地址 DA 是这份载荷本身的两端。To DS 与 From DS 都为 1 时才出现地址 4，用于 Mesh 等四地址的情形（表 9-3）。管理帧的地址 3 一般是基本服务集标识（basic service set identifier, BSSID）（§9.3.3.1）。' },
    { heading: '序列控制（§9.2.4.4，§10.3.2.14.2 表 10-5）', text: '序列控制由 4 位分片号（Fragment Number）与 12 位序号（sequence number）组成。序号由模 4096 的计数器给出：单独寻址的 QoS 数据帧按〈地址 1, 业务标识（traffic identifier, TID）〉各用一个计数器，不属于其他序号空间的帧共用一个基线计数器。一份 MSDU 的所有重发都沿用同一个序号（§9.2.4.4.3），重发时把重发比特置 1（§9.2.4.1.6）。' },
    { kind: 'steps', heading: '接收端怎样识别重复帧（§10.3.2.14.3）：逐步说明', items: [
      '收到一个数据帧，把它的序号等信息记入重复帧检测缓存。',
      '如果这一帧的重发比特为 1，就在缓存中查找相同的记录。',
      '找到相同的记录，这一帧就是重复帧，丢弃它；但仍按规定回复确认帧，因为发送端重发正是因为没有收到上一次的确认。',
    ] },
  ],
  implementation: [
    { topic: '字段顺序与长度', standard: '图 9-2', sim: '普通数据帧的帧头 24 B、QoS 数据帧的帧头 26 B、FCS 4 B，字段顺序与图 9-2 相同。', kind: 'faithful' },
    { topic: '真实的比特', standard: '帧由八位组构成，地址是 48 位的 MAC 地址（§9.2.4.3.2）', sim: '引擎只记录每一帧的字节数；“空中字段”是按帧的属性事后生成的一张表：地址一栏显示节点名，帧体只标明字节数。', kind: 'differs' },
    { topic: '帧控制中的五个子字段', standard: '更多分片、电源管理、更多数据、受保护帧、+HTC 按需置位（§9.2.4.1）', sim: '恒为 0：不分片、不省电、不加密，也没有 HT 控制字段。', kind: 'absent' },
    { topic: '持续时间的取值', standard: '单独的数据帧：一个确认帧加 SIFS（§9.2.5.2）', sim: '照此计算：16 µs 的 SIFS 加上 24 Mb/s 下 28 µs 的确认帧，写入 44 µs。', kind: 'faithful' },
    { topic: '持续时间的编码', standard: '以微秒为单位、向上取整、最大 32 767（表 9-9，§9.2.5.1）', sim: '以纳秒整数保存，不取整，也不限制最大值；本课这一帧的值恰好是整数微秒。', kind: 'differs' },
    { topic: '地址 1 与地址 2', standard: '地址 1 是接收方，地址 2 是发送方（§9.2.4.3.1）', sim: '照此填写。', kind: 'faithful' },
    { topic: '地址 3', standard: '按表 9-60：发往接入点的帧为 DA，由接入点发出的帧为 SA', sim: '照此填写：发往接入点的帧填这份载荷的最终目的地，由接入点发出的帧填它的原始发送方。旧笔记本的业务以接入点为终点，所以这一帧的地址 3 是路由器。', kind: 'faithful' },
    { topic: '地址 4', standard: 'To DS 与 From DS 都为 1 时出现（表 9-3）', sim: '不会出现：一个场景只有一个接入点，没有 Mesh 或四地址的帧。', kind: 'absent' },
    { topic: '序号计数器', standard: 'QoS 数据帧按〈地址 1, TID〉，其他帧共用一个基线计数器（表 10-5）', sim: '照此：QoS 数据帧按〈地址 1, TID〉各用一个模 4096 计数器，非 QoS 数据帧共用一个基线计数器。每个接入类别（access category, AC）只写一个 TID。', kind: 'faithful' },
    { topic: '重发时的序号', standard: '序号不变，重发比特置 1（§9.2.4.4.3，§9.2.4.1.6）', sim: '照此写入。', kind: 'faithful' },
    { topic: '重复帧的识别', standard: '依据序号与重发比特查缓存（§10.3.2.14.3）', sim: '照此：接收端按〈发送端地址, TID, 序号〉记录收到的帧，重发比特为 1 且记录中已有相同的一项就丢弃，但仍回复确认；每个〈发送端地址, TID〉保留最近 64 个序号。', kind: 'faithful' },
    { topic: '管理帧', standard: '信标（Beacon）、Probe Request、认证、关联等（表 9-1）', sim: '未实现：每个站点从一开始就已关联。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '旧笔记本的第一帧',
      jump: 0,
      steps: [
        '载入本课场景，跳到旧笔记本的第一帧（0 µs）。',
        '展开“空中字段”，对照下表逐个读出字段的长度与内容。',
      ],
      blocks: [
        {
          kind: 'diagram', heading: '同一份载荷，三层封装', spec: frameAnatomyStack(),
          caption: '1500 B 的载荷，外面 24 B 的帧头与 4 B 的 FCS，共 1528 B。最外层的前导码增加的是时间，而不是字节，在《一帧在空口上占用多长时间》里计算。',
        },
        { kind: 'table', heading: '旧笔记本第一帧的字段', head: ['字段', '字节', '这一帧的内容'], rows: [
          ['帧控制', '2', '类型 10（数据帧），子类型 0000（Data），To DS 1，From DS 0，重发比特 0'],
          ['持续时间', '2', '44 µs'],
          ['地址 1', '6', '路由器'],
          ['地址 2', '6', '旧笔记本'],
          ['地址 3', '6', '路由器'],
          ['序列控制', '2', '序号 0，分片号 0'],
          ['帧体', '1500', '上层交下来的载荷'],
          ['FCS', '4', '只计入长度'],
        ] },
      ],
      expect: '帧头 24 B，加上 1500 B 的载荷与 4 B 的 FCS，共 1528 B；以 54 Mb/s 发送，空口时间（airtime）248 µs。持续时间 44 µs，正是 16 µs 的 SIFS 加上 24 Mb/s 下 28 µs 的确认帧。',
      meaning: '字段的顺序与长度照图 9-2，持续时间照 §9.2.5.2 只覆盖随后的确认帧（①）。这张字段表是按帧的属性生成的，不是真实的比特序列（②）。',
    },
    {
      heading: '一次重发',
      jump: 1,
      steps: [
        '跳到旧笔记本的第一次重发（12.013 ms），展开“空中字段”，读出序列控制与重发比特。',
        '回到 11.650 ms 处同一序号的原帧再读一次，并查看它之后的碰撞记录与旧笔记本的确认超时。',
      ],
      blocks: [
        { kind: 'table', heading: '同一份载荷的两次发送', head: ['发送时刻', '序号', '重发比特', '结果'], rows: [
          ['11.650 ms', '11', '0', '与笔记本的请求发送（request to send, RTS）帧同时开始发送，发生碰撞；没有确认帧'],
          ['12.013 ms', '11', '1', '收到确认帧'],
        ] },
      ],
      expect: '原帧与笔记本的请求发送（request to send, RTS）帧同时开始发送，路由器两路都没能接收，没有回复确认帧；重发的那一帧沿用序号 11，重发比特置 1。',
      meaning: '序号不变、重发比特置 1 照 §9.2.4.4.3 与 §9.2.4.1.6（①）。接收端依据这两项丢弃重复帧，本仿真器的接收端也照此去重（②）。',
    },
    {
      heading: '地址表示角色，而不是位置',
      steps: [
        '在编辑器里把路由器移到 (3, 3)、旧笔记本移到 (5, 4)，即对调两者的位置，再载入。',
        '跳到旧笔记本的第一帧，读出地址 1、地址 2、持续时间与整帧的字节数。',
      ],
      expect: '地址 1 仍是路由器，地址 2 仍是旧笔记本，持续时间仍是 44 µs，整帧仍是 1528 B。',
      meaning: '地址 1 是接收方、地址 2 是发送方（§9.2.4.3.1），与设备在哪里无关（①）。',
    },
  ],
  sources: [
    'IEEE Std 802.11-2024：第 3 章（MSDU、MPDU、PPDU 的定义）、§9.2.3 与图 9-2（通用帧格式）、§9.2.4.1 与图 9-3、表 9-1（帧控制、类型与子类型）、§9.2.4.1.6（重发子字段）、§9.2.4.2 与表 9-9（持续时间的编码）、§9.2.5.1 与 §9.2.5.2（QoS 站点的持续时间取值）、§9.2.4.3 与 §9.3.2.1、表 9-60（地址字段）、表 9-3（To DS / From DS）、§9.3.3.1（管理帧的地址）、§9.2.4.4（序列控制）、§10.3.2.14 与表 10-5（序号空间与重复帧的识别）。',
    '本仿真器的取值与取法：只记录字节数、按帧的属性生成字段视图（src/model/frameFields.ts）；帧控制中的五个子字段恒为 0；持续时间以纳秒保存；每个〈发送端地址, TID〉保留最近 64 个序号用于去重（src/engine/queues.ts）。44 µs、248 µs 与各个时刻都是本课场景的实测值。',
  ],
  limits: [],
  scenario: frameAnatomyScenario,
  jumps: [
    J('第一个传统数据帧', firstLegacyData),
    J('第一次重发（重发比特 = 1）', firstLegacyRetry),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '一个站点向它的接入点发送一个数据帧。哪个地址指的是必须接收这一帧的那台射频？',
      options: [
        '地址 1，也就是接入点',
        '地址 2，也就是站点自己',
        '地址 3，也就是这份载荷的目的',
      ],
      answer: 0,
      explain: '§9.2.4.3.1：地址 1 总是这一帧的接收方；站点发往接入点时就是接入点，它同时也是基本服务集标识（BSSID）。按表 9-60，地址 3 是这份载荷的目的 DA。',
    },
    {
      q: '一个单独的数据帧在持续时间字段里写了 44 µs。它保护的是什么？',
      options: [
        '这一帧自己占用的空口时间（airtime）',
        '发送端开始发送之前的那段等待',
        '帧之后的部分：先是一个短帧间间隔，然后是确认帧',
      ],
      answer: 2,
      explain: '§9.2.5.2：单独的数据帧，持续时间是一个确认帧加上 SIFS，从这一帧结束时算起。',
    },
    {
      q: '哪一项是本仿真器与标准不同之处？',
      options: [
        '地址 1 填写这一帧的接收方',
        '“空中字段”是按帧的属性生成的表，地址一栏显示节点名，而不是 48 位的 MAC 地址',
        '重发时序号不变，重发比特置 1',
      ],
      answer: 1,
      explain: '另外两项照标准（①）；引擎只记录字节数，不生成真实的比特（②）。',
    },
  ],
}
