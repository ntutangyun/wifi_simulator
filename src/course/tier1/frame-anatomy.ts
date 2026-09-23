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
import { N, J, node, oneRoom, sc, txOf, type Lesson } from '../lessonKit'

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
  title: { en: 'What a frame says before it says anything', zh: '一帧在开口之前先说了什么' },
  why: {
    en: 'A frame is not your data with a label stuck on it. In front of the data sits a small run of fields: what kind of frame this is, which radio must catch it, who sent it, how much longer the room is spoken for, and where it sits in a numbered run. Nearly everything a network decides, it decides from those.',
    zh: '一帧并不是“你的数据外面贴了张标签”。数据前面有一小串字段：这是哪一类帧、哪台射频必须接住它、是谁发的、这个房间还要被占用多久、以及它在一串编号里排第几。网络所做的几乎每一个决定，依据的都是它们。',
  },
  outcomes: [
    { en: 'read the header of any frame in the simulator and say what kind it is', zh: '读懂仿真里任意一帧的帧头，说出它是哪一类' },
    { en: 'work out which address must answer and which is the far end', zh: '判断哪个地址必须作答，哪个才是远端' },
    { en: 'say what the four bytes at the end do, and what happens when they disagree', zh: '说出帧尾那四个字节的作用，以及对不上时会怎样' },
    { en: 'tell a plain data frame from one carrying a traffic mark', zh: '把普通数据帧和带业务标记的数据帧区分开' },
  ],
  needs: ['roles-stack'],
  terms: [
    { term: 'MSDU', plain: {
      en: 'your packet, as the layer above hands it down',
      zh: '上层交下来的那份载荷，也就是你的数据包',
    } },
    { term: 'MPDU', plain: {
      en: 'one finished frame: header, payload, check',
      zh: '一个造好的帧：帧头、载荷、校验',
    } },
    { term: 'PPDU', plain: {
      en: 'what leaves the antenna: a pattern to lock on to, then the frame',
      zh: '离开天线的东西：先一段用来锁住的图案，然后是那个帧',
    } },
    { term: 'FCS', plain: {
      en: 'frame check sequence: the four bytes that say the frame arrived intact',
      zh: '帧校验序列：说明这一帧完好到达的那四个字节',
    } },
    { term: 'CRC', plain: {
      en: 'the arithmetic that produces those four bytes',
      zh: '算出那四个字节的那套算术',
    } },
    { term: 'QOS', plain: {
      en: 'quality of service: two header bytes naming the kind of traffic',
      zh: '服务质量：帧头里说明业务类别的那两个字节',
    } },
  ],
  picture: [
    { heading: { en: 'Three wrappings, three names', zh: '三层包装，三个名字' }, text: {
      en: 'The layer above hands the MAC a payload to deliver. That payload is the MSDU. The MAC puts a header in front of it and a check behind it, and the parcel that results is the MPDU — one frame. Everything in this lesson sits inside that parcel, in front of your data.',
      zh: '上面那一层把一份载荷交给 MAC，请它送到。这份载荷就是 MSDU。MAC 在它前面加一段头、后面加一个校验，做成的这个包裹就是 MPDU——也就是一帧。这一课讲的全部内容，都在这个包裹里、在你的数据前面。',
    } },
    { heading: { en: 'And then the radio puts a front on it', zh: '再由射频给它加个前脸' }, text: {
      en: 'The frame goes down to the PHY, which cannot just start sending bytes: a receiver has to notice that something began. So the PHY puts a known pattern in front, and what leaves the antenna — pattern first, frame behind — is the PPDU. One block on the timeline is one of those.',
      zh: '帧接着交给 PHY，而 PHY 不能直接开始发字节：接收端得先察觉“有东西开始了”。所以 PHY 会在最前面放一段已知的图案；离开天线的这整个东西——先图案、后帧——就是 PPDU。时间轴上的一个块，就是其中一个。',
    } },
    { kind: 'watch', jump: 0, heading: { en: 'Open one and look', zh: '打开一帧看看' }, text: {
      en: 'Load the simulation, jump to the old laptop\'s first frame and open "Fields on the air". Every field named below is in that list, in the order the lesson takes them.',
      zh: '载入仿真，跳到旧笔记本的第一帧，展开“空中字段”。下面提到的每一个字段都在那张列表里，顺序和这一课讲的一样。',
    } },
    { heading: { en: 'The first two bytes say what this is', zh: '头两个字节先说清这是什么' }, text: {
      en: 'A receiver reads the front of the header first, so the first two bytes tell it what to do at all: which family this frame belongs to — data, control or management — and the exact kind within it. Two more bits give the direction, into the network or out of it, and one says "this is a repeat".',
      zh: '接收端最先读到的是帧头前端，所以头两个字节要让它能决定接下来做什么：这一帧属于哪一大类——数据、控制还是管理——以及在这一类里具体是哪一种。另有两个比特给出方向，是进网还是出网；还有一个比特说“这是重发的”。',
    } },
    { heading: { en: 'Who must catch it', zh: '谁必须接住它' }, text: {
      en: 'Then three addresses, six bytes each: the radio that must catch this frame and answer it, the radio that sent it, and the far end of the journey the payload is really making. Keeping them apart is what lets a message to the phone next door be addressed to the router everything goes through (the access point, AP).',
      zh: '接下来是三个地址，每个六字节：必须接住这一帧并作答的那台射频、发出它的那台射频，以及这份载荷真正要走完那段路的终点。正是把它们分开写，才使得“发给隔壁那部手机”的消息，收件人可以是大家都经过的那台路由器——接入点（AP）。',
    } },
    { heading: { en: 'How long, and which one in the run', zh: '还要多久，以及这是第几个' }, text: {
      en: 'Two small fields follow: one says how much longer the exchange needs after this frame, so the neighbours stay quiet for the answer too; the other numbers each payload, and a repeat keeps its number, which is how a duplicate is recognised.',
      zh: '随后是两个小字段：一个说明这一帧之后交互还要多久，好让邻居连回复也一并让出来；另一个给每份载荷编号，重发沿用原号——重复帧正是这样被认出来的。',
    } },
    { heading: { en: 'A check at the end', zh: '末尾的那个校验' }, text: {
      en: 'The last four bytes are the FCS, and they are not part of the message. The sender runs everything in front of them through a fixed piece of arithmetic, a CRC, and writes the result down; the receiver does the same and compares. If the two disagree it says nothing at all, and the sender sends the frame again.',
      zh: '最后四个字节是 FCS，并不属于消息本身。发送端把前面的所有内容过一遍固定的算术，也就是 CRC，把结果写下来；接收端照样算一遍再比对。两者对不上，它就什么都不说；发送端于是把这一帧再发一次。',
    } },
    { heading: { en: 'A mark for the kind of traffic', zh: '给业务类别打的那个标记' }, text: {
      en: 'A voice call and a file upload want different things from a network, so a modern client radio (a station, STA) adds two more header bytes carrying a QoS mark: which of four kinds of traffic this frame is, and how it wants to be answered. Those two bytes are the whole difference between a plain data frame and a marked one.',
      zh: '一通语音通话和一次文件上传，对网络的要求并不相同，所以现在的客户端设备——站点（STA）——会在帧头再加两个字节，写上一个 QoS 标记：这一帧属于四类业务中的哪一类，以及它希望被怎样确认。这两个字节，就是普通数据帧与带标记数据帧的全部差别。',
    } },
  ],
  numbers: [
    { kind: 'table', heading: { en: 'The header, field by field', zh: '帧头，逐个字段' }, head: [
      { en: 'Field', zh: '字段' }, { en: 'Bytes', zh: '字节' }, { en: 'What it says', zh: '它说明什么' },
    ], rows: [
      [{ en: 'Frame Control', zh: '帧控制' }, N('2'), { en: 'family, exact kind, direction, repeat flag, nine more bits', zh: '大类、具体类型、方向、重发标志，另有九个比特' }],
      [{ en: 'Duration', zh: '持续时间' }, N('2'), { en: 'how many µs the exchange needs after this frame', zh: '本帧之后，这次交互还需要多少 µs' }],
      [{ en: 'Address 1', zh: '地址 1' }, N('6'), { en: 'the radio that must catch it and answer', zh: '必须接住它并作答的那台射频' }],
      [{ en: 'Address 2', zh: '地址 2' }, N('6'), { en: 'the radio that sent it', zh: '发出它的那台射频' }],
      [{ en: 'Address 3', zh: '地址 3' }, N('6'), { en: 'the far end of the payload\'s journey', zh: '这份载荷那段路程的远端' }],
      [{ en: 'Sequence Control', zh: '序列控制' }, N('2'), { en: 'a 12-bit counter, 0–4095, plus a fragment number', zh: '12 位计数器（0–4095），加分片号' }],
      [{ en: 'QoS Control', zh: 'QoS 控制' }, N('2'), { en: 'on a marked frame only: the traffic identifier (TID) and the answer policy', zh: '只有带标记的帧才有：业务标识（TID）与确认策略' }],
      [{ en: 'Frame body', zh: '帧体' }, { en: 'the payload', zh: '就是载荷' }, { en: 'the MSDU handed down', zh: '交下来的那个 MSDU' }],
      [N('FCS'), N('4'), { en: 'the CRC over header and body', zh: '对帧头与帧体算出的 CRC' }],
    ] },
    { kind: 'formula', heading: { en: 'What Duration reserves on a lone data frame', zh: '单独一个数据帧的持续时间字段保住了什么' }, text: {
      en: '16 µs of silence + a 28 µs answer = 44 µs',
      zh: '16 µs 的静默 + 28 µs 的回复 = 44 µs',
    }, note: {
      en: 'It counts from the end of the frame that carries it. The neighbours can already hear the frame; what they must not trample is the short answer that comes after it.',
      zh: '它是从携带它的这一帧结束时开始算的。邻居本来就听得见这一帧；他们不能踩到的，是紧随其后的那个短回复。',
    } },
    { kind: 'table', heading: { en: 'Which address is which, by direction', zh: '按方向看，哪个地址是谁' }, head: [
      { en: 'Direction', zh: '方向' }, { en: 'Address 1', zh: '地址 1' }, { en: 'Address 2', zh: '地址 2' }, { en: 'Address 3', zh: '地址 3' },
    ], rows: [
      [{ en: 'Station → access point', zh: '站点 → 接入点' }, N('RA = BSSID'), N('TA = SA'), N('DA')],
      [{ en: 'Access point → station', zh: '接入点 → 站点' }, N('RA = DA'), N('TA = BSSID'), N('SA')],
      [{ en: 'Neither, or management', zh: '两者皆非，或管理帧' }, N('RA = DA'), N('TA = SA'), N('BSSID')],
    ] },
    { text: {
      en: 'RA (the radio that must answer) and TA (the one that sent it) are the two ends of this hop; SA (the source) and DA (the destination) are the two ends of the payload\'s own journey. This room has no server behind the router, so an uplink frame names the router in all three.',
      zh: 'RA（必须作答的那台射频）与 TA（发出它的那台）是这一跳的两头；SA（源）与 DA（目的）则是这份载荷自己那段路程的两头。这个房间里路由器背后没有服务器，所以上行帧的三个地址指的都是路由器。',
    } },
    { kind: 'table', heading: { en: 'Four kinds of traffic, four marks', zh: '四类业务，四个标记' }, head: [
      { en: 'Kind of traffic', zh: '业务类别' }, { en: 'Priorities it covers', zh: '它涵盖的优先级' }, N('TID'),
    ], rows: [
      [{ en: 'Background', zh: '背景' }, N('1, 2'), N('1')],
      [{ en: 'Best effort', zh: '尽力而为' }, N('0, 3'), N('0')],
      [{ en: 'Video', zh: '视频' }, N('4, 5'), N('5')],
      [{ en: 'Voice', zh: '语音' }, N('6, 7'), N('6')],
    ] },
    { text: {
      en: 'The numbers are names, not an order: background is 1 and best effort is 0, yet background is the one that yields. The phone in this room is on a call, so its frames are marked 6.',
      zh: '这些数字是名字，不是次序：背景是 1、尽力而为是 0，可该让路的偏偏是背景。这个房间里的手机正在通话，所以它的帧标的是 6。',
    } },
    { kind: 'steps', heading: { en: 'Building one frame, step by step', zh: '造出一帧，一步一步来' }, items: [
      { en: 'Choose the kind: a plain Data frame, or QoS Data when both ends mark their traffic. That choice is the first two bytes — the family, and the exact kind within it.',
        zh: '先定这是哪一种：普通 Data 帧；两端都给业务打标记时，则是 QoS Data 帧。这个选择写在头两个字节里——大类，以及类里具体的那一种。' },
      { en: 'Set the two direction bits in those same bytes from who is sending to whom: going up to the access point they read 1 and 0, coming back down 0 and 1.',
        zh: '在同样这两个字节里，按“谁发给谁”置好两个方向比特：上行发往接入点是 1 和 0，下行回来是 0 和 1。' },
      { en: 'Write the Duration: what is still to come after this frame. For a lone data frame that is the silence and the answer, 16 + 28 = 44 µs.',
        zh: '写入持续时间：这一帧之后还要发生的事情。对单独一个数据帧来说，就是那段静默加上那个回复，16 + 28 = 44 µs。' },
      { en: 'Fill the three addresses from those two bits. Going up, Address 1 is the access point (RA), Address 2 the radio that sent it (TA), Address 3 the far end of the journey (DA).',
        zh: '按那两个比特填三个地址。上行时，地址 1 是接入点（RA），地址 2 是发出这一帧的射频（TA），地址 3 是这段路程的远端（DA）。' },
      { en: 'Number the payload: a counter per peer and per traffic class gives out the next value on the first attempt only, so a repeat carries the same number with the repeat bit set.',
        zh: '给载荷编号：每个对端、每个业务类别各有一个计数器，只在第一次发送时取下一个值；重发沿用同一个号，并把重发比特置 1。' },
      { en: 'A marked frame adds two more header bytes here, the traffic identifier and the answer policy. Then the payload, and last the FCS over everything in front of it: 24 + 1500 + 4 = 1528 B.',
        zh: '带标记的帧在这里再加两个字节：业务标识和确认策略。然后是载荷，最后是对它前面所有内容算出的 FCS：24 + 1500 + 4 = 1528 B。' },
    ] },
    { kind: 'table', heading: { en: 'The old laptop\'s first frame, built that way', zh: '旧笔记本的第一帧，就是这么造出来的' }, head: [
      { en: 'Step', zh: '步骤' }, { en: 'What it writes', zh: '它写进去的' },
    ], rows: [
      [{ en: 'Kind', zh: '种类' }, { en: 'Data, no QoS Control', zh: 'Data，没有 QoS 控制字段' }],
      [{ en: 'Direction bits', zh: '方向比特' }, N('1 / 0')],
      [{ en: 'Duration', zh: '持续时间' }, N('44 µs')],
      [{ en: 'Address 1, 2, 3', zh: '地址 1、2、3' }, { en: 'Router, Old laptop, Router', zh: '路由器、旧笔记本、路由器' }],
      [{ en: 'Sequence Control', zh: '序列控制' }, { en: 'counter 0, fragment 0', zh: '计数 0，分片 0' }],
      [{ en: 'Bytes on the air', zh: '空口上的字节' }, N('24 + 1500 + 4 = 1528 B')],
    ] },
  ],
  deeper: [
    { kind: 'table', heading: { en: 'Frame Control, bit by bit', zh: '帧控制，逐位拆解' }, head: [
      { en: 'Bits', zh: '比特' }, { en: 'Subfield', zh: '子字段' }, { en: 'What it says', zh: '含义' },
    ], rows: [
      [N('B0–B1'), { en: 'Protocol Version', zh: '协议版本' }, { en: 'Always 0.', zh: '恒为 0。' }],
      [N('B2–B3'), { en: 'Type', zh: '类型' }, { en: '00 management, 01 control, 10 data, 11 extension.', zh: '00 管理帧，01 控制帧，10 数据帧，11 扩展帧。' }],
      [N('B4–B7'), { en: 'Subtype', zh: '子类型' }, { en: 'Data 0000, QoS Data 1000; RTS 1011, CTS 1100, Ack 1101, Block Ack 1001.', zh: 'Data 0000，QoS Data 1000；RTS 1011，CTS 1100，Ack 1101，Block Ack 1001。' }],
      [N('B8'), N('To DS'), { en: '1: the frame is going into the distribution system (towards the AP).', zh: '1：帧正进入分发系统（发往 AP）。' }],
      [N('B9'), N('From DS'), { en: '1: the frame is coming out of it (sent by the AP).', zh: '1：帧来自分发系统（由 AP 发出）。' }],
      [N('B10'), { en: 'More Fragments', zh: '更多分片' }, { en: 'Another fragment of this MSDU follows.', zh: '后面还有本 MSDU 的分片。' }],
      [N('B11'), { en: 'Retry', zh: '重传' }, { en: '1 on a retransmission, so the receiver can drop a duplicate.', zh: '重传时置 1，接收方据此丢弃重复帧。' }],
      [N('B12'), { en: 'Power Management', zh: '电源管理' }, { en: 'The sender will doze after this exchange.', zh: '发送方在本次交换后将进入休眠。' }],
      [N('B13'), { en: 'More Data', zh: '更多数据' }, { en: 'The AP holds more buffered frames for a dozing station.', zh: 'AP 还为休眠站点缓存着更多帧。' }],
      [N('B14'), { en: 'Protected Frame', zh: '受保护帧' }, { en: 'The body is encrypted.', zh: '帧体已加密。' }],
      [N('B15'), N('+HTC / Order'), { en: 'A 4 B HT Control field follows the header.', zh: '头后跟着 4 B 的 HT 控制字段。' }],
    ] },
    { heading: { en: 'The fourth address', zh: '第四个地址' }, text: {
      en: 'Address 4 appears only when To DS and From DS are both 1, which is the mesh and wireless-distribution-system case: the frame is travelling between two APs, so the header must carry RA, TA, DA and SA all four, and the MAC header grows from 24 B to 30 B. A lone station never sees one.',
      zh: '只有 To DS 与 From DS 同时为 1 时才会出现地址 4，那是 Mesh 与无线分发系统的情形：帧在两台 AP 之间传送，帧头必须把 RA、TA、DA、SA 四个全带上，MAC 头也从 24 B 长到 30 B。普通站点是看不到它的。',
    } },
    { heading: { en: 'The frames this room never sends', zh: '这个房间里从不出现的帧' }, text: {
      en: 'Management frames — beacons, probes, authentication, association, type 00 — carry the full 24 B header followed by information elements rather than an MSDU, and they are how a BSS comes into existence in the first place. The simulator does not send them yet: every station here starts associated, and a module on the link lifecycle will build them.',
      zh: '管理帧——信标、探测、认证、关联，类型 00——带的是完整的 24 B 帧头，后面跟的是信息元素而不是 MSDU；BSS 一开始能建立起来，靠的正是它们。仿真器目前还不发送管理帧：这里每个站点一开始就已关联，讲链路生命周期的模块会把它们补上。',
    } },
  ],
  sources: [
    { en: 'The MAC header and its fields are IEEE Std 802.11-2024 §9.2.4: Frame Control §9.2.4.1, Duration/ID §9.2.4.2, the addresses §9.2.4.3, Sequence Control §9.2.4.4, QoS Control §9.2.4.5, the FCS §9.2.4.7. The address roles per To DS / From DS are Table 9-30.',
      zh: 'MAC 头及其字段见 IEEE Std 802.11-2024 §9.2.4：帧控制 §9.2.4.1、持续时间/ID §9.2.4.2、地址 §9.2.4.3、序列控制 §9.2.4.4、QoS 控制 §9.2.4.5、FCS §9.2.4.7。按 To DS / From DS 划分的地址角色见表 9-30。' },
    { en: 'The FCS is a CRC-32 over the header and the frame body. The mapping of user priorities to access categories, and the TID each one is written with, is Table 10-1; the values this simulator writes are background 1, best effort 0, video 5, voice 6.',
      zh: 'FCS 是对帧头与帧体计算的 CRC-32。用户优先级到接入类别的映射、以及各自写入的 TID，见表 10-1；本仿真器写入的取值是：背景 1、尽力而为 0、视频 5、语音 6。' },
    { en: 'The 44 µs a lone data frame reserves is 16 µs plus the 28 µs its answer takes at 24 Mb/s in this scenario — a measured value of this simulation, not a constant of the standard.',
      zh: '单独一个数据帧预留的 44 µs，是 16 µs 加上本场景中回复在 24 Mb/s 下所占的 28 µs——这是本仿真的实测值，不是标准里的常数。' },
  ],
  scenario: frameAnatomyScenario,
  jumps: [
    J('first legacy data frame', '第一个传统数据帧', firstLegacyData),
    J('first QoS data frame', '第一个 QoS 数据帧', firstQosSingle),
    J('first retransmission (Retry = 1)', '第一次重传（Retry = 1）', firstLegacyRetry),
  ],
  observe: [
    {
      en: 'Jump to the old laptop\'s first frame, at 0 µs, then to the first QoS data frame, at 20.452 ms, opening "Fields on the air" on each. Same direction, same address roles, Duration 44 µs — but the second has a QoS Control field whose traffic identifier (TID) reads 6.',
      zh: '跳到旧笔记本的第一帧（0 µs），再跳到第一个 QoS 数据帧（20.452 ms），各自展开“空中字段”。方向相同，地址角色相同，持续时间都是 44 µs——但后者多了一个 QoS 控制字段，它的业务标识（TID）写着 6。',
    },
    {
      en: 'Jump to the first retransmission, at 12.013 ms. The old laptop\'s frame collided, so it goes again with the repeat bit set and the same counter value, 11. Find the original at 11.650 ms: same number, repeat bit clear.',
      zh: '跳到第一次重传（12.013 ms）。旧笔记本的那一帧撞了，于是带着置位的重发比特、以及同一个计数值 11 再发一次。回头找 11.650 ms 的原帧：号码相同，重发比特是 0。',
    },
  ],
  tryThis: [
    {
      en: 'Open the scenario in the editor and turn the phone\'s quality-of-service marking (EDCA) off. Its frames become plain Data frames: the QoS Control field is gone, and with it the traffic mark.',
      zh: '在编辑器里打开本场景，把手机的服务质量标记（EDCA）关掉。它的帧变成普通 Data 帧：QoS 控制字段没有了，业务标记也跟着没有了。',
    },
    {
      en: 'Change the old laptop to Wi-Fi 5. Its uploads are marked frames now, and the mark reads 0 — best effort, because a backup is not a call. Nothing else about the header moves.',
      zh: '把旧笔记本改成 Wi-Fi 5。它的上传现在是带标记的帧了，标记写的是 0——尽力而为，因为备份不是通话。帧头的其他部分则纹丝不动。',
    },
  ],
  quiz: [
    {
      q: { en: 'A station sends a data frame to its access point. Which address names the radio that must answer?', zh: '一个站点向它的接入点发送一个数据帧。哪个地址指的是必须作答的那台射频？' },
      options: [
        { en: 'Address 1, the access point', zh: '地址 1，也就是接入点' },
        { en: 'Address 2, the station itself', zh: '地址 2，也就是站点自己' },
        { en: 'Address 3, the far end of the journey', zh: '地址 3，也就是这段路程的远端' },
      ],
      answer: 0,
      explain: { en: 'Address 1 is always the radio that must catch the frame; going uphill that is the access point, which is also the BSSID. Address 3 is where the payload is really headed.', zh: '地址 1 永远是必须接住这一帧的那台射频；朝上走时那就是接入点，它同时也是 BSSID。地址 3 才是这份载荷真正要去的地方。' },
    },
    {
      q: { en: 'A frame arrives and the receiver\'s arithmetic does not match the four bytes at the end. What does it do?', zh: '一帧到了，接收端算出来的结果和帧尾那四个字节对不上。它会怎么做？' },
      options: [
        { en: 'Answers anyway, and lets the layer above notice', zh: '照样作答，让上层自己去发现' },
        { en: 'Sends back a complaint naming the damaged field', zh: '回一条抱怨，指明是哪个字段坏了' },
        { en: 'Nothing at all — and the sender, hearing no answer, sends it again', zh: '什么也不做——发送端等不到回复，就会再发一次' },
      ],
      answer: 2,
      explain: { en: 'A damaged frame may have a damaged address too, so answering it would be guesswork. Silence is the whole mechanism: no answer means resend.', zh: '一个坏掉的帧，地址也可能是坏的，回它就成了瞎猜。沉默本身就是全部机制：没有回复，就重发。' },
    },
    {
      q: { en: 'A lone data frame writes 44 µs into its Duration field. What is that protecting?', zh: '一个单独的数据帧在持续时间字段里写了 44 µs。它保护的是什么？' },
      options: [
        { en: 'The airtime of the frame itself', zh: '这一帧自己占用的空口时间' },
        { en: 'The wait the sender counted down before starting', zh: '发送端开始之前数完的那段等待' },
        { en: 'What comes after the frame: the short gap, then the answer', zh: '帧之后的那部分：先是短暂的间隔，然后是回复' },
      ],
      answer: 2,
      explain: { en: 'Duration counts from the end of the frame carrying it. The neighbours can hear the frame already; the answer is the part they cannot see coming, so it is the part reserved.', zh: '持续时间从携带它的那一帧结束时算起。邻居本来就听得见这一帧；他们预料不到的是那个回复，所以要预留的正是它。' },
    },
  ],
}
