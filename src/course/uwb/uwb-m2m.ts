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
 *
 * CAUTION — this lesson is 5 Chinese characters from `lessonMinutes`
 * rounding up from 25 to 30. Measure before adding a sentence, and measure by
 * importing `CHARS_PER_MINUTE`/`OBSERVE_MINUTES`/`TRY_MINUTES` from
 * `curriculum.ts` rather than retyping them — the controller got all three
 * wrong once and read a 484-character margin where there were four.
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
  module: 18,
  title: '一次发送，同时是问也是答',
  why: '六台设备想知道两两之间的距离，一共十五条。用前面几课的办法，只能让每台设备轮流当一次标签（tag）、另外五台当锚点（anchor）答它：六轮，每轮六个测距时隙（ranging slot），三十六个。更糟的是这三十六个时隙量出三十条距离——每一对都量了两遍。标准另有一种排法：六个时隙，十五条距离，一条不重。差别只在一句话上——一次发送可以同时做两件事。',
  outcomes: [
    '说清一次发送凭什么同时是问和答，并由此算出「N 对 N²」这个整数倍',
    '指出一对距离为什么只有排在前面的那个算得出来，并数对每人手里有几条',
    '说出全轮最长的一帧为什么属于什么都算不到的那个，以及上限由谁决定',
    '读出一台设备没被人听见时，丢掉的是哪几条距离',
  ],
  needs: ['uwb-sstwr', 'uwb-dstwr'],
  terms: [
    { term: 'many-to-many ranging (M2M)', plain: '一组设备在一轮里两两互测，没有标签也没有锚点' },
    { term: 'participant', plain: '轮里占一个时隙的设备：发一次，其余时间在听' },
    { term: 'TX time IE / RX times IE', plain: '帧里那两小节：自己的发送时刻，和听到的每一个到达时刻' },
    { term: 'slot order', plain: '谁在第几个时隙发；本仿真器按节点 id 排' },
  ],
  picture: [
    {
      heading: '一次发送，两件事',
      text: '把六台设备编号 0 到 5，各占一个测距时隙，按号依次发一次。参与者 i 那一帧里装两样东西：它自己这一发的发送时刻，以及它此前收到的、排在它前面每一个人的到达时刻。于是这一帧对后面的每个人是「问」——你们都听到我了，记下时间；对前面的每个人是「答」——我早听到你了，这是我听到的时刻、这是我发的时刻。一次发送同时做两件事，六次发送就够量完十五对。',
    },
    {
      kind: 'watch', jump: 0,
      heading: '六次发送，一轮结束',
      text: '载入仿真，看这一轮的空口：整轮只有六次发送，一个参与者一次，前后各占一个时隙。每个参与者都有自己的一条泳道，而每条泳道上只有一段——它自己那一发；其余五次它都在听。跳到第一帧：全轮只有它只有问、没有答。',
    },
    {
      kind: 'diagram', heading: '一轮六帧，一条时隙标尺', spec: uwbM2mTiming(),
      caption: '按比例画的一轮：上面六个测距时隙一人一个，格里是那一帧的字节数——第 i 帧带 i 个到达时刻，所以越往后越长，最长那一帧属于整轮什么都算不到的那个人。下面一行是真正上空口的那一小段。',
    },
    {
      heading: '谁算得出来，谁算不出来',
      text: '取一对参与者 i 和 j，i 排在前面。i 手里自然有两个时刻：自己发出去的那一刻，和收到 j 那一帧的那一刻。它还缺两个，都在 j 那一头——j 何时收到 i、j 又何时发出。而这两个数正好都在 j 的帧里：j 发送时早已收到过 i，于是把那个到达时刻捎上了。四个量齐，i 当场算出距离。',
    },
    {
      heading: '反过来就不成立',
      text: 'j 想算，缺的是「i 收到 j 的时刻」。那件事发生在 i 的帧离开空口之后——i 发送的那一刻，j 还没发送，谁也没法把一个还没发生的时刻写进已经发出去的帧。所以每一对距离，只有排在前面的那一个算得出来：参与者 0 算五条，参与者 1 算四条，……参与者 5 一条也算不出来。',
    },
    {
      heading: '最后那一个：帧最长，算得最少',
      text: `排在最后的参与者要捎回前面所有人的到达时刻，所以它发的是全轮最长的一帧——这里 ${BYTES[PARTICIPANTS - 1]} 字节，比第一帧长 ${BYTES[PARTICIPANTS - 1] - BYTES[0]} 个。而它每一对都排在后面，一条距离也算不到。这一帧里每个字节都是替别人携带的，而决定一轮最多站多少人的，恰好就是它。`,
    },
    {
      kind: 'steps', heading: '一轮多对多，从头到尾',
      items: [
        '会话排好这一轮的参与者名单：场景里每一台参与测距的设备都在上面，顺序按节点 id 排，第 i 个占第 i 个时隙。',
        '参与者 0 在第 0 个时隙发。它还没听到任何人，所以帧里只有自己的发送时刻，一个到达时刻也没有。',
        '参与者 i 在第 i 个时隙发，帧里带自己的发送时刻，加上它收到的前面 i 个人的到达时刻。',
        '收到这一帧的人先记下到达时刻（自己那一发要用），再看帧里有没有「收到我」的那个时刻：有，就说明自己排在前面、四个量已齐，当场算出这一对；没有，这一对就不归自己算。',
        '六个时隙走完，十五条距离分落在六个人手里：5、4、3、2、1、0 条。',
      ],
    },
    {
      heading: '双边形态：两趟，不是更长的帧',
      text: '双边双向测距（double-sided two-way ranging, DS-TWR）还要多两个时间量，而它们要求排在前面的那一位再发一次。于是多对多的双边形态是两趟，每趟 N 个时隙。第二趟的帧并不更长：它带的是自己第二次发送的时刻，加上第二趟里听到的到达时刻——和第一趟同一个形状，帧长上限因此没变，翻倍的只是时隙数。',
    },
    {
      heading: '听不到就没有',
      text: '谁没收到谁那一发，帧里就少一个到达时刻，这一对也就没有距离。这不是出错，是这个模式正常的样子——而代价按排位分：一对多里丢一个锚点只丢一条距离，多对多里排头的人一发没被听见，丢的是它和后面所有人之间的那一条。',
    },
  ],
  numbers: [
    {
      kind: 'table', heading: '同一组设备，两种排法',
      head: ['N', '轮流当标签', '多对多 SS-TWR', '多对多 DS-TWR', '距离'],
      rows: TABLE_NS.map((n) => [
        String(n), `${takingTurnsSlots(n)} 个时隙、${2 * pairsOf(n)} 条`,
        `${m2mSlots(n, 'ss')} 个时隙`, `${m2mSlots(n, 'ds')} 个时隙`, `${pairsOf(n)} 条`,
      ]),
    },
    {
      kind: 'formula', text: '轮流当标签的时隙数 ÷ 多对多的时隙数 = N',
      note: `不是差不多，是恰好：单边双向测距（single-sided two-way ranging, SS-TWR）的多对多一轮 N 个时隙，轮流当标签要 N 轮、每轮 N 个，${takingTurnsSlots(TABLE_NS[2])} 对 ${m2mSlots(TABLE_NS[2], 'ss')}。而费空口的那一种同时也是重复的那一种：每一对都量了两遍，N = 6 时 ${2 * pairsOf(6)} 条记录，多对多只有 ${pairsOf(6)} 条。多花五倍空口，换回一份多余的副本。`,
    },
    {
      kind: 'table', heading: '每个参与者手里有几条', head: ['参与者 i', ...perParticipant(PARTICIPANTS).map((_v, i) => String(i))],
      rows: [
        ['N = 6', ...perParticipant(6).map(String)],
        ['N = 3', ...perParticipant(3).map(String), '—', '—', '—'],
      ],
    },
    {
      text: `每一行都是 N−1−i，加起来正好 N(N−1)/2：参与者 0 拿到它参与的全部 ${PARTICIPANTS - 1} 条，参与者 ${PARTICIPANTS - 1} 一条也没有。这不是实现上的偏向，是时间顺序的结果——要算一对，得让对方在自己之后发送。`,
    },
    {
      kind: 'formula', text: `帧长 = 帧头 ${UWB_MHR_BYTES} + RRMC ${RRMC_IE_BYTES} + 发送时刻 ${TX_TIME_IE_BYTES} + 到达时刻 (${rxTimesIeBytes(0)} + 4k) + 帧校验 ${UWB_FCS_BYTES}`,
      note: `k 是这一帧捎的到达时刻个数。k = 0 那一帧根本不挂到达时刻那一小节——没有内容的信息单元不必上空口——所以 ${BYTES[0]} 到 ${BYTES[1]} 字节跳了 ${BYTES[1] - BYTES[0]} 个（那 ${rxTimesIeBytes(0)} 个字节的小节头正是在这一步出现），之后每多一个到达时刻长 4 个字节。六个人的一轮：${BYTES.join(' / ')} 字节。`,
    },
    {
      heading: '参与者上限，是算出来的',
      text: `一帧最多 ${UWB_MAX_PSDU_BYTES} 字节，而一轮里最长的那一帧属于最后那个参与者。所以上限是「最后一帧还塞得进去」的最大 N：${CAP} 人时它 ${CAP_BYTES.fits} 字节，再加一人就 ${CAP_BYTES.over} 字节。单边与双边算出同一个上限——决定帧长的是到达时刻的个数，不是要不要多走一趟。编辑器里加到 ${CAP + 1} 人会被拒，理由正是这一句。`,
    },
    {
      kind: 'table', heading: '同样十五对，两种形态量出来', head: ['形态', '时隙数', '最大误差', '平均误差'],
      rows: [
        ['多对多 SS-TWR', String(m2mSlots(PARTICIPANTS, 'ss')), `${ERR.ssMax} m`, `${ERR.ssMean} m`],
        ['多对多 DS-TWR', String(m2mSlots(PARTICIPANTS, 'ds')), `${ERR.dsMax} m`, `${ERR.dsMean} m`],
      ],
    },
    {
      text: `六台设备的晶振（crystal）按百万分之几（parts per million, ppm）计，彼此拉开到接近标准允许的 ±20 ppm 时，单边形态最大误差 ${ERR.ssMax} m，双边形态 ${ERR.dsMax} m——约 ${ERR.ratio} 倍。原因不在多对多，在回复间隔的长度：单边形态要把对方的回复间隔按自己估出来的时钟偏差（clock offset）折算过来，而这里的回复间隔是整整几个时隙。${(FIG.slotUs / 1000).toFixed(0)} ms 的时隙配上 ${SESSION.cfoNoisePpm} ppm 的估计残差，折成距离约 ${ERR_PER_SLOT_M.toFixed(2)} m 一个时隙；误差最大的那一对恰好是相隔 ${ERR.worstSlots} 个时隙的 ${ERR.worstPair[0]} 与 ${ERR.worstPair[1]}。双边形态把这个偏差抵消掉，从不去估它。`,
    },
    {
      heading: '把排头那个封在墙后',
      text: `四个参与者的一轮本该量出 ${pairsOf(WALLED_PARTICIPANTS)} 对。把参与者 0 用砖墙封起来，它听不见别人、别人也听不见它，剩下只有 ${WALLED.pairs} 对——丢掉的 ${pairsOf(WALLED_PARTICIPANTS) - WALLED.pairs} 对全是它和后面三个人之间的。剩下三个人得到的，恰好是他们自己那一轮：每人 ${WALLED.per.slice(1).join('、')} 条。空口上也看得见，后面每一帧都短了一截：${WALLED.bytes.join(' / ')} 字节——少的那个到达时刻，正是没有发生过的那一次。`,
    },
  ],
  deeper: [
    {
      heading: '为什么双边的第二趟不需要更长的帧',
      text: '把多对多的一对 (i, j) 对到双边双向测距那六个时刻上：i 第一趟那一发是 Poll，j 第一趟那一发是 Response，i 第二趟那一发是 Final。i 自己手里已经有三个量，它缺的三个——j 收到 i 的时刻、j 第一趟的发送时刻、j 收到 i 第二趟的时刻——前两个由 j 第一趟的帧带来，第三个由 j 第二趟的帧带来。也就是说，第二趟的帧只需要携带第二趟里听到的到达时刻，个数和第一趟一样多。帧长法则因此一条就够，两种形态的参与者上限也因此相同。顺带一个细节：i 从来不需要 j 第二趟的发送时刻。',
    },
    {
      heading: '时钟偏差不进帧',
      text: '既有的单边路径里，时钟偏差是接收端自己在收的时候量出来的，不是发送端写进帧里的（device.ts 收到一帧时从射频那边拿到它）。多对多照旧：i 收到 j 的帧时，顺手就量到了 j 相对自己的偏差。于是帧里省掉了一个信息单元——而这也是为什么上面那张误差表里，单边形态的误差是「本地估计的残差」而不是「对方报来的值的误差」。DL-TDoA 的响应帧反而要把这个数报出去，因为那里的接收方从不发射，没有任何一次往返可以用来估计。',
    },
  ],
  limits: [
    {
      kind: 'model-value',
      text: '参与者的发送顺序按节点 id 排序（uwb/session.ts 的 m2mParticipants，用的是时间线哈希自己那套 byCodeUnit）。标准把谁占哪个时隙交给设备协商出来的排定表（§10.32.2），而本仿真器没有排定表可商量，只能另找一个确定的排法——按 id，而不是按场景里节点的先后，因为后者会被编辑器的增删改动，同一份平面图换个添加顺序就会换一套时隙分配。这条取值不是无关紧要的：顺序决定了谁算得出哪一条距离，换一个顺序，十五条距离就落在另外几个人手里。',
    },
    {
      kind: 'unmodelled',
      text: '多节点信息单元的控制位只建了长度，没有建布局：ARC 与 RDM 两个单元在 uwb/phy.ts 里各是一个字节数（ARC_IE_BYTES、RDM_IE_FIXED_BYTES），控制字段里的加入/退出管理动作一位也没有解析。后果是这一轮的参与者名单在会话构造时就一次算定（uwb/network.ts 从节点表算出 participants），此后没有任何设备能中途加入或退出。真实设备靠那些控制位入队与离队，名单是一轮一轮变的——本课量到的「N 倍」依赖名单固定不变。',
    },
    {
      kind: 'unmodelled',
      text: '多对多的安全（§10.31、§10.33）一行也没有建：本仿真器全篇没有一处密码学。最接近的一处是窄带跳频：那里的信道序列本应由 AES-128-CTR 生成，而这里改用一个字符串哈希代替（uwb/nb.ts 的 nbChannelForBlock）。所以这一轮里谁都不必证明自己是名单上那一位：一台冒名的设备发一帧带着编造的到达时刻，会被所有人当成合法的一员，算出来的距离没有任何记录能解释它为什么错。真实部署在这一层要靠 STS 与消息认证。',
    },
    {
      kind: 'out-of-scope',
      text: '§10.32.8 的 SP3 分组测距，以及它的 SRRR 信息单元（§10.32.9.9），还没建。SP3 这种包配置没有物理头也没有载荷，所以它带不了时间——一组设备要用带不了时间的包完成测距，时间就得从别处来，而这正是那一节在讲的事。本课只建了「每人发一帧、帧里自带时间」这一种多对多，SP3 那一种是同一条款族里的另一条路，排在后面做。'
    },
    {
      kind: 'out-of-scope',
      text: '这个模式不解算位置：一轮走完，十五条距离散在六个人手里，没有任何一个人把它们凑成坐标（uwb/device.ts 的 endRound 在多对多这一支直接收尾，不走解算那一步）。参与者 0 其实手里握着到其余五个人的全部距离，拿 uwb/position.ts 的 solvePosition 就能把他们多点定位出来——这是一项真做得到的后续工作，不是一处简化掉的物理。本课要算清的是时隙与那十五条距离归谁，坐标是另一课的事。',
    },
  ],
  sources: [
    `IEEE Std 802.15.4-2024 §10.32.6 是多对多的单边双向测距过程，§10.32.7 是它的双边形态——本课讲的就是这两条。一帧最长 ${UWB_MAX_PSDU_BYTES} 字节的 PSDU 由 §16.2.7 的物理头字段决定，参与者上限是由它算出来的；±20 ppm 的晶振容差来自 §16.4.9；谁占哪个时隙由 §10.32.2 的排定表决定。这一课完全不依赖任何草案。`,
    '帧里两小节的内容形状取自 §10.29.8 的信息单元清单（发送时刻加一串到达时刻，与 DL-TDoA 的 Final 是同一个形状，所以 uwb/phy.ts 里两者共用 dlExtraBytes 定长）。宽度是本仿真器的取值：帧头 9 字节、RRMC 3 字节、发送时刻 6 字节、到达时刻每个 4 字节、帧校验 2 字节。2 ms 的测距时隙来自 FiRa 的缺省配置，不是标准正文。',
    '本课这一轮把多径的附加时延与时间戳噪声都关掉，只留下载波频偏估计的 0.2 ppm 残差，两台设备之间也没有墙。这是为了让误差表里那一百五十倍只由一个原因造成；砖墙那一轮是另一个变体，专门用来数丢掉的距离。六个位置两两距离互不相同，所以「十五条都对」不可能是一个巧合。',
  ],
  scenario: () => uwbM2mScenario('ss'),
  variants: [
    { label: 'DS-TWR：两趟，每趟 N 个时隙', scenario: () => uwbM2mScenario('ds') },
    { label: '把排头那个封在砖墙后', scenario: () => uwbM2mScenario('ss', WALLED_PARTICIPANTS, true) },
  ],
  jumps: [
    J('第一帧：只有问，没有答', firstFrame),
    J('最后一帧：全轮最长，只有答', lastFrame),
    J('第一条测距行', firstUwbRange),
    J('一轮结束', firstUwbRoundEnd),
  ],
  observe: [
    `整轮只有六次发送，一人一次，字节数从 ${BYTES[0]} 涨到 ${BYTES[PARTICIPANTS - 1]}：涨的全是捎回去的到达时刻。第一帧最短，它还没有人可答；最后一帧最长，它要答前面所有人。`,
    `第一条测距行出现在 ${(FIG.endsUs[1] / 1000).toFixed(3)} ms，也就是第二帧落地那一刻，而不是第一帧落地时——排头的人要等别人发送，才知道自己那一发走了多久。`,
    `十五条测距行按算它的人数一数：${perParticipant(PARTICIPANTS).join('、')}。发了全轮最长一帧的那个，自己一条也没有。`,
  ],
  tryThis: [
    `载入「DS-TWR」变体：时隙数从 ${m2mSlots(PARTICIPANTS, 'ss')} 变成 ${m2mSlots(PARTICIPANTS, 'ds')}，每个人发两次，量出来还是同样 ${pairsOf(PARTICIPANTS)} 条——但最大误差从 ${ERR.ssMax} m 降到 ${ERR.dsMax} m。翻倍的时隙换的不是距离，是精度。`,
    `载入「砖墙」变体，数剩下几条测距行：${WALLED.pairs} 条，不是 ${pairsOf(WALLED_PARTICIPANTS)} 条。再把那三面墙往外挪，让排头那个重新被听见——丢掉的三条会一起回来，而它们全是同一个人的。`,
  ],
  quiz: [
    {
      q: '一次发送凭什么同时算「问」和「答」？',
      options: [
        '因为它发两遍：一遍问，一遍答',
        '因为它同时带着自己的发送时刻和收到前面每个人的到达时刻，前者是给后面人的问，后者是给前面人的答',
        '因为其他人可以把它转发给还没听到的人',
      ],
      answer: 1,
      explain: '一帧里两类时刻各有各的用户：后面的人拿它的发送时刻当「问」的起点，前面的人拿它捎回来的到达时刻补齐自己那一对。',
    },
    {
      q: '一对参与者里，为什么只有排在前面的那个算得出距离？',
      options: [
        '因为排在前面的那个算力更强，标准指定它当发起方',
        '因为它缺的两个时刻都在对方那一帧里，而对方缺的那个时刻在它发送时还没发生',
        '因为排在后面的那个没给自己的发送打时间戳',
      ],
      answer: 1,
      explain: '「我收到你的时刻」只有在你发过之后才存在，而那时排在前面的那一帧早已封好上了空口。',
    },
    {
      q: `六个参与者的一轮里，为什么是最后那一帧决定了参与者上限（${CAP} 个）？`,
      options: [
        '因为它排在最后，前面的时隙已经把块用得差不多了',
        `因为它要捎回前面所有人的到达时刻，是全轮最长的一帧，最先超过 ${UWB_MAX_PSDU_BYTES} 字节`,
        '因为双边形态要它再发一次，两趟加起来最长',
      ],
      answer: 1,
      explain: `上限由轮里最长的那一帧决定：${CAP} 人时 ${CAP_BYTES.fits} 字节，再加一人 ${CAP_BYTES.over} 字节。第二趟的帧和第一趟一样长，两种形态上限相同。`,
    },
    {
      q: '排在最前面的那台设备一发没被人听见，丢掉的是什么？',
      options: [
        '一条距离，就像一对多里丢一个锚点那样',
        '它和排在它后面每一个人之间的那一条，一次丢一串',
        '整轮作废，因为后面的人没有可答的对象',
      ],
      answer: 1,
      explain: '它的那一发是后面所有人的「问」：听不到，这些人既没有起点，也没有它捎回来的时刻。而剩下的人照旧完成他们自己的那一轮。',
    },
  ],
}
