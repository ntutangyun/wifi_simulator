import { describe, it, expect } from 'vitest'
import { STRINGS } from '../../src/ui/i18n'
import { FOM_LOS, FOM_NLOS, fomText } from '../../src/uwb/phy'
import {
  uwbAoaRows, uwbContendText, uwbFixRow, uwbFomText, uwbLbtText, uwbNbChannelText, uwbRangeRows,
  uwbTdoaRows, uwbTrainRows,
} from '../../src/uwb/ui/rows'
import { NOTHING_HEARD_DBM } from '../../src/uwb/records'
import { uwbTrainKey, type UwbNodeView } from '../../src/uwb/view'

/** A tag mid-block with two peers: one clear, one through a wall. */
const tag: UwbNodeView = {
  role: 'tag', block: 3, round: 0, slot: 2, rounds: 7, timeouts: 1, interfered: 0,
  contend: null, contendCollisions: 0,
  ranges: {
    'anc-1': { distM: 5.02, trueDistM: 5, method: 'ds', fom: FOM_LOS, block: 3, n: 7 },
    'anc-2': { distM: 4.38, trueDistM: 4.5, method: 'ds', fom: FOM_NLOS, block: 3, n: 6 },
  },
  tdoa: {}, tdoaRef: null, aoa: {},
  mms: { trains: {}, nbChannel: null, lbtBusy: 0, skippedBlocks: 0, lastLbtBlock: null },
  position: {
    x: 0.03, y: -0.04, trueX: 0, trueY: 0, gdop: 1.41,
    ellipse: { a: 0.062, b: 0.041, thetaRad: 0.5 }, method: 'twr',
    anchors: ['anc-1', 'anc-2', 'anc-3', 'anc-4'], block: 3, n: 7,
  },
}

/** A tag that only listened: no distances, three differences against the reference anchor. */
const listener: UwbNodeView = {
  ...tag, ranges: {},
  tdoa: {
    'anc-2': { dtNs: 12.5, trueDtNs: 12.1, n: 3 },
    'anc-3': { dtNs: -8.237, trueDtNs: -8.019, n: 3 },
  },
  tdoaRef: 'anc-1',
  position: { ...tag.position!, gdop: 0.87, method: 'dl-tdoa' },
}

const S = STRINGS.uwb

describe('uwbRangeRows', () => {
  const rows = uwbRangeRows(tag, S)

  it('gives one row per peer, in insertion order', () => {
    expect(rows.map((r) => r.peer)).toEqual(['anc-1', 'anc-2'])
  })

  it('puts the measurement beside the truth, with the error in centimetres and signed', () => {
    expect(rows[0]).toMatchObject({ measured: '5.02 m', trueDist: '5.00 m', error: '2.0 cm', rounds: '7' })
    expect(rows[1]).toMatchObject({ measured: '4.38 m', trueDist: '4.50 m', error: '-12.0 cm', rounds: '6' })
  })

  it('carries the figure of merit PER ROW: a wall behind one anchor must not be reported for the other', () => {
    expect(rows[0].fom).toBe('97 % 的误差落在 0.5 ns 内')
    expect(rows[1].fom).toBe('75 % 的误差落在 12 ns 内')
    expect(rows[0].fom).not.toBe(rows[1].fom)
    // The column is the reader's phrase, not the engine's own English one on the event-log line.
    expect(rows[0].fom).not.toBe(fomText(FOM_LOS))
  })

  it('names the TWR method for the row title', () => {
    expect(rows.map((r) => r.method)).toEqual(['DS-TWR', 'DS-TWR'])
  })

  it('has no rows before the first range lands', () => {
    expect(uwbRangeRows({ ...tag, ranges: {} }, S)).toEqual([])
  })
})

