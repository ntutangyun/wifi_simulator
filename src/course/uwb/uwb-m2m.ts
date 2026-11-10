/**
 * UWB Tier 2 · M18 多对多测距 · One transmission is the question for everyone
 * after it and the answer for everyone before it.
 *
 * IEEE Std 802.15.4-2024 §10.32.6 (SS) and §10.32.7 (DS) describe many-to-many
 * ranging, and this lesson is design §1 and §2 of
 * docs/superpowers/specs/2026-09-30-many-to-many-design.md in one sentence:
 *
 *   participant i's single transmission carries its own transmit time and its
 *   arrival time for every participant before it — so it ASKS everyone after it
 *   and ANSWERS everyone before it, and N transmissions measure all N(N−1)/2
 *   pairs.
 *
 * Two things follow that a reader does not guess. The first is the headline: the
 * arrangement this replaces — each device taking a turn as the tag — spends N²
 * slots AND measures every pair twice, so the wasteful scheme is also the
 * redundant one. The second is the asymmetry: only the EARLIER participant of a
 * pair can finish the arithmetic, because the later one's frame carries the two
 * times the earlier one is missing and not the other way round. Participant i
 * therefore holds exactly N−1−i ranges, and the last participant sends the
 * longest frame of the round and computes nothing at all.
 *
 * The scene is the one every many-to-many figure on this branch was measured in
 * (tests/uwb/m2m-round.test.ts, tests/ui/uwb-guide.test.ts): six devices at six
 * places in a 20 × 16 m hall, no two pairwise distances alike, crystals spread
 * over most of the ±20 ppm the standard allows, timestamp noise off and the
 * carrier-offset estimator's own residual left on — because that residual is
 * the whole of why SS-TWR is decimetres out here and DS-TWR is millimetres.
 * The base scene is SS; the variants are DS and the walled-off round of §6.
 *
 * Every number the lesson prints is pinned in tests/course/uwb-m2m.test.ts, and
 * every count that can be computed is computed — `roundPlan`, `uwbM2mBytes`,
 * `uwbMaxParticipants`, `rstuNs` — never typed as a literal.
 * `npx tsx scripts/lesson-dump.ts uwb-m2m` prints it with its length.
 */
import type { Scenario, UwbSessionCfg, Wall } from '../../model/scenario'
import type { TimingSpec } from '../diagram'
import {
  J, brick, firstUwbM2m, firstUwbRange, firstUwbRoundEnd, txOf, uwbSc, uwbTag, type Lesson,
} from '../lessonKit'
import {
  C_M_PER_NS, RRMC_IE_BYTES, TX_TIME_IE_BYTES, UWB_FCS_BYTES, UWB_MAX_PSDU_BYTES, UWB_MHR_BYTES,
  rstuNs, rxTimesIeBytes, uwbM2mBytes, uwbMaxParticipants, uwbPpduNs,
} from '../../uwb/phy'
import { roundPlan } from '../../uwb/session'

/** Participants of the base round — the N of every number below. */
export const PARTICIPANTS = 6
/** Participants of the walled round (design §6): the first four of the same six places. */
export const WALLED_PARTICIPANTS = 4

/**
 * Where the six devices stand, in metres. No two pairwise distances are alike —
 * 5.385 m to 14.318 m — so a round that answered one number for every pair could
 * not be mistaken for one that measured fifteen.
 */
export const PLACES: readonly { x: number; y: number }[] = [
  { x: 1, y: 1 }, { x: 7, y: 2 }, { x: 3, y: 6 }, { x: 11, y: 9 }, { x: 5, y: 13 }, { x: 15, y: 4 },
]

/** One crystal offset per participant, in ppm: distinct, and spread over most of the ±20 ppm the
 * standard allows (§16.4.9). They are what makes the SS column of the accuracy table what it is. */
export const PPM: readonly number[] = [0, 18, -14, 9, -20, 5]

/** Participant i's id. Ids decide the slot order (`session.ts#m2mParticipants` sorts them), so
 * `p-0`…`p-5` is also the order the round transmits in, and `PLACES[i]` is where participant i is. */
export const idOf = (i: number): string => `p-${i}`

