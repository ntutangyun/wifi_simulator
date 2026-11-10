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
  J, type Lesson,
} from '../lessonKit'
import type { TLRecord } from '../../model/records'

/** The first SSBD attempt that ran its window out before it could sense again. */
export const firstSsbdNoRoom = (r: TLRecord): boolean => r.type === 'UWB_SSBD' && r.outcome === 'noRoom'
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
  why: 'P802.15.4ab 草案的 §10.39.8.3 规定：法规要求先听后发（listen before talk, LBT）时，收发两端在每个窄带（narrowband, NB）发射时隙上各自做一次信道接入，可选的方法之一是 §10.45 的频谱感知延后（SSBD）。这一节不在 IEEE Std 802.15.4-2024 里，算法出自 TG4ab 提案 15-22/0486r5，后经评审意见修改：每次空闲信道评估（clear channel assessment, CCA）之前随机退避（backoff）0 到退避因子个单位，判忙一次退避因子加一，次数用尽时按收尾动作照常发送或记为失败。感知时长按评审意见改用物理层（physical layer, PHY）的 CCA 时长，标准推荐 8 个符号（symbol）周期即 128 µs；按提案的缺省参数，整个过程的延迟上界是 788 µs，长于一条 Poll 在自己窗口里的 424 µs 余量。所以在路由器的信道上，几乎每一轮的三次感知都判忙之后窗口就用完了，收尾动作根本轮不到；1.3 秒里手机只在一轮中感知到空闲、发出一条 Poll，那一轮也没有测成，一个距离也没有；不开 SSBD、改用 CSMA-CA 时一条 Poll 也发不出去；把退避调大只会更早用完窗口。只有关闭先听后发才得到 14 个距离，其中手机自己算出 4 个、锚点（anchor）算出 10 个，没有一次定位：路由器对只收到一部分的聚合 MPDU（aggregate MPDU, A-MPDU）照样回复块确认（block acknowledgement, BlockAck），它离手机很近，这些块确认与允许发送（clear to send, CTS）帧落在手机的窄带接收里；代价同时转给 Wi-Fi。提案附录给出的 46 µs 是按两条已经改掉的旧前提算出的。',
  outcomes: [
    '说出 SSBD 出自哪一份提案、经过哪些评审意见修改，以及它是草案而不是已发布标准的内容',
    '按公式算出一次信道接入的延迟上界，并说明为什么不能照搬提案附录里的数',
    '解释在一个窄带窗口里，感知时长与退避怎样耗尽余量，以及这时收尾动作为什么不起作用',
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
    { heading: '感知时长与持久化', text: '提案原有 SSBD 自己的感知时长属性，缺省 9 µs；CID 490/495 删去了它，改用物理层（physical layer, PHY）的 CCA 时长 phyCcaDuration（15-24/0121r2）。IEEE Std 802.15.4-2024 表 12-2：物理层条款没有另行推荐时，推荐 8 个符号周期；草案没有为窄带写出别的数值。提案还有第六个属性「持久化」：一次尝试若是重传（retry），BF 从上一次的终值加一开始。能量检测门限（energy detection threshold）草案正文没有给出。' },
    { heading: '提案附录里的例子（15-22/0486r5）', text: '附录用缺省参数、把一次感知记为 1 µs，并按当时的 0 到 2 × BF 的退避，得出信道接入的延迟不超过 46 µs。这两条前提后来都被评审意见改掉了；这个附录是否原样留在现行草案里，无法从公开文稿核实。' },
    { heading: '频域里的另一种做法（15-26/0365r2）', text: '另有提案（文中为新的 §10.47）主张判忙时不在原信道等待，而是在同一时隙内推迟一小段时间，改用允许列表（allow list）里的另一条窄带信道发送，推迟时间与块长门限都由两端协商。这是提案，是否采纳无法从公开文稿确认。' },
  ],
  implementation: [
    { topic: '算法', standard: '§10.45：随机退避、线性增大的 BF、收尾动作（15-22/0486r5、15-24/0121r2）', sim: '照此：每个窄带发射时隙重新开始，收发两端各自独立执行，退避在 0 到 BF 之间取整数。', kind: 'faithful' },
    { topic: '五个属性', standard: '媒体访问控制（medium access control, MAC）层的属性，缺省 1、5、5、1 µs、照常发送', sim: '作为场景设置直接给定，不经属性库读写；缺省值照提案。', kind: 'choice' },
    { topic: '持久化', standard: '重传时 BF 从上一次的终值加一开始（15-22/0486r5）', sim: '未实现：本仿真器的窄带消息没有重传，这一项没有意义。', kind: 'absent' },
    { topic: '感知时长', standard: '物理层的 CCA 时长 phyCcaDuration；未另行规定时推荐 8 个符号周期（标准表 12-2）', sim: '每次感知对外部功率积分 128 µs，计算上界时也按 128 µs。本仿真器以前只读一个瞬时值、上界里按 9 µs 记。', kind: 'value' },
    { topic: '门限', standard: '草案正文未给出', sim: '取 ETSI EN 303 687 的 −75 dBm/MHz，换算到 2.5 MHz 为 −71.02 dBm。', kind: 'value' },
    { topic: '退避超出窗口', standard: '草案未规定', sim: '每条窄带消息有两个测距时隙（ranging slot）的窗口；抽到的退避比窗口剩余时长还长时，截断为剩余时长并记录；窗口里连一次感知也放不下时，这一时隙不发送，记为 noRoom。', kind: 'choice' },
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
        { kind: 'formula', heading: '缺省参数下的延迟上界', text: '上界 = Σ(i=0…5) [ min(1+i, 5) × 1 µs + 128 µs ] = 788 µs', note: '六次感知，每次 phyCcaDuration = 128 µs（标准表 12-2 推荐的 8 个符号周期）；六段退避最多合计 20 µs。' },
        { kind: 'formula', heading: '代入两条旧前提', text: '上界 = Σ(i=0…5) [ 2 × min(1+i, 5) × 1 µs + 1 µs ] = 46 µs', note: '退避按 0 到 2 × BF，一次感知按 1 µs，正好得到附录里的 46 µs。' },
        { kind: 'formula', heading: '一个窄带窗口的余量', text: 'Poll：2 × 500 µs − 576 µs = 424 µs\nReport：2 × 500 µs − 608 µs = 392 µs', note: '一个窗口是两个 500 µs 的测距时隙，余量是窗口减去消息本身的长度。' },
      ],
      expect: '缺省参数给出 788 µs；把退避改回 2 × BF、感知改为 1 µs，同一个公式给出 46 µs，与附录相同。Poll 窗口的余量是 424 µs，Report 窗口是 392 µs：缺省参数下的上界比两个余量都长。',
      meaning: '附录的 46 µs 是一个过时的例子，不是另一套算法（①）；128 µs 是标准推荐的感知时长（②）。',
    },
    {
      heading: '四种设置，同一个场景',
      more: [0, 1, 2],
      steps: [
        '依次载入本课场景、「CSMA-CA（不开 SSBD）」「退避取能容纳的最大值」与「完全关闭先听后发」，各运行 1.3 秒。',
        '只看测距成功次数、定位次数与感知记录的条数。',
      ],
      blocks: [
        { kind: 'table', heading: '四种设置，1.3 秒', head: ['设置', '测距成功', '定位', '感知记录'], rows: [
          ['完全关闭先听后发', '14', '0', '—'],
          ['CSMA-CA（不开 SSBD）', '0', '0', '—'],
          ['SSBD，提案给出的缺省值', '0', '0', '29'],
          ['SSBD，退避取能容纳的最大值', '0', '0', '44'],
        ] },
      ],
      expect: '三种做信道接入的设置都一个距离也没有：手机的 Poll 只在缺省参数下的一轮里发出，那一轮也没有测成；只有关闭先听后发测得 14 次，其中手机算出 4 次、锚点一侧算出 10 次，四种设置都没有解算出定位。',
      meaning: 'SSBD 与 CSMA-CA 都按发射时隙接入（①）；在路由器的信道上，128 µs 的感知平均下来仍高于门限，窗口在接入成功之前就用完了（②）。',
    },
    {
      heading: '窗口在收尾动作之前就用完了',
      jump: 0,
      steps: [
        '在本课场景里跳到第一条感知记录，读出它的时刻与结论。',
        '对照下表，比较一次感知的时长、Poll 窗口的余量与缺省的退避次数。',
      ],
      blocks: [
        { kind: 'table', heading: '一个 Poll 窗口里放得下几次感知', head: ['量', '值'], rows: [
          ['一次感知', '128 µs'],
          ['一个 Poll 窗口的余量', '424 µs'],
          ['余量里放得下的感知', '3 次'],
          ['缺省参数下收尾动作之前的感知', '6 次'],
        ] },
      ],
      expect: '第一条记录在 0.387 ms：「uwb-1 slot 0 ch 200: no room left in the window for a CCA — not sent」。前三次感知都判忙，第四次已经放不进窗口；29 条感知记录里有 27 条是这个结论，都来自手机的 Poll。另外两条判为空闲：1228.390 ms 手机的 Poll 与 1229.259 ms 锚点 anchor-3 的应答。',
      meaning: '收尾动作「照常发送」要等第六次感知判忙之后才轮得到（①）；本仿真器在窗口里放不下下一次感知时就结束这一时隙（②），所以缺省参数下它从不起作用。',
    },
  ],
  sources: [
    'P802.15.4ab 草案（截至 2026 年 9 月，投票稿为 D05，仍在 Sponsor 投票复审中），仅对会员开放；IEEE Std 802.15.4-2024 全文没有 SSBD，第 10 章止于 §10.37。本课依据 TG4ab 文稿：15-22/0486r5（算法、属性表与缺省值、附录的延迟例子）、15-24/0010r36（整节移入第 10 章）、15-24/0121r2（CID 489/493：退避由 0 到 2 × BF 改为 0 到 BF，退避单位的范围放宽到 1…63；CID 490/495：删去 SSBD 自己的感知时长属性）、15-26/0179r1（PICS：SSBD 为可选）、15-25/0486r1（§10.39.8.3 的适用范围）、15-25/0307r1 与 15-25/0427r4（§10.39.8.3 改用 CSMA-CA 或 SSBD）、15-26/0244r1（D04 复审中关于门限与感知时长的意见）、15-26/0365r2（频域延后的提案）。',
    '法规：ETSI EN 303 687 对基于帧的设备的规定（−75 dBm/MHz、至少 9 µs）；欧盟 2025/893 号实施决定使其不再构成符合性推定，见 15-25/0307r1。',
    '本仿真器的取值与取法：五个属性作为场景设置；感知按 phyCcaDuration 积分 128 µs；−71.02 dBm 的门限换算；退避超出窗口时截断、放不下感知时这一时隙不发送；读数只计入 Wi-Fi 功率；不实现持久化与频域延后。',
  ],
  limits: [],
  scenario: () => uwbSsbdScenario('defaults'),
  variants: [
    { label: 'CSMA-CA（不开 SSBD）', scenario: () => uwbSsbdScenario('perBlock') },
    { label: '退避取能容纳的最大值', scenario: () => uwbSsbdScenario('biggest') },
    { label: '完全关闭先听后发', scenario: () => uwbSsbdScenario('off') },
  ],
  jumps: [
    J('窗口用尽、这一时隙不发送的那次感知', firstSsbdNoRoom),
  ],
  observe: [],
  tryThis: [],
  quiz: [
    {
      q: '按提案的缺省值启用 SSBD 之后，本课场景 1.3 秒里一个距离也没有。原因是什么？',
      options: [
        '缺省的收尾动作是不发送',
        '每次感知 128 µs，Poll 窗口只有 424 µs 的余量，三次判忙之后窗口用完，收尾动作轮不到',
        '启用 SSBD 之后门限被降低，于是每次都判忙',
      ],
      answer: 1,
      explain: '收尾动作要在第六次感知判忙之后才执行；窗口里只放得下三次 128 µs 的感知。',
    },
    {
      q: '提案附录说缺省参数下延迟不超过 46 µs，本课算出 788 µs。哪个说法正确？',
      options: [
        '两套算法不同，各自正确',
        '同一个公式：附录用的是后来被改掉的 0 到 2 × BF 的退避与 1 µs 的感知，按现行规则并代入 128 µs 的感知得到 788 µs',
        '本课算错了，应以附录为准',
      ],
      answer: 1,
      explain: 'CID 489/493 把退避改为 0 到 BF，CID 490/495 改用物理层的 CCA 时长（15-24/0121r2）；128 µs 是标准表 12-2 推荐的 8 个符号周期。',
    },
    {
      q: '哪一项是本仿真器自己的处理，而不是草案的规定？',
      options: [
        '判忙一次，退避因子加一',
        '退避次数用尽时按收尾动作照常发送',
        '窗口里放不下下一次感知时，这一时隙不发送',
      ],
      answer: 2,
      explain: '前两项出自 15-22/0486r5 的算法；草案没有说一个时隙用完时怎么办，不发送是本仿真器的取法。',
    },
  ],
}
