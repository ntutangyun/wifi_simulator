/** Compact learning guide tying real 802.11 mechanisms to what the sim shows. */
import { useUi } from './store'

const h: React.CSSProperties = { margin: '10px 0 3px', fontSize: 12.5, color: '#d5dae3' }
const p: React.CSSProperties = { margin: '2px 0', fontSize: 11.5, color: 'var(--dim)', lineHeight: 1.5 }
const chip = (color: string) => (
  <span style={{ display: 'inline-block', width: 9, height: 9, background: color, borderRadius: 2, marginRight: 4 }} />
)

export function Guide() {
  const lang = useUi((s) => s.lang)
  return lang === 'zh' ? <GuideZh /> : <GuideEn />
}

function GuideEn() {
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
        group.
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

function GuideZh() {
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
        再由一个多站点 BlockAck 统一确认。整组传输只需竞争一次。
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
