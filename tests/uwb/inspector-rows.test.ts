import { describe, it, expect } from 'vitest'
import { STRINGS } from '../../src/ui/i18n'
import { FOM_LOS, FOM_NLOS, fomText } from '../../src/uwb/phy'
import { uwbContendText, uwbFixRow, uwbFomText, uwbRangeRows, uwbTdoaRows } from '../../src/uwb/ui/rows'
import type { UwbNodeView } from '../../src/uwb/view'

/** A tag mid-block with two peers: one clear, one through a wall. */
const tag: UwbNodeView = {
  role: 'tag', block: 3, round: 0, slot: 2, rounds: 7, timeouts: 1, interfered: 0,
  contend: null, contendCollisions: 0,
  ranges: {
    'anc-1': { distM: 5.02, trueDistM: 5, method: 'ds', fom: FOM_LOS, block: 3, n: 7 },
    'anc-2': { distM: 4.38, trueDistM: 4.5, method: 'ds', fom: FOM_NLOS, block: 3, n: 6 },
  },
  tdoa: {},
  position: {
    x: 0.03, y: -0.04, trueX: 0, trueY: 0, gdop: 1.41,
    ellipse: { a: 0.062, b: 0.041, thetaRad: 0.5 }, method: 'twr', block: 3, n: 7,
  },
}

/** A tag that only listened: no distances, three differences against the reference anchor. */
const listener: UwbNodeView = {
  ...tag, ranges: {},
  tdoa: {
    'anc-2': { dtNs: 12.5, trueDtNs: 12.1, n: 3 },
    'anc-3': { dtNs: -8.237, trueDtNs: -8.019, n: 3 },
  },
  position: { ...tag.position!, gdop: 0.87, method: 'dl-tdoa' },
}

const EN = STRINGS.en.uwb
const ZH = STRINGS.zh.uwb

describe('uwbRangeRows', () => {
  const rows = uwbRangeRows(tag, EN)

  it('gives one row per peer, in insertion order', () => {
    expect(rows.map((r) => r.peer)).toEqual(['anc-1', 'anc-2'])
  })

  it('puts the measurement beside the truth, with the error in centimetres and signed', () => {
    expect(rows[0]).toMatchObject({ measured: '5.02 m', trueDist: '5.00 m', error: '2.0 cm', rounds: '7' })
    expect(rows[1]).toMatchObject({ measured: '4.38 m', trueDist: '4.50 m', error: '-12.0 cm', rounds: '6' })
  })

  it('carries the figure of merit PER ROW: a wall behind one anchor must not be reported for the other', () => {
    expect(rows[0].fom).toBe(fomText(FOM_LOS))
    expect(rows[1].fom).toBe(fomText(FOM_NLOS))
    expect(rows[0].fom).not.toBe(rows[1].fom)
    // and the column follows the reader's language, unlike the event-log line
    expect(uwbRangeRows(tag, ZH)[0].fom).toBe('97 % 的误差落在 0.5 ns 内')
  })

  it('names the TWR method for the row title', () => {
    expect(rows.map((r) => r.method)).toEqual(['DS-TWR', 'DS-TWR'])
  })

  it('has no rows before the first range lands', () => {
    expect(uwbRangeRows({ ...tag, ranges: {} }, EN)).toEqual([])
  })
})

describe('uwbFixRow', () => {
  it('shows the estimate, the truth, the error, the GDOP and the ellipse axes', () => {
    expect(uwbFixRow(tag.position!, EN)).toEqual({
      estimate: '(0.03, -0.04) m',
      truth: '(0.00, 0.00) m',
      error: '5.0 cm',
      gdop: '1.41',
      ellipse: '6.2 × 4.1 cm',
      method: 'two-way ranging',
    })
  })

  it('names what solved the fix, in the reader’s language', () => {
    expect(uwbFixRow(listener.position!, EN).method).toBe('DL-TDoA')
    expect(uwbFixRow(listener.position!, ZH).method).toBe('下行到达时间差 (DL-TDoA)')
    expect(uwbFixRow(tag.position!, ZH).method).toBe('双向测距 (TWR)')
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

describe('uwbContendText', () => {
  const withDraw = (contend: UwbNodeView['contend']): UwbNodeView => ({ ...tag, role: 'anchor', contend })

  it('shows no row at all in a time-scheduled session, where nothing is ever drawn', () => {
    expect(uwbContendText(tag, EN)).toBeNull()
  })

  it('names the slot and the attempt, and the sit-out in both languages', () => {
    expect(uwbContendText(withDraw({ slot: 5, attempt: 2 }), EN)).toBe('slot 5 · attempt 2')
    expect(uwbContendText(withDraw({ slot: 5, attempt: 2 }), ZH)).toBe('时隙 5 · 第 2 次尝试')
    expect(uwbContendText(withDraw({ slot: null, attempt: 0 }), EN)).toBe('sitting this round out')
    expect(uwbContendText(withDraw({ slot: null, attempt: 0 }), ZH)).toBe('本轮空过')
  })
})

describe('fomText', () => {
  it('reads an all-zero FoM byte as "no FoM", not as 0 % confidence', () => {
    expect(fomText(0)).toBe('no FoM')
    expect(fomText(FOM_LOS)).toBe('97 % within 0.5 ns')
  })

  it('the localised phrase says the same thing in both languages, the zero byte included', () => {
    expect(uwbFomText(FOM_LOS, EN)).toBe(fomText(FOM_LOS))
    expect(uwbFomText(FOM_NLOS, EN)).toBe(fomText(FOM_NLOS))
    expect(uwbFomText(0, EN)).toBe('no FoM')
    expect(uwbFomText(0, ZH)).toBe('无 FoM')
    expect(uwbFomText(FOM_NLOS, ZH)).toBe('75 % 的误差落在 12 ns 内')
  })
})
