/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · A second radio does the talking.
 *
 * In the standard-first shape (2026-11-10): ① the narrowband radio's PHY as IEEE Std 802.15.4-2024
 * Clause 13 defines it (O-QPSK, 250 kb/s, an 8-symbol preamble and one-octet SFD and PHR), and the
 * control cycle and compressed messages of the TG4ab proposal 15-22/0381r5 (POLL 0x04, RESP 0x05,
 * REPORT 0x06/0x07, the one-to-many POLL 0x10); ② what the engine does with each — including two
 * places it differs: the one-to-many POLL is two octets longer than the proposal's field table gives
 * (14 + 3N instead of 12 + 3N), which is what keeps a fourth anchor out of the base; and the
 * listen-before-talk consequence (a whole block skipped, audit #19, W5) that `uwb-nba-coexist` and
 * `uwb-ssbd` take up; ③ five guided runs.
 *
 * `uwb-nba-coexist` loads exactly this scene and these four variants. Every figure the labs print
 * is read back out of the lesson and compared with a run in tests/course/uwb-nba.test.ts.
 */
import type { Scenario } from '../../model/scenario'
import { DEFAULT_UWB_SESSION } from '../../model/scenario'
import { J, LESSON_6G_WIDTH_MHZ, anchor, firstNbPoll, firstNbReport, firstUwbTrain, node, oneRoom, uwbSc, uwbTag, wifi6g, type Lesson } from '../lessonKit'

/** Which scene the lesson runs: one control channel inside the router's 80 MHz, one outside,
 * an allow list of four, or the inside channel with the listen-before-talk rule switched off. */
export type UwbNbaVariant = 'base' | 'outside' | 'hop' | 'noLbt' | 'pairwise'

/** Channel 71 of the 6 GHz plan — the coexistence lesson's Wi-Fi 7 router, 80 MHz over
 * 6265–6345 MHz. The channelization is the 6 GHz one the lesson names, not a generation. */
export const WIFI_6G_CENTER_MHZ = 6305
/** The narrowband allow list each scene runs: 200 is 6301.25 MHz (inside the router's channel),
 * 100 is 6051.25 MHz (outside), and the hop list mixes two of each — 210 is 6326.25 MHz, also
 * inside, and 150 is 6176.25 MHz, also outside. */
export const NBA_CHANNELS: Record<UwbNbaVariant, number[]> = {
  base: [200], outside: [100], hop: [100, 150, 200, 210], noLbt: [200], pairwise: [200],
}

/**
 * How many of the four corner anchors a scene uses. A one-to-many round holds every anchor of
 * the session at once, and two narrowband slots have to hold its POLL, which grows by three
 * octets per responder: at the 600 RSTU slot — the shortest an MMS round may use — that stops
 * at three responders, and the schema refuses a fourth. So the one-to-many base leaves the
 * fourth corner empty and says so in its numbers; every pair-round variant keeps all four,
 * which is why their recorded hashes do not move.
 */
export const NBA_ANCHOR_COUNT = (variant: UwbNbaVariant): number => (variant === 'base' ? 3 : 4)

/** Anchors on the ceiling, the tag at chest height — the two planes of every UWB lesson. */
export const ANCHOR_Z = 2.2
export const TAG_Z = 1.0
/** The four corners of the 10 × 8 m room, as the positioning and coexistence lessons place them. */
export const NBA_ANCHORS: { id: string; name: string; x: number; y: number }[] = [
  { id: 'anchor-1', name: 'Anchor 1', x: 0.5, y: 0.5 },
  { id: 'anchor-2', name: 'Anchor 2', x: 9.5, y: 0.5 },
  { id: 'anchor-3', name: 'Anchor 3', x: 0.5, y: 7.5 },
  { id: 'anchor-4', name: 'Anchor 4', x: 9.5, y: 7.5 },
]
/** The tag, 1.50 m from the router in three dimensions — the distance the whole lesson turns on. */
export const TAG_POS = { x: 4, y: 3.5 }
/** The router, at the middle of the room and 2 m up. */
export const ROUTER_POS = { x: 5, y: 4, z: 2.0 }
/** The laptop backing up flat out, 3.35 m from the tag. */
export const LAPTOP_POS = { x: 7, y: 5 }

/**
 * The coexistence lesson's room and its two Wi-Fi devices — a Wi-Fi 7 router on 6 GHz
 * channel 71 and a saturated laptop — with an MMS session on top: four
 * corner anchors, one tag, UWB **channel 9** so the ranging frames themselves cannot meet
 * 6 GHz Wi-Fi, and `report: 'bi'` so both ends of a pair round have a narrowband message of
 * their own to get out. Only the narrowband control radio couples with Wi-Fi here, which is
 * the point: everything that goes wrong in `uwb-nba-coexist` goes wrong on 2.5 MHz.
 *
 * The Wi-Fi nodes are listed first, so the 6 GHz link is built — and its mediator decided —
 * before the ranging session asks for one.
 */
export function uwbNbaScenario(variant: UwbNbaVariant = 'base'): Scenario {
  const ap = node('ap', 'Router', 'ap', ROUTER_POS.x, ROUTER_POS.y, 'eht', 'idle',
    { edca: true, txop: true, ampdu: true }, ROUTER_POS.z)
  ap.caps.widthMhz = LESSON_6G_WIDTH_MHZ
  const laptop = wifi6g('laptop', 'Laptop', LAPTOP_POS.x, LAPTOP_POS.y, 'saturated')
  return uwbSc(
    oneRoom(),
    [
      ap, laptop,
      ...NBA_ANCHORS.slice(0, NBA_ANCHOR_COUNT(variant)).map((a) => anchor(a.id, a.name, a.x, a.y, ANCHOR_Z)),
      uwbTag('uwb-1', 'Phone', TAG_POS.x, TAG_POS.y, TAG_Z),
    ],
    {
      mode: 'mms', method: 'ss', slotRstu: 600, aoa: false, nlos: true, channel: 9,
      mms: {
        ...DEFAULT_UWB_SESSION.mms, nbChannels: NBA_CHANNELS[variant],
        nbLbt: variant === 'noLbt' ? 'off' : 'auto', report: 'bi',
        oneToMany: variant === 'base',
      },
    },
    { sixGhzCenterMhz: WIFI_6G_CENTER_MHZ },
  )
}

export const uwbNba: Lesson = {
  id: 'uwb-nba',
  module: 29,
  title: '控制消息走另一部射频',
  why: 'TG4ab 提案 15-22/0381r5 的窄带辅助方式让一部窄带（narrowband, NB）射频承担测距周期里的全部控制消息：发起方用 Poll 开启一轮，应答方用 Response 确认，测距阶段结束后应答方用 Report 送回回复时延（reply time）；在 Report 到达之前，发起方无法算出距离。宽带射频在这期间只发送不含任何数据的片段（fragment）。窄带射频用的是 IEEE Std 802.15.4-2024 第 13 章的 O-QPSK（offset quadrature phase-shift keying）物理层（physical layer, PHY），250 kb/s：每个符号（symbol）16 µs、承载 4 个比特，消息前还有 12 个符号的同步头与物理头（PHY header, PHR），所以一条 12 字节的消息也要 576 µs，比任何一个片段都长。提案把消息压缩成一个字节的消息号加必需的字段：成对的 Poll 与 Response 各 12 字节，Report 13 字节。一对多的 Poll 要列出每个应答方的 3 字节地址，按提案的字段表是 12 + 3N 字节；本仿真器算成 14 + 3N 字节，多出两个字节，于是在本课 500 µs 的时隙下，两个时隙只容得下三个应答方，房间第四个角落的锚点（anchor）不参加这一轮——按提案的长度，四个应答方的 Poll 是 960 µs，本来放得下。本课的场景里窄带信道与一台 Wi-Fi 路由器共用频谱，七个块里没有一个完成了消息交换，原因在下一课。',
  outcomes: [
    '说出窄带射频的物理层出自标准哪一章，以及控制消息的格式出自哪一份提案',
    '按顺序说出一轮里窄带射频发送的三种消息，并算出一条消息占用多少微秒',
    '指出本仿真器在一对多 Poll 的长度上与提案不同之处，以及它造成的后果',
  ],
  needs: ['uwb-mms'],
  terms: [
    { term: 'narrowband', plain: '只占用很窄一段频谱的射频：速率很低，但覆盖距离远，成本也低' },
    { term: 'NB', plain: '日志中凡属于窄带射频的记录，都以这两个字母开头' },
    { term: 'NB Poll', plain: '开启一轮的消息：发起方在其中指定要与哪些设备测距' },
    { term: 'NB Response', plain: '确认已收到 Poll 的消息，收发两端由此确认这一轮已经开始' },
    { term: 'NB Report', plain: '结束一轮的消息：它带回用于计算距离的回复时延——与 DS-TWR 里那帧宽带 Report 不是一回事' },
  ],
  standard: [
    { heading: '出处', text: '窄带射频的物理层出自 IEEE Std 802.15.4-2024 第 13 章；把它用作超宽带（ultra-wideband, UWB）测距的控制射频，属于 P802.15.4ab 草案。草案只对会员开放，本课依据 TG4ab 的两份文稿：15-22/0381r5（测距周期与压缩消息的字段表）与 15-23/0100r2（窄带物理层配置）。现行草案可能有改动。' },
    { heading: '窄带物理层（标准第 13 章）', text: 'O-QPSK 物理层在 2450 MHz 等频段的数据速率为 250 kb/s（§13.2.2），符号速率 62.5 ksymbol/s（§13.3.3），即每个符号 16 µs；每个符号由 4 个信息比特选择 16 个准正交伪随机序列之一（§13.2.1）。同步头里前导码（preamble）为 8 个符号（§13.1.2.2），帧起始定界符（start-of-frame delimiter, SFD）为 8 个比特（§13.1.2.3），物理头（PHY header, PHR）为 7 比特的帧长加 1 个保留比特（§13.1.3）。接收灵敏度（sensitivity）应达到 −85 dBm 或更好（§13.3.4）。提案 15-22/0381r5 把配置 #1 定为 250 kb/s、不编码。' },
    { heading: '压缩消息（15-22/0381r5 表 1.6.3.1）', text: '压缩格式的载荷（payload）只有一个字节的头部，即消息号；其余内容由消息号决定，末尾是 2 字节的循环冗余校验（cyclic redundancy check, CRC）。成对测距的 Poll（0x04）：3 字节的地址散列、3 字节的随机数、1 字节的消息控制、2 字节的内容。Response（0x05）：3 字节的地址散列、1 字节的消息控制、5 字节的内容。Report：发起方的（0x06）携带 5 字节的转向时间，应答方的（0x07）携带 5 字节的回复时延，其后可以有可选的载荷长度字节与载荷。' },
    { heading: '一对多的 Poll（15-22/0381r5 表 1.6.3.1）', text: '一对多 Poll 的消息号是 0x10。消息控制为 0x10 时，它的内容是：应答方数目 1 字节、每个应答方的时隙数 1 字节、每个应答方 3 字节的地址。其余字段与成对的 Poll 相同。' },
    { kind: 'steps', heading: '一个测距周期里的窄带消息，按提案 15-22/0381r5 §1.1：逐步说明', items: [
      '控制阶段开始于测距轮（ranging round）第一个时隙的开头：发起方用窄带射频发出 Poll，它可以占满 Poll 窗口（缺省 2 个时隙，可取 1 到 16 个）。',
      '收到 Poll 的应答方在 Poll 窗口之后的时隙里发回 Response，它同样不得超出自己的窗口。',
      '发出 Response 的应答方进入测距阶段；发起方在预期的时隙收不到 Response，就终止这个测距周期，提案没有重传（retry）。',
      '测距阶段只在宽带射频上进行，窄带射频不发送。',
      '报告阶段：应答方用 Report 送回回复时延；发起方据此计算飞行时间——单边双向测距（single-sided two-way ranging, SS-TWR）的公式见标准 §10.29.1.2.2。',
    ] },
  ],
  implementation: [
    { topic: '符号与速率', standard: '每个符号 16 µs、4 个比特，250 kb/s（§13.2、§13.3.3）', sim: '照此：每个字节 2 个符号，每个符号 16 µs。', kind: 'faithful' },
    { topic: '同步头与物理头', standard: '8 个前导符号（preamble symbol）、1 字节 SFD、1 字节 PHR（§13.1）', sim: '照此计为 12 个符号：消息长度 = (12 + 2 × 字节数) × 16 µs。', kind: 'faithful' },
    { topic: '成对的 Poll 与 Response', standard: '按字段表：12 字节与 12 字节（15-22/0381r5）', sim: '照此：Poll 12 字节、Response 12 字节，各 576 µs。', kind: 'faithful' },
    { topic: 'Report', standard: '5 字节的时间值；载荷长度与载荷可选（15-22/0381r5）', sim: '13 字节：带上可选的载荷长度字节，其后不带载荷。', kind: 'choice' },
    { topic: '一对多 Poll 的长度', standard: '按字段表为 12 + 3N 字节：3 个应答方 21 字节，4 个 24 字节（15-22/0381r5）', sim: '算成 14 + 3N 字节：在成对 Poll 的 12 字节（其中含 2 字节内容）之上再加应答方数目、时隙数与地址，多出两个字节；3 个应答方 23 字节，4 个 26 字节。这是本仿真器与提案的偏差。', kind: 'differs' },
    { topic: '窄带窗口', standard: '缺省 2 个时隙，可取 1 到 16 个；消息不得超出窗口（15-22/0381r5）', sim: '每条消息固定占 2 个时隙；场景里最长的窄带消息超出两个时隙时，编辑器拒绝这个配置。所以本课 500 µs 的时隙下，一对多轮次最多 3 个应答方。', kind: 'value' },
    { topic: 'CRC', standard: '每条消息末尾 2 字节（15-22/0381r5）', sim: '只把 2 个字节计入长度，不计算也不校验。', kind: 'absent' },
    { topic: '收不到 Response', standard: '发起方终止这个周期，没有重传（15-22/0381r5 §1.1）', sim: '照此：对端这一轮里始终不进入测距阶段，到时隙记一次超时。', kind: 'faithful' },
    { topic: '窄带的收发电平', standard: '灵敏度应达到 −85 dBm 或更好（§13.3.4）；发射功率（transmit power）不规定', sim: '发射 10 dBm，灵敏度 −100 dBm；路径损耗（path loss）只把 1 m 处的自由空间项换成窄带信道的，指数与墙体损耗沿用超宽带一侧的取值。', kind: 'value' },
    { topic: '信道忙时', standard: '草案：法规要求时，收发两端在每个发射时隙上各自做一次信道接入（下一课）', sim: '一次判忙就在这个测距块（ranging block）余下的时间里不再发送窄带消息。这是待改正的偏差。', kind: 'differs' },
    { topic: '一轮与一块', standard: '时隙、轮、块的长度取 300 RSTU（ranging scheduling time unit）的整数倍（15-22/0381r5）', sim: '时隙 600 RSTU（500 µs），一对多的一轮 52 个时隙（26 ms），测距块长 200 ms。', kind: 'value' },
  ],
  labs: [
    {
      heading: '一轮先在窄带射频上开始',
      jump: 0,
      steps: [
        '载入本课场景，跳到开启这一轮的窄带 Poll。',
        '向后读到第一个片段为止。',
      ],
      expect: '这一轮的第一帧是 0 ms 的「uwb-1 → * NBPOLL 23 B @0.25 Mbps (928.0 µs)」；第一条 Response 在 1.000 ms；第一个片段在 4.000 ms，此前没有任何超宽带帧。',
      meaning: '控制阶段在测距阶段之前，全部由窄带射频完成（①）。',
    },
    {
      heading: '三种消息的长度',
      jump: 0,
      steps: [
        '在时间线上找到 Poll、Response 与 Report 各一条，读出字节数与占用的空口时间（airtime）。',
        '用下面的公式核对。',
      ],
      blocks: [
        { kind: 'formula', heading: '一条窄带消息占用多久', text: '(8 + 2 + 2 + 2 × 字节数) 个符号 × 16 µs\n12 字节 → 36 × 16 = 576 µs      13 字节 → 38 × 16 = 608 µs      23 字节 → 58 × 16 = 928 µs', note: '8 个前导符号，SFD 与 PHR 各 1 字节即各 2 个符号（标准第 13 章）。' },
        { kind: 'table', heading: '一轮里的三种消息', head: ['消息', '大小', '占用空口'], rows: [
          ['Poll，三个应答方', '23 B', '928.0 µs'],
          ['Response', '12 B', '576.0 µs'],
          ['Report', '13 B', '608.0 µs'],
        ] },
      ],
      expect: '一条 Poll 加一条 Response 合计 1.504 ms；最短的窄带消息 576 µs，而一个片段只有 82.1 µs。',
      meaning: '消息长度来自标准第 13 章的物理层与提案的字段表（①、②）；控制消息的开销以毫秒计，不可忽略。',
    },
    {
      heading: '距离要等窄带 Report',
      jump: 2,
      steps: [
        '跳到收尾的那帧窄带 Report，再看它结束时手机记下的那条记录。',
        '对照前面两串片段的判定，读出余量。',
      ],
      expect: '第一条 Report 在 20.000 ms 发出，608 µs 后的 20.608 ms 手机因信干比（signal-to-interference ratio, SIR）不足记下「uwb-1 UWB frame from anchor-1 lost to Wi-Fi: SIR -9.8 dB (foreign -42.2 dBm)」，这一轮没有得出距离。两串片段都是 8/8 收到，余量 34.5 dB 与 33.4 dB。',
      meaning: '宽带一侧没有问题；Report 丢了，回复时延没有送到，距离就算不出来（① 报告阶段），这是单边双向测距本身的要求。丢失的原因在下一课。',
    },
    {
      heading: '一对多 Poll 能列出几个应答方',
      steps: [
        '在本课场景里数一数参加这一轮的锚点：只有三个。',
        '对照下表，比较本仿真器与提案字段表给出的 Poll 长度。',
      ],
      blocks: [
        { kind: 'table', heading: '一对多 Poll 与两个时隙（1 000 µs）', head: ['应答方', '本仿真器', '按提案的字段表'], rows: [
          ['3', '23 B · 928.0 µs', '21 B · 864.0 µs'],
          ['4', '26 B · 1024.0 µs，超出', '24 B · 960.0 µs，容得下'],
        ] },
      ],
      expect: '本仿真器里 4 个应答方的 Poll 要 1024.0 µs，超出两个时隙，编辑器拒绝这个配置，所以本课场景只有三个锚点；按提案的长度，4 个应答方是 960.0 µs，本来容得下。',
      meaning: '这是②里标为「与提案不同」的那一行造成的后果：多算的两个字节决定了本课场景的锚点数。',
    },
    {
      heading: '每次只与一个锚点测距',
      variant: 3,
      steps: [
        '载入「每次只与一个锚点测距」，看第 0 块的第一轮。',
        '这一课与下一课《窄带射频也共享 6 GHz》共用同一份变体菜单：菜单里有三项是那一课的题目——避开路由器用着的那个信道、在四个信道间跳变（channel hopping）、关掉先听后发（listen before talk, LBT）；本课自己只用第四项「每次只与一个锚点测距」。',
      ],
      expect: '成对的 Poll 只指定 anchor-1，12 B、576.0 µs；一轮 28 个时隙、14 ms，一块容纳 4 轮。anchor-1 在 1.000 ms 发回的 Response 在手机处被 Wi-Fi 干扰而丢失，第一轮没有得出距离；14.000 ms 处手机判定信道忙，从这一轮起，这个块余下的两轮里它也不再发出任何窄带消息。',
      meaning: '成对与一对多用的是同一套周期（①）；判忙之后跳过整个块是本仿真器的规则，与草案不同（②），下一课讲。',
    },
  ],
  sources: [
    'IEEE Std 802.15.4-2024 第 13 章：§13.1.2.2（8 个前导符号）、§13.1.2.3（SFD）、§13.1.3（PHR）、§13.2.1 与 §13.2.2（4 比特一个符号，250 kb/s）、§13.3.3（62.5 ksymbol/s）、§13.3.4（−85 dBm 的灵敏度）；§10.29.1.2.2（单边双向测距）。',
    'P802.15.4ab 草案（截至 2026 年 9 月，投票稿为 D05，仍在 Sponsor 投票复审中），本课依据 TG4ab 文稿：15-22/0381r5（§1.1 测距周期、表 1.2.3.2 的 Poll 与 Response 窗口、表 1.6.3.1 的压缩消息）、15-23/0100r2（窄带物理层配置）。已投票的 D05 可能与此不同。',
    '本仿真器的取值与取法：窄带发射 10 dBm、灵敏度 −100 dBm、窄带路径损耗沿用超宽带的指数与墙体损耗；每条窄带消息固定两个时隙；Report 带上可选的载荷长度字节；不计算 CRC。与提案不同之处：一对多 Poll 多算两个字节；判忙之后跳过整个块。',
  ],
  limits: [],
  scenario: () => uwbNbaScenario('base'),
  variants: [
    { label: '避开路由器的信道', scenario: () => uwbNbaScenario('outside') },
    { label: '在四个信道间跳变', scenario: () => uwbNbaScenario('hop') },
    { label: '不先听后发', scenario: () => uwbNbaScenario('noLbt') },
    { label: '每次只与一个锚点测距', scenario: () => uwbNbaScenario('pairwise') },
  ],
  jumps: [
    J('开启这一轮的窄带 Poll', firstNbPoll),
    J('对端如何判定这一串片段', firstUwbTrain),
    J('收尾的那帧窄带 Report', firstNbReport),
    J('窄带消息被 Wi-Fi 干扰而丢失', (r) => r.type === 'UWB_INTERFERED'),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '用来计算距离的那段回复时延，由哪部射频传回？',
      options: [
        '宽带测距射频，装在最后一个片段里',
        '窄带射频，装在收尾的那条 Report 里',
        '两部都不是——两端各自保存自己的时间戳，从不发送',
      ],
      answer: 1,
      explain: '片段不承载任何数据。按 15-22/0381r5，应答方的 Report（0x07）携带 5 字节的回复时延；在它到达之前，发起方无法算出距离。',
    },
    {
      q: '一条十二字节的消息，在这部射频上要 576 µs。为什么？',
      options: [
        '它被重发了三遍，每个锚点一遍',
        '一个 16 µs 的符号只承载四个比特——250 kb/s——前面还有 12 个符号的同步头与物理头',
        '它必须等到下一个时隙边界才能开始发送',
      ],
      answer: 1,
      explain: '总共 36 个符号：每个字节两个，再加 8 个前导符号与 SFD、PHR 各两个符号（标准第 13 章）。',
    },
    {
      q: '本课场景的一对多轮次只有三个锚点。原因是什么？',
      options: [
        '提案规定一对多轮次最多三个应答方',
        '本仿真器把一对多 Poll 算成 14 + 3N 字节，4 个应答方时超出两个时隙；按提案的 12 + 3N 字节本来容得下',
        '第四个锚点离手机太远',
      ],
      answer: 1,
      explain: '提案的字段表给出 12 + 3N 字节，4 个应答方是 24 字节、960 µs，小于两个 500 µs 的时隙；本仿真器多算两个字节，得到 1024 µs。',
    },
  ],
}
