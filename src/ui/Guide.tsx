/** Compact learning guide tying real 802.11 mechanisms to what the sim shows. */
import { DEFAULT_SIX_GHZ_CENTER_MHZ, DEFAULT_UWB_SESSION, sixGhzChannelNo } from '../model/scenario'
import { AOA_SIGMA_CLAMP_DEG, AOA_SIGMA_PHI_RAD, aoaSigmaDeg, antennaSpacingM } from '../uwb/aoa'
import {
  UWB_BAND_MHZ, UWB_BLINK_BYTES, UWB_CAPTURE_DB, UWB_MAX_INPUT_DBM_PER_MHZ, UWB_SIR_MIN_DB, UWB_TX_POWER_DBM,
} from '../uwb/phy'
import { ELLIPSE_DRAW_SCALE } from '../uwb/view'
import { useUi } from './store'

const h: React.CSSProperties = { margin: '10px 0 3px', fontSize: 12.5, color: '#d5dae3' }
const p: React.CSSProperties = { margin: '2px 0', fontSize: 11.5, color: 'var(--dim)', lineHeight: 1.5 }
const chip = (color: string) => (
  <span style={{ display: 'inline-block', width: 9, height: 9, background: color, borderRadius: 2, marginRight: 4 }} />
)
/** ASCII hyphen-minus to Unicode minus, for a JS negative number dropped straight into prose. */
const dbFmt = (v: number): string => String(v).replace('-', '−')
const UWB5_LO = UWB_BAND_MHZ[5].lo
const UWB5_HI = UWB_BAND_MHZ[5].hi
const UWB9_LO = UWB_BAND_MHZ[9].lo
const UWB9_HI = UWB_BAND_MHZ[9].hi
const SIX_GHZ_DEFAULT_CH = sixGhzChannelNo(DEFAULT_SIX_GHZ_CENTER_MHZ)
const AOA_ANTENNA_SPACING_CM = (antennaSpacingM(9) * 100).toFixed(1)
const AOA_SIGMA_BORESIGHT_DEG = aoaSigmaDeg(0).toFixed(1)
const AOA_SIGMA_60_DEG = aoaSigmaDeg(60).toFixed(1)

export function Guide() {
  const lang = useUi((s) => s.lang)
  return lang === 'zh' ? <GuideZh /> : <GuideEn />
}