describe('uwbFixRow', () => {
  it('shows the estimate, the truth, the error, the GDOP and the ellipse axes', () => {
    expect(uwbFixRow(tag.position!, S)).toEqual({
      estimate: '(0.03, -0.04) m',
      truth: '(0.00, 0.00) m',
      error: '5.0 cm',
      gdop: '1.41',
      ellipse: '6.2 × 4.1 cm',
      method: '双向测距 (TWR)',
    })
  })

  it('names what solved the fix', () => {
    expect(uwbFixRow(listener.position!, S).method).toBe('下行到达时间差 (DL-TDoA)')
    expect(uwbFixRow(tag.position!, S).method).toBe('双向测距 (TWR)')
  })
})

describe('uwbTdoaRows', () => {
  it('gives one row per peer, in nanoseconds, with the error signed', () => {
    expect(uwbTdoaRows(listener)).toEqual([
      { peer: 'anc-2', measured: '12.50 ns', trueDt: '12.10 ns', error: '0.40 ns', rounds: '3' },
      { peer: 'anc-3', measured: '-8.24 ns', trueDt: '-8.02 ns', error: '-0.22 ns', rounds: '3' },
    ])
  })

  it('has no rows for a tag that measured distances instead of differences', () => {
    expect(uwbTdoaRows(tag)).toEqual([])
  })
})

describe('uwbAoaRows', () => {
  /** An anchor watching two tags: one nearly straight ahead, one behind it. */
  const anchor: UwbNodeView = {
    ...tag, role: 'anchor', ranges: {}, tdoa: {},
    aoa: {
      'tag-1': { thetaDeg: 44.9876, trueThetaDeg: 45, n: 6 },
      'tag-2': { thetaDeg: 41.6236, trueThetaDeg: 135, n: 2 },
    },
  }

  it('gives one row per peer, in degrees, with the error signed and the sigma of the angle', () => {
    expect(uwbAoaRows(anchor)).toEqual([
      { peer: 'tag-1', measured: '45.0°', trueTheta: '45.0°', error: '-0.0°', sigma: '± 3.9°', rounds: '6' },
      { peer: 'tag-2', measured: '41.6°', trueTheta: '135.0°', error: '-93.4°', sigma: '± 3.7°', rounds: '2' },
    ])
  })

  it('has no rows for a node that measured no angles', () => {
    expect(uwbAoaRows(tag)).toEqual([])
  })
})

describe('uwbContendText', () => {
  const withDraw = (contend: UwbNodeView['contend']): UwbNodeView => ({ ...tag, role: 'anchor', contend })

  it('shows no row at all in a time-scheduled session, where nothing is ever drawn', () => {
    expect(uwbContendText(tag, S)).toBeNull()
  })

  it('names the slot and the attempt, and the sit-out', () => {
    expect(uwbContendText(withDraw({ slot: 5, attempt: 2 }), S)).toBe('时隙 5 · 第 2 次尝试')
    expect(uwbContendText(withDraw({ slot: null, attempt: 0 }), S)).toBe('本轮空过')
  })
})

describe('fomText', () => {
  it('reads an all-zero FoM byte as "no FoM", not as 0 % confidence', () => {
    expect(fomText(0)).toBe('no FoM')
    expect(fomText(FOM_LOS)).toBe('97 % within 0.5 ns')
  })

  it('the localised phrase says the same thing as the engine’s, the zero byte included', () => {
    expect(uwbFomText(FOM_LOS, S)).toBe('97 % 的误差落在 0.5 ns 内')
    expect(uwbFomText(0, S)).toBe('无 FoM')
    expect(uwbFomText(FOM_NLOS, S)).toBe('75 % 的误差落在 12 ns 内')
  })
})

// --- P802.15.4ab -------------------------------------------------------------------

/** A tag mid-block in a *mixed*-set MMS session: one peer whose RSF train it combined and
 * whose RIF train vouched for the range, one peer whose integrity train it lost entirely, and
 * one peer whose RSF train fell short. The first two share a peer, and must not share a row. */
