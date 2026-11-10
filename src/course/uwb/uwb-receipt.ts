/**
 * UWB Tier 2 · M20 多消息收妥确认, in the standard-first shape (2026-11-10).
 *
 * ① teaches IEEE Std 802.15.4-2024 §10.36: the MMRCR bit of the ARC IE (§10.32.9.1) asks for a
 * confirmation; a responder answers with an MMRCM, a frame holding one RMMRC IE whose list has one
 * element per initiator — address, bitmap length, and a bitmap with one bit per acknowledged slot
 * (§10.36.2.1, W2 brought the engine to this). ② says what this engine does, including the two
 * places it is not the standard: in many-to-many mode there is no control message to carry the
 * request (the scene sets it), and the editor refuses a two-way one-round set with the request on.
 *
 * The base scene is the many-to-many round with participant `p-3` 14 dB down: it hears both others
 * and neither hears it, so one frame carries two entries with different bits, and `p-3` reads two
 * all-zero bitmaps. The variants are the two-way round with the request on and off, one control
 * message for four rounds of one block, which is what makes the bitmap 41 bits wide there.
 *
 * Every figure the labs print is read back out of the lesson text and compared with a run in
 * tests/course/uwb-receipt.test.ts.
 */
import type { Scenario, Wall } from '../../model/scenario'
import { J, anchor, brick, firstUwbMmrcm, rangingLab, txOf, uwbSc, uwbTag, type Lesson } from '../lessonKit'
import { UWB_TX_POWER_DBM } from '../../uwb/phy'

/** Participants of the base many-to-many round. */
export const PARTICIPANTS = 3
/** Anchors of the two-way variants. */
export const ANCHORS = 3
/** `rcmValidityRounds` of the two-way variants: one control message for four rounds of one block
 * (a ranging round set never leaves its block, standard §10.32.9.1), so the tag runs that many
 * rounds a block. */
export const VALIDITY = 4
/** How far below the others `p-3` transmits, in dB: enough that nothing decodes it at these
 * distances, while its own receiver still decodes everybody at full power. */
export const QUIET_DB = 14

/** Where the three participants stand, in metres: no two pairwise distances alike. */
export const PLACES: readonly { x: number; y: number }[] = [
  { x: 1, y: 1 }, { x: 7, y: 2 }, { x: 3, y: 6 },
]

/** Participant i's id. Ids decide the slot order, so `p-1`…`p-3` is also the order the round
 * transmits in. */
export const idOf = (i: number): string => `p-${i + 1}`

/** The participant nobody hears: the last to transmit. */
export const QUIET_ID = idOf(PARTICIPANTS - 1)

/** The hall of the base scene: 20 × 16 m inside one brick shell, no partition inside it. */
function m2mHall(): { rooms: { x: number; y: number; w: number; h: number; name: string }[]; walls: Wall[] } {
  return {
    rooms: [{ x: 0, y: 0, w: 20, h: 16, name: 'Hall' }],
    walls: [brick(0, 0, 20, 0), brick(20, 0, 20, 16), brick(20, 16, 0, 16), brick(0, 16, 0, 0)],
  }
}

/**
 * The base scene: three many-to-many participants, the last of them `QUIET_DB` below the other
 * two, with the receipt request on. No excess delay, no timestamp noise — so the only reason a bit
 * is zero here is that a transmission was not decoded.
 */
export function uwbReceiptScenario(mmrcr = true, quiet = true): Scenario {
  return uwbSc(
    m2mHall(),
    PLACES.map((p, i) => {
      const n = uwbTag(idOf(i), `P${i + 1}`, p.x, p.y)
      return quiet && idOf(i) === QUIET_ID ? { ...n, txPowerDbm: UWB_TX_POWER_DBM - QUIET_DB } : n
    }),
    { mode: 'm2m', method: 'ss', nlos: false, tsNoisePs: 0, rcmValidityRounds: 1, mmrcr },
  )
}

/**
 * The two-way variant: three anchors and one tag in the 22 × 8 m hall, DS-TWR with embedded reply
 * times, and one control message for `VALIDITY` rounds of one block. `mmrcr` is the one knob the
 * two variants differ in.
 */
