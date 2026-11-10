/**
 * UWB Tier 3 · M15 · Narrowband-assisted multi-millisecond UWB · Giving channel access a latency
 * bound is deciding in advance to stop waiting.
 *
 * The third lesson of the narrowband control plane, and the one that closes the
 * listen-before-talk story `uwb-nba-coexist` opened. That lesson's rule has one consequence and it
 * is an over-broad one: a single busy reading silences a device's narrowband radio for a whole
 * 200 ms ranging block. P802.15.4ab's own answer — spectrum sensing based deferral, the draft's
 * §10.45, reached through §10.39.8.3 — is a per-slot channel access instead: one CCA, a linearly
 * growing random backoff, a bounded number of tries, and an end action.
 *
 * The lesson is three measurements on one scene, over 1.3 s, counting successful ranges:
 * listening off 47, today's per-block rule 1, SSBD at the draft's defaults 50, SSBD with the
 * largest backoff that fits its own window 3. So the per-block rule costs 46 of 47 cycles; the
 * defaults recover them, and not by outwaiting anything — the 74 µs bound is shorter than every
 * one of the scene's 2291 Wi-Fi data frames, so the backoffs are always exhausted and the default
 * end action transmits regardless; and turning the knob up is worse, because the wait is paid
 * inside the window the message itself must still fit in, and the largest slack a narrowband
 * window has (424 µs) is shorter than the scene's longest Wi-Fi frame (564.8 µs). The time domain
 * has no winning setting, which is why a 2026-08 proposal moved deferral into the frequency
 * domain (proposed §10.47, slice 5b).
 *
 * Two wording rules this lesson is held to, both of them paid for elsewhere on this branch:
 *  - "the algorithm's bound", never "the engine delays this much". 74 µs is a worst-case sum whose
 *    54 µs of sensing this engine does not spend (its CCA is an instantaneous reading), so the
 *    backoffs can sum to at most 20 µs and the measured displacement here peaks at 16 µs.
 *  - the attribute SPELLINGS are not in the prose. The corpus spells the same quantity three ways
 *    across three revisions (design doc §4.1), so the lesson names the quantity and cites §10.45.
 *
 * Every number quoted below is pinned in tests/course/uwb-ssbd.test.ts, computed from the engine's
 * own exports (`ssbdBoundNs`, `nbSlotSlackNs`, `NB_POLL_BYTES`, `UwbSsbdSchema`'s defaults) or read
 * out of a run; `npx tsx scripts/lesson-dump.ts uwb-ssbd` prints it with its length.
 */
