/** Compact learning guide tying real 802.11 mechanisms to what the sim shows. */

const h: React.CSSProperties = { margin: '10px 0 3px', fontSize: 12.5, color: '#d5dae3' }
const p: React.CSSProperties = { margin: '2px 0', fontSize: 11.5, color: 'var(--dim)', lineHeight: 1.45 }
const chip = (color: string) => (
  <span style={{ display: 'inline-block', width: 9, height: 9, background: color, borderRadius: 2, marginRight: 4 }} />
)

export function Guide() {
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