export function uwbReceiptTwrScenario(mmrcr = true): Scenario {
  return uwbSc(
    rangingLab(),
    [
      anchor('anchor-1', 'A1', 0.5, 0.5),
      anchor('anchor-2', 'A2', 21.5, 0.5),
      anchor('anchor-3', 'A3', 11, 7.5),
      uwbTag('uwb-1', 'Tag', 11, 4),
    ],
    { method: 'ds', replyTime: 'embedded', nlos: false, rcmValidityRounds: VALIDITY, initiatorRounds: VALIDITY, mmrcr },
  )
}

/** The quiet participant's own confirmation — the frame that answers the other two. */
const quietConfirmation = txOf((r) => r.frame.kind === 'uwbMmrcm' && r.node === QUIET_ID)

export const uwbReceipt: Lesson = {
  id: 'uwb-receipt',
  module: 22,
  title: '谁收到了我的帧',
  why: 'IEEE 802.15.4-2024 的多消息收妥确认（§10.36）回答一个发起方的问题：我发出的那几条消息，哪几条被收到了。控制器在测距控制消息的 ARC 信息单元里把 MMRCR 位置 1，请求接收方确认；这一位就在控制消息原有的控制字段里，请求本身不增加一个字节。接收方回一帧多消息收妥确认消息（MMRCM），帧里只有一个 RMMRC 信息单元：每个发起方一个列表元素，带发起方的地址、位图长度和一张位图（bitmap），位图一位对应一个被确认的时隙，收到那个时隙里发给它的消息记 1（§10.36.2.1）。两个计数要分开：列表元素按发起方计数，回复的帧按接收方计数。标准没有规定回复放在哪个时隙，可以调度也可以竞争。本仿真器照标准实现帧格式与位图，把回复放在这组轮次最后一轮测距之后、一个接收方一个时隙；回复不带任何时间量，开启请求前后算出的距离不变。本仿真器的多对多一轮没有控制消息，请求只能由场景事先设定，这一点与标准不同。基础场景里最后一台设备发射功率（transmit power）偏低，它从另外两帧回复里读到的位图全是 0：没有任何设备收到它的帧。',
  outcomes: [
    '说出请求为什么不增加控制消息的长度，而回复为什么要一整帧',
    '分清两个计数：列表元素按发起方计数，回复的帧按接收方计数',
    '读出一张收妥位图：一位对应一个时隙，按时间先后排列',
    '分清哪些是标准的规定，哪些是本仿真器的安排：回复的时隙位置、被确认的时隙范围',
  ],
  needs: ['uwb-m2m', 'uwb-rcm-validity'],
  terms: [
    { term: 'multiple message receipt confirmation message (MMRCM)', plain: '多消息收妥确认消息：接收方用它确认收到了哪几条消息的那一帧，帧里是一个 RMMRC 信息单元（§10.36.1）' },
    { term: 'RMMRC IE', plain: '测距多消息收妥确认信息单元（ranging multiple message receipt confirmation IE）：一个标志字节、一个列表长度，后面每个发起方一个列表元素（§10.36.2.1）' },
    { term: 'MMRCR', plain: 'ARC 信息单元控制字段里的第 15 位（multiple message receipt confirmation request）：置 1 就是请求接收方确认（§10.32.9.1）' },
    { term: 'receipt bitmap', plain: '列表元素里的 MMRC Bitmap：一位对应一个被确认的时隙、按时间先后排列，收到那个时隙里发给它的消息记 1（§10.36.2.1）' },
  ],
  standard: [
    { heading: '请求：ARC 信息单元里的一位（§10.32.9.1，图 10-244）', text: 'ARC 信息单元开头的控制字段里，第 9 到 14 位是 RCM Validity Rounds，第 15 位是 MMRCR。MMRCR 为 1 表示请求多消息收妥确认，为 0 表示不请求。这一位本来就在每一条测距控制消息的控制字段里。' },
    { heading: '谁回、回给谁（§10.36.1，图 10-272）', text: '接收方可以用一帧 MMRCM 确认来自同一个发起方的多条消息，也可以确认来自多个发起方的消息。在标准的示例图里，设备 A1 到 AN 各发出若干条消息给设备 B1 到 BM；这些消息发完之后，B1 到 BM 用多播或多节点消息发出 MMRCM，确认收到的消息。消息与 MMRCM 的时隙可以调度，可以竞争，也可以两者结合。' },
    { heading: 'RMMRC 信息单元的内容（§10.36.2.1，图 10-273、10-274）', text: '内容字段的第一个字节里有 Address Present 与 Address Size 两位：前者说明每个列表元素是否带地址，后者为 0 表示短地址、为 1 表示扩展地址。接着一个字节的 MMRC List Length 给出列表元素的个数。每个列表元素依次是：发起方的地址（Address Present 为 1 时）、一个字节的 MMRC Bitmap Length，以及 MMRC Bitmap。位图长度等于被确认的时隙数除以 8 向上取整。' },
    { heading: '位图的含义（§10.36.2.1）', text: '位图的每一位对应使用这个信息单元确认的那一轮或几轮里的一个时隙。收到那个时隙里的消息记 1；没有收到，或那条消息不是发给这个接收方的，记 0。最先发送的一位对应第一个时隙，之后各位按时间顺序对应后面的时隙；位数多于时隙数时，多出的几位丢弃。' },
    { kind: 'steps', heading: '一次多消息收妥确认，按标准：逐步说明', items: [
      '控制器在测距控制消息的 ARC 信息单元里把 MMRCR 置 1（§10.32.9.1）。',
      '各发起方在这一轮或几轮里发出各自的消息。',
      '接收方记下每个时隙里收到的、发给它的消息。',
      '消息发完之后，接收方发出 MMRCM：每个发起方一个列表元素，元素里是这个发起方的地址和位图；可以用多播或多节点消息发送，时隙可以调度或竞争（§10.36.1）。',
      '发起方从自己的那个列表元素里读出哪几个时隙的消息被收到了（§10.36.2.1）。',
    ] },
    { heading: '与测距消息未收到交互的区别（§10.34.1）', text: '测距消息未收到交互用于单独一轮：收到了控制消息、却没有收到这一轮测距启动消息的响应方，在分配给它的时隙里发一帧带 RMNR 信息单元的消息，而不是保持空闲。多消息收妥确认则由控制器通过 MMRCR 请求，用位图一次确认多个时隙的消息。' },
  ],
  implementation: [
    { topic: '请求位', standard: 'ARC 控制字段的第 15 位 MMRCR（§10.32.9.1）', sim: '照此实现。双向轮变体里请求位开启与关闭时，这组第一轮的控制消息都是 39 字节，其余各轮的启动消息都是 14 字节。', kind: 'faithful' },
    { topic: '多对多里的请求', standard: '请求随测距控制消息的 ARC 信息单元发出（§10.36.1）', sim: '本仿真器的多对多一轮没有控制消息（见多对多那一课），请求只能由场景事先设定，这是待改正的偏差。', kind: 'differs' },
    { topic: '谁回、几个列表元素', standard: '接收方回 MMRCM，每个发起方一个列表元素（§10.36.1、§10.36.2.1）', sim: '照此实现：每个接收方一帧。多对多里每台设备把其余设备都当作发起方，一帧两个元素；双向轮里锚点（anchor）只收到标签（tag）一个发起方的消息，一帧一个元素。', kind: 'faithful' },
    { topic: '回复的时隙', standard: '可以调度、竞争或两者结合，标准未规定位置（§10.36.1）', sim: '放在这组最后一轮测距之后，一个接收方一个时隙。ARC 只给出一个轮长（Ranging Round Duration，§10.32.9.1），所以每一轮都留着这几个时隙，其余各轮里空着。', kind: 'choice' },
    { topic: '帧格式', standard: '标志一字节、列表长度一字节，元素为地址、一字节位图长度、位图（§10.36.2.1）', sim: '照此实现：单元头 2 字节、标志 1 字节、列表长度 1 字节，每个元素为短地址 2 字节、位图长度 1 字节、位图 ⌈S/8⌉ 字节；帧头（MAC header）9 字节与帧校验 2 字节是本仿真器的取值。', kind: 'faithful' },
    { topic: '地址长度', standard: 'Address Size 区分短地址与扩展地址（§10.36.2.1）', sim: '只实现短地址，扩展地址未实现。', kind: 'absent' },
    { topic: '被确认的时隙', standard: '使用这个信息单元确认的那一轮或几轮里的时隙（§10.36.2.1）', sim: '取这组轮次里回复之前的全部时隙：多对多里是那一轮的 3 个时隙，双向轮变体里是 41 个时隙。', kind: 'choice' },
    { topic: '位图的取值', standard: '收到那个时隙里发给它的消息记 1，否则记 0（§10.36.2.1）', sim: '照此实现；别的锚点发送的时隙恒为 0。', kind: 'faithful' },
    { topic: '多播', standard: 'MMRCM 可以用多播或多节点消息发出（§10.36.1）', sim: '双向轮里单播给标签；多对多里沿用整轮的广播地址。', kind: 'choice' },
    { topic: '只有一轮的双向轮次组', standard: '标准没有限制', sim: '编辑器不接受「双向轮 + 有效轮数 1 + 请求收妥确认」：这组只有一轮时，锚点在自己的时隙里应答本身就说明它收到了启动消息。这是本仿真器加的限制。', kind: 'differs' },
    { topic: '时隙与块', standard: '由 ARC 的 Ranging Slot Duration 与 Ranging Block Duration 给出，标准未规定取值', sim: '每个时隙 2 ms，每块 200 ms。', kind: 'value' },
  ],
  labs: [
    {
      heading: '三次发送之后，三帧回复',
      jump: 0,
      steps: [
        '载入本课场景，跳到第一帧收妥确认。',
        '读出这一轮每个时隙的发送者、帧类型与字节数，打开一帧回复看信息单元那一列。',
      ],
      blocks: [
        { kind: 'table', heading: '第 0 块的一轮', head: ['时隙', '发送者', '帧', '字节'], rows: [
          ['0', 'p-1', '多对多测距帧', '20'],
          ['1', 'p-2', '多对多测距帧', '26'],
          ['2', 'p-3', '多对多测距帧', '30'],
          ['3', 'p-1', 'MMRCM', '23'],
          ['4', 'p-2', 'MMRCM', '23'],
          ['5', 'p-3', 'MMRCM', '23'],
        ] },
      ],
      expect: '三次测距发送之后是三帧回复，每台设备一帧，各 23 字节；每帧只有 RMMRC 一个信息单元，里面两个列表元素。',
      meaning: '列表元素按发起方计数、回复的帧按接收方计数（①）；回复放在测距之后的这三个时隙，是本仿真器的安排（②）。',
    },
    {
      heading: '读一张位图',
      jump: 1,
      steps: [
        '依次打开 p-1 与 p-2 的回复，读出每个列表元素的位图。',
        '跳到 p-3 自己的回复，看有没有设备收到它。',
      ],
      blocks: [
        { kind: 'table', heading: '第 0 块收到的位图（一位对应时隙 0、1、2）', head: ['回复者', '列表元素所属的发起方', '位图'], rows: [
          ['p-1', 'p-2', '010'],
          ['p-1', 'p-3', '000'],
          ['p-2', 'p-1', '100'],
          ['p-2', 'p-3', '000'],
        ] },
      ],
      expect: 'p-1 那一帧里，p-2 的元素是 010，p-3 的元素是 000；p-3 收到的两张位图都是 000，它自己的回复没有任何设备收到。这一块只算出 1 条距离，三台设备本应有 3 条。',
      meaning: '一位对应一个时隙，收到发给自己的消息才记 1（①）。在本仿真器的多对多排法里，除了这张位图，没有别的帧会告诉 p-3 它的帧有没有被收到（②）。',
    },
    {
      heading: '请求不占字节，回复占时隙',
      variant: 0,
      more: [1],
      steps: [
        '载入「双向轮」，再载入「同一个双向轮，把请求位关闭」，逐项对照第 0 块。',
      ],
      blocks: [
        { kind: 'table', heading: '请求位开启与关闭，第 0 块', head: ['量什么', '请求位关闭', '请求位开启'], rows: [
          ['第一轮的控制消息', '39 字节', '39 字节'],
          ['其余各轮的启动消息', '14 字节', '14 字节'],
          ['每一轮的时隙数', '8 个', '11 个'],
          ['MMRCM', '0 帧', '3 帧，各 24 字节'],
          ['四轮的测距结果', '24 条', '24 条'],
        ] },
      ],
      expect: '控制消息与启动消息逐帧同长；请求开启后每一轮多 3 个时隙，只在第四轮里发出 3 帧回复；第 0 轮的测距结果距离完全相同。',
      meaning: '请求位在 ARC 原有的控制字段里（①），代价全在回复一侧；回复不带时间量，不参与测距计算（②）。',
    },
    {
      heading: '四轮一张位图',
      variant: 0,
      steps: [
        '载入「双向轮」，打开第 0 块第四轮里锚点发出的回复。',
        '读出位图的位数、字节数，以及哪几位是 1。',
      ],
      blocks: [
        { kind: 'formula', heading: '帧长', text: 'MMRCM = 帧头 9 + 单元固定部分 4 + N × (地址 2 + 位图长度 1 + 位图 ⌈S/8⌉) + 帧校验 2\nS = 41 时：15 + 9N 字节，N 最多 12', note: 'N 是列表元素的个数，S 是被确认的时隙数；一帧的载荷（payload）不超过 127 字节决定了 N 的上限。' },
      ],
      expect: '每个锚点一帧 24 字节、一个列表元素；位图 41 位、6 字节，其中 8 位为 1，即第 0、4、11、15、22、26、33、37 位——每一轮的启动消息与 Final。',
      meaning: '一位对应一个时隙（①）；确认这组里回复之前的全部 41 个时隙，是本仿真器的取法，所以大多数位是别的锚点发送的时隙，恒为 0（②）。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024：§10.36.1 与图 10-272（多消息收妥确认，示例图里多台设备先各自发出多条消息，再由接收方回复 MMRCM）、§10.36.2.1 与图 10-273、10-274（RMMRC 信息单元：Address Present、Address Size、MMRC List Length、MMRC Bitmap Length、MMRC Bitmap，以及位图逐时隙的规则）、§10.32.9.1 与图 10-244（ARC 信息单元的 MMRCR 位与 RCM Validity Rounds 字段）、§10.34.1（测距消息未收到交互）。本课不依赖任何草案。',
    '本仿真器的取值与取法：回复放在这组最后一轮测距之后、一个接收方一个时隙；被确认的时隙取这组里回复之前的全部时隙；只用短地址；帧头 9 字节、帧校验 2 字节；每个时隙 2 ms、每块 200 ms；多对多一轮没有控制消息，请求由场景设定。本课的收发判决只比较功率，没有逐帧的衰落起伏，所以基础场景用发射功率低 14 dB 的一台设备得到一张含 0 的位图。',
  ],
  limits: [],
  scenario: () => uwbReceiptScenario(),
  variants: [
    { label: '双向轮：一个列表元素，41 位的位图', scenario: () => uwbReceiptTwrScenario(true) },
    { label: '同一个双向轮，把请求位关闭', scenario: () => uwbReceiptTwrScenario(false) },
  ],
  jumps: [
    J('第一帧收妥确认：23 字节，两个列表元素', firstUwbMmrcm),
    J('p-3 自己的回复：没有设备收到它', quietConfirmation),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '为什么请求一次收妥确认不增加控制消息的长度？',
      options: [
        '因为请求用单独一帧很短的消息发送',
        '因为请求是 ARC 信息单元控制字段里原有的第 15 位，置 1 与不置 1 的控制消息一样长',
        '因为请求随测距结果一起上报',
      ],
      answer: 1,
      explain: '§10.32.9.1：MMRCR 紧挨着 RCM Validity Rounds，在同一个控制字段里。本课双向轮变体里两种设置的控制消息都是 39 字节。',
    },
    {
      q: '按标准，收妥位图里的一位对应什么？',
      options: [
        '一个测距块（ranging block）',
        '被确认的那一轮或几轮里的一个时隙，按时间先后排列',
        '一个发起方',
      ],
      answer: 1,
      explain: '§10.36.2.1：每一位确认一个时隙里的消息，最先发送的一位对应第一个时隙。发起方对应的是列表元素，不是位。',
    },
    {
      q: '三台设备的多对多一轮里，为什么回复只有 3 帧，而不是 6 帧？',
      options: [
        '因为帧太长，装不下更多',
        '因为回复按接收方计数，每台设备一帧；按发起方计数的是帧里的列表元素，每帧两个',
        '因为多对多里没有发起方',
      ],
      answer: 1,
      explain: '一个接收方可以在一帧里确认多个发起方的消息（§10.36.1），每个发起方占一个列表元素。',
    },
    {
      q: '本仿真器把回复放在这组最后一轮测距之后的时隙里。这是标准的规定吗？',
      options: [
        '是，§10.36 规定回复紧跟在最后一轮测距之后',
        '不是：标准只说回复的时隙可以调度、竞争或两者结合，放在哪里是本仿真器的安排',
        '是，回复必须放在下一条控制消息之前',
      ],
      answer: 1,
      explain: '§10.36.1 没有规定 MMRCM 的时隙位置；本仿真器选择每个接收方一个时隙、排在测距之后。',
    },
  ],
}
