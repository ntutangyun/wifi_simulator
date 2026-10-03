/**
 * The inspector panel of a UWB device. A ranging node has no queue, no backoff
 * and no EDCA contention window, so none of the Wi-Fi rows apply: what it has is
 * a role, the block and round it is in, the ranges it has measured against each
 * peer, and — for a tag — the fix those ranges solve to. A one-way (TDoA) session
 * measures no ranges at all, so the table under it is one of time differences
 * against the round's reference anchor instead. A contention session
 * (standard §10.32.2 schedule mode 0) adds two rows of its own: the slot an
 * anchor drew, and the response slots a tag lost to overlapping answers.
 *
 * Every number comes from ./rows.ts, which is where it is tested.
 */
import type { NodeView } from '../../model/view'
import { useStrings } from '../../ui/i18n'
import {
  uwbAoaRows, uwbContendText, uwbFixRow, uwbLbtText, uwbNbChannelText, uwbRangeRows, uwbSsbdText,
  uwbTdoaRows,
  uwbRespondersText,
  uwbTrainRows,
} from './rows'

const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '1px 0' }
const dim: React.CSSProperties = { color: 'var(--dim)' }
const num: React.CSSProperties = { textAlign: 'right' }

export function UwbInspector({ nv, nameOf }: { nv: NodeView; nameOf: (id: string) => string }) {
  const U = useStrings().uwb
  const u = nv.uwb
  if (!u) return null
  const ranges = uwbRangeRows(u, U)
  // One-way ranging: a listening tag measures no distance at all, only differences of them.
  const tdoa = uwbTdoaRows(u)
  // Angle of arrival: the anchor's own bearings, one row per tag it has seen.
  const aoa = uwbAoaRows(u)
  const fix = u.position ? uwbFixRow(u.position, U) : null
  // Both rows exist only in a contention session: an anchor that never drew a slot and a tag
  // that never lost one have nothing to say, and a time-scheduled session never shows either.
  const contend = uwbContendText(u, U)
  // P802.15.4ab: one row per peer whose fragment train this device has closed out, and the two
  // lines of its narrowband control radio. All three are empty in every other mode.
  const trains = uwbTrainRows(u, U)
  // One-to-many round only: the anchors this node's train was shared with.
  const responders = uwbRespondersText(u, U, nameOf)
  const nbChannel = uwbNbChannelText(u, U)
  const lbt = uwbLbtText(u, U)
  const ssbd = uwbSsbdText(u, U)

  return (
    <div>
      <div style={row}><span style={dim}>{U.role}</span><span>{u.role === 'anchor' ? U.anchor : U.tag}</span></div>
      <div style={row}>
        <span style={dim}>{U.blockRound}</span>
        <span>{u.block} / {u.round} <span style={dim}>· {u.rounds} {U.rounds}</span></span>
      </div>
      <div style={row}><span style={dim}>{U.slot}</span><span>{u.slot ?? '—'}</span></div>
      <div style={row}><span style={dim}>{U.timeouts}</span><span>{u.timeouts}</span></div>
      {/* Unconditional, right beside timeouts: `rmnr` switched on takes rounds out of the count
          above with nothing else in the view to say where they went (view.ts's own note on
          `UwbNodeView.rmnr`) — the pair has to be printed together, not revealed only once it is
          non-zero. */}
      <div style={row} title={U.rmnrHint}><span style={dim}>{U.rmnr}</span><span>{u.rmnr}</span></div>
      {/* Unconditional for the same reason, and one of its own: this is the only row that ever says
          anything about who heard this node (standard §10.36), so hiding it at zero would make
          "nobody confirmed" and "the session never asked" look alike. */}
      <div style={row} title={U.mmrcmHint}><span style={dim}>{U.mmrcm}</span><span>{u.mmrcm}</span></div>
      {/* The two phases of an SP3 round (standard §10.32.8.1), printed as a pair and
          unconditionally, for the reason `rmnr` is: with `sp3` on, every other row in this panel
          reads exactly as it would in an SP1 round — the same slots, the same ranges — so these
          two are the only thing here that says the ranging phase carried no identity at all, and
          that what it stopped spending is spent in the report phase. One of them alone would show
          half of that trade; hiding either at zero would make "the session never asked" look like
          "the markers never arrived". `view.ts`'s own note on `UwbNodeView.sp3` calls them the two
          phases made countable, and until this row existed that comment described nothing. */}
      <div style={row} title={U.sp3Hint}><span style={dim}>{U.sp3}</span><span>{u.sp3}</span></div>
      <div style={row} title={U.sp3ReportsHint}>
        <span style={dim}>{U.sp3Reports}</span><span>{u.sp3Reports}</span>
      </div>
      {/* The ranging ancillary information exchange (standard §10.35), printed as a pair and
          unconditionally, for the reason `rmnr` is and one of its own: a fragment's wait is silent,
          so the timeout row above cannot move when a fragment is lost. Without the second row a
          message that lost half of itself would read exactly like one that arrived whole — and the
          second row is the one the whole clause is about, because what it counts was *worked out
          from the countdown in the next fragment*, not waited for. Both counted at the receiver,
          which in this clause is the ranging initiator: §10.35.1 inverts the two role names. */}
      <div style={row} title={U.ancillaryHint}>
        <span style={dim}>{U.ancillary}</span><span>{u.ancillary}</span>
      </div>
      <div style={row} title={U.ancillaryMissingHint}>
        <span style={dim}>{U.ancillaryMissing}</span><span>{u.ancillaryMissing}</span>
      </div>
      <div style={row}><span style={dim}>{U.interfered}</span><span>{u.interfered}</span></div>
      {contend !== null && (
        <div style={row} title={U.contendHint}><span style={dim}>{U.contend}</span><span>{contend}</span></div>
      )}
      {responders !== null && (
        <div style={row} title={U.respondersHint}>
          <span style={dim}>{U.responders}</span><span>{responders}</span>
        </div>
      )}
      {nbChannel !== null && (
        <div style={row} title={U.nbChannelHint}><span style={dim}>{U.nbChannel}</span><span>{nbChannel}</span></div>
      )}
      {lbt !== null && (
        <div style={row} title={U.lbtBusyHint}><span style={dim}>{U.lbtBusy}</span><span>{lbt}</span></div>
      )}
      {ssbd !== null && (
        <div style={row} title={U.ssbdHint}><span style={dim}>{U.ssbd}</span><span>{ssbd}</span></div>
      )}
      {u.contendCollisions > 0 && (
        <div style={row} title={U.contendCollisionsHint}>
          <span style={dim}>{U.contendCollisions}</span><span>{u.contendCollisions}</span>
        </div>
      )}

      <div style={{ ...dim, marginTop: 6 }}>{U.ranges} ({ranges.length})</div>
      {ranges.length > 0 && (
        <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={dim}>
              <td>{U.peer}</td>
              <td style={num}>{U.measured}</td>
              <td style={num}>{U.trueDist}</td>
              <td style={num}>{U.error}</td>
              <td style={num}>{U.fom}</td>
              <td style={num}>{U.rounds}</td>
            </tr>
          </thead>
          <tbody>
            {ranges.map((r) => (
              <tr key={r.peer} title={r.integrity === undefined ? r.method : `${r.method} · ${r.integrity}`}>
                <td>{nameOf(r.peer)}</td>
                <td style={num}>{r.measured}</td>
                <td style={num}>{r.trueDist}</td>
                <td style={num}>{r.error}</td>
                <td style={num}>{r.fom}</td>
                <td style={num}>{r.rounds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {trains.length > 0 && (
        <>
          <div style={{ ...dim, marginTop: 6 }} title={U.trainsHint}>{U.trains} ({trains.length})</div>
          <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={dim}>
                <td>{U.peer}</td>
                <td style={num}>{U.trainKindCol}</td>
                <td style={num}>{U.trainHeard}</td>
                <td style={num}>{U.trainMargin}</td>
                <td style={num}>{U.trainDetected}</td>
                <td style={num}>{U.trainRatio}</td>
              </tr>
            </thead>
            <tbody>
              {trains.map((t) => (
                <tr key={t.peer}>
                  <td>{nameOf(t.peer)}</td>
                  <td style={num}>{t.kind}</td>
                  <td style={num}>{t.heard}</td>
                  <td style={num}>{t.margin}</td>
                  <td style={num}>{t.detected}</td>
                  <td style={num}>{t.ratio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tdoa.length > 0 && (
        <>
          <div style={{ ...dim, marginTop: 6 }} title={U.tdoaHint}>
            {U.tdoa} ({tdoa.length}){u.tdoaRef === null ? '' : ` · ${U.tdoaAgainst(nameOf(u.tdoaRef))}`}
          </div>
          <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={dim}>
                <td>{U.peer}</td>
                <td style={num}>{U.measured}</td>
                <td style={num}>{U.trueDist}</td>
                <td style={num}>{U.error}</td>
                <td style={num}>{U.rounds}</td>
              </tr>
            </thead>
            <tbody>
              {tdoa.map((d) => (
                <tr key={d.peer}>
                  <td>{nameOf(d.peer)}</td>
                  <td style={num}>{d.measured}</td>
                  <td style={num}>{d.trueDt}</td>
                  <td style={num}>{d.error}</td>
                  <td style={num}>{d.rounds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {aoa.length > 0 && (
        <>
          <div style={{ ...dim, marginTop: 6 }} title={U.aoaHint}>{U.aoa} ({aoa.length})</div>
          <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={dim}>
                <td>{U.peer}</td>
                <td style={num}>{U.measured}</td>
                <td style={num}>{U.trueDist}</td>
                <td style={num}>{U.error}</td>
                <td style={num}>{U.aoaSigma}</td>
                <td style={num}>{U.rounds}</td>
              </tr>
            </thead>
            <tbody>
              {aoa.map((a) => (
                <tr key={a.peer} title={U.aoaRowHint}>
                  <td>{nameOf(a.peer)}</td>
                  <td style={num}>{a.measured}</td>
                  <td style={num}>{a.trueTheta}</td>
                  <td style={num}>{a.error}</td>
                  <td style={num}>{a.sigma}</td>
                  <td style={num}>{a.rounds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {u.role === 'tag' && (
        <>
          <div style={{ ...dim, marginTop: 6 }}>{U.position}</div>
          {fix ? (
            <>
              <div style={row}><span style={dim}>{U.methodLabel}</span><span>{fix.method}</span></div>
              <div style={row}><span style={dim}>{U.estimate}</span><span>{fix.estimate}</span></div>
              <div style={row}><span style={dim}>{U.trueDist}</span><span>{fix.truth}</span></div>
              <div style={row}><span style={dim}>{U.error}</span><span>{fix.error}</span></div>
              <div style={row}><span style={dim}>{U.gdop}</span><span>{fix.gdop}</span></div>
              <div
                style={row}
                title={u.position === null || u.position.method === 'twr' ? undefined
                  : u.position.method === 'aoa' ? U.ellipseHintAoa : U.ellipseHintTdoa}
              >
                <span style={dim}>{U.ellipse}</span><span>{fix.ellipse}</span>
              </div>
            </>
          ) : (
            <div style={{ ...dim, fontSize: 11 }}>
              {/* A one-way lane never measures a range, so telling it to go and get three of
                  them is advice it cannot take; it is known to be one by the differences it
                  has already collected. */}
              {tdoa.length > 0 || u.tdoaRef !== null ? U.noPositionTdoa : U.noPosition}
            </div>
          )}
        </>
      )}
    </div>
  )
}
