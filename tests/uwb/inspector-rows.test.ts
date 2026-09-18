import { describe, it, expect } from 'vitest'
import { STRINGS } from '../../src/ui/i18n'
import { FOM_LOS, FOM_NLOS, fomText } from '../../src/uwb/phy'
import { uwbFixRow, uwbFomText, uwbRangeRows } from '../../src/uwb/ui/rows'
import type { UwbNodeView } from '../../src/uwb/view'

/** A tag mid-block with two peers: one clear, one through a wall. */
const tag: UwbNodeView = {
  role: 'tag', block: 3, round: 0, slot: 2, rounds: 7, timeouts: 1,
  ranges: {
    'anc-1': { distM: 5.02, trueDistM: 5, method: 'ds', fom: FOM_LOS, n: 7 },
    'anc-2': { distM: 4.38, trueDistM: 4.5, method: 'ds', fom: FOM_NLOS, n: 6 },
  },
  position: {
    x: 0.03, y: -0.04, trueX: 0, trueY: 0, gdop: 1.41,
    ellipse: { a: 0.062, b: 0.041, thetaRad: 0.5 }, n: 7,
  },
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
    expect(uwbFixRow(tag.position!)).toEqual({
      estimate: '(0.03, -0.04) m',
      truth: '(0.00, 0.00) m',
      error: '5.0 cm',
      gdop: '1.41',
      ellipse: '6.2 × 4.1 cm',
    })
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