/** The hall: 20 × 16 m inside one brick shell, which no path between two participants crosses. */
function m2mHall(): { rooms: { x: number; y: number; w: number; h: number; name: string }[]; walls: Wall[] } {
  return {
    rooms: [{ x: 0, y: 0, w: 20, h: 16, name: 'Hall' }],
    walls: [brick(0, 0, 20, 0), brick(20, 0, 20, 16), brick(20, 16, 0, 16), brick(0, 16, 0, 0)],
  }
}

/**
 * Three brick partitions across every way out of the corner participant 0 stands
 * in: 36 dB of loss where the link has 28.5 dB of headroom, so nothing of
 * participant 0 is heard and it hears nothing. They cross no other pair's path —
 * every other participant is out at x + y ≥ 9 and these segments only reach
 * x + y = 3.4 — so what the walled round loses is exactly what one unheard
 * participant costs, and nothing else. Lifted from the measurement in
 * tests/uwb/m2m-round.test.ts rather than re-invented for the lesson.
 */
function closet(): Wall[] {
  return [0, 0.2, 0.4].map((d) => ({
    x1: 0, y1: 3 + d, x2: 3 + d, y2: 0, material: 'brick' as const, openings: [],
  }))
}

/**
 * The lesson's scene: `n` UWB devices in the hall, all ranging to each other.
 *
 * `role` is `tag` on every one of them, and it means nothing here — in this mode
 * every UWB node is a participant and the role only decides how the editor and
 * the 3-D scene draw it (design §5). The session runs with no excess delay and
 * no timestamp noise, so the only error term left is the one the lesson is
 * about: the residual on each receiver's own carrier-offset estimate, which the
 * session default (`cfoNoisePpm`) leaves switched on.
 */
export function uwbM2mScenario(
  method: 'ss' | 'ds' = 'ss', n: number = PARTICIPANTS, walled = false,
): Scenario {
  const hall = m2mHall()
  const house = walled ? { rooms: hall.rooms, walls: [...hall.walls, ...closet()] } : hall
  return uwbSc(
    house,
    Array.from({ length: n }, (_, i) => uwbTag(idOf(i), `P${i}`, PLACES[i].x, PLACES[i].y, 1, PPM[i])),
    { mode: 'm2m', method, nlos: false, tsNoisePs: 0 },
  )
}

/** The session the scene runs, read back off the scenario rather than restated. */
const SESSION: UwbSessionCfg = uwbM2mScenario().uwb!

/** The N the tables are read at, and the three the slot ratio is checked at (design §8.1). */
export const TABLE_NS = [3, 4, 6] as const

/** Slots one many-to-many round of `n` participants takes, from the round planner itself. */
export const m2mSlots = (n: number, method: 'ss' | 'ds'): number =>
  roundPlan({ ...SESSION, method }, n).slots

/**
 * Slots the arrangement this replaces takes: `n` one-to-many rounds, one per
 * device taking its turn as the tag, each of them a round of `n − 1` anchors —
 * so `roundPlan` at `n − 1` gives one round's length and `n` of them happen.
 */
export const takingTurnsSlots = (n: number): number =>
  n * roundPlan({ ...SESSION, mode: 'twr', method: 'ss', replyTime: 'embedded' }, n - 1).slots

/** Pairs in a group of `n`, which is how many distances the group wants. */
export const pairsOf = (n: number): number => (n * (n - 1)) / 2
/** Ranges participant i ends up with, for each i — design §2's `N − 1 − i`. */
export const perParticipant = (n: number): number[] => Array.from({ length: n }, (_, i) => n - 1 - i)

/** Octets each of the six transmissions puts on the air, as `uwbM2mBytes` sizes them. */
export const BYTES: number[] = Array.from({ length: PARTICIPANTS }, (_, i) => uwbM2mBytes(i))
/** Participants one round can hold: the largest N whose last frame still fits the PSDU. */
export const CAP = uwbMaxParticipants(SESSION.method)
/** The two frame lengths the cap sits between — the whole of why the cap is that number. */
export const CAP_BYTES = { fits: uwbM2mBytes(CAP - 1), over: uwbM2mBytes(CAP) } as const

/**
 * What one slot of reply interval is worth as a distance error, in metres.
 *
 * A many-to-many reply interval is whole slots long, and SS-TWR has to convert
 * it into the receiver's own timebase with an estimated clock offset. The
 * estimate carries the session's own residual, so a pair k slots apart can be
 * out by k times this — which is the decimetre the SS column of the accuracy
 * table is made of, and why the round's worst pair is its widest-apart one.
 *
 * Computed from the three engine values it is made of, never typed: the slot in
 * nanoseconds (`rstuNs`), the session's residual, and c.
 */