import type { Scenario, UwbSsbdCfg } from '../../model/scenario'
import { UwbSsbdSchema } from '../../model/scenario'
import type { Ns } from '../../model/types'
import { NB_POLL_BYTES } from '../../uwb/nb'
import { nbSlotSlackNs, rstuNs } from '../../uwb/phy'
import {
  J, firstUwbPosition, firstUwbRange, firstUwbSsbdIdle, firstUwbSsbdTxOnEnd, type Lesson,
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
  why: '上一课的场景用的是本课程自己的一条规则，它有一个影响范围过大的后果：窄带（narrowband, NB）信道上检测到一次忙，这台设备在整整一个测距块（ranging block）里不再发出任何控制消息，而一个块是 200 ms。而先听后发（listen before talk, LBT）这件事，在这份草案里本来是有条件的：法规要求或为了共存时才执行——要把它改成强制的评审意见一再提出，至今没有达成写入草案所需的共识——真正要求「必须先听后发」的是管制规定，而不是草案。草案另给出一种方法（§10.45），称为频谱感知延后（SSBD）：在每一个窄带发射时隙上各自感知信道，判忙就退避（backoff）一次后再次感知，每判一次忙退避窗口线性增大一级，退避次数用尽时由收尾动作决定是照常发送，还是记为一次信道接入失败。它改变的是后果的单位：一次判忙不再损失一个块，只损失一个时隙内的几次退避。按提案给出的缺省值，并把一次感知计为 9 µs（这是本课代入的值），整个过程的延迟上界只有几十微秒，而且必须按公式自行计算——提案附录给出的那个数，是按两条已经改掉的旧前提算出的，已经过时。这个上界是最坏情形下的总和，不是每次都要付出的时长：本课的运行中，一条消息实际在自己的时隙内最多只推迟十几微秒。这么短的等待时间短于房间内任何一帧 Wi-Fi 数据帧（data frame），于是退避次数必然用尽、消息仍然发出：测距结果几乎全部恢复，靠的是缺省的收尾动作「照常发送」，而不是等到了信道空闲。反过来，把退避设到刚好能容纳在窗口内的最大值，等待时间就要从消息自己的窗口中扣除，大量退避被截断（截断是本课的处理），测距反而几乎为零。所以在时域中，任何能容纳在自身时隙内的设置，其等待时间都短于附近最长的那一帧。',
  outcomes: [
    '计算一次信道接入的延迟上界，并说明为什么不能直接引用草案附录给出的那个数',
    '区分「算法的上界」与「设备实际等待的时长」这两个不同的量',
    '说明把退避调大之后，测距成功次数为什么反而变少',
  ],
  needs: ['uwb-nba-coexist', 'uwb-contention'],
  terms: [
    { term: 'SSBD', plain: '频谱感知延后：在每一个窄带发射时隙上各自感知信道，判忙就等待一小段时间后再次感知' },
    { term: 'backoff factor', plain: '退避因子：每判忙一次加一；本次的等待时长，就在 0 到它之间随机抽一个数决定' },
    { term: 'end action', plain: '收尾动作：退避次数用尽时，是照常发送，还是记为一次信道接入失败' },
    { term: 'latency bound', plain: '延迟上界：所有退避与所有感知加起来的最坏情形，不是每一次都要付出的时长' },
    { term: 'slack', plain: '余量：一个窄带窗口的长度减去消息本身占用的时长，剩余部分才可用于等待' },
  ],
  picture: [
    { heading: '改变的是后果的单位，而不是补上一个缺失的后果', text: '按上一课场景的规则（本课程自己的规则，不是草案的），一次判忙使设备跳过这个块余下的全部部分：没有轮询就没有这一轮的消息交换，锚点（anchor）按时进入各自的时隙、等待、超时。草案写的不是这样：需要先听后发时，由两端各自在每一个发射时隙上分别进行一次信道接入（CSMA-CA 或 SSBD）。于是改变的是后果的单位：从一个 200 ms 的块，换成一个 500 µs 的时隙。' },
    { heading: '一次尝试中退避窗口如何增大', text: '按草案的算法（出自提案 15-22/0486r5，经评审意见 489/493 修改），设备维护两个计数：忙次数和退避因子。每一次空闲信道评估（clear channel assessment, CCA）之前，它在 0 到退避因子之间抽一个数，等待这个数乘以退避单位的时长。读到空闲就立即发送；读到忙，两个计数各加一，再抽取一次、再等待一次。退避因子每判一次忙加一、直到上界为止——所以这不是成倍增大的窗口，而是线性增大的窗口。' },
    { kind: 'watch', jump: 0, heading: '观察判忙之后消息仍然发出', text: '载入仿真、按下播放，再跳到第一条感知记录。那一行列出它测得的电平、用于比较的门限、两个计数器，以及这一次的等待时长——末尾标明照常发送。这种方法并不阻止消息发送，而是在决定之前先用完规定的感知次数。' },
    { heading: '退避次数用尽时', text: '次数用尽之后只有两种结果，由收尾动作决定：照常发送，记为一次成功；或者不发送，记为一次信道接入失败。提案给出的缺省值是照常发送。本课的场景可以设置这两个值，而它们的区别要在时间线上分辨——照常发送时仍有消息发送到空口上，不发送时整轮作废，而两种情况下锚点都只记录一次超时。' },
    { heading: '等待时间从消息自身的窗口中扣除', text: '每一条窄带消息都有自己的窗口：两个测距时隙（ranging slot），而一条轮询本身要占用其中的 576 µs。可用于等待的只有剩余的部分。若抽到的退避比它还长，本课的处理是把它截断为这段剩余时长（这一步是本课的，草案没有这样规定）——记录中会同时写明抽到的数和实际等待的时长，所以「做了感知、但没有等待」这一情况在记录中可以直接看到。' },
    { heading: '给延迟设定上界，就是预先决定何时停止等待', text: '上界设得小，等待时间短于附近任何一帧；上界设得大，这段时间要从消息自身的窗口中扣除。在本课的场景里两种做法都行不通，而这不是配置不当，而是在时域中等待这种方法本身的固有限制。下面三组数据就是围绕这一点测得的。' },
  ],
  numbers: [
    { kind: 'formula', heading: '上界必须计算，不能照搬', text: '上界 = Σ(i=0…5) [ min(1+i, 5) × 1 µs + 9 µs ] = 74 µs', note: '退避因子从下界 1 起，每判一次忙加一、到上界 5 为止，一共六次感知，每次按 9 µs 记。六段退避加起来最多 20 µs，六次感知记 54 µs。草案让感知时长取物理层（physical layer, PHY）的 CCA 时长属性，没有为窄带写出一个数；9 µs 是本课代入的值，取自 ETSI 对基于帧的设备的最短评估时间，下界、上界与次数则是提案给出的缺省值。' },
    { heading: '提案附录给出的是另一个数', text: '对同一组缺省参数，提案 15-22/0486r5 的附录给出的是 46 µs。代入它的两条旧前提——退避在两倍退避因子范围内抽取（评审意见 489/493 已改为一倍），一次感知按 SSBD 自己的感知时长属性记为 1 µs（评审意见 490/495 已删去这个属性，改用物理层的 CCA 时长；本课代入 9 µs）——同一个公式正好给出 46 µs。所以这不是两套算法，而是一个过时的例子；这个附录是否原样留在现行草案里，本课无法从公开文稿核实。附录里还有一组调整参数后的例子，本课不引用——那一组的参数附录没有给全，无法复现。' },
    { kind: 'formula', heading: '余量也要算', text: '轮询：2 × 500 µs − 576 µs = 424 µs\n报告：2 × 500 µs − 608 µs = 392 µs', note: '一个窄带窗口是两个 500 µs 的测距时隙。轮询本身占 576 µs，报告占 608 µs，所以 424 µs 是这个场景里一次退避可用的最大时长，而报告的窗口余量更小。' },
    { kind: 'table', heading: '四种设置，同一个场景，1.3 秒', head: [
      '设置', '测距成功', '定位', '感知记录',
    ], rows: [
      ['完全关闭先听后发', '47', '5', '—'],
      ['上一课的按块规则', '1', '0', '—'],
      ['SSBD，提案给出的缺省值', '50', '6', '110'],
      ['SSBD，退避取能容纳的最大值', '3', '0', '128'],
    ] },
    { text: '第一行与第二行相差 46 个周期。按块的规则在七个块里判了九次忙，其中七次是手机自己的——每个块一次，每一次损失一个块。所以问题不是缺少后果，而是一个影响范围过大的后果使整个会话的测距几乎全部损失。' },
    { heading: '缺省值恢复了测距，但原因并不是等到了信道空闲', text: '缺省的 74 µs 短于附近任何一帧。这个场景 1.3 秒里有 2291 个 Wi-Fi 数据帧（data frame），最短的一帧空口时间（airtime）75.2 µs，最长的 564.8 µs——没有哪一帧比 74 µs 短。于是退避次数必然用尽，而缺省的收尾动作是照常发送：110 次感知里有 63 次读到的是忙，这 63 次消息仍然发出。测距恢复到 50 次，与不执行先听后发时的 47 次相当。' },
    { kind: 'table', heading: '两个上界，以及需要等待的那些帧', head: [
      '量', '值',
    ], rows: [
      ['算法的延迟上界（缺省参数）', '74 µs'],
      ['六段退避的最大总和', '20 µs'],
      ['窄带消息在自身时隙内的最大推迟量，实测', '16 µs'],
      ['一个轮询窗口的余量', '424 µs'],
      ['场景里最短的 Wi-Fi 数据帧', '75.2 µs'],
      ['场景里最长的 Wi-Fi 数据帧', '564.8 µs'],
      ['2291 帧中长于 424 µs 的', '1887 帧'],
    ] },
    { heading: '把参数调大，恢复的测距反而更少', text: '退避因子设为 7、退避单位设为 60 µs，一次尝试最多等待 420 µs，刚好能容纳在轮询的 424 µs 余量内。结果是三次测距，一次定位也解不出来，还多出 53 次超时。因为这段等待占用的是消息本身也必须容纳在内的那个窗口：128 条记录里有 80 条被截断，其中 52 条实际等待的时长是 0——余量已被同一个时隙内前几次等待用尽。而 424 µs 本来就短于场景里最长的那一帧。' },
    { kind: 'steps', heading: '一个窄带发射时隙上的处理步骤（草案的算法；截断与读数方式是本课的）', items: [
      '把忙次数置 0、退避因子置下界——每进入一个新的发射时隙都重置一次，不跨时隙累积。',
      '在 0 到退避因子之间抽一个数，乘以退避单位，就是这一次的等待时长；若比窗口剩余时长还长，本课把它截断为剩余时长，并记录一次截断（草案没有这一步）。',
      '等待结束后，进行一次空闲信道评估：读取这条 2.5 MHz 信道内的外来功率，与能量检测门限（energy detection threshold）相比——本课只读一个瞬时值，门限草案没有给出，本课取 ETSI 的值。',
      '低于门限就发送，这一次尝试以成功结束；等于或高于门限，忙次数与退避因子各加一，回到第二步。',
      '忙次数超过上限时，按收尾动作处理：照常发送，或者记为一次信道接入失败。',
      '下一个发射时隙从第一步重新开始；两端各自独立计算，即使前后两个时隙使用的是同一条信道。',
    ] },
    { heading: '「算法的上界」不等于「每次都推迟这么久」', text: '74 µs 是最坏情形下的总和，其中 54 µs 是六次感知本身。本课把一次感知取为一个瞬时读数，不占用时长，所以六段退避最多合计 20 µs；这个场景的实测结果是，窄带消息在自身时隙内最多推迟 16 µs。上界应当这样理解：它是算法保证不会超过的限值，不是每一次都要付出的时长。' },
  ],
  deeper: [
    { heading: '门限来自管制规定，而这套规定本身也在变化', text: '草案正文中没有能量检测门限。要求增加门限的评审意见——有的要求一条分段公式，有的要求 −75 dBm/MHz 配合至少 16 µs 的感知时长——都没有写入草案：D04 复审时给它们的处置建议是否决，而采纳这批处置的动议本身在表决中也没有通过（25/14/1），所以草案的文字保持不变；要求规定最短感知时长的意见同样没有写入。本课取的 −75 dBm/MHz（换算到一条 2.5 MHz 的信道上是 −71.02 dBm）来自 ETSI EN 303 687，即欧盟的 6 GHz 协调标准。而这份标准本身也在变化：欧盟 2025/893 号决定已经撤销它对这一类设备的符合性推定，其先听后发流程有待后续版本替换。所以这个数既不是标准给出的，也尚未稳定。' },
    { kind: 'table', heading: '与竞争式测距的随机选择机制有何不同', head: [
      '对比项', '竞争式测距', 'SSBD',
    ], rows: [
      ['是否先感知', '否，标准的竞争式测距不要求先感知', '是，每次尝试感知一次'],
      ['窗口', '时隙数由轮询帧通告，本轮内固定', '线性增大'],
      ['哪一部射频', '超宽带（ultra-wideband, UWB）射频', '窄带射频'],
      ['尝试次数与退避', '标准只给最多尝试次数，没有退避；《控制器不知道有哪些设备在场》一课的跨轮计数是那一课的假设', '在一个时隙内全部用完'],
    ] },
    { heading: '时域中没有能解决这一问题的设置', text: '三组数据归结为一句话：在时域中，任何能容纳在自身时隙内的配置，其等待时间都短于场景里最长的那一帧。D04 的评审中有人直接提问：这两种信道接入方法究竟如何与 Wi-Fi 的信道接入竞争；也有人提出另一种方法——判忙时不等待，而是在时隙内推迟一小段时间，改用另一条窄带信道发送，即提案中的 §10.47。该提案本身尚未纳入正文：它最初答复的那条 D04 评审意见被否决，理由是更换信道会提高失去同步的概率；它的最新版本改为答复 D05 复审中的一条意见，推迟多久、多长的块才允许使用，都成为两端协商的字段——延后时间从 150 µs 到 500 µs 共八档，块长门限从 100 ms 到 400 ms 共四档，本课程每一个多毫秒（multi-millisecond, MMS）场景的 200 ms 块长是其中合法的一档——而这一版的动议已在表决中以 5/4/7 被否。它需要同一个时隙内的两个接收窗口，而本课的设备一个时隙只接收一次。所以本课不包含这一机制。' },
    { heading: '如何核实附录已经过时', text: '计算上界的公式中，有两个量被评审意见修改过：退避的倍数，以及一次感知计入的时长。按现行规则（倍数一倍）并代入本课的 9 µs 感知时长，它给出 74 µs；把倍数改成两倍、感知改成 1 µs，它给出 46 µs，与附录中的数完全相同。两个数出自同一个公式，所以「附录已经过时」这一结论是通过复算得出的，而不是推断。' },
  ],
  limits: [
    { kind: 'model-value', text: '那五个量在草案里是属性，在本课里是场景的设置。本课不经属性库读写它们，所以退避因子的上下界、最大退避次数、退避单位与收尾动作都由场景直接给定，取值属于模型取值。而草案中是六个量，这里只有五个：第六个是持久化——一次新的尝试是否从上一次的终值继续累加——它的定义是「本次是否为一次重传」，而本课的窄带控制面没有重传，一条消息丢失就意味着一个周期作废，所以这一位在这里永远不会为真，本课因此不设这个量。' },
    { kind: 'model-value', text: '判忙所用的门限不是标准给出的。草案正文中没有能量检测门限，要求增加门限的评审意见与要求规定最短感知时长的意见都没有写入草案，所以本课取的 −75 dBm/MHz（换算到 2.5 MHz 得 −71.02 dBm）来自 ETSI EN 303 687 对「基于帧的设备」的规定。而这套规定本身也在变化：欧盟 2025/893 号决定已撤销它对这一类设备的符合性推定，其先听后发流程有待后续版本替换。所以课文中的这个门限既不是标准给出的，也尚未稳定。' },
    { kind: 'out-of-scope', text: '这项感知只能检测到另一种技术的发射。本课的读数只计入 Wi-Fi 一侧正在发射的功率，所以同一个场景里别的 UWB 设备、别的窄带会话、以及本底噪声，都不会使这次感知判忙——本课的 SSBD 能避让 Wi-Fi，却永远无法避让另一台 802.15.4ab 设备。场景里没有 6 GHz Wi-Fi 链路时更为简单：每一次感知都读到空闲，于是它每个时隙照常记录一条、一次也不推迟，避让的发射为零。真实的能量检测无法区分能量来源。' },
    { kind: 'threshold', text: '每次感知只读取一个瞬时值。本课的设备只读一次该 2.5 MHz 频段内的外来功率，用它代替草案援引的至少 9 µs 能量积分，而这一个读数不能反映随后几百微秒内发生的事。所以计算上界时那 9 µs 只是公式中计入的时长，本课的设备并不实际占用它——课文里「六段退避最多 20 µs」与「上界 74 µs」的差额正是这件事。真实的基于帧的设备要在整个评估窗口上积分，也会因此在猝发之间的间隙中读到空闲。' },
  ],
  sources: [
    '本课涉及的条号属于草案，不属于已发布标准。IEEE Std 802.15.4-2024 全文里搜不到 SSBD、spectrum sensing 与 10.45 中的任何一个，第 10 章止于 §10.37；§10.45 这个号出自 P802.15.4ab 草案，PICS 插入项见 15-26/0179r1（MLF9.45 把 SSBD 记在 §10.45 名下，状态为可选）。该草案仅对会员开放，所以本课不转录正文，只引用条号、文稿编号与数值。',
    '算法本身、属性表与附录里那两个延迟例子来自 15-22/0486r5；整节移入第 10 章那一次编辑见 15-24/0010r36；两处改动见 15-24/0121r2——CID 489/493 把退避从两倍退避因子改成一倍、并把取值范围从 1…31 放宽到 1…63，CID 490/495 删掉了 SSBD 自己的感知时长属性、改用物理层的那两个。',
    '「先听后发是有条件的」这一条，可见 15-26/0244r1 的评审决议表：D04 复审中要把 may 改成 shall 的意见，以及要求加能量检测门限、要求规定最短感知时长的意见，处置建议都是否决，而采纳这份决议表的动议以 25/14/1 未获通过（15-26/0348r1），这些意见因此也没有改动草案；更早一轮信函投票中的同类意见，以「未能达成共识」处置（15-26/0061r0）。入口条款 §10.39.8.3 的适用范围见 15-25/0486r1。频率域那条延后的提案正文见 15-26/0365r2（它的 r2 改为答复 D05 的意见 R1-35：延后时间 150–500 µs 共八档与块长门限 100–400 ms 共四档出自它的两张表，延后信道改成允许清单里按偏移量取的那一条；这一版的动议以 5/4/7 被否，两条意见仍开着），它是提案中的 §10.47，不是 §10.45。',
    '以下是法规：−75 dBm/MHz 的门限与至少 9 µs 的感知时长出自 ETSI EN 303 687 对「基于帧的设备」的规定；该标准对这一类设备的符合性推定已被欧盟 2025/893 号决定撤销，这一点记在 15-25/0307r1。',
    '以下是模型取值：那五个量在草案里是属性，在本课里是场景的设置；一次感知只读一个瞬时值，代替规则要求的至少 9 µs 积分；门限换算到 2.5 MHz 得 −71.02 dBm 是本课的读法；把 9 µs 作为感知时长代入上界公式、把退避截断为窗口余量，也都是本课的取法；窄带信道中心频率与按块选取信道的做法沿用上一课，同样是模型取值。',
  ],
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
    J('第一次解算出的定位', firstUwbPosition),
  ],
  observe: [
    '0.009 ms 处是第一条感知记录：“uwb-1 slot 0 ch 200: sensed -57.7 dBm against -71.0 dBm, backoff 5/5, waited 3.0 µs — txOnEnd”。读数高于门限，退避次数已经用尽，于是这条轮询仍在 0.009 ms 发出。',
    '1.000 ms 处是锚点 1 自己的感知：“anchor-1 slot 2 ch 200: sensed -75.0 dBm against -71.0 dBm, backoff 0/1, no wait — idle”。它距那台正在上传的笔记本较远，读数低于门限，于是第一次感知后即结束。两端各自感知，结果可以不同。',
    '手机的检视面板上，「频谱感知延后」一行写着「55 次感知 · 共等 108.0 µs」，而「先听后发」那一行不会出现——两种方法只能二选一，不会同时使用。',
  ],
  tryThis: [
    '依次载入另外三个场景，只看「测距成功」这一个数。「上一课的按块规则」：九次判忙、一个距离，一次定位也解不出来。「完全关闭先听后发」：47 个距离、5 次定位——这就是缺省值要达到的基准。「退避取能容纳的最大值」：三个距离、53 次超时，而记录里有 80 条截断。三个场景归结为一句话：上界小了，等待时间不够长；上界大了，消息自身被挤出窗口。',
  ],
  quiz: [
    {
      q: '按上一课的按块规则，1.3 秒七个块里只测得一个距离；按提案给出的缺省值启用 SSBD 之后，测距恢复到 50 次。原因是什么？',
      options: [
        '缺省的 74 µs 上界足以等到附近的 Wi-Fi 帧结束',
        '74 µs 短于场景里任何一帧，所以退避次数必然用尽，而缺省的收尾动作是照常发送——它改变的是后果的单位，而不是等到了信道空闲',
        '启用 SSBD 之后感知所用的门限被提高，于是判忙次数减少',
      ],
      answer: 1,
      explain: '110 次感知里有 63 次读到的是忙，这 63 次消息都仍然发出。这个场景里最短的 Wi-Fi 数据帧是 75.2 µs，没有哪一帧短于 74 µs。改变的是「一次判忙损失一个 200 ms 的块」这个单位，改为「一次判忙损失一次退避」。',
    },
    {
      q: '把退避因子设为 7、退避单位设为 60 µs，一次尝试最多等待 420 µs，刚好能容纳在轮询的 424 µs 余量内。结果如何？',
      options: [
        '测距成功次数介于按块规则与缺省值之间',
        '三次测距、一次定位也没有，还多出 53 次超时：这段等待占用的是消息本身也必须容纳在内的那个窗口，而 424 µs 短于场景里最长的那一帧（564.8 µs）',
        '与缺省值相同，因为上界不影响实际等待的时长',
      ],
      answer: 1,
      explain: '128 条记录里有 80 条被截断，其中 52 条实际等待的时长是 0。在时域中，没有任何一个能容纳在自身时隙内的设置，其等待时间能超过附近最长的那一帧——这正是后来有人提出在频域中延后的原因。',
    },
  ],
}
