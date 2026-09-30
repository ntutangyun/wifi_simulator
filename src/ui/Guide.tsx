/** Compact learning guide tying real 802.11 mechanisms to what the sim shows. */
import {
  AMP_BS_ACTIVATION_DBM, AMP_BS_ISOLATION_DB, AMP_BS_LOSS_DB, AMP_BS_READER_DR_DB,
  activationReachM, monoReachM,
} from '../engine/ampBs'
import { FADING_DEFAULTS, RICIAN_K_DEFAULT_DB } from '../engine/fading'
import { DEFAULT_SIX_GHZ_CENTER_MHZ, DEFAULT_UWB_SESSION, sixGhzChannelNo } from '../model/scenario'
import { AOA_SIGMA_CLAMP_DEG, AOA_SIGMA_PHI_RAD, aoaSigmaDeg, antennaSpacingM } from '../uwb/aoa'
import {
  MMS_COMBINE_MAX_DB, MMS_FIXED_REPLY_RSTU_MAX, MMS_FIXED_REPLY_RSTU_MIN, MMS_SETS,
  MMS_SLOTS_PER_MS, MMS_SP0_MBPS, MMS_SP0_NS, MMS_SP0_PENALTY_DB, MMS_SP0_SEGMENT_NS, MS_RSTU,
  UWB_MS_BUDGET_NJ, mmsFragmentDbm, mmsLayout, rifNs, rsfNs,
} from '../uwb/mms'
import {
  NB_CHANNELS, NB_CHANNEL_MHZ, NB_LBT_CCA_US, NB_LBT_EDT_DBM_PER_MHZ, NB_LBT_THRESHOLD_DBM,
  NB_POLL_BYTES, NB_REPORT_BYTES, NB_RESP_BYTES, NB_RX_SENS_DBM, NB_TX_DBM, nbCenterMhz, nbPpduNs,
} from '../uwb/nb'
import {
  UWB_BAND_MHZ, UWB_BLINK_BYTES, UWB_CAPTURE_DB, UWB_CHIP_NS, UWB_MAX_INPUT_DBM_PER_MHZ, UWB_RX_SENS_DBM,
  UWB_SIR_MIN_DB, UWB_SS_DEFER_BYTES, UWB_TX_POWER_DBM, rstuNs, uwbFinalBytes, uwbM2mBytes, uwbMaxAnchors,
  uwbMaxParticipants, uwbRespBytes,
} from '../uwb/phy'
import { roundPlan } from '../uwb/session'
import { ELLIPSE_DRAW_SCALE } from '../uwb/view'
import {
  ECHO_IDEAL_10M_UNDER_FLOOR_DB, ECHO_IDEAL_2M_OVER_FLOOR_DB, ECHO_NEAR_LINE, ECHO_OFF_LINE,
  ECHO_RESOLUTION_M, SCATTERER_DEFAULT_DB,
} from './echoFacts'

const h: React.CSSProperties = { margin: '10px 0 3px', fontSize: 12.5, color: '#d5dae3' }
const p: React.CSSProperties = { margin: '2px 0', fontSize: 11.5, color: 'var(--dim)', lineHeight: 1.5 }
const chip = (color: string) => (
  <span style={{ display: 'inline-block', width: 9, height: 9, background: color, borderRadius: 2, marginRight: 4 }} />
)
/** ASCII hyphen-minus to Unicode minus, for a JS negative number dropped straight into prose. */
const dbFmt = (v: number): string => String(v).replace('-', '−')
/** The reply reach at each UL rate (independent of BS power) and the activation reach at the
 * model default and the "reader at 20 dBm" variant, so the Guide's prose can never drift from
 * the closed forms `ampBs.ts` actually computes. */
const AMP_BS_REACH_250_CM = (monoReachM(0, 250) * 100).toFixed(1)
const AMP_BS_REACH_1000_CM = (monoReachM(0, 1000) * 100).toFixed(1)
const AMP_BS_ACTIVATION_10_CM = (activationReachM(10) * 100).toFixed(1)
const AMP_BS_ACTIVATION_20_CM = (activationReachM(20) * 100).toFixed(1)
const UWB5_LO = UWB_BAND_MHZ[5].lo
const UWB5_HI = UWB_BAND_MHZ[5].hi
const UWB9_LO = UWB_BAND_MHZ[9].lo
const UWB9_HI = UWB_BAND_MHZ[9].hi
const SIX_GHZ_DEFAULT_CH = sixGhzChannelNo(DEFAULT_SIX_GHZ_CENTER_MHZ)
const AOA_ANTENNA_SPACING_CM = (antennaSpacingM(9) * 100).toFixed(1)
const AOA_SIGMA_BORESIGHT_DEG = aoaSigmaDeg(0).toFixed(1)
const AOA_SIGMA_60_DEG = aoaSigmaDeg(60).toFixed(1)

// --- Section 15: reply time / round-trip time, standard §10.29.6.3–.7 ------------------------
// Every frame size and every anchor cap below is read off the engine's own frame builders and
// `uwbMaxAnchors`, so the table cannot drift from what a round actually sends.
const RT_SS_RESP_EMBEDDED = uwbRespBytes('ss', 'embedded') // 20
const RT_SS_RESP_FIXED = uwbRespBytes('ss', 'fixed') // 14
const RT_SS_DEFER_MSG = UWB_SS_DEFER_BYTES // 17
/** The anchor count the design doc's own worked example uses for the DS Final row. */
const RT_DS_ANCHORS = 9
const RT_DS_FINAL_EMBEDDED = uwbFinalBytes(RT_DS_ANCHORS, 'embedded') // 122
const RT_DS_FINAL_DEFERRED = uwbFinalBytes(RT_DS_ANCHORS, 'deferred') // 32
const RT_CAP_DS_EMBEDDED = uwbMaxAnchors('twr', 'ds', 'embedded', 'time') // 9
const RT_CAP_DS_DEFERRED = uwbMaxAnchors('twr', 'ds', 'deferred', 'time') // 33
const RT_CAP_SS = uwbMaxAnchors('twr', 'ss', 'embedded', 'time') // 33 — same for all three SS shapes

// --- Section 16: many-to-many ranging, standard §10.32.6 SS / §10.32.7 DS ---------------------
// Every slot count is `roundPlan`'s own answer — the same function the editor's plan line calls —
// and the frame sizes and the participant cap are `uwbM2mBytes`/`uwbMaxParticipants`, never a
// copied table. `tests/ui/uwb-guide.test.ts` runs whole rounds for N = 3/4/6 and for the
// DS-against-SS accuracy claim, so a drift in the engine fails there rather than going unnoticed.
const M2M_NS = [3, 4, 6] as const
const m2mSlots = (n: number, method: 'ss' | 'ds'): number =>
  roundPlan({ ...DEFAULT_UWB_SESSION, mode: 'm2m', method }, n).slots
/** N one-to-many rounds, one per device taking its turn as the tag — the arrangement many-to-many
 * replaces. Each round has `n − 1` anchors, so `roundPlan` at `n − 1` gives its length. */
const takingTurnsSlots = (n: number): number =>
  n * roundPlan({ ...DEFAULT_UWB_SESSION, mode: 'twr', method: 'ss', replyTime: 'embedded' }, n - 1).slots
const pairsOf = (n: number): number => (n * (n - 1)) / 2
const perParticipant = (n: number): number[] => Array.from({ length: n }, (_, i) => n - 1 - i)
const M2M_CAP = uwbMaxParticipants('ss') // 27 — uwbMaxParticipants('ds') searches the same frame law
const M2M_BYTES_N6 = Array.from({ length: 6 }, (_, i) => uwbM2mBytes(i)) // 20/26/30/34/38/42

// --- Section 12: the P802.15.4ab draft ------------------------------------------------------
// Every figure below is computed from `src/uwb/mms.ts` and `src/uwb/nb.ts`, so the prose cannot
// drift from the engine; the tags in the prose say where each one comes from.
const MMS = DEFAULT_UWB_SESSION.mms
const us = (ns: number): string => (ns / 1000).toFixed(2)
const dbmFmt = (v: number): string => v.toFixed(2).replace('-', '−')
/** The session default's RSF (X = 8, N_MSR 40, gap 64 — 4ab draft 0381r5 Table 1.2.3.3). */
const MMS_RSF_US = us(rsfNs(MMS.nMsr, MMS.gap)) // 82.05
const MMS_RSF1_US = us(rsfNs(MMS_SETS['rsf-1'].nMsr, MMS_SETS['rsf-1'].gap)) // 62.18
const MMS_RSF10_US = us(rsfNs(MMS_SETS['rsf-10'].nMsr, MMS_SETS['rsf-10'].gap)) // 65.64
const MMS_MIXED_US = us(rsfNs(MMS_SETS['mixed-1'].nMsr, MMS_SETS['mixed-1'].gap)) // 91.28
const MMS_RIF_US = us(rifNs(MMS.stsLen)) // 65.64
const MMS_RSF_DBM = dbmFmt(mmsFragmentDbm(rsfNs(MMS.nMsr, MMS.gap))) // −3.46
const MMS_RSF1_DBM = dbmFmt(mmsFragmentDbm(rsfNs(MMS_SETS['rsf-1'].nMsr, MMS_SETS['rsf-1'].gap))) // −2.25
const MMS_COMBINE_DB = MMS_COMBINE_MAX_DB.toFixed(2) // 12.04
const MMS_SLOTS = mmsLayout(MMS).slots // 28
const MMS_SET_COUNT = Object.keys(MMS_SETS).length // 17
// The draft's own default ranging slot: one millisecond split into `MMS_SLOTS_PER_MS` slots.
// Every slot count below is laid out at it, which is what the prose says it quotes.
const MMS_DRAFT_SLOT_RSTU = MS_RSTU / MMS_SLOTS_PER_MS // 600
const slotMs = (slots: number): string => String((slots * rstuNs(MMS_DRAFT_SLOT_RSTU)) / 1e6)
/** The pairwise round under each of the three control planes (4ab draft 15-25/0194r0). */
const MMS_SLOTS_SP0 = mmsLayout({ ...MMS, control: 'uwbd' }).slots // 24
const MMS_SLOTS_NO_CTRL = mmsLayout({ ...MMS, control: 'uwbd', uwbdControl: 'none' }).slots // 22
/** What the non-interleaved shape of §10.39.7 costs, pairwise and at three responders. */
const MMS_SLOTS_NONINT = mmsLayout({ ...MMS, nonInterleaved: true }).slots // 48
const MMS_SLOTS_3R = mmsLayout(MMS, 3).slots // 52
const MMS_SLOTS_3R_NONINT = mmsLayout({ ...MMS, nonInterleaved: true }, 3).slots // 100
/** The SP0 control packet, segment by segment and in total (4ab draft 15-25/0194r0). */
const us1 = (ns: number): string => (ns / 1000).toFixed(1)
const SP0 = MMS_SP0_SEGMENT_NS
const MMS_SP0_US = us1(MMS_SP0_NS) // 117.6
const NB_POLL_US = (nbPpduNs(NB_POLL_BYTES) / 1000).toFixed(0) // 576
const NB_RESP_US = (nbPpduNs(NB_RESP_BYTES) / 1000).toFixed(0) // 576
const NB_REPORT_US = (nbPpduNs(NB_REPORT_BYTES) / 1000).toFixed(0) // 608
const NB_LBT_DBM = dbmFmt(NB_LBT_THRESHOLD_DBM) // −71.02
const NB_CH0_MHZ = nbCenterMhz(0) // 5726.25
const NB_CH50_MHZ = nbCenterMhz(50) // 5926.25