export function GuideEn() {
  return (
    <div style={{ padding: '4px 12px 16px', overflowY: 'auto', fontSize: 12 }}>
      <h3 style={{ ...h, fontSize: 13 }}>How Wi-Fi shares the air</h3>
      <p style={p}>
        Wi-Fi has no central clock and no scheduler on the medium itself: every radio uses
        <b> CSMA/CA</b> — listen first, wait a quiet gap, then count down a random number of
        9 µs slots before transmitting. Everything you see in this simulator follows from that
        rule (IEEE 802.11-2024 §10.3).
      </p>

      <h4 style={h}>1 · Carrier sense — “is anyone talking?”</h4>
      <p style={p}>
        <b>Physical CS (CCA):</b> the medium is busy if a decodable preamble arrives above −82 dBm
        or total energy exceeds −62 dBm. Walls attenuate signal, so a station may <i>not hear</i>{' '}
        another one (hidden node) — drag stations behind brick walls to see collisions at the AP.
      </p>
      <p style={p}>
        <b>Virtual CS (NAV):</b> {chip('#9333ea')}every frame carries a Duration field announcing how
        long the whole exchange will take. Overhearers set a timer (NAV) and stay silent even after
        the radio goes quiet.
      </p>

      <h4 style={h}>2 · IFS gaps — priority by silence</h4>
      <p style={p}>
        <b>SIFS</b> (16 µs): the short gap inside an exchange — an ACK follows its data frame after
        exactly one SIFS, so nobody can sneak in between. <b>DIFS/AIFS</b> (34 µs / per-AC): the longer
        gap you must observe before contending. <b>EIFS</b> (94 µs): the penalty gap after hearing a
        corrupted frame.
      </p>

      <h4 style={h}>3 · Random backoff {chip('#f59e0b')}</h4>
      <p style={p}>
        Each contender draws a counter from [0, CW] and decrements it once per idle slot — watch the
        <b> bo:n</b> labels above nodes. First to reach 0 transmits. On failure CW doubles
        (15→31→…→1023) — that is the “exponential” in binary exponential backoff; on success it
        resets. Two stations that hit 0 in the same slot transmit simultaneously: a{' '}
        <b style={{ color: '#ef4444' }}>collision</b> — neither hears it happen; they only notice the
        missing ACK 45 µs later.
      </p>

      <h4 style={h}>4 · EDCA — QoS classes (Wi-Fi 5+)</h4>
      <p style={p}>
        Traffic is sorted into four access categories — <b>VO</b> voice, <b>VI</b> video, <b>BE</b>{' '}
        best-effort, <b>BK</b> background — each with its own AIFS and CW (Table 9-194). Voice waits
        less and draws smaller backoffs, so it statistically wins. Inside one device the categories
        race too (internal collision: the higher AC wins).
      </p>

      <h4 style={h}>5 · A-MPDU + BlockAck (Wi-Fi 5+)</h4>
      <p style={p}>
        Winning the channel is expensive, so modern Wi-Fi ships up to 64 frames per win as one
        aggregate (<b>×n</b> on blue/green blocks) answered by a single {chip('#d8b4fe')}BlockAck.
        This — not raw PHY speed — is where most of the throughput gain over legacy Wi-Fi lives.
      </p>

      <h4 style={h}>6 · TXOP bursting</h4>
      <p style={p}>
        An EDCA winner owns the medium for a bounded time (e.g. 4.096 ms for video) and may chain
        several exchanges separated only by SIFS — look for back-to-back data blocks with no
        backoff between them.
      </p>

      <h4 style={h}>7 · OFDMA (Wi-Fi 6)</h4>
      <p style={p}>
        The AP can split the channel into resource units and serve several stations{' '}
        <i>simultaneously</i>: one wide MU PPDU downlink (answered by simultaneous BlockAcks), or a{' '}
        {chip('#facc15')}<b>Trigger</b> frame that schedules multiple stations to transmit uplink at
        the same instant, answered by one Multi-STA BlockAck. Contention happens once, for the whole
        group. What each station sends back is a <b>TB PPDU</b> (trigger-based): the Trigger fixes its
        RU, MCS, length and power, and every station pads to the same length so all of them end together.
      </p>

      <h4 style={h}>8 · MLO (Wi-Fi 7)</h4>
      <p style={p}>
        A multi-link device runs full MACs on two bands at once (here 5 + 6 GHz — the 6 GHz lane is
        marked <b>·6G</b>, its waves render as wireframes). Both links pull from one shared queue:
        whichever wins airtime first carries the next frame.
      </p>

      <h4 style={h}>9 · Rates and the PHY</h4>
      <p style={p}>
        Airtime = preamble + symbols. A far station decodes only low MCS (fewer bits per symbol), so
        its frames take longer — and because CSMA/CA shares <i>transmissions</i>, not <i>time</i>,
        one slow station drags everyone's throughput down (rate anomaly). 4096-QAM (Wi-Fi 7 MCS 13)
        needs a very clean signal: ≥ −46 dBm.
      </p>

      <h4 style={h}>10 · Ambient power (802.11bp)</h4>
      <p style={p}>
        An AMP tag is a battery-free station: it never runs carrier sense and never contends. It only
        transmits inside a slot that an <b>AMP AP</b>'s trigger has just opened for it — scheduling has
        moved entirely into the AP.
      </p>
      <p style={p}>
        A round is one frame exchange: a CTS-to-self reserves the medium, then a{' '}
        {chip('#2dd4bf')}<b>Trigger</b> opens N uplink slots. Each slot is followed one AMP SIFS later by
        an {chip('#2dd4bf')}<b>AMP Ack</b>: tags have no clock of their own, so counting these Acks is how
        each one finds its own slot and knows when the round has moved on.
      </p>
      <p style={p}>
        Which slot a tag uses is decided by <b>ABOC/ACW</b>: a tag draws a counter uniformly from
        [0, ACW] on the trigger and answers in slot ABOC + 1 if that falls within the N slots on offer,
        otherwise it sits the round out.
      </p>
      <p style={p}>
        On the timeline: teal blocks are the AP's downlink AMP PPDUs (Trigger, Ack), violet blocks are a{' '}
        {chip('#a78bfa')}tag's uplink response. The AP's lane carries a thin tick at every slot boundary;
        each tag's own lane carries the labelled span it spends armed and waiting for its turn.
      </p>
      <p style={p}>
        P802.11bp is an unratified draft (D0.5 May 2026, D1.0 letter ballot September 2026) — this
        simulator follows 11-24/1613r20, 11-26/1519r5 and 11-26/1889r4, and marks every value the draft
        leaves TBD as a model choice.
      </p>

      <h4 style={h}>11 · UWB ranging (802.15.4-2024 HRP)</h4>
      <p style={p}>
        UWB does not share the Wi-Fi air at all — it is a second radio (channel 5 at 6489.6 MHz or
        channel 9 at 7987.2 MHz, 499.2 Mchip/s) whose job is to measure <i>distance</i>, not to carry
        traffic. Half a gigahertz of bandwidth makes a pulse's leading edge sharp enough to time to
        picoseconds, and one picosecond is 0.3 mm of flight.
      </p>
      <p style={p}>
        <b>The ranging counter</b> is a free-running clock counting in <b>RCTU</b> of 15.650 ps —
        one 128th of a chip (§10.29.1.4). Every frame's <b>RMARKER</b> — the first chip after the SFD,
        73.269 µs into the PPDU (§10.29.1.1) — is stamped with the counter reading at the antenna, and
        a range is nothing but arithmetic on such stamps: four of them in SS-TWR (two frames), six in
        DS-TWR (three frames, each stamped at both ends). Frames are SP1 BPRF PPDUs: SYNC, SFD,
        then the scrambled timestamp sequence (STS) before the PHR (§16.2), which is what makes the
        timestamp itself hard to forge.
      </p>
      <p style={p}>
        <b>SS-TWR</b> (§10.29.1.2.2) is one round trip — Poll out, Response back,
        tof = (T<sub>round</sub> − T<sub>reply</sub>)/2 — so two crystals 20 ppm apart over a 2 ms reply
        cost 20 ns ≈ 6 m unless the carrier-frequency offset the receiver measured is used to correct it.
        <b> DS-TWR</b> (§10.29.1.2.4) adds a third message, the Final, so each clock appears in both a
        round-trip and a reply time and the rate errors divide out — picoseconds instead of nanoseconds,
        for twice the airtime.
      </p>
      <p style={p}>
        <b>Blocks, rounds, slots</b> (§10.32.2): a session is a train of ranging <b>blocks</b>, each
        block is cut into <b>rounds</b> — one per tag — and each round into <b>slots</b>, every slot
        owned by exactly one device. The block is 200 ms and the slot 2 ms — both FiRa's defaults, not
        the standard's, which fixes only the RSTU they are counted in. Nothing contends: no CCA, no
        backoff, no NAV, and every reply time is known in advance. A DS round with N anchors takes
        2N + 2 slots (Poll, N Responses, Final, N Reports); between its round and the next block the
        tag's radio is off, which is what lets a coin cell last.
      </p>
      <p style={p}>
        <b>Contention-based rounds</b> (schedule mode 0, §10.32.2): instead of naming a slot per
        anchor, the Poll opens a shared response phase — its RCPS IE (§10.32.9.5) advertises a
        window of {DEFAULT_UWB_SESSION.contentionSlots} slots and its RCMA IE (§10.32.9.6) a retry
        budget of {DEFAULT_UWB_SESSION.maxAttempts} attempts — and every anchor draws one slot in
        it uniformly. Two answers landing in the same slot both fail unless one leads by the
        channel's {UWB_CAPTURE_DB} dB capture margin, logged as <b>UWB_CONTEND_COLLISION</b>; since
        an SS-TWR responder has no frame of its own to learn whether it was heard, the model has
        the network tell it at the round's end — a hit refills its budget, a miss spends one
        attempt, and an empty budget sits the anchor out for a round.
      </p>
      <p style={p}>
        In the scene: {chip('#fbbf24')}each ring is one measured range — every point that far from the
        anchor that measured it — and where the rings cross is the fix, drawn as a small{' '}
        {chip('#f59e0b')}cross. Rings, cross and ellipse fade out over one ranging block, so what you
        see is what was just measured. The ellipse around the cross is the solver's 1-σ confidence: a
        good fix is a couple of centimetres across, invisible beside a 3.5 m ring, so it is drawn at{' '}
        <b>{ELLIPSE_DRAW_SCALE}×</b> — the inspector shows the true axes. Its shape is geometry, not noise: anchors that
        nearly line up give a long thin ellipse and a large <b>GDOP</b>.
      </p>
      <p style={p}>
        Model numbers: −14 dBm transmit, −93 dBm sensitivity, 6 dB capture, path-loss exponent 2,
        100 ps of 1-σ timestamp noise (σ<sub>range</sub> = c·σ<sub>ts</sub>/√2 ≈ 2.1 cm), 0.2 ppm of
        residual clock-offset error, and a wall's excess delay of 0.2 ns (glass) / 0.5 ns (drywall) /
        2.0 ns (brick). That NLOS delay is a bias, not noise — averaging never removes it — and a path
        through any wall is reported with the worse FoM, 75 % within 12 ns instead of 97 % within
        0.5 ns (§10.29.1.7).
      </p>
      <p style={p}>
        <b>Sharing the 6 GHz band:</b> UWB channel 5 ({UWB5_LO}–{UWB5_HI} MHz) sits inside the 6 GHz Wi-Fi band;
        channel 9 ({UWB9_LO}–{UWB9_HI} MHz) never overlaps it. <code>Scenario.sixGhzCenterMhz</code> numbers the
        Wi-Fi channel — (centre − 5950) / 5 — so the model default {DEFAULT_SIX_GHZ_CENTER_MHZ} MHz is channel{' '}
        {SIX_GHZ_DEFAULT_CH}, clear of channel 5, while channel 71 (6305 MHz, 80 MHz wide) sits fully inside it —
        the coexistence lesson's setting. The two sides are lopsided: a Wi-Fi AP typically radiates around 20 dBm,
        a UWB frame only {dbFmt(UWB_TX_POWER_DBM)} dBm spread over half a gigahertz. Under an overlapping Wi-Fi
        PPDU, the UWB receiver's correlation gain still decodes down to a signal-to-interference ratio (SIR) of{' '}
        {dbFmt(UWB_SIR_MIN_DB)} dB (model — the standard fixes only the receiver's maximum input, {dbFmt(UWB_MAX_INPUT_DBM_PER_MHZ)}{' '}
        dBm/MHz, §16.4.10); below that the frame is lost, logged as <b>UWB_INTERFERED</b>, "lost to Wi-Fi". The
        reverse is far gentler: past about 40 cm a UWB frame's in-band power falls below the −62 dBm
        energy-detect floor, so at any realistic spacing Wi-Fi's CCA (physical carrier sense) never fires from
        it — it only shows up as a small noise rise inside the Wi-Fi receiver's SINR while the frame is on the
        air. The practical fix is UWB channel 9, or a 6 GHz Wi-Fi channel that does not overlap channel 5.
      </p>
      <p style={p}>
        <b>One-way ranging</b> (§10.29.1.2.5) trades the round trip for a time difference of arrival. In{' '}
        <b>DL-TDoA</b> the anchors run the round instead — anchor 0 sends the Poll and the Final, the others
        Respond, and every message carries the sender's own TX counter and the RX counters it holds for the
        rest (FiRa-style content, model) — while a tag never transmits: it just listens, timestamps every
        arrival on its own clock, and differences each responder against anchor 0. Those differences span a
        whole round, so a listening tag's crystal does not cancel the way it does in TWR: it first measures
        its own Poll-to-Final interval against the true one the anchors report and rescales its raw
        differences by that ratio. Without this <b>clock-rate correction</b> the error is 20 ppm of the gap
        between the Poll and the response being timed: up to 6 ms in the five-slot round the lessons run, so
        36 m, and 96 m for the last of nine anchors, whose response comes 16 ms after the Poll. With it, the fix lands in decimetres.
        <b>UL-TDoA</b> turns the tag into the
        transmitter instead: one {UWB_BLINK_BYTES}-octet <b>blink</b> (model, FiRa-style) and nothing else,
        timestamped by anchors sharing one common timebase — "wired sync" (model) — each left with a fixed
        residual of <code>syncErrorNs</code> ({DEFAULT_UWB_SESSION.syncErrorNs} ns by default, i.e. perfect
        sync), which the fix's ellipse grows with. Either
        way the position now comes from <b>hyperbolic positioning</b>, not trilateration: a time difference
        traces a hyperbola, so three differences (four anchors) replace trilateration's three ranges, and any
        number of tags can listen or blink without the round growing — DL-TDoA scales to an unlimited, silent
        audience, UL-TDoA to as many tags as the block has slots for, one blink each.
      </p>
      <p style={p}>
        <b>Angle of arrival (AoA)</b> (§10.29.1.1 lists it among ranging results) adds a bearing to
        the range. An anchor's two antennas sit half a wavelength apart on its boresight —{' '}
        {AOA_ANTENNA_SPACING_CM} cm on channel 9 — so a wavefront arriving at azimuth θ off
        boresight reaches the far one later, a phase difference φ = 2π·(d/λ)·sin θ (PDoA, model,
        FiRa-style). Inverting that line turns the receiver's phase noise (σ<sub>φ</sub> ={' '}
        {AOA_SIGMA_PHI_RAD} rad, model) into a bearing error that grows with |θ|:{' '}
        {AOA_SIGMA_BORESIGHT_DEG}° at boresight, {AOA_SIGMA_60_DEG}° at 60°, clamped at{' '}
        {AOA_SIGMA_CLAMP_DEG}° near the edge of the ±90° field of view, where the array goes blind
        to angle. Behind the anchor the geometry mirrors — sin(180° − θ) = sin θ — so a tag there
        is reported at its mirror image in front instead; pointing the anchor's <code>yawDeg</code>{' '}
        boresight at the room, and reading the bearing off it, is the only defence two antennas
        have. With DS-TWR an anchor that now holds both a range and a bearing fixes the tag alone,
        from itself: the range's few centimetres of error run along the ray, while the bearing's
        angle error becomes a <b>cross-range error</b> that grows with distance —{' '}
        r<sub>h</sub>·θ (θ in radians) metres off to the side, where r<sub>h</sub> = √(r² − Δz²) is
        the <i>horizontal</i> range (an anchor on the ceiling measures a slant range r, not the
        horizontal distance) — so the fix's error ellipse is long and thin, turned a quarter turn
        from the ray, at any distance past a few centimetres.
      </p>

      <h4 style={h}>Things to try</h4>
      <p style={p}>
        · Two saturated stations, then make them mutually hidden with a brick wall — watch collisions
        explode, then lower the RTS threshold to fix it.<br />
        · Set one station to legacy (802.11a) next to Wi-Fi 6 stations and watch it eat airtime.<br />
        · Give one station voice traffic and another saturated background — compare their delays.<br />
        · Pause during any exchange and step ±1 µs through the SIFS gap.
      </p>
    </div>
  )
}

export function GuideZh() {
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
        时间戳 1-σ 噪声 100 ps（σ<sub>range</sub> = c·σ<sub>ts</sub>/√2 ≈ 2.1 cm）、
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