const mmsTag: UwbNodeView = {
  ...tag,
  ranges: {
    'anc-1': { distM: 4.28, trueDistM: 4.24, method: 'ss', fom: FOM_LOS, block: 0, n: 3, integrity: false },
  },
  position: null,
  mms: {
    trains: {
      [uwbTrainKey('anc-1', 'rsf')]:
        { peer: 'anc-1', kind: 'rsf', fragments: 8, heard: 8, marginDb: 1.77, detected: true, ratioPpm: -20.0298 },
      [uwbTrainKey('anc-1', 'rif')]:
        { peer: 'anc-1', kind: 'rif', fragments: 2, heard: 0, marginDb: NOTHING_HEARD_DBM, detected: false, ratioPpm: null },
      [uwbTrainKey('anc-3', 'rsf')]:
        { peer: 'anc-3', kind: 'rsf', fragments: 4, heard: 4, marginDb: -1.24, detected: false, ratioPpm: 8.02 },
    },
    nbChannel: 3,
    lbtBusy: 2,
    skippedBlocks: 2,
    lastLbtBlock: 1,
  },
}

describe('the fragment-train table', () => {
  const rows = uwbTrainRows(mmsTag, S)

  it('gives one row per peer and kind, with the train and how much of it arrived', () => {
    expect(rows.map((r) => [r.peer, r.kind, r.heard])).toEqual([
      ['anc-1', '8 × RSF', '8 / 8'],
      ['anc-1', '2 × RIF', '0 / 2'],
      ['anc-3', '4 × RSF', '4 / 4'],
    ])
    // The RSF train the range was made on survives the RIF train of the same peer: both rows
    // are there, and the margin the range rests on is still readable.
    expect(rows.filter((r) => r.peer === 'anc-1')).toHaveLength(2)
  })

  it('signs the margin, and shows a dash where nothing was heard at all', () => {
    expect(rows.map((r) => [r.margin, r.detected])).toEqual([
      ['+1.8 dB', S.trainYes],
      ['—', S.trainNo],
      ['-1.2 dB', S.trainNo],
    ])
    // The record's "nothing heard" sentinel never reaches the reader.
    expect(rows.map((r) => r.margin).join(' ')).not.toContain('999')
  })

  it('shows the ratio only where the train measured one', () => {
    expect(rows.map((r) => r.ratio)).toEqual(['-20.030 ppm', '—', '8.020 ppm'])
  })

  it('is empty in every other mode, where no train is ever evaluated', () => {
    expect(uwbTrainRows(tag, S)).toEqual([])
  })

})

describe('the narrowband control rows', () => {
  it('names the channel and its centre frequency', () => {
    expect(uwbNbChannelText(mmsTag, S)).toBe('3 · 5733.75 MHz')
  })

  it('counts the busy checks and the blocks they cost', () => {
    expect(uwbLbtText(mmsTag, S)).toBe('2 次忙 · 跳过 2 个块')
  })

  it('shows neither row outside an MMS session', () => {
    expect(uwbNbChannelText(tag, S)).toBeNull()
    expect(uwbLbtText(tag, S)).toBeNull()
    // …nor the listen-before-talk row when every check this run was clear.
    expect(uwbLbtText({ ...mmsTag, mms: { ...mmsTag.mms, lbtBusy: 0 } }, S)).toBeNull()
  })
})

describe('the range row carries an integrity flag when the session has one', () => {
  it('says whether the integrity train vouched for the range', () => {
    const row = uwbRangeRows(mmsTag, S)[0]
    expect(row.integrity).toBe(S.integrityBad)
    const ok: UwbNodeView = {
      ...mmsTag,
      ranges: { 'anc-1': { ...mmsTag.ranges['anc-1'], integrity: true } },
    }
    expect(uwbRangeRows(ok, S)[0].integrity).toBe(S.integrityOk)
  })

  it('leaves it off a 4z range, which has no integrity train behind it', () => {
    expect(uwbRangeRows(tag, S).every((r) => r.integrity === undefined)).toBe(true)
  })
})
