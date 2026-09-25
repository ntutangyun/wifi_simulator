/**
 * Wi-Fi Tier 1 · M1 · lesson 4: the header of a frame. What the first two
 * bytes say, whom the addresses name, how long the room is spoken for, where
 * the frame sits in a numbered run, and what the four bytes at the end are for.
 *
 * Written to the zero-to-hero contract
 * (docs/superpowers/specs/2026-09-21-course-readability-design.md). The old
 * lesson was 1 542 words and carried two ideas a reader wants to stop between,
 * so it is split per the spec's table: this half keeps the header, the
 * addresses and what each field is for, and `frame-anatomy-bytes` takes the
 * byte budget, the decoder and the aggregation hooks. The second half loads
 * this lesson's own scene, so the split adds no scenario.
 *
 * The bit-by-bit breakdown of Frame Control, the mesh four-address case and
 * the management frames are in `deeper`; the clause numbers are in `sources`.
 *
 * Amendment of 2026-09-23: `numbers` closes with the order the MAC actually
 * builds a frame in — kind, direction bits, Duration, addresses, sequence
 * number, then the QoS bytes, the body and the FCS — which is
 * `buildDataFrame` (src/engine/mac.ts) followed by `dataMpdu`
 * (src/model/frameFields.ts), and a table running it on the old laptop's
 * first frame.
 *
 * Every number quoted below is pinned in tests/course/frame-anatomy.test.ts.
 */
import type { TLRecord } from '../../model/records'
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