const cellHead: React.CSSProperties = {
  textAlign: 'left', padding: '2px 6px 2px 0', color: '#c3cad6', fontWeight: 600, whiteSpace: 'nowrap',
}
const cell: React.CSSProperties = { textAlign: 'left', padding: '2px 6px 2px 0', verticalAlign: 'top' }
const table: React.CSSProperties = {
  ...p, borderCollapse: 'collapse', margin: '4px 0 6px', width: '100%',
}

/** The guide body. */
export function Guide() {
  return (
    <div style={{ padding: '4px 12px 16px', overflowY: 'auto', fontSize: 12 }}>
      <h3 style={{ ...h, fontSize: 13 }}>Wi-Fi 如何共享空口</h3>
      <p style={p}>
        Wi-Fi 没有中心时钟，介质上也没有统一的调度器：每台设备都遵循
        <b> CSMA/CA</b>（载波侦听多路访问/冲突避免）——先听信道，等一段静默间隔，
        再随机倒数若干个 9 µs 时隙后才发送。本仿真器中你看到的一切现象都源于这条规则
        （IEEE 802.11-2024 §10.3）。
      </p>

      <h4 style={h}>1 · 载波侦听——“有人在说话吗？”</h4>
      <p style={p}>
        <b>物理载波侦听（CCA）：</b>当收到高于 −82 dBm 的可解码前导，或总能量超过 −62 dBm 时，
        介质即为“忙”。墙体会衰减信号，因此一个终端可能<i>听不到</i>另一个终端
        （隐藏节点）——把终端拖到砖墙后面，就能在 AP 处看到碰撞。
      </p>
      <p style={p}>
        <b>虚拟载波侦听（NAV）：</b>{chip('#9333ea')}每个帧都携带 Duration（持续时间）字段，
        宣告整个帧交换还要占用多久。侦听到的设备会设置一个计时器（NAV），
        即使信道已经安静下来也保持沉默。
      </p>

      <h4 style={h}>2 · 帧间间隔（IFS）——用静默长短区分优先级</h4>
      <p style={p}>
        <b>SIFS</b>（16 µs）：帧交换内部的最短间隔——ACK 恰好在数据帧结束后一个 SIFS 发出，
        因此没人能插队。<b>DIFS/AIFS</b>（34 µs / 按接入类别）：参与竞争前必须观察到的较长静默。
        <b>EIFS</b>(94 µs)：听到损坏帧之后的“惩罚性”等待。
      </p>

      <h4 style={h}>3 · 随机退避 {chip('#f59e0b')}</h4>
      <p style={p}>
        每个竞争者从 [0, CW] 中随机抽取一个计数值，介质每空闲一个时隙就减 1——
        注意节点上方的 <b>bo:n</b> 标签。最先减到 0 的先发送。失败时 CW 翻倍
        （15→31→…→1023），这就是“二进制指数退避”中的指数；成功后复位。
        两个终端若在同一时隙同时减到 0，就会同时发送：
        <b style={{ color: '#ef4444' }}>碰撞</b>——双方都察觉不到碰撞本身，
        只能在 45 µs 后因收不到 ACK 而发现。
      </p>

      <h4 style={h}>4 · EDCA——QoS 接入类别（Wi-Fi 5+）</h4>
      <p style={p}>
        流量被分入四个接入类别——<b>VO</b> 语音、<b>VI</b> 视频、<b>BE</b> 尽力而为、
        <b>BK</b> 后台——各自拥有不同的 AIFS 和 CW（Table 9-194）。语音等得更短、
        退避抽值更小，因此在统计上总能优先。同一设备内部各类别也在竞争
        （内部碰撞：高优先级类别获胜）。
      </p>

      <h4 style={h}>5 · A-MPDU 聚合 + BlockAck（Wi-Fi 5+）</h4>
      <p style={p}>
        赢得一次信道很昂贵，所以现代 Wi-Fi 每次获胜可以把最多 64 个帧打包成一个聚合
        （蓝/绿色块上的 <b>×n</b>），并只用一个 {chip('#d8b4fe')}BlockAck 确认。
        相比传统 Wi-Fi 的吞吐量提升，大部分来自于此，而非单纯的物理层速率。
      </p>

      <h4 style={h}>6 · TXOP 突发</h4>
      <p style={p}>
        EDCA 获胜者可在限定时间内独占介质（如视频类别 4.096 ms），
        期间可用仅隔 SIFS 的连续帧交换——观察那些背靠背、中间没有退避的数据块。
      </p>

      <h4 style={h}>7 · OFDMA（Wi-Fi 6）</h4>
      <p style={p}>
        AP 可以把信道切分成资源单元（RU），<i>同时</i>服务多个终端：
        一个下行宽 MU PPDU（由各终端同时发出的 BlockAck 确认），或者一个
        {chip('#facc15')}<b>触发帧（Trigger）</b>调度多个终端在同一瞬间上行发送，
        再由一个多站点 BlockAck 统一确认。整组传输只需竞争一次。每个终端回应的是
        <b>TB PPDU</b>（trigger-based，基于触发）：其 RU、MCS、长度与功率都由触发帧规定，
        各终端填充到同一长度，因此全部同时结束。
      </p>

      <h4 style={h}>8 · MLO 多链路操作（Wi-Fi 7）</h4>
      <p style={p}>
        多链路设备同时在两个频段上运行完整的 MAC（这里是 5 + 6 GHz——6 GHz
        泳道标有 <b>·6G</b>，其无线波显示为线框）。两条链路共享同一个发送队列：
        谁先赢得空口，谁就发送下一帧。
      </p>

      <h4 style={h}>9 · 速率与物理层</h4>
      <p style={p}>
        空口时间 = 前导 + 符号。距离远的终端只能解码低 MCS（每符号比特更少），
        帧因此更长——而 CSMA/CA 公平分享的是<i>传输次数</i>而非<i>时间</i>，
        所以一个慢终端会拖累所有人的吞吐量（速率异常）。4096-QAM（Wi-Fi 7 的
        MCS 13）需要非常干净的信号：≥ −46 dBm。
      </p>

      <h4 style={h}>10 · 环境能量（802.11bp）</h4>
      <p style={p}>
        AMP 标签是无电池的终端：它从不进行载波侦听，也从不参与竞争。它只在
        <b>AMP AP</b> 的触发帧刚为它打开的那个时隙内发送——调度权整体搬到了 AP 一侧。
      </p>
      <p style={p}>
        一轮轮询是一次帧交换：先用 CTS-to-self 预约信道，再由
        {chip('#2dd4bf')}<b>触发帧（Trigger）</b>打开 N 个上行时隙。每个时隙结束一个 AMP SIFS 之后，
        AP 都会发出一帧{chip('#2dd4bf')}<b>AMP 确认（Ack）</b>：标签没有自己的时钟，
        只能靠数这些 Ack 来找到自己的时隙、知道轮询已经推进到哪一步。
      </p>
      <p style={p}>
        标签用哪个时隙由 <b>ABOC/ACW</b> 决定：收到触发帧后，标签从 [0, ACW] 中均匀抽取一个计数值，
        若 ABOC + 1 落在这 N 个时隙之内，就在该时隙应答，否则本轮空转。
      </p>
      <p style={p}>
        在时间轴上：青色块是 AP 的下行 AMP PPDU（触发帧、Ack），紫色块是
        {chip('#a78bfa')}标签的上行应答；AP 的泳道上每个时隙边界都有一道细刻度，
        而标签自己的泳道上会显示一段带标注的等待区间，即它待命等待自己时隙的那段时间。
      </p>
      <p style={p}>
        P802.11bp 目前仍是未获批准的草案（D0.5 于 2026 年 5 月发布，D1.0 将于 2026 年 9 月进入
        letter ballot）——本仿真器依据 11-24/1613r20、11-26/1519r5 与 11-26/1889r4 三份文件建模，
        草案中标为 TBD 的每个数值都标注为模型取值。
      </p>

      <h4 style={h}>反向散射（单站式）</h4>
      <p style={p}>
        反向散射标签自己不带发射机：它靠拨动一个简单的开关，把 AP 自己的载波反射回去来应答，
        反射一次要损耗 {AMP_BS_LOSS_DB} dB。<b>单站式</b>是指 AP 既是照射源又是接收机，
        因此它自己发射的功率会直接泄漏进自己的接收机——衰减 {AMP_BS_ISOLATION_DB} dB（自泄漏）——
        即使阅读器已经尽力用数字手段对消掉自己的发射，留给它的净空也只有 {AMP_BS_READER_DR_DB} dB。
        阅读器把激励功率调高多少，这部分净空就跟着缩小多少，因此调高功率
        <i>完全换不来更远的距离</i>：250 kb/s 下是 {AMP_BS_REACH_250_CM} cm，1 Mb/s 下是{' '}
        {AMP_BS_REACH_1000_CM} cm，无论应答期间辐射多大功率（编辑器里的<b>散射窗功率</b>字段）
        都不变。只有<b>启动距离</b>会随功率增长——标签需要在 {dbFmt(AMP_BS_ACTIVATION_DBM)} dBm
        以上持续整整一个唤醒毫秒才能启动：默认 10 dBm 充能功率下可达 {AMP_BS_ACTIVATION_10_CM} cm，
        20 dBm 下可达 {AMP_BS_ACTIVATION_20_CM} cm。超出启动距离的标签永远不会启动——
        没有泳道，没有记录，什么都看不到。
      </p>
      <p style={p}>
        这一轮在 AMP RFID 帧内隧道封装了一套 <b>EPC Gen2</b> 风格的盘点流程：Query(Q) 开启一个会话，
        每个已启动的标签都从 [0, 2^Q − 1] 中抽取一个时隙计数器——默认 Q = 2，即四个时隙；QueryRep
        使其递减；计数器归零的标签反向散射出自己的 <b>RN16</b>，若恰好只有一个标签应答，阅读器的
        ACK(RN16) 就会收集它的 <b>EPC</b>，并按配置对它读取或写入。整个交换靠两段激励载波支撑：
        至少一毫秒的 <b>WUP-Excitation</b> 唤醒标签，每条命令的数据之后的 <b>BST-Excitation</b>{' '}
        则在标签应答期间给它一段可供反射的载波。Gen2 自身的 Q 自适应未建模——Q 在整次运行中保持固定。
      </p>

      <h4 style={h}>11 · UWB 测距（802.15.4-2024 HRP）</h4>
      <p style={p}>
        UWB 与 Wi-Fi 根本不共用空口——它是另一套射频（信道 5 为 6489.6 MHz，信道 9 为 7987.2 MHz，
        码片速率 499.2 Mchip/s），任务是测<i>距离</i>而不是传数据。将近半个 GHz 的带宽让脉冲前沿足够陡峭，
        可以把到达时刻标定到皮秒量级，而 1 ps 对应 0.3 mm 的飞行距离。
      </p>
      <p style={p}>
        <b>测距计数器</b>是一个自由运行的时钟，计数单位 <b>RCTU</b> 为 15.650 ps，即 1/128 个码片
        （§10.29.1.4）。每一帧的 <b>RMARKER</b>——SFD 之后的第一个码片，位于 PPDU 起点之后 73.269 µs
        处（§10.29.1.1）——在天线口被打上计数器读数，而一次测距无非是对这些读数做算术：
        SS-TWR 用到 4 个（两帧），DS-TWR 用到 6 个（三帧，每帧在收发两端各打一次）。
        本仿真中的帧都是 SP1 的 BPRF PPDU：SYNC、SFD，随后是插在 PHR 之前的加扰时间戳序列（STS，§16.2），
        正是它让时间戳本身难以伪造。
      </p>
      <p style={p}>
        <b>SS-TWR</b>（单边双向测距，§10.29.1.2.2）只有一次往返——发 Poll、收 Response，
        tof =（T<sub>round</sub> − T<sub>reply</sub>）/2——因此两端晶振相差 20 ppm、回复时间 2 ms 时，
        误差就有 20 ns ≈ 6 m，除非用接收机测得的载波频偏加以修正。
        <b>DS-TWR</b>（双边双向测距，§10.29.1.2.4）多发一帧 Final，使每个时钟都同时出现在一个往返时间和
        一个回复时间里，频率误差因而相消——代价是一倍的空口时间，收益是从纳秒级降到皮秒级。
      </p>
      <p style={p}>
        <b>块、轮、时隙</b>（§10.32.2）：一次测距会话是一列测距<b>块</b>，每个块切成若干<b>轮</b>
        ——每个标签一轮——每轮再切成若干<b>时隙</b>，每个时隙只属于一台设备。
        块长 200 ms、时隙 2 ms，这两个值都取自 FiRa 的默认配置而非标准本身；标准只规定了计量它们的 RSTU。
        这里没有任何竞争：不做 CCA、没有退避、没有 NAV，每个回复时间都是事先约定好的。
        N 个锚点的 DS 轮占 2N + 2 个时隙（Poll、N 个 Response、Final、N 个 Report）；
        在本轮结束到下一个块之间，标签的射频是关闭的——这正是一颗纽扣电池能用很久的原因。
      </p>
      <p style={p}>
        <b>竞争式轮次</b>（调度模式 0，§10.32.2）：Poll 不再逐一指明每个锚点的时隙，而是打开一个
        共享响应阶段——RCPS IE（§10.32.9.5）通告一个 {DEFAULT_UWB_SESSION.contentionSlots} 个时隙
        的窗口，RCMA IE（§10.32.9.6）通告 {DEFAULT_UWB_SESSION.maxAttempts} 次的重试预算——每个锚点
        都在其中均匀抽取一个时隙。同一时隙内的两个应答，除非有一方领先信道 {UWB_CAPTURE_DB} dB 的
        捕获门限，否则两者都会失败，记为 <b>UWB_CONTEND_COLLISION</b>；由于 SS-TWR 的响应方没有
        自己的帧可以得知是否被听到，模型让网络在本轮结束时告知它——测到就补满预算，没测到就扣一次
        尝试，预算耗尽后便空过一轮。
      </p>
      <p style={p}>
        场景里：{chip('#fbbf24')}每个圆环是一次测得的距离——到测出它的那个锚点距离相同的所有点；
        圆环交汇处就是解算出的位置，画成一个小{chip('#f59e0b')}十字。圆环、十字与误差椭圆都会在一个测距块的
        时间内渐隐，因此你看到的永远是刚刚测出的结果。十字周围的椭圆是解算器给出的 1-σ 置信范围：
        一次好的定位只有几厘米大，在 3.5 m 的圆环旁边根本看不见，所以按 <b>{ELLIPSE_DRAW_SCALE}×</b> 放大绘制——
        检视面板（Inspector）显示的才是真实半轴长度。椭圆的形状由几何而非噪声决定：
        锚点接近共线时椭圆又长又扁，<b>GDOP</b> 也随之变大。
      </p>
      <p style={p}>
        模型取值：发射 −14 dBm、灵敏度 −93 dBm、捕获门限 6 dB、路径损耗指数 2、
        信噪比 20 dB 时的时间戳 1-σ 噪声 100 ps（σ<sub>range</sub> = c·σ<sub>ts</sub>/√2 ≈ 2.1 cm）——
        链路更弱时按 √(20 dB / SNR) 变差，最多为该值的十倍、
        残余时钟偏差 0.2 ppm，以及穿墙附加时延 0.2 ns（玻璃）/ 0.5 ns（石膏板）/ 2.0 ns（砖）。
        这个 NLOS 时延是偏差而非噪声——再多次平均也消不掉——凡是穿墙的路径都会报出更差的 FoM：
        75 % 落在 12 ns 之内，而不是视距时的 97 % 落在 0.5 ns 之内（§10.29.1.7）。
      </p>
      <p style={p}>
        <b>与 6 GHz Wi-Fi 共存：</b>UWB 信道 5（{UWB5_LO}–{UWB5_HI} MHz）落在 6 GHz Wi-Fi 频段之内；
        信道 9（{UWB9_LO}–{UWB9_HI} MHz）则与之完全不重叠。<code>Scenario.sixGhzCenterMhz</code> 给出 Wi-Fi 信道编号——
        （中心频率 − 5950）/ 5——因此模型默认的 {DEFAULT_SIX_GHZ_CENTER_MHZ} MHz 是第 {SIX_GHZ_DEFAULT_CH} 信道，
        与信道 5 无重叠；而第 71 信道（6305 MHz，80 MHz 带宽）则整段落在信道 5 之内——这正是共存课程所用的设置。
        两者的发射功率极不对称：Wi-Fi AP 通常在 20 dBm 附近发射，而一帧 UWB 只有 {dbFmt(UWB_TX_POWER_DBM)} dBm，
        还分摊在近半个 GHz 的带宽上。当有重叠的 Wi-Fi PPDU 在空口上时，UWB 接收机凭借相关增益仍能在信干比
        （SIR）低至 {dbFmt(UWB_SIR_MIN_DB)} dB 时解调（模型取值——标准只规定了接收机的最大输入功率
        {dbFmt(UWB_MAX_INPUT_DBM_PER_MHZ)} dBm/MHz，§16.4.10）；低于这个门限，该帧就会丢失，记为
        <b> UWB_INTERFERED</b>，即“lost to Wi-Fi”（因 Wi-Fi 而丢失）。反过来的方向要温和得多：
        距离超过约 40 cm 之后，UWB 帧的带内功率就会落到 −62 dBm 能量检测门限之下，因此在任何实际间距下，
        Wi-Fi 的 CCA（物理载波侦听）都不会被它触发——它只会在 UWB 帧发射期间，让 Wi-Fi 接收机的
        SINR 出现一点点噪声抬升。实际的解决办法是改用 UWB 信道 9，或者选一个不与信道 5 重叠的 6 GHz Wi-Fi 信道。
      </p>
      <p style={p}>
        <b>单向测距</b>（§10.29.1.2.5）把往返换成了一次到达时间差。<b>DL-TDoA</b> 改由锚点跑完整轮——
        锚点 0 发送 Poll 与 Final，其余锚点依次 Respond，每一帧都携带发送方自己的发送计数器读数以及
        它为其他各方保存的接收计数器读数（FiRa 风格内容，模型取值）——而标签则从不发射：它只是监听，
        用自己的时钟给每次到达打上时间戳，再把各应答锚点的到达时刻与锚点 0 的作差。这些差值跨越了
        整整一轮，因此听测标签自身晶振的误差不会像 TWR 那样自行相消：它需要先用自己测得的
        “轮询→终结帧”间隔，去对照锚点报出的真实间隔，按这个比例重新缩放原始差值。没有这道
        <b>时钟速率修正</b>，误差就是 20 ppm 乘以从轮询帧到被计时的那一帧之间的间隔：本系列课程
        那种五时隙轮次里最长 6 ms，即 36 米；若有九个锚点，最后一个应答帧在轮询帧后 16 ms，则是 96 米。加上它，定位误差
        便回落到分米级。<b>UL-TDoA</b> 反过来让标签成为发射方：只发一次 {UWB_BLINK_BYTES} 字节的
        <b>闪发帧</b>（模型取值，FiRa 风格），别无其他，由共享同一公共时基的锚点——“有线同步”
        （模型取值）——为其打上时间戳，每个锚点还各自留有一份固定残差 <code>syncErrorNs</code>，默认为{' '}
        {DEFAULT_UWB_SESSION.syncErrorNs} ns，即完美同步；它不为零时，定位结果的误差椭圆会随之增大。无论哪种方式，
        定位现在都靠<b>双曲线定位</b>而非三边定位得出：一个时间差对应一条双曲线，因此三个差值
        （四个锚点）就能替代三边定位所需的三个距离，而且无论多少个标签同时监听或闪发，轮次都不会
        因此变长——DL-TDoA 可以服务无限多、完全静默的听众，UL-TDoA 则能容纳一个块的时隙所能装下的
        任意多个标签，每个标签只需一次闪发。
      </p>
      <p style={p}>
        <b>到达角（AoA）</b>（§10.29.1.1 将其列为测距结果之一）在距离之外再给出一个方位角。
        锚点的两根天线沿视轴（boresight）相距半个波长——信道 9 上为 {AOA_ANTENNA_SPACING_CM} cm——
        于是从视轴外方位角 θ 到达的波前会晚到达较远的那根天线，形成相位差
        φ = 2π·(d/λ)·sin θ（到达相位差 PDoA，模型取值，FiRa 风格）。反解这条关系式，
        会把接收机的相位噪声（σ<sub>φ</sub> = {AOA_SIGMA_PHI_RAD} rad，模型取值）转换成
        随 |θ| 增大而变差的方位角误差：正前方 {AOA_SIGMA_BORESIGHT_DEG}°，60° 处{' '}
        {AOA_SIGMA_60_DEG}°，在 ±90° 视场边缘——阵列对角度完全失去分辨力之处——被限幅在{' '}
        {AOA_SIGMA_CLAMP_DEG}°。锚点背后的几何是镜像的——sin(180° − θ) = sin θ——因此
        背后的标签会被报告成它在正前方的镜像；把锚点的 <code>yawDeg</code>（偏航角）视轴
        对准房间，并据此读出方位角，是两根天线唯一能做的防御。配合 DS-TWR，同时握有距离和
        方位角的锚点便能单凭自己定出标签的位置：距离的几厘米误差沿着射线方向，
        而方位角误差则变成沿射线侧向的<b>横向误差</b>，且随水平距离增大——
        r<sub>h</sub>·θ（θ 以弧度计）米，其中 r<sub>h</sub> = √(r² − Δz²) 才是<i>水平</i>距离
        （装在天花板上的锚点测到的是斜距 r，而非水平距离）——
        因此在几厘米开外的任何距离，解算出的误差椭圆都又长又扁，且与射线方向相差九十度。
      </p>

      <h4 style={h}>12 · 802.15.4ab：多毫秒测距 MMS（草案）</h4>
      <p style={p}>
        本节内容全部来自 <b>IEEE P802.15.4ab</b>——一份尚未获批的草案（截至 2026 年 9 月处于
        Sponsor ballot 复审阶段）。投票稿仅对会员开放，因此本仿真器是依据该任务组的提案文稿建模的：
        15-22/0381r5（测距周期、时隙划分与先听后说规则）、15-23/0100r2（片段定义与窄带物理层）、
        15-23/0502r3（必选参数集）以及 15-22/0205r0（毫秒能量预算）；本节后半那五项特性另有五份 2025 年
        的提案——15-25/0194r0（两套控制面配置与零长度控制阶段）、15-25/0066r1（RSF 带 SFD）、
        15-25/0292r1 与 15-25/0331r1（非交织子轮及其控制阶段）、15-25/0224r2 与 15-25/0556r2
        （固定回复时间与反序）——一律转述，绝不照抄。D05 在编号
        与细节上可能与此不同；下文凡标注<i>模型取值</i>处，都是本仿真器自己的选择，而非草案规定。
      </p>
      <p style={p}>
        <b>为什么要切成片段。</b>UWB 发射机真正的约束不是峰值功率，而是<i>每毫秒的能量</i>：平均 EIRP
        限值为 −41.3 dBm/MHz（在 1 ms 上取平均），折合到 499.2 MHz 即 −14.3 dBm，也就是每毫秒约{' '}
        <b>{UWB_MS_BUDGET_NJ} nJ</b>（法规——FCC Part 15.519 / ETSI EN 302 065，经 15-22/0205r0 转引）。
        一帧约 190 µs 的 4z 轮询只花掉这一毫秒里约 7.5 nJ 就结束了。MMS 则把测距信号切成相隔一毫秒的短
        <i>片段</i>，构成一列<b>片段序列</b>：每个片段都能把整整 {UWB_MS_BUDGET_NJ} nJ 花在自己那段短得
        多的长度里，接收机再把它们相干叠加，额外换来 <b>10·log10(X)</b> dB。本模型允许的最长序列是十六个
        片段，即 {MMS_COMBINE_DB} dB（模型取值）；信道也正是用这个上限来判断哪些片段还值得投递——门限为{' '}
        {dbFmt(UWB_RX_SENS_DBM)} − {MMS_COMBINE_DB} dB。
      </p>
      <p style={p}>
        <b>片段是什么。</b>两种，都很“素”：没有前导、没有 SFD、没有 PHR，也没有数据。<b>RSF</b>
        （测距序列片段）是一个 <b>MMRS</b> 符号重复 <code>N_MSR</code> 次——MMRS 由长度 128 的互补序列
        按 [A, G, B, G] 切分而成，其中 G 是 0…64 个零，整体再按 L = 4 扩频；于是在 499.2 Mchip/s 下，
        一个 RSF 为 N_MSR·4·(128 + 2·间隔) 个码片（4ab 草案 0100r2 §2.3.2）。这正好复现了草案公布的长度：
        N_MSR 40、间隔 33 为 {MMS_RSF1_US} µs；N_MSR 32、间隔 64 为 {MMS_RSF10_US} µs；N_MSR 64、间隔 25 为{' '}
        {MMS_MIXED_US} µs；而会话默认值（N_MSR 40、间隔 64）为 {MMS_RSF_US} µs。<b>RIF</b>（测距完整性片段）
        则是一段 STS（STS 见标准 §16.2.9），长度为 <code>stsLen</code> × 512 个码片——{MMS.stsLen} 个单位
        即 {MMS_RIF_US} µs——它只决定测距结果的完整性标志，别无他用。一列序列是 X 个 RSF 接 Y 个 RIF，
        中间空出 Z 个毫秒供接收机处理（4ab 草案 0100r2 §2.3.2）。由于能量摊在各自的长度上，默认 RSF 辐射{' '}
        {MMS_RSF_DBM} dBm，参数集 rsf-1 更短的那个则是 {MMS_RSF1_DBM} dBm（模型取值）——相比之下，
        4z 帧无论多长都恒为 {dbFmt(UWB_TX_POWER_DBM)} dBm。
      </p>
      <p style={p}>
        <b>时间戳挪到了最前面。</b>既然没有 SHR 要等，<b>RSF-RMARKER</b> 就是第一个 RSF 第一个脉冲的峰值
        （X = 0 时则是第一个 RIF），因此与第 11 节里的每一帧都不同：PPDU 起点与测距时刻之间<i>没有</i>
        73.269 µs 的偏移（4ab 草案 0100r2 §2.3.2）。即使第一个片段丢了，这个时刻依然能还原：接收机已从控制
        交互中得知序列的形状，于是把任何一个收到的片段的到达时刻往回推“序号 × 1 ms”即可。但这些毫秒是
        <i>发送方</i>的，所以回推时要乘上同一列序列量出的时钟比率；若按未修正的毫秒回推，就会留下
        “序号 × 1 ms × 两块晶振之间的偏差”——在 20 ppm 下，每丢一个前导片段就是 3.0 m 的测距误差（模型取值）。
      </p>
      <p style={p}>
        <b>这列序列同时也是一把尺子。</b>同一序列中两个片段之间，按发送方的时钟恰好相隔整数个毫秒，
        因此接收机只要用自己的计数器量出这段跨度，就直接读出了时钟比率，其 1-σ 为 √2·σ<sub>ts</sub> 除以
        该跨度（模型取值）。默认序列的跨度是 7 ms，对应 0.0202 ppm；它在修正后的单边测距里留下的是
        ½·T<sub>reply</sub>·σ——回复时间为 0.5 ms 时即 <b>1.5 mm</b>（0.5 ms 是草案的默认时隙，也正是编辑器
        选中 MMS 模式后所用的值），而仅凭窄带载波频偏估计
        （0.2 ppm）是 <b>1.5 cm</b>，完全不修正（20 ppm）则是 <b>1.5 m</b>。正是这个阶梯说明本切片不需要
        DS-TWR：有了片段序列，单边测距已经贴在时间戳噪声的地板上。只听到一个片段的设备则退回到载波频偏
        估计，与第 11 节一样。
      </p>
      <p style={p}>
        <b>另一套电台。</b>在默认的配置 2 下，UWB 一侧只负责测量，其余一切都走窄带的 <b>NBA-UWB</b> 电台——O-QPSK、
        250 kb/s，每符号 32 个码片、16 µs，4 比特，无前向纠错（标准 Clause 12；具体配置见 4ab 草案
        0100r2 §2.3.1）。它的消息都是压缩 PSDU：一个消息 ID 字节、若干字段，再加 CRC-16——POLL{' '}
        {NB_POLL_BYTES} 字节（{NB_POLL_US} µs）、RESP {NB_RESP_BYTES} 字节（{NB_RESP_US} µs）、REPORT{' '}
        {NB_REPORT_BYTES} 字节（{NB_REPORT_US} µs）。它慢到对每一个必选参数集而言，单单一帧 POLL 都比它所安排的任何一个片段更长
        ——{NB_POLL_US} µs 对默认 RSF 的 {MMS_RSF_US} µs
        （4ab 草案 0381r5 Table 1.6.3.1 / 1.6.3.2）。它工作在 UNII-3 与 UNII-5：共 {NB_CHANNELS} 个信道，
        间隔 {NB_CHANNEL_MHZ} MHz，编号 0…{NB_CHANNELS - 1}，0 号中心为 {NB_CH0_MHZ} MHz，50 号为{' '}
        {NB_CH50_MHZ} MHz——草案用文字给出了信道数量与频段边界，编号却只画在图里，因此这条中心频率公式是
        据此<i>反推</i>出来的（模型取值）。它以 {dbFmt(NB_TX_DBM)} dBm 发射，灵敏度到{' '}
        {dbFmt(NB_RX_SENS_DBM)} dBm（两者皆为模型取值）。
      </p>
      <p style={p}>
        <b>但那套电台只是两种配置之一</b>（4ab 草案 15-25/0194r0）。草案给 MMS 定义了两套控制面。
        <b>配置 2</b>（Config 2，窄带辅助 MMS，narrowband-assisted MMS, <b>NBA-MMS</b>）就是上面这一套：
        POLL、RESP、REPORT 三条消息都跑在窄带电台上，每个窗口占两个测距时隙。<b>配置 1</b>
        （Config 1，UWB 驱动 MMS，UWB-driven MMS, <b>UWBD-MMS</b>）里设备只有一个电台，同样这三条消息
        改成 UWB 物理层上的 <b>SP0</b>（BASIC_PACKET）包，窗口缩到一个时隙——成对轮次因此从{' '}
        {MMS_SLOTS} 个时隙降到 {MMS_SLOTS_SP0} 个。（Start of Ranging (SOR) Management 的 PHY
        Configuration 字段用取值 1–8 指 NBA-MMS、14–15 指 UWBD-MMS；本引擎不逐位编码管理帧，这两组编号
        只作记录。）省下来的时隙要用分贝去买：SP0 短包是 SYNC {us1(SP0.sync)} µs（PSR64）+ SFD{' '}
        {us1(SP0.sfd)} µs + PHR {us1(SP0.phr)} µs + PSDU {us1(SP0.psdu)} µs = {MMS_SP0_US} µs
        （速率 {MMS_SP0_MBPS} Mbit/s；长包 PSR128 为 170.1 µs，本引擎一律按短包计时，模型取值），
        而测距包自己那个 SYNC+SFD 片段在 91 长码 PSR32 下只要 29.1 µs。<b>那几个分贝值是按脉冲数之比
        算的，不是按时长之比</b>：4 倍时长对应 4.3 倍脉冲数，10·log10(4.3) = 6.3 dB；长包一侧 3.3 倍时长、
        3.4 倍脉冲数即 5.3 dB；两边同为 PSR64 时 2.3 倍、2.4 倍即 3.8 dB。提案的结论句把这些取整成
        「约 4 dB」，引擎就用 {MMS_SP0_PENALTY_DB} dB 抬高 SP0 的投递门限（模型取值）。方向别弄反：
        SP0 更长、峰值更低，所以<i>更难</i>捕获——它在用时，是它而不是片段决定链路预算。
      </p>
      <p style={p}>
        <b>于是还有第三档：零长度的控制阶段。</b>把轮询与响应两个时隙数
        （<code>macMmsRcpPollNSlots</code>、<code>macMmsRcpRespNSlots</code>）同时置零，控制阶段长度就是零：
        SP0 帧被跳过，SOR 的时间偏移直接指向测距包的 SYNC+SFD 片段（该片段的长度由 RSF 片段长度字段
        决定），成对轮次降到 {MMS_SLOTS_NO_CTRL} 个时隙；取 1–15 则 SP0 在用。提案自己给出的理由只有
        一句——比起把控制阶段做成可选，零长更实际。这一档只属于配置 1。它也是唯一真要“捕获”的一档：
        配置 2 里窄带交互已经把时基交给了两端，配置 1 带 SP0 时时基来自那个包，而零长时前面什么都没有，
        包首那个片段必须自己够 {dbFmt(UWB_RX_SENS_DBM)} dBm——<b>捕获不累加</b>，四个低 6 dB 的片段可以
        同时是一列检出的序列和一个没被打开的包。这正是 <code>phyUwbMmsRsfSfd</code>（<b>RSF 带 SFD</b>，
        4ab 草案 15-25/0066r1）要买的东西：置 1 后每个 RSF 后面都跟一个帧起始定界符
        （start-of-frame delimiter, SFD），该片段与同一个包里在它之前的 SYNC+SFD 片段完全相同，于是任何
        一个片段都能开包；仅当 Sequence Code Index 为 9–32 且 RSF 片段长度为 32 或 64 时才可置 1。
      </p>
      <p style={p}>
        <b>成对的测距周期</b>（4ab 草案 0381r5 §1.1）。一个 MMS 轮次里只有一个发起方（标签）和一个响应方
        （锚点），因此一个测距块要装下的是“每个标签–锚点配对一轮”，而不是“每个标签一轮”。MMS 要求测距时隙
        必须是 300 RSTU 的整数倍（§1.1.1），而草案自己的默认值是 600 RSTU——即 <b>0.5 ms</b>，下面所有数字
        都以此为前提；实际取值由会话的 <code>slotRstu</code> 字段决定。默认轮次为 {MMS_SLOTS} 个时隙，
        在该时隙长度下恰好等于草案给出的示例轮次时长（Table 1.2.3.2）。下表画的是默认形态——配置 2，
        两列片段交织：
      </p>
      <table style={table}>
        <thead>
          <tr>
            <th style={cellHead}>时隙</th>
            <th style={cellHead}>阶段</th>
            <th style={cellHead}>谁</th>
            <th style={cellHead}>做什么</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={cell}>0–1</td><td style={cell}>控制</td><td style={cell}>发起方</td><td style={cell}>先听后说，然后发出窄带 POLL</td></tr>
          <tr><td style={cell}>2–3</td><td style={cell}>控制</td><td style={cell}>响应方</td><td style={cell}>先听后说，然后发 RESP——仅当收到了 POLL</td></tr>
          <tr><td style={cell}>4 + 2m</td><td style={cell}>测距</td><td style={cell}>发起方</td><td style={cell}>第 m 个 RSF，每毫秒一个</td></tr>
          <tr><td style={cell}>5 + 2m</td><td style={cell}>测距</td><td style={cell}>响应方</td><td style={cell}>它自己的第 m 个 RSF，晚一个时隙，使两列序列在每毫秒内交错（模型取值）</td></tr>
          <tr><td style={cell}>随后</td><td style={cell}>测距</td><td style={cell}>双方</td><td style={cell}>各自的 RIF，在最后一个 RSF 之后空出 Z − 1 毫秒</td></tr>
          <tr><td style={cell}>4 + rp</td><td style={cell}>报告</td><td style={cell}>响应方</td><td style={cell}>携带回复时间的窄带 REPORT</td></tr>
          <tr><td style={cell}>4 + rp + 2</td><td style={cell}>报告</td><td style={cell}>发起方</td><td style={cell}>携带往返时间的窄带 REPORT</td></tr>
        </tbody>
      </table>
      <p style={p}>
        测距阶段以草案的 RpDuration 默认值 20 个时隙为<i>下限</i>，再按序列长度往上撑（模型取值）。
        构成一次测距的两个时间，双方各自只能测到其中之一——发起方测往返时间，响应方测回复时间——因此谁
        收到了对方的报告，谁就算出修正后的单边测距结果；由<b>报告方式</b>决定这是谁——只响应方、只发起方，
        或双方（4ab 草案 0381r5 Table 1.1.4.1）。用来修正的时钟比率来自它自己那列片段序列；若序列只给了它
        一个片段，则改用窄带载波频偏估计。标签在本块内攒够三个及以上距离后，
        会在它最后一个配对轮次结束时解算位置。中止规则遵循草案：先听后说判忙、或等不到 RESP 的发起方，
        以及没收到 POLL 的响应方，本轮不再有任何动作。
      </p>
      <p style={p}>
        <b>非交织的子轮</b>（4ab 草案 15-25/0292r1，拟编为 §10.39.7）。上表那种交织
        （interleaved）形态里，同一毫秒中每台设备各发一个片段。草案另给了一种非交织形态：一个轮次按设备
        切成若干<b>子轮</b>（sub-round），每个子轮是「控制阶段（<code>macMmsRcpPollNSlots</code> 或{' '}
        <code>macMmsRcpRespNSlots</code>，见 4ab 草案 15-25/0331r1）+ 测距阶段
        （<code>macMmsRpDuration</code>）」，子轮里只有一台设备在发，它那列片段连续发完，下一台的子轮才
        开始；发起方不等应答方的 compact 帧就发出自己的 MMS 包，应答方收到之后才开始自己的子轮。
        两个时隙数都为零时，每个子轮就只剩测距阶段。代价直接写在时隙上：同样在 600 RSTU 的时隙下，
        成对轮次从 {MMS_SLOTS} 个时隙涨到 {MMS_SLOTS_NONINT} 个，三个响应方的一对多轮次从{' '}
        {MMS_SLOTS_3R} 个涨到 {MMS_SLOTS_3R_NONINT} 个，也就是 {slotMs(MMS_SLOTS_3R_NONINT)} ms，
        于是测距块装不下的提示会比交织时来得早——那不是故障，是这个形态真实的开销。一条后来被<i>撤回</i>
        的意见（15-25/0331r1 CID #234）还指出它测距时长更长、并受信道相干时间限制；那是一条已撤回的
        意见，不是草案认下的缺点。
      </p>
      <p style={p}>
        <b>非交织换来的是一个明确的时刻：对方整个 MMS 包收完了。</b>两项特性建立在它之上。
        <b>固定回复时间</b>（<code>macMmsFixedReplyTimeEnable</code>，Boolean，默认 FALSE；
        <code>macMmsFixedReplyTime</code>，整数，{MMS_FIXED_REPLY_RSTU_MIN}…{MMS_FIXED_REPLY_RSTU_MAX}{' '}
        RSTU，默认 {MMS_DRAFT_SLOT_RSTU} RSTU——4ab 草案 15-25/0224r2）让应答方自那一刻起固定偏移这么久
        再发，于是回复时间（reply time，T<sub>reply</sub>）成了双方事先约定的常量、或由 One-to-one
        Response Compact 帧传来的一个数，不必再塞进报告 compact 帧——省下的是能量（15-25/0556r2）。
        0224r2 把起点写作 MmsRangingRxOnTime，即收到第一个片段的时刻；较晚的 15-25/0681r1 改成收完整个
        MMS 包之后，本引擎照后者实现。提案自述的前提是应答方能准确估计到达时间，而「这在非交织模式的
        MMS 包末尾才可能」，并且能精确控制自己相对到达时间的发送时刻；精度代价是测距精度取决于这个
        回复时间估计得有多准。<b>反序</b>（15-25/0556r2）则让应答方先发自己的 MMS 包，发起方自进入测距
        阶段起偏移 {MMS_DRAFT_SLOT_RSTU} RSTU 再发；先发的一方量到的是往返时间、后发的量到回复时间，
        于是「谁算得出距离」换到了另一边。两者各占 MMS Number of Fragments Configuration 那一字节的一位
        （bit 6 与 bit 7；bit 0–2 是 RSF 片段数、bit 3–5 是 RIF 片段数）。草案并没有禁止两位同时置位，
        但本仿真器拒绝：反序会让应答方成为开场先发的那一方，而固定回复时间要的起点正是「收完对方的包」
        ——这是本引擎的自洽规则（模型取值），不是草案的禁令。
      </p>
      <p style={p}>
        <b>先听后说</b>（4ab 草案 0381r5 §1.4.2，援引 ETSI EN 303 687 的“基于帧的设备”规则）。窄带电台与
        Wi-Fi 6E 共用 6 GHz，因此每次发送前都要对信道做至少 {NB_LBT_CCA_US} µs 的评估，能量检测门限为{' '}
        {dbFmt(NB_LBT_EDT_DBM_PER_MHZ)} dBm/MHz——摊到 {NB_CHANNEL_MHZ} MHz 的整个信道上即{' '}
        <b>{NB_LBT_DBM} dBm</b>（把每 MHz 的门限摊到占用带宽上，是本引擎的读法，模型取值）。草案规定
        UNII-5 必须执行、UNII-3 可选，这正是编辑器里<i>自动</i>一档的依据；模型用一次瞬时频谱读数来代表
        整个评估窗口。判忙的代价很大：该设备在这个测距块剩余时间内不再发送任何窄带帧，也就丢掉了它在这块
        里的全部轮次。一个 20 dBm、80 MHz 的 Wi-Fi PPDU 会向 2.5 MHz 内投入 4.95 dBm，按 Wi-Fi 的路径损耗
        律，它在 <b>≈ 8.6 m</b> 处降到 {NB_LBT_DBM} dBm——在一台正在发射的 6E AP 的这个半径之内，每一次
        评估都是忙。反方向也成立：一帧 {dbFmt(NB_TX_DBM)} dBm 的窄带帧落在 AP 的 80 MHz 信道内，在{' '}
        <b>≈ 15 m</b> 处仍有 −62 dBm，因此在这个范围内 Wi-Fi 的能量检测反而会为它让路——与第 11 节那
        40 cm 恰好相反，这也正是这套电台才是共存故事中有趣那一半的原因。
      </p>
      <p style={p}>
        <b>跳信道。</b>会话带着一份窄带信道白名单，每个测距块从中挑一个。草案用以会话 PRNG 种子为密钥的
        AES-128-CTR 对块序号加密来决定这个选择（4ab 草案 0381r5 §1.5.3）；本仿真器则用自己的字符串哈希
        顶替这套密码学（模型取值），这样回放时仍会挑中同样的信道，而引擎里不必引入密码算法。纯 UNII-3 的
        白名单根本不会与任何 6 GHz Wi-Fi 信道重叠——这也是默认会话完全不在乎场景里有没有 Wi-Fi 的原因。
      </p>
      <p style={p}>
        <b>参数集。</b>本仿真器内置 {MMS_SET_COUNT} 组必选工作参数集（4ab 草案 0502r3，拟编为 16.2.11.4）：
        十组纯 RSF、各十六个片段的序列，以及七组混合序列（N_MSR 64、间隔 25、STS 64）。同一张表里那些
        纯 UWB 的参数集——一个 SHR 加一个 RIF——实质上就是 4z，未予建模。而会话自身的默认值并不是某个参数集，
        而是草案的测距周期默认配置（Table 1.2.3.3）：X = {MMS.rsfs}、Y = {MMS.rifs}、N_MSR {MMS.nMsr}、
        间隔 {MMS.gap}、Z = {MMS.gapMs}。
      </p>
      <p style={p}>
        <b>已知的简化</b>（在 README 所列各项之外）：时间戳精度不随信噪比改善，因此草案最引人注目的那项精度
        主张<i>并未</i>建模——本仿真器只复现它带来的覆盖距离与时钟比率；测距周期默认成对，也可以开成
        一对多，但仅此两种；没有初始化握手、没有公开广播、也没有捕获包——会话由场景直接配置；窄带路径损耗按自由空间
        加穿墙计算；先听后说只取一次瞬时读数，而非对 {NB_LBT_CCA_US} µs 积分；窄带信道中心频率公式是由频段
        边界反推的；信道切换用哈希顶替了 AES-CTR。
      </p>

      <h4 style={h}>13 · 时变链路：两层衰落（默认关闭）</h4>
      <p style={p}>
        不打开这一节时，一条链路的接收电平只由几何距离与穿过的墙决定：<b>同一个位置永远得到同一个数</b>。
        真实链路不是这样——即使两端都不动，电平也会随环境起伏若干分贝，而重传、降速、以及“速率控制到底
        在解决什么问题”这整件事，讲的都是这种起伏。在 ✏ 编辑模式的 🗂 对象列表里打开
        <b>时变链路（衰落）</b>，就把它加进来；整节缺省即关闭，所以既有场景（含全部课程场景）的结果一个数都不变。
      </p>
      <p style={p}>
        <b>慢的一层：阴影衰落。</b>对数正态分布，标准差 σ（默认 {FADING_DEFAULTS.shadowSigmaDb} dB），
        在均值上下取正取负一样常见。它刻画的是“同样的距离、不同的摆法”之间的差别：家具、人体、门的开合，
        以及路径损耗公式那条平滑曲线抹平的一切。σ 是本仿真器的取值——室内实测常落在 3–8 dB，这里取中间一个数，
        并不出自某一次具体的测量。
      </p>
      <p style={p}>
        <b>相干时间是什么。</b>信道“基本还是原来那个信道”的那段时长（默认 {FADING_DEFAULTS.coherenceMs} ms）。
        本仿真器据此把时间切成等长的区间：一个区间之内阴影值恒定，跨区间才重抽一个独立的值。
        真实世界里这段时长由移动速度与波长决定（大致是多普勒频移的倒数：走得越快、频率越高，信道变得越快）。
        这里没有任何东西在动，<b>也没有建模多普勒</b>，所以相干时间是一个直接配置的数，
        而不是从速度推出来的量——这是要记明白的一处简化。
      </p>
      <p style={p}>
        <b>快的一层：小尺度衰落。</b>逐帧变化：一帧之内恒定，换一帧才换。它来自同一条链路上多条反射路径
        在接收天线处的相互加减——差半个波长就可能从相长变成相消，所以它比阴影快得多，也深得多。
        <b>瑞利</b>是纯散射、没有直射径的情形（默认，也是最悲观的一种）；<b>莱斯</b>另有一条直射径，
        由 K 因子（直射与散射的功率之比，默认 {RICIAN_K_DEFAULT_DB} dB）决定还剩多少能量可供起伏：
        K 越大越平稳，K 趋于 0（线性）就退回瑞利。3–10 dB 是室内实测常见的范围，这里同样取中间一个数。
      </p>
      <p style={p}>
        <b>为什么这里的衰落是平坦的。</b>本仿真器不建模<b>时延扩展</b>——多条路径到达时刻的分散——
        因此也就没有<b>频率选择性衰落</b>：两层衰落都对整个信道带宽同一个值，一条链路上所有子载波同起同落。
        真实的宽带室内信道不是这样：几十纳秒的时延扩展对应几兆赫兹量级的相干带宽，比 20、80、160 MHz 的信道窄得多，
        于是同一时刻信道的一部分深衰、另一部分完好。OFDM 的每子载波均衡、以及“一个 MCS 配一整条信道”这件事
        为什么其实是个近似，讲的都是这一点。要得到它就得逐子载波建模，那是与本切片完全不同的代价。
      </p>
      <p style={p}>
        <b>为什么它仍然是确定的。</b>每一次抽样都是 <code>(种子, 发端, 收端, 键)</code> 的纯哈希函数，
        而不是从一条有状态的随机流里取下一个数。这是必须的：判定一帧要多次问同一条链路的电平
        （载波侦听一次、捕获判定一次、信干噪比每次重算一次），有状态的流会给这几次不同的答案，
        于是同一帧在同一个接收机那里同时有几个电平，结果还取决于事件队列的顺序。哈希抽样则是
        问一百次得同一个数——打开衰落，同样的种子仍然完整复现同一次运行。
      </p>

      <h4 style={h}>14 · 回波与感知：双站几何与分辨率（默认没有）</h4>
      <p style={p}>
        房间里放进一个会反射的物体（✏ 编辑模式的 <b>🪞 散射体</b>），每一次发送就在每个接收端多出
        <b>第二个到达</b>。它不走 <i>发射端 → 接收端</i>，而走 <i>发射端 → 物体 → 接收端</i> 两段路，
        于是两件事是<b>必然</b>而不是通常：它比直达路径<b>晚</b>，因为两边之和不小于第三边；
        它比直达路径<b>弱</b>，因为两段路各付一次扩散损耗，回头只拿回「两段相加时被重复收取的那一次
        接收孔径」。这就是<b>双站</b>（bistatic）几何——发射与接收不在一处，所以这里没有单站雷达：
        一台设备听不见自己的反射。
      </p>
      <p style={p}>
        <b>回波说出的是一个和，不是一个距离。</b>它带回来的量是 R<sub>1</sub> + R<sub>2</sub>，
        即两段路程之和，称作<b>双站距离</b>。知道它并不足以定出物体在哪：满足这个和的点构成一个以两端
        为焦点的<b>椭球</b>，物体在椭球上的哪一处，一条回波不回答。要收敛到一个点，得有多对收发——
        这也正是感知比测距难的地方。
      </p>
      <p style={p}>
        <b>分辨率：把「分得开」变成一个可以算的距离。</b>接收机能不能把回波从直达路径里分出来，
        只取决于它<i>晚多少</i>，而它能分辨的最小时延就是 1/B——带宽 B 能做出的相关峰宽度。
        HRP UWB PHY 的 B 是 499.2 Mchip/s，1/B 就是一个码片 {UWB_CHIP_NS.toFixed(6)} ns（标准 §16.2.4），
        折成路程约 <b>{ECHO_RESOLUTION_M} 米</b>。于是有一条可以直接算的条件：
      </p>
      <p style={{ ...p, paddingLeft: 10 }}>
        （|发→物| + |物→收|） − |发→收| &gt; {ECHO_RESOLUTION_M} 米 → 分得开，是两个到达；<br />
        小于它 → 分不开，回波并进直达路径，从记录上看就是不存在。
      </p>
      <p style={p}>
        换成窄带电台，同一行算术就给出完全不同的结论：2.5 MHz 的窄带消息 1/B 是 400 ns，
        约 120 米的额外路程——<b>任何房间里的任何物体都分不开</b>。分辨率不是一个形容词，
        它就是 c/B 这个长度。
      </p>
      <p style={p}>
        <b>量出来的一对，以及这里最值得记住的一句话。</b>一个锚点与一个标签相距 2 米，
        房间里两个 {SCATTERER_DEFAULT_DB} dB 的衣柜级物体：离连线 {ECHO_NEAR_LINE.offM} 米的那个，
        双站距离 {ECHO_NEAR_LINE.pathM} 米，比直达路径多走 {ECHO_NEAR_LINE.excessM} 米，
        对 {ECHO_RESOLUTION_M} 米的门槛——<b>分不开</b>；而它的电平是 {ECHO_NEAR_LINE.dbm} dBm。
        离连线 {ECHO_OFF_LINE.offM} 米的那个多走 {ECHO_OFF_LINE.excessM} 米，<b>分得开</b>，
        电平只有 {ECHO_OFF_LINE.dbm} dBm。<b>贴着连线的那个物体「看不见」，不是因为它弱，
        恰恰相反，它是两者中更响的一个——它两段腿都更短。它看不见，纯粹是因为分不开。</b>
        真实设备面对的是同一件事：一个人站在两台设备的连线上，是最难被察觉的位置。
      </p>
      <p style={p}>
        <b>测距从头到尾看不到这一切。</b>打开散射体之后，测距结果<i>逐字段不变</i>。这不是本仿真器
        为了省事划的一条线，而是先有物理才有的建模：4z/4ab 的测距接收机锁的是<b>第一条路径</b>，
        后面的多径正是它要抑制的东西——把回波当成直达路径去打时间戳，测出来的距离就假了。
        所以带回波标记的到达根本进不了接收链路：时间戳、acquired、片段累加，一个都不看它。
        读它的只有感知这一路消费者，写下的是 <code>UWB_ECHO</code> 记录：双站距离、时延、
        多走了多少米、这台接收机需要多少米才分得开，以及判决本身——判决所依据的<i>两个长度都在记录里</i>，
        所以这道算术是读者自己能验的，不必信。
      </p>
      <p style={p}>
        <b>够不够得到：别指望远。</b>一面一平方米的理想反射面（0 dB）放在 10 米连线的中点，
        比 {dbFmt(UWB_RX_SENS_DBM)} dBm 的接收灵敏度还低 {ECHO_IDEAL_10M_UNDER_FLOOR_DB} dB，
        于是它<b>根本不会被交给接收端</b>，连「有个东西太弱了」这样一条记录都没有——本仿真器没有
        单独的感知底噪（那会是发明一个数字），回波过不了直达路径自己的那道门限，就只有沉默。
        同一个物体放在 2 米连线的中点则高出底噪 {ECHO_IDEAL_2M_OVER_FLOOR_DB} dB。要听得见回波，
        只有两条路：缩短距离，或者换更强的反射体。这也是为什么 🪞 工具默认写的是衣柜
        （{SCATTERER_DEFAULT_DB} dB）而不是一平方米。
      </p>
      <p style={p}>
        <b>这一刀明确不做的事。</b>墙<b>不是</b>散射体——墙仍然只对直达路径加固定时延与损耗，
        把墙变成反射面需要镜像法与可见性判断，路径数会爆炸。也不建模<b>多普勒与运动</b>：
        物体是静止的，所以这里给的是「对被动物体量出一个双站距离」，而不是靠帧间差分做存在检测。
        Wi-Fi 侧也还没有接：同一套几何换一条路径损耗律就是 Wi-Fi 的多径，但一次只动一种电台。
      </p>

      <h4 style={h}>15 · 回复时间走哪条路：五种测距形态的取舍（标准 §10.29.6.3–.7）</h4>
      <p style={p}>
        第 11 节讲的 SS-TWR 与 DS-TWR，各自都只讲了一种走法。标准的 §10.29.6.3–.7 一共列了五种——
        它们量的是<i>同一个距离</i>，用的是<i>同一套算术</i>（tof 的两条公式都不变），
        不同的只有一件事：<b>回复时间（SS-TWR 的 Treply）或往返时间信息（DS-TWR 的
        tround1/treply2）从产生它的设备走到需要它的设备，走的是哪条路</b>。这不是三个可有可无的选项，
        而是硬件能力换空口开销、开销换精度的一张取舍表——本节把它摊开，因为只讲一种走法，
        会让学习者以为那是唯一的走法。
      </p>
      <p style={p}>
        <b>三条路。</b><b>嵌入</b>（§10.29.6.4/§10.29.6.7，本仿真默认）把这个数直接写进它自己量出来的
        那一帧——要求硬件能预约未来的发送时刻，于是发送前就已知道自己会在何时发送。<b>延后</b>
        （§10.29.6.3/§10.29.6.6）先把那一帧发空，量出真实发送时刻后，再用一条专门的<b>后续报文</b>补上
        ——多花一个时隙，换掉“预约发送时刻”这个硬件要求。<b>固定</b>（§10.29.6.5，仅 SS-TWR）由双方
        事先约定一个数，应答方在<i>收到 Poll 之后的这个固定时延处</i>发送——这个数完全不上空口，
        帧最短，但要求转移成了“应答方必须真的踩准这个时刻”。DS-TWR 没有“固定”这一种：
        标准的五种过程里，双边双向测距只定义了嵌入与延后两种时间信息形态。
      </p>
      <table style={table}>
        <thead>
          <tr>
            <th style={cellHead}>帧</th>
            <th style={cellHead}>嵌入</th>
            <th style={cellHead}>延后</th>
            <th style={cellHead}>固定</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={cell}>SS Response</td>
            <td style={cell}>{RT_SS_RESP_EMBEDDED}</td>
            <td style={cell}>{RT_SS_RESP_FIXED}</td>
            <td style={cell}>{RT_SS_RESP_FIXED}</td>
          </tr>
          <tr>
            <td style={cell}>SS 延后报文</td>
            <td style={cell}>—</td>
            <td style={cell}>{RT_SS_DEFER_MSG}（MHR + RRTI IE + FCS）</td>
            <td style={cell}>—</td>
          </tr>
          <tr>
            <td style={cell}>DS Final</td>
            <td style={cell}>14 + 12A（{RT_DS_ANCHORS} 锚点 = {RT_DS_FINAL_EMBEDDED}）</td>
            <td style={cell}>14 + 2A（{RT_DS_ANCHORS} 锚点 = {RT_DS_FINAL_DEFERRED}）</td>
            <td style={cell}>—</td>
          </tr>
        </tbody>
      </table>
      <p style={p}>
        延后的 Final <b>不是空的</b>：锚点要靠它得知标签究竟有没有收到自己的 Response，
        因此它仍带响应方名单——RMI IE 的固定部分加每个响应方 2 字节的短地址——只是不再带那 4 字节的
        往返时间，也完全没有 RRTI IE，于是每多一个锚点只长 2 字节而不是 12。
        <b>127 字节的 PSDU 上限（§16.2.7）由此换来一个可以算出来的锚点上限</b>——不是写死的常数，
        而是轮里最长的那一帧还能塞进 127 字节的最大锚点数：嵌入式 DS Final 曾经是拖住每一种形态的
        那根绳，所以它换来的上限最紧，只有 <b>{RT_CAP_DS_EMBEDDED}</b> 个锚点；一旦 Final 不再随锚点数
        暴涨（延后），或者轮里根本没有 Final（SS-TWR 的三种形态都是），上限跳到 Poll 帧自己的长度
        （27 + 3A）能撑住的 <b>{RT_CAP_DS_DEFERRED}</b> 个——DS 延后与 SS 嵌入、SS 延后、SS 固定
        这四种形态，锚点上限都是同一个 <b>{RT_CAP_SS}</b>。
      </p>
      <p style={p}>
        <b>谁最后手里有距离。</b>这张表是延后形态真正的代价，也是本节最值得记住的一格：
      </p>
      <table style={table}>
        <thead>
          <tr>
            <th style={cellHead}>形态</th>
            <th style={cellHead}>标签得到距离</th>
            <th style={cellHead}>锚点得到距离</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style={cell}>SS 嵌入</td><td style={cell}>✓ 收到 Response 时</td><td style={cell}>✗</td></tr>
          <tr><td style={cell}>SS 固定</td><td style={cell}>✓ 收到 Response 时</td><td style={cell}>✗</td></tr>
          <tr><td style={cell}>SS 延后</td><td style={cell}>✓ 收到延后报文时</td><td style={cell}>✗</td></tr>
          <tr><td style={cell}>DS 嵌入</td><td style={cell}>✓ 收到报告时</td><td style={cell}>✓ 收到 Final 时</td></tr>
          <tr><td style={cell}>DS 延后</td><td style={cell}>✓ 收到报告时</td><td style={cell}>✗</td></tr>
        </tbody>
      </table>
      <p style={p}>
        标签在全部五种里都拿得到距离——毕竟它是控制方也是发起方（第 11 节）。但<b>只有 DS 嵌入</b>
        让锚点也拿到：Final 把标签的两个时间（tround1、treply2）带给了它，锚点才能自己算出同一个
        tof。一旦把 Final 延后，锚点就只收到一份地址名单，从没见过算距离所需的那两个数——
        它从“测距的另一半参与者”退化成了一个单纯的<b>应答器</b>（transponder）。锚点若要知道距离，
        只能靠标签事后再告诉它，而这条路本仿真没有建模。
      </p>
      <p style={p}>
        <b>五种走法量出同一个距离。</b>同一个场景——5 m、单锚点、两端晶振相差 35 ppm
        （锚点 +20 ppm、标签 −15 ppm）——五种 replyTime/method 组合各跑一轮，量出的距离是：
        SS 嵌入与 SS 延后 <b>4.998803 m</b>（一模一样，因为走的是同一套算术，只是换了一条载波）；
        SS 固定 <b>4.998630 m</b>（不一样，是因为它的时延是按<i>应答方自己的晶振</i>数的——
        <code>ssTwrCorrected</code> 的 (1 − coffs) 修正项照样乘它——ppm 误差从另一扇门进来）；
        DS 嵌入与 DS 延后 <b>4.999075 m</b>（五者中最接近真实值——这正是 DS-TWR 存在的全部理由）。
        两端晶振对准时，五者在时间戳噪声之内<b>逐位相同</b>，都是 <b>5.001420 m</b>——
        搬运路线只决定谁在何时拿到这几个时间量，不决定算出来的是哪个距离。
      </p>
      <p style={p}>
        <b>固定回复时间，唯一不对齐时隙的发送。</b>其余四种形态里，每一帧都在自己时隙的边界起发；
        固定形态里应答方却是在<i>收到 Poll 之后的一个固定时延处</i>发送，这个时刻不由时隙边界决定，
        于是编辑器把它当成一个独立的数字框（RSTU）暴露出来——调得太小，应答方会在自己的时隙还没
        开始时发送；调得太大，会被自己时隙的边界切掉——两种越界整轮都以超时收场，这正是这一形态
        真实的脆弱之处，而不是一处需要修的故障。
      </p>
      <p style={p}>
        <b>本节明确不做的三件事。</b>其一，本仿真器没有一个 MAC 原语能在空口上启停或重配一个测距会话
        （标准 §10.29.6.2 的控制面），因此 <code>replyTime</code> 是<b>场景配置</b>，不是协商出来的结果。
        其二，两端<b>不会</b>就回复时间讨价还价：真实设备可以用 RRTN IE 交换意愿，本仿真没有建模它，
        三种形态都是场景写死的。其三，本仿真的应答方在固定形态下<b>总是精确命中</b>它自己算出的那个
        时刻；真实设备的发送时刻有抖动，而 <code>Treply</code> 差 1 ns 就是约 15 cm 的测距误差——
        这是固定形态一个真实的弱点，本刀没有建模它。
      </p>

      <h4 style={h}>16 · 多对多测距：一次发送既问也答（标准 §10.32.6 SS-TWR/§10.32.7 DS-TWR）</h4>
      <p style={p}>
        第 11 节的双向测距里，要让 N 台设备两两都知道彼此的距离，得让每台设备轮流当一次标签——
        N 轮、每轮 N 个时隙，一共 <b>N² 个时隙</b>。多对多测距（many-to-many ranging，M2M）
        把它压成 <b>N 个时隙</b>：参与者 0…N−1 依次发送一次，谁的这一次发送，对排在它<i>后面</i>
        的每个人是「问」，对排在它<i>前面</i>的每个人是「答」——一次发送同时干两份活，N 次发送
        就够测出全部 N(N−1)/2 条距离。这里没有标签，也没有锚点：场景里的每一台 UWB 设备都是
        参与者，<code>uwb.role</code> 只决定它在编辑器和场景图里画成什么样子，不影响谁跟谁测距
        （design §5，另见节点面板的角色一节）。
      </p>
      <table style={table}>
        <thead>
          <tr>
            <th style={cellHead}>N</th>
            <th style={cellHead}>轮流当标签：时隙</th>
            <th style={cellHead}>轮流当标签：距离记录</th>
            <th style={cellHead}>多对多 SS：时隙</th>
            <th style={cellHead}>多对多 DS：时隙</th>
            <th style={cellHead}>两者量到的距离</th>
          </tr>
        </thead>
        <tbody>
          {M2M_NS.map((n) => (
            <tr key={n}>
              <td style={cell}>{n}</td>
              <td style={cell}>{takingTurnsSlots(n)}</td>
              <td style={cell}>{2 * pairsOf(n)}</td>
              <td style={cell}>{m2mSlots(n, 'ss')}</td>
              <td style={cell}>{m2mSlots(n, 'ds')}</td>
              <td style={cell}>{pairsOf(n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={p}>
        两种时隙数之比<b>恰好是 N</b>——不是巧合，是“一次发送干两份活”的直接推论。轮流当标签
        还不只是慢：它把每一对距离测了<b>两遍</b>（各自的那一轮各测一次，N = 6 时是 30 条记录，
        多对多只要 15 条），却仍然要花掉 N² 个时隙。费空口的那一种，恰好也是重复测量的那一种。
      </p>
      <p style={p}>
        <b>谁能把距离算出来（design §2）。</b>取一对参与者 i、j，i 排在 j 前面：i 在自己的
        时隙发送，j 在自己的时隙发送时，帧里带着自己的发送时刻，以及它已经收到的、排在它前面
        每一个人的接收时刻——因为 i 先发，j 发送时早已收到过 i。于是 <b>i 集齐了算距离要的
        全部四个时间量</b>（自己测的两个，加上 j 的帧带来的两个），而 <b>j 算不出来</b>：
        它缺的是「i 收到 j 的时刻」，可 i 发送的那一刻，这件事还没发生。<b>每一对距离，只有排在
        前面的那一个参与者算得出来。</b>参与者 i 恰好拿到 N−1−i 条：N = 3 时依次是
        <b> {perParticipant(3).join('、')}</b>，N = 6 时依次是 <b>{perParticipant(6).join('、')}</b>
        ——参与者 0 拿到全部 N−1 条，<b>排在最后的参与者一条也算不出来</b>，它的那一次发送却要
        带上前面每一个人的接收时刻，是全轮最长的一帧：它把自己的发送变成了对别人的服务，
        自己却什么也没算到。
      </p>
      <p style={p}>
        <b>DS 是两趟，不是两倍的帧。</b>DS-TWR 还需要两个时间量（tround2、treply2），它们要求
        较早的那个参与者<b>再发一次</b>，所以多对多 DS 是两趟、每趟 N 个时隙——上表的 2N 列。
        多花这一趟换来的是精度：六台设备、晶振拉开到接近标准允许的 ±20 ppm 时，SS-TWR 的最大
        误差 <b>0.2175 m</b>（平均 0.0828 m），DS-TWR 只有 <b>0.001454 m</b>（平均 0.000637 m）
        ——约 150× 的差距，原因和第 15 节一样：SS-TWR 要把对方的回复间隔按自己估计的载波频偏
        折算过来，而多对多的回复间隔动辄好几个时隙那么长，估计的残差就被放大成了分米级；
        DS-TWR 则直接抵消掉这个偏差，从不需要去估计它。
      </p>
      <p style={p}>
        <b>帧会长多大。</b>参与者 i 的一次发送带着 i 个接收时刻：MHR + RRMC + 自己的发送时刻
        IE + 接收时刻 IE（i = 0 时没有这个 IE）+ FCS——<code>uwbM2mBytes(i)</code>。六个参与者
        的一轮里，六次发送依次是 <b>{M2M_BYTES_N6.join(' / ')}</b> 字节：越往后越长，因为要带的
        接收时刻越多。127 字节的 PSDU 上限（标准 §16.2.7）换来一个可以算出来的参与者上限——
        <code>uwbMaxParticipants</code>，从不写成字面量：一轮多对多最多容纳 <b>{M2M_CAP}</b> 个
        参与者，SS 与 DS 算出的上限相同，因为撑爆帧长的是接收时刻的数量，不是要不要多走一趟。
      </p>

      <h4 style={h}>动手试试</h4>
      <p style={p}>
        · 放两个饱和上传的终端，再用砖墙让它们互为隐藏节点——看碰撞暴增，
        然后调低 RTS 门限来解决。<br />
        · 在 Wi-Fi 6 终端旁边放一个传统 802.11a 终端，观察它如何吞噬空口时间。<br />
        · 给一个终端语音业务、另一个饱和后台业务——比较它们的时延。<br />
        · 在任意帧交换过程中暂停，以 ±1 µs 步进穿越 SIFS 间隔。
      </p>
    </div>
  )
}