export const ERR_PER_SLOT_M =
  (rstuNs(SESSION.slotRstu) * SESSION.cfoNoisePpm * 1e-6 * C_M_PER_NS) / 2

/**
 * The six ranges the two methods read in this scene, as the run reports them.
 * Measured, at the precision the lesson prints: SS is decimetres out and DS is
 * millimetres, a factor of about 150. Pinned in tests/course/uwb-m2m.test.ts,
 * where both are re-measured from whole rounds.
 */
export const ERR = {
  ssMax: '0.2175', ssMean: '0.0828', dsMax: '0.001454', dsMean: '0.000637', ratio: 150,
  /** The pair that carries SS's worst error, and how many slots apart it is. */
  worstPair: [idOf(0), idOf(4)] as const, worstSlots: 4,
} as const

/** The walled round (design §6): what four participants get when the first of them is unheard. */
export const WALLED = {
  /** Ranges per participant — participant 0 computes nothing and nobody computes to it. */
  per: [0, 2, 1, 0],
  /** Pairs that still have a distance, against the six an open round of four measures. */
  pairs: 3,
  /** Octets on the air, which are shorter than the open round's: a frame carries one arrival
   * time fewer when the arrival never happened. */
  bytes: [20, 20, 26, 30],
} as const

/** The round as the timeline lays it out, in microseconds: every frame's own end instant. */
export const FIG = {
  slotUs: rstuNs(SESSION.slotRstu) / 1000,
  endsUs: BYTES.map((b, i) => (i * rstuNs(SESSION.slotRstu) + uwbPpduNs(b)) / 1000),
} as const

/** The round's first transmission, and its last — the frame that only asks, and the one that only answers. */
const firstFrame = firstUwbM2m
const lastFrame = txOf((r) => r.frame.kind === 'uwbM2m' && r.node === idOf(PARTICIPANTS - 1))

/**
 * One round on one axis, drawn to scale: a ruler of N slots, one per participant,
 * each carrying that participant's octet count — and under it the transmission
 * itself, at its true airtime.
 *
 * The octets go on the SLOT and not on the frame, because at slot scale a frame
 * is a sliver: 42 octets is 216 µs of a 2 ms slot, so a label on the bar would
 * never fit inside it and six callouts would run off the figure (they did). What
 * the lower lane shows to scale is the one thing worth seeing there — a round is
 * six slivers and a great deal of waiting — while the growth the lesson is about
 * is read off the numbers above.
 */
export function uwbM2mTiming(): TimingSpec {
  const slot = FIG.slotUs
  return {
    kind: 'timing',
    lanes: [
      {
        label: '时隙',
        spans: BYTES.map((b, i) => ({
          label: `${b} B`, fromUs: i * slot, toUs: (i + 1) * slot, tone: 'muted' as const,
        })),
      },
      {
        label: '空口',
        spans: BYTES.map((_b, i) => ({
          fromUs: i * slot, toUs: FIG.endsUs[i],
          tone: i === PARTICIPANTS - 1 ? ('accent' as const) : undefined,
        })),
      },
    ],
    axis: {
      fromUs: 0, toUs: PARTICIPANTS * slot,
      ticks: [0, 2 * slot, 4 * slot, PARTICIPANTS * slot], unit: 'µs',
    },
  }
}