export const frameAnatomy: Lesson = {
  id: 'frame-anatomy',
  module: 0,
  title: '一帧在开口之前先说了什么',
  why: '一帧并不是“你的数据外面贴了张标签”。数据前面有一小串字段：这是哪一类帧、哪台射频必须接住它、是谁发的、这个房间还要被占用多久、以及它在一串编号里排第几。网络所做的几乎每一个决定，依据的都是它们。',
  outcomes: [
    '读懂仿真里任意一帧的帧头，说出它是哪一类',
    '判断哪个地址必须作答，哪个才是远端',
    '说出帧尾那四个字节是干什么的，以及一帧没能收下来时会怎样',
    '把普通数据帧和带业务标记的数据帧区分开',
  ],
  needs: ['roles-stack'],
  terms: [
    { term: 'MSDU', plain: '上层交下来的那份载荷，也就是你的数据包' },
    { term: 'MPDU', plain: '一个造好的帧：帧头、载荷、校验' },
    { term: 'PPDU', plain: '离开天线的东西：先一段用来锁住的图案，然后是那个帧' },
    { term: 'FCS', plain: '帧校验序列：说明这一帧完好到达的那四个字节' },
    { term: 'CRC', plain: '算出那四个字节的那套算术' },
    { term: 'QOS', plain: '服务质量：帧头里说明业务类别的那两个字节' },
  ],
  picture: [
    { heading: '三层包装，三个名字', text: '上面那一层把一份载荷交给 MAC——射频里负责加头、写地址的那一部分。这份载荷就是 MSDU。MAC 在它前面加一段头、后面加一个校验，做成的这个包裹就是 MPDU——也就是一帧。这一课讲的全部内容，都在这个包裹里、在你的数据前面。' },
    { heading: '再由射频在它前面加一段图案', text: '帧接着交给 PHY——射频里把它变成信号的那一部分——而 PHY 不能直接开始发字节：接收端得先察觉“有东西开始了”。所以 PHY 会在最前面放一段已知的图案；离开天线的这整个东西——先图案、后帧——就是 PPDU。时间轴上的一个块，就是其中一个。' },
    { kind: 'watch', jump: 0, heading: '打开一帧看看', text: '载入仿真，跳到旧笔记本的第一帧，展开“空中字段”。下面提到的每一个字段都在那张列表里，顺序和这一课讲的一样。' },
    { heading: '头两个字节先说清这是什么', text: '接收端最先读到的是帧头前端，所以头两个字节要让它能决定接下来做什么：这一帧属于哪一大类——数据、控制还是管理——以及在这一类里具体是哪一种。另有两个比特给出方向，是进网还是出网；还有一个比特说“这是重发的”。' },
    { heading: '谁必须接住它', text: '接下来是三个地址，每个六字节：必须接住这一帧并作答的那台射频、发出它的那台射频，以及这份载荷真正要走完那段路的终点。正是把它们分开写，才使得“发给隔壁那部手机”的消息，收件人可以是大家都经过的那台路由器——接入点（AP）。' },
    { heading: '还要多久，以及这是第几个', text: '随后是两个小字段：一个说明这一帧之后交互还要多久，好让邻居连回复也一并让出来；另一个给每份载荷编号，重发沿用原号——重复帧正是这样被认出来的。' },
    { heading: '末尾的那个校验', text: '末尾的那四个字节就是 FCS。在标准里，接收端拿它来检验这一帧：发送端把前面所有内容过一遍固定的算术，也就是 CRC，接收端照样算一遍再比对。本仿真器从不去算它——这里判定一次接收成不成的，是这一帧到达时的比值：整帧都要够它那一级的要求。不论哪条路，没能收下来的帧得到的回应都是什么都没有，发送端于是把它再发一次。' },
    { heading: '给业务类别打的那个标记', text: '一通语音通话和一次文件上传，对网络的要求并不相同，所以现在的客户端设备——站点（STA）——会在帧头再加两个字节，写上一个业务标记（QoS 字段）：这一帧属于四类业务中的哪一类，以及它希望被怎样确认。这两个字节，就是普通数据帧与带标记数据帧的全部差别。' },
  ],
  numbers: [
    { kind: 'table', heading: '帧头，逐个字段', head: [
      '字段', '字节', '它说明什么',
    ], rows: [
      ['帧控制', '2', '大类、具体类型、方向、重发标志，另有九个比特'],
      ['持续时间', '2', '本帧之后，这次交互还需要多少 µs'],
      ['地址 1', '6', '必须接住它并作答的那台射频'],
      ['地址 2', '6', '发出它的那台射频'],
      ['地址 3', '6', '这份载荷那段路程的远端'],
      ['序列控制', '2', '12 位计数器（0–4095），加分片号'],
      ['QoS 控制', '2', '只有带标记的帧才有：业务标识（TID）与确认策略'],
      ['帧体', '就是载荷', '交下来的那个 MSDU'],
      ['FCS', '4', '对帧头与帧体算出的 CRC'],
    ] },
    { kind: 'formula', heading: '单独一个数据帧的持续时间字段保住了什么', text: '16 µs 的静默 + 28 µs 的回复 = 44 µs', note: '它是从携带它的这一帧结束时开始算的。邻居本来就听得见这一帧；他们不能踩到的，是紧随其后的那个短回复。' },
    { kind: 'table', heading: '按方向看，哪个地址是谁', head: [
      '方向', '地址 1', '地址 2', '地址 3',
    ], rows: [
      ['站点 → 接入点', 'RA = BSSID', 'TA = SA', 'DA'],
      ['接入点 → 站点', 'RA = DA', 'TA = BSSID', 'SA'],
      ['两者皆非，或管理帧', 'RA = DA', 'TA = SA', 'BSSID'],
    ] },
    { text: 'RA（必须作答的那台射频）与 TA（发出它的那台）是这一跳的两头；SA（源）与 DA（目的）则是这份载荷自己那段路程的两头。这个房间里路由器背后没有服务器，所以上行帧的三个地址指的都是路由器。' },
    { kind: 'table', heading: '四类业务，四个标记', head: [
      '业务类别', '它涵盖的优先级', 'TID',
    ], rows: [
      ['背景', '1, 2', '1'],
      ['尽力而为', '0, 3', '0'],
      ['视频', '4, 5', '5'],
      ['语音', '6, 7', '6'],
    ] },
    { text: '这些数字是名字，不是次序：背景是 1、尽力而为是 0，可该让路的偏偏是背景。这个房间里的手机正在通话，所以它的帧标的是 6。' },
    { kind: 'steps', heading: '造出一帧，一步一步来', items: [
      '先定这是哪一种：普通 Data 帧；两端都给业务打标记时，则是 QoS Data 帧。这个选择写在头两个字节里——大类，以及类里具体的那一种。',
      '在同样这两个字节里，按“谁发给谁”置好两个方向比特：上行发往接入点是 1 和 0，下行回来是 0 和 1。',
      '写入持续时间：这一帧之后还要发生的事情。对单独一个数据帧来说，就是那段静默加上那个回复，16 + 28 = 44 µs。',
      '按那两个比特填三个地址。上行时，地址 1 是接入点（RA），地址 2 是发出这一帧的射频（TA），地址 3 是这段路程的远端（DA）。',
      '给载荷编号：每个对端、每个业务类别各有一个计数器，只在第一次发送时取下一个值；重发沿用同一个号，并把重发比特置 1。',
      '带标记的帧在这里再加两个字节：业务标识和确认策略。然后是载荷，最后是对它前面所有内容算出的 FCS：24 + 1500 + 4 = 1528 B。',
    ] },
    { kind: 'table', heading: '旧笔记本的第一帧，就是这么造出来的', head: [
      '步骤', '它写进去的',
    ], rows: [
      ['种类', 'Data，没有 QoS 控制字段'],
      ['方向比特', '1 / 0'],
      ['持续时间', '44 µs'],
      ['地址 1、2、3', '路由器、旧笔记本、路由器'],
      ['序列控制', '计数 0，分片 0'],
      ['空口上的字节', '24 + 1500 + 4 = 1528 B'],
    ] },
  ],
  deeper: [
    { kind: 'table', heading: '帧控制，逐位拆解', head: [
      '比特', '子字段', '含义',
    ], rows: [
      ['B0–B1', '协议版本', '恒为 0。'],
      ['B2–B3', '类型', '00 管理帧，01 控制帧，10 数据帧，11 扩展帧。'],
      ['B4–B7', '子类型', 'Data 0000，QoS Data 1000；RTS 1011，CTS 1100，Ack 1101，Block Ack 1001。'],
      ['B8', 'To DS', '1：帧正进入分发系统（发往 AP）。'],
      ['B9', 'From DS', '1：帧来自分发系统（由 AP 发出）。'],
      ['B10', '更多分片', '后面还有本 MSDU 的分片。'],
      ['B11', '重传', '重传时置 1，接收方据此丢弃重复帧。'],
      ['B12', '电源管理', '发送方在本次交换后将进入休眠。'],
      ['B13', '更多数据', 'AP 还为休眠站点缓存着更多帧。'],
      ['B14', '受保护帧', '帧体已加密。'],
      ['B15', '+HTC / Order', '头后跟着 4 B 的 HT 控制字段。'],
    ] },
    { heading: '第四个地址', text: '只有 To DS 与 From DS 同时为 1 时才会出现地址 4，那是 Mesh 与无线分发系统的情形：帧在两台 AP 之间传送，帧头必须把 RA、TA、DA、SA 四个全带上，MAC 头也从 24 B 长到 30 B。普通站点是看不到它的。' },
    { heading: '这个房间里从不出现的帧', text: '管理帧——信标、探测、认证、关联，类型 00——带的是完整的 24 B 帧头，后面跟的是信息元素而不是 MSDU；BSS 一开始能建立起来，靠的正是它们。仿真器目前还不发送管理帧：这里每个站点一开始就已关联，讲链路生命周期的模块会把它们补上。' },
  ],
  sources: [
    'MAC 头及其字段见 IEEE Std 802.11-2024 §9.2.4：帧控制 §9.2.4.1、持续时间/ID §9.2.4.2、地址 §9.2.4.3、序列控制 §9.2.4.4、QoS 控制 §9.2.4.5、FCS §9.2.4.7。按 To DS / From DS 划分的地址角色见表 9-30。',
    'FCS 是对帧头与帧体计算的 CRC-32。用户优先级到接入类别的映射、以及各自写入的 TID，见表 10-1；本仿真器写入的取值是：背景 1、尽力而为 0、视频 5、语音 6。',
    '单独一个数据帧预留的 44 µs，是 16 µs 加上本场景中回复在 24 Mb/s 下所占的 28 µs——这是本仿真的实测值，不是标准里的常数。',
  ],
  scenario: frameAnatomyScenario,
  jumps: [
    J('第一个传统数据帧', firstLegacyData),
    J('第一个 QoS 数据帧', firstQosSingle),
    J('第一次重传（Retry = 1）', firstLegacyRetry),
  ],
  observe: [
    '跳到旧笔记本的第一帧（0 µs），再跳到第一个 QoS 数据帧（20.452 ms），各自展开“空中字段”。方向相同，地址角色相同，持续时间都是 44 µs——但后者多了一个 QoS 控制字段，它的业务标识（TID）写着 6。',
    '跳到第一次重传（12.013 ms）。旧笔记本的那一帧撞了，于是带着置位的重发比特、以及同一个计数值 11 再发一次。回头找 11.650 ms 的原帧：号码相同，重发比特是 0。',
  ],
  tryThis: [
    '在编辑器里打开本场景，把手机的服务质量标记（EDCA）关掉。它的帧变成普通 Data 帧：QoS 控制字段没有了，业务标记也跟着没有了。',
    '把旧笔记本改成 Wi-Fi 5。它的上传现在是带标记的帧了，标记写的是 0——尽力而为，因为备份不是通话。帧头的其他部分则纹丝不动。',
  ],
  quiz: [
    {
      q: '一个站点向它的接入点发送一个数据帧。哪个地址指的是必须作答的那台射频？',
      options: [
        '地址 1，也就是接入点',
        '地址 2，也就是站点自己',
        '地址 3，也就是这段路程的远端',
      ],
      answer: 0,
      explain: '地址 1 永远是必须接住这一帧的那台射频；朝上走时那就是接入点，它同时也是 BSSID。地址 3 才是这份载荷真正要去的地方。',
    },
    {
      q: '一帧到了，可它比周围的干扰弱得太多，接收端读不出来。它会怎么做？',
      options: [
        '照样作答，让上层自己去发现',
        '回一条抱怨，指明是哪个字段坏了',
        '什么也不做——发送端等不到回复，就会再发一次',
      ],
      answer: 2,
      explain: '没能收下来的帧，地址那几个字节也一样读不出，回它就成了瞎猜。沉默本身就是全部机制：没有回复，就重发。',
    },
    {
      q: '一个单独的数据帧在持续时间字段里写了 44 µs。它保护的是什么？',
      options: [
        '这一帧自己占用的空口时间',
        '发送端开始之前数完的那段等待',
        '帧之后的那部分：先是短暂的间隔，然后是回复',
      ],
      answer: 2,
      explain: '持续时间从携带它的那一帧结束时算起。邻居本来就听得见这一帧；他们预料不到的是那个回复，所以要预留的正是它。',
    },
  ],
}
