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
  module: 27,
  title: '有界的延后，和它界不住的那个帧',
  why: '上一课那条规矩有一个过宽的后果：窄带（narrowband, NB）信道上量到一次忙，这台设备在整整一个测距块（ranging block）里不再发出任何控制消息，而一个块是 200 ms。而先听后发（listen before talk, LBT）这件事，在这份草案里本来是可选的——有十三条评审意见要把它改成强制，十三条全部被否决——真正要求「必须先听」的是管制，不是标准。草案另给了一条路：每一个窄带发射时隙上各感知一次，判忙就退避（backoff）一次再问，问到次数用尽，再由一个收尾动作决定照发还是算一次信道接入失败；整套动作的延迟带着一个上界。这一课把这个上界算出来，再看它在一间摆着忙碌路由器的屋子里能不能等过去。',
  outcomes: [
    '把一次信道接入的延迟上界算出来，并说明草案附录里登的那个数为什么不能照抄',
    '分清「算法的上界」与「引擎真正等掉的那段时长」是两个不同的量',
    '说明把退避调大之后，测距成功次数为什么反而变少',
  ],
  needs: ['uwb-nba-coexist', 'uwb-contention'],
  terms: [
    { term: 'SSBD', plain: '频谱感知延后：每一个窄带发射时隙上各感知一次信道，判忙就等一小会儿再问' },
    { term: 'backoff factor', plain: '退避因子：判忙一次就加一；这一次要等多久，就在 0 到它之间随机抽一个数' },
    { term: 'end action', plain: '收尾动作：退避次数用尽那一刻，是照发，还是算一次信道接入失败' },
    { term: 'latency bound', plain: '延迟上界：所有退避与所有感知加起来的最坏情形，不是每一次都要付的时长' },
    { term: 'slack', plain: '余量：一个窄带窗口的长度，减去消息自己要占的那一段，剩下的才是可以用来等的部分' },
  ],
  picture: [
    { heading: '换掉的是后果的单位，不是补一个缺失的后果', text: '按今天这条路，一次判忙让设备把这个块余下的部分整个跳过：没有轮询就没有一轮对话，锚点（anchor）们按时到场、干等、超时。草案要的不是这个。它要的是两端各自、在每一个发射时隙上各做一次信道接入。于是这一刀换掉的是后果的单位：从一个 200 ms 的块，换成一个 500 µs 的时隙。' },
    { heading: '一次尝试里，退避是怎么长起来的', text: '设备维护两个数：忙次数，和退避因子。每一次空闲信道评估（clear channel assessment, CCA）之前，它在 0 到退避因子之间抽一个数，按这个数乘上退避单位等一段。读到空闲就立刻发；读到忙，两个数各加一，再抽一次、再等一次。退避因子每判一次忙加一、到上界为止——所以这不是成倍翻的窗口，是线性长大的窗口。' },
    { kind: 'watch', jump: 0, heading: '看一次判忙之后它照样发了出去', text: '载入仿真、按下播放，再跳到第一条感知记录。那一行写着它量到的电平、用来比对的门限、两个计数器，以及这一次等掉的时长——而末尾写着照发。这条路不是把消息拦下来，它是在拦下来之前先把次数问够。' },
    { heading: '退避次数用尽那一刻', text: '次数用尽之后只有两种收场，由收尾动作定：照发，算一次成功；或者不发，算一次信道接入失败。草案的缺省值是照发。两个值在本引擎里都配得出来，而它们的区别要在时间线上分辨——照发那一条还有消息上空口，不发那一条整轮作废，而两边的锚点都只记下一次超时。' },
    { heading: '这段等待是从消息自己的窗口里扣的', text: '每一条窄带消息都有自己的窗口：两个测距时隙（ranging slot），而一条轮询自己要占掉其中的 576 µs。能用来等的只是剩下的那一段。退避若抽到比它还长，就只能截到这一段的长度——记录里会同时写下抽到的数和真正等掉的时长，所以「感知做了、等待没有」这件事是看得见的，不是藏起来的。' },
    { heading: '给延迟定上界，就是提前决定不再等', text: '上界定得小，它等不过身边任何一帧；上界定得大，这段时间要从消息自己的窗口里扣。两头都不通，而这不是配置没调好，是这条路本身的形状。下面三组数就是沿着这条线量出来的。' },
  ],
  numbers: [
    { kind: 'formula', heading: '上界要算，不能抄', text: '上界 = Σ(i=0…5) [ min(1+i, 5) × 1 µs + 9 µs ] = 74 µs', note: '退避因子从下界 1 起，每判一次忙加一、到上界 5 为止，一共六次感知，每次按 9 µs 记。六段退避加起来最多 20 µs，六次感知记 54 µs。' },
    { heading: '草案自己的附录，登的是另一个数', text: '同一组缺省参数，附录上登的是 46 µs。把两个被评审意见推翻的前提装回去——退避抽两倍退避因子而不是一倍，一次感知记 1 µs 而不是 9 µs——同一个式子正好给出 46 µs。所以这不是两套算法，是一份过期的例子：标准自己的附录没有跟着那两次修改一起改。附录里还有一组调参之后的例子，本课不引它——那一组的参数附录没有写全，复不出来。' },
    { kind: 'formula', heading: '余量也要算', text: '轮询：2 × 500 µs − 576 µs = 424 µs\n报告：2 × 500 µs − 608 µs = 392 µs', note: '一个窄带窗口是两个 500 µs 的测距时隙。轮询自己占 576 µs，报告占 608 µs，所以 424 µs 是这个场景里一次退避能有的最大空间，而报告那一格更紧。' },
    { kind: 'table', heading: '四种设置，同一个场景，1.3 秒', head: [
      '设置', '测距成功', '定位', '感知记录',
    ], rows: [
      ['先听后发整个关掉', '47', '5', '—'],
      ['今天这条按块的规则', '1', '0', '—'],
      ['SSBD，草案的缺省值', '50', '6', '110'],
      ['SSBD，退避开到塞得进去的最大', '3', '0', '128'],
    ] },
    { text: '第一行与第二行之间是 46 个周期。按块那条规则在七个块里判了九次忙，其中七次是手机自己的——每个块一次，每一次赔掉一个块。所以它不是少了一个后果，是一个过宽的后果几乎把整个会话的测距都损失掉了。' },
    { heading: '缺省值把它们拿回来了，而原因不是它等过去了', text: '缺省那 74 µs 等不过身边任何一帧。这个场景 1.3 秒里有 2291 个 Wi-Fi 数据帧（data frame），最短的一帧空口时间（airtime）75.2 µs，最长的 564.8 µs——没有哪一帧比 74 µs 短。于是退避次数必然用尽，而缺省的收尾动作是照发：110 次感知里有 63 次读到的是忙，63 次照样发了出去。测距回到 50 次，与不听的那 47 次相当。' },
    { kind: 'table', heading: '两个上界，和它们要等过去的那些帧', head: [
      '量', '值',
    ], rows: [
      ['算法的延迟上界（缺省参数）', '74 µs'],
      ['六段退避最多加起来', '20 µs'],
      ['窄带消息在自己时隙里的最大位移，实测', '16 µs'],
      ['一个轮询窗口的余量', '424 µs'],
      ['场景里最短的 Wi-Fi 数据帧', '75.2 µs'],
      ['场景里最长的 Wi-Fi 数据帧', '564.8 µs'],
      ['2291 帧里长于 424 µs 的', '1887 帧'],
    ] },
    { heading: '把旋钮调大，拿回来的反而更少', text: '退避因子按 7 配、退避单位按 60 µs 配，一次尝试最多等 420 µs，刚好塞进轮询那 424 µs 的余量。结果是三次测距，一次定位也解不出来，还多出 53 次超时。因为这段等待花在消息自己还必须塞进去的那个窗口里：128 条记录里有 80 条被截断，其中 52 条真正等掉的时长是 0——抽到的数早被同一个时隙里前几次等光了。而 424 µs 本来就短于场景里最长的那一帧。' },
    { kind: 'steps', heading: '一个窄带发射时隙上，这套动作一步一步来', items: [
      '把忙次数置 0、退避因子置下界——每进一个新的发射时隙都重置一次，不跨时隙累积。',
      '在 0 到退避因子之间抽一个数，乘上退避单位，就是这一次要等的时长；比窗口剩下的还长，就截到剩下的那一段，并记一条截断。',
      '等完，做一次空闲信道评估：读一下这条 2.5 MHz 信道里的外来功率，与能量检测门限（energy detection threshold）相比。',
      '低于门限就发，这一次尝试以成功结束；等于或高于，忙次数与退避因子各加一，回到第二步。',
      '忙次数超过上限时，按收尾动作收场：照发，或者记一次信道接入失败。',
      '下一个发射时隙从第一步重新开始；两端各自算自己的，即便前后两个时隙用的是同一条信道。',
    ] },
    { heading: '「算法的上界」不是「引擎会延后这么多」', text: '74 µs 是最坏情形的和，而其中 54 µs 是六次感知本身。本引擎的那一次感知只读一个瞬时值，不占时长，所以六段退避最多加起来 20 µs；这个场景实测下来，窄带消息在自己时隙里最多挪后 16 µs。上界要这么读：它是算法承诺不超过的那条线，不是每一次都要付出的时长。' },
  ],
  deeper: [
    { heading: '门限是管制数，而那套制度自己也在变', text: '草案正文里没有能量检测门限。要求加一个的评审意见——有的要一条分段公式，有的要 −75 dBm/MHz 配至少 16 µs 的感知时长——全部被否决；要求规定最短感知时长的三条同样被否决。本引擎取的 −75 dBm/MHz（摊到一条 2.5 MHz 的信道上是 −71.02 dBm）来自 ETSI EN 303 687，欧盟那份 6 GHz 的协调标准。而这份标准自己也在动：欧盟 2025/893 号决定已经撤销它对这一类设备的符合性推定，其先听后发流程要等一个后续版本来替换。所以这个数既不是标准给的，也不是已经稳定下来的。' },
    { kind: 'table', heading: '和竞争式测距那套抽签，差别在哪', head: [
      '对比的那一项', '竞争式测距', 'SSBD',
    ], rows: [
      ['先感知吗', '不，锚点听不见别的锚点', '是，每次尝试一次感知'],
      ['窗口', '固定宽', '线性长大'],
      ['哪一部射频', '超宽带（ultra-wideband, UWB）射频', '窄带射频'],
      ['这份预算花在哪', '跨轮，一轮一次尝试', '一个时隙之内全部花完'],
    ] },
    { heading: '时间域里没有一个能解决它的设置', text: '三组数合起来是一句话：在时间域里，任何塞得进自己时隙的配置都等不过场景里最长的那一帧。D04 的评审里有人直接问这两种信道接入方法到底怎么与 Wi-Fi 的信道接入竞争；也有人另提一条路——判忙时不等，而是在时隙内 200 µs 处改用跳频序列里的下一条信道，即提案中的 §10.47。那条提案本身还没有进正文，它所答复的那条评审意见在 D04 上被否决了，理由是换信道会抬高失同步的概率；而它自己的前提是测距块不超过 100 ms，本仓库每一个多毫秒（multi-millisecond, MMS）场景的块长都是 200 ms。所以它是另外一刀。' },
    { heading: '那份附录过期，是怎么核出来的', text: '引擎里算上界的那个函数带着两个只给对照用的开关：退避的倍数，和一次感知记多少。按现行文字（倍数一倍、感知 9 µs）它给出 74 µs；把倍数改成两倍、感知改成 1 µs，它给出 46 µs，与附录上那个数逐位相同。两个数出自同一个式子，所以「附录过期」这件事是复算出来的，不是推断出来的。' },
  ],
  limits: [
    { kind: 'model-value', text: '那五个量在标准里是属性，在本引擎里是场景配置。本引擎一条属性库条目也没有，所以退避因子的上下界、最大退避次数、退避单位与收尾动作都落成会话配置的字段，照 rcmValidityRounds 已有的理由标为模型取值。而草案是六个量，这里只有五个：第六个是持久化——一次新的尝试要不要接着上一次的终值往上走——它的定义是「本次是不是一次重传」，而本引擎的窄带控制面没有重传，一条丢掉的消息就是一个丢掉的周期，所以这一位在这里永远取不到真，建成一个只能取一个值的开关没有意义。' },
    { kind: 'model-value', text: '判忙用的那条门限不是标准给的。草案正文里没有能量检测门限，要求加一个的评审意见与要求规定最短感知时长的意见全部被否决，所以本引擎取的 −75 dBm/MHz（摊到 2.5 MHz 得 −71.02 dBm）来自 ETSI EN 303 687 对「基于帧的设备」的规定。而这套制度自己也在变：欧盟 2025/893 号决定已撤销它对这一类设备的符合性推定，其先听后发流程要等一个后续版本来替换。所以课文里那条线既不是标准给的，也不是已经稳定下来的。' },
    { kind: 'out-of-scope', text: '这次感知只听得见另一种技术。engine/spectrum.ts 的 foreignMw 只累加中介另一侧（Wi-Fi）正在发射的东西，所以同一个场景里别的 UWB 设备、别的窄带会话、以及本底噪声，在这条规则眼里一概不存在——本引擎的 SSBD 躲得开 Wi-Fi，永远躲不开另一台 802.15.4ab 设备。场景里没有 6 GHz Wi-Fi 链路时更干脆：没有中介，每一次感知都读到空闲，于是它每个时隙据实报一条、一次也不延后，躲开的东西是零。真实的能量检测分不清能量是谁的。' },
    { kind: 'threshold', text: '那次感知只读一个瞬时值。uwb/channel.ts 的 lbtBusy 向中介要一次该 2.5 MHz 频段内的外来功率，用它代替草案援引的至少 9 µs 能量积分，而这一个读数对随后几百微秒里发生的事什么也没说。所以算上界时那 9 µs 只是式子里计入的时长，引擎并不真的花掉它——课文里「六段退避最多 20 µs」与「上界 74 µs」的差额正是这件事。真实的帧基设备要在整个评估窗上积分，也会因此在猝发之间的缝隙里读到空闲。' },
  ],
  sources: [
    '这一刀的条号属于草案，不属于已发布标准。IEEE Std 802.15.4-2024 全文里搜不到 SSBD、spectrum sensing 与 10.45 中的任何一个，第 10 章止于 §10.37；§10.45 这个号出自 P802.15.4ab 草案，PICS 插入项见 15-26/0179r1（MLF9.45 把 SSBD 记在 §10.45 名下，状态为可选）。该草案仅对会员开放，所以本课不抄正文，只引条号、文稿编号与数值。',
    '算法本身、属性表与附录里那两个延迟例子来自 15-22/0486r5；整节移入第 10 章那一次编辑见 15-24/0010r36；两处改动见 15-24/0121r2——CID 489/493 把退避从两倍退避因子改成一倍、并把取值范围从 1…31 放宽到 1…63，CID 490/495 删掉了 SSBD 自己的感知时长属性、改用物理层的那两个。',
    '「先听后发是可选的」这一条出自 15-26/0244r1 的评审决议表：十三条要把 may 改成 shall 的意见全部被否决，同一份表里要求加能量检测门限、要求规定最短感知时长的意见也全部被否决。入口条款 §10.39.8.3 的适用范围见 15-25/0486r1。频率域那条延后的提案正文见 15-26/0365r0，它是提案中的 §10.47，不是 §10.45。',
    '以下是法规：−75 dBm/MHz 的门限与至少 9 µs 的感知时长出自 ETSI EN 303 687 对「基于帧的设备」的规定；该标准对这一类设备的符合性推定已被欧盟 2025/893 号决定撤销，这一点记在 15-25/0307r1。',
    '以下是模型取值：那五个量在标准里是属性，在本引擎里是场景配置；一次感知只读一个瞬时值，代替规则要求的至少 9 µs 积分；门限摊到 2.5 MHz 得 −71.02 dBm 是本引擎的读法；窄带信道中心频率与按块抽信道的做法沿用上一课，同样是模型取值。',
  ],
  scenario: () => uwbSsbdScenario('defaults'),
  variants: [
    { label: '今天这条按块的规则', scenario: () => uwbSsbdScenario('perBlock') },
    { label: '退避开到塞得进去的最大', scenario: () => uwbSsbdScenario('biggest') },
    { label: '先听后发整个关掉', scenario: () => uwbSsbdScenario('off') },
  ],
  jumps: [
    J('退避用尽之后照样发出去的那一次感知', firstUwbSsbdTxOnEnd),
    J('一次读到空闲的感知', firstUwbSsbdIdle),
    J('整段运行里第一个发得出去的距离', firstUwbRange),
    J('第一次解出来的定位', firstUwbPosition),
  ],
  observe: [
    '0.009 ms 处是第一条感知记录：“uwb-1 slot 0 ch 200: sensed -57.7 dBm against -71.0 dBm, backoff 5/5, waited 3.0 µs — txOnEnd”。读数高过门限，退避次数已经用尽，于是这条轮询照样在 0.009 ms 发了出去。',
    '1.000 ms 处换成锚点 1 自己的那一次：“anchor-1 slot 2 ch 200: sensed -75.0 dBm against -71.0 dBm, backoff 0/1, no wait — idle”。它离那台正在上传的笔记本远些，读数低于门限，于是第一次感知就结束。两端各自感知，答案可以不同。',
    '手机的检视面板上，「频谱感知延后」一行写着「55 次感知 · 共等 108.0 µs」，而「先听后发」那一行根本不出现——两条路是二选一，不会同时走。',
  ],
  tryThis: [
    '把另外三个场景依次载入，只读「测距成功」这一个数。「今天这条按块的规则」：九次判忙、一个距离，一次定位也解不出来。「先听后发整个关掉」：47 个距离、5 次定位——这就是缺省值要追上的那条线。「退避开到塞得进去的最大」：三个距离、53 次超时，而记录里有 80 条截断。三个场景合起来是一句话：上界小了等不过去，上界大了把自己挤出窗口。',
  ],
  quiz: [
    {
      q: '按今天这条按块的规则，1.3 秒七个块里只量到一个距离；把 SSBD 按草案缺省值打开之后，测距回到 50 次。原因是什么？',
      options: [
        '缺省那 74 µs 的上界足够等过身边的 Wi-Fi 帧',
        '74 µs 等不过场景里任何一帧，所以退避次数必然用尽，而缺省的收尾动作是照发——它改回来的是后果的单位，不是它真的等过去了',
        '打开 SSBD 之后感知用的门限被抬高了，于是读到的忙变少',
      ],
      answer: 1,
      explain: '110 次感知里有 63 次读到的是忙，63 次都照样发了出去。这个场景里最短的 Wi-Fi 数据帧是 75.2 µs，没有哪一帧短于 74 µs。换掉的是「一次忙赔一个 200 ms 的块」这个单位，换成「一次忙赔一次退避」。',
    },
    {
      q: '把退避因子配到 7、退避单位配到 60 µs，一次尝试最多等 420 µs，刚好塞进轮询那 424 µs 的余量。结果如何？',
      options: [
        '测距成功次数落在按块那条规则与缺省值之间',
        '三次测距、一次定位也没有，还多出 53 次超时：这段等待花在消息自己还必须塞进去的那个窗口里，而 424 µs 短于场景里最长的那一帧（564.8 µs）',
        '与缺省值相同，因为上界不影响真正等掉的时长',
      ],
      answer: 1,
      explain: '128 条记录里有 80 条被截断，其中 52 条真正等掉的时长是 0。在时间域里，没有哪一个塞得进自己时隙的设置能等过身边最长的那一帧——这正是后来有人把延后提到频率域的原因。',
    },
  ],
}