export const uwbM2m: Lesson = {
  id: 'uwb-m2m',
  module: 20,
  title: '一次发送，同时是问也是答',
  why: '六台设备想知道两两之间的距离，一共十五条。用前面几课的办法，只能让每台设备轮流担任一次标签（tag）、另外五台担任锚点（anchor）向它应答：六轮，每轮六个测距时隙（ranging slot），共三十六个。更不利的是这三十六个时隙测得三十条距离——每一对都测了两遍。标准另有一种排法，多对多测距（many-to-many ranging）：六个时隙，十五条距离，没有重复——轮流担任标签所需的时隙数，恰好是多对多的 N 倍，N 为设备数。关键在于一次发送同时完成两件事：每台设备按顺序发送一次，帧中既有自己的发送时刻，对排在后面的设备是问；也携带此前收到的每台设备的帧的到达时刻，对排在前面的设备是答。于是每一对的距离只有排在前面的那台算得出来：它缺少的两个时刻都在对方的帧里，而对方缺少的那个时刻，在它发送时还没有发生。排第一的算出五条，排最后的一条也算不出，却发送全轮最长的一帧——一轮最多容纳多少参与者，取决于这一帧能否不超过一帧允许的最大字节数。单边形态要按自己估计的时钟偏差（clock offset）折算对方长达几个时隙的回复间隔，误差达到二十厘米左右；双边形态多进行一趟、时隙数翻倍、帧长不变，从而抵消这一偏差，误差小两个数量级。排在第一位的设备的发送若未被接收，丢失的就是它与后面所有设备之间的距离，一次丢失一串。',
  outcomes: [
    '说清一次发送为什么能同时是问和答，并由此算出「N 对 N²」这个整数倍',
    '指出一对距离为什么只有排在前面的那个算得出来，并数清每个参与者得到几条',
    '说出全轮最长的一帧为什么属于一条距离也算不出的那个参与者，以及参与者上限由谁决定',
    '读出一台设备的发送未被接收时，丢失的是哪几条距离',
  ],
  needs: ['uwb-sstwr', 'uwb-dstwr'],
  terms: [
    { term: 'many-to-many ranging (M2M)', plain: '一组设备在一轮里两两互测，没有标签也没有锚点' },
    { term: 'participant', plain: '在一轮中占一个时隙的设备：发送一次，其余时间接收' },
    { term: 'TX time IE / RX times IE', plain: '帧中的两个信息单元：自己的发送时刻，以及收到的每一个到达时刻' },
    { term: 'slot order', plain: '各设备在第几个时隙发送；本课按设备编号排序' },
  ],
  picture: [
    {
      heading: '一次发送，两件事',
      text: '把六台设备编号 0 到 5，各占一个测距时隙，按编号依次发送一次。参与者 i 的帧携带两项内容：它自己这次发送的发送时刻，以及它此前收到的、排在它前面的每个参与者的帧的到达时刻。于是这一帧对后面的每个参与者是「问」——它们各自记录这一帧的到达时刻；对前面的每个参与者是「答」——它给出收到对方帧的时刻和自己的发送时刻。一次发送同时完成两件事，六次发送就足以测完十五对。',
    },
    {
      kind: 'watch', jump: 0,
      heading: '六次发送，一轮结束',
      text: '载入仿真，观察这一轮的空口：整轮只有六次发送，一个参与者一次，前后各占一个时隙。每个参与者都有自己的一条泳道，而每条泳道上只有一段——它自己的那次发送；其余五次它都在接收。跳到第一帧：全轮只有这一帧只有问、没有答。',
    },
    {
      kind: 'diagram', heading: '一轮六帧，一条时隙标尺', spec: uwbM2mTiming(),
      caption: '按比例画的一轮：上面六个测距时隙每个参与者一个，格中是那一帧的字节数——第 i 帧携带 i 个到达时刻，所以越往后越长，最长那一帧属于整轮一条距离也算不出的那个参与者。下面一行是实际占用空口的那一小段。',
    },
    {
      heading: '谁算得出来，谁算不出来',
      text: '取一对参与者 i 和 j，i 排在前面。i 本身已有两个时刻：自己的发送时刻，和收到 j 那一帧的时刻。它还缺两个，都在 j 一侧——j 何时收到 i、j 又何时发送。而这两个数正好都在 j 的帧里：j 发送时早已收到过 i 的帧，于是携带了那个到达时刻。四个量齐备，i 即可算出距离。',
    },
    {
      heading: '反过来就不成立',
      text: 'j 想算，缺的是「i 收到 j 的时刻」。那件事发生在 i 的帧离开空口之后——i 发送的那一刻，j 还没发送，任何设备都无法把一个尚未发生的时刻写进已经发出的帧。所以每一对距离，只有排在前面的那一个算得出来：参与者 0 算五条，参与者 1 算四条，……参与者 5 一条也算不出来。',
    },
    {
      heading: '最后那一个：帧最长，算得最少',
      text: `排在最后的参与者要携带前面所有参与者的到达时刻，所以它发的是全轮最长的一帧——这里 ${BYTES[PARTICIPANTS - 1]} 字节，比第一帧长 ${BYTES[PARTICIPANTS - 1] - BYTES[0]} 个。而它在每一对中都排在后面，一条距离也算不出。这一帧里每个字节都是为其他参与者携带的，而决定一轮最多容纳多少参与者的，恰好就是它。`,
    },
    {
      kind: 'steps', heading: '一轮多对多测距的完整过程',
      items: [
        '这一轮有一份参与者名单：场景里每一台参与测距的设备都在上面，本课按设备编号排，第 i 个占第 i 个时隙。',
        '参与者 0 在第 0 个时隙发送。它尚未收到任何帧，所以帧中只有自己的发送时刻，一个到达时刻也没有。',
        '参与者 i 在第 i 个时隙发送，帧中携带自己的发送时刻，加上它收到的前面 i 个参与者的帧的到达时刻。',
        '收到这一帧的参与者先记录到达时刻（自己发送时要用），再检查帧中是否有「收到我」的那个时刻：有，说明自己排在前面、四个量已齐备，随即算出这一对；没有，这一对就不由自己计算。',
        '六个时隙结束后，十五条距离分布在六个参与者处：5、4、3、2、1、0 条。',
      ],
    },
    {
      heading: '双边形态：两趟，不是更长的帧',
      text: '双边双向测距（double-sided two-way ranging, DS-TWR）还要多两个时间量，而它们要求排在前面的那一位再发一次。于是多对多的双边形态是两趟，每趟 N 个时隙。第二趟的帧并不更长：它带的是自己第二次发送的时刻，加上第二趟里收到的到达时刻——和第一趟同一个形状，帧长上限因此没变，翻倍的只是时隙数。',
    },
    {
      heading: '未被接收，就没有距离',
      text: '一个参与者未收到另一个参与者的发送，帧中就少一个到达时刻，这一对也就没有距离。这不是错误，是这个模式的正常行为——而代价取决于排位：一对多里丢失一个锚点只丢失一条距离，多对多里排在第一位的参与者的发送若未被接收，丢失的是它和后面每个参与者之间的那一条。',
    },
  ],
  numbers: [
    {
      kind: 'table', heading: '同一组设备，两种排法',
      head: ['N', '轮流担任标签', '多对多 SS-TWR', '多对多 DS-TWR', '距离'],
      rows: TABLE_NS.map((n) => [
        String(n), `${takingTurnsSlots(n)} 个时隙、${2 * pairsOf(n)} 条`,
        `${m2mSlots(n, 'ss')} 个时隙`, `${m2mSlots(n, 'ds')} 个时隙`, `${pairsOf(n)} 条`,
      ]),
    },
    {
      kind: 'formula', text: '轮流担任标签的时隙数 ÷ 多对多的时隙数 = N',
      note: `不是近似，而是恰好：单边双向测距（single-sided two-way ranging, SS-TWR）的多对多一轮 N 个时隙，轮流担任标签要 N 轮、每轮 N 个，${takingTurnsSlots(TABLE_NS[2])} 对 ${m2mSlots(TABLE_NS[2], 'ss')}。而占用空口多的那一种同时也是重复测量的那一种：每一对都测了两遍，N = 6 时 ${2 * pairsOf(6)} 条记录，多对多只有 ${pairsOf(6)} 条。多占用五倍空口，得到的只是一份多余的副本。`,
    },
    {
      kind: 'table', heading: '每个参与者得到几条', head: ['参与者 i', ...perParticipant(PARTICIPANTS).map((_v, i) => String(i))],
      rows: [
        ['N = 6', ...perParticipant(6).map(String)],
        ['N = 3', ...perParticipant(3).map(String), '—', '—', '—'],
      ],
    },
    {
      text: `每一行都是 N−1−i，加起来正好 N(N−1)/2：参与者 0 得到它参与的全部 ${PARTICIPANTS - 1} 条，参与者 ${PARTICIPANTS - 1} 一条也没有。这不是实现上的偏向，是时间顺序的结果——要算出一对，对方必须在自己之后发送。`,
    },
    {
      kind: 'formula', text: `帧长 = 帧头 ${UWB_MHR_BYTES} + RRMC ${RRMC_IE_BYTES} + 发送时刻 ${TX_TIME_IE_BYTES} + 到达时刻 (${rxTimesIeBytes(0)} + 4k) + 帧校验 ${UWB_FCS_BYTES}`,
      note: `k 是这一帧携带的到达时刻个数。k = 0 的那一帧不携带到达时刻信息单元——没有内容的信息单元不必发送——所以从 ${BYTES[0]} 到 ${BYTES[1]} 字节增加了 ${BYTES[1] - BYTES[0]} 个（那 ${rxTimesIeBytes(0)} 个字节的信息单元头正是在这一步出现），之后每多一个到达时刻增加 4 个字节。六个参与者的一轮：${BYTES.join(' / ')} 字节。`,
    },
    {
      heading: '参与者上限，是算出来的',
      text: `一帧最多 ${UWB_MAX_PSDU_BYTES} 字节，而一轮里最长的那一帧属于最后那个参与者。所以上限是「最后一帧不超过这个长度」的最大 N：${CAP} 人时它 ${CAP_BYTES.fits} 字节，再加一人就 ${CAP_BYTES.over} 字节。单边与双边算出同一个上限——决定帧长的是到达时刻的个数，不是是否多进行一趟。编辑器里增加到 ${CAP + 1} 人会被拒绝，理由正是这一点。`,
    },
    {
      kind: 'table', heading: '同样十五对，两种形态的测量结果', head: ['形态', '时隙数', '最大误差', '平均误差'],
      rows: [
        ['多对多 SS-TWR', String(m2mSlots(PARTICIPANTS, 'ss')), `${ERR.ssMax} m`, `${ERR.ssMean} m`],
        ['多对多 DS-TWR', String(m2mSlots(PARTICIPANTS, 'ds')), `${ERR.dsMax} m`, `${ERR.dsMean} m`],
      ],
    },
    {
      text: `六台设备的晶振（crystal）按百万分之几（parts per million, ppm）计，彼此偏差接近标准允许的 ±20 ppm 时，单边形态最大误差 ${ERR.ssMax} m，双边形态 ${ERR.dsMax} m——约 ${ERR.ratio} 倍。原因不在多对多，在回复间隔的长度：单边形态要把对方的回复间隔按自己估计的时钟偏差（clock offset）折算过来，而这里的回复间隔是整整几个时隙。${(FIG.slotUs / 1000).toFixed(0)} ms 的时隙配上 ${SESSION.cfoNoisePpm} ppm 的估计残差，折算成距离约为每个时隙 ${ERR_PER_SLOT_M.toFixed(2)} m；误差最大的那一对恰好是相隔 ${ERR.worstSlots} 个时隙的 ${ERR.worstPair[0]} 与 ${ERR.worstPair[1]}。双边形态抵消了这个偏差，无需估计它。`,
    },
    {
      heading: '用砖墙隔离排在第一位的参与者',
      text: `四个参与者的一轮本应测得 ${pairsOf(WALLED_PARTICIPANTS)} 对。用砖墙把参与者 0 隔离，它收不到其他参与者的帧，其他参与者也收不到它的帧，剩下只有 ${WALLED.pairs} 对——丢失的 ${pairsOf(WALLED_PARTICIPANTS) - WALLED.pairs} 对全是它和后面三个参与者之间的。其余三个参与者得到的，恰好是他们三者自己组成一轮时的结果：每人 ${WALLED.per.slice(1).join('、')} 条。在空口上也能看到，后面每一帧都短了一些：${WALLED.bytes.join(' / ')} 字节——缺少的那个到达时刻，正对应那次没有发生的接收。`,
    },
  ],
  deeper: [
    {
      heading: '为什么双边的第二趟不需要更长的帧',
      text: '把多对多的一对 (i, j) 对应到双边双向测距的六个时刻上：i 第一趟的发送是 Poll，j 第一趟的发送是 Response，i 第二趟的发送是 Final。i 本身已有三个量，它缺少的三个——j 收到 i 的时刻、j 第一趟的发送时刻、j 收到 i 第二趟的时刻——前两个由 j 第一趟的帧带来，第三个由 j 第二趟的帧带来。也就是说，第二趟的帧只需要携带第二趟里收到的到达时刻，个数和第一趟一样多。因此一条帧长规则就足够，两种形态的参与者上限也因此相同。另有一个细节：i 从来不需要 j 第二趟的发送时刻。',
    },
    {
      heading: '时钟偏差不写入帧',
      text: '单边测距里，时钟偏差是接收端自己在接收一帧时测得的，不是发送端写进帧里的。多对多同样如此：i 收到 j 的帧时，同时测得 j 相对自己的偏差。于是帧里省掉了一个信息单元——而这也是为什么上面那张误差表里，单边形态的误差是「本地估计的残差」而不是「对方报来的值的误差」。到达时间差（time difference of arrival, TDoA）的下行形态（downlink TDoA, DL-TDoA）反而要把这个数发送出去——后面有专门一课讲它——因为那里的接收方从不发射，没有任何一次往返可以用来估计。',
    },
  ],
  limits: [
    {
      kind: 'model-value',
      text: '参与者的发送顺序在本课按设备编号排序。标准把谁占哪个时隙交给设备协商出来的排定表（§10.32.2），而本课没有这张排定表，只能另取一个固定的排法——按编号。这条取值不是无关紧要的：顺序决定了谁算得出哪一条距离，换一个顺序，十五条距离就由另外几个参与者算出。',
    },
    {
      kind: 'unmodelled',
      text: '多节点信息单元在本课只计入长度，不含内容：ARC 与 RDM 两个单元各只算一个字节数，控制字段里的加入/退出管理动作在本课不起作用。后果是这一轮的参与者名单从头到尾固定不变，没有任何设备能中途加入或退出。真实设备靠那些控制位入队与离队，名单逐轮变化——本课测得的「N 倍」依赖名单固定不变。',
    },
    {
      kind: 'unmodelled',
      text: '多对多的安全（§10.31、§10.33）本课完全没有涉及：帧不加密，也不做认证。所以这一轮里谁都不必证明自己是名单上那一位：一台冒名设备发送一帧带有伪造到达时刻的帧，会被所有参与者当作合法的一员，算出来的距离没有任何记录能解释它为什么错。真实部署在这一层要靠 STS 与消息认证。',
    },
    {
      kind: 'out-of-scope',
      text: '§10.32.8 的 SP3 分组测距，以及它的 SRRR 信息单元（§10.32.9.9），本课程讲了，但只在一对多里。SP3 这种包配置没有物理头也没有载荷，所以它无法携带时间信息——一组设备要用无法携带时间信息的包完成测距，时间信息就必须通过其他途径传递，而这正是那一节讲的内容。本课的多对多不接受 SP3，因为这个模式里没有一条控制消息可以让每个响应方在里面声明要报告哪几项，也没有一个发起方去发第一枚标记。所以本课这一轮仍然只有「每人发一帧、帧里自带时间」这一种形态，而 SP3 用于一对多。'
    },
    {
      kind: 'out-of-scope',
      text: '本课的这个模式不解算位置：一轮结束后，十五条距离分布在六个参与者处，没有任何一个参与者把它们组合成坐标。参与者 0 其实已有到其余五个参与者的全部距离，用它们进行定位是可行的后续步骤，本课没有做，这不是一处被简化掉的物理。本课要说明的是时隙数与那十五条距离由谁算出，坐标是另一课的内容。',
    },
  ],
  sources: [
    `IEEE Std 802.15.4-2024 §10.32.6 是多对多的单边双向测距过程，§10.32.7 是它的双边形态——本课讲的就是这两条。一帧最长 ${UWB_MAX_PSDU_BYTES} 字节的 PSDU 由 §16.2.7 的物理头字段决定，参与者上限是由它算出来的；±20 ppm 的晶振容差来自 §16.4.9；谁占哪个时隙由 §10.32.2 的排定表决定。这一课完全不依赖任何草案。`,
    '帧中两个信息单元的内容格式取自 §10.29.8 的信息单元清单（发送时刻加一串到达时刻，与下行形态（DL-TDoA）的 Final 是同一个形状）。宽度是本仿真器的取值：帧头 9 字节、RRMC 3 字节、发送时刻 6 字节、到达时刻每个 4 字节、帧校验 2 字节。2 ms 的测距时隙来自 FiRa 的缺省配置，不是标准正文。',
    '本课这一轮把多径的附加时延与时间戳噪声都关掉，只留下载波频偏估计的 0.2 ppm 残差，两台设备之间也没有墙。这是为了让误差表里那一百五十倍只由一个原因造成；砖墙那一轮是另一个变体，专门用来统计丢失的距离。六个位置两两距离互不相同，所以「十五条都对」不可能是一个巧合。',
  ],
  scenario: () => uwbM2mScenario('ss'),
  variants: [
    { label: 'DS-TWR：两趟，每趟 N 个时隙', scenario: () => uwbM2mScenario('ds') },
    { label: '用砖墙隔离排在第一位的参与者', scenario: () => uwbM2mScenario('ss', WALLED_PARTICIPANTS, true) },
  ],
  jumps: [
    J('第一帧：只有问，没有答', firstFrame),
    J('最后一帧：全轮最长，只有答', lastFrame),
    J('第一条测距行', firstUwbRange),
    J('一轮结束', firstUwbRoundEnd),
  ],
  observe: [
    `整轮只有六次发送，一人一次，字节数从 ${BYTES[0]} 增加到 ${BYTES[PARTICIPANTS - 1]}：增加的全是携带的到达时刻。第一帧最短，它还没有可应答的对象；最后一帧最长，它要应答前面所有参与者。`,
    `第一条测距行出现在 ${(FIG.endsUs[1] / 1000).toFixed(3)} ms，也就是第二帧接收完毕的时刻，而不是第一帧接收完毕时——排在第一位的参与者要等其他参与者发送，才能得知自己那次发送的飞行时间。`,
    `十五条测距行按计算它的参与者统计：${perParticipant(PARTICIPANTS).join('、')}。发送全轮最长一帧的那个参与者，自己一条也没有。`,
  ],
  tryThis: [
    `载入「DS-TWR」变体：时隙数从 ${m2mSlots(PARTICIPANTS, 'ss')} 变成 ${m2mSlots(PARTICIPANTS, 'ds')}，每个参与者发送两次，测得的仍是同样 ${pairsOf(PARTICIPANTS)} 条——但最大误差从 ${ERR.ssMax} m 降到 ${ERR.dsMax} m。翻倍的时隙带来的不是更多距离，而是更高的精度。`,
    `载入「砖墙」变体，统计剩下几条测距行：${WALLED.pairs} 条，不是 ${pairsOf(WALLED_PARTICIPANTS)} 条。再把那三面墙向外移开，使排在第一位的参与者重新能被接收——丢失的三条会同时恢复，而它们全属于同一个参与者。`,
  ],
  quiz: [
    {
      q: '一次发送为什么能同时算作「问」和「答」？',
      options: [
        '因为它发两遍：一遍问，一遍答',
        '因为它同时携带自己的发送时刻和收到前面每个参与者的到达时刻，前者是对后面参与者的问，后者是对前面参与者的答',
        '因为其他参与者可以把它转发给尚未收到的参与者',
      ],
      answer: 1,
      explain: '一帧里两类时刻各有各的使用者：后面的参与者把它的发送时刻作为「问」的起点，前面的参与者用它携带的到达时刻补齐自己那一对所需的量。',
    },
    {
      q: '一对参与者里，为什么只有排在前面的那个算得出距离？',
      options: [
        '因为排在前面的那个计算能力更强，标准指定它担任发起方',
        '因为它缺的两个时刻都在对方那一帧里，而对方缺的那个时刻在它发送时还没发生',
        '因为排在后面的那个没有为自己的发送记录时间戳',
      ],
      answer: 1,
      explain: '「我收到你的时刻」只有在你发过之后才存在，而那时排在前面的那一帧早已组帧完毕并发送出去。',
    },
    {
      q: `六个参与者的一轮里，为什么是最后那一帧决定了参与者上限（${CAP} 个）？`,
      options: [
        '因为它排在最后，前面的时隙已经占用了块的大部分',
        `因为它要携带前面所有参与者的到达时刻，是全轮最长的一帧，最先超过 ${UWB_MAX_PSDU_BYTES} 字节`,
        '因为双边形态要它再发一次，两趟加起来最长',
      ],
      answer: 1,
      explain: `上限由轮里最长的那一帧决定：${CAP} 人时 ${CAP_BYTES.fits} 字节，再加一人 ${CAP_BYTES.over} 字节。第二趟的帧和第一趟一样长，两种形态上限相同。`,
    },
    {
      q: '排在最前面的那台设备的发送未被任何设备接收，丢失的是什么？',
      options: [
        '一条距离，就像一对多里丢失一个锚点那样',
        '它和排在它后面每一个参与者之间的那一条，一次丢失一串',
        '整轮作废，因为后面的参与者没有可应答的对象',
      ],
      answer: 1,
      explain: '它的那次发送是后面所有参与者的「问」：未收到它，这些参与者既没有起点，也没有它携带的时刻。而其余参与者仍然完成他们自己的那一轮。',
    },
  ],
}
