/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · Giving channel access a latency
 * bound is deciding in advance to stop waiting.
 *
 * In the standard-first shape (2026-11-10). ① is the draft's spectrum sensing based deferral
 * (§10.45 of P802.15.4ab — not in IEEE Std 802.15.4-2024), reached through §10.39.8.3: the
 * algorithm of the TG4ab proposal 15-22/0486r5 as CID 489/493 and 490/495 changed it
 * (15-24/0121r2), its five attributes and their defaults, the stale appendix example, and the
 * frequency-domain alternative that was voted down (15-26/0365r2). ② says what the engine does
 * with each: the attributes are scene settings, the CCA is an instantaneous reading (audit #20),
 * the threshold is ETSI's because the draft gives none, a draw longer than the window is cut down
 * (the engine's own step), and persistence is absent. ③ runs the four settings on `uwb-nba`'s pair
 * round over 1.3 s.
 *
 * Two wording rules, kept from the old lesson: "the algorithm's bound", never "the engine delays
 * this much" (74 µs includes 54 µs of sensing this engine does not spend); and the attribute
 * spellings stay out of the prose (the corpus spells them three ways across revisions).
 *
 * Every figure the labs print is read back out of the lesson and compared with a run in
 * tests/course/uwb-ssbd.test.ts.
 */
import type { Scenario, UwbSsbdCfg } from '../../model/scenario'
import { UwbSsbdSchema } from '../../model/scenario'
import type { Ns } from '../../model/types'
import { NB_POLL_BYTES } from '../../uwb/nb'
import { nbSlotSlackNs, rstuNs } from '../../uwb/phy'
import {
  J, firstUwbRange, firstUwbSsbdIdle, firstUwbSsbdTxOnEnd, type Lesson,
} from '../lessonKit'
import { uwbNbaScenario } from './uwb-nba'

/**
 * Which of the four settings the scene runs. `defaults` is the lesson's own scene; the other three
 * are what it is measured against, and `off` is the only one that changes the Wi-Fi side's own
 * variant (listen-before-talk off is a session setting, not an `ssbd` one).
 */
export type UwbSsbdVariant = 'defaults' | 'perBlock' | 'biggest' | 'off'

/** The five fields at the draft's own defaults, taken from the schema rather than re-typed, so the
 * lesson's 74 µs cannot drift away from what `ssbd: {}` actually parses to. */
export const SSBD_DEFAULTS: UwbSsbdCfg = UwbSsbdSchema.parse({})

/** The backoff factor the "largest backoff that fits" setting pins both bounds to, so every
 * attempt of a slot draws against the same number and the arithmetic below is exact. */
export const SSBD_BIGGEST_BF = 7

/** The ranging slot `uwb-nba`'s scenes run — read off the scene rather than copied, because the
 * window the backoff has to fit inside is two of these. */
function nbaSlotNs(): Ns {
  const base = uwbNbaScenario('pairwise')
  if (!base.uwb) throw new Error('uwb-nba 的场景没有测距会话，无法读出测距时隙长度')
  return rstuNs(base.uwb.slotRstu)
}

/**
 * The largest backoff unit whose whole draw still fits a POLL's own window: `slack / BF`, floored.
 * Computed, never a literal — it is 60 µs at the 600 RSTU slot, and the point of the setting is
 * that 7 × 60 µs = 420 µs is inside the 424 µs of room and still loses.
 */
export const SSBD_BIGGEST_UNIT_US = Math.floor(nbSlotSlackNs(nbaSlotNs(), NB_POLL_BYTES) / 1000 / SSBD_BIGGEST_BF)

/** The `ssbd` object each setting runs, or null for the two that do not run the algorithm at all. */
function ssbdOf(variant: UwbSsbdVariant): UwbSsbdCfg | null {
  if (variant === 'defaults') return SSBD_DEFAULTS
  if (variant === 'biggest') {
    return {
      ...SSBD_DEFAULTS,
      minBf: SSBD_BIGGEST_BF, maxBf: SSBD_BIGGEST_BF, unitBackoffUs: SSBD_BIGGEST_UNIT_US,
    }
  }
  return null
}

/**
 * `uwb-nba`'s own room, four corner anchors and a pair round on control channel 200 — inside the
 * router's 80 MHz — with `ssbd` patched into the session. Nothing else moves: the same builder, the
 * same Wi-Fi nodes, the same narrowband channel, so the only thing that differs between the four
 * settings is the channel-access method.
 */
export function uwbSsbdScenario(variant: UwbSsbdVariant = 'defaults'): Scenario {
  const base = uwbNbaScenario(variant === 'off' ? 'noLbt' : 'pairwise')
  if (!base.uwb) throw new Error('uwb-nba 的场景没有测距会话，无法配置 ssbd')
  return { ...base, uwb: { ...base.uwb, mms: { ...base.uwb.mms, ssbd: ssbdOf(variant) } } }
}

export const uwbSsbd: Lesson = {
  id: 'uwb-ssbd',
  module: 29,
  title: '有上界的延后，与超出上界的那一帧',
  why: 'P802.15.4ab 草案的 §10.39.8.3 规定：法规要求先听后发（listen before talk, LBT）时，收发两端在每个窄带（narrowband, NB）发射时隙上各自做一次信道接入，可选的方法之一是 §10.45 的频谱感知延后（SSBD）。这一节不在 IEEE Std 802.15.4-2024 里，算法出自 TG4ab 提案 15-22/0486r5，后经评审意见修改：每次空闲信道评估（clear channel assessment, CCA）之前随机退避（backoff）0 到退避因子个单位，判忙一次退避因子加一，次数用尽时按收尾动作照常发送或记为失败。按提案的缺省参数、把一次感知记为 9 µs，整个过程的延迟上界是 74 µs；提案附录给出的 46 µs 是按两条已经改掉的旧前提算出的。这个上界短于本课场景里任何一帧 Wi-Fi 数据帧（data frame），所以退避次数总是先用尽，1.3 秒里测距恢复到 12 次，靠的是缺省的收尾动作「照常发送」，而不是等到了信道空闲；本仿真器先前按块跳过的规则测得 0 次。把退避调到刚好容纳在消息窗口内的最大值，等待要从消息自己的窗口里扣除，测得 1 次。完全不听也只测得 8 次：接入点（access point, AP）对收到一部分的聚合 MPDU（aggregate MPDU, A-MPDU）照样回复块确认（block acknowledgement, BlockAck）；接入点离手机很近，它发出的块确认与允许发送（clear to send, CTS）帧落在手机的窄带接收里。在时域中，任何能容纳在自身时隙内的设置，其等待时间都短于场景里最长的那一帧。',
  outcomes: [
    '说出 SSBD 出自哪一份提案、经过哪些评审意见修改，以及它是草案而不是已发布标准的内容',
    '按公式算出一次信道接入的延迟上界，并说明为什么不能照搬提案附录里的数',
    '区分算法的上界与本仿真器里设备实际等待的时长，并解释退避调大后测距为什么更少',
  ],
  needs: ['uwb-nba-coexist', 'uwb-contention'],
  terms: [
    { term: 'SSBD', plain: '频谱感知延后：在每一个窄带发射时隙上各自感知信道，判忙就等待一小段时间后再次感知' },
    { term: 'backoff factor', plain: '退避因子：每判忙一次加一；本次的等待时长，就在 0 到它之间随机取一个整数决定' },
    { term: 'end action', plain: '收尾动作：退避次数用尽时，是照常发送，还是记为一次信道接入失败' },
    { term: 'latency bound', plain: '延迟上界：所有退避与所有感知加起来的最坏情形，不是每一次都要付出的时长' },
    { term: 'slack', plain: '余量：一个窄带窗口的长度减去消息本身占用的时长，剩余部分才可用于等待' },
  ],
  standard: [
    { heading: '出处：草案，不是已发布的标准', text: 'IEEE Std 802.15.4-2024 第 10 章止于 §10.37，全文里没有 SSBD。§10.45 是 P802.15.4ab 草案的条号：算法出自 TG4ab 提案 15-22/0486r5，整节移入第 10 章见 15-24/0010r36，两处修改见 15-24/0121r2；PICS 把它列为可选（15-26/0179r1）。入口是 §10.39.8.3：法规要求先听后发时，收发两端在每个发射时隙上各自独立地采用 CSMA-CA 或 SSBD（15-25/0307r1、15-25/0427r4）。' },
    { kind: 'steps', heading: '一个发射时隙上的 SSBD，按 15-22/0486r5 与 15-24/0121r2：逐步说明', items: [
      '每次新的 SSBD 尝试开始时，忙次数 NB 置 0，退避因子 BF 置为它的下界。',
      '每次空闲信道评估之前，等待一段随机时长：0 到 BF 之间的随机整数乘以退避单位（CID 489/493 把原来的 0 到 2 × BF 改为 0 到 BF）。',
      '进行一次空闲信道评估。信道空闲，算法以成功结束，开始发送。',
      '信道忙，NB 与 BF 各加一（BF 不超过它的上界），回到第二步。BF 每次加一，所以退避窗口线性增大，而不是成倍增大。',
      'NB 超过最大退避次数时，按收尾动作结束：照常发送，记为成功；或者不发送，记为失败。',
    ] },
    { kind: 'table', heading: '五个属性与提案给出的缺省值（15-22/0486r5；取值范围按 15-24/0121r2）', head: ['属性', '缺省值'], rows: [
      ['退避因子的下界', '1'],
      ['退避因子的上界', '5'],
      ['最大退避次数', '5'],
      ['退避单位', '1 µs'],
      ['收尾动作', '照常发送'],
    ] },
    { heading: '感知时长与持久化', text: '提案原有 SSBD 自己的感知时长属性，缺省 9 µs；CID 490/495 删去了它，改用物理层（physical layer, PHY）的 CCA 时长（15-24/0121r2），草案没有为窄带写出这个时长的数值。提案还有第六个属性「持久化」：一次尝试若是重传（retry），BF 从上一次的终值加一开始。能量检测门限（energy detection threshold）草案正文没有给出。' },
    { heading: '提案附录里的例子（15-22/0486r5）', text: '附录用缺省参数、把一次感知记为 1 µs，并按当时的 0 到 2 × BF 的退避，得出信道接入的延迟不超过 46 µs。这两条前提后来都被评审意见改掉了；这个附录是否原样留在现行草案里，无法从公开文稿核实。' },
    { heading: '频域里的另一种做法（15-26/0365r2）', text: '另有提案（文中为新的 §10.47）主张判忙时不在原信道等待，而是在同一时隙内推迟一小段时间，改用允许列表（allow list）里的另一条窄带信道发送，推迟时间与块长门限都由两端协商。这是提案，是否采纳无法从公开文稿确认。' },
  ],
  implementation: [
    { topic: '算法', standard: '§10.45：随机退避、线性增大的 BF、收尾动作（15-22/0486r5、15-24/0121r2）', sim: '照此：每个窄带发射时隙重新开始，收发两端各自独立执行，退避在 0 到 BF 之间取整数。', kind: 'faithful' },
    { topic: '五个属性', standard: '媒体访问控制（medium access control, MAC）层的属性，缺省 1、5、5、1 µs、照常发送', sim: '作为场景设置直接给定，不经属性库读写；缺省值照提案。', kind: 'choice' },
    { topic: '持久化', standard: '重传时 BF 从上一次的终值加一开始（15-22/0486r5）', sim: '未实现：本仿真器的窄带消息没有重传，这一项没有意义。', kind: 'absent' },
    { topic: '感知时长', standard: '物理层的 CCA 时长，草案没有为窄带给出数值', sim: '每次感知只读一个瞬时功率值，不占用时长；计算上界时把一次感知记为 9 µs（ETSI 的最短评估时间）。这是待改正的偏差。', kind: 'differs' },
    { topic: '门限', standard: '草案正文未给出', sim: '取 ETSI EN 303 687 的 −75 dBm/MHz，换算到 2.5 MHz 为 −71.02 dBm。', kind: 'value' },
    { topic: '退避超出窗口', standard: '草案未规定', sim: '每条窄带消息有两个测距时隙（ranging slot）的窗口；抽到的退避比窗口剩余时长还长时，截断为剩余时长，并在记录里写明抽到的数与实际等待的时长。', kind: 'choice' },
    { topic: '读数里有什么', standard: '能量检测（energy detection, ED）不区分来源', sim: '只计入 Wi-Fi 一侧正在发射的功率；别的窄带会话与噪声地板（noise floor）不计入。', kind: 'choice' },
    { topic: '频域延后', standard: '提案 15-26/0365r2，未见采纳', sim: '未实现：它需要同一时隙内的两个接收窗口，而本仿真器的设备一个时隙只接收一次。', kind: 'absent' },
  ],
  labs: [
    {
      heading: '上界要按公式算',
      steps: [
        '按下面的公式代入缺省参数，算出延迟上界。',
        '再把两条旧前提代回同一个公式，与提案附录的数对照。',
      ],
      blocks: [
        { kind: 'formula', heading: '缺省参数下的延迟上界', text: '上界 = Σ(i=0…5) [ min(1+i, 5) × 1 µs + 9 µs ] = 74 µs', note: '六次感知，每次按 9 µs 记（本仿真器代入的值）；六段退避最多合计 20 µs。' },
        { kind: 'formula', heading: '代入两条旧前提', text: '上界 = Σ(i=0…5) [ 2 × min(1+i, 5) × 1 µs + 1 µs ] = 46 µs', note: '退避按 0 到 2 × BF，一次感知按 1 µs，正好得到附录里的 46 µs。' },
        { kind: 'formula', heading: '一个窄带窗口的余量', text: 'Poll：2 × 500 µs − 576 µs = 424 µs\nReport：2 × 500 µs − 608 µs = 392 µs', note: '一个窗口是两个 500 µs 的测距时隙，余量是窗口减去消息本身的长度。' },
      ],
      expect: '缺省参数给出 74 µs；把退避改回 2 × BF、感知改为 1 µs，同一个公式给出 46 µs，与附录相同。Poll 窗口的余量是 424 µs，Report 窗口是 392 µs。',
      meaning: '附录的 46 µs 是一个过时的例子，不是另一套算法（①）；9 µs 是本仿真器代入的感知时长（②）。',
    },
    {
      heading: '四种设置，同一个场景',
      more: [0, 1, 2],
      steps: [
        '依次载入本课场景、「上一课的按块规则」「退避取能容纳的最大值」与「完全关闭先听后发」，各运行 1.3 秒。',
        '只看测距成功次数、定位次数与感知记录的条数。',
      ],
      blocks: [
        { kind: 'table', heading: '四种设置，1.3 秒', head: ['设置', '测距成功', '定位', '感知记录'], rows: [
          ['完全关闭先听后发', '8', '0', '—'],
          ['上一课的按块规则', '0', '0', '—'],
          ['SSBD，提案给出的缺省值', '12', '0', '76'],
          ['SSBD，退避取能容纳的最大值', '1', '0', '113'],
        ] },
      ],
      expect: '按块规则判了 9 次忙，其中 7 次是手机的，测得 0 次；缺省的 SSBD 测得 12 次，不少于关闭先听后发的 8 次；退避调到最大，只有 1 次。四种设置都没有解算出定位。',
      meaning: 'SSBD 把一次判忙的后果从一个 200 ms 的块缩小到一个时隙（①）；按块跳过是本仿真器先前的规则（上一课②）。',
    },
    {
      heading: '缺省值靠收尾动作，不靠等待',
      jump: 0,
      steps: [
        '在本课场景里跳到退避用尽后消息仍然发出的那一次感知，读出它的电平、门限与等待时长。',
        '对照下表，比较上界与场景里的 Wi-Fi 数据帧。',
      ],
      blocks: [
        { kind: 'table', heading: '上界、余量与需要等待的那些帧', head: ['量', '值'], rows: [
          ['算法的延迟上界（缺省参数）', '74 µs'],
          ['六段退避的最大总和', '20 µs'],
          ['窄带消息在自身时隙内的最大推迟量，实测', '17 µs'],
          ['一个 Poll 窗口的余量', '424 µs'],
          ['场景里最短的 Wi-Fi 数据帧', '75.2 µs'],
          ['场景里最长的 Wi-Fi 数据帧', '510.4 µs'],
          ['2376 帧中长于 424 µs 的', '1926 帧'],
        ] },
      ],
      expect: '第一条记录是「uwb-1 slot 0 ch 200: sensed -57.7 dBm against -71.0 dBm, backoff 5/5, waited 3.0 µs — txOnEnd」。76 条感知记录里 45 条读到忙，这 45 条都是退避用尽后照常发送；没有哪一帧 Wi-Fi 数据帧短于 74 µs。',
      meaning: '74 µs 是算法保证不会超过的限值，不是每次都要付出的时长；本仿真器的感知不占用时长（②），所以实测推迟最多 17 µs。',
    },
    {
      heading: '退避调大，测距反而更少',
      variant: 1,
      steps: [
        '载入「退避取能容纳的最大值」：退避因子固定为 7，退避单位 60 µs，一次最多等待 420 µs，小于 Poll 窗口的 424 µs 余量。',
        '统计被截断的记录与超时。',
      ],
      expect: '113 条感知记录里 75 条被截断，其中 50 条实际等待 0——窗口余量已被同一时隙内前几次等待用尽；整段运行 55 次超时，只测得 1 次。',
      meaning: '截断是本仿真器的处理（②）；而 424 µs 的余量本来就短于场景里最长的 510.4 µs 那一帧，在时域里等不到它结束。',
    },
  ],
  sources: [
    'P802.15.4ab 草案（截至 2026 年 9 月，投票稿为 D05，仍在 Sponsor 投票复审中），仅对会员开放；IEEE Std 802.15.4-2024 全文没有 SSBD，第 10 章止于 §10.37。本课依据 TG4ab 文稿：15-22/0486r5（算法、属性表与缺省值、附录的延迟例子）、15-24/0010r36（整节移入第 10 章）、15-24/0121r2（CID 489/493：退避由 0 到 2 × BF 改为 0 到 BF，退避单位的范围放宽到 1…63；CID 490/495：删去 SSBD 自己的感知时长属性）、15-26/0179r1（PICS：SSBD 为可选）、15-25/0486r1（§10.39.8.3 的适用范围）、15-25/0307r1 与 15-25/0427r4（§10.39.8.3 改用 CSMA-CA 或 SSBD）、15-26/0244r1（D04 复审中关于门限与感知时长的意见）、15-26/0365r2（频域延后的提案）。',
    '法规：ETSI EN 303 687 对基于帧的设备的规定（−75 dBm/MHz、至少 9 µs）；欧盟 2025/893 号实施决定使其不再构成符合性推定，见 15-25/0307r1。',
    '本仿真器的取值与取法：五个属性作为场景设置；一次瞬时读数代替感知时长；计算上界时代入 9 µs；−71.02 dBm 的门限换算；退避超出窗口时截断；读数只计入 Wi-Fi 功率；不实现持久化与频域延后。',
  ],
  limits: [],
  scenario: () => uwbSsbdScenario('defaults'),
  variants: [
    { label: '上一课的按块规则', scenario: () => uwbSsbdScenario('perBlock') },
    { label: '退避取能容纳的最大值', scenario: () => uwbSsbdScenario('biggest') },
    { label: '完全关闭先听后发', scenario: () => uwbSsbdScenario('off') },
  ],
  jumps: [
    J('退避用尽后消息仍然发出的那一次感知', firstUwbSsbdTxOnEnd),
    J('一次读到空闲的感知', firstUwbSsbdIdle),
    J('整段运行中得出的第一个距离', firstUwbRange),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '按上一课的按块规则，1.3 秒里一个距离也没有测得；按提案的缺省值启用 SSBD 之后，测距恢复到 12 次。原因是什么？',
      options: [
        '缺省的 74 µs 上界足以等到附近的 Wi-Fi 帧结束',
        '74 µs 短于场景里任何一帧，所以退避次数必然用尽，而缺省的收尾动作是照常发送——改变的是后果的单位，而不是等到了信道空闲',
        '启用 SSBD 之后感知所用的门限被提高，于是判忙次数减少',
      ],
      answer: 1,
      explain: '76 次感知里有 45 次读到忙，这 45 次消息都仍然发出；场景里最短的 Wi-Fi 数据帧是 75.2 µs。',
    },
    {
      q: '提案附录说缺省参数下延迟不超过 46 µs，本课算出 74 µs。哪个说法正确？',
      options: [
        '两套算法不同，各自正确',
        '同一个公式：附录用的是后来被改掉的 0 到 2 × BF 的退避与 1 µs 的感知，按现行规则并代入 9 µs 的感知得到 74 µs',
        '本课算错了，应以附录为准',
      ],
      answer: 1,
      explain: 'CID 489/493 把退避改为 0 到 BF，CID 490/495 删去了 SSBD 自己的感知时长（15-24/0121r2）；9 µs 是本仿真器代入的值。',
    },
    {
      q: '哪一项是本仿真器自己的处理，而不是草案的规定？',
      options: [
        '判忙一次，退避因子加一',
        '退避次数用尽时按收尾动作照常发送',
        '抽到的退避比窗口剩余时长还长时，截断为剩余时长',
      ],
      answer: 2,
      explain: '前两项出自 15-22/0486r5 的算法；截断是本仿真器为了让消息仍能容纳在窗口里而加的一步。',
    },
  ],
}
