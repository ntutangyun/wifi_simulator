/**
 * Edit-mode reference: what every tool, control and property does, and what
 * each option means for the simulation. Protocol theory lives in 📚 Course —
 * this panel stays on the scenario's configuration surface.
 */
import { useUi } from '../ui/store'

const h: React.CSSProperties = { margin: '10px 0 3px', fontSize: 12.5, color: '#d5dae3' }
const p: React.CSSProperties = { margin: '2px 0', fontSize: 11.5, color: 'var(--dim)', lineHeight: 1.5 }
const dl: React.CSSProperties = { margin: '2px 0 6px', fontSize: 11.5, color: 'var(--dim)', lineHeight: 1.5 }
const term: React.CSSProperties = { color: '#c3cad6' }
const note: React.CSSProperties = {
  margin: '4px 0 2px', padding: '5px 7px', fontSize: 11, lineHeight: 1.5,
  color: 'var(--dim)', background: '#1b202b', borderLeft: '2px solid #3b82f6', borderRadius: 2,
}

/** One "term — meaning" row. */
function D({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div style={dl}>
      <b style={term}>{t}</b> — {children}
    </div>
  )
}

export function EditorGuide() {
  const lang = useUi((s) => s.lang)
  return lang === 'zh' ? <EditorGuideZh /> : <EditorGuideEn />
}

function EditorGuideEn() {
  return (
    <div style={{ padding: '4px 12px 16px', overflowY: 'auto', fontSize: 12 }}>
      <h3 style={{ ...h, fontSize: 13 }}>What every control does</h3>
      <p style={p}>
        Everything in Edit mode configures one <b>scenario</b> — the house, the devices and the
        traffic. Switching to <b>▶ Simulate</b> starts a fresh run from the current scenario; the
        protocol mechanics behind it are explained in <b>📚 Course</b>.
      </p>
      <div style={note}>
        Edits live in memory only. <b>💾 Save</b> stores the scenario in this browser (restored on
        reload); <b>⬇ Export</b> writes the same thing as a JSON file.
      </div>

      <h4 style={h}>Tools (menu bar)</h4>
      <D t="☝ select">
        click a node, wall or room to load it into ⚙ Properties below; drag a node to move it.
        Positions snap to a 0.1 m grid.
      </D>
      <D t="▭ room">
        drag a rectangle (≥ 1×1 m). Walls are <i>derived</i> from rooms: edges shared by two
        touching rooms collapse into a single wall, and existing materials/openings are preserved.
      </D>
      <D t="🚪 door / 🪟 window">
        click on a wall to punch a 0.9 m / 1.2 m opening there. An opening is an RF hole — a ray
        crossing it pays no wall loss (modeled as a full-height gap).
      </D>
      <D t="📡 AP">
        click to drop the plan&rsquo;s access point: 20 dBm, 2.0 m high, Wi-Fi 7 with every feature
        on. Wi-Fi allows exactly one, so the tool is greyed out while the plan already has an AP —
        and it is the way back after deleting one to build a UWB-only plan.
      </D>
      <D t="📱 STA">
        click to drop a station: 15 dBm, 1.0 m high, <i>browsing</i> traffic, 802.11a legacy.
        Set its real properties afterwards. This tool, 🏷 AMP tag and 🎲 Spawn STAs are greyed out
        while the plan has no AP, because a Wi-Fi device without one is a scenario that cannot run.
      </D>
      <D t="🏷 AMP tag">
        click to drop an IEEE P802.11bp ambient-power tag: a battery-free device that only replies
        when the AP polls it. Tags live on the 2.4 GHz link, and the AP needs to be Wi-Fi 7 (EHT)
        with its own <b>AMP polling (802.11bp)</b> section turned on before any tag responds.
      </D>
      <D t="📍 UWB anchor">
        click to drop an IEEE 802.15.4-2024 ranging anchor: a fixed device at a known place, 2.2 m
        high, that answers a tag&rsquo;s poll in its own ranging slot. A fix needs three anchors the
        tag can hear, and they must not sit in a straight line.
      </D>
      <D t="📱 UWB tag">
        click to drop a ranging tag: it polls every anchor once per ranging block and solves its
        own position from the ranges. The first anchor or tag opens the <b>UWB session</b> below
        the node list; deleting the last one closes it again.
      </D>
      <D t="⌂ fit">
        recenter and refit the plan. Wheel zooms, middle/right-drag pans.
      </D>

      <h4 style={h}>Scenario controls (menu bar)</h4>
      <D t="💾 Save / 📂 Load">browser localStorage, one slot.</D>
      <D t="⬇ Export / ⬆ Import">
        scenario JSON. Imports are schema-validated: exactly one AP whenever a station or AMP tag is
        present, unique node ids.
      </D>
      <D t="🎲 Spawn STAs">
        N stations at random spots inside rooms, each with a random traffic profile (legacy
        802.11a, 15 dBm). Quick way to build congestion.
      </D>
      <D t="RTS (bytes)">
        <b>dot11RTSThreshold</b>. Frames whose PSDU exceeds it are protected by an RTS/CTS
        handshake first. Default <b>3000</b> → effectively off for ordinary 1500 B frames. Set it
        to ~500 to protect everything (cures hidden-node collisions, costs airtime); set it huge to
        disable protection entirely.
      </D>
      <D t="Seed">
        seeds every random stream (backoff draws, traffic jitter). Same scenario + same seed =
        bit-identical run. Change it to resample the same setup.
      </D>
      <D t="6 GHz channel">
        the centre frequency of the plan&rsquo;s 6 GHz Wi-Fi link, <code>Scenario.sixGhzCenterMhz</code>{' '}
        (default 5 985 MHz, 5 MHz steps). The readout next to the field is the 802.11ax channel
        number, (centre − 5 950) / 5 — the default is channel 7. Below it, whenever a UWB session is
        on channel 5, an overlap line reports what fraction of the Wi-Fi channel falls inside UWB
        channel 5&rsquo;s 6 240–6 739.2 MHz band; that fraction is what feeds the Wi-Fi ↔ UWB
        coexistence coupling (📚 Course, §11).
      </D>

      <h4 style={h}>Node properties</h4>
      <D t="Name">
        display label only — timeline lanes, tooltips, the 3D scene. The internal id never changes.
      </D>
      <D t="Wi-Fi">
        the device's generation: it sets the PHY and decides <i>which features exist at all</i>.
        A link runs at the <b>lower</b> of its two ends, so a legacy STA drags its AP exchange down
        to 802.11a rates.
      </D>
      <div style={{ ...dl, paddingLeft: 8 }}>
        · <b style={term}>802.11a (legacy)</b> — OFDM 6–54 Mbps, 20 µs preamble, one DCF queue, no
        QoS, no aggregation.<br />
        · <b style={term}>Wi-Fi 5 (VHT)</b> — MCS 0–8 (6.5–78 Mbps), 40 µs preamble; unlocks EDCA,
        A-MPDU, TXOP.<br />
        · <b style={term}>Wi-Fi 6 (HE)</b> — MCS 0–11 (8.6–143.4 Mbps), 44 µs preamble, 13.6 µs
        symbols; adds OFDMA and the 6 GHz band.<br />
        · <b style={term}>Wi-Fi 7 (EHT)</b> — MCS 0–13 (up to 172.1 Mbps), 48 µs preamble; adds MLO
        and 4096-QAM.
      </div>
      <D t="Feature checkboxes">
        each feature is used on a link only when <b>both ends</b> have it checked — unticking it on
        the AP disables it BSS-wide. That makes them the cleanest A/B experiment in the simulator:
        run once with, once without, compare the timeline.
      </D>
      <div style={{ ...dl, paddingLeft: 8 }}>
        · <b style={term}>EDCA</b> — four access categories instead of one DCF queue, each with its
        own AIFS/CW (VO: AIFSN 2, CW 3–7 … BK: AIFSN 7, CW 15–1023) plus internal-collision
        arbitration inside the device.<br />
        · <b style={term}>A-MPDU + BlockAck</b> — up to 64 MPDUs in one PPDU, acknowledged by a
        single BlockAck instead of one ACK per frame.<br />
        · <b style={term}>TXOP bursting</b> — keep the medium for SIFS-chained exchanges without
        re-contending, up to the AC's limit (VI 4.096 ms, BE/BK 2.528 ms, VO 2.08 ms).<br />
        · <b style={term}>OFDMA</b> — the AP serves several STAs in one PPDU (DL MU) and polls them
        with a Trigger frame for UL MU. RUs are modeled as 1/n rate scaling.<br />
        · <b style={term}>MLO</b> — the device runs on 5 GHz <i>and</i> 6 GHz simultaneously over
        shared queues, and gets two timeline lanes (<code>id</code> and <code>id#6g</code>).<br />
        · <b style={term}>4096-QAM</b> — permits MCS 12/13; without it Wi-Fi 7 is capped at MCS 11.
        Only reachable at strong RSSI anyway.
      </div>
      <D t="Link">
        shown for every non-MLO station except Wi-Fi 5 ones (VHT is a 5 GHz-only PHY): which band
        the radio sits on. The three bands are separate channels — devices on different links never
        hear or contend with each other. Relative to 5 GHz, this model gives 2.4 GHz −6.5 dB of path
        loss (it reaches further) and ERP-OFDM timing — SIFS 10 µs, DIFS 28 µs and a 6 µs signal
        extension on every frame — while 6 GHz gets +1.2 dB. An MLO device has no selector: it runs
        on 5 <i>and</i> 6 GHz.
      </D>
      <D t="TXOP protection">
        Shown when TXOP is on. How the node announces a burst of several exchanges it holds.
        <i>single</i> — each frame's Duration covers only its own response (default). The burst is
        still safe from anyone who hears the holder, because SIFS beats every AIFS. <i>boundary</i> —
        an RTS/CTS opens the burst and reserves the medium to the end of the TXOP, so stations hidden
        from the holder but near the receiver stay quiet too; a burst that ends early is truncated
        with CF-End, which the AP repeats. <i>multiple</i> — as boundary, and every data frame also
        carries the TXOP remainder (§9.2.5.2). Lesson 10 compares them.
      </D>
      <D t="Traffic">
        STAs only (the AP sends whatever the downlink legs generate). Tick any number of streams —
        a station can run a voice call and a cloud backup at once. Each stream keeps its own load
        <i>and</i> its own EDCA access category, so the two contend as separate queues inside the
        device; nothing ticked means idle. The streams:
      </D>
      <div style={{ ...dl, paddingLeft: 8 }}>
        · <b style={term}>video streaming</b> — DL 1400 B every 747–947 µs (≈13 Mbps) · AC_VI<br />
        · <b style={term}>voice call</b> — 200 B up + 200 B down every ~20 ms · AC_VO<br />
        · <b style={term}>cloud backup</b> — UL burst of 50 × 1500 B every 60 ms · AC_BK<br />
        · <b style={term}>web browsing</b> — 300 B UL request, then 20–80 × 1400 B DL 1 ms apart,
        repeating every 2–8 s · AC_BE<br />
        · <b style={term}>IoT sensor</b> — 100 B UL every 1–5 s · AC_BK<br />
        · <b style={term}>saturated upload</b> — queue permanently refilled with 1500 B UL frames ·
        AC_BE — the profile for airtime-fairness experiments<br />
        · <b style={term}>idle</b> — generates nothing; the node still receives and sets its NAV,
        so it is a pure overhearer.
      </div>
      <D t="Tx power">
        dBm at the antenna (AP 20, STA 15 by default). Received power ={' '}
        <code>Tx − (46.7 + 30·log₁₀ d) − wall losses</code>. Lower it to force a lower MCS, to push
        a station out of another's carrier-sense range (−82 dBm preamble / −62 dBm energy), or to
        manufacture a hidden node.
      </D>
      <D t="Height">
        the z coordinate in meters (AP 2.0, STA 1.0). It counts in the 3D distance; walls are tested
        in 2D, so height changes range only.
      </D>
      <D t="🗑 Delete node">
        removes the node. The AP is the one exception: it may only go once no station and no AMP
        tag is left, because Wi-Fi needs exactly one AP — a plan of nothing but UWB devices has no
        BSS at all and runs happily without one.
      </D>

      <h4 style={h}>UWB session</h4>
      <p style={p}>
        One section under the node list, shared by every ranging device; it appears with the first
        anchor or tag. A session is either <i>time-scheduled</i> — its whole shape fixed before it
        starts, so nothing contends for the medium — or <i>contention-based</i>, where the response
        phase is a shared window anchors draw a slot from at random.
      </p>
      <D t="Method">
        <b>SS-TWR</b> is one poll and one response per anchor; the clock offset between the two
        devices leaks straight into the range. <b>DS-TWR</b> adds a final and a report per anchor,
        which cancels that offset at twice the frames.
      </D>
      <D t="Schedule">
        <b>time-scheduled</b> (default) fixes every slot in advance, so nothing collides.{' '}
        <b>Contention</b> (schedule mode 0) instead opens a shared response window that anchors
        draw a slot from at random — offered only with SS-TWR, since DS-TWR&rsquo;s report would
        need a second contended window.
      </D>
      <D t="Response slots / Attempts">
        contention only: the response-phase window every anchor draws from (RCPS IE, 8 by default)
        and the retry budget an anchor spends before it sits a round out (RCMA IE, 3 by default).
        More slots trade a longer round for fewer collisions.
      </D>
      <D t="Block / Slot">
        the block repeats forever and every tag owns one round inside it, so the block sets the
        position update rate. A round is one slot per frame: <code>A+1</code> slots under SS-TWR,{' '}
        <code>2A+2</code> under DS-TWR for <code>A</code> anchors. The section prints the resulting{' '}
        <i>slots per round</i> and <i>rounds per block</i>.
      </D>
      <D t="Channel">
        5 (6489.6 MHz) or 9 (7987.2 MHz). Both are 499.2 MHz wide — that bandwidth, not the carrier,
        is what buys centimetre ranging.
      </D>
      <D t="Timestamp / clock-estimate noise">
        the two error sources of a range: the one-sigma jitter of a receive timestamp (100 ps is
        3 cm of flight, 2.1 cm of range) and what is left of the carrier-frequency-offset estimate. The second one is exactly
        what SS-TWR cannot cancel.
      </D>
      <D t="NLOS wall delay">
        charges every wall the ray crosses its extra delay (drywall 0.5 ns, brick 2 ns, glass
        0.2 ns). A wall makes a range read long, never short, so the fix is pulled away from the
        blocked anchor.
      </D>
      <p style={p}>
        A number the schedule cannot hold — a slot too short for the round&rsquo;s longest frame,
        more tags than the block fits, more than nine anchors — is reported in red under the
        section instead of failing on run.
      </p>

      <h4 style={h}>Wall properties</h4>
      <D t="Material">
        attenuation charged once per crossing of the direct ray: <b>drywall 5 dB</b>,{' '}
        <b>brick 12 dB</b>, <b>glass 3 dB</b>. A brick wall between two stations that both still
        reach the AP is the standard recipe for a hidden-node pair.
      </D>
      <D t="Remove openings">
        clears every door/window on the selected wall (add them back with 🚪 / 🪟).
      </D>
      <p style={p}>
        Walls are regenerated whenever rooms change; material and openings survive as long as the
        wall still geometrically exists.
      </p>

      <h4 style={h}>Room properties</h4>
      <D t="Name">label drawn on the plan and above the room in the 3D house.</D>
      <D t="🗑 Delete room">removes the room and any walls that belonged only to it.</D>

      <h4 style={h}>Object list order</h4>
      <p style={p}>
        The ▲▼ buttons in 🗂 Objects reorder nodes, and that order is the lane order in the timeline
        strip. An MLO device contributes two lanes (5 GHz first, then 6 GHz). The AP stays until
        the last station and AMP tag is gone; only then may it be deleted too.
      </p>
    </div>
  )
}

function EditorGuideZh() {
  return (
    <div style={{ padding: '4px 12px 16px', overflowY: 'auto', fontSize: 12 }}>
      <h3 style={{ ...h, fontSize: 13 }}>各项控件与属性说明</h3>
      <p style={p}>
        编辑模式中的一切都在配置同一个<b>场景</b>——房屋、设备与业务流量。切换到
        <b> ▶ 仿真</b> 会以当前场景重新开始一次运行；这些机制背后的协议原理请见
        <b> 📚 课程</b>。
      </p>
      <div style={note}>
        编辑结果仅保存在内存中。<b>💾 保存</b> 会把场景存入本浏览器（刷新后自动恢复）；
        <b>⬇ 导出</b> 则把同样的内容写成 JSON 文件。
      </div>

      <h4 style={h}>工具（菜单栏）</h4>
      <D t="☝ 选择">
        点击节点、墙体或房间，即可在下方 ⚙ 属性中编辑；拖动节点可移动位置，坐标对齐到 0.1 米栅格。
      </D>
      <D t="▭ 房间">
        拖出一个矩形（不小于 1×1 米）。墙体由房间<i>自动派生</i>：两个相邻房间共用的边会合并为一堵墙，
        已有的材质与门窗开口会被保留。
      </D>
      <D t="🚪 门 / 🪟 窗">
        在墙上点击，即可在该处开出 0.9 米 / 1.2 米的开口。开口是射频的“孔洞”——
        穿过开口的射线不计入墙体损耗（模型中视为通高开口）。
      </D>
      <D t="📡 AP">
        点击放置场景的接入点：20 dBm、高 2.0 米、Wi-Fi 7 且各项特性全开。
        Wi-Fi 有且仅允许一个 AP，因此场景中已有 AP 时该工具为灰；
        而删掉 AP 做纯 UWB 场景之后，也正是靠它把 AP 放回来。
      </D>
      <D t="📱 终端">
        点击放置一个终端：15 dBm、高 1.0 米、<i>网页浏览</i>业务、802.11a 传统制式，
        放置后再按需修改属性。场景中没有 AP 时，本工具、🏷 AMP 标签 与 🎲 随机生成终端 都是灰的——
        没有 AP 的 Wi-Fi 设备构成的场景根本无法运行。
      </D>
      <D t="🏷 AMP 标签">
        点击放置一个 IEEE P802.11bp 环境功率（ambient-power）标签：这是一种无电池设备，
        只有被 AP 轮询时才会应答。标签工作在 2.4 GHz 链路上，且 AP 必须是 Wi-Fi 7 (EHT)
        并打开其 <b>AMP 轮询（802.11bp）</b> 一节，标签才会有任何应答。
      </D>
      <D t="📍 UWB 锚点">
        点击放置一个 IEEE 802.15.4-2024 测距锚点：位置已知的固定设备，默认高 2.2 米，
        在自己的测距时隙内应答标签的轮询。要解算出位置，标签至少要听到三个锚点，
        且这些锚点不能排成一条直线。
      </D>
      <D t="📱 UWB 标签">
        点击放置一个测距标签：它在每个测距块内轮询所有锚点各一次，并据此解算自身位置。
        放下第一个锚点或标签时，节点列表下方会出现 <b>UWB 测距会话</b> 一节；删掉最后一个
        UWB 设备时该节随之消失。
      </D>
      <D t="⌂ 复位">
        重新居中并适配视图。滚轮缩放，中键/右键拖动平移。
      </D>

      <h4 style={h}>场景控件（菜单栏）</h4>
      <D t="💾 保存 / 📂 载入">浏览器 localStorage，仅一个存档位。</D>
      <D t="⬇ 导出 / ⬆ 导入">
        场景 JSON 文件。导入时会做模式校验：只要存在终端或 AMP 标签，就必须有且仅有一个 AP；节点 id 不重复。
      </D>
      <D t="🎲 随机生成终端">
        在房间内随机位置生成 N 个终端，业务类型随机（传统 802.11a，15 dBm）。快速制造拥塞的手段。
      </D>
      <D t="RTS（字节）">
        即 <b>dot11RTSThreshold</b>。PSDU 超过该门限的帧会先做 RTS/CTS 握手。默认
        <b> 3000</b> —— 对常见的 1500 B 帧相当于关闭。设为 500 左右可保护所有帧
        （能治好隐藏节点碰撞，但要付出空口开销）；设得极大则完全关闭保护。
      </D>
      <D t="种子">
        为所有随机流（退避抽取、业务抖动）播种。相同场景 + 相同种子 = 完全一致的运行结果；
        改变它即可对同一套配置重新抽样。
      </D>
      <D t="6 GHz 信道">
        本方案 6 GHz Wi-Fi 链路的中心频率，即 <code>Scenario.sixGhzCenterMhz</code>
        （默认 5 985 MHz，步进 5 MHz）。输入框旁边显示的是 802.11ax 信道编号，
        由（中心频率 − 5 950）/ 5 算出——默认即第 7 信道。当有 UWB 会话运行在信道 5 上时，
        下方还会显示一行重叠提示，给出该 Wi-Fi 信道落在 UWB 信道 5 的 6 240–6 739.2 MHz
        频段之内的比例；这个比例正是 Wi-Fi 与 UWB 共存耦合（📚 课程，第 11 节）的输入。
      </D>

      <h4 style={h}>节点属性</h4>
      <D t="名称">
        仅用于显示——时间轴泳道、悬停提示、3D 场景。内部 id 不会随之改变。
      </D>
      <D t="Wi-Fi">
        设备的制式：决定 PHY，也决定<i>哪些特性根本存在</i>。一条链路按两端中
        <b>较低</b>的制式工作，因此一个传统终端会把它与 AP 的帧交换拖回 802.11a 速率。
      </D>
      <div style={{ ...dl, paddingLeft: 8 }}>
        · <b style={term}>802.11a（传统）</b>——OFDM 6–54 Mbps，20 µs 前导，单一 DCF 队列，
        无 QoS、无聚合。<br />
        · <b style={term}>Wi-Fi 5 (VHT)</b>——MCS 0–8（6.5–78 Mbps），40 µs 前导；解锁 EDCA、
        A-MPDU、TXOP。<br />
        · <b style={term}>Wi-Fi 6 (HE)</b>——MCS 0–11（8.6–143.4 Mbps），44 µs 前导，13.6 µs 符号；
        增加 OFDMA 与 6 GHz 频段。<br />
        · <b style={term}>Wi-Fi 7 (EHT)</b>——MCS 0–13（最高 172.1 Mbps），48 µs 前导；
        增加 MLO 与 4096-QAM。
      </div>
      <D t="特性勾选框">
        只有<b>两端都勾选</b>的特性才会在链路上生效——在 AP 上取消勾选即可全 BSS 关闭该特性。
        这正是本仿真器里最干净的 A/B 实验方式：开一次、关一次，对比时间轴。
      </D>
      <div style={{ ...dl, paddingLeft: 8 }}>
        · <b style={term}>EDCA</b>——用四个接入类别取代单一 DCF 队列，各自有独立的 AIFS/CW
        （VO：AIFSN 2、CW 3–7 …… BK：AIFSN 7、CW 15–1023），并在设备内部做内部碰撞仲裁。<br />
        · <b style={term}>A-MPDU + BlockAck</b>——一个 PPDU 中最多聚合 64 个 MPDU，
        用一个 BlockAck 统一确认，而非逐帧 ACK。<br />
        · <b style={term}>TXOP 突发</b>——占住信道以 SIFS 相连连续发送、无需重新竞争，
        上限为该 AC 的 TXOP 限值（VI 4.096 ms，BE/BK 2.528 ms，VO 2.08 ms）。<br />
        · <b style={term}>OFDMA</b>——AP 用一个 PPDU 同时服务多个终端（下行 MU），
        并用触发帧轮询它们完成上行 MU。RU 以 1/n 速率缩放建模。<br />
        · <b style={term}>MLO</b>——设备在 5 GHz 与 6 GHz 上<i>同时</i>工作、共用队列，
        在时间轴上占两条泳道（<code>id</code> 与 <code>id#6g</code>）。<br />
        · <b style={term}>4096-QAM</b>——允许使用 MCS 12/13；不启用时 Wi-Fi 7 最高只到 MCS 11。
        无论如何都需要很强的 RSSI 才能达到。
      </div>
      <D t="频段">
        对除 Wi-Fi 5 以外的所有非 MLO 终端显示（VHT 只有 5 GHz 的 PHY）：该设备的射频工作在哪个
        频段。三个频段是彼此独立的信道——不同链路上的设备互相听不到、也不竞争。相对 5 GHz，
        本模型给 2.4 GHz 的路径损耗为 −6.5 dB（覆盖更远），并采用 ERP-OFDM 时序——SIFS 10 µs、
        DIFS 28 µs，每帧还带 6 µs 的信号扩展；6 GHz 则为 +1.2 dB。MLO 设备不显示该选项：
        它同时工作在 5 GHz 与 6 GHz 上。
      </D>
      <D t="TXOP 保护">
        开启 TXOP 时显示。节点持有多次交换的突发时如何预告。<i>单次</i>——每个帧的 Duration
        只覆盖自己的响应（默认）；能听到持有者的站点本来就插不进来，因为 SIFS 比任何 AIFS 都短。
        <i>边界</i>——用一次 RTS/CTS 开启突发，把介质预约到 TXOP 结束，于是离持有者远、离接收方近的
        隐藏站点也会保持安静；突发提前结束时用 CF-End 截断，AP 会重复一遍。<i>多重</i>——在边界的
        基础上，每个数据帧也携带 TXOP 剩余时间（§9.2.5.2）。第 10 课对比了三者。
      </D>
      <D t="业务">
        仅终端可设（AP 发送的是各下行业务产生的流量）。可以同时勾选多种业务——
        一台终端可以一边通话一边做云备份。每种业务保留各自的<i>负载</i>与 EDCA 接入类别，
        因此它们在设备内部作为独立队列竞争；一个都不勾即为空闲。各业务如下：
      </D>
      <div style={{ ...dl, paddingLeft: 8 }}>
        · <b style={term}>视频流</b>——下行 1400 B，每 747–947 µs 一个（≈13 Mbps）· AC_VI<br />
        · <b style={term}>语音通话</b>——每约 20 ms 上行 200 B + 下行 200 B · AC_VO<br />
        · <b style={term}>云备份</b>——每 60 ms 上行突发 50 × 1500 B · AC_BK<br />
        · <b style={term}>网页浏览</b>——上行 300 B 请求，随后 20–80 个 1400 B 下行帧（间隔 1 ms），
        每 2–8 秒循环一次 · AC_BE<br />
        · <b style={term}>物联网传感器</b>——每 1–5 秒上行 100 B · AC_BK<br />
        · <b style={term}>饱和上传</b>——队列始终被 1500 B 上行帧填满 · AC_BE——
        做空口公平性实验就用它<br />
        · <b style={term}>空闲</b>——不产生任何流量；节点仍会接收并设置 NAV，是纯粹的“旁听者”。
      </div>
      <D t="发射功率">
        天线口的 dBm（默认 AP 20、终端 15）。接收功率 ={' '}
        <code>发射功率 − (46.7 + 30·log₁₀ d) − 墙体损耗</code>。调低它可以强制降低 MCS、
        把某个终端推出另一个终端的载波侦听范围（前导 −82 dBm / 能量 −62 dBm），或人为制造隐藏节点。
      </D>
      <D t="高度">
        z 坐标，单位米（AP 2.0，终端 1.0）。它计入三维距离；墙体判定是二维的，
        因此高度只影响距离。
      </D>
      <D t="🗑 删除节点">
        删除该节点。AP 是唯一的例外：只有当场景里不再有终端、也不再有 AMP 标签时才能删除它，
        因为 Wi-Fi 要求有且仅有一个 AP——而纯 UWB 场景根本没有 BSS，没有 AP 也能正常仿真。
      </D>

      <h4 style={h}>UWB 测距会话</h4>
      <p style={p}>
        节点列表下方的一节，为所有测距设备共用；放下第一个锚点或标签时出现。测距会话可以是
        <i>时间调度</i>的——其全部结构在开始之前就已确定，没有任何设备需要竞争信道；也可以是
        <i>竞争调度</i>的——响应阶段是一个共享窗口，各锚点在其中随机抽取时隙。
      </p>
      <D t="测距方式">
        <b>SS-TWR</b>（单边双向）对每个锚点只有一次轮询和一次响应，两台设备之间的时钟偏差
        会原样进入测距结果；<b>DS-TWR</b>（双边双向）为每个锚点再加一帧终结帧和一帧报告帧，
        用两倍的帧数把这个偏差抵消掉。
      </D>
      <D t="调度方式">
        <b>时间调度</b>（默认）预先固定每个时隙，因此不会发生碰撞；<b>竞争调度</b>（调度模式 0）
        则改为打开一个共享响应窗口，各锚点在其中随机抽取一个时隙——仅在 SS-TWR 下可选，
        因为 DS-TWR 的报告帧还需要再开一个竞争窗口。
      </D>
      <D t="响应时隙数 / 尝试次数">
        仅竞争调度可用：响应时隙数是每个锚点据以抽取时隙的响应窗口（RCPS IE，默认 8 个）；
        尝试次数是锚点空过一轮之前可用的重试预算（RCMA IE，默认 3 次）。时隙越多，碰撞越少，
        但轮次也越长。
      </D>
      <D t="测距块 / 测距时隙">
        测距块循环往复，每个标签在块内独占一个轮次，因此块长决定了位置刷新率。
        一个轮次里一帧占一个时隙：<code>A</code> 个锚点时，SS-TWR 需 <code>A+1</code> 个时隙，
        DS-TWR 需 <code>2A+2</code> 个。本节会显示由此算出的<i>每轮时隙数</i>与<i>每块轮次数</i>。
      </D>
      <D t="信道">
        信道 5（6489.6 MHz）或信道 9（7987.2 MHz）。两者带宽都是 499.2 MHz——
        换来厘米级测距精度的正是这个带宽，而不是载波频率。
      </D>
      <D t="时间戳噪声 / 时钟估计噪声">
        测距误差的两个来源：接收时间戳抖动的 1-σ 值（100 ps 折合 3 cm 的飞行距离、2.1 cm 的测距误差），
        以及载波频偏估计之后残留的误差。后者正是 SS-TWR 无法抵消的那一部分。
      </D>
      <D t="NLOS 穿墙时延">
        把射线穿过的每一堵墙的附加时延计入（石膏板 0.5 ns、砖墙 2 ns、玻璃 0.2 ns）。
        墙只会让测距结果偏大、不会偏小，于是解算出的位置会被推离被遮挡的那个锚点。
      </D>
      <p style={p}>
        若某个参数排不进这个时间表——时隙装不下该轮次最长的一帧、标签数超过一个块能容纳的轮次数、
        或锚点超过九个——本节下方会用红字给出提示，而不是等到开始仿真时才报错。
      </p>

      <h4 style={h}>墙体属性</h4>
      <D t="材质">
        直射线每穿越一次所计的衰减：<b>石膏板 5 dB</b>、<b>砖墙 12 dB</b>、<b>玻璃 3 dB</b>。
        在两个终端之间放一堵砖墙、而两者又都能连上 AP，就是制造隐藏节点对的标准做法。
      </D>
      <D t="移除门窗开口">
        清除选中墙体上的所有门窗开口（可用 🚪 / 🪟 重新开出）。
      </D>
      <p style={p}>
        房间发生变化时墙体会重新生成；只要墙体在几何上仍然存在，其材质与开口就会被保留。
      </p>

      <h4 style={h}>房间属性</h4>
      <D t="名称">显示在平面图上以及 3D 房屋中该房间的上方。</D>
      <D t="🗑 删除房间">删除该房间，以及仅属于它的墙体。</D>

      <h4 style={h}>对象列表顺序</h4>
      <p style={p}>
        🗂 对象列表中的 ▲▼ 用于调整节点顺序，该顺序就是时间轴泳道的排列顺序。
        MLO 设备会占用两条泳道（先 5 GHz，后 6 GHz）。AP 会一直留到最后一个终端和 AMP 标签被删掉为止，
        此后它本身也可以删除。
      </p>
    </div>
  )
}
